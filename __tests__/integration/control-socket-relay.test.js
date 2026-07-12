import { describe, it, expect, afterEach } from '@jest/globals';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { createControlServer } from '../../core/control-socket.js';

// Verifies the handoff message-relay TRANSPORT seam on the node control socket: the `publish` op
// broadcasts onto core.xn, and the `subscribe` op holds the connection open and streams one JSON
// line per received pubsub message, cleaning up its listener on disconnect. The underlying libp2p
// floodsub delivery between two real nodes is covered separately by xn/__tests__/pubsub.test.js;
// here we mock core.xn (an EventEmitter mirroring xn's publish/subscribe/`message:<topic>` API) so
// the SOCKET wiring is tested deterministically without standing up a libp2p mesh.

function mockCore() {
  const xn = new EventEmitter();
  xn.published = [];
  xn.subscribed = [];
  xn.connected = [];
  xn.publish = async (topic, data) => { xn.published.push({ topic, data }); };
  xn.subscribe = async (topic) => { xn.subscribed.push(topic); };
  xn.getAddresses = () => ['/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWMOCK'];
  xn.getPeerId = () => '12D3KooWMOCK';
  xn.connect = async (addr) => { xn.connected.push(addr); };
  return { xn, config: { roles: {} } };
}

// A mock core for the `chain` op, mirroring the REAL subsystem APIs the handler reads:
//   core.xvsm.getStateRoot()   -> hex state root (verkle tree root)
//   core.xvsm.getStatistics()  -> { totalTransactions, totalDiffs, stateRoot, shards }
//   core.xpc.getMempoolStats() -> { raw, processing, final, lockedUtxos }
//   core.xpc.mempool.rawTx     -> Map<leaderId, Map<rawTxId, { txData, txTimestamp }>>  (exact real shape)
function mockChainCore({ txs = [] } = {}) {
  const core = mockCore();
  // rawTx is a Map-of-Maps keyed by leader, exactly like xpc's Mempool.
  const rawTx = new Map();
  const leader = new Map();
  for (const t of txs) leader.set(t.id, { txData: { type: t.type }, txTimestamp: t.timestamp });
  if (leader.size) rawTx.set('leader-1', leader);
  core.xvsm = {
    getStateRoot: () => 'a'.repeat(64),
    getStatistics: () => ({ totalTransactions: 3, totalDiffs: 2, stateRoot: 'a'.repeat(64), shards: [] }),
  };
  core.xpc = {
    getMempoolStats: () => ({ raw: leader.size, processing: 1, final: 4, lockedUtxos: 0 }),
    mempool: { rawTx },
  };
  return core;
}

// A tiny newline-delimited-JSON client: connect, send lines, and await the next reply line(s).
function connectClient(sockPath) {
  const sock = net.connect(sockPath);
  sock.setEncoding('utf8');
  let buf = '';
  const waiters = [];
  const queue = [];
  sock.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (waiters.length) waiters.shift()(obj); else queue.push(obj);
    }
  });
  const next = () => new Promise((res) => { if (queue.length) res(queue.shift()); else waiters.push(res); });
  const send = (o) => sock.write(JSON.stringify(o) + '\n');
  const ready = new Promise((res) => sock.on('connect', res));
  return { sock, next, send, ready, close: () => sock.destroy() };
}

