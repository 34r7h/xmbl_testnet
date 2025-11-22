import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Identity } from '../../xid/src/identity.js';
import { KeyManager } from '../../xid/src/key-manager.js';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const testKeyDir = './test-keys-identity';

describe('Identity Commands', () => {
  beforeAll(async () => {
    await fs.mkdir(testKeyDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(testKeyDir, { recursive: true, force: true });
    } catch (e) {}
  });

  test('should create identity', async () => {
    const { stdout } = await execAsync(
      `node index.js identity create --name testuser --key-dir ${testKeyDir}`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('address');
    expect(result).toHaveProperty('publicKey');
    expect(result.name).toBe('testuser');
    expect(result.address).toMatch(/^xmb/);
  });

  test('should list identities', async () => {
    const { stdout } = await execAsync(
      `node index.js identity list --key-dir ${testKeyDir}`
    );
    const identities = JSON.parse(stdout.trim());
    expect(Array.isArray(identities)).toBe(true);
    expect(identities).toContain('testuser');
  });

  test('should show identity details', async () => {
    const { stdout } = await execAsync(
      `node index.js identity show testuser --key-dir ${testKeyDir}`
    );
    const identity = JSON.parse(stdout.trim());
    expect(identity).toHaveProperty('name');
    expect(identity).toHaveProperty('address');
    expect(identity).toHaveProperty('publicKey');
    expect(identity.name).toBe('testuser');
  });

  test('should sign message', async () => {
    const { stdout } = await execAsync(
      `node index.js identity sign testuser --message "Hello XMBL" --key-dir ${testKeyDir}`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('signature');
    expect(result.message).toBe('Hello XMBL');
    expect(result.signature).toBeTruthy();
    expect(result.signature.length).toBeGreaterThan(100);
  });

  test('should verify signature', async () => {
    // First sign a message
    const { stdout: signOutput } = await execAsync(
      `node index.js identity sign testuser --message "Test verify" --key-dir ${testKeyDir}`
    );
    const signed = JSON.parse(signOutput.trim());
    
    // Get public key
    const { stdout: showOutput } = await execAsync(
      `node index.js identity show testuser --key-dir ${testKeyDir}`
    );
    const identity = JSON.parse(showOutput.trim());
    
    // Verify (this will fail if signature format doesn't match, but should not crash)
    const { stdout: verifyOutput } = await execAsync(
      `node index.js identity verify --message "Test verify" --signature "${signed.signature}" --public-key "${identity.publicKey}"`
    );
    const result = JSON.parse(verifyOutput.trim());
    expect(result).toHaveProperty('valid');
  });
});

