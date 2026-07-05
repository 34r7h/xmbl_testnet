/**
 * D3a cross-process convergence worker. Builds a ledger from a FIXED 27-tx set
 * using the deterministic addSealedBatch path, in one of two DIFFERENT add
 * orders selected by argv[2] ('A' = sequential, 'B' = reverse-interleaved), and
 * prints the cube id + cube merkle root + state root as a single JSON line.
 *
 * The convergence test spawns this as TWO independent OS processes with DIFFERENT
 * orders and asserts identical output: same set + different order + different
 * process → identical geometry. That is the D3a acceptance (a stronger check
 * than two ledgers in one process, matching the F4 pattern).
 */
import { rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Ledger } from '../../src/ledger.js';

function txs(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: 'utxo', from: `alice_${i}`, to: `bob_${i}`, amount: 1,
    timestamp: 1000 + i, validationTimestamp: 1000 + i,
  }));
}

// 'A' = sequential [0..26]; 'B' = reverse then interleave halves — a genuinely
// different arrival order over the SAME set.
function order(variant, base) {
  if (variant === 'A') return base;
  const a = [...base].reverse();
  const out = [];
  const half = Math.ceil(a.length / 2);
  for (let i = 0; i < half; i++) {
    out.push(a[i]);
    if (i + half < a.length) out.push(a[i + half]);
  }
  return out;
}

async function main() {
  const variant = process.argv[2] === 'B' ? 'B' : 'A';
  const dbPath = mkdtempSync(join(tmpdir(), `xclt-seal-${variant}-`));
  const ledger = new Ledger({ dbPath });

  await ledger.addSealedBatch(order(variant, txs(27)));
  await new Promise((r) => setTimeout(r, 200));

  const cubes = Array.from(ledger.cubes.values());
  const out = {
    variant,
    cubeCount: cubes.length,
    cubeIds: cubes.map((c) => c.id).sort(),
    cubeRoots: cubes.map((c) => c.getMerkleRoot()).sort(),
    stateRoot: await ledger.getStateRoot(),
  };

  await ledger.db.close();
  rmSync(dbPath, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(out) + '\n');
}

// Route the ledger's verbose formation logging to stderr so stdout is only our line.
const origLog = console.log;
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
main().then(() => { console.log = origLog; process.exit(0); })
  .catch((e) => { process.stderr.write('seal-worker error: ' + (e && e.stack || e) + '\n'); process.exit(1); });
