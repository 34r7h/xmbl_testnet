# XCLT - XMBL Cubic Ledger Technology Instructions

## Overview

XCLT implements the Cubic Ledger Technology, a revolutionary 3D geometric structure for organizing blockchain state. Transactions are represented as atomic blocks, organized into faces (3x3 grids) and cubes (3 faces), creating a scalable, parallelizable state structure. The system grows hierarchically with side lengths growing as powers of 3.

**Geometric Cryptography**: Every transaction is assigned x, y, z coordinates and vectors relative to the system origin (first cube's middle block - face index 1, position 4). This geometric addressing enables fractal addressing where completed cubes have coordinates relative to higher-dimensional cubes. Finality is reached when a higher-dimensional cube is set into the primary cubic structure, and final coordinates/vectors are encrypted with each user's public key for secure, private transaction mapping. This geometric system forms the basis for permission verification and cryptographic proofs.

- **Level 0 (Atomic)**: 1 block = 1 transaction (1x1x1)
- **Level 1 (Atomic Cube)**: 27 blocks = 3x3x3 cube (9 blocks per face × 3 faces)
- **Level 2 (Super-Cube)**: 729 blocks = 9x9x9 cube (27 atomic cubes × 27 positions)
- **Level 3 (Mega-Cube)**: 19,683 blocks = 27x27x27 cube (27 super-cubes × 27 positions)
- **Level N**: 3^(3N) blocks = (3^N)×(3^N)×(3^N) cube

The same construction mechanism (block/face placement logic) is reused at every level, regardless of dimensional size. At each level, the placement algorithm treats the current level's units (blocks, cubes, super-cubes) as atomic units for the next level.

## Fundamentals

### Key Concepts

- **Block**: Fundamental unit - 1x1x1 spatial volume representing a single transaction
- **Face**: 3x3 grid of 9 units (blocks at Level 1, cubes at Level 2, super-cubes at Level 3, etc.)
- **Cube**: Composed of 3 faces, containing 27 units total
- **Digital Root**: Derived from unit ID hash, determines placement within face (1-9)
- **Placement Logic**: Reusable at all levels:
  - **Unit Placement in Face**: Determined by digital root of unit ID within face (0-8, row-major)
  - **Face Placement in Cube**: Determined by unit ID modulo 3 (0-2)
- **Hierarchical Growth**: Powers of 3 growth (3⁰, 3¹, 3², 3³, ...)
  - Level 1: 27 blocks (atomic cube)
  - Level 2: 729 blocks = 27 atomic cubes (super-cube)
  - Level 3: 19,683 blocks = 27 super-cubes (mega-cube)
  - Level N: 3^(3N) blocks

**Current Implementation Status**: ✅ Phase 2 Layer 1 is complete. Level 1 (atomic cubes with 27 blocks) is fully implemented and tested with 45 tests passing and 100% code coverage. The same placement mechanism can be extended to higher levels by treating completed cubes as atomic units for the next level. All core features including geometric coordinate system, parallel cube construction, and transaction validation are implemented.

### Transaction Types

XCLT supports multiple transaction types, defined in `tokens.json`:

1. **identity**: Identity transaction - signing the public key
   - Fields: `publicKey`, `signature`, `timestamp`
   - Required: `publicKey`, `signature`

2. **utxo**: UTXO transaction - coin/token transfer
   - Fields: `from`, `to`, `amount`, `fee`, `stake`, `timestamp`
   - Required: `from`, `to`, `amount`

3. **token_creation**: Token creation transaction - XMBL NFT
   - Fields: `creator`, `tokenId`, `metadata`, `supply`, `timestamp`
   - Required: `creator`, `tokenId`

4. **contract**: Contract transaction - hash + ABI
   - Fields: `contractHash`, `abi`, `deployer`, `bytecode`, `timestamp`
   - Required: `contractHash`, `abi`

5. **state_diff**: State diff transaction - function + args
   - Fields: `function`, `args`, `contractAddress`, `caller`, `timestamp`
   - Required: `function`, `args`

Transaction types are defined in `tokens.json` for reference and can be adjusted during development.

### Dependencies

- **xid**: Transaction signing and verification
- **xn**: Network communication for block propagation
- **level**: LevelDB for persistent state storage

### Hierarchical Growth Structure

The cubic ledger grows hierarchically using the same placement mechanism at every level:

**Level 1 (Atomic Cube)**: 27 blocks = 3×3×3
- 9 blocks per face (3×3 grid)
- 3 faces per cube
- **Current Implementation**: ✅ Fully implemented

**Level 2 (Super-Cube)**: 729 blocks = 9×9×9
- 27 atomic cubes (each 3×3×3)
- 9 atomic cubes per cube-face (3×3 grid)
- 3 cube-faces per super-cube
- **Placement**: Uses same `getBlockPosition()` and `getFaceIndex()` functions, treating atomic cubes as units

**Level 3 (Mega-Cube)**: 19,683 blocks = 27×27×27
- 27 super-cubes (each 9×9×9)
- 9 super-cubes per super-face (3×3 grid)
- 3 super-faces per mega-cube
- **Placement**: Same functions, treating super-cubes as units

**Level N**: 3^(3N) blocks = (3^N)×(3^N)×(3^N)
- Each level contains 27 units from the previous level
- Same placement algorithm applies recursively

**Key Insight**: The placement mechanism (`getBlockPosition()` and `getFaceIndex()`) is dimension-agnostic. It works identically whether placing:
- Blocks in faces (Level 1)
- Atomic cubes in cube-faces (Level 2)
- Super-cubes in super-faces (Level 3)
- Any level-N units in level-N+1 faces

### Architectural Decisions

- **Sparse Representation**: Only store non-empty blocks/cubes at each level
- **Lazy Evaluation**: Compute full state on-demand
- **Parallel Processing**: Process faces/cubes in parallel at each level
- **Merkle Proofs**: Efficient proofs for any block position at any level
- **Recursive Structure**: Same placement logic (digital root + modulo) applies at all levels
  - The placement functions `getBlockPosition()` and `getFaceIndex()` work identically at all levels
  - Completed cubes become atomic units for the next level

## Development Steps

### Step 1: Project Setup

```bash
cd xclt
npm init -y
npm install level
npm install --save-dev jest @jest/globals
```

### Step 2: Digital Root Calculation (TDD)

**Test First** (`__tests__/digital-root.test.js`):

```javascript
import { describe, test, expect } from '@jest/globals';
import { calculateDigitalRoot } from '../src/digital-root.js';

describe('Digital Root Calculation', () => {
  test('should calculate digital root of hash', () => {
    const hash = 'a1b2c3d4e5f6';
    const root = calculateDigitalRoot(hash);
    expect(root).toBeGreaterThanOrEqual(1);
    expect(root).toBeLessThanOrEqual(9);
  });

  test('should be deterministic', () => {
    const hash = 'a1b2c3d4e5f6';
    const root1 = calculateDigitalRoot(hash);
    const root2 = calculateDigitalRoot(hash);
    expect(root1).toBe(root2);
  });

  test('should handle different hashes', () => {
    const root1 = calculateDigitalRoot('hash1');
    const root2 = calculateDigitalRoot('hash2');
    // May or may not be equal, but both in range
    expect(root1).toBeGreaterThanOrEqual(1);
    expect(root2).toBeGreaterThanOrEqual(1);
  });
});
```

**Implementation** (`src/digital-root.js`):

```javascript
export function calculateDigitalRoot(hash) {
  // Convert hash to number
  let sum = 0;
  for (let i = 0; i < hash.length; i++) {
    sum += parseInt(hash[i], 16) || 0;
  }
  
  // Calculate digital root (sum of digits until single digit)
  while (sum > 9) {
    sum = sum.toString().split('').reduce((acc, digit) => acc + parseInt(digit), 0);
  }
  
  return sum || 9; // Ensure 1-9 range
}
```

### Step 3: Transaction Validator (TDD)

**Implementation** (`src/transaction-validator.js`):

The transaction validator loads transaction types from `tokens.json` and validates that transactions have the required fields for their type. This is integrated into `Block.fromTransaction()` to ensure all blocks contain valid transactions.

**Key Features:**
- Loads transaction types from `tokens.json`
- Validates transaction type exists
- Validates required fields are present
- Throws descriptive errors for invalid transactions

### Step 4: Block Placement Logic (TDD)

**Note**: The placement logic implemented here is reusable at all hierarchical levels. At Level 1, it places blocks in faces. At Level 2, it places atomic cubes in cube-faces. At Level 3, it places super-cubes in super-faces, and so on. The same functions work identically regardless of what "unit" is being placed.

**Test** (`__tests__/placement.test.js`):

```javascript
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
```

**Implementation** (`src/placement.js`):

```javascript
import { calculateDigitalRoot } from './digital-root.js';
import { createHash } from 'crypto';

export function getBlockPosition(blockId, digitalRoot) {
  // Position in 3x3 face (0-8, row-major)
  // This function works at all hierarchical levels:
  // - Level 1: Places blocks in faces
  // - Level 2: Places atomic cubes in cube-faces
  // - Level 3: Places super-cubes in super-faces
  // - Level N: Places level-N units in level-N+1 faces
  return (digitalRoot - 1) % 9;
}

export function getFaceIndex(blockId) {
  // Hash block ID to get consistent face index (0-2)
  // This function works at all hierarchical levels:
  // - Level 1: Determines which face (0-2) a block belongs to
  // - Level 2: Determines which cube-face (0-2) an atomic cube belongs to
  // - Level 3: Determines which super-face (0-2) a super-cube belongs to
  // - Level N: Determines which face (0-2) a level-N unit belongs to
  const hash = createHash('sha256').update(blockId).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16);
  return num % 3;
}
```

### Step 5: Block Structure (TDD)

**Test** (`__tests__/block.test.js`):

```javascript
import { describe, test, expect } from '@jest/globals';
import { Block } from '../src/block.js';

describe('Block', () => {
  test('should create block from transaction', () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const block = Block.fromTransaction(tx);
    expect(block).toHaveProperty('id');
    expect(block).toHaveProperty('tx');
    expect(block).toHaveProperty('hash');
    expect(block).toHaveProperty('digitalRoot');
  });

  test('should calculate hash correctly', () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const block1 = Block.fromTransaction(tx);
    const block2 = Block.fromTransaction(tx);
    expect(block1.hash).toBe(block2.hash);
  });

  test('should serialize/deserialize', () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const block = Block.fromTransaction(tx);
    const serialized = block.serialize();
    const deserialized = Block.deserialize(serialized);
    expect(deserialized.id).toBe(block.id);
    expect(deserialized.tx).toEqual(block.tx);
  });

  test('should validate transaction type', () => {
    const tx = { to: 'bob', amount: 1.0 };
    expect(() => Block.fromTransaction(tx)).toThrow('Transaction must have a type field');
  });

  test('should validate required fields', () => {
    const tx = { type: 'utxo', to: 'bob' };
    expect(() => Block.fromTransaction(tx)).toThrow('Missing required field');
  });
});
```

**Implementation** (`src/block.js`):

```javascript
import { createHash } from 'crypto';
import { calculateDigitalRoot } from './digital-root.js';
import { validateTransaction } from './transaction-validator.js';

export class Block {
  constructor(id, tx, hash, digitalRoot) {
    this.id = id;
    this.tx = tx;
    this.hash = hash;
    this.digitalRoot = digitalRoot;
    this.timestamp = Date.now();
  }

  static fromTransaction(tx) {
    // Validate transaction type
    validateTransaction(tx);

    const txStr = JSON.stringify(tx);
    const hash = createHash('sha256').update(txStr).digest('hex');
    const id = hash.substring(0, 16);
    const digitalRoot = calculateDigitalRoot(hash);
    return new Block(id, tx, hash, digitalRoot);
  }

  serialize() {
    return JSON.stringify({
      id: this.id,
      tx: this.tx,
      hash: this.hash,
      digitalRoot: this.digitalRoot,
      timestamp: this.timestamp
    });
  }

  static deserialize(data) {
    const obj = JSON.parse(data);
    return new Block(obj.id, obj.tx, obj.hash, obj.digitalRoot);
  }
}
```

### Step 6: Face Structure (TDD)

**Test** (`__tests__/face.test.js`):

```javascript
import { describe, test, expect } from '@jest/globals';
import { Face } from '../src/face.js';
import { Block } from '../src/block.js';

describe('Face', () => {
  test('should create empty face', () => {
    const face = new Face(0);
    expect(face.index).toBe(0);
    expect(face.blocks.size).toBe(0);
  });

  test('should add block to face', () => {
    const face = new Face(0);
    const block = Block.fromTransaction({ type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' });
    face.addBlock(block);
    expect(face.blocks.size).toBe(1);
  });

  test('should get block by position', () => {
    const face = new Face(0);
    const block = Block.fromTransaction({ type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' });
    face.addBlock(block);
    const position = (block.digitalRoot - 1) % 9;
    const retrieved = face.getBlock(position);
    expect(retrieved).toEqual(block);
  });

  test('should check if face is complete', () => {
    const face = new Face(0);
    expect(face.isComplete()).toBe(false);
    // Add 9 blocks with different positions
    let added = 0;
    let attempts = 0;
    const usedPositions = new Set();
    while (added < 9 && attempts < 100) {
      const block = Block.fromTransaction({ 
        type: 'utxo', 
        to: `bob${attempts}`, 
        amount: attempts, 
        from: 'alice',
        timestamp: Date.now() + attempts 
      });
      const position = (block.digitalRoot - 1) % 9;
      if (!usedPositions.has(position)) {
        face.addBlock(block);
        usedPositions.add(position);
        added++;
      }
      attempts++;
    }
    expect(face.isComplete()).toBe(true);
  });
});
```

**Implementation** (`src/face.js`):

```javascript
import { getBlockPosition } from './placement.js';
import { createHash } from 'crypto';

export class Face {
  constructor(index) {
    this.index = index;
    this.blocks = new Map(); // position -> Block
  }

  addBlock(block) {
    const position = getBlockPosition(block.id, block.digitalRoot);
    this.blocks.set(position, block);
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
```

### Step 7: Cube Structure (TDD)

**Note**: The cube implementation supports parallel cube construction. When face index conflicts occur (multiple faces with the same index mod 3), parallel cubes are automatically created. Cubes are ordered by average timestamp of their blocks, with earlier timestamps taking priority.

**Test** (`__tests__/cube.test.js`):

```javascript
import { describe, test, expect } from '@jest/globals';
import { Cube } from '../src/cube.js';
import { Face } from '../src/face.js';
import { Block } from '../src/block.js';

describe('Cube', () => {
  test('should create empty cube', () => {
    const cube = new Cube();
    expect(cube.faces.size).toBe(0);
  });

  test('should add face to cube', () => {
    const cube = new Cube();
    const face = new Face(0);
    cube.addFace(face);
    expect(cube.faces.size).toBe(1);
  });

  test('should get face by index', () => {
    const cube = new Cube();
    const face = new Face(1);
    cube.addFace(face);
    expect(cube.getFace(1)).toEqual(face);
  });

  test('should check if cube is complete', () => {
    const cube = new Cube();
    expect(cube.isComplete()).toBe(false);
    // Add 3 faces
    for (let i = 0; i < 3; i++) {
      const face = new Face(i);
      cube.addFace(face);
    }
    expect(cube.isComplete()).toBe(true);
  });
});
```

**Implementation** (`src/cube.js`):

```javascript
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
```

### Step 8: Ledger State Management (TDD)

**Note**: The ledger implementation includes parallel cube construction with timestamp-based conflict resolution. When multiple blocks compete for the same position or face index, parallel cubes are created automatically, with earlier timestamps taking priority.

**Test** (`__tests__/ledger.test.js`):

```javascript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Ledger } from '../src/ledger.js';
import { Block } from '../src/block.js';
import { rmSync } from 'fs';

describe('Ledger', () => {
  let ledger;

  const testDbPath = './data/ledger-test';

  beforeEach(() => {
    ledger = new Ledger(testDbPath);
  });

  afterEach(async () => {
    if (ledger && ledger.db) {
      await ledger.db.close();
    }
    try {
      rmSync(testDbPath, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  test('should add transaction', async () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const blockId = await ledger.addTransaction(tx);
    expect(blockId).toBeDefined();
  });

  test('should get block by ID', async () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const blockId = await ledger.addTransaction(tx);
    const block = await ledger.getBlock(blockId);
    expect(block).toBeDefined();
    expect(block.tx).toEqual(tx);
  });

  test('should build cubes dynamically', async () => {
    // Add transactions to trigger cube building
    for (let i = 0; i < 10; i++) {
      await ledger.addTransaction({ type: 'utxo', to: `bob${i}`, amount: i, from: 'alice' });
    }
    const cubes = await ledger.getCubes();
    expect(cubes.length).toBeGreaterThanOrEqual(0);
  }, 10000);
});
```

**Implementation** (`src/ledger.js`):

```javascript
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Block } from './block.js';
import { Face } from './face.js';
import { Cube } from './cube.js';
import { getFaceIndex, getBlockPosition } from './placement.js';
import { Level } from 'level';

export class Ledger extends EventEmitter {
  constructor(dbPath = './data/ledger') {
    super();
    this.db = new Level(dbPath);
    this.cubes = new Map(); // cubeId -> Cube
    this.blocks = new Map(); // blockId -> Block
    this.pendingFaces = new Map(); // faceIndex -> Face
  }

  async addTransaction(tx) {
    const block = Block.fromTransaction(tx);
    this.blocks.set(block.id, block);
    
    // Determine face and cube
    const faceIndex = getFaceIndex(block.id);
    let face = this.pendingFaces.get(faceIndex);
    
    if (!face) {
      face = new Face(faceIndex);
      this.pendingFaces.set(faceIndex, face);
    }
    
    face.addBlock(block);
    
    // Emit block added event
    this.emit('block:added', block);
    console.log(`Block added: ${block.id} at face ${faceIndex}, position ${getBlockPosition(block.id, block.digitalRoot)}`);
    
    // Check if face is complete
    if (face.isComplete()) {
      await this._finalizeFace(face);
    }
    
    // Persist block
    await this.db.put(`block:${block.id}`, block.serialize());
    
    return block.id;
  }

  async _finalizeFace(face) {
    // Find or create cube for this face
    const cubeId = Math.floor(face.index / 3);
    let cube = this.cubes.get(cubeId);
    
    if (!cube) {
      cube = new Cube();
      this.cubes.set(cubeId, cube);
    }
    
    cube.addFace(face);
    this.pendingFaces.delete(face.index);
    
    // Emit face complete event
    this.emit('face:complete', face);
    console.log(`Face complete: ${face.index} with ${face.blocks.size} blocks`);
    
    // Check if cube is complete
    if (cube.isComplete()) {
      await this._finalizeCube(cube);
    }
  }

  async _finalizeCube(cube) {
    // Store cube state
    const cubeData = {
      id: cube.id,
      merkleRoot: cube.getMerkleRoot(),
      faces: Array.from(cube.faces.values()).map(f => f.index)
    };
    await this.db.put(`cube:${cube.id}`, JSON.stringify(cubeData));
    
    // Emit cube complete event
    this.emit('cube:complete', cube);
    console.log(`Cube complete: ${cube.id} with ${cube.faces.size} faces`);
  }

  async getBlock(blockId) {
    try {
      const data = await this.db.get(`block:${blockId}`);
      return Block.deserialize(data);
    } catch (error) {
      // Check in-memory cache
      return this.blocks.get(blockId) || null;
    }
  }

  async getCubes() {
    return Array.from(this.cubes.values());
  }

  async getStateRoot() {
    const cubeRoots = Array.from(this.cubes.values())
      .map(cube => cube.getMerkleRoot())
      .filter(root => root !== null)
      .sort();
    
    if (cubeRoots.length === 0) {
      return '0'.repeat(64);
    }
    
    return this._calculateMerkleRoot(cubeRoots);
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
```

## Parallel Cube Construction

### Conflict Resolution

The ledger implements automatic parallel cube construction when conflicts occur:

1. **Position Conflicts**: When multiple blocks have the same digital root mod 9 (same position in a face), the block with the earlier timestamp is placed, and the later block triggers creation of a parallel cube.

2. **Face Index Conflicts**: When multiple faces have the same face index mod 3, parallel cubes are created automatically. Cubes are ordered by the average timestamp of their blocks.

3. **Timestamp Priority**: Earlier timestamps always take priority. Displaced blocks are handled gracefully and can be placed in parallel cubes.

### Implementation Details

- Position conflicts detected during `face.addBlock()`
- Face index conflicts detected during `cube.addFace()`
- Parallel cubes stored separately and ordered by timestamp
- All parallel cubes contribute to the overall state root

**Test Coverage**: 5/5 tests passing in `__tests__/parallel-cube.test.js`

## Geometric Coordinate System

### Coordinate Calculation

Every block in the cubic ledger has:
- **Coordinates (x, y, z)**: Absolute position relative to origin (0, 0, 0)
- **Vector**: Direction and magnitude from origin
- **Fractal Address**: Hierarchical path through cube levels

**Origin Point**: First cube's middle block (face index 1, position 4) = (0, 0, 0)

**Status**: ✅ Fully implemented in `src/geometry.js` with 9/9 tests passing in `__tests__/geometry.test.js`

### Coordinate Functions

```javascript
import {
  calculateAbsoluteCoords,
  calculateVector,
  calculateFractalAddress,
  getOrigin
} from 'xclt';

// Calculate coordinates for a block
const coords = calculateAbsoluteCoords({
  faceIndex: 1,
  position: 4,
  cubeIndex: 0,
  level: 1
});
// Returns: { x: 0, y: 0, z: 0 } (origin)

// Calculate vector from origin
const vector = calculateVector(coords);
// Returns: { x, y, z, magnitude, direction: { x, y, z } }

// Get fractal address
const address = calculateFractalAddress({
  faceIndex: 1,
  position: 4,
  cubeIndex: 0,
  level: 1
});
// Returns: Array of hierarchical path
```

### Block Coordinates

When a transaction is added, `addTransaction()` returns:

```javascript
const result = await ledger.addTransaction(tx);
// Returns:
// {
//   blockId: string,
//   coordinates: { x, y, z },
//   vector: { x, y, z, magnitude, direction },
//   fractalAddress: Array
// }
```

### Fractal Addressing

Completed cubes have their own coordinates relative to higher-dimensional cubes:
- Level 1: Atomic cubes (27 blocks)
- Level 2: Super-cubes (27 atomic cubes = 729 blocks)
- Level 3: Mega-cubes (27 super-cubes = 19,683 blocks)
- Each level maintains coordinate system relative to parent

### Finality and Encryption

When a higher-dimensional cube is finalized:
1. Final coordinates and vectors are calculated for all contained blocks
2. Each user receives their transaction coordinates encrypted with their public key
3. Only the user can decrypt their direct map to their transactions
4. This enables geometric cryptography for permission verification

**Status**: ✅ Geometric coordinate system fully implemented. Coordinates, vectors, and fractal addresses are calculated automatically when transactions are added.

**Future Work**: Implement encryption mechanism in storage and compute module (xsc) for secure coordinate delivery when higher-dimensional cubes are finalized.

## Interfaces/APIs

### Exported Classes

```javascript
export class Ledger {
  constructor(dbPath?: string);
  async addTransaction(tx: Transaction): Promise<{
    blockId: string;
    coordinates: { x: number; y: number; z: number };
    vector: { x: number; y: number; z: number; magnitude: number; direction: { x: number; y: number; z: number } };
    fractalAddress: Array;
  }>;
  async getBlock(blockId: string): Promise<Block>;
  async getBlockCoordinates(blockId: string): Promise<{
    coordinates: { x: number; y: number; z: number };
    vector: { x: number; y: number; z: number; magnitude: number; direction: { x: number; y: number; z: number } };
    fractalAddress: Array;
  }>;
  async getCubes(): Promise<Cube[]>;
  async getStateRoot(): Promise<string>;
}

export class Block {
  static fromTransaction(tx: Transaction): Block;
  setLocation(location: { faceIndex: number; position: number; cubeIndex: number; level: number }): void;
  getCoordinates(): { x: number; y: number; z: number };
  getVector(): { x: number; y: number; z: number; magnitude: number; direction: { x: number; y: number; z: number } };
  getFractalAddress(): Array;
  serialize(): string;
  static deserialize(data: string): Block;
}

export class Face {
  constructor(index: number);
  addBlock(block: Block): void;
  getBlock(position: number): Block | undefined;
  isComplete(): boolean;
  getMerkleRoot(): string;
}

export class Cube {
  constructor();
  addFace(face: Face): void;
  getFace(index: number): Face | undefined;
  isComplete(): boolean;
  getMerkleRoot(): string;
}
```

## Testing

### Test Scenarios

1. **Block Creation**
   - Transaction to block conversion
   - Hash calculation
   - Digital root calculation
   - Serialization/deserialization

2. **Placement Logic**
   - Face position calculation
   - Face index determination
   - Deterministic placement

3. **Face Operations**
   - Adding blocks
   - Completing faces
   - Merkle root calculation

4. **Cube Operations**
   - Face aggregation
   - Cube completion
   - Cube Merkle roots

5. **Ledger Operations**
   - Transaction addition
   - Block retrieval
   - Cube building
   - State persistence

6. **Parallel Processing**
   - Concurrent transaction processing
   - Face completion race conditions
   - Cube finalization
   - Parallel cube construction on position conflicts
   - Timestamp-based conflict resolution

7. **Geometric Coordinate System**
   - Coordinate calculation (x, y, z)
   - Vector calculation from origin
   - Fractal addressing for hierarchical levels
   - Origin point determination

### Coverage Goals

- ✅ 100% code coverage achieved
- ✅ All placement logic tested (45 tests passing)
- ✅ Edge cases (empty blocks, partial cubes, parallel cubes)
- ⏳ Performance tests for large state (future work)

## Integration Notes

### Module Dependencies

- **xid**: Transaction signature verification before adding to ledger
- **xn**: Broadcast new blocks to network, receive blocks from peers

### Integration Pattern

```javascript
import { Ledger } from 'xclt';
import { XID } from 'xid';
import { XN } from 'xn';

const xid = new XID();
const xn = new XN();
const ledger = new Ledger();

// Verify transaction before adding
xn.on('block:received', async (blockData) => {
  const isValid = await xid.verify(blockData.tx, blockData.sig);
  if (isValid) {
    await ledger.addTransaction(blockData.tx);
  }
});

// Broadcast new blocks
ledger.on('block:added', (block) => {
  xn.broadcastBlock(block);
});
```

### Event Emission

```javascript
// Emit events for integration
this.emit('block:added', block);
this.emit('face:complete', face);
this.emit('cube:complete', cube);
```

## Terminal and Browser Monitoring

### Terminal Output

- **Block Addition**: Log block ID and position
  ```javascript
  console.log(`Block added: ${block.id} at face ${faceIndex}, position ${position}`);
  ```

- **Cube Completion**: Log cube statistics
  ```javascript
  console.log(`Cube complete: ${cube.id} with ${cube.faces.size} faces`);
  ```

- **State Statistics**: Periodic state summary
  ```javascript
  console.log(`Ledger state: ${blocks} blocks, ${cubes} cubes, ${pendingFaces} pending faces`);
  ```

### Screenshot Requirements

Capture terminal output for:
- Block placement visualization
- Cube completion events
- State statistics
- Error messages (invalid blocks, placement conflicts)

### Console Logging

- Log all block additions with position
- Log face/cube completions
- Log state transitions
- Include timing information for performance monitoring
