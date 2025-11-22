import { createHash } from 'crypto';
import { Level } from 'level';

export class StorageNode {
  constructor(options = {}) {
    this.capacity = options.capacity || 1000000; // 1MB default
    this.used = 0;
    this.dbPath = options.dbPath || './data/storage';
    this.db = null; // Will be initialized async
    this.shards = new Map(); // shardId -> Shard metadata
    this._initPromise = this._init();
    
    // Integration: xn for P2P networking
    this.xn = options.xn || null;
    this.requestTopic = options.requestTopic || 'storage:shard_request';
    this.responseTopic = options.responseTopic || 'storage:shard_response';
    
    // Integration: xpc for payment consensus
    this.xpc = options.xpc || null;
    
    // Integration: xclt for payment recording
    this.xclt = options.xclt || null;
    
    // Subscribe to topics if network available and started
    if (this.xn && this.xn.started) {
      this.xn.subscribe(this.requestTopic).catch(() => {});
      this.xn.subscribe(this.responseTopic).catch(() => {});
      
      this.xn.on(`message:${this.requestTopic}`, (data) => {
        this._handleShardRequest(data);
      });
      
      this.xn.on(`message:${this.responseTopic}`, (data) => {
        this._handleShardResponse(data);
      });
    }
  }
  
  async _handleShardRequest(data) {
    // Handle incoming shard request
    if (data.shardId) {
      try {
        const shard = await this.getShard(data.shardId);
        if (this.xn && this.xn.started) {
          try {
            await this.xn.publish(this.responseTopic, {
              shardId: shard.shardId,
              shard: {
                index: shard.index,
                data: shard.data.toString('base64')
              }
            });
          } catch (error) {
            // Silently handle network errors
          }
        }
      } catch (error) {
        // Shard not found, ignore
      }
    }
  }
  
  _handleShardResponse(data) {
    // Handle incoming shard response
    // Can be used for shard retrieval
  }

  async _init() {
    try {
      this.db = new Level(this.dbPath, { valueEncoding: 'buffer' });
      await this.db.open();
    } catch (error) {
      // If LevelDB fails, use in-memory storage
      this.db = new Map();
    }
  }

  async _ensureInit() {
    await this._initPromise;
  }

  async storeShard(shard, paymentTx = null) {
    await this._ensureInit();
    
    // Integration: Verify payment if xpc available
    if (this.xpc && paymentTx) {
      // Check if payment is finalized in consensus
      const stats = this.xpc.getMempoolStats();
      // In real system, would verify payment amount and finalization
    }
    
    if (this.used + shard.data.length > this.capacity) {
      throw new Error('Storage full');
    }
    
    const shardId = this._hashShard(shard);
    
    if (this.db instanceof Map) {
      this.db.set(`shard:${shardId}`, shard.data);
    } else {
      await this.db.put(`shard:${shardId}`, shard.data);
    }
    
    this.shards.set(shardId, { ...shard, shardId });
    this.used += shard.data.length;
    
    // Integration: Record payment in ledger if xclt available
    if (this.xclt && paymentTx) {
      try {
        await this.xclt.addTransaction(paymentTx);
      } catch (error) {
        console.warn('Failed to record payment in ledger:', error.message);
      }
    }
    
    return shardId;
  }

  async getShard(shardId) {
    await this._ensureInit();
    
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error('Shard not found');
    }
    
    let data;
    if (this.db instanceof Map) {
      data = this.db.get(`shard:${shardId}`);
    } else {
      data = await this.db.get(`shard:${shardId}`);
    }
    
    if (!data) {
      throw new Error('Shard data not found');
    }
    
    return { ...shard, data };
  }

  async deleteShard(shardId) {
    await this._ensureInit();
    
    const shard = this.shards.get(shardId);
    if (shard) {
      if (this.db instanceof Map) {
        this.db.delete(`shard:${shardId}`);
      } else {
        await this.db.del(`shard:${shardId}`);
      }
      this.used -= shard.data.length;
      this.shards.delete(shardId);
    }
  }

  getCapacity() {
    return this.capacity;
  }

  getUsed() {
    return this.used;
  }

  _hashShard(shard) {
    const hash = createHash('sha256');
    hash.update(shard.index.toString());
    hash.update(shard.data);
    return hash.digest('hex');
  }
}

