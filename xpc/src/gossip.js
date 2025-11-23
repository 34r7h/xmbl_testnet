import { EventEmitter } from 'events';
let WebTorrent = null;
// WebTorrent is optional - will be loaded lazily if available

/**
 * Consensus Gossip with WebTorrent integration
 * Broadcasts consensus messages via WebTorrent swarms
 */
export class ConsensusGossip extends EventEmitter {
  constructor(options = {}) {
    super();
    this.broadcasts = []; // Store broadcasts for testing
    this.client = null; // Will be initialized lazily if WebTorrent is available
    this.swarms = new Map(); // topic -> swarm
    
    // Integration: xn for network gossip (fallback)
    this.xn = options.xn || null;
    this.topic = options.topic || 'consensus:raw_tx';
    
    // Initialize WebTorrent swarm
    this._initSwarm().catch(() => {});
    
    // Subscribe to topic if network available and started
    if (this.xn && this.xn.started) {
      this.xn.subscribe(this.topic).catch(() => {});
      this.xn.on(`message:${this.topic}`, (data) => {
        this._handleMessage(data);
      });
    }
  }

  /**
   * Initialize WebTorrent swarm
   * @private
   */
  async _initSwarm() {
    // Lazy load WebTorrent if available
    if (!WebTorrent && !this.client) {
      try {
        const webtorrentModule = await import('webtorrent');
        WebTorrent = webtorrentModule.default;
        this.client = new WebTorrent();
      } catch (error) {
        // WebTorrent not available, skip
        return;
      }
    }
    
    if (!this.client) return;
    try {
      const swarm = this.client.swarm(this.topic);
      this.swarms.set(this.topic, swarm);

      swarm.on('wire', (wire) => {
        wire.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            this._handleMessage(data);
          } catch (error) {
            // Ignore invalid messages
          }
        });
      });
    } catch (error) {
      // WebTorrent may not be available in all environments
    }
  }

  /**
   * Broadcast raw transaction via WebTorrent and libp2p
   * @param {string} leaderId - Leader ID
   * @param {Object} tx - Transaction data
   */
  async broadcastRawTransaction(leaderId, tx) {
    const message = {
      type: 'raw_tx',
      leaderId,
      tx,
      timestamp: Date.now()
    };
    
    this.broadcasts.push(message);
    this.emit('raw_tx:broadcast', message);
    
    // Broadcast via WebTorrent if available
    const swarm = this.swarms.get(this.topic);
    if (swarm) {
      try {
        const messageBuffer = Buffer.from(JSON.stringify(message));
        swarm.broadcast(messageBuffer);
      } catch (error) {
        // Ignore WebTorrent errors
      }
    }
    
    // Integration: Broadcast via network if xn available (fallback)
    if (this.xn) {
      try {
        await this.xn.publish(this.topic, message);
      } catch (error) {
        console.warn('Failed to broadcast transaction:', error.message);
      }
    }
  }

  /**
   * Handle incoming gossip messages
   * @private
   */
  _handleMessage(message) {
    // Handle incoming gossip messages
    if (message.type === 'raw_tx') {
      this.emit('raw_tx:received', {
        leaderId: message.leaderId,
        tx: message.tx
      });
    }
  }

  /**
   * Cleanup and destroy swarms
   */
  async destroy() {
    for (const swarm of this.swarms.values()) {
      try {
        swarm.destroy();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    this.swarms.clear();
    this.client.destroy();
  }
}

