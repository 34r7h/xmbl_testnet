export class AvailabilityTester {
  constructor() {
    this.results = new Map(); // nodeId -> [ {available, responseTime, timestamp} ]
  }

  async testNode(nodeId, address) {
    const startTime = Date.now();
    try {
      // Ping node (simplified)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`http://${address}/health`, { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      const available = response.ok;
      this.recordResult(nodeId, available, responseTime);
      return available;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordResult(nodeId, false, responseTime);
      return false;
    }
  }

  recordResult(nodeId, available, responseTime) {
    if (!this.results.has(nodeId)) {
      this.results.set(nodeId, []);
    }
    this.results.get(nodeId).push({
      available,
      responseTime,
      timestamp: Date.now()
    });
  }

  getStats(nodeId) {
    const results = this.results.get(nodeId) || [];
    if (results.length === 0) {
      return { availability: 0, avgResponseTime: 0 };
    }
    
    const availableCount = results.filter(r => r.available).length;
    const availability = availableCount / results.length;
    const avgResponseTime = results
      .filter(r => r.available)
      .reduce((sum, r) => sum + r.responseTime, 0) / availableCount || 0;
    
    return { availability, avgResponseTime };
  }
}

