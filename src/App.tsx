import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import ViewerCanvas from './viewer/ViewerCanvas'
import { useViewer } from './viewer/useViewer'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { useHelperVisibility } from './hooks/useHelperVisibility'
import Toolbar from './components/Toolbar'
import DragDropZone from './components/DragDropZone'
import Toast from './components/Toast'
import Stats from './components/Stats'
import Sidebar from './components/Sidebar'
import LightingPanel from './components/LightingPanel'
import TransformPanel from './components/TransformPanel'
import MaterialPanel from './components/MaterialPanel'
import TextureManagementPanel from './components/TextureManagementPanel'
import CameraViewsPanel from './components/CameraViewsPanel'
import OptimizationPanel from './components/OptimizationPanel'
import ObjectsPanel from './components/ObjectsPanel'
import ObjectRegistryReconciler from './components/ObjectRegistryReconciler'
import RoomsPanel from './components/RoomsPanel'
import RenderingQualityPanel from './components/RenderingQualityPanel'
import WeatherPanel from './components/WeatherPanel'
import CameraViewsQuickMenu from './components/CameraViewsQuickMenu'
import { useAppStore } from './store/useAppStore'
import ShortcutsOverlay from './components/ShortcutsOverlay'
import BugTrackerPanel from './components/BugTrackerPanel'
import PathTracerDemoPanel from './components/PathTracerDemoPanel'
import TodoPanel from './components/TodoPanel'
import PrimitivesPanel from './components/PrimitivesPanel'
import RenderingEffectsPanel from './components/RenderingEffectsPanel'
import EdgeEnhancementPanel from './components/EdgeEnhancementPanel'
import SmoothingPanel from './components/SmoothingPanel'
import PointCloudPanel from './components/PointCloudPanel'
import OSMGroundV2Panel from './components/OSMGroundV2Panel'
import MissingTextureDialog, { MissingTextureInfo } from './components/MissingTextureDialog'
import { diagnoseTexture, diagnoseTextures } from './utils/textureOptimizerDiagnostics'
import { StreetsGLIframeOverlay } from './components/StreetsGLIframeOverlay'
import { CityTransformOverlay } from './components/CityTransformOverlay'

// Expose diagnostic functions to console for testing
if (typeof window !== 'undefined') {
  (window as any).diagnoseTexture = diagnoseTexture
  ;(window as any).diagnoseTextures = diagnoseTextures
  console.log('💡 Texture diagnostics available: window.diagnoseTexture(file, format) and window.diagnoseTextures(files, format)')
  
  // Expose project save/load debug functions
  import('./utils/projectPersistence').then((module) => {
    (window as any).debugProjectState = module.debugProjectState
    ;(window as any).validateProjectSnapshot = module.validateProjectSnapshot
    ;(window as any).createProjectSnapshot = module.createProjectSnapshot
    ;(window as any).testFileRegistry = () => {
      const { fileRegistry } = module
      const allFiles = fileRegistry.getAllModelFiles()
      console.log('📁 File Registry Contents:')
      console.log(`   Total files: ${allFiles.size}`)
      const files = []
      for (const [fileName, file] of allFiles.entries()) {
        const info = {
          fileName,
          size: file.size,
          sizeMB: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          type: file.type
        }
        console.log(`   - ${fileName}: ${info.sizeMB}`)
        files.push(info)
      }
      return files
    }
    console.log('💡 Project debug functions available:')
    console.log('   - window.debugProjectState() - Get current project state')
    console.log('   - window.validateProjectSnapshot(snapshot) - Validate a saved snapshot')
    console.log('   - window.createProjectSnapshot() - Create a snapshot (for testing)')
    console.log('   - window.testFileRegistry() - Check what files are registered')
  })
}
import PolygonDrawingPanel from './components/PolygonDrawingPanel'
import HotspotsPanel from './components/HotspotsPanel'
import CubesViewer from './components/CubesViewer'
import AIEnhancementPanel from './components/AIEnhancementPanel'
import ShaderEditorPanel from './components/ShaderEditorPanel'
import WebExportPanel from './components/WebExportPanel'
import PlacesPanel from './components/PlacesPanel'
import ShadowSystemTestPanel from './components/ShadowSystemTestPanel'
import HDRTestPanel from './components/HDRTestPanel'
import HDRShadowDemoPanel from './components/HDRShadowDemoPanel'
import StreetsGLDemo from './components/StreetsGLDemo'
import RevitConnectionPanel from './components/RevitConnectionPanel'
import { EnvironmentManager } from './viewer/effects/EnvironmentManager'
import './App.css'
import { runTextureMergingTests } from './utils/testTextureMerging'
import { testLODGeneration } from './utils/lodTestUtils'
import { createCineShaderScreen } from './utils/cineShaderScreen'

