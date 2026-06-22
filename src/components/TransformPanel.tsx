import { useEffect, useState, useRef } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer, syncProjectObjectTransformToStreetsGL, shouldSyncTransformToStreetsGL, getStreetsGLObjectId } from '../viewer/useViewer'
import NumberInput from './NumberInput'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { createTransformIconDataUrl } from '../utils/createTransformIcon'
import './TransformPanel.css'

// Cache the transform icon data URL
let transformIconDataUrl: string | null = null

export default function TransformPanel() {
  // Generate transform icon once
  if (!transformIconDataUrl) {
    transformIconDataUrl = createTransformIconDataUrl(64)
  }
  
  const { 
    selectedObject, 
    transformMode, 
    setTransformMode,
    pivotMode,
    setPivotMode,
    showMaterialPanel,
    setSelectedObject,
    showLightingPanel,
    showObjectsPanel,
    showRenderingQualityPanel,
    showCameraViewsPanel,
    showWeatherPanel,
    showOptimizationPanel,
    toggleTransformPanel,
    showBoundingBoxes,
    toggleBoundingBoxes,
    xButtonColor,
    xButtonSize,
    renderMode,
    streetsGLIframeOverlay,
    sceneRevision
  } = useAppStore()
  const { viewer } = useViewer()
  const isCityTransform = renderMode === 'city' && streetsGLIframeOverlay
  const streetsGLTransformSync = shouldSyncTransformToStreetsGL()
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 })
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 })
  const [scale, setScale] = useState({ x: 1, y: 1, z: 1 })
  const [isMinimized, setIsMinimized] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 340
  const stackingOffset = usePanelStacking({ panelId: 'transform', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'transform'
    }
  )
  const rightPanelsOpen = stackingOffset > 0

  // Update values from selected object
  useEffect(() => {
    if (!selectedObject) return
    if (!viewer && !isCityTransform) return

      const updateValues = () => {
      // City mode: read transform directly from proxy / registry object (no scene graph)
      if (isCityTransform) {
        selectedObject.updateMatrixWorld()
        const pos = selectedObject.position
        const rot = selectedObject.rotation
        const scl = selectedObject.scale
        setPosition({ x: pos.x, y: pos.y, z: pos.z })
        setRotation({
          x: THREE.MathUtils.radToDeg(rot.x),
          y: THREE.MathUtils.radToDeg(rot.y),
          z: THREE.MathUtils.radToDeg(rot.z)
        })
        setScale({ x: scl.x, y: scl.y, z: scl.z })
        return
      }

      if (!viewer) return

      // Find the pivot wrapper if it exists
      let target: THREE.Object3D | null = null
      let pivot: THREE.Object3D | null = null
      viewer.scene.traverse((obj) => {
        if (obj.userData.isPivotWrapper && obj.userData.originalModel === selectedObject) {
          target = obj
          pivot = obj
        }
      })

      const obj = target || selectedObject
      
      obj.updateMatrixWorld()
      const pos = obj.position
      const rot = obj.rotation
      
      // For scale, always read from the actual model (inside pivot), not the pivot wrapper
      // The pivot wrapper always has scale 1,1,1
      let scl: THREE.Vector3
      if (pivot) {
        // Get scale from the model inside the pivot
        selectedObject.updateMatrixWorld()
        scl = selectedObject.scale.clone()
      } else {
        scl = obj.scale
      }

      setPosition({ x: pos.x, y: pos.y, z: pos.z })
      setRotation({ 
        x: THREE.MathUtils.radToDeg(rot.x), 
        y: THREE.MathUtils.radToDeg(rot.y), 
        z: THREE.MathUtils.radToDeg(rot.z) 
      })
      setScale({ x: scl.x, y: scl.y, z: scl.z })
    }

    updateValues()

    // Scene viewer only — no transform gizmo in city/StreetsGL mode
    if (isCityTransform || !viewer?.transformControls) return

    const handleChange = () => {
      updateValues()
    }
    viewer.transformControls.addEventListener('change' as any, handleChange)

    return () => {
      viewer.transformControls?.removeEventListener('change' as any, handleChange)
    }
  }, [selectedObject, viewer, transformMode, isCityTransform, sceneRevision])

  const syncStreetsGLTransformIfNeeded = (obj: THREE.Object3D) => {
    if (shouldSyncTransformToStreetsGL() && getStreetsGLObjectId(obj)) {
      syncProjectObjectTransformToStreetsGL(obj)
    }
  }

  const updatePosition = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedObject) return

    if (isCityTransform) {
      selectedObject.position[axis] = value
      selectedObject.updateMatrixWorld()
      syncStreetsGLTransformIfNeeded(selectedObject)
      setPosition({ ...position, [axis]: value })
      return
    }

    if (!viewer) return

    // Find pivot wrapper
    let target: THREE.Object3D | null = null
    viewer.scene.traverse((obj) => {
      if (obj.userData.isPivotWrapper && obj.userData.originalModel === selectedObject) {
        target = obj
      }
    })

    const obj = target || selectedObject
    obj.position[axis] = value
    obj.updateMatrixWorld()

    // Update transform controls if attached
    const attachedObj = (viewer.transformControls as any)?.object as THREE.Object3D | undefined
    if (viewer.transformControls && attachedObj === obj) {
    }

    const newPos = { ...position, [axis]: value }
    setPosition(newPos)
    syncStreetsGLTransformIfNeeded(selectedObject)
  }

  const updateRotation = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedObject) return

    if (isCityTransform) {
      selectedObject.rotation[axis] = THREE.MathUtils.degToRad(value)
      selectedObject.updateMatrixWorld()
      syncStreetsGLTransformIfNeeded(selectedObject)
      setRotation({ ...rotation, [axis]: value })
      return
    }

    if (!viewer) return

    // Find pivot wrapper
    let target: THREE.Object3D | null = null
    viewer.scene.traverse((obj) => {
      if (obj.userData.isPivotWrapper && obj.userData.originalModel === selectedObject) {
        target = obj
      }
    })

    const obj = target || selectedObject
    obj.rotation[axis] = THREE.MathUtils.degToRad(value)
    obj.updateMatrixWorld()

    // Update transform controls if attached
    const attachedObj = (viewer.transformControls as any)?.object as THREE.Object3D | undefined
    if (viewer.transformControls && attachedObj === obj) {
    }

    const newRot = { ...rotation, [axis]: value }
    setRotation(newRot)
    syncStreetsGLTransformIfNeeded(selectedObject)
  }

  const updateScale = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedObject) return

    if (isCityTransform) {
      selectedObject.scale[axis] = Math.max(0.01, value)
      selectedObject.updateMatrixWorld()
      syncStreetsGLTransformIfNeeded(selectedObject)
      setScale({ ...scale, [axis]: value })
      return
    }

    if (!viewer) return

    // Find pivot wrapper
    let pivot: THREE.Object3D | null = null
    viewer.scene.traverse((obj) => {
      if (obj.userData.isPivotWrapper && obj.userData.originalModel === selectedObject) {
        pivot = obj
      }
    })

    // Always apply scale to the actual model, not the pivot wrapper
    // If there's a pivot, scale the model inside it. Otherwise, scale the selected object directly
    const modelToScale: THREE.Object3D = selectedObject as THREE.Object3D
    modelToScale.scale[axis] = Math.max(0.01, value) // Prevent zero or negative scale
    modelToScale.updateMatrixWorld()
    
    // If there's a pivot, update its position to stay centered after scaling
    if (pivot) {
      const pivotGroup = pivot as THREE.Group
      const pivotMode = pivotGroup.userData.pivotMode || 'center'
      
      // Store model's current world position (we want to preserve this)
      modelToScale.updateMatrixWorld()
      const modelWorldPos = new THREE.Vector3()
      modelToScale.getWorldPosition(modelWorldPos)
      
      // Recalculate bounding box after scaling
      const box = new THREE.Box3().setFromObject(modelToScale)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      
      // Determine new pivot world position based on mode
      let newPivotWorldPos: THREE.Vector3
      if (pivotMode === 'bottom') {
        newPivotWorldPos = new THREE.Vector3(center.x, center.y - size.y / 2, center.z)
      } else {
        newPivotWorldPos = center.clone()
      }
      
      // Get pivot's parent
      const pivotParent = pivotGroup.parent as THREE.Object3D | null
      
      // Convert new pivot world position to local position relative to pivot's parent
      let newPivotLocalPos: THREE.Vector3
      if (pivotParent) {
        pivotParent.updateMatrixWorld()
        const parentInverse = new THREE.Matrix4().copy(pivotParent.matrixWorld).invert()
        newPivotLocalPos = newPivotWorldPos.clone().applyMatrix4(parentInverse)
      } else {
        newPivotLocalPos = newPivotWorldPos.clone()
      }
      
      // Update pivot position
      pivotGroup.position.copy(newPivotLocalPos)
      pivotGroup.updateMatrixWorld()
      
      // Recalculate model's local position relative to new pivot position
      // Model should stay at the same world position
      const pivotInverse = new THREE.Matrix4().copy(pivotGroup.matrixWorld).invert()
      const newModelLocalPos = modelWorldPos.clone().applyMatrix4(pivotInverse)
      modelToScale.position.copy(newModelLocalPos)
      modelToScale.updateMatrixWorld()
      
      // Update transform controls if attached to pivot
      const attachedObj = (viewer.transformControls as any)?.object as THREE.Object3D | undefined
      if (viewer.transformControls && attachedObj === pivotGroup) {
      }
    } else {
      // Update transform controls if attached directly to model
      const attachedObj = (viewer.transformControls as any)?.object as THREE.Object3D | undefined
      if (viewer.transformControls && attachedObj === modelToScale) {
      }
    }

    const newScale = { ...scale, [axis]: value }
    setScale(newScale)
    syncStreetsGLTransformIfNeeded(selectedObject)
  }

  if (!selectedObject) return null
  
  const handleClose = () => {
    setSelectedObject(null)
    toggleTransformPanel()
  }

  return (
    <div
      ref={panelRef}
      className={`transform-panel${showMaterialPanel ? ' with-material-panel' : ''}${
        rightPanelsOpen ? ' with-right-panels' : ''
      }${dragging ? ' dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="transform-panel-header" onMouseDown={handleMouseDown}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img 
            src={transformIconDataUrl} 
            alt="Transform" 
            style={{ 
              width: '20px', 
              height: '20px', 
              display: 'block',
              flexShrink: 0
            }} 
          />
          <span>Transform</span>
        </h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button 
            onClick={handleClose}
            className="close-button"
            title="Close transform panel"
            style={{
              color: xButtonColor,
              fontSize: `${xButtonSize}px`,
              width: `${xButtonSize + 8}px`,
              height: `${xButtonSize + 8}px`
            }}
          >
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
      <>
      <div className="transform-quickbar">
        <div className="transform-quick-group">
          <span className="transform-quick-label">Pivot</span>
          <button
            className={`transform-quick-button ${pivotMode === 'center' ? 'active' : ''}`}
            onClick={() => setPivotMode('center')}
            title="Center pivot at object center"
          >
            Center
          </button>
          <button
            className={`transform-quick-button ${pivotMode === 'bottom' ? 'active' : ''}`}
            onClick={() => setPivotMode('bottom')}
            title="Center pivot at object bottom"
          >
            Bottom
          </button>
        </div>

        <div className="transform-quick-group">
          <span className="transform-quick-label">Gizmo</span>
          <button
            className={`transform-quick-button ${transformMode === 'translate' ? 'active' : ''}`}
            title="Move objects (T)"
            onClick={() => setTransformMode(transformMode === 'translate' ? null : 'translate')}
            disabled={!selectedObject}
          >
            ↕ Move
          </button>
          <button
            className={`transform-quick-button ${transformMode === 'rotate' ? 'active' : ''}`}
            title="Rotate objects (R)"
            onClick={() => setTransformMode(transformMode === 'rotate' ? null : 'rotate')}
            disabled={!selectedObject}
          >
            ↻ Rotate
          </button>
          <button
            className={`transform-quick-button ${transformMode === 'scale' ? 'active' : ''}`}
            title="Scale objects (S)"
            onClick={() => setTransformMode(transformMode === 'scale' ? null : 'scale')}
            disabled={!selectedObject}
          >
            ⤢ Scale
          </button>
        </div>

        <div className="transform-quick-group">
          <span className="transform-quick-label">Display</span>
          <button
            className={`transform-quick-button ${showBoundingBoxes ? 'active' : ''}`}
            title="Toggle bounding boxes"
            onClick={toggleBoundingBoxes}
          >
            BBox
          </button>
        </div>
      </div>
      
      <div className="transform-panel-content compact">
        <div className="transform-section">
          <h4>Position</h4>
          <div className="vector-inputs">
            <label>
              <span>X:</span>
              <NumberInput
                value={position.x}
                onChange={(value) => updatePosition('x', value)}
                step={0.1}
                decimals={3}
              />
            </label>
            <label>
              <span>Y:</span>
              <NumberInput
                value={position.y}
                onChange={(value) => updatePosition('y', value)}
                step={0.1}
                decimals={3}
              />
            </label>
            <label>
              <span>Z:</span>
              <NumberInput
                value={position.z}
                onChange={(value) => updatePosition('z', value)}
                step={0.1}
                decimals={3}
              />
            </label>
          </div>
        </div>

        <div className="transform-section dual">
          <div className="transform-subsection">
            <h4>Rotation (degrees)</h4>
            <div className="vector-inputs">
              <label>
                <span>X:</span>
                <NumberInput
                  value={rotation.x}
                  onChange={(value) => updateRotation('x', value)}
                  step={1}
                  decimals={1}
                />
              </label>
              <label>
                <span>Y:</span>
                <NumberInput
                  value={rotation.y}
                  onChange={(value) => updateRotation('y', value)}
                  step={1}
                  decimals={1}
                />
              </label>
              <label>
                <span>Z:</span>
                <NumberInput
                  value={rotation.z}
                  onChange={(value) => updateRotation('z', value)}
                  step={1}
                  decimals={1}
                />
              </label>
            </div>
          </div>

          <div className="transform-subsection">
            <h4>Scale</h4>
            <div className="vector-inputs">
              <label>
                <span>X:</span>
                <NumberInput
                  value={scale.x}
                  onChange={(value) => updateScale('x', value)}
                  step={0.1}
                  min={0.01}
                  decimals={2}
                />
              </label>
              <label>
                <span>Y:</span>
                <NumberInput
                  value={scale.y}
                  onChange={(value) => updateScale('y', value)}
                  step={0.1}
                  min={0.01}
                  decimals={2}
                />
              </label>
              <label>
                <span>Z:</span>
                <NumberInput
                  value={scale.z}
                  onChange={(value) => updateScale('z', value)}
                  step={0.1}
                  min={0.01}
                  decimals={2}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}

