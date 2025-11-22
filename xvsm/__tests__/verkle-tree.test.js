import { describe, test, expect } from '@jest/globals';
import { VerkleStateTree } from '../src/verkle-tree.js';

describe('Verkle State Tree', () => {
  test('should create Verkle tree', () => {
    const tree = new VerkleStateTree();
    expect(tree).toBeDefined();
    expect(tree.root).toBeDefined();
  });

  test('should insert state value', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    const value = tree.get('key1');
    expect(value).toBe('value1');
  });

  test('should generate proof', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    const proof = tree.generateProof('key1');
    expect(proof).toBeDefined();
    expect(proof).toHaveProperty('root');
    expect(proof).toHaveProperty('path');
  });

  test('should verify proof', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    const proof = tree.generateProof('key1');
    const isValid = VerkleStateTree.verifyProof('key1', 'value1', proof);
    expect(isValid).toBe(true);
  });
});

