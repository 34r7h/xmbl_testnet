import { describe, test, expect } from '@jest/globals';
import { sealBlocksIntoFaces } from '../src/face-sealing.js';
import { Face } from '../src/face.js';
import { Block } from '../src/block.js';

function makeBlocks(n) {
  return Array.from({ length: n }, (_, i) =>
    Block.fromTransaction({ type: 'utxo', to: `bob_${i}`, amount: i + 1, from: 'alice' }));
}

describe('sealBlocksIntoFaces — deterministic face membership (D3a)', () => {
  test('partitions a pool into full faces of 9, hash-sorted membership', () => {
    const blocks = makeBlocks(18);
    const { faces, leftover } = sealBlocksIntoFaces(blocks);
    expect(faces).toHaveLength(2);
    expect(leftover).toHaveLength(0);
    faces.forEach((f) => {
      expect(f.isComplete()).toBe(true);
      expect(f.blocks.size).toBe(9);
    });
  });

  test('remainder of < 9 stays as leftover, not sealed', () => {
    const { faces, leftover } = sealBlocksIntoFaces(makeBlocks(21)); // 2 faces + 3 left
    expect(faces).toHaveLength(2);
    expect(leftover).toHaveLength(3);
  });

  test('MEMBERSHIP is a function of the SET, not the order (the core property)', () => {
    const blocks = makeBlocks(18);
    // Two very different orderings of the SAME set.
    const orderA = blocks;
    const orderB = [];
    for (let i = 0; i < 9; i++) { orderB.push(blocks[i]); orderB.push(blocks[i + 9]); }

    const sealA = sealBlocksIntoFaces(orderA);
    const sealB = sealBlocksIntoFaces(orderB);

    // Each face's membership (the SET of block ids at positions 0-8) is identical.
    const membership = (seal) => seal.faces
      .map((f) => Array.from({ length: 9 }, (_, p) => f.getBlock(p).id).join(','))
      .sort();
    expect(membership(sealA)).toEqual(membership(sealB));
  });

  test('lowest-9-by-hash form the first face (chunk order is ascending hash)', () => {
    const blocks = makeBlocks(18);
    const sortedIds = [...blocks].sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)).map((b) => b.id);
    const { faces } = sealBlocksIntoFaces(blocks);
    const face0Ids = Array.from({ length: 9 }, (_, p) => faces[0].getBlock(p).id);
    // Every id in face 0 is among the lowest-9-by-hash of the pool.
    expect(new Set(face0Ids)).toEqual(new Set(sortedIds.slice(0, 9)));
  });

  test('honors a custom faceFactory', () => {
    let made = 0;
    const { faces } = sealBlocksIntoFaces(makeBlocks(9), { faceFactory: () => { made++; return new Face(0); } });
    expect(made).toBe(1);
    expect(faces).toHaveLength(1);
  });

  test('rejects a non-array pool', () => {
    expect(() => sealBlocksIntoFaces(null)).toThrow(/must be an array/);
  });
});

describe('Face.addBlock full-face hardening (D3a)', () => {
  test('an accepted add still returns undefined (unchanged API)', () => {
    const face = new Face(0);
    expect(face.addBlock(makeBlocks(1)[0])).toBeUndefined();
  });

  test('adding to a FULL face returns an explicit falsy rejection, not silent', () => {
    const face = new Face(0);
    const blocks = makeBlocks(10);
    for (let i = 0; i < 9; i++) face.addBlock(blocks[i]);
    expect(face.isComplete()).toBe(true);
    const result = face.addBlock(blocks[9]);
    expect(result).toBe(false); // explicit rejection value
  });

  test('a full-face rejection does not grow the face past 9 (no throw)', () => {
    const face = new Face(0);
    const blocks = makeBlocks(12);
    expect(() => blocks.forEach((b) => face.addBlock(b))).not.toThrow();
    expect(face.blocks.size).toBe(9);
    expect(face.isComplete()).toBe(true);
  });
});
