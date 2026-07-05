import { describe, test, expect } from '@jest/globals';
import { createHash } from 'crypto';
import {
  jcsCanonicalize,
  sha256Hex,
  canonicalRecordForTaskCreated,
  canonicalRecordForTaskVerified,
  canonicalRecordForSettlementExecuted,
  canonicalRecordForArtifactUploaded,
  canonicalRecordForSocPosted,
  normalizeEvent,
} from '../src/anchoring-normalizer.js';

// Independently recompute sha256(JCS(record)) with only Node's own crypto +
// a hand-sorted JSON.stringify, so the assertions don't just re-implement
// the module under test.
function referenceHash(sortedKeysObj) {
  return createHash('sha256').update(JSON.stringify(sortedKeysObj), 'utf8').digest('hex');
}

describe('jcsCanonicalize', () => {
  test('sorts object keys lexicographically, recursively', () => {
    expect(jcsCanonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(jcsCanonicalize({ z: { b: 1, a: 2 }, a: 1 })).toBe('{"a":1,"z":{"a":2,"b":1}}');
  });

  test('omits keys whose value is undefined, does not emit null for them', () => {
    expect(jcsCanonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  test('preserves array element order', () => {
    expect(jcsCanonicalize({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });

  test('is insensitive to input key order (same object, different literal order, same output)', () => {
    const rec1 = { event: 'x', task_id: '1', created_at: 't' };
    const rec2 = { created_at: 't', task_id: '1', event: 'x' };
    expect(jcsCanonicalize(rec1)).toBe(jcsCanonicalize(rec2));
  });
});

describe('canonicalRecordForTaskCreated', () => {
  const task = {
    id: 'task-1',
    request_id: 'req-1',
    goal_id: 'goal-1',
    title: 'Do the thing',
    assignee: 'bob',
    created_by: 'alice',
    created_at: '2026-07-05T00:00:00.000Z',
    status: 'todo',
    status_history: [{ status: 'todo', at: '2026-07-05T00:00:00.000Z' }],
  };

  test('extracts exactly the D1-spec fields, dropping mutable/non-anchored ones', () => {
    const rec = canonicalRecordForTaskCreated(task);
    expect(rec).toEqual({
      event: 'task.created',
      task_id: 'task-1',
      request_id: 'req-1',
      goal_id: 'goal-1',
      title: 'Do the thing',
      assignee: 'bob',
      created_by: 'alice',
      created_at: '2026-07-05T00:00:00.000Z',
    });
    expect(rec.status).toBeUndefined();
    expect(rec.status_history).toBeUndefined();
  });

  test('omits parent_id/assignee/created_by when absent, rather than nulling them', () => {
    const minimal = { id: 't2', request_id: 'r2', title: 'T2', created_at: '2026-07-05T00:00:00.000Z' };
    const rec = canonicalRecordForTaskCreated(minimal);
    expect(Object.keys(rec).sort()).toEqual(['created_at', 'event', 'request_id', 'task_id', 'title']);
  });

  test('produces a byte-exact canonical JSON string and sha256_hex', () => {
    const rec = canonicalRecordForTaskCreated(task);
    const canonicalJson = jcsCanonicalize(rec);
    expect(canonicalJson).toBe(
      '{"assignee":"bob","created_at":"2026-07-05T00:00:00.000Z","created_by":"alice","event":"task.created","goal_id":"goal-1","request_id":"req-1","task_id":"task-1","title":"Do the thing"}'
    );
    // referenceHash takes a literal with keys ALREADY in sorted order, so
    // JSON.stringify's insertion-order output happens to equal JCS's
    // sorted-key output — an independent check that doesn't reuse jcsCanonicalize.
    expect(sha256Hex(canonicalJson)).toBe(referenceHash({
      assignee: 'bob',
      created_at: '2026-07-05T00:00:00.000Z',
      created_by: 'alice',
      event: 'task.created',
      goal_id: 'goal-1',
      request_id: 'req-1',
      task_id: 'task-1',
      title: 'Do the thing',
    }));
  });
});

describe('canonicalRecordForTaskVerified', () => {
  const verifiedTask = {
    id: 'task-1',
    request_id: 'req-1',
    status: 'verified',
    verified_by: 'carol',
    updated_at: '2026-07-05T01:00:00.000Z',
    title: 'irrelevant here',
  };

  test('extracts exactly the D1-spec fields', () => {
    expect(canonicalRecordForTaskVerified(verifiedTask)).toEqual({
      event: 'task.verified',
      task_id: 'task-1',
      request_id: 'req-1',
      status: 'verified',
      verified_by: 'carol',
      updated_at: '2026-07-05T01:00:00.000Z',
    });
  });

  test('accepts a rejected task the same way', () => {
    const rejected = { ...verifiedTask, status: 'rejected' };
    expect(canonicalRecordForTaskVerified(rejected).status).toBe('rejected');
  });

  test('throws for any status other than verified/rejected', () => {
    expect(() => canonicalRecordForTaskVerified({ ...verifiedTask, status: 'pending_verification' })).toThrow();
    expect(() => canonicalRecordForTaskVerified({ ...verifiedTask, status: 'todo' })).toThrow();
  });
});

describe('canonicalRecordForSettlementExecuted', () => {
  const receipt = {
    id: 'receipt-1',
    resource: 'task:task-1 (Do the thing)',
    payTo: 'bob',
    amount: '1.50',
    asset: 'USDC',
    network: 'base-sepolia',
    tx: '0xabc123',
    status: 'settled',
    created_at: '2026-07-05T02:00:00.000Z',
  };

  test('extracts fields and parses task_id out of resource', () => {
    expect(canonicalRecordForSettlementExecuted(receipt)).toEqual({
      event: 'settlement.executed',
      receipt_id: 'receipt-1',
      task_id: 'task-1',
      pay_to: 'bob',
      amount: '1.50',
      asset: 'USDC',
      network: 'base-sepolia',
      tx: '0xabc123',
      created_at: '2026-07-05T02:00:00.000Z',
    });
  });

  test('omits tx when absent (free/zero-amount settlement)', () => {
    const free = { ...receipt, tx: undefined };
    const rec = canonicalRecordForSettlementExecuted(free);
    expect(rec.tx).toBeUndefined();
    expect(Object.keys(rec)).not.toContain('tx');
  });

  test('throws for a non-settled receipt', () => {
    expect(() => canonicalRecordForSettlementExecuted({ ...receipt, status: 'failed' })).toThrow();
  });
});

describe('canonicalRecordForArtifactUploaded', () => {
  test('extracts exactly the D1-spec fields, excluding mutable grants', () => {
    const file = {
      file_id: 'file-1',
      name: 'report.pdf',
      content_type: 'application/pdf',
      bytes: 4096,
      uploader_agent: 'dave',
      created_at: '2026-07-05T03:00:00.000Z',
      grants: ['agent-a', 'agent-b'],
    };
    const rec = canonicalRecordForArtifactUploaded(file);
    expect(rec).toEqual({
      event: 'artifact.uploaded',
      file_id: 'file-1',
      name: 'report.pdf',
      content_type: 'application/pdf',
      bytes: 4096,
      uploader_agent: 'dave',
      created_at: '2026-07-05T03:00:00.000Z',
    });
    expect(rec.grants).toBeUndefined();
  });
});

describe('canonicalRecordForSocPosted', () => {
  test('extracts exactly the D1-spec fields, excluding mutable likes/tags', () => {
    const post = {
      id: 'post-1',
      author: 'erin',
      text: 'hello xmbl',
      scope: 'project:p1',
      created_at: '2026-07-05T04:00:00.000Z',
      likes: ['agent-a'],
      tags: ['news'],
    };
    const rec = canonicalRecordForSocPosted(post);
    expect(rec).toEqual({
      event: 'soc.posted',
      post_id: 'post-1',
      author: 'erin',
      text: 'hello xmbl',
      scope: 'project:p1',
      created_at: '2026-07-05T04:00:00.000Z',
    });
    expect(rec.likes).toBeUndefined();
    expect(rec.tags).toBeUndefined();
  });
});

describe('normalizeEvent — full payload assembly for all 5 kinds', () => {
  test('task.created payload shape and byte-exact hash', () => {
    const task = { id: 't1', request_id: 'r1', title: 'X', created_by: 'alice', created_at: '2026-01-01T00:00:00.000Z' };
    const payload = normalizeEvent('task.created', task, 'xmbl:alice-address');
    expect(payload.kind).toBe('task.created');
    expect(payload.agent_xmbl_address).toBe('xmbl:alice-address');
    expect(payload.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(payload.sha256_hex).toBe(sha256Hex(jcsCanonicalize(canonicalRecordForTaskCreated(task))));
    expect(payload.sha256_hex).toHaveLength(64);
  });

  test('task.verified payload defaults agent_xmbl_address to verified_by when not supplied', () => {
    const task = { id: 't1', request_id: 'r1', status: 'verified', verified_by: 'carol', updated_at: '2026-01-01T00:00:00.000Z' };
    const payload = normalizeEvent('task.verified', task);
    expect(payload.agent_xmbl_address).toBe('carol');
    expect(payload.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  test('settlement.executed payload defaults agent_xmbl_address to pay_to', () => {
    const receipt = { id: 'r1', resource: 'task:t1 (X)', payTo: 'bob', amount: '1', asset: 'USDC', network: 'base', status: 'settled', created_at: '2026-01-01T00:00:00.000Z' };
    const payload = normalizeEvent('settlement.executed', receipt);
    expect(payload.agent_xmbl_address).toBe('bob');
    expect(payload.kind).toBe('settlement.executed');
  });

  test('artifact.uploaded payload defaults agent_xmbl_address to uploader_agent', () => {
    const file = { file_id: 'f1', name: 'x.txt', content_type: 'text/plain', bytes: 10, uploader_agent: 'dave', created_at: '2026-01-01T00:00:00.000Z' };
    const payload = normalizeEvent('artifact.uploaded', file);
    expect(payload.agent_xmbl_address).toBe('dave');
  });

  test('soc.posted payload defaults agent_xmbl_address to author', () => {
    const post = { id: 'p1', author: 'erin', text: 'hi', created_at: '2026-01-01T00:00:00.000Z' };
    const payload = normalizeEvent('soc.posted', post);
    expect(payload.agent_xmbl_address).toBe('erin');
  });

  test('two events differing only in an omitted-vs-present optional field hash differently', () => {
    const withGoal = { id: 't1', request_id: 'r1', title: 'X', goal_id: 'g1', created_at: '2026-01-01T00:00:00.000Z' };
    const withoutGoal = { id: 't1', request_id: 'r1', title: 'X', created_at: '2026-01-01T00:00:00.000Z' };
    const p1 = normalizeEvent('task.created', withGoal);
    const p2 = normalizeEvent('task.created', withoutGoal);
    expect(p1.sha256_hex).not.toBe(p2.sha256_hex);
  });

  test('throws for an unknown event kind', () => {
    expect(() => normalizeEvent('not.a.real.kind', {})).toThrow();
  });
});