describe('control socket — handoff message-relay transport (publish + streaming subscribe)', () => {
  let server; let sockPath; let client;
  afterEach(async () => {
    if (client) client.close();
    if (server) await new Promise((r) => server.close(r));
    if (sockPath) { try { fs.rmSync(sockPath, { force: true }); } catch { /* */ } }
  });

  async function boot(core) {
    sockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ctrlsock-')), 'node.sock');
    server = await createControlServer({ core, config: core.config, sockPath, statusSnapshot: () => ({}) });
    client = connectClient(sockPath);
    await client.ready;
  }

  it('addrs op returns the node peer id + dialable multiaddrs (for peering)', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'addrs' });
    expect(await client.next()).toEqual({ ok: true, peer_id: '12D3KooWMOCK', addrs: ['/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWMOCK'] });
  });

  it('connect op dials a peer multiaddr via core.xn', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'connect', address: '/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWPEER' });
    expect(await client.next()).toEqual({ ok: true, address: '/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWPEER' });
    expect(core.xn.connected).toEqual(['/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWPEER']);
    client.send({ op: 'connect' });   // missing address
    expect(await client.next()).toMatchObject({ ok: false });
  });

  it('chain op returns a shaped xmblscan snapshot from the real xvsm/xpc APIs', async () => {
    const core = mockChainCore({ txs: [
      { id: 'tx-old', type: 'anchor', timestamp: 1000 },
      { id: 'tx-new', type: 'transfer', timestamp: 2000 },
    ] });
    await boot(core);
    client.send({ op: 'chain' });
    const reply = await client.next();
    expect(reply.ok).toBe(true);
    expect(reply.state_root).toBe('a'.repeat(64));
    expect(reply.tx_count).toBe(7);                 // mempool raw(2) + processing(1) + final(4)
    expect(reply.mempool).toEqual({ raw: 2, processing: 1, final: 4, lockedUtxos: 0 });
    expect(reply.applied_tx_count).toBe(3);
    expect(reply.state_diffs).toBe(2);
    // recent_tx: newest-first, each carrying id + type + timestamp
    expect(reply.recent_tx).toEqual([
      { id: 'tx-new', type: 'transfer', timestamp: 2000 },
      { id: 'tx-old', type: 'anchor', timestamp: 1000 },
    ]);
  });

  it('chain op returns {ok:false} when the state machine is not initialized', async () => {
    const core = mockCore();     // no core.xvsm
    await boot(core);
    client.send({ op: 'chain' });
    expect(await client.next()).toMatchObject({ ok: false });
  });

  it('publish op broadcasts onto core.xn and acks {ok,topic}', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'publish', topic: 'handoff:agent:bob', data: { envelope_id: 'e1', hello: 1 } });
    const reply = await client.next();
    expect(reply).toEqual({ ok: true, topic: 'handoff:agent:bob' });
    expect(core.xn.published).toEqual([{ topic: 'handoff:agent:bob', data: { envelope_id: 'e1', hello: 1 } }]);
  });

  it('publish op rejects a missing topic without touching the network', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'publish', data: { x: 1 } });
    expect(await client.next()).toMatchObject({ ok: false });
    expect(core.xn.published).toHaveLength(0);
  });

  it('subscribe op streams a line per received message and cleans up on disconnect', async () => {
    const core = mockCore();
    await boot(core);
    client.send({ op: 'subscribe', topic: 'handoff:agent:bob' });
    // first line confirms the subscription
    expect(await client.next()).toEqual({ ok: true, event: 'subscribed', topic: 'handoff:agent:bob' });
    expect(core.xn.subscribed).toEqual(['handoff:agent:bob']);
    expect(core.xn.listenerCount('message:handoff:agent:bob')).toBe(1);

    // an inbound pubsub message on the topic is streamed to the client verbatim
    core.xn.emit('message:handoff:agent:bob', { envelope_id: 'e9', from: 'alice', text: 'hi' });
    expect(await client.next()).toEqual({ ok: true, event: 'message', topic: 'handoff:agent:bob', data: { envelope_id: 'e9', from: 'alice', text: 'hi' } });

    // a message on a DIFFERENT topic is not delivered to this subscriber
    core.xn.emit('message:handoff:agent:carol', { envelope_id: 'x' });
    core.xn.emit('message:handoff:agent:bob', { envelope_id: 'e10' });
    expect(await client.next()).toEqual({ ok: true, event: 'message', topic: 'handoff:agent:bob', data: { envelope_id: 'e10' } });

    // disconnect removes the listener (no leak across dropped relays)
    client.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(core.xn.listenerCount('message:handoff:agent:bob')).toBe(0);
  });
});
