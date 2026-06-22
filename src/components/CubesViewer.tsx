import { useEffect, useCallback, useRef, useState } from 'react'
import * as THREE from 'three'
import { useViewer, syncModelToStreetsGL } from '../viewer/useViewer'
import { useAppStore } from '../store/useAppStore'
import { softenEdges } from '../utils/edgeSoftening'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './CubesViewer.css'

export default function CubesViewer() {
  const { viewer, frameObject } = useViewer()
  const { setSelectedObject, toggleCubesViewer, showCubesViewer, renderMode, streetsGLBridge } = useAppStore()
  const cubesRef = useRef<THREE.Mesh[]>([])
  const [edgeSoftness, setEdgeSoftness] = useState(0.1)
  const [isInitialized, setIsInitialized] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate stacking offset for left-side panels
  const PANEL_WIDTH = 360
  const stackingOffset = usePanelStacking({ panelId: 'cubesViewer', anchor: 'left' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'left',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'cubesViewer'
    }
  )
  

  // Apply edge softening to all cubes
  const applySofteningToAllCubes = useCallback(() => {
    if (!viewer?.renderer || !viewer?.scene) return
    
    console.log('[CubesViewer] Applying edge softening to all cubes, softness:', edgeSoftness, 'cubes:', cubesRef.current.length)
    
    let updatedCount = 0
    cubesRef.current.forEach((cube, index) => {
      if (cube.userData.isCube) {
        try {
          console.log(`[CubesViewer] Updating cube ${index + 1}:`, cube.name, 'current softness:', cube.userData.edgeSoftness, 'new softness:', edgeSoftness)
          
          // Always update - the geometry might not be beveled yet, or we need to re-bevel with new value
          const currentSoftness = cube.userData.edgeSoftness || 0
          const needsUpdate = Math.abs(currentSoftness - edgeSoftness) > 0.001 || 
                             cube.geometry instanceof THREE.BoxGeometry
          
          if (needsUpdate) {
            console.log(`[CubesViewer] Beveling cube ${index + 1} from ${currentSoftness} to ${edgeSoftness}`)
            softenEdges(cube, edgeSoftness)
            cube.userData.edgeSoftness = edgeSoftness
            updatedCount++
            
            // Force geometry update
            if (cube.geometry.attributes.position) {
              cube.geometry.attributes.position.needsUpdate = true
            }
            if (cube.geometry.attributes.normal) {
              cube.geometry.attributes.normal.needsUpdate = true
            }
            cube.geometry.computeBoundingSphere()
            cube.geometry.computeBoundingBox()
            
            // Force material update
            if (cube.material) {
              const materials = Array.isArray(cube.material) ? cube.material : [cube.material]
              materials.forEach(mat => {
                mat.needsUpdate = true
              })
            }
          } else {
            console.log(`[CubesViewer] Skipping cube ${index + 1} - no change needed`)
          }
        } catch (error) {
          console.error(`[CubesViewer] Failed to soften edges on cube ${index + 1}:`, error)
        }
      }
    })
    
    console.log(`[CubesViewer] Updated ${updatedCount} cube(s)`)
    
    // Force a render update using requestAnimationFrame to ensure it happens after geometry changes
    requestAnimationFrame(() => {
      if (viewer.renderer && viewer.scene && viewer.camera) {
        viewer.renderer.render(viewer.scene, viewer.camera)
      }
    })
  }, [edgeSoftness, viewer])

  // Create cubes with different sizes and two-sided textures
  const createCubes = useCallback(() => {
    if (!viewer?.scene) {
      console.log('[CubesViewer] Viewer or scene not ready yet')
      return
    }
    
    console.log('[CubesViewer] Creating cubes...', { hasViewer: !!viewer, hasScene: !!viewer.scene })

    // Remove existing cubes
    cubesRef.current.forEach(cube => {
      viewer.scene.remove(cube)
      cube.geometry.dispose()
      if (Array.isArray(cube.material)) {
        cube.material.forEach(mat => mat.dispose())
      } else {
        cube.material.dispose()
      }
    })
    cubesRef.current = []

    // Create different sized cubes
    const sizes = [
      { size: 1, pos: [-4, 0.5, 0], color: 0xff6b6b },
      { size: 1.5, pos: [0, 0.75, 0], color: 0x4ecdc4 },
      { size: 2, pos: [4, 1, 0], color: 0x45b7d1 },
      { size: 0.8, pos: [-2, 0.4, -3], color: 0xf9ca24 },
      { size: 1.2, pos: [2, 0.6, -3], color: 0x6c5ce7 },
      { size: 2.5, pos: [0, 1.25, 3], color: 0xa29bfe }
    ]

    sizes.forEach((config, index) => {
      // Create geometry
      const geometry = new THREE.BoxGeometry(config.size, config.size, config.size)
      
      // Create material with two-sided rendering
      const material = new THREE.MeshStandardMaterial({
        color: config.color,
        side: THREE.DoubleSide, // Two-sided texture
        metalness: 0.3,
        roughness: 0.7
      })

      // Create a simple procedural texture using canvas
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!
      
      // Helper function to convert color number to hex string
      const colorToHex = (color: number): string => {
        // Clamp to valid color range (0-0xFFFFFF)
        let clamped = Math.floor(Math.max(0, Math.min(0xFFFFFF, color)))
        // Ensure we have exactly 6 hex digits
        const hex = clamped.toString(16).padStart(6, '0').substring(0, 6)
        return `#${hex}`
      }
      
      // Create a pattern
      const gradient = ctx.createLinearGradient(0, 0, 256, 256)
      const baseColor = colorToHex(config.color)
      // Create a darker variant by reducing each RGB component
      const r = Math.max(0, ((config.color >> 16) & 0xFF) - 0x33)
      const g = Math.max(0, ((config.color >> 8) & 0xFF) - 0x33)
      const b = Math.max(0, (config.color & 0xFF) - 0x33)
      const darkerColorValue = (r << 16) | (g << 8) | b
      const darkerColor = colorToHex(darkerColorValue)
      gradient.addColorStop(0, baseColor)
      gradient.addColorStop(1, darkerColor)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 256, 256)
      
      // Add some pattern - create darker stroke color
      const strokeR = Math.max(0, ((config.color >> 16) & 0xFF) - 0x22)
      const strokeG = Math.max(0, ((config.color >> 8) & 0xFF) - 0x22)
      const strokeB = Math.max(0, (config.color & 0xFF) - 0x22)
      const strokeColorValue = (strokeR << 16) | (strokeG << 8) | strokeB
      const strokeColor = colorToHex(strokeColorValue)
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2
      for (let i = 0; i < 8; i++) {
        ctx.beginPath()
        ctx.moveTo(i * 32, 0)
        ctx.lineTo(i * 32, 256)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, i * 32)
        ctx.lineTo(256, i * 32)
        ctx.stroke()
      }
      
      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(2, 2)
      material.map = texture

      const cube = new THREE.Mesh(geometry, material)
      cube.position.set(config.pos[0], config.pos[1], config.pos[2])
      cube.name = `Cube ${index + 1} (${config.size})`
      cube.castShadow = true
      cube.receiveShadow = true
      
      // Mark for selection
      cube.userData.isModel = true
      cube.userData.isImportedModel = true
      cube.userData.isCube = true
      cube.userData.originalSize = config.size
      cube.userData.originalWidth = config.size
      cube.userData.originalHeight = config.size
      cube.userData.originalDepth = config.size
      cube.userData.edgeSoftness = edgeSoftness

      viewer.scene.add(cube)
      cubesRef.current.push(cube)
    })

    // Sync cubes to Streets GL so they have GPS and can be focused on the map in city mode
    const store = useAppStore.getState()
    if (store.streetsGLIframeOverlay && store.streetsGLBridge) {
      cubesRef.current.forEach((cube) => {
        syncModelToStreetsGL(cube, store.streetsGLBridge!).catch((err) => {
          console.warn('[CubesViewer] Failed to sync cube to Streets GL:', err)
        })
      })
    }

    // Apply initial edge softening
    applySofteningToAllCubes()

    setIsInitialized(true)
    console.log('[CubesViewer] ✅ Created', cubesRef.current.length, 'cubes with two-sided textures')
  }, [viewer, applySofteningToAllCubes])

  // Initialize cubes when viewer is ready AND panel is shown
  useEffect(() => {
    if (!showCubesViewer) {
      // Remove cubes when panel is hidden
      if (cubesRef.current.length > 0 && viewer?.scene) {
        cubesRef.current.forEach(cube => {
          viewer.scene.remove(cube)
          cube.geometry.dispose()
          if (Array.isArray(cube.material)) {
            cube.material.forEach(mat => mat.dispose())
          } else {
            cube.material.dispose()
          }
        })
        cubesRef.current = []
        setIsInitialized(false)
      }
      return
    }
    
    console.log('[CubesViewer] useEffect check:', { 
      hasViewer: !!viewer, 
      hasScene: !!viewer?.scene, 
      isInitialized,
      showCubesViewer 
    })
    // In city mode the Three.js viewer is hidden (not in DOM), so cubes would be invisible; only create in product/hybrid
    if (viewer?.scene && !isInitialized && showCubesViewer && renderMode !== 'city') {
      console.log('[CubesViewer] Initializing cubes...')
      createCubes()
    }
  }, [viewer, isInitialized, showCubesViewer, renderMode, createCubes])

  // When Streets GL bridge becomes available (e.g. user switched to hybrid/city), sync any cubes not yet synced
  useEffect(() => {
    if (!streetsGLBridge || cubesRef.current.length === 0 || renderMode === 'city') return
    cubesRef.current.forEach((cube) => {
      if (!cube.userData.streetsGLObjectId) {
        syncModelToStreetsGL(cube, streetsGLBridge).catch((err) => {
          console.warn('[CubesViewer] Failed to sync cube to Streets GL:', cube.name, err)
        })
      }
    })
  }, [streetsGLBridge, renderMode])

  // Update edge softness in real-time
  useEffect(() => {
    if (isInitialized && cubesRef.current.length > 0) {
      console.log('[CubesViewer] Edge softness changed, updating cubes:', edgeSoftness)
      applySofteningToAllCubes()
    }
  }, [edgeSoftness, isInitialized, applySofteningToAllCubes])

  if (!showCubesViewer) return null

  return (
    <div 
      ref={panelRef}
      className={`cubes-viewer-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="cubes-viewer-header" onMouseDown={handleMouseDown}>
        <h3>Cubes Viewer</h3>
        <div className="cubes-header-right">
          <div className="cubes-info">
            {cubesRef.current.length} cubes
          </div>
          <button className="close-button" onClick={toggleCubesViewer} title="Close panel" data-no-drag>
            ×
          </button>
        </div>
      </div>
      
      <div className="cubes-viewer-content">
        {renderMode === 'city' && (
          <div className="cubes-viewer-city-notice" role="alert">
            <strong>Cubes only visible in Product or Hybrid mode.</strong> In City mode the 3D viewer is hidden, so cubes cannot be shown or focused. Switch render mode in the toolbar to see cubes. To add objects on the map in City mode, use the <strong>Primitives</strong> panel (objects sync to Streets GL).
          </div>
        )}
        <div className="edge-softening-section">
          <h4>Edge Softening Tool</h4>
          <div className="softening-controls">
            <label>
              <span>Softness: {edgeSoftness.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.01"
                value={edgeSoftness}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value)
                  setEdgeSoftness(newValue)
                }}
              />
            </label>
            <div className="softening-buttons">
              <button
                onClick={() => setEdgeSoftness(0)}
                className="softening-button"
              >
                Sharp (0)
              </button>
              <button
                onClick={() => setEdgeSoftness(0.1)}
                className="softening-button"
              >
                Soft (0.1)
              </button>
              <button
                onClick={() => setEdgeSoftness(0.3)}
                className="softening-button"
              >
                Very Soft (0.3)
              </button>
            </div>
          </div>
        </div>

        <div className="cubes-actions">
          <button
            onClick={() => {
              setIsInitialized(false)
              setTimeout(() => createCubes(), 100)
            }}
            className="refresh-button"
          >
            Refresh Cubes
          </button>
        </div>

        <div className="cubes-info-section">
          <h4>Cubes Info</h4>
          <ul className="cubes-list">
            {cubesRef.current.map((cube, index) => (
              <li key={index}>
                <button
                  onClick={() => {
                    setSelectedObject(cube)
                    if (frameObject && cube.visible) frameObject(cube)
                  }}
                  className="cube-item-button"
                >
                  {cube.name} - Size: {cube.userData.originalSize}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

