# XDA - XMBL Desktop App Instructions

## Overview

XDA is an Electron desktop application that provides a full-featured XMBL client/node with wallet functionality. Built with Vue 3 for the UI and Electron for desktop integration, XDA offers the same capabilities as the browser extension but with full system access for enhanced performance and features. It serves as both a user's wallet and a full node for participating in the XMBL network.

## Fundamentals

### Key Concepts

- **Electron**: Desktop app framework (Node.js + Chromium)
- **Vue 3**: UI framework for renderer process
- **Main Process**: Node.js process with full system access
- **Renderer Process**: Chromium process for UI
- **IPC**: Inter-process communication between main and renderer
- **Full Node**: Complete XMBL node capabilities
- **Wallet**: Key management and transaction signing

### Dependencies

- **electron**: Electron framework
- **vue**: Vue 3 for UI
- **electron-builder**: Packaging and distribution
- **all XMBL modules**: xid, xn, xclt, xvsm, xpc, xsc

### Architectural Decisions

- **Main Process Node**: Full node runs in main process
- **Renderer UI**: Vue 3 UI in renderer process
- **IPC Communication**: Secure message passing between processes
- **System Integration**: System tray, notifications, auto-update

## Development Steps

### Step 1: Project Setup

```bash
cd xda
npm init -y
npm install electron vue@next
npm install --save-dev electron-builder @vitejs/plugin-vue vite jest @types/jest
```

### Step 2: Electron Main Process (TDD)

