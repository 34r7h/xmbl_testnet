import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { KeyManager } from '../src/key-manager.js';
import { Identity } from '../src/identity.js';
import fs from 'fs';
import path from 'path';

describe('KeyManager', () => {
  const testDir = './test-keys';
  let keyManager;

  beforeEach(() => {
    keyManager = new KeyManager(testDir);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should save identity', async () => {
    const identity = await Identity.create();
    await keyManager.saveIdentity('alice', identity);
    expect(fs.existsSync(path.join(testDir, 'alice.key'))).toBe(true);
  });

  test('should load identity', async () => {
    const identity = await Identity.create();
    await keyManager.saveIdentity('alice', identity);
    const loaded = await keyManager.loadIdentity('alice');
    expect(loaded.address).toBe(identity.address);
    expect(loaded.publicKey).toBe(identity.publicKey);
  });

  test('should list identities', async () => {
    await keyManager.saveIdentity('alice', await Identity.create());
    await keyManager.saveIdentity('bob', await Identity.create());
    const identities = await keyManager.listIdentities();
    expect(identities).toContain('alice');
    expect(identities).toContain('bob');
  });

  test('should save and load encrypted identity', async () => {
    const identity = await Identity.create();
    const password = 'test-password';
    await keyManager.saveIdentity('alice', identity, password);
    const loaded = await keyManager.loadIdentity('alice', password);
    expect(loaded.address).toBe(identity.address);
  });

  test('should reject wrong password for encrypted identity', async () => {
    const identity = await Identity.create();
    const password = 'test-password';
    await keyManager.saveIdentity('alice', identity, password);
    
    await expect(keyManager.loadIdentity('alice', 'wrong-password')).rejects.toThrow();
  });

  test('should throw error when loading non-existent identity', async () => {
    await expect(keyManager.loadIdentity('nonexistent')).rejects.toThrow();
  });

  test('should handle key directory creation errors', async () => {
    // Test with invalid path (on Unix-like systems, root is read-only)
    // Use a path that might fail on some systems
    const invalidKeyManager = new KeyManager('/root/cannot/create/here');
    const identity = await Identity.create();
    
    // Should handle error gracefully
    await expect(invalidKeyManager.saveIdentity('test', identity)).rejects.toThrow();
  });

  test('should handle listIdentities when directory does not exist', async () => {
    const emptyKeyManager = new KeyManager('./non-existent-dir');
    const identities = await emptyKeyManager.listIdentities();
    expect(Array.isArray(identities)).toBe(true);
    expect(identities.length).toBe(0);
  });

  test('should use default key directory when not specified', async () => {
    // Test default parameter (line 7)
    const defaultKeyManager = new KeyManager();
    expect(defaultKeyManager.keyDir).toBe('./keys');
    
    // Clean up if directory was created
    try {
      if (fs.existsSync('./keys')) {
        const files = await fs.readdir('./keys');
        if (files.length === 0) {
          await fs.rmdir('./keys');
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });
});

