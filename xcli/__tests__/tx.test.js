import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Identity } from '../../xid/src/identity.js';
import { KeyManager } from '../../xid/src/key-manager.js';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const testKeyDir = './test-keys';

describe('Transaction Commands', () => {
  beforeAll(async () => {
    // Create test identity for signing tests
    await fs.mkdir(testKeyDir, { recursive: true });
    const identity = await Identity.create();
    const keyManager = new KeyManager(testKeyDir);
    await keyManager.saveIdentity('test', identity);
  });

  afterAll(async () => {
    // Cleanup test keys
    try {
      await fs.rm(testKeyDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should create transaction', async () => {
    const { stdout } = await execAsync(
      'node index.js tx create --to bob --amount 1.0'
    );
    const tx = JSON.parse(stdout.trim());
    expect(tx).toHaveProperty('to');
    expect(tx).toHaveProperty('amount');
    expect(tx.to).toBe('bob');
    expect(tx.amount).toBe(1.0);
  });

  test('should create transaction with all options', async () => {
    const { stdout } = await execAsync(
      'node index.js tx create --to bob --amount 1.0 --fee 0.2 --stake 0.3 --type utxo --from alice'
    );
    const tx = JSON.parse(stdout.trim());
    expect(tx.to).toBe('bob');
    expect(tx.amount).toBe(1.0);
    expect(tx.fee).toBe(0.2);
    expect(tx.stake).toBe(0.3);
    expect(tx.type).toBe('utxo');
    expect(tx.from).toBe('alice');
  });

  test('should sign transaction with identity', async () => {
    const tx = { to: 'bob', amount: 1.0, type: 'utxo' };
    const { stdout } = await execAsync(
      `node index.js tx sign --tx '${JSON.stringify(tx)}' --key test --key-dir ${testKeyDir}`
    );
    const signed = JSON.parse(stdout.trim());
    expect(signed).toHaveProperty('sig');
    expect(signed.sig).toBeTruthy();
    expect(signed.to).toBe('bob');
    expect(signed.amount).toBe(1.0);
  });

  test('should submit transaction to consensus workflow', async () => {
    // First create and sign a transaction
    const tx = { to: 'bob', amount: 1.0, type: 'utxo', from: 'alice' };
    const { stdout: signOutput } = await execAsync(
      `node index.js tx sign --tx '${JSON.stringify(tx)}' --key test --key-dir ${testKeyDir}`
    );
    const signed = JSON.parse(signOutput.trim());
    
    // Submit to consensus
    const { stdout: submitOutput } = await execAsync(
      `node index.js tx submit --tx '${JSON.stringify(signed)}' --leader leader1`
    );
    expect(submitOutput).toContain('Transaction submitted');
    expect(submitOutput).toMatch(/raw_tx_id:/);
  });
});

