import { describe, test, expect } from '@jest/globals';
import { StateDiff } from '../src/state-diff.js';

describe('State Diff', () => {
  test('should create state diff', () => {
    const diff = new StateDiff('tx1', { key1: 'value1' });
    expect(diff.txId).toBe('tx1');
    expect(diff.changes).toEqual({ key1: 'value1' });
  });

  test('should apply diff to state', () => {
    const state = { key1: 'old', key2: 'unchanged' };
    const diff = new StateDiff('tx1', { key1: 'new' });
    const newState = diff.apply(state);
    expect(newState.key1).toBe('new');
    expect(newState.key2).toBe('unchanged');
  });

  test('should merge diffs', () => {
    const diff1 = new StateDiff('tx1', { key1: 'value1' });
    const diff2 = new StateDiff('tx2', { key2: 'value2' });
    const merged = StateDiff.merge([diff1, diff2]);
    expect(merged.changes).toEqual({ key1: 'value1', key2: 'value2' });
  });
});

