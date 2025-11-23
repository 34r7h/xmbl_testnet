import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SystemSimulator } from '../xsim/index.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());

// Serve static files from current directory
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if dist folder exists (production build)
const distPath = join(__dirname, 'dist');

if (existsSync(distPath)) {
  // Production: serve built files
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  // Development: proxy to Vite dev server (must be running on port 3009)
  app.use(createProxyMiddleware({
    target: 'http://localhost:3009',
    changeOrigin: true,
    ws: true,
    logLevel: 'debug'
  }));
}

const port = process.env.PORT || 3008;

let simulator = null;
let mempoolInterval = null;
let isSimulatorRunning = false;
let isSimulatorPaused = false;

async function startSimulator() {
  if (isSimulatorRunning && !isSimulatorPaused) {
    console.log('[SERVER] Simulator already running.');
    return;
  }
  try {
    // Stop and clear existing simulator if it exists
    if (simulator) {
      simulator.stop();
      simulator = null;
    }
    
    // Clear mempool interval if it exists
    if (mempoolInterval) {
      clearInterval(mempoolInterval);
      mempoolInterval = null;
    }
    
    // CLEAR THE DATABASE FOR FRESH START
    const fs = await import('fs/promises');
    const path = await import('path');
    const dbPath = './data/xsim/ledger';
    try {
      // Check if database exists and is open, close it first if needed
      // Delete the entire database directory
      await fs.rm(dbPath, { recursive: true, force: true });
      // Wait a bit to ensure deletion completes
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('[SERVER] Cleared existing database for fresh start');
    } catch (error) {
      // Database might not exist yet, that's fine
      console.log('[SERVER] Database clear skipped (may not exist):', error.message);
    }
    
    // Create fresh simulator instance
    simulator = new SystemSimulator({
      initialIdentities: 10,
      transactionRate: 2,
      stateDiffRate: 1,
      storageOpRate: 0.5,
      computeOpRate: 0.5,
      useRealModules: true
    });

    // Forward simulator events to socket.io clients
    simulator.on('identity:created', (identity) => {
      console.log('[XSIM] identity:created', identity);
      io.emit('identity:created', identity);
    });

    simulator.on('transaction:created', (tx) => {
      console.log('[XSIM] transaction:created', {
        id: tx.id,
        type: tx.type,
        from: tx.from,
        to: tx.to,
        amount: tx.amount
      });
      io.emit('transaction:created', tx);
    });

    simulator.on('state:diff:created', (data) => {
      console.log('[XSIM] state:diff:created', data);
      io.emit('state:diff:created', data);
    });

    simulator.on('storage:operation', (op) => {
      console.log('[XSIM] storage:operation', op);
      io.emit('storage:operation', op);
    });

    simulator.on('compute:operation', (op) => {
      console.log('[XSIM] compute:operation', op);
      io.emit('compute:operation', op);
    });

    simulator.on('metrics:update', (metrics) => {
      console.log('[XSIM] metrics:update', metrics);
      io.emit('metrics:update', metrics);
    });

    // Start simulator first (modules are initialized during start)
    await simulator.start();
    
    // Wait a bit for modules to be fully initialized before attaching listeners
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now attach listeners to modules (they should be initialized by now)
    if (simulator.modules && simulator.modules.xclt) {
      console.log('[SERVER] Attaching xclt event listeners (after start)');
      simulator.modules.xclt.on('block:added', (block) => {
        console.log('[SERVER] ===== BLOCK ADDED =====');
        console.log('[SERVER] Block ID:', block.id);
        console.log('[SERVER] Block location:', JSON.stringify(block.location, null, 2));
        console.log('[SERVER] Block coordinates:', block.getCoordinates ? block.getCoordinates() : block.coordinates);
        console.log('[SERVER] Block full object keys:', Object.keys(block));
        // Serialize block data for transmission
        const blockData = {
          id: block.id,
          txId: block.txId || block.tx?.id,
          tx: block.tx,
          coordinates: block.getCoordinates ? block.getCoordinates() : block.coordinates,
          location: block.location,
          hash: block.hash,
          timestamp: block.timestamp
        };
        console.log('[SERVER] Emitting block:added with data:', JSON.stringify(blockData, null, 2));
        io.emit('block:added', blockData);
      });

      simulator.modules.xclt.on('face:complete', (data) => {
        console.log('[SERVER] ===== FACE COMPLETE =====');
        console.log('[SERVER] Face complete data:', JSON.stringify(data, null, 2));
        const face = data.face || data;
        console.log('[SERVER] Face object keys:', Object.keys(face));
        console.log('[SERVER] Face index:', face.index);
        console.log('[SERVER] Face blocks type:', typeof face.blocks);
        console.log('[SERVER] Face blocks is Map?', face.blocks instanceof Map);
        console.log('[SERVER] Face blocks is Array?', Array.isArray(face.blocks));
        const faceBlocks = face.blocks ? (Array.isArray(face.blocks) ? face.blocks : Array.from(face.blocks.values())) : [];
        console.log('[SERVER] Face blocks count:', faceBlocks.length);
        faceBlocks.forEach((block, idx) => {
          console.log(`[SERVER] Face block ${idx}:`, {
            id: block.id,
            location: block.location,
            coordinates: block.getCoordinates ? block.getCoordinates() : block.coordinates
          });
        });
        const serializedFace = {
          index: face.index,
          timestamp: face.timestamp?.toString(),
          blocks: faceBlocks.map(block => ({
            id: block.id,
            txId: block.txId || block.tx?.id,
            tx: block.tx,
            coordinates: block.coordinates || (block.getCoordinates ? block.getCoordinates() : null),
            location: block.location
          }))
        };
        console.log('[SERVER] Emitting face:complete with serialized face:', JSON.stringify(serializedFace, null, 2));
        io.emit('face:complete', { face: serializedFace });
      });

      simulator.modules.xclt.on('cube:complete', (data) => {
        console.log('[SERVER] ===== CUBE COMPLETE =====');
        console.log('[SERVER] Cube complete data:', JSON.stringify(data, null, 2));
        const cube = data.cube || data;
        console.log('[SERVER] Cube object keys:', Object.keys(cube));
        console.log('[SERVER] Cube ID:', cube.id);
        console.log('[SERVER] Cube level:', cube.level);
        console.log('[SERVER] Cube faces type:', typeof cube.faces);
        console.log('[SERVER] Cube faces is Map?', cube.faces instanceof Map);
        console.log('[SERVER] Cube faces is Array?', Array.isArray(cube.faces));
        // Serialize cube data with full face and block structure
        const faces = cube.faces ? (Array.isArray(cube.faces) ? cube.faces : Array.from(cube.faces.values())) : [];
        console.log('[SERVER] Cube faces count:', faces.length);
        const serializedFaces = faces.map((face, faceIdx) => {
          console.log(`[SERVER] Processing face ${faceIdx}:`, {
            index: face.index,
            blocksType: typeof face.blocks,
            blocksIsMap: face.blocks instanceof Map
          });
          const faceBlocks = face.blocks ? (Array.isArray(face.blocks) ? face.blocks : Array.from(face.blocks.values())) : [];
          console.log(`[SERVER] Face ${faceIdx} has ${faceBlocks.length} blocks`);
          faceBlocks.forEach((block, blockIdx) => {
            console.log(`[SERVER] Face ${faceIdx} block ${blockIdx}:`, {
              id: block.id,
              location: block.location,
              coordinates: block.getCoordinates ? block.getCoordinates() : block.coordinates
            });
          });
          return {
            index: face.index,
            timestamp: face.timestamp?.toString(),
            blocks: faceBlocks.map(block => ({
              id: block.id,
              txId: block.txId || block.tx?.id,
              tx: block.tx,
              coordinates: block.coordinates || (block.getCoordinates ? block.getCoordinates() : null),
              location: block.location
            }))
          };
        });
        const cubeData = {
          id: cube.id,
          level: cube.level || 1,
          faces: serializedFaces,
          timestamp: cube.timestamp?.toString() || data.timestamp?.toString()
        };
        console.log('[SERVER] Emitting cube:complete with cube data:', JSON.stringify(cubeData, null, 2));
        io.emit('cube:complete', { cube: cubeData });
      });

      simulator.modules.xclt.on('supercube:complete', (data) => {
        console.log('[SERVER] ===== SUPERCUBE COMPLETE =====');
        console.log('[SERVER] Supercube complete data:', JSON.stringify(data, null, 2));
        const superCube = data.superCube || data;
        console.log('[SERVER] SuperCube object keys:', Object.keys(superCube));
        console.log('[SERVER] SuperCube ID:', superCube.id);
        console.log('[SERVER] SuperCube level:', superCube.level);
        console.log('[SERVER] SuperCube faces type:', typeof superCube.faces);
        console.log('[SERVER] SuperCube faces is Map?', superCube.faces instanceof Map);
        
        // Serialize supercube data - supercube has 3 faces, each face has 9 cubes
        const faces = superCube.faces ? (Array.isArray(superCube.faces) ? superCube.faces : Array.from(superCube.faces.values())) : [];
        console.log('[SERVER] SuperCube has', faces.length, 'faces');
        
        const serializedFaces = faces.map((face, faceIdx) => {
          console.log(`[SERVER] Processing supercube face ${faceIdx}:`, {
            index: face.index,
            cubesType: typeof face.cubes,
            cubesIsMap: face.cubes instanceof Map
          });
          const faceCubes = face.cubes ? (Array.isArray(face.cubes) ? face.cubes : Array.from(face.cubes.values())) : [];
          console.log(`[SERVER] Face ${faceIdx} has ${faceCubes.length} cubes`);
          
          // Serialize each cube in the face (level-1 cubes)
          const serializedCubes = faceCubes.map((cube, cubeIdx) => {
            const cubeFaces = cube.faces ? (Array.isArray(cube.faces) ? cube.faces : Array.from(cube.faces.values())) : [];
            const serializedCubeFaces = cubeFaces.map((cubeFace, cubeFaceIdx) => {
              const cubeFaceBlocks = cubeFace.blocks ? (Array.isArray(cubeFace.blocks) ? cubeFace.blocks : Array.from(cubeFace.blocks.values())) : [];
              return {
                index: cubeFace.index,
                timestamp: cubeFace.timestamp?.toString(),
                blocks: cubeFaceBlocks.map(block => ({
                  id: block.id,
                  txId: block.txId || block.tx?.id,
                  tx: block.tx,
                  coordinates: block.coordinates || (block.getCoordinates ? block.getCoordinates() : null),
                  location: block.location
                }))
              };
            });
            return {
              id: cube.id,
              level: cube.level || 1,
              faces: serializedCubeFaces,
              timestamp: cube.timestamp?.toString()
            };
          });
          
          return {
            index: face.index,
            timestamp: face.timestamp?.toString(),
            cubes: serializedCubes
          };
        });
        
        const superCubeData = {
          id: superCube.id,
          level: superCube.level || 2,
          faces: serializedFaces,
          timestamp: superCube.timestamp?.toString() || data.timestamp?.toString()
        };
        console.log('[SERVER] Emitting supercube:complete with data:', JSON.stringify(superCubeData, null, 2));
        io.emit('supercube:complete', { superCube: superCubeData });
      });
    } else {
      console.log('[SERVER] xclt module not available after start');
    }

    // Forward consensus events from xpc module
    if (simulator.modules && simulator.modules.xpc) {
      console.log('[SERVER] Attaching xpc event listeners (after start)');
      simulator.modules.xpc.on('raw_tx:added', (data) => {
        console.log('[XPC] ===== RAW TX ADDED =====');
        console.log('[XPC] Raw transaction:', JSON.stringify(data, null, 2));
        io.emit('raw_tx:added', data);
      });

      simulator.modules.xpc.on('validation_tasks:created', (data) => {
        console.log('[XPC] ===== VALIDATION TASKS CREATED =====');
        console.log('[XPC] Validation tasks:', JSON.stringify(data, null, 2));
        io.emit('validation_tasks:created', data);
      });

      simulator.modules.xpc.on('validation:complete', (data) => {
        console.log('[SERVER] ===== VALIDATION COMPLETE EVENT RECEIVED =====');
        console.log('[SERVER] Validation complete data:', JSON.stringify(data, null, 2));
        console.log('[SERVER] rawTxId:', data.rawTxId);
        console.log('[SERVER] taskId:', data.taskId);
        console.log('[SERVER] validatorId:', data.validatorId);
        console.log('[SERVER] timestamp:', data.timestamp);
        io.emit('validation:complete', data);
        console.log('[SERVER] Emitted validation:complete to clients');
      });

      simulator.modules.xpc.on('tx:processing', (data) => {
        console.log('[XPC] ===== TX MOVED TO PROCESSING =====');
        console.log('[XPC] Processing transaction:', JSON.stringify(data, null, 2));
        io.emit('tx:processing', data);
      });

      simulator.modules.xpc.on('tx:finalized', (data) => {
        console.log('[XPC] ===== TX FINALIZED =====');
        console.log('[XPC] Finalized transaction:', JSON.stringify(data, null, 2));
        io.emit('tx:finalized', data);
      });

      // Periodically emit mempool counts
      mempoolInterval = setInterval(() => {
        if (simulator.modules && simulator.modules.xpc) {
          try {
            const stats = simulator.modules.xpc.getMempoolStats();
            if (stats) {
              const counts = {
                raw: stats.raw || 0,
                processing: stats.processing || 0,
                final: stats.final || 0
              };
              console.log('[SERVER] Mempool update:', counts);
              io.emit('mempool:update', counts);
            }
          } catch (error) {
            console.error('[SERVER] Mempool stats error:', error.message);
          }
        }
      }, 1000);
    } else {
      console.log('[SERVER] xpc module not available after start');
    }
    
    isSimulatorRunning = true;
    isSimulatorPaused = false;
    io.emit('simulator:status', { running: true, paused: false });
    console.log('[SERVER] XSIM SystemSimulator started and connected - fresh start from nothing');
  } catch (error) {
    console.error('[SERVER] Failed to start simulator:', error);
    isSimulatorRunning = false;
    isSimulatorPaused = false;
    io.emit('simulator:status', { running: false, paused: false });
  }
}

