import { createHash } from 'crypto';

/**
 * Sort blocks by hash and assign positions 0-8
 * Lowest hash = position 0, highest hash = position 8
 * @param {Array<Block>} blocks - Array of blocks to sort
 * @returns {Map<number, Block>} Map of position -> Block
 */
export function sortBlocksByHash(blocks) {
  const sorted = [...blocks].sort((a, b) => {
    const hashA = a.hash || createHash('sha256').update(a.id).digest('hex');
    const hashB = b.hash || createHash('sha256').update(b.id).digest('hex');
    return hashA.localeCompare(hashB);
  });
  
  const result = new Map();
  sorted.forEach((block, index) => {
    result.set(index, block);
  });
  return result;
}

/**
 * Get face index by sorting faces by hash
 * Lowest hash = front face (0), highest hash = back face (2)
 * @param {Array<Face>} faces - Array of faces to sort
 * @returns {Map<number, Face>} Map of faceIndex -> Face
 */
export function sortFacesByHash(faces) {
  const sorted = [...faces].sort((a, b) => {
    const hashA = a.getHash ? a.getHash() : createHash('sha256').update(a.getMerkleRoot()).digest('hex');
    const hashB = b.getHash ? b.getHash() : createHash('sha256').update(b.getMerkleRoot()).digest('hex');
    return hashA.localeCompare(hashB);
  });
  
  const result = new Map();
  sorted.forEach((face, index) => {
    face.index = index; // Assign face index based on sorted order
    result.set(index, face);
  });
  return result;
}

/**
 * Get hash of a block ID for sorting purposes
 * @param {string} blockId - Block ID
 * @returns {string} Hash of block ID
 */
export function getBlockHash(blockId) {
  return createHash('sha256').update(blockId).digest('hex');
}

/**
 * Legacy function for backward compatibility
 * Position is now determined by hash sorting when face completes
 * This returns a placeholder - actual position is set when face is sorted
 * @deprecated Position is now determined by hash sorting
 */
export function getBlockPosition(blockId, digitalRoot) {
  // Legacy: return placeholder position
  // Actual position is determined when face completes (9 blocks sorted by hash)
  return 0;
}

/**
 * Legacy function for backward compatibility
 * Face index is now determined by hash sorting when cube completes
 * This returns a placeholder - actual index is set when cube is sorted
 * @deprecated Face index is now determined by hash sorting
 */
export function getFaceIndex(blockId) {
  // Legacy: return placeholder face index
  // Actual face index is determined when cube completes (3 faces sorted by hash)
  return 0;
}

