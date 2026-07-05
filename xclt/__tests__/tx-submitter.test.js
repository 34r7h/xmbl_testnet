import { describe, test, expect, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createTxSubmitter, isTxLive } from '../src/tx-submitter.js';
import { TxQueue, drainOnce } from '../src/txqueue.js';

const payload = { kind: 'task.created', sha256_hex: 'abc123'.padEnd(64, '0'), agent_xmbl_address: 'xmbl:a', timestamp: '2026-01-01T00:00:00.000Z' };

describe('isTxLive()', () => {
  const original = process.env.XMBL_TX_LIVE;
  afterEach(() => { if (original === undefined) delete process.env.XMBL_TX_LIVE; else process.env.XMBL_TX_LIVE = original; });

  test('is false when XMBL_TX_LIVE is unset', () => {
    delete process.env.XMBL_TX_LIVE;
    expect(isTxLive()).toBe(false);
  });

  test('is false for any value other than the literal string "1"', () => {
    process.env.XMBL_TX_LIVE = 'true';
    expect(isTxLive()).toBe(false);
    process.env.XMBL_TX_LIVE = '0';
    expect(isTxLive()).toBe(false);
  });

  test('is true only for the literal string "1"', () => {
    process.env.XMBL_TX_LIVE = '1';
    expect(isTxLive()).toBe(true);
  });
});

describe('createTxSubmitter — PAPER MODE (default, money-safe)', () => {
  test('WITHOUT the flag: does not call liveSubmitFn, logs the would-be tx, resolves successfully', async () => {
    const liveSubmitFn = jest.fn();
    const logs = [];
    const submit = createTxSubmitter({ liveSubmitFn, log: (l) => logs.push(l), isLive: () => false });

    await expect(submit(payload)).resolves.toBeUndefined();

    expect(liveSubmitFn).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('paper-mode');
    expect(logs[0]).toContain(payload.sha256_hex);   // the full payload is in the log line
  });

  test('paper mode works even when no liveSubmitFn is provided at all (the common case pre-chain-integration)', async () => {
    const logs = [];
    const submit = createTxSubmitter({ log: (l) => logs.push(l), isLive: () => false });
    await expect(submit(payload)).resolves.toBeUndefined();
    expect(logs).toHaveLength(1);
  });

  test('composed with drainOnce(): paper mode marks the entry done WITHOUT hitting any network', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tx-submitter-test-'));
    const queuePath = join(dir, 'txqueue.jsonl');
    const q = new TxQueue({ path: queuePath });
    q.enqueue(payload);

    const liveSubmitFn = jest.fn();
    const logs = [];
    const submit = createTxSubmitter({ liveSubmitFn, log: (l) => logs.push(l), isLive: () => false });

    const result = await drainOnce(q, submit, { sleep: async () => {} });

    expect(result.submitted).toEqual([payload.sha256_hex]);
    expect(liveSubmitFn).not.toHaveBeenCalled();          // no network call
    expect(logs.some((l) => l.includes(payload.sha256_hex))).toBe(true);   // would-be tx logged
    expect(q.pending()).toHaveLength(0);                   // still marked done, same as a real submit
    expect(q.doneCount()).toBe(1);

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('createTxSubmitter — LIVE MODE (XMBL_TX_LIVE=1)', () => {
  test('WITH the flag: invokes liveSubmitFn with the payload, does not log a paper line', async () => {
    const liveSubmitFn = jest.fn().mockResolvedValue(undefined);
    const logs = [];
    const submit = createTxSubmitter({ liveSubmitFn, log: (l) => logs.push(l), isLive: () => true });

    await submit(payload);

    expect(liveSubmitFn).toHaveBeenCalledTimes(1);
    expect(liveSubmitFn).toHaveBeenCalledWith(payload);
    expect(logs).toHaveLength(0);   // paper log line only fires in paper mode
  });

  test('WITH the flag but NO liveSubmitFn provided: throws rather than silently falling back to paper mode', async () => {
    const submit = createTxSubmitter({ isLive: () => true });
    await expect(submit(payload)).rejects.toThrow(/refusing to silently fall back/);
  });

  test('composed with drainOnce(): live mode marks done only after liveSubmitFn resolves, and failure keeps the entry pending', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tx-submitter-test-live-'));
    const queuePath = join(dir, 'txqueue.jsonl');
    const q = new TxQueue({ path: queuePath });
    q.enqueue(payload);

    const liveSubmitFn = jest.fn().mockRejectedValue(new Error('chain unreachable'));
    const submit = createTxSubmitter({ liveSubmitFn, isLive: () => true });

    const result = await drainOnce(q, submit, { maxAttempts: 2, baseDelayMs: 1, sleep: async () => {} });

    expect(liveSubmitFn).toHaveBeenCalled();
    expect(result.failed).toEqual([payload.sha256_hex]);
    expect(q.pending()).toHaveLength(1);   // NOT marked done — a failed live submit must never be treated as anchored

    rmSync(dir, { recursive: true, force: true });
  });

  test('composed with drainOnce(): a successful live submit marks the entry done', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tx-submitter-test-live-ok-'));
    const queuePath = join(dir, 'txqueue.jsonl');
    const q = new TxQueue({ path: queuePath });
    q.enqueue(payload);

    const liveSubmitFn = jest.fn().mockResolvedValue(undefined);
    const submit = createTxSubmitter({ liveSubmitFn, isLive: () => true });

    const result = await drainOnce(q, submit, { sleep: async () => {} });

    expect(liveSubmitFn).toHaveBeenCalledWith(payload);
    expect(result.submitted).toEqual([payload.sha256_hex]);
    expect(q.pending()).toHaveLength(0);

    rmSync(dir, { recursive: true, force: true });
  });
});
