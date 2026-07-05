import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { rmSync } from 'fs';
import { buildDeterministicLedger } from './fixtures/deterministic-ledger.js';
import { extractCube, extractFromLedger, serializeExtraction } from '../src/cube-extraction.js';
import { calculateBlockCoords } from '../src/geometry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Building 729 txs (27 L1 cubes -> 1 L2 cube) is the heavy setup; do it once.
jest.setTimeout(60000);

describe('Cube-of-cubes extraction (F4)', () => {
  let ledger;
  let dbPath;

  beforeAll(async () => {
    const built = await buildDeterministicLedger(729);
    ledger = built.ledger;
    dbPath = built.dbPath;
  });

  afterAll(async () => {
    if (ledger && ledger.db) await ledger.db.close();
    if (dbPath) rmSync(dbPath, { recursive: true, force: true });
  });

  test('substrate formed 27 level-1 cubes and 1 level-2 cube', () => {
    expect(ledger.cubes.size).toBe(27);
    const l2 = ledger.superCubes.get(2);
    expect(l2).toBeDefined();
    expect(l2.size).toBe(1);
  });

  test('a level-1 cube extracts to exactly 27 ordered leaf coordinates', () => {
    const ext = extractFromLedger(ledger, 1, 0);
    expect(typeof ext.cubeAddress).toBe('string');
    expect(ext.cubeAddress.length).toBeGreaterThan(0);
    expect(ext.coordinates).toHaveLength(27);
    for (const c of ext.coordinates) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
      expect(Number.isFinite(c.z)).toBe(true);
      expect(Number.isFinite(c.magnitude)).toBe(true);
    }
  });

  test('a level-2 cube extracts to 27*27 = 729 ordered leaf coordinates (full recursion)', () => {
    const ext = extractFromLedger(ledger, 2, 0);
    expect(ext.coordinates).toHaveLength(729);
  });

  test('first leaf of a level-1 cube is the (faceIndex 0, position 0) block offset from origin', () => {
    const ext = extractFromLedger(ledger, 1, 0);
    const expected = calculateBlockCoords(0, 0); // {x:-1, y:1, z:-1}
    expect(ext.coordinates[0].x).toBe(expected.x);
    expect(ext.coordinates[0].y).toBe(expected.y);
    expect(ext.coordinates[0].z).toBe(expected.z);
  });

  test('extraction is deterministic within a process (repeat -> identical bytes)', () => {
    const a = serializeExtraction(extractFromLedger(ledger, 2, 0));
    const b = serializeExtraction(extractFromLedger(ledger, 2, 0));
    expect(a.equals(b)).toBe(true);
  });

  test('serialization is order-sensitive (index-prefixed)', () => {
    const ext = extractFromLedger(ledger, 1, 0);
    const normal = serializeExtraction(ext);
    const swapped = serializeExtraction({
      cubeAddress: ext.cubeAddress,
      coordinates: [ext.coordinates[1], ext.coordinates[0], ...ext.coordinates.slice(2)],
    });
    // Same multiset of coordinates, different order -> different bytes.
    expect(normal.equals(swapped)).toBe(false);
  });

  test('ledger index resolution is by hash-sorted id, not timestamp', () => {
    // Collect ids in the order extractFromLedger resolves them; they must be
    // ascending by id (the deterministic, process-independent ordering).
    const ids = [];
    for (let i = 0; i < ledger.cubes.size; i++) {
      ids.push(extractFromLedger(ledger, 1, i).cubeAddress);
    }
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
    // And all distinct (no index collisions).
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('out-of-range index throws clearly', () => {
    expect(() => extractFromLedger(ledger, 1, 999)).toThrow(/no completed cube/);
  });

  test('invalid level/index arguments throw', () => {
    expect(() => extractFromLedger(ledger, 0, 0)).toThrow(/level must be/);
    expect(() => extractFromLedger(ledger, 1, -1)).toThrow(/index must be/);
  });

  test('extractCube rejects a non-cube', () => {
    expect(() => extractCube({})).toThrow(/requires a cube object/);
  });

  // The strong guarantee: two INDEPENDENT OS processes produce byte-identical
  // extraction output for the same simulated ledger. Byte-determinism across
  // processes is load-bearing (cube-curve hashes these bytes).
  test('two independent node processes produce identical extraction bytes (level-2)', () => {
    const worker = join(__dirname, 'fixtures', 'extract-worker.js');
    const run = () => execFileSync('node', [worker], { encoding: 'utf8', timeout: 45000 });
    const out1 = run();
    const out2 = run();
    expect(out1).toBe(out2);

    const parsed = JSON.parse(out1.trim().split('\n').pop());
    expect(parsed.coordCount).toBe(729); // level-2 recursion actually exercised
    expect(parsed.serializedSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
