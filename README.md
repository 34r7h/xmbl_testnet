# XMBL Testnet
**eXtensible Modular Blockchain Ledger - Testnet (Alpha)**

XMBL is a next-generation blockchain ecosystem designed as a superior alternative to Ethereum's EVM, featuring parallel state processing, quantum-resistant cryptography, and a revolutionary 3D geometric ledger structure.

## Table of Contents

- [Overview](#overview)
- [Core Technology](#core-technology)
- [System Architecture](#system-architecture)
- [Module Specifications](#module-specifications)
- [Geometric Cryptography](#geometric-cryptography)
- [Consensus Mechanism](#consensus-mechanism)
- [Transaction Types](#transaction-types)
- [Performance Characteristics](#performance-characteristics)
- [Development Status](#development-status)

## Overview

XMBL provides:

- **Parallel State Processing**: 1k+ TPS through cubic geometry and sharded Merkle structures
- **Quantum Resistance**: MAYO post-quantum signatures for all identities, transactions, and state commitments
- **Browser-Friendly Runtime**: JavaScript/WebAssembly execution for mass adoption
- **Integrated Storage/Compute**: P2P redundant storage with WASM-based serverless compute
- **User-as-Validator Consensus**: True decentralization with transaction users validating their own transactions
- **Geometric Cryptography**: 3D coordinate system with fractal addressing for transaction mapping and permission verification

### Benefits Over EVM

1. **No Gas Bottlenecks**: Parallel processing eliminates sequential execution limits
2. **Quantum-Safe**: Post-quantum cryptography from day one
3. **P2P Scalability**: Distributed storage and compute scale horizontally
4. **Browser Native**: No need for browser extensions for basic operations
5. **True Decentralization**: Users validate their own transactions, not centralized miners/validators

## Core Technology

### Technology Stack

- **Runtime**: JavaScript (Node.js backend, React/Vue frontend)
- **Performance**: WebAssembly (WASM) for crypto and compute
- **Networking**: libp2p-js for P2P, WebTorrent for gossip
- **Storage**: LevelDB for state, P2P sharding for distributed storage
- **Cryptography**: MAYO signatures (C ported to WASM via Emscripten)
- **Visualization**: Three.js for 3D cubic state rendering

## System Architecture

### Module Dependency Graph

```
xid (MAYO signatures)
  ↓
xclt (Cubic Ledger) ← xn (Networking)
  ↓
xvsm (Virtual State Machine)
  ↓
xpc (Peer Consensus) ← xn
  ↓
xsc (Storage & Compute) ← xn
  ↓
xcli (CLI) ← all modules
xv (Visualizer) ← all modules
xsim (Simulator) ← all modules
xbe (Browser Extension) ← all modules
xda (Desktop App) ← all modules
```

### Module Integration

All modules communicate via EventEmitter pattern for loose coupling. The `core/index.js` module composes all system modules into a unified `XMBLCore` class.

## Module Specifications

### XID - Identity & Cryptography

**Purpose**: Quantum-resistant identity and signature system using MAYO post-quantum cryptography.

**Key Features**:
- MAYO signature scheme (C ported to WASM via Emscripten)
- Key pair generation (public/private keys)
- Transaction signing and verification
- Address derivation from public keys
- Browser-compatible WASM implementation

**Source**: MAYO-C from https://github.com/PQCMayo/MAYO-C

### XN - Networking

**Purpose**: P2P networking layer for node discovery and communication.

**Key Features**:
- libp2p-js integration for peer-to-peer networking
- WebTorrent for gossip protocol
- Node discovery and peer management
- Network topology management
- Message routing and propagation

### XCLT - Cubic Ledger Technology

**Purpose**: Hierarchical 3D cubic ledger structure for transaction organization.

**Key Concepts**:
- **Block**: Fundamental unit (1×1×1) representing a single transaction
- **Face**: 3×3 grid of 9 units (blocks at Level 1, cubes at Level 2+)
- **Cube**: Composed of 3 faces, containing 27 units total
- **Placement Logic**: Digital root-based deterministic placement at all hierarchical levels

**Hierarchical Structure**:
- **Level 1 (Atomic Cube)**: 27 blocks = 3×3×3
- **Level 2 (Super-Cube)**: 729 blocks = 9×9×9 (27 atomic cubes)
- **Level 3 (Mega-Cube)**: 19,683 blocks = 27×27×27 (27 super-cubes)
- **Level N**: 3^(3N) blocks = (3^N)×(3^N)×(3^N)

**Placement Algorithm**:
- Unit placement in face: Digital root of unit ID determines position (0-8) in 3×3 grid
- Face placement in cube: Unit ID modulo 3 determines face index (0-2)
- Same algorithm works recursively at all levels (dimension-agnostic)

**Transaction Processing**:
- Transactions hashed (SHA-256) to generate block ID
- Digital root calculated from transaction data + average validator timestamp
- Block placed deterministically in cubic structure based on hash and digital root
- Coordinates and vectors calculated relative to system origin

### XVSM - Virtual State Machine

**Purpose**: WASM-powered state machine with sparse Verkle tree diffs.

**Key Features**:
- Sparse Verkle tree structure for efficient state storage
- State diffs instead of full state snapshots
- WASM execution environment for smart contracts
- State assembly from diffs on-demand
- Proof generation for state values

**Architecture**:
- State organized as sparse Verkle tree
- Only state changes (diffs) stored
- Full state assembled by requesting diffs from nodes
- Efficient for parallel processing and sharding

### XPC - Peer Consensus Layer

**Purpose**: User-as-validator consensus mechanism with multi-stage mempool workflow.

**Key Innovation**: Transaction users validate their own transactions, eliminating need for centralized validators/miners.

**Mempool Workflow** (5 stages):

1. **raw_tx_mempool**: Initial transaction entries from users
2. **validation_tasks_mempool**: Tasks assigned to transaction users for validation
3. **locked_utxo_mempool**: UTXOs locked to prevent double-spending
4. **processing_tx_mempool**: Transactions moving through consensus validation
5. **tx_mempool**: Finalized transactions ready for ledger inclusion

**Consensus Process**:

1. User submits transaction to leader node with fee and stake
2. Leader hashes transaction, creates raw_tx_mempool entry, locks UTXOs
3. Leader gossips transaction to 3 other leaders (WebTorrent)
4. Validation tasks created and assigned to transaction user
5. User completes validation tasks (signature verification, spending power)
6. Validators report completion timestamps to leaders
7. When required validations met, transaction moves to processing_tx_mempool
8. Final validation tasks (chain-specific, e.g., digital root calculation)
9. Transaction finalized and added to tx_mempool for ledger inclusion

**Leader Election**:
- Nodes send pulse every 20 seconds to family nodes
- Uptime and response time tracked in uptime_mempool
- Every 2 hours, nodes broadcast uptime data
- Leaders elected based on highest uptime and fastest response time
- 3 rounds of run-off voting for leader selection
- Leader count determined by validation_task_mempool load
- Leaders rotate every 4 hours (configurable)

**Stake & Fees**:
- Users provide stake (0.2 coins default) and fee (0.1 coins default)
- Stake and change returned to user on transaction finality
- Fees distributed to validators and leaders

### XSC - Storage & Compute

**Purpose**: P2P redundant storage with WASM-based serverless compute.

**Key Features**:
- Data sharding with erasure coding for redundancy
- Distributed storage across P2P network
- WASM-based serverless compute functions
- Fair-market pricing for storage and compute resources
- Node availability testing and verification
- Periodic payment distribution via XMBL transactions

**Storage**:
- Data split into shards (default: 4 data shards)
- Parity shards for redundancy (default: 2 parity shards)
- Shards distributed across storage nodes
- Erasure coding enables recovery from partial shard loss

**Compute**:
- WASM functions executed on compute nodes
- Function execution tracked and priced
- Results returned to requesters
- Payment via XMBL transactions

**TODO**: Implement encrypted message delivery mechanism for secure coordinate distribution to users when higher-dimensional cubes are finalized (coordinates encrypted with user's public key).

### XCLI - Command Line Interface

**Purpose**: Comprehensive CLI for all XMBL system operations.

**Command Categories**:
- `identity`: Identity management (create, list, show, sign, verify)
- `tx`: Transaction operations (create, sign, submit)
- `ledger`: Ledger queries (block get, cube list, state root)
- `consensus`: Consensus operations (submit, raw-tx list, stats, leader elect)
- `state`: State machine operations (set, get, root, proof generate)
- `storage`: Storage operations (store, node status, pricing)
- `network`: Network operations (start, status, peers)

**Features**:
- JSON output for easy parsing
- Real-time streaming for monitoring
- Integration with all XMBL modules
- Export capabilities (JSON, CSV, binary)

### XV - Visualizer

**Purpose**: Real-time 3D visualization of system state and processes.

**Features**:
- Three.js-based 3D rendering of cubic ledger structure
- Real-time block and cube visualization
- State machine visualization
- Consensus mempool visualization
- Storage and compute activity visualization
- Block explorer for transaction queries
- Minimal information display for zk proofs

### XSIM - System Simulator

**Purpose**: End-to-end system simulator for testing and development.

**Modes**:
- **Deterministic Mode**: Predictable behavior for E2E tests
- **Random Mode**: Chaotic behavior for stress testing

**Simulated Activities**:
- Identity creation
- Transaction submission and processing
- Validation workflows
- Storage operations
- Compute operations
- State machine diff transactions
- State assembly from diffs
- All system interactions

**Configuration**:
- Initial identities count
- Transaction rate (tx/s)
- State diff rate
- Storage operation rate
- Compute operation rate
- Real module integration option

### XBE - Browser Extension

**Purpose**: Full-featured browser extension wallet and node.

**Features**:
- Full XMBL node running in background
- Wallet functionality (key management, transaction signing)
- Popup UI for transactions and queries
- dApp interaction via content scripts
- WebExtension APIs integration
- Webpack bundling

**Technology**: WebExtension APIs, Vue 3, webpack

### XDA - Desktop Application

**Purpose**: Full-featured Electron desktop app wallet and node.

**Features**:
- Full desktop node capabilities
- Wallet with key management
- 3D visualizer integration
- System tray integration
- Electron main/renderer process architecture

**Technology**: Electron, electron-builder, Vue 3

## Geometric Cryptography

XMBL uses a revolutionary 3D geometric coordinate system for transaction addressing and cryptographic proofs.

### Coordinate System

**Origin**: First cube's middle block (face index 1, position 4 - center of 3×3 grid) at coordinates (0, 0, 0).

**Coordinate Calculation**:
- Every transaction assigned x, y, z coordinates relative to origin
- Block coordinates within cube: calculated from face index and position
- Cube coordinates in hierarchy: calculated from cube index and level
- Absolute coordinates: block coordinates + cube coordinates

**Vector System**:
- Vector from origin to block calculated for each transaction
- Includes magnitude and normalized direction vector
- Enables geometric proofs and permission verification

### Fractal Addressing

**Hierarchical Path**: Completed cubes have coordinates relative to higher-dimensional cubes.

**Address Format**: `[level1, level2, ..., block]`
- Each level contains cube index, face index, and position
- Enables efficient navigation through hierarchical structure
- Supports infinite hierarchical growth

### Geometric Proofs

**Permission Verification**: Coordinate relationships enable cryptographic proofs:
- Transaction access verification through coordinate relationships
- Permission proofs based on geometric proximity
- Efficient verification without full state traversal

### Private Mapping

**Encrypted Coordinates**: Final coordinates encrypted with user's public key for secure transaction access.

**TODO**: Implement encrypted message delivery mechanism in XSC for secure coordinate distribution to users when higher-dimensional cubes are finalized.

## Consensus Mechanism

### User-as-Validator Model

**Revolutionary Approach**: Transaction users validate their own transactions, eliminating centralized validators/miners.

**Benefits**:
- True decentralization (no mining pools or validator cartels)
- Reduced latency (users directly involved in validation)
- Lower costs (no miner/validator fees)
- Increased security (users have direct stake in transaction validity)

### Validation Workflow

1. **Transaction Submission**: User submits transaction with fee and stake to leader
2. **Initial Processing**: Leader hashes transaction, creates raw_tx entry, locks UTXOs
3. **Gossip Propagation**: Leader gossips to 3 other leaders (WebTorrent)
4. **Task Assignment**: Validation tasks created and assigned to transaction user
5. **User Validation**: User completes tasks (signature, spending power verification)
6. **Validator Reporting**: Validators report completion with timestamps
7. **Consensus Check**: When required validations met, transaction moves to processing
8. **Final Validation**: Chain-specific validation (e.g., digital root calculation)
9. **Finalization**: Transaction finalized and added to ledger

### Leader Election

**Process**:
- Nodes maintain uptime_mempool tracking peer availability
- Pulse messages every 20 seconds
- Uptime and response time metrics collected
- Every 2 hours: uptime data broadcast
- Leaders elected based on performance metrics
- 3 rounds of run-off voting
- Leader count based on mempool load
- 4-hour rotation cycle

**Metrics**:
- Uptime percentage
- Average response time
- Network participation

## Transaction Types

XCLT supports five transaction types (defined in `tokens.json`):

### 1. Identity Transaction
- **Type**: `identity`
- **Purpose**: Identity registration - signing the public key
- **Required Fields**: `publicKey`, `signature`
- **Optional Fields**: `timestamp`

### 2. UTXO Transaction
- **Type**: `utxo`
- **Purpose**: Coin/token transfer
- **Required Fields**: `from`, `to`, `amount`
- **Optional Fields**: `fee`, `stake`, `timestamp`

### 3. Token Creation Transaction
- **Type**: `token_creation`
- **Purpose**: XMBL NFT/token creation
- **Required Fields**: `creator`, `tokenId`
- **Optional Fields**: `metadata`, `supply`, `timestamp`

### 4. Contract Transaction
- **Type**: `contract`
- **Purpose**: Smart contract deployment (hash + ABI)
- **Required Fields**: `contractHash`, `abi`
- **Optional Fields**: `deployer`, `bytecode`, `timestamp`

### 5. State Diff Transaction
- **Type**: `state_diff`
- **Purpose**: State machine function execution (function + args)
- **Required Fields**: `function`, `args`
- **Optional Fields**: `contractAddress`, `caller`, `timestamp`

## Performance Characteristics

### Throughput
- **Target**: 1,000+ transactions per second (TPS)
- **Achieved Through**: Parallel processing via cubic geometry
- **Bottleneck Elimination**: No sequential execution limits

### Scalability
- **Horizontal Scaling**: P2P network scales with node count
- **Storage Scaling**: Sharded storage with erasure coding
- **Compute Scaling**: Distributed WASM execution
- **Infinite Growth**: Hierarchical cubic structure supports unlimited transactions

### Latency
- **User-as-Validator**: Direct user involvement reduces latency
- **Parallel Processing**: Multiple transactions processed simultaneously
- **Gossip Protocol**: Efficient mempool propagation

### Storage Efficiency
- **Sparse Verkle Trees**: Only state diffs stored
- **Erasure Coding**: Redundant storage with minimal overhead
- **Hierarchical Structure**: Efficient organization and retrieval

## Development Status

### Module Status

**Core Modules**:
- ✅ **XID**: Identity and MAYO signatures (WASM implementation)
- ✅ **XN**: P2P networking (libp2p-js, WebTorrent)
- ✅ **XCLT**: Cubic Ledger Technology (Level 1-3+ implemented)
- ✅ **XVSM**: Virtual State Machine (Verkle tree diffs)
- ✅ **XPC**: Peer Consensus Layer (user-as-validator workflow)
- ✅ **XSC**: Storage & Compute (sharding, erasure coding, WASM compute)

**Tool Modules**:
- ✅ **XCLI**: Command-line interface (all commands implemented)
- ✅ **XV**: 3D visualizer (Three.js, real-time rendering)
- ✅ **XSIM**: System simulator (deterministic and random modes)

**Interface Modules**:
- ✅ **XBE**: Browser extension (WebExtension, Vue 3)
- ✅ **XDA**: Desktop app (Electron, Vue 3)

### Integration Status

- ✅ Module-to-module integration tests
- ✅ End-to-end transaction flow
- ✅ Consensus mechanism validation
- ✅ Real-time visualization integration
- ✅ Simulator with real modules

### Known TODOs

1. **XSC**: Implement encrypted message delivery mechanism for secure coordinate distribution to users when higher-dimensional cubes are finalized (coordinates encrypted with user's public key)

## License

Part of the XMBL testnet project (Alpha).
