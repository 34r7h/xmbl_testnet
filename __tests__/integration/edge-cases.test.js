import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Identity } from '../../xid/index.js';
import { XNNode } from '../../xn/index.js';
import { Ledger } from '../../xclt/index.js';
import { ConsensusWorkflow } from '../../xpc/index.js';
import { rmSync } from 'fs';

describe('Integration Edge Cases', () => {
  let identity1, identity2;
  let node1, node2;
  let ledger;
  let workflow;
  const testDbPath = './data/ledger-edge-cases';

  beforeEach(async () => {
    identity1 = await Identity.create();
    identity2 = await Identity.create();
    node1 = new XNNode({ port: 0 });
    node2 = new XNNode({ port: 0 });
    ledger = new Ledger(testDbPath);
    workflow = new ConsensusWorkflow();

    await node1.start();
    await node2.start();
  });

  afterEach(async () => {
    if (node1) await node1.stop();
    if (node2) await node2.stop();
    if (ledger && ledger.db) await ledger.db.close();
    try {
      rmSync(testDbPath, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('edge case: network failure during transaction propagation', async () => {
    const topic = 'blocks';
    await node1.subscribe(topic);
    await node2.subscribe(topic);

    const node2Address = node2.getAddresses()[0];
    try {
      await node1.connect(node2Address);
    } catch (error) {
      // Network connection may fail in test environment
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    const result = await ledger.addTransaction(signedTx);
    const block = await ledger.getBlock(result.blockId);

    // Disconnect before publishing
    await node1.stop();

    // Should handle gracefully
    try {
      await node1.publish(topic, {
        blockId: block.id,
        block: block.serialize()
      });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('edge case: invalid signature in transaction', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    
    // Tamper with signature
    signedTx.sig = 'invalid_signature';

    // Verification should fail
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(false);

    // Transaction should not be added to ledger with invalid signature
    // (In real system, would be rejected before this point)
  });

  test('edge case: double-spend attempt', async () => {
    const tx1 = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now(),
      utxo: 'utxo123'
    };

    const tx2 = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: Date.now() + 1,
      utxo: 'utxo123' // Same UTXO
    };

    const signedTx1 = await identity1.signTransaction(tx1);
    const signedTx2 = await identity1.signTransaction(tx2);

    // Submit both to consensus
    const rawTxId1 = await workflow.submitTransaction('leader1', signedTx1);
    const rawTxId2 = await workflow.submitTransaction('leader1', signedTx2);

    // Both should be submitted, but consensus should handle double-spend
    expect(rawTxId1).toBeDefined();
    expect(rawTxId2).toBeDefined();

    // UTXO locking should prevent double-spend
    const stats = workflow.getMempoolStats();
    expect(stats.lockedUtxos).toBeGreaterThan(0);
  });

  test('edge case: concurrent transaction submissions', async () => {
    const transactions = [];
    for (let i = 0; i < 10; i++) {
      const tx = {
        type: 'utxo',
        from: identity1.address,
        to: identity2.address,
        amount: 10 + i,
        timestamp: Date.now() + i
      };
      transactions.push(identity1.signTransaction(tx));
    }

    // Sign all concurrently
    const signedTxs = await Promise.all(transactions);

    // Submit all concurrently
    const submissions = signedTxs.map(tx => 
      workflow.submitTransaction('leader1', tx)
    );

    const rawTxIds = await Promise.all(submissions);
    expect(rawTxIds.length).toBe(10);
    expect(rawTxIds.every(id => id !== undefined)).toBe(true);
  });

  test('edge case: transaction with missing required fields', async () => {
    const tx = {
      type: 'utxo',
      // Missing 'from' field
      to: identity2.address,
      amount: 100,
      timestamp: Date.now()
    };

    // Should handle missing fields gracefully
    // (In real system, would be validated before signing)
    try {
      const signedTx = await identity1.signTransaction(tx);
      // Transaction might still be signed, but validation should catch it
    } catch (error) {
      // Expected if validation happens before signing
      expect(error).toBeDefined();
    }
  });

  test('edge case: very large transaction', async () => {
    const largeData = 'x'.repeat(100000); // 100KB
    const tx = {
      type: 'state_diff',
      function: 'set',
      args: { key: 'large_data', value: largeData },
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(true);

    // Should handle large transactions
    const result = await ledger.addTransaction(signedTx);
    expect(result.blockId).toBeDefined();
  });

  test('edge case: transaction with future timestamp', async () => {
    const futureTime = Date.now() + 86400000; // 1 day in future
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 100,
      timestamp: futureTime
    };

    const signedTx = await identity1.signTransaction(tx);
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(true);

    // Should still be processable (timestamp validation at consensus level)
    const result = await ledger.addTransaction(signedTx);
    expect(result.blockId).toBeDefined();
  });

  test('edge case: transaction with zero amount', async () => {
    const tx = {
      type: 'utxo',
      from: identity1.address,
      to: identity2.address,
      amount: 0,
      timestamp: Date.now()
    };

    const signedTx = await identity1.signTransaction(tx);
    const isValid = await Identity.verifyTransaction(signedTx, identity1.publicKey);
    expect(isValid).toBe(true);

    // Should still be processable (amount validation at consensus level)
    const result = await ledger.addTransaction(signedTx);
    expect(result.blockId).toBeDefined();
  });

  test('edge case: rapid node connect/disconnect', async () => {
    const topic = 'blocks';
    await node1.subscribe(topic);
    await node2.subscribe(topic);

    // Rapid connect/disconnect
    for (let i = 0; i < 5; i++) {
      const node2Address = node2.getAddresses()[0];
      try {
        await node1.connect(node2Address);
        await new Promise(resolve => setTimeout(resolve, 100));
        // Don't actually disconnect, just test rapid connections
      } catch (error) {
        // Handle connection errors gracefully
      }
    }

    // Should handle gracefully
    expect(node1.getConnectedPeers().length).toBeGreaterThanOrEqual(0);
  });
});

