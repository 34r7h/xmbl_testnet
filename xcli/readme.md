# XCLI - XMBL Command Line Interface

XCLI is the comprehensive command-line interface for the XMBL (eXtended Multi-dimensional Blockchain Ledger) system. It provides access to all XMBL modules including identity management, transactions, consensus, ledger operations, state machine, storage, and networking.

## Installation

```bash
cd xcli
npm install
```

## Quick Start

```bash
# Show help
xmbl --help

# Show version
xmbl --version
```

## Command Reference

### Identity Commands (XID - MAYO Signatures)

#### Create Identity

Generate a new identity with MAYO post-quantum keypair.

```bash
xmbl identity create --name alice
```

**Expected Output:**
```json
{
  "name": "alice",
  "address": "xmb186b35d61ad21c9b39916a82968f7f707a189582",
  "publicKey": "wJ4c2fIsDk4G2YkFtUPxAtaBGwEtw9EficZ0ITkgSpPV6ZS8RBPe1o9SPAVZd+KS..."
}
```

**Options:**
- `--name <name>` - Identity name (default: auto-generated)
- `--key-dir <path>` - Key directory path (default: `./keys`)
- `--password <password>` - Password for encrypted key storage

#### List Identities

List all saved identities.

```bash
xmbl identity list
```

**Expected Output:**
```json
["alice", "bob", "charlie"]
```

**Options:**
- `--key-dir <path>` - Key directory path (default: `./keys`)

#### Show Identity

Display identity details.

```bash
xmbl identity show alice
```

**Expected Output:**
```json
{
  "name": "alice",
  "address": "xmb186b35d61ad21c9b39916a82968f7f707a189582",
  "publicKey": "wJ4c2fIsDk4G2YkFtUPxAtaBGwEtw9EficZ0ITkgSpPV6ZS8RBPe1o9SPAVZd+KS..."
}
```

**Options:**
- `--key-dir <path>` - Key directory path (default: `./keys`)

#### Sign Message

Sign a message with MAYO signature.

```bash
xmbl identity sign alice --message "Hello XMBL"
```

**Expected Output:**
```json
{
  "message": "Hello XMBL",
  "signature": "5RLHzHKWU2ZrO1ohZdM7IskZdzNmc/R5EyNWLmMh32jhmkA52X3N5YYUSAysaHs140t4XESkDA8pfgU12dgP1xCI5XWf9rDu6w3+n31ByWjzT0bNhNHungGtznhftPX/VI0dHMg8vu+SV3M7nUESjP3/JMA3atV/pPNIaTz5fdz0ffzaVMqaw7R8vjJeAk+fp2THETvPzbvuCfdVw6gZPq4Uk+FYJ2TMXVjo1aKgEryuMHVTC+OtjJ9BDnI0z0z7xqP3HO5uOnivm7XwUbgUdRZ1Ulwf9Vf1Ht1Pb91xgOxsQv5ST2Y2o3KcuWxWW73mVd9BpWlINOIi0ZyUSUGXwcDI46YGzO7/H5fqH+6PFVAA2+2l1XqXw1IKjTTGIBVvl2suNkdEIeiFhOsyYFOk3/uJvQKH3G6CB2vYXLAlYtMekkPpsEgekEELSUNA8S35WPr98/XQZXC1ep3iZ4qRntolB/SpRTqmbH43AGYRzvmJBvgTyfiKWy3M/z4dDZEF4IK17cYOP1DLc7q6QvrR0kV9SUCebf44vgOb/fkXXZ9yGoC20/+a6SsLfJ2Si+pfebgJuhuJ0djXSY77p5Arm9nZ1/ffZg=="
}
```

**Options:**
- `--message <text>` - Message to sign (required)
- `--key-dir <path>` - Key directory path (default: `./keys`)
- `--password <password>` - Password for encrypted key

#### Verify Signature

Verify a MAYO signature.

```bash
xmbl identity verify --message "Hello XMBL" --signature "<signature>" --public-key "<public-key>"
```

**Expected Output:**
```json
{
  "valid": true
}
```

**Options:**
- `--message <text>` - Original message (required)
- `--signature <sig>` - Signature to verify (required)
- `--public-key <key>` - Public key (required)

---

### Transaction Commands (TX)

