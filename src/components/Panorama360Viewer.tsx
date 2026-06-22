import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RGBELoader, EXRLoader, KTX2Loader } from 'three-stdlib'
import './Panorama360Viewer.css'

interface Panorama360ViewerProps {
  imageUrl?: string | File
  onLoad?: () => void
  onError?: (error: Error) => void
}

export default function Panorama360Viewer({ imageUrl, onLoad, onError }: Panorama360ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const textureRef = useRef<THREE.Texture | null>(null)
  const ktx2LoaderRef = useRef<KTX2Loader | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<{ width?: number; height?: number; format?: string } | null>(null)

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera - positioned at origin looking into the sphere
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.set(0, 0, 0)
    camera.lookAt(0, 0, -1) // Look into the inverted sphere
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Controls - allow full 360 rotation
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enableZoom = true
    controls.enablePan = false
    controls.minDistance = 0.1
    controls.maxDistance = 10
    controls.rotateSpeed = -0.5 // Negative for natural rotation
    // Set target to look forward horizontally (not up at ceiling)
    controls.target.set(0, 0, -1)
    // Reset camera rotation to look forward horizontally
    // For equirectangular panoramas, we want to look forward (along -Z) initially
    camera.rotation.set(0, 0, 0) // Reset rotation
    camera.lookAt(0, 0, -1) // Look forward
    controls.update() // Update controls to match camera
    controlsRef.current = controls

    // Create sphere geometry for 360 view
    const geometry = new THREE.SphereGeometry(500, 60, 40)
    geometry.scale(-1, 1, 1) // Invert sphere to view from inside
    
    // Material - Use MeshBasicMaterial which works well for panoramas
    // Disable tone mapping so LDR KTX2 (and standard) panoramas don't get blown out to white
    const material = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      color: 0x888888, // Gray color as fallback (will be overridden by texture)
      toneMapped: false
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    
    console.log('[Panorama360] Scene initialized:', {
      hasMesh: !!mesh,
      hasMaterial: !!material,
      geometryVertices: geometry.attributes.position.count,
      cameraPosition: camera.position,
      cameraTarget: camera.getWorldDirection(new THREE.Vector3())
    })
    
    // Store mesh reference for texture updates
    const meshRef = { current: mesh }

    // Initialize KTX2Loader once (reuse single instance to avoid "Multiple active KTX2 loaders" warning)
    // Dispose any existing loader first (important during hot reloads)
    if (ktx2LoaderRef.current) {
      try {
        ktx2LoaderRef.current.dispose()
      } catch (err) {
        console.warn('[Panorama360] Warning disposing old KTX2Loader:', err)
      }
      ktx2LoaderRef.current = null
    }
    
    ktx2LoaderRef.current = new KTX2Loader()
    
    // Set transcoder path (try Needle CDN first, then fallbacks)
    const transcoderPaths = [
      'https://cdn.needle.tools/static/three/0.179.1/basis2/',
      `https://cdn.jsdelivr.net/npm/three@${THREE.REVISION}/examples/jsm/libs/basis/`,
      '/basis/'
    ]
    
    let transcoderPath = transcoderPaths[0]
    try {
      ktx2LoaderRef.current.setTranscoderPath(transcoderPath)
      console.log('[Panorama360] KTX2Loader initialized with transcoder path:', transcoderPath)
    } catch (err) {
      console.warn('[Panorama360] Failed to set transcoder path, trying fallback:', err)
      transcoderPath = transcoderPaths[1]
      ktx2LoaderRef.current.setTranscoderPath(transcoderPath)
    }
    
    if (renderer) {
      ktx2LoaderRef.current.detectSupport(renderer)
    }

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      if (controls) controls.update()
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
    }
    animate()
    
    // Initial render
    renderer.render(scene, camera)

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return
      const newWidth = containerRef.current.clientWidth
      const newHeight = containerRef.current.clientHeight
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      if (textureRef.current) {
        textureRef.current.dispose()
      }
      // Dispose KTX2 loader to prevent "Multiple active KTX2 loaders" warning
      if (ktx2LoaderRef.current) {
        ktx2LoaderRef.current.dispose()
        ktx2LoaderRef.current = null
      }
    }
  }, [])

  // Helper function to ensure KTX2 transcoder is ready before loading
  const ensureTranscoderReady = async (): Promise<void> => {
    if (!ktx2LoaderRef.current) {
      throw new Error('KTX2Loader not available')
    }
    
    try {
      // Wait for transcoder to be ready with timeout
      const transcoderPending = (ktx2LoaderRef.current as any).transcoderPending
      if (transcoderPending) {
        try {
          // Wait for transcoder with timeout (5 seconds)
          await Promise.race([
            transcoderPending,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Transcoder load timeout')), 5000))
          ])
          // Give it a small delay to ensure it's fully initialized
          await new Promise(resolve => setTimeout(resolve, 100))
          console.log('[Panorama360] ✅ KTX2 transcoder ready')
        } catch (pendingError) {
          console.warn('[Panorama360] ⚠️ Transcoder pending promise rejected or timed out:', pendingError)
          // Continue anyway - transcoder might still work
        }
      } else {
        console.log('[Panorama360] KTX2 transcoder already ready (no pending promise)')
      }
    } catch (err) {
      console.warn('[Panorama360] ⚠️ Error checking transcoder status:', err)
      // Continue anyway - transcoder might still work
    }
  }

  // Load image
  useEffect(() => {
    if (!imageUrl || !sceneRef.current) return

    setIsLoading(true)
    setError(null)

    const loadImage = async () => {
      let url: string | null = null
      try {
        // Dispose of existing texture BEFORE loading new one to prevent "Texture is immutable" errors
        // This is especially important during hot reloads when old textures might still be in use
        const mesh = sceneRef.current?.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh | undefined
        if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
          const mat = mesh.material as THREE.MeshBasicMaterial
          if (mat.map) {
            // Clear the material map first to release the texture reference
            mat.map = null
            mat.needsUpdate = true
          }
        }
        // Clear scene background if it's a texture
        if (sceneRef.current?.background && sceneRef.current.background instanceof THREE.Texture) {
          sceneRef.current.background = null
        }
        
        // Force a render to unbind the texture from GPU before disposing
        // This prevents "Texture is immutable" errors during disposal
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current)
        }
        
        // Dispose of old texture AFTER unbinding it from GPU
        if (textureRef.current) {
          try {
            textureRef.current.dispose()
          } catch (err) {
            // Ignore errors when disposing (texture might already be disposed or immutable)
            console.warn('[Panorama360] Warning disposing old texture:', err)
          }
          textureRef.current = null
        }
        
        // CRITICAL: Wait a frame to ensure WebGL has cleaned up the old texture
        // This is especially important during hot reloads when old textures might still be in GPU memory
        // Use requestAnimationFrame to ensure the cleanup happens before loading a new texture
        await new Promise(resolve => requestAnimationFrame(resolve))
        
        let texture: THREE.Texture | null = null

        // Convert File to URL if needed
        if (imageUrl instanceof File) {
          url = URL.createObjectURL(imageUrl)
        } else {
          url = imageUrl
        }

        const fileName = imageUrl instanceof File ? imageUrl.name : url.split('/').pop() || ''
        const extension = fileName.toLowerCase().split('.').pop() || ''

        console.log('[Panorama360] Loading image:', fileName, 'Extension:', extension)

        // Determine loader based on extension
        if (extension === 'ktx2') {
          // Validate KTX2 file magic signature before loading
          // This helps catch invalid files early (per https://forum.babylonjs.com/t/how-to-use-ktx2-file-in-texture-texture-missing-ktx-identifier/16799)
          try {
            const response = await fetch(url!)
            if (!response.ok) {
              throw new Error(`Failed to fetch KTX2 file: HTTP ${response.status}`)
            }
            const arrayBuffer = await response.arrayBuffer()
            
            // Check KTX2 magic signature (first 12 bytes)
            // Should be: [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A]
            if (arrayBuffer.byteLength < 12) {
              throw new Error('KTX2 file too small (missing magic signature)')
            }
            
            const ktx2Magic = [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A]
            const header = new Uint8Array(arrayBuffer, 0, 12)
            let isValidKTX2 = true
            for (let i = 0; i < 12; i++) {
              if (header[i] !== ktx2Magic[i]) {
                isValidKTX2 = false
                break
              }
            }
            
            if (!isValidKTX2) {
              const headerHex = Array.from(header).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')
              console.error('[Panorama360] ❌ Invalid KTX2 magic signature. First 12 bytes:', headerHex)
              throw new Error(
                'Invalid KTX2 file: missing KTX2 magic signature. ' +
                'The file may be corrupted or not a valid KTX2 file. ' +
                'Expected magic bytes: 0xAB 0x4B 0x54 0x58 0x20 0x32 0x30 0xBB 0x0D 0x0A 0x1A 0x0A'
              )
            }
            
            console.log('[Panorama360] ✅ KTX2 magic signature validated')
          } catch (validationError) {
            // If validation fails, still try to load (the loader might give a better error)
            console.warn('[Panorama360] KTX2 validation warning:', validationError)
            if (validationError instanceof Error && validationError.message.includes('magic signature')) {
              throw validationError // Re-throw magic signature errors
            }
          }
          
          // KTX2 loader - use the single instance initialized in setup
          if (!ktx2LoaderRef.current) {
            throw new Error('KTX2Loader not initialized. This should not happen.')
          }
          
          const ktx2Loader = ktx2LoaderRef.current

          if (!url) {
            throw new Error('URL is null')
          }
          
          const ktx2Url = url // TypeScript narrowing
          
          // CRITICAL: Wait for transcoder to be ready before loading
          // This ensures the Basis transcoder is fully loaded and initialized
          // Based on HDRSystem.ts implementation - transcoder must be ready before texture load
          console.log('[Panorama360] Waiting for KTX2 transcoder to be ready...')
          await ensureTranscoderReady()
          
          // Note: Old texture was already disposed at the start of loadImage
          
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            // Add timeout to catch if loader hangs
            const timeout = setTimeout(() => {
              console.error('[Panorama360] KTX2 load timeout after 30 seconds')
              reject(new Error('KTX2 load timeout - file may be corrupted or incompatible'))
            }, 30000)
            
            ktx2Loader.load(
              ktx2Url,
              (loadedTexture) => {
                clearTimeout(timeout)
                
                if (!loadedTexture) {
                  reject(new Error('KTX2 loader returned undefined texture'))
                  return
                }
                
                // Set texture properties IMMEDIATELY in the callback, before texture is uploaded to GPU
                // This must happen synchronously before the texture is used anywhere
                // Once a texture is uploaded to GPU (immutable), these properties cannot be changed
                try {
                  // Use EquirectangularReflectionMapping for equirectangular panoramas
                  loadedTexture.mapping = THREE.EquirectangularReflectionMapping
                  // For KTX2 textures on material.map, flipY should be true to match regular images
                  // Regular images use flipY = true by default, and they work correctly
                  // This ensures KTX2 textures display with the same orientation as regular images
                  loadedTexture.flipY = true
                  // KTX2Loader automatically parses colorSpace from the container's DFD
                  // With the encoding fix (isSetKTX2SRGBTransferFunc: true), the loader should now
                  // automatically set SRGBColorSpace for LDR KTX2 textures
                  const loaderColorSpace = (loadedTexture as any).colorSpace
                  console.log('[Panorama360] KTX2Loader set colorSpace:', loaderColorSpace)
                  // Only override if loader didn't set it correctly (should be SRGBColorSpace for LDR KTX2)
                  if ('colorSpace' in loadedTexture && loaderColorSpace !== THREE.SRGBColorSpace) {
                    console.log('[Panorama360] Overriding colorSpace from', loaderColorSpace, 'to SRGBColorSpace for LDR KTX2')
                    ;(loadedTexture as any).colorSpace = THREE.SRGBColorSpace
                  } else {
                    console.log('[Panorama360] ✅ KTX2Loader set colorSpace correctly:', loaderColorSpace)
                  }
                  loadedTexture.wrapS = THREE.RepeatWrapping
                  loadedTexture.wrapT = THREE.RepeatWrapping
                  // For compressed formats (ASTC, ETC2, etc.), KTX2Loader sets appropriate filters
                  // Don't override filters for compressed formats - they're usually already correct
                  const isCompressed = loadedTexture.format > 0x8C00 // Compressed formats start at 0x8C00
                  if (!isCompressed) {
                    // Uncompressed format - set linear filtering
                    loadedTexture.minFilter = THREE.LinearFilter
                    loadedTexture.magFilter = THREE.LinearFilter
                  }
                  // Mark texture as suitable for two-sided materials
                  loadedTexture.userData.twoSidedCompatible = true
                  // Set needsUpdate to ensure texture is uploaded
                  loadedTexture.needsUpdate = true
                } catch (propError) {
                  console.warn('[Panorama360] Warning: Could not set texture properties (texture may already be immutable):', propError)
                  // Continue anyway - properties might already be set correctly
                }
                
                const image = loadedTexture.image as { width?: number; height?: number; data?: unknown } | null
                console.log('[Panorama360] KTX2 texture loaded:', {
                  textureType: loadedTexture.constructor.name,
                  format: loadedTexture.format,
                  formatHex: '0x' + loadedTexture.format.toString(16),
                  dataType: loadedTexture.type,
                  typeHex: '0x' + loadedTexture.type.toString(16),
                  mapping: loadedTexture.mapping,
                  width: image?.width,
                  height: image?.height,
                  hasImage: !!loadedTexture.image,
                  hasImageData: !!image?.data,
                  imageType: image?.constructor?.name,
                  hasUserData: !!loadedTexture.userData,
                  userDataKeys: loadedTexture.userData ? Object.keys(loadedTexture.userData) : [],
                  faceCount: loadedTexture.userData?.ktx2FormatInfo?.faceCount,
                  isKTX2: loadedTexture.userData?.isKTX2,
                  textureColorSpace: (loadedTexture as any).colorSpace,
                  textureFlipY: loadedTexture.flipY,
                  needsUpdate: loadedTexture.needsUpdate,
                  wrapS: loadedTexture.wrapS,
                  wrapT: loadedTexture.wrapT,
                  minFilter: loadedTexture.minFilter,
                  magFilter: loadedTexture.magFilter
                })
                
                // KTX2Loader handles transcoding automatically
                // The texture should be ready when the callback is called
                // Resolve immediately - the texture is ready to use
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                clearTimeout(timeout)
                reject(new Error(`KTX2 load failed: ${err}`))
              }
            )
          })
        } else if (extension === 'hdr') {
          // HDR loader
          if (!url) {
            throw new Error('URL is null')
          }
          
          const hdrUrl = url // TypeScript narrowing
          const rgbeLoader = new RGBELoader()
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            rgbeLoader.load(
              hdrUrl,
              (loadedTexture) => {
                const image = loadedTexture.image as { width?: number; height?: number; data?: unknown } | null
                console.log('[Panorama360] HDR texture loaded:', {
                  textureType: loadedTexture.constructor.name,
                  mapping: loadedTexture.mapping,
                  format: loadedTexture.format,
                  formatName: Object.keys(THREE).find(key => THREE[key as keyof typeof THREE] === loadedTexture.format),
                  dataType: loadedTexture.type,
                  typeName: Object.keys(THREE).find(key => THREE[key as keyof typeof THREE] === loadedTexture.type),
                  width: image?.width,
                  height: image?.height,
                  hasData: !!image?.data,
                  dataTypeName: image?.data ? (image.data as { constructor?: { name?: string } }).constructor?.name : undefined
                })
                loadedTexture.mapping = THREE.EquirectangularReflectionMapping
                loadedTexture.colorSpace = THREE.LinearSRGBColorSpace
                loadedTexture.flipY = true // Flip Y to correct orientation (ground down, sky up)
                // Ensure texture works correctly with two-sided materials
                loadedTexture.wrapS = THREE.RepeatWrapping
                loadedTexture.wrapT = THREE.RepeatWrapping
                // Mark texture as suitable for two-sided materials
                loadedTexture.userData.twoSidedCompatible = true
                loadedTexture.needsUpdate = true
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                reject(new Error(`HDR load failed: ${err}`))
              }
            )
          })
        } else if (extension === 'exr') {
          // EXR loader
          if (!url) {
            throw new Error('URL is null')
          }
          
          const exrUrl = url // TypeScript narrowing
          const exrLoader = new EXRLoader()
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            exrLoader.load(
              exrUrl,
              (loadedTexture) => {
                loadedTexture.mapping = THREE.EquirectangularReflectionMapping
                loadedTexture.colorSpace = THREE.LinearSRGBColorSpace
                loadedTexture.flipY = true // Flip Y to correct orientation (ground down, sky up)
                // Ensure texture works correctly with two-sided materials
                loadedTexture.wrapS = THREE.RepeatWrapping
                loadedTexture.wrapT = THREE.RepeatWrapping
                // Mark texture as suitable for two-sided materials
                loadedTexture.userData.twoSidedCompatible = true
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                reject(new Error(`EXR load failed: ${err}`))
              }
            )
          })
        } else {
          // Regular image (JPG, PNG, etc.)
          if (!url) {
            throw new Error('URL is null')
          }
          
          const imageUrl = url // TypeScript narrowing
          const loader = new THREE.TextureLoader()
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            loader.load(
              imageUrl,
              (loadedTexture) => {
                loadedTexture.mapping = THREE.EquirectangularReflectionMapping
                loadedTexture.colorSpace = THREE.SRGBColorSpace
                // Ensure texture works correctly with two-sided materials
                loadedTexture.wrapS = THREE.RepeatWrapping
                loadedTexture.wrapT = THREE.RepeatWrapping
                // Mark texture as suitable for two-sided materials
                loadedTexture.userData.twoSidedCompatible = true
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                reject(new Error(`Image load failed: ${err}`))
              }
            )
          })
        }

        if (!texture) {
          throw new Error('Failed to load texture')
        }

        // Update material with texture - works for all formats including HDR/EXR
        // Note: mesh was already found at the start of loadImage
        
        // For HDR/EXR: Use scene.background (standard Three.js approach for HDR panoramas)
        if ((extension === 'hdr' || extension === 'exr') && sceneRef.current && rendererRef.current) {
          const hdrImage = texture.image as { width?: number; height?: number } | null
          console.log('[Panorama360] Applying HDR/EXR texture to scene.background...', {
            textureWidth: hdrImage?.width,
            textureHeight: hdrImage?.height,
            format: texture.format,
            dataType: texture.type,
            hasImage: !!texture.image
          })
          
          // Validate texture has data
          if (!texture.image) {
            console.error('[Panorama360] ❌ HDR texture has no image!')
            throw new Error('HDR texture has no image')
          }
          
          // Note: Old texture was already disposed at the start of loadImage
          
          // Ensure texture properties
          texture.mapping = THREE.EquirectangularReflectionMapping
          texture.colorSpace = THREE.LinearSRGBColorSpace
          texture.flipY = true
          texture.needsUpdate = true
          
          // Configure renderer for HDR FIRST
          if (rendererRef.current) {
            rendererRef.current.toneMapping = THREE.ACESFilmicToneMapping
            rendererRef.current.toneMappingExposure = 1.0
            rendererRef.current.outputColorSpace = THREE.SRGBColorSpace
            rendererRef.current.setClearColor(0x000000, 1.0) // Black, opaque
          }
          
          // Set scene.background (standard way for HDR panoramas)
          sceneRef.current.background = texture
          textureRef.current = texture
          
          // Force immediate render
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current)
          }
          
          const hdrImageFinal = texture.image as { width?: number; height?: number } | null
          console.log('[Panorama360] ✅ HDR/EXR texture applied to scene.background', {
            hasBackground: !!sceneRef.current.background,
            backgroundType: sceneRef.current.background?.constructor.name,
            textureWidth: hdrImageFinal?.width,
            textureHeight: hdrImageFinal?.height
          })
        }
        // For KTX2 files - use material.map (compressed textures work better on geometry)
        else if (extension === 'ktx2' && mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
          const ktx2Image = texture.image as { width?: number; height?: number } | null
          
          console.log('[Panorama360] Applying KTX2 texture to material.map...', {
            textureWidth: ktx2Image?.width,
            textureHeight: ktx2Image?.height,
            format: texture.format,
            dataType: texture.type,
            hasImage: !!texture.image,
            textureType: texture.constructor.name
          })
          
          // Validate texture has data
          if (!texture.image) {
            console.error('[Panorama360] ❌ KTX2 texture has no image!')
            throw new Error('KTX2 texture has no image')
          }
          
          // Note: Texture properties (mapping, colorSpace, flipY, needsUpdate) are already set
          // in the loader callback BEFORE the texture is uploaded to GPU. Do NOT modify them here
          // as the texture is now immutable after upload.
          
          // Clear scene background if it was set (HDR/EXR uses scene.background, KTX2 uses material.map)
          if (sceneRef.current) {
            sceneRef.current.background = null
          }
          
          // Apply texture to material (same as regular images - keep it simple)
          const mat = mesh.material
          
          // CRITICAL: Dispose of old texture map if it exists
          if (mat.map) {
            mat.map.dispose()
            mat.map = null
          }
          
          mat.map = texture
          mat.color.setHex(0xffffff) // Ensure white color for proper texture display
          mat.toneMapped = false // Prevent LDR KTX2 from being blown out
          mat.side = THREE.BackSide // Render inside of sphere
          mat.visible = true // Ensure material is visible
          mat.needsUpdate = true
          texture.needsUpdate = true
          textureRef.current = texture
          
          // Ensure mesh is visible
          mesh.visible = true
          
          // Force material to update by creating a new material if needed
          // This ensures the texture is properly bound
          if (rendererRef.current) {
            rendererRef.current.state.reset()
          }
          
          // Reset renderer settings to defaults (same as regular images)
          // HDR/EXR may have changed tone mapping settings, so reset them for KTX2
          if (rendererRef.current) {
            rendererRef.current.toneMapping = THREE.NoToneMapping // Default for LDR
            rendererRef.current.toneMappingExposure = 1.0 // Default exposure
            rendererRef.current.outputColorSpace = THREE.SRGBColorSpace // Default for LDR
            rendererRef.current.setClearColor(0x000000, 1.0) // Black, opaque
          }
          
          // Force immediate render to trigger texture upload and transcoding
          // KTX2Loader handles transcoding automatically, but we need to render to trigger it
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current)
          }
          
          // Render a few more frames to allow GPU transcoding to complete
          // Compressed textures need time to be transcoded by the GPU
          // The KTX2Loader handles transcoding automatically, but we need to render to trigger it
          console.log('[Panorama360] Starting wait loop for GPU transcoding...')
          for (let i = 0; i < 30; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve))
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current)
            }
            // Log every 5 frames to track progress
            if ((i + 1) % 5 === 0) {
              const textureProperties = rendererRef.current?.properties.get(texture) as any
              const textureUploaded = textureProperties?.__webglTexture !== undefined
              console.log(`[Panorama360] Wait loop frame ${i + 1}/30, texture uploaded: ${textureUploaded}`)
            }
          }
          console.log('[Panorama360] Wait loop completed')
          
          const ktx2ImageFinal = texture.image as { width?: number; height?: number; data?: unknown } | null
          const textureProperties = rendererRef.current?.properties.get(texture) as any
          const textureUploaded = textureProperties?.__webglTexture !== undefined
          const gl = rendererRef.current?.getContext()
          const textureBound = gl && textureProperties?.__webglTexture && gl.isTexture(textureProperties.__webglTexture)
          
          console.log('[Panorama360] ✅ KTX2 texture applied to material.map', {
            hasMap: !!mesh.material.map,
            mapType: mesh.material.map?.constructor.name,
            textureWidth: ktx2ImageFinal?.width,
            textureHeight: ktx2ImageFinal?.height,
            hasImage: !!texture.image,
            textureFormat: texture.format,
            textureFormatHex: '0x' + texture.format.toString(16),
            textureMapping: texture.mapping,
            textureFlipY: texture.flipY,
            textureColorSpace: (texture as any).colorSpace,
            materialSide: mesh.material.side,
            materialColor: mesh.material.color.getHexString(),
            materialVisible: mesh.material.visible,
            materialToneMapped: mesh.material.toneMapped,
            meshVisible: mesh.visible,
            textureUploaded: textureUploaded,
            textureBound: textureBound,
            hasWebGLTexture: !!textureProperties?.__webglTexture
          })
        } else if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
          // Regular images: Use material.map
          // Note: Old texture was already disposed at the start of loadImage
          
          // Clear scene background if it was set (HDR/EXR uses scene.background, regular images use material.map)
          if (sceneRef.current) {
            sceneRef.current.background = null
          }
          
          // Apply texture to material
          mesh.material.map = texture
          mesh.material.color.setHex(0xffffff) // Ensure white color for proper texture display
          mesh.material.needsUpdate = true
          texture.needsUpdate = true
          textureRef.current = texture
          
          console.log('[Panorama360] Regular image set as material.map')
        }

        // Update image info
        const finalImage = texture.image as { width?: number; height?: number } | null
        setImageInfo({
          width: finalImage?.width,
          height: finalImage?.height,
          format: extension.toUpperCase()
        })

        console.log('[Panorama360] ✅ Image loaded successfully:', {
          width: finalImage?.width,
          height: finalImage?.height,
          format: extension
        })

        setIsLoading(false)
        onLoad?.()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        console.error('[Panorama360] ❌ Failed to load image:', error)
        setError(error.message)
        setIsLoading(false)
        onError?.(error)
      } finally {
        // Clean up object URL if it was created from File
        if (imageUrl instanceof File && url) {
          URL.revokeObjectURL(url)
        }
      }
    }

    loadImage()
  }, [imageUrl, onLoad, onError])

  return (
    <div className="panorama-360-viewer">
      <div ref={containerRef} className="panorama-360-container" />
      {isLoading && (
        <div className="panorama-360-loading">
          <div className="loading-spinner" />
          <p>Loading 360° image...</p>
        </div>
      )}
      {error && (
        <div className="panorama-360-error">
          <p>❌ Error: {error}</p>
        </div>
      )}
      {imageInfo && !isLoading && !error && (
        <div className="panorama-360-info">
          <p>
            {imageInfo.width} × {imageInfo.height} • {imageInfo.format}
          </p>
        </div>
      )}
      <div className="panorama-360-controls-hint">
        <p>🖱️ Drag to rotate • Scroll to zoom</p>
      </div>
    </div>
  )
}

