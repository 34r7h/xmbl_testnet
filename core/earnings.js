/**
 * Node earnings ledger (E5) — non-cashable testnet accounting of what this
 * node has "earned" from group-E role participation. Paper units only; no
 * real-money meaning, no cash-out path. Derives everything from the role
 * counters those roles already own (E1's validationsCompleted, E2's
 * xsc.shardsStored, E3's computeNode.computeJobsRun) rather than tracking a
 * separate count anywhere — one source of truth per counter, no double
 * bookkeeping.
 *
 * PAPER_RATES are arbitrary placeholder credit-per-unit values, not tied to
 * any real currency or market price (see xsc/src/pricing.js for the actual
 * storage/compute pricing model — this ledger is a participation scoreboard,
 * not a payment system).
 */

export const PAPER_RATES = Object.freeze({
  validate: 1,
  storage: 1,
  compute: 1,
  // E4 (leader participation) hasn't landed yet, so this rate is unused today
  // — lead.units stays honestly 0 below until core exposes a lead counter.
  lead: 5,
});

/**
 * Build the earnings snapshot from the live core. Every field is read via
 * optional chaining with a `?? 0` fallback: on a node where a given role
 * isn't enabled (or hasn't merged yet), that role's units — and therefore
 * its earned total — are honestly 0, never faked.
 * @param {import('./index.js').XMBLCore} core
 * @returns {{currency: string, by_role: object, total_earned: number}}
 */
export function collectEarnings(core) {
  const units = {
    validate: core?.validationsCompleted ?? 0,
    storage: core?.xsc?.shardsStored ?? 0,
    compute: core?.computeNode?.computeJobsRun ?? 0,
    // No lead-role counter exists on core yet (E4 not implemented) — 0, not faked.
    lead: core?.leadBatchesSealed ?? 0,
  };

  const by_role = {};
  let total_earned = 0;
  for (const role of Object.keys(PAPER_RATES)) {
    const roleUnits = units[role];
    const earned = roleUnits * PAPER_RATES[role];
    by_role[role] = { units: roleUnits, rate: PAPER_RATES[role], earned };
    total_earned += earned;
  }

  return { currency: 'paper', by_role, total_earned };
}
