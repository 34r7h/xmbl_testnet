# XCLT - XMBL Cubic Ledger Technology Instructions

## Overview

XCLT implements the Cubic Ledger Technology, a revolutionary 3D geometric structure for organizing blockchain state. Transactions are represented as atomic cubes, organized into faces (3x3 grids) and larger cubes (3 faces), creating a scalable, parallelizable state structure. The system grows dynamically from 1x1x1 blocks to 3x3x3 cubes, then 9x9x9 super-cubes, with side lengths growing as powers of 3.

## Fundamentals

### Key Concepts

- **Block**: Fundamental unit - initially 1x1x1 spatial volume representing a single transaction
- **Face**: 3x3 grid of 9 blocks
- **Cube**: Composed of 3 faces
- **Digital Root**: Derived from transaction hash, determines block placement
- **Block Placement**: Determined by digital root of block ID within face (1-9)
- **Face Placement**: Determined by block ID modulo 3 (0-2)
- **Growing Structure**: Powers of 3 growth (3⁰, 3¹, 3², ...)

### Dependencies

- **xid**: Transaction signing and verification
- **xn**: Network communication for block propagation
- **level**: LevelDB for persistent state storage
- **merkle-tree-stream**: Merkle tree construction for proofs

### Architectural Decisions

- **Sparse Representation**: Only store non-empty blocks
- **Lazy Evaluation**: Compute full state on-demand
- **Parallel Processing**: Process faces/cubes in parallel
- **Merkle Proofs**: Efficient proofs for any block position

## Development Steps

### Step 1: Project Setup

```bash
cd xclt
npm init -y
npm install level merkle-tree-stream
npm install --save-dev jest @types/jest
```

### Step 2: Digital Root Calculation (TDD)

**Test First** (`__tests__/digital-root.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { calculateDigitalRoot } from '../src/digital-root';

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

### Step 3: Block Placement Logic (TDD)

**Test** (`__tests__/placement.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { getBlockPosition, getFaceIndex } from '../src/placement';

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
import { calculateDigitalRoot } from './digital-root';
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
```

### Step 4: Block Structure (TDD)

**Test** (`__tests__/block.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { Block } from '../src/block';

describe('Block', () => {
  test('should create block from transaction', () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    const block = Block.fromTransaction(tx);
    expect(block).toHaveProperty('id');
    expect(block).toHaveProperty('tx');
    expect(block).toHaveProperty('hash');
    expect(block).toHaveProperty('digitalRoot');
  });

  test('should calculate hash correctly', () => {
    const tx = { to: 'bob', amount: 1.0 };
    const block1 = Block.fromTransaction(tx);
    const block2 = Block.fromTransaction(tx);
    expect(block1.hash).toBe(block2.hash);
  });

  test('should serialize/deserialize', () => {
    const tx = { to: 'bob', amount: 1.0 };
    const block = Block.fromTransaction(tx);
    const serialized = block.serialize();
    const deserialized = Block.deserialize(serialized);
    expect(deserialized.id).toBe(block.id);
    expect(deserialized.tx).toEqual(block.tx);
  });
});
```

**Implementation** (`src/block.js`):

```javascript
import { createHash } from 'crypto';
import { calculateDigitalRoot } from './digital-root';

export class Block {
  constructor(id, tx, hash, digitalRoot) {
    this.id = id;
    this.tx = tx;
    this.hash = hash;
    this.digitalRoot = digitalRoot;
    this.timestamp = Date.now();
  }

  static fromTransaction(tx) {
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

### Step 5: Face Structure (TDD)

**Test** (`__tests__/face.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { Face } from '../src/face';
import { Block } from '../src/block';

describe('Face', () => {
  test('should create empty face', () => {
    const face = new Face(0);
    expect(face.index).toBe(0);
    expect(face.blocks.size).toBe(0);
  });

  test('should add block to face', () => {
    const face = new Face(0);
    const block = Block.fromTransaction({ to: 'bob', amount: 1.0 });
    face.addBlock(block);
    expect(face.blocks.size).toBe(1);
  });

  test('should get block by position', () => {
    const face = new Face(0);
    const block = Block.fromTransaction({ to: 'bob', amount: 1.0 });
    face.addBlock(block);
    const retrieved = face.getBlock(block.digitalRoot - 1);
    expect(retrieved).toEqual(block);
  });

  test('should check if face is complete', () => {
    const face = new Face(0);
    expect(face.isComplete()).toBe(false);
    // Add 9 blocks
    for (let i = 0; i < 9; i++) {
      const block = Block.fromTransaction({ to: `bob${i}`, amount: i });
      face.addBlock(block);
    }
    expect(face.isComplete()).toBe(true);
  });
});
```

**Implementation** (`src/face.js`):

```javascript
import { getBlockPosition } from './placement';

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

### Step 6: Cube Structure (TDD)

**Test** (`__tests__/cube.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { Cube } from '../src/cube';
import { Face } from '../src/face';
import { Block } from '../src/block';

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

### Step 7: Ledger State Management (TDD)

**Test** (`__tests__/ledger.test.js`):

```javascript
import { describe, test, expect, beforeEach } from 'jest';
import { Ledger } from '../src/ledger';
import { Block } from '../src/block';

describe('Ledger', () => {
  let ledger;

  beforeEach(() => {
    ledger = new Ledger();
  });

  test('should add transaction', async () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    const blockId = await ledger.addTransaction(tx);
    expect(blockId).toBeDefined();
  });

  test('should get block by ID', async () => {
    const tx = { to: 'bob', amount: 1.0 };
    const blockId = await ledger.addTransaction(tx);
    const block = await ledger.getBlock(blockId);
    expect(block).toBeDefined();
    expect(block.tx).toEqual(tx);
  });

  test('should build cubes dynamically', async () => {
    // Add transactions to trigger cube building
    for (let i = 0; i < 10; i++) {
      await ledger.addTransaction({ to: `bob${i}`, amount: i });
    }
    const cubes = await ledger.getCubes();
    expect(cubes.length).toBeGreaterThan(0);
  });
});
```

**Implementation** (`src/ledger.js`):

```javascript
import { Block } from './block';
import { Face } from './face';
import { Cube } from './cube';
import { getFaceIndex } from './placement';
import level from 'level';

export class Ledger {
  constructor(dbPath = './data/ledger') {
    this.db = level(dbPath);
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
    
    // Check if cube is complete
    if (cube.isComplete()) {
      await this._finalizeCube(cube);
    }
  }

  async _finalizeCube(cube) {
    // Store cube state
    const cubeData = {
      merkleRoot: cube.getMerkleRoot(),
      faces: Array.from(cube.faces.values()).map(f => f.index)
    };
    await this.db.put(`cube:${cube.id}`, JSON.stringify(cubeData));
  }

  async getBlock(blockId) {
    const data = await this.db.get(`block:${blockId}`);
    return Block.deserialize(data);
  }

  async getCubes() {
    return Array.from(this.cubes.values());
  }
}
```

## Interfaces/APIs

### Exported Classes

```javascript
export class Ledger {
  constructor(dbPath?: string);
  async addTransaction(tx: Transaction): Promise<string>; // Returns block ID
  async getBlock(blockId: string): Promise<Block>;
  async getCubes(): Promise<Cube[]>;
  async getStateRoot(): Promise<string>;
}

export class Block {
  static fromTransaction(tx: Transaction): Block;
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

### Coverage Goals

- 90%+ code coverage
- All placement logic tested
- Edge cases (empty blocks, partial cubes)
- Performance tests for large state

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
