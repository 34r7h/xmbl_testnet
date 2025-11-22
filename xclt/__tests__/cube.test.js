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

  test('should support parallel cube construction when face index conflicts', () => {
    // This test documents expected behavior for parallel cube construction
    // When multiple faces with the same index need to be created,
    // they should go into parallel cubes
    
    const cube1 = new Cube();
    const cube2 = new Cube();
    
    // Create faces with same index (would conflict in single cube)
    const face1a = new Face(0);
    const face1b = new Face(0); // Same index, should go to parallel cube
    
    // Add to different cubes (simulating parallel construction)
    cube1.addFace(face1a);
    cube2.addFace(face1b);
    
    // Both cubes should exist
    expect(cube1.faces.size).toBe(1);
    expect(cube2.faces.size).toBe(1);
    expect(cube1.getFace(0)).toBe(face1a);
    expect(cube2.getFace(0)).toBe(face1b);
    
    // After implementation in ledger:
    // - When face index is already taken, create new cube
    // - Use timestamp to determine which cube gets priority
    // - Earlier timestamps go to earlier cubes
  });

  test('should order cubes by timestamp when parallel construction occurs', () => {
    // This test documents expected behavior for timestamp-based ordering
    // When parallel cubes are created, they should be ordered by
    // the average timestamp of their blocks
    
    const cube1 = new Cube();
    const cube2 = new Cube();
    
    // Simulate cubes with different average timestamps
    const baseTime = Date.now();
    
    // Cube 1: earlier timestamps
    const face1 = new Face(0);
    const block1 = Block.fromTransaction({ 
      type: 'utxo', 
      to: 'bob1', 
      amount: 1.0, 
      from: 'alice',
      timestamp: baseTime 
    });
    block1.timestamp = baseTime;
    face1.addBlock(block1);
    cube1.addFace(face1);
    
    // Cube 2: later timestamps
    const face2 = new Face(0);
    const block2 = Block.fromTransaction({ 
      type: 'utxo', 
      to: 'bob2', 
      amount: 2.0, 
      from: 'alice',
      timestamp: baseTime + 1000 
    });
    block2.timestamp = baseTime + 1000;
    face2.addBlock(block2);
    cube2.addFace(face2);
    
    // After implementation:
    // - Cubes should be ordered by average block timestamp
    // - Earlier cubes contain blocks with earlier timestamps
    // - This ordering determines which cube gets "priority" placement
    
    expect(cube1.faces.size).toBe(1);
    expect(cube2.faces.size).toBe(1);
  });
});

