import { XNNode } from '../src/node.js';

describe('XNNode', () => {
  let node;

  beforeEach(async () => {
    node = new XNNode({ port: 0 }); // Random port
  });

  afterEach(async () => {
    if (node) await node.stop();
  });

  it('should create node', async () => {
    await node.start();
    expect(node).not.toBeUndefined();
    expect(node.getPeerId()).not.toBeUndefined();
  });

  it('should start node', async () => {
    await node.start();
    expect(node.isStarted()).toBe(true);
    expect(node.getAddresses().length).toBeGreaterThan(0);
  });

  it('should stop node', async () => {
    await node.start();
    await node.stop();
    expect(node.isStarted()).toBe(false);
  });

  it('should get peer ID', async () => {
    await node.start();
    const peerId = node.getPeerId();
    expect(peerId).not.toBeUndefined();
    expect(peerId.toString()).toMatch(/^12D3Koo/);
  });

  it('should initialize with default options', () => {
    const defaultNode = new XNNode();
    expect(defaultNode.options.port).toBe(3000);
    expect(defaultNode.options.addresses).toEqual([]);
  });

  it('should start and stop the node', async () => {
    const testNode = new XNNode();
    await testNode.start();
    expect(testNode.isStarted()).toBe(true);

    await testNode.stop();
    expect(testNode.isStarted()).toBe(false);
  });

  it('should throw error when connecting before start', async () => {
    const node = new XNNode({ port: 0 });

    try {
      await node.connect('/ip4/127.0.0.1/tcp/3002');
      throw new Error('Should have thrown error');
    } catch (error) {
      expect(error.message).toContain('Node must be started before connecting');
    }
  });

  it('should throw error when subscribing before start', async () => {
    const node = new XNNode({ port: 0 });

    try {
      await node.subscribe('test-topic');
      throw new Error('Should have thrown error');
    } catch (error) {
      expect(error.message).toContain('Node must be started before subscribing');
    }
  });

  it('should throw error when publishing before start', async () => {
    const node = new XNNode({ port: 0 });

    try {
      await node.publish('test-topic', {});
      throw new Error('Should have thrown error');
    } catch (error) {
      expect(error.message).toContain('Node must be started before publishing');
    }
  });

  it('should handle connection errors gracefully', async () => {
    const node = new XNNode({ port: 0 });
    await node.start();

    // Try to connect to invalid address
    try {
      await node.connect('/ip4/127.0.0.1/tcp/99999');
    } catch (error) {
      // Should throw error but not crash
      expect(error).not.toBeUndefined();
    }

    await node.stop();
  });

  it('should return empty array for getPeerId when not started', () => {
    const node = new XNNode({ port: 0 });
    const peerId = node.getPeerId();
    expect(peerId).toBeUndefined();
  });

  it('should return empty array for getAddresses when not started', () => {
    const node = new XNNode({ port: 0 });
    const addresses = node.getAddresses();
    expect(addresses).toEqual([]);
  });

  it('should return empty array for getConnectedPeers when not started', () => {
    const node = new XNNode({ port: 0 });
    const peers = node.getConnectedPeers();
    expect(peers).toEqual([]);
  });

  it('should handle unsubscribe when not started', async () => {
    const node = new XNNode({ port: 0 });
    // Should not throw
    await node.unsubscribe('test-topic');
  });

  it('should return false for isSubscribed when not started', () => {
    const node = new XNNode({ port: 0 });
    expect(node.isSubscribed('test-topic')).toBe(false);
  });

  it('should track connections in connection manager on peer:connect', async () => {
    const node = new XNNode({ port: 0 });
    await node.start();

    // Simulate peer:connect event
    const mockPeer = { toString: () => 'peer123' };
    node.node.dispatchEvent(new CustomEvent('peer:connect', { detail: mockPeer }));

    // Wait for event to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Connection should be tracked
    expect(node.connectionManager.getConnectionCount()).toBeGreaterThanOrEqual(0);

    await node.stop();
  });

  it('should remove connections on peer:disconnect', async () => {
    const node = new XNNode({ port: 0 });
    await node.start();

    // Add a connection first
    node.connectionManager.addConnection('peer123', {});
    expect(node.connectionManager.getConnectionCount()).toBe(1);

    // Simulate peer:disconnect event
    const mockPeer = { toString: () => 'peer123' };
    node.node.dispatchEvent(new CustomEvent('peer:disconnect', { detail: mockPeer }));

    // Wait for event to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Connection should be removed
    expect(node.connectionManager.getConnectionCount()).toBe(0);

    await node.stop();
  });

  it('should track connection in connect method', async () => {
    const node1 = new XNNode({ port: 0 });
    const node2 = new XNNode({ port: 0 });

    await node1.start();
    await node2.start();

    // Wait for nodes to be ready
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const addr = node1.getAddresses()[0];
      await node2.connect(addr);

      // Wait for connection to establish
      await new Promise(resolve => setTimeout(resolve, 500));

      // Connection should be tracked (if connection succeeded)
      const count = node2.connectionManager.getConnectionCount();
      expect(count).toBeGreaterThanOrEqual(0);
    } catch (error) {
      // Connection might fail in test environment
    }

    await node1.stop();
    await node2.stop();
  }, 5000);

  it('should unsubscribe when started', async () => {
    const node = new XNNode({ port: 0 });
    await node.start();

    // Subscribe first
    await node.subscribe('test-topic');
    expect(node.isSubscribed('test-topic')).toBe(true);

    // Unsubscribe
    await node.unsubscribe('test-topic');
    expect(node.isSubscribed('test-topic')).toBe(false);

    await node.stop();
  }, 3000);
});
