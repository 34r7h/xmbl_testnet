<template>
  <div id="app">
    <h1>XMBL Testnet</h1>
    <div class="modules">
      <div v-for="module in modules" :key="module.name" class="module-card">
        <h2>{{ module.name }}</h2>
        <p>{{ module.description }}</p>
        <p class="port">Port: {{ module.port }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const modules = [
  { name: 'XCLT', description: 'XMBL Cubic Ledger Technology', port: 3001 },
  { name: 'XVSM', description: 'XMBL Virtual State Machine', port: 3002 },
  { name: 'XID', description: "XMBL's Mayo Signatures", port: 3003 },
  { name: 'XPC', description: 'XMBL Peer Consensus', port: 3004 },
  { name: 'XSC', description: 'XMBL Storage and Compute', port: 3005 },
  { name: 'XSIM', description: 'XMBL Simulator', port: 3006 },
  { name: 'XCLI', description: 'XMBL Command Line', port: 3007 },
  { name: 'XV', description: 'XMBL Visualizer', port: 3008 }
]
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  padding: 2rem;
}

.modules {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
  margin-top: 2rem;
}

.module-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  background: #f9f9f9;
}

.module-card h2 {
  margin: 0 0 0.5rem 0;
  color: #42b983;
}

.module-card p {
  margin: 0.5rem 0;
}

.port {
  font-size: 0.9em;
  color: #666;
}
</style>



