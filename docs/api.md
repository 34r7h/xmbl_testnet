# XMBL API Documentation

## Core Modules

### XID - Identity & Signatures

#### Identity

```javascript
import { Identity } from 'xid';

// Create new identity
const identity = await Identity.create();

// Sign transaction
const signedTx = await identity.signTransaction(tx);

// Verify transaction
const isValid = await Identity.verifyTransaction(signedTx, publicKey);
```

**Methods:**
- `static create()` - Create new identity with keypair
- `static fromPublicKey(publicKey)` - Create identity from public key
- `signTransaction(tx)` - Sign transaction with MAYO signature
- `static verifyTransaction(signedTx, publicKey)` - Verify transaction signature

### XCLT - Cubic Ledger

#### Ledger

```javascript
import { Ledger } from 'xclt';

const ledger = new Ledger({
  dbPath: './data/ledger',
  xid: xidModule,
  xn: xnModule
});

// Add transaction
const block = await ledger.addTransaction(tx);

// Get block
const block = await ledger.getBlock(blockId);
```

**Methods:**
- `addTransaction(tx)` - Add transaction to ledger
- `getBlock(blockId)` - Get block by ID
- `getCubes()` - Get all cubes
- `getStateRoot()` - Get ledger state root

### XVSM - Virtual State Machine

#### StateMachine

```javascript
import { StateMachine } from 'xvsm';

const stateMachine = new StateMachine({
  totalShards: 4,
  xclt: ledger
});

// Execute transaction
const result = await stateMachine.executeTransaction(txId, wasmCode, input);

// Get state
const state = stateMachine.getState(key);
```

### XPC - Peer Consensus

#### ConsensusWorkflow

```javascript
import { ConsensusWorkflow } from 'xpc';

const workflow = new ConsensusWorkflow({
  xid: xidModule,
  xclt: ledger,
  xn: network
});

// Submit transaction
const rawTxId = await workflow.submitTransaction(leaderId, txData);

// Complete validation
await workflow.completeValidation(rawTxId, taskId, timestamp, signature);
```

### XSC - Storage & Compute

#### StorageNode

```javascript
import { StorageNode } from 'xsc';

const storage = new StorageNode({
  capacity: 1000000,
  xn: network,
  xpc: consensus,
  xclt: ledger
});

// Store data
const shard = await storage.storeShard(dataShard);
```

### XN - Networking

#### XNNode

```javascript
import { XNNode } from 'xn';

const node = new XNNode();
await node.start();

// Publish message
await node.publish('topic', data);

// Subscribe to topic
await node.subscribe('topic');
```

## Events

All modules extend EventEmitter and emit the following events:

- `block:added` - New block added to ledger
- `face:complete` - Face completed (9 blocks)
- `cube:complete` - Cube completed (3 faces)
- `supercube:complete` - Super-cube completed (27 cubes)
- `tx:finalized` - Transaction finalized in consensus
- `raw_tx:added` - Raw transaction added to mempool

