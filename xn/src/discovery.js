import { multiaddr } from 'multiaddr';

export class PeerDiscovery {
  constructor(node) {
    this.node = node;
    this.discoveredPeers = new Set();
    
    // Track discovered peers
    node.on('peer:discovered', (peer) => {
      this.discoveredPeers.add(peer.id.toString());
    });
  }

  async bootstrap(bootstrapAddresses) {
    for (const addr of bootstrapAddresses) {
      try {
        await this.node.node.dial(multiaddr(addr));
      } catch (error) {
        console.warn(`Failed to bootstrap to ${addr}:`, error);
      }
    }
  }

  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers);
  }
}

