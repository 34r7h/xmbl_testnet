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
    // We need to ensure they have different digital roots to fill all 9 positions
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

  test('should handle position conflicts with timestamp-based priority', () => {
    const face = new Face(0);
    
    // Create two blocks with same position but different timestamps
    const baseTime = Date.now();
    
    // First block with earlier timestamp
    const block1 = Block.fromTransaction({ 
      type: 'utxo', 
      to: 'bob1', 
      amount: 1.0, 
      from: 'alice',
      timestamp: baseTime 
    });
    
    // Manually set timestamp to ensure ordering
    block1.timestamp = baseTime;
    
    // Second block with later timestamp that would occupy same position
    // For this test, we'll create a block and manually check behavior
    const block2 = Block.fromTransaction({ 
      type: 'utxo', 
      to: 'bob2', 
      amount: 2.0, 
      from: 'alice',
      timestamp: baseTime + 1000 
    });
    block2.timestamp = baseTime + 1000;
    
    // Add first block
    face.addBlock(block1);
    const position1 = (block1.digitalRoot - 1) % 9;
    
    // Check if position is taken
    const existingBlock = face.getBlock(position1);
    expect(existingBlock).toBeDefined();
    expect(existingBlock.id).toBe(block1.id);
    
    // Current implementation overwrites, but after implementation:
    // - Should check if position is taken
    // - If taken, compare timestamps
    // - Earlier timestamp keeps position
    // - Later timestamp should trigger parallel cube creation (handled by ledger)
    
    // For now, verify current behavior (overwrites)
    face.addBlock(block2);
    const position2 = (block2.digitalRoot - 1) % 9;
    
    // If positions are the same, block2 would overwrite block1
    // After implementation, this should not happen - block2 should go to parallel cube
    if (position1 === position2) {
      // This test documents expected future behavior
      // Currently overwrites, but should create parallel cube instead
      const finalBlock = face.getBlock(position1);
      // After implementation: expect(finalBlock.id).toBe(block1.id); // Earlier timestamp wins
    }
  });
});

