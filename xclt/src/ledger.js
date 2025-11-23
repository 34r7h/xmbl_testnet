import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Block } from './block.js';
import { Face } from './face.js';
import { Cube } from './cube.js';
import { SuperCube } from './super-cube.js';
import { sortFacesByHash } from './placement.js';
import { Level } from 'level';

export class Ledger extends EventEmitter {
  constructor(options = {}) {
    super();
    const dbPath = options.dbPath || './data/ledger';
    this.db = new Level(dbPath);
    this._dbOpen = false;
    this.cubes = new Map(); // cubeTimestamp (nanoseconds) -> Cube (keyed by timestamp for deterministic placement)
    this.blocks = new Map(); // blockId -> Block
    this.pendingFaces = new Map(); // faceTimestamp (nanoseconds) -> Face (keyed by timestamp, gossiped for deterministic placement)
    this.nextCubeId = 0;
    this.cubesByFaceIndex = new Map(); // faceIndex -> Cube[] (all cubes with this face index, ordered by timestamp - earliest first)
    this.superCubes = new Map(); // level -> Map<cubeTimestamp, SuperCube> (keyed by timestamp)
    this.completedCubesByLevel = new Map(); // level -> Array<Cube> - tracks completed cubes at each level for recursive formation
    this.pendingFacesByLevel = new Map(); // level -> Map<faceTimestamp, Face> - tracks pending faces at each level
    
    // Integration: xid for signature verification
    this.xid = options.xid || null;
    
    // Function to lookup public key by address (for signature verification)
    this.getPublicKeyByAddress = options.getPublicKeyByAddress || null;
    
    // Integration: xn for block propagation
    this.xn = options.xn || null;
    this.blockTopic = options.blockTopic || 'blocks';
    
    // Open database (async, but don't block constructor)
    this._initDb().catch(() => {});
    
    // Subscribe to topics if network available
    if (this.xn && this.xn.started) {
      this.xn.subscribe(this.blockTopic).catch(() => {});
      this.xn.on(`message:${this.blockTopic}`, (data) => {
        this._handleIncomingBlock(data);
      });
      
      // Subscribe to face and cube gossip topics
      this.xn.subscribe(this.faceTopic).catch(() => {});
      this.xn.on(`message:${this.faceTopic}`, (data) => {
        this._handleIncomingFace(data);
      });
      
      this.xn.subscribe(this.cubeTopic).catch(() => {});
      this.xn.on(`message:${this.cubeTopic}`, (data) => {
        this._handleIncomingCube(data);
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

  /**
   * Add a transaction to the ledger
   * @param {Object} tx - Transaction object
   * @returns {Promise<Object>} Block information
   * @emits block:added
   * @emits face:complete
   * @emits cube:complete
   */
  async addTransaction(tx) {
    // Integration: Verify signature if xid available and tx has signature and from address
    if (this.xid && tx.sig && tx.from) {
      try {
        const { Identity } = await import('xid');
        
        // Look up public key from address
        let publicKey = null;
        if (this.getPublicKeyByAddress && typeof this.getPublicKeyByAddress === 'function') {
          publicKey = this.getPublicKeyByAddress(tx.from);
        }
        
        if (publicKey) {
          const isValid = await Identity.verifyTransaction(tx, publicKey);
          if (!isValid) {
            throw new Error('Invalid transaction signature or address mismatch');
          }
        } else {
          // If we can't get public key, skip verification (should not happen in production)
          console.warn('[XCLT] Could not lookup public key for address:', tx.from);
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
    
    // Find or create a face to add this block to
    // Batches of 9 blocks will form a face - order determined by hash sorting
    let face = null;
    for (const [key, f] of this.pendingFaces.entries()) {
      if (f.pendingBlocks.length < 9) {
        if (!face || f.timestamp < face.timestamp) {
          face = f;
        }
      }
    }
    
    // If no face with space exists, create a new one
    if (!face) {
      const faceTimestamp = process.hrtime.bigint();
      face = new Face(0, faceTimestamp); // Temporary index, will be set when cube finalized
      this.pendingFaces.set(faceTimestamp.toString(), face);
      
      // Gossip face creation with timestamp so all validators see deterministic placement
      await this._gossipFace(face);
    }
    
    // Calculate position BEFORE adding block (since addBlock might finalize the face)
    const level = 1;
    const tempPosition = face.pendingBlocks.length; // Position will be this index (0-8)
    
    // Assign temporary face index based on which cube this face will belong to
    // Find the target cube (or create one) to determine face index
    let tempFaceIndex = 0;
    let targetCubeForIndex = null;
    
    if (face.index === undefined || face.index === 0) {
      // Find existing cube with space, or determine we'll create a new one
      const candidateCubes = Array.from(this.cubes.entries())
        .filter(([_, cube]) => cube.faces.size < 3)
        .map(([key, cube]) => ({ key, cube, avgTs: cube.getAverageTimestamp() }))
        .sort((a, b) => {
          const aTs = typeof a.avgTs === 'bigint' ? a.avgTs : BigInt(Math.floor(Number(a.avgTs) * 1000000));
          const bTs = typeof b.avgTs === 'bigint' ? b.avgTs : BigInt(Math.floor(Number(b.avgTs) * 1000000));
          return aTs < bTs ? -1 : aTs > bTs ? 1 : 0;
        });
      
      if (candidateCubes.length > 0) {
        // Face will go to existing cube - use cube's current face count as temp index
        targetCubeForIndex = candidateCubes[0].cube;
        tempFaceIndex = targetCubeForIndex.faces.size; // 0, 1, or 2
      } else {
        // Face will create a new cube - start at index 0
        tempFaceIndex = 0;
      }
    } else {
      tempFaceIndex = face.index;
    }
    
    // Get cube index - use the target cube's key if we found one, otherwise get a new one
    let finalCubeIndex = null;
    if (targetCubeForIndex) {
      // Find the cube key
      for (const [key, cube] of this.cubes.entries()) {
        if (cube === targetCubeForIndex) {
          finalCubeIndex = key;
          break;
        }
      }
    }
    if (!finalCubeIndex) {
      finalCubeIndex = await this._getCubeIndexForFace(0);
    }
    
    // Get cube sequential index for coordinate calculation
    let cubeSequentialIndex = null;
    if (targetCubeForIndex && targetCubeForIndex.index !== undefined) {
      cubeSequentialIndex = targetCubeForIndex.index;
    } else if (finalCubeIndex) {
      // Look up cube to get its sequential index
      const cube = this.cubes.get(finalCubeIndex);
      if (cube && cube.index !== undefined) {
        cubeSequentialIndex = cube.index;
      }
    }
    
    // Set block location IMMEDIATELY with temporary position and face index
    // This ensures coordinates are calculated right away with distinct z-values
    block.setLocation({ 
      faceIndex: tempFaceIndex, 
      position: tempPosition, // Temporary position (0-8), will be updated after sorting
      cubeIndex: finalCubeIndex, 
      cubeSequentialIndex: cubeSequentialIndex, // Store sequential index for coordinate calculation
      level 
    });
    
    // Add block to face - when face has 9 blocks, they're automatically sorted by hash
    const pendingCountBefore = face.pendingBlocks.length;
    face.addBlock(block);
    
    // If face was just finalized (had 8 blocks, now has 9), sort and finalize it
    // After addBlock, if pendingBlocks is empty and blocks.size is 9, face was finalized
    if (pendingCountBefore === 8 && face.pendingBlocks.length === 0 && face.blocks.size === 9) {
      await this._finalizeFace(face);
      // After finalization, position will be updated to final sorted position
    }
    
    // Emit block added event with coordinates (now valid because position is set)
    // Only emit if coordinates are valid
    const coords = block.getCoordinates();
    if (coords && coords.x !== null && coords.y !== null && coords.z !== null && tempPosition >= 0) {
      this.emit('block:added', block);
      const vector = block.getVector();
      console.log(`Block added: ${block.id} at face ${tempFaceIndex}, position ${tempPosition}, coords: (${coords.x}, ${coords.y}, ${coords.z}), vector: ${vector.magnitude.toFixed(2)}`);
    } else {
      console.warn(`Block ${block.id} has invalid coordinates or position: coords=${JSON.stringify(coords)}, position=${tempPosition}`);
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
  
  async _getCubeIndexForFace(faceIndex) {
    // Find which cube this face belongs to or will belong to
    // Find incomplete cube that could accept this face
    for (const [cubeTimestampKey, cube] of this.cubes.entries()) {
      if (cube.faces.size < 3) {
        return cubeTimestampKey; // Return timestamp key
      }
    }
    
    // If not in existing cube, return null (cube will be created when face is finalized)
    return null;
  }

  async _finalizeFace(face) {
    // Store face timestamp key for cleanup
    const faceTimestampKey = face.timestamp.toString();
    
    // If face.blocks already has 9 blocks (sorted by addBlock), use those
    // Otherwise, sort pendingBlocks and assign positions
    let sortedBlocks;
    if (face.blocks.size === 9 && face._sorted) {
      // Face was already sorted by addBlock, just get blocks in order
      sortedBlocks = Array.from({ length: 9 }, (_, i) => face.blocks.get(i));
    } else {
      // Sort blocks by hash and assign final positions (0-8)
      sortedBlocks = Array.from(face.pendingBlocks).sort((a, b) => {
        return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
      });
      
      // Clear and rebuild face.blocks with sorted positions
      face.blocks.clear();
      for (let i = 0; i < sortedBlocks.length; i++) {
        const block = sortedBlocks[i];
        face.blocks.set(i, block); // Position 0-8
      }
      face._sorted = true;
      face.pendingBlocks = []; // Clear pending blocks
    }
    
    // Update all block locations with final sorted positions
    for (let i = 0; i < sortedBlocks.length; i++) {
      const block = sortedBlocks[i];
      if (block && block.location) {
        block.location.position = i;
        block.updateCoordinates(); // Recalculate coordinates with final position
      }
    }
    
    // Get validator average timestamp for this face (from xpc validation)
    // This determines placement - earliest timestamp gets priority
    const faceAvgTimestamp = face.getAverageTimestamp();
    
    // Find or create a cube to add this face to
    // Batches of 3 faces will form a cube - order determined by hash sorting
    let targetCube = null;
    let cubeTimestampKey = null;
    
    // Find existing cube with less than 3 faces (sorted by timestamp for level 1)
    const candidateCubes = Array.from(this.cubes.entries())
      .filter(([_, cube]) => cube.faces.size < 3)
      .map(([key, cube]) => ({ key, cube, avgTs: cube.getAverageTimestamp() }))
      .sort((a, b) => {
        const aTs = typeof a.avgTs === 'bigint' ? a.avgTs : BigInt(Math.floor(Number(a.avgTs) * 1000000));
        const bTs = typeof b.avgTs === 'bigint' ? b.avgTs : BigInt(Math.floor(Number(b.avgTs) * 1000000));
        return aTs < bTs ? -1 : aTs > bTs ? 1 : 0;
      });
    
    if (candidateCubes.length > 0) {
      targetCube = candidateCubes[0].cube;
      cubeTimestampKey = candidateCubes[0].key;
    }
    
    // If no cube found, create a new one with timestamp key
    if (!targetCube) {
      const cubeTimestamp = process.hrtime.bigint();
      targetCube = new Cube(cubeTimestamp);
      cubeTimestampKey = cubeTimestamp.toString();
      // Assign sequential cube index for coordinate calculation
      targetCube.index = this.cubes.size; // Sequential index for positioning
      this.cubes.set(cubeTimestampKey, targetCube);
      
      // Gossip cube creation with timestamp so all validators see deterministic placement
      await this._gossipCube(targetCube);
    }
    
    // Add face to cube (keyed by face timestamp)
    targetCube.addFace(face);
    
    // Update cube's validator average timestamp
    targetCube.validatorAverageTimestamp = targetCube.getAverageTimestamp();
    
    // Update all block locations with final cubeIndex and cube sequential index
    // Note: face.index is still 0 (temporary) until cube is finalized
    // Blocks will get final faceIndex when cube is finalized in _finalizeCube
    for (const [position, block] of face.blocks.entries()) {
      if (block.location) {
        block.location.cubeIndex = cubeTimestampKey;
        block.location.cubeSequentialIndex = targetCube.index; // Store sequential index for coordinate calculation
        // Keep temporary faceIndex for now - will be updated in _finalizeCube
        block.updateCoordinates(); // Recalculate with final cubeIndex
      }
    }
    
    // Clean up pending face (use timestamp key)
    this.pendingFaces.delete(faceTimestampKey);
    
    // Emit face complete event (faceIndex will be set when cube is finalized)
    this.emit('face:complete', { 
      face, 
      faceIndex: face.index, 
      validatorAverageTimestamp: faceAvgTimestamp,
      cubeId: cubeTimestampKey
    });
    console.log(`Face complete with ${face.blocks.size} blocks, validator avg timestamp: ${faceAvgTimestamp}`);
    
    // When cube has 3 faces, sort them by hash and finalize
    if (targetCube.faces.size === 3) {
      await this._finalizeCube(targetCube, cubeTimestampKey);
    }
  }

  async _finalizeCube(cube, cubeTimestampKey) {
    // Sort faces by hash and assign indices 0, 1, 2
    // Lowest hash = front face (0), highest hash = back face (2)
    const faces = Array.from(cube.faces.values());
    const sortedFaces = sortFacesByHash(faces);
    
    // Update face indices in cube
    cube.faces.clear();
    for (const [index, face] of sortedFaces.entries()) {
      face.index = index;
      cube.faces.set(face.timestamp.toString(), face);
    }
    
      // Update block locations with correct face indices and positions
      for (const face of cube.faces.values()) {
        for (const [position, block] of face.blocks.entries()) {
          if (block.location) {
            block.location.faceIndex = face.index;
            block.location.position = position;
            block.location.cubeIndex = cubeTimestampKey;
            block.location.cubeSequentialIndex = cube.index; // Update sequential index
            block.updateCoordinates();
          }
        }
      }
    
    // Mark cube as Level 1 (atomic cube)
    cube.level = 1;
    
    // Store cube state
    const cubeData = {
      id: cube.id,
      merkleRoot: cube.getMerkleRoot(),
      faces: Array.from(cube.faces.values()).map(f => f.index),
      validatorAverageTimestamp: cube.getAverageTimestamp(),
      level: 1 // Level 1 atomic cubes
    };
    
    if (this._dbOpen) {
      try {
        await this.db.put(`cube:${cube.id}`, JSON.stringify(cubeData));
      } catch (error) {
        console.warn('Database not available for cube storage');
      }
    }
    
    // Emit cube complete event with validator timestamp
    this.emit('cube:complete', { 
      cube, 
      cubeId: cubeTimestampKey, // Use timestamp key
      validatorAverageTimestamp: cube.getAverageTimestamp(),
      level: 1
    });
    console.log(`✓ Level 1 cube complete: ${cube.id} with ${cube.faces.size} faces, validator avg timestamp: ${cube.getAverageTimestamp()}`);
    
    // Check if we should form a higher-level cube (recursive - infinite growth)
    await this._checkRecursiveCubeFormation(cube);
  }

  /**
   * RECURSIVE CUBE FORMATION - Infinite growth
   * When 9 cubes complete at level N, they form 1 face at level N+1 (sorted by hash ONLY)
   * When 3 faces complete at level N+1, they form 1 cube at level N+1 (sorted by hash ONLY)
   * Timestamps are ONLY used at level 1 (atomic transactions)
   * For levels 2+, everything is sorted deterministically by hash
   * This continues infinitely - cubes never stop growing
   * @private
   */
  async _checkRecursiveCubeFormation(completedCube) {
    const level = completedCube.level || 1;
    
    // Initialize array for this level if needed
    if (!this.completedCubesByLevel.has(level)) {
      this.completedCubesByLevel.set(level, []);
    }
    
    const completedAtLevel = this.completedCubesByLevel.get(level);
    completedAtLevel.push(completedCube);
    
    console.log(`  → Level ${level}: ${completedAtLevel.length}/9 cubes completed (need 9 for face)`);
    
    // When we have 9 completed cubes at this level, form a face at level+1
    if (completedAtLevel.length >= 9) {
      console.log(`  → Forming Level ${level + 1} face from 9 Level ${level} cubes (hash-sorted)...`);
      await this._formNextLevelFace(level);
    }
  }

  /**
   * Form a face at level N+1 from 9 completed cubes at level N
   * Cubes are sorted by hash ONLY (lowest = position 0, highest = position 8)
   * NO timestamps used - purely deterministic hash-based sorting
   * This is RECURSIVE - when 3 faces complete, they form a cube
   * @private
   */
  async _formNextLevelFace(level) {
    const completedAtLevel = this.completedCubesByLevel.get(level);
    if (!completedAtLevel || completedAtLevel.length < 9) {
      return;
    }

    // For levels 2+, sort ONLY by hash (no timestamps)
    // Take the first 9 cubes and sort by hash for deterministic placement
    const cubesForFace = completedAtLevel.splice(0, 9);
    const nextLevel = level + 1;
    
    // Sort cubes by hash for deterministic placement (lowest = position 0, highest = position 8)
    const hashSortedCubes = cubesForFace.sort((a, b) => {
      const hashA = a.id || createHash('sha256').update(JSON.stringify(a)).digest('hex');
      const hashB = b.id || createHash('sha256').update(JSON.stringify(b)).digest('hex');
      return hashA.localeCompare(hashB);
    });
    
    // Create a face-like structure to hold the 9 cubes
    // Use a Face object but store cubes instead of blocks
    const faceTimestamp = process.hrtime.bigint();
    const higherLevelFace = {
      level: nextLevel,
      timestamp: faceTimestamp,
      index: 0, // Will be set when cube is formed
      cubes: new Map(), // position -> Cube
      getHash: function() {
        // Calculate hash from cube merkle roots sorted by position
        const cubeRoots = Array.from({ length: 9 }, (_, i) => {
          const cube = this.cubes.get(i);
          return cube ? (cube.getMerkleRoot ? cube.getMerkleRoot() : cube.id) : '0'.repeat(64);
        });
        // Calculate merkle root from cube roots
        return this._calculateMerkleRoot(cubeRoots);
      },
      getMerkleRoot: function() {
        return this.getHash();
      },
      _calculateMerkleRoot: function(hashes) {
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
      },
    };
    
    // Assign cubes to positions 0-8 based on hash sort
    for (let i = 0; i < hashSortedCubes.length; i++) {
      higherLevelFace.cubes.set(i, hashSortedCubes[i]);
    }
    
    // Initialize pending faces map for this level if needed
    if (!this.pendingFacesByLevel.has(nextLevel)) {
      this.pendingFacesByLevel.set(nextLevel, new Map());
    }
    
    const pendingFacesAtLevel = this.pendingFacesByLevel.get(nextLevel);
    pendingFacesAtLevel.set(faceTimestamp.toString(), higherLevelFace);
    
    console.log(`✓ Level ${nextLevel} face complete with 9 Level ${level} cubes`);
    
    // Check if we have 3 faces at this level to form a cube
    await this._checkFaceFormation(nextLevel);
  }
  
  /**
   * Check if 3 faces are complete at a level and form a cube
   * Faces are sorted by hash ONLY (lowest = front face 0, highest = back face 2)
   * NO timestamps used - purely deterministic hash-based sorting
   * @private
   */
  async _checkFaceFormation(level) {
    const pendingFacesAtLevel = this.pendingFacesByLevel.get(level);
    if (!pendingFacesAtLevel || pendingFacesAtLevel.size < 3) {
      return;
    }
    
    // For levels 2+, sort ONLY by hash (no timestamps)
    // Get 3 faces and sort by hash for deterministic placement
    const faces = Array.from(pendingFacesAtLevel.values()).slice(0, 3);
    
    // Remove these faces from pending
    for (const face of faces) {
      pendingFacesAtLevel.delete(face.timestamp.toString());
    }
    
    // Sort faces by hash (lowest = front face 0, highest = back face 2)
    const sortedFaces = sortFacesByHash(faces);
    
    // Create cube at this level
    await this._formCubeFromFaces(level, sortedFaces);
  }
  
  /**
   * Form a cube from 3 faces at a given level
   * @private
   */
  async _formCubeFromFaces(level, sortedFaces) {
    const cubeTimestamp = process.hrtime.bigint();
    const cube = new SuperCube(level);
    cube.timestamp = cubeTimestamp;
    
    // Add faces to cube (faces already have indices 0, 1, 2 from sorting)
    for (const [faceIndex, face] of sortedFaces.entries()) {
      face.index = faceIndex;
      // Store face in cube (using a faces map similar to Level 1 cubes)
      if (!cube.faces) {
        cube.faces = new Map();
      }
      cube.faces.set(face.timestamp.toString(), face);
    }
    
    // Calculate cube ID from face hashes
    const faceRoots = Array.from(sortedFaces.values())
      .map(face => face.getMerkleRoot())
      .join('');
    cube.id = createHash('sha256').update(faceRoots).digest('hex').substring(0, 16);
    
    // For levels 2+, no timestamps - everything is hash-based
    cube.validatorAverageTimestamp = null;
    
    // Initialize super-cubes map for this level if needed
    if (!this.superCubes.has(level)) {
      this.superCubes.set(level, new Map());
    }
    
    const cubesAtLevel = this.superCubes.get(level);
    cubesAtLevel.set(cubeTimestamp.toString(), cube);
    
    console.log(`✓ Level ${level} cube complete with 3 faces (hash-sorted)`);
    
    // Emit event for cube completion
    this.emit('supercube:complete', { 
      level: level, 
      cube: cube
    });
    
    // RECURSIVE: When this cube completes, check if we should form level N+1 faces
    // This continues infinitely - cubes never stop growing
    await this._checkRecursiveCubeFormation(cube);
    
    // Also check if we can form more faces at this level (in case we have more pending faces)
    await this._checkFaceFormation(level);
  }

  /**
   * Get position of a cube in the next level using the SAME placement logic
   * This is dimension-agnostic - works at all levels
   * Uses the cube ID (hash) to determine placement, just like blocks
   * @private
   */
  _getCubePositionInNextLevel(cubeId, index) {
    // For recursive cube formation, cubes are sorted by hash
    // Position is determined by sorted order (0-26)
    // This maintains the recursive fractal structure
    return index;
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

  /**
   * Gossip face creation with timestamp so all validators see deterministic placement
   * Faces are keyed by nanosecond timestamps and gossiped for consensus
   */
  async _gossipFace(face) {
    if (!this.xn || !this.xn.started) return;
    
    try {
      // Only level 1 faces have timestamps
      const avgTs = face.getAverageTimestamp ? face.getAverageTimestamp() : null;
      const faceData = {
        index: face.index,
        timestamp: face.timestamp.toString(), // Nanosecond timestamp as string
        blockCount: face.blocks ? face.blocks.size : (face.cubes ? face.cubes.size : 0),
        averageTimestamp: avgTs ? avgTs.toString() : null,
        blocks: face.blocks ? Array.from(face.blocks.entries()).map(([pos, block]) => ({
          position: pos,
          blockId: block.id,
          timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
        })) : []
      };
      
      await this.xn.publish(this.faceTopic, {
        type: 'face:created',
        face: faceData
      });
    } catch (error) {
      // Gossip failure shouldn't block ledger operations
      console.warn('Failed to gossip face:', error.message);
    }
  }

  /**
   * Gossip cube creation with timestamp so all validators see deterministic placement
   * Cubes are keyed by nanosecond timestamps and gossiped for consensus
   */
  async _gossipCube(cube) {
    if (!this.xn || !this.xn.started) return;
    
    try {
      // Only level 1 cubes have timestamps
      const avgTs = cube.getAverageTimestamp ? cube.getAverageTimestamp() : null;
      const cubeData = {
        timestamp: cube.timestamp.toString(), // Nanosecond timestamp as string
        level: cube.level || 1,
        faceCount: cube.faces ? cube.faces.size : 0,
        averageTimestamp: avgTs ? avgTs.toString() : null,
        faces: cube.faces ? Array.from(cube.faces.entries()).map(([ts, face]) => ({
          timestamp: ts,
          index: face.index,
          blockCount: face.blocks ? face.blocks.size : (face.cubes ? face.cubes.size : 0)
        })) : []
      };
      
      await this.xn.publish(this.cubeTopic, {
        type: 'cube:created',
        cube: cubeData
      });
    } catch (error) {
      // Gossip failure shouldn't block ledger operations
      console.warn('Failed to gossip cube:', error.message);
    }
  }

  /**
   * Handle incoming face gossip - update local state if face is earlier (deterministic placement)
   */
  async _handleIncomingFace(data) {
    if (!data.face) return;
    
    const faceTimestamp = BigInt(data.face.timestamp);
    const existingFace = this.pendingFaces.get(faceTimestamp.toString());
    
    // If we don't have this face, or incoming face is earlier, update our state
    if (!existingFace || faceTimestamp < existingFace.timestamp) {
      // Create face from gossip data
      const face = new Face(data.face.index, faceTimestamp);
      // Note: We'd need to reconstruct blocks from blockIds, but for now just track the face
      this.pendingFaces.set(faceTimestamp.toString(), face);
    }
  }

  /**
   * Handle incoming cube gossip - update local state if cube is earlier (deterministic placement)
   */
  async _handleIncomingCube(data) {
    if (!data.cube) return;
    
    const cubeTimestamp = BigInt(data.cube.timestamp);
    const existingCube = this.cubes.get(cubeTimestamp.toString());
    
    // If we don't have this cube, or incoming cube is earlier, update our state
    if (!existingCube || cubeTimestamp < existingCube.timestamp) {
      // Create cube from gossip data
      const cube = new Cube(cubeTimestamp);
      cube.level = data.cube.level || 1;
      // Note: We'd need to reconstruct faces from face data, but for now just track the cube
      this.cubes.set(cubeTimestamp.toString(), cube);
    }
  }
}

