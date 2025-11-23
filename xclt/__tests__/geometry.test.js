import { describe, test, expect } from '@jest/globals';
import {
  positionToLocalCoords,
  faceIndexToZ,
  calculateBlockCoords,
  calculateCubeCoords,
  calculateAbsoluteCoords,
  calculateVector,
  calculateFractalAddress,
  getOrigin
} from '../src/geometry.js';

describe('Geometric Coordinate System', () => {
  test('should convert position to local coordinates', () => {
    // Position 4 (center) should be (0, 0)
    const center = positionToLocalCoords(4);
    expect(center.x).toBe(0);
    expect(center.y).toBe(0);
    
    // Position 0 (top-left) should be (-1, 1)
    const topLeft = positionToLocalCoords(0);
    expect(topLeft.x).toBe(-1);
    expect(topLeft.y).toBe(1);
    
    // Position 8 (bottom-right) should be (1, -1)
    const bottomRight = positionToLocalCoords(8);
    expect(bottomRight.x).toBe(1);
    expect(bottomRight.y).toBe(-1);
  });

  test('should convert face index to z coordinate', () => {
    // Face 1 (middle) should be z = 0 (origin face)
    expect(faceIndexToZ(1)).toBe(0);
    
    // Face 0 (back) should be z = -1
    expect(faceIndexToZ(0)).toBe(-1);
    
    // Face 2 (front) should be z = 1
    expect(faceIndexToZ(2)).toBe(1);
  });

  test('should calculate block coordinates within cube', () => {
    // Origin block: face 1 (middle), position 4 (center) = (0, 0, 0)
    const origin = calculateBlockCoords(1, 4);
    expect(origin.x).toBe(0);
    expect(origin.y).toBe(0);
    expect(origin.z).toBe(0);
    
    // Block at face 0, position 0 (back, top-left) = (-1, 1, -1)
    const backTopLeft = calculateBlockCoords(0, 0);
    expect(backTopLeft.x).toBe(-1);
    expect(backTopLeft.y).toBe(1);
    expect(backTopLeft.z).toBe(-1);
    
    // Block at face 2, position 8 (front, bottom-right) = (1, -1, 1)
    const frontBottomRight = calculateBlockCoords(2, 8);
    expect(frontBottomRight.x).toBe(1);
    expect(frontBottomRight.y).toBe(-1);
    expect(frontBottomRight.z).toBe(1);
  });

  test('should calculate cube coordinates', () => {
    // First cube (index 0) at level 1 should be at origin
    const firstCube = calculateCubeCoords(0, 1);
    expect(firstCube.x).toBe(0);
    expect(firstCube.y).toBe(0);
    expect(firstCube.z).toBe(0);
  });

  test('should calculate absolute coordinates', () => {
    // Origin block: first cube, middle face, center position
    const origin = calculateAbsoluteCoords({
      faceIndex: 1,
      position: 4,
      cubeIndex: 0,
      level: 1
    });
    expect(origin.x).toBe(0);
    expect(origin.y).toBe(0);
    expect(origin.z).toBe(0);
    
    // Block at face 0, position 0 in first cube
    const block = calculateAbsoluteCoords({
      faceIndex: 0,
      position: 0,
      cubeIndex: 0,
      level: 1
    });
    expect(block.x).toBe(-1);
    expect(block.y).toBe(1);
    expect(block.z).toBe(-1);
  });

  test('should calculate vector from origin', () => {
    const coords = { x: 3, y: 4, z: 0 };
    const vector = calculateVector(coords);
    
    expect(vector.x).toBe(3);
    expect(vector.y).toBe(4);
    expect(vector.z).toBe(0);
    expect(vector.magnitude).toBe(5); // sqrt(3^2 + 4^2)
    expect(vector.direction.x).toBeCloseTo(0.6);
    expect(vector.direction.y).toBeCloseTo(0.8);
    expect(vector.direction.z).toBe(0);
  });

  test('should calculate vector for origin block', () => {
    const coords = { x: 0, y: 0, z: 0 };
    const vector = calculateVector(coords);
    
    expect(vector.magnitude).toBe(0);
    expect(vector.direction.x).toBe(0);
    expect(vector.direction.y).toBe(0);
    expect(vector.direction.z).toBe(0);
  });

  test('should calculate fractal address', () => {
    const address = calculateFractalAddress({
      faceIndex: 1,
      position: 4,
      cubeIndex: 0,
      level: 1
    });
    
    expect(address).toBeDefined();
    expect(Array.isArray(address)).toBe(true);
    expect(address.length).toBeGreaterThan(0);
  });

  test('should get origin coordinates', () => {
    const origin = getOrigin();
    expect(origin.x).toBe(0);
    expect(origin.y).toBe(0);
    expect(origin.z).toBe(0);
  });
});


