<template>
  <div id="app">
    <div class="dashboard">
      <div class="sidebar">
        <h2>XMBL Dashboard</h2>
        
        <div class="controls-section">
          <button @click="restartSimulation" class="restart-btn">Restart Simulation</button>
        </div>
        
        <div class="metrics-section">
          <h3>System Metrics</h3>
          <div class="metric">
            <span class="label">Blocks:</span>
            <span class="value">{{ metrics.blocksAdded || 0 }}</span>
          </div>
          <div class="metric">
            <span class="label">Faces:</span>
            <span class="value">{{ metrics.facesCompleted || 0 }}</span>
          </div>
          <div class="metric">
            <span class="label">Cubes:</span>
            <span class="value">{{ metrics.cubesCompleted || 0 }}</span>
          </div>
          <div class="metric">
            <span class="label">Transactions:</span>
            <span class="value">{{ metrics.transactionsCreated || 0 }}</span>
          </div>
          <div class="metric">
            <span class="label">Validated:</span>
            <span class="value">{{ metrics.transactionsValidated || 0 }}</span>
          </div>
        </div>

        <div class="activity-section">
          <h3>Recent Activity</h3>
          <div class="activity-list">
            <div v-for="(activity, idx) in recentActivity" :key="idx" class="activity-item">
              <span class="activity-time">{{ formatTime(activity.timestamp) }}</span>
              <span class="activity-type">{{ activity.type }}</span>
              <span class="activity-detail">{{ activity.detail }}</span>
            </div>
          </div>
        </div>

        <div class="xsc-section">
          <h3>XSC Activity</h3>
          <div class="metric">
            <span class="label">Storage Ops:</span>
            <span class="value">{{ metrics.storageOperations || 0 }}</span>
          </div>
          <div class="metric">
            <span class="label">Compute Ops:</span>
            <span class="value">{{ metrics.computeOperations || 0 }}</span>
          </div>
          <div class="xsc-ops">
            <div v-for="(op, idx) in xscOperations" :key="idx" class="xsc-op">
              <span class="op-type">{{ op.type }}</span>
              <span class="op-detail">{{ op.detail }}</span>
            </div>
          </div>
        </div>

        <div class="xpc-section">
          <h3>XPC Consensus</h3>
          <div class="mempool-stats">
            <div class="mempool-item">
              <span class="label">Raw TX:</span>
              <span class="value">{{ mempoolStats.rawTx || 0 }}</span>
            </div>
            <div class="mempool-item">
              <span class="label">Processing:</span>
              <span class="value">{{ mempoolStats.processing || 0 }}</span>
            </div>
            <div class="mempool-item">
              <span class="label">Finalized:</span>
              <span class="value">{{ mempoolStats.finalized || 0 }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="main-content">
        <div id="three-container" ref="threeContainer"></div>
      </div>
    </div>
    
    <div class="log-stream">
      <div class="log-header">
        <h3>Simulation Log Stream</h3>
        <button @click="clearLogs" class="clear-btn">Clear</button>
      </div>
      <div class="log-content" ref="logContainer">
        <div 
          v-for="(log, idx) in logStream" 
          :key="idx" 
          :class="['log-entry', `log-${log.category}`]"
        >
          <span class="log-time">{{ formatTime(log.timestamp) }}</span>
          <span class="log-category">{{ log.category.toUpperCase() }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default {
  name: 'App',
  setup() {
    const threeContainer = ref(null);
    const metrics = ref({});
    const recentActivity = ref([]);
    const xscOperations = ref([]);
    const mempoolStats = ref({ rawTx: 0, processing: 0, finalized: 0 });
    const logStream = ref([]);
    const logContainer = ref(null);

    let scene, camera, renderer, controls;
    let blockMeshes = new Map();
    let cubeOutlines = new Map();
    let identityNodes = new Map(); // Map of identity address -> THREE.Mesh
    let connectionLines = new Map(); // Map of connection key -> THREE.Line
    let socket;
    const identities = ref(new Map()); // Track identities

    function initThree() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0f);

      camera = new THREE.PerspectiveCamera(
        75,
        (window.innerWidth - 300) / window.innerHeight,
        0.1,
        1000
      );
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth - 300, window.innerHeight);
      renderer.shadowMap.enabled = true;
      threeContainer.value.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Add lights
      const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);

      // Add grid helper (larger to see blocks better)
      const gridHelper = new THREE.GridHelper(50, 50, 0x333333, 0x222222);
      scene.add(gridHelper);

      // Add axes helper
      const axesHelper = new THREE.AxesHelper(5);
      scene.add(axesHelper);

      // Create node graph group
      const nodeGraphGroup = new THREE.Group();
      nodeGraphGroup.name = 'nodeGraph';
      scene.add(nodeGraphGroup);

      animate();
    }

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    function addBlock(blockData) {
      const { id, coordinates, location } = blockData;
      
      // Skip blocks with invalid position (-1 means not yet assigned)
      const position = location?.position;
      if (!location || position === undefined || position === null || Number(position) < 0) {
        console.warn(`Skipping block ${id} - invalid position:`, location, `position=${position}`);
        return;
      }
      
      // All blocks should have valid coordinates now (geometry handles invalid positions)
      if (!coordinates || coordinates.x === null || coordinates.y === null || coordinates.z === null) {
        console.warn('Block missing or invalid coordinates:', blockData);
        return;
      }

      // Scale factor for block size - make blocks more visible
      const blockSize = 1.0;
      const spacing = 1.0;

      // Calculate position from coordinates
      const x = coordinates.x * spacing;
      const y = coordinates.y * spacing;
      const z = coordinates.z * spacing;

      // Check if block already exists - update position if it does
      if (blockMeshes.has(id)) {
        const existingMesh = blockMeshes.get(id);
        // Update position if coordinates changed
        if (existingMesh.position.x !== x || existingMesh.position.y !== y || existingMesh.position.z !== z) {
          existingMesh.position.set(x, y, z);
          existingMesh.userData.location = location;
          existingMesh.userData.from = blockData.from;
          existingMesh.userData.to = blockData.to;
          // Update color if face index changed
          const material = existingMesh.material;
          const newColor = getBlockColor(location);
          material.color.setHex(newColor);
          material.emissive.setHex(newColor);
          console.log(`Updated block ${id} position to (${x}, ${y}, ${z})`);
          
          // Update node graph connections
          updateNodeGraph(blockData);
        }
        return;
      }

      console.log(`Adding block ${id} at (${x}, ${y}, ${z})`, coordinates, location);

      // Create block geometry and material
      const geometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
      const material = new THREE.MeshStandardMaterial({
        color: getBlockColor(location),
        metalness: 0.3,
        roughness: 0.7,
        emissive: getBlockColor(location),
        emissiveIntensity: 0.2
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { blockId: id, location, from: blockData.from, to: blockData.to };

      scene.add(mesh);
      blockMeshes.set(id, mesh);

      console.log(`Block ${id} added to scene. Total blocks: ${blockMeshes.size}`);

      // Update node graph connections
      updateNodeGraph(blockData);

      // Add cube outline if face is complete
      updateCubeOutline(location);
    }

    function getBlockColor(location) {
      if (!location) return 0x00ff00;
      
      const { faceIndex } = location;
      const colors = [0x00ff00, 0x0088ff, 0xff0088]; // Different colors per face
      return colors[faceIndex % 3] || 0x00ff00;
    }

    function updateCubeOutline(location) {
      if (!location) return;
      
      const { cubeIndex, level } = location;
      const cubeKey = `${level}-${cubeIndex || 'null'}`;

      // Check if we have 27 blocks for this cube
      const cubeBlocks = Array.from(blockMeshes.values()).filter(
        m => {
          const loc = m.userData.location;
          if (!loc) return false;
          // Match by cubeIndex (can be string or number)
          const matchCube = loc.cubeIndex === cubeIndex || 
                           String(loc.cubeIndex) === String(cubeIndex);
          return matchCube && loc.level === level;
        }
      );

      if (cubeBlocks.length === 27 && !cubeOutlines.has(cubeKey)) {
        // Calculate cube bounds
        const positions = cubeBlocks.map(b => b.position);
        const minX = Math.min(...positions.map(p => p.x)) - 0.5;
        const maxX = Math.max(...positions.map(p => p.x)) + 0.5;
        const minY = Math.min(...positions.map(p => p.y)) - 0.5;
        const maxY = Math.max(...positions.map(p => p.y)) + 0.5;
        const minZ = Math.min(...positions.map(p => p.z)) - 0.5;
        const maxZ = Math.max(...positions.map(p => p.z)) + 0.5;

        // Create wireframe box
        const boxGeometry = new THREE.BoxGeometry(
          maxX - minX,
          maxY - minY,
          maxZ - minZ
        );
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
        );
        line.position.set(
          (minX + maxX) / 2,
          (minY + maxY) / 2,
          (minZ + maxZ) / 2
        );
        scene.add(line);
        cubeOutlines.set(cubeKey, line);
        console.log(`Cube outline added for ${cubeKey} with ${cubeBlocks.length} blocks`);
      }
    }

    function updateNodeGraph(blockData) {
      const { from, to, id, coordinates } = blockData;
      if (!from || !to || !coordinates) return;

      const nodeGraphGroup = scene.getObjectByName('nodeGraph');
      if (!nodeGraphGroup) return;

      // Create or update identity nodes
      const nodeOffset = 15; // Offset node graph to the side
      const nodeSpacing = 3;

      [from, to].forEach((address) => {
        if (!identityNodes.has(address)) {
          // Create identity node (sphere)
          const nodeGeometry = new THREE.SphereGeometry(0.3, 16, 16);
          const nodeMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff88,
            emissive: 0x00ff88,
            emissiveIntensity: 0.5
          });
          const nodeMesh = new THREE.Mesh(nodeGeometry, nodeMaterial);
          
          // Position nodes in a vertical line on the right side
          const nodeIndex = identityNodes.size;
          const totalNodes = identityNodes.size + 1;
          nodeMesh.position.set(
            nodeOffset,
            (nodeIndex - (totalNodes - 1) / 2) * nodeSpacing,
            0
          );
          
          nodeMesh.userData = { address, type: 'identity' };
          nodeGraphGroup.add(nodeMesh);
          identityNodes.set(address, nodeMesh);
          identities.value.set(address, { address, txCount: 0 });
        }
        
        // Update transaction count
        const identity = identities.value.get(address);
        if (identity) {
          identity.txCount++;
        }
      });

      // Create connection line from identity node to block
      const fromNode = identityNodes.get(from);
      const toNode = identityNodes.get(to);
      const blockMesh = blockMeshes.get(id);

      if (fromNode && blockMesh) {
        const connectionKey = `${from}-${id}`;
        if (!connectionLines.has(connectionKey)) {
          const points = [
            new THREE.Vector3(fromNode.position.x, fromNode.position.y, fromNode.position.z),
            new THREE.Vector3(blockMesh.position.x, blockMesh.position.y, blockMesh.position.z)
          ];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: 0x00ff88,
            opacity: 0.3,
            transparent: true
          });
          const line = new THREE.Line(geometry, material);
          connectionLines.set(connectionKey, line);
          nodeGraphGroup.add(line);
        }
      }

      if (toNode && blockMesh) {
        const connectionKey = `${to}-${id}`;
        if (!connectionLines.has(connectionKey)) {
          const points = [
            new THREE.Vector3(toNode.position.x, toNode.position.y, toNode.position.z),
            new THREE.Vector3(blockMesh.position.x, blockMesh.position.y, blockMesh.position.z)
          ];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({
            color: 0x0088ff,
            opacity: 0.3,
            transparent: true
          });
          const line = new THREE.Line(geometry, material);
          connectionLines.set(connectionKey, line);
          nodeGraphGroup.add(line);
        }
      }

      // Update existing connection lines when block position changes
      if (blockMesh) {
        connectionLines.forEach((line, key) => {
          if (key.includes(id)) {
            const [address] = key.split('-');
            const node = identityNodes.get(address);
            if (node) {
              const points = [
                new THREE.Vector3(node.position.x, node.position.y, node.position.z),
                new THREE.Vector3(blockMesh.position.x, blockMesh.position.y, blockMesh.position.z)
              ];
              line.geometry.setFromPoints(points);
            }
          }
        });
      }
    }

    function updateCubeVisualization(cubeData) {
      const { cubeId, level } = cubeData;
      const cubeKey = `${level}-${cubeId || 'null'}`;
      
      // Find all blocks for this cube
      const cubeBlocks = Array.from(blockMeshes.values()).filter(
        m => {
          const loc = m.userData.location;
          if (!loc) return false;
          const matchCube = loc.cubeIndex === cubeId || 
                           String(loc.cubeIndex) === String(cubeId);
          return matchCube && loc.level === level;
        }
      );

      if (cubeBlocks.length >= 27 && !cubeOutlines.has(cubeKey)) {
        // Calculate cube bounds
        const positions = cubeBlocks.map(b => b.position);
        const minX = Math.min(...positions.map(p => p.x)) - 0.5;
        const maxX = Math.max(...positions.map(p => p.x)) + 0.5;
        const minY = Math.min(...positions.map(p => p.y)) - 0.5;
        const maxY = Math.max(...positions.map(p => p.y)) + 0.5;
        const minZ = Math.min(...positions.map(p => p.z)) - 0.5;
        const maxZ = Math.max(...positions.map(p => p.z)) + 0.5;

        // Create wireframe box
        const boxGeometry = new THREE.BoxGeometry(
          maxX - minX,
          maxY - minY,
          maxZ - minZ
        );
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 })
        );
        line.position.set(
          (minX + maxX) / 2,
          (minY + maxY) / 2,
          (minZ + maxZ) / 2
        );
        scene.add(line);
        cubeOutlines.set(cubeKey, line);
        console.log(`✓ Cube visualization added for ${cubeKey} with ${cubeBlocks.length} blocks`);
      }
    }

    function addActivity(type, detail) {
      recentActivity.value.unshift({
        type,
        detail,
        timestamp: Date.now()
      });
      if (recentActivity.value.length > 20) {
        recentActivity.value.pop();
      }
    }

    function addLog(category, message, data = null) {
      const logEntry = {
        category,
        message,
        data,
        timestamp: Date.now()
      };
      logStream.value.push(logEntry);
      
      // Keep last 500 logs
      if (logStream.value.length > 500) {
        logStream.value.shift();
      }
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (logContainer.value) {
          logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
      }, 10);
    }

    function clearLogs() {
      logStream.value = [];
    }

    function clearLocalState() {
      // Clear all 3D objects
      blockMeshes.forEach(mesh => scene.remove(mesh));
      blockMeshes.clear();
      cubeOutlines.forEach(outline => scene.remove(outline));
      cubeOutlines.clear();
      identityNodes.forEach(node => {
        const nodeGraphGroup = scene.getObjectByName('nodeGraph');
        if (nodeGraphGroup) nodeGraphGroup.remove(node);
      });
      identityNodes.clear();
      connectionLines.forEach(line => {
        const nodeGraphGroup = scene.getObjectByName('nodeGraph');
        if (nodeGraphGroup) nodeGraphGroup.remove(line);
      });
      connectionLines.clear();
      identities.value.clear();
      
      // Reset all metrics to zero
      metrics.value = {
        blocksAdded: 0,
        facesCompleted: 0,
        cubesCompleted: 0,
        transactionsCreated: 0,
        transactionsValidated: 0,
        storageOperations: 0,
        computeOperations: 0
      };
      recentActivity.value = [];
      xscOperations.value = [];
      mempoolStats.value = { rawTx: 0, processing: 0, finalized: 0 };
      logStream.value = [];
    }

    function restartSimulation() {
      if (socket && socket.connected) {
        socket.emit('restart:simulation');
        addLog('system', 'Restarting simulation...', {});
        // Clear local state immediately
        clearLocalState();
      }
    }

    function formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    }

    function connectSocket() {
      socket = io('http://localhost:3000', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: Infinity
      });

      socket.on('connect', () => {
        console.log('Connected to bridge server');
        // Don't clear state on connect - server will send existing blocks
        // Only reset metrics, not the visual state
        metrics.value = {
          blocksAdded: 0,
          facesCompleted: 0,
          cubesCompleted: 0,
          transactionsCreated: 0,
          transactionsValidated: 0,
          stateDiffsCreated: 0,
          stateAssemblies: 0,
          storageOperations: 0,
          computeOperations: 0,
          uptime: 0
        };
        mempoolStats.value = { rawTx: 0, processing: 0, finalized: 0 };
        addLog('system', 'Connected to bridge server', { status: 'connected' });
        addActivity('system', 'Connected to bridge server');
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from bridge server');
        addActivity('system', 'Disconnected from bridge server');
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        addActivity('system', 'Connection error - retrying...');
      });

      socket.on('xclt:block:added', (data) => {
        console.log('Received block:', data);
        addBlock(data);
        const blockId = data.id?.substring(0, 8) || 'unknown';
        const coords = data.coordinates ? `(${data.coordinates.x}, ${data.coordinates.y}, ${data.coordinates.z})` : '';
        addLog('ledger', `Block added: ${blockId} at ${coords}`, data);
        addActivity('xclt', `Block ${blockId} added`);
      });

      socket.on('xclt:block:updated', (data) => {
        console.log('Block position updated:', data);
        addBlock(data); // addBlock handles updates for existing blocks
      });

      socket.on('xclt:face:complete', async (data) => {
        const faceIdx = data.faceIndex !== undefined ? data.faceIndex : 'unknown';
        const blockCount = data.blockCount || 9;
        addLog('ledger', `Face ${faceIdx} completed with ${blockCount} blocks`, data);
        addActivity('xclt', `Face ${faceIdx} completed`);
        // Request updated block positions for this face
        if (socket && socket.connected) {
          socket.emit('request:face:blocks', { faceIndex: data.faceIndex });
        }
      });

      socket.on('xclt:cube:complete', (data) => {
        console.log('Cube completed:', data);
        const cubeId = data.cubeId?.substring(0, 8) || data.cubeId || 'unknown';
        const level = data.level || 1;
        const faceCount = data.faceCount || 3;
        addLog('ledger', `✓ CUBE COMPLETE: ${cubeId} (Level ${level}, ${faceCount} faces)`, data);
        addActivity('xclt', `Cube ${cubeId} completed (Level ${level})`);
        // Update cube outline visualization
        updateCubeVisualization(data);
      });

      socket.on('xclt:supercube:complete', (data) => {
        addActivity('xclt', `Super-cube ${data.superCubeId} completed (Level ${data.level})`);
      });

      socket.on('xid:identity:created', (data) => {
        const address = data.address;
        if (!identities.value.has(address)) {
          identities.value.set(address, { address, txCount: 0 });
        }
        addLog('identity', `New identity created: ${address.substring(0, 12)}...`, data);
        addActivity('xid', `Identity ${address.substring(0, 8)} created`);
      });

      socket.on('xpc:transaction:new', (data) => {
        const txType = data.type || 'unknown';
        const txId = data.id?.substring(0, 8) || 'unknown';
        addLog('transaction', `New ${txType} transaction: ${txId}`, data);
        addActivity('xpc', `TX ${txId}: ${txType}`);
      });

      socket.on('xpc:raw_tx:added', (data) => {
        const rawTxId = data.rawTxId?.substring(0, 8) || 'unknown';
        addLog('validation', `Raw TX added to mempool: ${rawTxId} (${data.txType || 'unknown'})`, data);
      });

      socket.on('xpc:validation_tasks:created', (data) => {
        const rawTxId = data.rawTxId?.substring(0, 8) || 'unknown';
        addLog('validation', `Validation tasks created: ${data.taskCount} validators for TX ${rawTxId}`, data);
      });

      socket.on('xpc:validation:complete', (data) => {
        const rawTxId = data.rawTxId?.substring(0, 8) || 'unknown';
        const validatorId = data.validatorId?.substring(0, 8) || 'unknown';
        addLog('validation', `✓ Validator ${validatorId} completed validation for TX ${rawTxId}`, data);
      });

      socket.on('xpc:tx:moved_to_processing', (data) => {
        const rawTxId = data.rawTxId?.substring(0, 8) || 'unknown';
        const txId = data.txId?.substring(0, 8) || 'unknown';
        addLog('validation', `→ TX ${rawTxId} moved to processing (validated hash: ${txId})`, data);
      });

      socket.on('xpc:tx:processing', (data) => {
        const txId = data.txId?.substring(0, 8) || 'unknown';
        addLog('validation', `⚙ Processing TX ${txId} (avg timestamp calculated)`, data);
      });

      socket.on('xpc:tx:finalized', (data) => {
        const txId = data.txId?.substring(0, 8) || 'unknown';
        addLog('validation', `✓✓ TX ${txId} FINALIZED - ready for ledger inclusion`, data);
      });

      socket.on('xvsm:state:diff', (data) => {
        const changeCount = data.changes ? Object.keys(data.changes).length : 0;
        addLog('state', `State diff created: ${changeCount} changes for TX ${data.txId?.substring(0, 8) || 'unknown'}`, data);
        addActivity('xvsm', `State diff: ${changeCount} changes`);
      });

      socket.on('xsc:operation', (data) => {
        const opType = data.type || 'unknown';
        const key = data.key?.substring(0, 12) || 'unknown';
        const size = data.size || 0;
        addLog('storage', `${opType.toUpperCase()}: ${key}... (${size} bytes)`, data);
        xscOperations.value.unshift({
          type: data.type,
          detail: `Key: ${data.key.substring(0, 8)}... Size: ${data.size}`
        });
        if (xscOperations.value.length > 10) {
          xscOperations.value.pop();
        }
        addActivity('xsc', `${data.type} operation`);
      });

      socket.on('xsc:compute:operation', (data) => {
        const funcName = data.functionName || 'unknown';
        const duration = data.duration?.toFixed(0) || '0';
        const memory = data.memory ? ` (${data.memory}MB)` : '';
        addLog('compute', `EXECUTE: ${funcName} - ${duration}ms${memory}`, data);
        xscOperations.value.unshift({
          type: 'compute',
          detail: `${data.functionName} (${data.duration.toFixed(0)}ms)`
        });
        if (xscOperations.value.length > 10) {
          xscOperations.value.pop();
        }
        addActivity('xsc', `Compute: ${data.functionName}`);
        // Note: State changes from compute ops will come via xvsm:state:diff
      });

      socket.on('system:metrics', (data) => {
        metrics.value = data;
      });

      socket.on('xpc:metrics', (data) => {
        mempoolStats.value = {
          rawTx: data.rawTx || 0,
          processing: data.processing || 0,
          finalized: data.finalized || 0
        };
      });

      socket.on('simulation:clearing', (data) => {
        // Clear all state when server signals clearing
        clearLocalState();
        addLog('system', 'Simulation clearing...', data);
      });

      socket.on('simulation:restarted', (data) => {
        addLog('system', 'Simulation restarted from zero', data);
        addActivity('system', 'Simulation restarted');
      });

      socket.on('simulation:restart:error', (data) => {
        addLog('system', `Restart error: ${data.error}`, data);
        addActivity('system', 'Restart failed');
      });
    }

    function handleResize() {
      if (camera && renderer) {
        camera.aspect = (window.innerWidth - 300) / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth - 300, window.innerHeight);
      }
    }

    onMounted(() => {
      initThree();
      connectSocket();
      window.addEventListener('resize', handleResize);
    });

    onUnmounted(() => {
      if (socket) socket.disconnect();
      window.removeEventListener('resize', handleResize);
      if (renderer) {
        renderer.dispose();
      }
    });

    return {
      threeContainer,
      metrics,
      recentActivity,
      xscOperations,
      mempoolStats,
      logStream,
      logContainer,
      formatTime,
      clearLogs,
      restartSimulation
    };
  }
};
</script>

