import { Mempool } from './mempool.js';
import { ValidationTaskManager } from './validation-tasks.js';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class ConsensusWorkflow extends EventEmitter {
  constructor() {
    super();
    this.mempool = new Mempool();
    this.taskManager = new ValidationTaskManager();
    this.requiredValidations = 3; // Configurable
    this.rawTxToId = new Map(); // Map rawTxId to leaderId for lookup
  }

  async submitTransaction(leaderId, txData) {
    // Lock UTXOs
    const utxos = this._extractUtxos(txData);
    this.mempool.lockUtxos(utxos);
    
    // Add to raw_tx_mempool
    const rawTxId = this.mempool.addRawTransaction(leaderId, txData);
    this.rawTxToId.set(rawTxId, leaderId);
    
    // Emit event
    this.emit('raw_tx:added', { leaderId, rawTxId, txData });
    
    // Create validation tasks
    await this.createValidationTasks(rawTxId);
    
    return rawTxId;
  }

  async createValidationTasks(rawTxId) {
    // Get leaders for validation
    const leaders = this._getValidationLeaders();
    const tasks = this.taskManager.createTasks(rawTxId, leaders);
    this.taskManager.assignTasks(rawTxId, tasks);
    
    this.emit('validation_tasks:created', { rawTxId, tasks });
  }

  getValidationTasks(rawTxId) {
    const leaders = this._getValidationLeaders();
    const allTasks = [];
    leaders.forEach(leaderId => {
      const tasks = this.taskManager.getTasksForLeader(leaderId);
      const relevantTasks = tasks.filter(t => t.task.startsWith(`${rawTxId}:`));
      allTasks.push(...relevantTasks);
    });
    return allTasks;
  }

  async completeValidation(rawTxId, taskId, timestamp = Date.now(), signature = null) {
    // Find task leader
    const task = this._findTask(taskId);
    if (!task) return;
    
    // Mark task complete
    this.taskManager.completeTask(task.leaderId, taskId);
    
    // Add validation timestamp
    this._addValidationTimestamp(rawTxId, timestamp);
    
    // Check if enough validations
    const validations = this._getValidationCount(rawTxId);
    if (validations >= this.requiredValidations) {
      await this.moveToProcessing(rawTxId);
    }
  }

  async moveToProcessing(rawTxId) {
    // Get raw transaction
    const rawTx = this._getRawTransaction(rawTxId);
    if (!rawTx) return;
    
    // Calculate average timestamp
    const avgTimestamp = this._averageTimestamps(rawTx.validationTimestamps);
    
    // Create processing transaction
    const txId = this._hashTransaction({ timestamp: avgTimestamp, ...rawTx.txData });
    
    const leaderId = this.rawTxToId.get(rawTxId);
    this.mempool.processingTx.set(txId, {
      timestamp: avgTimestamp,
      txData: rawTx.txData,
      sig: rawTx.txData.sig || null, // Leader signs
      leader: leaderId
    });
    
    // Remove from raw_tx_mempool
    this._removeRawTransaction(rawTxId);
    
    this.emit('tx:processing', { txId, rawTxId });
  }

  isInProcessing(rawTxId) {
    // Check if transaction is in processing mempool
    for (const [txId, tx] of this.mempool.processingTx.entries()) {
      if (tx.txData && this._hashTransaction(tx.txData) === rawTxId) {
        return true;
      }
    }
    return false;
  }

  getProcessingTransaction(txId) {
    return this.mempool.processingTx.get(txId) || null;
  }

  finalizeTransaction(txId) {
    const processingTx = this.mempool.processingTx.get(txId);
    if (!processingTx) return false;
    
    // Move to final tx_mempool
    this.mempool.tx.set(txId, processingTx.txData);
    
    // Remove from processing
    this.mempool.processingTx.delete(txId);
    
    // Unlock UTXOs
    const utxos = this._extractUtxos(processingTx.txData);
    this.mempool.unlockUtxos(utxos);
    
    this.emit('tx:finalized', { txId, txData: processingTx.txData });
    return true;
  }

  getMempoolStats() {
    let rawCount = 0;
    for (const leaderMempool of this.mempool.rawTx.values()) {
      rawCount += leaderMempool.size;
    }
    
    return {
      raw: rawCount,
      processing: this.mempool.processingTx.size,
      final: this.mempool.tx.size,
      lockedUtxos: this.mempool.lockedUtxo.size
    };
  }

  _extractUtxos(txData) {
    // Extract UTXOs from transaction
    return txData.from ? (Array.isArray(txData.from) ? txData.from : [txData.from]) : [];
  }

  _getValidationLeaders() {
    // Get available leaders for validation
    return ['leader1', 'leader2', 'leader3']; // Simplified
  }

  _findTask(taskId) {
    const leaders = this._getValidationLeaders();
    for (const leaderId of leaders) {
      const task = this.taskManager.getTask(leaderId, taskId);
      if (task) return task;
    }
    return null;
  }

  _addValidationTimestamp(rawTxId, timestamp) {
    const leaderId = this.rawTxToId.get(rawTxId);
    if (!leaderId) return;
    
    const leaderMempool = this.mempool.rawTx.get(leaderId);
    if (!leaderMempool) return;
    
    const rawTx = leaderMempool.get(rawTxId);
    if (rawTx) {
      rawTx.validationTimestamps.push(timestamp);
    }
  }

  _getValidationCount(rawTxId) {
    const leaderId = this.rawTxToId.get(rawTxId);
    if (!leaderId) return 0;
    
    const leaderMempool = this.mempool.rawTx.get(leaderId);
    if (!leaderMempool) return 0;
    
    const rawTx = leaderMempool.get(rawTxId);
    return rawTx ? rawTx.validationTimestamps.length : 0;
  }

  _getRawTransaction(rawTxId) {
    const leaderId = this.rawTxToId.get(rawTxId);
    if (!leaderId) return null;
    
    const leaderMempool = this.mempool.rawTx.get(leaderId);
    if (!leaderMempool) return null;
    
    return leaderMempool.get(rawTxId) || null;
  }

  _removeRawTransaction(rawTxId) {
    const leaderId = this.rawTxToId.get(rawTxId);
    if (!leaderId) return;
    
    const leaderMempool = this.mempool.rawTx.get(leaderId);
    if (leaderMempool) {
      leaderMempool.delete(rawTxId);
    }
    this.rawTxToId.delete(rawTxId);
  }

  _averageTimestamps(timestamps) {
    if (timestamps.length === 0) return Date.now();
    const sum = timestamps.reduce((a, b) => a + b, 0);
    return Math.floor(sum / timestamps.length);
  }

  _hashTransaction(tx) {
    const txStr = JSON.stringify(tx);
    return createHash('sha256').update(txStr).digest('hex');
  }
}

