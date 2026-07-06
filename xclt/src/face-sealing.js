/**
 * Deterministic face-membership sealing (D3a, part 2a).
 *
 * THE BUG THIS FIXES: in the legacy incremental path (ledger.addTransaction),
 * WHICH nine blocks form a face is chosen by LOCAL arrival order (a block joins
 * the oldest non-full pending face). Two validators that see the same
 * transactions in a different order therefore partition them into DIFFERENT
 * 9-block faces — different face merkle roots, different cube merkle roots,
 * forked geometry. Hash-sort placement (face.js / placement.js) only fixes the
 * POSITION of a block WITHIN a face; it does not fix WHICH face it belongs to.
 *
 * THE FIX: seal membership as a pure function of the transaction SET. Given a
 * pool of blocks, sort the ENTIRE pool by block hash and chunk it into
 * consecutive groups of 9. The lowest-9-by-hash become one face, the next 9 the
 * next face, and so on; a remainder of fewer than 9 stays unsealed. Any node
 * holding the same SET of blocks produces the identical partition regardless of
 * the order the blocks arrived — so face membership converges across nodes.
 *
 * SCOPE (per the D3a ruling): this is the ledger-LOCAL deterministic seal. It
 * assumes a fixed pool (the caller decides WHEN to seal and WHICH blocks are in
 * the set). Agreeing on that seal boundary across nodes live — leaders sealing
 * batches over consensus — is the separate follow-up (2b), gated on the xpc
 * gossip path (G2b). The partition RULE here (global hash-sort → chunk-9) is the
 * stable core that 2b will feed an agreed set into.
 *
 * This module is pure and ledger-independent: it takes blocks and a Face factory,
 * so it is exercised directly with synthetic blocks in the unit test.
 */

import { Face } from './face.js';

/**
 * Canonical hash comparator for blocks — the same ordering used everywhere else
 * in xclt (placement.sortBlocksByHash). A block's `hash` is its content sha256;
 * we never fall back to anything process-relative, so the order is byte-stable
 * across nodes.
 *
 * @param {{hash: string, id: string}} a
 * @param {{hash: string, id: string}} b
 * @returns {number}
 */
function byHash(a, b) {
  const ha = a.hash || a.id;
  const hb = b.hash || b.id;
  return ha < hb ? -1 : ha > hb ? 1 : 0;
}

/**
 * Deterministically partition a pool of blocks into sealed faces.
 *
 * @param {Array<object>} blocks - the pool of blocks to seal (each needs a `hash`)
 * @param {object} [opts]
 * @param {() => object} [opts.faceFactory] - construct an empty Face (default `new Face(0)`);
 *   the face index is temporary — it is assigned for real when the cube is finalized.
 * @returns {{faces: Array<object>, leftover: Array<object>}}
 *   `faces`: one Face per full group of 9 (blocks hash-sorted into positions 0-8),
 *   in ascending hash-group order; `leftover`: the remaining < 9 blocks (still
 *   hash-sorted) that did not fill a face.
 */
export function sealBlocksIntoFaces(blocks, opts = {}) {
  const faceFactory = opts.faceFactory || (() => new Face(0));
  if (!Array.isArray(blocks)) {
    throw new Error('sealBlocksIntoFaces: blocks must be an array');
  }

  // Global hash sort: membership becomes a pure function of the SET.
  const sorted = [...blocks].sort(byHash);

  const faces = [];
  let i = 0;
  for (; i + 9 <= sorted.length; i += 9) {
    const group = sorted.slice(i, i + 9);
    const face = faceFactory();
    // addBlock accumulates; on the 9th it hash-sorts the group into positions 0-8.
    for (const block of group) face.addBlock(block);
    faces.push(face);
  }
  const leftover = sorted.slice(i);
  return { faces, leftover };
}
