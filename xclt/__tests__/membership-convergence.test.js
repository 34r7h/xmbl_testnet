import { describe, test, expect, jest } from '@jest/globals';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { Ledger } from '../src/ledger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
jest.setTimeout(60000);

function txs(n) {
  return Array.from({ length: n }, (_, i) => ({
    type: 'utxo', from: `alice_${i}`, to: `bob_${i}`, amount: 1,
    timestamp: 1000 + i, validationTimestamp: 1000 + i,
  }));
}
function interleave(base) {
  const out = [];
  const half = Math.ceil(base.length / 2);
  for (let i = 0; i < half; i++) {
    out.push(base[i]);
    if (i + half < base.length) out.push(base[i + half]);
  }
  return out;
}

async function buildSealed(order) {
  const dbPath = mkdtempSync(join(tmpdir(), 'xclt-conv-'));
  const ledger = new Ledger({ dbPath });
  await ledger.addSealedBatch(order);
  await new Promise((r) => setTimeout(r, 200));
  return { ledger, dbPath };
}
async function buildIncremental(order) {
  const dbPath = mkdtempSync(join(tmpdir(), 'xclt-incr-'));
  const ledger = new Ledger({ dbPath });
  for (const tx of order) await ledger.addTransaction(tx);
  await new Promise((r) => setTimeout(r, 200));
  return { ledger, dbPath };
}
function faceRootSet(ledger) {
  const roots = [];
  for (const cube of ledger.cubes.values())
    for (const face of cube.faces.values()) roots.push(face.getMerkleRoot());
  return roots.sort();
}
function cubeIdSet(ledger) {
  return Array.from(ledger.cubes.values()).map((c) => c.id).sort();
}
function superCubeIdSet(ledger) {
  const out = [];
  for (const [level, m] of ledger.superCubes.entries())
    for (const c of m.values()) out.push(`L${level}:${c.id}`);
  return out.sort();
}
async function teardown(...builts) {
  for (const b of builts) {
    if (b.ledger && b.ledger.db) await b.ledger.db.close();
    if (b.dbPath) rmSync(b.dbPath, { recursive: true, force: true });
  }
}

describe('Face-membership determinism across nodes (D3a)', () => {
  test('CONVERGENCE: same tx SET, different add order → identical geometry (sealed path)', async () => {
    const base = txs(27);
    const A = await buildSealed(base);
    const B = await buildSealed(interleave(base));

    // Identical face membership (roots), identical cube ids + roots, identical state root.
    expect(faceRootSet(A.ledger)).toEqual(faceRootSet(B.ledger));
    const cubeIds = (l) => Array.from(l.cubes.values()).map((c) => c.id).sort();
    const cubeRoots = (l) => Array.from(l.cubes.values()).map((c) => c.getMerkleRoot()).sort();
    expect(cubeIds(A.ledger)).toEqual(cubeIds(B.ledger));
    expect(cubeRoots(A.ledger)).toEqual(cubeRoots(B.ledger));
    expect(await A.ledger.getStateRoot()).toBe(await B.ledger.getStateRoot());

    await teardown(A, B);
  });

  test('CONVERGENCE (multi-cube): 81 txs → 3 cubes converge, exercising face→cube grouping', async () => {
    // 27 txs is the degenerate case (all 3 faces land in the one cube regardless
    // of grouping). 81 txs form 3 separate cubes, so this actually exercises the
    // face→cube grouping determinism, not just block→face membership.
    const base = txs(81);
    const A = await buildSealed(base);
    const B = await buildSealed(interleave(base));
    expect(A.ledger.cubes.size).toBe(3);
    expect(faceRootSet(A.ledger)).toEqual(faceRootSet(B.ledger));
    expect(cubeIdSet(A.ledger)).toEqual(cubeIdSet(B.ledger));
    expect(await A.ledger.getStateRoot()).toBe(await B.ledger.getStateRoot());
    await teardown(A, B);
  });

  test('CONVERGENCE (recursive): 729 txs → level-2 super-cube converges across order', async () => {
    // 729 txs → 27 level-1 cubes → 1 level-2 super-cube: proves the recursive
    // cube-of-cubes formation is also order-independent under the sealed path.
    const base = txs(729);
    const A = await buildSealed(base);
    const B = await buildSealed(interleave(base));
    expect(A.ledger.cubes.size).toBe(27);
    expect(A.ledger.superCubes.get(2)?.size).toBe(1);
    expect(faceRootSet(A.ledger)).toEqual(faceRootSet(B.ledger));
    expect(cubeIdSet(A.ledger)).toEqual(cubeIdSet(B.ledger));
    expect(superCubeIdSet(A.ledger)).toEqual(superCubeIdSet(B.ledger));
    expect(await A.ledger.getStateRoot()).toBe(await B.ledger.getStateRoot());
    await teardown(A, B);
  });

  test('CONTRAST: the legacy incremental path is order-DEPENDENT (the bug D3a fixes)', async () => {
    const base = txs(18); // 2 faces
    const A = await buildIncremental(base);
    const B = await buildIncremental(interleave(base));
    // Different arrival order partitions the same set into DIFFERENT faces:
    // face-root multisets diverge. (This is exactly what the sealed path fixes.)
    expect(faceRootSet(A.ledger)).not.toEqual(faceRootSet(B.ledger));
    await teardown(A, B);
  });

  test('a partial batch (< 9) seals nothing and stays pooled; a later batch completes the face', async () => {
    const b = await buildSealed(txs(5));
    expect(b.ledger.cubes.size).toBe(0);
    expect(b.ledger._membershipPool.length).toBe(5);
    const res = await b.ledger.addSealedBatch(txs(4).map((t, i) => ({ ...t, from: `carol_${i}` })));
    expect(res.sealedFaces).toBe(1); // 5 + 4 = 9 → one sealed face
    expect(b.ledger._membershipPool.length).toBe(0);
    await teardown(b);
  });

  // Strongest guarantee (F4 pattern): two INDEPENDENT processes, DIFFERENT add
  // orders, produce identical geometry bytes.
  test('two independent processes, different order, produce identical geometry', () => {
    const worker = join(__dirname, 'fixtures', 'seal-worker.js');
    const runA = execFileSync('node', [worker, 'A'], { encoding: 'utf8', timeout: 45000 });
    const runB = execFileSync('node', [worker, 'B'], { encoding: 'utf8', timeout: 45000 });
    const a = JSON.parse(runA.trim().split('\n').pop());
    const b = JSON.parse(runB.trim().split('\n').pop());

    expect(a.cubeCount).toBe(1);
    expect(a.cubeIds).toEqual(b.cubeIds);
    expect(a.cubeRoots).toEqual(b.cubeRoots);
    expect(a.stateRoot).toBe(b.stateRoot);
  });
});
