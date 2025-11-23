import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SystemSimulator } from '../xsim/index.js';
import { Ledger } from '../xclt/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

let simulator = null;
let ledger = null;

// Helper to serialize BigInt values
function serializeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

// Initialize simulator and ledger
async function initialize() {
  try {
    // Clear database on startup for fresh simulation
    const dbPath = path.join(__dirname, '..', 'xclt', 'data', 'ledger');
    if (fs.existsSync(dbPath)) {
      console.log('[SERVER] Clearing ledger database for fresh start...');
      fs.rmSync(dbPath, { recursive: true, force: true });
    }
    
    // Initialize simulator first
    simulator = new SystemSimulator({
      initialIdentities: 10,
      transactionRate: 2,
      stateDiffRate: 1,
      storageOpRate: 0.5,
      computeOpRate: 0.5,
      useRealModules: true
    });

    // Start simulator to initialize modules
    await simulator.start();
    
    // Get ledger from simulator after it's initialized
    ledger = simulator.modules.xclt;
    
    if (!ledger) {
      console.error('[SERVER] Ledger not available from simulator');
      return;
    }

    // Listen to ledger events
    ledger.on('block:added', (block) => {
      const coords = block.getCoordinates();
      const vector = block.getVector();
      
      // All blocks should have valid coordinates now
      if (!coords) {
        console.warn('[SERVER] Block missing coordinates:', block.id, 'location:', block.location);
        return;
      }
      
      console.log('[SERVER] Block added:', block.id, 'coords:', coords, 'location:', block.location);
      const blockData = {
        id: block.id,
        txId: block.txId,
        coordinates: coords,
        vector: vector,
        location: block.location,
        timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
      };
      io.emit('xclt:block:added', serializeBigInt(blockData));
    });

    ledger.on('face:complete', async (data) => {
      const face = data.face || data;
      const faceIndex = face.index || data.faceIndex;
      
      console.log('[SERVER] Face complete:', faceIndex, 'blocks:', face.blocks?.size || 0);
      
      // Emit face complete event
      const faceData = {
        faceIndex: faceIndex,
        blockCount: face.blocks?.size || 0,
        timestamp: typeof (face.timestamp || data.timestamp) === 'bigint' 
          ? (face.timestamp || data.timestamp).toString() 
          : (face.timestamp || data.timestamp)
      };
      io.emit('xclt:face:complete', serializeBigInt(faceData));
      
      // Emit updated block positions for all blocks in this face
      if (face && face.blocks && face.blocks.size > 0) {
        console.log(`[SERVER] Emitting ${face.blocks.size} block position updates for face ${faceIndex}`);
        for (const [position, block] of face.blocks.entries()) {
          // Update block location with final position
          if (block.location) {
            block.location.faceIndex = faceIndex;
            block.location.position = position;
            block.updateCoordinates();
          }
          const finalCoords = block.getCoordinates();
          const finalVector = block.getVector();
          const blockData = {
            id: block.id,
            txId: block.txId,
            coordinates: finalCoords,
            vector: finalVector,
            location: block.location,
            timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
          };
          io.emit('xclt:block:updated', serializeBigInt(blockData));
        }
      }
    });
    
    ledger.on('cube:complete', async (data) => {
      const cubeId = data.cubeId || data.id;
      const level = data.level || 1;
      
      console.log(`[SERVER] Cube complete: ${cubeId} (Level ${level})`);
      
      // Emit cube complete event
      io.emit('xclt:cube:complete', {
        cubeId: cubeId,
        level: level,
        faceCount: data.faceCount || 3
      });
      
      // Request all block positions for this cube will be handled by client request
    });
    
    // Handle client requests for face blocks
    io.on('connection', (socket) => {
      socket.on('request:face:blocks', async (data) => {
        const { faceIndex } = data;
        console.log(`[SERVER] Client requested blocks for face ${faceIndex}`);
        if (ledger && ledger.faces) {
          // Find face in all cubes
          for (const cube of ledger.cubes.values()) {
            for (const face of cube.faces.values()) {
              if (face.index === faceIndex) {
                for (const [position, block] of face.blocks.entries()) {
                  const coords = block.getCoordinates();
                  const vector = block.getVector();
                  const blockData = {
                    id: block.id,
                    txId: block.txId,
                    coordinates: coords,
                    vector: vector,
                    location: block.location,
                    timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
                  };
                  socket.emit('xclt:block:updated', serializeBigInt(blockData));
                }
                return;
              }
            }
          }
        }
      });
      
      socket.on('request:cube:blocks', async (data) => {
        const { cubeId, level } = data;
        console.log(`[SERVER] Client requested blocks for cube ${cubeId} (Level ${level})`);
        if (ledger && ledger.cubes) {
          const cube = Array.from(ledger.cubes.values()).find(c => {
            const cubeKey = typeof c.timestamp === 'bigint' ? c.timestamp.toString() : c.timestamp;
            return cubeKey === cubeId || c.id === cubeId;
          });
          if (cube && cube.faces) {
            for (const face of cube.faces.values()) {
              if (face.blocks) {
                for (const [position, block] of face.blocks.entries()) {
                  const coords = block.getCoordinates();
                  const vector = block.getVector();
                  const blockData = {
                    id: block.id,
                    txId: block.txId,
                    coordinates: coords,
                    vector: vector,
                    location: {
                      faceIndex: face.index,
                      position: position,
                      cubeIndex: cubeId,
                      level: level
                    },
                    timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
                  };
                  socket.emit('xclt:block:updated', serializeBigInt(blockData));
                }
              }
            }
          }
        }
      });
    });

    ledger.on('cube:complete', (data) => {
      const cube = data.cube || data;
      console.log(`[SERVER] Cube complete: ${cube.id}, level: ${cube.level || 1}, faces: ${cube.faces?.size || 0}`);
      
      // Emit cube complete event
      const cubeData = {
        cubeId: cube.id || data.cubeId,
        level: cube.level || data.level || 1,
        faceCount: cube.faces?.size || 0,
        timestamp: typeof (cube.timestamp || data.timestamp) === 'bigint' 
          ? (cube.timestamp || data.timestamp).toString() 
          : (cube.timestamp || data.timestamp)
      };
      io.emit('xclt:cube:complete', serializeBigInt(cubeData));
      
      // Emit all block positions for this cube
      if (cube && cube.faces) {
        const allBlocks = [];
        for (const face of cube.faces.values()) {
          if (face.blocks) {
            for (const [position, block] of face.blocks.entries()) {
              const coords = block.getCoordinates();
              const vector = block.getVector();
              const blockData = {
                id: block.id,
                txId: block.txId,
                coordinates: coords,
                vector: vector,
                location: block.location,
                timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
              };
              allBlocks.push(blockData);
            }
          }
        }
        console.log(`[SERVER] Emitting ${allBlocks.length} block positions for cube ${cube.id}`);
        for (const blockData of allBlocks) {
          io.emit('xclt:block:updated', serializeBigInt(blockData));
        }
      }
    });

    ledger.on('supercube:complete', (data) => {
      io.emit('xclt:supercube:complete', {
        superCubeId: data.superCube?.id || data.superCubeId,
        level: data.superCube?.level || data.level,
        cubeCount: data.superCube?.cubes?.size || 0,
        timestamp: data.superCube?.timestamp || data.timestamp
      });
    });

    // Listen to simulator events
    simulator.on('identity:created', (identity) => {
      io.emit('xid:identity:created', {
        address: identity.address,
        publicKey: identity.publicKey?.substring(0, 20) + '...'
      });
    });

    simulator.on('transaction:created', (tx) => {
      io.emit('xpc:transaction:new', {
        id: tx.id,
        type: tx.type,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        timestamp: tx.timestamp
      });
    });

    simulator.on('state:diff:created', (data) => {
      io.emit('xvsm:state:diff', {
        txId: data.txId,
        changes: data.changes,
        changeCount: data.changes ? Object.keys(data.changes).length : 0,
        timestamp: Date.now()
      });
    });

    simulator.on('storage:operation', (op) => {
      io.emit('xsc:operation', {
        type: op.type,
        key: op.key,
        size: op.size,
        timestamp: op.timestamp
      });
    });

    simulator.on('compute:operation', (op) => {
      io.emit('xsc:compute:operation', {
        functionName: op.functionName,
        duration: op.duration,
        memory: op.memory,
        timestamp: op.timestamp
      });
    });

    simulator.on('metrics:update', (metrics) => {
      io.emit('system:metrics', metrics);
    });

    // Listen to XPC events for metrics updates and validation events
    if (simulator.modules.xpc) {
      simulator.modules.xpc.on('raw_tx:added', (data) => {
        io.emit('xpc:raw_tx:added', {
          rawTxId: data.rawTxId,
          leaderId: data.leaderId,
          txType: data.txData?.type || 'unknown'
        });
        const stats = simulator.modules.xpc.getMempoolStats();
        io.emit('xpc:metrics', {
          rawTx: stats.raw,
          processing: stats.processing,
          finalized: stats.final
        });
      });

      simulator.modules.xpc.on('validation_tasks:created', (data) => {
        io.emit('xpc:validation_tasks:created', {
          rawTxId: data.rawTxId,
          taskCount: data.tasks?.length || 0
        });
      });

      simulator.modules.xpc.on('validation:complete', (data) => {
        io.emit('xpc:validation:complete', {
          rawTxId: data.rawTxId,
          validatorId: data.validatorId,
          taskId: data.taskId
        });
      });

      simulator.modules.xpc.on('tx:moved_to_processing', (data) => {
        io.emit('xpc:tx:moved_to_processing', {
          rawTxId: data.rawTxId,
          txId: data.txId
        });
      });

      simulator.modules.xpc.on('tx:processing', (data) => {
        io.emit('xpc:tx:processing', {
          txId: data.txId,
          rawTxId: data.rawTxId,
          validationTimestamp: data.validationTimestamp
        });
        const stats = simulator.modules.xpc.getMempoolStats();
        io.emit('xpc:metrics', {
          rawTx: stats.raw,
          processing: stats.processing,
          finalized: stats.final
        });
      });

      simulator.modules.xpc.on('tx:finalized', (data) => {
        io.emit('xpc:tx:finalized', {
          txId: data.txId,
          validationTimestamp: data.validationTimestamp
        });
        const stats = simulator.modules.xpc.getMempoolStats();
        io.emit('xpc:metrics', {
          rawTx: stats.raw,
          processing: stats.processing,
          finalized: stats.final
        });
      });

      simulator.modules.xpc.on('xpc:metrics', (data) => {
        io.emit('xpc:metrics', data);
      });
    }

    // Start simulator
    await simulator.start();
    console.log('Simulator started');

  } catch (error) {
    console.error('Failed to initialize:', error);
  }
}

