import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, appendFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TxQueue, drainOnce, replay } from '../src/txqueue.js';

let dir;
let queuePath;
let tick = 0;
const fakeNow = () => `2026-01-01T00:00:${String(tick++).padStart(2, '0')}.000Z`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'txqueue-test-'));
  queuePath = join(dir, 'txqueue.jsonl');
  tick = 0;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const payload = (n) => ({ kind: 'task.created', sha256_hex: `hash-${n}`.padEnd(64, '0'), agent_xmbl_address: 'xmbl:a', timestamp: '2026-01-01T00:00:00.000Z' });

describe('TxQueue.enqueue / pending / markDone', () => {
  test('enqueue appends, pending() returns it', () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    const pending = q.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].hash).toBe(payload(1).sha256_hex);
    expect(pending[0].payload).toEqual(payload(1));
  });

  test('markDone removes it from pending()', () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    q.markDone(payload(1).sha256_hex);
    expect(q.pending()).toHaveLength(0);
    expect(q.doneCount()).toBe(1);
  });

  test('pending() preserves enqueue order across multiple entries', () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    q.enqueue(payload(2));
    q.enqueue(payload(3));
    expect(q.pending().map((e) => e.hash)).toEqual([payload(1).sha256_hex, payload(2).sha256_hex, payload(3).sha256_hex]);
  });

  test('enqueuing the same payload twice in a row collapses to ONE pending entry (dedup by hash)', () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    q.enqueue(payload(1));   // simulates an at-least-once producer retrying
    expect(q.pending()).toHaveLength(1);
  });

  test('marking an unenqueued hash done is harmless (no throw, no pending entries)', () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    expect(() => q.markDone('never-enqueued')).not.toThrow();
    expect(q.pending()).toHaveLength(0);
  });

  test('re-enqueueing an already-done hash reopens it as pending (deliberate re-anchor request)', () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    q.markDone(payload(1).sha256_hex);
    expect(q.pending()).toHaveLength(0);
    q.enqueue(payload(1));
    expect(q.pending()).toHaveLength(1);
  });
});

describe('replay()', () => {
  test('an empty/missing file replays to an empty map', () => {
    expect(replay(queuePath).size).toBe(0);
  });

  test('a torn trailing write (mid-line crash) is skipped, not thrown', () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    q.enqueue(payload(2));
    // Simulate a crash mid-write of a third line: append a truncated, unparseable fragment.
    appendFileSync(queuePath, '{"type":"enqueue","hash":"trunc', 'utf8');
    const state = replay(queuePath);
    expect(state.size).toBe(2);
    expect(state.get(payload(1).sha256_hex).status).toBe('pending');
    expect(state.get(payload(2).sha256_hex).status).toBe('pending');
  });
});

