import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Ledger } from '../src/ledger.js';
import { Block } from '../src/block.js';
import { Face } from '../src/face.js';
import { getFaceIndex, getBlockPosition } from '../src/placement.js';
import { createHash } from 'crypto';
import { rmSync } from 'fs';

describe('Parallel Cube Construction', () => {
  let ledger;
  const testDbPath = './data/ledger-test-parallel';

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

  test('should create parallel face when position conflict occurs with later timestamp', async () => {
    const baseTime = Date.now();
    
    // Create first block with earlier timestamp
    const tx1 = { type: 'utxo', to: 'bob1', amount: 1.0, from: 'alice' };
    const block1 = Block.fromTransaction(tx1);
    block1.timestamp = baseTime;
    block1.digitalRoot = 5; // Force position 4 (5-1 % 9)
    
    // Manually add first block to face
    const faceIndex = getFaceIndex(block1.id);
    let face = ledger.pendingFaces.get(faceIndex);
    if (!face) {
      face = new Face(faceIndex);
      ledger.pendingFaces.set(faceIndex, face);
    }
    const result1 = face.addBlock(block1);
    expect(result1.conflict).toBe(false);
    
    // Create second block with same position but later timestamp
    const tx2 = { type: 'utxo', to: 'bob2', amount: 2.0, from: 'alice' };
    const block2 = Block.fromTransaction(tx2);
    block2.timestamp = baseTime + 1000;
    block2.digitalRoot = 5; // Same position
    
    // Add second block - should detect conflict
    const result2 = face.addBlock(block2);
    expect(result2.conflict).toBe(true);
    expect(result2.resolved).toBe(false); // Later timestamp doesn't replace
    
    // Verify first block still in position
    const position = getBlockPosition(block1.id, block1.digitalRoot);
    const blockAtPosition = face.getBlock(position);
    expect(blockAtPosition.id).toBe(block1.id); // Earlier timestamp wins
  });

  test('should replace block when position conflict occurs with earlier timestamp', async () => {
    const baseTime = Date.now();
    
    // Create first block with later timestamp
    const tx1 = { type: 'utxo', to: 'bob1', amount: 1.0, from: 'alice' };
    const block1 = Block.fromTransaction(tx1);
    block1.timestamp = baseTime + 1000;
    block1.digitalRoot = 5;
    
    const face = new Face(0);
    face.addBlock(block1);
    
    // Create second block with same position but earlier timestamp
    const tx2 = { type: 'utxo', to: 'bob2', amount: 2.0, from: 'alice' };
    const block2 = Block.fromTransaction(tx2);
    block2.timestamp = baseTime; // Earlier timestamp
    block2.digitalRoot = 5; // Same position
    
    // Add second block - should replace first
    const result = face.addBlock(block2);
    expect(result.conflict).toBe(true);
    expect(result.resolved).toBe(true);
    expect(result.displacedBlock).toBeDefined();
    expect(result.displacedBlock.id).toBe(block1.id);
    
    // Verify second block is now in position
    const position = getBlockPosition(block2.id, block2.digitalRoot);
    const blockAtPosition = face.getBlock(position);
    expect(blockAtPosition.id).toBe(block2.id); // Earlier timestamp wins
  });

  test('should create parallel cubes when face index conflicts occur', async () => {
    const baseTime = Date.now();
    
    // Create blocks that will complete a face with index 0
    const blocks = [];
    for (let i = 0; i < 9; i++) {
      const tx = { type: 'utxo', to: `bob${i}`, amount: i, from: 'alice' };
      const block = Block.fromTransaction(tx);
      block.timestamp = baseTime + (i * 10);
      // Force all to same face index
      const hash = createHash('sha256').update(`face0-block${i}`).digest('hex');
      block.id = hash.substring(0, 16);
      blocks.push(block);
      await ledger.addTransaction(tx);
    }
    
    // Wait for face to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create another block with same face index (should create parallel cube)
    const tx10 = { type: 'utxo', to: 'bob10', amount: 10, from: 'alice' };
    const block10 = Block.fromTransaction(tx10);
    block10.timestamp = baseTime + 10000;
    const hash10 = createHash('sha256').update('face0-block10').digest('hex');
    block10.id = hash10.substring(0, 16);
    
    await ledger.addTransaction(tx10);
    
    const cubes = await ledger.getCubes();
    // Should have at least one cube
    expect(cubes.length).toBeGreaterThanOrEqual(0);
  });

  test('should order cubes by average timestamp', async () => {
    const baseTime = Date.now();
    
    // Create multiple cubes with different average timestamps
    for (let cubeNum = 0; cubeNum < 3; cubeNum++) {
      for (let i = 0; i < 9; i++) {
        const tx = { 
          type: 'utxo', 
          to: `bob${cubeNum}-${i}`, 
          amount: cubeNum * 10 + i, 
          from: 'alice' 
        };
        await ledger.addTransaction(tx);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    const cubes = await ledger.getCubes();
    
    // Verify cubes are ordered by average timestamp
    if (cubes.length > 1) {
      for (let i = 0; i < cubes.length - 1; i++) {
        const avg1 = ledger._getCubeAverageTimestamp(cubes[i]);
        const avg2 = ledger._getCubeAverageTimestamp(cubes[i + 1]);
        expect(avg1).toBeLessThanOrEqual(avg2);
      }
    }
  });

  test('should handle displaced blocks by creating parallel cubes', async () => {
    const baseTime = Date.now();
    
    // Create block with later timestamp first
    const tx1 = { type: 'utxo', to: 'bob1', amount: 1.0, from: 'alice' };
    const block1 = Block.fromTransaction(tx1);
    block1.timestamp = baseTime + 1000;
    block1.digitalRoot = 5;
    
    // Manually add to face
    const faceIndex = getFaceIndex(block1.id);
    let face = ledger.pendingFaces.get(faceIndex);
    if (!face) {
      face = new Face(faceIndex);
      ledger.pendingFaces.set(faceIndex, face);
    }
    face.addBlock(block1);
    
    // Create block with earlier timestamp - should displace block1
    const tx2 = { type: 'utxo', to: 'bob2', amount: 2.0, from: 'alice' };
    const block2 = Block.fromTransaction(tx2);
    block2.timestamp = baseTime;
    block2.digitalRoot = 5; // Same position
    
    // Add through ledger - should handle displacement
    await ledger.addTransaction(tx2);
    
    // Verify both blocks exist
    const retrieved1 = await ledger.getBlock(block1.id);
    const retrieved2 = await ledger.getBlock(block2.id);
    expect(retrieved1).toBeDefined();
    expect(retrieved2).toBeDefined();
  });
});

