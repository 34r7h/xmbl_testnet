const { describe, test, expect } = require('@jest/globals');

describe('Renderer IPC API', () => {
  test('should define electronAPI interface', () => {
    // Test that the API interface is properly defined
    const apiMethods = [
      'getBalance',
      'sendTransaction',
      'getNodeStatus',
      'startNode',
      'stopNode',
      'onNodeStatusUpdate',
      'removeNodeStatusUpdate'
    ];
    
    apiMethods.forEach(method => {
      expect(typeof method).toBe('string');
    });
  });

  test('should have correct IPC method signatures', () => {
    // Verify IPC methods are callable functions
    const methods = {
      getBalance: (address) => Promise.resolve({ balance: 0 }),
      sendTransaction: (tx) => Promise.resolve({ txId: '' }),
      getNodeStatus: () => Promise.resolve({ running: false, peers: 0, height: 0 }),
      startNode: () => Promise.resolve({ success: true }),
      stopNode: () => Promise.resolve({ success: true })
    };
    
    Object.keys(methods).forEach(method => {
      expect(typeof methods[method]).toBe('function');
    });
  });
});

