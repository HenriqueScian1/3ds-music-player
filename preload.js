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
  getDefaultGamesFolder: () => ipcRenderer.invoke('default-games-folder'),
  pickGamesFolder: () => ipcRenderer.invoke('pick-games-folder'),
  pickExe: (defaultPath) => ipcRenderer.invoke('pick-exe', defaultPath),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  scanGames: (dir) => ipcRenderer.invoke('scan-games', dir),
  launchGame: (exe) => ipcRenderer.invoke('launch-game', exe),
  getTools: () => ipcRenderer.invoke('get-tools'),
  download: (payload) => ipcRenderer.invoke('download', payload),
  onDlLog: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('dl-log', handler);
    return () => ipcRenderer.removeListener('dl-log', handler);
  }
});
