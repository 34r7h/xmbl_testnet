export class ConnectionManager {
  constructor(options = {}) {
    this.maxConnections = options.maxConnections || 50;
    this.connections = new Map();
  }

  addConnection(peerId, connection) {
    if (this.connections.size >= this.maxConnections) {
      throw new Error('Max connections reached');
    }
    this.connections.set(peerId, connection);
  }

  removeConnection(peerId) {
    this.connections.delete(peerId);
  }

  getConnection(peerId) {
    return this.connections.get(peerId);
  }

  getConnectionCount() {
    return this.connections.size;
  }

  getMaxConnections() {
    return this.maxConnections;
  }

  getAllConnections() {
    return Array.from(this.connections.entries());
  }
}

