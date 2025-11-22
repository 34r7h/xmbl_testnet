import { EventEmitter } from 'events';

export class ConsensusGossip extends EventEmitter {
  constructor(options = {}) {
    super();
    this.broadcasts = []; // Store broadcasts for testing
    
    // Integration: xn for network gossip
    this.xn = options.xn || null;
    this.topic = options.topic || 'consensus:raw_tx';
    
    // Subscribe to topic if network available and started
    if (this.xn && this.xn.started) {
      this.xn.subscribe(this.topic).catch(() => {});
      this.xn.on(`message:${this.topic}`, (data) => {
        this._handleMessage(data);
      });
    }
  }

  async broadcastRawTransaction(leaderId, tx) {
    const message = {
      type: 'raw_tx',
      leaderId,
      tx,
      timestamp: Date.now()
    };
    
    this.broadcasts.push(message);
    this.emit('raw_tx:broadcast', message);
    
    // Integration: Broadcast via network if xn available
    if (this.xn) {
      try {
        await this.xn.publish(this.topic, message);
      } catch (error) {
        console.warn('Failed to broadcast transaction:', error.message);
      }
    }
  }

  _handleMessage(message) {
    // Handle incoming gossip messages
    if (message.type === 'raw_tx') {
      this.emit('raw_tx:received', {
        leaderId: message.leaderId,
        tx: message.tx
      });
    }
  }
}

