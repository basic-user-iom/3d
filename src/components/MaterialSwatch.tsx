// @ts-nocheck

import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { getSharedViewer } from '../viewer/useViewer'
import { captureViewerScreenshot } from '../viewer/utils/screenshotCapture'

interface MaterialSwatchProps {
  material: THREE.Material
  name: string
  selected: boolean
  onClick: () => void
  onDuplicate?: () => void
  size?: number
}

// Shared renderer for all material previews (single WebGL context)
let sharedRenderer: THREE.WebGLRenderer | null = null
let renderQueue: Array<{
  material: THREE.Material
  canvas: HTMLCanvasElement
  resolve: (dataUrl: string) => void
  reject: (error: Error) => void
}> = []
let isRendering = false
let activeRenders = 0
const MAX_CONCURRENT_RENDERS = 2 // Limit concurrent renders to prevent freezing

/**
 * Get or create shared WebGL renderer for material previews
 * Uses GPU detection for optimal performance settings
 */
function getSharedRenderer(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 120
    
    // Detect GPU for optimal settings
    let powerPreference: "high-performance" | "low-power" | "default" = "default"
    try {
      const tempCanvas = document.createElement('canvas')
      const gl = tempCanvas.getContext('webgl2') || tempCanvas.getContext('webgl')
      if (gl) {
        const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info')
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
        const rendererLower = renderer?.toLowerCase() || ''
        // Prefer high-performance for dedicated GPUs
        if (rendererLower.includes('nvidia') || rendererLower.includes('geforce') || 
            rendererLower.includes('rtx') || rendererLower.includes('gtx') ||
            (rendererLower.includes('amd') && rendererLower.includes('radeon rx'))) {
          powerPreference = 'high-performance'
        }
      }
    } catch (e) {
      // Fallback to default if detection fails
    }
    
    sharedRenderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: true,
      alpha: false,
      powerPreference: powerPreference
    })
    sharedRenderer.setSize(120, 120)
    sharedRenderer.setPixelRatio(1)
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace
    sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping
    sharedRenderer.toneMappingExposure = 1.2
  }
  return sharedRenderer
}

/**
 * Render a material preview to an image data URL
 */
function renderMaterialPreview(material: THREE.Material, size: number = 120): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const renderer = getSharedRenderer()
      
      // Create scene
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x2a2a2a)

      // Create camera
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      camera.position.set(2, 2, 3)
      camera.lookAt(0, 0, 0)

      // Try to get environment map from main viewer scene if available
      const viewer = getSharedViewer()
      if (viewer?.scene?.environment) {
        scene.environment = viewer.scene.environment
      } else {
        // Create a simple environment map
        const pmremGenerator = new THREE.PMREMGenerator(renderer)
        const envScene = new THREE.Scene()
        envScene.background = new THREE.Color(0xffffff)
        const envMap = pmremGenerator.fromScene(envScene).texture
        scene.environment = envMap
        pmremGenerator.dispose()
      }

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
      scene.add(ambientLight)

      const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8)
      directionalLight1.position.set(3, 5, 2)
      scene.add(directionalLight1)

      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
      directionalLight2.position.set(-3, 2, -2)
      scene.add(directionalLight2)

      // Create sphere with material
      const geometry = new THREE.SphereGeometry(1, 32, 32)
      
      // Clone material to avoid affecting original
      let sphereMaterial: THREE.Material
      try {
        sphereMaterial = material.clone()
        
        // Ensure material has proper settings for preview
        if (sphereMaterial instanceof THREE.MeshStandardMaterial || 
            sphereMaterial instanceof THREE.MeshPhysicalMaterial) {
          // Use scene environment map if available
          if (scene.environment) {
            sphereMaterial.envMap = scene.environment
            if (sphereMaterial.envMapIntensity === undefined) {
              sphereMaterial.envMapIntensity = 1.0
            }
          }
        } else if (sphereMaterial instanceof THREE.MeshBasicMaterial) {
          // Convert MeshBasicMaterial to MeshStandardMaterial for preview
          const standardMat = new THREE.MeshStandardMaterial({
            color: sphereMaterial.color.clone(),
            map: sphereMaterial.map,
            transparent: sphereMaterial.transparent,
            opacity: sphereMaterial.opacity,
            side: sphereMaterial.side,
            visible: sphereMaterial.visible
          })
          if (scene.environment) {
            standardMat.envMap = scene.environment
            standardMat.envMapIntensity = 0.5
          }
          standardMat.roughness = 0.8
          standardMat.metalness = 0.1
          sphereMaterial.dispose()
          sphereMaterial = standardMat
        }
        
        // Ensure material is ready
        if (sphereMaterial) {
          sphereMaterial.needsUpdate = true
        }
      } catch (cloneErr) {
        // Create fallback material
        const color = material instanceof THREE.MeshStandardMaterial || 
                     material instanceof THREE.MeshPhysicalMaterial ||
                     material instanceof THREE.MeshBasicMaterial
          ? (material as any).color || new THREE.Color(0x888888)
          : new THREE.Color(0x888888)
        
        sphereMaterial = new THREE.MeshStandardMaterial({
          color: color instanceof THREE.Color ? color.clone() : color,
          roughness: 0.7,
          metalness: 0.1
        })
        if (scene.environment) {
          (sphereMaterial as THREE.MeshStandardMaterial).envMap = scene.environment
          (sphereMaterial as THREE.MeshStandardMaterial).envMapIntensity = 1.0
        }
      }

      const sphere = new THREE.Mesh(geometry, sphereMaterial)
      sphere.rotation.y = Math.PI / 4
      sphere.rotation.x = Math.PI / 6
      scene.add(sphere)

      // Render to canvas
      renderer.setSize(size, size)
      renderer.render(scene, camera)

      // Convert canvas to data URL via readPixels (preserveDrawingBuffer not required)
      const dataUrl = captureViewerScreenshot({ renderer, scene, camera })
      
      // Cleanup
      geometry.dispose()
      sphereMaterial.dispose()
      scene.clear()
      
      resolve(dataUrl)
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/**
 * Renders a 3D sphere preview of a material
 * Similar to Twinmotion's material browser swatches
 * Uses a shared WebGL renderer to avoid context limit issues
 */
