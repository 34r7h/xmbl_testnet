import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ConsensusWorkflow } from '../src/workflow.js';

describe('Consensus Workflow', () => {
  let workflow;

  beforeEach(() => {
    workflow = new ConsensusWorkflow();
  });

  test('should process transaction through stages', async () => {
    const tx = {
      to: 'bob',
      amount: 1.0,
      from: 'alice',
      user: 'alice',
      sig: 'signature',
      stake: 0.2,
      fee: 0.1
    };
    
    // Stage 1: Add to raw_tx_mempool
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    expect(rawTxId).toBeDefined();
    
    // Stage 2: Create validation tasks
    await workflow.createValidationTasks(rawTxId);
    const tasks = workflow.getValidationTasks(rawTxId);
    expect(tasks.length).toBeGreaterThan(0);
    
    // Stage 3: Complete validation
    await workflow.completeValidation(rawTxId, tasks[0].task);
    
    // Stage 4: Move to processing
    await workflow.moveToProcessing(rawTxId);
    expect(workflow.isInProcessing(rawTxId)).toBe(true);
  });

  test('should lock UTXOs when submitting transaction', async () => {
    const tx = {
      to: 'bob',
      amount: 1.0,
      from: ['utxo1', 'utxo2'],
      user: 'alice'
    };
    
    await workflow.submitTransaction('leader1', tx);
    expect(workflow.mempool.lockedUtxo.has('utxo1')).toBe(true);
    expect(workflow.mempool.lockedUtxo.has('utxo2')).toBe(true);
  });

  test('should create validation tasks automatically on submit', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    const tasks = workflow.getValidationTasks(rawTxId);
    expect(tasks.length).toBe(3); // Should create tasks for 3 leaders
  });

  test('should emit validation_tasks:created event', (done) => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    workflow.once('validation_tasks:created', (data) => {
      expect(data).toHaveProperty('rawTxId');
      expect(data).toHaveProperty('tasks');
      expect(data.tasks.length).toBeGreaterThan(0);
      done();
    });
    
    workflow.submitTransaction('leader1', tx);
  });

  test('should require minimum validations before moving to processing', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    const tasks = workflow.getValidationTasks(rawTxId);
    
    // Complete only 2 validations (need 3)
    await workflow.completeValidation(rawTxId, tasks[0].task);
    await workflow.completeValidation(rawTxId, tasks[1].task);
    
    // Should not be in processing yet
    expect(workflow.isInProcessing(rawTxId)).toBe(false);
    
    // Complete third validation
    await workflow.completeValidation(rawTxId, tasks[2].task);
    
    // Now should be in processing
    expect(workflow.isInProcessing(rawTxId)).toBe(true);
  });

  test('should calculate average timestamp correctly', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    const tasks = workflow.getValidationTasks(rawTxId);
    
    const timestamps = [1000, 2000, 3000];
    for (let i = 0; i < tasks.length; i++) {
      await workflow.completeValidation(rawTxId, tasks[i].task, timestamps[i]);
    }
    
    // Should have moved to processing with average timestamp
    const processingTxs = Array.from(workflow.mempool.processingTx.values());
    expect(processingTxs.length).toBe(1);
    expect(processingTxs[0].timestamp).toBe(2000); // Average of 1000, 2000, 3000
  });

  test('should emit tx:processing event when moving to processing', (done) => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    workflow.once('tx:processing', (data) => {
      expect(data).toHaveProperty('txId');
      expect(data).toHaveProperty('rawTxId');
      done();
    });
    
    workflow.submitTransaction('leader1', tx).then(async (rawTxId) => {
      const tasks = workflow.getValidationTasks(rawTxId);
      for (const task of tasks) {
        await workflow.completeValidation(rawTxId, task.task);
      }
    });
  });

  test('should remove transaction from raw_tx_mempool when moving to processing', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    // Verify it's in raw_tx
    const leaderMempool = workflow.mempool.rawTx.get('leader1');
    expect(leaderMempool.has(rawTxId)).toBe(true);
    
    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    // Should be removed from raw_tx
    expect(leaderMempool.has(rawTxId)).toBe(false);
  });

  test('should handle multiple concurrent transactions', async () => {
    const tx1 = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const tx2 = { to: 'charlie', amount: 2.0, from: 'alice', user: 'alice' };
    const tx3 = { to: 'dave', amount: 3.0, from: 'bob', user: 'bob' };
    
    const rawTxId1 = await workflow.submitTransaction('leader1', tx1);
    const rawTxId2 = await workflow.submitTransaction('leader1', tx2);
    const rawTxId3 = await workflow.submitTransaction('leader2', tx3);
    
    expect(rawTxId1).toBeDefined();
    expect(rawTxId2).toBeDefined();
    expect(rawTxId3).toBeDefined();
    expect(rawTxId1).not.toBe(rawTxId2);
    
    // Complete validations for all
    const tasks1 = workflow.getValidationTasks(rawTxId1);
    const tasks2 = workflow.getValidationTasks(rawTxId2);
    const tasks3 = workflow.getValidationTasks(rawTxId3);
    
    for (const task of tasks1) {
      await workflow.completeValidation(rawTxId1, task.task);
    }
    for (const task of tasks2) {
      await workflow.completeValidation(rawTxId2, task.task);
    }
    for (const task of tasks3) {
      await workflow.completeValidation(rawTxId3, task.task);
    }
    
    expect(workflow.isInProcessing(rawTxId1)).toBe(true);
    expect(workflow.isInProcessing(rawTxId2)).toBe(true);
    expect(workflow.isInProcessing(rawTxId3)).toBe(true);
  });

  test('should handle invalid task completion gracefully', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    // Try to complete non-existent task
    await workflow.completeValidation(rawTxId, 'nonexistent:task');
    
    // Should not throw and should not move to processing
    expect(workflow.isInProcessing(rawTxId)).toBe(false);
  });

  test('should handle transaction with array of UTXOs', async () => {
    const tx = {
      to: 'bob',
      amount: 1.0,
      from: ['utxo1', 'utxo2', 'utxo3'],
      user: 'alice'
    };
    
    await workflow.submitTransaction('leader1', tx);
    expect(workflow.mempool.lockedUtxo.has('utxo1')).toBe(true);
    expect(workflow.mempool.lockedUtxo.has('utxo2')).toBe(true);
    expect(workflow.mempool.lockedUtxo.has('utxo3')).toBe(true);
  });

  test('should handle transaction with single UTXO string', async () => {
    const tx = {
      to: 'bob',
      amount: 1.0,
      from: 'utxo1',
      user: 'alice'
    };
    
    await workflow.submitTransaction('leader1', tx);
    expect(workflow.mempool.lockedUtxo.has('utxo1')).toBe(true);
  });

  test('should handle transaction with no UTXOs', async () => {
    const tx = {
      to: 'bob',
      amount: 1.0,
      user: 'alice'
    };
    
    await workflow.submitTransaction('leader1', tx);
    // Should not throw
    expect(workflow.mempool.lockedUtxo.size).toBe(0);
  });

  test('should track validation timestamps correctly', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    const tasks = workflow.getValidationTasks(rawTxId);
    
    const timestamp1 = 1000;
    const timestamp2 = 2000;
    const timestamp3 = 3000;
    
    await workflow.completeValidation(rawTxId, tasks[0].task, timestamp1);
    await workflow.completeValidation(rawTxId, tasks[1].task, timestamp2);
    
    const rawTx = workflow._getRawTransaction(rawTxId);
    expect(rawTx.validationTimestamps).toContain(timestamp1);
    expect(rawTx.validationTimestamps).toContain(timestamp2);
    expect(rawTx.validationTimestamps.length).toBe(2);
    
    await workflow.completeValidation(rawTxId, tasks[2].task, timestamp3);
    // Should have moved to processing, so rawTx should be removed
    expect(workflow._getRawTransaction(rawTxId)).toBeNull();
  });

  test('should use current timestamp when not provided', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    const tasks = workflow.getValidationTasks(rawTxId);
    
    const before = Date.now();
    await workflow.completeValidation(rawTxId, tasks[0].task);
    const after = Date.now();
    
    const rawTx = workflow._getRawTransaction(rawTxId);
    expect(rawTx.validationTimestamps[0]).toBeGreaterThanOrEqual(before);
    expect(rawTx.validationTimestamps[0]).toBeLessThanOrEqual(after);
  });
});
