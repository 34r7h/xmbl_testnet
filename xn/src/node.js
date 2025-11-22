import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { kadDHT } from '@libp2p/kad-dht';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { mdns } from '@libp2p/mdns';
import { identify } from '@libp2p/identify';
import { multiaddr } from '@multiformats/multiaddr';
import { EventEmitter } from 'events';
import { PeerDiscovery } from './discovery.js';
import { PubSubManager } from './pubsub.js';
import { ConnectionManager } from './connection.js';

export class XNNode extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      port: options.port || 3000,
      addresses: options.addresses || [],
      ...options
    };
    this.node = null;
    this.started = false;
    this.discovery = null;
    this.pubsub = null;
    this.connectionManager = new ConnectionManager(options.connectionManager || {});
  }

  async start() {
    if (this.started) return;

    this.node = await createLibp2p({
      addresses: {
        listen: this.options.addresses.length > 0 
          ? this.options.addresses 
          : [`/ip4/0.0.0.0/tcp/${this.options.port}`]
      },
      transports: [tcp(), webSockets()],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: [mdns()],
      services: {
        identify: identify(),
        pubsub: gossipsub()
      }
    });

    // Initialize managers
    this.discovery = new PeerDiscovery(this);
    this.pubsub = new PubSubManager(this);

    // Event handlers
    this.node.addEventListener('peer:discovery', (evt) => {
      this.emit('peer:discovered', evt.detail);
    });

    this.node.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.toString();
      this.connectionManager.addConnection(peerId, evt.detail);
      this.emit('peer:connected', evt.detail);
    });

    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString();
      this.connectionManager.removeConnection(peerId);
      this.emit('peer:disconnected', evt.detail);
    });

    await this.node.start();
    this.started = true;
    this.emit('started');
  }

  async stop() {
    if (!this.started) return;
    await this.node.stop();
    this.started = false;
    this.emit('stopped');
  }

  isStarted() {
    return this.started;
  }

  getPeerId() {
    return this.node?.peerId;
  }

  getAddresses() {
    return this.node?.getMultiaddrs() || [];
  }

  async connect(address) {
    if (!this.started) {
      throw new Error('Node must be started before connecting');
    }
    const addr = typeof address === 'string' ? multiaddr(address) : address;
    try {
      const connection = await this.node.dial(addr);
      // Wait a bit for connection to fully establish
      await new Promise(resolve => setTimeout(resolve, 100));
      const peerId = connection.remotePeer.toString();
      this.connectionManager.addConnection(peerId, connection);
      return connection;
    } catch (error) {
      // If connection fails, still try to track it via peer:connect event
      throw error;
    }
  }

  getConnectedPeers() {
    if (!this.node) return [];
    return Array.from(this.node.getPeers());
  }

  async subscribe(topic) {
    if (!this.started) {
      throw new Error('Node must be started before subscribing');
    }
    return await this.pubsub.subscribe(topic);
  }

  async unsubscribe(topic) {
    if (!this.started) return;
    return await this.pubsub.unsubscribe(topic);
  }

  async publish(topic, data) {
    if (!this.started) {
      throw new Error('Node must be started before publishing');
    }
    return await this.pubsub.publish(topic, data);
  }

  isSubscribed(topic) {
    return this.pubsub ? this.pubsub.isSubscribed(topic) : false;
  }
}