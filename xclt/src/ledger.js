import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Block } from './block.js';
import { Face } from './face.js';
import { Cube } from './cube.js';
import { getFaceIndex, getBlockPosition } from './placement.js';
import { Level } from 'level';

export class Ledger extends EventEmitter {
  constructor(options = {}) {
    super();
    const dbPath = options.dbPath || './data/ledger';
    this.db = new Level(dbPath);
    this._dbOpen = false;
    this.cubes = new Map(); // cubeId -> Cube
    this.blocks = new Map(); // blockId -> Block
    this.pendingFaces = new Map(); // faceIndex -> Face
    this.parallelCubes = new Map(); // faceIndex -> Cube[] (array of parallel cubes for same face index)
    this.nextCubeId = 0;
    
    // Integration: xid for signature verification
    this.xid = options.xid || null;
    
    // Integration: xn for block propagation
    this.xn = options.xn || null;
    this.blockTopic = options.blockTopic || 'blocks';
    
    // Open database (async, but don't block constructor)
    this._initDb().catch(() => {});
    
    // Subscribe to block topic if network available
    if (this.xn && this.xn.started) {
      this.xn.subscribe(this.blockTopic).catch(() => {});
      this.xn.on(`message:${this.blockTopic}`, (data) => {
        this._handleIncomingBlock(data);
      });
    }
  }
  
  async _initDb() {
    try {
      await this.db.open();
      this._dbOpen = true;
    } catch (error) {
      // Database might already be open
      this._dbOpen = true;
    }
  }

  async addTransaction(tx) {
    // Integration: Verify signature if xid available and tx has signature
    if (this.xid && tx.sig && tx.publicKey) {
      try {
        const { Identity } = await import('xid');
        const isValid = await Identity.verifyTransaction(tx, tx.publicKey);
        if (!isValid) {
          throw new Error('Invalid transaction signature');
        }
      } catch (error) {
        // If xid module not available, skip verification
        if (error.code !== 'ERR_MODULE_NOT_FOUND' && !error.message.includes('Base64')) {
          throw error;
        }
      }
    }
    
    const block = Block.fromTransaction(tx);
    this.blocks.set(block.id, block);
    
    // Determine face index and position
    const faceIndex = getFaceIndex(block.id);
    const position = getBlockPosition(block.id, block.digitalRoot);
    
    // Try to add to existing pending face
    let face = this.pendingFaces.get(faceIndex);
    let addedToFace = false;
    let finalCubeIndex = null;
    
    if (face) {
      const result = face.addBlock(block);
      
      if (result.conflict && !result.resolved) {
        // Position conflict, later timestamp - need parallel cube
        face = await this._createParallelFace(faceIndex, block);
        addedToFace = true;
        finalCubeIndex = await this._getCubeIndexForFace(faceIndex, true); // parallel
      } else if (result.conflict && result.resolved) {
        // Position conflict, earlier timestamp - block replaced existing
        // Displaced block needs to go to parallel cube
        if (result.displacedBlock) {
          await this._handleDisplacedBlock(faceIndex, result.displacedBlock);
        }
        addedToFace = true;
        finalCubeIndex = await this._getCubeIndexForFace(faceIndex);
      } else {
        // No conflict, added normally
        addedToFace = true;
        finalCubeIndex = await this._getCubeIndexForFace(faceIndex);
      }
    }
    
    // If no face exists or couldn't add to existing, create new face
    if (!addedToFace) {
      face = new Face(faceIndex);
      face.addBlock(block);
      this.pendingFaces.set(faceIndex, face);
      finalCubeIndex = await this._getCubeIndexForFace(faceIndex);
    }
    
    // Set block location and calculate coordinates
    const level = 1; // Current implementation is Level 1 (atomic cubes)
    block.setLocation({ faceIndex, position, cubeIndex: finalCubeIndex, level });
    
    // Emit block added event with coordinates
    this.emit('block:added', block);
    const coords = block.getCoordinates();
    const vector = block.getVector();
    console.log(`Block added: ${block.id} at face ${faceIndex}, position ${position}, coords: (${coords.x}, ${coords.y}, ${coords.z}), vector: ${vector.magnitude.toFixed(2)}`);
    
    // Check if face is complete
    if (face.isComplete()) {
      await this._finalizeFace(face);
    }
    
    // Persist block with coordinates
    if (this._dbOpen) {
      try {
        await this.db.put(`block:${block.id}`, block.serialize());
      } catch (error) {
        // If DB not open, just use in-memory
        console.warn('Database not available, using in-memory storage');
      }
    }
    
    // Integration: Propagate block over network if xn available and started
    if (this.xn && this.xn.started) {
      try {
        await this.xn.publish(this.blockTopic, {
          blockId: block.id,
          block: block.serialize()
        });
      } catch (error) {
        // Network propagation failure shouldn't block ledger addition
        // Silently handle network errors
      }
    }
    
    return {
      blockId: block.id,
      coordinates: block.getCoordinates(),
      vector: block.getVector(),
      fractalAddress: block.getFractalAddress()
    };
  }
  
  async _handleIncomingBlock(data) {
    // Handle incoming block from network
    if (data.blockId && data.block) {
      try {
        const block = Block.deserialize(data.block);
        // Check if block already exists
        const existing = await this.getBlock(block.id);
        if (!existing) {
          // Add block to ledger
          await this.addTransaction(block.tx);
        }
      } catch (error) {
        console.warn('Failed to handle incoming block:', error.message);
      }
    }
  }
  
