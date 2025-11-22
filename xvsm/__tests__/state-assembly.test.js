import { describe, test, expect } from '@jest/globals';
import { StateAssembler } from '../src/state-assembly.js';
import { StateDiff } from '../src/state-diff.js';

describe('State Assembly', () => {
  test('should assemble state from diffs', () => {
    const assembler = new StateAssembler();
    const diffs = [
      new StateDiff('tx1', { key1: 'value1' }),
      new StateDiff('tx2', { key2: 'value2' })
    ];
    const state = assembler.assemble(diffs);
    expect(state.key1).toBe('value1');
    expect(state.key2).toBe('value2');
  });

  test('should handle diff ordering', () => {
    const assembler = new StateAssembler();
    const diff1 = new StateDiff('tx1', { key1: 'value1' });
    diff1.timestamp = 100;
    const diff2 = new StateDiff('tx2', { key1: 'value2' });
    diff2.timestamp = 200;
    const diffs = [diff1, diff2];
    const state = assembler.assemble(diffs);
    // Later diff should override
    expect(state.key1).toBe('value2');
  });
});

