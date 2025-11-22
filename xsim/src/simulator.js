import { EventEmitter } from 'events';

/**
 * XMBL System Simulator
 * Simulates system activity for testing and stress testing
 */
export class SystemSimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.identityRate = options.identityRate || 2; // identities per second
    this.transactionRate = options.transactionRate || 10; // transactions per second
    this.isRunning = false;
    this.metrics = {
      identitiesCreated: 0,
      transactionsCreated: 0,
      validationsCompleted: 0,
      blocksAdded: 0,
      cubesCompleted: 0
    };
    this.intervals = [];
  }

  /**
   * Start the simulator
   */
  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.emit('started');

    // Start identity generation
    const identityInterval = setInterval(() => {
      this._generateIdentity();
    }, 1000 / this.identityRate);
    this.intervals.push(identityInterval);

    // Start transaction generation
    const txInterval = setInterval(() => {
      this._generateTransaction();
    }, 1000 / this.transactionRate);
    this.intervals.push(txInterval);

    // Emit metrics periodically
    const metricsInterval = setInterval(() => {
      this.emit('metrics:update', { ...this.metrics });
    }, 5000);
    this.intervals.push(metricsInterval);
  }

  /**
   * Stop the simulator
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    this.emit('stopped');
  }

  /**
   * Generate a random identity
   * @private
   */
  _generateIdentity() {
    this.metrics.identitiesCreated++;
    this.emit('identity:created', {
      id: `identity_${this.metrics.identitiesCreated}`,
      timestamp: Date.now()
    });
  }

  /**
   * Generate a random transaction
   * @private
   */
  _generateTransaction() {
    this.metrics.transactionsCreated++;
    const tx = {
      id: `tx_${this.metrics.transactionsCreated}`,
      type: this._randomTxType(),
      from: `identity_${Math.floor(Math.random() * this.metrics.identitiesCreated) + 1}`,
      to: `identity_${Math.floor(Math.random() * this.metrics.identitiesCreated) + 1}`,
      amount: Math.random() * 1000,
      timestamp: Date.now()
    };
    this.emit('transaction:created', tx);
  }

  /**
   * Get random transaction type
   * @private
   */
  _randomTxType() {
    const types = ['utxo', 'token_creation', 'contract', 'state_diff'];
    return types[Math.floor(Math.random() * types.length)];
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      identitiesCreated: 0,
      transactionsCreated: 0,
      validationsCompleted: 0,
      blocksAdded: 0,
      cubesCompleted: 0
    };
  }
}

