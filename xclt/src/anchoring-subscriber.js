import { normalizeEvent } from './anchoring-normalizer.js';

/**
 * D2a-wire: the FRONT-END adapter that connects live activity to the D2 pipeline
 * (subscribe -> normalize -> enqueue -> (D2c-gated) drain).
 *
 * HARD GUARDRAIL (per the order): this module does NOT reach into
 * ~/.handoff/handoff-coordinator.mjs or the tunnel introspection relay itself — it
 * exposes createAnchoringSubscriber(), a subscribe(onEvent)-shaped ADAPTER that
 * whatever already taps local agent activity events (the coordinator, or a test) can
 * CALL. This module has zero dependency on the coordinator/relay's internals; it only
 * needs an "activity event" object handed to it one at a time, so it can be exercised
 * with a stream of sample events synthetically, exactly as the acceptance test does.
 *
 * INPUT event shape (the "activity event" the coordinator would hand this each time
 * one occurs) is intentionally loose/duck-typed rather than importing any handoff
 * store type: {kind: string, record: object}. `kind` matches one of the 5 D1 event
 * kinds (task.created, task.verified, settlement.executed, artifact.uploaded,
 * soc.posted); `record` is the underlying store record for that kind, in the same
 * shape anchoring-normalizer.js's canonicalRecordFor*() builders already expect
 * (JobTask / JobTask post-verify-mutation / PaymentReceipt / FileMeta / Post — see
 * docs/xmbl-anchoring.md for the authoritative field list per kind).
 *
 * Non-anchored kinds (anything not one of the 5) are silently dropped — this is by
 * design (the coordinator may tap a broader activity firehose than just anchoring
 * events; this adapter's whole job is to be the filter).
 */

const ANCHORED_KINDS = new Set(['task.created', 'task.verified', 'settlement.executed', 'artifact.uploaded', 'soc.posted']);

/**
 * Build a subscriber: a function you call once per incoming activity event. Each
 * anchored-kind event is normalized (via anchoring-normalizer.js's normalizeEvent())
 * and handed to `queue.enqueue()`. Non-anchored kinds and normalization failures are
 * reported via `onDrop`/`onError` respectively (both optional; default no-ops), never
 * thrown — a single malformed or irrelevant event must never crash whatever is
 * driving the subscription loop.
 *
 * @param {object} deps
 * @param {{enqueue: (payload: object) => void}} deps.queue a D2b TxQueue instance (or
 *   anything with a matching `enqueue(payload)` method — duck-typed, no import
 *   coupling to txqueue.js's class itself, so a test double or a differently-wired
 *   queue works identically).
 * @param {(agentXmblAddress: string | undefined, kind: string, record: object) => string | undefined} [deps.resolveAgentAddress]
 *   optional override for normalizeEvent()'s agent-address resolution (see
 *   anchoring-normalizer.js's `agentXmblAddress` param) — if omitted, normalizeEvent()
 *   falls back to the record's own responsible-agent field per kind, exactly as D2a
 *   already documents. Present here only so a future coordinator wiring that already
 *   knows how to resolve a handoff agent_id -> XMBL address can plug that in without
 *   this module needing to know how that resolution works.
 * @param {(event: object) => void} [deps.onDrop] called (not thrown) for every event
 *   whose kind is not one of the 5 D1 kinds.
 * @param {(event: object, error: Error) => void} [deps.onError] called (not thrown)
 *   if normalizeEvent()/enqueue() throws for an anchored-kind event (e.g. a
 *   malformed record missing a required field) — the event is dropped, not enqueued,
 *   and the subscriber keeps running for the next event.
 * @returns {(event: {kind: string, record: object}) => void} onEvent — call this once
 *   per incoming activity event.
 */
export function createAnchoringSubscriber(deps) {
  const { queue, resolveAgentAddress, onDrop = () => {}, onError = () => {} } = deps;
  if (!queue || typeof queue.enqueue !== 'function') {
    throw new Error('createAnchoringSubscriber: deps.queue with an enqueue(payload) method is required');
  }
  return function onEvent(event) {
    const kind = event && event.kind;
    if (!ANCHORED_KINDS.has(kind)) { onDrop(event); return; }
    try {
      const agentAddress = resolveAgentAddress ? resolveAgentAddress(undefined, kind, event.record) : undefined;
      const payload = normalizeEvent(kind, event.record, agentAddress);
      queue.enqueue(payload);
    } catch (err) {
      onError(event, err);
    }
  };
}

/** The 5 D1 event kinds this subscriber recognizes — exported so a coordinator wiring this up can filter its own firehose down to exactly these before ever calling onEvent, if it prefers to filter upstream rather than rely on onDrop. */
export const ANCHORED_EVENT_KINDS = Object.freeze([...ANCHORED_KINDS]);
