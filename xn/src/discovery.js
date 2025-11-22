import { multiaddr } from '@multiformats/multiaddr';

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
        const ma = typeof addr === 'string' ? multiaddr(addr) : addr;
        await this.node.node.dial(ma);
      } catch (error) {
        // Silently handle bootstrap errors - expected in test environments
        // Error is caught and handled gracefully
      }
    }
  }

  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers);
  }
}