export function MaterialSwatch({ material, name, selected, onClick, onDuplicate, size = 120 }: MaterialSwatchProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Throttle preview generation to prevent freezing
  useEffect(() => {
    if (error) return

    setIsLoading(true)
    setError(false)

    // Use intersection observer to only render when visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !previewUrl && !error) {
            // Add to queue instead of rendering immediately
            const previewTask = async () => {
              try {
                // Check if component is still mounted
                if (!containerRef.current) {
                  setIsLoading(false)
                  return
                }

    // Render material preview to image (single render, no animation loop)
                const dataUrl = await renderMaterialPreview(material, size)
                
                // Double-check component is still mounted before setting state
                if (containerRef.current) {
        setPreviewUrl(dataUrl)
        setIsLoading(false)
                }
              } catch (err) {
        console.error(`[MaterialSwatch] Failed to render preview for "${name}":`, err)
                if (containerRef.current) {
        setError(true)
        setIsLoading(false)
                }
              }
            }

            // Render preview (will be throttled by renderMaterialPreview's internal queue)
            previewTask()
            
            // Unobserve after adding to queue
            observer.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '50px' } // Start loading 50px before entering viewport
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [material, size, error, name, previewUrl])

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onDuplicate) {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY })
    }
  }

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDuplicate) {
      onDuplicate()
    }
    setContextMenu(null)
  }

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null)
    }
    
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('contextmenu', handleClickOutside)
      }
    }
  }, [contextMenu])

  // Fallback: simple colored square
  if (error || (!previewUrl && !isLoading)) {
    const backgroundColor = material instanceof THREE.MeshStandardMaterial || 
                          material instanceof THREE.MeshPhysicalMaterial ||
                          material instanceof THREE.MeshBasicMaterial
      ? `#${((material as any).color || new THREE.Color(0x888888)).getHexString()}`
      : '#888888'

    return (
      <div 
        ref={containerRef}
        className={`material-swatch ${selected ? 'selected' : ''}`}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setShowDuplicate(true)}
        onMouseLeave={() => setShowDuplicate(false)}
        title={name}
        style={{
          backgroundColor,
          border: selected ? '2px solid #4a9eff' : '2px solid transparent',
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px'
        }}
      >
        {isLoading && <span style={{ color: '#fff', opacity: 0.5 }}>...</span>}
        {!isLoading && <span style={{ color: '#fff', opacity: 0.5 }}>M</span>}
        {showDuplicate && onDuplicate && (
          <button
            onClick={handleDuplicateClick}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'rgba(42, 42, 42, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              color: '#e0e0e0',
              cursor: 'pointer',
              padding: '4px 6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(74, 158, 255, 0.9)'
              e.currentTarget.style.borderColor = '#4a9eff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(42, 42, 42, 0.9)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
            }}
            title="Duplicate material"
          >
            📋
          </button>
        )}
        {contextMenu && onDuplicate && (
          <div
            style={{
              position: 'fixed',
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
              zIndex: 10000,
              background: '#2a2a2a',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
              minWidth: '160px',
              padding: '4px 0'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleDuplicateClick}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: '#e0e0e0',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span>📋</span>
              <span>Duplicate Material</span>
            </button>
          </div>
        )}
        <div className="material-swatch-label">{name}</div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={`material-swatch ${selected ? 'selected' : ''}`} 
      onClick={onClick} 
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowDuplicate(true)}
      onMouseLeave={() => setShowDuplicate(false)}
      title={name}
      style={{ position: 'relative' }}
    >
      {isLoading && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2a2a2a',
          color: '#888',
          fontSize: '12px'
        }}>
          Loading...
        </div>
      )}
      {previewUrl && (
        <img 
          ref={imgRef}
          src={previewUrl} 
          alt={name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
          onError={() => {
            setError(true)
            setIsLoading(false)
          }}
        />
      )}
      {showDuplicate && onDuplicate && (
        <button
          onClick={handleDuplicateClick}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'rgba(42, 42, 42, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            color: '#e0e0e0',
            cursor: 'pointer',
            padding: '4px 6px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(74, 158, 255, 0.9)'
            e.currentTarget.style.borderColor = '#4a9eff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(42, 42, 42, 0.9)'
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
          }}
          title="Duplicate material"
        >
          📋
        </button>
      )}
      {contextMenu && onDuplicate && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000,
            background: '#2a2a2a',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            minWidth: '160px',
            padding: '4px 0'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleDuplicateClick}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              color: '#e0e0e0',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>📋</span>
            <span>Duplicate Material</span>
          </button>
        </div>
      )}
      <div className="material-swatch-label">{name}</div>
    </div>
  )
}

