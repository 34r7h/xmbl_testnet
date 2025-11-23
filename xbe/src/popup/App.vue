<template>
  <div class="popup-container">
    <header>
      <h1>XMBL Wallet</h1>
    </header>
    
    <section class="balance">
      <h2>Balance</h2>
      <p class="amount">{{ balance }} XMBL</p>
    </section>
    
    <section class="send">
      <h2>Send</h2>
      <input v-model="recipient" placeholder="Recipient address" />
      <input v-model="amount" type="number" placeholder="Amount" step="0.000001" />
      <button @click="sendTransaction" class="send-btn">Send</button>
    </section>
    
    <section class="node-status">
      <h2>Node Status</h2>
      <p>Status: {{ nodeStatus.running ? 'Running' : 'Stopped' }}</p>
      <p>Peers: {{ nodeStatus.peers }}</p>
      <p>Height: {{ nodeStatus.height }}</p>
      <button @click="toggleNode" class="node-btn">
        {{ nodeStatus.running ? 'Stop' : 'Start' }} Node
      </button>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import browser from 'webextension-polyfill';

const balance = ref(0);
const recipient = ref('');
const amount = ref(0);
const nodeStatus = ref({ running: false, peers: 0, height: 0 });

async function loadBalance() {
  try {
    const response = await browser.runtime.sendMessage({ 
      type: 'getBalance', 
      address: 'current' 
    });
    balance.value = response.balance || 0;
  } catch (error) {
    console.error('Error loading balance:', error);
  }
}

async function sendTransaction() {
  if (!recipient.value || !amount.value) {
    alert('Please enter recipient and amount');
    return;
  }
  
  try {
    const tx = {
      to: recipient.value,
      amount: parseFloat(amount.value)
    };
    const response = await browser.runtime.sendMessage({ 
      type: 'sendTransaction', 
      tx 
    });
    console.log('Transaction sent:', response.txId);
    alert(`Transaction sent: ${response.txId}`);
    
    // Reset form
    recipient.value = '';
    amount.value = 0;
    
    // Reload balance
    await loadBalance();
  } catch (error) {
    console.error('Error sending transaction:', error);
    alert('Error sending transaction: ' + error.message);
  }
}

async function loadNodeStatus() {
  try {
    const status = await browser.runtime.sendMessage({ type: 'getNodeStatus' });
    nodeStatus.value = status;
  } catch (error) {
    console.error('Error loading node status:', error);
  }
}

async function toggleNode() {
  try {
    const action = nodeStatus.value.running ? 'stopNode' : 'startNode';
    await browser.runtime.sendMessage({ type: action });
    await loadNodeStatus();
  } catch (error) {
    console.error('Error toggling node:', error);
    alert('Error toggling node: ' + error.message);
  }
}

onMounted(async () => {
  await loadBalance();
  await loadNodeStatus();
  // Refresh status periodically
  setInterval(loadNodeStatus, 5000);
});
</script>

<style scoped>
.popup-container {
  width: 400px;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

header h1 {
  margin: 0 0 20px 0;
  font-size: 24px;
  color: #333;
}

.balance {
  margin: 20px 0;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
}

.balance h2 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #666;
}

.amount {
  font-size: 32px;
  font-weight: bold;
  color: #42b983;
  margin: 0;
}

.send {
  margin: 20px 0;
}

.send h2 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
}

.send input {
  width: 100%;
  margin: 5px 0;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 14px;
}

.send-btn {
  width: 100%;
  padding: 12px;
  margin-top: 10px;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
}

.send-btn:hover {
  background: #35a372;
}

.node-status {
  margin: 20px 0;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
}

.node-status h2 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
}

.node-status p {
  margin: 5px 0;
  font-size: 14px;
  color: #666;
}

.node-btn {
  width: 100%;
  padding: 10px;
  margin-top: 10px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.node-btn:hover {
  background: #2980b9;
}
</style>


