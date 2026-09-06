const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getDefaultFolder: () => ipcRenderer.invoke('default-folder'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scanFolder: (dir) => ipcRenderer.invoke('scan-folder', dir),
  onTrackFound: (cb) => {
    const handler = (_e, track) => cb(track);
    ipcRenderer.on('track-found', handler);
    return () => ipcRenderer.removeListener('track-found', handler);
  },
  getTools: () => ipcRenderer.invoke('get-tools'),
  download: (payload) => ipcRenderer.invoke('download', payload),
  onDlLog: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('dl-log', handler);
    return () => ipcRenderer.removeListener('dl-log', handler);
  }
});
