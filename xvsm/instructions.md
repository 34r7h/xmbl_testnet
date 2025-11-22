# XVSM - XMBL Virtual State Machine Instructions

## Overview

XVSM implements the XMBL Virtual State Machine, a sparse Verkle tree of state diffs that can be assembled into full state by requesting nodes. The state machine executes app logic in WASM, manages shared state transitions in parallel shards, and provides efficient state proofs. This enables parallel processing and scalable state management.

## Fundamentals

### Key Concepts

- **Verkle Tree**: Sparse Merkle tree variant for efficient proofs
- **State Diffs**: Incremental state changes rather than full state
- **WASM Execution**: App logic runs in WebAssembly
- **Parallel Shards**: State partitioned across shards for parallelism
- **State Assembly**: Reconstruct full state from diffs on demand
- **State Proofs**: Efficient proofs for state queries

### Dependencies

- **verkle-tree**: Verkle tree implementation
- **wasmtime**: WASM runtime for execution
- **level**: LevelDB for state storage
- **xclt**: Ledger for state commitment

### Architectural Decisions

- **Sparse Storage**: Only store non-zero state values
- **Diff-Based**: Store diffs rather than full state snapshots
- **Lazy Assembly**: Assemble full state only when requested
- **Sharded State**: Partition state across shards for parallelism

## Development Steps

### Step 1: Project Setup

```bash
cd xvsm
npm init -y
npm install verkle-tree wasmtime level
npm install --save-dev jest @types/jest
```

### Step 2: Verkle Tree State Storage (TDD)

