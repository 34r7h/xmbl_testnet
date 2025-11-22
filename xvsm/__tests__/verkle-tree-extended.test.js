import { describe, test, expect } from '@jest/globals';
import { VerkleStateTree } from '../src/verkle-tree.js';

describe('Verkle Tree Extended Tests', () => {
  test('should handle large number of insertions', () => {
    const tree = new VerkleStateTree();
    const count = 1000;
    
    for (let i = 0; i < count; i++) {
      tree.insert(`key${i}`, `value${i}`);
    }
    
    expect(tree.get('key0')).toBe('value0');
    expect(tree.get('key999')).toBe('value999');
    expect(tree.getRoot()).toBeDefined();
  });

  test('should handle deletions correctly', () => {
    const tree = new VerkleStateTree();
    
    tree.insert('key1', 'value1');
    tree.insert('key2', 'value2');
    tree.insert('key3', 'value3');
    
    const rootBefore = tree.getRoot();
    tree.delete('key2');
    const rootAfter = tree.getRoot();
    
    expect(tree.get('key1')).toBe('value1');
    expect(tree.get('key2')).toBeUndefined();
    expect(tree.get('key3')).toBe('value3');
    expect(rootAfter).not.toBe(rootBefore);
  });

  test('should generate valid proofs for all inserted keys', () => {
    const tree = new VerkleStateTree();
    const keys = ['a', 'b', 'c', 'd', 'e'];
    
    for (const key of keys) {
      tree.insert(key, `value-${key}`);
    }
    
    for (const key of keys) {
      const proof = tree.generateProof(key);
      const isValid = VerkleStateTree.verifyProof(key, `value-${key}`, proof);
      expect(isValid).toBe(true);
    }
  });

  test('should reject invalid proofs', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    
    const proof = tree.generateProof('key1');
    const isValid = VerkleStateTree.verifyProof('key1', 'wrong-value', proof);
    expect(isValid).toBe(false);
  });

  test('should handle updates to existing keys', () => {
    const tree = new VerkleStateTree();
    
    tree.insert('key1', 'value1');
    const root1 = tree.getRoot();
    
    tree.insert('key1', 'value2');
    const root2 = tree.getRoot();
    
    expect(tree.get('key1')).toBe('value2');
    expect(root2).not.toBe(root1);
  });

  test('should maintain root consistency', () => {
    const tree1 = new VerkleStateTree();
    const tree2 = new VerkleStateTree();
    
    const operations = [
      { op: 'insert', key: 'a', value: '1' },
      { op: 'insert', key: 'b', value: '2' },
      { op: 'insert', key: 'c', value: '3' },
      { op: 'delete', key: 'b' }
    ];
    
    for (const { op, key, value } of operations) {
      if (op === 'insert') {
        tree1.insert(key, value);
        tree2.insert(key, value);
      } else {
        tree1.delete(key);
        tree2.delete(key);
      }
      
      expect(tree1.getRoot()).toBe(tree2.getRoot());
    }
  });

  test('should handle complex nested values', () => {
    const tree = new VerkleStateTree();
    
    const complexValue = {
      nested: {
        array: [1, 2, 3],
        object: { key: 'value' }
      },
      timestamp: Date.now()
    };
    
    tree.insert('complex', complexValue);
    const retrieved = tree.get('complex');
    
    expect(retrieved).toEqual(complexValue);
    
    const proof = tree.generateProof('complex');
    const isValid = VerkleStateTree.verifyProof('complex', complexValue, proof);
    expect(isValid).toBe(true);
  });
});

