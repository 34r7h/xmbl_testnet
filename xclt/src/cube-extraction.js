/**
 * Cube-of-cubes extraction (F4) — the ledger-side reader.
 *
 * Given a cube (or a (level, index) into a ledger), emit the ORDERED
 * coordinate/vector set of the leaf blocks it contains, recursing through the
 * cube-of-cubes hierarchy. The output is BYTE-STABLE across nodes for the same
 * ledger state: two independent node processes built from identical transactions
 * produce identical extraction bytes. That determinism is load-bearing — the
 * downstream cube-curve construction hashes these bytes.
 *
 * OUTPUT SHAPE — INTERPRETATION (flagged for advisor repro):
 *   "the ORDERED coordinate/vector set of its 27 units, recursing through
 *   cube-of-cubes levels" is read as: FLATTEN to every LEAF block coordinate
 *   reachable from the cube, in canonical traversal order (not 27 direct-unit
 *   summaries). A level-1 cube yields 27 leaves; a level-2 cube yields 27×27=729;
 *   a level-L cube yields 27^L. This matches the consumer contract in
 *   xid/src/curve-source.js (CurveRequest.coordinates: an array of {x,y,z,magnitude}
 *   with a VARIABLE length `n`, order significant). We deliberately DO NOT import
 *   xid here — xclt stays independent of xid (see curve-source.js header); the
 *   output plugs into CurveRequest by shape, not by coupling.
 *
 * DETERMINISM MODEL (verified by a two-process test, see __tests__):
 *   - Traversal order is CONTENT-derived, never timestamp-derived:
 *       faces are visited in their hash-sorted `.index` order (0,1,2), and within
 *       a face the 9 units are visited by position 0..8 (hash-sorted at formation).
 *   - Cube ids are hash-derived from transaction content.
 *   - Ledger index resolution (extractFromLedger) sorts cubes at a level by `id`
 *     (hash) ascending — NEVER by average timestamp, which is process-relative
 *     (process.hrtime.bigint / Date.now leak) and would resolve indices
 *     differently across nodes.
 *
 * COORDINATES: composed from the xclt geometry primitives A7 fixed
 *   (calculateBlockCoords for the leaf offset within its atomic cube;
 *   calculateCubeCoords for each ancestor cube's slot offset). Each nesting level
 *   is spaced 3× wider than the one below (INITIAL_SCALE = 3^(level-1), divided
 *   by 3 per descent) so sub-structures tile without overlap. The exact geometric
 *   layout is not part of the acceptance (determinism + use of the primitives is);
 *   canonicalization downstream is index-prefixed, so duplicate values would be
 *   harmless in any case.
 */

import { calculateBlockCoords, calculateCubeCoords, calculateVector } from './geometry.js';
import { sortFacesByHash } from './placement.js';

/**
 * Return the 3 faces of a cube in canonical (hash-sorted) index order.
 * Formation assigns face.index (0,1,2) via sortFacesByHash. We trust those
 * indices when they are a clean {0,1,2} permutation; otherwise we re-derive the
 * order with the SAME comparator (never a re-implemented one) so the ordering is
 * airtight even for a cube that was assembled outside the normal path.
 *
 * @param {Object} cube - a Cube or SuperCube with a `faces` Map
 * @returns {Array<Object>} exactly 3 faces, ordered 0,1,2
 */
function facesInOrder(cube) {
  const faces = Array.from(cube.faces.values());
  if (faces.length !== 3) {
    throw new Error(`cube-extraction: expected 3 faces, got ${faces.length} (incomplete cube)`);
  }
  const indices = faces.map((f) => f.index).sort((a, b) => a - b);
  const cleanPermutation = indices[0] === 0 && indices[1] === 1 && indices[2] === 2;
  if (cleanPermutation) {
    return [...faces].sort((a, b) => a.index - b.index);
  }
  // Fall back to the canonical hash comparator (mutates .index and returns a Map)
  return Array.from(sortFacesByHash(faces).values());
}

/**
 * Recurse a cube to its ordered leaf coordinate/vector set.
 *
 * @param {Object} cube - Cube (atomic) or SuperCube
 * @param {number} level - hierarchical level (1 = atomic; 2+ = super-cube)
 * @param {{x:number,y:number,z:number}} origin - accumulated offset for this cube
 * @param {number} scale - spacing multiplier for this cube's unit grid
 * @param {Array} out - accumulator of {x,y,z,magnitude}
 */
function extractInto(cube, level, origin, scale, out) {
  const faces = facesInOrder(cube);

  for (let faceIndex = 0; faceIndex < 3; faceIndex++) {
    const face = faces[faceIndex];

    if (level === 1) {
      // Leaf level: units are blocks. Read by hash-sorted position 0..8.
      if (!face.blocks) {
        throw new Error('cube-extraction: level-1 face has no blocks (structure mismatch)');
      }
      for (let position = 0; position < 9; position++) {
        const block = face.blocks.get(position);
        if (!block) {
          throw new Error(`cube-extraction: missing leaf block at face ${faceIndex} position ${position} (incomplete cube)`);
        }
        const local = calculateBlockCoords(faceIndex, position); // components in {-1,0,1}
        const coord = {
          x: origin.x + local.x,
          y: origin.y + local.y,
          z: origin.z + local.z,
        };
        const vector = calculateVector(coord);
        out.push({ x: coord.x, y: coord.y, z: coord.z, magnitude: vector.magnitude });
      }
    } else {
      // Internal level: units are child cubes held in the higher-level face's
      // `cubes` map (position -> Cube), hash-sorted at formation.
      if (!face.cubes) {
        throw new Error('cube-extraction: internal face has no child cubes (structure mismatch)');
      }
      for (let position = 0; position < 9; position++) {
        const child = face.cubes.get(position);
        if (!child) {
          throw new Error(`cube-extraction: missing child cube at face ${faceIndex} position ${position} (incomplete cube)`);
        }
        const unitIndex = faceIndex * 9 + position; // 0..26 within this cube
        const slot = calculateCubeCoords(unitIndex, 1); // {0,±3,±6}
        const childOrigin = {
          x: origin.x + slot.x * scale,
          y: origin.y + slot.y * scale,
          z: origin.z + slot.z * scale,
        };
        extractInto(child, level - 1, childOrigin, scale / 3, out);
      }
    }
  }
}

