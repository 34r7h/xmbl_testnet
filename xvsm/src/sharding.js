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

