import WebTorrent from 'webtorrent';
import { EventEmitter } from 'events';

export class GossipManager extends EventEmitter {
  constructor() {
    super();
    this.client = new WebTorrent();
    this.swarm = null;
  }

  async joinSwarm(swarmId) {
    // Join WebTorrent swarm for gossip
    this.swarm = this.client.add(swarmId, { announce: [] });
    this.swarm.on('wire', (wire) => {
      wire.on('message', (msg) => {
        try {
          this._handleMessage(JSON.parse(msg.toString()));
        } catch (error) {
          console.error('Error parsing gossip message:', error);
        }
      });
    });
  }

  async broadcast(message) {
    // Broadcast message to swarm
    const msg = Buffer.from(JSON.stringify(message));
    if (this.swarm) {
      this.swarm.wires.forEach(wire => {
        try {
          wire.send(msg);
        } catch (error) {
          console.error('Error broadcasting message:', error);
        }
      });
    }
  }

  _handleMessage(message) {
    this.emit('message', message);
  }

  destroy() {
    if (this.client) {
      this.client.destroy();
    }
  }
}

