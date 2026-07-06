import { describe, test, expect } from '@jest/globals';
import { EventEmitter } from 'events';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StorageNode, computeProbeProof } from '../src/storage-node.js';

// E2 storage role — shard store + quota (E2a) and availability-probe
// responder (E2b). The daemon maps resource_caps.disk_mb onto
// StorageNode.capacity (node.js toCoreConfig: disk_mb * 1024 * 1024) and
// roots dbPath under data_dir, so quota + persistence here IS the
// operator-configured disk budget.

const tmpDb = () => path.join(mkdtempSync(path.join(tmpdir(), 'e2-')), 'storage');

describe('E2a shard store + quota', () => {
  test('shards within quota persist across a restart (metadata + accounting reload)', async () => {
    const dbPath = tmpDb();
    const a = new StorageNode({ capacity: 1000, dbPath });
    const shardId = await a.storeShard({ index: 0, data: Buffer.from('hello world') });
    await a.db.close();

    const b = new StorageNode({ capacity: 1000, dbPath });
    const back = await b.getShard(shardId);
    expect(back.data.toString()).toBe('hello world');
    expect(b.getUsed()).toBe(11); // quota accounting rebuilt, not reset
    await b.db.close();
  });

  test('over-quota store is refused, including against reloaded usage', async () => {
    const dbPath = tmpDb();
    const a = new StorageNode({ capacity: 20, dbPath });
    await a.storeShard({ index: 0, data: Buffer.alloc(15) });
    await expect(a.storeShard({ index: 1, data: Buffer.alloc(10) })).rejects.toThrow('Storage full');
    await a.db.close();

    // A restarted node must still refuse: reloaded used=15 + 10 > 20.
    const b = new StorageNode({ capacity: 20, dbPath });
    await b._ensureInit();
    await expect(b.storeShard({ index: 1, data: Buffer.alloc(10) })).rejects.toThrow('Storage full');
    await b.db.close();
  });

  test('shardsStored is a cumulative counter (deletes do not decrement it)', async () => {
    const node = new StorageNode({ capacity: 1000, dbPath: tmpDb() });
    const id1 = await node.storeShard({ index: 0, data: Buffer.from('one') });
    await node.storeShard({ index: 1, data: Buffer.from('two') });
    expect(node.shardsStored).toBe(2);
    await node.deleteShard(id1);
    expect(node.shardsStored).toBe(2);
    expect(node.getUsed()).toBe(3); // but live usage does shrink
    await node.db.close();
  });
});

describe('E2b availability probe responder', () => {
  test('probe for a held shard succeeds with a nonce-bound proof', async () => {
    const node = new StorageNode({ capacity: 1000, dbPath: tmpDb() });
    const data = Buffer.from('shard-bytes');
    const shardId = await node.storeShard({ index: 0, data });

    const res = await node.respondToProbe({ shardId, nonce: 'n-123', probeId: 'p1' });
    expect(res.held).toBe(true);
    expect(res.probeId).toBe('p1');
    expect(res.proof).toBe(computeProbeProof('n-123', data));
    // A different nonce yields a different proof — no replay.
    expect(res.proof).not.toBe(computeProbeProof('n-456', data));
    await node.db.close();
  });

  test('probe for an absent shard fails (held:false, no proof)', async () => {
    const node = new StorageNode({ capacity: 1000, dbPath: tmpDb() });
    const res = await node.respondToProbe({ shardId: 'deadbeef', nonce: 'n' });
    expect(res.held).toBe(false);
    expect(res.proof).toBeUndefined();
    await node.db.close();
  });

  test('responds to probe requests over the xn probe topic', async () => {
    // Stub xn: same EventEmitter surface StorageNode wires against.
    const xn = new EventEmitter();
    xn.started = true;
    xn.subscribe = async () => {};
    const published = [];
    xn.publish = async (topic, msg) => { published.push({ topic, msg }); };

    const node = new StorageNode({ capacity: 1000, dbPath: tmpDb(), xn });
    const data = Buffer.from('networked');
    const shardId = await node.storeShard({ index: 0, data });

    xn.emit('message:storage:probe_request', { shardId, nonce: 'net-n', probeId: 'p2' });
    await new Promise((r) => setTimeout(r, 50));

    expect(published).toHaveLength(1);
    expect(published[0].topic).toBe('storage:probe_response');
    expect(published[0].msg).toMatchObject({
      shardId, probeId: 'p2', held: true, proof: computeProbeProof('net-n', data),
    });
    await node.db.close();
  });
});

describe('metrics wiring', () => {
  test('collectMetrics reports the live shards_stored counter', async () => {
    const { collectMetrics } = await import('../../core/metrics-server.js');
    const node = new StorageNode({ capacity: 1000, dbPath: tmpDb() });
    await node.storeShard({ index: 0, data: Buffer.from('m') });
    const snapshot = collectMetrics({ xsc: node }, Date.now());
    expect(snapshot.shards_stored).toBe(1);
    await node.db.close();
  });
});
