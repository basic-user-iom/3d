import { create } from 'zustand'
import * as THREE from 'three'
import {
  MENU_STORAGE_KEY,
  cloneMenuLayout,
  cloneMenuRowBreaks,
  createDefaultMenuLayout,
  createEmptyMenuRowBreaks,
  normalizeMenuLayout,
  normalizeMenuRowBreaks,
  type MenuLayout,
  type MenuRowBreaks,
  type MenuSectionId,
  type MenuActionId,
  MENU_LAYOUT_VERSION
} from '../config/toolbarMenu'
import type { StreetsGLBridge } from '../utils/streetsGLBridge'
import { getSharedViewer } from '../viewer/useViewer'
import { smoothEdges } from '../utils/edgeSmoothing'
import {
  weatherPresetStorePatch,
  type WeatherPresetId
} from '../viewer/utils/weatherPresets'


export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  id: string
  title: string
  status: TodoStatus
}

export interface RoomInfo {
  id: string
  name: string
  number?: string | null
  color: string
  metadata: Record<string, any>
  mesh: THREE.Object3D
}

/**
 * Mode-independent descriptor for an object that belongs to the project.
 *
 * This is the SINGLE SOURCE OF TRUTH for "objects in the project". The Three.js
 * scene (product/hybrid) and the Streets GL iframe (city/hybrid) are render targets
 * that mirror these descriptors. Because descriptors live in the store, objects
 * survive render-mode switches even when the Three.js scene is torn down (city mode).
 */
export interface ProjectObjectTransform {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
}

export type ProjectObjectKind = 'primitive' | 'imported' | 'other'

export interface ProjectObject {
  /** Stable, app-owned id. Aligned with userData.streetsGLObjectId so the two views agree. */
  id: string
  name: string
  kind: ProjectObjectKind
  /** For primitives: 'box' | 'sphere' | ... so the reconciler can rebuild a mesh from scratch. */
  primitiveType?: string
  /** Base material color (hex) used when rebuilding a mesh from the descriptor. */
  color?: number
  transform: ProjectObjectTransform
  /** Real-world location when placed on the map (city/hybrid). */
  gps?: { lat: number; lon: number }
  visible: boolean
  /** THREE.Object3D.id of the live mesh while a Three.js scene exists (product/hybrid). */
  threeObjectId?: number
  /** Streets GL object id while synced to the iframe (city/hybrid). */
  streetsGLObjectId?: string
  userData?: Record<string, any>
}

export type UndoAction =
  | { type: 'delete', object: THREE.Object3D, parent: THREE.Object3D | THREE.Scene | null }
  | { type: 'material-change', mesh: THREE.Mesh, previousMaterial: THREE.Material | THREE.Material[], newMaterial: THREE.Material | null }
  | { type: 'material-color-change', material: THREE.Material, property: 'color', previousValue: THREE.Color, newValue: THREE.Color }
  | { type: 'transform-change', object: THREE.Object3D, previousTransform: { position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3 }, newTransform: { position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3 } }
  | { type: 'light-add', light: DirectionalLightConfig }
  | { type: 'light-remove', light: DirectionalLightConfig }
  | { type: 'light-update', previous: DirectionalLightConfig, next: DirectionalLightConfig }
  | { type: 'rename', object: THREE.Object3D, oldName: string, newName: string }
  | {
      type: 'edge-smoothing'
      objects: Array<{ object: THREE.Object3D, originalGeometry: THREE.BufferGeometry | null }>
      intensity?: number
    }

/**
 * Auto-detect feature implementation status for the in-app backlog.
 */
function detectFeatureStatus(): Record<string, TodoStatus> {
  return {
    'task-rendering-effects-vfx': 'in_progress',
    'task-openstreetmap-ground': 'completed',
    'task-ai-image-enhancement': 'completed',
    'task-pathtracer-ground-shadows': 'pending',
    'task-camera-views-pathtracer-export': 'completed',
    'task-weather-panel-controls': 'completed',
    'task-batch-lod-bvh': 'pending',
    'task-instancing-performance': 'pending',
    'task-texture-deduplication': 'pending'
  }
}

// Active backlog shown in the TODO panel (completed housekeeping items removed).
const BASE_TODO_ITEMS: Omit<TodoItem, 'status'>[] = [
  {
    id: 'task-rendering-effects-vfx',
    title: 'Rendering Effects — fire VFX and motion blur (fog, rain, bloom, lens flare wired)'
  },
  {
    id: 'task-openstreetmap-ground',
    title: 'OSM 3D ground — polish Streets GL server workflow and projection UX'
  },
  {
    id: 'task-ai-image-enhancement',
    title: 'AI Image Enhancement — optional offline TensorFlow.js mode (Replicate API works)'
  },
  {
    id: 'task-pathtracer-ground-shadows',
    title: 'Path Tracer — verify ground projection shadow reception'
  },
  {
    id: 'task-camera-views-pathtracer-export',
    title: 'Camera Views — path tracer export from saved views (✅ re-enabled)'
  },
  {
    id: 'task-weather-panel-controls',
    title: 'Weather panel — add fog, rain, and snow sliders (engine already wired)'
  },
  {
    id: 'task-batch-lod-bvh',
    title: 'Performance — batch LOD with bounding volume hierarchy for large scenes'
  },
  {
    id: 'task-instancing-performance',
    title: 'Performance — GPU instancing for thousands of repeated objects'
  },
  {
    id: 'task-texture-deduplication',
    title: 'Loader — re-enable texture deduplication with safer comparison logic'
  }
]

// Initialize with auto-detected status
function getDefaultTodoItems(): TodoItem[] {
  const detectedStatus = detectFeatureStatus()
  return BASE_TODO_ITEMS.map((item) => ({
    ...item,
    status: detectedStatus[item.id] || 'pending'
  }))
}

const DEFAULT_TODO_ITEMS = getDefaultTodoItems()

type MenuLayoutInput =
  | MenuLayout
  | {
      layout: MenuLayout
      rowBreaks?: Partial<Record<MenuSectionId, MenuActionId[]>>
    }

type MoveMenuActionOptions = {
  rowBreakMode?: 'inherit' | 'add' | 'remove'
}

const getInitialMenuState = (): { layout: MenuLayout; rowBreaks: MenuRowBreaks } => {
  const fallback = {
    layout: createDefaultMenuLayout(),
    rowBreaks: createEmptyMenuRowBreaks()
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const saved = window.localStorage.getItem(MENU_STORAGE_KEY)
    if (!saved) {
      return fallback
    }
    const parsed = JSON.parse(saved)
    
    // Check version - if outdated, reset to defaults
    const savedVersion = parsed?.version || 1
    if (savedVersion < MENU_LAYOUT_VERSION) {
      console.log(`[MenuLayout] Version ${savedVersion} is outdated, resetting to version ${MENU_LAYOUT_VERSION}`)
      return fallback
    }
    
    if (parsed && typeof parsed === 'object' && 'layout' in parsed) {
      const layout = normalizeMenuLayout((parsed as { layout: MenuLayout }).layout)
      const rowBreaks = normalizeMenuRowBreaks(
        (parsed as { rowBreaks?: Partial<Record<MenuSectionId, MenuActionId[]>> }).rowBreaks,
        layout
      )
      return { layout, rowBreaks }
    }

    const layout = normalizeMenuLayout(parsed)
    const rowBreaks = normalizeMenuRowBreaks(null, layout)
    return { layout, rowBreaks }
  } catch {
    return fallback
  }
}

const initialMenuState = getInitialMenuState()

export type LightType = 'directional' | 'point' | 'spot' | 'rectarea' | 'hemisphere'

export interface DirectionalLightConfig {
  id: string
  name: string
  type?: LightType // Light type (defaults to 'directional' for backward compatibility)
  intensity: number
  position: { x: number; y: number; z: number }
  color: string
  castShadow: boolean
  enabled: boolean
  isSun: boolean // Main sun light (like Twinmotion) - must be directional
  shadowRadius?: number
  
  // Physical light properties (for Point, Spot, RectArea lights)
  distance?: number // Distance at which light intensity reaches zero (0 = infinite)
  decay?: number // Light decay factor (2 = physically realistic, 0 = no decay)
  power?: number // Light power in lumens (for physically-based lighting)
  
  // Spot light specific
  angle?: number // Maximum angle of light cone (in radians)
  penumbra?: number // Percent of spotlight cone that is attenuated (0-1)
  target?: { x: number; y: number; z: number } // Target position for spot/rectarea lights
  
  // RectArea light specific
  width?: number // Width of rectangular area light
  height?: number // Height of rectangular area light
  
  // Hemisphere light specific
  groundColor?: string // Ground color for hemisphere light
}

const cloneLightConfig = (light: DirectionalLightConfig): DirectionalLightConfig =>
  JSON.parse(JSON.stringify(light))

const ensureSunLight = (lights: DirectionalLightConfig[]): DirectionalLightConfig[] => {
  if (lights.length === 0) return lights
  if (lights.some((light) => light.isSun)) {
    return lights
  }
  return lights.map((light, index) => (index === 0 ? { ...light, isSun: true } : light))
}

export interface AppState {
  error: string | null
  loading: boolean
  progress: number
  loadingMessage: string | null
  sceneRevision: number
  showGrid: boolean
  showAxes: boolean
  showBoundingBoxes: boolean
  showStats: boolean
  renderMode: 'product' | 'city' | 'hybrid'
  setRenderMode: (mode: 'product' | 'city' | 'hybrid') => void
  showLightHelpers: boolean
  menuLayout: MenuLayout
  menuRowBreaks: MenuRowBreaks
  transformMode: 'translate' | 'rotate' | 'scale' | null
  selectedObject: THREE.Object3D | null
  // --- Project object registry (mode-independent source of truth) ---
  projectObjects: ProjectObject[]
  addProjectObject: (object: ProjectObject) => void
  updateProjectObject: (id: string, updates: Partial<ProjectObject>) => void
  removeProjectObject: (id: string) => void
  setObjectVisible: (id: string, visible: boolean) => void
  selectedMaterial: { mesh: THREE.Mesh; material: THREE.Material; index?: number } | null
  paintMode: boolean
  setPaintMode: (enabled: boolean) => void
  colorPickerMode: boolean
  setColorPickerMode: (enabled: boolean) => void
  faceEditMode: boolean
  setFaceEditMode: (enabled: boolean) => void
  faceEditSnapIncrement: number
  faceEditSnapCoarseIncrement: number
  faceEditSmoothing: number
  faceEditDragSpeed: number
  setFaceEditSnapIncrement: (value: number) => void
  setFaceEditSnapCoarseIncrement: (value: number) => void
  setFaceEditSmoothing: (value: number) => void
  setFaceEditDragSpeed: (value: number) => void
  subObjectSelectionMode: boolean // Mode for selecting child meshes/parts of models
  setSubObjectSelectionMode: (enabled: boolean) => void
  selectedSubObjects: THREE.Object3D[] // Selected child meshes/parts
  setSelectedSubObjects: (objects: THREE.Object3D[]) => void
  edgeSmoothingIntensity: number // 0.0 to 1.0
  setEdgeSmoothingIntensity: (intensity: number) => void
  showLightingPanel: boolean
  showMaterialPanel: boolean
  showTextureManagementPanel: boolean
  pendingModelFile: File | null
  pendingTextureFiles: Map<string, File> | null
  pendingModelLoadCallback: ((mergedTextures?: Map<string, string>) => Promise<void>) | null
  setPendingModelLoad: (file: File | null, textureFiles: Map<string, File> | null, callback: ((mergedTextures?: Map<string, string>) => Promise<void>) | null) => void
  showOptimizationPanel: boolean
  showObjectsPanel: boolean
  showRoomsPanel: boolean
  showRevitConnectionPanel: boolean
  toggleRevitConnectionPanel: () => void
  showRenderingQualityPanel: boolean
  showWeatherPanel: boolean
  showTransformPanel: boolean
  showPathTracerPreview: boolean
  showPrimitivesPanel: boolean
  showRenderingEffectsPanel: boolean
  showEdgeEnhancementPanel: boolean
  showSmoothingPanel: boolean
  toggleSmoothingPanel: () => void
  showPointCloudPanel: boolean
  togglePointCloudPanel: () => void
  setShowPointCloudPanel: (show: boolean) => void
  pointCloudRenderMode: 'points' | 'gaussian'
  setPointCloudRenderMode: (mode: 'points' | 'gaussian') => void
  pointCloudPointScale: number // multiplier applied to the auto-computed point size
  setPointCloudPointScale: (scale: number) => void
  smoothingIntensity: number // 0.0 to 1.0
  setSmoothingIntensity: (intensity: number) => void
  smoothingMeshSelectionMode: boolean
  setSmoothingMeshSelectionMode: (mode: boolean) => void
  selectedSmoothingMeshes: THREE.Object3D[]
  setSelectedSmoothingMeshes: (meshes: THREE.Object3D[]) => void
  showShadowSystemTestPanel: boolean
  toggleShadowSystemTestPanel: () => void
  showHDRTestPanel: boolean
  toggleHDRTestPanel: () => void
  showHDRShadowDemoPanel: boolean
  toggleHDRShadowDemoPanel: () => void
  showOSMGroundV2Panel: boolean
  showPolygonDrawingPanel: boolean
  polygonDrawingEnabled: boolean
  showHotspotsPanel: boolean
  showCubesViewer: boolean
  toggleCubesViewer: () => void
  rooms: RoomInfo[]
  selectedRoomId: string | null
  setRooms: (rooms: RoomInfo[]) => void
  updateRoomColor: (id: string, color: string) => void
  selectRoom: (id: string | null) => void
  showStreetsGLDemo: boolean
  toggleStreetsGLDemo: () => void
  showAIEnhancementPanel: boolean
  toggleAIEnhancementPanel: () => void
  showShaderEditorPanel: boolean
  toggleShaderEditorPanel: () => void
  showWebExportPanel: boolean
  toggleWebExportPanel: () => void
  showPlacesPanel: boolean
  togglePlacesPanel: () => void
  googleMapsApiKey: string | null
  setGoogleMapsApiKey: (key: string | null) => void
  places: Array<{
    id: string
    name: string
    lat: number
    lng: number
    type: string
    address?: string
    rating?: number
    visible: boolean
  }>
  addPlace: (place: Omit<AppState['places'][0], 'id' | 'visible'>) => void
  removePlace: (id: string) => void
  updatePlace: (id: string, updates: Partial<AppState['places'][0]>) => void
  clearPlaces: () => void
  osmBuildingsEnabled: boolean
  osmBuildingsColor: string
  osmBuildingsOpacity: number
  osmBuildingsDefaultHeight: number
  osmBuildingsMetersPerLevel: number
  // Streets GL Ground Layer settings
  streetsGLGroundEnabled: boolean
  streetsGLGroundSize: number
  streetsGLGroundOpacity: number
  streetsGLGroundLat: number
  streetsGLGroundLon: number
  streetsGLGroundZoom: number
  streetsGLGroundLayerType: 'osm' | 'osm-humanitarian' | 'cartodb' | 'cartodb-dark' | 'satellite' | 'topo' | 'custom'
  streetsGLGroundCustomTexture: string | File | null // Custom image file or URL
  streetsGLIframeOverlay: boolean // Show Streets GL in iframe overlay (for 3D buildings)
  streetsGLIframeInteractive: boolean // Allow interaction with Streets GL iframe (false = clicks pass through to 3D models)
  streetsGLShowUI: boolean
  streetsGLBridge: StreetsGLBridge | null // Temporarily show Streets GL UI buttons (for accessing settings/info)
  streetsGLStartRequestedAt: number | null // When City/OSM 3D triggered start (Electron), so UI shows "Starting..." immediately
  streetsGLIframeReloadKey: number // Increment when server becomes available so iframe remounts and loads (fixes "refused" stuck)
  pathTracerActive: boolean
  pathTracerMode: 'gpu' | 'cpu'
  pathTracerSettings: {
    samples: number
    bounces: number
    width: number
    height: number
    denoiseEnabled: boolean
    denoiseStrength: number
  }
  pathTracerSampleTargets: {
    gpu: number
    cpu: number
  }
  pathTracerAutoTarget: {
    gpu: number | null
    cpu: number | null
  }
  pathTracerAutoEnabled: {
    gpu: boolean
    cpu: boolean
  }
  pathTracerLighting: {
    directionalMultiplier: number
    ambientMultiplier: number
    exposureMultiplier: number
  }
  showShortcutsOverlay: boolean
  showTodoPanel: boolean
  todoItems: TodoItem[]
  setTodoItemStatus: (id: string, status: TodoStatus) => void
  toggleTodoPanel: () => void
  // X Button customization settings
  xButtonColor: string // Color of the x button (CSS color value)
  xButtonSize: number // Size of the x button in pixels
  setXButtonColor: (color: string) => void
  setXButtonSize: (size: number) => void
  moveMenuAction: (
    actionId: MenuActionId,
    targetSection: MenuSectionId,
    targetIndex: number,
    sourceSection?: MenuSectionId,
    options?: MoveMenuActionOptions
  ) => void
  undoStack: UndoAction[]
  redoStack: UndoAction[]
  canUndo: boolean
  canRedo: boolean
  ambientIntensity: number
  shadowsEnabled: boolean
  shadowIntensity: number
  shadowBias: number
  showShadowPlane: boolean
  shadowPlaneTransparent: boolean
  showShadowPlaneInPathTracer: boolean
  shadowOpacityEnabled: boolean // Shadow opacity feature
  shadowOpacity: number // Shadow opacity value (0-1)
  shadowColor: string // Shadow color tint
  shadowMapViewerEnabled: boolean // Shadow map viewer for debugging
  shadowMapViewerSize: number // Size of shadow map viewer (pixels)
  shadowMapViewerPosition: { x: number; y: number } // Position of shadow map viewer
  // Shadow quality settings
  shadowMapSize: number // Shadow map resolution (power of 2: 512, 1024, 2048, 4096, 8192)
  useAdaptiveShadowSettings: boolean // Use adaptive bias/normal bias or manual override
  shadowBiasOverride: number // Manual shadow bias override (-0.001 to -0.00001)
  shadowNormalBiasOverride: number // Manual normal bias override (0.0 to 0.1)
  csmShadowRadius: number // CSM (Cascaded Shadow Map) shadow radius
  cameraBoundsEnabled: boolean // Enable camera bounds
  cameraBoundsMin: { x: number; y: number; z: number } // Camera bounds minimum
  cameraBoundsMax: { x: number; y: number; z: number } // Camera bounds maximum
  gridSize: number
  pivotMode: 'center' | 'bottom'
  
