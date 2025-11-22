# XCLI - XMBL Command Line Interface Instructions

## Overview

XCLI is the low-level command-line interface for all XMBL system activities. It provides comprehensive functionality for transaction submission, node management, queries, and system monitoring. Built with Commander.js for argument parsing, XCLI serves as the primary interface for developers and power users to interact with the XMBL network.

## Fundamentals

### Key Concepts

- **Command Structure**: Each system operation is a subcommand (e.g., `xmbl tx send`, `xmbl node start`)
- **Streaming Output**: Real-time monitoring via streaming commands (e.g., `xmbl monitor --stream`)
- **Export Capabilities**: Export data in JSON, CSV, or binary formats
- **Node Management**: Full control over local node lifecycle and configuration
- **Transaction Operations**: Create, sign, submit, and query transactions
- **System Queries**: Query ledger state, consensus status, storage, and compute resources

### Dependencies

- **commander**: Command-line argument parsing
- **chalk**: Colored terminal output
- **ora**: Spinner for async operations
- **inquirer**: Interactive prompts
- **ws**: WebSocket client for streaming
- **all XMBL modules**: xid, xn, xclt, xvsm, xpc, xsc

### Architectural Decisions

- **Modular Commands**: Each command category in separate file (tx.js, node.js, query.js)
- **Event-Driven**: Listen to module events for real-time updates
- **Config Management**: YAML/JSON config files for node settings
- **Key Management**: Integration with xid for secure key handling

## Development Steps

### Step 1: Project Setup

```bash
cd xcli
npm init -y
npm install commander chalk ora inquirer ws
npm install --save-dev jest @types/jest
```

### Step 2: Basic CLI Structure (TDD)

