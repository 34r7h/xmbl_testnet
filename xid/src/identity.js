import { MAYOWasm } from './wasm-wrapper.js';
import { createHash } from 'crypto';

/**
 * Identity class for XMBL
 * Manages MAYO post-quantum cryptographic identities
 * @class Identity
 */
export class Identity {
  /**
   * Create a new Identity instance
   * @param {string} publicKey - Base64-encoded MAYO public key
   * @param {string} privateKey - Base64-encoded MAYO private key
   */
  constructor(publicKey, privateKey) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.address = this._deriveAddress(publicKey);
  }

  /**
   * Create a new identity with generated keypair
   * @returns {Promise<Identity>} New identity instance
   */
  static async create() {
    const mayo = await MAYOWasm.load();
    const keypair = await mayo.keygen();
    return new Identity(keypair.publicKey, keypair.privateKey);
  }

  /**
   * Create identity from public key only (verification only)
   * @param {string} publicKey - Base64-encoded MAYO public key
   * @returns {Identity} Identity instance
   */
  static fromPublicKey(publicKey) {
    return new Identity(publicKey, null);
  }

  /**
   * Create identity from private key
   * @param {string} privateKey - Base64-encoded MAYO private key
   * @throws {Error} Not implemented
   */
  static fromPrivateKey(privateKey) {
    // Derive public key from private key (MAYO specific)
    // For now, assume we store both
    throw new Error('Not implemented: derive public from private');
  }

  /**
   * Derive XMBL address from public key
   * @param {string} publicKey - Base64-encoded public key
   * @returns {string} XMBL address (xmb prefix + 40 hex chars)
   */
  static deriveAddress(publicKey) {
    if (!publicKey) {
      throw new Error('Public key is required to derive address');
    }
    // Hash public key to get address
    const pkBytes = Identity._base64ToBytesStatic(publicKey);
    const hash = createHash('sha256').update(pkBytes).digest('hex');
    return 'xmb' + hash.substring(0, 40); // XMBL address prefix
  }

  /**
   * Derive XMBL address from public key (instance method)
   * @private
   * @param {string} publicKey - Base64-encoded public key
   * @returns {string} XMBL address (xmb prefix + 40 hex chars)
   */
  _deriveAddress(publicKey) {
    return Identity.deriveAddress(publicKey);
  }

  /**
   * Static helper to convert base64 to bytes
   * @private
   */
  static _base64ToBytesStatic(base64) {
    if (!base64) {
      throw new Error('Base64 string is required');
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64');
    }
    // Browser fallback
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Sign a transaction with MAYO signature
   * @param {Object} tx - Transaction object (must have from field set to this.address)
   * @returns {Promise<Object>} Transaction with signature added (NO publicKey field)
   */
  async signTransaction(tx) {
    const mayo = await MAYOWasm.load();
    // Ensure from address is set to this identity's address
    const txWithAddress = { ...tx, from: this.address };
    // Create message to sign (tx without sig and publicKey fields)
    const { sig, publicKey, ...txWithoutSig } = txWithAddress;
    const message = JSON.stringify(txWithoutSig);
    const messageBytes = new TextEncoder().encode(message);
    const signature = await mayo.sign(messageBytes, this.privateKey);
    // Return transaction with signature, but NO publicKey
    return { ...txWithAddress, sig: signature };
  }

  /**
   * Verify a signed transaction and check that signer owns the from address
   * @param {Object} signedTx - Signed transaction object (must have sig and from fields)
   * @param {string} publicKey - Base64-encoded public key to verify signature
   * @returns {Promise<boolean>} True if signature is valid AND public key derives to from address
   */
  static async verifyTransaction(signedTx, publicKey) {
    if (!signedTx.sig || !signedTx.from) {
      return false;
    }
    
    const mayo = await MAYOWasm.load();
    const { sig, ...txWithoutSig } = signedTx;
    const message = JSON.stringify(txWithoutSig);
    const messageBytes = new TextEncoder().encode(message);
    
    // Verify signature
    const isValidSig = await mayo.verify(messageBytes, sig, publicKey);
    if (!isValidSig) {
      return false;
    }
    
    // Verify that public key derives to the from address
    const derivedAddress = Identity.deriveAddress(publicKey);
    return derivedAddress === signedTx.from;
  }

  _base64ToBytes(base64) {
    if (!base64) {
      throw new Error('Base64 string is required');
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64');
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

