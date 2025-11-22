<!-- 2973bd4e-9651-489b-ab8e-9ef8c9540bff 81885bf1-e796-4c40-9411-1060312a5f33 -->
# XMBL Parallel Development Coordination Plan

## Dependency Analysis

### Foundation Layer (Phase 1) - No Dependencies

- **xid**: MAYO signatures (WASM port)
- **xn**: P2P networking (libp2p-js, WebTorrent)

**Can develop in parallel immediately**

### Layer 1 (Phase 2) - Depends on Foundation

- **xclt**: Cubic Ledger (depends on: xid, xn)

**Requires: xid (signature verification) + xn (block propagation)**

### Layer 2 (Phase 3) - Depends on Layer 1

- **xvsm**: Virtual State Machine (depends on: xclt)
- **xpc**: Peer Consensus (depends on: xn, xclt, xid)

**Can develop in parallel after xclt is ready**

### Layer 3 (Phase 4) - Depends on Layer 2

- **xsc**: Storage & Compute (depends on: xn, xpc, xclt)

**Requires: xpc (for payment consensus) + xclt (for payment recording)**

### Layer 4 (Phase 5) - Depends on All Previous

- **xcli**: CLI interface (depends on: all modules)
- **xv**: 3D Visualizer (depends on: all modules)
- **xsim**: System Simulator (depends on: all modules)
- **xbe**: Browser Extension (depends on: all modules)
- **xda**: Desktop App (depends on: all modules)

**Can develop in parallel after core modules are ready**

## Parallel Development Schedule

### Phase 1: Foundation (Weeks 1-2)

**Parallel Development:**

- AI-1: xid module (MAYO WASM port, key generation, signing/verification)
- AI-2: xn module (libp2p setup, peer discovery, message routing)

**Checkpoint Requirements:**

- xid: Basic key generation and signature verification working (minimal interface)
- xn: Basic node creation, peer connection, message sending (minimal interface)

**Integration Test:** None required (foundation modules)

### Phase 2: Core Ledger (Weeks 3-4)

**Sequential Development:**

- AI-3: xclt module (waits for xid + xn checkpoints)

**Checkpoint Requirements:**

- xid: Full API stable (Identity class, KeyManager, batch operations)
- xn: Full API stable (XNNode, PubSub, GossipManager)
- xclt: Digital root, block/face/cube structures, basic ledger operations

**Integration Test:** xclt can verify signatures (xid) and broadcast blocks (xn)

### Phase 3: State & Consensus (Weeks 5-6)

**Parallel Development:**

- AI-4: xvsm module (waits for xclt checkpoint)
- AI-5: xpc module (waits for xid + xn + xclt checkpoints)

**Checkpoint Requirements:**

- xclt: Full ledger API stable (addTransaction, getBlock, getCubes)
- xvsm: Verkle tree, state diffs, WASM execution working
- xpc: Mempool structure, validation tasks, leader election working

**Integration Test:** xpc can submit transactions to xclt, xvsm can commit state to xclt

### Phase 4: Storage & Compute (Week 7)

**Sequential Development:**

- AI-6: xsc module (waits for xpc + xclt checkpoints)

**Checkpoint Requirements:**

- xpc: Full consensus workflow stable (submitTransaction, completeValidation)
- xsc: Storage sharding, WASM compute, market pricing working

**Integration Test:** xsc can submit payment transactions via xpc

### Phase 5: Tools & Interfaces (Weeks 8-9)

**Parallel Development:**

- AI-7: xcli module (all core modules ready)
- AI-8: xv module (all core modules ready)
- AI-9: xsim module (all core modules ready)
- AI-10: xbe module (all core modules ready)
- AI-11: xda module (all core modules ready)

**Checkpoint Requirements:**

- All core modules (xid, xn, xclt, xvsm, xpc, xsc) at 90%+ coverage
- Integration tests passing between dependent modules

**Integration Test:** Full end-to-end transaction flow through all modules

## Root AI Coordination Strategy

### Progress Tracking Mechanism

**File:** `src/App.vue` (already enhanced with progress tracking)

**Update Frequency:** After each checkpoint and daily progress reviews

**Data Sources:**

1. Jest test results: Parse `coverage/coverage-summary.json` from each module
2. Test counts: Count test files in `__tests__/` directories
3. Readiness calculation: Based on completed steps in `instructions.md`

### Checkpoint Validation Process

**Before Phase 2 starts:**

```bash
# Root AI validates Phase 1 checkpoints
cd xid && npm test && npm run coverage
cd xn && npm test && npm run coverage
# Verify: xid exports Identity class, xn exports XNNode class
```

**Before Phase 3 starts:**

```bash
# Root AI validates Phase 2 checkpoint
cd xclt && npm test && npm run coverage
# Verify: xclt can import and use xid.Identity, xn.XNNode
```

**Before Phase 4 starts:**

```bash
# Root AI validates Phase 3 checkpoints
cd xvsm && npm test && npm run coverage
cd xpc && npm test && npm run coverage
# Verify: Integration tests pass
```

**Before Phase 5 starts:**

