import { describe, test, expect } from '@jest/globals';
import { StateShard } from '../src/sharding.js';

describe('State Sharding', () => {
  test('should create shard', () => {
    const shard = new StateShard(0, 4); // shard 0 of 4
    expect(shard.index).toBe(0);
    expect(shard.totalShards).toBe(4);
  });

  test('should assign key to shard', () => {
    const shard = new StateShard(0, 4);
    const key = 'user:alice:balance';
    const assignedShard = StateShard.getShardForKey(key, 4);
    expect(assignedShard).toBeGreaterThanOrEqual(0);
    expect(assignedShard).toBeLessThan(4);
  });

  test('should be deterministic', () => {
    const key = 'user:alice:balance';
    const shard1 = StateShard.getShardForKey(key, 4);
    const shard2 = StateShard.getShardForKey(key, 4);
    expect(shard1).toBe(shard2);
  });
});

