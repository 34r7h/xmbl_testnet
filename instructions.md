# XMBL Testnet - Root Instructions

## Project Overview

XMBL (eXtensible Modular Blockchain Ledger) is a next-generation blockchain ecosystem designed as a superior alternative to Ethereum's EVM. The system provides:

- **Parallel State Processing**: 1k+ TPS through cubic geometry and sharded Merkle structures
- **Quantum Resistance**: MAYO post-quantum signatures for all identities, transactions, and state commitments
- **Browser-Friendly Runtime**: JavaScript/WebAssembly execution for mass adoption
- **Integrated Storage/Compute**: P2P redundant storage with WASM-based serverless compute
- **User-as-Validator Consensus**: True decentralization with transaction users validating their own transactions
- **AI-Powered App Generation**: Built-in capabilities for automated dApp creation

### Core Technology Stack

- **Runtime**: JavaScript (Node.js backend, React/Vue frontend)
- **Performance**: WebAssembly (WASM) for crypto and compute
- **Networking**: libp2p-js for P2P, WebTorrent for gossip
- **Storage**: LevelDB for state, P2P sharding for distributed storage
- **Cryptography**: MAYO signatures (C ported to WASM via Emscripten)
- **Visualization**: Three.js for 3D cubic state rendering
- **Geometric Cryptography**: 3D coordinate system with fractal addressing for transaction mapping and permission verification

### Benefits Over EVM

1. **No Gas Bottlenecks**: Parallel processing eliminates sequential execution limits
2. **Quantum-Safe**: Post-quantum cryptography from day one
3. **P2P Scalability**: Distributed storage and compute scale horizontally
4. **Browser Native**: No need for browser extensions for basic operations
5. **True Decentralization**: Users validate their own transactions, not centralized miners/validators

## Module Coordination

### Dependency Graph

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

### Module Responsibilities

- **xid**: Quantum-resistant identity and signature system
- **xn**: P2P networking, discovery, libp2p-js, WebTorrent gossip
- **xclt**: Cubic ledger with 3D geometry for state organization and geometric cryptography (coordinates, vectors, fractal addressing)
- **xvsm**: WASM-powered state machine with Verkle tree diffs
- **xpc**: Peer Consensus Layer with user-as-validator model
- **xsc**: P2P storage (sharding/erasure coding) and WASM compute
  - **TODO**: Implement encrypted message mechanism for delivering final transaction coordinates/vectors to users (encrypted with their public keys) when higher-dimensional cubes are finalized
- **xcli**: Command-line interface for all system operations
- **xv**: 3D visualization of system state and processes
- **xsim**: End-to-end system simulator with random behaviors
- **xbe**: Browser extension wallet and node
- **xda**: Electron desktop app wallet and node

## Stitching Together

### Monorepo Setup

Use npm workspaces for dependency management:

```json
{
  "name": "xmbl-testnet",
  "workspaces": [
    "xcli",
    "xclt",
    "xid",
    "xn",
    "xpc",
    "xsc",
    "xsim",
    "xv",
    "xvsm",
    "xbe",
    "xda"
  ]
}
```

### Core Integration

Create a `core/` directory with `index.js` that composes all modules:

```javascript
import { XID } from 'xid';
import { XN } from 'xn';
import { XCLT } from 'xclt';
import { XVSM } from 'xvsm';
import { XPC } from 'xpc';
import { XSC } from 'xsc';

export class XMBLCore {
  constructor(config) {
    this.xid = new XID(config.crypto);
    this.xn = new XN(config.network);
    this.xclt = new XCLT({ xid: this.xid, xn: this.xn });
    this.xvsm = new XVSM({ xclt: this.xclt });
    this.xpc = new XPC({ xclt: this.xclt, xn: this.xn });
    this.xsc = new XSC({ xn: this.xn, xpc: this.xpc });
  }
  
  async start() {
    await this.xid.init();
    await this.xn.start();
    await this.xclt.init();
    await this.xvsm.init();
    await this.xpc.start();
    await this.xsc.start();
  }
}
```

### Inter-Module Communication

Use EventEmitter pattern for loose coupling:

```javascript
// Each module extends EventEmitter
import { EventEmitter } from 'events';

export class XCLT extends EventEmitter {
  async addTransaction(tx) {
    // Process transaction
    this.emit('transaction:added', tx);
  }
}

// Other modules listen
xclt.on('transaction:added', (tx) => {
  xpc.processTransaction(tx);
});
```

### Progress Tracking

The root `src/App.vue` application tracks module development status:

- Test coverage percentage
- Integration readiness (red/yellow/green)
- Next steps for each module
- Real-time updates from test runs

## Deployment

### Browser Extension (xbe)

**Technology**: WebExtension APIs, webpack bundling

**Structure**:
- `background/`: Background script running P2P node
- `popup/`: Vue 3 UI for CLI and visualizer
- `content/`: Content script for dApp injection
- `manifest.json`: WebExtension manifest

**Build**:
```bash
cd xbe
npm run build:extension
```

