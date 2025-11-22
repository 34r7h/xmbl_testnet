import { MAYOWasm } from './wasm-wrapper.js';
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
    const pkBytes = this._base64ToBytes(publicKey);
    const hash = createHash('sha256').update(pkBytes).digest('hex');
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

