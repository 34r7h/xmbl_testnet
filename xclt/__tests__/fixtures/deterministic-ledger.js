/**
 * Shared deterministic-ledger fixture for cube-extraction tests.
 *
 * Builds a ledger from a FIXED set of transactions fed in a FIXED order, with
 * content-fixed timestamps (never Date.now()/hrtime). This removes every
 * process-relative input, so two independent node processes build byte-identical
 * cube structures — the property the extraction determinism test relies on.
 *
 * Used by both the jest suite and the standalone two-process worker so they
 * exercise the exact same ledger.
 */
import { Ledger } from '../../src/ledger.js';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Build a deterministic ledger.
 * @param {number} count - number of transactions to add (729 forms one level-2 cube)
 * @returns {Promise<{ledger: Ledger, dbPath: string}>}
 */
export async function buildDeterministicLedger(count = 729) {
  const dbPath = mkdtempSync(join(tmpdir(), 'xclt-extract-fixture-'));
  const ledger = new Ledger({ dbPath });
  for (let i = 0; i < count; i++) {
    await ledger.addTransaction({
      type: 'utxo',
      from: `alice_${i}`,
      to: `bob_${i}`,
      amount: 1,
      // Fixed, content-derived timestamps: deterministic across processes.
      timestamp: 1000 + i,
      validationTimestamp: 1000 + i,
    });
  }
  // Allow the async recursive cube-of-cubes formation to settle.
  await new Promise((r) => setTimeout(r, 500));
  return { ledger, dbPath };
}
