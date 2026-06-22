import * as THREE from 'three'

/**
 * Parses a .cube LUT file and converts it to a 3D texture
 * Based on Three.js example: https://threejs.org/examples/webgl_postprocessing_3dlut.html
 */
export async function loadLUTFromCube(cubeData: string): Promise<THREE.DataTexture> {
  const lines = cubeData.split('\n').map(line => line.trim())
  
  // Parse cube file format
  let size = 64 // Default size
  const data: number[] = []
  let parsingData = false
  
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1] || '64', 10)
      continue
    }
    
    // Check if we're in the data section
    if (line.match(/^\d+\.\d+\s+\d+\.\d+\s+\d+\.\d+/)) {
      parsingData = true
    }
    
    if (parsingData) {
      const values = line.split(/\s+/).filter(v => v.length > 0)
      if (values.length >= 3) {
        // Parse RGB values (0-1 range)
        const r = parseFloat(values[0])
        const g = parseFloat(values[1])
        const b = parseFloat(values[2])
        
        // Clamp to 0-1 range
        data.push(
          Math.max(0, Math.min(1, r)),
          Math.max(0, Math.min(1, g)),
          Math.max(0, Math.min(1, b))
        )
      }
    }
  }
  
  // Create 3D texture
  const size3 = size * size * size
  if (data.length < size3 * 3) {
    throw new Error(`Invalid LUT file: expected ${size3 * 3} values, got ${data.length}`)
  }
  
  // Convert 3D texture data to 2D texture representation (flattened)
  // Each slice of the 3D texture becomes a row in the 2D texture
  const width = size * size
  const height = size
  const data2D = new Float32Array(width * height * 3)
  
  let index = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const srcIndex = (z * size * size + y * size + x) * 3
        data2D[index++] = data[srcIndex]
        data2D[index++] = data[srcIndex + 1]
        data2D[index++] = data[srcIndex + 2]
      }
    }
  }
  
  const texture = new THREE.DataTexture(
    data2D,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  
  // Store the original size for shader use
  texture.userData.lutSize = size
  
  return texture
}

/**
 * Loads a LUT from a File object
 */
export async function loadLUTFromFile(file: File): Promise<THREE.DataTexture> {
  const text = await file.text()
  const ext = file.name.toLowerCase().split('.').pop()
  
  if (ext === 'cube') {
    return loadLUTFromCube(text)
  } else if (ext === '3dl') {
    // .3dl format is similar to .cube, try parsing as cube format
    return loadLUTFromCube(text)
  } else {
    throw new Error(`Unsupported LUT format: ${ext}. Supported formats: .cube, .3dl`)
  }
}

/**
 * Creates a neutral LUT (no color transformation)
 */
export function createNeutralLUT(size: number = 32): THREE.DataTexture {
  // Create neutral LUT data (output = input)
  const size3 = size * size * size
  const data = new Float32Array(size3 * 3)
  
  let index = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Neutral LUT: output = input
        data[index++] = x / (size - 1)
        data[index++] = y / (size - 1)
        data[index++] = z / (size - 1)
      }
    }
  }
  
  // Convert to 2D texture representation
  const width = size * size
  const height = size
  const data2D = new Float32Array(width * height * 3)
  
  index = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const srcIndex = (z * size * size + y * size + x) * 3
        data2D[index++] = data[srcIndex]
        data2D[index++] = data[srcIndex + 1]
        data2D[index++] = data[srcIndex + 2]
      }
    }
  }
  
  const texture = new THREE.DataTexture(
    data2D,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  
  // Store the original size for shader use
  texture.userData.lutSize = size
  
  return texture
}
