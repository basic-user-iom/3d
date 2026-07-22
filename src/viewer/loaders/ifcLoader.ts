import * as THREE from 'three'
import { LoadedModel } from '../useViewer'
import { buildThreeGroupFromIfcModel } from './ifcThreeAdapter'

function resolveWasmPath(): string {
  const envPath = import.meta.env.VITE_IFC_WASM_PATH as string | undefined
  if (envPath) return envPath.endsWith('/') ? envPath : `${envPath}/`
  const base = (import.meta.env.BASE_URL as string | undefined) || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}web-ifc/`
}

function isRevitSource(data: File | ArrayBuffer | string): boolean {
  if (typeof data !== 'string') return false
  const url = data.toLowerCase()
  return (
    url.includes('/api/revit/download') ||
    url.includes('/api/revit/upload') ||
    url.includes('revit')
  )
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  return (
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  )
}

async function resolveIfcBytes(
  data: File | ArrayBuffer | string,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  if (data instanceof Uint8Array) {
    return data
  }
  if (isArrayBufferLike(data)) {
    return new Uint8Array(data)
  }
  if (typeof data === 'string') {
    const response = await fetch(data)
    if (!response.ok) {
      throw new Error(`Failed to fetch IFC (${response.status} ${response.statusText})`)
    }
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (!response.body || !onProgress || !contentLength) {
      return new Uint8Array(await response.arrayBuffer())
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        received += value.byteLength
        onProgress(Math.min(99, (received / contentLength) * 100))
      }
    }
    const merged = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    return merged
  }
  throw new Error('Invalid IFC data source')
}

/**
 * Loader for IFC (Industry Foundation Classes) files.
 * Uses maintained `web-ifc` WASM plus a project-owned Three.js adapter
 * (replaces abandoned `web-ifc-three` which peered three@^0.149.0).
 */
export async function loadIFC(
  data: File | ArrayBuffer | string,
  onProgress?: (progress: number) => void
): Promise<LoadedModel> {
  const { IfcAPI } = await import('web-ifc')
  const ifcAPI = new IfcAPI()
  const wasmPath = resolveWasmPath()
  ifcAPI.SetWasmPath(wasmPath)
  await ifcAPI.Init()

  let modelID = -1
  try {
    const bytes = await resolveIfcBytes(data, onProgress)
    onProgress?.(100)

    modelID = ifcAPI.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
    if (modelID < 0) {
      throw new Error('web-ifc failed to open IFC model')
    }

    const { root, meshCount, totalVertices } = buildThreeGroupFromIfcModel(ifcAPI, modelID)

    // Geometry has been copied into Three.js buffers; free WASM model memory.
    ifcAPI.CloseModel(modelID)
    modelID = -1

    root.userData.isModel = true
    root.userData.isImportedModel = true
    root.userData.excludeFromSkyModifications = true
    root.userData.excludeFromWeatherModifications = true
    root.userData.format = 'ifc'
    root.visible = true

    if (isRevitSource(data)) {
      root.userData.isRevitModel = true
      root.userData.excludeFromStreetsGLHiding = true
    }

    const group = new THREE.Group()
    group.add(root)
    group.userData.isModel = true
    group.userData.excludeFromSkyModifications = true
    group.userData.excludeFromWeatherModifications = true
    group.userData.format = 'ifc'
    group.visible = true
    if (root.userData.isRevitModel) {
      group.userData.isRevitModel = true
      group.userData.excludeFromStreetsGLHiding = true
    }

    if (import.meta.env.DEV) {
      console.log(
        `[IFCLoader] Model contains ${meshCount} mesh(es) with ${totalVertices.toLocaleString()} total vertices`
      )
    }

    return {
      scene: group,
      animations: [],
      userData: {
        format: 'ifc',
        meshCount,
        totalVertices,
        wasmPath
      }
    }
  } catch (error) {
    if (modelID >= 0) {
      try {
        ifcAPI.CloseModel(modelID)
      } catch {
        // ignore cleanup errors
      }
    }
    throw new Error(`Failed to load IFC: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
