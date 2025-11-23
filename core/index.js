import { Identity } from 'xid';
import { XNNode } from 'xn';
import { Ledger } from 'xclt';
import { StateMachine } from 'xvsm';
import { ConsensusWorkflow, ConsensusGossip } from 'xpc';
import { StorageNode, MarketPricing } from 'xsc';

export class XMBLCore {
  constructor(config = {}) {
    // Initialize network first
    this.xn = new XNNode(config.network || {});
    
    // Initialize identity system
    this.xid = null; // Will be set when identity is created
    
    // Initialize ledger with network integration
    this.xclt = new Ledger({
      dbPath: config.ledger?.dbPath,
      xn: this.xn,
      xid: this.xid
    });
    
    // Initialize state machine with ledger integration
    this.xvsm = new StateMachine({
      totalShards: config.stateMachine?.totalShards,
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
      capacity: config.storage?.capacity,
      dbPath: config.storage?.dbPath,
      xn: this.xn,
      xpc: this.xpc,
      xclt: this.xclt
    });
  }
  
  async start() {
    // Start network
    await this.xn.start();
    
    // Create default identity if needed
    if (!this.xid) {
      this.xid = await Identity.create();
      // Update references
      this.xclt.xid = this.xid;
      this.xpc.xid = this.xid;
    }
    
    console.log('XMBL Core started');
    console.log(`Network node: ${this.xn.getPeerId()}`);
    console.log(`Identity: ${this.xid.address}`);
  }
  
  async stop() {
    if (this.xn) {
      await this.xn.stop();
    }
    if (this.xclt && this.xclt.db) {
      await this.xclt.db.close();
    }
  }
  
  async createIdentity() {
    this.xid = await Identity.create();
    this.xclt.xid = this.xid;
    this.xpc.xid = this.xid;
    return this.xid;
  }
  
  async submitTransaction(tx) {
    // Sign transaction
    if (!this.xid) {
      throw new Error('Identity not initialized');
    }
    
    const signedTx = await this.xid.signTransaction(tx);
    
    // Submit to consensus
    const rawTxId = await this.xpc.submitTransaction('leader1', signedTx);
    
    // Broadcast via gossip
    await this.gossip.broadcastRawTransaction('leader1', signedTx);
    
    return rawTxId;
  }
}





