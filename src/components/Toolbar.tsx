import { useRef, useState, useEffect, useMemo, Fragment } from 'react'
import type { ChangeEvent } from 'react'
import * as THREE from 'three'
import { useViewer, getSharedViewer } from '../viewer/useViewer'
import type { ViewerInstance } from '../viewer/ViewerCanvas'
import { useAppStore } from '../store/useAppStore'
import { loadHDR } from '../viewer/loaders/hdrLoader'
import { loadTexture } from '../viewer/loaders/textureLoader'
import { extractTexturesFromModelFile, loadTextureImages } from '../utils/extractTexturesFromModel'
import { createTransformIconDataUrl } from '../utils/createTransformIcon'
import { MENU_SECTIONS, type MenuSectionId, type MenuActionId } from '../config/toolbarMenu'
import { downloadProjectSnapshot, downloadPackagedProject, loadProjectFromFile } from '../utils/projectPersistence'
import './Toolbar.css'
import RenderModeSelector from './RenderModeSelector'
import { captureViewerScreenshot } from '../viewer/utils/screenshotCapture'

// Cache the transform icon data URL
let transformIconDataUrl: string | null = null

// Viewing Distance Control Component
function ViewingDistanceControl() {
  const { viewingDistance, setViewingDistance } = useAppStore()
  
  const formatDistance = (value: number | undefined | null): string => {
    // Handle undefined/null/NaN values
    if (value === undefined || value === null || isNaN(value) || typeof value !== 'number') {
      return '0'
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k`
    }
    return value.toFixed(0)
  }
  
  // Ensure viewingDistance has a valid value with multiple fallbacks
  const safeViewingDistance = (viewingDistance !== undefined && viewingDistance !== null && !isNaN(viewingDistance)) 
    ? viewingDistance 
    : 100000
  
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '6px',
      padding: '0 8px',
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '4px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>View:</span>
      <input
        type="range"
        min="1000"
        max="1000000"
        step="1000"
        value={safeViewingDistance}
        onChange={(e) => setViewingDistance(Number(e.target.value))}
        style={{ width: '80px', cursor: 'pointer' }}
        title={`Viewing Distance: ${formatDistance(safeViewingDistance)} units`}
      />
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', minWidth: '35px', textAlign: 'right' }}>
        {formatDistance(safeViewingDistance)}
      </span>
    </div>
  )
}

const ACTION_LABELS: Record<MenuActionId, string> = {
  openFiles: 'Open Files',
  openFolder: 'Open Folder',
  loadUrl: 'Load URL',
  fitView: 'Fit',
  resetScene: 'Reset',
  screenshot: 'Screenshot',
  exportPresentation: 'Export Web',
  toggleFullscreen: 'Toggle Fullscreen',
  toggleStats: 'Toggle Stats',
  toggleTransformPanel: 'Transform',
  toggleLightingPanel: 'Lighting',
  toggleObjectsPanel: 'Objects',
  toggleCameraViewsPanel: 'Camera',
  toggleRenderingQualityPanel: 'Quality',
  toggleWeatherPanel: 'Weather',
  togglePathTracer: 'Path Trace',
  toggleMaterialPanel: 'Material',
  toggleTextureManagementPanel: 'Textures',
  toggleOptimizationPanel: 'Optimize',
  toggleShadowPlane: 'Plane',
  toggleShortcuts: 'Shortcuts',
  resetMenuLayout: 'Reset Menu',
  saveMenuLayout: 'Save Menu',
  saveProject: 'Save Project',
  loadProject: 'Load Project',
  toggleTodoPanel: 'TODOS',
  togglePrimitivesPanel: 'Primitives',
  toggleRenderingEffectsPanel: 'Effects',
  toggleEdgeEnhancementPanel: 'Edge',
  toggleSmoothingPanel: 'Smooth',
  togglePointCloudPanel: 'Point Cloud',
  toggleOSMGroundV2Panel: 'OSM 3D',
  togglePlacesPanel: 'Places',
  togglePolygonDrawingPanel: 'Polygons',
  toggleHotspotsPanel: 'Hotspots',
  toggleRoomsPanel: 'Rooms',
  toggleRevitConnectionPanel: 'Revit Live',
  toggleCubesViewer: 'Cubes',
  toggleAIEnhancementPanel: 'AI Enhance',
  toggleShaderEditorPanel: 'Shader Demo',
  toggleShadowSystemTestPanel: 'Shadow Tests',
  toggleHDRTestPanel: 'HDR Tests',
  toggleHDRShadowDemoPanel: 'HDR Shadow Demo',
  toggleStreetsGLDemo: 'Streets GL Demo'
}

type BrowserFileHandle = FileSystemFileHandle | FileSystemDirectoryHandle


function ExportPresentationButton() {
  const { toggleWebExportPanel } = useAppStore()
  
  return (
    <button 
      onClick={toggleWebExportPanel} 
      className="toolbar-button" 
      title="Export for Web (Presentation Mode)"
    >
      🌐 Export Web
    </button>
  )
}

export default function Toolbar() {
  // Generate transform icon once
  if (!transformIconDataUrl) {
    transformIconDataUrl = createTransformIconDataUrl(64)
  }
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const projectFileInputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(true)
  const { loadFromFile, loadFromUrl, reset, frameObject, viewer } = useViewer()
  
  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [])
  
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      const element = document.documentElement
      if (element.requestFullscreen) {
        element.requestFullscreen()
      } else if ((element as any).webkitRequestFullscreen) {
        (element as any).webkitRequestFullscreen()
      } else if ((element as any).mozRequestFullScreen) {
        (element as any).mozRequestFullScreen()
      } else if ((element as any).msRequestFullscreen) {
        (element as any).msRequestFullscreen()
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen()
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen()
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen()
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen()
      }
    }
  }
  
  type DragPayload = {
    actionId: MenuActionId
    sectionId: MenuSectionId
  }
  
  const DRAG_DATA_MIME = 'application/x-toolbar-action'

  const [draggingAction, setDraggingAction] = useState<DragPayload | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<{
    section: MenuSectionId
    index: number
    position?: 'before' | 'after' | 'row-after' | 'row-break'
  } | null>(null)
  
  const {
    setError,
    setLoading,
    setProgress,
    setLoadingMessage,
    showStats,
  menuLayout,
  menuRowBreaks,
    transformMode,
    selectedObject,
    showLightingPanel,
    showShadowPlane,
    pivotMode,
    toggleStats,
    setTransformMode,
    setSelectedObject,
    toggleLightingPanel,
    showMaterialPanel,
    toggleMaterialPanel,
    showTextureManagementPanel,
    toggleTextureManagementPanel,
    setPendingModelLoad,
    showOptimizationPanel,
    toggleOptimizationPanel,
    showObjectsPanel,
    toggleObjectsPanel,
    showRenderingQualityPanel,
    toggleRenderingQualityPanel,
    showCameraViewsPanel,
    toggleCameraViewsPanel,
    showWeatherPanel,
    toggleWeatherPanel,
    showTransformPanel,
    toggleTransformPanel,
    showPathTracerPreview,
    togglePathTracerPreview,
    pathTracerActive,
    setPathTracerActive,
    toggleShadowPlane,
    setPivotMode,
    selectedMaterial,
    textureAnisotropy,
    toggleShortcutsOverlay,
  saveMenuLayoutToStorage,
  loadMenuLayoutFromStorage,
  moveMenuAction,
  toggleTodoPanel,
  showTodoPanel,
  todoItems,
  togglePrimitivesPanel,
  showPrimitivesPanel,
    toggleRenderingEffectsPanel,
    showRenderingEffectsPanel,
    toggleEdgeEnhancementPanel,
    showEdgeEnhancementPanel,
    toggleSmoothingPanel,
    showSmoothingPanel,
    togglePointCloudPanel,
    showPointCloudPanel,
    toggleOSMGroundV2Panel,
    showOSMGroundV2Panel,
    togglePlacesPanel,
    showPlacesPanel,
    togglePolygonDrawingPanel,
    showPolygonDrawingPanel,
    toggleHotspotsPanel,
    showHotspotsPanel,
    toggleRoomsPanel,
    showRoomsPanel,
    toggleRevitConnectionPanel,
    showRevitConnectionPanel,
    toggleCubesViewer,
    showCubesViewer,
    toggleStreetsGLDemo,
    showStreetsGLDemo,
    toggleAIEnhancementPanel,
    showAIEnhancementPanel,
    toggleShaderEditorPanel,
    showShaderEditorPanel,
    toggleShadowSystemTestPanel,
    showShadowSystemTestPanel,
    toggleHDRTestPanel,
    showHDRTestPanel,
    toggleHDRShadowDemoPanel,
    showHDRShadowDemoPanel,
  resetMenuLayout,
  shadowPlaneTransparent,
  setShadowPlaneTransparent,
    canUndo,
    canRedo,
    undo,
    redo
  } = useAppStore()

  const pendingTodoCount = useMemo(
    () => todoItems.filter((item) => item.status !== 'completed').length,
    [todoItems]
  )

  const [showFitMenu, setShowFitMenu] = useState(false)
  const [showShadowMenu, setShowShadowMenu] = useState(false)

  useEffect(() => {
    loadMenuLayoutFromStorage()
  }, [loadMenuLayoutFromStorage])


  const handleDragStart = (
  event: React.DragEvent<HTMLElement>,
    actionId: MenuActionId,
    sectionId: MenuSectionId
  ) => {
    const payload: DragPayload = { actionId, sectionId }
    event.dataTransfer?.setData(DRAG_DATA_MIME, JSON.stringify(payload))
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
    setDraggingAction(payload)
  }

  const handleDragEnd = () => {
    setDraggingAction(null)
    setDragOverTarget(null)
  }

  const handleItemDragOver = (
    event: React.DragEvent<HTMLElement>,
    section: MenuSectionId,
    index: number
  ) => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    const element = event.currentTarget as HTMLElement
    const rect = element.getBoundingClientRect()
    
    // IMPROVED: Better detection zones for more precise drop positioning
    // Use smaller thresholds for more responsive dragging
    const bottomThreshold = Math.min(12, rect.height * 0.4) // Reduced from 16 and 0.5
    const withinBottomZone = event.clientY >= rect.bottom - bottomThreshold
    
    // IMPROVED: Use a more precise left/right detection with a dead zone in the middle
    // This allows dropping "before" (left side) or "after" (right side) more easily
    const itemCenterX = rect.left + rect.width / 2
    const mouseX = event.clientX
    const horizontalDeadZone = rect.width * 0.3 // 30% dead zone in center
    const leftZoneEnd = rect.left + horizontalDeadZone
    const rightZoneStart = rect.right - horizontalDeadZone
    
    let position: 'before' | 'after' | 'row-after'
    if (withinBottomZone) {
      position = 'row-after'
    } else if (mouseX < leftZoneEnd) {
      // Left side = before
      position = 'before'
    } else if (mouseX > rightZoneStart) {
      // Right side = after
      position = 'after'
    } else {
      // In dead zone - use default based on which side of center
      position = mouseX < itemCenterX ? 'before' : 'after'
    }

    setDragOverTarget((current) => {
      if (
        current &&
        current.section === section &&
        current.index === index &&
        current.position === position
      ) {
        return current
      }
      return { section, index, position }
    })
  }

  const handleItemDragLeave = (
    event: React.DragEvent<HTMLElement>,
    section: MenuSectionId,
    index: number
  ) => {
    const related = event.relatedTarget as Node | null
    if (related && event.currentTarget.contains(related)) {
      return
    }
    setDragOverTarget((current) => {
      if (current && current.section === section && current.index === index) {
        return null
      }
      return current
    })
  }

  const handleItemDrop = (
    event: React.DragEvent<HTMLElement>,
    section: MenuSectionId,
    index: number
  ) => {
    event.preventDefault()
    const payload = parseDragPayload(event)
    if (!payload) {
      setDragOverTarget(null)
      setDraggingAction(null)
      return
    }
    const element = event.currentTarget as HTMLElement
    const rect = element.getBoundingClientRect()
    const actions = menuLayout[section] ?? []
    const rowBreaksForSection = menuRowBreaks[section] ?? []
    const dropAfterActionId = actions[index] ?? null
    const hasExistingBreakAfterTarget = dropAfterActionId
      ? rowBreaksForSection.includes(dropAfterActionId)
      : false
    
    // IMPROVED: Use same improved detection logic as handleItemDragOver
    const bottomThreshold = Math.min(12, rect.height * 0.4)
    const withinBottomZone = event.clientY >= rect.bottom - bottomThreshold
    
    const itemCenterX = rect.left + rect.width / 2
    const mouseX = event.clientX
    const horizontalDeadZone = rect.width * 0.3
    const leftZoneEnd = rect.left + horizontalDeadZone
    const rightZoneStart = rect.right - horizontalDeadZone
    
    const withinAfterZone = mouseX > rightZoneStart || (mouseX > itemCenterX && mouseX >= leftZoneEnd)
    const withinBeforeZone = mouseX < leftZoneEnd || (mouseX < itemCenterX && mouseX <= rightZoneStart)

    let targetIndex = index
    let rowBreakMode: 'inherit' | 'add' | 'remove' = 'inherit'

    if (withinBottomZone) {
      // Dropping below = new row
      targetIndex = index + 1
      rowBreakMode = 'add'
    } else if (withinAfterZone) {
      // Dropping on right side = after this item
      targetIndex = index + 1
      if (hasExistingBreakAfterTarget) {
        rowBreakMode = 'remove'
      }
    } else if (withinBeforeZone) {
      // Dropping on left side = before this item
      targetIndex = index
      // Check if preceding item has a break that should be removed
      const precedingIndex = index - 1
      if (precedingIndex >= 0) {
        const precedingActionId = actions[precedingIndex]
        if (precedingActionId && rowBreaksForSection.includes(precedingActionId)) {
          rowBreakMode = 'remove'
        }
      }
    } else {
      // Fallback: use index position
      targetIndex = index
    }

    moveMenuAction(payload.actionId, section, targetIndex, payload.sectionId, { rowBreakMode })
    setDragOverTarget(null)
    setDraggingAction(null)
  }

  const handleRowBreakDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    setDragOverTarget((current) => {
      if (
        current &&
        current.section === section &&
        current.index === index &&
        current.position === 'row-break'
      ) {
        return current
      }
      return { section, index, position: 'row-break' }
    })
  }

  const handleRowBreakLeave = (
    _event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    setDragOverTarget((current) => {
      if (
        current &&
        current.section === section &&
        current.index === index &&
        current.position === 'row-break'
      ) {
        return null
      }
      return current
    })
  }

  const handleRowBreakDrop = (
    event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    event.preventDefault()
    const payload = parseDragPayload(event)
    if (!payload) {
      setDragOverTarget(null)
      setDraggingAction(null)
      return
    }
    moveMenuAction(payload.actionId, section, index + 1, payload.sectionId, { rowBreakMode: 'add' })
    setDragOverTarget(null)
    setDraggingAction(null)
  }

  const handleSectionDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    if (event.target !== event.currentTarget) {
      return
    }
    event.preventDefault()
    setDragOverTarget({ section, index })
  }

  const handleSectionDrop = (
    event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    if (event.target !== event.currentTarget) {
      return
    }
    event.preventDefault()
    const payload = parseDragPayload(event)
    if (!payload) {
      setDragOverTarget(null)
      setDraggingAction(null)
      return
    }
    moveMenuAction(payload.actionId, section, index, payload.sectionId)
    setDragOverTarget(null)
    setDraggingAction(null)
  }

  const parseDragPayload = (event: React.DragEvent): DragPayload | null => {
    const data = event.dataTransfer?.getData(DRAG_DATA_MIME)
    if (!data) return null
    try {
      const parsed = JSON.parse(data)
      if (parsed?.actionId && parsed?.sectionId) {
        return parsed as DragPayload
      }
    } catch (error) {
      console.warn('[Toolbar] Failed to parse drag payload', error)
    }
    return null
  }

  const handleDragOverZone = (
    event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    setDragOverTarget((current) => {
      if (current && current.section === section && current.index === index) {
        return current
      }
      return { section, index }
    })
  }

  const handleDragLeaveZone = (
    _event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    setDragOverTarget((current) => {
      if (current && current.section === section && current.index === index) {
        return null
      }
      return current
    })
  }

  const handleDropOnZone = (
    event: React.DragEvent<HTMLDivElement>,
    section: MenuSectionId,
    index: number
  ) => {
    event.preventDefault()
    const payload = parseDragPayload(event)
    if (!payload) {
      setDragOverTarget(null)
      setDraggingAction(null)
      return
    }
    moveMenuAction(payload.actionId, section, index, payload.sectionId)
    setDragOverTarget(null)
    setDraggingAction(null)
  }

  const handleSaveMenuLayout = () => {
    try {
      saveMenuLayoutToStorage()
      alert('Menu layout saved locally for this browser.')
    } catch (error) {
      console.error('[MenuLayout] Failed to save layout', error)
      setError('Failed to save menu layout. See console for details.')
    }
  }

  const handleSaveProject = async (packaged: boolean = false, chooseFolder: boolean = false) => {
    try {
      setError(null)
      setLoading(true)
      setProgress(0)
      setLoadingMessage(packaged ? 'Creating packaged project with all resources...' : 'Preparing project snapshot...')
      setProgress(0)
      
      if (packaged) {
        await downloadPackagedProject(true, chooseFolder)
        setLoadingMessage(chooseFolder ? 'Packaged project saved to selected folder' : 'Packaged project downloaded (ZIP with all resources)')
      } else {
        await downloadProjectSnapshot(chooseFolder, (progress, message) => {
          setProgress(progress)
          setLoadingMessage(message)
        })
        setLoadingMessage(chooseFolder ? 'Project saved to selected folder' : 'Project snapshot downloaded')
      }
      
      setProgress(100)
    } catch (err) {
      console.error('[Project] Failed to save project:', err)
      setError(err instanceof Error ? err.message : 'Failed to save project.')
    } finally {
      setLoading(false)
      setProgress(0)
      setLoadingMessage(null)
    }
  }

  const handleLoadProject = () => {
    if (projectFileInputRef.current) {
      projectFileInputRef.current.value = ''
      projectFileInputRef.current.click()
    }
  }

  const handleProjectFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setError(null)
      setLoading(true)
      setProgress(0)
      setLoadingMessage(`Loading project "${file.name}"...`)
      await loadProjectFromFile(file)
      setProgress(100)
      setLoadingMessage(`Project "${file.name}" loaded.`)
    } catch (err) {
      console.error('[Project] Failed to load project:', err)
      setError(err instanceof Error ? err.message : 'Failed to load the selected project file.')
    } finally {
      setTimeout(() => {
        setLoading(false)
        setProgress(0)
        setLoadingMessage(null)
      }, 250)

      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const handlePathTracerButton = () => {
    const willOpen = !showPathTracerPreview

    if (willOpen) {
      // Open the panel without auto-starting; user can press Start manually
      setPathTracerActive(false)
      togglePathTracerPreview()
    } else {
      // CRITICAL: Check if path tracer is paused at max before stopping
      // If paused at max, don't stop - let user download the result first
      const pathTracerDemo = (window as any).__pathTracerDemo
      const isPausedAtMax = pathTracerDemo && typeof pathTracerDemo.isPausedAtMax === 'function' && pathTracerDemo.isPausedAtMax()
      
      if (isPausedAtMax) {
        console.log('[Toolbar] Path tracer is paused at max samples - keeping active for download')
        // Just close the panel, but keep pathTracerActive true so the tracer stays paused
        togglePathTracerPreview()
        return
      }
      
      setPathTracerActive(false)
      togglePathTracerPreview()
    }
  }

  const setFileRelativePath = (file: File, relativePath: string) => {
    try {
      Object.defineProperty(file, 'webkitRelativePath', {
        value: relativePath,
        configurable: true
      })
    } catch {
      try {
        ;(file as any).webkitRelativePath = relativePath
      } catch {
        // Ignore if we cannot assign - fallback loaders will use filename
      }
    }
  }

  const processSelectedFiles = async (fileArray: File[]) => {
    if (!fileArray || fileArray.length === 0) {
      return
    }
    setError(null)
    setLoading(true)
    setProgress(0)

    try {
      // Check if files came from folder selection (have webkitRelativePath)
      const hasFolderContext = fileArray.some(file => (file as any).webkitRelativePath)
      
      // If files don't have folder context (single file selection), use them as-is
      // The GLTF loader will try to match textures by filename even without full folder context
      let allFiles = fileArray
      
      // If files don't have folder context, add a simple relative path for better matching
      if (!hasFolderContext) {
        fileArray.forEach(file => {
          if (!(file as any).webkitRelativePath) {
            // Use just the filename as relative path - this helps with filename-based matching
            setFileRelativePath(file, file.name)
          }
        })
      }
      
      // Find model files
      const modelFiles = allFiles.filter((file) => {
        const ext = file.name.toLowerCase().split('.').pop()
        return ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'splat', 'ksplat', '3mf', 'dae', '3ds', 'dxf', 'dwg', 'zip'].includes(ext || '')
      })

      if (modelFiles.length === 0) {
        setError('No supported 3D model files found. Supported formats: GLB, GLTF, FBX, OBJ, STL, PLY, SPLAT, KSPLAT, 3MF, DAE, 3DS, DXF, DWG, ZIP')
        return
      }

      // Get texture/image files and .bin files for GLTF models
      let textureFiles = new Map<string, File>()
      const addTextureFile = (file: File, relativePathHint?: string) => {
        const relativePath = (file as any).webkitRelativePath || relativePathHint || file.name
        textureFiles.set(relativePath, file)
        textureFiles.set(file.name, file)
        if (relativePath.includes('/')) {
          const parts = relativePath.split('/')
          for (let i = parts.length - 1; i >= 0; i--) {
            const subPath = parts.slice(i).join('/')
            if (!textureFiles.has(subPath)) {
              textureFiles.set(subPath, file)
            }
          }
        }
      }

      // Collect texture files and check for PNG/JPG that could be optimized
      const optimizableTextures: Array<{ file: File; originalSize: number }> = []
      const textureFileMap = new Map<File, File>() // Map original -> processed file
      
      allFiles.forEach((file) => {
        const ext = file.name.toLowerCase().split('.').pop()
        if (['jpg', 'jpeg', 'png', 'tga', 'bmp', 'webp', 'hdr', 'exr', 'ktx2', 'basis', 'bin'].includes(ext || '')) {
          // Check if this is a PNG or JPG that could be optimized
          if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
            optimizableTextures.push({ file, originalSize: file.size })
            textureFileMap.set(file, file) // Default to original
          } else {
            textureFileMap.set(file, file)
          }
        }
      })
      
      // Show optimization prompt if we have optimizable textures
      if (optimizableTextures.length > 0) {
        const totalSizeMB = (optimizableTextures.reduce((sum, t) => sum + t.originalSize, 0) / 1024 / 1024).toFixed(2)
        
        // Quick diagnostic check for very large files
        const veryLargeFiles = optimizableTextures.filter(t => t.originalSize > 50 * 1024 * 1024)
        let diagnosticWarning = ''
        if (veryLargeFiles.length > 0) {
          diagnosticWarning = `\n⚠️ WARNING: ${veryLargeFiles.length} very large file(s) detected (>50MB). Processing may be slow or hang.\nConsider using WebP (option 1) instead of KTX2 for faster processing.\n\n`
        }
        
        const formatChoice = prompt(
          `Found ${optimizableTextures.length} PNG/JPG texture(s) (${totalSizeMB} MB).${diagnosticWarning}` +
          `Optimize to:\n` +
          `1. WebP (30-50% smaller, fast, recommended for large files)\n` +
          `2. KTX2 (50-70% smaller, GPU-optimized, may be slow for large files)\n` +
          `3. Skip (use original files)\n\n` +
          `Enter 1, 2, or 3:`,
          veryLargeFiles.length > 0 ? '1' : '1'
        )
        
        if (formatChoice === '1' || formatChoice === '2') {
          const format = formatChoice === '1' ? 'webp' : 'ktx2'
          setLoadingMessage(`Optimizing ${optimizableTextures.length} texture(s) to ${format.toUpperCase()}...`)
          setProgress(5)
          
          try {
            const { optimizeTexture } = await import('../utils/textureOptimizer')
            
            // Process textures sequentially to avoid overwhelming the browser
            for (let i = 0; i < optimizableTextures.length; i++) {
              const texture = optimizableTextures[i]
              const progressBase = 5 + (i / optimizableTextures.length) * 20
              
              try {
                setLoadingMessage(`Optimizing ${texture.file.name} (${i + 1}/${optimizableTextures.length})...`)
                setProgress(progressBase)
                
                const result = await optimizeTexture(texture.file, {
                  format,
                  quality: format === 'webp' ? 0.85 : 4,
                  maxResolution: 2048,
                  generateMipmaps: format === 'ktx2',
                  onProgress: (fileProgress) => {
                    const totalProgress = progressBase + (fileProgress / optimizableTextures.length) * 20
                    setProgress(totalProgress)
                  }
                })
                
                const extension = format === 'webp' ? '.webp' : '.ktx2'
                const optimizedFile = new File(
                  [result.optimizedBlob],
                  texture.file.name.replace(/\.[^.]+$/, '') + extension,
                  { type: format === 'webp' ? 'image/webp' : 'image/ktx2' }
                )
                
                // Preserve relative path
                const originalRelativePath = (texture.file as any).webkitRelativePath || texture.file.name
                ;(optimizedFile as any).webkitRelativePath = originalRelativePath
                
                textureFileMap.set(texture.file, optimizedFile)
                
                const compressionPercent = ((1 - result.optimizedSize / result.originalSize) * 100).toFixed(1)
                console.log(`✅ [${i + 1}/${optimizableTextures.length}] Optimized ${texture.file.name}: ${(texture.originalSize / 1024).toFixed(1)}KB → ${(result.optimizedSize / 1024).toFixed(1)}KB (${compressionPercent}% smaller)`)
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                console.warn(`⚠️ Failed to optimize ${texture.file.name}:`, errorMessage)
                
                // If KTX2 fails and it's a timeout or WASM issue, offer WebP fallback
                if (format === 'ktx2' && (errorMessage.includes('timeout') || errorMessage.includes('WASM') || errorMessage.includes('basis_encoder'))) {
                  console.log(`🔄 Attempting WebP fallback for ${texture.file.name}...`)
                  try {
                    const { optimizeTexture } = await import('../utils/textureOptimizer')
                    const webpResult = await optimizeTexture(texture.file, {
                      format: 'webp',
                      quality: 0.85,
                      maxResolution: 2048,
                      onProgress: (fileProgress) => {
                        const totalProgress = progressBase + (fileProgress / optimizableTextures.length) * 20
                        setProgress(totalProgress)
                      }
                    })
                    
                    const optimizedFile = new File(
                      [webpResult.optimizedBlob],
                      texture.file.name.replace(/\.[^.]+$/, '') + '.webp',
                      { type: 'image/webp' }
                    )
                    
                    const originalRelativePath = (texture.file as any).webkitRelativePath || texture.file.name
                    ;(optimizedFile as any).webkitRelativePath = originalRelativePath
                    
                    textureFileMap.set(texture.file, optimizedFile)
                    const compressionPercent = ((1 - webpResult.optimizedSize / webpResult.originalSize) * 100).toFixed(1)
                    console.log(`✅ [${i + 1}/${optimizableTextures.length}] Fallback to WebP for ${texture.file.name}: ${(texture.originalSize / 1024).toFixed(1)}KB → ${(webpResult.optimizedSize / 1024).toFixed(1)}KB (${compressionPercent}% smaller)`)
                  } catch (fallbackError) {
                    console.warn(`⚠️ WebP fallback also failed for ${texture.file.name}, using original:`, fallbackError)
                    textureFileMap.set(texture.file, texture.file)
                  }
                } else {
                  // For other errors or WebP failures, use original
                  textureFileMap.set(texture.file, texture.file)
                }
              }
            }
            
            setProgress(25)
            setLoadingMessage('Texture optimization complete!')
          } catch (error) {
            console.error('Texture optimization failed:', error)
            // Continue with original files
          }
        }
      }
      
      // Add processed files to textureFiles map
      allFiles.forEach((file) => {
        const ext = file.name.toLowerCase().split('.').pop()
        if (['jpg', 'jpeg', 'png', 'tga', 'bmp', 'webp', 'hdr', 'exr', 'ktx2', 'basis', 'bin'].includes(ext || '')) {
          const processedFile = textureFileMap.get(file) || file
          addTextureFile(processedFile)
        }
      })

      // Files are now scanned from folder context (either webkitdirectory or File System Access API)

      // Check file size and warn if too large
      const fileSizeMB = modelFiles[0].size / 1024 / 1024
      if (fileSizeMB > 500) {
        const ext = modelFiles[0].name.toLowerCase().split('.').pop()
        const isFBX = ext === 'fbx'
        const warningMsg = isFBX 
          ? `⚠️ WARNING: This FBX file is very large (${fileSizeMB.toFixed(1)} MB).\n\nBrowser loading cannot handle files over ~1GB without crashing.\n\nRECOMMENDED: Convert to glTF/GLB format using:\n- FBX2glTF tool or Blender\n- glTF files are 60-80% smaller\n- Click "🔧 Optimize" button for detailed instructions\n\nThis file is too large to load reliably.\n\nDo you want to try anyway (will likely crash)?`
          : `WARNING: This file is very large (${fileSizeMB.toFixed(1)} MB).\n\nLoading it may cause your browser to run out of memory and crash.\n\nFor best results:\n- Reduce polygon count\n- Compress textures\n- Use glTF format instead\n- Click "🔧 Optimize" button for tools\n\nDo you want to try anyway?`
        
        const proceed = confirm(warningMsg)
        if (!proceed) {
          setLoading(false)
          setProgress(0)
          setLoadingMessage(null)
          // Open optimization panel to help user
          toggleOptimizationPanel()
          return
        }
      }

      // For GLB/GLTF files, extract textures BEFORE loading and show Texture Management Panel
      const firstModelFile = modelFiles[0]
      const isGLTF = firstModelFile.name.toLowerCase().endsWith('.gltf') || firstModelFile.name.toLowerCase().endsWith('.glb')
      
      if (isGLTF && modelFiles.length === 1) {
        // Extract textures from GLTF/GLB file BEFORE loading
        try {
          setLoadingMessage(`Extracting textures from ${firstModelFile.name}...`)
          setProgress(10)
          
          console.log('🔍 Extracting textures from model file...')
          const extractedData = await extractTexturesFromModelFile(firstModelFile)
          
          console.log('📦 Extracted texture data:', extractedData)
          
          if (extractedData && extractedData.textures.length > 0) {
            console.log(`✅ Found ${extractedData.textures.length} textures, opening Texture Management Panel...`)
            
            // Load texture images for preview
            setLoadingMessage(`Loading texture previews...`)
            setProgress(30)
            
            // Pass GLTF JSON and arrayBuffer for embedded texture extraction
            const gltfJson = (extractedData as any).gltfJson
            const arrayBuffer = (extractedData as any).arrayBuffer
            const loadedTextures = await loadTextureImages(extractedData.textures, firstModelFile, textureFiles, gltfJson, arrayBuffer)
            console.log(`🖼️ Loaded ${loadedTextures.size} texture previews`)
            
            // Store pending model load - Texture Management Panel will handle the rest
            // This will automatically open the panel
            setPendingModelLoad(
              firstModelFile,
              textureFiles,
              async (mergedTextures?: Map<string, string>) => {
                // This callback will be called after user merges textures
                console.log('▶️ Continuing model load after texture review...')
                if (mergedTextures && mergedTextures.size > 0) {
                  console.log(`📋 Applying ${mergedTextures.size} texture merge(s) during model load`)
                }
                setLoadingMessage(`Loading ${firstModelFile.name}...`)
                setProgress(50)
                
                try {
                  await loadFromFile(firstModelFile, (progress) => {
                    // Adjust progress: 50-100% for actual loading
                    setProgress(50 + (progress * 0.5))
                  }, textureFiles.size > 0 ? textureFiles : undefined, mergedTextures)
                  
                  console.log(`✅ Successfully loaded: ${firstModelFile.name}`)
                  
                  // Clear pending state
                  setPendingModelLoad(null, null, null)
                  setLoading(false)
                  setProgress(0)
                  setLoadingMessage(null)
                } catch (err) {
                  console.error(`❌ Failed to load ${firstModelFile.name}:`, err)
                  setError(err instanceof Error ? err.message : 'Failed to load file')
                  setPendingModelLoad(null, null, null)
                  setLoading(false)
                  setProgress(0)
                  setLoadingMessage(null)
                }
              }
            )
            
            // Stop loading here - wait for user to review/merge textures
            // Panel will open automatically via setPendingModelLoad
            setLoading(false)
            setProgress(0)
            setLoadingMessage(null)
            return
          } else {
            console.log('⚠️ No textures found in model, loading normally...')
          }
        } catch (error) {
          console.warn('⚠️ Failed to extract textures, loading model normally:', error)
          // Fall through to normal loading
        }
      }

      // Warn when a standalone .gltf is picked without its .bin / textures folder
      for (const modelFile of modelFiles) {
        if (!modelFile.name.toLowerCase().endsWith('.gltf')) continue
        const binKey = modelFile.name.replace(/\.gltf$/i, '.bin')
        const hasBin =
          textureFiles.has(binKey) ||
          [...textureFiles.keys()].some((k) => k.toLowerCase().endsWith('.bin'))
        if (!hasBin && !hasFolderContext) {
          const msg =
            `GLTF "${modelFile.name}" needs its .bin file and images/ folder. Use "Select folder" and choose the Pagani-glb directory (not just the .gltf file).`
          console.warn('[FilePicker]', msg)
          setError(msg)
          setLoading(false)
          setProgress(0)
          setLoadingMessage(null)
          return
        }
      }

      // Load all model files sequentially with texture files if available
      for (let i = 0; i < modelFiles.length; i++) {
        const modelFile = modelFiles[i]
        setLoadingMessage(`Loading ${modelFile.name} (${i + 1}/${modelFiles.length})...`)
        
        try {
          await loadFromFile(modelFile, (progress) => {
            // Adjust progress for multiple files
            const baseProgress = (i / modelFiles.length) * 100
            const fileProgress = (progress / modelFiles.length)
            setProgress(baseProgress + fileProgress)
          }, textureFiles.size > 0 ? textureFiles : undefined)
          
          console.log(`✅ Successfully loaded: ${modelFile.name}`)
        } catch (err) {
          console.error(`❌ Failed to load ${modelFile.name}:`, err)
          // Continue with next file instead of stopping
          if (i === 0) {
            // Only show error for first file failure
            throw err
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file')
    } finally {
      setLoading(false)
      setProgress(0)
      setLoadingMessage(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = ''
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    await processSelectedFiles(Array.from(files))
  }

  const collectDirectoryFiles = async (
    directoryHandle: FileSystemDirectoryHandle,
    pathPrefix = ''
  ): Promise<File[]> => {
    const files: File[] = []
    if (!directoryHandle) {
      return files
    }

    const iterator = (directoryHandle as any).entries?.call(
      directoryHandle
    ) as AsyncIterableIterator<[string, BrowserFileHandle]> | undefined

    if (!iterator) {
      return files
    }

    for await (const [name, handle] of iterator) {
      const currentPath = pathPrefix ? `${pathPrefix}${name}` : name
      if (handle.kind === 'file') {
        const file = await handle.getFile()
        setFileRelativePath(file, currentPath)
        files.push(file)
      } else if (handle.kind === 'directory') {
        const nested = await collectDirectoryFiles(handle as FileSystemDirectoryHandle, `${currentPath}/`)
        files.push(...nested)
      }
    }
    return files
  }

  const handleOpenFilesClick = async () => {
    const anyWindow = window as typeof window & {
      showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
    }

    if (anyWindow.showOpenFilePicker) {
      try {
        const handles = await anyWindow.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: '3D Models & Textures',
              accept: {
                'model/gltf-binary': ['.glb'],
                'model/gltf+json': ['.gltf'],
                'model/fbx': ['.fbx'],
                'model/obj': ['.obj'],
                'model/stl': ['.stl'],
                'model/ply': ['.ply'],
                'application/octet-stream': ['.splat', '.ksplat'],
                'model/3mf': ['.3mf'],
                'model/vnd.collada+xml': ['.dae'],
                'application/zip': ['.zip'],
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/png': ['.png'],
                'image/webp': ['.webp'],
                'image/bmp': ['.bmp'],
                'image/vnd.ktx': ['.ktx2'],
                'image/vnd.radiance': ['.hdr'],
                'image/vnd.radiance-hdr': ['.hdr'],
                'image/exr': ['.exr']
              }
            }
          ]
        })

        const files: File[] = []
        for (const handle of handles) {
          if (handle.kind === 'file') {
            const file = await handle.getFile()
            if (!(file as any).webkitRelativePath) {
              setFileRelativePath(file, file.name)
            }
            files.push(file)
          }
        }

        if (files.length > 0) {
          await processSelectedFiles(files)
        }
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        console.warn('[FilePicker] showOpenFilePicker failed, falling back to input.', err)
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleOpenFolderClick = async () => {
    const anyWindow = window as typeof window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
    }

    if (anyWindow.showDirectoryPicker) {
      try {
        const directoryHandle = await anyWindow.showDirectoryPicker()
        const files = await collectDirectoryFiles(directoryHandle)
        if (files.length > 0) {
          await processSelectedFiles(files)
        }
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        console.warn('[FilePicker] showDirectoryPicker failed, falling back to input.', err)
      }
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = ''
      folderInputRef.current.click()
    }
  }

  const handleUrlLoad = async () => {
    if (!url.trim()) return

    setError(null)
    setLoading(true)
    setProgress(0)

    try {
      setLoadingMessage(`Loading ${url}...`)
      await loadFromUrl(url, (progress) => {
        setProgress(progress)
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load URL'
      setError(errorMessage)
      if (errorMessage.includes('CORS') || errorMessage.includes('fetch')) {
        setError('CORS error: The server must allow cross-origin requests. Try downloading the file and loading it locally instead.')
      }
    } finally {
      setLoading(false)
      setProgress(0)
      setLoadingMessage(null)
    }
  }


  const handleFit = () => {
    if (viewer?.scene) {
      const objects: THREE.Object3D[] = []
      viewer.scene.traverse((obj) => {
        if (obj.userData.isModel) {
          objects.push(obj)
        }
      })
      if (objects.length > 0) {
        frameObject(objects[0])
      }
    }
  }

  const handleScreenshot = () => {
    if (!viewer?.renderer) return
    
    const dataUrl = viewer.captureScreenshot
      ? viewer.captureScreenshot()
      : captureViewerScreenshot(viewer)
    const link = document.createElement('a')
    link.download = `screenshot-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  }

  const renderAction = (actionId: MenuActionId): React.ReactNode => {
    switch (actionId) {
      case 'openFiles':
        return (
          <>
            <button
              className="toolbar-button"
              title="Select files (auto-detects related textures and dependencies)"
              onClick={handleOpenFilesClick}
            >
              📄 Open Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              multiple
              accept=".glb,.gltf,.fbx,.obj,.stl,.ply,.splat,.ksplat,.3mf,.dae,.3ds,.3dm,.dxf,.dwg,.zip,.jpg,.jpeg,.png,.tga,.bmp,.webp,.hdr,.exr,.ktx2,.basis,.bin"
              style={{ display: 'none' }}
            />
          </>
        )
      case 'openFolder':
        return (
          <>
            <button
              className="toolbar-button"
              title="Select a folder (auto-scans for textures and dependencies)"
              onClick={handleOpenFolderClick}
            >
              📁 Open Folder
            </button>
            <input
              ref={folderInputRef}
              type="file"
              onChange={handleFileSelect}
              {...({ webkitdirectory: '' } as any)}
              multiple
              style={{ display: 'none' }}
            />
          </>
        )
      case 'loadUrl':
        return (
          <div className="toolbar-url-action">
            <input
              ref={urlInputRef}
              type="text"
              placeholder="Enter model URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlLoad()}
              className="url-input"
            />
            <button onClick={handleUrlLoad} className="toolbar-button" disabled={!url.trim()}>
              Load URL
            </button>
          </div>
        )
      case 'saveProject':
        return (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className="toolbar-button"
              title="Save current project state (click for JSON, right-click for packaged ZIP)"
              onClick={() => handleSaveProject(false, false)}
              onContextMenu={(e) => {
                e.preventDefault()
                handleSaveProject(true, false)
              }}
            >
              💾 Save Project
            </button>
            <div 
              className="dropdown-menu" 
              style={{ 
                position: 'absolute', 
                top: '100%', 
                left: 0, 
                background: 'rgba(30, 30, 30, 0.95)', 
                border: '1px solid #555', 
                borderRadius: '4px',
                padding: '4px 0',
                minWidth: '220px',
                zIndex: 1000,
                display: 'none',
                marginTop: '4px'
              }} 
              onMouseEnter={(e) => { e.currentTarget.style.display = 'block' }} 
              onMouseLeave={(e) => { e.currentTarget.style.display = 'none' }}
            >
              <button
                className="toolbar-button"
                style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: 0 }}
                onClick={() => handleSaveProject(false, false)}
                title="Save project as JSON file to default download folder"
              >
                📄 Save Project (JSON)
              </button>
              <button
                className="toolbar-button"
                style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: 0 }}
                onClick={() => handleSaveProject(false, true)}
                title="Save project as JSON file - choose folder location"
              >
                📁 Save Project (JSON) - Choose Folder
              </button>
              <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.2)', margin: '4px 0' }} />
              <button
                className="toolbar-button"
                style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: 0 }}
                onClick={() => handleSaveProject(true, false)}
                title="Save project as ZIP package to default download folder"
              >
                📦 Save Packaged Project (ZIP)
              </button>
              <button
                className="toolbar-button"
                style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'transparent', border: 'none', borderRadius: 0 }}
                onClick={() => handleSaveProject(true, true)}
                title="Save project as ZIP package - choose folder location"
              >
                📁 Save Packaged Project (ZIP) - Choose Folder
              </button>
            </div>
          </div>
        )
      case 'loadProject':
        return (
          <button
            className="toolbar-button"
            title="Load a previously saved project"
            onClick={handleLoadProject}
          >
            📂 Load Project
          </button>
        )
      case 'fitView':
        return (
          <button onClick={handleFit} className="toolbar-button" title="Fit to view">
            🎯 Fit
          </button>
        )
      case 'resetScene':
        return (
          <button onClick={reset} className="toolbar-button" title="Reset scene">
            ↻ Reset
          </button>
        )
      case 'screenshot':
        return (
          <button onClick={handleScreenshot} className="toolbar-button" title="Screenshot">
            📷 Screenshot
          </button>
        )
      case 'exportPresentation':
        return (
          <ExportPresentationButton />
        )
      case 'toggleFullscreen':
        return (
          <button
            onClick={toggleFullscreen}
            className={`toolbar-button ${isFullscreen ? 'active' : ''}`}
            title="Toggle fullscreen (F11)"
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
        )
      case 'toggleStats':
        return (
          <button
            onClick={toggleStats}
            className={`toolbar-button ${showStats ? 'active' : ''}`}
            title="Toggle stats"
            aria-pressed={showStats}
          >
            Stats
          </button>
        )
      case 'toggleTransformPanel':
        return (
          <button
            onClick={() => {
              if (!selectedObject) {
                setError('Please select an object first by clicking on it in the scene.')
                return
              }
              toggleTransformPanel()
            }}
            className={`toolbar-button ${showTransformPanel && selectedObject ? 'active' : ''}`}
            title={selectedObject ? 'Transform Panel' : 'Transform - Select an object first'}
            aria-pressed={showTransformPanel && selectedObject ? true : false}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <img 
              src={transformIconDataUrl || undefined} 
              alt="Transform" 
              style={{ 
                width: '16px', 
                height: '16px', 
                display: 'block',
                flexShrink: 0
              }} 
            />
            <span>Transform</span>
          </button>
        )
      case 'toggleLightingPanel':
        return (
          <button
            onClick={toggleLightingPanel}
            className={`toolbar-button ${showLightingPanel ? 'active' : ''}`}
            title="Lighting controls"
            aria-pressed={showLightingPanel}
          >
            💡 Lighting
          </button>
        )
      case 'toggleObjectsPanel':
        return (
          <button
            onClick={toggleObjectsPanel}
            className={`toolbar-button ${showObjectsPanel ? 'active' : ''}`}
            title="Scene hierarchy and object management"
            aria-pressed={showObjectsPanel}
          >
            📦 Objects
          </button>
        )
      case 'toggleCameraViewsPanel':
        return (
          <button
            onClick={toggleCameraViewsPanel}
            className={`toolbar-button ${showCameraViewsPanel ? 'active' : ''}`}
            title="Camera Views (V to toggle, Ctrl+Shift+S to save)"
            aria-pressed={showCameraViewsPanel}
          >
            📹 Camera
          </button>
        )
      case 'toggleRenderingQualityPanel':
        return (
          <button
            onClick={toggleRenderingQualityPanel}
            className={`toolbar-button ${showRenderingQualityPanel ? 'active' : ''}`}
            title="Rendering quality settings"
            aria-pressed={showRenderingQualityPanel}
          >
            ⚙️ Quality
          </button>
        )
      case 'toggleWeatherPanel':
        return (
          <button
            onClick={toggleWeatherPanel}
            className={`toolbar-button ${showWeatherPanel ? 'active' : ''}`}
            title="Weather and atmosphere settings"
            aria-pressed={showWeatherPanel}
          >
            🌤️ Weather
          </button>
        )
      case 'togglePathTracer':
        return (
          <button
            onClick={handlePathTracerButton}
            className={`toolbar-button ${showPathTracerPreview ? 'active' : ''}`}
            title={showPathTracerPreview ? 'Close Path Trace panel and stop' : 'Open Path Trace controls'}
            aria-pressed={showPathTracerPreview}
          >
            ✨ Path Trace
          </button>
        )
      case 'toggleMaterialPanel':
        return (
          <button
            onClick={toggleMaterialPanel}
            className={`toolbar-button ${showMaterialPanel ? 'active' : ''}`}
            title="Material editor (Ctrl+Click on object to select material)"
            aria-pressed={showMaterialPanel}
          >
            🎨 Material
          </button>
        )
      case 'toggleTextureManagementPanel':
        return (
          <button
            onClick={toggleTextureManagementPanel}
            className={`toolbar-button ${showTextureManagementPanel ? 'active' : ''}`}
            title="Texture Management - Review and merge textures manually"
            aria-pressed={showTextureManagementPanel}
          >
            🖼️ Textures
          </button>
        )
      case 'toggleOptimizationPanel':
        return (
          <button
            onClick={toggleOptimizationPanel}
            className={`toolbar-button ${showOptimizationPanel ? 'active' : ''}`}
            title="Optimization tools and converters"
            aria-pressed={showOptimizationPanel}
          >
            🔧 Optimize
          </button>
        )
      case 'toggleShadowPlane':
        return (
          <button
            onClick={toggleShadowPlane}
            className={`toolbar-button ${showShadowPlane ? 'active' : ''}`}
            title="Toggle shadow plane"
            aria-pressed={showShadowPlane}
          >
            📐 Plane
          </button>
        )
      case 'toggleShortcuts':
        return (
          <button onClick={toggleShortcutsOverlay} className="toolbar-button" title="Show keyboard shortcuts">
            ❔ Shortcuts
          </button>
        )
      case 'resetMenuLayout':
        return (
          <button
            onClick={() => resetMenuLayout()}
            className="toolbar-button"
            title="Reset toolbar/menu to default layout (Path Trace, Fit, etc.)"
          >
            ♻️ Reset Menu
          </button>
        )
      case 'saveMenuLayout':
        return (
          <button
            onClick={handleSaveMenuLayout}
            className="toolbar-button"
            title="Save current menu layout to this browser"
          >
            💾 Save Menu
          </button>
        )
      case 'toggleTodoPanel':
        return (
          <button
            onClick={toggleTodoPanel}
            className={`toolbar-button ${showTodoPanel ? 'active' : ''}`}
            title="Show feature TODO list"
            aria-pressed={showTodoPanel}
          >
            📝 TODOs{pendingTodoCount > 0 ? ` (${pendingTodoCount})` : ''}
          </button>
        )
      case 'togglePrimitivesPanel':
        return (
          <button
            onClick={togglePrimitivesPanel}
            className={`toolbar-button ${showPrimitivesPanel ? 'active' : ''}`}
            title="Add primitive objects (planes, spheres, cubes, etc.)"
            aria-pressed={showPrimitivesPanel}
          >
            🔷 Primitives
          </button>
        )
      case 'toggleRenderingEffectsPanel':
        return (
          <button
            onClick={toggleRenderingEffectsPanel}
            className={`toolbar-button ${showRenderingEffectsPanel ? 'active' : ''}`}
            title="Rendering effects (fog, fire, particles, etc.)"
            aria-pressed={showRenderingEffectsPanel}
          >
            ✨ Effects
          </button>
        )
      case 'toggleEdgeEnhancementPanel':
        return (
          <button
            onClick={toggleEdgeEnhancementPanel}
            className={`toolbar-button ${showEdgeEnhancementPanel ? 'active' : ''}`}
            title="Edge Enhancement (Autosoft Edge) - Smooth sharp edges for photorealistic rendering"
            aria-pressed={showEdgeEnhancementPanel}
          >
            🔷 Edge
          </button>
        )
      case 'toggleSmoothingPanel':
        return (
          <button
            onClick={toggleSmoothingPanel}
            className={`toolbar-button ${showSmoothingPanel ? 'active' : ''}`}
            title="Smoothing Panel - Adjust edge smoothing and geometry refinement"
            aria-pressed={showSmoothingPanel}
          >
            ✨ Smooth
          </button>
        )
      case 'togglePointCloudPanel':
        return (
          <button
            onClick={togglePointCloudPanel}
            className={`toolbar-button ${showPointCloudPanel ? 'active' : ''}`}
            title="Point Cloud - Toggle between point and Gaussian-splat projection and adjust point size"
            aria-pressed={showPointCloudPanel}
          >
            🟣 Point Cloud
          </button>
        )
      case 'toggleOSMGroundV2Panel':
        return (
          <button
            onClick={() => {
              // Start Streets GL if not running when opening (Electron only); if already running, iframe will connect
              if (typeof window !== 'undefined' && window.electronAPI?.startStreetsGLServer && !showOSMGroundV2Panel) {
                useAppStore.getState().setStreetsGLStartRequestedAt(Date.now())
                window.electronAPI.startStreetsGLServer().catch(() => {})
              }
              toggleOSMGroundV2Panel()
            }}
            className={`toolbar-button ${showOSMGroundV2Panel ? 'active' : ''}`}
            title="Streets GL Alternative - Full-featured 3D OpenStreetMap renderer"
            aria-pressed={showOSMGroundV2Panel}
          >
            🗺️ OSM 3D
          </button>
        )
      case 'togglePlacesPanel':
        return (
          <button
            onClick={togglePlacesPanel}
            className={`toolbar-button ${showPlacesPanel ? 'active' : ''}`}
            title="Google Places - Search and display places from Google Maps"
            aria-pressed={showPlacesPanel}
          >
            📍 Places
          </button>
        )
      case 'togglePolygonDrawingPanel':
        return (
          <button
            onClick={togglePolygonDrawingPanel}
            className={`toolbar-button polygon-icon-button ${showPolygonDrawingPanel ? 'active' : ''}`}
            title="Draw polygons on models to mark things"
            aria-pressed={showPolygonDrawingPanel}
          >
            <span className="polygon-icon"></span>
            Polygons
          </button>
        )
      case 'toggleHotspotsPanel':
        return (
          <button
            onClick={toggleHotspotsPanel}
            className={`toolbar-button ${showHotspotsPanel ? 'active' : ''}`}
            title="Add interactive hotspots to 3D model"
            aria-pressed={showHotspotsPanel}
          >
            📍 Hotspots
          </button>
        )
      case 'toggleRoomsPanel':
        return (
          <button
            onClick={toggleRoomsPanel}
            className={`toolbar-button ${showRoomsPanel ? 'active' : ''}`}
            title="Import Revit DXF rooms and change room colors"
            aria-pressed={showRoomsPanel}
          >
            🏢 Rooms
          </button>
        )
      case 'toggleRevitConnectionPanel':
        return (
          <button
            onClick={toggleRevitConnectionPanel}
            className={`toolbar-button ${showRevitConnectionPanel ? 'active' : ''}`}
            title="Connect to Revit for live model synchronization"
            aria-pressed={showRevitConnectionPanel}
          >
            🔗 Revit Live
          </button>
        )
      case 'toggleCubesViewer':
        return (
          <button
            onClick={toggleCubesViewer}
            className={`toolbar-button ${showCubesViewer ? 'active' : ''}`}
            title="Create and test cubes with edge softening"
            aria-pressed={showCubesViewer}
          >
            🧊 Cubes
          </button>
        )
      case 'toggleAIEnhancementPanel':
        return (
          <button
            onClick={toggleAIEnhancementPanel}
            className={`toolbar-button ${showAIEnhancementPanel ? 'active' : ''}`}
            title="AI-powered image enhancement (upscaling, detail refinement, texture enhancement)"
            aria-pressed={showAIEnhancementPanel}
          >
            🤖 AI Enhance
          </button>
        )
      case 'toggleShaderEditorPanel':
        return (
          <button
            onClick={toggleShaderEditorPanel}
            className={`toolbar-button ${showShaderEditorPanel ? 'active' : ''}`}
            title="Open GLSL shader editor demo (CineShader-style)"
            aria-pressed={showShaderEditorPanel}
          >
            🎞️ Shader Demo
          </button>
        )
      case 'toggleShadowSystemTestPanel':
        return (
          <button
            onClick={toggleShadowSystemTestPanel}
            className={`toolbar-button ${showShadowSystemTestPanel ? 'active' : ''}`}
            title="Shadow System Tests - Compare with test demo"
            aria-pressed={showShadowSystemTestPanel}
          >
            🧪 Shadow Tests
          </button>
        )
      case 'toggleHDRTestPanel':
        return (
          <button
            onClick={toggleHDRTestPanel}
            className={`toolbar-button ${showHDRTestPanel ? 'active' : ''}`}
            title="HDR Test Panel - Test HDR loading with live preview"
            aria-pressed={showHDRTestPanel}
          >
            🌍 HDR Tests
          </button>
        )
      case 'toggleHDRShadowDemoPanel':
        return (
          <button
            onClick={toggleHDRShadowDemoPanel}
            className={`toolbar-button ${showHDRShadowDemoPanel ? 'active' : ''}`}
            title="HDR Shadow Demo - Test shadows with HDR environment"
            aria-pressed={showHDRShadowDemoPanel}
          >
            🎯 HDR Shadow Demo
          </button>
        )
      case 'toggleStreetsGLDemo':
        return (
          <button
            onClick={toggleStreetsGLDemo}
            className={`toolbar-button ${showStreetsGLDemo ? 'active' : ''}`}
            title="Streets GL Demo - Interactive map integration"
            aria-pressed={showStreetsGLDemo}
          >
            🗺️ Streets GL Demo
          </button>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`toolbar ${isMenuOpen ? 'open' : 'closed'}`}
      role="toolbar"
      aria-label="Primary tool menu"
    >
      <div className="toolbar-header">
        <div className="toolbar-header-left">
          <button
            className="toolbar-toggle"
            onClick={() => setIsMenuOpen((value) => !value)}
            title={isMenuOpen ? 'Hide menu' : 'Show menu'}
          >
            {isMenuOpen ? 'Hide Menu' : 'Show Menu'}
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`toolbar-toggle ${!canUndo ? 'disabled' : ''}`}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`toolbar-toggle ${!canRedo ? 'disabled' : ''}`}
            title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
          >
            ↷ Redo
          </button>
          <button
            className="toolbar-toggle"
            onClick={toggleFullscreen}
            title="Toggle fullscreen (F11)"
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
          <div className="render-mode-selector">
            <RenderModeSelector />
          </div>
          <ViewingDistanceControl />
        </div>

        <div className="toolbar-header-right">
          <div className="toolbar-dropdown-wrapper">
            <button
              className="toolbar-icon-button"
              onClick={() => {
                setShowFitMenu((v) => !v)
                setShowShadowMenu(false)
              }}
              title="Fit options"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>Fit</span>
                <span>🎯</span>
                <span style={{ fontSize: '12px' }}>▼</span>
              </span>
            </button>
            {showFitMenu && (
              <div
                className="toolbar-dropdown"
                onMouseLeave={() => setShowFitMenu(false)}
              >
                <button
                  className="toolbar-dropdown-item"
                  onClick={() => {
                    if (selectedObject) {
                      frameObject(selectedObject)
                    } else if (viewer?.scene) {
                      frameObject(viewer.scene)
                    }
                    setShowFitMenu(false)
                  }}
                >
                  <span className="toolbar-dropdown-icon">🎯</span>
                  <span>Fit Selection</span>
                </button>
                <button
                  className="toolbar-dropdown-item"
                  onClick={() => {
                    if (viewer?.scene) {
                      frameObject(viewer.scene) // zoom-to-fit full scene
                      if (viewer?.camera && (viewer as any)?.controls) {
                        const cam = viewer.camera.position
                        const tgt = (viewer as any).controls.target
                        console.log(
                          '[Fit] Camera after Fit Whole Scene',
                          {
                            position: {
                              x: Number(cam.x.toFixed(3)),
                              y: Number(cam.y.toFixed(3)),
                              z: Number(cam.z.toFixed(3))
                            },
                            target: {
                              x: Number(tgt.x.toFixed(3)),
                              y: Number(tgt.y.toFixed(3)),
                              z: Number(tgt.z.toFixed(3))
                            }
                          }
                        )
                      }
                    }
                    setShowFitMenu(false)
                  }}
                >
                  <span className="toolbar-dropdown-icon">🌐</span>
                  <span>Fit Whole Scene</span>
                </button>
              </div>
            )}
          </div>
        <button
          className={`toolbar-icon-button ${showTransformPanel ? 'active' : ''}`}
          onClick={toggleTransformPanel}
          title="Toggle Transform panel"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>Transform</span>
            <span>✥</span>
          </span>
        </button>
          <div className="toolbar-shadow-inline">
            <span className="shadow-label">Plane</span>
            <button
              className={`toolbar-icon-button ${showShadowPlane ? 'active' : ''}`}
              onClick={() => {
                toggleShadowPlane()
              }}
              title="Toggle shadow plane"
            >
              🟦
            </button>
            <label className="shadow-checkbox" title="Transparent shadow plane">
              <input
                type="checkbox"
                checked={shadowPlaneTransparent}
                onChange={(e) => setShadowPlaneTransparent(e.target.checked)}
              />
            </label>
          </div>
        <button
          className={`toolbar-icon-button ${showStats ? 'active' : ''}`}
          onClick={toggleStats}
          title="Toggle stats (FPS)"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>Stats</span>
            <span>📊</span>
          </span>
        </button>
          <button
            className="toolbar-icon-button"
            onClick={toggleShortcutsOverlay}
            title="Show keyboard shortcuts"
          >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>Shortcuts</span>
            <span>⌨️</span>
          </span>
          </button>
          <button
            className={`toolbar-icon-button ${showTodoPanel ? 'active' : ''}`}
            onClick={toggleTodoPanel}
            title="Toggle TODO panel"
          >
            📝{pendingTodoCount > 0 ? ` ${pendingTodoCount}` : ''}
          </button>
          {isMenuOpen && (
            <span className="toolbar-hint">Drag buttons between sections to customize the layout</span>
          )}
        </div>
      </div>
      <input
        ref={projectFileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleProjectFileSelected}
      />

      {isMenuOpen && (
        <>
          <div className="toolbar-grid" role="group" aria-label="Toolbar sections">
            {MENU_SECTIONS.map((section) => {
              const actions = (menuLayout[section.id] || []).filter((actionId) => actionId !== 'toggleFullscreen')
              const isEmpty = actions.length === 0
              return (
                <div
                  key={section.id}
                  className={`toolbar-section-card section-${section.id}`}
                  role="group"
                  aria-labelledby={`toolbar-section-${section.id}`}
                >
                  <div className="toolbar-section-header" id={`toolbar-section-${section.id}`}>
                    <span>{section.label}</span>
                  </div>
                  <div
                    className="toolbar-section-body"
                    role="list"
                    onDragOver={(event) => handleSectionDragOver(event, section.id, actions.length)}
                    onDrop={(event) => handleSectionDrop(event, section.id, actions.length)}
                  >
                    {isEmpty ? (
                      <div
                        className={`toolbar-drop-zone empty ${
                          dragOverTarget?.section === section.id && dragOverTarget.index === 0 ? 'active' : ''
                        }`}
                        role="button"
                        aria-label={`Drop actions into ${section.label}`}
                        onDragOver={(event) => handleDragOverZone(event, section.id, 0)}
                        onDragLeave={(event) => handleDragLeaveZone(event, section.id, 0)}
                        onDrop={(event) => handleDropOnZone(event, section.id, 0)}
                      >
                        Drop actions here
                      </div>
                    ) : (
                      (() => {
                        const rowBreaksForSection = menuRowBreaks[section.id] ?? []
                        const rowBreakIndices = new Set<MenuActionId>(rowBreaksForSection)
                        const rows: Array<{ actions: MenuActionId[]; hasBreakAfter: boolean }> = []
                        let currentRow: MenuActionId[] = []

                        actions.forEach((actionId) => {
                          currentRow.push(actionId)
                          if (rowBreakIndices.has(actionId)) {
                            rows.push({ actions: currentRow, hasBreakAfter: true })
                            currentRow = []
                          }
                        })

                        if (currentRow.length > 0) {
                          rows.push({ actions: currentRow, hasBreakAfter: false })
                        }

                        let actionIndexCounter = -1

                        return rows.map((row, rowIdx) => {
                          const rowElements: React.ReactNode[] = []
                          row.actions.forEach((actionId, actionIdx) => {
                            actionIndexCounter += 1
                            const currentIndex = actionIndexCounter
                            const extraClass = actionId === 'loadUrl' ? ' span-2' : ''
                            const actionLabel = ACTION_LABELS[actionId] ?? actionId
                            const dragState =
                              dragOverTarget?.section === section.id &&
                              dragOverTarget.index === currentIndex
                                ? dragOverTarget.position ?? 'before'
                                : null
                            const isDragTarget = dragState === 'before' || dragState === 'after'
                            const isRowAfterTarget = dragState === 'row-after'
                            const hasRowBreakAfter = rowBreakIndices.has(actionId)

                            // FIX: Removed separate drop zone elements - using improved drag detection on items instead
                            // This prevents spacing issues while still allowing drops between items

                            // Add the actual item
                            rowElements.push(
                              <div
                                key={`${section.id}-${actionId}-${currentIndex}`}
                                className={`toolbar-item${extraClass}${
                                  draggingAction?.actionId === actionId ? ' is-dragging' : ''
                                }${isDragTarget ? ' drag-target' : ''}${
                                  isRowAfterTarget ? ' drag-target-row-after' : ''
                                }${hasRowBreakAfter ? ' has-row-break' : ''}`}
                                draggable
                                role="listitem"
                                aria-grabbed={draggingAction?.actionId === actionId}
                                aria-label={`Drag to reposition ${actionLabel}`}
                                onDragStart={(event) => handleDragStart(event, actionId, section.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(event) => handleItemDragOver(event, section.id, currentIndex)}
                                onDragLeave={(event) => handleItemDragLeave(event, section.id, currentIndex)}
                                onDrop={(event) => handleItemDrop(event, section.id, currentIndex)}
                              >
                                <div className="toolbar-action-content">{renderAction(actionId)}</div>
                              </div>
                            )
                          })

                          const lastActionIndex = actionIndexCounter
                          const lastActionId = row.actions[row.actions.length - 1]
                          const lastActionLabel = lastActionId
                            ? ACTION_LABELS[lastActionId] ?? lastActionId
                            : section.label

                          return (
                            <Fragment key={`${section.id}-row-${rowIdx}`}>
                              <div className="toolbar-row">{rowElements}</div>
                              {row.hasBreakAfter && (
                                <div
                                  className={`toolbar-row-break ${
                                    dragOverTarget?.section === section.id &&
                                    dragOverTarget.index === lastActionIndex &&
                                    dragOverTarget.position === 'row-break'
                                      ? 'active'
                                      : ''
                                  }`}
                                  role="separator"
                                  aria-label={`Drop below ${lastActionLabel}`}
                                  onDragOver={(event) =>
                                    handleRowBreakDragOver(event, section.id, lastActionIndex)
                                  }
                                  onDragLeave={(event) => handleRowBreakLeave(event, section.id, lastActionIndex)}
                                  onDrop={(event) => handleRowBreakDrop(event, section.id, lastActionIndex)}
                                />
                              )}
                            </Fragment>
                          )
                        })
                      })()
                    )}
                  </div>
                </div>
              )
            })}
          </div>

        </>
      )}
    </div>
  )
}

