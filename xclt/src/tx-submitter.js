/**
 * D2c: money-safe submit fn for D2b's drainOnce(). MONEY-SAFE BY DEFAULT — matches
 * the repo-wide *_LIVE flag convention (see handoff's src/settler.ts ARC_LIVE,
 * src/polymarket-trade.ts POLYMARKET_LIVE): submission is LOG-ONLY unless the
 * operator explicitly sets XMBL_TX_LIVE=1. Without the flag, NOTHING touches the
 * network — the would-be tx is only logged and the queue entry is marked done as if
 * it had anchored, so the pipeline (D1 spec -> D2a normalize -> D2b queue -> here)
 * can be exercised end-to-end with zero on-chain risk before a live network fn exists.
 *
 * This module does not itself know how to submit to the XMBL chain — `liveSubmitFn`
 * is injected by the caller (whatever wires the actual chain client), so this file
 * never needs a chain SDK dependency and stays trivially testable.
 */

/** @returns {boolean} true iff XMBL_TX_LIVE=1 is set in the environment right now (read live, not cached, so tests can toggle it per-call). */
export function isTxLive() {
  return process.env.XMBL_TX_LIVE === '1';
}

/**
 * Build the submit fn that D2b's drainOnce() calls for each pending payload.
 *
 * @param {object} [opts]
 * @param {(payload: object) => Promise<void>} [opts.liveSubmitFn] the REAL on-chain submit function,
 *   invoked only when XMBL_TX_LIVE=1. If XMBL_TX_LIVE=1 is set but no liveSubmitFn is provided, this
 *   throws at call time rather than silently falling back to paper mode — an operator who set the LIVE
 *   flag expecting real submission must not be silently downgraded to a no-op paper log.
 * @param {(line: string) => void} [opts.log] where paper-mode "would-be tx" lines go; defaults to console.log.
 * @param {() => boolean} [opts.isLive] override for isTxLive(), for tests that want to toggle live/paper without touching process.env.
 * @returns {(payload: object) => Promise<void>} the submit fn to pass to drainOnce()
 */
export function createTxSubmitter(opts = {}) {
  const log = opts.log ?? ((line) => console.log(line));
  const checkLive = opts.isLive ?? isTxLive;
  return async function submit(payload) {
    if (checkLive()) {
      if (typeof opts.liveSubmitFn !== 'function') {
        throw new Error('XMBL_TX_LIVE=1 is set but no liveSubmitFn was provided to createTxSubmitter — refusing to silently fall back to paper mode');
      }
      await opts.liveSubmitFn(payload);
      return;
    }
    // PAPER MODE (default): log the full would-be tx and return success without any
    // network call. drainOnce() marks the queue entry done on this function's
    // success, exactly as it would for a real submission — that's the point: the
    // whole pipeline is exercisable without ever touching a network or spending gas.
    log(`[xmbl-tx paper-mode] would submit: ${JSON.stringify(payload)}`);
  };
}
