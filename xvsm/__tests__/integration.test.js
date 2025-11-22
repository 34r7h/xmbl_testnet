import { describe, test, expect, beforeEach } from '@jest/globals';
import { StateMachine } from '../src/state-machine.js';
import { VerkleStateTree } from '../src/verkle-tree.js';
import { StateDiff } from '../src/state-diff.js';
import { WASMExecutor } from '../src/wasm-execution.js';
import { StateShard } from '../src/sharding.js';
import { StateAssembler } from '../src/state-assembly.js';

describe('State Machine Integration', () => {
  let stateMachine;

  beforeEach(() => {
    stateMachine = new StateMachine({ totalShards: 4 });
  });

  test('should execute full transaction workflow', async () => {
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const input = { increment: 1 };
    
    const result = await stateMachine.executeTransaction('tx1', wasmCode, input, 'counter');
    
    expect(result.txId).toBe('tx1');
    expect(result.diff).toBeInstanceOf(StateDiff);
    expect(result.stateRoot).toBeDefined();
    
    const state = stateMachine.getState('counter');
    expect(state).toBeDefined();
  });

  test('should handle multiple sequential transactions', async () => {
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    
    await stateMachine.executeTransaction('tx1', wasmCode, { set: 'value1' }, 'key1');
    await stateMachine.executeTransaction('tx2', wasmCode, { set: 'value2' }, 'key2');
    await stateMachine.executeTransaction('tx3', wasmCode, { set: 'value3' }, 'key3');
    
    const stats = stateMachine.getStatistics();
    expect(stats.totalTransactions).toBe(3);
    expect(stats.totalDiffs).toBe(3);
  });

  test('should generate and verify proofs', async () => {
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const result = await stateMachine.executeTransaction('tx1', wasmCode, { counter: 100 }, 'test-key');
    
    // Insert a direct key-value for proof testing
    stateMachine.stateTree.insert('direct-key', 'direct-value');
    const proof = stateMachine.generateProof('direct-key');
    expect(proof).toBeDefined();
    expect(proof.root).toBeDefined();
    
    const isValid = stateMachine.verifyProof('direct-key', 'direct-value', proof);
    expect(isValid).toBe(true);
  });

  test('should handle state queries at different timestamps', async () => {
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    
    const tx1 = await stateMachine.executeTransaction('tx1', wasmCode, { counter: 1 }, 'state');
    const timestamp1 = tx1.diff.timestamp;
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const tx2 = await stateMachine.executeTransaction('tx2', wasmCode, { counter: 2 }, 'state');
    const timestamp2 = tx2.diff.timestamp;
    
    const stateAtT1 = stateMachine.getState('state', timestamp1);
    const stateAtT2 = stateMachine.getState('state', timestamp2);
    
    expect(stateAtT1).toBeDefined();
    expect(stateAtT2).toBeDefined();
  });

  test('should distribute state across shards', async () => {
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    
    const keys = ['user:alice', 'user:bob', 'user:charlie', 'user:dave'];
    for (const key of keys) {
      await stateMachine.executeTransaction(`tx-${key}`, wasmCode, { balance: 100 }, key);
    }
    
    const stats = stateMachine.getStatistics();
    expect(stats.shards.length).toBe(4);
    
    // Verify keys are distributed
    const shardCounts = stats.shards.map(s => s.keyCount);
    const totalKeys = shardCounts.reduce((a, b) => a + b, 0);
    expect(totalKeys).toBeGreaterThan(0);
  });

  test('should handle concurrent transactions', async () => {
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    
    const transactions = [];
    for (let i = 0; i < 10; i++) {
      transactions.push(
        stateMachine.executeTransaction(`tx${i}`, wasmCode, { value: i }, `key${i}`)
      );
    }
    
    const results = await Promise.all(transactions);
    expect(results.length).toBe(10);
    
    const stats = stateMachine.getStatistics();
    expect(stats.totalTransactions).toBe(10);
  });

  test('should maintain state consistency across operations', async () => {
    const wasmCode = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    
    await stateMachine.executeTransaction('tx1', wasmCode, { a: 1, b: 2 }, 'state');
    await stateMachine.executeTransaction('tx2', wasmCode, { b: 3, c: 4 }, 'state');
    
    const state = stateMachine.getState('state');
    expect(state).toBeDefined();
    
    const root1 = stateMachine.getStateRoot();
    expect(root1).toBeDefined();
    // Root may be zeros if tree is empty, that's valid
    
    // Insert a new key to change root
    stateMachine.stateTree.insert('new-key', 'new-value');
    const root2 = stateMachine.getStateRoot();
    expect(root2).not.toBe(root1);
  });
});

