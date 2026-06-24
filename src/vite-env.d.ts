/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_ACCESS_TOKEN?: string
  readonly VITE_REPLICATE_API_TOKEN?: string
  readonly VITE_IFC_WASM_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Electron preload API (only present when running in Electron desktop app)
interface ElectronAPI {
  startStreetsGLServer: () => Promise<{ started: boolean; message: string }>
  isElectron: true
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
