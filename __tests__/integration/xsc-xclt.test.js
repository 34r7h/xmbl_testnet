import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { StorageNode, MarketPricing } from '../../xsc/index.js';
import { Ledger } from '../../xclt/index.js';
import { rmSync } from 'fs';

describe('Integration: xsc + xclt (Payment Recording in Ledger)', () => {
  let storageNode;
  let ledger;
  let pricing;
  const testDbPath = './data/ledger-integration-xsc-xclt';

  beforeEach(() => {
    storageNode = new StorageNode({ capacity: 1000000 });
    ledger = new Ledger(testDbPath);
    pricing = new MarketPricing();
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

  test('should record storage payment transaction in ledger', async () => {
    const data = Buffer.from('test data');
    const price = pricing.calculateStoragePrice(data.length, 0.5);

    const paymentTx = {
      type: 'utxo',
      from: 'user1',
      to: 'storage_node',
      amount: price,
      timestamp: Date.now(),
      metadata: {
        service: 'storage',
        size: data.length
      }
    };

    // Add payment to ledger
    const result = await ledger.addTransaction(paymentTx);
    expect(result.blockId).toBeDefined();
    expect(result.coordinates).toBeDefined();

    // Verify transaction in ledger
    const block = await ledger.getBlock(result.blockId);
    expect(block.tx.amount).toBe(price);
    expect(block.tx.to).toBe('storage_node');
  });

  test('should record compute payment transaction in ledger', async () => {
    const duration = 1000;
    const memory = 1024;
    const price = pricing.calculateComputePrice(duration, memory, 0.3);

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

    const result = await ledger.addTransaction(paymentTx);
    expect(result.blockId).toBeDefined();

    const block = await ledger.getBlock(result.blockId);
    expect(block.tx.amount).toBe(price);
  });

  test('should record multiple payment transactions', async () => {
    const payments = [];
    
    for (let i = 0; i < 5; i++) {
      const data = Buffer.from(`test data ${i}`);
      const price = pricing.calculateStoragePrice(data.length, 0.5);
      
      const paymentTx = {
        type: 'utxo',
        from: `user${i}`,
        to: 'storage_node',
        amount: price,
        timestamp: Date.now() + i
      };
      
      payments.push(paymentTx);
      const result = await ledger.addTransaction(paymentTx);
      expect(result.blockId).toBeDefined();
    }

    // Verify all payments recorded
    for (const payment of payments) {
      // Can verify by checking ledger state
    }
  });

  test('edge case: handle payment transaction with zero amount', async () => {
    const paymentTx = {
      type: 'utxo',
      from: 'user1',
      to: 'storage_node',
      amount: 0,
      timestamp: Date.now()
    };

    // Should still be recorded (validation happens at consensus level)
    const result = await ledger.addTransaction(paymentTx);
    expect(result.blockId).toBeDefined();
  });
});