  // Multiple lights system
  directionalLights: DirectionalLightConfig[]
  selectedLightId: string | null
  
  // HDR-only mode flag (for testing ground projection)
  hdrOnlyMode: boolean
  
  // HDR Environment
  hdrEnabled: boolean
  hdrUrl: string | null
  hdrFile: File | null
  hdrIntensity: number
  hdrGroundProjectionEnabled: boolean
  hdrGroundProjectionHeight: number
  hdrGroundProjectionRadius: number
  hdrGroundProjectionResolution: number
  hdrGroundProjectionPositionY: number
  hdrRotationAzimuth: number
  hdrRotationElevation: number
  hdrBackgroundVisible: boolean
  replicateApiKey: string | null
  setReplicateApiKey: (key: string | null) => void
  
  // Camera Views
  cameraViews: CameraView[]
  showCameraViewsPanel: boolean
  selectedCameraViewId: string | null
  cameraViewThumbnails: Map<string, string> // Shared thumbnails for all camera views
  setCameraViewThumbnail: (viewId: string, thumbnail: string) => void
  setCameraViewThumbnails: (thumbnails: Map<string, string>) => void
  clearCameraViewThumbnails: () => void
  
  // Rendering Quality Settings
  pixelRatio: number // -1 = auto (devicePixelRatio), otherwise specific value
  maxPixelRatio: number // Maximum pixel ratio cap (default 2)
  useLogarithmicDepthBuffer: boolean
  useHighPerformanceGPU: boolean
  preferCPU: boolean // Prefer CPU/software rendering over GPU (requires reload)
  textureAnisotropy: number // -1 = max available, otherwise specific value
  vsyncEnabled: boolean // Enable VSync (sync with display refresh rate)
  maxFPS: number // Maximum FPS cap (0 = unlimited, -1 = use VSync)
  upscalingEnabled: boolean // Enable DLSS-like upscaling (render at lower res, upscale)
  upscalingQuality: number // Upscaling quality level (50-100%, higher = better quality)
  viewingDistance: number // Camera far plane distance (viewing distance in units)
  setViewingDistance: (distance: number) => void
  
  // Weather settings
  weatherPreset: string
  cloudDensity: number
  cloudThickness: number
  cloudDetail: number
  cloudScale: number
  cloudStorminess: number
  cloudShadowStrength: number
  cloudColor: string
  fogDensity: number
  rainIntensity: number
  snowIntensity: number
  windIntensity: number
  timeOfDay: number
  fogHeight: number
  fogColor: string
  northOffset: number // degrees, rotate world North reference
  // Particle control settings - per effect
  rainParticleScale: number
  rainParticleSpeed: number
  rainCollisionEnabled: boolean
  snowParticleScale: number
  snowParticleSpeed: number
  snowCollisionEnabled: boolean
  windGustsEnabled: boolean
  // Dynamic sky settings
  skyTurbidity: number
  skyAtmosphereDensity: number
  skyRayleigh?: number
  skyMieCoefficient?: number
  skyMieDirectionalG?: number
  skyExposure?: number
  skyElevation?: number // radians
  skyAzimuth?: number // radians
  dynamicSkyEnabled: boolean
  enableStandaloneWeather: boolean // Enable standalone CSM + Sun system (works without Streets GL)
  sunSize: number
  moonSize: number
  weatherQuality: 'low' | 'medium' | 'high' | 'ultra' // Weather system quality preset
  
  // Water settings
  waterEnabled: boolean
  waterLevel: number
  waterColor: string
  waterOpacity: number
  waveSpeed: number
  waveHeight: number
  waterReflectivity: number
  waterMode: 'plane' | 'marchingCubes' | 'ocean' // Water surface mode
  marchingCubesResolution: number
  marchingCubesIsolation: number
  marchingCubesMetaballCount: number
  oceanDistortionScale: number // For ocean shader wave distortion
  oceanSize: number // For ocean shader size scaling
  
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void
  setProgress: (progress: number) => void
  setLoadingMessage: (message: string | null) => void
  toggleGrid: () => void
  toggleAxes: () => void
  toggleLightHelpers: () => void
  toggleBoundingBoxes: () => void
  setShowBoundingBoxes: (show: boolean) => void
  toggleStats: () => void
  setMenuLayout: (layout: MenuLayoutInput) => void
  resetMenuLayout: () => void
  loadMenuLayoutFromStorage: () => void
  saveMenuLayoutToStorage: () => void
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale' | null) => void
  setSelectedObject: (object: THREE.Object3D | null) => void
  setSelectedMaterial: (material: { mesh: THREE.Mesh; material: THREE.Material; index?: number } | null) => void
  toggleLightingPanel: () => void
  toggleMaterialPanel: () => void
  toggleTextureManagementPanel: () => void
  toggleOptimizationPanel: () => void
  toggleObjectsPanel: () => void
  toggleRoomsPanel: () => void
  toggleRenderingQualityPanel: () => void
  toggleWeatherPanel: () => void
  toggleTransformPanel: () => void
  openTransformPanelForSelection: (mode?: 'translate' | 'rotate' | 'scale' | null) => void
  togglePathTracerPreview: () => void
  togglePrimitivesPanel: () => void
  toggleRenderingEffectsPanel: () => void
  toggleEdgeEnhancementPanel: () => void
  toggleOSMGroundV2Panel: () => void
  togglePolygonDrawingPanel: () => void
  setPolygonDrawingEnabled: (enabled: boolean) => void
  toggleHotspotsPanel: () => void
  setOSMBuildingsEnabled: (enabled: boolean) => void
  setOSMBuildingsColor: (color: string) => void
  setOSMBuildingsOpacity: (opacity: number) => void
  setOSMBuildingsDefaultHeight: (height: number) => void
  setOSMBuildingsMetersPerLevel: (meters: number) => void
  // Streets GL Ground Layer actions
  setStreetsGLGroundEnabled: (enabled: boolean) => void
  setStreetsGLGroundSize: (size: number) => void
  setStreetsGLGroundOpacity: (opacity: number) => void
  setStreetsGLGroundLat: (lat: number) => void
  setStreetsGLGroundLon: (lon: number) => void
  setStreetsGLGroundZoom: (zoom: number) => void
  setStreetsGLGroundLayerType: (type: 'osm' | 'osm-humanitarian' | 'cartodb' | 'cartodb-dark' | 'satellite' | 'topo' | 'custom') => void
  setStreetsGLGroundCustomTexture: (texture: string | File | null) => void
  setStreetsGLIframeOverlay: (enabled: boolean) => void
  setStreetsGLIframeInteractive: (enabled: boolean) => void
  setStreetsGLShowUI: (show: boolean) => void
  setStreetsGLBridge: (bridge: StreetsGLBridge | null) => void
  setStreetsGLStartRequestedAt: (t: number | null) => void
  setStreetsGLIframeReloadKey: (n: number | ((prev: number) => number)) => void
  setPathTracerActive: (active: boolean) => void
  setPathTracerMode: (mode: 'gpu' | 'cpu') => void
  setPathTracerSampleTarget: (mode: 'gpu' | 'cpu', samples: number) => void
  setPathTracerAutoTarget: (mode: 'gpu' | 'cpu', samples: number | null) => void
  setPathTracerAutoTargetEnabled: (mode: 'gpu' | 'cpu', enabled: boolean) => void
  updatePathTracerSettings: (settings: Partial<AppState['pathTracerSettings']>) => void
  setPathTracerLighting: (lighting: Partial<AppState['pathTracerLighting']>) => void
  resetPathTracerLighting: () => void
  toggleShortcutsOverlay: () => void
  markSceneRevision: () => void
  undo: () => void
  redo: () => void
  addToUndoStack: (action: UndoAction) => void
  setAmbientIntensity: (intensity: number) => void
  setShadowsEnabled: (enabled: boolean) => void
  setShadowIntensity: (intensity: number) => void
  setShadowBias: (bias: number) => void
  toggleShadowPlane: () => void
  setShadowPlaneTransparent: (transparent: boolean) => void
  setShowShadowPlaneInPathTracer: (show: boolean) => void
  setShadowOpacityEnabled: (enabled: boolean) => void // Shadow opacity feature
  setShadowOpacity: (opacity: number) => void // Shadow opacity value
  setShadowColor: (color: string) => void // Shadow color tint
  setShadowMapViewerEnabled: (enabled: boolean) => void // Shadow map viewer
  setShadowMapViewerSize: (size: number) => void // Shadow map viewer size
  setShadowMapViewerPosition: (position: { x: number; y: number }) => void // Shadow map viewer position
  setEnableStandaloneWeather: (enabled: boolean) => void
  // Shadow quality actions
  setShadowMapSize: (size: number) => void // Shadow map resolution
  setUseAdaptiveShadowSettings: (use: boolean) => void // Use adaptive or manual shadow settings
  setShadowBiasOverride: (bias: number) => void // Manual shadow bias override
  setShadowNormalBiasOverride: (bias: number) => void // Manual normal bias override
  setCsmShadowRadius: (radius: number) => void // CSM shadow radius
  setCameraBoundsEnabled: (enabled: boolean) => void // Enable camera bounds
  setCameraBoundsMin: (min: { x: number; y: number; z: number }) => void // Set camera bounds minimum
  setCameraBoundsMax: (max: { x: number; y: number; z: number }) => void // Set camera bounds maximum
  setGridSize: (size: number) => void
  setPivotMode: (mode: 'center' | 'bottom') => void
  
