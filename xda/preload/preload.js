// Preload script for secure IPC
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xmbl', {
  // Expose safe APIs to renderer
  getNodeStatus: () => ipcRenderer.invoke('get-node-status'),
  sendTransaction: (tx) => ipcRenderer.invoke('send-transaction', tx)
});

