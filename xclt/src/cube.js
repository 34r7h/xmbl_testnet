import { createHash } from 'crypto';

export class Cube {
  constructor() {
    this.faces = new Map(); // faceIndex -> Face
    this.id = null;
  }

  addFace(face) {
    this.faces.set(face.index, face);
    if (this.faces.size === 3) {
      this.id = this._calculateCubeId();
    }
  }

  getFace(index) {
    return this.faces.get(index);
  }

  isComplete() {
    return this.faces.size === 3;
  }

  getMerkleRoot() {
    if (!this.isComplete()) {
      return null;
    }
    const faceRoots = Array.from({ length: 3 }, (_, i) => {
      const face = this.faces.get(i);
      return face ? face.getMerkleRoot() : '0'.repeat(64);
    });
    return this._calculateMerkleRoot(faceRoots);
  }

  _calculateCubeId() {
    const faceRoots = Array.from(this.faces.values())
      .map(face => face.getMerkleRoot())
      .sort()
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

