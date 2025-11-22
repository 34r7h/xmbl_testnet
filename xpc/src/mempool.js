import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class Mempool extends EventEmitter {
  constructor() {
    super();
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
  }

  addRawTransaction(leaderId, txData) {
    const rawTxId = this._hashTransaction(txData);
    
    if (!this.rawTx.has(leaderId)) {
      this.rawTx.set(leaderId, new Map());
    }
    
    const leaderMempool = this.rawTx.get(leaderId);
    leaderMempool.set(rawTxId, {
      txData,
      validationTimestamps: [],
      validationTasks: [],
      txTimestamp: Date.now()
    });
    
    this.emit('raw_tx:added', { leaderId, rawTxId, txData });
    return rawTxId;
  }

  lockUtxos(utxos) {
    utxos.forEach(utxo => this.lockedUtxo.add(utxo));
    this.emit('utxo:locked', utxos);
  }

  unlockUtxos(utxos) {
    utxos.forEach(utxo => this.lockedUtxo.delete(utxo));
    this.emit('utxo:unlocked', utxos);
  }

  _hashTransaction(tx) {
    const txStr = JSON.stringify(tx);
    return createHash('sha256').update(txStr).digest('hex');
  }
}

