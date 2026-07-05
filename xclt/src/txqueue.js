import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Durable at-least-once queue for XMBL anchoring tx payloads (D2b).
 *
 * Composes on the input side with D2a's normalizer output (anchoring-normalizer.js's
 * normalizeEvent() return shape: {kind, sha256_hex, agent_xmbl_address, timestamp}) and
 * on the output side with a pluggable submit function (D2c gates that fn to paper-mode).
 *
 * DURABILITY MODEL: the queue file is a pure APPEND-ONLY JSONL event log — never
 * rewritten or truncated in place. Two event types are ever appended:
 *   {type: 'enqueue', hash, payload, at}   — a payload was queued for anchoring
 *   {type: 'done',    hash, at}            — that payload's hash was successfully submitted
 * A process can crash between any two appendFileSync calls (or mid-write of a single
 * line — see the corruption note below) without losing or duplicating state: on
 * restart, the file is replayed from the top, folding to "last event per hash", and
 * PENDING = every hash whose last event is 'enqueue' (never got 'done'). Because
 * dedup is keyed by the payload's own sha256_hex (not by file offset or an in-memory
 * counter), the SAME payload enqueued twice — e.g. an at-least-once upstream producer
 * retrying after its own crash — collapses to one pending entry, and a payload marked
 * done is never resubmitted even if enqueued again afterward. This is what makes an
 * at-least-once queue + idempotent-by-hash submission behave as effectively
 * exactly-once on the anchor itself.
 *
 * CORRUPTION NOTE: appendFileSync writes are not fsynced by default, and a crash
 * mid-line-write could in principle leave a truncated trailing line. replay() treats
 * any line that fails JSON.parse as a torn write and skips it (a torn write is, by
 * construction, always the LAST line in the file — nothing after it could have been
 * appended) rather than throwing, so a crash never blocks recovery of everything
 * before that point.
 */

export function defaultQueuePath() {
  return join(homedir(), '.handoff', 'xmbl', 'txqueue.jsonl');
}

function ensureDirFor(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Replay the JSONL event log into a Map<hash, {payload, status, at}>.
 * Skips (does not throw on) a torn trailing write from a mid-line crash.
 * @param {string} path
 * @returns {Map<string, {payload: object, status: 'pending'|'done', enqueued_at: string, done_at?: string}>}
 */
export function replay(path) {
  const state = new Map();
  if (!existsSync(path)) return state;
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      // A JSON.parse failure can only be a torn write of the LAST line (every earlier
      // line was itself terminated by a completed '\n' append). Skip and stop reading
      // further lines from this point on — there is nothing valid after a torn write.
      break;
    }
    if (ev.type === 'enqueue') {
      state.set(ev.hash, { payload: ev.payload, status: 'pending', enqueued_at: ev.at });
    } else if (ev.type === 'done') {
      const existing = state.get(ev.hash);
      if (existing) { existing.status = 'done'; existing.done_at = ev.at; }
      else state.set(ev.hash, { payload: null, status: 'done', done_at: ev.at });
    }
  }
  return state;
}

export class TxQueue {
  /**
   * @param {object} [opts]
   * @param {string} [opts.path] queue file path (default ~/.handoff/xmbl/txqueue.jsonl)
   * @param {() => string} [opts.now] injectable clock for tests; defaults to new Date().toISOString()
   */
  constructor(opts = {}) {
    this.path = opts.path || defaultQueuePath();
    this._now = opts.now || (() => new Date().toISOString());
    ensureDirFor(this.path);
  }

  /**
   * Append a normalized D1 payload to the durable log. Every call appends a new
   * 'enqueue' event unconditionally (no in-memory dedup check) — but dedup is still
   * guaranteed at read time: replay() folds ALL events sharing a hash down to that
   * hash's single LAST-BY-FILE-ORDER status, so enqueueing the same payload N times
   * in a row (e.g. an at-least-once upstream producer retrying after its own crash,
   * with no 'done' appended in between) is exactly equivalent to enqueueing it once —
   * still one pending entry, not N. Re-enqueueing a hash AFTER it was marked done is a
   * deliberate re-open (a fresh anchor request for that same payload), not a bug: the
   * entry goes back to pending, since the last event in the file wins.
   * @param {{kind: string, sha256_hex: string, agent_xmbl_address?: string, timestamp: string}} payload
   */
  enqueue(payload) {
    if (!payload || typeof payload.sha256_hex !== 'string' || !payload.sha256_hex) {
      throw new Error('TxQueue.enqueue: payload.sha256_hex is required');
    }
    const line = JSON.stringify({ type: 'enqueue', hash: payload.sha256_hex, payload, at: this._now() });
    appendFileSync(this.path, line + '\n', 'utf8');
  }

  /** Append a 'done' event for the given payload hash. Idempotent: marking an already-done or never-enqueued hash done is harmless. */
  markDone(hash) {
    const line = JSON.stringify({ type: 'done', hash, at: this._now() });
    appendFileSync(this.path, line + '\n', 'utf8');
  }

  /** @returns {Array<{hash: string, payload: object, enqueued_at: string}>} every entry whose last event is 'enqueue' (never done), in enqueue order. */
  pending() {
    const state = replay(this.path);
    const out = [];
    for (const [hash, entry] of state) {
      if (entry.status === 'pending') out.push({ hash, payload: entry.payload, enqueued_at: entry.enqueued_at });
    }
    // Preserve enqueue order (Map iteration order is insertion order in JS, so this
    // already holds — the sort is a defensive no-op documenting the guarantee).
    out.sort((a, b) => (a.enqueued_at < b.enqueued_at ? -1 : a.enqueued_at > b.enqueued_at ? 1 : 0));
    return out;
  }

  /** @returns {number} count of entries whose last event is 'done'. */
  doneCount() {
    let n = 0;
    for (const entry of replay(this.path).values()) if (entry.status === 'done') n++;
    return n;
  }
}

/**
 * Drain every currently-pending entry through submitFn, with retry + exponential
 * backoff on failure, marking each done by hash the moment its submit succeeds — so a
 * crash mid-drain leaves every not-yet-submitted entry pending (re-submitted on the
 * next drain) and every already-submitted entry done (never re-submitted), matching
 * the queue's at-least-once + idempotent-dedup contract exactly.
 *
 * This function does NOT loop forever or poll — it drains the CURRENT pending set
 * once and returns. Callers wanting a continuous coordinator loop wrap this in their
 * own setInterval/while-true; keeping this pure and single-pass is what makes the
 * crash/restart behavior testable without fake timers.
 *
 * @param {TxQueue} queue
 * @param {(payload: object) => Promise<void>} submitFn resolves on success, rejects/throws on failure.
 *   D2c gates this to paper-mode — this function has no opinion on what "submit" means.
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=5] attempts per entry before giving up on it (it stays pending for the next drain call)
 * @param {number} [opts.baseDelayMs=100] backoff base; delay = baseDelayMs * 2^(attempt-1)
 * @param {(ms: number) => Promise<void>} [opts.sleep] injectable sleep for tests
 * @returns {Promise<{submitted: string[], failed: string[]}>} hashes that succeeded vs. exhausted retries this call
 */
export async function drainOnce(queue, submitFn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 100;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const submitted = [];
  const failed = [];
  for (const entry of queue.pending()) {
    let ok = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await submitFn(entry.payload);
        ok = true;
        break;
      } catch {
        if (attempt < maxAttempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
    if (ok) { queue.markDone(entry.hash); submitted.push(entry.hash); }
    else failed.push(entry.hash);
  }
  return { submitted, failed };
}
