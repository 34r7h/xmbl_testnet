/**
 * Geometric Coordinate System for Cubic Ledger
 * 
 * Calculates x, y, z coordinates and vectors for blocks in the cubic structure.
 * Origin: First cube's middle block (face index 1, position 4 - center of 3x3 grid)
 * 
 * Supports fractal addressing where completed cubes have coordinates relative to
 * higher-dimensional cubes.
 */

/**
 * Convert face position (0-8) to local x, y coordinates within a face
 * Position layout (row-major):
 * 0 1 2
 * 3 4 5
 * 6 7 8
 * 
 * @param {number} position - Position in face (0-8)
 * @returns {Object} {x, y} local coordinates (-1, 0, 1)
 */
export function positionToLocalCoords(position) {
  const row = Math.floor(position / 3);
  const col = position % 3;
  
  // Convert to coordinates centered at (0, 0)
  // Position 4 (center) = (0, 0)
  const x = col - 1; // -1, 0, 1
  const y = 1 - row; // 1, 0, -1 (inverted for standard y-up)
  
  return { x, y };
}

/**
 * Convert face index (0-2) to local z coordinate within a cube
 * Face 0: z = -1 (back)
 * Face 1: z = 0 (middle) - ORIGIN FACE
 * Face 2: z = 1 (front)
 * 
 * @param {number} faceIndex - Face index (0-2)
 * @returns {number} z coordinate (-1, 0, 1)
 */
export function faceIndexToZ(faceIndex) {
  return faceIndex - 1; // -1, 0, 1
}

/**
 * Calculate block coordinates within a cube
 * 
 * @param {number} faceIndex - Face index (0-2)
 * @param {number} position - Position in face (0-8)
 * @returns {Object} {x, y, z} coordinates relative to cube center
 */
export function calculateBlockCoords(faceIndex, position) {
  const { x, y } = positionToLocalCoords(position);
  const z = faceIndexToZ(faceIndex);
  
  return { x, y, z };
}

/**
 * Calculate cube coordinates in higher-dimensional space
 * For Level 1: cube is at (0, 0, 0) - the origin cube
 * For Level 2+: cube position in super-cube
 * 
 * @param {number} cubeIndex - Index of cube in current level
 * @param {number} level - Hierarchical level (1 = atomic cube, 2 = super-cube, etc.)
 * @returns {Object} {x, y, z} cube coordinates
 */
export function calculateCubeCoords(cubeIndex, level = 1) {
  if (level === 1) {
    // First cube is always at origin
    return { x: 0, y: 0, z: 0 };
  }
  
  // For higher levels, calculate position within parent cube
  // Each level has 3^(3*(level-1)) cubes
  // Position within parent is determined by cube index
  const cubesPerDimension = Math.pow(3, level - 1);
  const cubesPerFace = cubesPerDimension * cubesPerDimension;
  
  const faceIndex = Math.floor(cubeIndex / cubesPerFace);
  const positionInFace = cubeIndex % cubesPerFace;
  
  const row = Math.floor(positionInFace / cubesPerDimension);
  const col = positionInFace % cubesPerDimension;
  
  // Scale coordinates by level
  const scale = Math.pow(3, level - 1);
  const x = (col - (cubesPerDimension - 1) / 2) * scale;
  const y = ((cubesPerDimension - 1) / 2 - row) * scale;
  const z = (faceIndex - 1) * scale;
  
  return { x, y, z };
}

/**
 * Calculate absolute coordinates of a block in the system
 * Combines block position within cube + cube position in hierarchy
 * 
 * @param {Object} blockLocation - Block location info
 * @param {number} blockLocation.faceIndex - Face index (0-2)
 * @param {number} blockLocation.position - Position in face (0-8)
 * @param {number} blockLocation.cubeIndex - Cube index in current level
 * @param {number} blockLocation.level - Hierarchical level
 * @returns {Object} {x, y, z} absolute coordinates
 */
export function calculateAbsoluteCoords(blockLocation) {
  const { faceIndex, position, cubeIndex = 0, level = 1 } = blockLocation;
  
  // Block coordinates within cube
  const blockCoords = calculateBlockCoords(faceIndex, position);
  
  // Cube coordinates in hierarchy
  const cubeCoords = calculateCubeCoords(cubeIndex, level);
  
  // Combine: absolute = cube + block (scaled)
  // Block coordinates are relative to cube center, so add them
  return {
    x: cubeCoords.x + blockCoords.x,
    y: cubeCoords.y + blockCoords.y,
    z: cubeCoords.z + blockCoords.z
  };
}

/**
 * Calculate vector from origin to block
 * 
 * @param {Object} coords - Block coordinates {x, y, z}
 * @returns {Object} {x, y, z, magnitude} vector from origin
 */
export function calculateVector(coords) {
  const { x, y, z } = coords;
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  
  return {
    x,
    y,
    z,
    magnitude,
    // Normalized direction vector
    direction: magnitude > 0 ? {
      x: x / magnitude,
      y: y / magnitude,
      z: z / magnitude
    } : { x: 0, y: 0, z: 0 }
  };
}

/**
 * Calculate fractal address for a block
 * Returns hierarchical path: [level1, level2, ..., block]
 * 
 * @param {Object} blockLocation - Block location info
 * @returns {Array} Fractal address path
 */
export function calculateFractalAddress(blockLocation) {
  const { faceIndex, position, cubeIndex = 0, level = 1 } = blockLocation;
  
  const address = [];
  
  // Build address from highest level to block
  for (let l = level; l >= 1; l--) {
    if (l === level) {
      // Current level: include cube, face, position
      address.push({
        level: l,
        cubeIndex,
        faceIndex,
        position
      });
    } else {
      // Higher levels: just cube index
      address.push({
        level: l,
        cubeIndex: 0 // Simplified - would need parent cube tracking
      });
    }
  }
  
  return address;
}

/**
 * Get origin coordinates (first cube's middle block)
 * This is always (0, 0, 0)
 * 
 * @returns {Object} {x: 0, y: 0, z: 0}
 */
export function getOrigin() {
  return { x: 0, y: 0, z: 0 };
}



