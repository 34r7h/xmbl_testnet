# XSIM - XMBL System Simulator Instructions

## Overview

XSIM is a comprehensive system simulator that runs infinitely, generating random interactions and activities across the entire XMBL ecosystem. It simulates identity creation, transaction posting, validations, storage operations, compute tasks, state machine diffs, and app-centric state assembly. The simulator is essential for end-to-end testing, stress testing, and validating system behavior under various conditions.

## Fundamentals

### Key Concepts

- **Infinite Execution**: Simulator runs continuously until stopped
- **Random Generation**: Random qualities for all interaction types
- **Full System Coverage**: Simulates all XMBL modules
- **Realistic Behavior**: Mimics real user and node behavior
- **Metrics Collection**: Tracks performance and system health
- **Failure Injection**: Simulates network failures and node crashes

### Dependencies

- **all XMBL modules**: xid, xn, xclt, xvsm, xpc, xsc
- **faker**: Generate realistic fake data
- **chance**: Random data generation

### Architectural Decisions

- **Event-Driven**: Uses module events for realistic simulation
- **Configurable**: Adjustable rates and probabilities
- **Observable**: Emits metrics and events for monitoring
- **Deterministic Option**: Can run with seed for reproducible tests

## Development Steps

### Step 1: Project Setup

```bash
cd xsim
npm init -y
npm install faker chance
npm install --save-dev jest @types/jest
```

### Step 2: Identity Simulator (TDD)

