const { contextBridge, ipcRenderer } = require('electron');

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
  },
  
  removeNodeStatusUpdate: (callback) => {
    ipcRenderer.removeListener('node-status-update', callback);
  }
});
