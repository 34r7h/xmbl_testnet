import { Mempool } from './mempool.js';
import { ValidationTaskManager } from './validation-tasks.js';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class ConsensusWorkflow extends EventEmitter {
  constructor(options = {}) {
    super();
    const dbPath = options.dbPath || './data/xpc';
    this.mempool = new Mempool({ dbPath: `${dbPath}/mempool` });
    this.taskManager = new ValidationTaskManager();
    this.requiredValidations = 3; // Configurable
    this.rawTxToId = new Map(); // Map rawTxId to leaderId for lookup
    
    // Integration: xid for signature verification
    this.xid = options.xid || null;
    
    // Integration: xclt for final transaction inclusion
    this.xclt = options.xclt || null;
    
    // Integration: xn for network gossip
    this.xn = options.xn || null;
    
    // Listen for finalized transactions and add to ledger
    this.on('tx:finalized', async (data) => {
      if (this.xclt) {
        try {
          await this.xclt.addTransaction(data.txData);
        } catch (error) {
          console.error('Failed to add finalized transaction to ledger:', error);
        }
      }
    });
  }

  async submitTransaction(leaderId, txData) {
    // Lock UTXOs
    const utxos = this._extractUtxos(txData);
    await this.mempool.lockUtxos(utxos);
    
    // Add to raw_tx_mempool
    const rawTxId = await this.mempool.addRawTransaction(leaderId, txData);
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
    
    // Integration: Verify signature if xid available
    if (this.xid) {
      const rawTx = this._getRawTransaction(rawTxId);
      if (rawTx && rawTx.txData && rawTx.txData.sig && rawTx.txData.publicKey) {
        try {
          const { Identity } = await import('xid');
          const isValid = await Identity.verifyTransaction(rawTx.txData, rawTx.txData.publicKey);
          if (!isValid) {
            console.warn('Validation failed: Invalid signature');
            return;
          }
        } catch (error) {
          // If xid module not available, skip verification
          if (error.code !== 'ERR_MODULE_NOT_FOUND') {
            console.warn('Signature verification error:', error.message);
            return;
          }
        }
      }
    }
    
    // Mark task complete
    this.taskManager.completeTask(task.leaderId, taskId);
    
    // Add validation timestamp
    await this._addValidationTimestamp(rawTxId, timestamp);
    
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
    const processingTxData = {
      timestamp: avgTimestamp,
      txData: rawTx.txData,
      sig: rawTx.txData.sig || null, // Leader signs
      leader: leaderId
    };
    this.mempool.processingTx.set(txId, processingTxData);
    await this.mempool._saveProcessingTx(txId, processingTxData);
    
    // Remove from raw_tx_mempool
    await this._removeRawTransaction(rawTxId);
    
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

  async finalizeTransaction(txId) {
    const processingTx = this.mempool.processingTx.get(txId);
    if (!processingTx) return false;
    
    // Move to final tx_mempool
    this.mempool.tx.set(txId, processingTx.txData);
    await this.mempool._saveTx(txId, processingTx.txData);
    
    // Remove from processing
    this.mempool.processingTx.delete(txId);
    if (this.mempool._dbOpen) {
      try {
        await this.mempool.db.del(`processingTx:${txId}`);
      } catch (error) {
        // Ignore delete errors
      }
    }
    
    // Unlock UTXOs
    const utxos = this._extractUtxos(processingTx.txData);
    await this.mempool.unlockUtxos(utxos);
    
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

  async _addValidationTimestamp(rawTxId, timestamp) {
    const leaderId = this.rawTxToId.get(rawTxId);
    if (!leaderId) return;
    
    const leaderMempool = this.mempool.rawTx.get(leaderId);
    if (!leaderMempool) return;
    
    const rawTx = leaderMempool.get(rawTxId);
    if (rawTx) {
      rawTx.validationTimestamps.push(timestamp);
      await this.mempool._saveRawTx(leaderId, rawTxId, rawTx);
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

  async _removeRawTransaction(rawTxId) {
    const leaderId = this.rawTxToId.get(rawTxId);
    if (!leaderId) return;
    
    const leaderMempool = this.mempool.rawTx.get(leaderId);
    if (leaderMempool) {
      leaderMempool.delete(rawTxId);
      await this.mempool._deleteRawTx(leaderId, rawTxId);
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

