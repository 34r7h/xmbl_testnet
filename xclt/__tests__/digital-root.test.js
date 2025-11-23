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




