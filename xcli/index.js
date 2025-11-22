#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createTxCommand } from './commands/tx.js';
import { createIdentityCommand } from './commands/identity.js';
import { createLedgerCommand } from './commands/ledger.js';
import { createConsensusCommand } from './commands/consensus.js';
import { createStateCommand } from './commands/state.js';
import { createStorageCommand } from './commands/storage.js';
import { createNetworkCommand } from './commands/network.js';
import { createQueryCommand } from './commands/query.js';
import { createMonitorCommand } from './commands/monitor.js';
import { createExportCommand } from './commands/export.js';
import { createChainCommand } from './commands/chain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8')
);

const program = new Command();

program
  .name('xmbl')
  .description('XMBL Command Line Interface')
  .version(packageJson.version);

// Initialize modules - REQUIRED, no fallbacks
// Suppress console.log from module initialization
const originalLog = console.log;
console.log = () => {}; // Suppress during module loading

let xid, xclt, xpc, xn, xvsm, xsc;

try {
  xid = await import('../xid/index.js');
  xclt = await import('../xclt/index.js');
  xpc = await import('../xpc/index.js');
  xn = await import('../xn/index.js');
  xvsm = await import('../xvsm/index.js');
  xsc = await import('../xsc/index.js');
  
  // Restore console.log after modules loaded
  console.log = originalLog;
} catch (error) {
  // Restore console.log before error
  console.log = originalLog;
  console.error('Failed to load XMBL modules:', error.message);
  console.error('Ensure all XMBL modules (xid, xclt, xpc, xn, xvsm, xsc) are available.');
  process.exit(1);
}

// Add all command groups
const txCmd = createTxCommand(xid, xclt, xpc, xn);
program.addCommand(txCmd);

const identityCmd = createIdentityCommand(xid);
program.addCommand(identityCmd);

const ledgerCmd = createLedgerCommand(xclt);
program.addCommand(ledgerCmd);

const consensusCmd = createConsensusCommand(xpc, xid, xclt, xn);
program.addCommand(consensusCmd);

const stateCmd = createStateCommand(xvsm);
program.addCommand(stateCmd);

const storageCmd = createStorageCommand(xsc);
program.addCommand(storageCmd);

const networkCmd = createNetworkCommand(xn);
program.addCommand(networkCmd);

const queryCmd = createQueryCommand(xclt, xvsm, xpc);
program.addCommand(queryCmd);

const monitorCmd = createMonitorCommand(xclt, xpc, xsc);
program.addCommand(monitorCmd);

const exportCmd = createExportCommand(xclt, xvsm);
program.addCommand(exportCmd);

const chainCmd = createChainCommand(xid, xn, xclt, xpc, xsc);
program.addCommand(chainCmd);

program.parse();
