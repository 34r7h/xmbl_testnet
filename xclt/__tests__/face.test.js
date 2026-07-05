import { describe, test, expect } from '@jest/globals';
import { Face } from '../src/face.js';
import { Block } from '../src/block.js';

// Placement is hash-based (the digital-root immediate-placement model was
// intentionally removed — it spawned orphaned parallel builds that stalled cube
// construction). A face accumulates blocks until it holds 9, then sorts them by
// hash to assign positions 0-8 (lowest hash = position 0). These tests assert
// that current behavior.

function makeBlocks(n) {
  return Array.from({ length: n }, (_, i) =>
    Block.fromTransaction({ type: 'utxo', to: `bob${i}`, amount: i + 1, from: 'alice' }),
  );
}

describe('Face', () => {
  test('should create empty face', () => {
    const face = new Face(0);
    expect(face.index).toBe(0);
    expect(face.blocks.size).toBe(0);
  });

  test('should accumulate blocks and complete at 9 (hash-based)', () => {
    const face = new Face(0);
    const blocks = makeBlocks(9);
    // Placement is deferred: positions are not assigned until the face is full.
    blocks.slice(0, 8).forEach((b) => face.addBlock(b));
    expect(face.isComplete()).toBe(false);
    face.addBlock(blocks[8]);
    expect(face.isComplete()).toBe(true);
    expect(face.blocks.size).toBe(9);
  });

  test('should assign positions by hash sort, independent of insertion order', () => {
    const blocks = makeBlocks(9);

    const faceA = new Face(0);
    blocks.forEach((b) => faceA.addBlock(b));

    const faceB = new Face(0);
    [...blocks].reverse().forEach((b) => faceB.addBlock(b));

    // Same 9 blocks in a different order must yield the SAME position→block map —
    // this determinism is exactly what replaced the order-dependent parallel builds.
    for (let position = 0; position < 9; position++) {
      expect(faceB.getBlock(position).id).toBe(faceA.getBlock(position).id);
    }
    // position 0 holds the lowest-hash block
    const lowest = [...blocks].sort((a, b) => a.hash.localeCompare(b.hash))[0];
    expect(faceA.getBlock(0).id).toBe(lowest.id);
  });

  test('should get block by hash-sorted position', () => {
    const face = new Face(0);
    const blocks = makeBlocks(9);
    blocks.forEach((b) => face.addBlock(b));
    const retrieved = face.getBlock(0);
    expect(retrieved).toBeDefined();
    expect(blocks.some((b) => b.id === retrieved.id)).toBe(true);
  });
});
