# XPC - XMBL Peer Consensus Layer Instructions

## Overview

XPC implements the Peer Consensus Layer (PCL) with a revolutionary user-as-validator model. Transaction users validate their own transactions through a multi-stage mempool workflow. Leaders are elected every 4 hours based on uptime and response time, with gossip-based mempool propagation. This consensus mechanism eliminates the need for traditional miners/validators, achieving true decentralization.

## Fundamentals

### Key Concepts

- **User-as-Validator**: Transaction users validate their own transactions
- **Mempools**: Five-stage mempool workflow (raw_tx, validation_tasks, locked_utxo, processing_tx, tx)
- **Leaders**: Elected nodes that coordinate consensus (4-hour rotations)
- **Gossip Protocol**: WebTorrent-based gossip for mempool propagation
- **Validation Tasks**: Tasks assigned to transaction users for validation
- **Stake & Fees**: Users provide stake and fees for transaction processing

### Mempool Workflow

1. **raw_tx_mempool**: Initial transaction entries
2. **validation_tasks_mempool**: Tasks for transaction users to complete
3. **locked_utxo_mempool**: UTXOs locked to prevent double-spending
4. **processing_tx_mempool**: Transactions moving through consensus
5. **tx_mempool**: Finalized transactions ready for ledger inclusion

### Dependencies

- **xn**: Network communication and gossip
- **xclt**: Ledger for final transaction inclusion
- **xid**: Signature verification
- **level**: LevelDB for mempool persistence

### Architectural Decisions

- **Event-Driven**: Event emitters for mempool state changes
- **Gossip-Based**: WebTorrent for efficient mempool propagation
- **Leader Rotation**: 4-hour leader election cycles
- **Task Distribution**: Proportional task assignment based on mempool load

## Development Steps

### Step 1: Project Setup ✅

**Status**: Complete
- Dependencies installed (level, jest, @types/jest)
- Jest configuration for ES modules
- Test script configured

```bash
cd xpc
npm init -y
npm install level
npm install --save-dev jest @types/jest
```

### Step 2: Mempool Structure (TDD) ✅

**Status**: Complete
- Implemented `Mempool` class with all 5 stages
- Event-driven architecture with EventEmitter
- UTXO locking/unlocking functionality
- Duplicate transaction prevention
- Concurrent transaction handling
- **Tests**: 12 comprehensive tests covering all operations

**Test First** (`__tests__/mempool.test.js`):

```javascript
import { describe, test, expect, beforeEach } from 'jest';
import { Mempool } from '../src/mempool';

describe('Mempool', () => {
  let mempool;

  beforeEach(() => {
    mempool = new Mempool();
  });

  test('should create mempool with all stages', () => {
    expect(mempool.rawTx).toBeDefined();
    expect(mempool.validationTasks).toBeDefined();
    expect(mempool.lockedUtxo).toBeDefined();
    expect(mempool.processingTx).toBeDefined();
    expect(mempool.tx).toBeDefined();
  });

  test('should add transaction to raw_tx_mempool', () => {
    const tx = { to: 'bob', amount: 1.0, from: 'alice' };
    const txId = mempool.addRawTransaction('leader1', tx);
    expect(txId).toBeDefined();
    expect(mempool.rawTx.has('leader1')).toBe(true);
  });

  test('should lock UTXOs', () => {
    const utxos = ['utxo1', 'utxo2'];
    mempool.lockUtxos(utxos);
    expect(mempool.lockedUtxo.has('utxo1')).toBe(true);
    expect(mempool.lockedUtxo.has('utxo2')).toBe(true);
  });

  test('should unlock UTXOs', () => {
    mempool.lockUtxos(['utxo1']);
    mempool.unlockUtxos(['utxo1']);
    expect(mempool.lockedUtxo.has('utxo1')).toBe(false);
  });
});
```

**Implementation** (`src/mempool.js`):

