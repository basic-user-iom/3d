export type ModelFormat =
  | 'gltf'
  | 'glb'
  | 'fbx'
  | 'obj'
  | 'stl'
  | 'ply'
  | 'splat-ply'
  | '3mf'
  | 'dae'
  | '3ds'
  | '3dm'
  | 'dxf'
  | 'dwg'
  | 'ifc'
  | 'zip'
  | 'splat'
  | 'ksplat'
  | 'unknown'

export function detectFormat(input: File | string | ArrayBuffer): ModelFormat {
  if (input instanceof File) {
    const ext = input.name.toLowerCase().split('.').pop() || ''
    return extensionToFormat(ext)
  }

  if (typeof input === 'string') {
    // URL or filename
    const url = new URL(input, window.location.href)
    const pathname = url.pathname.toLowerCase()
    const ext = pathname.split('.').pop() || ''
    return extensionToFormat(ext)
  }

  // ArrayBuffer - try to detect by magic bytes
  if (input instanceof ArrayBuffer) {
    const view = new Uint8Array(input.slice(0, 12))
    
    // ZIP: starts with "PK" (0x50 0x4B) - check this first to avoid false positives
    if (view[0] === 0x50 && view[1] === 0x4B) {
      return 'zip'
    }
    
    // GLB: starts with glTF magic (0x46546C67)
    if (view[0] === 0x67 && view[1] === 0x6C && view[2] === 0x54 && view[3] === 0x46) {
      return 'glb'
    }
    
    // STL: starts with "solid" (ASCII) or 80 bytes header (binary)
    if (view[0] === 0x73 && view[1] === 0x6F && view[2] === 0x6C && view[3] === 0x69 && view[4] === 0x64) {
      return 'stl'
    }
    
    // FBX: Binary FBX files start with "Kaydara FBX Binary"
    const textDecoder = new TextDecoder('utf-8', { fatal: false })
    const header = textDecoder.decode(view.slice(0, 20))
    if (header.includes('Kaydara')) {
      return 'fbx'
    }

    if (header.toLowerCase().startsWith('ply')) {
      return 'ply'
    }
  }

  return 'unknown'
}

function getNormalizedPlyHeaderText(input: ArrayBuffer, maxBytes = 16384): string {
  const headerChunk = input.slice(0, Math.min(maxBytes, input.byteLength))
  return new TextDecoder('utf-8', { fatal: false }).decode(headerChunk).toLowerCase()
}

export function isGaussianSplatPly(input: ArrayBuffer): boolean {
  const header = getNormalizedPlyHeaderText(input)
  if (!header.startsWith('ply')) {
    return false
  }

  const splatSignals = [
    'property float f_dc_0',
    'property float opacity',
    'property float scale_0',
    'property float rot_0',
    'property float f_rest_0'
  ]

  let matchedSignals = 0
  for (const signal of splatSignals) {
    if (header.includes(signal)) {
      matchedSignals += 1
    }
  }

  return matchedSignals >= 2
}

function extensionToFormat(ext: string): ModelFormat {
  switch (ext) {
    case 'gltf':
    case 'gltf.json':
      return 'gltf'
    case 'glb':
      return 'glb'
    case 'fbx':
      return 'fbx'
    case 'obj':
      return 'obj'
    case 'stl':
      return 'stl'
    case 'ply':
      return 'ply'
    case '3mf':
      return '3mf'
    case 'dae':
    case 'collada':
      return 'dae'
    case '3ds':
      return '3ds'
    case '3dm':
      return '3dm'
    case 'dxf':
      return 'dxf'
    case 'dwg':
      return 'dwg'
    case 'ifc':
      return 'ifc'
    case 'zip':
      return 'zip'
    case 'splat':
      return 'splat'
    case 'ksplat':
      return 'ksplat'
    default:
      return 'unknown'
  }
}

