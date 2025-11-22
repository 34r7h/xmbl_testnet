import { describe, test, expect } from '@jest/globals';
import { StateAssembler } from '../src/state-assembly.js';
import { StateDiff } from '../src/state-diff.js';

describe('State Assembly Extended Tests', () => {
  test('should handle out-of-order diffs', () => {
    const assembler = new StateAssembler();
    
    const diff1 = new StateDiff('tx1', { key: 'value1' });
    diff1.timestamp = 200;
    const diff2 = new StateDiff('tx2', { key: 'value2' });
    diff2.timestamp = 100;
    
    // Provide out of order
    const state = assembler.assemble([diff1, diff2]);
    
    // Should be ordered by timestamp - later timestamp overwrites earlier
    expect(state.key).toBe('value1'); // Later timestamp (200) overwrites earlier (100)
  });

  test('should handle base state', () => {
    const assembler = new StateAssembler();
    assembler.setBaseState({ base: 'value', key: 'initial' });
    
    const diff = new StateDiff('tx1', { key: 'updated' });
    const state = assembler.assemble([diff]);
    
    expect(state.base).toBe('value');
    expect(state.key).toBe('updated');
  });

  test('should query state at specific timestamp', () => {
    const assembler = new StateAssembler();
    
    const diff1 = new StateDiff('tx1', { counter: 1 });
    diff1.timestamp = 100;
    const diff2 = new StateDiff('tx2', { counter: 2 });
    diff2.timestamp = 200;
    const diff3 = new StateDiff('tx3', { counter: 3 });
    diff3.timestamp = 300;
    
    const stateAt150 = assembler.getStateAtTimestamp([diff1, diff2, diff3], 150);
    expect(stateAt150.counter).toBe(1);
    
    const stateAt250 = assembler.getStateAtTimestamp([diff1, diff2, diff3], 250);
    expect(stateAt250.counter).toBe(2);
  });

  test('should handle large number of diffs', () => {
    const assembler = new StateAssembler();
    const diffs = [];
    
    for (let i = 0; i < 1000; i++) {
      const diff = new StateDiff(`tx${i}`, { [`key${i}`]: `value${i}` });
      diff.timestamp = i;
      diffs.push(diff);
    }
    
    const state = assembler.assemble(diffs);
    expect(Object.keys(state).length).toBe(1000);
    expect(state.key0).toBe('value0');
    expect(state.key999).toBe('value999');
  });

  test('should handle conflicting updates correctly', () => {
    const assembler = new StateAssembler();
    
    const diff1 = new StateDiff('tx1', { key: 'value1' });
    diff1.timestamp = 100;
    const diff2 = new StateDiff('tx2', { key: 'value2' });
    diff2.timestamp = 200;
    const diff3 = new StateDiff('tx3', { key: 'value3' });
    diff3.timestamp = 150;
    
    const state = assembler.assemble([diff1, diff2, diff3]);
    // Latest timestamp should win
    expect(state.key).toBe('value2');
  });

  test('should handle empty diff list', () => {
    const assembler = new StateAssembler();
    assembler.setBaseState({ base: 'value' });
    
    const state = assembler.assemble([]);
    expect(state).toEqual({ base: 'value' });
  });
});