**Test First** (`__tests__/identity-sim.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { IdentitySimulator } from '../src/identity-sim';

describe('Identity Simulator', () => {
  test('should create random identity', async () => {
    const sim = new IdentitySimulator();
    const identity = await sim.createRandomIdentity();
    expect(identity).toHaveProperty('address');
    expect(identity).toHaveProperty('publicKey');
  });

  test('should create identities at specified rate', async () => {
    const sim = new IdentitySimulator({ rate: 10 }); // 10 per second
    const identities = [];
    sim.on('identity:created', (id) => identities.push(id));
    await sim.start();
    await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds
    await sim.stop();
    expect(identities.length).toBeGreaterThanOrEqual(10);
  });
});
```

**Implementation** (`src/identity-sim.js`):

```javascript
import { EventEmitter } from 'events';
import { Identity } from 'xid';

export class IdentitySimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.rate = options.rate || 1; // identities per second
    this.identities = [];
    this.running = false;
    this.interval = null;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    
    const delay = 1000 / this.rate;
    this.interval = setInterval(async () => {
      const identity = await Identity.create();
      this.identities.push(identity);
      this.emit('identity:created', identity);
    }, delay);
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getIdentities() {
    return this.identities;
  }
}
```

### Step 3: Transaction Simulator (TDD)

**Test** (`__tests__/transaction-sim.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { TransactionSimulator } from '../src/transaction-sim';

describe('Transaction Simulator', () => {
  test('should create random transaction', () => {
    const sim = new TransactionSimulator();
    const identities = [{ address: 'alice' }, { address: 'bob' }];
    const tx = sim.createRandomTransaction(identities);
    expect(tx).toHaveProperty('to');
    expect(tx).toHaveProperty('from');
    expect(tx).toHaveProperty('amount');
  });

  test('should generate transactions at specified rate', async () => {
    const sim = new TransactionSimulator({ rate: 5 });
    const transactions = [];
    sim.on('transaction:created', (tx) => transactions.push(tx));
    await sim.start();
    await new Promise(resolve => setTimeout(resolve, 1100));
    await sim.stop();
    expect(transactions.length).toBeGreaterThanOrEqual(5);
  });
});
```

**Implementation** (`src/transaction-sim.js`):

```javascript
import { EventEmitter } from 'events';
import faker from 'faker';

export class TransactionSimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.rate = options.rate || 1;
    this.transactions = [];
    this.running = false;
    this.interval = null;
  }

  createRandomTransaction(identities) {
    if (identities.length < 2) {
      throw new Error('Need at least 2 identities');
    }
    
    const from = faker.random.arrayElement(identities);
    const to = faker.random.arrayElement(identities.filter(i => i.address !== from.address));
    const amount = parseFloat(faker.finance.amount(0.1, 100, 2));
    
    return {
      to: to.address,
      from: from.address,
      amount,
      fee: amount * 0.1,
      stake: amount * 0.2,
      timestamp: Date.now()
    };
  }

  async start(identities) {
    if (this.running) return;
    this.running = true;
    
    const delay = 1000 / this.rate;
    this.interval = setInterval(() => {
      const tx = this.createRandomTransaction(identities);
      this.transactions.push(tx);
      this.emit('transaction:created', tx);
    }, delay);
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
```

### Step 4: Validation Simulator (TDD)

**Test** (`__tests__/validation-sim.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { ValidationSimulator } from '../src/validation-sim';

describe('Validation Simulator', () => {
  test('should simulate validation tasks', async () => {
    const sim = new ValidationSimulator();
    const task = { rawTxId: 'tx1', task: 'validate_sig' };
    const result = await sim.simulateValidation(task);
    expect(result).toHaveProperty('complete');
    expect(result).toHaveProperty('timestamp');
  });

  test('should simulate validation delays', async () => {
    const sim = new ValidationSimulator({ avgDelay: 100 });
    const start = Date.now();
    await sim.simulateValidation({});
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(50); // Some delay
  });
});
```

**Implementation** (`src/validation-sim.js`):

```javascript
import { EventEmitter } from 'events';
import chance from 'chance';

export class ValidationSimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.avgDelay = options.avgDelay || 50; // milliseconds
    this.successRate = options.successRate || 0.95; // 95% success
    this.chance = new chance();
  }

  async simulateValidation(task) {
    // Simulate validation delay
    const delay = this.chance.normal({ mean: this.avgDelay, dev: this.avgDelay * 0.2 });
    await new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
    
    // Simulate success/failure
    const success = this.chance.bool({ likelihood: this.successRate * 100 });
    
    const result = {
      task: task.task,
      complete: success,
      timestamp: Date.now(),
      error: success ? null : 'Validation failed'
    };
    
    this.emit('validation:complete', result);
    return result;
  }
}
```

### Step 5: Storage/Compute Simulator (TDD)

**Test** (`__tests__/storage-compute-sim.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { StorageComputeSimulator } from '../src/storage-compute-sim';

describe('Storage/Compute Simulator', () => {
  test('should simulate storage operations', async () => {
    const sim = new StorageComputeSimulator();
    const operation = await sim.simulateStorageOperation();
    expect(operation).toHaveProperty('type');
    expect(['store', 'retrieve', 'delete']).toContain(operation.type);
  });

  test('should simulate compute operations', async () => {
    const sim = new StorageComputeSimulator();
    const operation = await sim.simulateComputeOperation();
    expect(operation).toHaveProperty('functionName');
    expect(operation).toHaveProperty('duration');
  });
});
```

**Implementation** (`src/storage-compute-sim.js`):

```javascript
import { EventEmitter } from 'events';
import faker from 'faker';
import chance from 'chance';

export class StorageComputeSimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storageRate = options.storageRate || 0.5;
    this.computeRate = options.computeRate || 0.5;
    this.chance = new chance();
  }

  async simulateStorageOperation() {
    const types = ['store', 'retrieve', 'delete'];
    const type = this.chance.pickone(types);
    const size = this.chance.integer({ min: 100, max: 10000 });
    
    const operation = {
      type,
      size,
      timestamp: Date.now()
    };
    
    this.emit('storage:operation', operation);
    return operation;
  }

  async simulateComputeOperation() {
    const functionName = faker.hacker.verb() + '_' + faker.hacker.noun();
    const duration = this.chance.normal({ mean: 100, dev: 20 });
    
    const operation = {
      functionName,
      duration: Math.max(0, duration),
      memory: this.chance.integer({ min: 10, max: 100 }),
      timestamp: Date.now()
    };
    
    this.emit('compute:operation', operation);
    return operation;
  }
}
```

### Step 6: System Simulator (TDD)

**Test** (`__tests__/system-sim.test.js`):

```javascript
import { describe, test, expect, beforeEach, afterEach } from 'jest';
import { SystemSimulator } from '../src/system-sim';

describe('System Simulator', () => {
  let sim;

  beforeEach(() => {
    sim = new SystemSimulator();
  });

  afterEach(async () => {
    await sim.stop();
  });

  test('should start simulator', async () => {
    await sim.start();
    expect(sim.isRunning()).toBe(true);
  });

  test('should stop simulator', async () => {
    await sim.start();
    await sim.stop();
    expect(sim.isRunning()).toBe(false);
  });

  test('should collect metrics', async () => {
    await sim.start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const metrics = sim.getMetrics();
    expect(metrics).toHaveProperty('identitiesCreated');
    expect(metrics).toHaveProperty('transactionsCreated');
  });
});
```

**Implementation** (`src/system-sim.js`):

```javascript
import { EventEmitter } from 'events';
import { IdentitySimulator } from './identity-sim';
import { TransactionSimulator } from './transaction-sim';
import { ValidationSimulator } from './validation-sim';
import { StorageComputeSimulator } from './storage-compute-sim';

export class SystemSimulator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      identityRate: options.identityRate || 1,
      transactionRate: options.transactionRate || 5,
      ...options
    };
    
    this.identitySim = new IdentitySimulator({ rate: this.options.identityRate });
    this.transactionSim = new TransactionSimulator({ rate: this.options.transactionRate });
    this.validationSim = new ValidationSimulator();
    this.storageComputeSim = new StorageComputeSimulator();
    
    this.metrics = {
      identitiesCreated: 0,
      transactionsCreated: 0,
      validationsCompleted: 0,
      storageOperations: 0,
      computeOperations: 0,
      startTime: null
    };
    
    this.running = false;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.identitySim.on('identity:created', () => {
      this.metrics.identitiesCreated++;
      this.emit('metrics:update', this.metrics);
    });
    
    this.transactionSim.on('transaction:created', () => {
      this.metrics.transactionsCreated++;
      this.emit('metrics:update', this.metrics);
    });
    
    this.validationSim.on('validation:complete', () => {
      this.metrics.validationsCompleted++;
      this.emit('metrics:update', this.metrics);
    });
    
    this.storageComputeSim.on('storage:operation', () => {
      this.metrics.storageOperations++;
      this.emit('metrics:update', this.metrics);
    });
    
    this.storageComputeSim.on('compute:operation', () => {
      this.metrics.computeOperations++;
      this.emit('metrics:update', this.metrics);
    });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.metrics.startTime = Date.now();
    
    const identities = [];
    this.identitySim.on('identity:created', (id) => identities.push(id));
    
    await this.identitySim.start();
    await this.transactionSim.start(identities);
    
    // Start periodic storage/compute operations
    this.storageInterval = setInterval(() => {
      this.storageComputeSim.simulateStorageOperation();
    }, 2000);
    
    this.computeInterval = setInterval(() => {
      this.storageComputeSim.simulateComputeOperation();
    }, 2000);
    
    this.emit('started');
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    
    await this.identitySim.stop();
    await this.transactionSim.stop();
    
    if (this.storageInterval) clearInterval(this.storageInterval);
    if (this.computeInterval) clearInterval(this.computeInterval);
    
    this.emit('stopped');
  }

  isRunning() {
    return this.running;
  }

  getMetrics() {
    return { ...this.metrics };
  }
}
```

## Interfaces/APIs

### Exported Classes

```javascript
export class SystemSimulator extends EventEmitter {
  constructor(options?: SimulatorOptions);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  isRunning(): boolean;
  getMetrics(): Metrics;
}

export class IdentitySimulator extends EventEmitter {
  constructor(options?: IdentitySimOptions);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  async createRandomIdentity(): Promise<Identity>;
}

export class TransactionSimulator extends EventEmitter {
  constructor(options?: TransactionSimOptions);
  async start(identities: Identity[]): Promise<void>;
  async stop(): Promise<void>;
  createRandomTransaction(identities: Identity[]): Transaction;
}
```

## Testing

### Test Scenarios

1. **Identity Generation**
   - Random identity creation
   - Rate control
   - Event emission

2. **Transaction Generation**
   - Random transaction creation
   - Rate control
   - Realistic amounts

3. **Validation Simulation**
   - Validation delays
   - Success/failure rates
   - Task completion

4. **Storage/Compute Simulation**
   - Operation types
   - Resource usage
   - Timing

5. **System Integration**
   - Full system simulation
   - Metrics collection
   - Event handling

### Coverage Goals

- 90%+ code coverage
- All simulation types tested
- Rate control validation
- Metrics accuracy

## Integration Notes

### Module Dependencies

- **All XMBL modules**: xid, xn, xclt, xvsm, xpc, xsc

### Integration Pattern

```javascript
import { SystemSimulator } from 'xsim';
import { XCLT } from 'xclt';
import { XPC } from 'xpc';

const sim = new SystemSimulator({
  identityRate: 2,
  transactionRate: 10
});

// Connect to real modules
sim.transactionSim.on('transaction:created', async (tx) => {
  await xpc.submitTransaction('leader1', tx);
});

sim.on('metrics:update', (metrics) => {
  console.log('Metrics:', metrics);
});

await sim.start();
```

## Terminal and Browser Monitoring

### Terminal Output

- **Simulation Status**: Log simulation state
  ```javascript
  console.log(`Simulator running: ${sim.isRunning()}`);
  ```

- **Metrics**: Periodic metrics display
  ```javascript
  console.log(`Identities: ${metrics.identitiesCreated}, Transactions: ${metrics.transactionsCreated}`);
  ```

- **Rates**: Current operation rates
  ```javascript
  console.log(`Rate: ${txRate} tx/s, ${idRate} identities/s`);
  ```

### Screenshot Requirements

Capture terminal output for:
- Simulation startup
- Real-time metrics
- Rate statistics
- Error logs

### Console Logging

- Log all simulation events
- Include timing information
- Log metrics updates
- Include error details
