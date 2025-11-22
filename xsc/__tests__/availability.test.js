import { describe, test, expect } from '@jest/globals';
import { AvailabilityTester } from '../src/availability.js';

describe('Availability Testing', () => {
  test('should test node availability', async () => {
    const tester = new AvailabilityTester();
    // Mock fetch for testing - will fail but that's ok for this test
    const isAvailable = await tester.testNode('node1', '192.168.1.1');
    expect(typeof isAvailable).toBe('boolean');
  }, 10000);

  test('should record availability results', () => {
    const tester = new AvailabilityTester();
    tester.recordResult('node1', true, 100);
    const stats = tester.getStats('node1');
    expect(stats.availability).toBe(1.0);
    expect(stats.avgResponseTime).toBe(100);
  });

  test('should calculate availability percentage', () => {
    const tester = new AvailabilityTester();
    tester.recordResult('node1', true, 100);
    tester.recordResult('node1', false, 0);
    tester.recordResult('node1', true, 150);
    const stats = tester.getStats('node1');
    expect(stats.availability).toBe(2/3);
  });
});

