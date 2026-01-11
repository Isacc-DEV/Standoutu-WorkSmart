const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartwork', {
  isElectron: true,
  openJobWindow: (url) => ipcRenderer.invoke('open-job-window', url),
  setAppBadge: (count, badgeDataUrl) => ipcRenderer.invoke('set-app-badge', { count, badgeDataUrl }),
});
