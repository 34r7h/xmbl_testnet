# XBE - XMBL Browser Extension Instructions

## Overview

XBE is a WebExtension that provides a full-featured XMBL client/node running in the browser. It serves as both a wallet for key management and transaction signing, and a full node for participating in the XMBL network. Built with Vue 3 for the UI and WebExtension APIs for browser integration, XBE enables seamless XMBL interaction directly from the browser.

## Fundamentals

### Key Concepts

- **WebExtension**: Browser extension using WebExtension APIs
- **Background Script**: Runs P2P node in background
- **Popup UI**: Vue 3 interface for wallet and node management
- **Content Scripts**: Inject XMBL functionality into web pages
- **Wallet**: Key management and transaction signing
- **Full Node**: Complete XMBL node capabilities

### Dependencies

- **vue**: Vue 3 for UI
- **webextension-polyfill**: WebExtension API polyfill
- **webpack**: Bundling for extension
- **all XMBL modules**: xid, xn, xclt, xvsm, xpc, xsc (browser-compatible versions)

### Architectural Decisions

- **Background Node**: Full node runs in background script
- **Message Passing**: Communication between background, popup, and content scripts
- **Storage**: Use browser storage API for keys and state
- **WASM Support**: Load WASM modules for crypto and compute

## Development Steps

### Step 1: Project Setup

```bash
cd xbe
npm init -y
npm install vue@next webextension-polyfill
npm install --save-dev webpack webpack-cli @vitejs/plugin-vue vite
```

### Step 2: Manifest Configuration

**Create** (`manifest.json`):

```json
{
  "manifest_version": 3,
  "name": "XMBL Wallet",
  "version": "0.1.0",
  "description": "XMBL Browser Extension - Wallet and Node",
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "http://*/*",
    "https://*/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["wasm/*.wasm"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### Step 3: Background Script (TDD)

**Test First** (`__tests__/background.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { BackgroundNode } from '../src/background';

describe('Background Node', () => {
  test('should initialize node', async () => {
    const node = new BackgroundNode();
    await node.init();
    expect(node.isInitialized()).toBe(true);
  });

  test('should handle messages from popup', async () => {
    const node = new BackgroundNode();
    await node.init();
    const response = await node.handleMessage({ type: 'getBalance', address: 'alice' });
    expect(response).toHaveProperty('balance');
  });

  test('should start P2P node', async () => {
    const node = new BackgroundNode();
    await node.init();
    await node.startNode();
    expect(node.isNodeRunning()).toBe(true);
  });
});
```

**Implementation** (`src/background.js`):

```javascript
import browser from 'webextension-polyfill';
import { XMBLCore } from 'xmbl-core';

class BackgroundNode {
  constructor() {
    this.core = null;
    this.initialized = false;
    this.nodeRunning = false;
  }

  async init() {
    if (this.initialized) return;
    
    // Initialize XMBL core
    this.core = new XMBLCore({
      storage: 'browser', // Use browser storage
      network: 'browser' // Browser networking
    });
    
    await this.core.init();
    this.initialized = true;
    
    // Set up message listener
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message).then(sendResponse);
      return true; // Async response
    });
  }

  async handleMessage(message) {
    switch (message.type) {
      case 'getBalance':
        return await this.getBalance(message.address);
      case 'sendTransaction':
        return await this.sendTransaction(message.tx);
      case 'getNodeStatus':
        return await this.getNodeStatus();
      case 'startNode':
        return await this.startNode();
      case 'stopNode':
        return await this.stopNode();
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  async getBalance(address) {
    const balance = await this.core.getBalance(address);
    return { balance };
  }

  async sendTransaction(tx) {
    const txId = await this.core.sendTransaction(tx);
    return { txId };
  }

  async getNodeStatus() {
    return {
      running: this.nodeRunning,
      peers: this.core.getPeerCount(),
      height: this.core.getBlockHeight()
    };
  }

  async startNode() {
    if (this.nodeRunning) return { success: true };
    await this.core.start();
    this.nodeRunning = true;
    return { success: true };
  }

  async stopNode() {
    if (!this.nodeRunning) return { success: true };
    await this.core.stop();
    this.nodeRunning = false;
    return { success: true };
  }

  isInitialized() {
    return this.initialized;
  }

  isNodeRunning() {
    return this.nodeRunning;
  }
}

// Initialize on install
browser.runtime.onInstalled.addListener(() => {
  const node = new BackgroundNode();
  node.init();
});

// Keep background script alive
const node = new BackgroundNode();
node.init();
```

### Step 4: Popup UI (TDD)

**Test** (`__tests__/popup.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { mount } from '@vue/test-utils';
import PopupApp from '../src/popup/App.vue';

describe('Popup UI', () => {
  test('should render popup', () => {
    const wrapper = mount(PopupApp);
    expect(wrapper.find('.popup-container').exists()).toBe(true);
  });

  test('should display balance', async () => {
    const wrapper = mount(PopupApp);
    await wrapper.setData({ balance: 100.5 });
    expect(wrapper.text()).toContain('100.5');
  });

  test('should send transaction', async () => {
    const wrapper = mount(PopupApp);
    await wrapper.find('input[placeholder="Recipient"]').setValue('bob');
    await wrapper.find('input[placeholder="Amount"]').setValue('1.0');
    await wrapper.find('button.send').trigger('click');
    // Verify transaction sent
  });
});
```

**Implementation** (`src/popup/App.vue`):

```vue
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
      <input v-model="amount" type="number" placeholder="Amount" />
      <button @click="sendTransaction" class="send-btn">Send</button>
    </section>
    
    <section class="node-status">
      <h2>Node Status</h2>
      <p>Status: {{ nodeStatus.running ? 'Running' : 'Stopped' }}</p>
      <p>Peers: {{ nodeStatus.peers }}</p>
      <button @click="toggleNode">{{ nodeStatus.running ? 'Stop' : 'Start' }} Node</button>
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
  const response = await browser.runtime.sendMessage({ type: 'getBalance', address: 'current' });
  balance.value = response.balance;
}

