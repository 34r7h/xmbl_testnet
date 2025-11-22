import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration manager
 * Loads config from JSON/YAML files and environment variables
 */
export class Config {
  constructor(options = {}) {
    this.configPath = options.configPath || join(__dirname, '../config.json');
    this.config = this._loadConfig();
    this._applyEnvOverrides();
  }

  _loadConfig() {
    try {
      const configData = readFileSync(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      // Return default config if file doesn't exist
      return this._getDefaultConfig();
    }
  }

  _getDefaultConfig() {
    return {
      network: {
        port: parseInt(process.env.XN_PORT || '3000'),
        bootstrap: process.env.XN_BOOTSTRAP ? process.env.XN_BOOTSTRAP.split(',') : []
      },
      ledger: {
        dbPath: process.env.XCLT_DB_PATH || './data/ledger'
      },
      stateMachine: {
        dbPath: process.env.XVSM_DB_PATH || './data/xvsm',
        totalShards: parseInt(process.env.XVSM_SHARDS || '4')
      },
      consensus: {
        dbPath: process.env.XPC_DB_PATH || './data/xpc',
        requiredValidations: parseInt(process.env.XPC_VALIDATIONS || '3')
      },
      storage: {
        dbPath: process.env.XSC_DB_PATH || './data/storage',
        capacity: parseInt(process.env.XSC_CAPACITY || '1000000')
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info'
      },
      rateLimit: {
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000')
      }
    };
  }

  _applyEnvOverrides() {
    // Environment variables override config file
    if (process.env.XN_PORT) {
      this.config.network.port = parseInt(process.env.XN_PORT);
    }
    if (process.env.LOG_LEVEL) {
      this.config.logging.level = process.env.LOG_LEVEL;
    }
  }

  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    target[lastKey] = value;
  }

  getAll() {
    return { ...this.config };
  }
}

// Singleton instance
let configInstance = null;

export function getConfig(options) {
  if (!configInstance) {
    configInstance = new Config(options);
  }
  return configInstance;
}

