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

  async storeShard(shard) {
    await this._ensureInit();
    
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

