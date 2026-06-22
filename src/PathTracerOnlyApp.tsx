import { useCallback, useState, useRef } from 'react'
import * as THREE from 'three'
import ViewerCanvas from './viewer/ViewerCanvas'
import { useViewer } from './viewer/useViewer'
import { PathTracerRenderer } from './viewer/pathTracer/PathTracerModule'
import './PathTracerOnlyApp.css'

function PathTracerOnlyApp() {
  const { setViewer } = useViewer()
  const [viewer, setLocalViewer] = useState<any>(null) // Local state to track viewer
  
  const [isRendering, setIsRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [settings, setSettings] = useState({
    samples: 64,
    bounces: 3,
    width: 1024,
    height: 1024,
    denoiseEnabled: true,
    denoiseStrength: 0.5
  })
  
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const pathTracerRef = useRef<PathTracerRenderer | null>(null)
  const managedObjectsRef = useRef<THREE.Object3D[]>([])
  const isRenderingRef = useRef(false)

  const handleViewerReady = useCallback((viewerInstance: any) => {
    if (!viewerInstance || !viewerInstance.scene || !viewerInstance.renderer || !viewerInstance.camera) {
      console.error('[PathTracerApp] Invalid viewer instance')
      return
    }
    
    setViewer(viewerInstance)
    setLocalViewer(viewerInstance) // Update local state to trigger re-render
    console.log('[PathTracerApp] Viewer ready')
    
    // Add test objects and lights for path tracing
    const scene = viewerInstance.scene
    const camera = viewerInstance.camera
    
    managedObjectsRef.current = []

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    scene.add(ambientLight)
    managedObjectsRef.current.push(ambientLight)
    
    // Add directional light with shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
    directionalLight.position.set(5, 10, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 50
    directionalLight.shadow.camera.left = -10
    directionalLight.shadow.camera.right = 10
    directionalLight.shadow.camera.top = 10
    directionalLight.shadow.camera.bottom = -10
    scene.add(directionalLight)
    managedObjectsRef.current.push(directionalLight)
    
    // Add point light for more interesting lighting
    const pointLight1 = new THREE.PointLight(0xff6b6b, 2, 20)
    pointLight1.position.set(-3, 5, 3)
    scene.add(pointLight1)
    managedObjectsRef.current.push(pointLight1)
    
    const pointLight2 = new THREE.PointLight(0x4ecdc4, 2, 20)
    pointLight2.position.set(3, 5, -3)
    scene.add(pointLight2)
    managedObjectsRef.current.push(pointLight2)
    
    // Create a ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
      metalness: 0.2
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -2
    ground.receiveShadow = true
    scene.add(ground)
    managedObjectsRef.current.push(ground)
    
    // Add some test objects with different materials
    const objects: THREE.Mesh[] = []
    
    // Red sphere (glossy)
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32)
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      roughness: 0.2,
      metalness: 0.8
    })
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.position.set(-3, 0, 0)
    sphere.castShadow = true
    sphere.receiveShadow = true
    scene.add(sphere)
    objects.push(sphere)
    managedObjectsRef.current.push(sphere)
    
    // Blue cube (matte)
    const cubeGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5)
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4444ff,
      roughness: 0.9,
      metalness: 0.1
    })
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial)
    cube.position.set(0, 0, 0)
    cube.castShadow = true
    cube.receiveShadow = true
    scene.add(cube)
    objects.push(cube)
    managedObjectsRef.current.push(cube)
    
    // Green torus (semi-glossy)
    const torusGeometry = new THREE.TorusGeometry(1, 0.4, 16, 100)
    const torusMaterial = new THREE.MeshStandardMaterial({
      color: 0x44ff44,
      roughness: 0.5,
      metalness: 0.3
    })
    const torus = new THREE.Mesh(torusGeometry, torusMaterial)
    torus.position.set(3, 0, 0)
    torus.rotation.x = Math.PI / 4
    torus.castShadow = true
    torus.receiveShadow = true
    scene.add(torus)
    objects.push(torus)
    managedObjectsRef.current.push(torus)
    
    // Glass sphere (transparent)
    const glassGeometry = new THREE.SphereGeometry(0.8, 32, 32)
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.0,
      transmission: 0.9,
      thickness: 1.0,
      ior: 1.5
    })
    const glassSphere = new THREE.Mesh(glassGeometry, glassMaterial)
    glassSphere.position.set(-1.5, 1.5, -2)
    glassSphere.castShadow = true
    glassSphere.receiveShadow = true
    scene.add(glassSphere)
    objects.push(glassSphere)
    managedObjectsRef.current.push(glassSphere)
    
    // Emissive box
    const emissiveGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
    const emissiveMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 1.5,
      roughness: 0.5
    })
    const emissiveBox = new THREE.Mesh(emissiveGeometry, emissiveMaterial)
    emissiveBox.position.set(1.5, 1.5, 2)
    emissiveBox.castShadow = true
    emissiveBox.receiveShadow = true
    scene.add(emissiveBox)
    objects.push(emissiveBox)
    managedObjectsRef.current.push(emissiveBox)
    
    // Position camera to view the scene
    camera.position.set(8, 6, 8)
    if (viewerInstance.controls) {
      viewerInstance.controls.target.set(0, 0, 0)
      viewerInstance.controls.update()
    }
    
    // Enable shadows on renderer
    if (viewerInstance.renderer) {
      viewerInstance.renderer.shadowMap.enabled = true
      viewerInstance.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }
    
    console.log('[PathTracerApp] Added test objects and lights:', {
      objects: objects.length,
      lights: 4,
      ground: true
    })
  }, [setViewer])

  // Update preview canvas
  const updatePreviewCanvas = useCallback((canvas: HTMLCanvasElement) => {
    if (!previewCanvasRef.current) return
    
    const ctx = previewCanvasRef.current.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height)
    
    const canvasAspect = canvas.width / canvas.height
    const previewAspect = previewCanvasRef.current.width / previewCanvasRef.current.height
    
    let drawWidth = previewCanvasRef.current.width
    let drawHeight = previewCanvasRef.current.height
    let drawX = 0
    let drawY = 0
    
    if (canvasAspect > previewAspect) {
      drawHeight = drawWidth / canvasAspect
      drawY = (previewCanvasRef.current.height - drawHeight) / 2
    } else {
      drawWidth = drawHeight * canvasAspect
      drawX = (previewCanvasRef.current.width - drawWidth) / 2
    }
    
    ctx.drawImage(canvas, drawX, drawY, drawWidth, drawHeight)
  }, [])

  // Start path tracing
  const startPathTracing = useCallback(async () => {
    if (!viewer || isRenderingRef.current) return

    console.log('[PathTracerApp] Starting path tracing...', {
      samples: settings.samples,
      bounces: settings.bounces,
      width: settings.width,
      height: settings.height,
      hasViewer: !!viewer,
      hasRenderer: !!viewer?.renderer,
      hasScene: !!viewer?.scene,
      hasCamera: !!viewer?.camera
    })

    setIsRendering(true)
    setProgress(0)
    isRenderingRef.current = true

    try {
      if (!viewer.renderer || !viewer.renderer.getContext()) {
        throw new Error('Renderer not ready')
      }
      
      console.log('[PathTracerApp] Creating PathTracerRenderer instance...')
      const pathTracer = new PathTracerRenderer({
        viewer,
        samples: settings.samples,
        bounces: settings.bounces,
        width: settings.width,
        height: settings.height,
        denoiseEnabled: settings.denoiseEnabled,
        denoiseStrength: settings.denoiseStrength
      })

      managedObjectsRef.current.forEach((object) => pathTracer.addObject(object))
      
      pathTracerRef.current?.dispose()
      pathTracerRef.current = pathTracer
      console.log('[PathTracerApp] PathTracerRenderer created, starting render...')

      const result = await pathTracer.start({
        onProgress: (progressValue) => {
          setProgress(progressValue)
          if (Math.floor(progressValue * 100) % 10 === 0) {
            console.log(`[PathTracerApp] Progress: ${Math.round(progressValue * 100)}%`)
          }
        },
        onPreview: (previewCanvas) => {
          console.log('[PathTracerApp] Preview update received', {
            hasCanvas: !!previewCanvas,
            width: previewCanvas?.width,
            height: previewCanvas?.height
          })
          if (previewCanvasRef.current && previewCanvas) {
            updatePreviewCanvas(previewCanvas)
          }
        }
      })

      console.log('[PathTracerApp] Render completed', {
        hasResult: !!result,
        hasCanvas: !!result?.canvas,
        canvasWidth: result?.canvas?.width,
        canvasHeight: result?.canvas?.height,
        sampleCount: result?.sampleCount
      })

      if (result?.canvas && previewCanvasRef.current) {
        console.log('[PathTracerApp] Updating preview canvas with final result')
        updatePreviewCanvas(result.canvas)
      } else {
        console.warn('[PathTracerApp] No result canvas or preview canvas ref')
      }

      // CRITICAL: Force viewer to re-render after path tracing completes
      // This prevents the white screen issue where the main view becomes blank
      if (viewer && viewer.renderer && viewer.scene && viewer.camera) {
        viewer.renderer.setRenderTarget(null)
        viewer.renderer.render(viewer.scene, viewer.camera)
      }

      setIsRendering(false)
      isRenderingRef.current = false
      console.log('[PathTracerApp] Path tracing finished successfully')
    } catch (error) {
      console.error('[PathTracerApp] Path tracer error:', error)
      console.error('[PathTracerApp] Error stack:', (error as Error)?.stack)
      setIsRendering(false)
      isRenderingRef.current = false
      alert(`Failed to render path tracer: ${(error as Error)?.message || 'Unknown error'}. Check console for details.`)
    }
  }, [viewer, settings, updatePreviewCanvas])

  // Download rendered image
  const downloadImage = useCallback(() => {
    if (!previewCanvasRef.current) {
      alert('No image to download. Please render an image first.')
      return
    }
    
    try {
      // Get the canvas and create download link
      const canvas = previewCanvasRef.current
      
      // Check if canvas has content
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        alert('Cannot access canvas context. Please render an image first.')
        return
      }
      
      // Get image data to verify canvas has content
      const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 10), Math.min(canvas.height, 10))
      let hasContent = false
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i] !== 0 || imageData.data[i+1] !== 0 || imageData.data[i+2] !== 0) {
          hasContent = true
          break
        }
      }
      
      if (!hasContent) {
        alert('No image data available. Please render an image first.')
        return
      }
      
      // Convert canvas to blob for better download reliability
      const timestamp = Date.now()
      const filename = `pathtracer-${timestamp}.png`
      
      // Use canvas.toBlob for better browser compatibility with filenames
      canvas.toBlob((blob) => {
        if (!blob) {
          alert('Failed to create image blob. Please try again.')
          return
        }
        
        try {
          // Create Blob URL - this works better with download attribute than data URLs
          const blobURL = URL.createObjectURL(blob)
          
          const link = document.createElement('a')
          link.style.display = 'none'
          link.download = filename
          link.href = blobURL
          
          // Append to body, click, then remove
          document.body.appendChild(link)
          link.click()
          
          // Clean up after a short delay
          setTimeout(() => {
            document.body.removeChild(link)
            URL.revokeObjectURL(blobURL) // Free up memory
          }, 100)
          
          console.log('[PathTracerApp] Image downloaded successfully:', filename, `(${(blob.size / 1024).toFixed(2)} KB)`)
        } catch (error) {
          console.error('[PathTracerApp] Error creating download:', error)
          alert(`Failed to download image: ${(error as Error)?.message || 'Unknown error'}`)
        }
      }, 'image/png', 1.0)
    } catch (error) {
      console.error('[PathTracerApp] Error downloading image:', error)
      alert(`Failed to download image: ${(error as Error)?.message || 'Unknown error'}`)
    }
  }, [])

  return (
    <div className="path-tracer-only-app">
      <div className="viewer-section">
        <ViewerCanvas onViewerReady={handleViewerReady} />
      </div>
      
      <div className="controls-section">
        <div className="controls-panel">
          <h2>Path Tracer</h2>
          
          <div className="control-group">
            <label>
              <span>Samples:</span>
              <input
                type="number"
                min="1"
                max="1000"
                value={settings.samples}
                onChange={(e) => setSettings({ ...settings, samples: parseInt(e.target.value) || 64 })}
                disabled={isRendering}
              />
            </label>
          </div>

          <div className="control-group">
            <label>
              <span>Bounces:</span>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.bounces}
                onChange={(e) => setSettings({ ...settings, bounces: parseInt(e.target.value) || 3 })}
                disabled={isRendering}
              />
            </label>
          </div>

          <div className="control-group">
            <label>
              <span>Width:</span>
              <input
                type="number"
                min="256"
                max="4096"
                step="256"
                value={settings.width}
                onChange={(e) => setSettings({ ...settings, width: parseInt(e.target.value) || 1024 })}
                disabled={isRendering}
              />
            </label>
          </div>

          <div className="control-group">
            <label>
              <span>Height:</span>
              <input
                type="number"
                min="256"
                max="4096"
                step="256"
                value={settings.height}
                onChange={(e) => setSettings({ ...settings, height: parseInt(e.target.value) || 1024 })}
                disabled={isRendering}
              />
            </label>
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={settings.denoiseEnabled}
                onChange={(e) => setSettings({ ...settings, denoiseEnabled: e.target.checked })}
                disabled={isRendering}
              />
              <span>Enable Denoising</span>
            </label>
          </div>

          {settings.denoiseEnabled && (
            <div className="control-group">
              <label>
                <span>Denoise Strength:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.denoiseStrength}
                  onChange={(e) => setSettings({ ...settings, denoiseStrength: parseFloat(e.target.value) })}
                  disabled={isRendering}
                />
                <span>{settings.denoiseStrength.toFixed(1)}</span>
              </label>
            </div>
          )}

          <div className="control-group">
            <button
              onClick={startPathTracing}
              disabled={!viewer || isRendering}
              className="render-button"
            >
              {isRendering ? `Rendering... ${Math.round(progress * 100)}%` : 'Start Render'}
            </button>
          </div>

          {progress > 0 && (
            <div className="control-group">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          )}

          <div className="control-group">
            <button
              onClick={downloadImage}
              disabled={isRendering}
              className="download-button"
            >
              Download Image
            </button>
          </div>
        </div>

        <div className="preview-section">
          <h3>Preview</h3>
          <canvas
            ref={previewCanvasRef}
            width={1024}
            height={1024}
            className="preview-canvas"
          />
        </div>
      </div>
    </div>
  )
}

export default PathTracerOnlyApp

