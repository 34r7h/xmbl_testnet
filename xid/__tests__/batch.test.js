import { describe, test, expect } from '@jest/globals';
import { batchSign, batchVerify } from '../src/batch.js';
import { Identity } from '../src/identity.js';

describe('Batch Operations', () => {
  test('should batch sign transactions', async () => {
    const identity = await Identity.create();
    const txs = [
      { to: 'bob', amount: 1.0 },
      { to: 'charlie', amount: 2.0 },
      { to: 'dave', amount: 3.0 }
    ];
    const signed = await batchSign(txs, identity);
    expect(signed.length).toBe(3);
    expect(signed[0]).toHaveProperty('sig');
    expect(signed[1]).toHaveProperty('sig');
    expect(signed[2]).toHaveProperty('sig');
  });

  test('should batch verify transactions', async () => {
    const identity = await Identity.create();
    const txs = [
      { to: 'bob', amount: 1.0 },
      { to: 'charlie', amount: 2.0 }
    ];
    const signed = await batchSign(txs, identity);
    const results = await batchVerify(signed, identity.publicKey);
    expect(results.length).toBe(2);
    expect(results.every(r => r === true)).toBe(true);
  });

  test('should detect invalid signatures in batch', async () => {
    const identity = await Identity.create();
    const txs = [
      { to: 'bob', amount: 1.0 },
      { to: 'charlie', amount: 2.0 }
    ];
    const signed = await batchSign(txs, identity);
    signed[1].amount = 999; // Modify one transaction
    const results = await batchVerify(signed, identity.publicKey);
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(false);
  });
});

