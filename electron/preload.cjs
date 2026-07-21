const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  startStreetsGLServer: () => ipcRenderer.invoke('app:start-streets-gl-server'),
  getStreetsGLBaseUrl: () => ipcRenderer.invoke('app:get-streets-gl-base-url'),
  replicateStatus: () => ipcRenderer.invoke('replicate:status'),
  replicateRequest: (request) => ipcRenderer.invoke('replicate:request', request),
  isElectron: true
})