function pauseSimulator() {
  if (!simulator || !isSimulatorRunning || isSimulatorPaused) {
    console.log('[SERVER] Cannot pause - simulator not running or already paused');
    return;
  }
  
  simulator.pause();
  isSimulatorPaused = true;
  io.emit('simulator:status', { running: true, paused: true });
  console.log('[SERVER] Simulator paused (state preserved)');
}

function resumeSimulator() {
  if (!simulator || !isSimulatorRunning || !isSimulatorPaused) {
    console.log('[SERVER] Cannot resume - simulator not running or not paused');
    return;
  }
  
  simulator.resume();
  isSimulatorPaused = false;
  io.emit('simulator:status', { running: true, paused: false });
  console.log('[SERVER] Simulator resumed');
}

function stopSimulator() {
  console.log('[SERVER] stopSimulator called, simulator exists:', !!simulator, 'isRunning:', isSimulatorRunning);
  
  if (!simulator && !isSimulatorRunning) {
    console.log('[SERVER] Simulator not running.');
    isSimulatorRunning = false;
    isSimulatorPaused = false;
    io.emit('simulator:status', { running: false, paused: false });
    return;
  }
  
  console.log('[SERVER] Stopping simulator...');
  if (mempoolInterval) {
    clearInterval(mempoolInterval);
    mempoolInterval = null;
  }
  
  if (simulator) {
    simulator.stop();
    simulator = null;
  }
  
  isSimulatorRunning = false;
  isSimulatorPaused = false;
  io.emit('simulator:status', { running: false, paused: false });
  console.log('[SERVER] Simulator stopped.');
}


// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current state if available
  if (simulator) {
    const metrics = simulator.getMetrics();
    socket.emit('metrics:update', metrics);
    socket.emit('simulator:status', { running: isSimulatorRunning, paused: isSimulatorPaused });
  } else {
    socket.emit('simulator:status', { running: false, paused: false });
  }
  
  // Handle simulator control
  socket.on('simulator:start', async () => {
    await startSimulator();
  });
  
  socket.on('simulator:stop', () => {
    stopSimulator();
  });
  
  socket.on('simulator:pause', () => {
    pauseSimulator();
  });
  
  socket.on('simulator:resume', () => {
    resumeSimulator();
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
httpServer.listen(port, async () => {
  console.log(`XV (XMBL Visualizer) server running on port ${port}`);
  console.log(`Open http://localhost:${port} in your browser`);
  console.log('Simulator will start when you click "Start" in the UI');
  // Don't auto-start - wait for user to click Start
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (mempoolInterval) {
    clearInterval(mempoolInterval);
  }
  if (simulator) {
    simulator.stop();
  }
  httpServer.close(() => {
    process.exit(0);
  });
});

