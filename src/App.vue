<template>
  <div id="app">
    <h1>XMBL Testnet - Module Progress Tracker</h1>
    <div class="modules">
      <div v-for="module in modules" :key="module.name" class="module-card" :class="module.status">
        <div class="module-header">
        <h2>{{ module.name }}</h2>
          <span class="status-badge" :class="module.status">{{ module.statusText }}</span>
        </div>
        <p class="description">{{ module.description }}</p>
        <div class="metrics">
          <div class="metric">
            <span class="label">Tests:</span>
            <span class="value">{{ module.tests }}</span>
          </div>
          <div class="metric">
            <span class="label">Coverage:</span>
            <span class="value">{{ module.coverage }}%</span>
          </div>
          <div class="metric">
            <span class="label">Port:</span>
            <span class="value">{{ module.port }}</span>
          </div>
        </div>
        <div class="readiness">
          <div class="readiness-bar">
            <div class="readiness-fill" :style="{ width: module.readiness + '%' }"></div>
          </div>
          <span class="readiness-text">{{ module.readiness }}% Ready</span>
        </div>
        <div class="next-steps" v-if="module.nextSteps.length > 0">
          <h3>Next Steps:</h3>
          <ul>
            <li v-for="(step, index) in module.nextSteps" :key="index">{{ step }}</li>
          </ul>
        </div>
        <div class="last-updated">
          Last updated: {{ module.lastUpdated }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const modules = ref([
  { 
    name: 'XID', 
    description: "XMBL's MAYO Signatures - Quantum-resistant identity system", 
    port: 3003,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Set up project structure', 'Port MAYO C to WASM', 'Implement key generation'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XN', 
    description: 'XMBL Networking - P2P networking layer', 
    port: 3000,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Set up libp2p', 'Implement peer discovery', 'Add message routing'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XCLT', 
    description: 'XMBL Cubic Ledger Technology - 3D geometric ledger', 
    port: 3001,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Implement digital root calculation', 'Create block/face/cube structures', 'Add state persistence'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XVSM', 
    description: 'XMBL Virtual State Machine - Verkle tree state management', 
    port: 3002,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Implement Verkle tree', 'Add state diff management', 'Integrate WASM execution'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XPC', 
    description: 'XMBL Peer Consensus - User-as-validator consensus', 
    port: 3004,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Implement mempool structure', 'Add validation task system', 'Create leader election'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XSC', 
    description: 'XMBL Storage and Compute - P2P storage and WASM compute', 
    port: 3005,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Implement storage sharding', 'Add erasure coding', 'Create WASM compute runtime'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XCLI', 
    description: 'XMBL Command Line - CLI interface for all operations', 
    port: 3007,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Set up Commander.js', 'Implement transaction commands', 'Add node management'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XV', 
    description: 'XMBL Visualizer - 3D visualization with Three.js', 
    port: 3008,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Set up Three.js scene', 'Create cubic visualization', 'Add mempool charts'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XSIM', 
    description: 'XMBL Simulator - Full system random simulator', 
    port: 3006,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Create identity simulator', 'Add transaction simulator', 'Implement validation simulator'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XBE', 
    description: 'XMBL Browser Extension - WebExtension wallet and node', 
    port: null,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Create manifest.json', 'Implement background script', 'Build popup UI'],
    lastUpdated: 'Not started'
  },
  { 
    name: 'XDA', 
    description: 'XMBL Desktop App - Electron desktop wallet and node', 
    port: null,
    tests: 0,
    coverage: 0,
    readiness: 0,
    status: 'pending',
    statusText: 'Pending',
    nextSteps: ['Set up Electron main process', 'Create renderer UI', 'Configure electron-builder'],
    lastUpdated: 'Not started'
  }
])

// Load progress from localStorage or API
function loadProgress() {
  const saved = localStorage.getItem('xmbl-module-progress')
  if (saved) {
    try {
      const savedModules = JSON.parse(saved)
      modules.value = modules.value.map(module => {
        const saved = savedModules.find(m => m.name === module.name)
        return saved ? { ...module, ...saved } : module
      })
    } catch (e) {
      console.error('Failed to load progress:', e)
    }
  }
}

// Update module status based on metrics
function updateModuleStatus(module) {
  if (module.coverage >= 90 && module.readiness >= 90) {
    module.status = 'ready'
    module.statusText = 'Ready'
  } else if (module.coverage >= 50 || module.readiness >= 50) {
    module.status = 'in-progress'
    module.statusText = 'In Progress'
  } else if (module.tests > 0 || module.readiness > 0) {
    module.status = 'started'
    module.statusText = 'Started'
  } else {
    module.status = 'pending'
    module.statusText = 'Pending'
  }
}

// Save progress to localStorage
function saveProgress() {
  localStorage.setItem('xmbl-module-progress', JSON.stringify(modules.value))
}

onMounted(() => {
  loadProgress()
  modules.value.forEach(updateModuleStatus)
  
  // Simulate progress updates (replace with actual test runner integration)
  setInterval(() => {
    // In real implementation, this would fetch from test runner
    saveProgress()
  }, 5000)
})
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.modules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.module-card {
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
  background: #f9f9f9;
  transition: transform 0.2s, box-shadow 0.2s;
}

.module-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.module-card.pending {
  border-color: #ccc;
  background: #f5f5f5;
}

.module-card.started {
  border-color: #ffa500;
  background: #fff8e1;
}

.module-card.in-progress {
  border-color: #2196f3;
  background: #e3f2fd;
}

.module-card.ready {
  border-color: #4caf50;
  background: #e8f5e9;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.module-card h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: bold;
  text-transform: uppercase;
}

.status-badge.pending {
  background: #ccc;
  color: #666;
}

.status-badge.started {
  background: #ffa500;
  color: white;
}

.status-badge.in-progress {
  background: #2196f3;
  color: white;
}

.status-badge.ready {
  background: #4caf50;
  color: white;
}

.description {
  margin: 0.5rem 0 1rem 0;
  color: #666;
  font-size: 0.9rem;
}

.metrics {
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
  padding: 0.75rem;
  background: white;
  border-radius: 4px;
}

.metric {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.metric .label {
  font-size: 0.75rem;
  color: #999;
  text-transform: uppercase;
}

.metric .value {
  font-size: 1.25rem;
  font-weight: bold;
  color: #2c3e50;
}

.readiness {
  margin: 1rem 0;
}

.readiness-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.readiness-fill {
  height: 100%;
  background: linear-gradient(90deg, #4caf50, #8bc34a);
  transition: width 0.3s;
}

.readiness-text {
  font-size: 0.85rem;
  color: #666;
}

.next-steps {
  margin: 1rem 0;
  padding: 0.75rem;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #2196f3;
}

.next-steps h3 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #2196f3;
  text-transform: uppercase;
}

.next-steps ul {
  margin: 0;
  padding-left: 1.25rem;
}

.next-steps li {
  font-size: 0.85rem;
  color: #666;
  margin: 0.25rem 0;
}

.last-updated {
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.5rem;
  font-style: italic;
}
</style>



