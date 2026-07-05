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
      dbPath: config.stateMachine?.dbPath,
      xclt: this.xclt
    });

    // Initialize consensus workflow with integrations. Thread the consensus
    // dbPath so its mempool LevelDB lives under the configured data_dir instead
    // of leaking to ./data/xpc relative to cwd.
    this.xpc = new ConsensusWorkflow({
      dbPath: config.consensus?.dbPath,
      xid: this.xid,
      xclt: this.xclt,
      xn: this.xn
    });

    // Gossip is constructed after xn.start() (see start()) — its constructor
    // only subscribes to its topic if xn.started is already true, and xn is
    // never started yet at this point in the constructor.
    this.gossip = null;

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

    // Now that xn is started, construct gossip so its constructor's
    // subscribe-if-started check actually subscribes to the topic.
    this.gossip = new ConsensusGossip({
      xn: this.xn
    });

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
    // Close EVERY LevelDB cleanly, not just the ledger — otherwise the storage
    // (xsc) and state-machine (xvsm) databases are left open and a restart can
    // reopen them mid-flush / with a stale LOCK. close() is the flush for
    // classic-level; there is no separate flush API.
    await closeLevelDb(this.xclt && this.xclt.db);
    await closeLevelDb(this.xvsm && this.xvsm.db);
    await closeLevelDb(this.xsc && this.xsc.db);
    await closeLevelDb(this.xpc && this.xpc.mempool && this.xpc.mempool.db);
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

// Close an abstract-level (LevelDB) handle cleanly, tolerating the two shapes
// that show up in practice: the in-memory Map fallback (xsc when LevelDB is
// unavailable — no close()), and an already-closed/closing handle (close()
// throws "Database is not open"). Only a genuinely open handle is flushed+closed.
async function closeLevelDb(db) {
  if (!db || typeof db.close !== 'function') return;
  if (db.status === 'closed' || db.status === 'closing') return;
  await db.close();
}





