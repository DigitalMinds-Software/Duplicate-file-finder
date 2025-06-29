const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scanDirectory: (options) => ipcRenderer.invoke('scan-directory', options),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // Event listeners
  onDirectorySelected: (callback) => ipcRenderer.on('directory-selected', callback),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