<style scoped>
#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.dashboard {
  display: flex;
  width: 100%;
  height: 100%;
}

.sidebar {
  width: 300px;
  background: #1a1a1f;
  color: #e0e0e0;
  padding: 20px;
  overflow-y: auto;
  border-right: 1px solid #333;
}

.sidebar h2 {
  margin: 0 0 20px 0;
  color: #fff;
  font-size: 24px;
}

.sidebar h3 {
  margin: 20px 0 10px 0;
  color: #aaa;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.metrics-section,
.activity-section,
.xsc-section,
.xpc-section {
  margin-bottom: 30px;
}

.metric {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #333;
}

.metric .label {
  color: #aaa;
}

.metric .value {
  color: #fff;
  font-weight: bold;
}

.activity-list {
  max-height: 200px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  border-bottom: 1px solid #333;
  font-size: 12px;
}

.activity-time {
  color: #666;
  font-size: 10px;
}

.activity-type {
  color: #0f0;
  font-weight: bold;
}

.activity-detail {
  color: #aaa;
  margin-top: 4px;
}

.xsc-ops {
  max-height: 150px;
  overflow-y: auto;
  margin-top: 10px;
}

.xsc-op {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  border-bottom: 1px solid #333;
  font-size: 11px;
}

.op-type {
  color: #0ff;
  font-weight: bold;
}

.op-detail {
  color: #888;
  margin-top: 2px;
}

.mempool-stats {
  margin-top: 10px;
}

.mempool-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #333;
  font-size: 12px;
}