  // Multiple lights actions
  addDirectionalLight: (light: Omit<DirectionalLightConfig, 'id'>, options?: { pushToUndoStack?: boolean }) => void
  removeDirectionalLight: (id: string, options?: { pushToUndoStack?: boolean }) => void
  updateDirectionalLight: (id: string, updates: Partial<DirectionalLightConfig>, options?: { pushToUndoStack?: boolean }) => void
  setSelectedLightId: (id: string | null) => void
  setSunLight: (id: string) => void
  
  // HDR actions
  setHdrEnabled: (enabled: boolean) => void
  setHdrUrl: (url: string | null) => void
  setHdrFile: (file: File | null) => void
  setHdrIntensity: (intensity: number) => void
  setHdrGroundProjectionEnabled: (enabled: boolean) => void
  setHdrGroundProjectionHeight: (height: number) => void
  setHdrGroundProjectionRadius: (radius: number) => void
  setHdrGroundProjectionResolution: (resolution: number) => void
  setHdrGroundProjectionPositionY: (positionY: number) => void
  setHdrRotationAzimuth: (degrees: number) => void
  setHdrRotationElevation: (degrees: number) => void
  setHdrBackgroundVisible: (visible: boolean) => void
  
  // Camera Views actions
  addCameraView: (view: Omit<CameraView, 'id' | 'createdAt'> | Omit<CameraView, 'id'>) => void
  removeCameraView: (id: string) => void
  updateCameraView: (id: string, updates: Partial<CameraView>) => void
  toggleCameraViewsPanel: () => void
  setSelectedCameraViewId: (id: string | null) => void
  
  // Rendering Quality actions
  setPixelRatio: (ratio: number) => void // -1 for auto
  setMaxPixelRatio: (max: number) => void
  setUseLogarithmicDepthBuffer: (use: boolean) => void
  setUseHighPerformanceGPU: (use: boolean) => void
  setPreferCPU: (prefer: boolean) => void
  setTextureAnisotropy: (anisotropy: number) => void // -1 for max available
  setVsyncEnabled: (enabled: boolean) => void
  setMaxFPS: (fps: number) => void
  setUpscalingEnabled: (enabled: boolean) => void
  setUpscalingQuality: (quality: number) => void
  
  // Post-Processing
  postProcessingEnabled: boolean
  bloomEnabled: boolean
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  lutEnabled: boolean
  lutTexture: THREE.Texture | null
  lutIntensity: number
  anamorphicEnabled: boolean
  anamorphicIntensity: number
  anamorphicThreshold: number
  anamorphicScale: number
  anamorphicColor: string
  aoEnabled: boolean
  aoOutput: number
  aoBias: number
  aoIntensity: number
  aoScale: number
  aoKernelRadius: number
  aoMinResolution: number
  aoBlur: boolean
  aoBlurRadius: number
  aoBlurStdDev: number
  aoBlurDepthCutoff: number
  sssEnabled: boolean
  sssIntensity: number
  sssMaxRadius: number
  sssSamples: number
  sssRayDistance: number
  sssThickness: number
  sssBias: number
  sssLightDirectionX: number
  sssLightDirectionY: number
  sssLightDirectionZ: number
  sssShadowMapIntensityMultiplier: number // Multiplier for SSS intensity when shadow maps are active (0.1 to 0.3, default 0.2)
  ssrEnabled: boolean
  ssrIntensity: number
  ssrThickness: number
  ssrMaxDistance: number
  ssrMaxSteps: number
  ssrMaxBinarySearchSteps: number
  ssrRoughnessFade: number
  ssrFadeDistance: number
  ssrFadeMargin: number
  setPostProcessingEnabled: (enabled: boolean) => void
  setBloomEnabled: (enabled: boolean) => void
  setBloomStrength: (strength: number) => void
  setBloomRadius: (radius: number) => void
  setBloomThreshold: (threshold: number) => void
  setLutEnabled: (enabled: boolean) => void
  setLutTexture: (texture: THREE.Texture | null) => void
  setLutIntensity: (intensity: number) => void
  setAnamorphicEnabled: (enabled: boolean) => void
  setAnamorphicIntensity: (intensity: number) => void
  setAnamorphicThreshold: (threshold: number) => void
  setAnamorphicScale: (scale: number) => void
  setAnamorphicColor: (color: string) => void
  setSssEnabled: (enabled: boolean) => void
  setSssIntensity: (intensity: number) => void
  setSssMaxRadius: (radius: number) => void
  setSssSamples: (samples: number) => void
  setSssRayDistance: (distance: number) => void
  setSssThickness: (thickness: number) => void
  setSssBias: (bias: number) => void
  setSssLightDirection: (x: number, y: number, z: number) => void
  setSsrEnabled: (enabled: boolean) => void
  setSsrIntensity: (intensity: number) => void
  setSsrThickness: (thickness: number) => void
  setSsrMaxDistance: (distance: number) => void
  setSsrMaxSteps: (steps: number) => void
  setSsrMaxBinarySearchSteps: (steps: number) => void
  setSsrRoughnessFade: (fade: number) => void
  setSsrFadeDistance: (distance: number) => void
  setSsrFadeMargin: (margin: number) => void
  // Tone mapping
  toneMappingType: string // 'linear' | 'reinhard' | 'cineon' | 'aces-filmic' | 'uncharted2'
  toneMappingExposure: number
  toneMappingWhitePoint: number
  setToneMappingType: (type: string) => void
  setToneMappingExposure: (exposure: number) => void
  setToneMappingWhitePoint: (whitePoint: number) => void
  
  // Color grading properties
  colorGradingEnabled: boolean
  colorGradingExposure: number // -2.0 to 2.0, 0.0 = neutral (in stops)
  colorGradingContrast: number // -100 to 100, 0 = neutral
  colorGradingHighlights: number // -100 to 100, 0 = neutral
  colorGradingShadows: number // -100 to 100, 0 = neutral
  colorGradingWhites: number // -100 to 100, 0 = neutral
  colorGradingBlacks: number // -100 to 100, 0 = neutral
  colorGradingHue: number // -180 to 180 degrees
  colorGradingSaturation: number // -100 to 100, 0 = neutral
  colorGradingVibrance: number // -100 to 100, 0 = neutral
  colorGradingGamma: number // 0.1 - 3.0, 1.0 = neutral
  setColorGradingEnabled: (enabled: boolean) => void
  setColorGradingExposure: (exposure: number) => void
  setColorGradingContrast: (contrast: number) => void
  setColorGradingHighlights: (highlights: number) => void
  setColorGradingShadows: (shadows: number) => void
  setColorGradingWhites: (whites: number) => void
  setColorGradingBlacks: (blacks: number) => void
  setColorGradingHue: (hue: number) => void
  setColorGradingSaturation: (saturation: number) => void
  setColorGradingVibrance: (vibrance: number) => void
  setColorGradingGamma: (gamma: number) => void
  
  // Weather actions
  setWeatherPreset: (preset: string) => void
  applyWeatherPreset: (preset: Exclude<WeatherPresetId, 'custom'>) => void
  setCloudDensity: (density: number) => void
  setCloudThickness: (t: number) => void
  setCloudDetail: (d: number) => void
  setCloudScale: (s: number) => void
  setCloudStorminess: (v: number) => void
  setCloudShadowStrength: (v: number) => void
  setCloudColor: (c: string) => void
  setFogDensity: (density: number) => void
  setFogHeight: (height: number) => void
  setFogColor: (color: string) => void
  setNorthOffset: (deg: number) => void
  setRainIntensity: (intensity: number) => void
  setSkyTurbidity: (turbidity: number) => void
  setSkyAtmosphereDensity: (density: number) => void
  setSkyRayleigh: (v: number) => void
  setSkyMieCoefficient: (v: number) => void
  setSkyMieDirectionalG: (v: number) => void
  setSkyExposure: (v: number) => void
  setSkyElevation: (rad: number) => void
  setSkyAzimuth: (rad: number) => void
  setDynamicSkyEnabled: (enabled: boolean) => void
  setSnowIntensity: (intensity: number) => void
  setWindIntensity: (intensity: number) => void
  setTimeOfDay: (time: number) => void
  setSunSize: (size: number) => void
  setMoonSize: (size: number) => void
  setWeatherQuality: (quality: 'low' | 'medium' | 'high' | 'ultra') => void
  // Particle control actions - per effect
  setRainParticleScale: (scale: number) => void
  setRainParticleSpeed: (speed: number) => void
  setRainCollisionEnabled: (enabled: boolean) => void
  setSnowParticleScale: (scale: number) => void
  setSnowParticleSpeed: (speed: number) => void
  setSnowCollisionEnabled: (enabled: boolean) => void
  setWindGustsEnabled: (enabled: boolean) => void
  
  // Water actions
  setWaterEnabled: (enabled: boolean) => void
  setWaterLevel: (level: number) => void
  setWaterColor: (color: string) => void
  setWaterOpacity: (opacity: number) => void
  setWaveSpeed: (speed: number) => void
  setWaveHeight: (height: number) => void
  setWaterReflectivity: (reflectivity: number) => void
  setWaterMode: (mode: 'plane' | 'marchingCubes' | 'ocean') => void
  setMarchingCubesResolution: (resolution: number) => void
  setMarchingCubesIsolation: (isolation: number) => void
  setMarchingCubesMetaballCount: (count: number) => void
  setOceanDistortionScale: (scale: number) => void
  setOceanSize: (size: number) => void
}

export type CameraType = 'static' | 'video' | 'panorama'

export interface CameraView {
  id: string
  name: string
  cameraPosition: { x: number; y: number; z: number }
  cameraTarget: { x: number; y: number; z: number }
  createdAt: number
  type: CameraType // 'static' for single image export, 'video' for animated sequence
}

