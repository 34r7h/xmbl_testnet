export class LeaderElection {
  constructor() {
    // uptime_mempool: { ip: { timestamp: [count, avgResponseTime] } }
    this.uptimeMempool = new Map();
    this.nodeIdToIp = new Map(); // Map nodeId to IP for lookup
    this.pulseInterval = 20000; // 20 seconds
    this.timeout = 60000; // 60 seconds
    this.leaderRotationInterval = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
    this.lastElectionTime = Date.now();
    this.currentLeaders = [];
  }

  recordPulse(nodeId, ip, responseTime = null) {
    const now = Date.now();
    
    // Store nodeId to IP mapping
    this.nodeIdToIp.set(nodeId, ip);
    
    if (!this.uptimeMempool.has(ip)) {
      this.uptimeMempool.set(ip, {
        timestamp: now,
        count: 1,
        avgResponseTime: responseTime || 0
      });
    } else {
      const entry = this.uptimeMempool.get(ip);
      const timeSinceLastPulse = now - entry.timestamp;
      
      if (timeSinceLastPulse > this.timeout) {
        // Node timed out, reset
        entry.timestamp = now;
        entry.count = 1;
        entry.avgResponseTime = responseTime || 0;
      } else {
        // Update count and average response time
        entry.count++;
        if (responseTime !== null) {
          entry.avgResponseTime = (entry.avgResponseTime * (entry.count - 1) + responseTime) / entry.count;
        }
        entry.timestamp = now;
      }
    }
  }

  getUptime(nodeId) {
    // Find by nodeId
    const ip = this.nodeIdToIp.get(nodeId);
    if (!ip) return null;
    return this.uptimeMempool.get(ip) || null;
  }

  electLeaders(count) {
    // Check if rotation is needed (4 hours)
    const now = Date.now();
    const timeSinceLastElection = now - this.lastElectionTime;
    
    if (timeSinceLastElection >= this.leaderRotationInterval || this.currentLeaders.length === 0) {
      // Perform new election
      this.currentLeaders = this._performElection(count);
      this.lastElectionTime = now;
    }
    
    return [...this.currentLeaders];
  }

  _performElection(count) {
    // Sort by uptime count and response time
    const nodes = Array.from(this.uptimeMempool.entries())
      .map(([ip, data]) => ({
        ip,
        count: data.count,
        avgResponseTime: data.avgResponseTime,
        score: data.count / (data.avgResponseTime + 1) // Higher is better
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(n => n.ip);
    
    return nodes;
  }

  forceElection(count) {
    // Force immediate election (for testing or manual rotation)
    this.currentLeaders = this._performElection(count);
    this.lastElectionTime = Date.now();
    return [...this.currentLeaders];
  }

  getCurrentLeaders() {
    return [...this.currentLeaders];
  }

  getTimeUntilNextElection() {
    const now = Date.now();
    const timeSinceLastElection = now - this.lastElectionTime;
    const timeUntilNext = this.leaderRotationInterval - timeSinceLastElection;
    return Math.max(0, timeUntilNext);
  }
}