#### Create Transaction

Create a new transaction.

```bash
xmbl tx create --to bob --amount 100 --fee 0.5 --stake 1.0 --type utxo --from alice
```

**Expected Output:**
```json
{
  "type": "utxo",
  "to": "bob",
  "amount": 100,
  "fee": 0.5,
  "stake": 1.0,
  "timestamp": 1763820747617,
  "from": "alice"
}
```

**Options:**
- `--to <address>` - Recipient address (required)
- `--amount <number>` - Amount to send (required)
- `--fee <number>` - Transaction fee (default: `0.1`)
- `--stake <number>` - Validation stake (default: `0.2`)
- `--type <type>` - Transaction type: `identity`, `utxo`, `token_creation`, `contract`, `state_diff` (default: `utxo`)
- `--from <address>` - Sender address

#### Sign Transaction

Sign a transaction with MAYO signature.

```bash
xmbl tx sign --tx '{"type":"utxo","to":"bob","amount":100,"from":"alice"}' --key alice
```

**Expected Output:**
```json
{"type":"utxo","to":"bob","amount":100,"from":"alice","sig":"5RLHzHKWU2ZrO1ohZdM7IskZdzNmc/R5EyNWLmMh32jhmkA52X3N5YYUSAysaHs140t4XESkDA8pfgU12dgP1xCI5XWf9rDu6w3+n31ByWjzT0bNhNHungGtznhftPX/VI0dHMg8vu+SV3M7nUESjP3/JMA3atV/pPNIaTz5fdz0ffzaVMqaw7R8vjJeAk+fp2THETvPzbvuCfdVw6gZPq4Uk+FYJ2TMXVjo1aKgEryuMHVTC+OtjJ9BDnI0z0z7xqP3HO5uOnivm7XwUbgUdRZ1Ulwf9Vf1Ht1Pb91xgOxsQv5ST2Y2o3KcuWxWW73mVd9BpWlINOIi0ZyUSUGXwcDI46YGzO7/H5fqH+6PFVAA2+2l1XqXw1IKjTTGIBVvl2suNkdEIeiFhOsyYFOk3/uJvQKH3G6CB2vYXLAlYtMekkPpsEgekEELSUNA8S35WPr98/XQZXC1ep3iZ4qRntolB/SpRTqmbH43AGYRzvmJBvgTyfiKWy3M/z4dDZEF4IK17cYOP1DLc7q6QvrR0kV9SUCebf44vgOb/fkXXZ9yGoC20/+a6SsLfJ2Si+pfebgJuhuJ0djXSY77p5Arm9nZ1/ffZg=="}
```

**Options:**
- `--tx <json>` - Transaction JSON (required)
- `--key <name>` - Identity name (required)
- `--key-dir <path>` - Key directory path (default: `./keys`)
- `--password <password>` - Password for encrypted key

#### Submit Transaction

Submit transaction to ConsensusWorkflow (mempool).

```bash
xmbl tx submit --tx '{"type":"utxo","to":"bob","amount":100,"from":"alice","sig":"..."}' --leader leader1
```

**Expected Output:**
```
Transaction submitted
raw_tx_id: 69ad5911523fbe84f10aae60571d6dba2d347d0d204355767d34eb590774dde0
```

**Options:**
- `--tx <json>` - Signed transaction JSON (required)
- `--leader <leader-id>` - Leader ID for submission (required)

---

### Ledger Commands (XCLT - Cubic Ledger Technology)

#### Add Transaction to Ledger

Add a transaction to the cubic ledger.

```bash
xmbl ledger tx add --tx '{"type":"utxo","to":"bob","amount":100,"from":"alice"}'
```

**Expected Output:**
```json
{
  "blockId": "a1b2c3d4e5f6..."
}
```

**Options:**
- `--tx <json>` - Transaction JSON (required)

#### Get Block

Retrieve a block by ID.

```bash
xmbl ledger block get a1b2c3d4e5f6
```

**Expected Output:**
```json
{
  "id": "a1b2c3d4e5f6",
  "tx": {
    "type": "utxo",
    "to": "bob",
    "amount": 100
  },
  "hash": "...",
  "digitalRoot": 7,
  "timestamp": 1763820747617
}
```

#### List Cubes

List all cubes in the ledger.