**Test First** (`__tests__/verkle-tree.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { VerkleStateTree } from '../src/verkle-tree';

describe('Verkle State Tree', () => {
  test('should create Verkle tree', () => {
    const tree = new VerkleStateTree();
    expect(tree).toBeDefined();
    expect(tree.root).toBeDefined();
  });

  test('should insert state value', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    const value = tree.get('key1');
    expect(value).toBe('value1');
  });

  test('should generate proof', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    const proof = tree.generateProof('key1');
    expect(proof).toBeDefined();
    expect(proof).toHaveProperty('root');
    expect(proof).toHaveProperty('path');
  });

  test('should verify proof', () => {
    const tree = new VerkleStateTree();
    tree.insert('key1', 'value1');
    const proof = tree.generateProof('key1');
    const isValid = VerkleStateTree.verifyProof('key1', 'value1', proof);
    expect(isValid).toBe(true);
  });
});
```

**Implementation** (`src/verkle-tree.js`):

```javascript
import { VerkleTree } from 'verkle-tree';
import { createHash } from 'crypto';

export class VerkleStateTree {
  constructor() {
    this.tree = new VerkleTree();
    this.state = new Map(); // key -> value
  }

  insert(key, value) {
    this.state.set(key, value);
    const keyHash = this._hashKey(key);
    const valueHash = this._hashValue(value);
    this.tree.insert(keyHash, valueHash);
  }

  get(key) {
    return this.state.get(key);
  }

  delete(key) {
    this.state.delete(key);
    const keyHash = this._hashKey(key);
    this.tree.delete(keyHash);
  }

  generateProof(key) {
    const keyHash = this._hashKey(key);
    const proof = this.tree.generateProof(keyHash);
    return {
      root: this.tree.root,
      path: proof.path,
      key: keyHash
    };
  }

  static verifyProof(key, value, proof) {
    const keyHash = this._hashKey(key);
    const valueHash = this._hashValue(value);
    return VerkleTree.verifyProof(keyHash, valueHash, proof.root, proof.path);
  }

  getRoot() {
    return this.tree.root;
  }

  _hashKey(key) {
    return createHash('sha256').update(key).digest();
  }

  _hashValue(value) {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    return createHash('sha256').update(valueStr).digest();
  }
}
```

### Step 3: State Diff Management (TDD)

**Test** (`__tests__/state-diff.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { StateDiff } from '../src/state-diff';

describe('State Diff', () => {
  test('should create state diff', () => {
    const diff = new StateDiff('tx1', { key1: 'value1' });
    expect(diff.txId).toBe('tx1');
    expect(diff.changes).toEqual({ key1: 'value1' });
  });

  test('should apply diff to state', () => {
    const state = { key1: 'old', key2: 'unchanged' };
    const diff = new StateDiff('tx1', { key1: 'new' });
    const newState = diff.apply(state);
    expect(newState.key1).toBe('new');
    expect(newState.key2).toBe('unchanged');
  });

  test('should merge diffs', () => {
    const diff1 = new StateDiff('tx1', { key1: 'value1' });
    const diff2 = new StateDiff('tx2', { key2: 'value2' });
    const merged = StateDiff.merge([diff1, diff2]);
    expect(merged.changes).toEqual({ key1: 'value1', key2: 'value2' });
  });
});
```

**Implementation** (`src/state-diff.js`):

```javascript
export class StateDiff {
  constructor(txId, changes) {
    this.txId = txId;
    this.timestamp = Date.now();
    this.changes = changes; // key -> new value
  }

  apply(state) {
    const newState = { ...state };
    for (const [key, value] of Object.entries(this.changes)) {
      newState[key] = value;
    }
    return newState;
  }

  static merge(diffs) {
    const merged = {};
    for (const diff of diffs) {
      Object.assign(merged, diff.changes);
    }
    return new StateDiff('merged', merged);
  }

  serialize() {
    return JSON.stringify({
      txId: this.txId,
      timestamp: this.timestamp,
      changes: this.changes
    });
  }

  static deserialize(data) {
    const obj = JSON.parse(data);
    return new StateDiff(obj.txId, obj.changes);
  }
}
```

### Step 4: WASM Execution (TDD)

**Test** (`__tests__/wasm-execution.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { WASMExecutor } from '../src/wasm-execution';

describe('WASM Execution', () => {
  test('should execute WASM function', async () => {
    const executor = new WASMExecutor();
    // Simple WASM module
    const wasmCode = new Uint8Array([/* WASM binary */]);
    const result = await executor.execute(wasmCode, 'process', { input: 'test' });
    expect(result).toBeDefined();
  });

  test('should handle state transitions', async () => {
    const executor = new WASMExecutor();
    const initialState = { counter: 0 };
    const wasmCode = new Uint8Array([/* WASM binary */]);
    const newState = await executor.executeStateTransition(wasmCode, initialState, { increment: 1 });
    expect(newState.counter).toBe(1);
  });

  test('should isolate executions', async () => {
    const executor = new WASMExecutor();
    const wasmCode = new Uint8Array([/* WASM binary */]);
    const result1 = await executor.execute(wasmCode, 'process', {});
    const result2 = await executor.execute(wasmCode, 'process', {});
    // Results should be independent
  });
});
```

**Implementation** (`src/wasm-execution.js`):

```javascript
import { Engine, Module, Instance } from 'wasmtime';

export class WASMExecutor {
  constructor() {
    this.engine = new Engine();
  }

  async execute(wasmCode, functionName, input) {
    const module = await Module.fromBinary(this.engine, wasmCode);
    const instance = await Instance.fromModule(module);
    
    // Set up state
    const statePtr = this._allocateState(instance, input);
    
    // Execute function
    const func = instance.exports[functionName];
    if (!func) {
      throw new Error(`Function ${functionName} not found`);
    }
    
    const resultPtr = func(statePtr);
    
    // Read result
    const result = this._readState(instance, resultPtr);
    
    return result;
  }

  async executeStateTransition(wasmCode, currentState, input) {
    const module = await Module.fromBinary(this.engine, wasmCode);
    const instance = await Instance.fromModule(module);
    
    // Set current state
    const statePtr = this._allocateState(instance, currentState);
    const inputPtr = this._allocateState(instance, input);
    
    // Execute transition function
    const transition = instance.exports.transition;
    if (!transition) {
      throw new Error('Transition function not found');
    }
    
    const newStatePtr = transition(statePtr, inputPtr);
    const newState = this._readState(instance, newStatePtr);
    
    return newState;
  }

  _allocateState(instance, state) {
    // Allocate memory and write state
    const stateStr = JSON.stringify(state);
    const stateBytes = new TextEncoder().encode(stateStr);
    const ptr = instance.exports.malloc(stateBytes.length);
    const memory = new Uint8Array(instance.exports.memory.buffer);
    memory.set(stateBytes, ptr);
    return ptr;
  }

  _readState(instance, ptr) {
    // Read state from memory
    const memory = new Uint8Array(instance.exports.memory.buffer);
    // Read until null terminator or length
    const stateBytes = [];
    let offset = 0;
    while (memory[ptr + offset] !== 0 && offset < 10000) {
      stateBytes.push(memory[ptr + offset]);
      offset++;
    }
    const stateStr = new TextDecoder().decode(new Uint8Array(stateBytes));
    return JSON.parse(stateStr);
  }
}
```

### Step 5: State Sharding (TDD)

**Test** (`__tests__/sharding.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { StateShard } from '../src/sharding';

describe('State Sharding', () => {
  test('should create shard', () => {
    const shard = new StateShard(0, 4); // shard 0 of 4
    expect(shard.index).toBe(0);
    expect(shard.totalShards).toBe(4);
  });

  test('should assign key to shard', () => {
    const shard = new StateShard(0, 4);
    const key = 'user:alice:balance';
    const assignedShard = StateShard.getShardForKey(key, 4);
    expect(assignedShard).toBeGreaterThanOrEqual(0);
    expect(assignedShard).toBeLessThan(4);
  });

  test('should be deterministic', () => {
    const key = 'user:alice:balance';
    const shard1 = StateShard.getShardForKey(key, 4);
    const shard2 = StateShard.getShardForKey(key, 4);
    expect(shard1).toBe(shard2);
  });
});
```

**Implementation** (`src/sharding.js`):

```javascript
import { createHash } from 'crypto';

export class StateShard {
  constructor(index, totalShards) {
    this.index = index;
    this.totalShards = totalShards;
    this.state = new Map();
  }

  static getShardForKey(key, totalShards) {
    const hash = createHash('sha256').update(key).digest();
    const hashNum = hash.readUInt32BE(0);
    return hashNum % totalShards;
  }

  set(key, value) {
    this.state.set(key, value);
  }

  get(key) {
    return this.state.get(key);
  }

  delete(key) {
    this.state.delete(key);
  }

  getAllKeys() {
    return Array.from(this.state.keys());
  }
}
```

### Step 6: State Assembly (TDD)

**Test** (`__tests__/state-assembly.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { StateAssembler } from '../src/state-assembly';

describe('State Assembly', () => {
  test('should assemble state from diffs', () => {
    const assembler = new StateAssembler();
    const diffs = [
      { txId: 'tx1', changes: { key1: 'value1' } },
      { txId: 'tx2', changes: { key2: 'value2' } }
    ];
    const state = assembler.assemble(diffs);
    expect(state.key1).toBe('value1');
    expect(state.key2).toBe('value2');
  });

  test('should handle diff ordering', () => {
    const assembler = new StateAssembler();
    const diffs = [
      { txId: 'tx1', changes: { key1: 'value1' }, timestamp: 100 },
      { txId: 'tx2', changes: { key1: 'value2' }, timestamp: 200 }
    ];
    const state = assembler.assemble(diffs);
    // Later diff should override
    expect(state.key1).toBe('value2');
  });
});
```

**Implementation** (`src/state-assembly.js`):

```javascript
import { StateDiff } from './state-diff';

export class StateAssembler {
  constructor() {
    this.baseState = {};
  }

  assemble(diffs) {
    // Sort diffs by timestamp
    const sortedDiffs = diffs.sort((a, b) => a.timestamp - b.timestamp);
    
    // Apply diffs in order
    let state = { ...this.baseState };
    for (const diff of sortedDiffs) {
      state = diff.apply(state);
    }
    
    return state;
  }

  setBaseState(state) {
    this.baseState = state;
  }

  getStateAtTimestamp(diffs, timestamp) {
    const relevantDiffs = diffs.filter(d => d.timestamp <= timestamp);
    return this.assemble(relevantDiffs);
  }
}
```

## Interfaces/APIs

### Exported Classes

```javascript
export class VerkleStateTree {
  constructor();
  insert(key: string, value: any): void;
  get(key: string): any;
  delete(key: string): void;
  generateProof(key: string): Proof;
  static verifyProof(key: string, value: any, proof: Proof): boolean;
  getRoot(): string;
}

export class StateDiff {
  constructor(txId: string, changes: Record<string, any>);
  apply(state: Record<string, any>): Record<string, any>;
  static merge(diffs: StateDiff[]): StateDiff;
}

export class WASMExecutor {
  async execute(wasmCode: Uint8Array, functionName: string, input: any): Promise<any>;
  async executeStateTransition(wasmCode: Uint8Array, currentState: any, input: any): Promise<any>;
}

export class StateShard {
  constructor(index: number, totalShards: number);
  static getShardForKey(key: string, totalShards: number): number;
  set(key: string, value: any): void;
  get(key: string): any;
}
```

## Testing

### Test Scenarios

1. **Verkle Tree Operations**
   - Insert/get/delete
   - Proof generation
   - Proof verification

2. **State Diffs**
   - Diff creation
   - Diff application
   - Diff merging

3. **WASM Execution**
   - Function execution
   - State transitions
   - Isolation

4. **Sharding**
   - Key assignment
   - Shard operations
   - Deterministic assignment

5. **State Assembly**
   - Diff assembly
   - Ordering
   - Timestamp queries

### Coverage Goals

- 90%+ code coverage
- All state operations tested
- WASM execution edge cases
- Performance benchmarks

## Integration Notes

### Module Dependencies

- **xclt**: State commitments in ledger
- **xid**: Signature verification for state transitions

### Integration Pattern

```javascript
import { VerkleStateTree, StateDiff, WASMExecutor } from 'xvsm';
import { XCLT } from 'xclt';

const stateTree = new VerkleStateTree();
const executor = new WASMExecutor();

// Execute state transition
const diff = await executor.executeStateTransition(wasmCode, currentState, input);
stateTree.insert('key', diff.changes);

// Commit state root to ledger
const stateRoot = stateTree.getRoot();
await xclt.commitStateRoot(stateRoot);
```

## Terminal and Browser Monitoring

### Terminal Output

- **State Operations**: Log state changes
  ```javascript
  console.log(`State updated: ${key} = ${value}`);
  ```

- **WASM Execution**: Log execution timing
  ```javascript
  console.log(`WASM execution: ${functionName} in ${duration}ms`);
  ```

- **State Assembly**: Log assembly operations
  ```javascript
  console.log(`State assembled from ${diffCount} diffs`);
  ```

### Screenshot Requirements

Capture terminal output for:
- State tree operations
- WASM execution logs
- State assembly results
- Performance metrics

### Console Logging

- Log all state operations
- Include timing information
- Log WASM execution details
- Include state tree statistics
