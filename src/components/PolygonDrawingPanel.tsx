import { useState, useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './PolygonDrawingPanel.css'

interface PolygonPoint {
  position: THREE.Vector3
  normal: THREE.Vector3
}

interface SplineControlPoint {
  position: THREE.Vector3
  normal: THREE.Vector3
  index: number
}

export default function PolygonDrawingPanel() {
  const { 
    showPolygonDrawingPanel, 
    togglePolygonDrawingPanel,
    polygonDrawingEnabled,
    setPolygonDrawingEnabled,
    selectedObject,
    selectedMaterial,
    setSelectedObject,
    setTransformMode,
    addToUndoStack
  } = useAppStore()
  const { viewer } = useViewer()
  const panelRef = useRef<HTMLDivElement>(null)
  
  // Calculate stacking offset for left-side panels
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'polygonDrawing', anchor: 'left' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'left',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'polygonDrawing'
    }
  )

  const [drawingEnabled, setDrawingEnabled] = useState(false)
  const [snapToSurface, setSnapToSurface] = useState(true)
  const [lineColor, setLineColor] = useState('#ff0000')
  const [fillColor, setFillColor] = useState('#ff0000')
  const [lineThickness, setLineThickness] = useState(2)
  const [fillOpacity, setFillOpacity] = useState(0.5)
  const [lineType, setLineType] = useState<'solid' | 'dashed' | 'dotted'>('solid')
  const [useSpline, setUseSpline] = useState(false) // Spline mode toggle
  const [splineResolution, setSplineResolution] = useState(50) // Points per curve segment
  const [editingControlPoint, setEditingControlPoint] = useState<number | null>(null) // Currently dragged control point
  const [controlPointHelpers, setControlPointHelpers] = useState<THREE.Group[]>([]) // Visual helpers for control points
  
  const [currentPolygon, setCurrentPolygon] = useState<PolygonPoint[]>([])
  const [polygons, setPolygons] = useState<THREE.Group[]>([])
  const isDrawingRef = useRef(false)
  const previewPolygonRef = useRef<THREE.Group | null>(null)
  
  // Track selected polygon for editing
  const selectedPolygonRef = useRef<THREE.Group | null>(null)
  
  // Refs for control point dragging
  const draggingRef = useRef(false)
  const draggingPointIndexRef = useRef<number | null>(null)
  const dragStartPosRef = useRef<THREE.Vector3 | null>(null)
  
  // Check if selected object is a polygon
  const isSelectedPolygon = selectedObject?.userData?.isPolygon === true && selectedObject instanceof THREE.Group
  
  // Calculate responsive panel width
  const [panelWidth, setPanelWidth] = useState(380)
  const [isMinimized, setIsMinimized] = useState(false)
  
  useEffect(() => {
    const updateWidth = () => {
      const viewportWidth = window.innerWidth
      if (viewportWidth < 412) {
        setPanelWidth(Math.max(320, viewportWidth - 32))
      } else {
        setPanelWidth(380)
      }
    }
    
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Load selected polygon properties when polygon is selected
  useEffect(() => {
    if (isSelectedPolygon && selectedObject instanceof THREE.Group) {
      selectedPolygonRef.current = selectedObject
      
      // Find fill mesh and line to get current colors
      let fillMesh: THREE.Mesh | null = null
      let line: THREE.Line | null = null
      
      selectedObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.name === 'Polygon Fill') {
          fillMesh = obj
        } else if (obj instanceof THREE.Line && obj.name === 'Polygon Outline') {
          line = obj
        }
      })
      
      // Load fill color and opacity
      if (fillMesh !== null) {
        const fillMat = (fillMesh as THREE.Mesh).material
        // Check if material has color property
        if ('color' in fillMat && fillMat.color instanceof THREE.Color) {
          const color = fillMat.color
          const fillColorHex = `#${color.getHexString()}`
          setFillColor(fillColorHex)
        }
        // Load opacity if available
        if ('opacity' in fillMat && typeof fillMat.opacity === 'number') {
          setFillOpacity(fillMat.opacity)
        }
      }
      
      // Load line color, thickness, and type
      if (line !== null) {
        const lineObj = line as THREE.Line
        if (lineObj.material instanceof THREE.LineBasicMaterial) {
          const lineMat = lineObj.material
          const color = lineMat.color
          const lineColorHex = `#${color.getHexString()}`
          setLineColor(lineColorHex)
          setLineThickness(lineMat.linewidth || 2)
          setLineType('solid')
        } else if (lineObj.material instanceof THREE.LineDashedMaterial) {
          const lineMat = lineObj.material
          const color = lineMat.color
          const lineColorHex = `#${color.getHexString()}`
          setLineColor(lineColorHex)
          setLineThickness(lineMat.linewidth || 2)
          // Determine if dashed or dotted based on dash/gap ratio
          if (lineMat.gapSize > lineMat.dashSize) {
            setLineType('dotted')
          } else {
            setLineType('dashed')
          }
        }
      }
    } else {
      selectedPolygonRef.current = null
    }
  }, [isSelectedPolygon, selectedObject])

  // Update selected polygon when colors/settings change
  useEffect(() => {
    if (!isSelectedPolygon || !selectedPolygonRef.current || !viewer?.scene) return
    
    const polygonGroup = selectedPolygonRef.current
    
    // Find fill mesh and line
    let fillMesh: THREE.Mesh | null = null
    let line: THREE.Line | null = null
    
    polygonGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name === 'Polygon Fill') {
        fillMesh = obj
      } else if (obj instanceof THREE.Line && obj.name === 'Polygon Outline') {
        line = obj
      }
    })
    
    // Update fill material
    if (fillMesh !== null) {
      const meshObj = fillMesh as THREE.Mesh
      const mat = meshObj.material
      
      // If it's a BasicMaterial, update color and opacity
      if (mat instanceof THREE.MeshBasicMaterial) {
        mat.color.setHex(parseInt(fillColor.replace('#', ''), 16))
        mat.opacity = fillOpacity
        mat.needsUpdate = true
      } 
      // If it's a PBR material (Standard/Physical), update color if possible and always update opacity
      else if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        if ('color' in mat && mat.color instanceof THREE.Color) {
          mat.color.setHex(parseInt(fillColor.replace('#', ''), 16))
        }
        mat.opacity = fillOpacity
        mat.transparent = fillOpacity < 1.0
        mat.needsUpdate = true
      }
    }
    
    // Update line material
    if (line !== null) {
      const lineObj = line as THREE.Line
      const lineMat = lineObj.material as THREE.LineBasicMaterial | THREE.LineDashedMaterial
      const needsRecreate = 
        (lineType === 'dashed' || lineType === 'dotted') && !(lineMat instanceof THREE.LineDashedMaterial) ||
        (lineType === 'solid' && !(lineMat instanceof THREE.LineBasicMaterial))
      
      if (needsRecreate) {
        // Dispose old material
        lineMat.dispose()
        
        // Create new material
        let newLineMaterial: THREE.LineBasicMaterial | THREE.LineDashedMaterial
        if (lineType === 'dashed') {
          newLineMaterial = new THREE.LineDashedMaterial({
            color: lineColor,
            linewidth: lineThickness,
            dashSize: lineThickness * 2,
            gapSize: lineThickness
          })
          // computeLineDistances must be called after material is set, and geometry must be BufferGeometry
          const geom = lineObj.geometry as THREE.BufferGeometry
          if (geom && 'computeLineDistances' in geom && typeof (geom as any).computeLineDistances === 'function') {
            (geom as any).computeLineDistances()
          }
        } else if (lineType === 'dotted') {
          newLineMaterial = new THREE.LineDashedMaterial({
            color: lineColor,
            linewidth: lineThickness,
            dashSize: lineThickness,
            gapSize: lineThickness * 2
          })
          // computeLineDistances must be called after material is set, and geometry must be BufferGeometry
          const geom = lineObj.geometry as THREE.BufferGeometry
          if (geom && 'computeLineDistances' in geom && typeof (geom as any).computeLineDistances === 'function') {
            (geom as any).computeLineDistances()
          }
        } else {
          newLineMaterial = new THREE.LineBasicMaterial({
            color: lineColor,
            linewidth: lineThickness
          })
        }
        
        lineObj.material = newLineMaterial
      } else {
        // Just update properties
        if ('color' in lineMat) {
          lineMat.color.setHex(parseInt(lineColor.replace('#', ''), 16))
        }
        if ('linewidth' in lineMat) {
          (lineMat as THREE.LineBasicMaterial).linewidth = lineThickness
        }
        if (lineMat instanceof THREE.LineDashedMaterial) {
          if (lineType === 'dashed') {
            lineMat.dashSize = lineThickness * 2
            lineMat.gapSize = lineThickness
          } else if (lineType === 'dotted') {
            lineMat.dashSize = lineThickness
            lineMat.gapSize = lineThickness * 2
          }
          // computeLineDistances must be called on BufferGeometry instances only
          const geom = lineObj.geometry as THREE.BufferGeometry
          if (geom && 'computeLineDistances' in geom && typeof (geom as any).computeLineDistances === 'function') {
            (geom as any).computeLineDistances()
          }
        }
        lineMat.needsUpdate = true
      }
    }
  }, [isSelectedPolygon, lineColor, fillColor, lineThickness, fillOpacity, lineType, viewer])

  // Sync local drawing state with store
  useEffect(() => {
    if (drawingEnabled !== polygonDrawingEnabled) {
      setPolygonDrawingEnabled(drawingEnabled)
    }
  }, [drawingEnabled, polygonDrawingEnabled, setPolygonDrawingEnabled])

  // Update preview polygon in real-time as points are added
  useEffect(() => {
    if (!viewer?.scene) return

    // Remove old preview
    if (previewPolygonRef.current) {
      viewer.scene.remove(previewPolygonRef.current)
      previewPolygonRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose()
          } else if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => mat.dispose())
          }
        }
      })
      previewPolygonRef.current = null
    }

    // Don't create preview if no points or drawing disabled
    if (currentPolygon.length === 0 || !drawingEnabled) {
      return
    }

    // Create preview polygon group
    const previewGroup = new THREE.Group()
    previewGroup.name = 'Polygon Preview'
    previewGroup.userData.isPolygonPreview = true
    previewGroup.userData.isHelper = true

    // If we have at least 2 points, draw lines
    if (currentPolygon.length >= 2) {
      // Generate line points (spline or straight)
      let linePoints: THREE.Vector3[] = []
      
      if (useSpline && currentPolygon.length >= 3) {
        // Generate spline curve for outline
        const controlPoints = currentPolygon.map(p => p.position.clone())
        controlPoints.push(controlPoints[0]) // Close
        
        const spline = new THREE.CatmullRomCurve3(controlPoints, true)
        linePoints = spline.getPoints(splineResolution * currentPolygon.length)
      } else {
        // Straight lines
        linePoints = currentPolygon.map(p => p.position.clone())
        if (currentPolygon.length >= 3) {
          linePoints.push(currentPolygon[0].position.clone()) // Close the polygon
        }
      }

      // Create line material based on line type
      let lineMaterial: THREE.LineBasicMaterial | THREE.LineDashedMaterial
      if (lineType === 'dashed') {
        lineMaterial = new THREE.LineDashedMaterial({
          color: lineColor,
          linewidth: lineThickness,
          dashSize: lineThickness * 2,
          gapSize: lineThickness,
          transparent: true,
          opacity: 0.8
        })
      } else if (lineType === 'dotted') {
        lineMaterial = new THREE.LineDashedMaterial({
          color: lineColor,
          linewidth: lineThickness,
          dashSize: lineThickness,
          gapSize: lineThickness * 2,
          transparent: true,
          opacity: 0.8
        })
      } else {
        lineMaterial = new THREE.LineBasicMaterial({
          color: lineColor,
          linewidth: lineThickness,
          transparent: true,
          opacity: 0.8
        })
      }

      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints)
      if (lineType === 'dashed' || lineType === 'dotted') {
        // Only call computeLineDistances if the method exists (safety check)
        // Note: computeLineDistances is on Line, not BufferGeometry - we'll call it after creating the line
      }

      const line = new THREE.Line(lineGeometry, lineMaterial)
      line.name = 'Preview Outline'
      previewGroup.add(line)
    }

    // If we have at least 3 points, draw fill
    if (currentPolygon.length >= 3) {
      let fillPoints: THREE.Vector3[] = []
      let fillNormals: THREE.Vector3[] = []

      if (useSpline) {
        // Generate smooth spline points for fill
        const controlPoints = currentPolygon.map(p => p.position.clone())
        controlPoints.push(controlPoints[0]) // Close
        
        const spline = new THREE.CatmullRomCurve3(controlPoints, true)
        fillPoints = spline.getPoints(splineResolution * currentPolygon.length)
        
        // Interpolate normals along the spline
        const originalNormals = currentPolygon.map(p => p.normal.clone())
        originalNormals.push(originalNormals[0]) // Close
        
        fillNormals = fillPoints.map((point, i) => {
          const t = i / (fillPoints.length - 1)
          const segmentIndex = Math.floor(t * currentPolygon.length)
          const segmentT = (t * currentPolygon.length) - segmentIndex
          const normal0 = originalNormals[segmentIndex]
          const normal1 = originalNormals[(segmentIndex + 1) % originalNormals.length]
          return new THREE.Vector3().lerpVectors(normal0, normal1, segmentT).normalize()
        })
      } else {
        // Straight lines - use original points
        fillPoints = currentPolygon.map(p => p.position.clone())
        fillNormals = currentPolygon.map(p => p.normal.clone())
      }

      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(fillPoints.length * 3)
      const normals = new Float32Array(fillNormals.length * 3)
      
      fillPoints.forEach((point, i) => {
        positions[i * 3] = point.x
        positions[i * 3 + 1] = point.y
        positions[i * 3 + 2] = point.z
      })

      fillNormals.forEach((normal, i) => {
        normals[i * 3] = normal.x
        normals[i * 3 + 1] = normal.y
        normals[i * 3 + 2] = normal.z
      })

      // Create indices for triangle fan
      const indices: number[] = []
      for (let i = 1; i < fillPoints.length - 1; i++) {
        indices.push(0, i, i + 1)
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()

      const fillMaterial = new THREE.MeshBasicMaterial({
        color: fillColor,
        transparent: true,
        opacity: fillOpacity * 0.7, // Slightly more transparent for preview
        side: THREE.DoubleSide,
        depthWrite: false
      })

      const fillMesh = new THREE.Mesh(geometry, fillMaterial)
      fillMesh.name = 'Preview Fill'
      previewGroup.add(fillMesh)
    }

    // Add control point markers (larger for spline mode)
    currentPolygon.forEach((point, index) => {
      const markerSize = useSpline ? 0.08 : 0.05
      const markerGeometry = new THREE.SphereGeometry(markerSize, 8, 8)
      const markerColor = editingControlPoint === index ? '#ffff00' : lineColor // Yellow when editing
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.9
      })
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.copy(point.position)
      marker.name = `Control Point ${index}`
      marker.userData.isControlPoint = true
      marker.userData.controlPointIndex = index
      marker.userData.isPolygonPreview = true // Also mark as preview for exclusion from selection
      previewGroup.add(marker)
    })

    viewer.scene.add(previewGroup)
    previewPolygonRef.current = previewGroup

    return () => {
      if (previewPolygonRef.current && viewer?.scene) {
        viewer.scene.remove(previewPolygonRef.current)
        previewPolygonRef.current.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
            obj.geometry.dispose()
            if (obj.material instanceof THREE.Material) {
              obj.material.dispose()
            } else if (Array.isArray(obj.material)) {
              obj.material.forEach(mat => mat.dispose())
            }
          }
        })
        previewPolygonRef.current = null
      }
    }
  }, [currentPolygon, drawingEnabled, lineColor, fillColor, lineThickness, fillOpacity, lineType, useSpline, splineResolution, editingControlPoint, viewer])

  // Handle click on viewer canvas to draw polygon points
  useEffect(() => {
    if (!viewer || !drawingEnabled) return

    // No need to add separate click handler - ViewerCanvas will handle it
    // when polygonDrawingEnabled is true
  }, [viewer, drawingEnabled])
  
  // Handle polygon point addition when drawing is enabled and user clicks
  useEffect(() => {
    if (!viewer || !drawingEnabled) return

    const handlePolygonPoint = () => {
      // This will be called from ViewerCanvas when polygon drawing is enabled
      // We'll set up a global handler that ViewerCanvas can call
      const handleClick = (event: MouseEvent) => {
        if (!viewer.raycaster || !viewer.mouse) return

        // Update mouse position
        const rect = viewer.renderer.domElement.getBoundingClientRect()
        viewer.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        viewer.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        // Find selectable objects (excluding helpers and polygons)
        const selectableObjects: THREE.Object3D[] = []
        viewer.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && 
              !obj.userData.isHelper && 
              !obj.userData.isGridHelper && 
              !obj.userData.isAxesHelper &&
              !obj.userData.isLightGizmo &&
              !obj.userData.isShadowPlane &&
              !obj.userData.isGroundedSkybox &&
              !obj.userData.isPolygon &&
              !obj.userData.isControlPoint) {
            selectableObjects.push(obj)
          }
        })

        // Raycast to find intersection
        viewer.raycaster.setFromCamera(viewer.mouse, viewer.camera)
        const intersects = viewer.raycaster.intersectObjects(selectableObjects, true)

        if (intersects.length > 0) {
          const intersect = intersects[0]
          const point = intersect.point.clone()
          const normal = intersect.face?.normal.clone() || new THREE.Vector3(0, 1, 0)
          
          // Transform normal to world space if needed
          if (intersect.object instanceof THREE.Mesh) {
            normal.transformDirection(intersect.object.matrixWorld)
            normal.normalize()
          }

          // Add point to current polygon
          setCurrentPolygon(prev => {
            console.log(`[PolygonDrawingPanel] Added point ${prev.length + 1}:`, point)
            return [...prev, { position: point, normal }]
          })
        }
      }

      // Store handler globally so ViewerCanvas can call it
      ;(window as any).__polygonDrawingHandler = handleClick
      
      return () => {
        delete (window as any).__polygonDrawingHandler
      }
    }

    return handlePolygonPoint()
  }, [viewer, drawingEnabled])

  // Handle control point editing (click to select, drag to move)
  useEffect(() => {
    if (!viewer || !drawingEnabled || currentPolygon.length === 0) {
      // Cleanup: remove handlers and stop editing
      setEditingControlPoint(null)
      draggingRef.current = false
      draggingPointIndexRef.current = null
      dragStartPosRef.current = null
      delete (window as any).__startControlPointEdit
      delete (window as any).__updateControlPointDrag
      delete (window as any).__stopControlPointEdit
      return
    }

    // Handler to start editing a control point (called from ViewerCanvas on click)
    const startControlPointEdit = (index: number, worldPos: THREE.Vector3) => {
      if (index < 0 || index >= currentPolygon.length) return
      
      console.log(`[PolygonDrawingPanel] Starting edit of control point ${index}`)
      setEditingControlPoint(index)
      draggingPointIndexRef.current = index
      dragStartPosRef.current = worldPos.clone()
      // Note: dragging will start on mousedown (handled below)
    }

    // Handler to update control point position during drag
    const updateControlPointDrag = (event: MouseEvent) => {
      if (!draggingRef.current || draggingPointIndexRef.current === null || !viewer) return

      const index = draggingPointIndexRef.current
      if (index < 0 || index >= currentPolygon.length) return

      // Update mouse position
      const rect = viewer.renderer.domElement.getBoundingClientRect()
      viewer.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      viewer.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      // Find selectable objects for snapping
      const selectableObjects: THREE.Object3D[] = []
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && 
            !obj.userData.isHelper && 
            !obj.userData.isGridHelper && 
            !obj.userData.isAxesHelper &&
            !obj.userData.isLightGizmo &&
            !obj.userData.isShadowPlane &&
            !obj.userData.isGroundedSkybox &&
            !obj.userData.isPolygon &&
            !obj.userData.isControlPoint &&
            !obj.userData.isPolygonPreview) {
          selectableObjects.push(obj)
        }
      })

      // Raycast to find new position
      viewer.raycaster.setFromCamera(viewer.mouse, viewer.camera)
      const intersects = viewer.raycaster.intersectObjects(selectableObjects, true)

      if (intersects.length > 0) {
        const intersect = intersects[0]
        const newPoint = intersect.point.clone()
        const normal = intersect.face?.normal.clone() || new THREE.Vector3(0, 1, 0)
        
        // Transform normal to world space if needed
        if (intersect.object instanceof THREE.Mesh) {
          normal.transformDirection(intersect.object.matrixWorld)
          normal.normalize()
        }

        // Update the control point position
        setCurrentPolygon(prev => {
          const updated = [...prev]
          updated[index] = { position: newPoint, normal }
          return updated
        })
      }
    }

    // Handler to stop editing
    const stopControlPointEdit = () => {
      if (draggingPointIndexRef.current !== null) {
        console.log(`[PolygonDrawingPanel] Stopped edit of control point ${draggingPointIndexRef.current}`)
      }
      draggingRef.current = false
      draggingPointIndexRef.current = null
      dragStartPosRef.current = null
      setEditingControlPoint(null)
    }

    // Store handlers globally
    ;(window as any).__startControlPointEdit = startControlPointEdit
    ;(window as any).__updateControlPointDrag = updateControlPointDrag
    ;(window as any).__stopControlPointEdit = stopControlPointEdit

    // Handle mouse down to start dragging (after control point is clicked)
    const handleMouseDown = (event: MouseEvent) => {
      // Check if we're about to drag a control point that was just selected
      if (editingControlPoint !== null && !draggingRef.current) {
        // Verify we're clicking on the same control point
        if (!viewer || !viewer.raycaster || !viewer.mouse || !viewer.camera) return
        
        const rect = viewer.renderer.domElement.getBoundingClientRect()
        viewer.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        viewer.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        
        viewer.raycaster.setFromCamera(viewer.mouse, viewer.camera)
        
        // Check if clicking on a control point
        const allObjects: THREE.Object3D[] = []
        viewer.scene.traverse((obj) => {
          if (obj.userData.isControlPoint) {
            allObjects.push(obj)
          }
        })
        
        const controlPointIntersects = viewer.raycaster.intersectObjects(allObjects, false)
        
        if (controlPointIntersects.length > 0) {
          const clickedObj = controlPointIntersects[0].object
          if (clickedObj.userData.isControlPoint && 
              typeof clickedObj.userData.controlPointIndex === 'number' &&
              clickedObj.userData.controlPointIndex === editingControlPoint) {
            // Start dragging this control point
            draggingRef.current = true
            draggingPointIndexRef.current = editingControlPoint
            console.log(`[PolygonDrawingPanel] Started dragging control point ${editingControlPoint}`)
            event.preventDefault()
            event.stopPropagation()
          }
        }
      }
    }

    // Handle mouse move during drag
    const handleMouseMove = (event: MouseEvent) => {
      if (draggingRef.current && editingControlPoint !== null) {
        updateControlPointDrag(event)
      }
    }

    // Handle mouse up to stop dragging
    const handleMouseUp = () => {
      if (draggingRef.current) {
        stopControlPointEdit()
      }
    }

    // Add event listeners
    const canvas = viewer.renderer.domElement
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseUp) // Stop dragging when mouse leaves canvas

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseUp)
      delete (window as any).__startControlPointEdit
      delete (window as any).__updateControlPointDrag
      delete (window as any).__stopControlPointEdit
    }
  }, [viewer, drawingEnabled, currentPolygon, editingControlPoint])

  // Create polygon from points
  const createPolygon = useCallback(() => {
    if (currentPolygon.length < 3) {
      console.warn('Polygon needs at least 3 points')
      return
    }

    if (!viewer?.scene) return

    const group = new THREE.Group()
    group.name = `Polygon ${Date.now()}`
    group.userData.isPolygon = true

    // Generate polygon points (spline or straight lines)
    let fillPoints: THREE.Vector3[] = []
    let fillNormals: THREE.Vector3[] = []

    if (useSpline && currentPolygon.length >= 3) {
      // Generate smooth spline points for fill
      const controlPoints = currentPolygon.map(p => p.position.clone())
      controlPoints.push(controlPoints[0]) // Close
      
      const spline = new THREE.CatmullRomCurve3(controlPoints, true)
      fillPoints = spline.getPoints(splineResolution * currentPolygon.length)
      
      // Interpolate normals along the spline
      const originalNormals = currentPolygon.map(p => p.normal.clone())
      originalNormals.push(originalNormals[0]) // Close
      
      fillNormals = fillPoints.map((point, i) => {
        const t = i / (fillPoints.length - 1)
        const segmentIndex = Math.floor(t * currentPolygon.length)
        const segmentT = (t * currentPolygon.length) - segmentIndex
        const normal0 = originalNormals[segmentIndex]
        const normal1 = originalNormals[(segmentIndex + 1) % originalNormals.length]
        return new THREE.Vector3().lerpVectors(normal0, normal1, segmentT).normalize()
      })
    } else {
      // Straight lines - use original points
      fillPoints = currentPolygon.map(p => p.position.clone())
      fillNormals = currentPolygon.map(p => p.normal.clone())
    }

    // Create geometry from points
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(fillPoints.length * 3)
    const normals = new Float32Array(fillNormals.length * 3)
    
    fillPoints.forEach((point, i) => {
      positions[i * 3] = point.x
      positions[i * 3 + 1] = point.y
      positions[i * 3 + 2] = point.z
    })

    fillNormals.forEach((normal, i) => {
      normals[i * 3] = normal.x
      normals[i * 3 + 1] = normal.y
      normals[i * 3 + 2] = normal.z
    })

    // Create indices for triangle fan
    const indices: number[] = []
    for (let i = 1; i < fillPoints.length - 1; i++) {
      indices.push(0, i, i + 1)
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    // Create fill material
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: fillOpacity,
      side: THREE.DoubleSide,
      depthWrite: false
    })

    const fillMesh = new THREE.Mesh(geometry, fillMaterial)
    fillMesh.name = 'Polygon Fill'
    group.add(fillMesh)

    // Create line material based on line type
    let lineMaterial: THREE.LineBasicMaterial | THREE.LineDashedMaterial
    if (lineType === 'dashed') {
      lineMaterial = new THREE.LineDashedMaterial({
        color: lineColor,
        linewidth: lineThickness,
        dashSize: lineThickness * 2,
        gapSize: lineThickness
      })
    } else if (lineType === 'dotted') {
      lineMaterial = new THREE.LineDashedMaterial({
        color: lineColor,
        linewidth: lineThickness,
        dashSize: lineThickness,
        gapSize: lineThickness * 2
      })
    } else {
      lineMaterial = new THREE.LineBasicMaterial({
        color: lineColor,
        linewidth: lineThickness
      })
    }

    // Create closed line (spline or straight)
    let linePoints: THREE.Vector3[] = []
    
    if (useSpline && currentPolygon.length >= 3) {
      // Generate spline curve for outline
      const controlPoints = currentPolygon.map(p => p.position.clone())
      controlPoints.push(controlPoints[0]) // Close
      
      const spline = new THREE.CatmullRomCurve3(controlPoints, true)
      linePoints = spline.getPoints(splineResolution * currentPolygon.length)
    } else {
      // Straight lines
      linePoints = [...currentPolygon.map(p => p.position), currentPolygon[0].position]
    }
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints)
    
    const line = new THREE.Line(lineGeometry, lineMaterial)
    line.name = 'Polygon Outline'
    
    // computeLineDistances must be called on Line object for dashed materials to work
    if (lineType === 'dashed' || lineType === 'dotted') {
      line.computeLineDistances()
    }
    
    group.add(line)

    // Mark as model for selection/transformation
    group.userData.isModel = true
    group.userData.isImportedModel = true

    viewer.scene.add(group)
    setPolygons(prev => [...prev, group])

    // Add to undo stack
    addToUndoStack({
      type: 'delete',
      object: group,
      parent: viewer.scene
    })

    // Clear current polygon
    setCurrentPolygon([])

    console.log(`[PolygonDrawingPanel] ✅ Created polygon with ${currentPolygon.length} control points${useSpline ? `, ${fillPoints.length} spline points` : ''}`)
  }, [currentPolygon, fillColor, fillOpacity, lineColor, lineThickness, lineType, useSpline, splineResolution, viewer, addToUndoStack])

  // Finish polygon (double-click or button)
  const finishPolygon = useCallback(() => {
    if (currentPolygon.length >= 3) {
      createPolygon()
    }
    setCurrentPolygon([])
  }, [currentPolygon, createPolygon])

  // Clear current polygon
  const clearPolygon = useCallback(() => {
    setCurrentPolygon([])
    // Preview will be removed by useEffect cleanup
  }, [])

  // Delete all polygons
  const deleteAllPolygons = useCallback(() => {
    if (!viewer?.scene) return
    
    polygons.forEach(polygon => {
      viewer.scene.remove(polygon)
      polygon.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose()
          } else if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => mat.dispose())
          }
        }
      })
    })
    setPolygons([])
    setCurrentPolygon([])
    // Preview will be removed by useEffect cleanup
  }, [polygons, viewer])

  if (!showPolygonDrawingPanel) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className={`polygon-drawing-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`,
        maxWidth: `${panelWidth}px`,
        width: `${panelWidth}px`
      }}
    >
      <div className="polygon-drawing-panel-header" onMouseDown={handleMouseDown}>
        <h3>Polygon Drawing</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="minimize-button"
            title={isMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            {isMinimized ? '□' : '−'}
          </button>
        <button className="close-button" onClick={togglePolygonDrawingPanel} title="Close panel">
          ×
        </button>
        </div>
      </div>

      {!isMinimized && (
      <div className="polygon-drawing-panel-content">
        <div className="drawing-controls">
          <button
            onClick={() => setDrawingEnabled(!drawingEnabled)}
            className={`drawing-toggle-button ${drawingEnabled ? 'active' : ''}`}
          >
            <span className="button-icon">{drawingEnabled ? '✓' : '○'}</span>
            <span className="button-text">
              {drawingEnabled ? 'Drawing Enabled' : 'Drawing Disabled'}
            </span>
          </button>

          {drawingEnabled && (
            <div className="drawing-status">
              <div className="status-header">
                <span className="status-icon">📝</span>
                <span className="status-title">Drawing Mode Active</span>
              </div>
              <div className="status-info">
                <p>• Click on 3D objects to add points</p>
                <p>• Need at least 3 points to create polygon</p>
              </div>
              <div className="points-counter">
                <span className="points-label">Points:</span>
                <span className="points-value">{currentPolygon.length}</span>
              </div>
            </div>
          )}

          {currentPolygon.length > 0 && (
            <div className="polygon-actions">
              <button
                onClick={finishPolygon}
                disabled={currentPolygon.length < 3}
                className="finish-button"
              >
                <span className="button-icon">✓</span>
                <span className="button-text">Finish Polygon ({currentPolygon.length} points)</span>
              </button>
              <button
                onClick={clearPolygon}
                className="clear-button"
              >
                <span className="button-icon">×</span>
                <span className="button-text">Clear</span>
              </button>
            </div>
          )}

          {polygons.length > 0 && (
            <button
              onClick={deleteAllPolygons}
              className="delete-all-button"
            >
              <span className="button-icon">🗑️</span>
              <span className="button-text">Delete All Polygons ({polygons.length})</span>
            </button>
          )}
        </div>

        {isSelectedPolygon && (
          <div className="polygon-editing-section">
            <h4>Edit Selected Polygon</h4>
            <p className="editing-hint">Selected: {selectedObject?.name || 'Polygon'}</p>
          </div>
        )}

        <div className="polygon-settings">
          <h4>{isSelectedPolygon ? 'Polygon Properties' : 'Settings'}</h4>

          {!isSelectedPolygon && (
            <>
              <label>
                <span>Snap to Surface</span>
                <input
                  type="checkbox"
                  checked={snapToSurface}
                  onChange={(e) => setSnapToSurface(e.target.checked)}
                />
              </label>

              <label>
                <span>Use Spline Curves</span>
                <input
                  type="checkbox"
                  checked={useSpline}
                  onChange={(e) => setUseSpline(e.target.checked)}
                />
                <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                  {useSpline 
                    ? 'Curves between control points for smooth polygons' 
                    : 'Straight lines between points'}
                </small>
              </label>

              {useSpline && (
                <label>
                  <span>Spline Resolution</span>
                  <div className="slider-container">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      value={splineResolution}
                      onChange={(e) => setSplineResolution(parseInt(e.target.value))}
                      className="slider"
                    />
                    <span className="slider-value">{splineResolution} pts/segment</span>
                  </div>
                  <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                    Higher = smoother curves (more geometry)
                  </small>
                </label>
              )}
            </>
          )}

          <label>
            <span>Line Color</span>
            <div className="color-input-group">
              <input
                type="color"
                value={lineColor}
                onChange={(e) => setLineColor(e.target.value)}
                className="color-picker"
              />
              <input
                type="text"
                value={lineColor}
                onChange={(e) => setLineColor(e.target.value)}
                className="color-text-input"
              />
            </div>
          </label>

          <label>
            <span>Fill Color</span>
            <div className="color-input-group">
              <input
                type="color"
                value={fillColor}
                onChange={(e) => setFillColor(e.target.value)}
                className="color-picker"
              />
              <input
                type="text"
                value={fillColor}
                onChange={(e) => setFillColor(e.target.value)}
                className="color-text-input"
              />
            </div>
          </label>

          <label>
            <span>Line Thickness</span>
            <div className="slider-container">
              <input
                type="range"
                min="1"
                max="10"
                value={lineThickness}
                onChange={(e) => setLineThickness(parseInt(e.target.value))}
                className="slider"
              />
              <span className="slider-value">{lineThickness}px</span>
            </div>
          </label>

          <label>
            <span>Fill Opacity</span>
            <div className="slider-container">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={fillOpacity}
                onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                className="slider"
              />
              <span className="slider-value">{(fillOpacity * 100).toFixed(0)}%</span>
            </div>
          </label>

          <label>
            <span>Line Type</span>
            <select value={lineType} onChange={(e) => setLineType(e.target.value as any)}>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>

          {isSelectedPolygon && selectedMaterial && (
            <div className="material-application">
              <label>
                <span>Apply Material</span>
                <button
                  onClick={() => {
                    if (!selectedPolygonRef.current || !selectedMaterial) return
                    
                    const polygonGroup = selectedPolygonRef.current
                    
                    // Find fill mesh
                    polygonGroup.traverse((obj) => {
                      if (obj instanceof THREE.Mesh && obj.name === 'Polygon Fill') {
                        // Clone the selected material
                        const clonedMaterial = selectedMaterial.material.clone()
                        
                        // Preserve polygon-specific properties
                        if (clonedMaterial instanceof THREE.MeshBasicMaterial || 
                            clonedMaterial instanceof THREE.MeshStandardMaterial) {
                          clonedMaterial.transparent = true
                          clonedMaterial.opacity = fillOpacity
                          clonedMaterial.side = THREE.DoubleSide
                          clonedMaterial.depthWrite = false
                          
                          // If it's a MeshStandardMaterial, convert from BasicMaterial properties
                          if (!(clonedMaterial instanceof THREE.MeshBasicMaterial)) {
                            // Material already has PBR properties, keep them
                          }
                        }
                        
                        // Save previous material for undo
                        const previousMaterial = obj.material.clone()
                        
                        // Apply new material
                        obj.material = clonedMaterial
                        obj.material.needsUpdate = true
                        
                        // Add to undo stack
                        addToUndoStack({
                          type: 'material-change',
                          mesh: obj,
                          previousMaterial,
                          newMaterial: clonedMaterial
                        } as any)
                      }
                    })
                  }}
                  className="apply-material-button"
                >
                  <span className="button-icon">🎨</span>
                  <span className="button-text">Apply Selected Material</span>
                </button>
              </label>
              <p className="material-hint">
                Material: {selectedMaterial.mesh.name || 'Unnamed'} - {selectedMaterial.material.type}
              </p>
            </div>
          )}
        </div>

        {!drawingEnabled && (
          <div className="polygon-note">
            <p>💡 Enable drawing mode, then click on 3D objects to add polygon points. Each click adds a point that snaps to the surface. Create polygons with at least 3 points.</p>
          </div>
        )}
      </div>
      )}
    </div>
  )
}