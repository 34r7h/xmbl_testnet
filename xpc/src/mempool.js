import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Level } from 'level';

export class Mempool extends EventEmitter {
  constructor(options = {}) {
    super();
    const dbPath = options.dbPath || './data/xpc/mempool';
    this.db = new Level(dbPath);
    this._dbOpen = false;
    
    // raw_tx_mempool: { leaderId: { rawTxId: { txData, validationTimestamps, validationTasks, txTimestamp } } }
    this.rawTx = new Map();
    // validation_tasks_mempool: { leaderId: [ {task, complete} ] }
    this.validationTasks = new Map();
    // locked_utxo_mempool: Set of locked UTXO IDs
    this.lockedUtxo = new Set();
    // processing_tx_mempool: { txId: { timestamp, txData, sig, leader } }
    this.processingTx = new Map();
    // tx_mempool: { txId: txData }
    this.tx = new Map();
    
    this._initDb().catch(() => {});
  }
  
  async _initDb() {
    try {
      await this.db.open();
      this._dbOpen = true;
      await this._loadState();
    } catch (error) {
      this._dbOpen = false;
    }
  }
  
  async _loadState() {
    if (!this._dbOpen) return;
    
    try {
      // Load raw transactions
      for await (const [key, value] of this.db.iterator({ gt: 'rawTx:', lt: 'rawTx:\xFF' })) {
        const data = JSON.parse(value.toString());
        const [leaderId, rawTxId] = key.toString().substring(6).split(':');
        if (!this.rawTx.has(leaderId)) {
          this.rawTx.set(leaderId, new Map());
        }
        this.rawTx.get(leaderId).set(rawTxId, data);
      }
      
      // Load processing transactions
      for await (const [key, value] of this.db.iterator({ gt: 'processingTx:', lt: 'processingTx:\xFF' })) {
        const txId = key.toString().substring(14);
        this.processingTx.set(txId, JSON.parse(value.toString()));
      }
      
      // Load finalized transactions
      for await (const [key, value] of this.db.iterator({ gt: 'tx:', lt: 'tx:\xFF' })) {
        const txId = key.toString().substring(3);
        this.tx.set(txId, JSON.parse(value.toString()));
      }
      
      // Load locked UTXOs
      const lockedUtxos = await this.db.get('lockedUtxo').catch(() => null);
      if (lockedUtxos) {
        const utxos = JSON.parse(lockedUtxos.toString());
        this.lockedUtxo = new Set(utxos);
      }
    } catch (error) {
      // Ignore load errors
    }
  }
  
  async _saveRawTx(leaderId, rawTxId, data) {
    if (!this._dbOpen) return;
    try {
      await this.db.put(`rawTx:${leaderId}:${rawTxId}`, JSON.stringify(data));
    } catch (error) {
      // Ignore save errors
    }
  }
  
  async _saveProcessingTx(txId, data) {
    if (!this._dbOpen) return;
    try {
      await this.db.put(`processingTx:${txId}`, JSON.stringify(data));
    } catch (error) {
      // Ignore save errors
    }
  }
  
  async _saveTx(txId, data) {
    if (!this._dbOpen) return;
    try {
      await this.db.put(`tx:${txId}`, JSON.stringify(data));
    } catch (error) {
      // Ignore save errors
    }
  }
  
  async _saveLockedUtxos() {
    if (!this._dbOpen) return;
    try {
      await this.db.put('lockedUtxo', JSON.stringify(Array.from(this.lockedUtxo)));
    } catch (error) {
      // Ignore save errors
    }
  }

  async _deleteRawTx(leaderId, rawTxId) {
    if (!this._dbOpen) return;
    try {
      await this.db.del(`rawTx:${leaderId}:${rawTxId}`);
    } catch (error) {
      // Ignore delete errors
    }
  }

  async addRawTransaction(leaderId, txData) {
    const rawTxId = this._hashTransaction(txData);
    
    if (!this.rawTx.has(leaderId)) {
      this.rawTx.set(leaderId, new Map());
    }
    
    const txEntry = {
      txData,
      validationTimestamps: [],
      validationTasks: [],
      txTimestamp: Date.now()
    };
    
    const leaderMempool = this.rawTx.get(leaderId);
    leaderMempool.set(rawTxId, txEntry);
    await this._saveRawTx(leaderId, rawTxId, txEntry);
    
    this.emit('raw_tx:added', { leaderId, rawTxId, txData });
    return rawTxId;
  }

  async lockUtxos(utxos) {
    utxos.forEach(utxo => this.lockedUtxo.add(utxo));
    await this._saveLockedUtxos();
    this.emit('utxo:locked', utxos);
  }

  async unlockUtxos(utxos) {
    utxos.forEach(utxo => this.lockedUtxo.delete(utxo));
    await this._saveLockedUtxos();
    this.emit('utxo:unlocked', utxos);
  }

  _hashTransaction(tx) {
    // Serialize BigInt values before stringifying
    const serialized = this._serializeBigInts(tx);
    const txStr = JSON.stringify(serialized);
    return createHash('sha256').update(txStr).digest('hex');
  }

  _serializeBigInts(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(item => this._serializeBigInts(item));
    if (typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this._serializeBigInts(value);
      }
      return result;
    }
    return obj;
  }
}

