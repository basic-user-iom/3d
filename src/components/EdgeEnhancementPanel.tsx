/**
 * Edge Enhancement Panel (Autosoft Edge)
 * Similar to Twinmotion's Autosoft Edge and D5 Render's edge smoothing features
 * Allows selecting sub-objects/parts of models and applying edge smoothing
 */

import { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { smoothEdges, storeOriginalGeometry } from '../utils/edgeSmoothing'
import { trackSliderInteraction } from '../utils/sliderTracker'
import './EdgeEnhancementPanel.css'

const PANEL_WIDTH = 360

export default function EdgeEnhancementPanel() {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const stackingOffset = usePanelStacking({ panelId: 'edgeEnhancement', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'edgeEnhancement'
    }
  )
  
  const {
    showEdgeEnhancementPanel,
    toggleEdgeEnhancementPanel,
    subObjectSelectionMode,
    setSubObjectSelectionMode,
    selectedSubObjects,
    setSelectedSubObjects,
    edgeSmoothingIntensity,
    setEdgeSmoothingIntensity,
    selectedObject,
    addToUndoStack
  } = useAppStore()
  
  const { viewer } = useViewer()
  const [highlightedObjects, setHighlightedObjects] = useState<Set<number>>(new Set())
  const [isMinimized, setIsMinimized] = useState(false)

  // Store original geometries when starting selection mode
  useEffect(() => {
    if (subObjectSelectionMode && viewer?.scene) {
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && !obj.userData.originalGeometry) {
          storeOriginalGeometry(obj)
        }
      })
    }
  }, [subObjectSelectionMode, viewer])

  // Update highlights when selection changes
  useEffect(() => {
    const highlighted = new Set<number>()
    selectedSubObjects.forEach(obj => highlighted.add(obj.id))
    setHighlightedObjects(highlighted)
  }, [selectedSubObjects])

  // Apply edge smoothing to selected objects
  const handleApplyEdgeSmoothing = () => {
    if (selectedSubObjects.length === 0) {
      alert('Please select at least one object/part first')
      return
    }

    if (!viewer?.scene) {
      alert('Viewer not available')
      return
    }

    let appliedCount = 0
    const errors: string[] = []
    
    selectedSubObjects.forEach((obj) => {
      if (obj instanceof THREE.Mesh) {
        try {
          // Store original geometry if not already stored
          if (!obj.userData.originalGeometry) {
            storeOriginalGeometry(obj)
          }
          
          // Apply edge smoothing
          smoothEdges(obj, {
            intensity: edgeSmoothingIntensity,
            preserveUVs: true,
            angleThreshold: Math.PI / 6 // 30 degrees
          })
          
          // Force geometry update
          obj.geometry.computeBoundingBox()
          obj.geometry.computeBoundingSphere()
          
          appliedCount++
        } catch (error) {
          const errorMsg = `Error applying edge smoothing to ${obj.name || 'unnamed object'}: ${error instanceof Error ? error.message : String(error)}`
          console.error(`[EdgeEnhancement] ${errorMsg}`)
          errors.push(errorMsg)
        }
      } else {
        console.warn(`[EdgeEnhancement] Skipping non-mesh object: ${obj.name || 'unnamed'}, type: ${obj.type}`)
      }
    })

    // Add to undo stack
    if (appliedCount > 0) {
      addToUndoStack({
        type: 'edge-smoothing',
        objects: selectedSubObjects.map(obj => ({
          object: obj,
          originalGeometry: obj instanceof THREE.Mesh ? obj.userData.originalGeometry : null
        })),
        intensity: edgeSmoothingIntensity
      } as any)

      console.log(`[EdgeEnhancement] ✅ Applied edge smoothing to ${appliedCount} object(s) with intensity ${edgeSmoothingIntensity.toFixed(2)}`)
      
      if (errors.length > 0) {
        console.warn(`[EdgeEnhancement] ⚠️ ${errors.length} error(s) occurred:`, errors)
        alert(`Edge smoothing applied to ${appliedCount} object(s), but ${errors.length} error(s) occurred. Check console for details.`)
      }
    } else {
      console.warn(`[EdgeEnhancement] No objects were processed. Selected: ${selectedSubObjects.length}, but none were valid meshes.`)
      alert('No valid mesh objects found in selection. Please select mesh objects (primitives or model parts).')
    }
  }

  // Clear selection
  const handleClearSelection = () => {
    setSelectedSubObjects([])
    setHighlightedObjects(new Set())
  }

  if (!showEdgeEnhancementPanel) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className={`edge-enhancement-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="edge-enhancement-panel-header" onMouseDown={handleMouseDown}>
        <h3>🔷 Edge Enhancement</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleEdgeEnhancementPanel} title="Close panel">
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="edge-enhancement-panel-content">
          <div className="panel-section">
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '15px', lineHeight: '1.5' }}>
              Smooth sharp edges to create more photorealistic renders. Select parts of your model (like car doors, windows), primitives, or any mesh objects and apply edge smoothing with adjustable intensity.
            </p>
          </div>

        <div className="panel-section">
          <h4>Selection Mode</h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={subObjectSelectionMode}
              onChange={(e) => setSubObjectSelectionMode(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: '#ccc' }}>
              Enable Sub-Object Selection
            </span>
          </label>
          <small style={{ display: 'block', color: '#888', fontSize: '11px', marginTop: '5px', marginLeft: '26px' }}>
            {subObjectSelectionMode 
              ? 'Click on parts/child meshes, primitives, or any mesh objects in the scene to select them. Selected parts will be highlighted.'
              : 'Enable to select individual parts of models (e.g., car doors, windows), primitives, or any mesh objects.'
            }
          </small>
        </div>

        {subObjectSelectionMode && (
          <div className="panel-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4>Selected Objects</h4>
              {selectedSubObjects.length > 0 && (
                <button
                  onClick={handleClearSelection}
                  style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    background: 'rgba(255, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 0, 0, 0.4)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: '#ff6b6b'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            {selectedSubObjects.length === 0 ? (
              <div style={{ 
                padding: '15px', 
                background: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '4px',
                textAlign: 'center',
                color: '#888',
                fontSize: '12px'
              }}>
                No objects selected. Click on parts, primitives, or any mesh objects in the scene to select them.
              </div>
            ) : (
              <div style={{
                maxHeight: '150px',
                overflowY: 'auto',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '4px',
                padding: '8px'
              }}>
                {selectedSubObjects.map((obj, index) => (
                  <div
                    key={obj.id}
                    style={{
                      padding: '6px 8px',
                      marginBottom: '4px',
                      background: 'rgba(100, 150, 255, 0.1)',
                      borderRadius: '3px',
                      fontSize: '12px',
                      color: '#ccc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span>{obj.name || `Object ${index + 1}`}</span>
                    <button
                      onClick={() => {
                        const filtered = selectedSubObjects.filter(o => o.id !== obj.id)
                        setSelectedSubObjects(filtered)
                      }}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: 'rgba(255, 0, 0, 0.2)',
                        border: '1px solid rgba(255, 0, 0, 0.4)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        color: '#ff6b6b'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="panel-section">
          <h4>Edge Smoothing Intensity</h4>
          <div className="slider-container" style={{ marginBottom: '10px' }}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={edgeSmoothingIntensity}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value)
                trackSliderInteraction('Edge Smoothing Intensity', newValue, 'EdgeEnhancementPanel', () => {
                  setEdgeSmoothingIntensity(newValue)
                })
              }}
              className="slider"
              style={{ flex: 1 }}
            />
            <span className="slider-value" style={{ minWidth: '50px', textAlign: 'right' }}>
              {edgeSmoothingIntensity.toFixed(2)}
            </span>
          </div>
          <small style={{ display: 'block', color: '#888', fontSize: '11px', marginTop: '5px' }}>
            {edgeSmoothingIntensity < 0.3 
              ? 'Subtle smoothing - minimal changes'
              : edgeSmoothingIntensity < 0.7
              ? 'Moderate smoothing - balanced effect'
              : 'Strong smoothing - maximum softness'
            }
          </small>
        </div>

        <div className="panel-section">
          <button
            onClick={handleApplyEdgeSmoothing}
            disabled={selectedSubObjects.length === 0}
            className="button-primary"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              fontWeight: 'bold',
              marginBottom: '10px',
              opacity: selectedSubObjects.length === 0 ? 0.5 : 1,
              cursor: selectedSubObjects.length === 0 ? 'not-allowed' : 'pointer'
            }}
            title={selectedSubObjects.length === 0 ? 'Select at least one object first' : 'Apply edge smoothing to selected objects'}
          >
            ✨ Apply Edge Smoothing
          </button>
          {selectedSubObjects.length > 0 && (
            <small style={{ display: 'block', color: '#888', fontSize: '11px', textAlign: 'center' }}>
              Will smooth {selectedSubObjects.length} selected object{selectedSubObjects.length !== 1 ? 's' : ''}
            </small>
          )}
        </div>

        <div className="panel-section" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '15px' }}>
          <h4 style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>How it works</h4>
          <ul style={{ fontSize: '11px', color: '#aaa', lineHeight: '1.6', paddingLeft: '20px', margin: 0 }}>
            <li>Enable Sub-Object Selection mode</li>
            <li>Click on parts of your model, primitives, or any mesh objects in the 3D view</li>
            <li>Selected parts will be highlighted</li>
            <li>Adjust intensity slider (0 = sharp, 1 = very soft)</li>
            <li>Click "Apply Edge Smoothing" to process</li>
            <li>Textures and UVs are preserved automatically</li>
          </ul>
        </div>
      </div>
      )}
    </div>
  )
}

