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
    
    // Validation leaders (actual identity addresses)
    this.validationLeaders = options.validationLeaders || null;
    
    // Function to lookup public key by address (for signature verification)
    this.getPublicKeyByAddress = options.getPublicKeyByAddress || null;
    
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

  async completeValidation(rawTxId, taskId, timestamp = null, signature = null, validatorId = null) {
    // Use nanosecond timestamp if not provided
    if (!timestamp) {
      timestamp = process.hrtime.bigint(); // Nanoseconds - timestamp when validator received tx to validate
    }
    // Find task leader
    const task = this._findTask(taskId);
    if (!task) return;
    
    // Integration: Verify signature if xid available
    if (this.xid) {
      const rawTx = this._getRawTransaction(rawTxId);
      if (rawTx && rawTx.txData && rawTx.txData.sig && rawTx.txData.from) {
        try {
          const { Identity } = await import('xid');
          
          // Look up public key from address (from xid module or identity registry)
          // For now, we'll need to get it from the simulator's identities
          // In production, this would come from an identity registry
          let publicKey = null;
          
          // Try to get public key from lookup function (provided by simulator)
          if (this.getPublicKeyByAddress && typeof this.getPublicKeyByAddress === 'function') {
            publicKey = this.getPublicKeyByAddress(rawTx.txData.from);
          }
          
          // If we have public key, verify signature and address ownership
          if (publicKey) {
            const isValid = await Identity.verifyTransaction(rawTx.txData, publicKey);
            if (!isValid) {
              console.warn('Validation failed: Invalid signature or address mismatch');
              return;
            }
          } else {
            // If we can't get public key, skip verification (should not happen in production)
            console.warn('Validation: Could not lookup public key for address:', rawTx.txData.from);
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
    
    // Add validation timestamp with node ID
    // Validators put tx in next mempool by raw hash, append node id and timestamp
    await this._addValidationTimestamp(rawTxId, timestamp, validatorId || task.validatorId || 'unknown');
    
    // Emit validation complete event
    const validationData = {
      rawTxId,
      taskId,
      validatorId: validatorId || task.validatorId || 'unknown',
      timestamp: timestamp ? timestamp.toString() : null
    };
    console.log('[XPC] ===== EMITTING validation:complete =====');
    console.log('[XPC] Validation data:', JSON.stringify(validationData, null, 2));
    this.emit('validation:complete', validationData);
    console.log('[XPC] validation:complete event emitted');
    
    // Check if enough validations
    const validations = this._getValidationCount(rawTxId);
    console.log(`Validation count for ${rawTxId}: ${validations}/${this.requiredValidations}`);
    if (validations >= this.requiredValidations) {
      console.log(`Moving transaction ${rawTxId} to processing`);
      await this.moveToProcessing(rawTxId);
    }
  }

  async moveToProcessing(rawTxId) {
    // Get raw transaction
    const rawTx = this._getRawTransaction(rawTxId);
    if (!rawTx) {
      console.warn(`moveToProcessing: No rawTx found for ${rawTxId}`);
      return;
    }
    
    // Emit event for moving to processing
    this.emit('tx:moved_to_processing', {
      rawTxId,
      txId: rawTx.txData?.id || rawTxId
    });
    console.log(`moveToProcessing: Moving ${rawTxId} to processing with ${rawTx.validationTimestamps?.length || 0} validations`);
    
    // Calculate average timestamp from validators (nanoseconds)
    // Validators return timestamp of when they received tx to validate
    const avgTimestamp = this._averageTimestamps(rawTx.validationTimestamps);
    
    // Create validated hash: hash of (tx data + average timestamp)
    // This is the key for the processing mempool
    const validatedHash = this._hashTransaction({
      ...rawTx.txData,
      validationTimestamp: avgTimestamp
    });
    
    const leaderId = this.rawTxToId.get(rawTxId);
    const processingTxData = {
      rawTxId, // Keep reference to original raw tx
      timestamp: avgTimestamp,
      validationTimestamp: avgTimestamp, // Validator average timestamp (used only at level 1)
      txData: {
        ...rawTx.txData,
        validationTimestamp: avgTimestamp // Include in txData for xclt to use
      },
      sig: rawTx.txData.sig || null, // Leader signs
      leader: leaderId,
      validatorTimestamps: rawTx.validationTimestamps // Keep track of validator timestamps
    };
    
    // Key processing mempool by validated hash (tx data + avg timestamp)
    this.mempool.processingTx.set(validatedHash, processingTxData);
    await this.mempool._saveProcessingTx(validatedHash, processingTxData);
    
    // Remove from raw_tx_mempool
    await this._removeRawTransaction(rawTxId);
    
    console.log('[XPC] ===== EMITTING tx:processing =====');
    const processingData = { 
      txId: validatedHash, 
      rawTxId, 
      validationTimestamp: avgTimestamp ? avgTimestamp.toString() : null
    };
    console.log('[XPC] Processing transaction data:', JSON.stringify(processingData, null, 2));
    this.emit('tx:processing', processingData);
    console.log('[XPC] tx:processing event emitted');
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

  /**
   * Finalize transaction - moves to tx_mempool for ledger inclusion
   * 
   * HASH-BASED SORTING:
   * - Transactions are added to xclt ledger which forms blocks
   * - 9 blocks form a face (sorted by hash, positions 0-8)
   * - 3 faces form a cube (sorted by hash, face indices 0-2)
   * - 9 cubes form a higher-level face (sorted by hash)
   * - 3 faces form a higher-level cube (sorted by hash)
   * - This continues recursively - cubes never stop growing
   * - Validator average timestamps only used at level 1 for ordering
   * - Higher levels use pure hash-based sorting (no timestamps)
   */
  async finalizeTransaction(validatedHash) {
    // validatedHash is the key in processing mempool (tx data + avg timestamp)
    const processingTx = this.mempool.processingTx.get(validatedHash);
    if (!processingTx) return false;
    
    // With hash-based sorting, placement is always valid
    // Blocks are sorted by hash when face has 9 blocks
    // Faces are sorted by hash when cube has 3 faces
    
    // Move to final tx_mempool
    // Keyed by validated hash (tx data + avg timestamp)
    this.mempool.tx.set(validatedHash, processingTx.txData);
    await this.mempool._saveTx(validatedHash, processingTx.txData);
    
    // Remove from processing
    this.mempool.processingTx.delete(validatedHash);
    if (this.mempool._dbOpen) {
      try {
        await this.mempool.db.del(`processingTx:${validatedHash}`);
      } catch (error) {
        // Ignore delete errors
      }
    }
    
    // Unlock UTXOs
    const utxos = this._extractUtxos(processingTx.txData);
    await this.mempool.unlockUtxos(utxos);
    
    // Ensure txData has id property for xclt
    const txDataWithId = {
      ...processingTx.txData,
      id: validatedHash
    };
    
    // Emit finalized event - xclt will add this to ledger
    // Blocks are sorted by hash when face has 9 blocks
    // Faces are sorted by hash when cube has 3 faces
    console.log('[XPC] ===== EMITTING tx:finalized =====');
    
    // Convert BigInt values in txData to strings for serialization
    function serializeBigInt(obj) {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return obj.toString();
      if (Array.isArray(obj)) return obj.map(serializeBigInt);
      if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = serializeBigInt(value);
        }
        return result;
      }
      return obj;
    }
    
    const txDataSerialized = serializeBigInt(txDataWithId);
    
    const finalizedData = { 
      txId: validatedHash, 
      txData: txDataSerialized,
      validationTimestamp: processingTx.validationTimestamp ? processingTx.validationTimestamp.toString() : null // Convert BigInt to string for serialization
    };
    console.log('[XPC] Finalized transaction data:', JSON.stringify(finalizedData, null, 2));
    this.emit('tx:finalized', finalizedData);
    console.log('[XPC] tx:finalized event emitted');
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
    // Use provided validation leaders (actual identity addresses)
    if (this.validationLeaders && Array.isArray(this.validationLeaders) && this.validationLeaders.length >= 3) {
      return this.validationLeaders.slice(0, 3);
    }
    // Get available leaders from network if xn is available
    if (this.xn && this.xn.nodes) {
      const nodes = Array.from(this.xn.nodes.values());
      const activeNodes = nodes.filter(n => n && n.active).slice(0, 3);
      if (activeNodes.length >= 3) {
        return activeNodes.map(n => n.id || n.address);
      }
    }
    // Fallback to default leaders (should not happen in production)
    console.warn('[XPC] Using fallback validation leaders - this should not happen!');
    return ['leader1', 'leader2', 'leader3'];
  }

  _findTask(taskId) {
    const leaders = this._getValidationLeaders();
    for (const leaderId of leaders) {
      const task = this.taskManager.getTask(leaderId, taskId);
      if (task) return task;
    }
    return null;
  }

  async _addValidationTimestamp(rawTxId, timestamp, nodeId) {
    const leaderId = this.rawTxToId.get(rawTxId);
    if (!leaderId) {
      console.warn(`_addValidationTimestamp: No leaderId for ${rawTxId}`);
      return;
    }
    
    const leaderMempool = this.mempool.rawTx.get(leaderId);
    if (!leaderMempool) {
      console.warn(`_addValidationTimestamp: No leaderMempool for ${leaderId}`);
      return;
    }
    
    const rawTx = leaderMempool.get(rawTxId);
    if (rawTx) {
      if (!rawTx.validationTimestamps) {
        rawTx.validationTimestamps = [];
      }
      // Store {nodeId, timestamp} so we can track which validator provided which timestamp
      rawTx.validationTimestamps.push({ nodeId, timestamp });
      await this.mempool._saveRawTx(leaderId, rawTxId, rawTx);
      console.log(`Added validation timestamp for ${rawTxId} from ${nodeId}, count: ${rawTx.validationTimestamps.length}`);
    } else {
      console.warn(`_addValidationTimestamp: No rawTx found for ${rawTxId}`);
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

  _averageTimestamps(validationTimestamps) {
    // validationTimestamps is array of {nodeId, timestamp}
    if (!validationTimestamps || validationTimestamps.length === 0) {
      return process.hrtime.bigint(); // Return nanosecond timestamp
    }
    
    // Extract timestamps (handle both {nodeId, timestamp} objects and plain timestamps)
    const timestamps = validationTimestamps.map(ts => 
      typeof ts === 'object' && ts.timestamp ? ts.timestamp : ts
    );
    
    // Handle both bigint (nanoseconds) and number (milliseconds) timestamps
    const sum = timestamps.reduce((a, b) => {
      const aVal = typeof a === 'bigint' ? a : BigInt(a * 1000000); // Convert ms to ns
      const bVal = typeof b === 'bigint' ? b : BigInt(b * 1000000);
      return aVal + bVal;
    }, BigInt(0));
    return sum / BigInt(timestamps.length); // Return as bigint (nanoseconds)
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

