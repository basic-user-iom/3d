import * as THREE from 'three'
import { detectGPU } from './performanceUtils'

/**
 * Export 360 panorama from current camera position
 * Renders 6 cube faces and converts to equirectangular projection
 * OPTIMIZATION: Uses GPU detection for optimal render settings
 */
export async function exportPanorama(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  height: number = 2048
): Promise<Blob> {
  // Detect GPU for optimal settings
  const gpuInfo = detectGPU(renderer.domElement)
  if (gpuInfo) {
    console.log('[PanoramaExport] GPU detected:', gpuInfo.renderer, '- Using optimized settings')
  }
  // For equirectangular panoramas, width = 2 * height (2:1 aspect ratio)
  // The cube camera resolution should match the output height for best quality
  // Each cube face will be height x height, giving us proper resolution
  const cubeFaceResolution = height
  
  // Create cube camera for rendering 6 faces
  // Use the height as the cube face resolution for optimal quality
  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(cubeFaceResolution, {
    format: THREE.RGBAFormat,
    generateMipmaps: false, // Disable mipmaps for high-res exports to save memory
    minFilter: THREE.LinearFilter, // Use linear filtering for better quality
    magFilter: THREE.LinearFilter
  })

  const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget)

  // Position cube camera at current camera position
  cubeCamera.position.copy(camera.position)

  // Render cube map
  cubeCamera.update(renderer, scene)
  
  // CRITICAL: Wait for rendering to complete before reading pixels
  // WebGL rendering can be asynchronous, so we need to ensure it's done
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })

  // Get cube texture
  const cubeTexture = cubeRenderTarget.texture

  // CRITICAL: Ensure renderer state is correct for cube camera rendering
  // Save current render target state
  const previousRenderTarget = renderer.getRenderTarget()
  const previousAutoClear = renderer.autoClear
  
  // Ensure renderer is ready for cube camera
  renderer.autoClear = true
  
  // Convert cube map to equirectangular
  // Pass height as parameter - function will create width = 2 * height
  // IMPORTANT: Do this BEFORE disposing resources
  // Pass the render target so we can read directly from it
  // OPTIMIZATION: Now async to support UI thread yielding for large panoramas
  const equirectangularCanvas = await cubeToEquirectangular(cubeTexture, cubeRenderTarget, height, renderer)

  // Restore renderer state
  renderer.setRenderTarget(previousRenderTarget)
  renderer.autoClear = previousAutoClear

  // Cleanup cube camera resources AFTER conversion is complete
  // Note: CubeCamera doesn't have dispose(), but we can clean up the render target
  cubeRenderTarget.dispose()
  cubeTexture.dispose()

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    equirectangularCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      },
      'image/png',
      1.0
    )
  })
}

/**
 * Convert cube map texture to equirectangular projection
 * @param cubeTexture - The cube map texture from CubeCamera
 * @param cubeRenderTarget - The cube render target (to read textures directly)
 * @param height - The height of the output equirectangular image (width will be 2 * height)
 * @param mainRenderer - The main renderer (to ensure proper state)
 */
