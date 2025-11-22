import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { LeaderElection } from '../src/leader-election.js';

describe('Leader Election', () => {
  let election;

  beforeEach(() => {
    election = new LeaderElection();
  });

  test('should track node uptime', () => {
    election.recordPulse('node1', '192.168.1.1');
    const uptime = election.getUptime('node1');
    expect(uptime).toBeDefined();
    expect(uptime.count).toBe(1);
    expect(uptime.timestamp).toBeDefined();
  });

  test('should calculate response time average', () => {
    election.recordPulse('node1', '192.168.1.1', 100);
    election.recordPulse('node1', '192.168.1.1', 200);
    const uptime = election.getUptime('node1');
    expect(uptime.avgResponseTime).toBe(150);
    expect(uptime.count).toBe(2);
  });

  test('should elect leaders based on performance', () => {
    election.recordPulse('node1', '192.168.1.1', 100);
    election.recordPulse('node2', '192.168.1.2', 50);
    const leaders = election.electLeaders(2);
    expect(leaders.length).toBe(2);
    // node2 should be first (faster response)
    expect(leaders[0]).toBe('192.168.1.2');
  });

  test('should prioritize nodes with higher uptime count', () => {
    // Node 1: 10 pulses, 100ms avg
    for (let i = 0; i < 10; i++) {
      election.recordPulse('node1', '192.168.1.1', 100);
    }
    // Node 2: 5 pulses, 50ms avg
    for (let i = 0; i < 5; i++) {
      election.recordPulse('node2', '192.168.1.2', 50);
    }
    
    const leaders = election.electLeaders(1);
    // Node 1 should win due to higher count despite slower response
    expect(leaders[0]).toBe('192.168.1.1');
  });

  test('should reset node on timeout', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    
    election.recordPulse('node1', '192.168.1.1', 100);
    expect(election.getUptime('node1').count).toBe(1);
    
    // Simulate timeout (61 seconds later)
    jest.spyOn(Date, 'now').mockReturnValue(now + 61000);
    election.recordPulse('node1', '192.168.1.1', 200);
    
    const uptime = election.getUptime('node1');
    expect(uptime.count).toBe(1); // Reset to 1
    expect(uptime.avgResponseTime).toBe(200);
    
    jest.restoreAllMocks();
  });

  test('should not reset node within timeout window', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    
    election.recordPulse('node1', '192.168.1.1', 100);
    
    // Within timeout (30 seconds later)
    jest.spyOn(Date, 'now').mockReturnValue(now + 30000);
    election.recordPulse('node1', '192.168.1.1', 200);
    
    const uptime = election.getUptime('node1');
    expect(uptime.count).toBe(2); // Should increment
    expect(uptime.avgResponseTime).toBe(150);
    
    jest.restoreAllMocks();
  });

  test('should handle nodes without response time', () => {
    election.recordPulse('node1', '192.168.1.1');
    election.recordPulse('node1', '192.168.1.1');
    const uptime = election.getUptime('node1');
    expect(uptime.count).toBe(2);
    expect(uptime.avgResponseTime).toBe(0);
  });

  test('should return null for nonexistent node', () => {
    const uptime = election.getUptime('nonexistent');
    expect(uptime).toBeNull();
  });

  test('should elect correct number of leaders', () => {
    election.recordPulse('node1', '192.168.1.1', 100);
    election.recordPulse('node2', '192.168.1.2', 50);
    election.recordPulse('node3', '192.168.1.3', 75);
    election.recordPulse('node4', '192.168.1.4', 200);
    
    const leaders1 = election.electLeaders(1);
    expect(leaders1.length).toBe(1);
    
    // Force new election for different count
    const leaders2 = election.forceElection(2);
    expect(leaders2.length).toBe(2);
    
    // Force new election for more than available
    const leaders3 = election.forceElection(10);
    expect(leaders3.length).toBe(4); // Should return all available
  });

  test('should calculate score correctly', () => {
    // Node with high count and low response time should score highest
    for (let i = 0; i < 20; i++) {
      election.recordPulse('node1', '192.168.1.1', 10);
    }
    for (let i = 0; i < 5; i++) {
      election.recordPulse('node2', '192.168.1.2', 5);
    }
    
    const leaders = election.electLeaders(1);
    // Node 1 should win: 20/(10+1) = 1.82 > 5/(5+1) = 0.83
    expect(leaders[0]).toBe('192.168.1.1');
  });

  test('should handle multiple nodes with same IP', () => {
    election.recordPulse('node1', '192.168.1.1', 100);
    election.recordPulse('node2', '192.168.1.1', 200);
    
    // Both should map to same IP entry
    const uptime1 = election.getUptime('node1');
    const uptime2 = election.getUptime('node2');
    
    // They share the same IP, so they share the same uptime data
    expect(uptime1).toEqual(uptime2);
  });

  test('should handle zero response time', () => {
    election.recordPulse('node1', '192.168.1.1', 0);
    election.recordPulse('node1', '192.168.1.1', 0);
    const uptime = election.getUptime('node1');
    expect(uptime.avgResponseTime).toBe(0);
    expect(uptime.count).toBe(2);
  });

  test('should sort leaders by score descending', () => {
    // Node 1: 10 pulses, 50ms avg -> score = 10/51 = 0.196
    for (let i = 0; i < 10; i++) {
      election.recordPulse('node1', '192.168.1.1', 50);
    }
    // Node 2: 5 pulses, 10ms avg -> score = 5/11 = 0.455
    for (let i = 0; i < 5; i++) {
      election.recordPulse('node2', '192.168.1.2', 10);
    }
    // Node 3: 8 pulses, 20ms avg -> score = 8/21 = 0.381
    for (let i = 0; i < 8; i++) {
      election.recordPulse('node3', '192.168.1.3', 20);
    }
    
    const leaders = election.electLeaders(3);
    // Should be sorted: node2 (0.455), node3 (0.381), node1 (0.196)
    expect(leaders[0]).toBe('192.168.1.2');
    expect(leaders[1]).toBe('192.168.1.3');
    expect(leaders[2]).toBe('192.168.1.1');
  });

  test('should handle empty leader election', () => {
    const leaders = election.electLeaders(5);
    expect(leaders).toEqual([]);
  });
});
