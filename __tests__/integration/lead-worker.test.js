import { describe, it, expect } from '@jest/globals';
import { EventEmitter } from 'events';
import { LeadWorker } from '../../core/lead-worker.js';
import { Ledger } from '../../xclt/index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

function makeFakeWorkflow() {
  const emitter = new EventEmitter();
  emitter.finalizeTransaction = async (txId) => { emitter.finalizedIds.push(txId); return true; };
  emitter.finalizedIds = [];
  return emitter;
}

function makeTx(i) {
  return { type: 'utxo', from: `alice_${i}`, to: `bob_${i}`, amount: i + 1 };
}

describe('LeadWorker (E4)', () => {
  it('constructor requires xclt', () => {
    expect(() => new LeadWorker({})).toThrow();
  });

  it('pools fewer than 9 finalized txs without sealing a face', async () => {
    const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
    const xclt = new Ledger({ dbPath });
    let sealedCount = 0;
    const worker = new LeadWorker({ xclt, onBatchSealed: (n) => { sealedCount += n; } });

    for (let i = 0; i < 8; i++) {
      const result = await worker.handleFinalizedTx(makeTx(i));
      expect(result.sealedFaces).toBe(0);
    }
    expect(sealedCount).toBe(0);
    expect(xclt._membershipPool.length).toBe(8);
  });

  it('seals exactly one face on the 9th finalized tx and reports it via onBatchSealed', async () => {
    const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
    const xclt = new Ledger({ dbPath });
    let sealedCount = 0;
    const worker = new LeadWorker({ xclt, onBatchSealed: (n) => { sealedCount += n; } });

    for (let i = 0; i < 8; i++) {
      await worker.handleFinalizedTx(makeTx(i));
    }
    const ninth = await worker.handleFinalizedTx(makeTx(8));

    expect(ninth.sealedFaces).toBe(1);
    expect(ninth.pooled).toBe(0);
    expect(sealedCount).toBe(1);
    expect(xclt._membershipPool.length).toBe(0);
    expect(xclt.cubes.size + xclt.pendingFaces.size).toBeGreaterThan(0);
  });

  it('does not call onBatchSealed when no face was sealed', async () => {
    const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
    const xclt = new Ledger({ dbPath });
    let calls = 0;
    const worker = new LeadWorker({ xclt, onBatchSealed: () => { calls += 1; } });

    await worker.handleFinalizedTx(makeTx(0));
    expect(calls).toBe(0);
  });

  it('works without an onBatchSealed callback (optional)', async () => {
    const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
    const xclt = new Ledger({ dbPath });
    const worker = new LeadWorker({ xclt });
    await expect(worker.handleFinalizedTx(makeTx(0))).resolves.toBeDefined();
  });

  it('sealing produces byte-identical geometry regardless of arrival order (D3a determinism, exercised through the E4 worker)', async () => {
    const txs = Array.from({ length: 9 }, (_, i) => makeTx(i));
    const order2 = [...txs].reverse();

    const dbPathA = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-a-'));
    const dbPathB = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-b-'));
    const xcltA = new Ledger({ dbPath: dbPathA });
    const xcltB = new Ledger({ dbPath: dbPathB });
    const workerA = new LeadWorker({ xclt: xcltA });
    const workerB = new LeadWorker({ xclt: xcltB });

    for (const tx of txs) await workerA.handleFinalizedTx(tx);
    for (const tx of order2) await workerB.handleFinalizedTx(tx);

    const cubeA = Array.from(xcltA.cubes.values())[0];
    const cubeB = Array.from(xcltB.cubes.values())[0];
    expect(cubeA).toBeDefined();
    expect(cubeB).toBeDefined();
    expect(cubeA.getMerkleRoot ? cubeA.getMerkleRoot() : cubeA.merkleRoot)
      .toEqual(cubeB.getMerkleRoot ? cubeB.getMerkleRoot() : cubeB.merkleRoot);
  });

  describe('tx:processing -> finalizeTransaction (the other half of the lead role)', () => {
    it('start() attaches a tx:processing listener that calls workflow.finalizeTransaction', async () => {
      const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
      const xclt = new Ledger({ dbPath });
      const worker = new LeadWorker({ xclt });
      const workflow = makeFakeWorkflow();

      worker.start(workflow);
      workflow.emit('tx:processing', { txId: 'hash-abc' });
      await new Promise((r) => setTimeout(r, 10));

      expect(workflow.finalizedIds).toEqual(['hash-abc']);
    });

    it('start() requires a workflow and is idempotent (a second start() is a no-op)', () => {
      const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
      const xclt = new Ledger({ dbPath });
      const worker = new LeadWorker({ xclt });
      expect(() => worker.start()).toThrow();

      const workflow = makeFakeWorkflow();
      worker.start(workflow);
      const workflow2 = makeFakeWorkflow();
      worker.start(workflow2); // no-op: already started on `workflow`
      expect(worker.workflow).toBe(workflow);
    });

    it('stop() detaches the listener so tx:processing no longer triggers finalize', async () => {
      const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
      const xclt = new Ledger({ dbPath });
      const worker = new LeadWorker({ xclt });
      const workflow = makeFakeWorkflow();

      worker.start(workflow);
      worker.stop();
      workflow.emit('tx:processing', { txId: 'hash-should-not-finalize' });
      await new Promise((r) => setTimeout(r, 10));

      expect(workflow.finalizedIds).toEqual([]);
    });

    it('a rejecting finalizeTransaction does not crash the worker or leave it unusable', async () => {
      const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xmbl-leadworker-'));
      const xclt = new Ledger({ dbPath });
      const worker = new LeadWorker({ xclt });
      const workflow = new EventEmitter();
      workflow.finalizeTransaction = async () => { throw new Error('boom'); };

      worker.start(workflow);
      workflow.emit('tx:processing', { txId: 'hash-1' });
      await new Promise((r) => setTimeout(r, 10));

      // still usable after the throw
      workflow.emit('tx:processing', { txId: 'hash-2' });
      await new Promise((r) => setTimeout(r, 10));
    });
  });
});
