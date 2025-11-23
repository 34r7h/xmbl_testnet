import { VerkleStateTree } from './verkle-tree.js';
import { StateDiff } from './state-diff.js';
import { WASMExecutor } from './wasm-execution.js';
import { StateShard } from './sharding.js';
import { StateAssembler } from './state-assembly.js';
import { Level } from 'level';

export class StateMachine {
  constructor(options = {}) {
    const dbPath = options.dbPath || './data/xvsm';
    this.db = new Level(dbPath);
    this._dbOpen = false;
    
    this.stateTree = new VerkleStateTree({ db: this.db });
    this.executor = new WASMExecutor();
    this.assembler = new StateAssembler();
    this.shards = [];
    this.totalShards = options.totalShards || 4;
    this.diffs = [];
    this.transactionLog = [];
    
    // Initialize shards
    for (let i = 0; i < this.totalShards; i++) {
      this.shards.push(new StateShard(i, this.totalShards));
    }
    
    // Integration: xclt for state commitments from ledger
    this.xclt = options.xclt || null;
    
    // Initialize database
    this._initDb().catch(() => {});
    
    // Listen to ledger events if available
    if (this.xclt) {
      this.xclt.on('block:added', async (block) => {
        await this._handleLedgerBlock(block);
      });
      
      this.xclt.on('cube:complete', (cube) => {
        this._handleCubeComplete(cube);
      });
    }
  }
  
  async _initDb() {
    try {
      await this.db.open();
      this._dbOpen = true;
      await this._loadDiffs();
      await this._loadTransactionLog();
    } catch (error) {
      this._dbOpen = false;
    }
  }
  
  async _loadDiffs() {
    if (!this._dbOpen) return;
    
    try {
      for await (const [key, value] of this.db.iterator({ gt: 'diff:', lt: 'diff:\xFF' })) {
        const diffData = JSON.parse(value.toString());
        const diff = new StateDiff(diffData.txId, diffData.changes);
        diff.timestamp = diffData.timestamp;
        this.diffs.push(diff);
      }
    } catch (error) {
      // Ignore load errors
    }
  }
  
  async _loadTransactionLog() {
    if (!this._dbOpen) return;
    
    try {
      const logData = await this.db.get('transactionLog').catch(() => null);
      if (logData) {
        this.transactionLog = JSON.parse(logData.toString());
      }
    } catch (error) {
      // Ignore load errors
    }
  }
  
  async _saveDiff(diff) {
    if (!this._dbOpen) return;
    
    try {
      await this.db.put(`diff:${diff.txId}`, JSON.stringify({
        txId: diff.txId,
        changes: diff.changes,
        timestamp: diff.timestamp
      }));
    } catch (error) {
      // Ignore save errors
    }
  }
  
  async _saveTransactionLog() {
    if (!this._dbOpen) return;
    
    try {
      await this.db.put('transactionLog', JSON.stringify(this.transactionLog));
    } catch (error) {
      // Ignore save errors
    }
  }
  
  async _handleLedgerBlock(block) {
    // Process state diff transactions from ledger blocks
    if (block.tx && block.tx.type === 'state_diff' && block.tx.args) {
      try {
        const diff = new StateDiff(block.id, block.tx.args);
        this.diffs.push(diff);
        
        // Update state tree
        for (const [key, value] of Object.entries(block.tx.args)) {
          await this.stateTree.insert(key, value);
        }
      } catch (error) {
        console.warn('Failed to process ledger block state diff:', error.message);
      }
    }
  }
  
  _handleCubeComplete(cube) {
    // Handle cube completion for state commitment
    // State root can be calculated from current state
    const stateRoot = this.stateTree.getRoot();
    console.log(`State commitment for cube ${cube.id}: ${stateRoot}`);
  }

  async executeTransaction(txId, wasmCode, input, shardKey = null) {
    const startTime = Date.now();
    
    try {
      // Determine shard if key provided
      let shard = null;
      if (shardKey) {
        const shardIndex = StateShard.getShardForKey(shardKey, this.totalShards);
        shard = this.shards[shardIndex];
      }
      
      // Get current state for the key
      const currentState = shard ? shard.get(shardKey) || {} : this.assembler.baseState;
      
      // Execute WASM state transition
      const newState = await this.executor.executeStateTransition(wasmCode, currentState, input);
      
      // Create state diff
      const changes = this._computeChanges(currentState, newState);
      const diff = new StateDiff(txId, changes);
      
      // Store in shard if applicable
      if (shard && shardKey) {
        shard.set(shardKey, newState);
      }
      
      // Store diff
      this.diffs.push(diff);
      await this._saveDiff(diff);
      
      // Update Verkle tree
      for (const [key, value] of Object.entries(changes)) {
        const fullKey = shardKey ? `${shardKey}:${key}` : key;
        await this.stateTree.insert(fullKey, value);
        console.log(`State updated: ${fullKey} = ${JSON.stringify(value)}`);
      }
      
      // Log transaction
      const duration = Date.now() - startTime;
      this.transactionLog.push({
        txId,
        timestamp: diff.timestamp,
        duration,
        changes: Object.keys(changes).length
      });
      await this._saveTransactionLog();
      
      return {
        txId,
        diff,
        newState,
        stateRoot: this.stateTree.getRoot()
      };
    } catch (error) {
      console.error(`Transaction ${txId} failed: ${error.message}`);
      throw error;
    }
  }

  getState(key, timestamp = null) {
    if (timestamp) {
      return this.assembler.getStateAtTimestamp(this.diffs, timestamp);
    }
    
    // Try shard first
    const shardIndex = StateShard.getShardForKey(key, this.totalShards);
    const shard = this.shards[shardIndex];
    const shardState = shard.get(key);
    
    if (shardState) {
      return shardState;
    }
    
    // Assemble from diffs
    return this.assembler.assemble(this.diffs);
  }

  generateProof(key) {
    // Check if key exists in tree first
    const value = this.stateTree.get(key);
    if (value === undefined) {
      throw new Error(`Key ${key} not found in state tree`);
    }
    return this.stateTree.generateProof(key);
  }

  verifyProof(key, value, proof) {
    return VerkleStateTree.verifyProof(key, value, proof);
  }

  getStateRoot() {
    return this.stateTree.getRoot();
  }

  getStatistics() {
    return {
      totalTransactions: this.transactionLog.length,
      totalDiffs: this.diffs.length,
      stateRoot: this.stateTree.getRoot(),
      shards: this.shards.map((s, i) => ({
        index: i,
        keyCount: s.getAllKeys().length
      }))
    };
  }

  _computeChanges(oldState, newState) {
    const changes = {};
    
    // Find new and modified keys
    for (const [key, value] of Object.entries(newState)) {
      if (oldState[key] !== value) {
        changes[key] = value;
      }
    }
    
    // Find deleted keys
    for (const key of Object.keys(oldState)) {
      if (!(key in newState)) {
        changes[key] = null; // Mark as deleted
      }
    }
    
    return changes;
  }
}

