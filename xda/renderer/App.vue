<template>
  <div class="app-container">
    <header>
      <h1>XMBL Desktop App</h1>
      <div class="node-status">
        <span :class="{ online: nodeStatus.running, offline: !nodeStatus.running }">
          {{ nodeStatus.running ? '●' : '○' }}
        </span>
        <span>Peers: {{ nodeStatus.peers }}</span>
        <span>Height: {{ nodeStatus.height }}</span>
      </div>
    </header>
    
    <main>
      <section class="wallet">
        <h2>Wallet</h2>
        <div class="balance">
          <p class="amount">{{ balance }} XMBL</p>
        </div>
        
        <div class="send">
          <h3>Send Transaction</h3>
          <input v-model="recipient" placeholder="Recipient address" />
          <input v-model.number="amount" type="number" placeholder="Amount" step="0.000001" />
          <button @click="sendTransaction" class="send-btn" :disabled="!recipient || !amount || sending">
            {{ sending ? 'Sending...' : 'Send' }}
          </button>
          <p v-if="txError" class="error">{{ txError }}</p>
          <p v-if="txSuccess" class="success">Transaction sent: {{ txSuccess }}</p>
        </div>
      </section>
      
      <section class="node-controls">
        <h2>Node Controls</h2>
        <button @click="toggleNode" class="toggle-btn" :disabled="toggling">
          {{ nodeStatus.running ? 'Stop' : 'Start' }} Node
        </button>
        <p v-if="nodeError" class="error">{{ nodeError }}</p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const balance = ref(0);
const recipient = ref('');
const amount = ref(0);
const nodeStatus = ref({ running: false, peers: 0, height: 0 });
const sending = ref(false);
const toggling = ref(false);
const txError = ref('');
const txSuccess = ref('');
const nodeError = ref('');

let statusUpdateCallback = null;
let statusInterval = null;

async function loadBalance() {
  try {
    const response = await window.electronAPI.getBalance('current');
    if (response.error) {
      console.error('Error loading balance:', response.error);
    } else {
      balance.value = response.balance;
    }
  } catch (error) {
    console.error('Error loading balance:', error);
  }
}

async function sendTransaction() {
  if (!recipient.value || !amount.value) return;
  
  sending.value = true;
  txError.value = '';
  txSuccess.value = '';
  
  try {
    const tx = {
      to: recipient.value,
      amount: parseFloat(amount.value)
    };
    const response = await window.electronAPI.sendTransaction(tx);
    
    if (response.error) {
      txError.value = response.error;
    } else {
      txSuccess.value = response.txId;
      recipient.value = '';
      amount.value = 0;
      await loadBalance();
    }
  } catch (error) {
    txError.value = error.message;
  } finally {
    sending.value = false;
  }
}

async function loadNodeStatus() {
  try {
    const status = await window.electronAPI.getNodeStatus();
    if (status.error) {
      nodeError.value = status.error;
    } else {
      nodeStatus.value = status;
      nodeError.value = '';
    }
  } catch (error) {
    console.error('Error loading node status:', error);
    nodeError.value = error.message;
  }
}

async function toggleNode() {
  toggling.value = true;
  nodeError.value = '';
  
  try {
    const action = nodeStatus.value.running ? 'stopNode' : 'startNode';
    const response = await window.electronAPI[action]();
    
    if (response.error) {
      nodeError.value = response.error;
    } else {
      await loadNodeStatus();
    }
  } catch (error) {
    nodeError.value = error.message;
  } finally {
    toggling.value = false;
  }
}

onMounted(async () => {
  await loadBalance();
  await loadNodeStatus();
  
  // Listen for node status updates
  statusUpdateCallback = (status) => {
    nodeStatus.value = status;
  };
  window.electronAPI.onNodeStatusUpdate(statusUpdateCallback);
  
  // Refresh status periodically
  statusInterval = setInterval(loadNodeStatus, 5000);
});

onUnmounted(() => {
  if (statusUpdateCallback) {
    window.electronAPI.removeNodeStatusUpdate(statusUpdateCallback);
  }
  if (statusInterval) {
    clearInterval(statusInterval);
  }
});
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

header {
  padding: 20px;
  background: #2c3e50;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

header h1 {
  margin: 0;
  font-size: 24px;
}

.node-status {
  display: flex;
  gap: 20px;
  align-items: center;
  font-size: 14px;
}

.online {
  color: #42b983;
  font-size: 20px;
}

.offline {
  color: #e74c3c;
  font-size: 20px;
}

main {
  flex: 1;
  padding: 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  background: #f5f5f5;
}

section {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

section h2 {
  margin-top: 0;
  color: #2c3e50;
}

.balance {
  margin: 20px 0;
}

.amount {
  font-size: 32px;
  font-weight: bold;
  color: #42b983;
  margin: 10px 0;
}

.send h3 {
  margin-top: 20px;
  color: #2c3e50;
}

.send input {
  width: 100%;
  margin: 5px 0;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.send-btn, .toggle-btn {
  width: 100%;
  padding: 10px;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
  font-size: 16px;
  font-weight: bold;
}

.send-btn:hover:not(:disabled), .toggle-btn:hover:not(:disabled) {
  background: #35a372;
}

.send-btn:disabled, .toggle-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error {
  color: #e74c3c;
  margin-top: 10px;
  font-size: 14px;
}

.success {
  color: #42b983;
  margin-top: 10px;
  font-size: 14px;
}
</style>



