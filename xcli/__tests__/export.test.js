import { describe, test, expect, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const testOutputDir = './test-export-output';

describe('Export Commands', () => {
  afterAll(async () => {
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (e) {}
  });

  test('should export transactions to JSON', async () => {
    const outputFile = path.join(testOutputDir, 'tx-export.json');
    await fs.mkdir(testOutputDir, { recursive: true });
    
    const { stdout } = await execAsync(
      `node index.js export tx --format json --output ${outputFile} --limit 10`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('exported');
    expect(result).toHaveProperty('format');
    expect(result).toHaveProperty('file');
    expect(result.format).toBe('json');
    
    // Verify file exists and is valid JSON
    const fileContent = await fs.readFile(outputFile, 'utf8');
    const data = JSON.parse(fileContent);
    expect(Array.isArray(data)).toBe(true);
  });

  test('should export transactions to CSV', async () => {
    const outputFile = path.join(testOutputDir, 'tx-export.csv');
    await fs.mkdir(testOutputDir, { recursive: true });
    
    const { stdout } = await execAsync(
      `node index.js export tx --format csv --output ${outputFile} --limit 10`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('exported');
    expect(result).toHaveProperty('format');
    expect(result.format).toBe('csv');
    
    // Verify file exists
    const fileContent = await fs.readFile(outputFile, 'utf8');
    expect(fileContent).toContain('id,type,from,to,amount,timestamp');
  });

  test('should export state data', async () => {
    // First set some state
    await execAsync('node index.js state set exporttest --value \'"exportvalue"\'');
    
    const outputFile = path.join(testOutputDir, 'state-export.json');
    await fs.mkdir(testOutputDir, { recursive: true });
    
    const { stdout } = await execAsync(
      `node index.js export state --format json --output ${outputFile}`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('exported');
    expect(result).toHaveProperty('format');
    expect(result.format).toBe('json');
    
    // Verify file exists and is valid JSON
    const fileContent = await fs.readFile(outputFile, 'utf8');
    const data = JSON.parse(fileContent);
    expect(data).toHaveProperty('stateRoot');
  });
});

