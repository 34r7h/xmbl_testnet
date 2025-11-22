import { describe, test, expect } from '@jest/globals';
import { Identity } from '../src/identity.js';

describe('Identity', () => {
  test('should create new identity', async () => {
    const identity = await Identity.create();
    expect(identity).toHaveProperty('address');
    expect(identity).toHaveProperty('publicKey');
    expect(identity).toHaveProperty('privateKey');
  });

  test('should generate deterministic address from public key', async () => {
    const identity1 = await Identity.create();
    const identity2 = Identity.fromPublicKey(identity1.publicKey);
    expect(identity2.address).toBe(identity1.address);
  });

  test('should sign transaction', async () => {
    const identity = await Identity.create();
    const tx = { to: 'bob', amount: 1.0, from: identity.address };
    const signed = await identity.signTransaction(tx);
    expect(signed).toHaveProperty('sig');
    expect(signed.to).toBe('bob');
    expect(signed.amount).toBe(1.0);
  });

  test('should verify transaction signature', async () => {
    const identity = await Identity.create();
    const tx = { to: 'bob', amount: 1.0, from: identity.address };
    const signed = await identity.signTransaction(tx);
    const isValid = await Identity.verifyTransaction(signed, identity.publicKey);
    expect(isValid).toBe(true);
  });

  test('should reject invalid transaction signature', async () => {
    const identity = await Identity.create();
    const tx = { to: 'bob', amount: 1.0, from: identity.address };
    const signed = await identity.signTransaction(tx);
    signed.amount = 2.0; // Modify transaction
    const isValid = await Identity.verifyTransaction(signed, identity.publicKey);
    expect(isValid).toBe(false);
  });

  test('should throw error when using fromPrivateKey (not implemented)', () => {
    expect(() => Identity.fromPrivateKey('private-key')).toThrow('Not implemented: derive public from private');
  });

  test('should handle transaction with existing sig field', async () => {
    const identity = await Identity.create();
    const tx = { to: 'bob', amount: 1.0, from: identity.address, sig: 'existing-sig' };
    const signed = await identity.signTransaction(tx);
    // Should replace existing sig
    expect(signed.sig).not.toBe('existing-sig');
    expect(signed.sig).toBeDefined();
    expect(signed.sig.length).toBeGreaterThan(0);
  });

  test('should handle browser environment for base64 decoding', async () => {
    // Mock browser environment (no Buffer)
    const originalBuffer = global.Buffer;
    delete global.Buffer;
    
    try {
      const identity = await Identity.create();
      // Should use atob fallback
      expect(identity.address).toBeDefined();
      expect(identity.publicKey).toBeDefined();
      
      // Test that base64 operations work
      const tx = { to: 'bob', amount: 1.0, from: identity.address };
      const signed = await identity.signTransaction(tx);
      expect(signed.sig).toBeDefined();
    } finally {
      // Restore Buffer
      global.Buffer = originalBuffer;
    }
  });
});

