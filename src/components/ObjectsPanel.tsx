import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer, getStreetsGLObjectId } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { convertToInstancedMesh, convertAllDuplicatesToInstances, groupObjectsByGeometry } from '../utils/objectInstancing'
import { streetsGLToLatLon } from '../utils/mapCoordinates'
import { disposeSplatOverlay } from '../viewer/loaders/disposeSplatOverlay'
import { removeCachedImportedModelScene, getCachedImportedModelScene } from '../viewer/importedModelCache'
import './ObjectsPanel.css'

interface SceneNode {
  object: THREE.Object3D
  name: string
  type: string
  visible: boolean
  children: SceneNode[]
  triangles?: number
  size?: number // Memory size in bytes
  useCount?: number // Number of instances/references
}

export default function ObjectsPanel() {
  const { 
    showObjectsPanel, 
    toggleObjectsPanel, 
    selectedObject, 
    setSelectedObject,
    setTransformMode,
    openTransformPanelForSelection,
    canUndo,
    undo,
    addToUndoStack,
    sceneRevision,
    renderMode,
    projectObjects,
    removeProjectObject,
    setObjectVisible,
    streetsGLBridge
  } = useAppStore()
  const { viewer, frameObject } = useViewer()
  // Stable proxy Object3Ds for registry descriptors that have no live scene object
  // (city mode). Reusing the same proxy per id across rebuilds keeps node identity
  // stable so selection/expansion don't churn.
  const registryProxyCache = useRef<Map<string, THREE.Object3D>>(new Map())
  const [sceneTree, setSceneTree] = useState<SceneNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [isMinimized, setIsMinimized] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree')
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'triangles'>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [renamingNode, setRenamingNode] = useState<SceneNode | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [selectedObjects, setSelectedObjects] = useState<Set<THREE.Object3D>>(new Set())

  // Limit how far tree nodes can indent so deep hierarchies
  // don't push rows (and their icons) out of the visible panel.
  const MAX_TREE_INDENT_LEVEL = 8
  const TREE_INDENT_PER_LEVEL = 16

  // Focus input when renaming starts
  useEffect(() => {
    if (renamingNode && renameInputRef.current) {
      console.log('[ObjectsPanel] useEffect: Focusing rename input', { 
        nodeName: renamingNode.name, 
        nodeId: renamingNode.object.id,
        inputExists: !!renameInputRef.current 
      })
      // Use requestAnimationFrame to ensure DOM is updated
      const timeoutId = setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus()
          renameInputRef.current.select()
          console.log('[ObjectsPanel] Input focused and selected')
        } else {
          console.error('[ObjectsPanel] Input ref is null in setTimeout!')
        }
      }, 10)
      
      return () => clearTimeout(timeoutId)
    }
  }, [renamingNode])
  
  // Calculate stacking offset for left-side panels
  const PANEL_WIDTH = 420
  const stackingOffset = usePanelStacking({ panelId: 'objects', anchor: 'left' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'left',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'objects'
    }
  )

  // Calculate mesh statistics (triangles, size)
  const calculateMeshStats = useCallback((obj: THREE.Object3D): { triangles: number, size: number } => {
    let totalTriangles = 0
    let totalSize = 0
    
    if (obj instanceof THREE.Mesh && obj.geometry) {
      const geom = obj.geometry
      
      // Calculate triangles
      if (geom.index) {
        totalTriangles = geom.index.count / 3
      } else if (geom.attributes.position) {
        totalTriangles = geom.attributes.position.count / 3
      }
      
      // Calculate memory size (rough estimate)
      // Position: 3 floats * 4 bytes = 12 bytes per vertex
      // Normal: 3 floats * 4 bytes = 12 bytes per vertex
      // UV: 2 floats * 4 bytes = 8 bytes per vertex
      // Index: 1 uint * 4 bytes = 4 bytes per index
      let vertexSize = 0
      if (geom.attributes.position) {
        vertexSize += geom.attributes.position.count * 3 * 4 // position
      }
      if (geom.attributes.normal) {
        vertexSize += geom.attributes.normal.count * 3 * 4 // normal
      }
      if (geom.attributes.uv) {
        vertexSize += geom.attributes.uv.count * 2 * 4 // uv
      }
      if (geom.index) {
        totalSize += geom.index.count * 4 // indices
      }
      totalSize += vertexSize
      
      // Add material textures size (rough estimate)
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(mat => {
          const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']
          textureProps.forEach(prop => {
            const tex = (mat as any)[prop] as THREE.Texture | undefined
            if (tex && tex.image) {
              const img = tex.image
              const width = (img as any).width || (img as any).naturalWidth || 0
              const height = (img as any).height || (img as any).naturalHeight || 0
              if (width > 0 && height > 0) {
                // Estimate: 4 bytes per pixel (RGBA)
                totalSize += width * height * 4
              }
            }
          })
        })
      }
    }
    
    // Traverse children
    obj.children.forEach(child => {
      const childStats = calculateMeshStats(child)
      totalTriangles += childStats.triangles
      totalSize += childStats.size
    })
    
    return { triangles: totalTriangles, size: totalSize }
  }, [])

  // Build the object tree from the store-owned registry. This is the source of truth
  // when no Three.js scene is live (city mode), so the tree is non-empty and add/remove
  // work uniformly. Proxy Object3Ds carry transform + GPS + flags so the existing tree
  // UI (focus, GPS badge, visibility) works without a real scene object.
  const buildRegistryTree = useCallback((): SceneNode[] => {
    const cache = registryProxyCache.current
    const seen = new Set<string>()
    const nodes: SceneNode[] = []
    for (const descriptor of projectObjects) {
      seen.add(descriptor.id)
      let proxy = cache.get(descriptor.id)
      if (!proxy) {
        proxy = new THREE.Object3D()
        cache.set(descriptor.id, proxy)
      }
      proxy.name = descriptor.name
      proxy.visible = descriptor.visible
      const t = descriptor.transform
      proxy.position.set(t.position.x, t.position.y, t.position.z)
      proxy.rotation.set(t.rotation.x, t.rotation.y, t.rotation.z)
      proxy.scale.set(t.scale.x, t.scale.y, t.scale.z)
      proxy.userData.projectObjectId = descriptor.id
      proxy.userData.isModel = true
      proxy.userData.isImportedModel = true
      proxy.userData.isPrimitive = descriptor.kind === 'primitive'
      proxy.userData.primitiveType = descriptor.primitiveType
      proxy.userData.streetsGLObjectId = descriptor.streetsGLObjectId
      if (descriptor.gps) {
        ;(proxy.userData as any).gpsLat = descriptor.gps.lat
        ;(proxy.userData as any).gpsLon = descriptor.gps.lon
      } else {
        delete (proxy.userData as any).gpsLat
        delete (proxy.userData as any).gpsLon
      }
      const extra = descriptor.userData
      if (extra?.streetsGLPosition) {
        ;(proxy.userData as any).streetsGLPosition = extra.streetsGLPosition
      } else if (descriptor.kind === 'imported') {
        const cached = getCachedImportedModelScene(descriptor.id)
        const cachedPos = (cached?.userData as any)?.streetsGLPosition
        if (cachedPos) {
          ;(proxy.userData as any).streetsGLPosition = cachedPos
        } else {
          delete (proxy.userData as any).streetsGLPosition
        }
      } else {
        delete (proxy.userData as any).streetsGLPosition
      }
      if (extra?.streetsGLBaseTransform) {
        ;(proxy.userData as any).streetsGLBaseTransform = extra.streetsGLBaseTransform
      }
      if (extra?.streetsGLAdded) {
        ;(proxy.userData as any).streetsGLAdded = true
      }
      nodes.push({
        object: proxy,
        name: descriptor.name,
        type: descriptor.primitiveType ? `Primitive (${descriptor.primitiveType})` : descriptor.kind === 'imported' ? 'Imported Model' : descriptor.kind,
        visible: descriptor.visible,
        children: [],
        useCount: 1
      })
    }
    // Drop proxies for descriptors that no longer exist.
    for (const id of Array.from(cache.keys())) {
      if (!seen.has(id)) cache.delete(id)
    }
    return nodes
  }, [projectObjects])

  // Build scene tree from the actual scene graph
  const buildSceneTree = useCallback(() => {
    // No live Three.js scene (city mode): derive the tree from the registry so objects
    // remain visible and manageable. This replaces the old `return []` dead-end.
    if (!viewer?.scene) return buildRegistryTree()

    const nodes: SceneNode[] = []
    const traverse = (obj: THREE.Object3D, parentNodes: SceneNode[]) => {
      // If this is the starting objects group, traverse its children but don't add the group itself
      if (obj.userData.isStartingObjectsGroup) {
        // Traverse all children (lights) and add them directly to parentNodes
        obj.children.forEach(child => traverse(child, parentNodes))
        return
      }
      
      // Always include models - they should never be filtered out
      // Check both isModel (root model object) and isImportedModel (child objects)
      // Also check if this is a root imported model (has isImportedModel but parent doesn't have isModel)
      const isModel = obj.userData.isModel === true || obj.userData.isImportedModel === true
      
      // Determine if this is a root model object (should appear in the list)
      // Root model = has isModel flag, OR is a direct child of scene with isImportedModel, OR parent doesn't have isModel
      const isRootModel = obj.userData.isModel === true || 
                         (obj.userData.isImportedModel === true && (!obj.parent || obj.parent === viewer.scene || !obj.parent.userData.isModel))
      
      // Handle pivot wrappers specially - show the original model instead of the pivot wrapper
      if (obj.userData.isPivotWrapper) {
        const originalModel = obj.userData.originalModel as THREE.Object3D | undefined
        if (originalModel) {
          // The original model is inside the pivot wrapper
          // Recursively traverse the original model as if it were at this position in the tree
          traverse(originalModel, parentNodes)
        }
        // Don't add the pivot wrapper itself - we've replaced it with the original model
        return
      }
      
      // Skip native objects group and other helper objects
      // BUT: never skip models
      if (!isModel && (obj.userData.isHelper || obj.userData.isNativeObjectsGroup || obj.userData.isTransformControls)) {
        return
      }
      
      // Skip AmbientLight - it's controlled from Lighting Panel, not Objects Panel
      if (obj instanceof THREE.AmbientLight) {
        return
      }
      
      // Skip light gizmos - they're visual helpers for lights, not selectable objects
      if (!isModel && obj.userData.isLightGizmo) {
        return
      }
      
      // Skip transform controls gizmo objects (Gizmo, Planes, etc.)
      if (!isModel && (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane')) {
        return
      }
      
      // Skip Three.js helper objects (DirectionalLightHelper, etc.)
      // These are typically named with "Helper" suffix or are instances of Helper classes
      // BUT: never skip models, even if they have "Helper" in the name (unlikely but possible)
      if (!isModel && (obj.type.includes('Helper') || (obj.name && obj.name.includes('Helper')))) {
        return
      }
      
      // Skip weather system objects (sky, sun/moon meshes) - they are visual effects, not scene objects
      if (!isModel && (obj.userData.isDynamicSky || obj.userData.isSun || obj.userData.isMoon)) {
        return
      }
      
      // Skip ground projection skybox objects
      if (!isModel && (obj.userData.isGroundedSkybox || obj.type === 'GroundedSkybox')) {
        return
      }

      // Skip bounding box helpers
      if (!isModel && obj.userData.isBoundingBoxHelper) {
        return
      }
      
      // Skip CineShader demo screen - it's a helper/demo object, not a scene model
      if (obj.userData.isDemoShaderScreen || obj.userData.isCineShaderDemoScreenGroup) {
        return
      }
      
      // Skip objects with CineShader-related names
      if (!isModel && obj.name && (obj.name.toLowerCase().includes('cineshader') || obj.name.toLowerCase().includes('cinescene'))) {
        return
      }
      
      // Include primitive objects (they have isModel flag, so they're already included above)
      // Primitives are treated the same as imported models - draggable, selectable, scalable
      
      // Skip generic Object3D groups that aren't models and don't have meaningful names
      // These are typically system objects or intermediate groups
      if (!isModel && obj instanceof THREE.Object3D && !(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Group) && !(obj instanceof THREE.Light)) {
        // Only skip if it's a generic Object3D without meaningful userData or name
        // Keep groups and meshes as they might be user-created
        if (!obj.userData.isModel && !obj.userData.isImportedModel && (!obj.name || obj.name.startsWith('Object3D-'))) {
          return
        }
      }

      // Include models, lights (except AmbientLight), groups, and other non-helper objects
      // For models, use a better name if available
      // Check for custom name first (user-renamed)
      let name = obj.userData.customName || obj.name
      if (!name || name === '') {
        if (isRootModel) {
          // Try to get name from file or use default
          name = obj.userData.fileName || 'Imported Model'
        } else if (isModel) {
          name = `Model Component (${obj.type})`
        } else if (obj instanceof THREE.Group) {
          name = 'Group'
        } else if (obj instanceof THREE.Mesh) {
          name = 'Mesh'
        } else if (obj instanceof THREE.Light) {
          // Use light type as name for lights
          if (obj instanceof THREE.DirectionalLight) {
            name = 'Directional Light'
          } else if (obj instanceof THREE.PointLight) {
            name = 'Point Light'
          } else if (obj instanceof THREE.SpotLight) {
            name = 'Spot Light'
          } else if (obj instanceof THREE.RectAreaLight) {
            name = 'Rect Area Light'
          } else if (obj instanceof THREE.HemisphereLight) {
            name = 'Hemisphere Light'
          } else {
            name = 'Light'
          }
        } else {
          name = `${obj.type}-${obj.id}`
        }
      }
      
      // Calculate mesh statistics
      const stats = calculateMeshStats(obj)
      
      const node: SceneNode = {
        object: obj,
        name,
        type: obj.type,
        visible: obj.visible,
        children: [],
        triangles: stats.triangles > 0 ? Math.floor(stats.triangles) : undefined,
        size: stats.size > 0 ? stats.size : undefined,
        useCount: 1 // Default use count
      }
      parentNodes.push(node)

      // Traverse children, but skip helper objects in the hierarchy
      // Always traverse children of models though
      obj.children.forEach(child => {
        const childIsModel = child.userData.isModel === true || child.userData.isImportedModel === true
        // Include children of models, or children that aren't helpers
        if (isModel || childIsModel || !(child.type.includes('Helper') || (child.name && child.name.includes('Helper')))) {
          traverse(child, node.children)
        }
      })
    }

    viewer.scene.children.forEach(child => traverse(child, nodes))
    
    // Debug: Log what was found (only log warnings, not every successful build)
    if (nodes.length === 0 && viewer.scene.children.length > 0) {
      console.warn('[ObjectsPanel] No objects found in scene tree, but scene has children:', {
        sceneChildrenCount: viewer.scene.children.length,
        sceneChildren: viewer.scene.children.map(c => ({
          name: c.name,
          type: c.type,
          isModel: c.userData.isModel,
          isImportedModel: c.userData.isImportedModel,
          hasGeometry: c instanceof THREE.Mesh || (c.children && c.children.some(child => child instanceof THREE.Mesh)),
          userData: Object.keys(c.userData)
        }))
      })
    }
    // Removed excessive logging - only log when there's an issue (see warning above)
    
    return nodes
  }, [viewer, buildRegistryTree])

  // Update tree when scene changes
  useEffect(() => {
    if (!viewer?.scene) return

    const updateTree = () => {
      const tree = buildSceneTree()
      // Only update if tree actually changed to prevent unnecessary re-renders
      setSceneTree(prevTree => {
        // Quick check: compare lengths first
        if (prevTree.length !== tree.length) {
          return tree
        }
        // Deep comparison: check if structure changed
        const hasChanged = JSON.stringify(prevTree.map(n => ({ id: n.object.id, visible: n.visible }))) !== 
                          JSON.stringify(tree.map(n => ({ id: n.object.id, visible: n.visible })))
        return hasChanged ? tree : prevTree
      })
    }

    updateTree()

    // Update more frequently to catch model loading and visibility changes
    // Also listen for scene changes
    const interval = setInterval(updateTree, 500) // Reduced from 1000ms to 500ms for faster updates
    
    // Track pending timeouts for cleanup
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = []
    // Track if we already have a pending timeout for the empty tree condition
    // Use a ref to avoid race conditions between timeout callback and cleanup
    const pendingEmptyTreeTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null }
    
    // Force update when scene children change (model loaded/unloaded)
    const checkSceneChanges = () => {
      if (viewer?.scene) {
        const currentChildCount = viewer.scene.children.length
        const previousCount = (checkSceneChanges as any).lastChildCount || 0
        if (currentChildCount !== previousCount) {
          (checkSceneChanges as any).lastChildCount = currentChildCount
          updateTree()
        }
        
        // Also check for objects with model flags that might have been added
        let hasModels = false
        viewer.scene.traverse((obj) => {
          if (obj.userData.isModel === true || obj.userData.isImportedModel === true) {
            hasModels = true
          }
        })
        
        // If we have models but tree is empty, force update
        // Only schedule a new timeout if one isn't already pending
        if (hasModels) {
          const currentTree = buildSceneTree()
          if (currentTree.length === 0) {
            // Only add a new timeout if we don't already have one pending
            if (!pendingEmptyTreeTimeoutRef.current) {
              // Force a fresh rebuild - track timeout for cleanup
              const timeoutId = setTimeout(() => {
                // Check if this timeout is still the current one (not cleared)
                if (pendingEmptyTreeTimeoutRef.current === timeoutId) {
                  updateTree()
                  // Clear the reference when timeout completes
                  pendingEmptyTreeTimeoutRef.current = null
                  // Remove from array (filter out completed timeout)
                  const index = pendingTimeouts.indexOf(timeoutId)
                  if (index > -1) {
                    pendingTimeouts.splice(index, 1)
                  }
                }
              }, 100)
              pendingTimeouts.push(timeoutId)
              pendingEmptyTreeTimeoutRef.current = timeoutId
            }
          } else {
            // Tree is no longer empty - clear pending timeout if exists
            if (pendingEmptyTreeTimeoutRef.current) {
              clearTimeout(pendingEmptyTreeTimeoutRef.current)
              const index = pendingTimeouts.indexOf(pendingEmptyTreeTimeoutRef.current)
              if (index > -1) {
                pendingTimeouts.splice(index, 1)
              }
              pendingEmptyTreeTimeoutRef.current = null
            }
          }
        }
      }
    }
    
    const sceneCheckInterval = setInterval(checkSceneChanges, 200) // Check every 200ms for scene changes
    
    return () => {
      clearInterval(interval)
      clearInterval(sceneCheckInterval)
      // Cleanup any pending timeouts
      pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId))
      pendingTimeouts.length = 0
      // Clear the empty tree timeout reference (using ref to avoid race condition)
      if (pendingEmptyTreeTimeoutRef.current) {
        clearTimeout(pendingEmptyTreeTimeoutRef.current)
        pendingEmptyTreeTimeoutRef.current = null
      }
    }
  }, [viewer]) // buildSceneTree is stable and only changes when viewer changes, so we don't need it in deps

  useEffect(() => {
    // Build on any registry/scene revision change. Note: no longer gated on `viewer`,
    // so the tree is populated from the registry in city mode (where viewer is null).
    if (!showObjectsPanel) return
    const tree = buildSceneTree()
    setSceneTree(tree)
  }, [sceneRevision, viewer, showObjectsPanel, buildSceneTree, projectObjects])

  // Sync selectedObjects with selectedObject when selectedObject changes from outside
  useEffect(() => {
    if (selectedObject) {
      // If selectedObject is set but not in selectedObjects, add it
      setSelectedObjects(prev => {
        if (!prev.has(selectedObject)) {
          const next = new Set(prev)
          next.add(selectedObject)
          return next
        }
        return prev
      })
    } else {
      // If selectedObject is cleared, also clear selectedObjects
      setSelectedObjects(new Set())
    }
  }, [selectedObject])

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const handleNodeClick = useCallback((node: SceneNode, event?: React.MouseEvent) => {
    // Don't allow selecting locked objects
    if (node.object.userData.isLocked === true) {
      console.log('[ObjectsPanel] Object is locked - cannot select')
      return
    }
    
    // Check for multi-select (Shift key)
    const isMultiSelect = event && event.shiftKey
    
    console.log('[ObjectsPanel] handleNodeClick', { 
      nodeName: node.name, 
      isMultiSelect, 
      shiftKey: event?.shiftKey,
      currentSelectionSize: selectedObjects.size 
    })
    
    if (isMultiSelect) {
      // Multi-select: toggle selection
      if (event) {
        event.preventDefault()
        event.stopPropagation()
      }
      setSelectedObjects(prev => {
        const next = new Set(prev)
        if (next.has(node.object)) {
          next.delete(node.object)
          console.log(`[ObjectsPanel] Deselected: ${node.name}, remaining: ${next.size}`)
        } else {
          next.add(node.object)
          console.log(`[ObjectsPanel] Added to selection: ${node.name}, total: ${next.size}`)
        }
        return next
      })
      // Also update single selection for compatibility (last selected)
      setSelectedObject(node.object)
    } else {
      // Single select: replace selection
      setSelectedObjects(new Set([node.object]))
      setSelectedObject(node.object)
      console.log(`[ObjectsPanel] Selected: ${node.name}`)
    }
    if (renderMode === 'city') {
      openTransformPanelForSelection('translate')
    } else {
      setTransformMode(null)
    }
  }, [setSelectedObject, setTransformMode, selectedObjects, renderMode, openTransformPanelForSelection])

  const handleNodeDoubleClick = useCallback((node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedObject(node.object)
    setTransformMode(null)
    frameObject(node.object)
  }, [setSelectedObject, setTransformMode, frameObject])

  const handleUndo = useCallback(() => {
    undo()
    // Manually update tree after undo to catch restored objects immediately
    setTimeout(() => {
      const tree = buildSceneTree()
      setSceneTree(tree)
    }, 50)
  }, [undo, buildSceneTree])

  // Convert selected objects to instances
  const handleConvertToInstances = useCallback(() => {
    if (!viewer?.scene) return
    
    const objectsArray = Array.from(selectedObjects)
    if (objectsArray.length < 2) {
      alert('Please select at least 2 objects to convert to instances (Ctrl+Click to multi-select)')
      return
    }

    // Group objects by geometry to find which ones can be instanced together
    const groups = groupObjectsByGeometry(objectsArray)
    
    let totalConverted = 0
    let totalInstances = 0
    
    for (const [signature, objects] of groups) {
      if (objects.length < 2) continue
      
      const result = convertToInstancedMesh(objects, viewer.scene)
      if (result.success) {
        totalConverted += objects.length
        totalInstances++
        console.log(`[ObjectsPanel] Converted ${objects.length} objects to 1 InstancedMesh`)
      } else {
        console.error(`[ObjectsPanel] Failed to convert objects: ${result.error}`)
        alert(`Failed to convert some objects: ${result.error}`)
      }
    }

    if (totalConverted > 0) {
      setSelectedObjects(new Set())
      setSelectedObject(null)
      
      // Refresh tree
      setTimeout(() => {
        const tree = buildSceneTree()
        setSceneTree(tree)
      }, 100)
      
      alert(`Successfully converted ${totalConverted} objects into ${totalInstances} InstancedMesh(es)`)
    } else {
      alert('No objects could be converted. Make sure selected objects have the same geometry.')
    }
  }, [selectedObjects, viewer, buildSceneTree, setSelectedObject])

  // Convert all duplicate objects in scene to instances
  const handleConvertAllDuplicates = useCallback(() => {
    if (!viewer?.scene) {
      alert('Scene not available')
      return
    }
    
    if (!confirm('This will convert all duplicate objects in the scene to instances. Continue?')) {
      return
    }

    console.log('[ObjectsPanel] Starting auto-detect for duplicate objects...')
    const result = convertAllDuplicatesToInstances(viewer.scene)
    
    console.log('[ObjectsPanel] Auto-detect result:', result)
    
    if (result.converted > 0) {
      setSelectedObjects(new Set())
      setSelectedObject(null)
      
      // Refresh tree
      setTimeout(() => {
        const tree = buildSceneTree()
        setSceneTree(tree)
      }, 100)
      
      const message = `Successfully converted ${result.converted} objects into ${result.instancesCreated} InstancedMesh(es)`
      if (result.errors.length > 0) {
        console.warn('[ObjectsPanel] Some errors occurred:', result.errors)
        alert(`${message}\n\nNote: ${result.errors.length} error(s) occurred. Check console for details.`)
      } else {
        alert(message)
      }
    } else {
      alert('No duplicate objects found in the scene.\n\nMake sure you have multiple objects with the same geometry.')
    }
  }, [viewer, buildSceneTree, setSelectedObject])

  const handleToggleVisible = useCallback((node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation()
    const projectObjectId = (node.object.userData as any).projectObjectId as string | undefined
    const streetsGLId = getStreetsGLObjectId(node.object)

    // City mode (no live scene): toggle visibility through the registry + Streets GL.
    if (!viewer?.scene) {
      if (!projectObjectId) return
      const newVisible = !node.object.visible
      node.object.visible = newVisible
      setObjectVisible(projectObjectId, newVisible)
      if (streetsGLBridge && streetsGLId) {
        streetsGLBridge.updateObject(streetsGLId, { visible: newVisible }).catch(() => {})
      }
      setTimeout(() => setSceneTree(buildSceneTree()), 0)
      return
    }

    // Get current visibility state directly from object
    const currentVisible = node.object.visible
    const newVisible = !currentVisible

    // Keep the registry descriptor in sync for objects that have one.
    if (projectObjectId) {
      setObjectVisible(projectObjectId, newVisible)
    }
    
    // Set visibility on the object
    node.object.visible = newVisible
    
    // Update matrix world to ensure changes are reflected
    node.object.updateMatrixWorld(true)

    if (streetsGLBridge && streetsGLId) {
      streetsGLBridge.updateObject(streetsGLId, { visible: newVisible }).catch(() => {})
    }
    
    // If it's a group, also toggle visibility of all children recursively
    if (node.object instanceof THREE.Group || node.object.children.length > 0) {
      node.object.traverse((child) => {
        // Skip the object itself (already set above)
        if (child === node.object) return
        // Only toggle meshes and groups, not lights or other objects
        if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
          child.visible = newVisible
          child.updateMatrixWorld(true)
        }
      })
    }
    
    // Force re-render by rebuilding tree (don't depend on sceneTree to avoid loops)
    // Use setTimeout to ensure visibility changes are applied before rebuilding
    setTimeout(() => {
      const tree = buildSceneTree()
      setSceneTree(tree)
    }, 0)
  }, [viewer, buildSceneTree, setObjectVisible, streetsGLBridge])

  const handleToggleLock = useCallback((node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!viewer?.scene) return
    
    // Toggle lock state in userData
    const currentLocked = node.object.userData.isLocked === true
    const newLocked = !currentLocked
    
    // Set lock state
    node.object.userData.isLocked = newLocked
    
    // If it's a group, also lock/unlock all children recursively
    if (node.object instanceof THREE.Group || node.object.children.length > 0) {
      node.object.traverse((child) => {
        // Skip the object itself (already set above)
        if (child === node.object) return
        // Lock/unlock meshes and groups
        if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
          child.userData.isLocked = newLocked
        }
      })
    }
    
    // If object is locked and currently selected, deselect it to prevent transform
    if (newLocked && selectedObject === node.object) {
      setSelectedObject(null)
      setTransformMode(null)
    }
    
    // Force re-render by rebuilding tree
    setTimeout(() => {
      const tree = buildSceneTree()
      setSceneTree(tree)
    }, 0)
  }, [viewer, selectedObject, setSelectedObject, setTransformMode, buildSceneTree])

  const handleDelete = useCallback((node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation()
    const projectObjectId = (node.object.userData as any).projectObjectId as string | undefined

    // City mode (no live scene): delete from the registry + Streets GL.
    if (!viewer?.scene) {
      if (!projectObjectId) return
      const confirmDelete = window.confirm(`Delete "${node.name}"?`)
      if (!confirmDelete) return
      removeProjectObject(projectObjectId)
      removeCachedImportedModelScene(projectObjectId)
      const streetsGLId = getStreetsGLObjectId(node.object)
      if (streetsGLBridge && streetsGLId) {
        streetsGLBridge.removeObject(streetsGLId).catch(() => {})
      }
      if (selectedObject === node.object) {
        setSelectedObject(null)
      }
      setSceneTree(buildSceneTree())
      return
    }

    // Don't allow deleting the scene root itself
    if (node.object === viewer.scene) {
      // If trying to delete the scene, clear all objects instead
      const confirmClear = window.confirm(`Clear all objects from the scene? This will remove all models, lights, and other objects.`)
      if (!confirmClear) return

      // Collect all objects to remove (except helpers and system objects)
      const objectsToRemove: THREE.Object3D[] = []
      viewer.scene.traverse((obj) => {
        // Skip the scene itself, helpers, and system objects
        if (obj === viewer.scene) return
        if (obj.userData.isHelper || 
            obj.userData.isStartingObjectsGroup ||
            obj.userData.isNativeObjectsGroup ||
            obj.userData.isTransformControls ||
            obj.userData.isBoundingBoxHelper ||
            obj.userData.isGroundedSkybox ||
            obj.userData.isDynamicSky ||
            obj.userData.isSun ||
            obj.userData.isMoon ||
            obj.type === 'GridHelper' ||
            obj.type === 'AxesHelper' ||
            obj instanceof THREE.AmbientLight) {
          return
        }
        // Only add root-level objects (direct children of scene)
        if (obj.parent === viewer.scene) {
          objectsToRemove.push(obj)
        }
      })

      // Save to undo stack BEFORE removing
      objectsToRemove.forEach(obj => {
        addToUndoStack({
          type: 'delete',
          object: obj,
          parent: viewer.scene
        })
      })

      // Remove all objects
      objectsToRemove.forEach(obj => {
        viewer.scene.remove(obj)
        // Tear down any Gaussian splat iframe overlay so it does not stay on
        // top of the viewport after the splat root is removed.
        disposeSplatOverlay(obj)
        // Dispose resources
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry) obj.geometry.dispose()
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']
                textureProps.forEach(prop => {
                  const tex = (mat as any)[prop] as THREE.Texture | undefined
                  if (tex) tex.dispose()
                })
              }
              mat.dispose()
            })
          }
        }
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose()
            if (child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material]
              mats.forEach(mat => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                  const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']
                  textureProps.forEach(prop => {
                    const tex = (mat as any)[prop] as THREE.Texture | undefined
                    if (tex) tex.dispose()
                  })
                }
                mat.dispose()
              })
            }
          }
        })
      })

      // Deselect if selected object was removed
      if (selectedObject && objectsToRemove.includes(selectedObject)) {
        setSelectedObject(null)
      }

      // Rebuild tree
      const tree = buildSceneTree()
      setSceneTree(tree)
      return
    }

    // Don't allow deleting helper objects
    if (node.object.userData.isHelper) {
      return
    }

    const confirmDelete = window.confirm(`Delete "${node.name}"?`)
    if (!confirmDelete) return

    // Save to undo stack BEFORE removing
    const parent = node.object.parent
    addToUndoStack({
      type: 'delete',
      object: node.object,
      parent: parent || null
    })

    // Remove from scene (but DON'T dispose so we can undo)
    if (parent) {
      parent.remove(node.object)
    } else if (node.object.parent === null && viewer.scene.children.includes(node.object)) {
      // Handle case where object is direct child of scene but parent is null
      viewer.scene.remove(node.object)
    }

    // A Gaussian splat keeps a full-screen iframe overlay mounted in the viewer
    // DOM. Removing the splat root from the scene does not remove that overlay,
    // which would otherwise stay on top of the viewport and hide everything
    // else. Tear it down on delete (the lightweight root group can still be
    // restored via undo).
    disposeSplatOverlay(node.object)

    // If this was selected, deselect it
    if (selectedObject === node.object) {
      setSelectedObject(null)
    }

    // Keep the registry + Streets GL in sync when deleting a project object.
    if (projectObjectId) {
      removeProjectObject(projectObjectId)
      // Preserve GPU resources for undo; cache entry is dropped without disposal.
      removeCachedImportedModelScene(projectObjectId, false)
      const streetsGLId = getStreetsGLObjectId(node.object)
      if (streetsGLBridge && streetsGLId) {
        streetsGLBridge.removeObject(streetsGLId).catch(() => {})
      }
    }

    // Rebuild tree
    const tree = buildSceneTree()
    setSceneTree(tree)
  }, [viewer, selectedObject, setSelectedObject, addToUndoStack, buildSceneTree, removeProjectObject, streetsGLBridge])

  const handleUngroup = useCallback((node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!viewer?.scene) return

    if (node.object instanceof THREE.Group && node.object.children.length > 0) {
      const children = [...node.object.children]
      const parent = node.object.parent
      const wasSelected = selectedObject === node.object

      // If this group was selected and has transform controls attached, detach them first
      if (wasSelected && viewer.transformControls) {
        const attachedObject = (viewer.transformControls as any).object as THREE.Object3D | null
        if (attachedObject === node.object) {
          viewer.transformControls.detach()
        }
      }

      // Remove group from parent
      if (parent) {
        parent.remove(node.object)
      } else {
        viewer.scene.remove(node.object)
      }

      // Add children back to parent/scene and preserve their world transforms
      children.forEach(child => {
        // Update matrices to ensure accurate world transform calculation
        if (node.object.parent) {
          node.object.parent.updateMatrixWorld(true)
        }
        child.updateMatrixWorld(true)
        
        // Store world transform before reparenting
        const worldMatrix = child.matrixWorld.clone()
        const worldPosition = new THREE.Vector3()
        const worldQuaternion = new THREE.Quaternion()
        const worldScale = new THREE.Vector3()
        
        worldMatrix.decompose(worldPosition, worldQuaternion, worldScale)

        // Add to new parent
        if (parent) {
          parent.add(child)
        } else {
          viewer.scene.add(child)
        }

        // Preserve world transform after reparenting by converting to local space
        if (parent && parent !== viewer.scene) {
          // Update parent matrix to calculate local transform
          parent.updateMatrixWorld(true)
          
          // Convert world transform to local transform using parent's inverse matrix
          // localMatrix = parentInverse * worldMatrix
          const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert()
          const localMatrix = worldMatrix.clone().premultiply(parentInverse)
          
          // Decompose local matrix to get local position, rotation, scale
          const localPosition = new THREE.Vector3()
          const localQuaternion = new THREE.Quaternion()
          const localScale = new THREE.Vector3()
          localMatrix.decompose(localPosition, localQuaternion, localScale)
          
          child.position.copy(localPosition)
          child.quaternion.copy(localQuaternion)
          child.scale.copy(localScale)
        } else {
          // If parent is scene, world and local are the same
          child.position.copy(worldPosition)
          child.quaternion.copy(worldQuaternion)
          child.scale.copy(worldScale)
        }
        
        // Update matrix world to apply the new transforms
        child.updateMatrixWorld(true)
      })

      // Note: Groups don't have a dispose() method - they're automatically cleaned up
      // when removed from the scene if there are no references to them
      // Only geometries, materials, and textures need to be disposed

      // If selected, deselect (transform controls already detached above)
      if (wasSelected) {
        setSelectedObject(null)
      }

      // Rebuild tree
      const tree = buildSceneTree()
      setSceneTree(tree)
    }
  }, [viewer, selectedObject, setSelectedObject, buildSceneTree])

  const handleHideOthers = useCallback((node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!viewer?.scene) return

    // Hide all objects except this one
    viewer.scene.traverse(obj => {
      if (obj !== node.object && !obj.userData.isHelper) {
        obj.visible = false
      }
    })

    // Rebuild tree
    const tree = buildSceneTree()
    setSceneTree(tree)
  }, [viewer, buildSceneTree])

  const handleShowAll = useCallback(() => {
    if (!viewer?.scene) return

    viewer.scene.traverse(obj => {
      if (!obj.userData.isHelper) {
        obj.visible = true
      }
    })

    // Rebuild tree
    const tree = buildSceneTree()
    setSceneTree(tree)
  }, [viewer, buildSceneTree])

  const handleRename = useCallback((node: SceneNode, e: React.MouseEvent) => {
    console.log('[ObjectsPanel] handleRename called', { 
      nodeName: node.name, 
      nodeId: node.object.id,
      currentRenamingNode: renamingNode?.object.id 
    })
    e.stopPropagation()
    e.preventDefault()
    
    // Set the node to rename and its current name
    const nodeName = node.name || node.object.name || 'Unnamed'
    console.log('[ObjectsPanel] Setting rename state', { nodeName, nodeId: node.object.id })
    setRenamingNode(node)
    setRenameValue(nodeName)
    
    // The useEffect will handle focusing
  }, [renamingNode])

  const handleRenameSubmit = useCallback((node: SceneNode, newName: string) => {
    console.log('[ObjectsPanel] handleRenameSubmit called', { nodeName: node.name, newName, trimmed: newName.trim() })
    if (!viewer?.scene) {
      console.warn('[ObjectsPanel] Cannot submit rename - viewer/scene not available')
      return
    }
    
    const trimmedName = newName.trim()
    console.log('[ObjectsPanel] Trimmed name:', trimmedName, 'Original name:', node.name)
    
    if (trimmedName && trimmedName !== node.name) {
      console.log('[ObjectsPanel] Applying rename:', node.name, '→', trimmedName)
      // Store custom name in userData
      node.object.userData.customName = trimmedName
      // Also update the object's name if it's empty or generic
      if (!node.object.name || node.object.name === 'Group' || node.object.name === 'Scene') {
        node.object.name = trimmedName
      }
      
      // Force tree rebuild to reflect new name
      const tree = buildSceneTree()
      setSceneTree(tree)
      console.log('[ObjectsPanel] Tree rebuilt after rename')
      
      // Add to undo stack
      addToUndoStack({ type: 'rename', object: node.object, oldName: node.name, newName: trimmedName })
      console.log('[ObjectsPanel] Rename added to undo stack')
    } else {
      console.log('[ObjectsPanel] Rename cancelled - name unchanged or empty')
    }
    
    setRenamingNode(null)
    setRenameValue('')
    console.log('[ObjectsPanel] Rename state cleared')
  }, [viewer, buildSceneTree, addToUndoStack])

  const handleRenameCancel = useCallback(() => {
    setRenamingNode(null)
    setRenameValue('')
  }, [])

  const handleCopyTransform = useCallback((node: SceneNode, e: React.MouseEvent) => {
    e.stopPropagation()
    
    // Update object's world matrix to get accurate current transform
    node.object.updateMatrixWorld(true)
    
    // Get position, rotation (in degrees), and scale
    const position = node.object.position.clone()
    const rotation = {
      x: THREE.MathUtils.radToDeg(node.object.rotation.x),
      y: THREE.MathUtils.radToDeg(node.object.rotation.y),
      z: THREE.MathUtils.radToDeg(node.object.rotation.z)
    }
    const scale = node.object.scale.clone()
    
    // Create a formatted string with the transform data
    const transformData = {
      position: {
        x: position.x.toFixed(3),
        y: position.y.toFixed(3),
        z: position.z.toFixed(3)
      },
      rotation: {
        x: rotation.x.toFixed(1),
        y: rotation.y.toFixed(1),
        z: rotation.z.toFixed(1)
      },
      scale: {
        x: scale.x.toFixed(2),
        y: scale.y.toFixed(2),
        z: scale.z.toFixed(2)
      }
    }
    
    // Copy to clipboard as JSON
    const jsonString = JSON.stringify(transformData, null, 2)
    
    // Also create a code-friendly format for easy copy-paste into code
    const codeFormat = `Position: X: ${position.x.toFixed(3)}, Y: ${position.y.toFixed(3)}, Z: ${position.z.toFixed(3)}
Rotation: X: ${rotation.x.toFixed(1)}°, Y: ${rotation.y.toFixed(1)}°, Z: ${rotation.z.toFixed(1)}°
Scale: X: ${scale.x.toFixed(2)}, Y: ${scale.y.toFixed(2)}, Z: ${scale.z.toFixed(2)}`
    
    // Copy both formats (JSON first, then formatted text)
    const fullClipboard = `${codeFormat}\n\nJSON:\n${jsonString}`
    
    navigator.clipboard.writeText(fullClipboard).then(() => {
      console.log('[ObjectsPanel] Transform copied to clipboard:', transformData)
      // Show a temporary notification (you could add a toast notification here if you have one)
      alert(`Transform copied to clipboard!\n\n${codeFormat}`)
    }).catch(err => {
      console.error('[ObjectsPanel] Failed to copy to clipboard:', err)
      alert(`Failed to copy to clipboard. Transform data:\n\n${codeFormat}`)
    })
  }, [])

  const renderNode = useCallback((node: SceneNode, depth: number = 0): React.ReactNode => {
    const nodeId = `node-${node.object.id}`
    const isExpanded = expandedNodes.has(nodeId)
    const hasChildren = node.children.length > 0
    const isSelected = selectedObject === node.object
    const isMultiSelected = selectedObjects.has(node.object)
    const isGroup = node.object instanceof THREE.Group
    const hasVisibleChildren = node.children.some(child => child.visible)
    const clampedDepth = Math.min(depth, MAX_TREE_INDENT_LEVEL)
    const paddingLeft = clampedDepth * TREE_INDENT_PER_LEVEL + 6

    return (
      <div key={nodeId} className="tree-node">
        <div
          className={`tree-node-content ${isSelected ? 'selected' : ''} ${selectedObjects.has(node.object) ? 'multi-selected' : ''}`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={(e) => handleNodeClick(node, e)}
          onDoubleClick={(e) => handleNodeDoubleClick(node, e)}
          title={node.name}
        >
          <div className="node-main-row">
            {hasChildren && (
              <button
                className="expand-button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleNodeExpanded(nodeId)
                }}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <span className="no-children-indent" />}

            <span className="node-icon">
              {isGroup ? '📦' : '📄'}
            </span>

            {renamingNode && renamingNode.object.id === node.object.id ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRenameSubmit(node, renameValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameSubmit(node, renameValue)
                  } else if (e.key === 'Escape') {
                    handleRenameCancel()
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="node-name-input"
                style={{
                  padding: '2px 4px',
                  fontSize: '14px',
                  border: '1px solid #4a9eff',
                  borderRadius: '3px',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  outline: 'none',
                  minWidth: '100px',
                  maxWidth: '200px'
                }}
              />
            ) : (
              <div className="node-name-container">
                <span 
                  className="node-name" 
                  title={node.object.userData.fileName ? `${node.name}\nSource: ${node.object.userData.fileName}` : node.name}
                >
                  {(() => {
                    // Add bounding box dimensions to the name display with units
                    try {
                      const box = new THREE.Box3().setFromObject(node.object)
                      if (!box.isEmpty()) {
                        const size = box.getSize(new THREE.Vector3())
                        if (size.x > 0 || size.y > 0 || size.z > 0) {
                          return `${node.name} (${size.x.toFixed(1)}m × ${size.y.toFixed(1)}m × ${size.z.toFixed(1)}m)`
                        }
                      }
                    } catch (e) {
                      // If bounding box calculation fails, just show name
                    }
                    return node.name
                  })()}
                </span>
                {node.object.userData.fileName && (
                  <span className="node-filename" title={`Source file: ${node.object.userData.fileName}`}>
                    📄 {node.object.userData.fileName}
                  </span>
                )}
                {renderMode === 'city' && (() => {
                  const gps = formatGPS(node.object)
                  if (!gps) return null
                  return (
                    <span className="node-gps" title={`Lat, Lon: ${gps}`}>
                      📍 {gps}
                      <button
                        className="gps-copy-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          copyGPSToClipboard(gps)
                        }}
                        title="Copy GPS coordinates"
                      >
                        📋
                      </button>
                    </span>
                  )
                })()}
              </div>
            )}
          </div>

          <div className="node-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="action-button"
              onClick={(e) => {
                console.log('[ObjectsPanel] Rename button clicked (tree view)', { nodeName: node.name })
                handleRename(node, e)
              }}
              title="Rename"
            >
              ✏️
            </button>
            <button
              className="action-button"
              onClick={(e) => {
                e.stopPropagation()
                if (frameObject) {
                  frameObject(node.object)
                }
              }}
              title="Focus on object"
            >
              🎯
            </button>
            <button
              className="action-button"
              onClick={(e) => handleToggleVisible(node, e)}
              title={node.object.visible ? 'Hide' : 'Show'}
            >
              {node.object.visible ? '👁️' : '🚫'}
            </button>

            {isGroup && (
              <button
                className="action-button"
                onClick={(e) => handleUngroup(node, e)}
                title="Ungroup"
              >
                🔗
              </button>
            )}

            <button
              className="action-button"
              onClick={(e) => handleCopyTransform(node, e)}
              title="Copy Transform (Position, Rotation, Scale)"
            >
              📋
            </button>

            <button
              className="action-button"
              onClick={(e) => handleHideOthers(node, e)}
              title="Hide Others"
            >
              👁️‍🗨️
            </button>

            <button
              className="action-button delete-button"
              onClick={(e) => handleDelete(node, e)}
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="tree-node-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [expandedNodes, selectedObject, handleNodeClick, handleNodeDoubleClick, handleToggleVisible, handleDelete, handleUngroup, handleHideOthers, handleCopyTransform, handleRename, handleRenameSubmit, handleRenameCancel, renamingNode, renameValue, toggleNodeExpanded])

  // Flatten tree to list for table view
  const flattenTree = useCallback((nodes: SceneNode[]): SceneNode[] => {
    const result: SceneNode[] = []
    const traverse = (nodeList: SceneNode[]) => {
      nodeList.forEach(node => {
        // Only include meshes and groups with geometry
        if (node.object instanceof THREE.Mesh || (node.triangles && node.triangles > 0)) {
          result.push(node)
        }
        if (node.children.length > 0) {
          traverse(node.children)
        }
      })
    }
    traverse(nodes)
    return result
  }, [])

  // Helper function to get display name (custom name or regular name)
  const getDisplayName = useCallback((node: SceneNode): string => {
    return node.object.userData.customName || node.name || node.object.name || 'Unnamed'
  }, [])

  const formatGPS = useCallback((obj: THREE.Object3D): string | null => {
    const lat = (obj.userData as any).gpsLat
    const lon = (obj.userData as any).gpsLon
    if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
      return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
    }
    const sgl = (obj.userData as any).streetsGLPosition
    if (sgl && typeof sgl.x === 'number' && typeof sgl.z === 'number') {
      try {
        const ll = streetsGLToLatLon(sgl.x, sgl.z)
        if (Number.isFinite(ll.lat) && Number.isFinite(ll.lon)) {
          return `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}`
        }
      } catch {
        /* ignore */
      }
    }
    return null
  }, [])

  const copyGPSToClipboard = useCallback((gps: string) => {
    if (!gps) return

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(gps).catch((err) => {
        console.warn('[ObjectsPanel] Failed to copy GPS to clipboard:', err)
      })
      return
    }

    try {
      const textarea = document.createElement('textarea')
      textarea.value = gps
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    } catch (err) {
      console.warn('[ObjectsPanel] Fallback copy failed:', err)
    }
  }, [])

  // Filter and sort nodes
  const filteredAndSortedNodes = useMemo(() => {
    let nodes: SceneNode[] = []
    
    if (viewMode === 'table') {
      // Flatten tree for table view
      nodes = flattenTree(sceneTree)
      
      // Apply search filter for table view
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        nodes = nodes.filter(node => {
          const displayName = getDisplayName(node)
          return displayName.toLowerCase().includes(query) ||
                 node.type.toLowerCase().includes(query) ||
                 (node.object.name && node.object.name.toLowerCase().includes(query))
        })
      }
    } else {
      // For tree view, filter recursively
      const filterTree = (nodeList: SceneNode[]): SceneNode[] => {
        return nodeList.filter(node => {
          const displayName = getDisplayName(node)
          const matchesSearch = !searchQuery || 
            displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (node.object.name && node.object.name.toLowerCase().includes(searchQuery.toLowerCase()))
          
          if (!matchesSearch && node.children.length > 0) {
            // Check if any child matches
            const filteredChildren = filterTree(node.children)
            if (filteredChildren.length > 0) {
              return true // Keep parent if child matches
            }
          }
          
          return matchesSearch
        }).map(node => ({
          ...node,
          children: filterTree(node.children)
        }))
      }
      nodes = filterTree(sceneTree)
    }
    
    // Sort nodes (only for table view - tree view preserves hierarchy)
    if (viewMode === 'table') {
      if (sortBy === 'name') {
        nodes.sort((a, b) => {
          const nameA = getDisplayName(a)
          const nameB = getDisplayName(b)
          const comparison = nameA.localeCompare(nameB)
          return sortDirection === 'asc' ? comparison : -comparison
        })
      } else if (sortBy === 'size') {
        nodes.sort((a, b) => {
          const sizeA = a.size || 0
          const sizeB = b.size || 0
          return sortDirection === 'asc' ? sizeA - sizeB : sizeB - sizeA
        })
      } else if (sortBy === 'triangles') {
        nodes.sort((a, b) => {
          const triA = a.triangles || 0
          const triB = b.triangles || 0
          return sortDirection === 'asc' ? triA - triB : triB - triA
        })
      }
    }
    
    return nodes
  }, [sceneTree, searchQuery, viewMode, sortBy, sortDirection, flattenTree, getDisplayName])

  // Format size for display
  const formatSize = useCallback((bytes: number | undefined): string => {
    if (!bytes || bytes === 0) return '0 B'
    const mb = bytes / (1024 * 1024)
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`
    }
    const kb = bytes / 1024
    if (kb >= 1) {
      return `${kb.toFixed(1)} KB`
    }
    return `${bytes} B`
  }, [])

  // Check if object is large (over 50MB or 500k triangles)
  const isLargeObject = useCallback((node: SceneNode): boolean => {
    const sizeMB = (node.size || 0) / (1024 * 1024)
    const triangles = node.triangles || 0
    return sizeMB > 50 || triangles > 500000
  }, [])

  // Detect duplicate models (same geometry signature)
  const detectDuplicates = useMemo(() => {
    const signatureMap = new Map<string, SceneNode[]>()
    
    // Exclude Gaussian splat viewer internals (callback mesh, splat mesh) from duplicate detection
    const isDescendantOfSplatViewer = (obj: THREE.Object3D): boolean => {
      let p = obj.parent
      while (p) {
        if ((p as any).userData?.isGaussianSplatViewer) return true
        p = p.parent
      }
      return false
    }
    
    const addNode = (node: SceneNode) => {
      if (isDescendantOfSplatViewer(node.object)) return
      // Create a signature based on triangles, size, and name pattern
      if (node.triangles && node.triangles > 0 && node.size && node.size > 0) {
        // Round to avoid minor differences
        const triRounded = Math.round(node.triangles / 100) * 100
        const sizeRounded = Math.round(node.size / (1024 * 1024) * 10) / 10 // Round to 0.1 MB
        
        const signature = `${triRounded}-${sizeRounded}`
        
        if (!signatureMap.has(signature)) {
          signatureMap.set(signature, [])
        }
        signatureMap.get(signature)!.push(node)
      }
    }
    
    // Collect all nodes
    const collectNodes = (nodeList: SceneNode[]) => {
      nodeList.forEach(node => {
        addNode(node)
        if (node.children.length > 0) {
          collectNodes(node.children)
        }
      })
    }
    collectNodes(sceneTree)
    
    // Find duplicates (signatures with more than one node)
    const duplicates = new Set<SceneNode>()
    signatureMap.forEach((nodes, signature) => {
      if (nodes.length > 1) {
        // Check if they're actually the same model (not just parent/child)
        nodes.forEach(node => {
          // Only mark as duplicate if it's not a parent-child relationship
          const isParentChild = nodes.some(other => 
            other !== node && (
              node.object.parent === other.object ||
              other.object.parent === node.object
            )
          )
          if (!isParentChild) {
            duplicates.add(node)
          }
        })
      }
    })
    
    // Log duplicates if found
    if (duplicates.size > 0) {
      console.warn(`[ObjectsPanel] ⚠️ Detected ${duplicates.size} duplicate model(s) with identical geometry signatures. This may indicate the same model was loaded multiple times.`)
    }
    
    return duplicates
  }, [sceneTree])

  // Check if node is a duplicate
  const isDuplicate = useCallback((node: SceneNode): boolean => {
    return detectDuplicates.has(node)
  }, [detectDuplicates])

  // Handle sort column click
  const handleSort = useCallback((column: 'name' | 'size' | 'triangles') => {
    if (sortBy === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDirection('desc') // Default to descending for size/triangles
    }
  }, [sortBy])

  // Render table view
  const renderTableView = useCallback(() => {
    if (filteredAndSortedNodes.length === 0) {
      return (
        <div className="empty-message">
          <p>No objects found</p>
          {searchQuery && <p className="hint">Try a different search query</p>}
        </div>
      )
    }

    return (
      <div className="objects-table-container">
        <table className="objects-table">
          <thead>
            <tr>
              <th 
                className={`sortable ${sortBy === 'name' ? 'active' : ''}`}
                onClick={() => handleSort('name')}
              >
                Name {sortBy === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'triangles' ? 'active' : ''}`}
                onClick={() => handleSort('triangles')}
              >
                Triangles {sortBy === 'triangles' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th 
                className={`sortable ${sortBy === 'size' ? 'active' : ''}`}
                onClick={() => handleSort('size')}
              >
                Size {sortBy === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              {renderMode === 'city' && <th className="table-cell-gps-header">GPS</th>}
              <th>Use</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedNodes.map((node) => {
              const isLarge = isLargeObject(node)
              const nodeIsDuplicate = isDuplicate(node)
              const isSelected = selectedObject === node.object
              const isMultiSelected = selectedObjects.has(node.object)
              const isLocked = node.object.userData.isLocked === true
              
              return (
                <tr
                  key={`table-${node.object.id}`}
                  className={`table-row ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isLarge ? 'large-object' : ''} ${nodeIsDuplicate ? 'duplicate-object' : ''} ${isLocked ? 'locked-object' : ''}`}
                  onClick={(e) => {
                    // Don't trigger row click if clicking on input or action buttons
                    const target = e.target as HTMLElement
                    if (target.closest('input, button, .table-cell-actions')) {
                      return
                    }
                    // Allow clicks on name cell to select (single click)
                    // Double-click is handled by the cell's onDoubleClick
                    // Pass the React event which has ctrlKey/metaKey
                    // Make sure we're using the native event for key detection
                    const nativeEvent = e.nativeEvent as MouseEvent
                    const syntheticEvent = {
                      ...e,
                      ctrlKey: nativeEvent.ctrlKey || e.ctrlKey,
                      metaKey: nativeEvent.metaKey || e.metaKey,
                      shiftKey: nativeEvent.shiftKey || e.shiftKey
                    } as React.MouseEvent
                    handleNodeClick(node, syntheticEvent)
                  }}
                  onDoubleClick={(e) => {
                    // Don't trigger double click if clicking on input, action buttons, or name cell (for double-click rename)
                    if ((e.target as HTMLElement).closest('input, button, .table-cell-actions, .table-cell-name')) {
                      return
                    }
                    handleNodeDoubleClick(node, e)
                  }}
                  title={
                    nodeIsDuplicate 
                      ? '⚠️ Duplicate model detected - same geometry loaded multiple times' 
                      : isLarge 
                        ? '⚠️ Large object - may impact performance' 
                        : isLocked
                          ? '🔒 Object is locked - cannot be moved'
                          : node.name
                  }
                >
                  <td 
                    className="table-cell-name" 
                    onClick={(e) => {
                      // Allow single click to bubble up to row for selection
                      // Only stop if we're in rename mode (input is visible)
                      const isCurrentlyRenaming = renamingNode && renamingNode.object.id === node.object.id
                      if (isCurrentlyRenaming) {
                        e.stopPropagation()
                      }
                      // Otherwise let it bubble to row for selection
                    }}
                    onDoubleClick={(e) => {
                      console.log('[ObjectsPanel] Double-click on name cell', { nodeName: node.name })
                      e.stopPropagation()
                      e.preventDefault()
                      // Only start rename if not already renaming
                      const isCurrentlyRenaming = renamingNode && renamingNode.object.id === node.object.id
                      if (!isCurrentlyRenaming) {
                        console.log('[ObjectsPanel] Starting rename for:', node.name)
                        handleRename(node, e)
                      } else {
                        console.log('[ObjectsPanel] Already renaming this node')
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Double-click to rename"
                  >
                    <span className="node-icon">{node.object instanceof THREE.Mesh ? '📄' : '📦'}</span>
                    {renamingNode && renamingNode.object.id === node.object.id ? (
                      <input
                        key={`rename-input-${node.object.id}`}
                        ref={renameInputRef}
                        type="text"
                        defaultValue={renameValue}
                        onChange={(e) => {
                          const newValue = e.target.value
                          console.log('[ObjectsPanel] Input onChange (table)', { value: newValue, length: newValue.length })
                          setRenameValue(newValue)
                        }}
                        onBlur={(e) => {
                          const finalValue = e.target.value
                          console.log('[ObjectsPanel] Input onBlur (table) - submitting rename', { value: finalValue })
                          handleRenameSubmit(node, finalValue)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const currentValue = (e.target as HTMLInputElement).value
                            console.log('[ObjectsPanel] Enter pressed (table) - submitting rename', { value: currentValue })
                            e.preventDefault()
                            handleRenameSubmit(node, currentValue)
                          } else if (e.key === 'Escape') {
                            console.log('[ObjectsPanel] Escape pressed (table) - cancelling rename')
                            e.preventDefault()
                            handleRenameCancel()
                          }
                          e.stopPropagation()
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onFocus={(e) => {
                          console.log('[ObjectsPanel] Input focused (table)', { value: e.target.value })
                          e.stopPropagation()
                        }}
                        className="node-name-input"
                        style={{
                          padding: '2px 4px',
                          fontSize: '13px',
                          border: '1px solid #4a9eff',
                          borderRadius: '3px',
                          backgroundColor: '#1a1a1a',
                          color: '#fff',
                          outline: 'none',
                          minWidth: '100px',
                          maxWidth: '200px',
                          flex: 1,
                          display: 'inline-block'
                        }}
                        autoFocus
                      />
                    ) : (
                      <span 
                        className="node-name-text"
                        onClick={(e) => {
                          // Prevent single click from selecting when double-clicking
                          e.stopPropagation()
                        }}
                        onMouseDown={(e) => {
                          // Prevent row click on double-click
                          if (e.detail === 2) {
                            e.stopPropagation()
                          }
                        }}
                      >
                        {node.name}
                      </span>
                    )}
                    {nodeIsDuplicate && <span className="duplicate-badge" title="Duplicate model">🔄</span>}
                    {isLarge && <span className="large-badge">⚠️</span>}
                    {isLocked && <span className="lock-badge" title="Locked">🔒</span>}
                  </td>
                  <td className="table-cell-number">
                    {node.triangles ? node.triangles.toLocaleString() : '-'}
                  </td>
                  <td className="table-cell-number">
                    {formatSize(node.size)}
                  </td>
                  {renderMode === 'city' && (() => {
                    const gps = formatGPS(node.object)
                    return (
                      <td className="table-cell-gps" title={gps || 'No GPS data'}>
                        {gps ?? '—'}
                        {gps && (
                          <button
                            className="gps-copy-button"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyGPSToClipboard(gps)
                            }}
                            title="Copy GPS coordinates"
                          >
                            📋
                          </button>
                        )}
                      </td>
                    )
                  })()}
                  <td className="table-cell-number">
                    {node.useCount || 1}
                  </td>
                  <td className="table-cell-actions" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        className="action-button"
                        onClick={(e) => handleRename(node, e)}
                        title="Rename"
                        style={{ fontSize: '12px', padding: '2px 4px' }}
                      >
                        ✏️
                      </button>
                      <button
                        className="action-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (frameObject) {
                            frameObject(node.object)
                          }
                        }}
                        title="Focus on object"
                        style={{ fontSize: '12px', padding: '2px 4px' }}
                      >
                        🎯
                      </button>
                      <button
                        className="action-button"
                        onClick={(e) => handleToggleVisible(node, e)}
                        title={node.object.visible ? 'Hide' : 'Show'}
                        style={{ fontSize: '12px', padding: '2px 4px' }}
                      >
                        {node.object.visible ? '👁️' : '🚫'}
                      </button>
                      <button
                        className="action-button"
                        onClick={(e) => handleToggleLock(node, e)}
                        title={isLocked ? 'Unlock' : 'Lock'}
                        style={{ fontSize: '12px', padding: '2px 4px' }}
                      >
                        {isLocked ? '🔒' : '🔓'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }, [filteredAndSortedNodes, searchQuery, sortBy, sortDirection, handleSort, isLargeObject, isDuplicate, selectedObject, handleNodeClick, handleNodeDoubleClick, handleToggleVisible, handleToggleLock, handleRename, frameObject, formatSize, renderMode, formatGPS])

  if (!showObjectsPanel) return null

  // Do NOT auto-expand the whole tree on initial load.
  // The user will manually expand nodes as needed.

  // Auto-expand to show selected object
  useEffect(() => {
    if (!selectedObject || !showObjectsPanel) return

    const expandToObject = (nodes: SceneNode[]): boolean => {
      for (const node of nodes) {
        if (node.object === selectedObject) {
          return true // Found it at this level
        }
        if (expandToObject(node.children)) {
          // Found it in children, expand this node
          setExpandedNodes(prev => new Set(prev).add(`node-${node.object.id}`))
          return true
        }
      }
      return false
    }

    expandToObject(sceneTree)
  }, [selectedObject, showObjectsPanel, sceneTree])

  return (
    <div
      ref={panelRef}
      className={`objects-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="objects-panel-header" onMouseDown={handleMouseDown}>
        <h3>📦 Scene Hierarchy</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleObjectsPanel}>
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
      <div className="objects-panel-content">
        {sceneTree.length === 0 ? (
          <div className="empty-message">
            <p>No objects in scene</p>
            <p className="hint">Load a 3D model to see the hierarchy</p>
          </div>
        ) : (
          <>
            {/* Search and View Mode Controls */}
            <div className="objects-panel-controls">
              <div className="search-container">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search objects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    className="clear-search-button"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="view-mode-toggle">
                <button
                  className={`view-mode-button ${viewMode === 'tree' ? 'active' : ''}`}
                  onClick={() => setViewMode('tree')}
                  title="Tree View"
                >
                  🌳 Tree
                </button>
                <button
                  className={`view-mode-button ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table View"
                >
                  📊 Table
                </button>
              </div>
            </div>

            <div className="toolbar-actions">
              <button onClick={handleShowAll} className="toolbar-button">
                Show All
              </button>
              <button 
                onClick={handleUndo} 
                className="toolbar-button" 
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                ↶ Undo
              </button>
              <div className="instancing-actions">
                {selectedObjects.size > 0 && (
                  <span className="selection-counter">
                    {selectedObjects.size} selected
                  </span>
                )}
                <button 
                  onClick={handleConvertToInstances} 
                  className="toolbar-button" 
                  disabled={selectedObjects.size < 2}
                  title={`Convert selected objects to InstancedMesh (${selectedObjects.size} selected, Shift+Click to multi-select)`}
                >
                  🔄 To Instance
                </button>
                <button 
                  onClick={handleConvertAllDuplicates} 
                  className="toolbar-button" 
                  title="Find and convert all duplicate objects in scene to instances"
                >
                  🔍 Auto-Instance
                </button>
              </div>
            </div>

            {/* Render Tree or Table View */}
            {viewMode === 'table' ? (
              renderTableView()
            ) : (
            <div className="tree-container">
                {filteredAndSortedNodes.map(node => renderNode(node, 0))}
            </div>
            )}

            <div className="hint-text">
              💡 Click to select • Shift+Click to multi-select • Double-click to center • Ctrl+Z to undo • 🗑️ Delete
              {viewMode === 'table' && ' • Click column headers to sort'}
            </div>
          </>
        )}
      </div>
      )}
    </div>
  )
}
