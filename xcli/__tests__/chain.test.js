import { describe, test, expect, afterEach } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

describe('Chain Commands', () => {
  const testDataDir = './test-chain-data';
  
  afterEach(async () => {
    // Cleanup: stop chain if running
    try {
      await execAsync('node index.js chain stop --clean');
    } catch (e) {
      // Ignore if not running
    }
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should start local chain', async () => {
    const { stdout } = await execAsync(
      `node index.js chain start --port 8550 --data-dir ${testDataDir} --nodes 1`
    );
    expect(stdout).toContain('Local chain started');
    expect(stdout).toMatch(/RPC: http:\/\/localhost:\d+/);
  }, 10000);

  test('should list test accounts', async () => {
    // Start chain first
    await execAsync(
      `node index.js chain start --port 8551 --data-dir ${testDataDir} --nodes 1`
    );
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { stdout } = await execAsync('node index.js chain accounts');
    const accounts = JSON.parse(stdout.trim());
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]).toHaveProperty('name');
    expect(accounts[0]).toHaveProperty('address');
    expect(accounts[0]).toHaveProperty('balance');
  }, 15000);

  test('should show account details', async () => {
    // Start chain first
    await execAsync(
      `node index.js chain start --port 8552 --data-dir ${testDataDir} --nodes 1`
    );
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { stdout } = await execAsync('node index.js chain account alice');
    const account = JSON.parse(stdout.trim());
    expect(account).toHaveProperty('name');
    expect(account).toHaveProperty('address');
    expect(account).toHaveProperty('balance');
    expect(account.name).toBe('alice');
  }, 15000);

  test('should show account balance', async () => {
    // Start chain first
    await execAsync(
      `node index.js chain start --port 8553 --data-dir ${testDataDir} --nodes 1`
    );
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { stdout } = await execAsync('node index.js chain balance alice');
    const balance = JSON.parse(stdout.trim());
    expect(balance).toHaveProperty('address');
    expect(balance).toHaveProperty('balance');
    expect(parseFloat(balance.balance)).toBeGreaterThan(0);
  }, 15000);

  test('should show chain status', async () => {
    // Start chain first
    await execAsync(
      `node index.js chain start --port 8554 --data-dir ${testDataDir} --nodes 1`
    );
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { stdout } = await execAsync('node index.js chain status');
    const status = JSON.parse(stdout.trim());
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('nodes');
    expect(status).toHaveProperty('accounts');
    expect(status.running).toBe(true);
  }, 15000);

  test('should stop local chain', async () => {
    // Start chain first
    await execAsync(
      `node index.js chain start --port 8555 --data-dir ${testDataDir} --nodes 1`
    );
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { stdout } = await execAsync('node index.js chain stop');
    expect(stdout).toContain('Local chain stopped');
  }, 15000);
});