function App() {
  // Filter out WebGL errors and CORS warnings from Streets GL iframe (they're harmless warnings from the embedded app)
  useEffect(() => {
    const originalError = console.error
    const originalWarn = console.warn
    
    const filteredError = (...args: any[]) => {
      const message = args[0]?.toString() || ''
      // Filter out WebGL program errors (common in complex scenes with many shaders)
      if (message.includes('useProgram: program not valid') || 
          message.includes('WebGL: INVALID_OPERATION: useProgram') ||
          message.includes('INVALID_OPERATION: useProgram') ||
          message.includes('useProgram') && message.includes('not valid')) {
        // Suppress these specific errors - they're often harmless and occur during shader compilation
        return
      }
      // Filter out CORS errors from Streets GL tile server (expected - tiles.streets.gl doesn't allow localhost)
      if (message.includes('Access to fetch') && 
          message.includes('tiles.streets.gl') && 
          message.includes('CORS policy')) {
        // Suppress CORS errors - they're expected and don't break functionality
        return
      }
      // Filter out 404 errors from Streets GL tile server (expected - some tiles don't exist)
      if (message.includes('Failed to load resource') && 
          message.includes('tiles.streets.gl') && 
          message.includes('404')) {
        // Suppress 404 errors - they're expected and handled gracefully
        return
      }
      originalError.apply(console, args)
    }
    
    const filteredWarn = (...args: any[]) => {
      const message = args[0]?.toString() || ''
      // Filter out WebGL program warnings (common in complex scenes)
      if (message.includes('useProgram: program not valid') || 
          message.includes('WebGL: INVALID_OPERATION: useProgram') ||
          message.includes('INVALID_OPERATION: useProgram') ||
          message.includes('useProgram') && message.includes('not valid')) {
        return
      }
      // Filter out CORS warnings from Streets GL tile server
      if (message.includes('Access to fetch') && 
          message.includes('tiles.streets.gl') && 
          message.includes('CORS policy')) {
        return
      }
      // Filter out FBX loader warnings about unsupported texture maps (these are informational, not errors)
      // These maps are skipped by the loader and materials are enhanced with PBR defaults instead
      if (message.includes('THREE.FBXLoader') && 
          (message.includes('ReflectionFactor map is not supported') || 
           message.includes('ShininessExponent map is not supported'))) {
        // Suppress these warnings - they're expected and handled by material enhancement
        return
      }
      originalWarn.apply(console, args)
    }
    
    // Override console methods
    console.error = filteredError
    console.warn = filteredWarn
    
    return () => {
      // Restore original console methods on cleanup
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])
  const { setViewer, viewer, loadFromUrl } = useViewer()
  // Missing texture dialog state
  const [missingTextures, setMissingTextures] = useState<MissingTextureInfo[]>([])
  const [showMissingTextureDialog, setShowMissingTextureDialog] = useState(false)
  

  const { 
    streetsGLGroundEnabled,
    showGrid, 
    showAxes,
    showLightHelpers,
    showBoundingBoxes,
    showShadowPlane, 
    showMaterialPanel, 
    showTextureManagementPanel,
    selectedObject,
    setSelectedObject,
    showLightingPanel,
    showOptimizationPanel,
    showObjectsPanel,
    showRoomsPanel,
    showRevitConnectionPanel,
    showRenderingQualityPanel,
    showCameraViewsPanel,
    showWeatherPanel,
    showWebExportPanel,
    showPlacesPanel,
    showTransformPanel,
    showPathTracerPreview,
    setPathTracerActive,
    togglePathTracerPreview,
    toggleCameraViewsPanel,
    showPrimitivesPanel,
    showRenderingEffectsPanel,
    showEdgeEnhancementPanel,
    showSmoothingPanel,
    showPointCloudPanel,
    showOSMGroundV2Panel,
    showPolygonDrawingPanel,
    showHotspotsPanel,
    showShaderEditorPanel,
    showCubesViewer,
    showStreetsGLDemo,
    showAIEnhancementPanel,
    showShadowSystemTestPanel,
    showHDRTestPanel,
    showHDRShadowDemoPanel,
    streetsGLIframeOverlay,
    streetsGLIframeInteractive,
    streetsGLShowUI,
    streetsGLGroundLat,
    renderMode,
    streetsGLGroundLon,
    streetsGLGroundZoom,
    streetsGLIframeReloadKey,
    transformMode,
    setTransformMode,
    addToUndoStack,
    undo,
    sceneRevision,
    canUndo,
    canRedo,
    redo,
    hdrEnabled,
    hdrUrl,
    hdrIntensity,
    setHdrEnabled,
    setHdrUrl,
    setHdrIntensity
  } = useAppStore()

  // Keyboard navigation hook
  useKeyboardNavigation({
    viewer,
    selectedObject,
    transformMode,
    showCameraViewsPanel,
    setTransformMode,
    toggleCameraViewsPanel,
    setSelectedObject,
    addToUndoStack,
    undo,
    redo,
    canUndo,
    canRedo
  })

  const handleViewerReady = useCallback(async (viewerInstance: any) => {
    // Industry-standard: Set viewer synchronously to prevent race conditions
    // This ensures the viewer is available immediately when files are loaded
    try {
      // Expose viewer to window for debugging (shadow diagnostics)
      ;(window as any).__viewer = viewerInstance
      ;(window as any).runShadowDiagnostics = () => {
        if (viewerInstance?.runShadowDiagnostics) {
          return viewerInstance.runShadowDiagnostics()
        }
        console.error('Viewer not ready or runShadowDiagnostics not available')
        return null
      }
      
      // Expose texture merging test function
      ;(window as any).testTextureMerging = () => {
        if (viewerInstance?.scene) {
          return runTextureMergingTests(viewerInstance.scene)
        }
        console.error('Viewer scene not available')
        return null
      }
      
      // Expose post-processing test suite
      import('./utils/postProcessingTestSuite').then(() => {
        console.log('[PostProcessingTests] Test suite loaded and available at window.postProcessingTests')
      }).catch(err => {
        console.warn('[PostProcessingTests] Failed to load test suite:', err)
      })
      
      // Expose LOD test function (extracted to lodTestUtils.ts)
      ;(window as any).testLODGeneration = async () => {
        if (!viewerInstance?.scene) {
          console.error('[LOD Test] ❌ Viewer scene not available')
          return null
        }
        return await testLODGeneration(viewerInstance.scene)
      }
      
      // Verify viewer has required components before registering
      if (!viewerInstance || !viewerInstance.scene || !viewerInstance.renderer || !viewerInstance.camera) {
        console.error('[ViewerInit] Invalid viewer instance provided:', {
          hasInstance: !!viewerInstance,
          hasScene: !!viewerInstance?.scene,
          hasRenderer: !!viewerInstance?.renderer,
          hasCamera: !!viewerInstance?.camera
        })
        return
      }
      
      // Set viewer synchronously - this should immediately update sharedViewer in useViewer
      setViewer(viewerInstance)
      
      // Verify registration was successful by checking if we can access the viewer
      console.log('[ViewerInit] Viewer registered successfully', {
        hasScene: !!viewerInstance.scene,
        hasRenderer: !!viewerInstance.renderer,
        hasCamera: !!viewerInstance.camera,
        timestamp: new Date().toISOString()
      })
      
      // Expose path tracer diagnostics
      import('./utils/pathTracerDiagnostics').then(({ exposePathTracerDiagnostics }) => {
        if (viewerInstance.scene) {
          exposePathTracerDiagnostics(viewerInstance.scene)
        }
      }).catch(err => console.warn('[PathTracerDiagnostics] Failed to load:', err))

      try {
        const envManager = EnvironmentManager.getInstance()
        envManager.initialize(viewerInstance.renderer)
        const defaultEnv = envManager.getDefaultEnvironment()
        viewerInstance.defaultEnvTexture = defaultEnv

        if (!viewerInstance.scene.environment) {
          viewerInstance.scene.environment = defaultEnv
        }

        if (!viewerInstance.scene.background) {
          viewerInstance.scene.background = defaultEnv
        }
      } catch (error) {
        console.warn('[ViewerInit] Unable to prepare default environment:', error)
      }
      
      // Camera settings persistence DISABLED - reverting to default camera state
      // All snapshot loading, camera view loading, and auto-save functionality removed
      
      // Clear any saved camera settings from localStorage
      try {
        localStorage.removeItem('viewer_default_settings')
        console.log('[ViewerInit] Cleared saved camera settings from localStorage')
      } catch (error) {
        console.error('[ViewerInit] Failed to clear localStorage:', error)
      }
      
      // Camera will start at default position (5, 5, 5) as defined in ViewerCanvas
      console.log('[ViewerInit] Using default camera position (no saved settings)')
      
      // Auto-load default model: Pagani Utopia 2023
      // Path: files-upload/Pagani-glb/Pagani Utopia 2023.gltf
      // Note: The file must be in the public folder for URL loading to work
      // For now, auto-load is disabled - user can load manually via file picker
      // To enable auto-load: Copy files-upload/Pagani-glb folder to public/files-upload/Pagani-glb/
      setTimeout(async () => {
        // CRITICAL: Don't auto-load if a project is currently being loaded
        // This prevents conflicts between auto-loaded models and project restoration
        const { isProjectCurrentlyLoading } = await import('./utils/projectPersistence')
        if (isProjectCurrentlyLoading()) {
          console.log('[AutoLoad] Skipping auto-load: Project is currently being loaded')
          return
        }
        
        try {
          // Use relative path (works with Vite base: './' in both dev and Electron)
          // In Electron with loadFile(), base is the directory containing index.html (dist/)
          // So 'files-upload/...' resolves to 'dist/files-upload/...' which is in app.asar
          const autoLoadPath = 'files-upload/Pagani-glb/Pagani Utopia 2023.gltf'
          const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:'
          console.log('[AutoLoad] Attempting to auto-load default model:', autoLoadPath, { 
            isElectron, 
            protocol: typeof window !== 'undefined' ? window.location?.protocol : 'unknown', 
            href: typeof window !== 'undefined' ? window.location?.href : 'unknown',
            pathname: typeof window !== 'undefined' ? window.location?.pathname : 'unknown'
          })
          
          // Load the model using loadFromUrl
          if (loadFromUrl) {
            try {
              await loadFromUrl(autoLoadPath, (progress) => {
                if (progress > 0 && progress < 100 && Math.floor(progress) % 10 === 0) {
                  console.log(`[AutoLoad] Loading Pagani model: ${progress.toFixed(1)}%`)
                }
              })
              console.log('[AutoLoad] ✅ Successfully auto-loaded Pagani Utopia 2023 model')
              
              // Position and frame the model
              if (viewerInstance.frameObject) {
                setTimeout(() => {
                  const scene = viewerInstance.scene
                  let foundModel: THREE.Object3D | null = null
                  
                  // Find the loaded model
                  scene.traverse((obj: any) => {
                    if (!foundModel && obj.userData.isModel && obj.userData.isImportedModel) {
                      foundModel = obj
                      return
                    }
                  })
                  
                  // If no model found, try to find the scene's model group
                  if (!foundModel && scene.children.length > 0) {
                    const modelGroup = scene.children.find((child: any) => child.userData.isModel) as THREE.Object3D | undefined
                    if (modelGroup) {
                      foundModel = modelGroup
                    }
                  }
                  
                  // Position the model (this is now handled automatically in useViewer.ts)
                  // The model is already positioned with bottom on ground, centered, and default rotation
                  // Just frame it to center it in the viewport
                  if (foundModel) {
                    // Frame the model to center it in the viewport
                    viewerInstance.frameObject(foundModel)
                  }
                }, 300)
              }
            } catch (urlError) {
              console.warn('[AutoLoad] Failed to load from URL:', urlError)
              console.warn('[AutoLoad] To fix: Copy the files-upload folder to the public directory, or load the model manually using the file picker')
              // If URL loading fails, the file might not be in the public folder
              // User can manually load it instead
            }
          }
        } catch (autoLoadError) {
          console.warn('[AutoLoad] Could not auto-load default model:', autoLoadError)
          // Don't throw - this is optional functionality
        }
      }, 1000) // Wait 1 second for viewer to be fully initialized
    } catch (error) {
      console.error('[ViewerInit] Error registering viewer:', error)
      // Don't throw - allow component to continue, but log the error
    }
  }, [setViewer, loadFromUrl])

  // Update grid, axes, shadow plane, bounding boxes, and CineShader screen visibility when state changes
  useHelperVisibility({
    viewer,
    showGrid,
    showAxes,
    showShadowPlane,
    showBoundingBoxes,
    showLightHelpers,
    showShaderEditorPanel,
    streetsGLIframeOverlay
  })

  // Create CineShader demo screen on demand when shader editor panel is opened
  useEffect(() => {
    if (!viewer || !showShaderEditorPanel) return

    // Check if screen already exists
    let existingScreen: THREE.Object3D | undefined = undefined
    viewer.scene.traverse((obj) => {
      if (obj.userData.isDemoShaderScreen && obj.name === 'CineShaderDemoScreenGroup') {
        existingScreen = obj
      }
    })

    if (existingScreen !== undefined) {
      // Screen already exists, just make it visible
      (existingScreen as THREE.Object3D).visible = true
      return
    }

    // Create CineShader demo screen using utility function
    createCineShaderScreen(viewer.scene)
  }, [viewer, showShaderEditorPanel])

  useEffect(() => {
    if (!viewer) return
    if ((window as any).__pathTracerDemoRunning) {
      return
    }
    try {
      if ((viewer as any).updateBoundingBoxes) {
        (viewer as any).updateBoundingBoxes()
      }
      if (viewer.renderer && viewer.camera) {
        viewer.renderer.render(viewer.scene, viewer.camera)
      }
    } catch (err) {
      console.warn('[Undo] Unable to refresh viewer after scene revision:', err)
    }
  }, [sceneRevision, viewer])

  // Check for missing textures after model loads
  useEffect(() => {
    if (!viewer?.scene) return

    // Check scene userData for missing textures (set by gltfLoader)
    const checkMissingTextures = () => {
      const scene = viewer.scene
      if (!scene) return

      const missingTexturesFromScene = (scene as any).userData?.missingTextures as Array<{
        path: string
        name: string
        property: string
        material: THREE.Material
        mesh: THREE.Mesh
      }> | undefined

      if (missingTexturesFromScene && missingTexturesFromScene.length > 0) {
        // Convert to MissingTextureInfo format
        const textureInfos: MissingTextureInfo[] = missingTexturesFromScene.map(t => ({
          path: t.path,
          name: t.name,
          property: t.property,
          material: t.material,
          mesh: t.mesh
        }))

        setMissingTextures(textureInfos)
        setShowMissingTextureDialog(true)
        
        // Clear from scene userData to avoid showing again
        delete (scene as any).userData.missingTextures
      }
    }

    // Check immediately and also set up a periodic check (in case textures load asynchronously)
    checkMissingTextures()
    const interval = setInterval(checkMissingTextures, 1000)
    
    return () => clearInterval(interval)
  }, [viewer?.scene])

  return (
    <div className="app">
      <ObjectRegistryReconciler />
      <Toolbar />
      <div className="main-content">
        {showMaterialPanel && <MaterialPanel />}
        {showTextureManagementPanel && <TextureManagementPanel />}
        {showTransformPanel && selectedObject && <TransformPanel />}
        <DragDropZone>
          <div className={`viewer-container ${
            showMaterialPanel ? 'with-material-panel' : ''
          } ${
            showTransformPanel && selectedObject ? 'with-transform-panel' : ''
          } ${
            showLightingPanel ? 'with-lighting-panel' : ''
          } ${
            showOptimizationPanel ? 'with-optimization-panel' : ''
          } ${
            showObjectsPanel ? 'with-objects-panel' : ''
          } ${
            showRenderingQualityPanel ? 'with-rendering-quality-panel' : ''
          } ${
            showCameraViewsPanel ? 'with-camera-views-panel' : ''
          } ${
            showWeatherPanel ? 'with-weather-panel' : ''
          }`}>
            {/* Three.js Viewer - hidden in city mode, visible in product/hybrid */}
            {renderMode !== 'city' && (
              <ViewerCanvas key="viewer-canvas-stable" onViewerReady={handleViewerReady} />
            )}
            {/* Streets GL iframe overlay - the actual Streets GL renderer */}
            <StreetsGLIframeOverlay
              streetsGLIframeOverlay={streetsGLIframeOverlay}
              streetsGLShowUI={streetsGLShowUI}
              streetsGLIframeInteractive={renderMode === 'city' ? true : streetsGLIframeInteractive}
              streetsGLGroundLat={streetsGLGroundLat}
              streetsGLGroundLon={streetsGLGroundLon}
              streetsGLGroundZoom={streetsGLGroundZoom || 15}
              streetsGLIframeReloadKey={streetsGLIframeReloadKey}
            />
            <CityTransformOverlay />
          </div>
        </DragDropZone>
          {showLightingPanel && <LightingPanel />}
          {showOptimizationPanel && <OptimizationPanel />}
          {showObjectsPanel && <ObjectsPanel />}
          {showRoomsPanel && <RoomsPanel />}
          {showRevitConnectionPanel && <RevitConnectionPanel />}
          {showRenderingQualityPanel && <RenderingQualityPanel />}
          {showCameraViewsPanel && <CameraViewsPanel />}
          {showWeatherPanel && <WeatherPanel />}
          {showWebExportPanel && <WebExportPanel />}
          {showPlacesPanel && <PlacesPanel />}
          {showShadowSystemTestPanel && <ShadowSystemTestPanel />}
          {showHDRTestPanel && <HDRTestPanel />}
          {showHDRShadowDemoPanel && <HDRShadowDemoPanel />}
          {showPathTracerPreview && viewer && (
            <PathTracerDemoPanel 
              viewer={{
                renderer: viewer.renderer,
                camera: viewer.camera,
                scene: viewer.scene,
                controls: (viewer as any).controls || undefined
              }} 
              onClose={() => {
                setPathTracerActive(false)
                togglePathTracerPreview()
              }} 
            />
          )}
          {showPrimitivesPanel && <PrimitivesPanel />}
          {showRenderingEffectsPanel && <RenderingEffectsPanel />}
          {showEdgeEnhancementPanel && <EdgeEnhancementPanel />}
          {showSmoothingPanel && <SmoothingPanel />}
          {showPointCloudPanel && <PointCloudPanel />}
          {showOSMGroundV2Panel && <OSMGroundV2Panel />}
          {showPolygonDrawingPanel && <PolygonDrawingPanel />}
          {showHotspotsPanel && <HotspotsPanel />}
          {showCubesViewer && <CubesViewer />}
          {showStreetsGLDemo && <StreetsGLDemo />}
          {showAIEnhancementPanel && <AIEnhancementPanel />}
          <ShaderEditorPanel />
          <ShortcutsOverlay />
          <TodoPanel />
          <BugTrackerPanel />
          {showMissingTextureDialog && missingTextures.length > 0 && (
            <MissingTextureDialog
              missingTextures={missingTextures}
              viewer={viewer}
              onClose={() => {
                setShowMissingTextureDialog(false)
                setMissingTextures([])
              }}
              onTexturesReloaded={(count) => {
                console.log(`✅ Reloaded ${count} texture(s)`)
                // Optionally close dialog after successful reload
                if (count > 0) {
                  setTimeout(() => {
                    setShowMissingTextureDialog(false)
                    setMissingTextures([])
                  }, 1000)
                }
              }}
            />
          )}
      </div>
      <CameraViewsQuickMenu />
      <Toast />
      <Stats />
      <div className={showLightingPanel ? 'with-lighting-panel' : ''}>
        <Sidebar />
      </div>
    </div>
  )
}

export default App