**Test First** (`__tests__/cli.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('XCLI Basic Structure', () => {
  test('should show help when no command provided', async () => {
    const { stdout } = await execAsync('node index.js --help');
    expect(stdout).toContain('Usage: xmbl');
    expect(stdout).toContain('Commands:');
  });

  test('should show version', async () => {
    const { stdout } = await execAsync('node index.js --version');
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});
```

**Implementation** (`index.js`):

```javascript
#!/usr/bin/env node
import { Command } from 'commander';
import { version } from './package.json';

const program = new Command();

program
  .name('xmbl')
  .description('XMBL Command Line Interface')
  .version(version);

program.parse();
```

### Step 3: Transaction Commands (TDD)

**Test** (`__tests__/tx.test.js`):

```javascript
import { execAsync } from './test-utils';

describe('Transaction Commands', () => {
  test('should create transaction', async () => {
    const { stdout } = await execAsync(
      'node index.js tx create --to bob --amount 1.0'
    );
    const tx = JSON.parse(stdout);
    expect(tx).toHaveProperty('to');
    expect(tx).toHaveProperty('amount');
    expect(tx.to).toBe('bob');
    expect(tx.amount).toBe(1.0);
  });

  test('should sign transaction', async () => {
    const tx = { to: 'bob', amount: 1.0 };
    const { stdout } = await execAsync(
      `node index.js tx sign --tx '${JSON.stringify(tx)}' --key alice.key`
    );
    const signed = JSON.parse(stdout);
    expect(signed).toHaveProperty('sig');
  });

  test('should submit transaction', async () => {
    const signed = { to: 'bob', amount: 1.0, sig: '...' };
    const { stdout } = await execAsync(
      `node index.js tx submit --tx '${JSON.stringify(signed)}'`
    );
    expect(stdout).toContain('Transaction submitted');
    expect(stdout).toMatch(/tx_id: [a-f0-9]{64}/);
  });
});
```

**Implementation** (`commands/tx.js`):

```javascript
import { Command } from 'commander';
import { XID } from 'xid';
import { XCLT } from 'xclt';
import { XPC } from 'xpc';

export function createTxCommand(xid, xclt, xpc) {
  const txCmd = new Command('tx');

  txCmd
    .command('create')
    .description('Create a new transaction')
    .requiredOption('--to <address>', 'Recipient address')
    .requiredOption('--amount <number>', 'Amount to send')
    .option('--fee <number>', 'Transaction fee', '0.1')
    .option('--stake <number>', 'Validation stake', '0.2')
    .action(async (options) => {
      const tx = {
        to: options.to,
        amount: parseFloat(options.amount),
        fee: parseFloat(options.fee),
        stake: parseFloat(options.stake),
        timestamp: Date.now()
      };
      console.log(JSON.stringify(tx, null, 2));
    });

  txCmd
    .command('sign')
    .description('Sign a transaction')
    .requiredOption('--tx <json>', 'Transaction JSON')
    .requiredOption('--key <path>', 'Private key file path')
    .action(async (options) => {
      const tx = JSON.parse(options.tx);
      const key = await xid.loadKey(options.key);
      const signed = await xid.sign(tx, key);
      console.log(JSON.stringify(signed, null, 2));
    });

  txCmd
    .command('submit')
    .description('Submit transaction to network')
    .requiredOption('--tx <json>', 'Signed transaction JSON')
    .action(async (options) => {
      const tx = JSON.parse(options.tx);
      const txId = await xpc.submitTransaction(tx);
      console.log(`Transaction submitted`);
      console.log(`tx_id: ${txId}`);
    });

  return txCmd;
}
```

### Step 4: Node Management Commands

**Test** (`__tests__/node.test.js`):

```javascript
describe('Node Commands', () => {
  test('should start node', async () => {
    const { stdout } = await execAsync('node index.js node start');
    expect(stdout).toContain('Node starting');
    expect(stdout).toContain('Listening on');
  });

  test('should stop node', async () => {
    const { stdout } = await execAsync('node index.js node stop');
    expect(stdout).toContain('Node stopped');
  });

  test('should show node status', async () => {
    const { stdout } = await execAsync('node index.js node status');
    const status = JSON.parse(stdout);
    expect(status).toHaveProperty('connected');
    expect(status).toHaveProperty('peers');
    expect(status).toHaveProperty('uptime');
  });
});
```

### Step 5: Query Commands

**Test** (`__tests__/query.test.js`):

```javascript
describe('Query Commands', () => {
  test('should query balance', async () => {
    const { stdout } = await execAsync(
      'node index.js query balance --address alice'
    );
    const balance = JSON.parse(stdout);
    expect(balance).toHaveProperty('address');
    expect(balance).toHaveProperty('balance');
  });

  test('should query transaction', async () => {
    const { stdout } = await execAsync(
      'node index.js query tx --id abc123'
    );
    const tx = JSON.parse(stdout);
    expect(tx).toHaveProperty('id');
    expect(tx).toHaveProperty('status');
  });

  test('should query ledger state', async () => {
    const { stdout } = await execAsync('node index.js query state');
    const state = JSON.parse(stdout);
    expect(state).toHaveProperty('height');
    expect(state).toHaveProperty('cubes');
  });
});
```

### Step 6: Streaming/Monitoring Commands

**Test** (`__tests__/monitor.test.js`):

```javascript
describe('Monitor Commands', () => {
  test('should stream transactions', async () => {
    const proc = exec('node index.js monitor --stream tx');
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data;
      if (output.includes('tx_id')) {
        proc.kill();
      }
    });
    // Wait for output
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(output).toContain('Monitoring transactions');
  });
});
```

### Step 7: Export Commands

**Test** (`__tests__/export.test.js`):

```javascript
describe('Export Commands', () => {
  test('should export transactions to JSON', async () => {
    const { stdout } = await execAsync(
      'node index.js export tx --format json --output tx.json'
    );
    expect(stdout).toContain('Exported');
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('tx.json'));
    expect(Array.isArray(data)).toBe(true);
  });

  test('should export to CSV', async () => {
    const { stdout } = await execAsync(
      'node index.js export tx --format csv --output tx.csv'
    );
    expect(stdout).toContain('Exported');
  });
});
```

## Interfaces/APIs

### Exported Functions

```javascript
// Main CLI entry point
export function createCLI(config) {
  // Returns configured Commander program
}

// Command factories
export function createTxCommand(xid, xclt, xpc);
export function createNodeCommand(xn, xpc);
export function createQueryCommand(xclt, xvsm, xpc);
export function createMonitorCommand(xclt, xpc, xsc);
export function createExportCommand(xclt, xvsm);
```

### Configuration

```javascript
// config/default.yaml
node:
  port: 3000
  peers: []
  storage: ./data

wallet:
  keyPath: ./keys
  defaultKey: default.key

network:
  bootstrap: []
  discovery: true
```

## Testing

### Test Scenarios

1. **Transaction Lifecycle**
   - Create → Sign → Submit → Query
   - Error handling for invalid transactions
   - Fee and stake validation

2. **Node Management**
   - Start/stop/restart node
   - Configuration loading
   - Peer connection management

3. **Query Operations**
   - Balance queries
   - Transaction history
   - Ledger state queries
   - Consensus status

4. **Streaming**
   - Real-time transaction monitoring
   - Network event streaming
   - Performance metrics streaming

5. **Export**
   - JSON export
   - CSV export
   - Binary export
   - Large dataset handling

### Coverage Goals

- 90%+ code coverage
- All command paths tested
- Error cases covered
- Integration tests with mock modules

## Integration Notes

### Module Dependencies

- **xid**: Key loading, transaction signing
- **xn**: Node networking, peer management
- **xclt**: Ledger queries, transaction submission
- **xvsm**: State machine queries
- **xpc**: Consensus operations, mempool queries
- **xsc**: Storage and compute queries

### Integration Pattern

```javascript
import { XID } from 'xid';
import { XN } from 'xn';
import { XCLT } from 'xclt';
import { XPC } from 'xpc';
import { XSC } from 'xsc';
import { createCLI } from 'xcli';

const xid = new XID();
const xn = new XN();
const xclt = new XCLT({ xid, xn });
const xpc = new XPC({ xclt, xn });
const xsc = new XSC({ xn, xpc });

const cli = createCLI({ xid, xn, xclt, xpc, xsc });
cli.parse();
```

### Event Listening

```javascript
// Listen to module events for streaming
xclt.on('transaction:added', (tx) => {
  if (streaming) {
    console.log(JSON.stringify({ type: 'tx', data: tx }));
  }
});

xpc.on('consensus:update', (update) => {
  if (streaming) {
    console.log(JSON.stringify({ type: 'consensus', data: update }));
  }
});
```

## Terminal and Browser Monitoring

### Terminal Output

- **Structured Logging**: Use chalk for colored output
  - Success: green
  - Error: red
  - Warning: yellow
  - Info: blue

- **Progress Indicators**: Use ora for spinners
  ```javascript
  const spinner = ora('Submitting transaction').start();
  // ... async operation
  spinner.succeed('Transaction submitted');
  ```

- **Table Output**: Use console.table for structured data
  ```javascript
  console.table([
    { address: 'alice', balance: 100.5 },
    { address: 'bob', balance: 50.2 }
  ]);
  ```

### Screenshot Requirements

Capture terminal output for:
- Command help screens
- Transaction submission flows
- Node status displays
- Query results
- Error messages
- Streaming output

### Console Logging

- Use log levels: `debug`, `info`, `warn`, `error`
- Structured JSON logging for machine parsing
- Timestamp all log entries
- Include context (command, user, node ID)