**Features**:
- Full XMBL node in background
- Wallet functionality (key management, tx signing)
- Popup UI for transactions and queries
- dApp interaction via content scripts

### Electron App (xda)

**Technology**: Electron, electron-builder, Vue 3

**Structure**:
- `main/`: Electron main process (Node.js)
- `renderer/`: Vue 3 renderer process
- `preload/`: Preload scripts for secure IPC

**Build**:
```bash
cd xda
npm run build:electron
npm run package
```

**Features**:
- Full desktop node capabilities
- Wallet with key management
- 3D visualizer integration
- System tray integration

### Installable Versions

**npm Packages**:
```bash
npm install xmbl-cli      # CLI tool
npm install xmbl-core     # Core library
npm install xmbl-browser  # Browser polyfills (WASM, libp2p)
```

**Install Scripts**:
- `xmbl init`: Initialize new node
- `xmbl start`: Start local node
- `xmbl wallet create`: Create new wallet
- `xmbl tx send`: Send transaction

## Overall Development Steps

### Phase 1: Foundation (Weeks 1-2)

1. **Monorepo Setup**
   - Configure npm workspaces
   - Set up Jest for testing
   - Configure ESLint/Prettier
   - Set up CI/CD with GitHub Actions

2. **Core Dependencies**
   - Port MAYO C to WASM (xid)
   - Set up libp2p-js networking (xn)
   - Configure LevelDB for state (xclt)

### Phase 2: Core Modules (Weeks 3-6)

3. **Parallel Module Development** (TDD)
   - xid: Identity and signatures
   - xn: Networking layer
   - xclt: Cubic ledger
   - xvsm: State machine
   - xpc: Consensus layer
   - xsc: Storage and compute

4. **Integration Testing**
   - Module-to-module integration tests
   - End-to-end transaction flow
   - Consensus mechanism validation

### Phase 3: Tools & Interfaces (Weeks 7-8)

5. **Development Tools**
   - xcli: Command-line interface
   - xv: 3D visualizer
   - xsim: System simulator

6. **User Interfaces**
   - xbe: Browser extension
   - xda: Desktop app

### Phase 4: Testnet Deployment (Weeks 9-10)

7. **Testnet Setup**
   - Deploy 4-6 nodes on cloud VMs
   - Configure network topology
   - Initialize genesis state

8. **Testing & Monitoring**
   - Run xsim for stress testing
   - Monitor with xv visualizer
   - Collect metrics and logs

### Phase 5: Documentation & Polish (Weeks 11-12)

9. **Documentation**
   - JSDoc for all modules
   - API documentation
   - User guides

10. **Optimization**
    - Performance tuning
    - Security audits
    - Final integration testing

## Best Practices

### Code Quality

- **ESLint**: Enforce code style (Airbnb config)
- **Prettier**: Automatic code formatting
- **TypeScript**: Consider gradual migration for type safety
- **JSDoc**: Document all public APIs

### Testing

- **TDD**: Red-green-refactor cycles
- **Coverage**: 90%+ for all modules
- **Unit Tests**: Jest for individual functions
- **Integration Tests**: Test module interactions
- **E2E Tests**: Full system workflows

### CI/CD

- **GitHub Actions**: Automated testing on PR
- **Coverage Reports**: Codecov integration
- **Automated Releases**: Semantic versioning
- **Dependency Updates**: Dependabot configuration

### Security

- **Audit Dependencies**: `npm audit` regularly
- **Key Management**: Secure key storage (never log keys)
- **Input Validation**: Validate all external inputs
- **Rate Limiting**: Prevent DoS attacks

### Performance

- **WASM**: Use for crypto and compute-heavy operations
- **Parallel Processing**: Leverage cubic geometry for parallelism
- **Caching**: Cache frequently accessed state
- **Profiling**: Regular performance profiling

## Terminal and Browser Monitoring

### Terminal Checks

All modules must support terminal output for:
- **Console Logs**: Structured logging with levels (debug, info, warn, error)
- **Progress Indicators**: Real-time progress for long operations
- **Error Messages**: Clear, actionable error messages
- **Test Output**: Jest test results and coverage

**Screenshot Requirements**:
- Capture terminal output for test runs
- Document CLI command outputs
- Show error states and recovery

### Browser Checks

For browser-based modules (xbe, xda renderer, xv):
- **Console Logs**: Browser DevTools console output
- **Network Tab**: Monitor WebSocket and HTTP requests
- **Performance Tab**: Profile WASM execution
- **Application Tab**: Check storage and cache

**Screenshot Requirements**:
- Capture browser console for debugging
- Document UI states and interactions
- Show network activity in DevTools
- Capture visualizer 3D renderings

## Module Development Status

Track in `src/App.vue`:

```javascript
const moduleStatus = {
  xid: { tests: 0, coverage: 0, ready: false, nextSteps: [] },
  xn: { tests: 0, coverage: 0, ready: false, nextSteps: [] },
  xclt: { tests: 0, coverage: 0, ready: false, nextSteps: [] },
  // ... all modules
};
```

Update status after each test run and integration milestone.