.main-content {
  flex: 1;
  position: relative;
  margin-bottom: 200px; /* Space for log stream */
}

#three-container {
  width: 100%;
  height: 100%;
}

.log-stream {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 200px;
  background: #0a0a0f;
  border-top: 2px solid #333;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 15px;
  background: #1a1a1f;
  border-bottom: 1px solid #333;
}

.log-header h3 {
  margin: 0;
  color: #fff;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.clear-btn {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.2s;
}

.clear-btn:hover {
  background: #444;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 4px 8px;
  margin-bottom: 2px;
  border-left: 3px solid transparent;
  transition: background 0.1s;
}

.log-entry:hover {
  background: rgba(255, 255, 255, 0.05);
}

.log-time {
  color: #666;
  min-width: 80px;
  font-size: 10px;
}

.log-category {
  min-width: 80px;
  font-weight: bold;
  font-size: 10px;
}

.log-message {
  color: #ccc;
  flex: 1;
}

.log-identity {
  border-left-color: #00ff00;
}

.log-identity .log-category {
  color: #00ff00;
}

.log-transaction {
  border-left-color: #00aaff;
}

.log-transaction .log-category {
  color: #00aaff;
}

.log-state {
  border-left-color: #ffaa00;
}

.log-state .log-category {
  color: #ffaa00;
}

.log-validation {
  border-left-color: #00ff88;
}

.log-validation .log-category {
  color: #00ff88;
}

.log-storage {
  border-left-color: #ff00ff;
}

.log-storage .log-category {
  color: #ff00ff;
}

.log-compute {
  border-left-color: #00ffff;
}

.log-compute .log-category {
  color: #00ffff;
}

.log-ledger {
  border-left-color: #ffff00;
}

.log-ledger .log-category {
  color: #ffff00;
}

.log-system {
  border-left-color: #ffffff;
}

.log-system .log-category {
  color: #ffffff;
}

/* Scrollbar styling */
.log-content::-webkit-scrollbar {
  width: 8px;
}

.log-content::-webkit-scrollbar-track {
  background: #0a0a0f;
}

.log-content::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 4px;
}

.log-content::-webkit-scrollbar-thumb:hover {
  background: #444;
}

.controls-section {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #333;
}

.restart-btn {
  width: 100%;
  padding: 12px;
  background: #ff4444;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: background 0.2s;
}

.restart-btn:hover {
  background: #ff6666;
}

.restart-btn:active {
  background: #cc0000;
}
</style>
