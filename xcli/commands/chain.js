import { Command } from 'commander';
import { EventEmitter } from 'events';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

class LocalChain extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      name: config.name || 'local',
      id: config.id || 31337,
      port: config.port || 3000,
      rpcPort: config.rpcPort || 8545,
      wsPort: config.wsPort || 8546,
      dataDir: config.dataDir || './chain-data',
      nodes: config.nodes || 3,
      blockTime: config.blockTime || 1,
      accounts: {
        count: config.accounts?.count || 10,
        defaultBalance: config.accounts?.defaultBalance || 10000
      }
    };
    this.running = false;
    this.nodes = [];
    this.accounts = new Map();
    this.xid = null;
    this.xn = null;
    this.xclt = null;
    this.xpc = null;
    this.xsc = null;
  }

  async start(xid, xn, xclt, xpc, xsc) {
    if (this.running) {
      throw new Error('Chain already running');
    }

    await mkdir(this.config.dataDir, { recursive: true });

    this.xid = xid;
    this.xn = xn;
    this.xclt = xclt;
    this.xpc = xpc;
    this.xsc = xsc;

    if (this.xn && this.xn.XNNode) {
      const node = new this.xn.XNNode({ port: this.config.port });
      await node.start();
      this.nodes.push(node);
    }

    if (this.xid && this.xid.KeyManager && this.xid.Identity) {
      await this._createTestAccounts();
    }

    if (this.xclt && this.xclt.Ledger) {
      this.ledger = new this.xclt.Ledger();
    }

    this.running = true;
    this.emit('started');

    return {
      rpc: `http://localhost:${this.config.rpcPort}`,
      ws: `ws://localhost:${this.config.wsPort}`,
      p2p: this.nodes.map(n => n.getAddresses().map(a => a.toString())).flat()
    };
  }

  async stop() {
    if (!this.running) return;

    for (const node of this.nodes) {
      if (node.stop) {
        await node.stop();
      }
    }

    this.nodes = [];
    this.running = false;
    this.emit('stopped');
  }

  async _createTestAccounts() {
    const accountNames = [
      'alice', 'bob', 'charlie', 'deployer',
      'validator1', 'validator2', 'validator3',
      'storage1', 'compute1', 'faucet'
    ];

    const keyManager = new this.xid.KeyManager(join(this.config.dataDir, 'keys'));

    for (const name of accountNames.slice(0, this.config.accounts.count)) {
      const identity = await this.xid.Identity.create();
      await keyManager.saveIdentity(name, identity);
      this.accounts.set(name, {
        name,
        identity,
        address: identity.address,
        balance: name === 'faucet' ? 100000 : this.config.accounts.defaultBalance
      });
    }
  }

  getAccounts() {
    return Array.from(this.accounts.values()).map(acc => ({
      name: acc.name,
      address: acc.address,
      balance: acc.balance
    }));
  }

  getAccount(name) {
    const account = this.accounts.get(name);
    if (!account) return null;
    return {
      name: account.name,
      address: account.address,
      balance: account.balance,
      publicKey: account.identity.publicKey.substring(0, 64) + '...'
    };
  }

  async getBalance(name) {
    const account = this.accounts.get(name);
    if (!account) throw new Error(`Account ${name} not found`);
    return {
      address: account.address,
      balance: account.balance
    };
  }

  getStatus() {
    return {
      running: this.running,
      nodes: this.nodes.length,
      accounts: this.accounts.size,
      blockHeight: this.ledger ? 0 : 0,
      config: this.config
    };
  }
}

let chainInstance = null;

export function createChainCommand(xid, xn, xclt, xpc, xsc) {
  const chainCmd = new Command('chain');

  chainCmd
    .command('start')
    .description('Start local XMBL chain')
    .option('--port <port>', 'RPC port', '8545')
    .option('--data-dir <path>', 'Data directory', './chain-data')
    .option('--nodes <number>', 'Number of nodes', '3')
    .option('--detach', 'Run in background', false)
    .action(async (options) => {
      if (!xid || !xn || !xclt || !xpc || !xsc) {
        console.error('Error: All XMBL modules required for chain runner');
        process.exit(1);
      }

      if (chainInstance && chainInstance.running) {
        console.error('Error: Chain already running');
        process.exit(1);
      }

      const config = {
        rpcPort: parseInt(options.port),
        wsPort: parseInt(options.port) + 1,
        dataDir: options.dataDir,
        nodes: parseInt(options.nodes)
      };

      chainInstance = new LocalChain(config);
      
      try {
        const info = await chainInstance.start(xid, xn, xclt, xpc, xsc);
        console.log('Local chain started');
        console.log(`RPC: ${info.rpc}`);
        console.log(`WebSocket: ${info.ws}`);
        if (info.p2p.length > 0) {
          console.log(`P2P: ${info.p2p.join(', ')}`);
        }

        if (!options.detach) {
          process.on('SIGINT', async () => {
            await chainInstance.stop();
            process.exit(0);
          });
        }
      } catch (error) {
        console.error('Error starting chain:', error.message);
        process.exit(1);
      }
    });

  chainCmd
    .command('stop')
    .description('Stop local XMBL chain')
    .option('--clean', 'Clean data directory', false)
    .action(async (options) => {
      if (!chainInstance || !chainInstance.running) {
        console.log('Chain not running');
        return;
      }

      await chainInstance.stop();
      console.log('Local chain stopped');

      if (options.clean) {
        await rm(chainInstance.config.dataDir, { recursive: true, force: true });
        console.log('Data directory cleaned');
      }
    });

  chainCmd
    .command('accounts')
    .description('List test accounts')
    .action(async () => {
      if (!chainInstance || !chainInstance.running) {
        console.log('Chain not running. Start with: xmbl chain start');
        return;
      }

      const accounts = chainInstance.getAccounts();
      console.log(JSON.stringify(accounts, null, 2));
    });

  chainCmd
    .command('account <name>')
    .description('Show account details')
    .action(async (name) => {
      if (!chainInstance || !chainInstance.running) {
        console.log('Chain not running. Start with: xmbl chain start');
        return;
      }

      const account = chainInstance.getAccount(name);
      if (!account) {
        console.log(`Account ${name} not found`);
        return;
      }

      console.log(JSON.stringify(account, null, 2));
    });

  chainCmd
    .command('balance <name>')
    .description('Get account balance')
    .action(async (name) => {
      if (!chainInstance || !chainInstance.running) {
        console.log('Chain not running. Start with: xmbl chain start');
        return;
      }

      try {
        const balance = await chainInstance.getBalance(name);
        console.log(JSON.stringify(balance, null, 2));
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    });

  chainCmd
    .command('status')
    .description('Show chain status')
    .action(async () => {
      if (!chainInstance || !chainInstance.running) {
        console.log('Chain not running. Start with: xmbl chain start');
        return;
      }

      const status = chainInstance.getStatus();
      console.log(JSON.stringify(status, null, 2));
    });

  chainCmd
    .command('reset')
    .description('Reset chain (clear all data)')
    .option('--confirm', 'Confirm reset', false)
    .action(async (options) => {
      if (!options.confirm) {
        console.log('Use --confirm to reset chain');
        return;
      }

      if (chainInstance && chainInstance.running) {
        await chainInstance.stop();
      }

      if (chainInstance) {
        await rm(chainInstance.config.dataDir, { recursive: true, force: true });
        console.log('Chain reset complete');
        chainInstance = null;
      }
    });

  return chainCmd;
}

