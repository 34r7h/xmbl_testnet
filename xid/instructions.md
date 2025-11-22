# XID - XMBL MAYO Signatures Instructions

## Overview

XID implements the MAYO post-quantum signature system for XMBL. MAYO (Multivariate AsYnchronous Operations) provides quantum-resistant cryptography for all identities, transactions, and state commitments. This module ports the MAYO C implementation to WebAssembly (WASM) using Emscripten, enabling browser-friendly quantum-safe cryptography. The focus is on MAYO 1 for the testnet.

## Fundamentals

### Key Concepts

- **MAYO Signatures**: Post-quantum multivariate signature scheme
- **WASM Port**: C implementation compiled to WASM via Emscripten
- **Key Generation**: Generate key pairs (public/private)
- **Signing**: Sign messages (transactions, state commitments)
- **Verification**: Verify signatures against public keys
- **Identity System**: MAYO keys as user identities

### Dependencies

- **MAYO C Source**: https://github.com/PQCMayo/MAYO-C
- **Emscripten**: C to WASM compiler
- **node-gyp**: Native module building (if needed)
- **crypto**: Node.js crypto for hashing (supplemental)

### Architectural Decisions

- **WASM First**: Primary implementation in WASM for browser compatibility
- **Fallback**: JavaScript fallback for non-WASM environments
- **Key Storage**: Secure key storage with encryption
- **Batch Operations**: Support batch signing/verification for performance

## Development Steps

### Step 1: Project Setup ✅ COMPLETED

```bash
cd xid
npm init -y
npm install --save-dev emscripten jest @types/jest
# Clone MAYO C source
git clone https://github.com/PQCMayo/MAYO-C.git vendor/mayo-c
```

**Status:** Project initialized with dependencies installed. MAYO C source cloned to `mayo-c-source/`.

### Step 2: Emscripten Build Configuration ✅ COMPLETED

**Create** (`build/mayo.mk`):

```makefile
EMCC = emcc
MAYO_SRC = vendor/mayo-c/src
OUTPUT = dist/mayo.wasm

CFLAGS = -O3 -s WASM=1 -s EXPORTED_FUNCTIONS='["_keygen","_sign","_verify","_malloc","_free"]' -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'

mayo.wasm: $(MAYO_SRC)/*.c
	$(EMCC) $(CFLAGS) -o $(OUTPUT) $(MAYO_SRC)/*.c
```

**Status:** MAYO C implementation successfully compiled to WebAssembly. Files `mayo.js` and `mayo.wasm` exist in `mayo-c-source/` directory.

### Step 3: WASM Wrapper (TDD) ✅ COMPLETED

**Test First** (`__tests__/wasm-wrapper.test.js`):

```javascript
import { describe, test, expect, beforeAll } from 'jest';
import { MAYOWasm } from '../src/wasm-wrapper';

describe('MAYO WASM Wrapper', () => {
  let mayo;

  beforeAll(async () => {
    mayo = await MAYOWasm.load();
  });

  test('should load WASM module', () => {
    expect(mayo).toBeDefined();
    expect(mayo.keygen).toBeDefined();
    expect(mayo.sign).toBeDefined();
    expect(mayo.verify).toBeDefined();
  });

  test('should generate key pair', async () => {
    const keypair = await mayo.keygen();
    expect(keypair).toHaveProperty('publicKey');
    expect(keypair).toHaveProperty('privateKey');
    expect(keypair.publicKey.length).toBeGreaterThan(0);
    expect(keypair.privateKey.length).toBeGreaterThan(0);
  });

  test('should sign and verify message', async () => {
    const keypair = await mayo.keygen();
    const message = new TextEncoder().encode('Hello, XMBL!');
    const signature = await mayo.sign(message, keypair.privateKey);
    expect(signature).toBeDefined();
    
    const isValid = await mayo.verify(message, signature, keypair.publicKey);
    expect(isValid).toBe(true);
  });

  test('should reject invalid signature', async () => {
    const keypair = await mayo.keygen();
    const message = new TextEncoder().encode('Hello, XMBL!');
    const wrongMessage = new TextEncoder().encode('Wrong message');
    const signature = await mayo.sign(message, keypair.privateKey);
    
    const isValid = await mayo.verify(wrongMessage, signature, keypair.publicKey);
    expect(isValid).toBe(false);
  });
});
```

**Implementation** (`src/wasm-wrapper.js`):