```bash
# Root AI validates Phase 4 checkpoint
cd xsc && npm test && npm run coverage
# Verify: All core modules integration tests pass
```

### Daily Progress Review (Root AI Tasks)

**Every 24 hours, Root AI:**

1. **Scans all module directories** for:

   - New test files in `__tests__/`
   - Updated `package.json` (new dependencies)
   - Coverage reports in `coverage/`

2. **Updates `src/App.vue`** with:

   - Test counts from `__tests__/` directory
   - Coverage percentages from `coverage/coverage-summary.json`
   - Readiness percentage (based on completed steps in instructions.md)
   - Status: pending → started → in-progress → ready

3. **Checks dependency readiness:**

   - Verifies dependent modules meet checkpoint requirements
   - Updates nextSteps for blocked modules
   - Identifies integration blockers

4. **Generates progress report:**

   - Module status summary
   - Blockers and dependencies
   - Next phase readiness

### Integration Milestone Management

**After each phase completion:**

1. Root AI runs integration tests between dependent modules
2. Updates integration status in `src/App.vue`
3. Documents API contracts between modules
4. Creates integration test suite in `core/__tests__/`

**Integration Test Structure:**

```
core/
  __tests__/
    integration/
      phase1.test.js      # xid + xn integration
      phase2.test.js      # xclt + xid + xn integration
      phase3.test.js      # xvsm + xpc + xclt integration
      phase4.test.js      # xsc + xpc + xclt integration
      phase5.test.js      # Full system integration
```

### Communication Protocol

**Module AI → Root AI:**

- Commit messages with `[MODULE]` prefix (e.g., `[XID] Add key generation tests`)
- Update `instructions.md` with completed steps
- Tag commits with phase number (e.g., `phase1`, `phase2`)

**Root AI → Module AI:**

- Daily progress review comments
- Checkpoint approval/rejection
- Dependency status updates
- Integration test results

### Blocking Resolution

**If a module is blocked:**

1. Root AI identifies blocker in daily review
2. Updates module status to "blocked" in `src/App.vue`
3. Notifies blocking module AI to prioritize blocker resolution
4. Suggests workarounds or mock interfaces for unblocked development

**Mock Interface Strategy:**

- Module AIs can create mock implementations of dependencies
- Example: xclt can use mock xid.Identity until real xid is ready
- Root AI validates mocks are replaced with real implementations before integration

## Critical Path Items

**Must complete in order:**

1. xid + xn (foundation) → Blocks everything
2. xclt (core ledger) → Blocks xvsm, xpc
3. xpc (consensus) → Blocks xsc
4. All core modules → Blocks tools/interfaces

**Can be delayed without blocking:**

- xvsm (can develop after xclt, but not critical for xpc)
- xsim (testing tool, can use mocks)
- xv (visualization tool, can use mocks)

## Success Criteria

**Phase 1 Complete:**

- xid: 90%+ coverage, all tests passing, WASM working
- xn: 90%+ coverage, all tests passing, libp2p working

**Phase 2 Complete:**

- xclt: 90%+ coverage, integration tests with xid+xn passing

**Phase 3 Complete:**

- xvsm: 90%+ coverage, integration with xclt passing
- xpc: 90%+ coverage, integration with xid+xn+xclt passing

**Phase 4 Complete:**

- xsc: 90%+ coverage, integration with xpc+xclt passing

**Phase 5 Complete:**

- All tools: 90%+ coverage, full system integration tests passing

## Risk Mitigation

**Dependency Delays:**

- Use mock interfaces for parallel development
- Prioritize critical path modules (xid, xn, xclt, xpc)
- Daily blocker identification and resolution

**Integration Failures:**

- Run integration tests after each phase
- Maintain API contract documentation
- Version module APIs for compatibility

**Test Coverage Gaps:**

- Enforce 90%+ coverage before phase completion
- Root AI flags modules below threshold
- Block phase progression until coverage met

### To-dos

- [ ] Phase 1: Develop xid module (MAYO WASM port, key generation, signing/verification) - Foundation layer, no dependencies
- [ ] Phase 1: Develop xn module (libp2p setup, peer discovery, message routing) - Foundation layer, no dependencies
- [ ] Root AI: Validate Phase 1 checkpoints - xid and xn APIs stable, basic functionality working
- [ ] Phase 2: Develop xclt module (cubic ledger) - Requires xid + xn checkpoints
- [ ] Root AI: Validate Phase 2 checkpoint - xclt integration with xid+xn passing
- [ ] Phase 3: Develop xvsm module (Verkle tree state machine) - Requires xclt checkpoint
- [ ] Phase 3: Develop xpc module (peer consensus) - Requires xid+xn+xclt checkpoints
- [ ] Root AI: Validate Phase 3 checkpoints - xvsm and xpc integration tests passing
- [ ] Phase 4: Develop xsc module (storage & compute) - Requires xpc+xclt checkpoints
- [ ] Root AI: Validate Phase 4 checkpoint - xsc integration with xpc+xclt passing
- [ ] Phase 5: Develop tools/interfaces (xcli, xv, xsim, xbe, xda) in parallel - Requires all core modules ready
- [ ] Root AI: Run end-to-end integration tests across all modules