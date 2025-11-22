import fs from 'fs/promises';
import path from 'path';
import { Identity } from './identity.js';
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

