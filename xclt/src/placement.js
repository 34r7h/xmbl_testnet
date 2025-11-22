import { calculateDigitalRoot } from './digital-root.js';
import { createHash } from 'crypto';

export function getBlockPosition(blockId, digitalRoot) {
  // Position in 3x3 face (0-8, row-major)
  return (digitalRoot - 1) % 9;
}

export function getFaceIndex(blockId) {
  // Hash block ID to get consistent face index
  const hash = createHash('sha256').update(blockId).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16);
  return num % 3;
}

