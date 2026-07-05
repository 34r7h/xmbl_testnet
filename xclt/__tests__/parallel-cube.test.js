import { describe, test, expect } from '@jest/globals';
import { Face } from '../src/face.js';
import { Block } from '../src/block.js';

// This suite previously asserted a PARALLEL-CUBE / conflict-resolution model:
// face.addBlock returning {conflict, resolved, displacedBlock}, with later/earlier
// timestamps displacing blocks and spawning parallel cubes. That model was
// intentionally REMOVED — immediate (digital-root) placement produced frequent
// position collisions whose parallel builds were orphaned and stalled cube
// construction. Placement is now hash-sort on a full face, which is deterministic
// and order-independent, so there are no conflicts and no parallel builds to
// resolve. These tests assert that replacement behavior.

function makeBlock(to, amount) {
  return Block.fromTransaction({ type: 'utxo', to, amount, from: 'alice' });
}

describe('Hash-based placement (replaces the removed parallel-cube model)', () => {
  test('addBlock has no conflict-resolution return value (the removed API)', () => {
    const face = new Face(0);
    const result = face.addBlock(makeBlock('bob1', 1));
    // The old model returned {conflict, resolved, displacedBlock}; the current
    // model simply accumulates and returns nothing.
    expect(result).toBeUndefined();
  });

  test('blocks that would have "collided" both accumulate — no displacement', () => {
    const face = new Face(0);
    const a = makeBlock('bob1', 1);
    const b = makeBlock('bob2', 2);
    face.addBlock(a);
    face.addBlock(b);
    // Neither block is displaced; both are pending until the face fills to 9.
    expect(face.pendingBlocks.length).toBe(2);
    expect(face.isComplete()).toBe(false);
  });

  test('a completed face is deterministic regardless of arrival order (no parallel builds)', () => {
    const blocks = Array.from({ length: 9 }, (_, i) => makeBlock(`bob${i}`, i + 1));

    const faceA = new Face(0);
    blocks.forEach((blk) => faceA.addBlock(blk));

    const faceB = new Face(0);
    [...blocks].reverse().forEach((blk) => faceB.addBlock(blk));

    // Identical position→block map for both orders: the determinism that made
    // order-dependent parallel builds unnecessary.
    for (let position = 0; position < 9; position++) {
      expect(faceB.getBlock(position).id).toBe(faceA.getBlock(position).id);
    }
  });

  test('a face never exceeds 9 blocks (no overflow into parallel structures)', () => {
    const face = new Face(0);
    for (let i = 0; i < 12; i++) face.addBlock(makeBlock(`bob${i}`, i + 1));
    expect(face.blocks.size).toBe(9);
    expect(face.isComplete()).toBe(true);
  });
});
