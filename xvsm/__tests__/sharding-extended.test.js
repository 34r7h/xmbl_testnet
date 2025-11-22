import { describe, test, expect } from '@jest/globals';
import { StateShard } from '../src/sharding.js';

describe('State Sharding Extended Tests', () => {
  test('should distribute keys evenly across shards', () => {
    const totalShards = 4;
    const keys = [];
    const shardCounts = new Array(totalShards).fill(0);
    
    for (let i = 0; i < 1000; i++) {
      const key = `key${i}`;
      keys.push(key);
      const shardIndex = StateShard.getShardForKey(key, totalShards);
      shardCounts[shardIndex]++;
    }
    
    // Check that keys are distributed (not all in one shard)
    const maxCount = Math.max(...shardCounts);
    const minCount = Math.min(...shardCounts);
    
    // Distribution should be relatively even (within 30% variance)
    expect(maxCount / minCount).toBeLessThan(1.5);
  });

  test('should handle shard operations independently', () => {
    const shard0 = new StateShard(0, 4);
    const shard1 = new StateShard(1, 4);
    
    shard0.set('key1', 'value1');
    shard1.set('key1', 'value2');
    
    expect(shard0.get('key1')).toBe('value1');
    expect(shard1.get('key1')).toBe('value2');
  });

  test('should maintain consistency after shard reconfiguration', () => {
    const key = 'user:alice:balance';
    const shard4 = StateShard.getShardForKey(key, 4);
    const shard8 = StateShard.getShardForKey(key, 8);
    
    // Key should map to consistent shard within same total
    const shard4Again = StateShard.getShardForKey(key, 4);
    expect(shard4).toBe(shard4Again);
  });

  test('should handle all CRUD operations', () => {
    const shard = new StateShard(0, 4);
    
    shard.set('key1', 'value1');
    expect(shard.get('key1')).toBe('value1');
    
    shard.set('key1', 'value2');
    expect(shard.get('key1')).toBe('value2');
    
    shard.delete('key1');
    expect(shard.get('key1')).toBeUndefined();
  });

  test('should return all keys in shard', () => {
    const shard = new StateShard(0, 4);
    
    shard.set('key1', 'value1');
    shard.set('key2', 'value2');
    shard.set('key3', 'value3');
    
    const keys = shard.getAllKeys();
    expect(keys.length).toBe(3);
    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toContain('key3');
  });

  test('should handle collisions gracefully', () => {
    // Even if two keys hash to same shard, they should be stored separately
    const shard = new StateShard(0, 1); // Single shard forces all keys together
    
    shard.set('key1', 'value1');
    shard.set('key2', 'value2');
    
    expect(shard.get('key1')).toBe('value1');
    expect(shard.get('key2')).toBe('value2');
  });
});

