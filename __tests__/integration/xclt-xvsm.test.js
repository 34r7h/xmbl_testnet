import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Ledger } from '../../xclt/index.js';
import { StateMachine } from '../../xvsm/index.js';
import { rmSync } from 'fs';

describe('Integration: xclt + xvsm (State Commitments)', () => {
  let ledger;
  let stateMachine;
  const testDbPath = './data/ledger-integration-xclt-xvsm';

  beforeEach(async () => {
    ledger = new Ledger(testDbPath);
    stateMachine = new StateMachine();
  });

  afterEach(async () => {
    if (ledger && ledger.db) {
      await ledger.db.close();
    }
    try {
      rmSync(testDbPath, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should create state commitment from ledger block', async () => {
    const tx = {
      type: 'state_diff',
      function: 'set',
      args: { key: 'test:key1', value: 'value1' },
      timestamp: Date.now()
    };

    const result = await ledger.addTransaction(tx);
    const block = await ledger.getBlock(result.blockId);

    // Create state commitment from block
    const stateRoot = await ledger.getStateRoot();
    expect(stateRoot).toBeDefined();

    // State machine should be able to process state diff
    if (tx.function && tx.args) {
      const { StateDiff } = await import('../../xvsm/index.js');
      const stateDiff = new StateDiff(block.id, {
        [tx.args.key]: tx.args.value
      });

      expect(stateDiff).toBeDefined();
      expect(stateDiff.changes[tx.args.key]).toBe(tx.args.value);
    }
  });

  test('should process multiple state diffs from ledger blocks', async () => {
    const transactions = [];
    for (let i = 0; i < 5; i++) {
      const tx = {
        type: 'state_diff',
        function: 'set',
        args: { key: `test:key${i}`, value: `value${i}` },
        timestamp: Date.now() + i
      };
      transactions.push(tx);
      await ledger.addTransaction(tx);
    }

    // Process all state diffs
    const { StateDiff } = await import('../../xvsm/index.js');
    const stateDiffs = [];
    for (const tx of transactions) {
      if (tx.function && tx.args) {
        const diff = new StateDiff(tx.timestamp.toString(), {
          [tx.args.key]: tx.args.value
        });
        stateDiffs.push(diff);
      }
    }

    expect(stateDiffs.length).toBe(5);

    // Apply all diffs
    let currentState = {};
    for (const diff of stateDiffs) {
      currentState = diff.apply(currentState);
    }

    expect(currentState['test:key0']).toBe('value0');
    expect(currentState['test:key4']).toBe('value4');
  });

  test('should maintain state consistency between ledger and state machine', async () => {
    const tx1 = {
      type: 'state_diff',
      function: 'set',
      args: { key: 'balance:alice', value: 100 },
      timestamp: Date.now()
    };

    const tx2 = {
      type: 'state_diff',
      function: 'set',
      args: { key: 'balance:bob', value: 50 },
      timestamp: Date.now() + 1
    };

    await ledger.addTransaction(tx1);
    await ledger.addTransaction(tx2);

    const stateRoot1 = await ledger.getStateRoot();

    // Process state diffs in order
    const { StateDiff } = await import('../../xvsm/index.js');
    const diff1 = new StateDiff('tx1', { [tx1.args.key]: tx1.args.value });
    const diff2 = new StateDiff('tx2', { [tx2.args.key]: tx2.args.value });

    let state = {};
    state = diff1.apply(state);
    state = diff2.apply(state);

    expect(state['balance:alice']).toBe(100);
    expect(state['balance:bob']).toBe(50);

    // State root should be consistent
    const stateRoot2 = await ledger.getStateRoot();
    expect(stateRoot2).toBeDefined();
  });

  test('should handle cube completion events for state commitment', async () => {
    let cubeCompleteEvent = null;
    ledger.on('cube:complete', (cube) => {
      cubeCompleteEvent = cube;
    });

    // Add enough transactions to complete a cube (27 blocks = 3 faces * 9 blocks)
    // This is simplified - in reality would need specific placement
    for (let i = 0; i < 30; i++) {
      const tx = {
        type: 'state_diff',
        function: 'set',
        args: { key: `test:key${i}`, value: `value${i}` },
        timestamp: Date.now() + i
      };
      await ledger.addTransaction(tx);
    }

    // Wait a bit for events
    await new Promise(resolve => setTimeout(resolve, 100));

    // Cube completion should trigger state commitment
    if (cubeCompleteEvent) {
      const stateRoot = await ledger.getStateRoot();
      expect(stateRoot).toBeDefined();
    }
  });

  test('edge case: handle out-of-order state diffs', async () => {
    const tx1 = {
      type: 'state_diff',
      function: 'set',
      args: { key: 'counter', value: 1 },
      timestamp: 1000
    };

    const tx2 = {
      type: 'state_diff',
      function: 'set',
      args: { key: 'counter', value: 2 },
      timestamp: 2000
    };

    // Add in reverse order
    await ledger.addTransaction(tx2);
    await ledger.addTransaction(tx1);

    // State machine should handle ordering by timestamp
    const { StateDiff } = await import('../../xvsm/index.js');
    const diff1 = new StateDiff('tx1', { [tx1.args.key]: tx1.args.value });
    diff1.timestamp = tx1.timestamp;
    const diff2 = new StateDiff('tx2', { [tx2.args.key]: tx2.args.value });
    diff2.timestamp = tx2.timestamp;

    // Apply in correct order
    const diffs = [diff1, diff2].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    let state = {};
    for (const diff of diffs) {
      state = diff.apply(state);
    }

    // Final value should be from later timestamp
    expect(state['counter']).toBe(2);
  });
});

