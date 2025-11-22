# XN - XMBL Networking Instructions

## Overview

XN provides the complete networking layer for XMBL, handling P2P node discovery, connection management, message routing, and gossip protocols. Built on libp2p-js for core P2P functionality and WebTorrent for efficient gossip-based message propagation, XN enables decentralized communication between XMBL nodes.

## Fundamentals

### Key Concepts

- **libp2p-js**: Core P2P networking stack (DHT, pubsub, transport)
- **WebTorrent**: Gossip protocol for consensus and mempool propagation
- **Node Discovery**: DHT-based peer discovery
- **Connection Management**: Maintain connections to peers
- **Message Routing**: Route messages to appropriate handlers
- **Gossip Protocol**: Efficient broadcast of transactions and blocks

### Dependencies

- **libp2p**: Core P2P networking
- **libp2p-tcp**: TCP transport
- **libp2p-websockets**: WebSocket transport (browser)
- **libp2p-kad-dht**: Kademlia DHT for discovery
- **libp2p-pubsub**: Publish/subscribe messaging
- **webtorrent**: WebTorrent for gossip
- **multiaddr**: Multi-address format

### Architectural Decisions

- **Transport Agnostic**: Support TCP (Node.js) and WebSocket (browser)
- **DHT Discovery**: Use Kademlia DHT for peer discovery
- **PubSub**: Use libp2p pubsub for topic-based messaging
- **WebTorrent Gossip**: Use WebTorrent for efficient gossip in consensus
- **Connection Pooling**: Maintain pool of active connections

## Development Steps

### Step 1: Project Setup

```bash
cd xn
npm init -y
npm install libp2p libp2p-tcp libp2p-websockets libp2p-kad-dht libp2p-pubsub webtorrent multiaddr
npm install --save-dev jest @types/jest
```

### Step 2: libp2p Node Setup (TDD)

**Test First** (`__tests__/node.test.js`):

```javascript
import { describe, test, expect, beforeEach, afterEach } from 'jest';
import { XNNode } from '../src/node';

describe('XN Node', () => {
  let node;

  beforeEach(async () => {
    node = new XNNode({ port: 0 }); // Random port
  });

  afterEach(async () => {
    if (node) await node.stop();
  });

  test('should create node', () => {
    expect(node).toBeDefined();
    expect(node.peerId).toBeDefined();
  });

  test('should start node', async () => {
    await node.start();
    expect(node.isStarted()).toBe(true);
    expect(node.getAddresses().length).toBeGreaterThan(0);
  });

  test('should stop node', async () => {
    await node.start();
    await node.stop();
    expect(node.isStarted()).toBe(false);
  });

  test('should get peer ID', () => {
    const peerId = node.getPeerId();
    expect(peerId).toBeDefined();
    expect(peerId.toString()).toMatch(/^12D3Koo/);
  });
});
```

**Implementation** (`src/node.js`):

```javascript
import { createLibp2p } from 'libp2p';
import { TCP } from 'libp2p-tcp';
import { WebSockets } from 'libp2p-websockets';
import { KadDHT } from 'libp2p-kad-dht';
import { GossipSub } from 'libp2p-pubsub';
import { multiaddr } from 'multiaddr';
import { EventEmitter } from 'events';

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
  }

  async start() {
    if (this.started) return;

    this.node = await createLibp2p({
      addresses: {
        listen: this.options.addresses.length > 0 
          ? this.options.addresses 
          : [`/ip4/0.0.0.0/tcp/${this.options.port}`]
      },
      transports: [
        new TCP(),
        new WebSockets()
      ],
      connectionEncryption: [],
      streamMuxers: [],
      peerDiscovery: [
        new KadDHT({
          kBucketSize: 20
        })
      ],
      pubsub: new GossipSub()
    });

    // Event handlers
    this.node.addEventListener('peer:discovery', (evt) => {
      this.emit('peer:discovered', evt.detail);
    });

    this.node.addEventListener('peer:connect', (evt) => {
      this.emit('peer:connected', evt.detail);
    });

    this.node.addEventListener('peer:disconnect', (evt) => {
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
}
```

### Step 3: Peer Discovery (TDD)

**Test** (`__tests__/discovery.test.js`):

```javascript
import { describe, test, expect, beforeEach, afterEach } from 'jest';
import { XNNode } from '../src/node';

describe('Peer Discovery', () => {
  let node1, node2;

  beforeEach(async () => {
    node1 = new XNNode({ port: 3001 });
    node2 = new XNNode({ port: 3002 });
    await node1.start();
    await node2.start();
  });

  afterEach(async () => {
    await node1.stop();
    await node2.stop();
  });

  test('should discover peers', (done) => {
    node1.on('peer:discovered', (peer) => {
      expect(peer).toBeDefined();
      done();
    });
    // Connect node2 to node1
    const addr = node1.getAddresses()[0];
    node2.node.dial(addr);
  });

  test('should connect to discovered peer', async () => {
    const addr = node1.getAddresses()[0];
    await node2.connect(addr);
    const peers = node2.getConnectedPeers();
    expect(peers.length).toBeGreaterThan(0);
  });
});
```

