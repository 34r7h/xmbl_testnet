import { createHash } from 'crypto';
import { Level } from 'level';

class VerkleNode {
  constructor() {
    this.children = new Map();
    this.value = null;
    this.hash = null;
  }
}

export class VerkleStateTree {
  constructor(options = {}) {
    this.root = new VerkleNode();
    this.state = new Map(); // key -> value
    this.db = options.db || null;
    this._dbOpen = false;
    
    if (this.db) {
      this._initDb().catch(() => {});
    }
  }
  
  async _initDb() {
    try {
      if (this.db && typeof this.db.open === 'function') {
        await this.db.open();
      }
      this._dbOpen = true;
      await this._loadState();
    } catch (error) {
      this._dbOpen = false;
    }
  }
  
  async _loadState() {
    if (!this.db || !this._dbOpen) return;
    
    try {
      for await (const [key, value] of this.db.iterator({ gt: 'state:', lt: 'state:\xFF' })) {
        const stateKey = key.toString().substring(6); // Remove 'state:' prefix
        const stateValue = JSON.parse(value.toString());
        this.state.set(stateKey, stateValue);
      }
    } catch (error) {
      // Ignore errors during load
    }
  }
  
  async _saveState(key, value) {
    if (!this.db || !this._dbOpen) return;
    
    try {
      await this.db.put(`state:${key}`, JSON.stringify(value));
    } catch (error) {
      // Ignore save errors
    }
  }
  
  async _deleteState(key) {
    if (!this.db || !this._dbOpen) return;
    
    try {
      await this.db.del(`state:${key}`);
    } catch (error) {
      // Ignore delete errors
    }
  }

  async insert(key, value) {
    this.state.set(key, value);
    await this._saveState(key, value);
    const keyHash = this._hashKey(key);
    const valueHash = this._hashValue(value);
    const path = [];
    this._insertNode(this.root, keyHash, valueHash, 0, path);
    // Only update hashes along the insertion path
    this._updateHashPath(path);
  }

  get(key) {
    return this.state.get(key);
  }

  async delete(key) {
    this.state.delete(key);
    await this._deleteState(key);
    const keyHash = this._hashKey(key);
    const path = [];
    this._deleteNode(this.root, keyHash, 0, path);
    // Only update hashes along the deletion path
    this._updateHashPath(path);
  }

  generateProof(key) {
    const keyHash = this._hashKey(key);
    const value = this.state.get(key);
    if (value === undefined) {
      throw new Error(`Key ${key} not found in state tree`);
    }
    const path = [];
    const valueHash = this._hashValue(value);
    this._generateProofPath(this.root, keyHash, path, 0);
    return {
      root: this.root.hash ? this.root.hash.toString('hex') : null,
      path: path,
      key: keyHash.toString('hex'),
      valueHash: valueHash.toString('hex')
    };
  }

  static verifyProof(key, value, proof) {
    const keyHash = VerkleStateTree._hashKey(key);
    const valueHash = VerkleStateTree._hashValue(value);
    
    if (valueHash.toString('hex') !== proof.valueHash) {
      return false;
    }
    
    // Reconstruct hash by following the path from leaf to root
    let currentHash = valueHash;
    let depth = 31; // Start from leaf depth
    
    for (let i = proof.path.length - 1; i >= 0; i--) {
      const pathNode = proof.path[i];
      const nibble = keyHash[depth];
      
      // Build children array for this node (256 children)
      const childrenHashes = [];
      for (let j = 0; j < 256; j++) {
        if (j === nibble) {
          childrenHashes.push(currentHash);
        } else {
          // Find sibling hash
          const sibling = pathNode.siblings.find(s => s.nibble === j);
          if (sibling) {
            childrenHashes.push(Buffer.from(sibling.hash, 'hex'));
          } else {
            childrenHashes.push(Buffer.alloc(32));
          }
        }
      }
      
      const combined = Buffer.concat(childrenHashes);
      currentHash = createHash('sha256').update(combined).digest();
      depth--;
    }
    
    const rootHash = Buffer.from(proof.root, 'hex');
    return currentHash.equals(rootHash);
  }

  getRoot() {
    if (!this.root.hash) {
      // Initialize empty root hash
      this._updateHash(this.root);
    }
    return this.root.hash ? this.root.hash.toString('hex') : '0'.repeat(64);
  }

  _insertNode(node, keyHash, valueHash, depth, path) {
    path.push(node);
    if (depth >= 32) {
      node.value = valueHash;
      return;
    }

    const nibble = keyHash[depth];
    if (!node.children.has(nibble)) {
      node.children.set(nibble, new VerkleNode());
    }
    
    this._insertNode(node.children.get(nibble), keyHash, valueHash, depth + 1, path);
  }

  _updateHashPath(path) {
    // Update hashes from leaf to root
    for (let i = path.length - 1; i >= 0; i--) {
      this._updateHash(path[i]);
    }
  }

  _deleteNode(node, keyHash, depth, path) {
    path.push(node);
    if (depth >= 32) {
      node.value = null;
      return;
    }

    const nibble = keyHash[depth];
    if (node.children.has(nibble)) {
      this._deleteNode(node.children.get(nibble), keyHash, depth + 1, path);
      if (node.children.get(nibble).children.size === 0 && !node.children.get(nibble).value) {
        node.children.delete(nibble);
      }
    }
  }

  _generateProofPath(node, keyHash, path, depth) {
    if (depth >= 32) {
      return;
    }

    const nibble = keyHash[depth];
    const child = node.children.get(nibble);
    
    if (child) {
      // Collect sibling hashes
      const siblings = [];
      for (const [n, childNode] of node.children.entries()) {
        if (n !== nibble && childNode.hash) {
          siblings.push({ nibble: n, hash: childNode.hash.toString('hex') });
        }
      }
      
      path.push({ depth, siblings });
      this._generateProofPath(child, keyHash, path, depth + 1);
    }
  }

  _updateHash(node) {
    if (node.value) {
      node.hash = node.value;
      return;
    }

    if (node.children.size === 0) {
      node.hash = Buffer.alloc(32);
      return;
    }

    const childrenHashes = [];
    for (let i = 0; i < 256; i++) {
      const child = node.children.get(i);
      if (child) {
        // Only update if hash is not set (lazy evaluation)
        if (!child.hash) {
          this._updateHash(child);
        }
        childrenHashes.push(child.hash);
      } else {
        childrenHashes.push(Buffer.alloc(32));
      }
    }

    const combined = Buffer.concat(childrenHashes);
    node.hash = createHash('sha256').update(combined).digest();
  }

  static _hashKey(key) {
    return createHash('sha256').update(key).digest();
  }

  static _hashValue(value) {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    return createHash('sha256').update(valueStr).digest();
  }

  _hashKey(key) {
    return VerkleStateTree._hashKey(key);
  }

  _hashValue(value) {
    return VerkleStateTree._hashValue(value);
  }
}

