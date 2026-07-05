/**
 * Standalone extraction worker for the CROSS-PROCESS determinism test.
 *
 * Builds the shared deterministic ledger, extracts the level-2 cube at index 0
 * (exercising the full cube-of-cubes recursion), serializes it, and prints a
 * single JSON line of determinism-critical facts to stdout. The test spawns this
 * as TWO independent OS processes and asserts byte-identical stdout — a stronger
 * guarantee than two instances in one process (which could mask an hrtime leak).
 *
 * Prints ONLY content-derived values (no paths, no timestamps) so any process
 * divergence shows up as a real byte diff, not incidental noise.
 */
import { createHash } from 'crypto';
import { rmSync } from 'fs';
import { buildDeterministicLedger } from './deterministic-ledger.js';
import { extractFromLedger, serializeExtraction } from '../../src/cube-extraction.js';

async function main() {
  const { ledger, dbPath } = await buildDeterministicLedger(729);

  const extraction = extractFromLedger(ledger, 2, 0);
  const bytes = serializeExtraction(extraction);

  const out = {
    cubeAddress: extraction.cubeAddress,
    coordCount: extraction.coordinates.length,
    // digest of the full serialized bytes — the value cube-curve would hash
    serializedSha256: createHash('sha256').update(bytes).digest('hex'),
    // first + last coordinate pin the ordering endpoints
    first: extraction.coordinates[0],
    last: extraction.coordinates[extraction.coordinates.length - 1],
  };

  await ledger.db.close();
  rmSync(dbPath, { recursive: true, force: true });

  // Silence the ledger's verbose formation logging so stdout is ONLY our line.
  process.stdout.write(JSON.stringify(out) + '\n');
}

// Route the ledger's console.log noise to stderr so the child's stdout is clean.
const origLog = console.log;
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

main().then(() => { console.log = origLog; process.exit(0); })
  .catch((e) => { process.stderr.write('worker error: ' + (e && e.stack || e) + '\n'); process.exit(1); });
