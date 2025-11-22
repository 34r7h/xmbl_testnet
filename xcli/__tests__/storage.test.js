import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const testDataDir = './test-storage-data';

describe('Storage Commands', () => {
  let testFile;

  beforeAll(async () => {
    await fs.mkdir(testDataDir, { recursive: true });
    testFile = path.join(testDataDir, 'test.txt');
    await fs.writeFile(testFile, 'test data content');
  });

  afterAll(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (e) {}
  });

  test('should store data with sharding', async () => {
    const { stdout } = await execAsync(
      `node index.js storage store --data ${testFile} --shards 2 --parity 1`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('shardIds');
    expect(result).toHaveProperty('shards');
    expect(result).toHaveProperty('parity');
    expect(Array.isArray(result.shardIds)).toBe(true);
    expect(result.shards).toBe(2);
    expect(result.parity).toBe(1);
  });

  test('should show storage node status', async () => {
    const { stdout } = await execAsync('node index.js storage node status');
    const status = JSON.parse(stdout.trim());
    expect(status).toHaveProperty('capacity');
    expect(status).toHaveProperty('used');
    expect(status).toHaveProperty('available');
    expect(typeof status.capacity).toBe('number');
  });

  test('should calculate storage pricing', async () => {
    const { stdout } = await execAsync(
      'node index.js storage pricing storage --size 1024 --utilization 0.7'
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('utilization');
    expect(result.size).toBe('1024');
    expect(result.utilization).toBe('0.7');
  });
});

