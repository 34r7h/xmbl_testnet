import { describe, test, expect } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Consensus Commands', () => {
  test('should submit transaction to mempool', async () => {
    const tx = { type: 'utxo', to: 'bob', amount: 100 };
    const { stdout } = await execAsync(
      `node index.js consensus submit --tx '${JSON.stringify(tx)}' --leader leader1`
    );
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('rawTxId');
    expect(result.rawTxId).toBeTruthy();
  });

  test('should get mempool statistics', async () => {
    const { stdout } = await execAsync('node index.js consensus stats mempool');
    const stats = JSON.parse(stdout.trim());
    expect(stats).toHaveProperty('rawTx');
    expect(stats).toHaveProperty('processing');
    expect(stats).toHaveProperty('finalized');
    expect(stats).toHaveProperty('lockedUtxos');
    expect(typeof stats.rawTx).toBe('number');
  });

  test('should list raw transactions', async () => {
    const { stdout } = await execAsync('node index.js consensus raw-tx list');
    const txs = JSON.parse(stdout.trim());
    expect(Array.isArray(txs)).toBe(true);
  });

  test('should elect leaders', async () => {
    const { stdout } = await execAsync('node index.js consensus leader elect --count 3');
    const result = JSON.parse(stdout.trim());
    expect(result).toHaveProperty('leaders');
    expect(Array.isArray(result.leaders)).toBe(true);
  });
});

