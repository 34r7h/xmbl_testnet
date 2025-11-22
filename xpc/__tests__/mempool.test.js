import { describe, test, expect, beforeEach } from '@jest/globals';
import { Mempool } from '../src/mempool.js';

describe('Mempool', () => {
  let mempool;

  beforeEach(() => {
    mempool = new Mempool();
  });

  test('should create mempool with all stages', () => {
    expect(mempool.rawTx).toBeDefined();
    expect(mempool.validationTasks).toBeDefined();
    expect(mempool.lockedUtxo).toBeDefined();
    expect(mempool.processingTx).toBeDefined();
    expect(mempool.tx).toBeDefined();
  });

  test('should add transaction to raw_tx_mempool', () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    const txId = mempool.addRawTransaction('leader1', tx);
    expect(txId).toBeDefined();
    expect(mempool.rawTx.has('leader1')).toBe(true);
    const leaderMempool = mempool.rawTx.get('leader1');
    expect(leaderMempool.has(txId)).toBe(true);
    const rawTx = leaderMempool.get(txId);
    expect(rawTx.txData).toEqual(tx);
    expect(rawTx.validationTimestamps).toEqual([]);
    expect(rawTx.validationTasks).toEqual([]);
    expect(rawTx.txTimestamp).toBeDefined();
  });

  test('should prevent duplicate transactions in same leader', () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    const txId1 = mempool.addRawTransaction('leader1', tx);
    const txId2 = mempool.addRawTransaction('leader1', tx);
    expect(txId1).toBe(txId2);
    const leaderMempool = mempool.rawTx.get('leader1');
    expect(leaderMempool.size).toBe(1);
  });

  test('should allow same transaction for different leaders', () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    const txId1 = mempool.addRawTransaction('leader1', tx);
    const txId2 = mempool.addRawTransaction('leader2', tx);
    expect(txId1).toBe(txId2); // Same hash
    expect(mempool.rawTx.has('leader1')).toBe(true);
    expect(mempool.rawTx.has('leader2')).toBe(true);
  });

  test('should emit raw_tx:added event', (done) => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    mempool.once('raw_tx:added', (data) => {
      expect(data).toHaveProperty('leaderId', 'leader1');
      expect(data).toHaveProperty('rawTxId');
      expect(data).toHaveProperty('txData', tx);
      done();
    });
    mempool.addRawTransaction('leader1', tx);
  });

  test('should lock UTXOs', () => {
    const utxos = ['utxo1', 'utxo2'];
    mempool.lockUtxos(utxos);
    expect(mempool.lockedUtxo.has('utxo1')).toBe(true);
    expect(mempool.lockedUtxo.has('utxo2')).toBe(true);
  });

  test('should emit utxo:locked event', (done) => {
    const utxos = ['utxo1', 'utxo2'];
    mempool.once('utxo:locked', (lockedUtxos) => {
      expect(lockedUtxos).toEqual(utxos);
      done();
    });
    mempool.lockUtxos(utxos);
  });

  test('should unlock UTXOs', () => {
    mempool.lockUtxos(['utxo1']);
    mempool.unlockUtxos(['utxo1']);
    expect(mempool.lockedUtxo.has('utxo1')).toBe(false);
  });

  test('should emit utxo:unlocked event', (done) => {
    const utxos = ['utxo1'];
    mempool.lockUtxos(utxos);
    mempool.once('utxo:unlocked', (unlockedUtxos) => {
      expect(unlockedUtxos).toEqual(utxos);
      done();
    });
    mempool.unlockUtxos(utxos);
  });

  test('should handle multiple UTXO locks', () => {
    mempool.lockUtxos(['utxo1']);
    mempool.lockUtxos(['utxo2', 'utxo3']);
    expect(mempool.lockedUtxo.size).toBe(3);
    expect(mempool.lockedUtxo.has('utxo1')).toBe(true);
    expect(mempool.lockedUtxo.has('utxo2')).toBe(true);
    expect(mempool.lockedUtxo.has('utxo3')).toBe(true);
  });

  test('should prevent double-spend by checking locked UTXOs', () => {
    const utxo = 'utxo1';
    mempool.lockUtxos([utxo]);
    expect(mempool.lockedUtxo.has(utxo)).toBe(true);
    // Attempting to use same UTXO should be prevented (checked by workflow)
  });

  test('should handle empty UTXO arrays', () => {
    expect(() => mempool.lockUtxos([])).not.toThrow();
    expect(() => mempool.unlockUtxos([])).not.toThrow();
  });

  test('should maintain transaction data integrity', () => {
    const complexTx = {
      to: 'bob',
      amount: 1.5,
      from: 'alice',
      fee: 0.1,
      stake: 0.2,
      metadata: { note: 'test' }
    };
    const txId = mempool.addRawTransaction('leader1', complexTx);
    const leaderMempool = mempool.rawTx.get('leader1');
    const rawTx = leaderMempool.get(txId);
    expect(rawTx.txData).toEqual(complexTx);
  });

  test('should handle concurrent transactions from multiple leaders', () => {
    const tx1 = { to: 'bob', amount: 1.0, from: 'alice' };
    const tx2 = { to: 'charlie', amount: 2.0, from: 'alice' };
    const tx3 = { to: 'dave', amount: 3.0, from: 'bob' };
    
    mempool.addRawTransaction('leader1', tx1);
    mempool.addRawTransaction('leader2', tx2);
    mempool.addRawTransaction('leader1', tx3);
    
    expect(mempool.rawTx.get('leader1').size).toBe(2);
    expect(mempool.rawTx.get('leader2').size).toBe(1);
  });

  test('should generate consistent transaction IDs', () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    const txId1 = mempool.addRawTransaction('leader1', tx);
    const txId2 = mempool.addRawTransaction('leader1', tx);
    expect(txId1).toBe(txId2);
  });

  test('should generate different IDs for different transactions', () => {
    const tx1 = { to: 'bob', amount: 1.0, from: 'alice' };
    const tx2 = { to: 'bob', amount: 1.1, from: 'alice' };
    const txId1 = mempool.addRawTransaction('leader1', tx1);
    const txId2 = mempool.addRawTransaction('leader1', tx2);
    expect(txId1).not.toBe(txId2);
  });
});
