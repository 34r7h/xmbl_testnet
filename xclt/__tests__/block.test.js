import { describe, test, expect } from '@jest/globals';
import { Block } from '../src/block.js';

describe('Block', () => {
  test('should create block from transaction', () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const block = Block.fromTransaction(tx);
    expect(block).toHaveProperty('id');
    expect(block).toHaveProperty('tx');
    expect(block).toHaveProperty('hash');
    expect(block).toHaveProperty('digitalRoot');
  });

  test('should calculate hash correctly', () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const block1 = Block.fromTransaction(tx);
    const block2 = Block.fromTransaction(tx);
    expect(block1.hash).toBe(block2.hash);
  });

  test('should serialize/deserialize', () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const block = Block.fromTransaction(tx);
    const serialized = block.serialize();
    const deserialized = Block.deserialize(serialized);
    expect(deserialized.id).toBe(block.id);
    expect(deserialized.tx).toEqual(block.tx);
  });

  test('should validate transaction type', () => {
    const tx = { to: 'bob', amount: 1.0 };
    expect(() => Block.fromTransaction(tx)).toThrow('Transaction must have a type field');
  });

  test('should validate required fields', () => {
    const tx = { type: 'utxo', to: 'bob' };
    expect(() => Block.fromTransaction(tx)).toThrow('Missing required field');
  });
});



