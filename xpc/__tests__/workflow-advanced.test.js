import { describe, test, expect, beforeEach } from '@jest/globals';
import { ConsensusWorkflow } from '../src/workflow.js';

describe('Consensus Workflow - Advanced', () => {
  let workflow;

  beforeEach(() => {
    workflow = new ConsensusWorkflow();
  });

  test('should finalize transaction to tx_mempool', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    // Get processing tx
    const processingTxs = Array.from(workflow.mempool.processingTx.values());
    expect(processingTxs.length).toBe(1);
    const txId = Array.from(workflow.mempool.processingTx.keys())[0];
    
    // Finalize
    const finalized = workflow.finalizeTransaction(txId);
    expect(finalized).toBe(true);
    
    // Should be in final mempool
    expect(workflow.mempool.tx.has(txId)).toBe(true);
    expect(workflow.mempool.processingTx.has(txId)).toBe(false);
  });

  test('should unlock UTXOs when finalizing transaction', async () => {
    const utxo = 'utxo1';
    const tx = { to: 'bob', amount: 1.0, from: utxo, user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    expect(workflow.mempool.lockedUtxo.has(utxo)).toBe(true);
    
    // Complete validations and finalize
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    const txId = Array.from(workflow.mempool.processingTx.keys())[0];
    workflow.finalizeTransaction(txId);
    
    // UTXO should be unlocked
    expect(workflow.mempool.lockedUtxo.has(utxo)).toBe(false);
  });

  test('should emit tx:finalized event', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    const finalizedPromise = new Promise((resolve) => {
      workflow.once('tx:finalized', (data) => {
        expect(data).toHaveProperty('txId');
        expect(data).toHaveProperty('txData');
        resolve();
      });
    });
    
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    const txId = Array.from(workflow.mempool.processingTx.keys())[0];
    workflow.finalizeTransaction(txId);
    
    await finalizedPromise;
  });

  test('should return false when finalizing non-existent transaction', () => {
    const result = workflow.finalizeTransaction('nonexistent');
    expect(result).toBe(false);
  });

  test('should get processing transaction', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    const txId = Array.from(workflow.mempool.processingTx.keys())[0];
    const processingTx = workflow.getProcessingTransaction(txId);
    
    expect(processingTx).toBeDefined();
    expect(processingTx.txData).toEqual(tx);
    expect(processingTx.timestamp).toBeDefined();
    expect(processingTx.leader).toBe('leader1');
  });

  test('should return null for non-existent processing transaction', () => {
    const result = workflow.getProcessingTransaction('nonexistent');
    expect(result).toBeNull();
  });

  test('should get mempool statistics', async () => {
    const stats1 = workflow.getMempoolStats();
    expect(stats1).toHaveProperty('raw');
    expect(stats1).toHaveProperty('processing');
    expect(stats1).toHaveProperty('final');
    expect(stats1).toHaveProperty('lockedUtxos');
    expect(stats1.raw).toBe(0);
    expect(stats1.processing).toBe(0);
    expect(stats1.final).toBe(0);
    
    // Add transaction
    const tx = { to: 'bob', amount: 1.0, from: 'utxo1', user: 'alice' };
    await workflow.submitTransaction('leader1', tx);
    
    const stats2 = workflow.getMempoolStats();
    expect(stats2.raw).toBe(1);
    expect(stats2.lockedUtxos).toBe(1);
    
    // Complete validations
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    const stats3 = workflow.getMempoolStats();
    expect(stats3.raw).toBe(0); // Moved to processing
    expect(stats3.processing).toBe(1);
    expect(stats3.lockedUtxos).toBe(1); // Still locked
    
    // Finalize
    const txId = Array.from(workflow.mempool.processingTx.keys())[0];
    workflow.finalizeTransaction(txId);
    
    const stats4 = workflow.getMempoolStats();
    expect(stats4.processing).toBe(0);
    expect(stats4.final).toBe(1);
    expect(stats4.lockedUtxos).toBe(0); // Unlocked
  });

  test('should handle multiple transactions in different stages', async () => {
    const tx1 = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const tx2 = { to: 'charlie', amount: 2.0, from: 'bob', user: 'bob' };
    const tx3 = { to: 'dave', amount: 3.0, from: 'charlie', user: 'charlie' };
    
    // Submit all
    const rawTxId1 = await workflow.submitTransaction('leader1', tx1);
    const rawTxId2 = await workflow.submitTransaction('leader1', tx2);
    const rawTxId3 = await workflow.submitTransaction('leader1', tx3);
    
    let stats = workflow.getMempoolStats();
    expect(stats.raw).toBe(3);
    
    // Complete validations for tx1
    const tasks1 = workflow.getValidationTasks(rawTxId1);
    for (const task of tasks1) {
      await workflow.completeValidation(rawTxId1, task.task);
    }
    
    stats = workflow.getMempoolStats();
    expect(stats.raw).toBe(2);
    expect(stats.processing).toBe(1);
    
    // Complete validations for tx2
    const tasks2 = workflow.getValidationTasks(rawTxId2);
    for (const task of tasks2) {
      await workflow.completeValidation(rawTxId2, task.task);
    }
    
    stats = workflow.getMempoolStats();
    expect(stats.raw).toBe(1);
    expect(stats.processing).toBe(2);
    
    // Finalize tx1
    const txId1 = Array.from(workflow.mempool.processingTx.keys())[0];
    workflow.finalizeTransaction(txId1);
    
    stats = workflow.getMempoolStats();
    expect(stats.processing).toBe(1);
    expect(stats.final).toBe(1);
  });

  test('should preserve transaction data through all stages', async () => {
    const originalTx = {
      to: 'bob',
      amount: 1.5,
      from: 'alice',
      user: 'alice',
      sig: 'signature123',
      stake: 0.2,
      fee: 0.1,
      metadata: { note: 'test' }
    };
    
    const rawTxId = await workflow.submitTransaction('leader1', originalTx);
    
    // Verify in raw_tx
    const rawTx = workflow._getRawTransaction(rawTxId);
    expect(rawTx.txData).toEqual(originalTx);
    
    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    // Verify in processing
    const txId = Array.from(workflow.mempool.processingTx.keys())[0];
    const processingTx = workflow.getProcessingTransaction(txId);
    expect(processingTx.txData).toEqual(originalTx);
    
    // Finalize
    workflow.finalizeTransaction(txId);
    
    // Verify in final
    const finalTx = workflow.mempool.tx.get(txId);
    expect(finalTx).toEqual(originalTx);
  });
});

