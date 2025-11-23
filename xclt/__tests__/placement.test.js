import { describe, test, expect } from '@jest/globals';
import { getBlockPosition, getFaceIndex } from '../src/placement.js';

describe('Block Placement', () => {
  test('should calculate face position from digital root', () => {
    const position = getBlockPosition('abc123', 5); // digital root = 5
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThan(9);
  });

  test('should calculate face index from block ID', () => {
    const faceIndex = getFaceIndex('block123');
    expect(faceIndex).toBeGreaterThanOrEqual(0);
    expect(faceIndex).toBeLessThan(3);
  });

  test('should be deterministic', () => {
    const blockId = 'block123';
    const pos1 = getBlockPosition(blockId, 5);
    const pos2 = getBlockPosition(blockId, 5);
    expect(pos1).toBe(pos2);
  });
});




