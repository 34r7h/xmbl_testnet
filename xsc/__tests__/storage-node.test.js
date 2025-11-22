import { describe, test, expect } from '@jest/globals';
import { StorageNode } from '../src/storage-node.js';

describe('Storage Node', () => {
  test('should create storage node', () => {
    const node = new StorageNode({ capacity: 1000 });
    expect(node.getCapacity()).toBe(1000);
    expect(node.getUsed()).toBe(0);
  });

  test('should store shard', async () => {
    const node = new StorageNode({ capacity: 1000 });
    const shard = { index: 0, data: Buffer.from('test') };
    const shardId = await node.storeShard(shard);
    expect(shardId).toBeDefined();
    expect(node.getUsed()).toBe(shard.data.length);
  });

  test('should retrieve shard', async () => {
    const node = new StorageNode({ capacity: 1000 });
    const shard = { index: 0, data: Buffer.from('test') };
    const shardId = await node.storeShard(shard);
    const retrieved = await node.getShard(shardId);
    expect(retrieved.data.toString()).toBe(shard.data.toString());
  });

  test('should reject storage when full', async () => {
    const node = new StorageNode({ capacity: 10 });
    const shard = { index: 0, data: Buffer.alloc(20) };
    await expect(node.storeShard(shard)).rejects.toThrow('Storage full');
  });
});