// Socket.io connection handling
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);

    // Send initial state if available
  if (simulator) {
    const metrics = simulator.getMetrics();
    socket.emit('system:metrics', metrics);
    
    // Send initial XPC metrics
    if (simulator.modules.xpc) {
      const stats = simulator.modules.xpc.getMempoolStats();
      socket.emit('xpc:metrics', {
        rawTx: stats.raw,
        processing: stats.processing,
        finalized: stats.final
      });
    }
  }

  // Send existing blocks from ledger
  if (ledger && ledger.blocks) {
    console.log(`[SERVER] Sending ${ledger.blocks.size} existing blocks to client`);
    let sentCount = 0;
    for (const [blockId, block] of ledger.blocks.entries()) {
      const coords = block.getCoordinates();
      
      // Skip blocks with invalid coordinates or positions
      if (!coords || coords.x === null || coords.y === null || coords.z === null) {
        console.warn('[SERVER] Block missing or invalid coordinates:', block.id, coords);
        continue;
      }
      
      // Skip blocks with invalid position
      const blockPosition = block.location?.position;
      if (!block.location || blockPosition === undefined || blockPosition === null || Number(blockPosition) < 0) {
        console.warn('[SERVER] Block missing or invalid position:', block.id, block.location, `position=${blockPosition}`);
        continue;
      }
      
      const vector = block.getVector();
      const blockData = {
        id: block.id,
        txId: block.txId,
        coordinates: coords,
        vector: vector,
        location: block.location,
        timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
      };
      socket.emit('xclt:block:added', serializeBigInt(blockData));
      sentCount++;
    }
    console.log(`[SERVER] Sent ${sentCount} valid blocks to client (skipped ${ledger.blocks.size - sentCount} invalid)`);
  }

  socket.on('request:face:blocks', async (data) => {
    const { faceIndex } = data;
    console.log(`[SERVER] Client requested blocks for face ${faceIndex}`);
    if (ledger && ledger.cubes) {
      for (const cube of ledger.cubes.values()) {
        for (const face of cube.faces.values()) {
          if (face.index === faceIndex) {
            for (const [position, block] of face.blocks.entries()) {
              const coords = block.getCoordinates();
              const vector = block.getVector();
              const blockData = {
                id: block.id,
                txId: block.txId,
                coordinates: coords,
                vector: vector,
                location: block.location,
                timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
              };
              socket.emit('xclt:block:updated', serializeBigInt(blockData));
            }
            return;
          }
        }
      }
    }
  });
  
  socket.on('request:cube:blocks', async (data) => {
    const { cubeId, level } = data;
    console.log(`[SERVER] Client requested blocks for cube ${cubeId} (Level ${level})`);
    if (ledger && ledger.cubes) {
      const cube = Array.from(ledger.cubes.values()).find(c => {
        const cubeKey = typeof c.timestamp === 'bigint' ? c.timestamp.toString() : c.timestamp;
        return cubeKey === cubeId || c.id === cubeId;
      });
      if (cube && cube.faces) {
        for (const face of cube.faces.values()) {
          if (face.blocks) {
            for (const [position, block] of face.blocks.entries()) {
              const coords = block.getCoordinates();
              const vector = block.getVector();
              const blockData = {
                id: block.id,
                txId: block.txId,
                coordinates: coords,
                vector: vector,
                location: {
                  faceIndex: face.index,
                  position: position,
                  cubeIndex: cubeId,
                  level: level
                },
                timestamp: typeof block.timestamp === 'bigint' ? block.timestamp.toString() : block.timestamp
              };
              socket.emit('xclt:block:updated', serializeBigInt(blockData));
            }
          }
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
httpServer.listen(PORT, async () => {
  console.log(`Bridge server running on port ${PORT}`);
  await initialize();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (simulator) {
    simulator.stop();
  }
  httpServer.close(() => {
    process.exit(0);
  });
});
