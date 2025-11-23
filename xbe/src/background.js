import browser from 'webextension-polyfill';

class BackgroundNode {
  constructor() {
    this.core = null;
    this.initialized = false;
    this.nodeRunning = false;
  }

  async init() {
    if (this.initialized) return;
    
    console.log('Initializing XMBL Background Node...');
    
    // TODO: Initialize XMBL core when modules are available
    // this.core = new XMBLCore({
    //   storage: 'browser',
    //   network: 'browser'
    // });
    // await this.core.init();
    
    this.initialized = true;
    console.log('XMBL Background Node initialized');
    
    // Set up message listener
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message).then(sendResponse).catch(err => {
        console.error('Error handling message:', err);
        sendResponse({ error: err.message });
      });
      return true; // Async response
    });
  }

  async handleMessage(message) {
    console.log('Received message:', message.type);
    
    switch (message.type) {
      case 'getBalance':
        return await this.getBalance(message.address);
      case 'sendTransaction':
        return await this.sendTransaction(message.tx);
      case 'getNodeStatus':
        return await this.getNodeStatus();
      case 'startNode':
        return await this.startNode();
      case 'stopNode':
        return await this.stopNode();
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  async getBalance(address) {
    // TODO: Implement with XMBL core
    // const balance = await this.core.getBalance(address);
    // return { balance };
    return { balance: 0 };
  }

  async sendTransaction(tx) {
    // TODO: Implement with XMBL core
    // const txId = await this.core.sendTransaction(tx);
    // return { txId };
    console.log('Sending transaction:', tx);
    return { txId: 'mock-tx-id-' + Date.now() };
  }

  async getNodeStatus() {
    return {
      running: this.nodeRunning,
      peers: 0, // TODO: this.core.getPeerCount(),
      height: 0 // TODO: this.core.getBlockHeight()
    };
  }

  async startNode() {
    if (this.nodeRunning) return { success: true };
    
    console.log('Starting XMBL node...');
    // TODO: await this.core.start();
    this.nodeRunning = true;
    console.log('XMBL node started');
    return { success: true };
  }

  async stopNode() {
    if (!this.nodeRunning) return { success: true };
    
    console.log('Stopping XMBL node...');
    // TODO: await this.core.stop();
    this.nodeRunning = false;
    console.log('XMBL node stopped');
    return { success: true };
  }

  isInitialized() {
    return this.initialized;
  }

  isNodeRunning() {
    return this.nodeRunning;
  }
}

// Initialize on install
browser.runtime.onInstalled.addListener(() => {
  console.log('XMBL Extension installed');
  const node = new BackgroundNode();
  node.init();
});

// Keep background script alive
const node = new BackgroundNode();
node.init();



