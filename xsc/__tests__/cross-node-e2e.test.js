// H3: storage + compute cross-node e2e. Two REAL XNNode (libp2p) instances, peered directly
// (deterministic `connect`, not mDNS timing), each hosting a REAL StorageNode/ComputeNode wired
// to its own xn — the actual production responder code (_handleProbeRequest, respondToProbe,
// _handleJobRequest, runJob) runs unmodified and its response genuinely transits the network.
//
// SPIKE FINDING (see task result / PR description for the full writeup): StorageNode and
// ComputeNode each implement ONLY the pubsub RESPONDER half (a peer's incoming request is
// received, answered, and the answer published back). Neither class has a requester-side method
// (no `requestShard`/`probeShard`/`dispatchJob`) and `_handleShardResponse` is literally an empty
// stub — there is no production code anywhere that a caller can invoke to fetch a shard or
// dispatch a compute job to a PEER node. This test therefore plays the missing requester half
// directly against the real xn pubsub topics (raw publish + a topic subscription of its own) —
// proving the WIRE PROTOCOL and the production responder code genuinely work cross-node, without
// inventing or faking a capability that isn't actually there. A `requestShard`/`dispatchComputeJob`
// convenience API + a real `_handleShardResponse` consumer is the concrete follow-up this exposes.
import { describe, test, expect, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { XNNode } from '../../xn/src/node.js';
import { StorageNode, computeProbeProof } from '../src/storage-node.js';
import { ComputeNode } from '../src/compute-node.js';

const ADD_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x07,
  0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  0x03, 0x02,
  0x01, 0x00,
  0x07, 0x07,
  0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  0x0a, 0x09,
  0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpDirs = [];
function tmpDataDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'xsc-h3-e2e-'));
  tmpDirs.push(d);
  return d;
}

async function waitFor(predicate, timeoutMs = 8000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = predicate();
    if (v) return v;
    await sleep(stepMs);
  }
  throw new Error('waitFor timed out');
}

describe('H3: storage + compute cross-node e2e (2 real peered nodes, no Docker)', () => {
  let nodeA, nodeB;
  afterAll(async () => {
    try { await nodeA?.stop(); } catch { /* */ }
    try { await nodeB?.stop(); } catch { /* */ }
    for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
  });

  test('a shard stored on node A is probe-verifiable from node B over the real network', async () => {
    nodeA = new XNNode({ addresses: ['/ip4/127.0.0.1/tcp/0'] });
    nodeB = new XNNode({ addresses: ['/ip4/127.0.0.1/tcp/0'] });
    await nodeA.start();
    await nodeB.start();

    // Deterministic peering — dial A's real multiaddr directly, no mDNS discovery timing to race.
    const addrA = nodeA.getAddresses().find((a) => a.toString().includes('127.0.0.1'));
    expect(addrA).toBeTruthy();
    await nodeB.connect(addrA.toString());   // already includes /p2p/<peerId> — do not append it again
    await waitFor(() => nodeA.getConnectedPeers().length > 0 && nodeB.getConnectedPeers().length > 0);

    // Construct StorageNode AFTER xn.start() so its constructor's `if (this.xn.started)` guard
    // actually subscribes it to the request/probe topics (mirrors how a real node boots — E2's
    // XMBLCore constructs StorageNode after core.start()).
    const storageA = new StorageNode({ xn: nodeA, dbPath: tmpDataDir() });
    await storageA._initPromise;

    const shardData = Buffer.from('cross-node e2e payload — H3');
    // storeShard computes its OWN content-addressed shardId (_hashShard) — it does NOT use any
    // id field passed in, so the real id to probe for is whatever it returns.
    const storedShardId = await storageA.storeShard({ index: 0, data: shardData });

    // The requester half StorageNode doesn't have: node B subscribes to the response topic
    // itself and publishes the probe request directly onto the real pubsub topic.
    await nodeB.subscribe('storage:probe_response');
    const responses = [];
    nodeB.on('message:storage:probe_response', (data) => responses.push(data));
    // Give floodsub a moment to propagate the subscription before publishing (real network timing).
    await sleep(300);

    await nodeB.publish('storage:probe_request', { shardId: storedShardId, nonce: 'h3-nonce', probeId: 'p1' });

    const response = await waitFor(() => responses.find((r) => r.probeId === 'p1'));
    expect(response.held).toBe(true);
    expect(response.proof).toBe(computeProbeProof('h3-nonce', shardData));

    // A probe for a shard node A does NOT have correctly reports held:false, not a false positive.
    const responses2 = [];
    nodeB.on('message:storage:probe_response', (data) => responses2.push(data));
    await nodeB.publish('storage:probe_request', { shardId: 'no-such-shard', nonce: 'x', probeId: 'p2' });
    const missResponse = await waitFor(() => responses2.find((r) => r.probeId === 'p2'));
    expect(missResponse.held).toBe(false);
  }, 20000);

  test('a compute job dispatched from node B runs on node A and reports back over the real network', async () => {
    // Reuses the SAME peered nodeA/nodeB from the storage test above (already connected).
    const computeA = new ComputeNode({ xn: nodeA, maxMemory: 64 * 1024 * 1024, maxTime: 10000 });

    await nodeB.subscribe('compute:job_response');
    const responses = [];
    nodeB.on('message:compute:job_response', (data) => responses.push(data));
    await sleep(300);

    await nodeB.publish('compute:job_request', {
      jobId: 'h3-job-1', wasmCode: Buffer.from(ADD_WASM).toString('base64'), functionName: 'add', args: [4, 5],
    });

    const response = await waitFor(() => responses.find((r) => r.jobId === 'h3-job-1'));
    expect(response.ok).toBe(true);
    expect(response.result).toBe(9);
    expect(computeA.computeJobsRun).toBe(1);
  }, 20000);
});