**Test First** (`__tests__/main.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { MainProcess } from '../src/main/main';

describe('Main Process', () => {
  test('should initialize XMBL node', async () => {
    const main = new MainProcess();
    await main.init();
    expect(main.isNodeInitialized()).toBe(true);
  });

  test('should handle IPC messages', async () => {
    const main = new MainProcess();
    await main.init();
    const response = await main.handleIPC({ type: 'getBalance', address: 'alice' });
    expect(response).toHaveProperty('balance');
  });

  test('should create window', () => {
    const main = new MainProcess();
    const window = main.createWindow();
    expect(window).toBeDefined();
  });
});
```

**Implementation** (`src/main/main.js`):

```javascript
import { app, BrowserWindow, ipcMain, Tray, Menu } from 'electron';
import path from 'path';
import { XMBLCore } from 'xmbl-core';

class MainProcess {
  constructor() {
    this.windows = new Map();
    this.tray = null;
    this.core = null;
    this.nodeInitialized = false;
  }

  async init() {
    // Initialize XMBL core
    this.core = new XMBLCore({
      storage: 'leveldb', // Use LevelDB for desktop
      network: 'libp2p' // Full libp2p networking
    });
    
    await this.core.init();
    this.nodeInitialized = true;
    
    // Set up IPC handlers
    this.setupIPC();
    
    // Set up app event handlers
    this.setupAppHandlers();
  }

  setupIPC() {
    ipcMain.handle('getBalance', async (event, address) => {
      const balance = await this.core.getBalance(address);
      return { balance };
    });

    ipcMain.handle('sendTransaction', async (event, tx) => {
      const txId = await this.core.sendTransaction(tx);
      return { txId };
    });

    ipcMain.handle('getNodeStatus', async () => {
      return {
        running: this.core.isRunning(),
        peers: this.core.getPeerCount(),
        height: this.core.getBlockHeight()
      };
    });

    ipcMain.handle('startNode', async () => {
      await this.core.start();
      return { success: true };
    });

    ipcMain.handle('stopNode', async () => {
      await this.core.stop();
      return { success: true };
    });
  }

  setupAppHandlers() {
    app.whenReady().then(() => {
      this.createWindow();
      this.createTray();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (this.windows.size === 0) {
        this.createWindow();
      }
    });
  }

  createWindow() {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    if (process.env.NODE_ENV === 'development') {
      win.loadURL('http://localhost:5173');
      win.webContents.openDevTools();
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    this.windows.set(win.id, win);
    
    win.on('closed', () => {
      this.windows.delete(win.id);
    });
  }

  createTray() {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    this.tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show', click: () => this.showWindow() },
      { label: 'Quit', click: () => app.quit() }
    ]);
    
    this.tray.setToolTip('XMBL Desktop App');
    this.tray.setContextMenu(contextMenu);
    this.tray.on('click', () => this.showWindow());
  }

  showWindow() {
    if (this.windows.size === 0) {
      this.createWindow();
    } else {
      const win = Array.from(this.windows.values())[0];
      win.show();
    }
  }

  isNodeInitialized() {
    return this.nodeInitialized;
  }
}

// Start main process
const main = new MainProcess();
main.init();

export default main;
```

### Step 3: Preload Script

**Create** (`src/main/preload.js`):

```javascript
import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getBalance: (address) => ipcRenderer.invoke('getBalance', address),
  sendTransaction: (tx) => ipcRenderer.invoke('sendTransaction', tx),
  getNodeStatus: () => ipcRenderer.invoke('getNodeStatus'),
  startNode: () => ipcRenderer.invoke('startNode'),
  stopNode: () => ipcRenderer.invoke('stopNode'),
  
  onNodeStatusUpdate: (callback) => {
    ipcRenderer.on('node-status-update', (event, status) => callback(status));
  }
});
```

### Step 4: Renderer Process (Vue 3) (TDD)

**Test** (`__tests__/renderer.test.js`):

```javascript
import { describe, test, expect } from 'jest';
import { mount } from '@vue/test-utils';
import App from '../src/renderer/App.vue';

describe('Renderer App', () => {
  test('should render app', () => {
    const wrapper = mount(App);
    expect(wrapper.find('.app-container').exists()).toBe(true);
  });

  test('should display balance', async () => {
    const wrapper = mount(App);
    await wrapper.setData({ balance: 100.5 });
    expect(wrapper.text()).toContain('100.5');
  });
});
```

**Implementation** (`src/renderer/App.vue`):

```vue
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
          <input v-model="amount" type="number" placeholder="Amount" />
          <button @click="sendTransaction" class="send-btn">Send</button>
        </div>
      </section>
      
      <section class="node-controls">
        <h2>Node Controls</h2>
        <button @click="toggleNode" class="toggle-btn">
          {{ nodeStatus.running ? 'Stop' : 'Start' }} Node
        </button>
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

async function loadBalance() {
  const response = await window.electronAPI.getBalance('current');
  balance.value = response.balance;
}

async function sendTransaction() {
  const tx = {
    to: recipient.value,
    amount: parseFloat(amount.value)
  };
  const response = await window.electronAPI.sendTransaction(tx);
  console.log('Transaction sent:', response.txId);
  recipient.value = '';
  amount.value = 0;
  await loadBalance();
}

async function loadNodeStatus() {
  const status = await window.electronAPI.getNodeStatus();
  nodeStatus.value = status;
}

async function toggleNode() {
  const action = nodeStatus.value.running ? 'stopNode' : 'startNode';
  await window.electronAPI[action]();
  await loadNodeStatus();
}

onMounted(async () => {
  await loadBalance();
  await loadNodeStatus();
  
  // Listen for node status updates
  window.electronAPI.onNodeStatusUpdate((status) => {
    nodeStatus.value = status;
  });
  
  // Refresh status periodically
  const interval = setInterval(loadNodeStatus, 5000);
  
  onUnmounted(() => {
    clearInterval(interval);
  });
});
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  padding: 20px;
  background: #2c3e50;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.node-status {
  display: flex;
  gap: 20px;
  align-items: center;
}

.online {
  color: #42b983;
}

.offline {
  color: #e74c3c;
}

main {
  flex: 1;
  padding: 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.balance {
  margin: 20px 0;
}

.amount {
  font-size: 32px;
  font-weight: bold;
}

.send input {
  width: 100%;
  margin: 5px 0;
  padding: 8px;
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
}
</style>
```

### Step 5: Electron Builder Configuration

**Create** (`electron-builder.config.js`):

```javascript
module.exports = {
  appId: 'com.xmbl.desktop',
  productName: 'XMBL Desktop',
  directories: {
    output: 'dist'
  },
  files: [
    'src/main/**/*',
    'src/renderer/**/*',
    'node_modules/**/*'
  ],
  mac: {
    category: 'public.app-category.finance',
    target: 'dmg'
  },
  win: {
    target: 'nsis'
  },
  linux: {
    target: 'AppImage'
  }
};
```

### Step 6: Package.json Scripts

**Update** (`package.json`):

```json
{
  "main": "src/main/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build && electron-builder",
    "start": "electron .",
    "test": "jest"
  }
}
```

## Interfaces/APIs

### IPC API (Main ↔ Renderer)

```javascript
// Renderer to Main
window.electronAPI.getBalance(address: string): Promise<{balance: number}>;
window.electronAPI.sendTransaction(tx: Transaction): Promise<{txId: string}>;
window.electronAPI.getNodeStatus(): Promise<NodeStatus>;
window.electronAPI.startNode(): Promise<{success: boolean}>;
window.electronAPI.stopNode(): Promise<{success: boolean}>;

// Main to Renderer
ipcMain.emit('node-status-update', status);
```

## Testing

### Test Scenarios

1. **Main Process**
   - Node initialization
   - IPC message handling
   - Window creation
   - System tray

2. **Renderer Process**
   - UI rendering
   - Balance display
   - Transaction sending
   - Node controls

3. **IPC Communication**
   - Message passing
   - Error handling
   - Async operations

4. **Integration**
   - Full app workflow
   - Node lifecycle
   - Storage persistence

### Coverage Goals

- 90%+ code coverage
- All IPC methods tested
- UI interactions tested
- Cross-platform compatibility

## Integration Notes

### Module Dependencies

- **All XMBL modules**: Full Node.js versions
- **LevelDB**: Native storage for desktop
- **libp2p**: Full P2P networking

### Integration Pattern

```javascript
// Main process initializes core
import { XMBLCore } from 'xmbl-core';
const core = new XMBLCore({ storage: 'leveldb', network: 'libp2p' });

// Renderer communicates via IPC
const balance = await window.electronAPI.getBalance('alice');

// Main process handles IPC
ipcMain.handle('getBalance', async (event, address) => {
  return await core.getBalance(address);
});
```

## Terminal and Browser Monitoring

### Terminal Output

- **App Start**: Log app initialization
  ```javascript
  console.log('XMBL Desktop App starting...');
  ```

- **Node Status**: Log node operations
  ```javascript
  console.log(`Node ${running ? 'started' : 'stopped'}`);
  ```

- **Build Process**: Log electron-builder output
  ```javascript
  console.log('Building desktop app...');
  ```

### Screenshot Requirements

Capture screenshots for:
- Main application window
- System tray menu
- Transaction dialogs
- Node status displays
- Settings windows

### Browser Console

- **Renderer Console**: Check DevTools console for UI logs
- **Main Process**: Check terminal for main process logs
- **Network Tab**: Monitor WebSocket connections
- **Performance Tab**: Profile app performance

### Console Logging

- Log all IPC messages
- Include transaction details (without private keys)
- Log node status changes
- Include error details
- Log system events (window, tray, etc.)
