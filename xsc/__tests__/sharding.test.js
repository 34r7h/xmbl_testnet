import { describe, test, expect } from '@jest/globals';
import { StorageShard } from '../src/sharding.js';

describe('Storage Sharding', () => {
  test('should create shard from data', () => {
    const data = Buffer.from('Hello, XMBL!');
    const shard = StorageShard.create(data, 0, 4);
    expect(shard).toHaveProperty('index');
    expect(shard).toHaveProperty('data');
    expect(shard.index).toBe(0);
  });

  test('should reconstruct data from shards', () => {
    const original = Buffer.from('Hello, XMBL!');
    const shards = [];
    for (let i = 0; i < 4; i++) {
      shards.push(StorageShard.create(original, i, 4));
    }
    const reconstructed = StorageShard.reconstruct(shards); // Need all shards for simple splitting
    expect(reconstructed.toString()).toBe(original.toString());
  });

  test('should handle erasure coding', () => {
    const data = Buffer.from('Test data');
    const { shards, parity } = StorageShard.encode(data, 4, 2);
    expect(shards.length).toBe(4);
    expect(parity.length).toBe(2);
    
    // Should reconstruct with any 4 shards
    const reconstructed = StorageShard.decode([...shards.slice(0, 2), ...parity]);
    expect(reconstructed.toString()).toBe(data.toString());
  });
});