/**
 * Extract the ordered leaf coordinate/vector set of a cube.
 *
 * @param {Object} cube - a completed Cube (atomic) or SuperCube
 * @returns {{cubeAddress: string, coordinates: Array<{x:number,y:number,z:number,magnitude:number}>}}
 *   `cubeAddress` = the cube's hash-derived id; `coordinates` = the ordered leaf set
 *   (length 27^level). Shape-compatible with xid CurveRequest.
 */
export function extractCube(cube) {
  if (!cube || typeof cube !== 'object' || !cube.faces) {
    throw new Error('cube-extraction: extractCube requires a cube object with faces');
  }
  if (typeof cube.isComplete === 'function' && !cube.isComplete()) {
    throw new Error('cube-extraction: cube is not complete (needs 3 faces)');
  }
  // Atomic Cube leaves this.level = null; treat null/undefined as level 1.
  const level = cube.level || 1;
  const out = [];
  extractInto(cube, level, { x: 0, y: 0, z: 0 }, Math.pow(3, level - 1), out);
  return { cubeAddress: cube.id, coordinates: out };
}

/**
 * Resolve a cube by (level, index) from a ledger and extract it.
 *
 * Index resolution is DETERMINISTIC across nodes: completed cubes at the level
 * are sorted by their hash-derived `id` (ascending) and indexed into. This is
 * intentionally NOT ledger.getCubes()/average-timestamp order, which is
 * process-relative and would pick a different cube per node for the same index.
 *
 * @param {Object} ledger - an xclt Ledger
 * @param {number} level - 1 for atomic cubes, 2+ for super-cubes
 * @param {number} index - position in the id-sorted list of completed cubes at that level
 * @returns {{cubeAddress: string, coordinates: Array}}
 */
export function extractFromLedger(ledger, level, index) {
  if (!ledger) throw new Error('cube-extraction: ledger is required');
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`cube-extraction: level must be an integer >= 1, got ${level}`);
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`cube-extraction: index must be a non-negative integer, got ${index}`);
  }

  let cubes;
  if (level === 1) {
    cubes = Array.from(ledger.cubes.values());
  } else {
    const atLevel = ledger.superCubes && ledger.superCubes.get(level);
    cubes = atLevel ? Array.from(atLevel.values()) : [];
  }

  const complete = cubes.filter((c) => (typeof c.isComplete === 'function' ? c.isComplete() : c.faces && c.faces.size === 3));
  // Deterministic index: sort by hash-derived id (never by timestamp).
  complete.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (index >= complete.length) {
    throw new Error(`cube-extraction: no completed cube at level ${level} index ${index} (have ${complete.length})`);
  }
  return extractCube(complete[index]);
}

/**
 * Byte-stable serialization of an extraction, suitable for hashing.
 *
 * Canonical, order-preserving string: address, count, then each coordinate
 * prefixed by its index so a reordering of identical values changes the bytes.
 * Numbers are emitted via a canonical formatter (finite check + Number.toString,
 * which is IEEE-754 shortest-round-trip and identical across V8 processes; -0 is
 * normalized to 0). Returns a Buffer (UTF-8) so callers can hash it directly.
 *
 * This mirrors the canonical form xid/src/curve-source.js expects, but is
 * implemented locally so xclt stays independent of xid.
 *
 * @param {{cubeAddress: string, coordinates: Array}} extraction
 * @returns {Buffer}
 */
export function serializeExtraction(extraction) {
  if (!extraction || typeof extraction !== 'object') {
    throw new Error('cube-extraction: serializeExtraction requires an extraction object');
  }
  const { cubeAddress, coordinates } = extraction;
  if (cubeAddress === undefined || cubeAddress === null) {
    throw new Error('cube-extraction: extraction.cubeAddress is required');
  }
  if (!Array.isArray(coordinates)) {
    throw new Error('cube-extraction: extraction.coordinates must be an array');
  }

  const num = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`cube-extraction: non-finite coordinate value ${v}`);
    }
    return Object.is(v, -0) ? '0' : v.toString();
  };

  const parts = [`addr=${String(cubeAddress)}`, `n=${coordinates.length}`];
  for (let i = 0; i < coordinates.length; i++) {
    const c = coordinates[i];
    if (!c || typeof c !== 'object') {
      throw new Error(`cube-extraction: coordinate[${i}] must be an object`);
    }
    let seg = `${i}:${num(c.x)},${num(c.y)},${num(c.z)}`;
    if (c.magnitude !== undefined) seg += `,m=${num(c.magnitude)}`;
    parts.push(seg);
  }
  return Buffer.from(parts.join('|'), 'utf8');
}
