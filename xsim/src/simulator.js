import { EventEmitter } from 'events';
import { faker } from '@faker-js/faker';
import Chance from 'chance';
import { StructuredLogger } from './logger.js';

// Initialize faker with seed for deterministic mode if needed
if (process.env.FAKER_SEED) {
  faker.seed(parseInt(process.env.FAKER_SEED));
}

const chance = new Chance();

/**
 * Comprehensive XMBL System Simulator
 * Demonstrates all core functionality: identities, consensus, ledger, state machine, storage, compute
 */
export class SystemSimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      initialIdentities: options.initialIdentities || 10,
      transactionRate: options.transactionRate || 2, // transactions per second
      stateDiffRate: options.stateDiffRate || 1, // state diffs per second
      storageOpRate: options.storageOpRate || 0.5, // storage ops per second
      computeOpRate: options.computeOpRate || 0.5, // compute ops per second
      useRealModules: options.useRealModules !== false, // Try to use real modules if available
      ...options
    };

    this.logger = new StructuredLogger({ logToConsole: true });
    this.identities = [];
    this.transactions = [];
    this.stateDiffs = [];
    this.blocks = [];
    this.cubes = [];
    this.superCubes = [];
    
    // Module instances (will be initialized if available)
    this.modules = {
      xid: null,
      xn: null,
      xclt: null,
      xvsm: null,
      xpc: null,
      xsc: null
    };

    this.metrics = {
      identitiesCreated: 0,
      transactionsCreated: 0,
      transactionsValidated: 0,
      blocksAdded: 0,
      facesCompleted: 0,
      cubesCompleted: 0,
      superCubesCompleted: 0,
      stateDiffsCreated: 0,
      stateAssemblies: 0,
      storageOperations: 0,
      computeOperations: 0,
      startTime: null,
      uptime: 0
    };

    this.running = false;
    this.intervals = [];
    this.leaders = []; // Consensus leaders
  }

  /**
   * Initialize and connect to real modules if available
   */
  async initializeModules() {
    this.logger.system('initializing', { useRealModules: this.options.useRealModules });

    if (!this.options.useRealModules) {
      this.logger.system('modules_disabled', { reason: 'useRealModules is false' });
      return;
    }

    // Try to import and initialize XID
    try {
      const { Identity } = await import('../../xid/index.js');
      this.modules.xid = Identity;
      this.logger.system('module_connected', { module: 'xid', status: 'connected' });
    } catch (error) {
      this.logger.system('module_unavailable', { module: 'xid', reason: error.message });
    }

    // Try to import and initialize XN
    try {
      const { XNNode, ConnectionManager } = await import('../../xn/index.js');
      this.modules.xn = { XNNode, ConnectionManager };
      this.logger.system('module_connected', { module: 'xn', status: 'connected' });
    } catch (error) {
      this.logger.system('module_unavailable', { module: 'xn', reason: error.message });
    }

    // Try to import and initialize XCLT (Ledger)
    try {
      const { Ledger } = await import('../../xclt/index.js');
      this.modules.xclt = new Ledger({
        dbPath: './data/xsim/ledger',
        xid: this.modules.xid,
        xn: this.modules.xn,
        // Pass identity lookup function so ledger can verify signatures
        getPublicKeyByAddress: (address) => {
          const identity = this.identities.find(id => id.address === address);
          return identity ? identity.publicKey : null;
        }
      });
      
      // Listen to ledger events
      this.modules.xclt.on('block:added', (block) => {
        this.metrics.blocksAdded++;
        this.blocks.push(block);
        this.logger.ledger('block_added', {
          blockId: block.id,
          txId: block.txId,
          timestamp: block.timestamp
        });
      });

      this.modules.xclt.on('face:complete', (data) => {
        this.metrics.facesCompleted++;
        const face = data.face || data;
        this.logger.ledger('face_complete', {
          faceIndex: face.index || face.faceIndex || data.faceIndex,
          blockCount: face.blocks?.size || face.blocks?.length || 0,
          timestamp: face.timestamp || data.timestamp
        });
      });

      this.modules.xclt.on('cube:complete', (data) => {
        this.metrics.cubesCompleted++;
        const cube = data.cube || data;
        this.cubes.push(cube);
        this.logger.ledger('cube_complete', {
          cubeId: cube.id || data.cubeId,
          level: cube.level || data.level || 1,
          faceCount: cube.faces?.size || cube.faces?.length || 0,
          timestamp: cube.timestamp || data.timestamp
        });
      });

      this.modules.xclt.on('supercube:complete', (data) => {
        this.metrics.superCubesCompleted++;
        const superCube = data.superCube || data;
        this.superCubes.push(superCube);
        this.logger.ledger('supercube_complete', {
          superCubeId: superCube.id || data.superCubeId,
          level: superCube.level || data.level,
          cubeCount: superCube.cubes?.size || superCube.cubes?.length || 0,
          timestamp: superCube.timestamp || data.timestamp
        });
      });

      this.logger.system('module_connected', { module: 'xclt', status: 'connected' });
    } catch (error) {
      this.logger.system('module_unavailable', { module: 'xclt', reason: error.message });
    }

    // Try to import and initialize XVSM (State Machine)
    try {
      const { StateMachine } = await import('../../xvsm/index.js');
      this.modules.xvsm = new StateMachine({
        dbPath: './data/xsim/xvsm',
        xclt: this.modules.xclt
      });

      // StateMachine doesn't extend EventEmitter, so we'll track state through ledger events
      // State diffs are processed automatically when blocks with state_diff type are added
      this.logger.system('module_connected', { module: 'xvsm', status: 'connected' });
      
      // Periodically check state machine statistics
      setInterval(() => {
        if (this.modules.xvsm) {
          try {
            const stats = this.modules.xvsm.getStatistics();
            this.logger.stateMachine('statistics', {
              totalTransactions: stats.totalTransactions,
              totalDiffs: stats.totalDiffs,
              stateRoot: stats.stateRoot,
              shardCount: stats.shards.length
            });
          } catch (error) {
            // Ignore errors
          }
        }
      }, 10000); // Every 10 seconds
    } catch (error) {
      this.logger.system('module_unavailable', { module: 'xvsm', reason: error.message });
    }

    // Try to import and initialize XPC (Consensus)
    try {
      const { ConsensusWorkflow } = await import('../../xpc/index.js');
      this.modules.xpc = new ConsensusWorkflow({
        dbPath: './data/xsim/xpc',
        xid: this.modules.xid,
        xclt: this.modules.xclt,
        xn: this.modules.xn,
        // Pass identity lookup function so xpc can verify signatures
        getPublicKeyByAddress: (address) => {
          const identity = this.identities.find(id => id.address === address);
          return identity ? identity.publicKey : null;
        }
      });

      // Listen to consensus events
      this.modules.xpc.on('raw_tx:added', (data) => {
        this.logger.consensus('raw_tx_added', {
          leaderId: data.leaderId,
          rawTxId: data.rawTxId
        });
      });

      this.modules.xpc.on('validation_tasks:created', (data) => {
        this.logger.consensus('validation_tasks_created', {
          rawTxId: data.rawTxId,
          taskCount: data.tasks.length
        });
      });

      this.modules.xpc.on('validation:complete', (data) => {
        this.logger.consensus('validation_complete', {
          rawTxId: data.rawTxId,
          taskId: data.taskId,
          validatorId: data.validatorId
        });
      });

      this.modules.xpc.on('tx:finalized', (data) => {
        this.metrics.transactionsValidated++;
        this.logger.consensus('tx_finalized', {
          rawTxId: data.rawTxId,
          txId: data.txData.id
        });
      });

      // Simulate validation completion for transactions
      this.modules.xpc.on('validation_tasks:created', async (data) => {
        console.log('[XSIM] ===== VALIDATION TASKS CREATED - AUTO-COMPLETING =====');
        console.log('[XSIM] rawTxId:', data.rawTxId);
        console.log('[XSIM] tasks count:', data.tasks ? data.tasks.length : 0);

        if (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0) {
          for (const task of data.tasks) {
            setTimeout(async () => {
              if (this.modules.xpc) {
                try {
                  // Find the validator identity by leaderId (which is an identity address)
                  const validatorIdentity = this.identities.find(id => id.address === task.leaderId);
                  if (!validatorIdentity) {
                    console.error(`[XSIM] Validator identity not found for leaderId: ${task.leaderId}`);
                    return;
                  }
                  
                  console.log(`[XSIM] Completing validation for rawTxId: ${data.rawTxId}, taskId: ${task.task}, validator: ${task.leaderId}`);
                  
                  // Sign validation if we have the validator identity
                  let validationSignature = null;
                  if (validatorIdentity && validatorIdentity.privateKey) {
                    try {
                      // Create Identity instance if needed
                      let identity = validatorIdentity;
                      if (!validatorIdentity.signTransaction || typeof validatorIdentity.signTransaction !== 'function') {
                        const { Identity } = await import('../../xid/index.js');
                        identity = new Identity(validatorIdentity.publicKey, validatorIdentity.privateKey);
                      }
                      
                      // Sign validation message (rawTxId + taskId)
                      const validationMessage = { rawTxId: data.rawTxId, taskId: task.task };
                      const signedValidation = await identity.signTransaction(validationMessage);
                      validationSignature = signedValidation.sig;
                    } catch (error) {
                      console.error('[XSIM] Failed to sign validation:', error);
                    }
                  }
                  
                  await this.modules.xpc.completeValidation(
                    data.rawTxId,
                    task.task,
                    process.hrtime.bigint(), // timestamp
                    validationSignature, // signature from validator identity
                    task.leaderId // validatorId (identity address)
                  );
                  console.log(`[XSIM] Validation completed successfully for task: ${task.task}`);
                } catch (error) {
                  console.error('[XSIM] Failed to complete validation:', error);
                  console.error('[XSIM] Error stack:', error.stack);
                }
              }
            }, 50 + Math.random() * 100); // Random delay 50-150ms per task
          }
        }
      });

      // Auto-finalize transactions after they move to processing
      this.modules.xpc.on('tx:processing', async (data) => {
        setTimeout(async () => {
          if (this.modules.xpc) {
            try {
              await this.modules.xpc.finalizeTransaction(data.txId);
            } catch (error) {
              this.logger.error('consensus', 'finalization_failed', error);
            }
          }
        }, 200); // Small delay before finalization
      });

      this.logger.system('module_connected', { module: 'xpc', status: 'connected' });
    } catch (error) {
      this.logger.system('module_unavailable', { module: 'xpc', reason: error.message });
    }

    // Try to import and initialize XSC (Storage and Compute)
    try {
      const { StorageNode, ComputeRuntime } = await import('../../xsc/index.js');
      this.modules.xsc = {
        StorageNode: StorageNode,
        ComputeRuntime: ComputeRuntime
      };
      this.logger.system('module_connected', { module: 'xsc', status: 'connected' });
    } catch (error) {
      this.logger.system('module_unavailable', { module: 'xsc', reason: error.message });
    }
  }

  /**
   * Create an identity using real module if available, otherwise simulate
   */
  async createIdentity() {
    let identity;
    
    if (this.modules.xid) {
      try {
        identity = await this.modules.xid.create();
        this.logger.identity('identity_created', {
          address: identity.address,
          publicKey: identity.publicKey?.substring(0, 20) + '...',
          source: 'real_module'
        });
      } catch (error) {
        this.logger.error('identity', 'creation_failed', error);
        // Fall back to simulated identity
        identity = this._createSimulatedIdentity();
      }
    } else {
      identity = this._createSimulatedIdentity();
    }

    this.identities.push(identity);
    this.metrics.identitiesCreated++;
    
    // If we have network module, add as node
    if (this.modules.xn && this.modules.xn.XNNode) {
      try {
        // In real implementation, would create XNNode here
        this.logger.network('node_added', {
          identityAddress: identity.address,
          source: 'identity_creation'
        });
      } catch (error) {
        // Ignore network errors
      }
    }

    this.emit('identity:created', identity);
    return identity;
  }

  _createSimulatedIdentity() {
    const identity = {
      address: faker.string.alphanumeric({ length: 40 }),
      publicKey: faker.string.alphanumeric({ length: 64 }),
      privateKey: faker.string.alphanumeric({ length: 64 }),
      createdAt: Date.now()
    };
    
    this.logger.identity('identity_created', {
      address: identity.address,
      publicKey: identity.publicKey.substring(0, 20) + '...',
      source: 'simulated'
    });
    
    return identity;
  }

  /**
   * Create and submit a transaction
   */
  async createTransaction() {
    if (this.identities.length < 2) {
      return;
    }

    const from = chance.pickone(this.identities);
    const to = chance.pickone(this.identities.filter(i => i.address !== from.address));
    
    const txType = chance.pickone(['utxo', 'token_creation', 'contract', 'state_diff']);
    const tx = {
      id: `tx_${Date.now()}_${chance.string({ length: 8 })}`,
      type: txType,
      from: from.address,
      to: to.address,
      amount: parseFloat(chance.floating({ min: 0.1, max: 1000, fixed: 2 })),
      fee: parseFloat(chance.floating({ min: 0.01, max: 10, fixed: 2 })),
      stake: parseFloat(chance.floating({ min: 0.1, max: 100, fixed: 2 })),
      timestamp: Date.now(),
      data: faker.lorem.sentence()
    };

    // Add required fields based on transaction type
    if (txType === 'token_creation') {
      tx.creator = from.address;
      tx.tokenId = faker.string.alphanumeric({ length: 32 });
    } else if (txType === 'contract') {
      tx.contractHash = faker.string.alphanumeric({ length: 64 });
      tx.abi = JSON.stringify([{ type: 'function', name: 'test' }]);
    } else if (txType === 'state_diff') {
      tx.function = faker.hacker.verb() + '_' + faker.hacker.noun();
      tx.args = { key: faker.string.alphanumeric({ length: 20 }) };
    }

    // Sign transaction if we have identity module
    if (this.modules.xid && from.privateKey) {
      try {
        // If from is already an Identity instance, use it directly
        let identity = from;
        if (!from.signTransaction || typeof from.signTransaction !== 'function') {
          // Create Identity instance from privateKey/publicKey
          const { Identity } = await import('../../xid/index.js');
          identity = new Identity(from.publicKey, from.privateKey);
        }
        
        // Ensure from address is set (derived from public key)
        tx.from = identity.address;
        
        // Sign transaction (this adds sig field)
        const signedTx = await identity.signTransaction(tx);
        tx.sig = signedTx.sig;
        // DO NOT include publicKey - only address in from field
      } catch (error) {
        console.error('[XSIM] Transaction signing failed:', error);
        // If signing fails, continue without signature
      }
    }

    this.transactions.push(tx);
    this.metrics.transactionsCreated++;

    this.logger.transaction('transaction_created', {
      txId: tx.id,
      type: tx.type,
      from: tx.from.substring(0, 10) + '...',
      to: tx.to.substring(0, 10) + '...',
      amount: tx.amount
    });

    // Submit to consensus if available
    if (this.modules.xpc && this.leaders.length > 0) {
      try {
        const leaderId = chance.pickone(this.leaders);
        await this.modules.xpc.submitTransaction(leaderId, tx);
        this.logger.consensus('transaction_submitted', {
          txId: tx.id,
          leaderId
        });
      } catch (error) {
        this.logger.error('consensus', 'transaction_submission_failed', error);
      }
    } else if (this.modules.xclt) {
      // If no consensus, add directly to ledger
      try {
        await this.modules.xclt.addTransaction(tx);
      } catch (error) {
        this.logger.error('ledger', 'transaction_addition_failed', error);
      }
    }

    this.emit('transaction:created', tx);
    return tx;
  }

  /**
   * Create a state diff transaction
   */
  async createStateDiff() {
    if (this.identities.length === 0) return;

    const from = chance.pickone(this.identities);
    const changes = {
      [faker.string.alphanumeric({ length: 20 })]: faker.string.alphanumeric({ length: 50 }),
      [faker.string.alphanumeric({ length: 20 })]: faker.string.alphanumeric({ length: 50 })
    };

    // Create a state_diff type transaction
    const tx = {
      id: `tx_state_${Date.now()}_${chance.string({ length: 8 })}`,
      type: 'state_diff',
      from: from.address,
      function: faker.hacker.verb() + '_' + faker.hacker.noun(),
      args: changes, // State diff changes go in args (required field)
      timestamp: Date.now()
    };

    // Sign transaction if we have identity module
    if (this.modules.xid && from.privateKey) {
      try {
        // If from is already an Identity instance, use it directly
        let identity = from;
        if (!from.signTransaction || typeof from.signTransaction !== 'function') {
          // Create Identity instance from privateKey/publicKey
          const { Identity } = await import('../../xid/index.js');
          identity = new Identity(from.publicKey, from.privateKey);
        }
        
        // Ensure from address is set (derived from public key)
        tx.from = identity.address;
        
        // Sign transaction (this adds sig field)
        const signedTx = await identity.signTransaction(tx);
        tx.sig = signedTx.sig;
        // DO NOT include publicKey - only address in from field
      } catch (error) {
        console.error('[XSIM] State diff signing failed:', error);
        // If signing fails, continue without signature
      }
    }

    this.metrics.stateDiffsCreated++;
    this.logger.stateMachine('state_diff_created', {
      txId: tx.id,
      changeCount: Object.keys(changes).length,
      source: 'transaction'
    });

    // Submit to consensus or ledger
    if (this.modules.xpc && this.leaders.length > 0) {
      try {
        const leaderId = chance.pickone(this.leaders);
        await this.modules.xpc.submitTransaction(leaderId, tx);
        this.logger.consensus('state_diff_submitted', {
          txId: tx.id,
          leaderId
        });
      } catch (error) {
        this.logger.error('consensus', 'state_diff_submission_failed', error);
      }
    } else if (this.modules.xclt) {
      // If no consensus, add directly to ledger
      try {
        await this.modules.xclt.addTransaction(tx);
      } catch (error) {
        this.logger.error('ledger', 'state_diff_addition_failed', error);
      }
    }

    this.emit('state:diff:created', { txId: tx.id, changes });
    return tx;
  }

  /**
   * Simulate storage operation
   */
  async simulateStorageOperation() {
    const operation = {
      type: chance.pickone(['store', 'retrieve', 'delete']),
      key: faker.string.alphanumeric({ length: 32 }),
      size: chance.integer({ min: 100, max: 10000 }),
      timestamp: Date.now()
    };

    this.metrics.storageOperations++;
    this.logger.storage('operation', {
      type: operation.type,
      key: operation.key.substring(0, 10) + '...',
      size: operation.size
    });

    this.emit('storage:operation', operation);
    return operation;
  }

  /**
   * Simulate compute operation
   */
  async simulateComputeOperation() {
    const operation = {
      functionName: `${faker.hacker.verb()}_${faker.hacker.noun()}`,
      duration: chance.normal({ mean: 100, dev: 20 }),
      memory: chance.integer({ min: 10, max: 100 }),
      timestamp: Date.now()
    };

    this.metrics.computeOperations++;
    this.logger.compute('operation', {
      functionName: operation.functionName,
      duration: Math.max(0, operation.duration),
      memory: operation.memory
    });

    this.emit('compute:operation', operation);
    return operation;
  }

  /**
   * Start the simulator
   */
  async start() {
    if (this.running) {
      return;
    }

    this.logger.system('starting', { options: this.options });
    this.running = true;
    this.metrics.startTime = Date.now();

    // Initialize modules
    await this.initializeModules();

    // Create initial identities
    this.logger.system('creating_initial_identities', { count: this.options.initialIdentities });
    for (let i = 0; i < this.options.initialIdentities; i++) {
      await this.createIdentity();
      // Small delay between identity creation
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Set up leaders for consensus (use first few identities)
    this.leaders = this.identities.slice(0, Math.min(5, this.identities.length)).map(id => id.address);
    this.logger.consensus('leaders_established', {
      leaderCount: this.leaders.length,
      leaders: this.leaders.map(l => l.substring(0, 10) + '...')
    });
    
    // Update xpc with actual validation leaders (identity addresses)
    if (this.modules.xpc && this.leaders.length >= 3) {
      this.modules.xpc.validationLeaders = this.leaders.slice(0, 3);
      console.log('[XSIM] Set validation leaders in xpc:', this.modules.xpc.validationLeaders);
    }

    // Start transaction generation
    const txInterval = setInterval(() => {
      this.createTransaction().catch(err => {
        this.logger.error('transaction', 'creation_error', err);
      });
    }, 1000 / this.options.transactionRate);
    this.intervals.push(txInterval);

    // Start state diff generation
    const stateDiffInterval = setInterval(() => {
      this.createStateDiff().catch(err => {
        this.logger.error('stateMachine', 'state_diff_error', err);
      });
    }, 1000 / this.options.stateDiffRate);
    this.intervals.push(stateDiffInterval);

    // Start storage operations
    const storageInterval = setInterval(() => {
      this.simulateStorageOperation().catch(err => {
        this.logger.error('storage', 'operation_error', err);
      });
    }, 1000 / this.options.storageOpRate);
    this.intervals.push(storageInterval);

    // Start compute operations
    const computeInterval = setInterval(() => {
      this.simulateComputeOperation().catch(err => {
        this.logger.error('compute', 'operation_error', err);
      });
    }, 1000 / this.options.computeOpRate);
    this.intervals.push(computeInterval);

    // Periodic state assembly (simulate app-centric state assembly)
    const stateAssemblyInterval = setInterval(() => {
      if (this.modules.xvsm && this.stateDiffs.length > 0) {
        try {
          // Assemble state from diffs
          const state = this.modules.xvsm.getState();
          this.metrics.stateAssemblies++;
          this.logger.stateMachine('state_assembled', {
            keyCount: Object.keys(state).length,
            diffCount: this.modules.xvsm.diffs.length,
            stateRoot: this.modules.xvsm.getStateRoot()
          });
        } catch (error) {
          // Ignore errors
        }
      }
    }, 15000); // Every 15 seconds
    this.intervals.push(stateAssemblyInterval);

    // Periodic metrics update
    const metricsInterval = setInterval(() => {
      this.metrics.uptime = Date.now() - this.metrics.startTime;
      this.logger.system('metrics_update', { ...this.metrics });
      this.emit('metrics:update', { ...this.metrics });
    }, 5000);
    this.intervals.push(metricsInterval);

    this.logger.system('started', {
      identities: this.identities.length,
      transactionRate: this.options.transactionRate,
      stateDiffRate: this.options.stateDiffRate
    });

    this.emit('started');
  }

  /**
   * Pause the simulator (keeps state, can be resumed)
   */
  pause() {
    if (!this.running) {
      return;
    }

    this.logger.system('pausing', {});
    this.running = false;

    // Clear intervals but keep all state
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    this.logger.system('paused', {
      metrics: { ...this.metrics }
    });

    this.emit('paused');
  }

  /**
   * Resume the simulator from paused state
   */
  resume() {
    if (this.running) {
      return;
    }

    this.logger.system('resuming', {});
    this.running = true;

    // Restart transaction generation
    const txInterval = setInterval(() => {
      this.createTransaction().catch(err => {
        this.logger.error('transaction', 'creation_error', err);
      });
    }, 1000 / this.options.transactionRate);
    this.intervals.push(txInterval);

    // Restart state diff generation
    const stateDiffInterval = setInterval(() => {
      this.createStateDiff().catch(err => {
        this.logger.error('stateMachine', 'state_diff_error', err);
      });
    }, 1000 / this.options.stateDiffRate);
    this.intervals.push(stateDiffInterval);

    // Restart storage operations
    const storageInterval = setInterval(() => {
      this.simulateStorageOperation().catch(err => {
        this.logger.error('storage', 'operation_error', err);
      });
    }, 1000 / this.options.storageOpRate);
    this.intervals.push(storageInterval);

    // Restart compute operations
    const computeInterval = setInterval(() => {
      this.simulateComputeOperation().catch(err => {
        this.logger.error('compute', 'operation_error', err);
      });
    }, 1000 / this.options.computeOpRate);
    this.intervals.push(computeInterval);

    this.logger.system('resumed', {});
    this.emit('resumed');
  }

  /**
   * Stop the simulator (completely stops, different from pause)
   */
  stop() {
    if (!this.running) {
      return;
    }

    this.logger.system('stopping', {});
    this.running = false;

    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];

    this.logger.system('stopped', {
      finalMetrics: { ...this.metrics }
    });

    this.emit('stopped');
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: this.running ? Date.now() - this.metrics.startTime : this.metrics.uptime
    };
  }

  /**
   * Check if simulator is running
   */
  isRunning() {
    return this.running;
  }
}
