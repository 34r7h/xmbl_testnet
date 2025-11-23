<template>
  <div id="app">
    <div class="visualizer-container">
      <div ref="canvasContainer" class="canvas-container"></div>
      <div class="controls">
        <div class="control-panel">
          <h3>XMBL Visualizer</h3>
          <div class="stats">
            <div class="stat-item">
              <span class="label">Identities:</span>
              <span class="value">{{ metrics.identitiesCreated || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Transactions:</span>
              <span class="value">{{ metrics.transactionsCreated || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Blocks:</span>
              <span class="value">{{ metrics.blocksAdded || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Cubes:</span>
              <span class="value">{{ metrics.cubesCompleted || 0 }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Faces:</span>
              <span class="value">{{ metrics.facesCompleted || 0 }}</span>
            </div>
          </div>
          <div class="mempool-stats" v-if="mempoolCounts">
            <h4>Mempool</h4>
            <div class="stat-item">
              <span class="label">Raw:</span>
              <span class="value">{{ mempoolCounts.raw }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Processing:</span>
              <span class="value">{{ mempoolCounts.processing }}</span>
            </div>
            <div class="stat-item">
              <span class="label">Final:</span>
              <span class="value">{{ mempoolCounts.final }}</span>
            </div>
          </div>
          <div class="connection-status" :class="{ connected: isConnected }">
            <span class="status-dot"></span>
            {{ isConnected ? 'Connected' : 'Disconnected' }}
          </div>
          <div class="simulator-controls">
            <h4>Simulator</h4>
            <div class="control-buttons">
              <button 
                @click="startSimulator" 
                :disabled="(isSimulatorRunning && !isSimulatorPaused) || !isConnected"
                class="control-btn start-btn"
              >
                Start
              </button>
              <button 
                @click="pauseSimulator" 
                :disabled="!isSimulatorRunning || isSimulatorPaused || !isConnected"
                class="control-btn pause-btn"
              >
                Pause
              </button>
              <button 
                @click="resumeSimulator" 
                :disabled="!isSimulatorPaused || !isConnected"
                class="control-btn resume-btn"
              >
                Resume
              </button>
              <button 
                @click="stopSimulator" 
                :disabled="!isConnected"
                class="control-btn stop-btn"
              >
                Stop
              </button>
            </div>
            <div class="simulator-status" :class="{ running: isSimulatorRunning, paused: isSimulatorPaused }">
              <span class="status-dot"></span>
              {{ isSimulatorRunning ? (isSimulatorPaused ? 'Paused' : 'Running') : 'Stopped' }}
            </div>
          </div>
        </div>
      </div>
      <div class="block-details" v-if="selectedBlockData">
        <h4>Block Details</h4>
        <div class="detail-item">
          <span class="label">Block ID:</span>
          <span class="value">{{ selectedBlockData.id || 'N/A' }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.txId">
          <span class="label">TX ID:</span>
          <span class="value">{{ selectedBlockData.txId }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.tx">
          <span class="label">TX Type:</span>
          <span class="value">{{ selectedBlockData.tx.type || 'N/A' }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.tx && selectedBlockData.tx.from">
          <span class="label">From:</span>
          <span class="value">{{ typeof selectedBlockData.tx.from === 'string' ? selectedBlockData.tx.from.substring(0, 10) + '...' : JSON.stringify(selectedBlockData.tx.from).substring(0, 20) + '...' }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.tx && selectedBlockData.tx.to">
          <span class="label">To:</span>
          <span class="value">{{ typeof selectedBlockData.tx.to === 'string' ? selectedBlockData.tx.to.substring(0, 10) + '...' : JSON.stringify(selectedBlockData.tx.to).substring(0, 20) + '...' }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.tx && selectedBlockData.tx.amount">
          <span class="label">Amount:</span>
          <span class="value">{{ selectedBlockData.tx.amount }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.tx && selectedBlockData.tx.fee">
          <span class="label">Fee:</span>
          <span class="value">{{ selectedBlockData.tx.fee }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.coordinates">
          <span class="label">Position:</span>
          <span class="value">({{ Math.round(selectedBlockData.coordinates.x * 100) / 100 }}, {{ Math.round(selectedBlockData.coordinates.y * 100) / 100 }}, {{ Math.round(selectedBlockData.coordinates.z * 100) / 100 }})</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.location">
          <span class="label">Face Index:</span>
          <span class="value">{{ selectedBlockData.location.faceIndex !== undefined ? selectedBlockData.location.faceIndex : 'N/A' }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.location && selectedBlockData.location.cubeIndex !== undefined">
          <span class="label">Cube Index:</span>
          <span class="value">{{ selectedBlockData.location.cubeIndex }}</span>
        </div>
        <div class="detail-item" v-if="selectedBlockData.location && selectedBlockData.location.level">
          <span class="label">Level:</span>
          <span class="value">{{ selectedBlockData.location.level }}</span>
        </div>
        <button @click="selectedBlockData = null" class="close-btn">Close</button>
      </div>
      <div class="controls-info">
        <div class="info-item">Click block to inspect</div>
        <div class="info-item">Drag to rotate</div>
        <div class="info-item">Scroll to zoom</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';
import { Scene3D } from './scene.js';
import { CubicVisualizer } from './cubic-viz.js';
import { MempoolVisualizer } from './mempool-viz.js';
import * as THREE from 'three';

const canvasContainer = ref(null);
let scene = null;
let cubicViz = null;
let mempoolViz = null;
let socket = null;

const isConnected = ref(false);
const isSimulatorRunning = ref(false);
const isSimulatorPaused = ref(false);
const metrics = ref({});
const mempoolCounts = ref(null);
const cubes = ref([]);
const superCubes = ref([]);
const blocks = ref([]);
const faces = ref([]);
const selectedBlock = ref(null);
const selectedBlockData = ref(null);

// Track transactions through validation stages
const rawTransactions = ref([]); // raw_tx:added
const validationTasks = ref([]); // validation_tasks:created
const validatedTransactions = ref([]); // validation:complete
const finalizedTransactions = ref([]); // tx:finalized
const transactionToBlock = ref(new Map()); // Map txId -> blockId
const zoomLevel = ref(1);

onMounted(() => {
  if (canvasContainer.value) {
    scene = new Scene3D({ container: canvasContainer.value });
    scene.setOnClickListener((blockMesh) => {
      if (blockMesh) {
        handleBlockClick(blockMesh);
      } else {
        selectedBlock.value = null;
        selectedBlockData.value = null;
      }
    });
    
    cubicViz = new CubicVisualizer();
    mempoolViz = new MempoolVisualizer();

    // Connect to server (which has xsim imported)
    // Backend server runs on 3008, vite dev server on 3009
    socket = io('http://localhost:3008');

    socket.on('connect', () => {
      isConnected.value = true;
      console.log('Connected to visualizer server');
    });

    socket.on('disconnect', () => {
      isConnected.value = false;
      isSimulatorRunning.value = false;
      isSimulatorPaused.value = false;
      console.log('Disconnected from visualizer server');
    });

    socket.on('simulator:status', (status) => {
      const wasRunning = isSimulatorRunning.value;
      const wasPaused = isSimulatorPaused.value;
      
      // Handle both old format (boolean) and new format (object)
      if (typeof status === 'boolean') {
        isSimulatorRunning.value = status;
        isSimulatorPaused.value = false;
      } else {
        isSimulatorRunning.value = status.running || false;
        isSimulatorPaused.value = status.paused || false;
      }
      
      console.log('Simulator status:', isSimulatorRunning.value ? (isSimulatorPaused.value ? 'Paused' : 'Running') : 'Stopped');
      
      // When starting fresh (not resuming), clear all state for fresh visualization
      if (isSimulatorRunning.value && !wasRunning && !wasPaused) {
        console.log('[VIZ] Clearing state for fresh start');
        blocks.value = [];
        cubes.value = [];
        superCubes.value = [];
        faces.value = [];
        metrics.value = {};
        mempoolCounts.value = null;
        selectedBlock.value = null;
        selectedBlockData.value = null;
        
        // Clear scene
        if (scene && cubicViz) {
          const objectsToRemove = [];
          scene.scene.traverse((obj) => {
            if (obj.name && (obj.name.startsWith('cube_') || obj.name.startsWith('supercube_') || 
                obj.name.startsWith('block_') || obj.name === 'mainGroup' || obj.name === 'mempool')) {
              objectsToRemove.push(obj);
            }
          });
          objectsToRemove.forEach(obj => {
            if (obj.parent) {
              obj.parent.remove(obj);
            } else {
              scene.scene.remove(obj);
            }
          });
          updateCubeVisualization();
        }
      }
      
      // When stopping, clear visualization
      if (!isSimulatorRunning.value && wasRunning) {
        blocks.value = [];
        cubes.value = [];
        superCubes.value = [];
        faces.value = [];
        if (scene && cubicViz) {
          updateCubeVisualization();
        }
      }
    });

    socket.on('transaction:created', (tx) => {
      console.log('[VIZ] ===== TRANSACTION CREATED =====');
      console.log('[VIZ] TX:', JSON.stringify(tx, null, 2));
    });

    socket.on('raw_tx:added', (data) => {
      console.log('[VIZ] ===== RAW TX ADDED TO MEMPOOL =====');
      console.log('[VIZ] Raw TX:', JSON.stringify(data, null, 2));
      const txId = data.txId || data.id || data.tx?.id;
      if (txId) {
        rawTransactions.value.push({
          id: txId,
          data: data,
          stage: 'raw',
          timestamp: Date.now()
        });
        if (scene && cubicViz) {
          updateCubeVisualization();
        }
      }
    });

    socket.on('validation_tasks:created', (data) => {
      console.log('[VIZ] ===== VALIDATION TASKS CREATED =====');
      console.log('[VIZ] Validation tasks:', JSON.stringify(data, null, 2));
      const txId = data.rawTxId || data.txId || data.id;
      if (txId) {
        // Update transaction stage
        const txIndex = rawTransactions.value.findIndex(tx => tx.id === txId);
        if (txIndex >= 0) {
          rawTransactions.value[txIndex].stage = 'validating';
        }
        validationTasks.value.push({
          txId: txId,
          tasks: data.tasks || [],
          timestamp: Date.now()
        });
        if (scene && cubicViz) {
          updateCubeVisualization();
        }
      }
    });

    socket.on('validation:complete', (data) => {
      console.log('[VIZ] ===== VALIDATION COMPLETE =====');
      console.log('[VIZ] Validation result:', JSON.stringify(data, null, 2));
      const txId = data.txId || data.rawTxId || data.id;
      if (txId) {
        // Update transaction stage
        const txIndex = rawTransactions.value.findIndex(tx => tx.id === txId);
        if (txIndex >= 0) {
          rawTransactions.value[txIndex].stage = 'validated';
        }
        validatedTransactions.value.push({
          txId: txId,
          data: data,
          timestamp: Date.now()
        });
        if (scene && cubicViz) {
          updateCubeVisualization();
        }
      }
    });

    socket.on('tx:processing', (data) => {
      console.log('[VIZ] ===== TX MOVED TO PROCESSING =====');
      console.log('[VIZ] Processing TX:', JSON.stringify(data, null, 2));
      const txId = data.txId || data.rawTxId || data.id || data.txData?.id;
      if (txId) {
        // Update transaction stage
        const txIndex = rawTransactions.value.findIndex(tx => tx.id === txId);
        if (txIndex >= 0) {
          rawTransactions.value[txIndex].stage = 'processing';
        }
        if (scene && cubicViz) {
          updateCubeVisualization();
        }
      }
    });

    socket.on('tx:finalized', (data) => {
      console.log('[VIZ] ===== TX FINALIZED =====');
      console.log('[VIZ] Finalized TX:', JSON.stringify(data, null, 2));
      const txId = data.txId || data.id || data.txData?.id;
      if (txId) {
        // Update transaction stage
        const txIndex = rawTransactions.value.findIndex(tx => tx.id === txId);
        if (txIndex >= 0) {
          rawTransactions.value[txIndex].stage = 'finalized';
        }
        finalizedTransactions.value.push({
          txId: txId,
          data: data,
          timestamp: Date.now()
        });
        if (scene && cubicViz) {
          updateCubeVisualization();
        }
      }
    });

    socket.on('block:added', (block) => {
      console.log('[VIZ] ===== BLOCK ADDED =====');
      console.log('[VIZ] Block data:', JSON.stringify(block, null, 2));
      console.log('[VIZ] Block ID:', block.id);
      console.log('[VIZ] Block location:', block.location);
      console.log('[VIZ] Block coordinates:', block.coordinates);
      blocks.value.push(block);
      
      // Map transaction to block
      const txId = block.txId || block.tx?.id;
      if (txId) {
        transactionToBlock.value.set(txId, block.id);
        // Update transaction stage to 'blocked'
        const txIndex = rawTransactions.value.findIndex(tx => tx.id === txId);
        if (txIndex >= 0) {
          rawTransactions.value[txIndex].stage = 'blocked';
        }
      }
      
      if (scene && cubicViz) {
        updateCubeVisualization();
        // Auto-zoom based on block count
        adjustCameraZoom();
      }
    });

    socket.on('face:complete', (data) => {
      console.log('[VIZ] ===== FACE COMPLETE =====');
      console.log('[VIZ] Face complete data:', JSON.stringify(data, null, 2));
      const face = data.face || data;
      console.log('[VIZ] Face index:', face.index);
      console.log('[VIZ] Face blocks count:', face.blocks ? face.blocks.length : 0);
      if (face.blocks) {
        face.blocks.forEach((block, idx) => {
          console.log(`[VIZ] Face block ${idx}:`, {
            id: block.id,
            location: block.location,
            coordinates: block.coordinates
          });
        });
      }
      faces.value.push(face);
      if (scene && cubicViz) {
        updateCubeVisualization();
        adjustCameraZoom();
      }
    });

    socket.on('cube:complete', (data) => {
      console.log('[VIZ] ===== CUBE COMPLETE =====');
      console.log('[VIZ] Cube complete data:', JSON.stringify(data, null, 2));
      const cube = data.cube || data;
      console.log('[VIZ] Cube ID:', cube.id);
      console.log('[VIZ] Cube level:', cube.level);
      console.log('[VIZ] Cube faces count:', cube.faces ? cube.faces.length : 0);
      if (cube.faces) {
        cube.faces.forEach((face, faceIdx) => {
          console.log(`[VIZ] Cube face ${faceIdx}:`, {
            index: face.index,
            blocksCount: face.blocks ? face.blocks.length : 0
          });
          if (face.blocks) {
            face.blocks.forEach((block, blockIdx) => {
              console.log(`[VIZ] Cube face ${faceIdx} block ${blockIdx}:`, {
                id: block.id,
                location: block.location,
                coordinates: block.coordinates
              });
            });
          }
        });
      }
      cubes.value.push(cube);
      if (scene && cubicViz) {
        updateCubeVisualization();
        // Auto-zoom out as cubes form
        adjustCameraZoom();
      }
    });

    socket.on('supercube:complete', (data) => {
      console.log('[VIZ] Supercube complete - 27 cubes sorted!');
      const superCube = data.superCube || data;
      superCubes.value.push(superCube);
      if (scene && cubicViz) {
        updateCubeVisualization();
        // Auto-zoom out more for supercubes
        adjustCameraZoom();
      }
    });

    socket.on('mempool:update', (counts) => {
      console.log('Mempool update:', counts);
      mempoolCounts.value = counts;
      if (scene && mempoolViz) {
        const mempoolGroup = mempoolViz.createBarChart(counts);
        const oldMempool = scene.scene.getObjectByName('mempool');
        if (oldMempool) {
          scene.scene.remove(oldMempool);
        }
        mempoolGroup.name = 'mempool';
        mempoolGroup.position.set(-5, -3, -5); // Move mempool away from origin
        scene.scene.add(mempoolGroup);
      }
    });

    socket.on('metrics:update', (newMetrics) => {
      console.log('[VIZ] ===== METRICS UPDATE =====');
      console.log('[VIZ] Metrics:', JSON.stringify(newMetrics, null, 2));
      metrics.value = newMetrics;
      // Update visualization when metrics change
      if (scene && cubicViz) {
        updateCubeVisualization();
        adjustCameraZoom();
      }
    });
    
    // Initial visualization
    if (scene && cubicViz) {
      updateCubeVisualization();
    }
  }
});

onUnmounted(() => {
  if (socket) {
    socket.disconnect();
  }
  if (scene) {
    scene.dispose();
  }
});

// Recursive function to create cubes at any level
function createCubeFromMetrics(cubeIdx, blockSpacing, cubeSpacing, level = 1, maxLevel = 10) {
  if (!cubicViz || level > maxLevel) return null;
  
  const cubeGroup = new THREE.Group();
  cubeGroup.name = `cube_${level}_${cubeIdx}`;
  cubeGroup.userData.isCube = true;
  cubeGroup.userData.level = level;
  
  const blocksPerCube = 27;
  const cubesPerSuperCube = 27;
  
  if (level === 1) {
    // Level 1: Create from blocks
    const startBlockIdx = cubeIdx * blocksPerCube;
    const blockCount = metrics.value.blocksAdded || 0;
    
    for (let i = 0; i < blocksPerCube; i++) {
      const blockIdx = startBlockIdx + i;
      if (blockIdx < blockCount) {
        const x = i % 3;
        const y = Math.floor((i % 9) / 3);
        const z = Math.floor(i / 9);
        
        const block = cubicViz.createBlock(x, y, z, {
          id: `block_${blockIdx}`,
          color: 0x00ff00,
          opacity: 0.8
        });
        
        block.position.set(
          x * blockSpacing - blockSpacing,
          y * blockSpacing - blockSpacing,
          z * blockSpacing - blockSpacing
        );
        
        block.userData.isBlock = true;
        block.userData.blockData = { id: `block_${blockIdx}` };
        block.userData.blockIndex = blockIdx;
        
        cubeGroup.add(block);
      }
    }
  } else {
    // Level 2+: Recursively create from lower-level cubes
    const startCubeIdx = cubeIdx * cubesPerSuperCube;
    const cubeCount = metrics.value.cubesCompleted || 0;
    const cubesAtThisLevel = Math.floor(cubeCount / Math.pow(cubesPerSuperCube, level - 1));
    
    for (let i = 0; i < cubesPerSuperCube; i++) {
      const childCubeIdx = startCubeIdx + i;
      if (childCubeIdx < cubesAtThisLevel) {
        // Recursively create child cube at level-1
        const childCube = createCubeFromMetrics(childCubeIdx, blockSpacing, cubeSpacing, level - 1, maxLevel);
        if (childCube) {
          const x = i % 3;
          const y = Math.floor((i % 9) / 3);
          const z = Math.floor(i / 9);
          
          // Scale position based on level
          const levelScale = Math.pow(cubeSpacing, level - 1);
          childCube.position.set(
            (x - 1) * levelScale,
            (y - 1) * levelScale,
            (z - 1) * levelScale
          );
          
          cubeGroup.add(childCube);
        }
      }
    }
  }
  
  return cubeGroup.children.length > 0 ? cubeGroup : null;
}

function updateCubeVisualization() {
  if (!scene || !cubicViz) return;

  // Remove old visualizations
  const objectsToRemove = [];
  scene.scene.traverse((obj) => {
    if (obj.name && (obj.name.startsWith('cube_') || obj.name.startsWith('supercube_') || obj.name.startsWith('block_') || obj.name.startsWith('face_') || obj.name.startsWith('tx_') || obj.name === 'mainGroup')) {
      objectsToRemove.push(obj);
    }
  });
  objectsToRemove.forEach(obj => {
    if (obj.parent) {
      obj.parent.remove(obj);
    } else {
      scene.scene.remove(obj);
    }
  });

  const blockSpacing = 0.6; // Match cubic-viz spacing
  const cubeSpacing = 3.0; // Space between cubes
  const superCubeSpacing = 10.0; // Space between supercubes
  
  // Create a main group to center everything
  const mainGroup = new THREE.Group();
  mainGroup.name = 'mainGroup';
  
  // Track which blocks are already in cubes/faces
  const blocksInStructures = new Set();
  
  console.log(`[VIZ] updateCubeVisualization: ${blocks.value.length} blocks, ${cubes.value.length} cubes, ${faces.value.length} faces, ${superCubes.value.length} supercubes`);
  
  // 1. Visualize supercubes first (level 2+)
  if (superCubes.value.length > 0) {
    superCubes.value.forEach((superCube, superIdx) => {
      const level = superCube.level || 2;
      const superCubeGroup = new THREE.Group();
      superCubeGroup.name = `supercube_${level}_${superIdx}`;
      
      // Supercube has 3 faces, each face has 9 cubes (level-1 cubes)
      const faces = superCube.faces ? (Array.isArray(superCube.faces) ? superCube.faces : Array.from(superCube.faces.values())) : [];
      
      // Collect all cubes from all faces and track their positions
      const cubesWithPositions = [];
      faces.forEach((face, faceIdx) => {
        const faceCubes = face.cubes ? (Array.isArray(face.cubes) ? face.cubes : Array.from(face.cubes.values())) : [];
        faceCubes.forEach((cube, cubePosInFace) => {
          // Calculate global position in 3x3x3 supercube
          // faceIdx (0-2) determines z, cubePosInFace (0-8) determines x,y
          const col = cubePosInFace % 3; // 0, 1, 2
          const row = Math.floor(cubePosInFace / 3); // 0, 1, 2
          const globalPos = faceIdx * 9 + cubePosInFace; // 0-26
          cubesWithPositions.push({ cube, globalPos, faceIdx, cubePosInFace });
        });
      });
      
      // Render each level-1 cube as a SINGLE unit (not expanded into blocks)
      cubesWithPositions.forEach(({ cube, globalPos }) => {
        // Create a single larger cube to represent this level-1 cube
        const cubeSize = cubeSpacing * 0.7; // Size of the cube unit
        const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const material = new THREE.MeshStandardMaterial({ 
          color: 0x0099ff, // Blue for level-1 cubes in supercube
          opacity: 0.9,
          metalness: 0.3,
          roughness: 0.7
        });
        const cubeMesh = new THREE.Mesh(geometry, material);
        
        // Add wireframe edges
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 })
        );
        cubeMesh.add(line);
        
        // Position in 3x3x3 grid within supercube
        const cubeX = (globalPos % 3) * cubeSpacing - cubeSpacing;
        const cubeY = Math.floor((globalPos % 9) / 3) * cubeSpacing - cubeSpacing;
        const cubeZ = Math.floor(globalPos / 9) * cubeSpacing - cubeSpacing;
        cubeMesh.position.set(cubeX, cubeY, cubeZ);
        cubeMesh.name = `level1_cube_in_supercube_${superIdx}_${globalPos}`;
        cubeMesh.userData.isCube = true;
        cubeMesh.userData.cubeData = cube;
        cubeMesh.userData.level = 1;
        cubeMesh.userData.inSupercube = true;
        
        superCubeGroup.add(cubeMesh);
        
        // Mark all blocks in this cube as used
        if (cube.faces) {
          const cubeFaces = Array.isArray(cube.faces) ? cube.faces : Array.from(cube.faces.values());
          cubeFaces.forEach(face => {
            if (face.blocks) {
              const faceBlocks = Array.isArray(face.blocks) ? face.blocks : Array.from(face.blocks.values());
              faceBlocks.forEach(block => {
                blocksInStructures.add(block.id);
              });
            }
          });
        }
      });
      
      if (superCubeGroup.children.length > 0) {
        // Position supercube
        const offsetX = (superIdx % 3) * superCubeSpacing - superCubeSpacing;
        const offsetY = Math.floor((superIdx % 9) / 3) * superCubeSpacing;
        const offsetZ = Math.floor(superIdx / 9) * superCubeSpacing;
        superCubeGroup.position.set(offsetX, offsetY, offsetZ);
        mainGroup.add(superCubeGroup);
        console.log(`[VIZ] Added supercube level ${level} with ${superCubeGroup.children.length} child cubes`);
      }
    });
  }
  
  // 2. Visualize completed level 1 cubes (not in supercubes) - CENTERED AT ORIGIN
  if (cubes.value.length > 0) {
    console.log(`[VIZ] Rendering ${cubes.value.length} level-1 cubes`);
    cubes.value.forEach((cube, cubeIdx) => {
      // Check if cube is already in a supercube
      const inSuperCube = superCubes.value.some(sc => {
        const faces = sc.faces ? (Array.isArray(sc.faces) ? sc.faces : Array.from(sc.faces.values())) : [];
        return faces.some(face => {
          const faceCubes = face.cubes ? (Array.isArray(face.cubes) ? face.cubes : Array.from(face.cubes.values())) : [];
          return faceCubes.some(c => (c.id || c) === (cube.id || cube));
        });
      });
      
      if (!inSuperCube) {
        const cubeGroup = visualizeCubeFromData(cube, cubeIdx, blockSpacing);
        if (cubeGroup) {
          // Position cube CENTERED at origin (first cube at 0,0,0)
          if (cubeIdx === 0) {
            cubeGroup.position.set(0, 0, 0);
          } else {
            // Other cubes positioned around origin
            const cubeX = (cubeIdx % 3) * cubeSpacing - cubeSpacing;
            const cubeY = Math.floor((cubeIdx % 9) / 3) * cubeSpacing - cubeSpacing;
            const cubeZ = Math.floor(cubeIdx / 9) * cubeSpacing - cubeSpacing;
            cubeGroup.position.set(cubeX, cubeY, cubeZ);
          }
          mainGroup.add(cubeGroup);
          console.log(`[VIZ] Added cube ${cubeIdx} at position`, cubeGroup.position);
          
          // Mark blocks as used
          if (cube.faces) {
            const cubeFaces = Array.isArray(cube.faces) ? cube.faces : Array.from(cube.faces.values());
            cubeFaces.forEach(face => {
              if (face.blocks) {
                const faceBlocks = Array.isArray(face.blocks) ? face.blocks : Array.from(face.blocks.values());
                faceBlocks.forEach(block => {
                  blocksInStructures.add(block.id);
                });
              }
            });
          }
        }
      }
    });
  }
  
  // 3. Visualize completed faces (not yet in cubes)
  const facesInCubes = new Set();
  cubes.value.forEach(cube => {
    if (cube.faces) {
      cube.faces.forEach(face => {
        if (face.blocks) {
          face.blocks.forEach(block => {
            facesInCubes.add(block.id);
          });
        }
      });
    }
  });
  
  faces.value.forEach((face, faceIdx) => {
    // Check if face is already in a cube
    const faceBlockIds = face.blocks ? face.blocks.map(b => b.id) : [];
    const inCube = faceBlockIds.some(id => facesInCubes.has(id));
    
    if (!inCube && face.blocks && face.blocks.length === 9) {
      const faceGroup = visualizeFace(face, faceIdx, blockSpacing);
      if (faceGroup) {
        // Position face (pending, not yet in cube)
        const faceX = 5; // To the right
        const faceY = (faceIdx % 5) * cubeSpacing - cubeSpacing * 2;
        const faceZ = Math.floor(faceIdx / 5) * cubeSpacing;
        faceGroup.position.set(faceX, faceY, faceZ);
        mainGroup.add(faceGroup);
        
        // Mark blocks as used
        face.blocks.forEach(block => {
          blocksInStructures.add(block.id);
        });
      }
    }
  });
  
  // 4. Visualize transactions in validation pipeline (left side)
  // Show raw transactions (red), validating (orange), validated (yellow), finalized (cyan), blocked (green)
  const validationQueueX = -8;
  rawTransactions.value.forEach((tx, txIdx) => {
    let color = 0xff0000; // Red for raw
    let opacity = 0.6;
    if (tx.stage === 'validating') {
      color = 0xff8800; // Orange
      opacity = 0.7;
    } else if (tx.stage === 'validated') {
      color = 0xffff00; // Yellow
      opacity = 0.8;
    } else if (tx.stage === 'finalized') {
      color = 0x00ffff; // Cyan
      opacity = 0.9;
    } else if (tx.stage === 'blocked') {
      color = 0x00ff00; // Green
      opacity = 1.0;
    }
    
    // Create small indicator sphere for transaction
    const geometry = new THREE.SphereGeometry(0.1, 8, 8);
    const material = new THREE.MeshStandardMaterial({ color, opacity, transparent: true });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(
      validationQueueX,
      (txIdx % 20) * 0.2 - 2,
      Math.floor(txIdx / 20) * 0.2
    );
    sphere.name = `tx_${tx.id}`;
    sphere.userData.isTransaction = true;
    sphere.userData.txData = tx;
    mainGroup.add(sphere);
  });
  
  // 5. Visualize pending blocks (not yet in faces/cubes) - GROUP INTO 3x3x3 CUBES
  const pendingBlocks = blocks.value.filter(block => {
    const blockId = typeof block === 'object' ? block.id : block;
    return !blocksInStructures.has(blockId);
  });
  
  console.log(`[VIZ] Pending blocks count: ${pendingBlocks.length}, Total blocks: ${blocks.value.length}, Blocks in structures: ${blocksInStructures.size}`);
  
  // Group pending blocks into 3x3x3 cubes (27 blocks per cube)
  const blocksPerCube = 27;
  const numCubes = Math.ceil(pendingBlocks.length / blocksPerCube);
  
  for (let cubeIdx = 0; cubeIdx < numCubes; cubeIdx++) {
    const cubeStartIdx = cubeIdx * blocksPerCube;
    const cubeBlocks = pendingBlocks.slice(cubeStartIdx, cubeStartIdx + blocksPerCube);
    
    // Create a cube group for this set of 27 blocks
    const cubeGroup = new THREE.Group();
    cubeGroup.name = `pending_cube_${cubeIdx}`;
    
    // Position each block in 3x3x3 formation within the cube
    cubeBlocks.forEach((block, blockIdxInCube) => {
      const blockMesh = visualizeBlock(block, cubeStartIdx + blockIdxInCube, blockSpacing);
      if (blockMesh) {
        const blockData = typeof block === 'object' ? block : { id: block };
        
        // Use actual coordinates from ledger if available, otherwise calculate from position
        let blockX, blockY, blockZ;
        if (blockData.coordinates && typeof blockData.coordinates === 'object') {
          // Coordinates are { x, y, z } object from ledger
          blockX = (blockData.coordinates.x || 0) * blockSpacing;
          blockY = (blockData.coordinates.y || 0) * blockSpacing;
          blockZ = (blockData.coordinates.z || 0) * blockSpacing;
        } else if (blockData.coordinates && Array.isArray(blockData.coordinates) && blockData.coordinates.length >= 3) {
          // Fallback: coordinates as array [x, y, z]
          blockX = blockData.coordinates[0] * blockSpacing;
          blockY = blockData.coordinates[1] * blockSpacing;
          blockZ = blockData.coordinates[2] * blockSpacing;
        } else {
          // Fallback: Position in 3x3x3 grid: x, y, z from 0-2, then center at -1,0,1
          const x = (blockIdxInCube % 3) - 1; // -1, 0, 1
          const y = Math.floor((blockIdxInCube % 9) / 3) - 1; // -1, 0, 1
          const z = Math.floor(blockIdxInCube / 9) - 1; // -1, 0, 1
          blockX = x * blockSpacing;
          blockY = y * blockSpacing;
          blockZ = z * blockSpacing;
        }
        
        blockMesh.position.set(blockX, blockY, blockZ);
        if (blockMesh.material) {
          blockMesh.material.opacity = 1.0;
          blockMesh.material.transparent = false;
        }
        cubeGroup.add(blockMesh);
      }
    });
    
    // Position the cube group (spread cubes out)
    if (cubeGroup.children.length > 0) {
      const cubeX = (cubeIdx % 3) * cubeSpacing - cubeSpacing;
      const cubeY = Math.floor((cubeIdx % 9) / 3) * cubeSpacing;
      const cubeZ = Math.floor(cubeIdx / 9) * cubeSpacing;
      cubeGroup.position.set(cubeX, cubeY, cubeZ);
      mainGroup.add(cubeGroup);
      console.log(`[VIZ] Added pending cube ${cubeIdx} with ${cubeGroup.children.length} blocks at (${cubeX}, ${cubeY}, ${cubeZ})`);
    }
  }
  
  // If no structures but we have blocks, show them in 3x3x3 cubes
  if (mainGroup.children.length === 0 && blocks.value.length > 0) {
    console.log('[VIZ] No structures yet, showing all blocks in 3x3x3 cubes');
    const numCubes = Math.ceil(blocks.value.length / blocksPerCube);
    for (let cubeIdx = 0; cubeIdx < numCubes; cubeIdx++) {
      const cubeStartIdx = cubeIdx * blocksPerCube;
      const cubeBlocks = blocks.value.slice(cubeStartIdx, cubeStartIdx + blocksPerCube);
      
      const cubeGroup = new THREE.Group();
      cubeGroup.name = `temp_cube_${cubeIdx}`;
      
      cubeBlocks.forEach((block, blockIdxInCube) => {
        const blockMesh = visualizeBlock(block, cubeStartIdx + blockIdxInCube, blockSpacing);
        if (blockMesh) {
          const x = (blockIdxInCube % 3) - 1;
          const y = Math.floor((blockIdxInCube % 9) / 3) - 1;
          const z = Math.floor(blockIdxInCube / 9) - 1;
          blockMesh.position.set(x * blockSpacing, y * blockSpacing, z * blockSpacing);
          if (blockMesh.material) {
            blockMesh.material.opacity = 1.0;
            blockMesh.material.transparent = false;
          }
          cubeGroup.add(blockMesh);
        }
      });
      
      if (cubeGroup.children.length > 0) {
        const cubeX = (cubeIdx % 3) * cubeSpacing - cubeSpacing;
        const cubeY = Math.floor((cubeIdx % 9) / 3) * cubeSpacing;
        const cubeZ = Math.floor(cubeIdx / 9) * cubeSpacing;
        cubeGroup.position.set(cubeX, cubeY, cubeZ);
        mainGroup.add(cubeGroup);
      }
    }
  }
  
  // Add main group to scene
  if (mainGroup.children.length > 0) {
    scene.scene.add(mainGroup);
    console.log(`[VIZ] Added mainGroup to scene with ${mainGroup.children.length} children`);
  } else {
    console.log('[VIZ] No objects to add to scene');
  }
  
  const pendingCount = pendingBlocks ? pendingBlocks.length : 0;
  console.log(`[VIZ] Updated: ${superCubes.value.length} supercubes, ${cubes.value.length} cubes, ${faces.value.length} faces, ${blocks.value.length} blocks, ${pendingCount} pending`);
}

// Visualize a face (3x3 grid of 9 blocks)
function visualizeFace(face, faceIdx, blockSpacing) {
  if (!cubicViz) return null;
  
  const faceGroup = new THREE.Group();
  faceGroup.name = `face_${faceIdx}`;
  faceGroup.userData.isFace = true;
  faceGroup.userData.faceData = face;
  
  const faceBlocks = face.blocks ? (Array.isArray(face.blocks) ? face.blocks : Array.from(face.blocks.values())) : [];
  
  // Face has 9 blocks in a 3x3 grid
  faceBlocks.forEach((block, position) => {
    const blockData = typeof block === 'object' ? block : { id: block };
    
    // Position is the key in the Map (0-8), or index in array
    const pos = typeof position === 'number' ? position : (blockData.location?.position !== undefined ? blockData.location.position : 0);
    
      // Use actual coordinates from ledger if available, otherwise calculate from position
      let blockX, blockY, blockZ;
      if (blockData.coordinates && typeof blockData.coordinates === 'object') {
        // Coordinates are { x, y, z } object from ledger
        blockX = (blockData.coordinates.x || 0) * blockSpacing;
        blockY = (blockData.coordinates.y || 0) * blockSpacing;
        blockZ = (blockData.coordinates.z || 0) * blockSpacing;
      } else if (blockData.coordinates && Array.isArray(blockData.coordinates) && blockData.coordinates.length >= 3) {
        // Fallback: coordinates as array [x, y, z]
        blockX = blockData.coordinates[0] * blockSpacing;
        blockY = blockData.coordinates[1] * blockSpacing;
        blockZ = blockData.coordinates[2] * blockSpacing;
      } else {
        // Fallback: Convert position to local x, y in face (3x3 grid, row-major)
        const col = pos % 3; // 0, 1, 2
        const row = Math.floor(pos / 3); // 0, 1, 2
        const localX = col - 1; // -1, 0, 1
        const localY = 1 - row; // 1, 0, -1 (inverted for y-up)
        blockX = localX * blockSpacing;
        blockY = localY * blockSpacing;
        blockZ = 0; // All blocks in a face are on the same z plane
      }
    
    // Create block mesh - GREEN CUBES
    const blockMesh = cubicViz.createBlock(0, 0, 0, {
      id: blockData.id || `block_face_${faceIdx}_${pos}`,
      color: 0x00ff00, // GREEN for blocks in faces
      opacity: 1.0
    });
    
    // Position block using actual coordinates or calculated position
    blockMesh.position.set(blockX, blockY, blockZ);
    
    blockMesh.name = `block_${blockData.id || `face_${faceIdx}_${pos}`}`;
    blockMesh.userData.isBlock = true;
    blockMesh.userData.blockData = {
      id: blockData.id,
      txId: blockData.txId || blockData.tx?.id,
      tx: blockData.tx,
      coordinates: blockData.coordinates,
      location: blockData.location || { faceIndex: face.index, position: pos }
    };
    
    faceGroup.add(blockMesh);
  });
  
  return faceGroup.children.length > 0 ? faceGroup : null;
}

// Visualize a cube (3 faces × 9 blocks = 27 blocks in 3x3x3 structure)
function visualizeCubeFromData(cube, cubeIdx, blockSpacing) {
  if (!cubicViz) return null;
  
  const cubeGroup = new THREE.Group();
  cubeGroup.name = `cube_${cubeIdx}`;
  cubeGroup.userData.isCube = true;
  cubeGroup.userData.cubeData = cube;
  
  // Get faces from cube - a cube has 3 faces, each with 9 blocks = 27 blocks total
  const faces = cube.faces ? (Array.isArray(cube.faces) ? cube.faces : Array.from(cube.faces.values())) : [];
  
  if (faces.length === 0) {
    return null;
  }
  
  // Organize blocks by face structure: 3 faces × 9 blocks = 27 blocks in 3x3x3 cube
  faces.forEach((face) => {
    const faceIndex = face.index !== undefined ? face.index : 0;
    const faceBlocks = face.blocks ? (Array.isArray(face.blocks) ? face.blocks : Array.from(face.blocks.values())) : [];
    
    // Each face is a 3x3 grid (9 blocks)
    faceBlocks.forEach((block, position) => {
      const blockData = typeof block === 'object' ? block : { id: block };
      
      // Position is the key in the Map (0-8), or index in array
      const pos = typeof position === 'number' ? position : (blockData.location?.position !== undefined ? blockData.location.position : 0);
      
      // Use actual coordinates from ledger if available, otherwise calculate from position
      let blockX, blockY, blockZ;
      if (blockData.coordinates && typeof blockData.coordinates === 'object') {
        // Coordinates are { x, y, z } object from ledger
        blockX = (blockData.coordinates.x || 0) * blockSpacing;
        blockY = (blockData.coordinates.y || 0) * blockSpacing;
        blockZ = (blockData.coordinates.z || 0) * blockSpacing;
      } else if (blockData.coordinates && Array.isArray(blockData.coordinates) && blockData.coordinates.length >= 3) {
        // Fallback: coordinates as array [x, y, z]
        blockX = blockData.coordinates[0] * blockSpacing;
        blockY = blockData.coordinates[1] * blockSpacing;
        blockZ = blockData.coordinates[2] * blockSpacing;
      } else {
        // Fallback: Convert position to local x, y in face (3x3 grid, row-major)
        const col = pos % 3; // 0, 1, 2
        const row = Math.floor(pos / 3); // 0, 1, 2
        const localX = col - 1; // -1, 0, 1
        const localY = 1 - row; // 1, 0, -1 (inverted for y-up)
        const localZ = faceIndex - 1; // -1, 0, 1 (face 0 = back, face 1 = middle, face 2 = front)
        blockX = localX * blockSpacing;
        blockY = localY * blockSpacing;
        blockZ = localZ * blockSpacing;
      }
      
      // Create block mesh - GREEN CUBES
      const blockMesh = cubicViz.createBlock(0, 0, 0, {
        id: blockData.id || `block_${cubeIdx}_${faceIndex}_${pos}`,
        color: 0x00ff00, // GREEN for blocks in cubes
        opacity: 1.0
      });
      
      // Position block using actual coordinates or calculated position
      blockMesh.position.set(blockX, blockY, blockZ);
      
      blockMesh.name = `block_${blockData.id || `${cubeIdx}_${faceIndex}_${pos}`}`;
      blockMesh.userData.isBlock = true;
      blockMesh.userData.blockData = {
        id: blockData.id,
        txId: blockData.txId || blockData.tx?.id,
        tx: blockData.tx,
        coordinates: blockData.coordinates,
        location: blockData.location || { faceIndex, position: pos, cubeIndex: cubeIdx }
      };
      
      cubeGroup.add(blockMesh);
    });
  });
  
  return cubeGroup.children.length > 0 ? cubeGroup : null;
}

function visualizeBlock(block, blockIdx, blockSpacing) {
  if (!cubicViz) {
    console.error('[VIZ] visualizeBlock: cubicViz not available');
    return null;
  }
  
  const blockData = typeof block === 'object' ? block : { id: block };
  
  // Create block mesh - always create it, position will be set by caller
  const blockMesh = cubicViz.createBlock(0, 0, 0, {
    id: blockData.id || `block_${blockIdx}`,
    color: 0xffff00, // Yellow for pending blocks
    opacity: 0.8
  });
  
  if (!blockMesh) {
    console.error('[VIZ] visualizeBlock: Failed to create block mesh');
    return null;
  }
  
  blockMesh.name = `block_${blockData.id || blockIdx}`;
  blockMesh.userData.isBlock = true;
  blockMesh.userData.blockData = {
    id: blockData.id,
    txId: blockData.txId || blockData.tx?.id,
    tx: blockData.tx,
    coordinates: blockData.coordinates,
    location: blockData.location
  };
  blockMesh.userData.blockIndex = blockIdx;
  
  return blockMesh;
}

function adjustCameraZoom() {
  if (!scene) return;
  
  const blockCount = metrics.value.blocksAdded || 0;
  const cubeCount = metrics.value.cubesCompleted || 0;
  const superCubeCount = metrics.value.superCubesCompleted || 0;
  
  // Calculate zoom based on structure size
  let baseRadius = 5;
  if (superCubeCount > 0) {
    baseRadius = 15 + superCubeCount * 3;
  } else if (cubeCount > 5) {
    baseRadius = 8 + cubeCount * 0.5;
  } else if (blockCount > 27) {
    baseRadius = 6 + (blockCount / 27) * 0.3;
  }
  
  zoomLevel.value = baseRadius / 5;
  
  // Smoothly adjust camera
  const targetRadius = baseRadius;
  const currentRadius = Math.sqrt(
    scene.camera.position.x ** 2 +
    scene.camera.position.y ** 2 +
    scene.camera.position.z ** 2
  );
  
  if (Math.abs(currentRadius - targetRadius) > 0.5) {
    const ratio = targetRadius / currentRadius;
    scene.camera.position.multiplyScalar(ratio);
  }
}


function startSimulator() {
  if (socket && isConnected.value) {
    socket.emit('simulator:start');
  }
}

function pauseSimulator() {
  if (socket && isConnected.value) {
    socket.emit('simulator:pause');
  }
}

function resumeSimulator() {
  if (socket && isConnected.value) {
    socket.emit('simulator:resume');
  }
}

function stopSimulator() {
  if (socket && isConnected.value) {
    socket.emit('simulator:stop');
  }
}
</script>

<style scoped>
#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.visualizer-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.canvas-container {
  width: 100%;
  height: 100%;
}

.controls {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 100;
}

.control-panel {
  background: rgba(10, 10, 15, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  min-width: 250px;
  backdrop-filter: blur(10px);
}

.control-panel h3 {
  margin: 0 0 15px 0;
  color: #fff;
  font-size: 18px;
}

.stats {
  margin-bottom: 20px;
}

.mempool-stats {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.mempool-stats h4 {
  margin: 0 0 10px 0;
  color: #fff;
  font-size: 14px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}

.stat-item .label {
  color: #aaa;
}

.stat-item .value {
  color: #fff;
  font-weight: 600;
}

.connection-status {
  display: flex;
  align-items: center;
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: #aaa;
}

.connection-status.connected {
  color: #4caf50;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f44336;
  margin-right: 8px;
}

.connection-status.connected .status-dot {
  background: #4caf50;
}

.block-details {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(10, 10, 15, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 20px;
  min-width: 300px;
  backdrop-filter: blur(10px);
  z-index: 100;
}

.block-details h4 {
  margin: 0 0 15px 0;
  color: #fff;
  font-size: 16px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.detail-item .label {
  color: #aaa;
}

.detail-item .value {
  color: #fff;
  font-weight: 600;
  word-break: break-all;
  text-align: right;
  max-width: 200px;
}

.close-btn {
  margin-top: 15px;
  padding: 8px 16px;
  background: #444;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.close-btn:hover {
  background: #555;
}

.controls-info {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(10, 10, 15, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 15px;
  backdrop-filter: blur(10px);
  z-index: 100;
}

.info-item {
  font-size: 11px;
  color: #aaa;
  margin-bottom: 5px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.simulator-controls {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.simulator-controls h4 {
  margin: 0 0 15px 0;
  color: #fff;
  font-size: 14px;
}

.control-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.control-btn {
  flex: 1;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-btn {
  background: #4caf50;
  color: #fff;
}

.start-btn:hover:not(:disabled) {
  background: #45a049;
}

.pause-btn {
  background: #ff9800;
  color: #fff;
}

.pause-btn:hover:not(:disabled) {
  background: #f57c00;
}

.resume-btn {
  background: #2196f3;
  color: #fff;
}

.resume-btn:hover:not(:disabled) {
  background: #1976d2;
}

.stop-btn {
  background: #f44336;
  color: #fff;
}

.stop-btn:hover:not(:disabled) {
  background: #da190b;
}

.simulator-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #aaa;
}

.simulator-status.running {
  color: #4caf50;
}

.simulator-status.paused {
  color: #ff9800;
}

.simulator-status .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}

.simulator-status.running .status-dot {
  background: #4caf50;
  box-shadow: 0 0 8px #4caf50;
}

.simulator-status.paused .status-dot {
  background: #ff9800;
  box-shadow: 0 0 8px #ff9800;
}
</style>