```bash
xmbl ledger cube list
```

**Expected Output:**
```json
[
  {
    "id": "cube1",
    "faces": 3
  },
  {
    "id": "cube2",
    "faces": 3
  }
]
```

#### Get State Root

Get the ledger state root (Merkle root of all cubes).

```bash
xmbl ledger state root
```

**Expected Output:**
```json
{
  "stateRoot": "7c9e344798d7e3bb3099f4b7d28a7331f7fce3d00c6d8aa18cc05ae108c6e586"
}
```

---

### Consensus Commands (XPC - Peer Consensus Layer)

#### Submit to Mempool

Submit transaction to consensus mempool.

```bash
xmbl consensus submit --tx '{"type":"utxo","to":"bob","amount":100}' --leader leader1
```

**Expected Output:**
```json
{
  "rawTxId": "fbcac3f3e60b52aae77469935c44cdfc22bed96c6e3481cd61f88fa3bc273f99"
}
```

**Options:**
- `--tx <json>` - Transaction JSON (required)
- `--leader <leader-id>` - Leader ID (required)

#### List Raw Transactions

List all raw transactions in mempool.

```bash
xmbl consensus raw-tx list
```

**Expected Output:**
```json
[
  {
    "leader": "leader1",
    "rawTxId": "fbcac3f3e60b52aae77469935c44cdfc22bed96c6e3481cd61f88fa3bc273f99"
  }
]
```

**Options:**
- `--leader <leader-id>` - Filter by leader ID

#### Get Mempool Statistics

Get statistics about mempool state.

```bash
xmbl consensus stats mempool
```

**Expected Output:**
```json
{
  "rawTx": 5,
  "processing": 2,
  "finalized": 10,
  "lockedUtxos": 3
}
```

#### Elect Leaders

Elect consensus leaders based on uptime and performance.

```bash
xmbl consensus leader elect --count 3
```

**Expected Output:**
```json
{
  "leaders": ["leader1", "leader2", "leader3"]
}
```

**Options:**
- `--count <number>` - Number of leaders to elect (default: `3`)

---

### State Commands (XVSM - Virtual State Machine)

#### Set State Value

Set a value in the Verkle state tree.

```bash
xmbl state set mykey --value '{"data":"example"}'
```

**Expected Output:**
```json
{
  "key": "mykey",
  "value": {
    "data": "example"
  },
  "root": "7c9e344798d7e3bb3099f4b7d28a7331f7fce3d00c6d8aa18cc05ae108c6e586"
}
```

**Options:**
- `--value <json>` - Value JSON (required)

#### Get State Value

Retrieve a value from the state tree.

```bash
xmbl state get mykey
```

**Expected Output:**
```json
{
  "key": "mykey",
  "value": {
    "data": "example"
  }
}
```

#### Get State Root

Get the Verkle state tree root.

```bash
xmbl state root
```

**Expected Output:**
```json
{
  "stateRoot": "7c9e344798d7e3bb3099f4b7d28a7331f7fce3d00c6d8aa18cc05ae108c6e586"
}
```

#### Generate State Proof

Generate a proof for a state value.

```bash
xmbl state proof generate mykey
```

**Expected Output:**
```json
{
  "root": "7c9e344798d7e3bb3099f4b7d28a7331f7fce3d00c6d8aa18cc05ae108c6e586",
  "path": [...],
  "key": "..."
}
```

---

### Storage Commands (XSC - Storage and Compute)

#### Store Data

Store data with sharding and erasure coding.

```bash
xmbl storage store --data /path/to/file.txt --shards 4 --parity 2
```

**Expected Output:**
```json
{
  "shardIds": [
    "d54e5f1ab57cf16c9729d6d4d3563cde5aac755ee7bcd0f30234d2b9014e05b8",
    "c8d70e1a9fc282682404e71b514116370455872c743f0083359a844f83632d13",
    "8d9449dc8a54ac8e845fedbebfba35d4e1092de697c9e780e16a72a61a7f7c83"
  ],
  "shards": 4,
  "parity": 2
}
```

**Options:**
- `--data <file>` - Data file path (required)
- `--shards <number>` - Number of data shards (default: `4`)
- `--parity <number>` - Number of parity shards (default: `2`)

#### Storage Node Status

