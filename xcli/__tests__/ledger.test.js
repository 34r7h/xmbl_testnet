import { describe, test, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Ledger Commands', () => {
  test('should add transaction to ledger', async () => {
    const tx = { type: 'utxo', to: 'bob', amount: 100, from: 'alice' };
    const txJson = JSON.stringify(tx);
    const { stdout } = await execAsync(
      `TX='${txJson}' && node index.js ledger tx add --tx "$TX"`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('blockId');
  });

  test('should get ledger state root', async () => {
    const { stdout } = await execAsync('node index.js ledger state root');
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('stateRoot');
    expect(typeof result.stateRoot).toBe('string');
  });

  test('should list cubes', async () => {
    const { stdout } = await execAsync('node index.js ledger cube list');
    const cubes = JSON.parse(stdout.trim());
    expect(Array.isArray(cubes)).toBe(true);
  });

  test('should get block by ID', async () => {
    // First add a transaction to get a block ID
    const tx = { type: 'utxo', to: 'bob', amount: 50, from: 'alice' };
    const txJson = JSON.stringify(tx);
    const { stdout: addOutput } = await execAsync(
      `TX='${txJson}' && node index.js ledger tx add --tx "$TX"`
    );
    const { blockId } = JSON.parse(addOutput.trim());
    
    // Get the block
    const { stdout: blockOutput } = await execAsync(
      `node index.js ledger block get ${blockId}`
    );
    const block = JSON.parse(blockOutput.trim());
    expect(block).toHaveProperty('id');
    expect(block.id).toBe(blockId);
  });
});

