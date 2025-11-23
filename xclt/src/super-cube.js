import { createHash } from 'crypto';
import { Cube } from './cube.js';

/**
 * Super-cube (Level 2+) - Contains multiple atomic cubes
 * Each super-cube contains 27 atomic cubes (3x3x3)
 */
export class SuperCube extends Cube {
  constructor(level = 2) {
    super();
    this.level = level;
    this.childCubes = new Map(); // cubeIndex -> Cube
    this.maxCubes = Math.pow(3, 3 * (level - 1)); // 27 for level 2, 729 for level 3, etc.
  }

  /**
   * Get average timestamp - only for level 1 (atomic cubes)
   * For levels 2+, timestamps are not used - everything is hash-sorted
   */
  getAverageTimestamp() {
    // Only level 1 uses timestamps
    if (this.level === 1) {
      return super.getAverageTimestamp();
    }
    // For levels 2+, return null - no timestamps used
    return null;
  }

  /**
   * Add a child cube to this super-cube
   * @param {number} cubeIndex - Index of the child cube
   * @param {Cube} cube - The child cube to add
   */
  addChildCube(cubeIndex, cube) {
    if (cubeIndex >= this.maxCubes) {
      throw new Error(`Cube index ${cubeIndex} exceeds maximum ${this.maxCubes} for level ${this.level}`);
    }

    this.childCubes.set(cubeIndex, cube);

    // When we have 27 cubes (3x3x3), we can form faces
    if (this.childCubes.size === 27 && this.level === 2) {
      this._formFacesFromCubes();
    }
  }

  /**
   * Form faces from child cubes
   * This is now handled by the ledger's recursive formation logic
   * Faces are formed from 9 cubes (sorted by hash), then cubes from 3 faces (sorted by hash)
   * @private
   */
  _formFacesFromCubes() {
    // Faces are now formed by the ledger's _formNextLevelFace method
    // This method is kept for backward compatibility but is no longer used
    // The recursive structure is: 9 cubes -> 1 face, 3 faces -> 1 cube
  }

  /**
   * Check if super-cube is complete
   * A cube is complete when it has 3 faces (formed from 9 cubes each)
   * This is now handled by the ledger's recursive formation logic
   */
  isComplete() {
    // For cubes with faces (from recursive formation), check if we have 3 faces
    if (this.faces && this.faces.size === 3) {
      return true;
    }
    // Legacy check for child cubes (no longer used in new recursive structure)
    return this.childCubes && this.childCubes.size >= this.maxCubes;
  }

  /**
   * Get all child cube IDs
   */
  getChildCubeIds() {
    return Array.from(this.childCubes.values())
      .map(cube => cube.id)
      .filter(id => id !== null)
      .sort();
  }
}

