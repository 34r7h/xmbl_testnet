import { sortBlocksByHash } from './placement.js';
import { createHash } from 'crypto';

export class Face {
  constructor(index, timestamp = null) {
    this.index = index;
    this.timestamp = timestamp || process.hrtime.bigint(); // Nanosecond timestamp - key for deterministic placement
    this.blocks = new Map(); // position -> Block (positions assigned when complete)
    this.pendingBlocks = []; // Array of blocks before sorting
    this._sorted = false; // Whether blocks have been sorted
  }

  addBlock(block) {
    // Skip if block already exists (by hash)
    const blockHash = block.hash || createHash('sha256').update(block.id).digest('hex');
    const existingBlock = Array.from(this.pendingBlocks).find(b => {
      const bHash = b.hash || createHash('sha256').update(b.id).digest('hex');
      return bHash === blockHash;
    });
    
    if (existingBlock) {
      return; // Block already exists, skip
    }
    
    // Skip if face already has 9 blocks
    if (this.pendingBlocks.length >= 9) {
      return; // Face is full
    }
    
    // Add block to pending list
    this.pendingBlocks.push(block);
    
    // When we have exactly 9 blocks, sort by hash and assign positions 0-8
    if (this.pendingBlocks.length === 9) {
      this._sortAndAssignPositions();
    }
  }
  
  _sortAndAssignPositions() {
    if (this._sorted && this.blocks.size === 9) return;
    
    // Sort blocks by hash (lowest hash = position 0, highest = position 8)
    const sorted = sortBlocksByHash(this.pendingBlocks);
    this.blocks = sorted;
    this._sorted = true;
  }
  
  getAverageTimestamp() {
    const blocksToUse = this.pendingBlocks.length > 0 ? this.pendingBlocks : Array.from(this.blocks.values());
    if (blocksToUse.length === 0) return this.timestamp || BigInt(0);
    // Use validator timestamp if available (from xpc validation), otherwise block timestamp
    const timestamps = blocksToUse.map(b => {
      const ts = b.tx?.validationTimestamp || b.timestamp;
      return typeof ts === 'bigint' ? ts : BigInt(ts * 1000000); // Convert ms to ns if needed
    });
    const sum = timestamps.reduce((a, b) => a + b, BigInt(0));
    return sum / BigInt(timestamps.length); // Return as bigint (nanoseconds)
  }

  getBlock(position) {
    // Ensure blocks are sorted if face is complete
    if (this.pendingBlocks.length === 9 && !this._sorted) {
      this._sortAndAssignPositions();
    }
    return this.blocks.get(position);
  }

  isComplete() {
    // Face is complete when it has 9 blocks (sorted by hash)
    return this.pendingBlocks.length === 9 && this._sorted;
  }

  getHash() {
    // Get hash of face for sorting (use merkle root)
    return this.getMerkleRoot();
  }

  getMerkleRoot() {
    // Ensure blocks are sorted before calculating merkle root
    if (this.pendingBlocks.length === 9 && !this._sorted) {
      this._sortAndAssignPositions();
    }
    
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

