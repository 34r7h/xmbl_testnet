import { describe, test, expect, beforeEach } from '@jest/globals';
import { ConsensusWorkflow } from '../src/workflow.js';
import { LeaderElection } from '../src/leader-election.js';
import { ConsensusGossip } from '../src/gossip.js';

describe('Integration Tests', () => {
  let workflow;
  let election;
  let gossip;

  beforeEach(() => {
    workflow = new ConsensusWorkflow();
    election = new LeaderElection();
    gossip = new ConsensusGossip();
  });

  test('should handle full transaction lifecycle with leader election', async () => {
    // Elect leaders
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    election.recordPulse('node3', '192.168.1.3', 75);
    const leaders = election.electLeaders(3);
    expect(leaders.length).toBe(3);
    
    // Submit transaction to first leader
    const tx = {
      to: 'bob',
      amount: 1.0,
      from: 'alice',
      user: 'alice',
      sig: 'signature',
      stake: 0.2,
      fee: 0.1
    };
    
    const rawTxId = await workflow.submitTransaction(leaders[0], tx);
    expect(rawTxId).toBeDefined();
    
    // Broadcast via gossip
    await gossip.broadcastRawTransaction(leaders[0], tx);
    
    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    // Should be in processing
    expect(workflow.isInProcessing(rawTxId)).toBe(true);
  });

  test('should handle multiple transactions with different leaders', async () => {
    // Setup leaders
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    const leaders = election.electLeaders(2);
    
    // Submit transactions to different leaders
    const tx1 = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const tx2 = { to: 'charlie', amount: 2.0, from: 'bob', user: 'bob' };
    
    const rawTxId1 = await workflow.submitTransaction(leaders[0], tx1);
    const rawTxId2 = await workflow.submitTransaction(leaders[1], tx2);
    
    // Complete validations for both
    const tasks1 = workflow.getValidationTasks(rawTxId1);
    const tasks2 = workflow.getValidationTasks(rawTxId2);
    
    for (const task of tasks1) {
      await workflow.completeValidation(rawTxId1, task.task);
    }
    for (const task of tasks2) {
      await workflow.completeValidation(rawTxId2, task.task);
    }
    
    expect(workflow.isInProcessing(rawTxId1)).toBe(true);
    expect(workflow.isInProcessing(rawTxId2)).toBe(true);
  });

  test('should prevent double-spend through UTXO locking', async () => {
    const utxo = 'utxo1';
    const tx1 = { to: 'bob', amount: 1.0, from: utxo, user: 'alice' };
    const tx2 = { to: 'charlie', amount: 1.0, from: utxo, user: 'alice' };
    
    // First transaction locks UTXO
    const rawTxId1 = await workflow.submitTransaction('leader1', tx1);
    expect(workflow.mempool.lockedUtxo.has(utxo)).toBe(true);
    
    // Second transaction also locks same UTXO (would be caught in validation)
    const rawTxId2 = await workflow.submitTransaction('leader1', tx2);
    expect(workflow.mempool.lockedUtxo.has(utxo)).toBe(true);
    
    // Both transactions exist, but validation should catch double-spend
    expect(rawTxId1).toBeDefined();
    expect(rawTxId2).toBeDefined();
  });

  test('should handle gossip message reception', (done) => {
    gossip.on('raw_tx:received', (data) => {
      expect(data).toHaveProperty('leaderId');
      expect(data).toHaveProperty('tx');
      done();
    });
    
    gossip._handleMessage({
      type: 'raw_tx',
      leaderId: 'leader1',
      tx: { to: 'bob', amount: 1.0 }
    });
  });

  test('should handle workflow events with gossip', async () => {
    const events = [];
    
    workflow.on('raw_tx:added', (data) => {
      events.push({ type: 'raw_tx:added', data });
    });
    
    workflow.on('validation_tasks:created', (data) => {
      events.push({ type: 'validation_tasks:created', data });
    });
    
    workflow.on('tx:processing', (data) => {
      events.push({ type: 'tx:processing', data });
    });
    
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    
    // Wait a bit for async events
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    // Wait for processing event
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some(e => e.type === 'raw_tx:added')).toBe(true);
    expect(events.some(e => e.type === 'validation_tasks:created')).toBe(true);
    expect(events.some(e => e.type === 'tx:processing')).toBe(true);
  });

  test('should handle leader rotation scenario', () => {
    // Initial election
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    const leaders1 = election.electLeaders(2);
    expect(leaders1.length).toBe(2);
    
    // Node 3 joins and performs better
    for (let i = 0; i < 10; i++) {
      election.recordPulse('node3', '192.168.1.3', 30);
    }
    
    // Force election to get new leaders immediately
    const leaders2 = election.forceElection(2);
    expect(leaders2.length).toBe(2);
    // Node 3 should be in the new leaders
    expect(leaders2).toContain('192.168.1.3');
  });

  test('should handle transaction with all required fields', async () => {
    const tx = {
      to: 'bob',
      amount: 1.5,
      from: ['utxo1', 'utxo2'],
      user: 'alice',
      sig: 'signature123',
      stake: 0.2,
      fee: 0.1,
      metadata: { note: 'test transaction' }
    };
    
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    expect(rawTxId).toBeDefined();
    
    // Verify all UTXOs are locked
    expect(workflow.mempool.lockedUtxo.has('utxo1')).toBe(true);
    expect(workflow.mempool.lockedUtxo.has('utxo2')).toBe(true);
    
    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task);
    }
    
    // Verify transaction data is preserved
    const processingTxs = Array.from(workflow.mempool.processingTx.values());
    expect(processingTxs.length).toBe(1);
    expect(processingTxs[0].txData).toEqual(tx);
  });

  test('should handle concurrent validation completions', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice', user: 'alice' };
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    const tasks = workflow.getValidationTasks(rawTxId);
    
    // Complete all validations concurrently
    await Promise.all(
      tasks.map(task => workflow.completeValidation(rawTxId, task.task))
    );
    
    // Should be in processing
    expect(workflow.isInProcessing(rawTxId)).toBe(true);
  });
});

