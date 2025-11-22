import { describe, test, expect } from '@jest/globals';
import { StateDiff } from '../src/state-diff.js';

describe('State Diff Extended Tests', () => {
  test('should handle nested state changes', () => {
    const state = {
      user: {
        name: 'Alice',
        balance: 100
      }
    };
    
    const diff = new StateDiff('tx1', {
      'user.balance': 200
    });
    
    const newState = diff.apply(state);
    expect(newState['user.balance']).toBe(200);
  });

  test('should handle deletions', () => {
    const state = { a: 1, b: 2, c: 3 };
    const diff = new StateDiff('tx1', { b: null });
    const newState = diff.apply(state);
    
    expect(newState.a).toBe(1);
    expect(newState.b).toBeNull();
    expect(newState.c).toBe(3);
  });

  test('should merge conflicting diffs correctly', () => {
    const diff1 = new StateDiff('tx1', { key: 'value1' });
    const diff2 = new StateDiff('tx2', { key: 'value2' });
    
    const merged = StateDiff.merge([diff1, diff2]);
    // Later diff should win
    expect(merged.changes.key).toBe('value2');
  });

  test('should serialize and deserialize correctly', () => {
    const diff = new StateDiff('tx1', { key1: 'value1', key2: 42 });
    const serialized = diff.serialize();
    const deserialized = StateDiff.deserialize(serialized);
    
    expect(deserialized.txId).toBe('tx1');
    expect(deserialized.changes).toEqual({ key1: 'value1', key2: 42 });
  });

  test('should handle empty diffs', () => {
    const diff = new StateDiff('tx1', {});
    const state = { a: 1, b: 2 };
    const newState = diff.apply(state);
    
    expect(newState).toEqual(state);
  });

  test('should preserve timestamp ordering', async () => {
    const diff1 = new StateDiff('tx1', { a: 1 });
    await new Promise(resolve => setTimeout(resolve, 10));
    const diff2 = new StateDiff('tx2', { b: 2 });
    
    expect(diff2.timestamp).toBeGreaterThan(diff1.timestamp);
  });

  test('should handle large diffs', () => {
    const changes = {};
    for (let i = 0; i < 1000; i++) {
      changes[`key${i}`] = `value${i}`;
    }
    
    const diff = new StateDiff('tx1', changes);
    expect(Object.keys(diff.changes).length).toBe(1000);
    
    const state = {};
    const newState = diff.apply(state);
    expect(Object.keys(newState).length).toBe(1000);
  });
});