```javascript
export class MAYOWasm {
  constructor(module) {
    this.module = module;
    this.keygen = module.cwrap('keygen', 'number', []);
    this.sign = module.cwrap('sign', 'number', ['array', 'number', 'array', 'number']);
    this.verify = module.cwrap('verify', 'number', ['array', 'number', 'array', 'number', 'array', 'number']);
  }

  static async load() {
    // Load WASM module
    const wasmModule = await import('../dist/mayo.js');
    return new MAYOWasm(wasmModule);
  }

  async keygen() {
    const keypairPtr = this.keygen();
    // Read keypair from WASM memory
    const publicKey = this._readString(keypairPtr, 0, PUBLIC_KEY_SIZE);
    const privateKey = this._readString(keypairPtr, PUBLIC_KEY_SIZE, PRIVATE_KEY_SIZE);
    return { publicKey, privateKey };
  }

  async sign(message, privateKey) {
    const messagePtr = this._writeToMemory(message);
    const keyPtr = this._writeToMemory(privateKey);
    const sigPtr = this.sign(messagePtr, message.length, keyPtr, privateKey.length);
    const signature = this._readString(sigPtr, 0, SIGNATURE_SIZE);
    this.module._free(messagePtr);
    this.module._free(keyPtr);
    return signature;
  }

  async verify(message, signature, publicKey) {
    const messagePtr = this._writeToMemory(message);
    const sigPtr = this._writeToMemory(signature);
    const keyPtr = this._writeToMemory(publicKey);
    const result = this.verify(
      messagePtr, message.length,
      sigPtr, signature.length,
      keyPtr, publicKey.length
    );
    this.module._free(messagePtr);
    this.module._free(sigPtr);
    this.module._free(keyPtr);
    return result === 1;
  }

  _writeToMemory(data) {
    const ptr = this.module._malloc(data.length);
    const heap = new Uint8Array(this.module.HEAPU8.buffer, ptr, data.length);
    heap.set(data);
    return ptr;
  }

  _readString(ptr, offset, length) {
    const heap = new Uint8Array(this.module.HEAPU8.buffer, ptr + offset, length);
    return Array.from(heap).map(b => String.fromCharCode(b)).join('');
  }
}
```

### Step 4: Identity System (TDD) ✅ COMPLETED

