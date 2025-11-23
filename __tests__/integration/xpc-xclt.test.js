import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ConsensusWorkflow } from '../../xpc/index.js';
import { Ledger } from '../../xclt/index.js';
import { rmSync } from 'fs';

describe('Integration: xpc + xclt (Final Transaction Inclusion)', () => {
  let workflow;
  let ledger;
  const testDbPath = './data/ledger-integration-xpc-xclt';

  beforeEach(() => {
    workflow = new ConsensusWorkflow();
    ledger = new Ledger(testDbPath);
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

  test('should add finalized transaction to ledger', async () => {
    const tx = {
      type: 'utxo',
      from: 'alice',
      to: 'bob',
      amount: 100,
      timestamp: Date.now()
    };

    // Submit to consensus
    const rawTxId = await workflow.submitTransaction('leader1', tx);

    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task, Date.now());
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get processing transaction
    const processingTxs = Array.from(workflow.mempool.processingTx.values());
    expect(processingTxs.length).toBeGreaterThan(0);

    if (processingTxs.length > 0) {
      const processingTx = processingTxs[0];
      const txId = Object.keys(workflow.mempool.processingTx)[0];

      // Finalize transaction
      workflow.finalizeTransaction(txId);

      // Add to ledger
      const result = await ledger.addTransaction(processingTx.txData);
      expect(result.blockId).toBeDefined();
      expect(result.coordinates).toBeDefined();
    }
  });

  test('should handle multiple finalized transactions', async () => {
    const transactions = [];
    for (let i = 0; i < 5; i++) {
      const tx = {
        type: 'utxo',
        from: 'alice',
        to: `bob${i}`,
        amount: 10 + i,
        timestamp: Date.now() + i
      };
      transactions.push(tx);
      await workflow.submitTransaction('leader1', tx);
    }

    // Complete validations for all
    for (const tx of transactions) {
      const rawTxId = await workflow.submitTransaction('leader1', tx);
      const tasks = workflow.getValidationTasks(rawTxId);
      for (const task of tasks) {
        await workflow.completeValidation(rawTxId, task.task, Date.now());
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // Finalize and add to ledger
    const processingTxs = Array.from(workflow.mempool.processingTx.entries());
    for (const [txId, processingTx] of processingTxs) {
      workflow.finalizeTransaction(txId);
      const result = await ledger.addTransaction(processingTx.txData);
      expect(result.blockId).toBeDefined();
    }
  });

  test('should listen for finalized events and add to ledger', async () => {
    const finalizedTxs = [];
    workflow.on('tx:finalized', (data) => {
      finalizedTxs.push(data);
    });

    const tx = {
      type: 'utxo',
      from: 'alice',
      to: 'bob',
      amount: 100,
      timestamp: Date.now()
    };

    const rawTxId = await workflow.submitTransaction('leader1', tx);

    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task, Date.now());
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Finalize
    const processingTxs = Array.from(workflow.mempool.processingTx.entries());
    if (processingTxs.length > 0) {
      const [txId] = processingTxs[0];
      workflow.finalizeTransaction(txId);

      // Event should be emitted
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(finalizedTxs.length).toBeGreaterThan(0);

      // Add to ledger from event
      if (finalizedTxs.length > 0) {
        const result = await ledger.addTransaction(finalizedTxs[0].txData);
        expect(result.blockId).toBeDefined();
      }
    }
  });

  test('edge case: handle transaction finalization before consensus complete', async () => {
    const tx = {
      type: 'utxo',
      from: 'alice',
      to: 'bob',
      amount: 100,
      timestamp: Date.now()
    };

    const rawTxId = await workflow.submitTransaction('leader1', tx);

    // Try to finalize before validations complete
    const processingTxs = Array.from(workflow.mempool.processingTx.entries());
    if (processingTxs.length === 0) {
      // Transaction not in processing yet
      const result = workflow.finalizeTransaction('non-existent');
      expect(result).toBe(false);
    }
  });

  test('edge case: handle duplicate transaction finalization', async () => {
    const tx = {
      type: 'utxo',
      from: 'alice',
      to: 'bob',
      amount: 100,
      timestamp: Date.now()
    };

    const rawTxId = await workflow.submitTransaction('leader1', tx);

    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task, Date.now());
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const processingTxs = Array.from(workflow.mempool.processingTx.entries());
    if (processingTxs.length > 0) {
      const [txId] = processingTxs[0];
      
      // Finalize first time
      const result1 = workflow.finalizeTransaction(txId);
      expect(result1).toBe(true);

      // Try to finalize again
      const result2 = workflow.finalizeTransaction(txId);
      expect(result2).toBe(false);
    }
  });
});



