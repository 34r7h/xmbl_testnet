import { createHash } from 'crypto';

/**
 * Pure normalizer: handoff activity event -> XMBL anchoring tx payload.
 *
 * Implements the spec in docs/xmbl-anchoring.md exactly: for each of the 5
 * anchored event kinds, build the canonical JSON record, hash it with
 * RFC 8785 JCS canonicalization + SHA-256, and wrap it in the universal
 * payload shape {kind, sha256_hex, agent_xmbl_address, timestamp}.
 *
 * This module is deliberately I/O-free and has no dependency on the handoff
 * coordinator, any store, or the network — it takes plain data in and
 * returns plain data out, so it can be unit-tested in isolation and reused
 * by whatever subscribes to the activity stream.
 *
 * agent_xmbl_address (the XMBL address for the agent a given event is
 * attributed to) is NOT resolved here — resolving a handoff agent_id to its
 * XMBL address is a separate concern (see docs/xmbl-anchoring.md) and is
 * passed in by the caller, already resolved.
 */

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS), restricted to the plain
 * string/number/boolean/object/array/null values this module ever produces
 * (no exotic number formatting edge cases: every numeric field anchored
 * here is a plain integer). Object keys are sorted lexicographically by
 * their UTF-16 code unit order at every nesting level (equivalent to
 * byte-wise UTF-8 order for the ASCII-only keys used throughout this
 * module); arrays preserve element order; `undefined` values must already
 * be omitted by the caller (JSON.stringify silently omits them for object
 * properties, so an accidental `undefined` degrades safely rather than
 * throwing, but canonicalRecordFor* below strip them explicitly for
 * clarity).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function jcsCanonicalize(value) {
  return canonicalize(value);
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

/**
 * SHA-256 of a canonical JSON string, lowercase hex.
 * @param {string} canonicalJson
 * @returns {string}
 */
export function sha256Hex(canonicalJson) {
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

/** Drop keys whose value is undefined (canonicalize() also does this, but
 * callers may want the plain record object for inspection/testing). */
function omitUndefined(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

// --- Canonical record builders (one per D1 event kind) ---------------------

/** @param {object} task a JobTask record as of creation */
export function canonicalRecordForTaskCreated(task) {
  return omitUndefined({
    event: 'task.created',
    task_id: task.id,
    request_id: task.request_id,
    goal_id: task.goal_id,
    parent_id: task.parent_id,
    title: task.title,
    assignee: task.assignee,
    created_by: task.created_by,
    created_at: task.created_at,
  });
}

/** @param {object} task a JobTask record as of the verify mutation (status already 'verified' or 'rejected') */
export function canonicalRecordForTaskVerified(task) {
  if (task.status !== 'verified' && task.status !== 'rejected') {
    throw new Error(`canonicalRecordForTaskVerified: task.status must be 'verified' or 'rejected', got '${task.status}'`);
  }
  return omitUndefined({
    event: 'task.verified',
    task_id: task.id,
    request_id: task.request_id,
    status: task.status,
    verified_by: task.verified_by,
    updated_at: task.updated_at,
  });
}

/**
 * @param {object} receipt a settled PaymentReceipt record
 * task_id is parsed out of receipt.resource (format "task:<id> (<title>)"),
 * per docs/xmbl-anchoring.md's note that this is a string-parse today and
 * should be swapped for a dedicated field if PaymentReceipt ever gains one.
 */
export function canonicalRecordForSettlementExecuted(receipt) {
  if (receipt.status !== 'settled') {
    throw new Error(`canonicalRecordForSettlementExecuted: receipt.status must be 'settled', got '${receipt.status}'`);
  }
  const m = /^task:(\S+)/.exec(receipt.resource || '');
  const task_id = m ? m[1] : undefined;
  return omitUndefined({
    event: 'settlement.executed',
    receipt_id: receipt.id,
    task_id,
    pay_to: receipt.payTo,
    amount: receipt.amount,
    asset: receipt.asset,
    network: receipt.network,
    tx: receipt.tx,
    created_at: receipt.created_at,
  });
}

/** @param {object} file an uploaded FileMeta record */
export function canonicalRecordForArtifactUploaded(file) {
  return omitUndefined({
    event: 'artifact.uploaded',
    file_id: file.file_id,
    name: file.name,
    content_type: file.content_type,
    bytes: file.bytes,
    uploader_agent: file.uploader_agent,
    created_at: file.created_at,
  });
}

/** @param {object} post a created social Post record */
export function canonicalRecordForSocPosted(post) {
  return omitUndefined({
    event: 'soc.posted',
    post_id: post.id,
    author: post.author,
    text: post.text,
    scope: post.scope,
    created_at: post.created_at,
  });
}

const CANONICAL_RECORD_BUILDERS = {
  'task.created': canonicalRecordForTaskCreated,
  'task.verified': canonicalRecordForTaskVerified,
  'settlement.executed': canonicalRecordForSettlementExecuted,
  'artifact.uploaded': canonicalRecordForArtifactUploaded,
  'soc.posted': canonicalRecordForSocPosted,
};

/** @param {object} r the already-built canonical record */
function agentFieldForKind(kind, r) {
  switch (kind) {
    case 'task.created': return r.created_by;
    case 'task.verified': return r.verified_by;
    case 'settlement.executed': return r.pay_to;
    case 'artifact.uploaded': return r.uploader_agent;
    case 'soc.posted': return r.author;
    default: return undefined;
  }
}

/**
 * Build the on-chain anchoring payload for a single event.
 *
 * @param {'task.created'|'task.verified'|'settlement.executed'|'artifact.uploaded'|'soc.posted'} kind
 * @param {object} record the raw handoff store record (JobTask / PaymentReceipt / FileMeta / Post)
 * @param {string} [agentXmblAddress] the XMBL address of the responsible agent (see docs/xmbl-anchoring.md
 *   for which record field determines "responsible" per kind); if omitted, this function attempts no
 *   resolution and the payload's agent_xmbl_address is omitted — callers anchoring on-chain MUST supply
 *   the resolved address themselves.
 * @returns {{kind: string, sha256_hex: string, agent_xmbl_address?: string, timestamp: string}}
 */
export function normalizeEvent(kind, record, agentXmblAddress) {
  const buildRecord = CANONICAL_RECORD_BUILDERS[kind];
  if (!buildRecord) throw new Error(`normalizeEvent: unknown event kind '${kind}'`);
  const canonicalRecord = buildRecord(record);
  const sha256_hex = sha256Hex(jcsCanonicalize(canonicalRecord));
  const timestamp = canonicalRecord.created_at ?? canonicalRecord.updated_at;
  const resolvedAddress = agentXmblAddress ?? agentFieldForKind(kind, canonicalRecord);
  return omitUndefined({
    kind,
    sha256_hex,
    agent_xmbl_address: resolvedAddress,
    timestamp,
  });
}
