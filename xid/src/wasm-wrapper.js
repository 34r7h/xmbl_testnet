// MAYO WASM Wrapper
// Wraps the Emscripten-compiled MAYO C implementation

// MAYO_1 constants
const CRYPTO_SECRETKEYBYTES = 24;
const CRYPTO_PUBLICKEYBYTES = 1420;
const CRYPTO_BYTES = 454;

export class MAYOWasm {
  constructor(module) {
    this.module = module;
    
    // Wrap C functions - using namespaced function names (MAYO_1 opt build)
    // Try direct access first, fallback to cwrap
    if (module._pqmayo_MAYO_1_opt_crypto_sign_keypair) {
      this._crypto_sign_keypair = module._pqmayo_MAYO_1_opt_crypto_sign_keypair;
    } else {
      this._crypto_sign_keypair = module.cwrap('pqmayo_MAYO_1_opt_crypto_sign_keypair', 'number', ['number', 'number']);
    }
    if (module._pqmayo_MAYO_1_opt_crypto_sign_signature) {
      this._crypto_sign_signature = module._pqmayo_MAYO_1_opt_crypto_sign_signature;
    } else {
      this._crypto_sign_signature = module.cwrap('pqmayo_MAYO_1_opt_crypto_sign_signature', 'number', ['number', 'number', 'number', 'number', 'number']);
    }
    if (module._pqmayo_MAYO_1_opt_crypto_sign_verify) {
      this._crypto_sign_verify = module._pqmayo_MAYO_1_opt_crypto_sign_verify;
    } else {
      this._crypto_sign_verify = module.cwrap('pqmayo_MAYO_1_opt_crypto_sign_verify', 'number', ['number', 'number', 'number', 'number', 'number']);
    }
  }

  static async load() {
    // Load WASM module
    // The mayo.cjs file is a CommonJS module that creates a Module object
    const { createRequire } = await import('module');
    const { fileURLToPath } = await import('url');
    const { dirname, resolve } = await import('path');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const require = createRequire(import.meta.url);
    
    // Load the CommonJS module - it exports createModule function
    const createModule = require(resolve(__dirname, '../mayo-c-source/mayo.cjs'));
    
    // Set the WASM file location
    const wasmPath = resolve(__dirname, '../mayo-c-source/mayo.wasm');
    const moduleConfig = {
      locateFile: (file) => {
        if (file.endsWith('.wasm')) {
          return wasmPath;
        }
        return file;
      }
    };
    
    // Call createModule to get the module instance
    const mayoModule = await createModule(moduleConfig);
    
    // If it's a promise, wait for it
    const module = mayoModule instanceof Promise ? await mayoModule : mayoModule;
    
    return new MAYOWasm(module);
  }

  async keygen() {
    // Allocate memory for keys
    // Try _malloc, if not available, the WASM needs to be recompiled
    if (!this.module._malloc) {
      throw new Error('_malloc not available. WASM module needs to be recompiled with EXPORTED_FUNCTIONS including _malloc');
    }
    const pkPtr = this.module._malloc(CRYPTO_PUBLICKEYBYTES);
    const skPtr = this.module._malloc(CRYPTO_SECRETKEYBYTES);
    
    // Zero-initialize memory (like calloc) using HEAPU8
    if (this.module.HEAPU8) {
      const pkHeap = new Uint8Array(this.module.HEAPU8.buffer, pkPtr, CRYPTO_PUBLICKEYBYTES);
      const skHeap = new Uint8Array(this.module.HEAPU8.buffer, skPtr, CRYPTO_SECRETKEYBYTES);
      pkHeap.fill(0);
      skHeap.fill(0);
    }
    
    try {
      // Call key generation
      const result = this._crypto_sign_keypair(pkPtr, skPtr);
      
      if (result !== 0) {
        throw new Error(`Key generation failed with code: ${result}`);
      }
      
      // Read keys from WASM memory
      const publicKey = this._readBytes(pkPtr, CRYPTO_PUBLICKEYBYTES);
      const privateKey = this._readBytes(skPtr, CRYPTO_SECRETKEYBYTES);
      
      // Convert to base64 for easier handling
      return {
        publicKey: this._bytesToBase64(publicKey),
        privateKey: this._bytesToBase64(privateKey)
      };
    } finally {
      // Free memory
      if (this.module._free) {
        this.module._free(pkPtr);
        this.module._free(skPtr);
      }
    }
  }

  async sign(message, privateKey) {
    // Decode private key from base64
    const skBytes = this._base64ToBytes(privateKey);
    
    // Allocate memory
    const messagePtr = this._writeToMemory(message);
    const skPtr = this._writeToMemory(skBytes);
    const sigPtr = this.module._malloc(CRYPTO_BYTES);
    const sigLenPtr = this.module._malloc(4); // size_t
    
    try {
      // Set initial signature length
      this.module.HEAP32[sigLenPtr >> 2] = CRYPTO_BYTES;
      
      // Call sign function
      const result = this._crypto_sign_signature(
        sigPtr,
        sigLenPtr,
        messagePtr,
        message.length,
        skPtr
      );
      
      if (result !== 0) {
        throw new Error(`Signing failed with code: ${result}`);
      }
      
      // Read signature length
      const sigLen = this.module.HEAP32[sigLenPtr >> 2];
      
      // Read signature
      const signature = this._readBytes(sigPtr, sigLen);
      
      return this._bytesToBase64(signature);
    } finally {
      // Free memory
      if (this.module._free) {
        this.module._free(messagePtr);
        this.module._free(skPtr);
        this.module._free(sigPtr);
        this.module._free(sigLenPtr);
      }
    }
  }

  async verify(message, signature, publicKey) {
    // Decode keys from base64
    const sigBytes = this._base64ToBytes(signature);
    const pkBytes = this._base64ToBytes(publicKey);
    
    // Allocate memory
    const messagePtr = this._writeToMemory(message);
    const sigPtr = this._writeToMemory(sigBytes);
    const pkPtr = this._writeToMemory(pkBytes);
    
    try {
      // Call verify function
      const result = this._crypto_sign_verify(
        sigPtr,
        sigBytes.length,
        messagePtr,
        message.length,
        pkPtr
      );
      
      // 0 means success, non-zero means failure
      return result === 0;
    } finally {
      // Free memory
      if (this.module._free) {
        this.module._free(messagePtr);
        this.module._free(sigPtr);
        this.module._free(pkPtr);
      }
    }
  }

  _writeToMemory(data) {
    if (!this.module._malloc) {
      throw new Error('_malloc not available. WASM module needs to be recompiled with EXPORTED_FUNCTIONS including _malloc');
    }
    const ptr = this.module._malloc(data.length);
    if (!ptr) {
      throw new Error('Failed to allocate memory');
    }
    // Access memory through HEAPU8
    if (!this.module.HEAPU8) {
      this.module._free(ptr);
      throw new Error('WASM HEAPU8 not available');
    }
    // Create a view and write data
    const heap = new Uint8Array(this.module.HEAPU8.buffer, ptr, data.length);
    heap.set(data);
    return ptr;
  }

  _readBytes(ptr, length) {
    // Access memory through HEAPU8
    if (!this.module.HEAPU8) {
      throw new Error('WASM HEAPU8 not available');
    }
    // Create a view of the memory at the pointer location
    const heap = new Uint8Array(this.module.HEAPU8.buffer, ptr, length);
    // Copy to a new array to avoid issues with buffer views
    return new Uint8Array(heap);
  }

  _bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    // Browser fallback
    const binary = String.fromCharCode.apply(null, bytes);
    return btoa(binary);
  }

  _base64ToBytes(base64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    // Browser fallback
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

