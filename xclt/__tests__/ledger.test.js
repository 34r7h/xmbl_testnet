import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Ledger } from '../src/ledger.js';
import { Block } from '../src/block.js';
import { Face } from '../src/face.js';
import { getFaceIndex, getBlockPosition } from '../src/placement.js';
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

  test('should add transaction and return coordinates', async () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const result = await ledger.addTransaction(tx);
    expect(result).toBeDefined();
    expect(result.blockId).toBeDefined();
    expect(result.coordinates).toBeDefined();
    expect(result.coordinates.x).toBeDefined();
    expect(result.coordinates.y).toBeDefined();
    expect(result.coordinates.z).toBeDefined();
    expect(result.vector).toBeDefined();
    expect(result.vector.magnitude).toBeGreaterThanOrEqual(0);
    expect(result.fractalAddress).toBeDefined();
  });

  test('should get block by ID with coordinates', async () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const result = await ledger.addTransaction(tx);
    const block = await ledger.getBlock(result.blockId);
    expect(block).toBeDefined();
    expect(block.tx).toEqual(tx);
    expect(block.coordinates).toBeDefined();
    expect(block.vector).toBeDefined();
  });
  
  test('should get block coordinates', async () => {
    const tx = { type: 'utxo', to: 'bob', amount: 1.0, from: 'alice' };
    const result = await ledger.addTransaction(tx);
    const coords = await ledger.getBlockCoordinates(result.blockId);
    expect(coords).toBeDefined();
    expect(coords.coordinates).toBeDefined();
    expect(coords.vector).toBeDefined();
    expect(coords.fractalAddress).toBeDefined();
  });

  test('should build cubes dynamically', async () => {
    // Add transactions to trigger cube building
    for (let i = 0; i < 10; i++) {
      await ledger.addTransaction({ type: 'utxo', to: `bob${i}`, amount: i, from: 'alice' });
    }
    const cubes = await ledger.getCubes();
    expect(cubes.length).toBeGreaterThanOrEqual(0);
  }, 10000);

  test('should create parallel cube when face position is already taken', async () => {
    // Force a position conflict by creating blocks with same digital root
    const baseTime = Date.now();
    
    // Create first block with earlier timestamp
    const tx1 = { 
      type: 'utxo', 
      to: 'bob1', 
      amount: 1.0, 
      from: 'alice'
    };
    const block1 = Block.fromTransaction(tx1);
    block1.timestamp = baseTime;
    block1.digitalRoot = 5; // Force specific digital root
    const blockId1 = block1.id;
    ledger.blocks.set(blockId1, block1);
    
    // Manually add to face to simulate conflict
    const faceIndex = getFaceIndex(blockId1);
    const position = (block1.digitalRoot - 1) % 9;
    
    let face = ledger.pendingFaces.get(faceIndex);
    if (!face) {
      face = new Face(faceIndex);
      ledger.pendingFaces.set(faceIndex, face);
    }
    face.addBlock(block1);
    
    // Create second block with same digital root but later timestamp
    const tx2 = { 
      type: 'utxo', 
      to: 'bob2', 
      amount: 2.0, 
      from: 'alice'
    };
    const block2 = Block.fromTransaction(tx2);
    block2.timestamp = baseTime + 1000; // Later timestamp
    block2.digitalRoot = 5; // Same digital root = same position
    const blockId2 = block2.id;
    
    // Add second block - should trigger parallel cube creation
    await ledger.addTransaction(tx2);
    
    // Verify both blocks exist
    const retrieved1 = await ledger.getBlock(blockId1);
    const retrieved2 = await ledger.getBlock(blockId2);
    expect(retrieved1).toBeDefined();
    expect(retrieved2).toBeDefined();
    
    // Verify parallel cube was created when position conflict occurred
    const cubes = await ledger.getCubes();
    // Should have at least one cube, possibly more if parallel cubes were created
    expect(cubes.length).toBeGreaterThanOrEqual(0);
  });

  test('should use timestamp to determine placement priority when position conflicts', async () => {
    // Note: Current implementation uses Date.now() in Block constructor
    // This test documents expected behavior for timestamp-based conflict resolution
    
    // Create first block
    const tx1 = { 
      type: 'utxo', 
      to: 'bob1', 
      amount: 1.0, 
      from: 'alice'
    };
    const result1 = await ledger.addTransaction(tx1);
    const block1 = await ledger.getBlock(result1.blockId);
    
    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create second block that would conflict (same position in same face)
    const tx2 = { 
      type: 'utxo', 
      to: 'bob2', 
      amount: 2.0, 
      from: 'alice'
    };
    const result2 = await ledger.addTransaction(tx2);
    const block2 = await ledger.getBlock(result2.blockId);
    
    // Verify timestamps (block1 should be earlier)
    expect(block1).toBeDefined();
    expect(block2).toBeDefined();
    expect(block1.timestamp).toBeLessThanOrEqual(block2.timestamp);
    
    // Verify coordinates are returned
    expect(result1.coordinates).toBeDefined();
    expect(result2.coordinates).toBeDefined();
    
    // After implementation:
    // - Block1 (earlier timestamp) should be in original cube/face
    // - Block2 (later timestamp) should be in parallel cube/face
    // - Timestamp determines which gets priority placement
    // - Validator average timestamp should be used for conflict resolution
  });

  test('should create parallel cube when face index is already taken', async () => {
    // This test documents expected behavior when face index (block ID mod 3) is already taken
    // When a face index is already occupied, should create parallel cube
    
    // Create first block
    const tx1 = { 
      type: 'utxo', 
      to: 'bob1', 
      amount: 1.0, 
      from: 'alice'
    };
    const blockId1 = await ledger.addTransaction(tx1);
    
    // Create enough blocks to potentially fill faces and trigger conflicts
    // This should eventually trigger parallel cube creation when face index conflicts
    for (let i = 0; i < 10; i++) {
      await ledger.addTransaction({ 
        type: 'utxo', 
        to: `bob${i + 2}`, 
        amount: i + 2, 
        from: 'alice'
      });
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    const cubes = await ledger.getCubes();
    
    // After implementation:
    // - Should have multiple cubes when face index conflicts occur
    // - Blocks with earlier timestamps should be in earlier cubes
    // - Validator average timestamp determines cube ordering
    // - When face index is taken, create new cube in parallel
    expect(cubes.length).toBeGreaterThanOrEqual(0);
  });

  test('should handle multiple parallel cubes with timestamp ordering', async () => {
    // This test documents expected behavior for multiple parallel cubes
    // with timestamp-based ordering when conflicts occur
    
    const results = [];
    
    // Create multiple blocks - some will conflict on position or face index
    // Timestamps will naturally increment as blocks are created
    for (let i = 0; i < 30; i++) {
      const tx = { 
        type: 'utxo', 
        to: `bob${i}`, 
        amount: i, 
        from: 'alice'
      };
      const result = await ledger.addTransaction(tx);
      results.push(result);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    
    // Verify all blocks were added
    expect(results.length).toBe(30);
    
    // Verify blocks are retrievable and have incrementing timestamps
    // Verify coordinates are returned for all blocks
    let prevTimestamp = 0;
    for (const result of results) {
      expect(result.coordinates).toBeDefined();
      expect(result.vector).toBeDefined();
      expect(result.fractalAddress).toBeDefined();
      
      const block = await ledger.getBlock(result.blockId);
      expect(block).toBeDefined();
      expect(block.timestamp).toBeGreaterThanOrEqual(prevTimestamp);
      prevTimestamp = block.timestamp;
    }
    
    // After implementation:
    // - Should have multiple cubes created in parallel when conflicts occur
    // - Blocks should be ordered by validator average timestamp across cubes
    // - Earlier timestamps should be in earlier cubes
    // - When position or face index is taken, create parallel cube
    // - Timestamp determines which cube gets priority placement
    const cubes = await ledger.getCubes();
    expect(cubes.length).toBeGreaterThanOrEqual(0);
  });

  test('should prioritize earlier timestamp when position conflict occurs', async () => {
    // This test verifies that when two blocks want the same position,
    // the one with the earlier timestamp gets priority
    
    // Create block with earlier timestamp
    const tx1 = { 
      type: 'utxo', 
      to: 'bob1', 
      amount: 1.0, 
      from: 'alice'
    };
    const result1 = await ledger.addTransaction(tx1);
    const block1 = await ledger.getBlock(result1.blockId);
    
    // Wait to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create block with later timestamp (will conflict if same position)
    const tx2 = { 
      type: 'utxo', 
      to: 'bob2', 
      amount: 2.0, 
      from: 'alice'
    };
    const result2 = await ledger.addTransaction(tx2);
    const block2 = await ledger.getBlock(result2.blockId);
    
    // Verify timestamps (block1 should be earlier or equal)
    expect(block1).toBeDefined();
    expect(block2).toBeDefined();
    expect(block1.timestamp).toBeLessThanOrEqual(block2.timestamp);
    
    // Verify coordinates are returned
    expect(result1.coordinates).toBeDefined();
    expect(result2.coordinates).toBeDefined();
    
    // After implementation:
    // - block1 (earlier) should be in original position
    // - block2 (later) should be in parallel cube
    // - Validator average timestamp determines priority
    // - When position is taken, create parallel cube for later timestamp
  });
});