**Implementation** (`src/discovery.js`):

```javascript
export class PeerDiscovery {
  constructor(node) {
    this.node = node;
    this.discoveredPeers = new Set();
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
```

### Step 4: Message Routing (TDD)

**Test** (`__tests__/routing.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { MessageRouter } from '../src/routing';

describe('Message Routing', () => {
  test('should register message handler', () => {
    const router = new MessageRouter();
    const handler = jest.fn();
    router.register('transaction', handler);
    expect(router.hasHandler('transaction')).toBe(true);
  });

  test('should route message to handler', async () => {
    const router = new MessageRouter();
    const handler = jest.fn();
    router.register('transaction', handler);
    
    const message = { type: 'transaction', data: { to: 'bob', amount: 1.0 } };
    await router.route(message);
    
    expect(handler).toHaveBeenCalledWith(message.data);
  });

  test('should handle unknown message type', async () => {
    const router = new MessageRouter();
    const message = { type: 'unknown', data: {} };
    await expect(router.route(message)).rejects.toThrow('No handler for message type: unknown');
  });
});
```

**Implementation** (`src/routing.js`):

```javascript
export class MessageRouter {
  constructor() {
    this.handlers = new Map();
  }

  register(type, handler) {
    this.handlers.set(type, handler);
  }

  hasHandler(type) {
    return this.handlers.has(type);
  }

  async route(message) {
    const handler = this.handlers.get(message.type);
    if (!handler) {
      throw new Error(`No handler for message type: ${message.type}`);
    }
    return await handler(message.data);
  }
}
```

### Step 5: PubSub Topics (TDD)

**Test** (`__tests__/pubsub.test.js`):

```javascript
import { describe, test, expect, beforeEach, afterEach } from 'jest';
import { XNNode } from '../src/node';

describe('PubSub', () => {
  let node1, node2;

  beforeEach(async () => {
    node1 = new XNNode({ port: 3001 });
    node2 = new XNNode({ port: 3002 });
    await node1.start();
    await node2.start();
    // Connect nodes
    const addr = node1.getAddresses()[0];
    await node2.connect(addr);
  });

  afterEach(async () => {
    await node1.stop();
    await node2.stop();
  });

  test('should subscribe to topic', async () => {
    await node1.subscribe('transactions');
    expect(node1.isSubscribed('transactions')).toBe(true);
  });

  test('should publish message to topic', (done) => {
    node2.subscribe('transactions').then(() => {
      node2.on('message:transactions', (message) => {
        expect(message).toEqual({ to: 'bob', amount: 1.0 });
        done();
      });
      
      node1.publish('transactions', { to: 'bob', amount: 1.0 });
    });
  });
});
```

**Implementation** (`src/pubsub.js`):

```javascript
export class PubSubManager {
  constructor(node) {
    this.node = node;
    this.subscriptions = new Map();
  }

  async subscribe(topic) {
    if (this.subscriptions.has(topic)) return;
    
    const handler = (msg) => {
      const data = JSON.parse(msg.data.toString());
      this.node.emit(`message:${topic}`, data);
    };
    
    await this.node.node.pubsub.subscribe(topic, handler);
    this.subscriptions.set(topic, handler);
  }

  async unsubscribe(topic) {
    const handler = this.subscriptions.get(topic);
    if (handler) {
      await this.node.node.pubsub.unsubscribe(topic, handler);
      this.subscriptions.delete(topic);
    }
  }

  async publish(topic, data) {
    const message = Buffer.from(JSON.stringify(data));
    await this.node.node.pubsub.publish(topic, message);
  }

  isSubscribed(topic) {
    return this.subscriptions.has(topic);
  }
}
```

### Step 6: WebTorrent Gossip (TDD)

**Test** (`__tests__/gossip.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { GossipManager } from '../src/gossip';

describe('WebTorrent Gossip', () => {
  test('should create gossip manager', () => {
    const gossip = new GossipManager();
    expect(gossip).toBeDefined();
  });

  test('should broadcast message', async () => {
    const gossip = new GossipManager();
    const message = { type: 'transaction', data: { to: 'bob', amount: 1.0 } };
    await gossip.broadcast(message);
    // Verify message was broadcast (implementation specific)
  });

  test('should receive gossip messages', (done) => {
    const gossip = new GossipManager();
    gossip.on('message', (msg) => {
      expect(msg).toHaveProperty('type');
      expect(msg).toHaveProperty('data');
      done();
    });
    // Simulate receiving message
    gossip._handleMessage({ type: 'transaction', data: {} });
  });
});
```

**Implementation** (`src/gossip.js`):

```javascript
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
        this._handleMessage(JSON.parse(msg.toString()));
      });
    });
  }

  async broadcast(message) {
    // Broadcast message to swarm
    const msg = Buffer.from(JSON.stringify(message));
    if (this.swarm) {
      this.swarm.files.forEach(file => {
        // Send message to all connected peers
        this.swarm.wires.forEach(wire => {
          wire.send(msg);
        });
      });
    }
  }

  _handleMessage(message) {
    this.emit('message', message);
  }
}
```

### Step 7: Connection Management (TDD)

**Test** (`__tests__/connection.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { ConnectionManager } from '../src/connection';

describe('Connection Manager', () => {
  test('should maintain connection pool', () => {
    const manager = new ConnectionManager({ maxConnections: 10 });
    expect(manager.getMaxConnections()).toBe(10);
  });

  test('should add connection', () => {
    const manager = new ConnectionManager();
    manager.addConnection('peer1', {});
    expect(manager.getConnectionCount()).toBe(1);
  });

  test('should remove connection', () => {
    const manager = new ConnectionManager();
    manager.addConnection('peer1', {});
    manager.removeConnection('peer1');
    expect(manager.getConnectionCount()).toBe(0);
  });

  test('should enforce max connections', () => {
    const manager = new ConnectionManager({ maxConnections: 2 });
    manager.addConnection('peer1', {});
    manager.addConnection('peer2', {});
    expect(() => manager.addConnection('peer3', {})).toThrow('Max connections reached');
  });
});
```

## Interfaces/APIs

### Exported Classes

```javascript
export class XNNode extends EventEmitter {
  constructor(options?: NodeOptions);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  isStarted(): boolean;
  getPeerId(): PeerId;
  getAddresses(): Multiaddr[];
  async connect(address: Multiaddr): Promise<void>;
  getConnectedPeers(): PeerId[];
  async subscribe(topic: string): Promise<void>;
  async unsubscribe(topic: string): Promise<void>;
  async publish(topic: string, data: any): Promise<void>;
  isSubscribed(topic: string): boolean;
}

export class MessageRouter {
  register(type: string, handler: Function): void;
  hasHandler(type: string): boolean;
  async route(message: Message): Promise<void>;
}

export class GossipManager extends EventEmitter {
  async joinSwarm(swarmId: string): Promise<void>;
  async broadcast(message: any): Promise<void>;
}
```

## Testing

### Test Scenarios

1. **Node Lifecycle**
   - Start/stop node
   - Peer ID generation
   - Address binding

2. **Peer Discovery**
   - DHT discovery
   - Bootstrap connections
   - Peer connection management

3. **Message Routing**
   - Handler registration
   - Message routing
   - Error handling

4. **PubSub**
   - Topic subscription
   - Message publishing
   - Message reception

5. **Gossip**
   - Swarm joining
   - Message broadcasting
   - Message reception

6. **Connection Management**
   - Connection pooling
   - Max connection limits
   - Connection cleanup

### Coverage Goals

- 90%+ code coverage
- Network failure scenarios
- Concurrent connection handling
- Message delivery guarantees

## Integration Notes

### Module Dependencies

- **xclt**: Uses XN for block propagation
- **xpc**: Uses XN for consensus gossip
- **xsc**: Uses XN for storage/compute requests

### Integration Pattern

```javascript
import { XNNode } from 'xn';
import { XCLT } from 'xclt';
import { XPC } from 'xpc';

const xn = new XNNode({ port: 3000 });
await xn.start();

// Subscribe to transaction topic
await xn.subscribe('transactions');
xn.on('message:transactions', async (tx) => {
  await xclt.addTransaction(tx);
});

// Publish new blocks
xclt.on('block:added', (block) => {
  xn.publish('blocks', block);
});
```

## Terminal and Browser Monitoring

### Terminal Output

- **Node Start**: Log node startup with addresses
  ```javascript
  console.log(`Node started: ${node.getPeerId()}`);
  console.log(`Listening on: ${node.getAddresses().join(', ')}`);
  ```

- **Peer Connections**: Log peer connections/disconnections
  ```javascript
  console.log(`Peer connected: ${peerId}`);
  console.log(`Active connections: ${node.getConnectedPeers().length}`);
  ```

- **Message Stats**: Periodic message statistics
  ```javascript
  console.log(`Messages sent: ${sent}, received: ${received}`);
  ```

### Screenshot Requirements

Capture terminal output for:
- Node startup logs
- Peer connection events
- Message routing logs
- Network error messages

### Browser Console

For browser-based nodes:
- **Network Tab**: Monitor WebSocket connections
- **Console**: Log peer connections and messages
- **Performance**: Profile network operations

### Console Logging

- Log all peer events (connect/disconnect)
- Log message routing with timing
- Include network statistics
- Log errors with context
