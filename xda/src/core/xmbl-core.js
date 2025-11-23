const path = require('path');
const { app } = require('electron');

class XMBLCore {
  constructor(config = {}) {
    // Get userData path safely (app might not be ready in constructor)
    let userDataPath;
    try {
      userDataPath = app.getPath('userData');
    } catch (error) {
      // Fallback if app not ready
      userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || './', '.xmbl-desktop');
    }
    
    this.config = {
      ledger: {
        dbPath: config.ledger?.dbPath || path.join(userDataPath, 'ledger')
      },
      storage: {
        dbPath: config.storage?.dbPath || path.join(userDataPath, 'storage'),
        capacity: config.storage?.capacity || 1000000000 // 1GB default
      },
      network: {
        port: config.network?.port || 3000
      },
      stateMachine: {
        totalShards: config.stateMachine?.totalShards || 16
      },
      ...config
    };
    
    this.xn = null;
    this.xid = null;
    this.xclt = null;
    this.xvsm = null;
    this.xpc = null;
    this.gossip = null;
    this.xsc = null;
    this.pricing = null;
    
    this.running = false;
    this.currentAddress = null;
    this.balances = new Map(); // address -> balance cache
    this._modulesLoaded = false;
  }

  async _loadModules() {
    if (this._modulesLoaded) return;
    
    const { Identity } = await import('xid');
    const { XNNode } = await import('xn');
    const { Ledger } = await import('xclt');
    const { StateMachine } = await import('xvsm');
    const { ConsensusWorkflow, ConsensusGossip } = await import('xpc');
    const { StorageNode, MarketPricing } = await import('xsc');
    
    // Initialize network first
    this.xn = new XNNode(this.config.network || {});
    
    // Initialize identity system
    this.xid = null; // Will be set when identity is created
    
    // Initialize ledger with network integration
    this.xclt = new Ledger({
      dbPath: this.config.ledger?.dbPath,
      xn: this.xn,
      xid: this.xid
    });
    
    // Initialize state machine with ledger integration
    this.xvsm = new StateMachine({
      totalShards: this.config.stateMachine?.totalShards,
      xclt: this.xclt
    });
    
    // Initialize consensus workflow with integrations
    this.xpc = new ConsensusWorkflow({
      xid: this.xid,
      xclt: this.xclt,
      xn: this.xn
    });
    
    // Initialize gossip with network
    this.gossip = new ConsensusGossip({
      xn: this.xn
    });
    
    // Initialize storage and compute
    this.pricing = new MarketPricing();
    this.xsc = new StorageNode({
      capacity: this.config.storage?.capacity,
      dbPath: this.config.storage?.dbPath,
      xn: this.xn,
      xpc: this.xpc,
      xclt: this.xclt
    });
    
    this._modulesLoaded = true;
  }

  async init() {
    await this._loadModules();
    
    // Start network
    await this.xn.start();
    
    // Create default identity if needed
    const { Identity } = await import('xid');
    if (!this.xid) {
      this.xid = await Identity.create();
      // Update references
      this.xclt.xid = this.xid;
      this.xpc.xid = this.xid;
    }
    
    this.currentAddress = this.xid.address;
    this.running = true;
    
    // Initialize balance tracking
    await this._updateBalances();
    
    // Set up periodic balance updates
    this._balanceUpdateInterval = setInterval(() => {
      this._updateBalances().catch(console.error);
    }, 5000);
    
    console.log('XMBL Core initialized');
    console.log(`Network node: ${this.xn.getPeerId()}`);
    console.log(`Identity: ${this.currentAddress}`);
  }

  async start() {
    if (this.running) return;
    
    if (!this.xn.started) {
      await this.xn.start();
    }
    
    this.running = true;
    console.log('XMBL Node started');
  }

  async stop() {
    if (!this.running) return;
    
    if (this._balanceUpdateInterval) {
      clearInterval(this._balanceUpdateInterval);
    }
    
    if (this.xn) {
      await this.xn.stop();
    }
    if (this.xclt && this.xclt.db) {
      await this.xclt.db.close();
    }
    
    this.running = false;
    console.log('XMBL Node stopped');
  }

  isRunning() {
    return this.running && this.xn && this.xn.started;
  }

  getPeerCount() {
    if (!this.xn || !this.xn.started) return 0;
    return this.xn.getConnectedPeers().length;
  }

  getBlockHeight() {
    if (!this.xclt) return 0;
    // Get the highest block number from ledger
    // This is a simplified version - actual implementation would query the ledger
    return this.xclt.blocks ? this.xclt.blocks.size : 0;
  }

  async getBalance(address) {
    // If address is 'current' or matches current identity, use current address
    const targetAddress = (address === 'current' || !address) 
      ? this.currentAddress 
      : address;
    
    if (!targetAddress) {
      return 0;
    }
    
    // Return cached balance if available
    if (this.balances.has(targetAddress)) {
      return this.balances.get(targetAddress);
    }
    
    // Calculate balance from ledger transactions
    const balance = await this._calculateBalance(targetAddress);
    this.balances.set(targetAddress, balance);
    return balance;
  }

  async _calculateBalance(address) {
    if (!this.xclt || !this.xclt.blocks) {
      return 0;
    }
    
    let balance = 0;
    
    // Iterate through all blocks to calculate balance
    for (const [blockId, block] of this.xclt.blocks) {
      if (block.transaction) {
        const tx = block.transaction;
        
        // Check if this address is the recipient
        if (tx.to === address) {
          balance += tx.amount || 0;
        }
        
        // Check if this address is the sender
        if (tx.from === address) {
          balance -= tx.amount || 0;
        }
      }
    }
    
    return balance;
  }

  async _updateBalances() {
    if (!this.xclt || !this.xclt.blocks) return;
    
    // Update balance for current address
    if (this.currentAddress) {
      const balance = await this._calculateBalance(this.currentAddress);
      this.balances.set(this.currentAddress, balance);
    }
  }

  async sendTransaction(tx) {
    if (!this.xid) {
      throw new Error('Identity not initialized');
    }
    
    // Prepare transaction
    const transaction = {
      from: this.currentAddress,
      to: tx.to,
      amount: tx.amount,
      timestamp: Date.now(),
      type: 'transfer'
    };
    
    // Sign transaction
    const signedTx = await this.xid.signTransaction(transaction);
    
    // Submit to consensus
    const rawTxId = await this.xpc.submitTransaction('leader1', signedTx);
    
    // Broadcast via gossip
    await this.gossip.broadcastRawTransaction('leader1', signedTx);
    
    // Add to ledger
    await this.xclt.addTransaction(signedTx);
    
    // Invalidate balance cache
    this.balances.delete(this.currentAddress);
    if (tx.to) {
      this.balances.delete(tx.to);
    }
    
    return { txId: rawTxId };
  }
}

module.exports = { XMBLCore };

