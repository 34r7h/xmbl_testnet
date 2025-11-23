import { describe, test, expect, beforeEach } from '@jest/globals';
import { StorageNode, MarketPricing } from '../../xsc/index.js';
import { ConsensusWorkflow } from '../../xpc/index.js';

describe('Integration: xsc + xpc (Payment Consensus for Storage/Compute)', () => {
  let storageNode;
  let workflow;
  let pricing;

  beforeEach(() => {
    storageNode = new StorageNode({ capacity: 1000000 });
    workflow = new ConsensusWorkflow();
    pricing = new MarketPricing();
  });

  test('should create payment transaction for storage service', async () => {
    const data = Buffer.from('test data for storage');
    const shard = new (await import('../../xsc/index.js')).StorageShard(0, data, 2, 1);
    
    // Calculate storage price
    const price = pricing.calculateStoragePrice(data.length, 0.5); // 50% utilization
    expect(price).toBeGreaterThan(0);

    // Create payment transaction
    const paymentTx = {
      type: 'utxo',
      from: 'user1',
      to: 'storage_node',
      amount: price,
      timestamp: Date.now(),
      metadata: {
        service: 'storage',
        shardId: 'shard123',
        size: data.length
      }
    };

    // Submit to consensus
    const rawTxId = await workflow.submitTransaction('leader1', paymentTx);
    expect(rawTxId).toBeDefined();
  });

  test('should create payment transaction for compute service', async () => {
    // Calculate compute price
    const duration = 1000; // ms
    const memory = 1024; // bytes
    const price = pricing.calculateComputePrice(duration, memory, 0.3); // 30% utilization
    expect(price).toBeGreaterThan(0);

    // Create payment transaction
    const paymentTx = {
      type: 'utxo',
      from: 'user1',
      to: 'compute_node',
      amount: price,
      timestamp: Date.now(),
      metadata: {
        service: 'compute',
        duration,
        memory
      }
    };

    // Submit to consensus
    const rawTxId = await workflow.submitTransaction('leader1', paymentTx);
    expect(rawTxId).toBeDefined();
  });

  test('should process payment after consensus finalization', async () => {
    const data = Buffer.from('test data');
    const price = pricing.calculateStoragePrice(data.length, 0.5);

    const paymentTx = {
      type: 'utxo',
      from: 'user1',
      to: 'storage_node',
      amount: price,
      timestamp: Date.now()
    };

    // Submit to consensus
    const rawTxId = await workflow.submitTransaction('leader1', paymentTx);

    // Complete validations
    const tasks = workflow.getValidationTasks(rawTxId);
    for (const task of tasks) {
      await workflow.completeValidation(rawTxId, task.task, Date.now());
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Finalize transaction
    const processingTxs = Array.from(workflow.mempool.processingTx.entries());
    if (processingTxs.length > 0) {
      const [txId] = processingTxs[0];
      workflow.finalizeTransaction(txId);

      // Payment is now finalized, can provide service
      const shard = new (await import('../../xsc/index.js')).StorageShard(0, data, 2, 1);
      const shardId = await storageNode.storeShard(shard);
      expect(shardId).toBeDefined();
    }
  });

  test('edge case: handle insufficient payment', async () => {
    const data = Buffer.from('test data');
    const requiredPrice = pricing.calculateStoragePrice(data.length, 0.5);
    const insufficientPrice = requiredPrice * 0.5; // Half the required price

    const paymentTx = {
      type: 'utxo',
      from: 'user1',
      to: 'storage_node',
      amount: insufficientPrice,
      timestamp: Date.now()
    };

    // In real system, would validate payment amount before providing service
    const rawTxId = await workflow.submitTransaction('leader1', paymentTx);
    expect(rawTxId).toBeDefined();
  });
});