**Test** (`__tests__/identity.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { Identity } from '../src/identity';

describe('Identity', () => {
  test('should create new identity', async () => {
    const identity = await Identity.create();
    expect(identity).toHaveProperty('address');
    expect(identity).toHaveProperty('publicKey');
    expect(identity).toHaveProperty('privateKey');
  });

  test('should generate deterministic address from public key', async () => {
    const identity1 = await Identity.create();
    const identity2 = Identity.fromPublicKey(identity1.publicKey);
    expect(identity2.address).toBe(identity1.address);
  });

  test('should sign transaction', async () => {
    const identity = await Identity.create();
    const tx = { to: 'bob', amount: 1.0, from: identity.address };
    const signed = await identity.signTransaction(tx);
    expect(signed).toHaveProperty('sig');
    expect(signed).toHaveProperty('tx');
  });

  test('should verify transaction signature', async () => {
    const identity = await Identity.create();
    const tx = { to: 'bob', amount: 1.0, from: identity.address };
    const signed = await identity.signTransaction(tx);
    const isValid = Identity.verifyTransaction(signed, identity.publicKey);
    expect(isValid).toBe(true);
  });
});
```

**Implementation** (`src/identity.js`):

```javascript
import { MAYOWasm } from './wasm-wrapper';
import { createHash } from 'crypto';

export class Identity {
  constructor(publicKey, privateKey) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.address = this._deriveAddress(publicKey);
  }

  static async create() {
    const mayo = await MAYOWasm.load();
    const keypair = await mayo.keygen();
    return new Identity(keypair.publicKey, keypair.privateKey);
  }

  static fromPublicKey(publicKey) {
    return new Identity(publicKey, null);
  }

  static fromPrivateKey(privateKey) {
    // Derive public key from private key (MAYO specific)
    // For now, assume we store both
    throw new Error('Not implemented: derive public from private');
  }

  _deriveAddress(publicKey) {
    // Hash public key to get address
    const hash = createHash('sha256').update(publicKey).digest('hex');
    return 'xmb' + hash.substring(0, 40); // XMBL address prefix
  }

  async signTransaction(tx) {
    const mayo = await MAYOWasm.load();
    // Create message to sign (tx without sig field)
    const { sig, ...txWithoutSig } = tx;
    const message = JSON.stringify(txWithoutSig);
    const messageBytes = new TextEncoder().encode(message);
    const signature = await mayo.sign(messageBytes, this.privateKey);
    return { ...tx, sig: signature };
  }

  static async verifyTransaction(signedTx, publicKey) {
    const mayo = await MAYOWasm.load();
    const { sig, ...txWithoutSig } = signedTx;
    const message = JSON.stringify(txWithoutSig);
    const messageBytes = new TextEncoder().encode(message);
    return await mayo.verify(messageBytes, sig, publicKey);
  }
}
```

### Step 5: Key Management (TDD) ✅ COMPLETED

**Test** (`__tests__/key-manager.test.js`):

```javascript
import { describe, test, expect, beforeEach, afterEach } from 'jest';
import { KeyManager } from '../src/key-manager';
import { Identity } from '../src/identity';
import fs from 'fs';
import path from 'path';

describe('KeyManager', () => {
  const testDir = './test-keys';
  let keyManager;

  beforeEach(() => {
    keyManager = new KeyManager(testDir);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('should save identity', async () => {
    const identity = await Identity.create();
    await keyManager.saveIdentity('alice', identity);
    expect(fs.existsSync(path.join(testDir, 'alice.key'))).toBe(true);
  });

  test('should load identity', async () => {
    const identity = await Identity.create();
    await keyManager.saveIdentity('alice', identity);
    const loaded = await keyManager.loadIdentity('alice');
    expect(loaded.address).toBe(identity.address);
  });

  test('should list identities', async () => {
    await keyManager.saveIdentity('alice', await Identity.create());
    await keyManager.saveIdentity('bob', await Identity.create());
    const identities = await keyManager.listIdentities();
    expect(identities).toContain('alice');
    expect(identities).toContain('bob');
  });
});
```

**Implementation** (`src/key-manager.js`):

```javascript
import fs from 'fs/promises';
import path from 'path';
import { Identity } from './identity';
import crypto from 'crypto';

export class KeyManager {
  constructor(keyDir = './keys') {
    this.keyDir = keyDir;
  }

  async ensureDir() {
    await fs.mkdir(this.keyDir, { recursive: true });
  }

  async saveIdentity(name, identity, password = null) {
    await this.ensureDir();
    const keyPath = path.join(this.keyDir, `${name}.key`);
    const keyData = {
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
      address: identity.address
    };
    
    let data = JSON.stringify(keyData);
    if (password) {
      data = this._encrypt(data, password);
    }
    
    await fs.writeFile(keyPath, data, { mode: 0o600 });
  }

  async loadIdentity(name, password = null) {
    const keyPath = path.join(this.keyDir, `${name}.key`);
    let data = await fs.readFile(keyPath, 'utf8');
    
    if (password) {
      data = this._decrypt(data, password);
    }
    
    const keyData = JSON.parse(data);
    return new Identity(keyData.publicKey, keyData.privateKey);
  }

  async listIdentities() {
    await this.ensureDir();
    const files = await fs.readdir(this.keyDir);
    return files
      .filter(f => f.endsWith('.key'))
      .map(f => f.replace('.key', ''));
  }

  _encrypt(text, password) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return JSON.stringify({ iv: iv.toString('hex'), encrypted, authTag: authTag.toString('hex') });
  }

  _decrypt(encryptedData, password) {
    const algorithm = 'aes-256-gcm';
    const { iv, encrypted, authTag } = JSON.parse(encryptedData);
    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### Step 6: Batch Operations (TDD) ✅ COMPLETED

**Status:** All components implemented and tested. 17/17 tests passing across 4 test suites (WASM wrapper, Identity, Key Manager, Batch operations).

**Test** (`__tests__/batch.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { batchSign, batchVerify } from '../src/batch';

describe('Batch Operations', () => {
  test('should batch sign transactions', async () => {
    const identity = await Identity.create();
    const txs = [
      { to: 'bob', amount: 1.0 },
      { to: 'charlie', amount: 2.0 },
      { to: 'dave', amount: 3.0 }
    ];
    const signed = await batchSign(txs, identity);
    expect(signed.length).toBe(3);
    expect(signed[0]).toHaveProperty('sig');
  });

  test('should batch verify transactions', async () => {
    const identity = await Identity.create();
    const txs = [
      { to: 'bob', amount: 1.0 },
      { to: 'charlie', amount: 2.0 }
    ];
    const signed = await batchSign(txs, identity);
    const results = await batchVerify(signed, identity.publicKey);
    expect(results.every(r => r === true)).toBe(true);
  });
});
```

### Step 7: Achieve 100% Test Coverage ⏳ IN PROGRESS

**Current Coverage:** 98.33% statements, 82.22% branches, 100% functions, 98.31% lines (35 tests passing)

**Status:** Excellent progress - coverage improved from 83% to 98.33% statements, 100% functions, 82.22% branches. Only 3 lines remain uncovered in wasm-wrapper.js.

**Remaining Test Cases Needed:**

**1. WASM Wrapper Error Paths** (`__tests__/wasm-wrapper.test.js`):

```javascript
test('should handle locateFile callback for non-wasm files', async () => {
  // Test line 52: return file for non-wasm files in locateFile callback
  // This requires testing the locateFile callback with different file types
});

test('should handle keygen error path', async () => {
  // Test line 87: keygen error path (requires mocking WASM to return non-zero)
  // Challenge: Need to mock WASM crypto_sign_keypair to return error code
  const mayo = await MAYOWasm.load();
  // Mock the WASM function to return non-zero error code
});

test('should handle signing error path', async () => {
  // Test line 132: signing error path (requires mocking WASM to return non-zero)
  // Challenge: Need to mock WASM crypto_sign_signature to return error code
  const mayo = await MAYOWasm.load();
  const keypair = await mayo.keygen();
  // Mock the WASM function to return non-zero error code
});
```

**Coverage Targets:**
- Statement coverage: 100%
- Branch coverage: 100%
- Function coverage: 100%
- Line coverage: 100%

**Run coverage check:**
```bash
npm run coverage
```

## Interfaces/APIs

### Exported Classes

```javascript
export class Identity {
  constructor(publicKey: string, privateKey: string);
  static async create(): Promise<Identity>;
  static fromPublicKey(publicKey: string): Identity;
  async signTransaction(tx: Transaction): Promise<SignedTransaction>;
  static async verifyTransaction(signedTx: SignedTransaction, publicKey: string): Promise<boolean>;
  address: string;
  publicKey: string;
  privateKey: string;
}

export class KeyManager {
  constructor(keyDir?: string);
  async saveIdentity(name: string, identity: Identity, password?: string): Promise<void>;
  async loadIdentity(name: string, password?: string): Promise<Identity>;
  async listIdentities(): Promise<string[]>;
}

export class MAYOWasm {
  static async load(): Promise<MAYOWasm>;
  async keygen(): Promise<KeyPair>;
  async sign(message: Uint8Array, privateKey: string): Promise<string>;
  async verify(message: Uint8Array, signature: string, publicKey: string): Promise<boolean>;
}
```

## Testing

### Test Scenarios

1. **WASM Loading**
   - Module initialization
   - Function availability
   - Memory management

2. **Key Generation**
   - Key pair creation
   - Key format validation
   - Deterministic address derivation

3. **Signing**
   - Transaction signing
   - Message signing
   - Signature format

4. **Verification**
   - Valid signature verification
   - Invalid signature rejection
   - Wrong key rejection

5. **Key Management**
   - Save/load identities
   - Encrypted storage
   - Identity listing

6. **Batch Operations**
   - Batch signing
   - Batch verification
   - Performance testing

### Coverage Goals

- **100% code coverage** (statements, branches, functions, lines)
- All WASM functions tested
- Edge cases (empty messages, invalid keys, memory errors)
- Error handling paths tested
- Browser vs Node.js environment differences
- Performance benchmarks

## Integration Notes

### Module Dependencies

- **xclt**: Uses XID for transaction signature verification
- **xpc**: Uses XID for consensus message signing
- **xsc**: Uses XID for storage/compute request signing

### Integration Pattern

```javascript
import { Identity, KeyManager } from 'xid';
import { XCLT } from 'xclt';

const keyManager = new KeyManager();
const identity = await keyManager.loadIdentity('alice');
const tx = { to: 'bob', amount: 1.0, from: identity.address };
const signed = await identity.signTransaction(tx);

// XCLT verifies before adding to ledger
const isValid = await Identity.verifyTransaction(signed, identity.publicKey);
if (isValid) {
  await xclt.addTransaction(signed.tx);
}
```

## Terminal and Browser Monitoring

### Terminal Output

- **WASM Loading**: Log WASM module load status
  ```javascript
  console.log('MAYO WASM module loaded successfully');
  ```

- **Key Generation**: Log key generation (without exposing keys)
  ```javascript
  console.log(`Identity created: ${identity.address}`);
  ```

- **Signing Operations**: Log signing with timing
  ```javascript
  console.log(`Transaction signed in ${duration}ms`);
  ```

### Screenshot Requirements

Capture terminal output for:
- WASM module loading
- Key generation confirmation
- Signature operation timing
- Error messages (WASM load failures, invalid keys)

### Browser Console

For browser-based usage:
- **WASM Load**: Check Network tab for WASM file loading
- **Performance**: Profile WASM execution in Performance tab
- **Memory**: Monitor WASM memory usage
- **Console Logs**: WASM function call logs

### Console Logging

- Log all key operations (without exposing secrets)
- Log signature verification results
- Include timing information
- Log WASM memory usage
