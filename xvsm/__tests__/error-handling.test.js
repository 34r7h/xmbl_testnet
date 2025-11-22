import { describe, test, expect } from '@jest/globals';
import { VerkleStateTree } from '../src/verkle-tree.js';
import { StateMachine } from '../src/state-machine.js';
import { WASMExecutor } from '../src/wasm-execution.js';
import { StateAssembler } from '../src/state-assembly.js';
import { StateDiff } from '../src/state-diff.js';

describe('Error Handling', () => {
  test('should handle missing keys gracefully', () => {
    const tree = new VerkleStateTree();
    expect(tree.get('nonexistent')).toBeUndefined();
  });

  test('should throw error for invalid proof verification', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    
    const proof = tree.generateProof('key1');
    const isValid = VerkleStateTree.verifyProof('key1', 'wrong-value', proof);
    expect(isValid).toBe(false);
  });

  test('should handle invalid WASM modules', async () => {
    const executor = new WASMExecutor();
    const invalidWasm = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    
    await expect(
      executor.execute(invalidWasm, 'function', {})
    ).rejects.toThrow();
  });

  test('should handle missing WASM functions', async () => {
    const executor = new WASMExecutor();
    const wasmCode = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
    ]);
    
    await expect(
      executor.execute(wasmCode, 'nonexistent', {})
    ).rejects.toThrow();
  });

  test('should handle transaction failures', async () => {
    const stateMachine = new StateMachine();
    const invalidWasm = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    
    await expect(
      stateMachine.executeTransaction('tx1', invalidWasm, {}, 'key')
    ).rejects.toThrow();
    
    // State should remain consistent
    const stats = stateMachine.getStatistics();
    expect(stats.totalTransactions).toBe(0);
  });

  test('should handle proof generation for non-existent keys', () => {
    const tree = new VerkleStateTree();
    
    // Should throw error for non-existent key
    expect(() => tree.generateProof('nonexistent')).toThrow();
  });

  test('should handle empty state assembly', () => {
    const assembler = new StateAssembler();
    const state = assembler.assemble([]);
    expect(state).toEqual({});
  });

  test('should handle malformed state diffs', () => {
    const diff = new StateDiff('tx1', {});
    const state = { a: 1 };
    
    expect(() => diff.apply(state)).not.toThrow();
  });
});

