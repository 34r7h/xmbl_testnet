const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { XMBLCore } = require('../src/core/xmbl-core.js');

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
      network: {
        port: 3000
      },
      storage: {
        capacity: 1000000000
      }
    });
    
    await this.core.init();
    this.nodeInitialized = true;
    
    // Set up IPC handlers
    this.setupIPC();
    
    // Set up app event handlers
    this.setupAppHandlers();
    
    // Set up periodic status updates
    this.statusUpdateInterval = setInterval(() => {
      this.emitNodeStatusUpdate();
    }, 5000);
    
    console.log('XMBL Desktop App starting...');
  }

  setupIPC() {
    ipcMain.handle('getBalance', async (event, address) => {
      try {
        const balance = await this.core.getBalance(address);
        return { balance };
      } catch (error) {
        console.error('Error getting balance:', error);
        return { balance: 0, error: error.message };
      }
    });

    ipcMain.handle('sendTransaction', async (event, tx) => {
      try {
        const result = await this.core.sendTransaction(tx);
        console.log('Transaction sent:', result.txId);
        return { txId: result.txId };
      } catch (error) {
        console.error('Error sending transaction:', error);
        return { error: error.message };
      }
    });

    ipcMain.handle('getNodeStatus', async () => {
      try {
        return {
          running: this.core.isRunning(),
          peers: this.core.getPeerCount(),
          height: this.core.getBlockHeight()
        };
      } catch (error) {
        console.error('Error getting node status:', error);
        return { running: false, peers: 0, height: 0, error: error.message };
      }
    });

    ipcMain.handle('startNode', async () => {
      try {
        await this.core.start();
        console.log('Node started');
        this.emitNodeStatusUpdate();
        return { success: true };
      } catch (error) {
        console.error('Error starting node:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('stopNode', async () => {
      try {
        await this.core.stop();
        console.log('Node stopped');
        this.emitNodeStatusUpdate();
        return { success: true };
      } catch (error) {
        console.error('Error stopping node:', error);
        return { success: false, error: error.message };
      }
    });
  }

  emitNodeStatusUpdate() {
    const status = {
      running: this.core.isRunning(),
      peers: this.core.getPeerCount(),
      height: this.core.getBlockHeight()
    };
    
    this.windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('node-status-update', status);
      }
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

    app.on('before-quit', async () => {
      if (this.statusUpdateInterval) {
        clearInterval(this.statusUpdateInterval);
      }
      if (this.core) {
        await this.core.stop();
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
        preload: path.join(__dirname, '../preload/preload.js')
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
    // Create a simple tray icon (will need actual icon file later)
    const iconPath = path.join(__dirname, '../assets/icon.png');
    
    // For now, create tray without icon if it doesn't exist
    try {
      this.tray = new Tray(iconPath);
    } catch (error) {
      console.log('Tray icon not found, skipping tray creation');
      return;
    }
    
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
main.init().catch(console.error);

module.exports = main;