  async _getCubeIndexForFace(faceIndex, isParallel = false) {
    // Find which cube this face belongs to or will belong to
    // For now, simple calculation - will be enhanced for parallel cubes
    for (const [cubeId, cube] of this.cubes.entries()) {
      if (cube.getFace(faceIndex)) {
        return cubeId;
      }
    }
    
    // If not in existing cube, calculate based on face index
    // Faces 0,1,2 -> cube 0, faces 3,4,5 -> cube 1, etc.
    // For parallel cubes, use next available cube ID
    if (isParallel) {
      return this.nextCubeId;
    }
    return Math.floor(faceIndex / 3);
  }
  
  async _createParallelFace(faceIndex, block) {
    // Create a new face in a parallel cube for this face index
    const newFace = new Face(faceIndex);
    newFace.addBlock(block);
    
    // Store in pending faces with a unique key for parallel construction
    const parallelKey = `${faceIndex}-parallel-${Date.now()}`;
    this.pendingFaces.set(parallelKey, newFace);
    
    return newFace;
  }
  
  async _handleDisplacedBlock(faceIndex, displacedBlock) {
    // Displaced block needs to go to a parallel cube
    await this._createParallelFace(faceIndex, displacedBlock);
  }

  async _finalizeFace(face) {
    const faceIndex = typeof face.index === 'string' && face.index.includes('-parallel-') 
      ? parseInt(face.index.split('-')[0]) 
      : face.index;
    
    // Check if this face index already exists in any cube
    let targetCube = null;
    let cubeId = null;
    
    // Find existing cube with this face index, or create new parallel cube
    for (const [id, cube] of this.cubes.entries()) {
      if (cube.getFace(faceIndex)) {
        // Face index already exists - need parallel cube
        // Check timestamp to determine ordering
        const existingFace = cube.getFace(faceIndex);
        if (face.getAverageTimestamp() < existingFace.getAverageTimestamp()) {
          // New face has earlier timestamp - should be in earlier cube
          // Create new cube before this one
          targetCube = new Cube();
          cubeId = this.nextCubeId++;
          this.cubes.set(cubeId, targetCube);
          break;
        } else {
          // New face has later timestamp - create parallel cube after
          continue;
        }
      }
    }
    
    // If no target cube found, find or create appropriate cube
    if (!targetCube) {
      // Try to find a cube that can accept this face index
      for (const [id, cube] of this.cubes.entries()) {
        if (!cube.getFace(faceIndex) && cube.faces.size < 3) {
          // Cube exists and doesn't have this face index yet
          targetCube = cube;
          cubeId = id;
          break;
        }
      }
      
      // If still no cube, create new one
      if (!targetCube) {
        targetCube = new Cube();
        cubeId = this.nextCubeId++;
        this.cubes.set(cubeId, targetCube);
      }
    }
    
    // Add face to cube
    targetCube.addFace(face);
    
    // Clean up pending face
    const pendingKey = typeof face.index === 'string' ? face.index : face.index;
    this.pendingFaces.delete(pendingKey);
    
    // Emit face complete event
    this.emit('face:complete', face);
    console.log(`Face complete: ${faceIndex} with ${face.blocks.size} blocks`);
    
    // Check if cube is complete
    if (targetCube.isComplete()) {
      await this._finalizeCube(targetCube);
    }
  }

  async _finalizeCube(cube) {
    // Store cube state
    const cubeData = {
      id: cube.id,
      merkleRoot: cube.getMerkleRoot(),
      faces: Array.from(cube.faces.values()).map(f => f.index)
    };
    await this.db.put(`cube:${cube.id}`, JSON.stringify(cubeData));
    
    // Emit cube complete event
    this.emit('cube:complete', cube);
    console.log(`Cube complete: ${cube.id} with ${cube.faces.size} faces`);
  }

  async getBlock(blockId) {
    if (this._dbOpen) {
      try {
        const data = await this.db.get(`block:${blockId}`);
        return Block.deserialize(data);
      } catch (error) {
        // Check in-memory cache
      }
    }
    return this.blocks.get(blockId) || null;
  }
  
  async getBlockCoordinates(blockId) {
    const block = await this.getBlock(blockId);
    if (!block) return null;
    
    return {
      coordinates: block.getCoordinates(),
      vector: block.getVector(),
      fractalAddress: block.getFractalAddress()
    };
  }

  async getCubes() {
    // Return cubes sorted by average timestamp of their blocks
    const cubes = Array.from(this.cubes.values());
    return cubes.sort((a, b) => {
      const avgA = this._getCubeAverageTimestamp(a);
      const avgB = this._getCubeAverageTimestamp(b);
      return avgA - avgB;
    });
  }
  
  _getCubeAverageTimestamp(cube) {
    const allTimestamps = [];
    for (const face of cube.faces.values()) {
      for (const block of face.blocks.values()) {
        allTimestamps.push(block.timestamp);
      }
    }
    if (allTimestamps.length === 0) return 0;
    return allTimestamps.reduce((sum, ts) => sum + ts, 0) / allTimestamps.length;
  }

  async getStateRoot() {
    const cubeRoots = Array.from(this.cubes.values())
      .map(cube => cube.getMerkleRoot())
      .filter(root => root !== null)
      .sort();
    
    if (cubeRoots.length === 0) {
      return '0'.repeat(64);
    }
    
    return this._calculateMerkleRoot(cubeRoots);
  }

  _calculateMerkleRoot(hashes) {
    if (hashes.length === 1) return hashes[0];
    const nextLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || left;
      const combined = createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }
    return this._calculateMerkleRoot(nextLevel);
  }
}

