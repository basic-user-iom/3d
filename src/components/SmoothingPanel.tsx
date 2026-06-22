/**
 * Smoothing Panel
 * Quick access to triangle smoothing functions
 * Allows smoothing entire model or selected objects
 */

import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { smoothEdges, storeOriginalGeometry } from '../utils/edgeSmoothing'
import './SmoothingPanel.css'

export default function SmoothingPanel() {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 360
  const stackingOffset = usePanelStacking({ panelId: 'smoothing', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'smoothing'
    }
  )
  
  const {
    showSmoothingPanel,
    toggleSmoothingPanel,
    selectedObject,
    smoothingIntensity,
    setSmoothingIntensity,
    smoothingMeshSelectionMode,
    setSmoothingMeshSelectionMode,
    selectedSmoothingMeshes,
    setSelectedSmoothingMeshes,
    addToUndoStack
  } = useAppStore()
  
  const { viewer } = useViewer()
  const [isProcessing, setIsProcessing] = useState(false)
  const [showWireframe, setShowWireframe] = useState(true)
  const [originalWireframeStates] = useState<Map<number, boolean>>(new Map())
  const [isMinimized, setIsMinimized] = useState(false)

  // Show wireframe on selected meshes
  useEffect(() => {
    if (!viewer?.scene) return

    // First, restore wireframe for meshes that are no longer selected
    const selectedIds = new Set(selectedSmoothingMeshes.map(m => m.id))
    if (viewer.scene) {
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material && originalWireframeStates.has(obj.id)) {
          if (!selectedIds.has(obj.id)) {
            // Mesh was deselected, restore original wireframe
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            materials.forEach((mat: THREE.Material) => {
              const originalState = originalWireframeStates.get(obj.id) || false
              const matAny = mat as any
              matAny.wireframe = originalState
              mat.needsUpdate = true
            })
            originalWireframeStates.delete(obj.id)
          }
        }
      })
    }

    // Store original wireframe states and apply wireframe to selected meshes
    selectedSmoothingMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh && mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat: THREE.Material) => {
          const matAny = mat as any
          // Store original state only once when mesh is first selected
          if (!originalWireframeStates.has(mesh.id)) {
            originalWireframeStates.set(mesh.id, matAny.wireframe || false)
          }
          
          // Apply wireframe based on toggle state
          if (showWireframe) {
            matAny.wireframe = true
            mat.needsUpdate = true
          } else {
            const originalState = originalWireframeStates.get(mesh.id) || false
            matAny.wireframe = originalState
            mat.needsUpdate = true
          }
        })
      }
    })
  }, [selectedSmoothingMeshes, showWireframe, viewer, originalWireframeStates])

  // Clear selection and restore wireframes when panel closes
  useEffect(() => {
    if (!showSmoothingPanel && smoothingMeshSelectionMode) {
      setSmoothingMeshSelectionMode(false)
      
      // Restore all wireframe states
      if (viewer?.scene) {
        viewer.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material && originalWireframeStates.has(obj.id)) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            materials.forEach((mat: THREE.Material) => {
              const originalState = originalWireframeStates.get(obj.id) || false
              const matAny = mat as any
              matAny.wireframe = originalState
              mat.needsUpdate = true
            })
            originalWireframeStates.delete(obj.id)
          }
        })
      }
      
      setSelectedSmoothingMeshes([])
    }
  }, [showSmoothingPanel, smoothingMeshSelectionMode, setSmoothingMeshSelectionMode, setSelectedSmoothingMeshes, viewer, originalWireframeStates])

  // Smooth all meshes in the scene
  const handleSmoothAll = async () => {
    if (!viewer?.scene) {
      alert('Viewer not available')
      return
    }

    setIsProcessing(true)
    let appliedCount = 0
    const errors: string[] = []
    const smoothedObjects: Array<{ object: THREE.Object3D, originalGeometry: THREE.BufferGeometry | null }> = []
    
    try {
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.visible) {
          // Skip helpers, shadow planes, etc.
          if (
            obj.userData.isHelper === true ||
            obj.userData.isShadowPlane === true ||
            obj.userData.isGroundedSkybox === true ||
            obj.type.includes('Helper')
          ) {
            return
          }

          try {
            // Store original geometry if not already stored
            const originalGeometry = obj.userData.originalGeometry || obj.geometry.clone()
            if (!obj.userData.originalGeometry) {
              storeOriginalGeometry(obj)
            }
            
            smoothedObjects.push({ object: obj, originalGeometry })
            
            // Apply edge smoothing
            smoothEdges(obj, {
              intensity: smoothingIntensity,
              preserveUVs: true,
              angleThreshold: Math.PI / 6 // 30 degrees
            })
            
            // Force geometry update
            obj.geometry.computeBoundingBox()
            obj.geometry.computeBoundingSphere()
            
            appliedCount++
          } catch (error) {
            const errorMsg = `Error smoothing ${obj.name || 'unnamed object'}: ${error instanceof Error ? error.message : String(error)}`
            console.error(`[SmoothingPanel] ${errorMsg}`)
            errors.push(errorMsg)
          }
        }
      })

      // Add to undo stack
      if (appliedCount > 0) {
        addToUndoStack({
          type: 'edge-smoothing',
          objects: smoothedObjects
        })
      }

      if (appliedCount > 0) {
        console.log(`[SmoothingPanel] ✅ Smoothed ${appliedCount} object(s) with intensity ${smoothingIntensity.toFixed(2)}`)
        if (errors.length > 0) {
          alert(`Smoothed ${appliedCount} object(s), but ${errors.length} error(s) occurred. Check console for details.`)
        }
      } else {
        alert('No objects found to smooth. Make sure you have a model loaded.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Smooth selected object only
  const handleSmoothSelected = async () => {
    if (!selectedObject) {
      alert('Please select an object first')
      return
    }

    if (!(selectedObject instanceof THREE.Mesh)) {
      alert('Selected object is not a mesh. Please select a mesh object.')
      return
    }

    setIsProcessing(true)
    
    try {
      // Store original geometry if not already stored
      const originalGeometry = selectedObject.userData.originalGeometry || selectedObject.geometry.clone()
      if (!selectedObject.userData.originalGeometry) {
        storeOriginalGeometry(selectedObject)
      }
      
      // Apply edge smoothing
      smoothEdges(selectedObject, {
        intensity: smoothingIntensity,
        preserveUVs: true,
        angleThreshold: Math.PI / 6 // 30 degrees
      })
      
      // Force geometry update
      selectedObject.geometry.computeBoundingBox()
      selectedObject.geometry.computeBoundingSphere()
      
      // Add to undo stack
      addToUndoStack({
        type: 'edge-smoothing',
        objects: [{ object: selectedObject, originalGeometry }]
      })

      console.log(`[SmoothingPanel] ✅ Smoothed selected object: ${selectedObject.name || 'unnamed'} with intensity ${smoothingIntensity.toFixed(2)}`)
    } catch (error) {
      const errorMsg = `Error smoothing selected object: ${error instanceof Error ? error.message : String(error)}`
      console.error(`[SmoothingPanel] ${errorMsg}`)
      alert(errorMsg)
    } finally {
      setIsProcessing(false)
    }
  }

  // Smooth all meshes in selected object's hierarchy
  const handleSmoothSelectedHierarchy = async () => {
    if (!selectedObject) {
      alert('Please select an object first')
      return
    }

    setIsProcessing(true)
    let appliedCount = 0
    const errors: string[] = []
    const smoothedObjects: Array<{ object: THREE.Object3D, originalGeometry: THREE.BufferGeometry | null }> = []
    
    try {
      selectedObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.visible) {
          try {
            // Store original geometry if not already stored
            const originalGeometry = obj.userData.originalGeometry || obj.geometry.clone()
            if (!obj.userData.originalGeometry) {
              storeOriginalGeometry(obj)
            }
            
            smoothedObjects.push({ object: obj, originalGeometry })
            
            // Apply edge smoothing
            smoothEdges(obj, {
              intensity: smoothingIntensity,
              preserveUVs: true,
              angleThreshold: Math.PI / 6 // 30 degrees
            })
            
            // Force geometry update
            obj.geometry.computeBoundingBox()
            obj.geometry.computeBoundingSphere()
            
            appliedCount++
          } catch (error) {
            const errorMsg = `Error smoothing ${obj.name || 'unnamed object'}: ${error instanceof Error ? error.message : String(error)}`
            console.error(`[SmoothingPanel] ${errorMsg}`)
            errors.push(errorMsg)
          }
        }
      })

      // Add to undo stack
      if (appliedCount > 0) {
        addToUndoStack({
          type: 'edge-smoothing',
          objects: smoothedObjects
        })
      }

      if (appliedCount > 0) {
        console.log(`[SmoothingPanel] ✅ Smoothed ${appliedCount} object(s) in hierarchy with intensity ${smoothingIntensity.toFixed(2)}`)
        if (errors.length > 0) {
          alert(`Smoothed ${appliedCount} object(s), but ${errors.length} error(s) occurred. Check console for details.`)
        }
      } else {
        alert('No meshes found in selected object hierarchy.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Smooth selected meshes from mesh picker
  const handleSmoothSelectedMeshes = async (hideAfterSmoothing: boolean = false) => {
    if (selectedSmoothingMeshes.length === 0) {
      alert('Please select at least one mesh using the mesh picker')
      return
    }

    setIsProcessing(true)
    let appliedCount = 0
    const errors: string[] = []
    const smoothedObjects: Array<{ object: THREE.Object3D, originalGeometry: THREE.BufferGeometry | null }> = []
    
    try {
      selectedSmoothingMeshes.forEach((mesh) => {
        if (mesh instanceof THREE.Mesh && mesh.visible) {
          try {
            // Store original geometry if not already stored
            const originalGeometry = mesh.userData.originalGeometry || mesh.geometry.clone()
            if (!mesh.userData.originalGeometry) {
              storeOriginalGeometry(mesh)
            }
            
            smoothedObjects.push({ object: mesh, originalGeometry })
            
            // Apply edge smoothing
            smoothEdges(mesh, {
              intensity: smoothingIntensity,
              preserveUVs: true,
              angleThreshold: Math.PI / 6 // 30 degrees
            })
            
            // Force geometry update
            mesh.geometry.computeBoundingBox()
            mesh.geometry.computeBoundingSphere()
            
            // Hide mesh if requested
            if (hideAfterSmoothing) {
              mesh.visible = false
            }
            
            appliedCount++
          } catch (error) {
            const errorMsg = `Error smoothing ${mesh.name || 'unnamed mesh'}: ${error instanceof Error ? error.message : String(error)}`
            console.error(`[SmoothingPanel] ${errorMsg}`)
            errors.push(errorMsg)
          }
        }
      })

      // Add to undo stack
      if (appliedCount > 0) {
        addToUndoStack({
          type: 'edge-smoothing',
          objects: smoothedObjects
        })
      }

      if (appliedCount > 0) {
        console.log(`[SmoothingPanel] ✅ Smoothed ${appliedCount} selected mesh(es) with intensity ${smoothingIntensity.toFixed(2)}${hideAfterSmoothing ? ' (hidden after smoothing)' : ''}`)
        if (errors.length > 0) {
          alert(`Smoothed ${appliedCount} mesh(es), but ${errors.length} error(s) occurred. Check console for details.`)
        }
        // Clear selection after smoothing
        setSelectedSmoothingMeshes([])
        setSmoothingMeshSelectionMode(false)
      } else {
        alert('No valid meshes found in selection.')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // Simple normal recomputation (fast, visual only)
  const handleRecomputeNormals = () => {
    if (!viewer?.scene) {
      alert('Viewer not available')
      return
    }

    setIsProcessing(true)
    let recomputedCount = 0
    
    try {
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.visible && obj.geometry) {
          // Skip helpers
          if (
            obj.userData.isHelper === true ||
            obj.userData.isShadowPlane === true ||
            obj.userData.isGroundedSkybox === true ||
            obj.type.includes('Helper')
          ) {
            return
          }

          try {
            obj.geometry.computeVertexNormals()
            if (obj.geometry.attributes.normal) {
              obj.geometry.attributes.normal.needsUpdate = true
            }
            recomputedCount++
          } catch (error) {
            console.warn(`[SmoothingPanel] Failed to recompute normals for ${obj.name || 'unnamed'}:`, error)
          }
        }
      })

      console.log(`[SmoothingPanel] ✅ Recomputed normals for ${recomputedCount} object(s)`)
    } finally {
      setIsProcessing(false)
    }
  }

  if (!showSmoothingPanel) return null

  return (
    <div
      ref={panelRef}
      className="smoothing-panel"
      style={{
        top: panelTop,
        left: panelLeft,
        maxHeight: maxHeight,
        cursor: dragging ? 'grabbing' : 'default'
      }}
    >
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <h3>🔧 Smoothing</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleSmoothingPanel}>×</button>
        </div>
      </div>

      {!isMinimized && (
      <div className="panel-content">
        <div className="smoothing-section">
          <label>
            <span>Smoothing Intensity</span>
            <div className="slider-container">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={smoothingIntensity}
                onChange={(e) => setSmoothingIntensity(parseFloat(e.target.value))}
                className="slider"
              />
              <span className="slider-value">{smoothingIntensity.toFixed(2)}</span>
            </div>
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              {smoothingIntensity < 0.3
                ? 'Subtle smoothing - minimal changes'
                : smoothingIntensity < 0.7
                ? 'Moderate smoothing - balanced effect'
                : 'Strong smoothing - maximum softness'}
            </small>
          </label>
        </div>

        {/* Mesh Selection Tool */}
        <div className="smoothing-section" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
              Select specific meshes to smooth. Click the button to activate mesh picker, then click on meshes in the 3D scene to select them.
            </p>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                
                if (smoothingMeshSelectionMode) {
                  console.log('[SmoothingPanel] Deactivating mesh picker')
                  setSmoothingMeshSelectionMode(false)
                } else {
                  if (!viewer) {
                    alert('Viewer not available')
                    return
                  }
                  console.log('[SmoothingPanel] Activating mesh picker - click on meshes in the scene to select them')
                  setSmoothingMeshSelectionMode(true)
                }
              }}
              disabled={!viewer}
              className={smoothingMeshSelectionMode ? "smoothing-button primary" : "smoothing-button"}
              style={{ 
                width: '100%', 
                marginBottom: '10px',
                backgroundColor: smoothingMeshSelectionMode ? '#2196f3' : undefined,
                borderColor: smoothingMeshSelectionMode ? '#2196f3' : undefined,
              }}
              title={smoothingMeshSelectionMode ? 'Click to deactivate mesh picker' : 'Click to activate mesh picker'}
            >
              {smoothingMeshSelectionMode ? '🎯 Mesh Picker Active - Click to Deactivate' : '🎯 Mesh Picker - Click to Activate'}
            </button>
            {smoothingMeshSelectionMode && (
              <div style={{ fontSize: '12px', color: '#2196f3', marginTop: '5px', marginBottom: '10px' }}>
                ✓ Mesh picker active - Click on meshes in the scene to select them (Ctrl+Click for multi-select)
              </div>
            )}
          </div>

          {/* Selected Meshes List */}
          {selectedSmoothingMeshes.length > 0 && (
            <div style={{ marginTop: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
                  Selected Meshes ({selectedSmoothingMeshes.length})
                </span>
                <button
                  onClick={() => setSelectedSmoothingMeshes([])}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                  title="Clear selection"
                >
                  Clear
                </button>
              </div>
              
              {/* Wireframe Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showWireframe}
                  onChange={(e) => setShowWireframe(e.target.checked)}
                  style={{ marginRight: '8px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#fff' }}>
                  Show Wireframe {showWireframe && '✓'}
                </span>
              </label>
              <div style={{ 
                maxHeight: '150px', 
                overflowY: 'auto', 
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '6px',
                padding: '8px'
              }}>
                {selectedSmoothingMeshes.map((mesh, index) => (
                  <div
                    key={mesh.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 8px',
                      marginBottom: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  >
                    <span style={{ color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mesh.name || `Mesh ${index + 1}`}
                    </span>
                    <button
                      onClick={() => {
                        const filtered = selectedSmoothingMeshes.filter(m => m.id !== mesh.id)
                        setSelectedSmoothingMeshes(filtered)
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ff4444',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontSize: '14px',
                        marginLeft: '8px'
                      }}
                      title="Remove from selection"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {/* Hide After Smoothing Option */}
              <label style={{ display: 'flex', alignItems: 'center', marginTop: '10px', marginBottom: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="hide-after-smoothing"
                  style={{ marginRight: '8px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#fff' }}>
                  Hide meshes after smoothing
                </span>
              </label>
              
              <button
                className="smoothing-button primary"
                onClick={() => {
                  const hideAfterSmoothing = (document.getElementById('hide-after-smoothing') as HTMLInputElement)?.checked || false
                  handleSmoothSelectedMeshes(hideAfterSmoothing)
                }}
                disabled={isProcessing || selectedSmoothingMeshes.length === 0}
                style={{ width: '100%', marginTop: '10px' }}
                title="Apply smoothing to selected meshes"
              >
                ✨ Smooth Selected Meshes ({selectedSmoothingMeshes.length})
              </button>
            </div>
          )}
        </div>

        <div className="smoothing-actions">
          <button
            className="smoothing-button primary"
            onClick={handleRecomputeNormals}
            disabled={isProcessing}
            title="Quick normal recomputation (fast, visual smoothing only)"
          >
            🔄 Recompute Normals (Fast)
          </button>

          <button
            className="smoothing-button"
            onClick={handleSmoothSelected}
            disabled={isProcessing || !selectedObject}
            title="Smooth only the selected object"
          >
            ✨ Smooth Selected
          </button>

          <button
            className="smoothing-button"
            onClick={handleSmoothSelectedHierarchy}
            disabled={isProcessing || !selectedObject}
            title="Smooth all meshes in the selected object's hierarchy"
          >
            🌳 Smooth Selected Hierarchy
          </button>

          <button
            className="smoothing-button primary"
            onClick={handleSmoothAll}
            disabled={isProcessing}
            title="Smooth all meshes in the scene"
          >
            🌐 Smooth All Objects
          </button>
        </div>

        <div className="smoothing-info">
          <small style={{ display: 'block', color: '#888', marginTop: '12px' }}>
            💡 <strong>Mesh Picker</strong>: Click meshes in the scene to select them (Ctrl+Click for multi-select)<br/>
            💡 <strong>Recompute Normals</strong>: Fast visual smoothing (no geometry changes)<br/>
            💡 <strong>Smooth Selected</strong>: Apply edge smoothing to selected object<br/>
            💡 <strong>Smooth Hierarchy</strong>: Smooth all meshes in selected object's tree<br/>
            💡 <strong>Smooth All</strong>: Smooth every mesh in the scene
          </small>
        </div>
      </div>
      )}
    </div>
  )
}