async function cubeToEquirectangular(
  cubeTexture: THREE.CubeTexture, 
  cubeRenderTarget: THREE.WebGLCubeRenderTarget,
  height: number, 
  mainRenderer: THREE.WebGLRenderer
): Promise<HTMLCanvasElement> {
  // Equirectangular panoramas have a 2:1 aspect ratio (width:height)
  const width = height * 2
  
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  // Use willReadFrequently for better performance when reading pixel data multiple times
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  const imageData = ctx.createImageData(canvas.width, canvas.height)

  // We'll read directly from render targets using the main renderer
  // No need for separate canvases or temp renderer

  // Cube face order: +X, -X, +Y, -Y, +Z, -Z
  const faces = [
    { name: 'px', index: 0 }, // +X
    { name: 'nx', index: 1 }, // -X
    { name: 'py', index: 2 }, // +Y
    { name: 'ny', index: 3 }, // -Y
    { name: 'pz', index: 4 }, // +Z
    { name: 'nz', index: 5 }  // -Z
  ]

  // Read each cube face directly from the render target
  const faceImages: ImageData[] = []
  
  // CRITICAL: Create shader materials for each cube face
  // Each face needs a different direction calculation
  const createFaceShader = (faceName: string) => {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `
    
    // Calculate cube direction from UV coordinates for each face
    const getFaceDirection = (faceName: string) => {
      // Convert UV [0,1] to [-1,1] and calculate direction based on face
      switch(faceName) {
        case 'px': return 'vec3 dir = vec3(1.0, 1.0 - 2.0 * vUv.y, 1.0 - 2.0 * vUv.x);'
        case 'nx': return 'vec3 dir = vec3(-1.0, 1.0 - 2.0 * vUv.y, 2.0 * vUv.x - 1.0);'
        case 'py': return 'vec3 dir = vec3(2.0 * vUv.x - 1.0, 1.0, 2.0 * vUv.y - 1.0);'
        case 'ny': return 'vec3 dir = vec3(2.0 * vUv.x - 1.0, -1.0, 1.0 - 2.0 * vUv.y);'
        case 'pz': return 'vec3 dir = vec3(2.0 * vUv.x - 1.0, 1.0 - 2.0 * vUv.y, 1.0);'
        case 'nz': return 'vec3 dir = vec3(1.0 - 2.0 * vUv.x, 1.0 - 2.0 * vUv.y, -1.0);'
        default: return 'vec3 dir = vec3(0.0, 0.0, 1.0);'
      }
    }
    
    const fragmentShader = `
      #ifdef GL_ES
        precision mediump float;
      #endif
      uniform samplerCube cubeTexture;
      varying vec2 vUv;
      void main() {
        ${getFaceDirection(faceName)}
        dir = normalize(dir);
        #ifdef GL_ES
          gl_FragColor = textureCube(cubeTexture, dir);
        #else
          gl_FragColor = texture(cubeTexture, dir);
        #endif
      }
    `
    
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        cubeTexture: { value: cubeTexture }
      },
      side: THREE.DoubleSide
    })
  }
  
  for (const face of faces) {
    // Create a scene to render this cube face
    const geometry = new THREE.PlaneGeometry(2, 2)
    const faceMaterial = createFaceShader(face.name)
    const mesh = new THREE.Mesh(geometry, faceMaterial)
    const tempScene = new THREE.Scene()
    tempScene.background = null
    tempScene.add(mesh)

    // Use a simple orthographic camera
    const tempCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    tempCamera.position.set(0, 0, 0)
    tempCamera.lookAt(0, 0, -1)

    // CRITICAL: Use the main renderer to read from cube render target
    const originalTarget = mainRenderer.getRenderTarget()
    
    // Create a temporary render target to read the cube face
    const readTarget = new THREE.WebGLRenderTarget(height, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    })
    
    // Render the cube face to our read target
    mainRenderer.setRenderTarget(readTarget)
    mainRenderer.clear()
    mainRenderer.render(tempScene, tempCamera)
    
    // Read pixels from the render target
    const pixels = new Uint8Array(height * height * 4)
    mainRenderer.readRenderTargetPixels(readTarget, 0, 0, height, height, pixels)
    
    // Convert to ImageData format
    const faceImageData = new ImageData(new Uint8ClampedArray(pixels), height, height)
    faceImages.push(faceImageData)
    
    // Restore render target
    mainRenderer.setRenderTarget(originalTarget)
    
    // Cleanup
    readTarget.dispose()
    geometry.dispose()
    faceMaterial.dispose()
  }

  // tempRenderer no longer needed since we're using mainRenderer
  // tempRenderer.dispose()

  // OPTIMIZATION: Process equirectangular conversion with progress updates
  // For very large panoramas, yield to UI thread periodically
  const data = imageData.data
  const totalPixels = canvas.width * canvas.height
  const yieldInterval = Math.max(1000, Math.floor(totalPixels / 100)) // Yield every 1% or 1000 pixels
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      // Yield to UI thread periodically for large panoramas
      const pixelPos = y * canvas.width + x
      if (pixelPos % yieldInterval === 0) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      // Convert pixel coordinates to spherical coordinates
      const theta = (x / canvas.width) * Math.PI * 2 - Math.PI // longitude
      const phi = (y / canvas.height) * Math.PI // latitude

      // Convert spherical to 3D direction
      const dir = new THREE.Vector3()
      dir.x = Math.sin(phi) * Math.cos(theta)
      dir.y = Math.cos(phi)
      dir.z = Math.sin(phi) * Math.sin(theta)

      // Determine which cube face to sample
      const absX = Math.abs(dir.x)
      const absY = Math.abs(dir.y)
      const absZ = Math.abs(dir.z)

      let faceIndex = 0
      let u = 0
      let v = 0

      if (absX >= absY && absX >= absZ) {
        // X face
        if (dir.x > 0) {
          faceIndex = 0 // +X
          u = -dir.z / absX
          v = -dir.y / absX
        } else {
          faceIndex = 1 // -X
          u = dir.z / absX
          v = -dir.y / absX
        }
      } else if (absY >= absX && absY >= absZ) {
        // Y face
        if (dir.y > 0) {
          faceIndex = 2 // +Y
          u = dir.x / absY
          v = dir.z / absY
        } else {
          faceIndex = 3 // -Y
          u = dir.x / absY
          v = -dir.z / absY
        }
      } else {
        // Z face
        if (dir.z > 0) {
          faceIndex = 4 // +Z
          u = dir.x / absZ
          v = -dir.y / absZ
        } else {
          faceIndex = 5 // -Z
          u = -dir.x / absZ
          v = -dir.y / absZ
        }
      }

      // Convert u,v from [-1,1] to [0,1] and then to pixel coordinates
      u = (u + 1) / 2
      v = (v + 1) / 2
      
      // Use bilinear interpolation for smoother results
      const faceX = u * (height - 1)
      const faceY = v * (height - 1)
      
      const x0 = Math.floor(faceX)
      const y0 = Math.floor(faceY)
      const x1 = Math.min(height - 1, x0 + 1)
      const y1 = Math.min(height - 1, y0 + 1)
      
      const fx = faceX - x0
      const fy = faceY - y0

      // Sample from appropriate face with bilinear interpolation
      const faceImageData = faceImages[faceIndex]
      
      // Helper function to get pixel value
      const getPixel = (px: number, py: number): [number, number, number, number] => {
        const idx = (py * height + px) * 4
        return [
          faceImageData.data[idx],
          faceImageData.data[idx + 1],
          faceImageData.data[idx + 2],
          faceImageData.data[idx + 3]
        ]
      }
      
      // Sample four corners
      const p00 = getPixel(x0, y0)
      const p10 = getPixel(x1, y0)
      const p01 = getPixel(x0, y1)
      const p11 = getPixel(x1, y1)
      
      // Bilinear interpolation
      const pixelIndex = (y * canvas.width + x) * 4
      for (let i = 0; i < 4; i++) {
        const v00 = p00[i]
        const v10 = p10[i]
        const v01 = p01[i]
        const v11 = p11[i]
        
        const v0 = v00 * (1 - fx) + v10 * fx
        const v1 = v01 * (1 - fx) + v11 * fx
        const v = v0 * (1 - fy) + v1 * fy
        
        data[pixelIndex + i] = Math.round(v)
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}