async function sendTransaction() {
  const tx = {
    to: recipient.value,
    amount: parseFloat(amount.value)
  };
  const response = await browser.runtime.sendMessage({ type: 'sendTransaction', tx });
  console.log('Transaction sent:', response.txId);
  // Reset form
  recipient.value = '';
  amount.value = 0;
  // Reload balance
  await loadBalance();
}

async function loadNodeStatus() {
  const status = await browser.runtime.sendMessage({ type: 'getNodeStatus' });
  nodeStatus.value = status;
}

async function toggleNode() {
  const action = nodeStatus.value.running ? 'stopNode' : 'startNode';
  await browser.runtime.sendMessage({ type: action });
  await loadNodeStatus();
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
}

.balance {
  margin: 20px 0;
}

.amount {
  font-size: 24px;
  font-weight: bold;
}

.send {
  margin: 20px 0;
}

.send input {
  width: 100%;
  margin: 5px 0;
  padding: 8px;
}

.send-btn {
  width: 100%;
  padding: 10px;
  background: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.node-status {
  margin: 20px 0;
}
</style>
```

### Step 5: Content Script (TDD)

**Test** (`__tests__/content.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { ContentScript } from '../src/content';

describe('Content Script', () => {
  test('should inject XMBL provider', () => {
    const script = new ContentScript();
    script.injectProvider();
    expect(window.xmbl).toBeDefined();
  });

  test('should handle transaction requests', async () => {
    const script = new ContentScript();
    script.injectProvider();
    const tx = { to: 'bob', amount: 1.0 };
    const result = await window.xmbl.sendTransaction(tx);
    expect(result).toHaveProperty('txId');
  });
});
```

**Implementation** (`src/content.js`):

```javascript
import browser from 'webextension-polyfill';

// Inject XMBL provider into page
function injectProvider() {
  const script = document.createElement('script');
  script.textContent = `
    window.xmbl = {
      async sendTransaction(tx) {
        return new Promise((resolve, reject) => {
          browser.runtime.sendMessage({
            type: 'sendTransaction',
            tx
          }).then(resolve).catch(reject);
        });
      },
      async getBalance(address) {
        return new Promise((resolve, reject) => {
          browser.runtime.sendMessage({
            type: 'getBalance',
            address
          }).then(resolve).catch(reject);
        });
      }
    };
  `;
  document.documentElement.appendChild(script);
  script.remove();
}

// Inject provider when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectProvider);
} else {
  injectProvider();
}
```

### Step 6: Webpack Build Configuration

**Create** (`webpack.config.js`):

```javascript
const path = require('path');

module.exports = {
  entry: {
    background: './src/background.js',
    popup: './src/popup/main.js',
    content: './src/content.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader'
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.vue']
  }
};
```

## Interfaces/APIs

### Background Script API

```javascript
// Message types
{
  type: 'getBalance',
  address: string
}

{
  type: 'sendTransaction',
  tx: Transaction
}

{
  type: 'getNodeStatus'
}

{
  type: 'startNode' | 'stopNode'
}
```

### Content Script API

```javascript
window.xmbl.sendTransaction(tx: Transaction): Promise<{txId: string}>;
window.xmbl.getBalance(address: string): Promise<{balance: number}>;
```

## Testing

### Test Scenarios

1. **Background Script**
   - Node initialization
   - Message handling
   - Node start/stop

2. **Popup UI**
   - Balance display
   - Transaction sending
   - Node status

3. **Content Script**
   - Provider injection
   - Transaction requests
   - Balance queries

4. **Integration**
   - Background-popup communication
   - Content-background communication
   - Storage persistence

### Coverage Goals

- 90%+ code coverage
- All message types tested
- UI interactions tested
- Browser compatibility

## Integration Notes

### Module Dependencies

- **All XMBL modules**: Browser-compatible versions
- **WASM modules**: Loaded from web_accessible_resources

### Integration Pattern

```javascript
// Background script initializes core
import { XMBLCore } from 'xmbl-core';
const core = new XMBLCore({ storage: 'browser', network: 'browser' });

// Popup communicates via messages
browser.runtime.sendMessage({ type: 'getBalance', address: 'alice' });

// Content script exposes API
window.xmbl.sendTransaction(tx);
```

## Terminal and Browser Monitoring

### Terminal Output

- **Build Process**: Log webpack build
  ```javascript
  console.log('Building extension...');
  ```

- **Extension Load**: Log extension installation
  ```javascript
  console.log('Extension installed');
  ```

### Screenshot Requirements

Capture browser screenshots for:
- Popup UI
- Content script injection
- Transaction confirmation dialogs
- Node status displays

### Browser Console

- **Background Script**: Check background console for node logs
- **Popup Console**: Check popup console for UI logs
- **Content Script**: Check page console for provider logs
- **Network Tab**: Monitor WebSocket connections
- **Application Tab**: Check storage and cache

### Console Logging

- Log all message passing
- Include transaction details (without private keys)
- Log node status changes
- Include error details
