import { describe, test, expect } from '@jest/globals';
import { VerkleStateTree } from '../src/verkle-tree.js';
import { StateMachine } from '../src/state-machine.js';
import { StateAssembler } from '../src/state-assembly.js';
import { StateDiff } from '../src/state-diff.js';

describe('Performance Tests', () => {
  test('should handle 1k state insertions efficiently', () => {
    const tree = new VerkleStateTree();
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      tree.insert(`key${i}`, `value${i}`);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
    expect(tree.getRoot()).toBeDefined();
  }, 15000);

  test('should generate proofs efficiently', () => {
    const tree = new VerkleStateTree();
    
    for (let i = 0; i < 100; i++) {
      tree.insert(`key${i}`, `value${i}`);
    }
    
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      const proof = tree.generateProof(`key${i}`);
      expect(proof).toBeDefined();
    }
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // 10 proofs in under 5 seconds
  }, 10000);

  test('should verify proofs efficiently', () => {
    const tree = new VerkleStateTree();
    
    for (let i = 0; i < 100; i++) {
      tree.insert(`key${i}`, `value${i}`);
    }
    
    const proofs = [];
    for (let i = 0; i < 10; i++) {
      proofs.push(tree.generateProof(`key${i}`));
    }
    
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      const isValid = VerkleStateTree.verifyProof(`key${i}`, `value${i}`, proofs[i]);
      expect(isValid).toBe(true);
    }
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // 10 verifications in under 5 seconds
  }, 10000);

  test('should assemble large state efficiently', () => {
    const assembler = new StateAssembler();
    const diffs = [];
    
    for (let i = 0; i < 500; i++) {
      const diff = new StateDiff(`tx${i}`, { [`key${i}`]: `value${i}` });
      diff.timestamp = i;
      diffs.push(diff);
    }
    
    const start = Date.now();
    const state = assembler.assemble(diffs);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    expect(Object.keys(state).length).toBe(500);
  }, 10000);

  test('should handle concurrent transactions efficiently', async () => {
    const stateMachine = new StateMachine({ totalShards: 8 });
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    
    const transactions = [];
    for (let i = 0; i < 20; i++) {
      transactions.push(
        stateMachine.executeTransaction(`tx${i}`, wasmCode, { value: i }, `key${i}`)
      );
    }
    
    const start = Date.now();
    await Promise.all(transactions);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10000); // 20 concurrent transactions in under 10 seconds
    const stats = stateMachine.getStatistics();
    expect(stats.totalTransactions).toBe(20);
  }, 15000);
});

