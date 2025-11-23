import { createHash } from 'crypto';
import { calculateDigitalRoot, calculateDigitalRootFromHash } from './digital-root.js';
import { validateTransaction } from './transaction-validator.js';
import { calculateAbsoluteCoords, calculateVector, calculateFractalAddress } from './geometry.js';

export class Block {
  constructor(id, tx, hash, digitalRoot, timestamp = null, location = null) {
    this.id = id;
    this.tx = tx;
    this.txId = tx?.id || null; // Extract id from transaction object
    this.hash = hash;
    this.digitalRoot = digitalRoot;
    this.timestamp = timestamp || Date.now();
    this.location = location; // { faceIndex, position, cubeIndex, level }
    this.coordinates = null; // { x, y, z }
    this.vector = null; // { x, y, z, magnitude, direction }
    this.fractalAddress = null; // Array of hierarchical path
    
    // Calculate coordinates if location is provided
    if (location) {
      this.updateCoordinates();
    }
  }
  
  updateCoordinates() {
    if (!this.location) return;
    
    this.coordinates = calculateAbsoluteCoords(this.location);
    this.vector = calculateVector(this.coordinates);
    this.fractalAddress = calculateFractalAddress(this.location);
  }
  
  setLocation(location) {
    this.location = location;
    this.updateCoordinates();
  }
  
  getCoordinates() {
    // Always return valid coordinates (geometry functions handle invalid positions)
    return this.coordinates || { x: 0, y: 0, z: 0 };
  }
  
  getVector() {
    return this.vector || { x: 0, y: 0, z: 0, magnitude: 0, direction: { x: 0, y: 0, z: 0 } };
  }
  
  getFractalAddress() {
    return this.fractalAddress || [];
  }

  static fromTransaction(tx) {
    // Validate transaction type
    validateTransaction(tx);

    // Serialize BigInt values before stringifying
    const serialized = Block._serializeBigInts(tx);
    const txStr = JSON.stringify(serialized);
    const hash = createHash('sha256').update(txStr).digest('hex');
    const id = hash.substring(0, 16);
    
    // Digital root is no longer used for placement (hash-based sorting instead)
    // Keep for backward compatibility only
    const digitalRoot = tx.digitalRoot || 0;
    
    // Use validator average timestamp if available (from xpc, nanoseconds), otherwise use tx timestamp or current time
    const timestamp = tx.validationTimestamp || tx.timestamp || process.hrtime.bigint();
    
    return new Block(id, tx, hash, digitalRoot, timestamp);
  }

  serialize() {
    return JSON.stringify({
      id: this.id,
      tx: this.tx,
      hash: this.hash,
      digitalRoot: this.digitalRoot,
      timestamp: this.timestamp,
      location: this.location,
      coordinates: this.coordinates,
      vector: this.vector,
      fractalAddress: this.fractalAddress
    });
  }

  static deserialize(data) {
    const obj = JSON.parse(data);
    const block = new Block(obj.id, obj.tx, obj.hash, obj.digitalRoot, obj.timestamp, obj.location);
    // Restore calculated values if present
    if (obj.coordinates) block.coordinates = obj.coordinates;
    if (obj.vector) block.vector = obj.vector;
    if (obj.fractalAddress) block.fractalAddress = obj.fractalAddress;
    return block;
  }

  static _serializeBigInts(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(item => Block._serializeBigInts(item));
    if (typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = Block._serializeBigInts(value);
      }
      return result;
    }
    return obj;
  }
}

