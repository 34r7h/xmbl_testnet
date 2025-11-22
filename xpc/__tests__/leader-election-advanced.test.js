import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { LeaderElection } from '../src/leader-election.js';

describe('Leader Election - Advanced', () => {
  let election;

  beforeEach(() => {
    election = new LeaderElection();
  });

  test('should perform election on first call', () => {
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    
    const leaders = election.electLeaders(2);
    expect(leaders.length).toBe(2);
    expect(election.getCurrentLeaders()).toEqual(leaders);
  });

  test('should cache leaders until rotation interval', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    
    const leaders1 = election.electLeaders(2);
    
    // Add better node
    election.recordPulse('node3', '192.168.1.3', 25);
    
    // Should return cached leaders (within 4 hours)
    jest.spyOn(Date, 'now').mockReturnValue(now + 1000); // 1 second later
    const leaders2 = election.electLeaders(2);
    
    expect(leaders2).toEqual(leaders1);
    expect(leaders2).not.toContain('192.168.1.3');
    
    jest.restoreAllMocks();
  });

  test('should rotate leaders after 4 hours', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    
    const leaders1 = election.electLeaders(2);
    
    // Add better node
    for (let i = 0; i < 10; i++) {
      election.recordPulse('node3', '192.168.1.3', 25);
    }
    
    // Simulate 4 hours + 1 second
    const fourHours = 4 * 60 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(now + fourHours + 1000);
    
    const leaders2 = election.electLeaders(2);
    
    // Should have new leaders
    expect(leaders2).toContain('192.168.1.3');
    
    jest.restoreAllMocks();
  });

  test('should return time until next election', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    
    election.recordPulse('node1', '192.168.1.1', 50);
    election.electLeaders(1);
    
    // Check time remaining
    const timeRemaining = election.getTimeUntilNextElection();
    const fourHours = 4 * 60 * 60 * 1000;
    expect(timeRemaining).toBeLessThanOrEqual(fourHours);
    expect(timeRemaining).toBeGreaterThan(fourHours - 1000); // Allow some margin
    
    jest.restoreAllMocks();
  });

  test('should return 0 when election is due', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    
    election.recordPulse('node1', '192.168.1.1', 50);
    election.electLeaders(1);
    
    // Simulate 4 hours later
    const fourHours = 4 * 60 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(now + fourHours);
    
    const timeRemaining = election.getTimeUntilNextElection();
    expect(timeRemaining).toBe(0);
    
    jest.restoreAllMocks();
  });

  test('should force immediate election', () => {
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    
    const leaders1 = election.electLeaders(2);
    
    // Add better node
    for (let i = 0; i < 10; i++) {
      election.recordPulse('node3', '192.168.1.3', 25);
    }
    
    // Force election
    const leaders2 = election.forceElection(2);
    
    // Should include new node
    expect(leaders2).toContain('192.168.1.3');
    expect(leaders2).not.toEqual(leaders1);
  });

  test('should get current leaders', () => {
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    
    election.electLeaders(2);
    const currentLeaders = election.getCurrentLeaders();
    
    expect(currentLeaders.length).toBe(2);
    expect(currentLeaders).toContain('192.168.1.1');
    expect(currentLeaders).toContain('192.168.1.2');
  });

  test('should handle election with no nodes', () => {
    const leaders = election.electLeaders(5);
    expect(leaders).toEqual([]);
    expect(election.getCurrentLeaders()).toEqual([]);
  });

  test('should update leaders on rotation', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    
    election.recordPulse('node1', '192.168.1.1', 50);
    election.recordPulse('node2', '192.168.1.2', 100);
    const leaders1 = election.electLeaders(2);
    
    // Node 1 improves significantly
    for (let i = 0; i < 20; i++) {
      election.recordPulse('node1', '192.168.1.1', 10);
    }
    
    // Rotate after 4 hours
    const fourHours = 4 * 60 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(now + fourHours + 1000);
    
    const leaders2 = election.electLeaders(2);
    
    // Node 1 should be first now
    expect(leaders2[0]).toBe('192.168.1.1');
    
    jest.restoreAllMocks();
  });
});