```javascript
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class Mempool extends EventEmitter {
  constructor() {
    super();
    // raw_tx_mempool: { leaderId: { rawTxId: { txData, validationTimestamps, validationTasks, txTimestamp } } }
    this.rawTx = new Map();
    // validation_tasks_mempool: { leaderId: [ {task, complete} ] }
    this.validationTasks = new Map();
    // locked_utxo_mempool: Set of locked UTXO IDs
    this.lockedUtxo = new Set();
    // processing_tx_mempool: { txId: { timestamp, txData, sig, leader } }
    this.processingTx = new Map();
    // tx_mempool: { txId: txData }
    this.tx = new Map();
  }

  addRawTransaction(leaderId, txData) {
    const rawTxId = this._hashTransaction(txData);
    
    if (!this.rawTx.has(leaderId)) {
      this.rawTx.set(leaderId, new Map());
    }
    
    const leaderMempool = this.rawTx.get(leaderId);
    leaderMempool.set(rawTxId, {
      txData,
      validationTimestamps: [],
      validationTasks: [],
      txTimestamp: Date.now()
    });
    
    this.emit('raw_tx:added', { leaderId, rawTxId, txData });
    return rawTxId;
  }

  lockUtxos(utxos) {
    utxos.forEach(utxo => this.lockedUtxo.add(utxo));
    this.emit('utxo:locked', utxos);
  }

  unlockUtxos(utxos) {
    utxos.forEach(utxo => this.lockedUtxo.delete(utxo));
    this.emit('utxo:unlocked', utxos);
  }

  _hashTransaction(tx) {
    const txStr = JSON.stringify(tx);
    return createHash('sha256').update(txStr).digest('hex');
  }
}
```

### Step 3: Validation Task Management (TDD) ✅

**Status**: Complete
- Implemented `ValidationTaskManager` class
- Task creation and assignment
- Task completion tracking
- Multiple transactions support
- Task state management
- **Tests**: 11 comprehensive tests

