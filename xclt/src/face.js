import { getBlockPosition } from './placement.js';
import { createHash } from 'crypto';

export class Face {
  constructor(index) {
    this.index = index;
    this.blocks = new Map(); // position -> Block
  }

  addBlock(block) {
    const position = getBlockPosition(block.id, block.digitalRoot);
    const existingBlock = this.blocks.get(position);
    
    // If position is taken, compare timestamps
    if (existingBlock) {
      // Earlier timestamp keeps position, later timestamp triggers parallel cube
      if (block.timestamp < existingBlock.timestamp) {
        // New block has earlier timestamp - replace existing
        this.blocks.set(position, block);
        return { conflict: true, resolved: true, displacedBlock: existingBlock };
      } else {
        // New block has later timestamp - should go to parallel cube
        return { conflict: true, resolved: false, existingBlock };
      }
    }
    
    // No conflict, add block normally
    this.blocks.set(position, block);
    return { conflict: false };
  }
  
  getAverageTimestamp() {
    if (this.blocks.size === 0) return 0;
    const timestamps = Array.from(this.blocks.values()).map(b => b.timestamp);
    return timestamps.reduce((sum, ts) => sum + ts, 0) / timestamps.length;
  }

  getBlock(position) {
    return this.blocks.get(position);
  }

  isComplete() {
    return this.blocks.size === 9;
  }

  getMerkleRoot() {
    // Build Merkle tree from blocks
    const blockHashes = Array.from({ length: 9 }, (_, i) => {
      const block = this.blocks.get(i);
      return block ? block.hash : '0'.repeat(64);
    });
    // Simple Merkle root calculation
    return this._calculateMerkleRoot(blockHashes);
  }

  _calculateMerkleRoot(hashes) {
    if (hashes.length === 1) return hashes[0];
    const nextLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      const combined = createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }
    return this._calculateMerkleRoot(nextLevel);
  }
}

