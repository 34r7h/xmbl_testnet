import { describe, test, expect } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createAnchoringSubscriber, ANCHORED_EVENT_KINDS } from '../src/anchoring-subscriber.js';
import { TxQueue } from '../src/txqueue.js';
import { sha256Hex, jcsCanonicalize, canonicalRecordForTaskCreated } from '../src/anchoring-normalizer.js';

function makeQueue() {
  const dir = mkdtempSync(join(tmpdir(), 'anchoring-subscriber-test-'));
  const path = join(dir, 'txqueue.jsonl');
  return { queue: new TxQueue({ path }), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// A representative stream of sample activity events covering all 5 D1 kinds plus
// several non-anchored kinds that must be silently dropped, in mixed order — the
// coordinator's real firehose would look exactly like this: anchored and
// non-anchored events interleaved.
function sampleEventStream() {
  return [
    { kind: 'notification.mention', record: { irrelevant: true } },   // non-anchored — must be dropped
    { kind: 'task.created', record: { id: 't1', request_id: 'r1', title: 'Do X', created_by: 'alice', created_at: '2026-01-01T00:00:00.000Z' } },
    { kind: 'coord.ping', record: {} },   // non-anchored — must be dropped
    { kind: 'task.verified', record: { id: 't1', request_id: 'r1', status: 'verified', verified_by: 'carol', updated_at: '2026-01-01T01:00:00.000Z' } },
    { kind: 'settlement.executed', record: { id: 'recv1', resource: 'task:t1 (Do X)', payTo: 'bob', amount: '1.5', asset: 'USDC', network: 'base', status: 'settled', created_at: '2026-01-01T02:00:00.000Z' } },
    { kind: 'notification.like', record: {} },   // non-anchored — must be dropped
    { kind: 'artifact.uploaded', record: { file_id: 'f1', name: 'report.pdf', content_type: 'application/pdf', bytes: 1024, uploader_agent: 'dave', created_at: '2026-01-01T03:00:00.000Z' } },
    { kind: 'soc.posted', record: { id: 'p1', author: 'erin', text: 'hello xmbl', created_at: '2026-01-01T04:00:00.000Z' } },
  ];
}

describe('ANCHORED_EVENT_KINDS', () => {
  test('exposes exactly the 5 D1 kinds', () => {
    expect([...ANCHORED_EVENT_KINDS].sort()).toEqual(
      ['artifact.uploaded', 'settlement.executed', 'soc.posted', 'task.created', 'task.verified'].sort()
    );
  });
});

describe('createAnchoringSubscriber — acceptance test: drive a stream of sample activity events', () => {
  test('the 5 anchored-kind events land in the queue with correct normalized payloads; non-anchored kinds are dropped', () => {
    const { queue, cleanup } = makeQueue();
    try {
      const dropped = [];
      const errored = [];
      const onEvent = createAnchoringSubscriber({ queue, onDrop: (e) => dropped.push(e), onError: (e, err) => errored.push({ e, err }) });

      for (const event of sampleEventStream()) onEvent(event);

      // Exactly 5 pending entries — one per anchored kind — nothing extra, nothing missing.
      const pending = queue.pending();
      expect(pending).toHaveLength(5);

      const byKind = Object.fromEntries(pending.map((p) => [p.payload.kind, p.payload]));
      expect(Object.keys(byKind).sort()).toEqual(
        ['artifact.uploaded', 'settlement.executed', 'soc.posted', 'task.created', 'task.verified'].sort()
      );

      // task.created payload: correct shape, correct agent (created_by), correct timestamp.
      expect(byKind['task.created'].agent_xmbl_address).toBe('alice');
      expect(byKind['task.created'].timestamp).toBe('2026-01-01T00:00:00.000Z');
      expect(byKind['task.created'].sha256_hex).toHaveLength(64);
      // Cross-check the hash independently against the normalizer's own building blocks
      // (not just trusting the subscriber round-tripped its own dependency correctly).
      const expectedRecord = canonicalRecordForTaskCreated({ id: 't1', request_id: 'r1', title: 'Do X', created_by: 'alice', created_at: '2026-01-01T00:00:00.000Z' });
      expect(byKind['task.created'].sha256_hex).toBe(sha256Hex(jcsCanonicalize(expectedRecord)));

      // task.verified payload: agent = verified_by, not created_by.
      expect(byKind['task.verified'].agent_xmbl_address).toBe('carol');
      expect(byKind['task.verified'].timestamp).toBe('2026-01-01T01:00:00.000Z');

      // settlement.executed: agent = pay_to.
      expect(byKind['settlement.executed'].agent_xmbl_address).toBe('bob');

      // artifact.uploaded: agent = uploader_agent.
      expect(byKind['artifact.uploaded'].agent_xmbl_address).toBe('dave');

      // soc.posted: agent = author.
      expect(byKind['soc.posted'].agent_xmbl_address).toBe('erin');

      // The 3 non-anchored events were dropped (reported via onDrop), not enqueued, not errored.
      expect(dropped).toHaveLength(3);
      expect(dropped.map((e) => e.kind).sort()).toEqual(['coord.ping', 'notification.like', 'notification.mention'].sort());
      expect(errored).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('events arrive one at a time (not as a batch) — each onEvent() call is independent and the queue accumulates incrementally', () => {
    const { queue, cleanup } = makeQueue();
    try {
      const onEvent = createAnchoringSubscriber({ queue });
      expect(queue.pending()).toHaveLength(0);
      onEvent({ kind: 'task.created', record: { id: 't1', request_id: 'r1', title: 'X', created_at: '2026-01-01T00:00:00.000Z' } });
      expect(queue.pending()).toHaveLength(1);
      onEvent({ kind: 'soc.posted', record: { id: 'p1', author: 'a', text: 'hi', created_at: '2026-01-01T00:00:00.000Z' } });
      expect(queue.pending()).toHaveLength(2);
    } finally {
      cleanup();
    }
  });
});

describe('createAnchoringSubscriber — error handling never throws', () => {
  test('a malformed anchored-kind record (missing a required field, e.g. no status on task.verified) reports via onError, not thrown, and is not enqueued', () => {
    const { queue, cleanup } = makeQueue();
    try {
      const errored = [];
      const onEvent = createAnchoringSubscriber({ queue, onError: (e, err) => errored.push({ e, err }) });

      expect(() => onEvent({ kind: 'task.verified', record: { id: 't1', status: 'todo' } })).not.toThrow();

      expect(errored).toHaveLength(1);
      expect(errored[0].err).toBeInstanceOf(Error);
      expect(queue.pending()).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('one malformed event in the middle of a stream does not stop later valid events from being enqueued', () => {
    const { queue, cleanup } = makeQueue();
    try {
      const onEvent = createAnchoringSubscriber({ queue });
      onEvent({ kind: 'task.created', record: { id: 't1', request_id: 'r1', title: 'ok', created_at: '2026-01-01T00:00:00.000Z' } });
      onEvent({ kind: 'task.verified', record: { id: 'bad', status: 'not-a-real-status' } });   // throws inside normalizeEvent, caught
      onEvent({ kind: 'soc.posted', record: { id: 'p1', author: 'a', text: 'still works', created_at: '2026-01-01T00:00:00.000Z' } });

      expect(queue.pending()).toHaveLength(2);   // the 1 good task.created + 1 good soc.posted; the bad one dropped
    } finally {
      cleanup();
    }
  });
});

describe('createAnchoringSubscriber — construction', () => {
  test('throws immediately if deps.queue is missing an enqueue method', () => {
    expect(() => createAnchoringSubscriber({ queue: {} })).toThrow(/enqueue/);
    expect(() => createAnchoringSubscriber({})).toThrow();
  });
});

describe('createAnchoringSubscriber — resolveAgentAddress override', () => {
  test('when provided, its return value overrides the record-derived agent address', () => {
    const { queue, cleanup } = makeQueue();
    try {
      const onEvent = createAnchoringSubscriber({
        queue,
        resolveAgentAddress: (_addr, kind, record) => `xmbl-resolved:${record.created_by || record.author}`,
      });
      onEvent({ kind: 'task.created', record: { id: 't1', request_id: 'r1', title: 'X', created_by: 'alice', created_at: '2026-01-01T00:00:00.000Z' } });
      const [entry] = queue.pending();
      expect(entry.payload.agent_xmbl_address).toBe('xmbl-resolved:alice');
    } finally {
      cleanup();
    }
  });
});