export const useAppStore = create<AppState>((set, get) => ({
  error: null,
  loading: false,
  progress: 0,
  loadingMessage: null,
  sceneRevision: 0,
  showGrid: true,
  showAxes: true,
  showBoundingBoxes: false,
  showStats: false,
  renderMode: 'product',
  showLightHelpers: true,
  menuLayout: initialMenuState.layout,
  menuRowBreaks: initialMenuState.rowBreaks,
  transformMode: null,
  selectedObject: null,
  projectObjects: [],
  selectedMaterial: null,
  paintMode: false,
  colorPickerMode: false,
  faceEditMode: false,
  faceEditSnapIncrement: 0.05, // Fine snap (Shift)
  faceEditSnapCoarseIncrement: 0.25, // Coarse snap (Alt)
  faceEditSmoothing: 0.2, // 0..1 smoothing factor for drag
  faceEditDragSpeed: 0.5, // 0..1 multiplier to slow down drag distance
  subObjectSelectionMode: false,
  selectedSubObjects: [],
  edgeSmoothingIntensity: 0.5,
  showLightingPanel: false,
  showMaterialPanel: false,
  showTextureManagementPanel: false,
  pendingModelFile: null,
  pendingTextureFiles: null,
  pendingModelLoadCallback: null,
  showOptimizationPanel: false,
  showObjectsPanel: false,
  showRoomsPanel: false,
  showRevitConnectionPanel: false,
  showRenderingQualityPanel: false,
  showWeatherPanel: false,
  showTransformPanel: false,
  showPathTracerPreview: false,
  showPrimitivesPanel: false,
  showRenderingEffectsPanel: false,
  showEdgeEnhancementPanel: false,
  showSmoothingPanel: false,
  showPointCloudPanel: false,
  pointCloudRenderMode: 'gaussian',
  pointCloudPointScale: 1,
  smoothingIntensity: 0.5,
  smoothingMeshSelectionMode: false,
  selectedSmoothingMeshes: [],
  showShadowSystemTestPanel: false,
  showHDRTestPanel: false,
  showHDRShadowDemoPanel: false,
  showOSMGroundV2Panel: false, // Disabled - using Streets GL iframe overlay instead
  showPolygonDrawingPanel: false,
  polygonDrawingEnabled: false,
  showHotspotsPanel: false,
  showCubesViewer: false, // Default to false - cubes only created when panel is shown
  rooms: [],
  selectedRoomId: null,
  showStreetsGLDemo: false,
  showAIEnhancementPanel: false,
  // OSM Buildings defaults
  osmBuildingsEnabled: false,
  osmBuildingsColor: '#cccccc',
  osmBuildingsOpacity: 0.9,
  osmBuildingsDefaultHeight: 6,
  osmBuildingsMetersPerLevel: 3,
  // Streets GL Ground Layer defaults
  streetsGLGroundEnabled: false, // Disabled - using Streets GL iframe overlay instead
  streetsGLGroundSize: 1000,
  streetsGLGroundOpacity: 1.0,
  streetsGLGroundLat: 32.89917,
  streetsGLGroundLon: -97.03813,
  streetsGLGroundZoom: 15,
  streetsGLGroundLayerType: 'osm',
  streetsGLGroundCustomTexture: null,
    streetsGLIframeOverlay: false, // Default to false - show 3D scene first, user can enable Streets GL map if needed
    streetsGLIframeInteractive: false, // Default to non-interactive so user can place models
    streetsGLShowUI: false,
  streetsGLBridge: null, // Hide UI by default
  streetsGLStartRequestedAt: null,
  streetsGLIframeReloadKey: 0,
  showShaderEditorPanel: false,
  showWebExportPanel: false,
  showPlacesPanel: false,
  googleMapsApiKey: null,
  places: [],
  pathTracerActive: false,
  pathTracerMode: 'gpu',
  pathTracerSettings: {
    samples: 128,
    bounces: 3,
    width: 1024,
    height: 1024,
    denoiseEnabled: true,
    denoiseStrength: 0.5
  },
  pathTracerSampleTargets: {
    gpu: 128,
    cpu: 128
  },
  pathTracerAutoTarget: {
    gpu: null,
    cpu: null
  },
  pathTracerAutoEnabled: {
    gpu: true,
    cpu: true
  },
  pathTracerLighting: {
    directionalMultiplier: 1,
    ambientMultiplier: 2.0,
    exposureMultiplier: 2.5
  },
  showShortcutsOverlay: false,
  showTodoPanel: false,
  todoItems: DEFAULT_TODO_ITEMS.map((item) => ({ ...item })),
  // X Button customization defaults
  xButtonColor: 'rgba(255, 0, 0, 0.9)', // Default red color
  xButtonSize: 28, // Default size in pixels
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
  ambientIntensity: 1.0, // Ambient light enabled
      shadowsEnabled: true, // Shadows enabled
    shadowIntensity: 1.0,
    shadowBias: -0.0001,
    showShadowPlane: false, // Shadow plane disabled by default
    shadowPlaneTransparent: false,
    showShadowPlaneInPathTracer: true,
    shadowOpacityEnabled: false, // Shadow opacity feature
    shadowOpacity: 1.0, // Full opacity by default
    shadowColor: '#000000', // Black shadows by default
    shadowMapViewerEnabled: false, // Shadow map viewer disabled by default
    shadowMapViewerSize: 256, // Default size 256x256 pixels
    shadowMapViewerPosition: { x: 10, y: 10 }, // Top-left corner
    // Shadow quality defaults
    shadowMapSize: 8192, // Default high-quality shadow map resolution
    useAdaptiveShadowSettings: true, // Use adaptive shadow settings by default
    shadowBiasOverride: -0.0001, // Default manual bias (used when adaptive is disabled)
    shadowNormalBiasOverride: 0.01, // Default manual normal bias (used when adaptive is disabled)
    csmShadowRadius: 100, // Default CSM shadow radius
    cameraBoundsEnabled: false, // Camera bounds disabled by default
    cameraBoundsMin: { x: -Infinity, y: -Infinity, z: -Infinity }, // No minimum bounds by default
    cameraBoundsMax: { x: Infinity, y: Infinity, z: Infinity }, // No maximum bounds by default
  gridSize: 200,
  pivotMode: 'center',
  
  // HDR-only mode flag (for testing ground projection)
  // NOTE: This should ALWAYS be false in production - it disables particle systems, water, dynamic sky, and material shader modifications
  // It does NOT disable lights or shadows, but it was used during testing
  hdrOnlyMode: false, // HDR-only mode disabled - all features enabled
  
  // Initialize with default lights
  directionalLights: [],
  selectedLightId: null,
  
      // HDR defaults
    hdrEnabled: false,
    hdrUrl: null,
    hdrFile: null,
    hdrIntensity: 1.0,
    hdrGroundProjectionEnabled: false,
    hdrGroundProjectionHeight: 15.0,
    hdrGroundProjectionRadius: 100.0,
    hdrGroundProjectionResolution: 512,
    hdrGroundProjectionPositionY: 0.0,
    hdrRotationAzimuth: 0,
    hdrRotationElevation: 0,
    hdrBackgroundVisible: true,
    replicateApiKey: (import.meta.env.VITE_REPLICATE_API_TOKEN ?? '').trim() || null,
    
    // Camera Views defaults
  cameraViews: [],
  showCameraViewsPanel: false,
  selectedCameraViewId: null,
  cameraViewThumbnails: new Map<string, string>(),
  
  // Rendering Quality defaults
  pixelRatio: -1, // -1 = auto (use devicePixelRatio)
  maxPixelRatio: 2, // Cap at 2 for performance, can go higher for quality
  useLogarithmicDepthBuffer: true, // Better depth precision for large scenes
  useHighPerformanceGPU: true, // Prefer dedicated GPU
  preferCPU: false, // Prefer CPU/software rendering over GPU
  textureAnisotropy: -1, // -1 = use maximum available anisotropy
  vsyncEnabled: true, // VSync enabled by default (uses requestAnimationFrame)
  maxFPS: -1, // -1 = use VSync, 0 = unlimited FPS, >0 = FPS cap
  upscalingEnabled: false, // Disable upscaling by default
      upscalingQuality: 70, // Render at 70% resolution, upscale to 100%
  viewingDistance: 100000, // Default viewing distance (camera far plane) for large scenes
    
    // Post-Processing defaults
    postProcessingEnabled: false,
    bloomEnabled: false,
    bloomStrength: 1.5,
    bloomRadius: 0.4,
    bloomThreshold: 0.85,
    lutEnabled: false,
    lutTexture: null,
    lutIntensity: 1.0,
    anamorphicEnabled: false,
    anamorphicIntensity: 0.5,
    anamorphicThreshold: 0.5,
    anamorphicScale: 1.0,
    anamorphicColor: '#ffe6cc',
    aoEnabled: false,
    aoOutput: 0,
    aoBias: 0.5,
    aoIntensity: 0.02,
    aoScale: 1.0,
    aoKernelRadius: 16,
    aoMinResolution: 0,
    aoBlur: true,
    aoBlurRadius: 8,
    aoBlurStdDev: 4,
    aoBlurDepthCutoff: 0.01,
    sssEnabled: false,
    sssIntensity: 0.5,
    sssMaxRadius: 5.0,
    sssSamples: 8,
    sssRayDistance: 50.0,
    sssThickness: 0.02,
    sssBias: 0.01,
    sssLightDirectionX: 0,
    sssLightDirectionY: -1,
    sssLightDirectionZ: 0,
    sssShadowMapIntensityMultiplier: 0.2, // 20% intensity when shadow maps are active (prevents double shadows)
    ssrEnabled: false,
    ssrIntensity: 1.0,
    ssrThickness: 0.01,
    ssrMaxDistance: 100.0,
    ssrMaxSteps: 20,
    ssrMaxBinarySearchSteps: 8,
    ssrRoughnessFade: 1.0,
    ssrFadeDistance: 10.0,
    ssrFadeMargin: 0.05,
    // Tone mapping defaults
    toneMappingType: 'aces-filmic',
    toneMappingExposure: 1.0, // Bright default for HDR scenes
    toneMappingWhitePoint: 1.0,
    
    // Color grading defaults
    colorGradingEnabled: false,
    colorGradingExposure: 0.0, // Neutral
    colorGradingContrast: 0, // Neutral
    colorGradingHighlights: 0, // Neutral
    colorGradingShadows: 0, // Neutral
    colorGradingWhites: 0, // Neutral
    colorGradingBlacks: 0, // Neutral
    colorGradingHue: 0, // No hue shift
    colorGradingSaturation: 0, // Neutral
    colorGradingVibrance: 0, // Neutral
    colorGradingGamma: 1.0, // Neutral
    
    // Weather defaults
    weatherPreset: 'clear',
  cloudDensity: 0, // Clouds disabled by default (can be enabled via weather panel)
  cloudThickness: 0.5,
  cloudDetail: 0.5,
  cloudScale: 1.0,
  cloudStorminess: 0.0,
  cloudShadowStrength: 0.0, // Cloud shadows disabled by default
  cloudColor: '#ffffff',
  fogDensity: 0, // Fog disabled by default (can be enabled via weather panel)
  fogHeight: 10, // Height of fog in world units
  fogColor: '#cccccc', // Fog color
  northOffset: 0,
  rainIntensity: 0, // Rain disabled by default (can be enabled via weather panel)
  snowIntensity: 0, // Snow disabled by default (can be enabled via weather panel)
  windIntensity: 0, // Wind disabled by default (can be enabled via weather panel)
  timeOfDay: 12, // 12 = noon, 0 = midnight
  // Particle control settings - per effect
  rainParticleScale: 0.5,
  rainParticleSpeed: 1.0,
  rainCollisionEnabled: false,
  snowParticleScale: 0.8,
  snowParticleSpeed: 1.0,
  snowCollisionEnabled: false,
  windGustsEnabled: false,
  // Dynamic sky settings (Twinmotion style)
  skyTurbidity: 2, // Atmospheric clarity (2-20, lower = clearer)
  skyAtmosphereDensity: 0.5, // Atmosphere density (0-1)
  skyRayleigh: 3.0,
  skyMieCoefficient: 0.008,
  skyMieDirectionalG: 0.7,
  skyExposure: 0.5,
  skyElevation: Math.PI * 0.2, // ~36°
  skyAzimuth: Math.PI, // 180° facing south by default
  dynamicSkyEnabled: false, // Dynamic sky disabled by default (can be enabled via weather panel)
  enableStandaloneWeather: false, // Standalone weather system disabled by default (CSM + Sun, works offline)
  sunSize: 0.5, // Sun size multiplier (0.1 to 5.0)
  moonSize: 1.0, // Moon size multiplier (0.1 to 5.0)
  weatherQuality: 'high' as const, // Weather system quality preset
  
  // Water defaults
  waterEnabled: false, // Water disabled by default (can be enabled via lighting panel)
  waterLevel: 0,
  waterColor: '#1a4d7a',
  waterOpacity: 0.7,
  waveSpeed: 0.5,
  waveHeight: 0.1,
  waterReflectivity: 0.5,
  waterMode: 'plane' as const, // Default to plane water
  marchingCubesResolution: 40,
  marchingCubesIsolation: 50,
  marchingCubesMetaballCount: 5,
  oceanDistortionScale: 3.7, // Default distortion scale for ocean waves
  oceanSize: 1.0, // Default ocean size scaling
  
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
  setProgress: (progress) => set({ progress }),
  setLoadingMessage: (message) => set({ loadingMessage: message }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleAxes: () => set((state) => ({ showAxes: !state.showAxes })),
  toggleLightHelpers: () => set((state) => ({ showLightHelpers: !state.showLightHelpers })),
  toggleBoundingBoxes: () => set((state) => ({ showBoundingBoxes: !state.showBoundingBoxes })),
  setShowBoundingBoxes: (show: boolean) => set({ showBoundingBoxes: show }),
  toggleStats: () => set((state) => ({ showStats: !state.showStats })),
  setRenderMode: (mode) => set({ renderMode: mode }),
  setMenuLayout: (input) =>
    set((state) => {
      const resolved =
        typeof input === 'object' && input !== null && 'layout' in input
          ? input
          : { layout: input as MenuLayout }
      const normalizedLayout = normalizeMenuLayout(resolved.layout)
      const normalizedRowBreaks = normalizeMenuRowBreaks(
        resolved.rowBreaks ?? createEmptyMenuRowBreaks(),
        normalizedLayout
      )
      return {
        menuLayout: normalizedLayout,
        menuRowBreaks: normalizedRowBreaks
      }
    }),
  resetMenuLayout: () => {
    const layout = createDefaultMenuLayout()
    const rowBreaks = createEmptyMenuRowBreaks()
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(MENU_STORAGE_KEY)
      } catch {}
    }
    set({ menuLayout: layout, menuRowBreaks: rowBreaks })
  },
  loadMenuLayoutFromStorage: () => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(MENU_STORAGE_KEY)
      if (!saved) {
        // No saved layout, use defaults
        const defaultLayout = createDefaultMenuLayout()
        const defaultRowBreaks = createEmptyMenuRowBreaks()
        set({ menuLayout: defaultLayout, menuRowBreaks: defaultRowBreaks })
        return
      }
      const parsed = JSON.parse(saved)
      
      // Check version - if outdated, reset to defaults
      const savedVersion = parsed?.version || 1
      if (savedVersion < MENU_LAYOUT_VERSION) {
        console.log(`[MenuLayout] Version ${savedVersion} is outdated, resetting to version ${MENU_LAYOUT_VERSION}`)
        const defaultLayout = createDefaultMenuLayout()
        const defaultRowBreaks = createEmptyMenuRowBreaks()
        set({ menuLayout: defaultLayout, menuRowBreaks: defaultRowBreaks })
        // Save the new default layout
        const payload = {
          version: MENU_LAYOUT_VERSION,
          layout: defaultLayout,
          rowBreaks: defaultRowBreaks
        }
        window.localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(payload))
        return
      }
      
      let layout: MenuLayout
      let rowBreaksInput: Partial<Record<MenuSectionId, MenuActionId[]>> | null | undefined
      if (parsed && typeof parsed === 'object' && 'layout' in parsed) {
        layout = normalizeMenuLayout((parsed as { layout: MenuLayout }).layout)
        rowBreaksInput = (parsed as { rowBreaks?: Partial<Record<MenuSectionId, MenuActionId[]>> }).rowBreaks
      } else {
        layout = normalizeMenuLayout(parsed)
        rowBreaksInput = null
      }
      const rowBreaks = normalizeMenuRowBreaks(rowBreaksInput, layout)
      set({ menuLayout: layout, menuRowBreaks: rowBreaks })
    } catch (error) {
      console.warn('[MenuLayout] Failed to load from storage:', error)
      // On error, use defaults
      const defaultLayout = createDefaultMenuLayout()
      const defaultRowBreaks = createEmptyMenuRowBreaks()
      set({ menuLayout: defaultLayout, menuRowBreaks: defaultRowBreaks })
    }
  },
  saveMenuLayoutToStorage: () => {
    if (typeof window === 'undefined') return
    try {
      const state = get()
      const payload = {
        version: MENU_LAYOUT_VERSION,
        layout: cloneMenuLayout(state.menuLayout),
        rowBreaks: cloneMenuRowBreaks(state.menuRowBreaks)
      }
      window.localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.error('[MenuLayout] Failed to save to storage:', error)
    }
  },
  setTransformMode: (mode) => set({ transformMode: mode }),
  setSelectedObject: (object) => set({ selectedObject: object }),
  addProjectObject: (object) =>
    set((state) => {
      const existingIndex = state.projectObjects.findIndex((o) => o.id === object.id)
      if (existingIndex >= 0) {
        // Idempotent: replace the existing descriptor (e.g. re-registered after a mode switch).
        const next = state.projectObjects.slice()
        next[existingIndex] = { ...next[existingIndex], ...object }
        return { projectObjects: next, sceneRevision: state.sceneRevision + 1 }
      }
      return {
        projectObjects: [...state.projectObjects, object],
        sceneRevision: state.sceneRevision + 1
      }
    }),
  updateProjectObject: (id, updates) =>
    set((state) => ({
      projectObjects: state.projectObjects.map((o) =>
        o.id === id
          ? {
              ...o,
              ...updates,
              transform: updates.transform ? { ...o.transform, ...updates.transform } : o.transform,
              userData: updates.userData ? { ...o.userData, ...updates.userData } : o.userData
            }
          : o
      )
    })),
  removeProjectObject: (id) =>
    set((state) => ({
      projectObjects: state.projectObjects.filter((o) => o.id !== id),
      sceneRevision: state.sceneRevision + 1
    })),
  setObjectVisible: (id, visible) =>
    set((state) => ({
      projectObjects: state.projectObjects.map((o) => (o.id === id ? { ...o, visible } : o))
    })),
  setSelectedMaterial: (material) => set({ selectedMaterial: material }),
  setRooms: (rooms) => set({ rooms }),
  selectRoom: (id) => set({ selectedRoomId: id }),
  updateRoomColor: (id, color) =>
    set((state) => {
      const newColor = new THREE.Color(color)

      const rooms = state.rooms.map((room) => {
        if (room.id !== id) return room

        const mesh = room.mesh as THREE.Mesh
        if (mesh && mesh.material) {
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          materials.forEach((mat: any) => {
            if (mat && mat.color && typeof mat.color.set === 'function') {
              mat.color.set(newColor)
              mat.needsUpdate = true
            }
          })
        }

        return {
          ...room,
          color
        }
      })

      return { rooms }
    }),
  setPaintMode: (enabled) => set((state) => {
    // Ensure mutual exclusivity - paint mode and color picker cannot both be active
    if (enabled && state.colorPickerMode) {
      console.warn('[useAppStore] Paint mode activated while color picker was active - disabling color picker')
    }
    return {
      paintMode: enabled,
      colorPickerMode: enabled ? false : state.colorPickerMode, // Turn off color picker when paint mode is enabled
      polygonDrawingEnabled: enabled ? false : state.polygonDrawingEnabled // Turn off polygon drawing when paint mode is enabled
    }
  }),
  setColorPickerMode: (enabled) => set((state) => {
    // Ensure mutual exclusivity - paint mode and color picker cannot both be active
    if (enabled && state.paintMode) {
      console.warn('[useAppStore] Color picker activated while paint mode was active - disabling paint mode')
    }
    return {
      colorPickerMode: enabled,
      paintMode: enabled ? false : state.paintMode, // Turn off paint mode when color picker is enabled
      polygonDrawingEnabled: enabled ? false : state.polygonDrawingEnabled, // Turn off polygon drawing when color picker is enabled
      faceEditMode: enabled ? false : state.faceEditMode // Turn off face edit mode when color picker is enabled
    }
  }),
  setFaceEditMode: (enabled) => set((state) => ({ 
    faceEditMode: enabled,
    paintMode: enabled ? false : state.paintMode, // Turn off paint mode when face edit is enabled
    colorPickerMode: enabled ? false : state.colorPickerMode, // Turn off color picker when face edit is enabled
    polygonDrawingEnabled: enabled ? false : state.polygonDrawingEnabled, // Turn off polygon drawing when face edit is enabled
    subObjectSelectionMode: enabled ? false : state.subObjectSelectionMode // Turn off sub-object selection when face edit is enabled
  })),
  setFaceEditSnapIncrement: (value) => set({
    faceEditSnapIncrement: value > 0 ? value : 0
  }),
  setFaceEditSnapCoarseIncrement: (value) => set({
    faceEditSnapCoarseIncrement: value > 0 ? value : 0
  }),
  setFaceEditSmoothing: (value) => set({
    faceEditSmoothing: Math.max(0, Math.min(1, value))
  }),
  setFaceEditDragSpeed: (value) => set({
    faceEditDragSpeed: Math.max(0, Math.min(1, value))
  }),
  setSubObjectSelectionMode: (enabled) => set((state) => ({
    subObjectSelectionMode: enabled,
    faceEditMode: enabled ? false : state.faceEditMode, // Turn off face edit when sub-object selection is enabled
    paintMode: enabled ? false : state.paintMode,
    colorPickerMode: enabled ? false : state.colorPickerMode,
    polygonDrawingEnabled: enabled ? false : state.polygonDrawingEnabled,
    selectedSubObjects: enabled ? state.selectedSubObjects : [] // Clear selection when disabled
  })),
  setSelectedSubObjects: (objects) => set({ selectedSubObjects: objects }),
  setEdgeSmoothingIntensity: (intensity) => set({ 
    edgeSmoothingIntensity: Math.max(0, Math.min(1, intensity)) 
  }),
  toggleLightingPanel: () => set((state) => ({ showLightingPanel: !state.showLightingPanel })),
  toggleMaterialPanel: () => set((state) => ({ showMaterialPanel: !state.showMaterialPanel })),
  toggleTextureManagementPanel: () => set((state) => ({ showTextureManagementPanel: !state.showTextureManagementPanel })),
  setPendingModelLoad: (file, textureFiles, callback) => set({
    pendingModelFile: file,
    pendingTextureFiles: textureFiles,
    pendingModelLoadCallback: callback,
    showTextureManagementPanel: file !== null // Auto-open panel when file is pending
  }),
  toggleOptimizationPanel: () => set((state) => ({ showOptimizationPanel: !state.showOptimizationPanel })),
  toggleObjectsPanel: () => set((state) => ({ showObjectsPanel: !state.showObjectsPanel })),
  toggleRoomsPanel: () => set((state) => ({ showRoomsPanel: !state.showRoomsPanel })),
  toggleRevitConnectionPanel: () => set((state) => ({ showRevitConnectionPanel: !state.showRevitConnectionPanel })),
  toggleRenderingQualityPanel: () => set((state) => ({ showRenderingQualityPanel: !state.showRenderingQualityPanel })),
  toggleWeatherPanel: () => set((state) => ({ showWeatherPanel: !state.showWeatherPanel })),
  toggleTransformPanel: () => set((state) => ({ showTransformPanel: !state.showTransformPanel })),
  openTransformPanelForSelection: (mode = 'translate') =>
    set((state) => ({
      showTransformPanel: true,
      transformMode: mode ?? state.transformMode,
    })),
  togglePathTracerPreview: () => set((state) => ({ showPathTracerPreview: !state.showPathTracerPreview })),
  togglePrimitivesPanel: () => set((state) => ({ showPrimitivesPanel: !state.showPrimitivesPanel })),
  toggleRenderingEffectsPanel: () => set((state) => ({ showRenderingEffectsPanel: !state.showRenderingEffectsPanel })),
  toggleEdgeEnhancementPanel: () => set((state) => ({ showEdgeEnhancementPanel: !state.showEdgeEnhancementPanel })),
  toggleSmoothingPanel: () => set((state) => ({ showSmoothingPanel: !state.showSmoothingPanel })),
  togglePointCloudPanel: () => set((state) => ({ showPointCloudPanel: !state.showPointCloudPanel })),
  setShowPointCloudPanel: (show) => set({ showPointCloudPanel: show }),
  setPointCloudRenderMode: (mode) => set({ pointCloudRenderMode: mode }),
  setPointCloudPointScale: (scale) => set({ pointCloudPointScale: Math.max(0.05, Math.min(20, scale)) }),
  setSmoothingIntensity: (intensity) => set({ smoothingIntensity: Math.max(0, Math.min(1, intensity)) }),
  setSmoothingMeshSelectionMode: (mode) => set({ smoothingMeshSelectionMode: mode }),
  setSelectedSmoothingMeshes: (meshes) => set({ selectedSmoothingMeshes: meshes }),
  toggleOSMGroundV2Panel: () =>
    set((state) => {
      const willOpen = !state.showOSMGroundV2Panel
      // When opening OSM 3D panel, ensure Streets GL overlay is on so the map is visible
      if (willOpen && !state.streetsGLIframeOverlay) {
        return { showOSMGroundV2Panel: true, streetsGLIframeOverlay: true }
      }
      return { showOSMGroundV2Panel: willOpen }
    }),
  togglePolygonDrawingPanel: () => set((state) => ({ showPolygonDrawingPanel: !state.showPolygonDrawingPanel })),
  setPolygonDrawingEnabled: (enabled) => set({ polygonDrawingEnabled: enabled }),
  toggleHotspotsPanel: () => set((state) => ({ showHotspotsPanel: !state.showHotspotsPanel })),
  setOSMBuildingsEnabled: (enabled) => set({ osmBuildingsEnabled: enabled }),
  setOSMBuildingsColor: (color) => set({ osmBuildingsColor: color }),
  setOSMBuildingsOpacity: (opacity) => set({ osmBuildingsOpacity: opacity }),
  setOSMBuildingsDefaultHeight: (height) => set({ osmBuildingsDefaultHeight: height }),
  setOSMBuildingsMetersPerLevel: (meters) => set({ osmBuildingsMetersPerLevel: meters }),
  // Streets GL Ground Layer actions
  setStreetsGLGroundEnabled: (enabled) => set({ streetsGLGroundEnabled: enabled }),
  setStreetsGLGroundSize: (size) => set({ streetsGLGroundSize: size }),
  setStreetsGLGroundOpacity: (opacity) => set({ streetsGLGroundOpacity: opacity }),
  setStreetsGLGroundLat: (lat) => set({ streetsGLGroundLat: lat }),
  setStreetsGLGroundLon: (lon) => set({ streetsGLGroundLon: lon }),
  setStreetsGLGroundZoom: (zoom) => set({ streetsGLGroundZoom: zoom }),
  setStreetsGLGroundLayerType: (type) => set({ streetsGLGroundLayerType: type }),
  setStreetsGLGroundCustomTexture: (texture) => set({ streetsGLGroundCustomTexture: texture }),
  setStreetsGLIframeOverlay: (enabled) => set({ streetsGLIframeOverlay: enabled }),
  setStreetsGLIframeInteractive: (enabled) => set({ streetsGLIframeInteractive: enabled }),
  setStreetsGLShowUI: (show) => set({ streetsGLShowUI: show }),
  setStreetsGLBridge: (bridge) => set({ streetsGLBridge: bridge }),
  setStreetsGLStartRequestedAt: (t) => set({ streetsGLStartRequestedAt: t }),
  setStreetsGLIframeReloadKey: (n) => set((s) => ({ streetsGLIframeReloadKey: typeof n === 'function' ? n(s.streetsGLIframeReloadKey) : n })),
  toggleCubesViewer: () => set((state) => ({ showCubesViewer: !state.showCubesViewer })),
  toggleStreetsGLDemo: () => set((state) => ({ showStreetsGLDemo: !state.showStreetsGLDemo })),
  toggleAIEnhancementPanel: () => set((state) => ({ showAIEnhancementPanel: !state.showAIEnhancementPanel })),
  toggleShaderEditorPanel: () => set((state) => ({ showShaderEditorPanel: !state.showShaderEditorPanel })),
  toggleShadowSystemTestPanel: () => set((state) => ({ showShadowSystemTestPanel: !state.showShadowSystemTestPanel })),
  toggleHDRTestPanel: () => set((state) => ({ showHDRTestPanel: !state.showHDRTestPanel })),
  toggleHDRShadowDemoPanel: () => set((state) => ({ showHDRShadowDemoPanel: !state.showHDRShadowDemoPanel })),
  toggleWebExportPanel: () => set((state) => ({ showWebExportPanel: !state.showWebExportPanel })),
  togglePlacesPanel: () => set((state) => ({ showPlacesPanel: !state.showPlacesPanel })),
  setGoogleMapsApiKey: (key) => set({ googleMapsApiKey: key ? key.trim() || null : null }),
  addPlace: (place) => set((state) => {
    const id = `place-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    return {
      places: [...state.places, { ...place, id, visible: true }]
    }
  }),
  removePlace: (id) => set((state) => ({
    places: state.places.filter(p => p.id !== id)
  })),
  updatePlace: (id, updates) => set((state) => ({
    places: state.places.map(p => p.id === id ? { ...p, ...updates } : p)
  })),
  clearPlaces: () => set({ places: [] }),
  setPathTracerActive: (active) => set({ pathTracerActive: active }),
  setPathTracerMode: (mode) => set((state) => ({
    pathTracerMode: mode,
    pathTracerSettings: {
      ...state.pathTracerSettings,
      samples: state.pathTracerSampleTargets[mode]
    }
  })),
  setPathTracerSampleTarget: (mode, samples) => set((state) => {
    const clamped = Math.max(1, Math.floor(samples))
    const targets = {
      ...state.pathTracerSampleTargets,
      [mode]: clamped
    }
    const shouldUpdateActive = state.pathTracerMode === mode
    const autoEnabled = {
      ...state.pathTracerAutoEnabled,
      [mode]: false
    }
    const autoTarget = {
      ...state.pathTracerAutoTarget,
      [mode]: null
    }
    return {
      pathTracerSampleTargets: targets,
      pathTracerAutoEnabled: autoEnabled,
      pathTracerAutoTarget: autoTarget,
      pathTracerSettings: shouldUpdateActive
        ? {
            ...state.pathTracerSettings,
            samples: clamped
          }
        : state.pathTracerSettings
    }
  }),
  setPathTracerAutoTarget: (mode, samples) => set((state) => {
    const autoTarget = {
      ...state.pathTracerAutoTarget,
      [mode]: samples
    }
    return {
      pathTracerAutoTarget: autoTarget
    }
  }),
  setPathTracerAutoTargetEnabled: (mode, enabled) => set((state) => {
    const autoEnabled = {
      ...state.pathTracerAutoEnabled,
      [mode]: enabled
    }
    let autoTarget = state.pathTracerAutoTarget

    if (!enabled) {
      autoTarget = {
        ...autoTarget,
        [mode]: null
      }
    } else if (enabled) {
      const fallback = state.pathTracerSampleTargets[mode]
      const nextValue = autoTarget[mode] ?? fallback
      autoTarget = {
        ...autoTarget,
        [mode]: nextValue
      }
    }

    return {
      pathTracerAutoEnabled: autoEnabled,
      pathTracerAutoTarget: autoTarget
    }
  }),
  updatePathTracerSettings: (settings) => set((state) => ({
    pathTracerSettings: {
      ...state.pathTracerSettings,
      ...settings
    }
  })),
  setPathTracerLighting: (lighting) => set((state) => ({
    pathTracerLighting: {
      ...state.pathTracerLighting,
      ...lighting
    }
  })),
  resetPathTracerLighting: () => set({
    pathTracerLighting: {
      directionalMultiplier: 1,
      ambientMultiplier: 2.0,
      exposureMultiplier: 2.5
    }
  }),
  toggleShortcutsOverlay: () => set((state) => ({ showShortcutsOverlay: !state.showShortcutsOverlay })),
  markSceneRevision: () => set((state) => ({ sceneRevision: state.sceneRevision + 1 })),
  toggleTodoPanel: () => set((state) => ({ showTodoPanel: !state.showTodoPanel })),
  setTodoItemStatus: (id, status) => set((state) => ({
    todoItems: state.todoItems.map((item) =>
      item.id === id ? { ...item, status } : item
    )
  })),
  setXButtonColor: (color) => set((state) => ({ xButtonColor: color })),
  setXButtonSize: (size) => set((state) => ({ xButtonSize: size })),
  moveMenuAction: (actionId, targetSection, targetIndex, sourceSection, options) => {
    set((state) => {
      const layout = cloneMenuLayout(state.menuLayout)
      const rowBreaks = cloneMenuRowBreaks(state.menuRowBreaks)

      let originSection: MenuSectionId | null = sourceSection ?? null
      if (!originSection) {
        ;(Object.keys(layout) as MenuSectionId[]).forEach((section) => {
          if (layout[section].includes(actionId)) {
            originSection = section
          }
        })
      }

      let carriedRowBreak = false
      if (originSection) {
        layout[originSection] = layout[originSection].filter((id) => id !== actionId)
        if (rowBreaks[originSection]?.includes(actionId)) {
          rowBreaks[originSection] = rowBreaks[originSection].filter((id) => id !== actionId)
          carriedRowBreak = true
        }
      }

      const safeIndex = Math.min(Math.max(targetIndex, 0), layout[targetSection].length)

      // Avoid duplicates if already exists
      layout[targetSection] = layout[targetSection].filter((id) => id !== actionId)
      layout[targetSection].splice(safeIndex, 0, actionId)

      const insertedIndex = layout[targetSection].indexOf(actionId)
      const precedingActionId =
        insertedIndex > 0 ? layout[targetSection][insertedIndex - 1] : null

      const addRowBreak = (section: MenuSectionId, id: MenuActionId | null) => {
        if (!id) return
        if (!rowBreaks[section].includes(id)) {
          rowBreaks[section] = [...rowBreaks[section], id]
        }
      }

      const removeRowBreak = (section: MenuSectionId, id: MenuActionId | null) => {
        if (!id) return
        rowBreaks[section] = rowBreaks[section].filter((existing) => existing !== id)
      }

      if (options?.rowBreakMode === 'add') {
        addRowBreak(targetSection, precedingActionId)
      } else if (options?.rowBreakMode === 'remove') {
        removeRowBreak(targetSection, precedingActionId)
      } else if (carriedRowBreak) {
        addRowBreak(targetSection, actionId)
      }

      const normalizedRowBreaks = normalizeMenuRowBreaks(rowBreaks, layout)

      return { menuLayout: layout, menuRowBreaks: normalizedRowBreaks }
    })
  },
  undo: () => {
    set((state) => {
      if (state.undoStack.length === 0) return state
      const lastAction = state.undoStack[state.undoStack.length - 1]
      
      // Create reverse action for redo stack
      let redoAction: typeof lastAction | null = null
      let nextSelectedObject = state.selectedObject
      let updatedDirectionalLights: DirectionalLightConfig[] | null = null
      let updatedSelectedLightId = state.selectedLightId
      
      if (lastAction.type === 'delete' && lastAction.parent) {
        lastAction.parent.add(lastAction.object)
        nextSelectedObject = lastAction.object
        // Redo action: delete again
        redoAction = { ...lastAction }
      } else if (lastAction.type === 'material-change') {
        // Restore previous material
        if (lastAction.previousMaterial instanceof THREE.Material) {
          lastAction.mesh.material = lastAction.previousMaterial
        } else if (Array.isArray(lastAction.previousMaterial)) {
          lastAction.mesh.material = lastAction.previousMaterial
        }
        // Update material flags
        if (lastAction.mesh.material instanceof THREE.Material) {
          lastAction.mesh.material.needsUpdate = true
        } else if (Array.isArray(lastAction.mesh.material)) {
          lastAction.mesh.material.forEach(mat => mat.needsUpdate = true)
        }
        nextSelectedObject = lastAction.mesh
        // Redo action: apply new material again
        redoAction = {
          type: 'material-change',
          mesh: lastAction.mesh,
          previousMaterial: lastAction.previousMaterial,
          newMaterial: lastAction.newMaterial
        }
      } else if (lastAction.type === 'material-color-change') {
        // Restore previous color
        if ('color' in lastAction.material && lastAction.material.color instanceof THREE.Color) {
          lastAction.material.color.copy(lastAction.previousValue)
          lastAction.material.needsUpdate = true
        }
        nextSelectedObject = lastAction.material.userData?.mesh || state.selectedObject
        // Redo action: apply new color again
        redoAction = {
          type: 'material-color-change',
          material: lastAction.material,
          property: 'color',
          previousValue: lastAction.previousValue,
          newValue: lastAction.newValue
        }
      } else if (lastAction.type === 'transform-change') {
        // Check if object is inside a pivot wrapper
        const pivot = lastAction.object.parent?.userData?.isPivotWrapper 
          ? lastAction.object.parent as THREE.Group 
          : null
        
        if (pivot && pivot.userData.originalModel === lastAction.object) {
          // Object is in a pivot wrapper - restore pivot's world position
          // The stored transform is a world position, so we need to convert it to pivot's local space
          pivot.updateMatrixWorld(true)
          const parent = pivot.parent
          if (parent) {
            parent.updateMatrixWorld(true)
            const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert()
            const worldMatrix = new THREE.Matrix4()
            worldMatrix.compose(
              lastAction.previousTransform.position,
              new THREE.Quaternion().setFromEuler(lastAction.previousTransform.rotation),
              new THREE.Vector3(1, 1, 1) // Pivot scale is always 1,1,1
            )
            const localMatrix = worldMatrix.clone().premultiply(parentInverse)
            const localPos = new THREE.Vector3()
            const localQuat = new THREE.Quaternion()
            const localScale = new THREE.Vector3()
            localMatrix.decompose(localPos, localQuat, localScale)
            pivot.position.copy(localPos)
            pivot.rotation.setFromQuaternion(localQuat)
            pivot.scale.set(1, 1, 1) // Pivot scale should always be 1,1,1
          } else {
            // Pivot is at scene root, world and local are the same
            pivot.position.copy(lastAction.previousTransform.position)
            pivot.rotation.copy(lastAction.previousTransform.rotation)
            pivot.scale.set(1, 1, 1)
          }
          pivot.updateMatrixWorld(true)
          // Restore model scale
          lastAction.object.scale.copy(lastAction.previousTransform.scale)
          lastAction.object.updateMatrixWorld(true)
          nextSelectedObject = lastAction.object
        } else {
          // Object is not in a pivot wrapper - restore local transform directly
          lastAction.object.position.copy(lastAction.previousTransform.position)
          lastAction.object.rotation.copy(lastAction.previousTransform.rotation)
          lastAction.object.scale.copy(lastAction.previousTransform.scale)
          lastAction.object.updateMatrixWorld(true)
          nextSelectedObject = lastAction.object
        }
        
        // CRITICAL: Update transform controls to reflect the restored transform
        // This ensures the gizmo moves to the correct position after undo
        // Use setTimeout to update controls after state update completes
        setTimeout(() => {
          try {
            const viewer = getSharedViewer()
            if (viewer?.transformControls) {
              const transformControls = viewer.transformControls
              const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
              // If the object we're undoing is currently attached to transform controls, update them
              if (attachedObject === lastAction.object || 
                  (attachedObject?.userData?.isPivotWrapper && attachedObject.userData.originalModel === lastAction.object) ||
                  (attachedObject === pivot) ||
                  (attachedObject?.userData?.originalModel === lastAction.object)) {
                // Update transform controls to reflect the new position
                transformControls.updateMatrixWorld()
              }
            }
          } catch (error) {
            // Silently fail if viewer is not available
            console.debug('[Undo] Could not update transform controls:', error)
          }
        }, 0)
        
        // Redo action: apply new transform again
        redoAction = {
          type: 'transform-change',
          object: lastAction.object,
          previousTransform: lastAction.previousTransform,
          newTransform: lastAction.newTransform
        }
      } else if (lastAction.type === 'light-add') {
        const filtered = state.directionalLights.filter((light) => light.id !== lastAction.light.id)
        updatedDirectionalLights = ensureSunLight(filtered)
        if (updatedSelectedLightId === lastAction.light.id) {
          updatedSelectedLightId = updatedDirectionalLights[0]?.id || null
        }
        redoAction = {
          type: 'light-add',
          light: cloneLightConfig(lastAction.light)
        }
      } else if (lastAction.type === 'light-remove') {
        const restored = ensureSunLight([...state.directionalLights, cloneLightConfig(lastAction.light)])
        updatedDirectionalLights = restored
        updatedSelectedLightId = lastAction.light.id
        redoAction = {
          type: 'light-remove',
          light: cloneLightConfig(lastAction.light)
        }
      } else if (lastAction.type === 'light-update') {
        updatedDirectionalLights = state.directionalLights.map((light) =>
          light.id === lastAction.previous.id ? cloneLightConfig(lastAction.previous) : light
        )
        updatedDirectionalLights = ensureSunLight(updatedDirectionalLights)
        redoAction = {
          type: 'light-update',
          previous: cloneLightConfig(lastAction.previous),
          next: cloneLightConfig(lastAction.next)
        }
      } else if (lastAction.type === 'rename') {
        lastAction.object.name = lastAction.oldName
        nextSelectedObject = lastAction.object
        redoAction = {
          type: 'rename',
          object: lastAction.object,
          oldName: lastAction.oldName,
          newName: lastAction.newName
        }
      } else if (lastAction.type === 'edge-smoothing') {
        lastAction.objects.forEach(({ object, originalGeometry }) => {
          if (object instanceof THREE.Mesh && originalGeometry) {
            object.geometry.dispose()
            object.geometry = originalGeometry.clone()
            object.geometry.computeBoundingBox()
            object.geometry.computeBoundingSphere()
          }
        })
        nextSelectedObject = lastAction.objects[0]?.object ?? state.selectedObject
        redoAction = {
          type: 'edge-smoothing',
          objects: lastAction.objects.map(({ object, originalGeometry }) => ({
            object,
            originalGeometry: originalGeometry ? originalGeometry.clone() : null
          })),
          intensity: lastAction.intensity
        }
      }
      
      const nextDirectionalLights = updatedDirectionalLights ?? state.directionalLights
      
      const newUndoStack = state.undoStack.slice(0, -1)
      const newRedoStack = redoAction ? [...state.redoStack, redoAction] : state.redoStack
      
      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: newRedoStack.length > 0,
        sceneRevision: state.sceneRevision + 1,
        selectedObject: nextSelectedObject,
        directionalLights: nextDirectionalLights,
        selectedLightId: updatedSelectedLightId
      }
    })
  },
  redo: () => {
    set((state) => {
      if (state.redoStack.length === 0) return state
      const lastAction = state.redoStack[state.redoStack.length - 1]
      
      // Create reverse action for undo stack
      let undoAction: typeof lastAction | null = null
      let nextSelectedObject = state.selectedObject
      let updatedDirectionalLights: DirectionalLightConfig[] | null = null
      let updatedSelectedLightId = state.selectedLightId
      
      if (lastAction.type === 'delete' && lastAction.parent) {
        lastAction.parent.remove(lastAction.object)
        if (state.selectedObject === lastAction.object) {
          nextSelectedObject = null
        }
        // Undo action: add back
        undoAction = { ...lastAction }
      } else if (lastAction.type === 'material-change') {
        // Apply new material
        if (lastAction.newMaterial instanceof THREE.Material) {
          lastAction.mesh.material = lastAction.newMaterial
        } else if (lastAction.newMaterial === null) {
          lastAction.mesh.material = lastAction.previousMaterial
        }
        // Update material flags
        if (lastAction.mesh.material instanceof THREE.Material) {
          lastAction.mesh.material.needsUpdate = true
        } else if (Array.isArray(lastAction.mesh.material)) {
          lastAction.mesh.material.forEach(mat => mat.needsUpdate = true)
        }
        nextSelectedObject = lastAction.mesh
        // Undo action: restore previous material
        undoAction = {
          type: 'material-change',
          mesh: lastAction.mesh,
          previousMaterial: lastAction.previousMaterial,
          newMaterial: lastAction.newMaterial
        }
      } else if (lastAction.type === 'material-color-change') {
        // Apply new color
        if ('color' in lastAction.material && lastAction.material.color instanceof THREE.Color) {
          lastAction.material.color.copy(lastAction.newValue)
          lastAction.material.needsUpdate = true
        }
        nextSelectedObject = lastAction.material.userData?.mesh || state.selectedObject
        // Undo action: restore previous color
        undoAction = {
          type: 'material-color-change',
          material: lastAction.material,
          property: 'color',
          previousValue: lastAction.previousValue,
          newValue: lastAction.newValue
        }
      } else if (lastAction.type === 'transform-change') {
        // Check if object is inside a pivot wrapper
        const pivot = lastAction.object.parent?.userData?.isPivotWrapper 
          ? lastAction.object.parent as THREE.Group 
          : null
        
        if (pivot && pivot.userData.originalModel === lastAction.object) {
          // Object is in a pivot wrapper - restore pivot's world position
          pivot.updateMatrixWorld(true)
          const parent = pivot.parent
          if (parent) {
            parent.updateMatrixWorld(true)
            const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert()
            const worldMatrix = new THREE.Matrix4()
            worldMatrix.compose(
              lastAction.newTransform.position,
              new THREE.Quaternion().setFromEuler(lastAction.newTransform.rotation),
              new THREE.Vector3(1, 1, 1) // Pivot scale is always 1,1,1
            )
            const localMatrix = worldMatrix.clone().premultiply(parentInverse)
            const localPos = new THREE.Vector3()
            const localQuat = new THREE.Quaternion()
            const localScale = new THREE.Vector3()
            localMatrix.decompose(localPos, localQuat, localScale)
            pivot.position.copy(localPos)
            pivot.rotation.setFromQuaternion(localQuat)
            pivot.scale.set(1, 1, 1)
          } else {
            pivot.position.copy(lastAction.newTransform.position)
            pivot.rotation.copy(lastAction.newTransform.rotation)
            pivot.scale.set(1, 1, 1)
          }
          pivot.updateMatrixWorld(true)
          // Restore model scale
          lastAction.object.scale.copy(lastAction.newTransform.scale)
          lastAction.object.updateMatrixWorld(true)
          nextSelectedObject = lastAction.object
        } else {
          // Object is not in a pivot wrapper - restore local transform directly
          lastAction.object.position.copy(lastAction.newTransform.position)
          lastAction.object.rotation.copy(lastAction.newTransform.rotation)
          lastAction.object.scale.copy(lastAction.newTransform.scale)
          lastAction.object.updateMatrixWorld(true)
          nextSelectedObject = lastAction.object
        }
        
        // CRITICAL: Update transform controls to reflect the restored transform
        // This ensures the gizmo moves to the correct position after redo
        setTimeout(() => {
          try {
            const viewer = getSharedViewer()
            if (viewer?.transformControls) {
              const transformControls = viewer.transformControls
              const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
              // If the object we're redoing is currently attached to transform controls, update them
              if (attachedObject === lastAction.object || 
                  (attachedObject?.userData?.isPivotWrapper && attachedObject.userData.originalModel === lastAction.object) ||
                  (attachedObject === pivot) ||
                  (attachedObject?.userData?.originalModel === lastAction.object)) {
                // Update transform controls to reflect the new position
                transformControls.updateMatrixWorld()
              }
            }
          } catch (error) {
            // Silently fail if viewer is not available
            console.debug('[Redo] Could not update transform controls:', error)
          }
        }, 0)
        
        // Undo action: restore previous transform
        undoAction = {
          type: 'transform-change',
          object: lastAction.object,
          previousTransform: lastAction.previousTransform,
          newTransform: lastAction.newTransform
        }
      } else if (lastAction.type === 'light-add') {
        const added = ensureSunLight([...state.directionalLights, cloneLightConfig(lastAction.light)])
        updatedDirectionalLights = added
        updatedSelectedLightId = lastAction.light.id
        undoAction = {
          type: 'light-add',
          light: cloneLightConfig(lastAction.light)
        }
      } else if (lastAction.type === 'light-remove') {
        const filtered = state.directionalLights.filter((light) => light.id !== lastAction.light.id)
        updatedDirectionalLights = ensureSunLight(filtered)
        if (updatedSelectedLightId === lastAction.light.id) {
          updatedSelectedLightId = updatedDirectionalLights[0]?.id || null
        }
        undoAction = {
          type: 'light-remove',
          light: cloneLightConfig(lastAction.light)
        }
      } else if (lastAction.type === 'light-update') {
        updatedDirectionalLights = state.directionalLights.map((light) =>
          light.id === lastAction.next.id ? cloneLightConfig(lastAction.next) : light
        )
        updatedDirectionalLights = ensureSunLight(updatedDirectionalLights)
        undoAction = {
          type: 'light-update',
          previous: cloneLightConfig(lastAction.previous),
          next: cloneLightConfig(lastAction.next)
        }
      } else if (lastAction.type === 'rename') {
        lastAction.object.name = lastAction.newName
        nextSelectedObject = lastAction.object
        undoAction = {
          type: 'rename',
          object: lastAction.object,
          oldName: lastAction.newName,
          newName: lastAction.oldName
        }
      } else if (lastAction.type === 'edge-smoothing') {
        lastAction.objects.forEach(({ object }) => {
          if (object instanceof THREE.Mesh) {
            smoothEdges(object, {
              intensity: lastAction.intensity ?? state.edgeSmoothingIntensity,
              preserveUVs: true,
              angleThreshold: Math.PI / 6
            })
            object.geometry.computeBoundingBox()
            object.geometry.computeBoundingSphere()
          }
        })
        nextSelectedObject = lastAction.objects[0]?.object ?? state.selectedObject
        undoAction = {
          type: 'edge-smoothing',
          objects: lastAction.objects.map(({ object, originalGeometry }) => ({
            object,
            originalGeometry: originalGeometry ? originalGeometry.clone() : null
          })),
          intensity: lastAction.intensity
        }
      }
      
      const nextDirectionalLights = updatedDirectionalLights ?? state.directionalLights
      
      const newRedoStack = state.redoStack.slice(0, -1)
      const newUndoStack = undoAction ? [...state.undoStack, undoAction] : state.undoStack
      
      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: newRedoStack.length > 0,
        sceneRevision: state.sceneRevision + 1,
        selectedObject: nextSelectedObject,
        directionalLights: nextDirectionalLights,
        selectedLightId: updatedSelectedLightId
      }
    })
  },
  addToUndoStack: (action) => {
    set((state) => ({
      undoStack: [...state.undoStack, action],
      redoStack: [], // Clear redo stack when new action is performed
      canUndo: true,
      canRedo: false,
      sceneRevision: state.sceneRevision + 1
    }))
  },
  setAmbientIntensity: (intensity) => set({ ambientIntensity: intensity }),
      setShadowsEnabled: (enabled) => set({ shadowsEnabled: enabled }),
    setShadowIntensity: (intensity) => set({ shadowIntensity: Math.max(0, Math.min(2, intensity)) }),
    setShadowBias: (bias) => set({ shadowBias: Math.max(-0.01, Math.min(0.01, bias)) }),
    toggleShadowPlane: () => set((state) => ({ showShadowPlane: !state.showShadowPlane })),
    setShadowPlaneTransparent: (transparent: boolean) => set({ shadowPlaneTransparent: transparent }),
    setShowShadowPlaneInPathTracer: (show: boolean) => set({ showShadowPlaneInPathTracer: show }),
  setShadowOpacityEnabled: (enabled) => set({ shadowOpacityEnabled: enabled }),
  setShadowOpacity: (opacity) => set({ shadowOpacity: Math.max(0, Math.min(1, opacity)) }),
  setShadowColor: (color) => set({ shadowColor: color }),
  setShadowMapViewerEnabled: (enabled) => set({ shadowMapViewerEnabled: enabled }),
  setShadowMapViewerSize: (size) => set({ shadowMapViewerSize: Math.max(64, Math.min(512, size)) }),
  setShadowMapViewerPosition: (position) => set({ shadowMapViewerPosition: position }),
  // Shadow quality actions
  setShadowMapSize: (size) => {
    // Clamp to valid power-of-2 values: 512, 1024, 2048, 4096, 8192, 16384
    const validSizes = [512, 1024, 2048, 4096, 8192, 16384]
    const closestSize = validSizes.reduce((prev, curr) => 
      Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev
    )
    set({ shadowMapSize: closestSize })
  },
  setUseAdaptiveShadowSettings: (use) => set({ useAdaptiveShadowSettings: use }),
  setShadowBiasOverride: (bias) => set({ shadowBiasOverride: THREE.MathUtils.clamp(bias, -0.001, -0.00001) }),
  setShadowNormalBiasOverride: (bias) => set({ shadowNormalBiasOverride: THREE.MathUtils.clamp(bias, 0.0, 0.1) }),
  setCsmShadowRadius: (radius: number) => set({ csmShadowRadius: Math.max(0, radius) }),
  setCameraBoundsEnabled: (enabled: boolean) => set({ cameraBoundsEnabled: enabled }),
  setCameraBoundsMin: (min: { x: number; y: number; z: number }) => set({ cameraBoundsMin: min }),
  setCameraBoundsMax: (max: { x: number; y: number; z: number }) => set({ cameraBoundsMax: max }),
  setGridSize: (size) => set({ gridSize: Math.max(10, Math.min(1000, size)) }),
  setPivotMode: (mode) => set({ pivotMode: mode }),
  
  addDirectionalLight: (light, options) => {
    const id = `light-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const normalizedLight = {
      ...light,
      shadowRadius: light.shadowRadius ?? 3
    }
    const newLight = { ...normalizedLight, id }
    set((state) => ({
      directionalLights: [...state.directionalLights, newLight],
      selectedLightId: id
    }))
    
    if (options?.pushToUndoStack !== false) {
      const cloned = cloneLightConfig(newLight)
      get().addToUndoStack({ type: 'light-add', light: cloned })
    }
  },
  
  removeDirectionalLight: (id, options) => {
    let removedLight: DirectionalLightConfig | null = null
    set((state) => {
      const lights = state.directionalLights.filter(l => {
        if (l.id === id) {
          removedLight = cloneLightConfig(l)
          return false
        }
        return true
      })
      if (lights.length === state.directionalLights.length) {
        return state
      }
      if (lights.length === 0) {
        // Prevent removing the last light
        removedLight = null
        return state
      }
      const normalizedLights = ensureSunLight(lights)
      return {
        directionalLights: normalizedLights,
        selectedLightId: normalizedLights[0]?.id || null
      }
    })
    
    if (removedLight && options?.pushToUndoStack !== false) {
      get().addToUndoStack({ type: 'light-remove', light: removedLight })
    }
  },
  
  updateDirectionalLight: (id, updates, options) => {
    const sanitizedUpdates = { ...updates }
    if (sanitizedUpdates.shadowRadius !== undefined) {
      sanitizedUpdates.shadowRadius = Math.max(0, Math.min(15, sanitizedUpdates.shadowRadius))
    }
    
    let previousConfig: DirectionalLightConfig | null = null
    let nextConfig: DirectionalLightConfig | null = null
    set((state) => {
      const updated = state.directionalLights.map((light) => {
        if (light.id !== id) return light
        previousConfig = cloneLightConfig(light)
        const merged = { ...light, ...sanitizedUpdates }
        nextConfig = cloneLightConfig(merged)
        return merged
      })
      if (!previousConfig) {
        return state
      }
      return {
        directionalLights: updated
      }
    })
    
    if (previousConfig && nextConfig && options?.pushToUndoStack !== false) {
      get().addToUndoStack({
        type: 'light-update',
        previous: previousConfig,
        next: nextConfig
      })
    }
  },
  
  setSelectedLightId: (id) => set({ selectedLightId: id }),
  
  setSunLight: (id) => {
    set((state) => ({
      directionalLights: state.directionalLights.map(l => ({
        ...l,
        isSun: l.id === id
      }))
    }))
  },
  
  setHdrEnabled: (enabled) => set({ hdrEnabled: enabled }),
  setHdrUrl: (url) => set({ hdrUrl: url }),
  setHdrFile: (file) => set({ hdrFile: file }),
  setHdrIntensity: (intensity) => set({ hdrIntensity: intensity }),
  setHdrGroundProjectionEnabled: (enabled) => {
    const state = get()
    if (enabled && state.enableStandaloneWeather) {
      console.warn(
        '[Weather] Disabling standalone weather — HDR ground projection conflicts with standalone CSM/sun.'
      )
      set({ hdrGroundProjectionEnabled: enabled, enableStandaloneWeather: false })
      return
    }
    set({ hdrGroundProjectionEnabled: enabled })
  },
  setHdrGroundProjectionHeight: (height) => set({ hdrGroundProjectionHeight: height }),
  setHdrGroundProjectionRadius: (radius) => set({ hdrGroundProjectionRadius: radius }),
  setHdrGroundProjectionResolution: (resolution) => set({ hdrGroundProjectionResolution: resolution }),
  setHdrGroundProjectionPositionY: (positionY) => set({ hdrGroundProjectionPositionY: positionY }),
  setHdrRotationAzimuth: (degrees) =>
    set({
      hdrRotationAzimuth: ((degrees % 360) + 360) % 360
    }),
  setHdrRotationElevation: (degrees) =>
    set({
      hdrRotationElevation: Math.max(-90, Math.min(90, degrees))
    }),
  setHdrBackgroundVisible: (visible) => set({ hdrBackgroundVisible: visible }),
  setReplicateApiKey: (key) =>
    set({
      replicateApiKey: key ? key.trim() || null : null
    }),
  
  // Camera Views actions
      addCameraView: (view) => {
        const id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        const now = Date.now()
        set((state) => ({
          cameraViews: [...state.cameraViews, { 
            ...view, 
            id, 
            type: ('type' in view && view.type) ? view.type : 'static', // Default to static
            createdAt: ('createdAt' in view && view.createdAt) ? view.createdAt : now 
          }]
        }))
      },
  
  removeCameraView: (id) => {
    set((state) => {
      const newThumbnails = new Map(state.cameraViewThumbnails)
      newThumbnails.delete(id) // Remove thumbnail when view is deleted
      return {
        cameraViews: state.cameraViews.filter(v => v.id !== id),
        selectedCameraViewId: state.selectedCameraViewId === id ? null : state.selectedCameraViewId,
        cameraViewThumbnails: newThumbnails
      }
    })
  },
  
  updateCameraView: (id, updates) => {
    set((state) => ({
      cameraViews: state.cameraViews.map(v =>
        v.id === id ? { ...v, ...updates } : v
      )
    }))
  },
  
  toggleCameraViewsPanel: () => set((state) => ({ showCameraViewsPanel: !state.showCameraViewsPanel })),
  setSelectedCameraViewId: (id) => set({ selectedCameraViewId: id }),
  
  // Camera View Thumbnails actions
  setCameraViewThumbnail: (viewId, thumbnail) => set((state) => {
    const newThumbnails = new Map(state.cameraViewThumbnails)
    newThumbnails.set(viewId, thumbnail)
    return { cameraViewThumbnails: newThumbnails }
  }),
  
  setCameraViewThumbnails: (thumbnails) => set({ cameraViewThumbnails: thumbnails }),
  
  clearCameraViewThumbnails: () => set({ cameraViewThumbnails: new Map<string, string>() }),
  
  // Rendering Quality actions
  setPixelRatio: (ratio) => set({ pixelRatio: ratio >= 0 ? Math.max(0.5, Math.min(4, ratio)) : -1 }),
  setMaxPixelRatio: (max) => set({ maxPixelRatio: Math.max(1, Math.min(4, max)) }),
  setUseLogarithmicDepthBuffer: (use) => set({ useLogarithmicDepthBuffer: use }),
  setUseHighPerformanceGPU: (use) => set({ useHighPerformanceGPU: use }),
  setPreferCPU: (prefer) => set({ preferCPU: prefer }),
  setTextureAnisotropy: (anisotropy) => set({ textureAnisotropy: anisotropy >= 0 ? Math.max(1, Math.min(16, anisotropy)) : -1 }),
  setVsyncEnabled: (enabled) => set({ vsyncEnabled: enabled }),
  setMaxFPS: (fps) => set({ maxFPS: fps === -1 ? -1 : Math.max(0, Math.min(144, fps)) }),
      setUpscalingEnabled: (enabled) => set({ upscalingEnabled: enabled }),
    setUpscalingQuality: (quality) => set({ upscalingQuality: Math.max(50, Math.min(100, quality)) }),
  setViewingDistance: (distance) => set({ viewingDistance: Math.max(1000, Math.min(1000000, distance)) }),
    
    // Post-Processing actions
    setPostProcessingEnabled: (enabled) => set({ postProcessingEnabled: enabled }),
    setBloomEnabled: (enabled) => set({ bloomEnabled: enabled }),
    setBloomStrength: (strength) => set({ bloomStrength: Math.max(0, Math.min(3, strength)) }),
    setBloomRadius: (radius) => set({ bloomRadius: Math.max(0, Math.min(1, radius)) }),
    setBloomThreshold: (threshold) => set({ bloomThreshold: Math.max(0, Math.min(1, threshold)) }),
    setLutEnabled: (enabled) => set({ lutEnabled: enabled }),
    setLutTexture: (texture) => set({ lutTexture: texture }),
    setLutIntensity: (intensity) => set({ lutIntensity: Math.max(0, Math.min(1, intensity)) }),
    setAnamorphicEnabled: (enabled) => set({ anamorphicEnabled: enabled }),
    setAnamorphicIntensity: (intensity) => set({ anamorphicIntensity: Math.max(0, Math.min(3, intensity)) }),
    setAnamorphicThreshold: (threshold) => set({ anamorphicThreshold: Math.max(0, Math.min(1, threshold)) }),
    setAnamorphicScale: (scale) => set({ anamorphicScale: Math.max(0.1, Math.min(5, scale)) }),
    setAnamorphicColor: (color) => set({ anamorphicColor: color }),
    setSssEnabled: (enabled) => set({ sssEnabled: enabled }),
    setSssIntensity: (intensity) => set({ sssIntensity: Math.max(0, Math.min(2, intensity)) }),
    setSssMaxRadius: (radius) => set({ sssMaxRadius: Math.max(0.1, Math.min(20, radius)) }),
    setSssSamples: (samples) => set({ sssSamples: Math.max(1, Math.min(64, samples)) }),
    setSssRayDistance: (distance) => set({ sssRayDistance: Math.max(1, Math.min(200, distance)) }),
    setSssThickness: (thickness) => set({ sssThickness: Math.max(0.001, Math.min(1, thickness)) }),
    setSssBias: (bias) => set({ sssBias: Math.max(0, Math.min(1, bias)) }),
    setSssLightDirection: (x, y, z) => set({ 
      sssLightDirectionX: x, 
      sssLightDirectionY: y, 
      sssLightDirectionZ: z 
    }),
    setSssShadowMapIntensityMultiplier: (multiplier: number) => set({ 
      sssShadowMapIntensityMultiplier: Math.max(0.1, Math.min(0.3, multiplier)) 
    }),
    setSsrEnabled: (enabled) => set({ ssrEnabled: enabled }),
    setSsrIntensity: (intensity) => set({ ssrIntensity: Math.max(0, Math.min(2, intensity)) }),
    setSsrThickness: (thickness) => set({ ssrThickness: Math.max(0.001, Math.min(1, thickness)) }),
    setSsrMaxDistance: (distance) => set({ ssrMaxDistance: Math.max(1, Math.min(500, distance)) }),
    setSsrMaxSteps: (steps) => set({ ssrMaxSteps: Math.max(1, Math.min(64, steps)) }),
    setSsrMaxBinarySearchSteps: (steps) => set({ ssrMaxBinarySearchSteps: Math.max(1, Math.min(16, steps)) }),
    setSsrRoughnessFade: (fade) => set({ ssrRoughnessFade: Math.max(0, Math.min(1, fade)) }),
    setSsrFadeDistance: (distance) => set({ ssrFadeDistance: Math.max(0, Math.min(100, distance)) }),
    setSsrFadeMargin: (margin) => set({ ssrFadeMargin: Math.max(0, Math.min(1, margin)) }),
    
    // Tone mapping actions
    setToneMappingType: (type) => set({ toneMappingType: type }),
    setToneMappingExposure: (exposure) => set({ toneMappingExposure: Math.max(0.1, Math.min(5, exposure)) }),
    setToneMappingWhitePoint: (whitePoint) => set({ toneMappingWhitePoint: Math.max(0.5, Math.min(5, whitePoint)) }),
    
    // Color grading actions
    setColorGradingEnabled: (enabled) => set({ colorGradingEnabled: enabled }),
    setColorGradingExposure: (exposure) => set({ colorGradingExposure: Math.max(-2.0, Math.min(2.0, exposure)) }),
    setColorGradingContrast: (contrast) => set({ colorGradingContrast: Math.max(-100, Math.min(100, contrast)) }),
    setColorGradingHighlights: (highlights) => set({ colorGradingHighlights: Math.max(-100, Math.min(100, highlights)) }),
    setColorGradingShadows: (shadows) => set({ colorGradingShadows: Math.max(-100, Math.min(100, shadows)) }),
    setColorGradingWhites: (whites) => set({ colorGradingWhites: Math.max(-100, Math.min(100, whites)) }),
    setColorGradingBlacks: (blacks) => set({ colorGradingBlacks: Math.max(-100, Math.min(100, blacks)) }),
    setColorGradingHue: (hue) => set({ colorGradingHue: Math.max(-180, Math.min(180, hue)) }),
    setColorGradingSaturation: (saturation) => set({ colorGradingSaturation: Math.max(-100, Math.min(100, saturation)) }),
    setColorGradingVibrance: (vibrance) => set({ colorGradingVibrance: Math.max(-100, Math.min(100, vibrance)) }),
    setColorGradingGamma: (gamma) => set({ colorGradingGamma: Math.max(0.1, Math.min(3.0, gamma)) }),
    
    // Weather actions
  setWeatherPreset: (preset) => set({ weatherPreset: preset }),
  applyWeatherPreset: (preset) => {
    const patch = weatherPresetStorePatch(preset)
    set({
      weatherPreset: patch.weatherPreset,
      fogDensity: Math.max(0, Math.min(1, patch.fogDensity)),
      fogColor: patch.fogColor,
      rainIntensity: Math.max(0, Math.min(1, patch.rainIntensity)),
      snowIntensity: Math.max(0, Math.min(1, patch.snowIntensity)),
      cloudDensity: Math.max(0, Math.min(1, patch.cloudDensity)),
      cloudStorminess: Math.max(0, Math.min(1, patch.cloudStorminess)),
      windIntensity: Math.max(0, Math.min(1, patch.windIntensity))
    })
  },
  setCloudDensity: (density) => set({ cloudDensity: Math.max(0, Math.min(1, density)) }),
  setCloudThickness: (t) => set({ cloudThickness: Math.max(0, Math.min(1, t)) }),
  setCloudDetail: (d) => set({ cloudDetail: Math.max(0, Math.min(1, d)) }),
  setCloudScale: (s) => set({ cloudScale: Math.max(0.25, Math.min(2, s)) }),
  setCloudStorminess: (v) => set({ cloudStorminess: Math.max(0, Math.min(1, v)) }),
  setCloudShadowStrength: (v) => set({ cloudShadowStrength: Math.max(0, Math.min(1, v)) }),
  setCloudColor: (c) => set({ cloudColor: c }),
  setFogDensity: (density) => set({ fogDensity: Math.max(0, Math.min(1, density)) }),
  setFogHeight: (height) => set({ fogHeight: Math.max(0.1, Math.min(100, height)) }),
  setFogColor: (color) => set({ fogColor: color }),
  setNorthOffset: (deg) => set({ northOffset: Math.max(-180, Math.min(180, deg)) }),
  setRainIntensity: (intensity) => set({ rainIntensity: Math.max(0, Math.min(1, intensity)) }),
  setSkyTurbidity: (turbidity) => set({ skyTurbidity: Math.max(2, Math.min(20, turbidity)) }),
  setSkyAtmosphereDensity: (density) => set({ skyAtmosphereDensity: Math.max(0, Math.min(1, density)) }),
  setSkyRayleigh: (v) => set({ skyRayleigh: Math.max(0, Math.min(10, v)) }),
  setSkyMieCoefficient: (v) => set({ skyMieCoefficient: Math.max(0, Math.min(0.05, v)) }),
  setSkyMieDirectionalG: (v) => set({ skyMieDirectionalG: Math.max(0, Math.min(1, v)) }),
  setSkyExposure: (v) => set({ skyExposure: Math.max(0, Math.min(2, v)) }),
  setSkyElevation: (rad) => set({ skyElevation: Math.max(0, Math.min(Math.PI / 2, rad)) }),
  setSkyAzimuth: (rad) => set({ skyAzimuth: Math.max(-Math.PI, Math.min(Math.PI, rad)) }),
  setDynamicSkyEnabled: (enabled) => set({ dynamicSkyEnabled: enabled }),
  setEnableStandaloneWeather: (enabled: boolean) => {
    const state = get()
    if (enabled && state.hdrGroundProjectionEnabled) {
      console.warn(
        '[Weather] Disabling HDR ground projection — conflicts with standalone weather and can darken materials.'
      )
      set({
        enableStandaloneWeather: enabled,
        hdrGroundProjectionEnabled: false,
        ...(enabled && state.cloudDensity === 0 ? { cloudDensity: 0.45 } : {})
      })
      return
    }
    set({
      enableStandaloneWeather: enabled,
      ...(enabled && state.cloudDensity === 0 ? { cloudDensity: 0.45 } : {})
    })
  },
  setSunSize: (size) => set({ sunSize: Math.max(0.1, Math.min(5.0, size)) }),
  setMoonSize: (size) => set({ moonSize: Math.max(0.1, Math.min(5.0, size)) }),
  setWeatherQuality: (quality) => set({ weatherQuality: quality }),
  setSnowIntensity: (intensity) => set({ snowIntensity: Math.max(0, Math.min(1, intensity)) }),
  setWindIntensity: (intensity) => set({ windIntensity: Math.max(0, Math.min(1, intensity)) }),
  setTimeOfDay: (time) => set({ timeOfDay: Math.max(0, Math.min(24, time)) }),
  setRainParticleScale: (scale) => set({ rainParticleScale: Math.max(0.1, Math.min(5.0, scale)) }),
  setRainParticleSpeed: (speed) => set({ rainParticleSpeed: Math.max(0.1, Math.min(3.0, speed)) }),
  setRainCollisionEnabled: (enabled) => set({ rainCollisionEnabled: enabled }),
  setSnowParticleScale: (scale) => set({ snowParticleScale: Math.max(0.1, Math.min(5.0, scale)) }),
  setSnowParticleSpeed: (speed) => set({ snowParticleSpeed: Math.max(0.1, Math.min(3.0, speed)) }),
  setSnowCollisionEnabled: (enabled) => set({ snowCollisionEnabled: enabled }),
  setWindGustsEnabled: (enabled) => set({ windGustsEnabled: enabled }),
  
      // Water actions
    setWaterEnabled: (enabled) => set({ waterEnabled: enabled }),
    setWaterLevel: (level) => set({ waterLevel: Math.max(-100, Math.min(100, level)) }),
    setWaterColor: (color) => set({ waterColor: color }),
    setWaterOpacity: (opacity) => set({ waterOpacity: Math.max(0, Math.min(1, opacity)) }),
    setWaveSpeed: (speed) => set({ waveSpeed: Math.max(0, Math.min(5, speed)) }),
    setWaveHeight: (height) => set({ waveHeight: Math.max(0, Math.min(2, height)) }),
    setWaterReflectivity: (reflectivity) => set({ waterReflectivity: Math.max(0, Math.min(1, reflectivity)) }),
    setWaterMode: (mode) => set({ waterMode: mode }),
    setMarchingCubesResolution: (resolution) => set({ marchingCubesResolution: Math.max(20, Math.min(60, resolution)) }),
    setMarchingCubesIsolation: (isolation) => set({ marchingCubesIsolation: Math.max(10, Math.min(200, isolation)) }),
    setMarchingCubesMetaballCount: (count) => set({ marchingCubesMetaballCount: Math.max(1, Math.min(20, count)) }),
    setOceanDistortionScale: (scale) => set({ oceanDistortionScale: Math.max(0.1, Math.min(10, scale)) }),
    setOceanSize: (size) => set({ oceanSize: Math.max(0.1, Math.min(5, size)) })
  }))

