const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  startStreetsGLServer: () => ipcRenderer.invoke('app:start-streets-gl-server'),
  isElectron: true
})
