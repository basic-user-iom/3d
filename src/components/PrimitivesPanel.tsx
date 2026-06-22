import { useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { loadTexture } from '../viewer/loaders/textureLoader'
import { positionModelOnGround } from '../viewer/useViewer'
import { descriptorFromMesh } from '../viewer/objectRegistry'
import './PrimitivesPanel.css'

type PrimitiveType = 'box' | 'sphere' | 'plane' | 'cone' | 'cylinder' | 'torus' | 'tetrahedron' | 'octahedron'

export default function PrimitivesPanel() {
  const { 
    showPrimitivesPanel, 
    togglePrimitivesPanel,
    setSelectedObject,
    setTransformMode,
    openTransformPanelForSelection,
    addToUndoStack,
    faceEditMode,
    setFaceEditMode,
    faceEditSnapIncrement,
    faceEditSnapCoarseIncrement,
    faceEditSmoothing,
    faceEditDragSpeed,
    setFaceEditSnapIncrement,
    setFaceEditSnapCoarseIncrement,
    setFaceEditSmoothing,
    setFaceEditDragSpeed,
    selectedObject,
    streetsGLIframeOverlay,
    renderMode,
    streetsGLBridge,
    addProjectObject,
    updateProjectObject
  } = useAppStore()
  const { viewer } = useViewer()
  const panelRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate stacking offset for left-side panels
  const PANEL_WIDTH = 360
  const stackingOffset = usePanelStacking({ panelId: 'primitives', anchor: 'left' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'left',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'primitives'
    }
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [selectedType, setSelectedType] = useState<PrimitiveType>('box')
  const [textureFile, setTextureFile] = useState<File | null>(null)
  const [scale, setScale] = useState({ x: 1, y: 1, z: 1 })
  const [isMinimized, setIsMinimized] = useState(false)

  const createPrimitive = useCallback(async () => {
    // NOTE: We intentionally do NOT early-return when there is no Three.js scene.
    // The project-object registry is the source of truth, so an "add" must always
    // write a descriptor (this is what makes adding work in city mode). The scene is
    // just one render target and is reconciled below only when it exists.

    let geometry: THREE.BufferGeometry
    // Use red for box so it's obvious in Streets GL; other primitives stay gray
    const boxColor = selectedType === 'box' ? 0xff0000 : 0x888888
    let material = new THREE.MeshStandardMaterial({ color: boxColor })

    // Create geometry based on selected type
    switch (selectedType) {
      case 'box':
        geometry = new THREE.BoxGeometry(scale.x, scale.y, scale.z)
        break
      case 'sphere':
        geometry = new THREE.SphereGeometry(scale.x / 2, 32, 32)
        break
      case 'plane':
        geometry = new THREE.PlaneGeometry(scale.x, scale.y)
        break
      case 'cone':
        geometry = new THREE.ConeGeometry(scale.x / 2, scale.y, 32)
        break
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(scale.x / 2, scale.x / 2, scale.y, 32)
        break
      case 'torus':
        geometry = new THREE.TorusGeometry(scale.x / 2, scale.y / 4, 16, 100)
        break
      case 'tetrahedron':
        geometry = new THREE.TetrahedronGeometry(scale.x / 2)
        break
      case 'octahedron':
        geometry = new THREE.OctahedronGeometry(scale.x / 2)
        break
      default:
        geometry = new THREE.BoxGeometry(scale.x, scale.y, scale.z)
        break
    }

    // Set double-sided for planes (textures visible from both sides)
    if (selectedType === 'plane') {
      material.side = THREE.DoubleSide
    }

    // Load texture if provided
    if (textureFile) {
      try {
        const texture = await loadTexture(textureFile)
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        material.map = texture
        material.needsUpdate = true
      } catch (error) {
        console.error('Failed to load texture:', error)
      }
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} ${Date.now()}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    
    // CRITICAL: Mark as model so it works like imported models:
    // - Selectable (click/double-click)
    // - Draggable (transform controls)
    // - Scalable (transform controls)
    // - Appears in ObjectsPanel
    // - Works with undo/redo
    mesh.userData.isModel = true
    mesh.userData.isImportedModel = true // Also mark as imported for ObjectsPanel compatibility
    mesh.userData.isPrimitive = true // Keep primitive flag for identification
    mesh.userData.primitiveType = selectedType

    // Reserve a stable, app-owned id up front. This same id is used as:
    //   - the ProjectObject.id (registry source of truth)
    //   - the Streets GL object id (so the two views agree and sync de-dupes)
    //   - userData.projectObjectId (so the scene mesh maps back to its descriptor)
    const objectId = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId

    // Position in front of camera (only meaningful when a Three.js scene/camera exists)
    if (viewer?.camera) {
      const direction = new THREE.Vector3()
      viewer.camera.getWorldDirection(direction)
      mesh.position.copy(viewer.camera.position).add(direction.multiplyScalar(5))
      mesh.position.y = Math.max(0, mesh.position.y - 2) // Keep above ground
    }

    // RENDER TARGET 1 (Three.js scene): only when a live scene exists (product/hybrid).
    if (viewer?.scene) {
      viewer.scene.add(mesh)

      // Save to undo stack (undo operates on the live THREE.Object3D)
      addToUndoStack({
        type: 'delete',
        object: mesh,
        parent: viewer.scene
      })

      // Select the new object
      setSelectedObject(mesh)
      setTransformMode('translate')
    } else if (streetsGLIframeOverlay) {
      // City mode: no Three.js scene, but select the mesh for TransformPanel + open transform
      setSelectedObject(mesh)
      if (renderMode === 'city') {
        openTransformPanelForSelection('translate')
      } else {
        setTransformMode('translate')
      }
    }

    // SOURCE OF TRUTH: always register the descriptor so the object exists in the
    // project regardless of which renderer is currently live. In city mode there is no
    // scene, so this is the only thing that records the add (and feeds the object tree).
    addProjectObject(
      descriptorFromMesh(mesh, {
        id: objectId,
        kind: 'primitive',
        primitiveType: selectedType,
        color: boxColor,
        primitiveScale: { x: scale.x, y: scale.y, z: scale.z },
        // Mark whether this object is (going to be) reflected in Streets GL so the
        // mode-switch reconciler doesn't re-add it when entering city mode.
        extraUserData: streetsGLIframeOverlay ? { streetsGLAdded: true } : {}
      })
    )

    console.log('[PrimitivesPanel] Created primitive:', { type: selectedType, name: mesh.name, id: objectId })

    // If the Streets GL overlay is enabled, position and sync the primitive to Streets GL.
    // positionModelOnGround is the SINGLE owner of the initial Streets GL sync + framing:
    // it computes the ground placement, syncs the primitive (queuing if the bridge isn't
    // ready yet and flushing on ready), and frames it. Previously we also synced here, which
    // raced with positionModelOnGround and produced duplicate cubes. If the bridge isn't
    // created yet, the iframe overlay's onReady handler re-syncs existing models (including
    // primitives), so the object is still added once the bridge becomes ready.
    if (streetsGLIframeOverlay) {
      setTimeout(() => {
        positionModelOnGround(mesh, true)
        if (!streetsGLBridge) {
          console.warn('[PrimitivesPanel] ⚠️ Streets GL bridge not initialized yet; primitive will sync once the bridge is ready.', {
            name: mesh.name
          })
        }
        // positionModelOnGround computes the ground placement + GPS asynchronously.
        // Mirror the resolved coordinates back into the registry descriptor so the
        // object tree (city mode) and focus-by-id have accurate lat/lon.
        setTimeout(() => {
          const ud = mesh.userData as any
          const gps =
            typeof ud.gpsLat === 'number' && typeof ud.gpsLon === 'number'
              ? { lat: ud.gpsLat as number, lon: ud.gpsLon as number }
              : undefined
          updateProjectObject(objectId, {
            gps,
            streetsGLObjectId: ud.streetsGLObjectId || objectId,
            transform: {
              position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
              rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
              scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
            },
            userData: {
              streetsGLAdded: true,
              streetsGLPosition: ud.streetsGLPosition,
              streetsGLBaseTransform: ud.streetsGLBaseTransform
            }
          })
        }, 2500)
      }, 100)
    }
  }, [viewer, selectedType, scale, textureFile, setSelectedObject, setTransformMode, addToUndoStack, streetsGLIframeOverlay, streetsGLBridge, addProjectObject, updateProjectObject])

  const handleTextureUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setTextureFile(file)
    }
  }, [])

  const handleRemoveTexture = useCallback(() => {
    setTextureFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  if (!showPrimitivesPanel) {
    return null
  }

  const primitives: Array<{ type: PrimitiveType; label: string }> = [
    { type: 'box', label: 'Box' },
    { type: 'sphere', label: 'Sphere' },
    { type: 'plane', label: 'Plane' },
    { type: 'cone', label: 'Cone' },
    { type: 'cylinder', label: 'Cylinder' },
    { type: 'torus', label: 'Torus' },
    { type: 'tetrahedron', label: 'Tetrahedron' },
    { type: 'octahedron', label: 'Octahedron' }
  ]

  return (
    <div
      ref={panelRef}
      className={`primitives-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="primitives-panel-header" onMouseDown={handleMouseDown}>
        <h3>Primitive Objects</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="minimize-button"
            title={isMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            {isMinimized ? '□' : '−'}
          </button>
        <button className="close-button" onClick={togglePrimitivesPanel} title="Close panel">
          ×
        </button>
        </div>
      </div>

      {!isMinimized && (
      <div className="primitives-panel-content">
        <div className="primitives-section">
          <h4>Primitive Type</h4>
          <div className="primitives-grid">
            {primitives.map((prim) => (
              <button
                key={prim.type}
                className={`primitive-button ${selectedType === prim.type ? 'active' : ''}`}
                onClick={() => setSelectedType(prim.type)}
                title={prim.label}
              >
                <div className={`primitive-icon primitive-icon-${prim.type}`}></div>
                <span className="primitive-label">{prim.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="scale-section">
          <h4>Scale</h4>
          <div className="scale-inputs">
            <label>
              <span>X</span>
              <input
                type="number"
                value={scale.x}
                onChange={(e) => setScale({ ...scale, x: parseFloat(e.target.value) || 1 })}
                step="0.1"
                min="0.1"
              />
            </label>
            <label>
              <span>Y</span>
              <input
                type="number"
                value={scale.y}
                onChange={(e) => setScale({ ...scale, y: parseFloat(e.target.value) || 1 })}
                step="0.1"
                min="0.1"
              />
            </label>
            <label>
              <span>Z</span>
              <input
                type="number"
                value={scale.z}
                onChange={(e) => setScale({ ...scale, z: parseFloat(e.target.value) || 1 })}
                step="0.1"
                min="0.1"
              />
            </label>
          </div>
        </div>

        <div className="texture-section">
          <h4>Texture (Optional)</h4>
          <div className="texture-controls">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleTextureUpload}
              accept="image/*,.hdr,.exr"
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="upload-button"
            >
              {textureFile ? `📄 ${textureFile.name}` : '📄 Upload Texture'}
            </button>
            {textureFile && (
              <button onClick={handleRemoveTexture} className="remove-button">
                ×
              </button>
            )}
          </div>
        </div>

        <button
          onClick={createPrimitive}
          className="create-button"
        >
          Create {primitives.find(p => p.type === selectedType)?.label}
        </button>

        {/* Face Edit Mode - SketchUp style push/pull */}
        <div className="face-edit-section" style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <h4 style={{ color: '#fff' }}>Face Editing (Push/Pull)</h4>
          <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>
            Enable to drag faces of primitives to extrude them (like SketchUp). Select a primitive, then click and drag a face.
          </p>
          <p style={{ fontSize: '12px', color: '#ffcc66', marginBottom: '10px' }}>
            Current face push/pull configuration is stable for multi-axis edits.
          </p>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setFaceEditMode(!faceEditMode)
            }}
            disabled={!selectedObject || !selectedObject.userData?.isPrimitive}
            className={faceEditMode ? "button-primary" : "button-secondary"}
            style={{ 
              width: '100%', 
              backgroundColor: faceEditMode ? '#ff6b35' : undefined,
              borderColor: faceEditMode ? '#ff6b35' : undefined,
              opacity: (!selectedObject || !selectedObject.userData?.isPrimitive) ? 0.5 : 1,
              cursor: (!selectedObject || !selectedObject.userData?.isPrimitive) ? 'not-allowed' : 'pointer'
            }}
            title={(!selectedObject || !selectedObject.userData?.isPrimitive) ? 'Select a primitive first' : faceEditMode ? 'Face edit mode active - Click on faces to drag/extrude' : 'Enable face edit mode'}
          >
            {faceEditMode ? '🔧 Face Edit Active - Click to Deactivate' : '🔧 Face Edit Mode - Click to Activate'}
          </button>
          {faceEditMode && (
            <div style={{ fontSize: '12px', color: '#ff6b35', marginTop: '5px' }}>
              ✓ Face edit active - Click on a face of the selected primitive and drag to extrude
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#ccc' }}>
              Snap (Shift)
              <input
                type="number"
                step="0.01"
                min="0"
                value={faceEditSnapIncrement}
                onChange={(e) => setFaceEditSnapIncrement(Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#ccc' }}>
              Coarse Snap (Alt)
              <input
                type="number"
                step="0.01"
                min="0"
                value={faceEditSnapCoarseIncrement}
                onChange={(e) => setFaceEditSnapCoarseIncrement(Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
            <label style={{ fontSize: '12px', color: '#ccc' }}>
              Drag smoothing (0 = off, 1 = very smooth)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={faceEditSmoothing}
              onChange={(e) => setFaceEditSmoothing(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
            <label style={{ fontSize: '12px', color: '#ccc' }}>
              Drag sensitivity (lower = slower)
            </label>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={faceEditDragSpeed}
              onChange={(e) => setFaceEditDragSpeed(Math.max(0.05, parseFloat(e.target.value) || 0.05))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              Exact distance (meters)
              <input
                type="number"
                step="0.001"
                placeholder="e.g. 0.25 for 25 cm"
                id="face-edit-exact-distance"
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '11px', color: '#888' }}>
                Tip: 10 mm = 0.01, 1 cm = 0.01, 1 m = 1.0
              </span>
            </label>
            <button
              className="button-secondary"
              onClick={(e) => {
                e.preventDefault()
                const input = document.getElementById('face-edit-exact-distance') as HTMLInputElement | null
                if (!input) return
                const value = parseFloat(input.value)
                if (Number.isFinite(value)) {
                  const apply = (window as any).__applyFaceEditDistance as ((distance: number) => void) | undefined
                  if (apply) {
                    apply(value)
                  } else {
                    console.warn('[FaceEdit] Apply distance is not available (activate face edit and select a face).')
                  }
                }
              }}
              style={{ height: '100%' }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

