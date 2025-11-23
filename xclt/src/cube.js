import { createHash } from 'crypto';

export class Cube {
  constructor(timestamp = null) {
    this.faces = new Map(); // faceTimestamp -> Face (keyed by nanosecond timestamp)
    this.id = null;
    this.timestamp = timestamp || process.hrtime.bigint(); // Nanosecond timestamp - key for deterministic placement
    this.level = null; // Level of this cube (1 = atomic, 2+ = super-cube)
    this.validatorAverageTimestamp = null; // Average of all validator timestamps from blocks
  }

  /**
   * Get average timestamp from all blocks in this cube
   * Used for ordering cubes at level 1 (atomic transactions only)
   */
  getAverageTimestamp() {
    if (this.validatorAverageTimestamp !== null) {
      return typeof this.validatorAverageTimestamp === 'bigint' 
        ? this.validatorAverageTimestamp 
        : BigInt(Math.floor(this.validatorAverageTimestamp * 1000000));
    }
    
    const allTimestamps = [];
    for (const face of this.faces.values()) {
      for (const block of face.blocks.values()) {
        // Use validator timestamp if available (from xpc validation), otherwise block timestamp
        const timestamp = block.tx?.validationTimestamp || block.timestamp;
        const ts = typeof timestamp === 'bigint' ? timestamp : BigInt(timestamp * 1000000); // Convert ms to ns
        allTimestamps.push(ts);
      }
    }
    
    if (allTimestamps.length === 0) return this.timestamp || BigInt(0);
    const sum = allTimestamps.reduce((a, b) => a + b, BigInt(0));
    this.validatorAverageTimestamp = sum / BigInt(allTimestamps.length);
    return this.validatorAverageTimestamp;
  }

  addFace(face) {
    // Key faces by their nanosecond timestamp for deterministic placement
    this.faces.set(face.timestamp.toString(), face);
    if (this.faces.size === 3) {
      this.id = this._calculateCubeId();
    }
  }

  getFace(timestamp) {
    // Get face by timestamp (nanoseconds)
    const key = typeof timestamp === 'bigint' ? timestamp.toString() : timestamp;
    return this.faces.get(key);
  }

  getFaceByIndex(index) {
    // Helper to get face by index (for backward compatibility)
    for (const face of this.faces.values()) {
      if (face.index === index) return face;
    }
    return null;
  }

  isComplete() {
    return this.faces.size === 3;
  }

  getMerkleRoot() {
    if (!this.isComplete()) {
      return null;
    }
    // Get faces sorted by index (0, 1, 2)
    const sortedFaces = Array.from(this.faces.values())
      .sort((a, b) => (a.index || 0) - (b.index || 0));
    
    const faceRoots = Array.from({ length: 3 }, (_, i) => {
      const face = sortedFaces[i];
      return face ? face.getMerkleRoot() : '0'.repeat(64);
    });
    return this._calculateMerkleRoot(faceRoots);
  }

  _calculateCubeId() {
    // Sort faces by hash (lowest = front/0, highest = back/2)
    const sortedFaces = Array.from(this.faces.values()).sort((a, b) => {
      const hashA = a.getHash ? a.getHash() : a.getMerkleRoot();
      const hashB = b.getHash ? b.getHash() : b.getMerkleRoot();
      return hashA.localeCompare(hashB);
    });
    
    const faceRoots = sortedFaces
      .map(face => face.getMerkleRoot())
      .join('');
    return createHash('sha256').update(faceRoots).digest('hex').substring(0, 16);
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