Get storage node capacity and usage.

```bash
xmbl storage node status
```

**Expected Output:**
```json
{
  "capacity": 1000000,
  "used": 0,
  "available": 1000000
}
```

#### Calculate Storage Price

Calculate storage pricing based on size and utilization.

```bash
xmbl storage pricing storage --size 1024 --utilization 0.7
```

**Expected Output:**
```json
{
  "size": 1024,
  "utilization": 0.7,
  "price": 0.0014
}
```

**Options:**
- `--size <bytes>` - Size in bytes (required)
- `--utilization <0-1>` - Utilization factor (default: `0.5`)

---

### Network Commands (XN - Networking)

#### Start Network Node

Start a P2P networking node.

```bash
xmbl network start --port 3000
```

**Expected Output:**
```json
{
  "started": true,
  "peerId": "12D3KooWF2gN7ix8B1wdLE3eQRntpytQjpE4WqhFmjcqVrwRo627",
  "addresses": [
    "/ip4/127.0.0.1/tcp/3000/p2p/12D3KooWF2gN7ix8B1wdLE3eQRntpytQjpE4WqhFmjcqVrwRo627",
    "/ip4/10.140.37.79/tcp/3000/p2p/12D3KooWF2gN7ix8B1wdLE3eQRntpytQjpE4WqhFmjcqVrwRo627"
  ]
}
```

**Options:**
- `--port <port>` - Port number (default: `3000`)

#### Network Status

Get network node status.

```bash
xmbl network status
```

**Expected Output:**
```json
{
  "started": true,
  "peerId": "12D3KooWF2gN7ix8B1wdLE3eQRntpytQjpE4WqhFmjcqVrwRo627",
  "addresses": [
    "/ip4/127.0.0.1/tcp/3000/p2p/12D3KooWF2gN7ix8B1wdLE3eQRntpytQjpE4WqhFmjcqVrwRo627"
  ]
}
```

#### List Peers

List connected peers.

```bash
xmbl network peers
```

**Expected Output:**
```json
{
  "peers": [
    "12D3KooWAbc123...",
    "12D3KooWDef456..."
  ]
}
```

---

## Complete Workflow Example

Here's a complete example of creating an identity, signing a transaction, submitting it to consensus, and adding it to the ledger:

```bash
# 1. Create identity
xmbl identity create --name alice

# 2. Create transaction
xmbl tx create --to bob --amount 100 --from alice

# 3. Sign transaction
TX='{"type":"utxo","to":"bob","amount":100,"from":"alice"}'
SIGNED=$(xmbl tx sign --tx "$TX" --key alice)

# 4. Submit to consensus
xmbl tx submit --tx "$SIGNED" --leader leader1

# 5. Add to ledger
xmbl ledger tx add --tx "$SIGNED"

# 6. Check ledger state
xmbl ledger state root
xmbl ledger cube list
```

## Module Integration

XCLI integrates all XMBL modules:

- **XID**: MAYO post-quantum signatures for identity and transaction signing
- **XN**: P2P networking with libp2p for node communication
- **XCLT**: Cubic Ledger Technology with 3D geometric block organization
- **XPC**: Peer Consensus Layer with user-as-validator model
- **XVSM**: Virtual State Machine with Verkle trees and WASM execution
- **XSC**: Storage and Compute with sharding and erasure coding

All commands use **XMBL modules** - no mocks or fallbacks. The CLI requires all modules to be available and will exit with an error if any module cannot be loaded.

## Output Format

All commands output JSON for easy parsing and integration with other tools. Use `jq` for filtering:

```bash
xmbl identity list | jq '.[0]'
xmbl consensus stats mempool | jq '.rawTx'
```

## Error Handling

Commands exit with non-zero status codes on error and print error messages to stderr:

```bash
xmbl identity show nonexistent
# Error: ENOENT: no such file or directory, open 'keys/nonexistent.key'
# Exit code: 1
```

## Requirements

- Node.js (ES modules support)
- All XMBL modules available in parent directory:
  - `../xid/` - Identity module
  - `../xn/` - Networking module
  - `../xclt/` - Ledger module
  - `../xpc/` - Consensus module
  - `../xvsm/` - State machine module
  - `../xsc/` - Storage and compute module

## License

Part of the XMBL testnet project.