**Test** (`__tests__/validation-tasks.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { ValidationTaskManager } from '../src/validation-tasks';

describe('Validation Task Manager', () => {
  test('should create validation tasks', () => {
    const manager = new ValidationTaskManager();
    const tasks = manager.createTasks('rawTxId', ['leader1', 'leader2']);
    expect(tasks.length).toBe(2);
    expect(tasks[0]).toHaveProperty('task');
    expect(tasks[0]).toHaveProperty('complete');
    expect(tasks[0].complete).toBe(false);
  });

  test('should assign tasks to leaders', () => {
    const manager = new ValidationTaskManager();
    const tasks = manager.createTasks('rawTxId', ['leader1', 'leader2']);
    manager.assignTasks('rawTxId', tasks);
    const assigned = manager.getTasksForLeader('leader1');
    expect(assigned.length).toBeGreaterThan(0);
  });

  test('should mark task as complete', () => {
    const manager = new ValidationTaskManager();
    const tasks = manager.createTasks('rawTxId', ['leader1']);
    manager.assignTasks('rawTxId', tasks);
    manager.completeTask('leader1', tasks[0].task);
    const task = manager.getTask('leader1', tasks[0].task);
    expect(task.complete).toBe(true);
  });
});
```

**Implementation** (`src/validation-tasks.js`):

```javascript
export class ValidationTaskManager {
  constructor() {
    this.tasks = new Map(); // leaderId -> [ {task, complete} ]
  }

  createTasks(rawTxId, leaderIds) {
    return leaderIds.map(leaderId => ({
      task: `${rawTxId}:${leaderId}:validate`,
      complete: false,
      leaderId
    }));
  }

  assignTasks(rawTxId, tasks) {
    tasks.forEach(task => {
      if (!this.tasks.has(task.leaderId)) {
        this.tasks.set(task.leaderId, []);
      }
      this.tasks.get(task.leaderId).push(task);
    });
  }

  completeTask(leaderId, taskId) {
    const leaderTasks = this.tasks.get(leaderId);
    if (leaderTasks) {
      const task = leaderTasks.find(t => t.task === taskId);
      if (task) {
        task.complete = true;
      }
    }
  }

  getTasksForLeader(leaderId) {
    return this.tasks.get(leaderId) || [];
  }

  getTask(leaderId, taskId) {
    const tasks = this.getTasksForLeader(leaderId);
    return tasks.find(t => t.task === taskId);
  }
}
```

### Step 4: Transaction Processing Workflow (TDD) ✅

**Status**: Complete
- Implemented `ConsensusWorkflow` class
- Multi-stage transaction processing
- Validation task integration
- Automatic progression to processing stage
- Validation requirement enforcement (minimum 3 validations)
- Timestamp averaging for consensus
- UTXO locking/unlocking integration
- Transaction finalization to tx_mempool
- Mempool statistics
- Event emission for all stages
- **Tests**: 19 comprehensive tests covering full lifecycle + 8 advanced tests

**Test** (`__tests__/workflow.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { ConsensusWorkflow } from '../src/workflow';

describe('Consensus Workflow', () => {
  test('should process transaction through stages', async () => {
    const workflow = new ConsensusWorkflow();
    const tx = {
      to: 'bob',
      amount: 1.0,
      from: 'alice',
      user: 'alice',
      sig: 'signature',
      stake: 0.2,
      fee: 0.1
    };
    
    // Stage 1: Add to raw_tx_mempool
    const rawTxId = await workflow.submitTransaction('leader1', tx);
    expect(rawTxId).toBeDefined();
    
    // Stage 2: Create validation tasks
    await workflow.createValidationTasks(rawTxId);
    const tasks = workflow.getValidationTasks(rawTxId);
    expect(tasks.length).toBeGreaterThan(0);
    
    // Stage 3: Complete validation
    await workflow.completeValidation(rawTxId, tasks[0].task);
    
    // Stage 4: Move to processing
    await workflow.moveToProcessing(rawTxId);
    expect(workflow.isInProcessing(rawTxId)).toBe(true);
  });
});
```

**Implementation** (`src/workflow.js`):

```javascript
import { Mempool } from './mempool';
import { ValidationTaskManager } from './validation-tasks';
import { EventEmitter } from 'events';

export class ConsensusWorkflow extends EventEmitter {
  constructor() {
    super();
    this.mempool = new Mempool();
    this.taskManager = new ValidationTaskManager();
    this.requiredValidations = 3; // Configurable
  }

  async submitTransaction(leaderId, txData) {
    // Lock UTXOs
    const utxos = this._extractUtxos(txData);
    this.mempool.lockUtxos(utxos);
    
    // Add to raw_tx_mempool
    const rawTxId = this.mempool.addRawTransaction(leaderId, txData);
    
    // Create validation tasks
    await this.createValidationTasks(rawTxId);
    
    return rawTxId;
  }

  async createValidationTasks(rawTxId) {
    // Get leaders for validation
    const leaders = this._getValidationLeaders();
    const tasks = this.taskManager.createTasks(rawTxId, leaders);
    this.taskManager.assignTasks(rawTxId, tasks);
    
    this.emit('validation_tasks:created', { rawTxId, tasks });
  }

  async completeValidation(rawTxId, taskId, timestamp, signature) {
    // Find task leader
    const task = this._findTask(taskId);
    if (!task) return;
    
    // Mark task complete
    this.taskManager.completeTask(task.leaderId, taskId);
    
    // Add validation timestamp
    this._addValidationTimestamp(rawTxId, timestamp);
    
    // Check if enough validations
    const validations = this._getValidationCount(rawTxId);
    if (validations >= this.requiredValidations) {
      await this.moveToProcessing(rawTxId);
    }
  }

  async moveToProcessing(rawTxId) {
    // Get raw transaction
    const rawTx = this._getRawTransaction(rawTxId);
    if (!rawTx) return;
    
    // Calculate average timestamp
    const avgTimestamp = this._averageTimestamps(rawTx.validationTimestamps);
    
    // Create processing transaction
    const txId = this._hashTransaction({ timestamp: avgTimestamp, ...rawTx.txData });
    
    this.mempool.processingTx.set(txId, {
      timestamp: avgTimestamp,
      txData: rawTx.txData,
      sig: rawTx.leaderSig, // Leader signs
      leader: rawTx.leaderId
    });
    
    // Remove from raw_tx_mempool
    this._removeRawTransaction(rawTxId);
    
    this.emit('tx:processing', { txId, rawTxId });
  }

  _extractUtxos(txData) {
    // Extract UTXOs from transaction
    return txData.from || [];
  }

  _getValidationLeaders() {
    // Get available leaders for validation
    return ['leader1', 'leader2', 'leader3']; // Simplified
  }

  _hashTransaction(tx) {
    const txStr = JSON.stringify(tx);
    return createHash('sha256').update(txStr).digest('hex');
  }
}
```

### Step 5: Leader Election (TDD) ✅

**Status**: Complete
- Implemented `LeaderElection` class
- Uptime tracking with pulse recording
- Response time calculation and averaging
- Performance-based leader selection (score = count / (responseTime + 1))
- 4-hour leader rotation with caching
- Timeout handling (60 second timeout)
- Force election capability
- Time until next election tracking
- **Tests**: 20 comprehensive tests including rotation scenarios

**Test** (`__tests__/leader-election.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { LeaderElection } from '../src/leader-election';

describe('Leader Election', () => {
  test('should track node uptime', () => {
    const election = new LeaderElection();
    election.recordPulse('node1', '192.168.1.1');
    const uptime = election.getUptime('node1');
    expect(uptime).toBeDefined();
    expect(uptime.count).toBe(1);
  });

  test('should calculate response time average', () => {
    const election = new LeaderElection();
    election.recordPulse('node1', '192.168.1.1', 100);
    election.recordPulse('node1', '192.168.1.1', 200);
    const uptime = election.getUptime('node1');
    expect(uptime.avgResponseTime).toBe(150);
  });

  test('should elect leaders based on performance', () => {
    const election = new LeaderElection();
    election.recordPulse('node1', '192.168.1.1', 100);
    election.recordPulse('node2', '192.168.1.2', 50);
    const leaders = election.electLeaders(2);
    expect(leaders.length).toBe(2);
    // node2 should be first (faster response)
    expect(leaders[0]).toBe('node2');
  });
});
```

**Implementation** (`src/leader-election.js`):

```javascript
export class LeaderElection {
  constructor() {
    // uptime_mempool: { ip: { timestamp: [count, avgResponseTime] } }
    this.uptimeMempool = new Map();
    this.pulseInterval = 20000; // 20 seconds
    this.timeout = 60000; // 60 seconds
  }

  recordPulse(nodeId, ip, responseTime = null) {
    const now = Date.now();
    
    if (!this.uptimeMempool.has(ip)) {
      this.uptimeMempool.set(ip, {
        timestamp: now,
        count: 1,
        avgResponseTime: responseTime || 0
      });
    } else {
      const entry = this.uptimeMempool.get(ip);
      const timeSinceLastPulse = now - entry.timestamp;
      
      if (timeSinceLastPulse > this.timeout) {
        // Node timed out, reset
        entry.timestamp = now;
        entry.count = 1;
        entry.avgResponseTime = responseTime || 0;
      } else {
        // Update count and average response time
        entry.count++;
        if (responseTime !== null) {
          entry.avgResponseTime = (entry.avgResponseTime * (entry.count - 1) + responseTime) / entry.count;
        }
        entry.timestamp = now;
      }
    }
  }

  getUptime(nodeId) {
    // Find by nodeId (simplified, would need nodeId -> IP mapping)
    return Array.from(this.uptimeMempool.values())[0];
  }

  electLeaders(count) {
    // Sort by uptime count and response time
    const nodes = Array.from(this.uptimeMempool.entries())
      .map(([ip, data]) => ({
        ip,
        count: data.count,
        avgResponseTime: data.avgResponseTime,
        score: data.count / (data.avgResponseTime + 1) // Higher is better
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(n => n.ip);
    
    return nodes;
  }
}
```

### Step 6: Gossip Integration (TDD) ✅

**Status**: Complete
- Implemented `ConsensusGossip` class
- Raw transaction broadcasting
- Message handling infrastructure
- Event-driven message reception
- **Tests**: 2 tests

## Milestone 1: Core Implementation Complete ✅

**Date**: Current

### Test Results
- **Total Test Suites**: 8 passed
- **Total Tests**: 85 passed
- **Coverage**: Comprehensive coverage of all core functionality

### Next Steps
- Integration with xn (network layer) for WebTorrent gossip
- Integration with xclt (ledger) for final transaction inclusion
- Integration with xid (signature verification)
- LevelDB persistence implementation
- Real WebTorrent gossip protocol implementation
- Performance optimization and benchmarking

**Test** (`__tests__/gossip.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { ConsensusGossip } from '../src/gossip';

describe('Consensus Gossip', () => {
  test('should broadcast raw transaction', async () => {
    const gossip = new ConsensusGossip();
    const tx = { to: 'bob', amount: 1.0 };
    await gossip.broadcastRawTransaction('leader1', tx);
    // Verify broadcast (implementation specific)
  });

  test('should receive gossip messages', (done) => {
    const gossip = new ConsensusGossip();
    gossip.on('raw_tx:received', (data) => {
      expect(data).toHaveProperty('leaderId');
      expect(data).toHaveProperty('tx');
      done();
    });
    // Simulate receiving message
    gossip._handleMessage({ type: 'raw_tx', leaderId: 'leader1', tx: {} });
  });
});
```

## Interfaces/APIs

### Exported Classes

```javascript
export class ConsensusWorkflow extends EventEmitter {
  constructor();
  async submitTransaction(leaderId: string, txData: Transaction): Promise<string>;
  async createValidationTasks(rawTxId: string): Promise<void>;
  async completeValidation(rawTxId: string, taskId: string, timestamp: number, signature: string): Promise<void>;
  async moveToProcessing(rawTxId: string): Promise<void>;
}

export class LeaderElection {
  constructor();
  recordPulse(nodeId: string, ip: string, responseTime?: number): void;
  getUptime(nodeId: string): UptimeData;
  electLeaders(count: number): string[];
}
```

## Testing

### Test Scenarios

1. **Mempool Operations**
   - Add/remove transactions
   - Lock/unlock UTXOs
   - Stage transitions

2. **Validation Tasks**
   - Task creation
   - Task assignment
   - Task completion

3. **Workflow**
   - Full transaction lifecycle
   - Validation requirements
   - Error handling

4. **Leader Election**
   - Uptime tracking
   - Response time calculation
   - Leader selection

5. **Gossip**
   - Message broadcasting
   - Message reception
   - Mempool synchronization

### Coverage Goals

- 90%+ code coverage
- All workflow paths tested
- Concurrent transaction handling
- Leader election edge cases

## Integration Notes

### Module Dependencies

- **xn**: Network communication and gossip
- **xclt**: Final transaction inclusion
- **xid**: Signature verification

### Integration Pattern

```javascript
import { ConsensusWorkflow } from 'xpc';
import { XN } from 'xn';
import { XCLT } from 'xclt';
import { XID } from 'xid';

const xpc = new ConsensusWorkflow();
const xn = new XN();
const xclt = new XCLT();
const xid = new XID();

// Submit transaction
xn.on('transaction:received', async (tx) => {
  const rawTxId = await xpc.submitTransaction('leader1', tx);
  // Gossip to other leaders
  xn.publish('raw_tx', { leaderId: 'leader1', rawTxId, tx });
});

// Finalize transactions
xpc.on('tx:processing', async ({ txId }) => {
  const tx = xpc.getProcessingTransaction(txId);
  await xclt.addTransaction(tx.txData);
});
```

## Terminal and Browser Monitoring

### Terminal Output

- **Transaction Stages**: Log transaction progression
  ```javascript
  console.log(`Transaction ${rawTxId} moved to processing stage`);
  ```

- **Leader Election**: Log leader changes
  ```javascript
  console.log(`New leaders elected: ${leaders.join(', ')}`);
  ```

- **Mempool Stats**: Periodic mempool statistics
  ```javascript
  console.log(`Mempool: raw=${rawCount}, processing=${processingCount}, final=${finalCount}`);
  ```

### Screenshot Requirements

Capture terminal output for:
- Transaction workflow stages
- Leader election results
- Mempool statistics
- Validation task assignments

### Console Logging

- Log all mempool state changes
- Log validation task completions
- Include timing information
- Log leader election events
