import { EventEmitter } from 'events';

/**
 * Structured logger for XSIM
 * Emits well-organized, explicit logs for consumption by other tools
 */
export class StructuredLogger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enabled = options.enabled !== false;
    this.logLevel = options.logLevel || 'info';
    this.logToConsole = options.logToConsole !== false;
  }

  _log(level, category, event, data = {}) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      event,
      data
    };

    if (this.logToConsole) {
      const prefix = `[${logEntry.timestamp}] [${level.toUpperCase()}] [${category}]`;
      console.log(`${prefix} ${event}`, data);
    }

    this.emit('log', logEntry);
    this.emit(`log:${category}`, logEntry);
  }

  identity(event, data) {
    this._log('info', 'identity', event, data);
  }

  transaction(event, data) {
    this._log('info', 'transaction', event, data);
  }

  consensus(event, data) {
    this._log('info', 'consensus', event, data);
  }

  ledger(event, data) {
    this._log('info', 'ledger', event, data);
  }

  stateMachine(event, data) {
    this._log('info', 'stateMachine', event, data);
  }

  storage(event, data) {
    this._log('info', 'storage', event, data);
  }

  compute(event, data) {
    this._log('info', 'compute', event, data);
  }

  network(event, data) {
    this._log('info', 'network', event, data);
  }

  system(event, data) {
    this._log('info', 'system', event, data);
  }

  error(category, event, error) {
    this._log('error', category, event, {
      error: error.message,
      stack: error.stack
    });
  }
}


