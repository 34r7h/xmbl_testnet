import { describe, test, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Query Commands', () => {
  test('should query account balance', async () => {
    const { stdout } = await execAsync(
      'node index.js query balance --address xmb123456789'
    );
    const balance = JSON.parse(stdout.trim());
    expect(balance).toHaveProperty('address');
    expect(balance).toHaveProperty('balance');
    expect(balance.address).toBe('xmb123456789');
    expect(typeof balance.balance).toBe('number');
  });

  test('should query transaction by ID', async () => {
    // First add a transaction to get an ID
    const tx = { type: 'utxo', to: 'bob', amount: 75, from: 'alice' };
    const txJson = JSON.stringify(tx);
    const { stdout: addOutput } = await execAsync(
      `TX='${txJson}' && node index.js ledger tx add --tx "$TX"`
    );
    const { blockId } = JSON.parse(addOutput.trim());
    
    // Query the transaction
    const { stdout: queryOutput } = await execAsync(
      `node index.js query tx --id ${blockId}`
    );
    const result = JSON.parse(queryOutput.trim());
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('status');
    expect(result.id).toBe(blockId);
  });

  test('should query ledger state', async () => {
    const { stdout } = await execAsync('node index.js query state');
    const state = JSON.parse(stdout.trim());
    expect(state).toHaveProperty('height');
    expect(state).toHaveProperty('cubes');
    expect(state).toHaveProperty('stateRoot');
    expect(typeof state.height).toBe('number');
    expect(typeof state.cubes).toBe('number');
  });
});