describe('CRASH/RESTART acceptance test: kill mid-queue, restart drains exactly the pending entries', () => {
  test('entries done before the crash are never resubmitted; entries not yet done are resubmitted exactly once', async () => {
    // "Before crash" process: enqueue 3, submit + mark 1 done, then simulate a crash
    // (just stop calling anything on this queue instance — no special teardown needed,
    // since the durability guarantee lives entirely in the on-disk JSONL file).
    const preCrash = new TxQueue({ path: queuePath, now: fakeNow });
    preCrash.enqueue(payload(1));
    preCrash.enqueue(payload(2));
    preCrash.enqueue(payload(3));
    preCrash.markDone(payload(1).sha256_hex);   // 1 already anchored before the crash
    // (payload 2 and 3 remain pending — imagine the process died before submitting them)

    // "Restart" — a FRESH TxQueue instance pointed at the SAME file (this is the
    // whole point: nothing but the file itself carries state across the crash).
    const postCrash = new TxQueue({ path: queuePath, now: fakeNow });
    const submittedPayloads = [];
    const submitFn = async (p) => { submittedPayloads.push(p.sha256_hex); };

    const result = await drainOnce(postCrash, submitFn, { sleep: async () => {} });

    // Exactly the pending ones (2 and 3) were submitted — NOT 1 (already done pre-crash).
    expect(result.submitted.sort()).toEqual([payload(2).sha256_hex, payload(3).sha256_hex].sort());
    expect(submittedPayloads.sort()).toEqual([payload(2).sha256_hex, payload(3).sha256_hex].sort());
    expect(submittedPayloads).not.toContain(payload(1).sha256_hex);

    // After drain, ALL THREE are done — nothing lost, nothing duplicated.
    expect(postCrash.pending()).toHaveLength(0);
    expect(postCrash.doneCount()).toBe(3);

    // A SECOND restart (yet another fresh instance, same file) drains nothing —
    // proves done entries never resubmit on a subsequent restart either.
    const secondRestart = new TxQueue({ path: queuePath, now: fakeNow });
    const secondSubmit = [];
    await drainOnce(secondRestart, async (p) => { secondSubmit.push(p.sha256_hex); }, { sleep: async () => {} });
    expect(secondSubmit).toHaveLength(0);
  });

  test('a crash mid-drain (submitFn succeeds and marks done, then process dies before the NEXT entry) loses nothing and never double-submits the completed one', async () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    q.enqueue(payload(2));

    // Manually drive one entry through to done, simulating drainOnce() processing
    // entry 1 successfully and then the process dying before entry 2 is attempted.
    await Promise.resolve(); // (no-op, keeps this test's async shape consistent)
    q.markDone(payload(1).sha256_hex);
    // — crash here —

    const restarted = new TxQueue({ path: queuePath, now: fakeNow });
    const submitted = [];
    await drainOnce(restarted, async (p) => { submitted.push(p.sha256_hex); }, { sleep: async () => {} });

    expect(submitted).toEqual([payload(2).sha256_hex]);   // only the not-yet-done one
    expect(restarted.doneCount()).toBe(2);
  });
});

describe('drainOnce() retry + backoff', () => {
  test('retries up to maxAttempts, marks done on eventual success', async () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    let calls = 0;
    const sleeps = [];
    const submitFn = async () => { calls++; if (calls < 3) throw new Error('transient'); };
    const result = await drainOnce(q, submitFn, { maxAttempts: 5, baseDelayMs: 10, sleep: async (ms) => { sleeps.push(ms); } });
    expect(calls).toBe(3);
    expect(result.submitted).toEqual([payload(1).sha256_hex]);
    expect(q.pending()).toHaveLength(0);
    expect(sleeps).toEqual([10, 20]);   // exponential backoff: baseDelayMs * 2^(attempt-1) for the 2 failed attempts
  });

  test('an entry that exhausts all attempts stays pending (not marked done, not lost)', async () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    const submitFn = async () => { throw new Error('permanent'); };
    const result = await drainOnce(q, submitFn, { maxAttempts: 3, baseDelayMs: 1, sleep: async () => {} });
    expect(result.failed).toEqual([payload(1).sha256_hex]);
    expect(result.submitted).toEqual([]);
    expect(q.pending()).toHaveLength(1);   // still there for the next drain call
  });

  test('one failing entry does not block a later succeeding entry in the same drain', async () => {
    const q = new TxQueue({ path: queuePath, now: fakeNow });
    q.enqueue(payload(1));
    q.enqueue(payload(2));
    const submitFn = async (p) => { if (p.sha256_hex === payload(1).sha256_hex) throw new Error('always fails'); };
    const result = await drainOnce(q, submitFn, { maxAttempts: 2, baseDelayMs: 1, sleep: async () => {} });
    expect(result.failed).toEqual([payload(1).sha256_hex]);
    expect(result.submitted).toEqual([payload(2).sha256_hex]);
    expect(q.pending().map((e) => e.hash)).toEqual([payload(1).sha256_hex]);
  });
});
