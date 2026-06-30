import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EnvironmentManager } from './effects/EnvironmentManager'
import { OrbitControls, TransformControls, RectAreaLightHelper } from 'three-stdlib'
import { useAppStore } from '../store/useAppStore'
import { HDRSystem } from './effects/HDRSystem'
import { IndirectLightingSystem } from './effects/IndirectLightingSystem'
import { ParticleSystem } from './particles/ParticleSystem'
import { WaterSystem } from './effects/WaterSystem'
// Streets GL only - Three.js Sky removed
// Streets GL only - Three.js weather systems removed
import { CSMShadowSystem } from './effects/CSMShadowSystem'
import { CSM_SHADER_BIAS, CSM_SHADER_NORMAL_BIAS } from './effects/StreetsGLCSM'
import {
  PHYSICAL_CSM_SHADOW_RADIUS,
  PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS,
  PHYSICAL_DIRECTIONAL_SHADOW_RADIUS
} from './utils/physicalShadowSettings'
import { SunMoonSystem } from './effects/SunMoonSystem'
import { StandaloneWaterSystem } from './effects/StandaloneWaterSystem'
import { AtmosphericPerspective } from './effects/AtmosphericPerspective'
import { DynamicSky } from './effects/DynamicSky'
import { PostProcessingSystem, PostProcessingConfig } from './postprocessing/PostProcessingSystem'
import { updateAnimationMixers } from './utils/modelAnimations'
import { captureViewerScreenshot } from './utils/screenshotCapture'
import {
  captureFrameMotionState,
  createFrameMotionState,
  hasFrameMotion,
  hasOrbitControlsDamping,
  needsContinuousSceneUpdates,
  restartAnimationLoopIfIdle
} from './utils/renderLoopIdle'
import { applyViewerCanvasPointerEvents } from './utils/viewerCanvasPointerEvents'
import { applySceneFog, enableFogOnSceneMeshes, invalidateFogMeshesReady, isWeatherVisualActive } from './utils/sceneFog'
import { activateDynamicSkyCamera, deactivateDynamicSkyCamera } from './utils/dynamicSkyCamera'
import { getCsmShadowMapSizeForQuality, getCsmCascadeCountForQuality, getEffectiveMaxFps, getEffectivePixelRatio, prefersLowPowerGpu } from './utils/weatherGpuUtils'
import { reapplyInteriorCavityEnhancements, applyInteriorCavityDimming, ensureImportedMeshesVisible, auditHiddenImportedMeshes } from '../utils/enhanceInternalShadows'
import { applyCavityAoIfEligible } from './utils/cavityOcclusion'
import { buildScenePickBVH } from '../utils/lodBVHManager'
import { revokeAllLoaderBlobUrls } from './loaders/blobUrlRegistry'
import { ToneMappingType } from './postprocessing/ToneMappingShader'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { ShadowMapViewer } from 'three/addons/utils/ShadowMapViewer.js'
import type { DirectionalLightConfig, LightType } from '../store/useAppStore'
import { disposeTexturesFromMaterial, syncModelToStreetsGL, clearSharedViewer, computeStreetsGLPositionFromObject, STREETS_GL_OBJECT_SCALE, syncProjectObjectTransformToStreetsGL } from './useViewer'
import { runShadowDiagnostics } from '../utils/shadowDiagnostics'
import { autoFixShadowIssues } from '../utils/shadowAutoFixer'
import { shadowOpacityModifierRegistry } from './materials/ShadowOpacityModifierRegistry'
import {
  timeOfDayToSkyAngles,
  createLight,
  computeLightDirection as computeLightDirectionUtil,
  computeSunLightingFromElevation,
  isNightTimeOfDay,
  standaloneSkySunDirection,
  standaloneLightSunDirection,
  sunSkyDirectionToLightPosition,
  sunSkyDirectionToLightTravelDirection
} from './utils/lightUtils'
import { latLonToStreetsGL } from '../utils/mapCoordinates'
import {
  createLightIconTexture,
  computeGizmoScale,
  createLightGizmoObject,
  disposeLightGizmo,
  updateLightGizmoFromLight,
  ensureLightGizmo,
  removeLightGizmo,
  setLightGizmoSelected,
  computeLightDirection
} from './utils/lightGizmos'
import { updateShadowCameraBounds, updateAllShadowCameraBounds } from './utils/shadowManager'
import {
  detectLightingConflicts,
  resolveDirectionalCastShadow,
  resolveLightingMode,
  shouldUseWeatherShadowMapTiers
} from './utils/lightingContext'
import {
  applyHdrGroundShadowCatcherMaterial,
  effectiveShadowPlaneVisible,
  shouldUseHdrGroundShadowCatcher
} from './utils/hdrGroundShadowCatcher'
import {
  applyHdrShadowContrastToMaterials,
  computeHdrAmbientIntensity
} from '../utils/lightProbeUtils'

interface ViewerCanvasProps {
  onViewerReady?: (viewer: ViewerInstance) => void
}

function getPercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0
  }

  const clamped = THREE.MathUtils.clamp(percentile, 0, 1)
  const index = Math.round((sortedValues.length - 1) * clamped)
  return sortedValues[index] ?? sortedValues[sortedValues.length - 1] ?? 0
}

function getGaussianSplatBounds(root: THREE.Object3D): THREE.Box3 | null {
  const viewer = (root as any).viewer as
    | {
        splatMesh?: {
          getSplatTree?: () => {
            subTrees?: Array<{
              sceneMin?: THREE.Vector3
              sceneMax?: THREE.Vector3
            }>
          } | null
          getScene?: (index: number) => {
            transform?: THREE.Matrix4
            splatBuffer?: {
              sceneCenter?: THREE.Vector3
            }
          }
          getSplatCount?: () => number
          getSplatCenter?: (index: number, outCenter: THREE.Vector3, applySceneTransform?: boolean) => void
        }
        getSplatMesh?: () => {
          getSplatTree?: () => {
            subTrees?: Array<{
              sceneMin?: THREE.Vector3
              sceneMax?: THREE.Vector3
            }>
          } | null
          getScene?: (index: number) => {
            transform?: THREE.Matrix4
            splatBuffer?: {
              sceneCenter?: THREE.Vector3
            }
          }
          getSplatCount?: () => number
          getSplatCenter?: (index: number, outCenter: THREE.Vector3, applySceneTransform?: boolean) => void
        }
      }
    | undefined

  const splatMesh = viewer?.splatMesh ?? viewer?.getSplatMesh?.()
  if (!splatMesh) {
    return null
  }

  const cachedLocalBounds = (root.userData?.gaussianSplatBoundsCache as THREE.Box3 | undefined)?.clone()
  const cachedSplatCount = root.userData?.gaussianSplatBoundsCacheCount
  const currentSplatCount = splatMesh.getSplatCount?.() ?? 0
  if (cachedLocalBounds && cachedSplatCount === currentSplatCount) {
    return cachedLocalBounds.applyMatrix4(root.matrixWorld)
  }

  const splatTree = splatMesh.getSplatTree?.()
  const subTrees = splatTree?.subTrees ?? []
  const rawLocalBounds = new THREE.Box3()
  const tempBounds = new THREE.Box3()
  const sceneTransform = new THREE.Matrix4()

  if (subTrees.length > 0 && splatMesh.getScene) {
    subTrees.forEach((subTree, index) => {
      const scene = splatMesh.getScene!(index)
      const sceneMin = subTree.sceneMin
      const sceneMax = subTree.sceneMax
      if (!sceneMin || !sceneMax) {
        return
      }

      tempBounds.min.copy(sceneMin)
      tempBounds.max.copy(sceneMax)
      sceneTransform.copy(scene?.transform ?? new THREE.Matrix4())
      tempBounds.applyMatrix4(sceneTransform)
      rawLocalBounds.union(tempBounds)
    })
  }

  let finalLocalBounds = rawLocalBounds.isEmpty() ? null : rawLocalBounds.clone()

  if (currentSplatCount > 0 && splatMesh.getSplatCenter) {
    const maxSamples = 20000
    const sampleStep = Math.max(1, Math.floor(currentSplatCount / maxSamples))
    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    const sampledCenter = new THREE.Vector3()

    for (let index = 0; index < currentSplatCount; index += sampleStep) {
      splatMesh.getSplatCenter(index, sampledCenter, true)
      xs.push(sampledCenter.x)
      ys.push(sampledCenter.y)
      zs.push(sampledCenter.z)
    }

    if (xs.length >= 64) {
      xs.sort((a, b) => a - b)
      ys.sort((a, b) => a - b)
      zs.sort((a, b) => a - b)

      // Use percentile bounds so a few distant floaters do not make room-scale splats frame too far away.
      const robustLocalBounds = new THREE.Box3(
        new THREE.Vector3(
          getPercentile(xs, 0.01),
          getPercentile(ys, 0.01),
          getPercentile(zs, 0.01)
        ),
        new THREE.Vector3(
          getPercentile(xs, 0.99),
          getPercentile(ys, 0.99),
          getPercentile(zs, 0.99)
        )
      )

      const robustSize = robustLocalBounds.getSize(new THREE.Vector3())
      const rawSize = rawLocalBounds.getSize(new THREE.Vector3())
      const robustMaxDim = Math.max(robustSize.x, robustSize.y, robustSize.z)
      const rawMaxDim = Math.max(rawSize.x, rawSize.y, rawSize.z)

      if (robustMaxDim > 0) {
        const padding = new THREE.Vector3(
          Math.max(robustSize.x * 0.12, 0.5),
          Math.max(robustSize.y * 0.12, 0.5),
          Math.max(robustSize.z * 0.12, 0.5)
        )
        robustLocalBounds.min.sub(padding)
        robustLocalBounds.max.add(padding)
      }

      finalLocalBounds =
        !finalLocalBounds || rawMaxDim > robustMaxDim * 1.5
          ? robustLocalBounds
          : finalLocalBounds
    }
  }

  if (!finalLocalBounds || finalLocalBounds.isEmpty()) {
    const firstScene = splatMesh.getScene?.(0)
    const sceneCenter = firstScene?.splatBuffer?.sceneCenter
    if (!sceneCenter) {
      return null
    }

    const fallbackCenter = sceneCenter.clone().applyMatrix4(root.matrixWorld)
    return new THREE.Box3().setFromCenterAndSize(fallbackCenter, new THREE.Vector3(4, 4, 4))
  }

  root.userData.gaussianSplatBoundsCache = finalLocalBounds.clone()
  root.userData.gaussianSplatBoundsCacheCount = currentSplatCount

  return finalLocalBounds.applyMatrix4(root.matrixWorld)
}

export interface ViewerInstance {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  transformControls: TransformControls | null
  clock: THREE.Clock
  frameObject: (object: THREE.Object3D, preserveZoom?: boolean) => void
  resetCamera: () => void
  selectObject: (object: THREE.Object3D | null) => void
  raycaster: THREE.Raycaster
  mouse: THREE.Vector2
  ambientLight: THREE.AmbientLight
  directionalLights: Map<string, THREE.DirectionalLight>
  lightHelpers: Map<string, THREE.DirectionalLightHelper>
  lightGizmos: Map<string, THREE.Object3D>
  lightToGizmo?: WeakMap<THREE.Light, THREE.Object3D>
  gizmoToLight?: WeakMap<THREE.Object3D, THREE.Light>
  shadowMapViewers: Map<string, ShadowMapViewer> // Shadow map viewers for debugging
  environmentMap: THREE.DataTexture | null // Original HDR texture (equirectangular, for background)
  pmremEnvMap?: THREE.Texture | null // PMREM cube map (for reflections/environment)
  defaultEnvTexture?: THREE.Texture | null
  hdrSystem?: import('./effects/HDRSystem').HDRSystem
  indirectLightingSystem?: IndirectLightingSystem
  pivotWrappers?: WeakMap<THREE.Object3D, THREE.Group>
  startingObjectsGroup?: THREE.Group
  particleSystems?: Array<import('./particles/ParticleSystem').ParticleSystem>
  waterSystem?: import('./effects/WaterSystem').WaterSystem
  // Streets GL only - Three.js weather systems removed
  csmShadowSystem?: import('./effects/CSMShadowSystem').CSMShadowSystem // Standalone CSM shadow system (works without Streets GL)
  sunMoonSystem?: import('./effects/SunMoonSystem').SunMoonSystem // Standalone sun/moon system (works without Streets GL)
  standaloneWaterSystem?: import('./effects/StandaloneWaterSystem').StandaloneWaterSystem // Standalone water system
  atmosphericPerspective?: import('./effects/AtmosphericPerspective').AtmosphericPerspective // Atmospheric perspective (fog/haze)
  dynamicSky?: import('./effects/DynamicSky').DynamicSky // Dynamic sky with atmospheric scattering (for standalone weather)
  dynamicSkySavedCameraFar?: number
  postProcessingSystem?: import('./postprocessing/PostProcessingSystem').PostProcessingSystem
  cavityOcclusionSession?: { applied: boolean; userDisabled: boolean }
  animationMixers?: THREE.AnimationMixer[]
  captureScreenshot?: () => string
  
  // Camera view functions
  getCameraState: () => { position: THREE.Vector3; target: THREE.Vector3 }
  setCameraState: (position: THREE.Vector3, target: THREE.Vector3, animate?: boolean) => void
  
  // Shadow update function
  updateShadowCameraBounds: () => void
  // Shadow diagnostics function
  runShadowDiagnostics: () => import('../utils/shadowDiagnostics').ShadowDiagnosticReport
  /** Wake the hybrid render-on-demand loop (keyboard nav, external camera moves). */
  requestRender?: () => void
}

function ensureCavityOcclusionSession(viewer: ViewerInstance): { applied: boolean; userDisabled: boolean } {
  if (!viewer.cavityOcclusionSession) {
    viewer.cavityOcclusionSession = { applied: false, userDisabled: false }
  }
  return viewer.cavityOcclusionSession
}

function refreshInteriorCavityEnhancements(viewer: ViewerInstance, scene: THREE.Scene): void {
  const lights = viewer.csmShadowSystem?.getDirectionalLights() ?? []
  const { darkenInteriorCavities } = useAppStore.getState()
  const result = reapplyInteriorCavityEnhancements(scene, lights, {
    darkenInteriorCavities,
    refreshDimming: true
  })
  if (
    result.cavityMeshesDimmed > 0 ||
    result.exteriorPanelsFrontSided > 0 ||
    result.materialsMadeDoubleSided > 0
  ) {
    console.log('[CavityOcclusion] Interior shadow refresh:', {
      cavityMeshesDimmed: result.cavityMeshesDimmed,
      exteriorPanelsFrontSided: result.exteriorPanelsFrontSided,
      materialsDoubleSided: result.materialsMadeDoubleSided,
      fixes: result.fixesApplied
    })
  }
  viewer.csmShadowSystem?.setupSceneMaterials()
}

// Temporary vectors and matrices for calculations (reused to avoid allocations)
const _tempVecA = new THREE.Vector3()
const _tempVecB = new THREE.Vector3()
const _tempVecC = new THREE.Vector3()
const _tempVecD = new THREE.Vector3()
const _tempVecE = new THREE.Vector3()
const _pivotWorldPosition = new THREE.Vector3()
const _tempMatA = new THREE.Matrix4()
const _tempMatB = new THREE.Matrix4()
const _tempScale = new THREE.Vector3()
const _tempBoxA = new THREE.Box3()
const _tempBoxB = new THREE.Box3()
const _tempQuat = new THREE.Quaternion()

// NOTE: All light/gizmo functions (createLightIconTexture, computeGizmoScale, createLightGizmoObject,
// disposeLightGizmo, setLightGizmoSelected, computeLightDirection, updateLightGizmoFromLight,
// ensureLightGizmo, removeLightGizmo) are now imported from './utils/lightGizmos'
// Duplicate definitions removed to fix compilation errors

interface ScreenRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface MarqueeState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
}

export default function ViewerCanvas({ onViewerReady }: ViewerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const marqueeOverlayRef = useRef<HTMLDivElement | null>(null)
  const marqueeStateRef = useRef<MarqueeState | null>(null)
  const skipClickAfterMarqueeRef = useRef(false)
  const viewerRef = useRef<ViewerInstance | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const webglContextLostRef = useRef(false)
  const isInitializedRef = useRef<boolean>(false)
  const doubleClickPendingRef = useRef<boolean>(false)

  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Throttle debug logging to reduce console spam (time-based: log max once per second)
  const lastDebugLogTimeRef = useRef<number>(0)
  const splatDebugFrameRef = useRef<number>(0)
  const splatDebugLoggedOnceRef = useRef<boolean>(false)
  const splatRenderLoggedOnceRef = useRef<boolean>(false)
  const lastWeatherMaterialKeyRef = useRef<string | null>(null)
  const DEBUG_LOG_THROTTLE_MS = 1000 // 1 second
  const throttledDebugLog = useRef({
    log: (...args: any[]) => {
      const now = performance.now()
      if (now - lastDebugLogTimeRef.current >= DEBUG_LOG_THROTTLE_MS) {
        lastDebugLogTimeRef.current = now
        console.log(...args)
      }
    },
    warn: (...args: any[]) => {
      const now = performance.now()
      if (now - lastDebugLogTimeRef.current >= DEBUG_LOG_THROTTLE_MS) {
        lastDebugLogTimeRef.current = now
        console.warn(...args)
      }
    },
    groupCollapsed: (...args: any[]) => {
      const now = performance.now()
      if (now - lastDebugLogTimeRef.current >= DEBUG_LOG_THROTTLE_MS) {
        lastDebugLogTimeRef.current = now
        console.groupCollapsed(...args)
      }
    },
    groupEnd: () => {
      const now = performance.now()
      if (now - lastDebugLogTimeRef.current >= DEBUG_LOG_THROTTLE_MS) {
        lastDebugLogTimeRef.current = now
        console.groupEnd()
      }
    }
  }).current

  const { 
    transformMode, 
    selectedObject, 
    setSelectedObject, 
    setTransformMode, 
    showMaterialPanel, 
    showLightingPanel,
    pixelRatio,
    maxPixelRatio,
    useLogarithmicDepthBuffer,
    useHighPerformanceGPU,
    preferCPU,
    vsyncEnabled,
    maxFPS,
    streetsGLIframeOverlay,
    renderMode,
    streetsGLIframeInteractive,
    pathTracerActive
  } = useAppStore()

  useEffect(() => {
    if (!containerRef.current) return
    
    // TEMPORARILY DISABLED: HMR preservation was causing blank page issues when switching chats
    // The viewer will reinitialize normally, which should work fine
    // TODO: Re-enable HMR preservation with proper animation loop restart logic
    const reusingPreservedViewer = false
    const preservedViewer: ViewerInstance | null = null
    
    // Prevent multiple initializations
    // CRITICAL: Check if viewer already exists (e.g., from HMR or remount)
    // If it exists and is still valid, reuse it instead of recreating
    if (viewerRef.current && isInitializedRef.current) {
      // Viewer already initialized - check if it's still valid
      if (viewerRef.current.renderer && 
          viewerRef.current.scene && 
          viewerRef.current.camera &&
          !viewerRef.current.renderer.getContext().isContextLost()) {
        console.log('[ViewerCanvas] Viewer already initialized, reusing existing instance')
        return
      } else {
        // Viewer exists but is invalid - clear it
        console.warn('[ViewerCanvas] Existing viewer is invalid, clearing')
        viewerRef.current = null
        isInitializedRef.current = false
      }
    }
    
    // If we get here, either viewer doesn't exist or it's invalid - initialize
    if (isInitializedRef.current && !reusingPreservedViewer) {
      console.warn('[ViewerCanvas] Re-initializing viewer (previous instance was invalid)')
      isInitializedRef.current = false
    }
    
    // Declare variables that will be used by animation loop
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera
    let renderer: THREE.WebGLRenderer
    let controls: OrbitControls
    let clock: THREE.Clock
    let transformControls: TransformControls
    let raycaster: THREE.Raycaster
    let mouse: THREE.Vector2
    let directionalLights: Map<string, THREE.DirectionalLight>
    let lightHelpers: Map<string, THREE.DirectionalLightHelper>
    let lightGizmos: Map<string, THREE.Object3D>
    let environmentMap: THREE.DataTexture | null = null
    let cleanupResizeHandler: (() => void) | null = null
    let cleanupContextLostHandler: ((event: Event) => void) | null = null
    let cleanupContextRestoredHandler: (() => void) | null = null
    let cleanupVisibilityHandler: (() => void) | null = null
    let cleanupControlsChangeHandler: (() => void) | null = null
    let cleanupCanvasWakeHandlers: (() => void) | null = null
    
    // If reusing preserved viewer, use its components; otherwise initialize new ones
    if (reusingPreservedViewer && preservedViewer) {
      // Use preserved viewer's components
      scene = preservedViewer.scene
      camera = preservedViewer.camera
      renderer = preservedViewer.renderer
      controls = preservedViewer.controls
      clock = preservedViewer.clock
      transformControls = preservedViewer.transformControls || null as any
      raycaster = preservedViewer.raycaster
      mouse = preservedViewer.mouse
      directionalLights = preservedViewer.directionalLights
      lightHelpers = preservedViewer.lightHelpers || new Map()
      lightGizmos = preservedViewer.lightGizmos || new Map()
      environmentMap = preservedViewer.environmentMap
      
      console.log('[ViewerCanvas] HMR: Using preserved viewer components for animation loop')
    } else {
      // Normal initialization
      isInitializedRef.current = true

      // Scene setup
      scene = new THREE.Scene()
    // Background will be set based on iframe overlay state (transparent if overlay enabled)
    const appStoreInit = useAppStore.getState()
    if (!appStoreInit.streetsGLIframeOverlay) {
      scene.background = new THREE.Color(0x1a1a1a) // Default dark background
    } else {
      scene.background = null // Transparent when iframe overlay is enabled
    }

    // Camera setup with improved depth precision
    camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1, // Near plane optimized for better precision at distance
      10000 // Further far plane for large scenes
    )
    camera.position.set(5, 5, 5)
    camera.lookAt(0, 0, 0)

      // Renderer setup with enhanced quality settings
      // Determine power preference: preferCPU > low weather quality > useHighPerformanceGPU > default
      let powerPreference: "high-performance" | "low-power" | "default" = "default"
      const initWeatherQuality = appStoreInit.weatherQuality ?? 'high'
      if (preferCPU || prefersLowPowerGpu(initWeatherQuality)) {
        powerPreference = "low-power" // Prefer integrated GPU or CPU fallback (software rendering)
      } else if (useHighPerformanceGPU) {
        powerPreference = "high-performance" // Prefer dedicated GPU
      }
      
      // Check if Streets GL iframe overlay is enabled - if so, use transparent background
      // so the map shows through behind 3D objects
      const appStore = useAppStore.getState()
      const useTransparentBackground = appStore.streetsGLIframeOverlay
      
      renderer = new THREE.WebGLRenderer({ 
        antialias: !preferCPU, // Disable antialiasing for CPU rendering (better performance)
        powerPreference: powerPreference,
        logarithmicDepthBuffer: useLogarithmicDepthBuffer,
        preserveDrawingBuffer: false,
        alpha: useTransparentBackground, // Transparent background when iframe overlay is enabled
        stencil: false, // Disable if not needed
        depth: true, // Essential for 3D
        premultipliedAlpha: false, // Better color accuracy
        failIfMajorPerformanceCaveat: false // Allow software rendering fallback when preferCPU is enabled
      })
      
      // Set canvas background to transparent when iframe overlay is enabled
      if (useTransparentBackground) {
        scene.background = null // Transparent background so map shows through
        renderer.setClearColor(0x000000, 0) // Transparent clear color
      }
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    
    // Calculate pixel ratio based on settings
    let effectivePixelRatio: number
    if (pixelRatio >= 0) {
      // Manual override
      effectivePixelRatio = pixelRatio
    } else {
      // Auto mode: cap device pixel ratio (including 4K fill-rate limit)
      effectivePixelRatio = getEffectivePixelRatio(
        window.devicePixelRatio,
        maxPixelRatio,
        containerRef.current.clientWidth,
        initWeatherQuality
      )
    }
    renderer.setPixelRatio(effectivePixelRatio)
    
    // VISUAL QUALITY: Enhanced color space and tone mapping
    // BEST PRACTICE: Use sRGB color space for accurate web display color reproduction
    // ACES Filmic tone mapping is industry standard for realistic HDR rendering
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    // Default exposure of 1.0 is optimal for most scenes (can be adjusted per scene)
    renderer.toneMappingExposure = 1
    
    // Shadow settings - v1.7: Always enabled at initialization
    renderer.shadowMap.enabled = true
    // Use PCFSoftShadowMap for smooth, realistic soft shadows (like Twinmotion)
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = true
    
    // Enable automatic clear before render
    renderer.autoClear = true
    
    // Set canvas ID for CSS z-index styling
    renderer.domElement.id = 'viewer-canvas'
    renderer.domElement.setAttribute('role', 'img')
    renderer.domElement.setAttribute('aria-label', '3D model viewer viewport')
    renderer.domElement.tabIndex = 0
    
    // Append renderer canvas to container
    containerRef.current.appendChild(renderer.domElement)

    // Clock for animations
    clock = new THREE.Clock()

    // ========================================
    // CAMERA CONTROLS - Twinmotion Style
    // ========================================
    // Twinmotion Navigation:
    // - LMB + Drag = Orbit (rotate around target point)
    // - MMB + Drag = Pan (translate view)
    // - Scroll Wheel = Zoom (dolly in/out)
    // - No right-click camera control (RMB reserved for other functions)
    
    controls = new OrbitControls(camera, renderer.domElement)
    
    // Basic settings
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.screenSpacePanning = false // World-space panning like Twinmotion
    controls.minDistance = 0.1
    controls.maxDistance = 5000
    
    // Enable all controls by default
    controls.enableZoom = true
    controls.enableRotate = true
    controls.enablePan = true
    controls.enabled = true
    
    // Twinmotion mouse button mapping:
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,    // Left-click: Orbit around target
      MIDDLE: THREE.MOUSE.PAN,     // Middle-click: Pan view
      RIGHT: THREE.MOUSE.PAN       // Right-click: Pan (alternative, but typically unused in Twinmotion)
    }

    // Transform controls
    transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.userData.isTransformControls = true
    
    // Fix: Override updateMatrixWorld to safely handle when no object is attached or gizmo is uninitialized
    // This prevents the gizmo from trying to clone undefined properties
    const originalUpdateMatrixWorld = transformControls.updateMatrixWorld.bind(transformControls) as (force?: boolean) => void
    transformControls.updateMatrixWorld = function(force?: boolean) {
      // Always wrap in try-catch to prevent crashes from gizmo initialization issues
      try {
        // Only update gizmo if an object is attached
        const attachedObject = (this as any).object
        if (attachedObject) {
          // Check if gizmo exists and camera is available (gizmo needs camera for proper initialization)
          const gizmo = (this as any).gizmo
          const controlCamera = (this as any).camera
          if (gizmo && controlCamera && controlCamera.isCamera) {
            // Try to update, but catch any errors from gizmo
            try {
              originalUpdateMatrixWorld(force)
            } catch (gizmoError) {
              // Gizmo update failed, fall back to base update
              THREE.Object3D.prototype.updateMatrixWorld.call(this, force)
            }
          } else {
            // Gizmo not fully initialized, just update base Object3D
            THREE.Object3D.prototype.updateMatrixWorld.call(this, force)
          }
        } else {
          // No object attached, just update base Object3D matrix
          THREE.Object3D.prototype.updateMatrixWorld.call(this, force)
        }
      } catch (error) {
        // If any error occurs (including base updateMatrixWorld errors), silently continue
        // This prevents the render loop from breaking
        // Try to do minimal update without triggering errors
        try {
          if (this.matrixAutoUpdate) {
            this.updateMatrix()
          }
        } catch {
          // Even matrix update failed, just continue silently
        }
      }
    }
    
    scene.add(transformControls)

    // Raycaster for object selection
    raycaster = new THREE.Raycaster()
    mouse = new THREE.Vector2()
    
    // Store pivot wrapper for models (to center transform controls on bounding box)
    const pivotWrappers = new WeakMap<THREE.Object3D, THREE.Group>()

    const shouldIgnoreBoundingObject = (object: THREE.Object3D): boolean => {
      const data = object.userData || {}
      if (
        data.isPivotWrapper ||
        data.isHotspot ||
        data.isHotspotLabel ||
        data.isHotspotLine ||
        data.isGridHelper ||
        data.isAxesHelper ||
        data.isShadowPlane ||
        data.isTransformControls ||
        data.isPanel ||
        data.isWidget ||
        data.excludeFromBoundingBox ||
        data.isHandle === true
      ) {
        return true
      }
      // CRITICAL: Allow light helpers to be selectable (for dragging)
      // Only exclude non-light helpers
      if (data.isHelper && !data.isLightHelper) {
        return true
      }
      if ((object as any).isLight) {
        return true
      }
      const name = (object.name || '').toLowerCase()
      // CRITICAL: Allow light helpers to be selectable - don't exclude them
      if (name.includes('gizmo') || (name.includes('helper') && !data.isLightHelper) || name.includes('shadow camera')) {
        return true
      }
      return false
    }
    
    const computeModelBoundingBox = (model: THREE.Object3D, target: THREE.Box3): THREE.Box3 => {
      model.updateWorldMatrix(true, true)
      target.makeEmpty()
      _tempBoxB.makeEmpty()
      
      model.traverse((child) => {
        if (!child.visible || shouldIgnoreBoundingObject(child)) {
          return
        }
        
        let geometry: THREE.BufferGeometry | null = null
        if ((child as any).isMesh || (child as any).isLine || (child as any).isPoints) {
          geometry = (child as any).geometry
        }
        if (!geometry) {
          return
        }
        
        if (!geometry.boundingBox) {
          geometry.computeBoundingBox()
        }
        if (!geometry.boundingBox) {
          return
        }
        
        _tempBoxB.copy(geometry.boundingBox)
        ;(child as THREE.Object3D).updateWorldMatrix(true, false)
        _tempBoxB.applyMatrix4(child.matrixWorld)
        target.union(_tempBoxB)
      })
      
      if (target.isEmpty()) {
        const fallback = model.getWorldPosition(_tempVecE)
        target.min.copy(fallback)
        target.max.copy(fallback)
      }
      
      return target
    }
    
    const getPivotWorldPosition = (model: THREE.Object3D, pivotMode: 'center' | 'bottom'): THREE.Vector3 => {
      const box = computeModelBoundingBox(model, _tempBoxA)
      const worldPos = box.getCenter(_pivotWorldPosition)
      if (pivotMode === 'bottom') {
        worldPos.y = box.min.y
      }
      return _pivotWorldPosition
    }
    
    // Helper function to create a pivot wrapper at the object's bounding box center or bottom
    const createPivotWrapper = (object: THREE.Object3D, pivotMode: 'center' | 'bottom'): THREE.Group => {
      object.updateMatrixWorld(true)
      const modelWorldMatrix = object.matrixWorld.clone()
      const parent = object.parent
      const pivot = new THREE.Group()
      pivot.userData.isPivotWrapper = true
      pivot.userData.originalModel = object
      pivot.userData.pivotMode = pivotMode
      
      const pivotWorldPos = getPivotWorldPosition(object, pivotMode)
      const pivotLocalPosition = _tempVecC.copy(pivotWorldPos)
      
      if (parent) {
        parent.add(pivot)
        parent.updateMatrixWorld(true)
        _tempMatA.copy(parent.matrixWorld).invert()
        pivotLocalPosition.applyMatrix4(_tempMatA)
      } else {
        scene.add(pivot)
      }
      
      pivot.position.copy(pivotLocalPosition)
      pivot.updateMatrixWorld(true)
      
      if (parent) {
        parent.remove(object)
      } else {
        scene.remove(object)
      }
      
      pivot.add(object)
      
      const pivotInverse = _tempMatA.copy(pivot.matrixWorld).invert()
      _tempMatB.multiplyMatrices(pivotInverse, modelWorldMatrix).decompose(
        object.position,
        object.quaternion,
        _tempScale
      )
      object.scale.copy(_tempScale)
      object.updateMatrixWorld(true)
      
      return pivot
    }

    // Helper function to remove pivot wrapper and restore original structure
    const removePivotWrapper = (pivot: THREE.Group) => {
      const model = pivot.userData.originalModel as THREE.Object3D
      if (!model) return
      
      pivot.updateMatrixWorld(true)
      model.updateMatrixWorld(true)
      const modelWorldMatrix = model.matrixWorld.clone()
      const pivotParent = pivot.parent
      
      pivot.remove(model)
      if (pivotParent) {
        pivotParent.remove(pivot)
        pivotParent.add(model)
        pivotParent.updateMatrixWorld(true)
      } else {
        scene.remove(pivot)
        scene.add(model)
      }
      
      if (pivotParent) {
        _tempMatA.copy(pivotParent.matrixWorld).invert()
        _tempMatB.multiplyMatrices(_tempMatA, modelWorldMatrix).decompose(
          model.position,
          model.quaternion,
          _tempScale
        )
      } else {
        _tempMatB.copy(modelWorldMatrix).decompose(model.position, model.quaternion, _tempScale)
      }
      model.scale.copy(_tempScale)
      model.updateMatrixWorld(true)
      
      pivotWrappers.delete(model)
    }

    // Helper function to update pivot position based on current object bounding box
    // This ensures the pivot stays centered (or at bottom) as the model scales
    // The model must be a child of the pivot for this to work correctly
    const updatePivotPosition = (pivot: THREE.Group, model: THREE.Object3D) => {
      if (!pivot || !model) return
      
      // Get current pivot mode
      const pivotMode = pivot.userData.pivotMode || 'center'
      
      const pivotParent = pivot.parent
      if (!pivotParent) return
      
      model.updateMatrixWorld(true)
      const modelWorldMatrix = model.matrixWorld.clone()
      
      const newPivotWorldPos = getPivotWorldPosition(model, pivotMode)
      const newLocalPos = _tempVecC.copy(newPivotWorldPos)
      
      pivotParent.updateMatrixWorld(true)
      _tempMatA.copy(pivotParent.matrixWorld).invert()
      newLocalPos.applyMatrix4(_tempMatA)
      
      pivot.position.copy(newLocalPos)
      pivot.updateMatrixWorld(true)
      
      const pivotInverse = _tempMatA.copy(pivot.matrixWorld).invert()
      _tempMatB.multiplyMatrices(pivotInverse, modelWorldMatrix).decompose(
        model.position,
        model.quaternion,
        _tempScale
      )
      model.scale.copy(_tempScale)
      model.updateMatrixWorld(true)
    }

    // ========================================
    // TRANSFORM CONTROLS INTEGRATION
    // ========================================
    // When transforming objects, camera controls should:
    // - Disable orbit/pan during drag (prevent accidental camera movement)
    // - Keep zoom enabled (allow zooming while transforming)
    // - Restore all controls immediately after drag ends
    // - Update pivot position when scaling
    
    let isTransforming = false
    // Track initial model scale when scaling starts (for pivot wrappers)
    let initialModelScale: THREE.Vector3 | null = null
    let initialPivotScale: THREE.Vector3 | null = null
    
    // Track previous position for detecting vertical dragging (to allow vertical movement when explicitly dragging Y-axis)
    let previousDragPosition: THREE.Vector3 | null = null
    
    // Track initial transform for undo/redo when dragging starts
    let initialTransform: { position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3 } | null = null
    let transformObject: THREE.Object3D | null = null
    
    // Track throttled sync timers for real-time Streets GL updates
    const syncThrottleTimers = new WeakMap<THREE.Object3D, NodeJS.Timeout>()
    
    // Listen to transform changes to update light positions in store, handle scale for pivot wrappers, and update hotspot positions
    transformControls.addEventListener('change' as any, () => {
      const attachedObject = (transformControls as any).object as THREE.Object3D | null

      // Old path tracer removed - PathTracerDemo handles its own updates

      if (!attachedObject) return
      
      // Get the actual model object (handle pivot wrappers)
      let modelObject = attachedObject
      if (attachedObject.userData.isPivotWrapper && attachedObject.userData.originalModel) {
        modelObject = attachedObject.userData.originalModel as THREE.Object3D
      }
      
      // Real-time sync to Streets GL during dragging (throttled for performance)
      if (modelObject.userData.streetsGLObjectId && isTransforming) {
        const existingTimer = syncThrottleTimers.get(modelObject)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        const throttleTimer = setTimeout(() => {
          try {
            syncProjectObjectTransformToStreetsGL(modelObject)
          } catch (error) {
            console.error('[ViewerCanvas] Error syncing transform to Streets GL (real-time):', error)
          } finally {
            syncThrottleTimers.delete(modelObject)
          }
        }, 100)

        syncThrottleTimers.set(modelObject, throttleTimer)
      }
      
      // Handle hotspot position updates
      if (attachedObject.userData.isHotspot && attachedObject.userData.hotspotId) {
        const hotspotId = attachedObject.userData.hotspotId
        const updateHotspotPosition = (window as any).__updateHotspotPosition as ((id: string, position: { x: number; y: number; z: number }) => void) | undefined
        
        if (updateHotspotPosition) {
          // Get world position of the hotspot (CRITICAL: hotspots are sprites, use their position directly)
          const worldPosition = attachedObject.position.clone()
          // If hotspot has a parent with transforms, get world position
          if (attachedObject.parent && attachedObject.parent !== scene) {
            attachedObject.getWorldPosition(worldPosition)
          }
          
          console.log('[ViewerCanvas] Updating hotspot position:', {
            hotspotId: hotspotId,
            localPosition: attachedObject.position,
            worldPosition: worldPosition,
            hasParent: !!attachedObject.parent,
            parentType: attachedObject.parent?.type
          })
          
          // Update hotspot position in store (triggers useEffect to update marker/label/line)
          updateHotspotPosition(hotspotId, {
            x: worldPosition.x,
            y: worldPosition.y,
            z: worldPosition.z
          })
        } else {
          console.warn('[ViewerCanvas] __updateHotspotPosition function not found')
        }
        return // Don't process other transform logic for hotspots
      }
      
      // Handle hotspot endpoint position updates
      if (attachedObject.userData.isHotspotEndpoint && attachedObject.userData.hotspotId) {
        const hotspotId = attachedObject.userData.hotspotId
        const updateHotspotEndpointPosition = (window as any).__updateHotspotEndpointPosition as ((id: string, position: { x: number; y: number; z: number }) => void) | undefined
        
        if (updateHotspotEndpointPosition) {
          // Get world position of the endpoint handle
          const worldPosition = attachedObject.position.clone()
          // If endpoint has a parent with transforms, get world position
          if (attachedObject.parent && attachedObject.parent !== scene) {
            attachedObject.getWorldPosition(worldPosition)
          }
          
          console.log('[ViewerCanvas] Updating hotspot endpoint position:', {
            hotspotId: hotspotId,
            localPosition: attachedObject.position,
            worldPosition: worldPosition,
            hasParent: !!attachedObject.parent,
            parentType: attachedObject.parent?.type
          })
          
          // Update hotspot endpoint position in store (triggers useEffect to update line)
          updateHotspotEndpointPosition(hotspotId, {
            x: worldPosition.x,
            y: worldPosition.y,
            z: worldPosition.z
          })
        } else {
          console.warn('[ViewerCanvas] __updateHotspotEndpointPosition function not found')
        }
        return // Don't process other transform logic for hotspot endpoints
      }

      // Handle pivot wrapper scaling: transfer scale from pivot to model in real-time
      // The transform controls scale the pivot, and we transfer that scale to the model
      if (attachedObject.userData?.isPivotWrapper && transformControls.getMode() === 'scale') {
        const pivot = attachedObject as THREE.Group
        const model = pivot.userData.originalModel as THREE.Object3D
        
        if (model && initialModelScale !== null && initialPivotScale !== null) {
          // Only process if tracking is initialized (initialized when dragging starts)
          // Get current pivot scale (what the gizmo is applying to the pivot)
          const currentPivotScale = pivot.scale.clone()
          
          // Calculate scale delta (relative change from initial pivot scale)
          // Since initialPivotScale should be 1,1,1, this gives us the multiplier directly
          const scaleDelta = new THREE.Vector3(
            currentPivotScale.x / initialPivotScale.x,
            currentPivotScale.y / initialPivotScale.y,
            currentPivotScale.z / initialPivotScale.z
          )
          
          // Apply scale delta to initial model scale to get new model scale
          // This prevents compounding because we always use the initial scale as the base
          const newModelScale = new THREE.Vector3(
            initialModelScale.x * scaleDelta.x,
            initialModelScale.y * scaleDelta.y,
            initialModelScale.z * scaleDelta.z
          )
          
          // Clamp to minimum scale to prevent zero or negative
          const clampedScale = new THREE.Vector3(
            Math.max(0.01, newModelScale.x),
            Math.max(0.01, newModelScale.y),
            Math.max(0.01, newModelScale.z)
          )
          
          // Apply scale to model (this updates the model for TransformPanel to read)
          // IMPORTANT: We do NOT update pivot position or reset pivot scale during dragging
          // This prevents interference with transform controls and maintains smooth scaling
          model.scale.copy(clampedScale)
          model.updateMatrixWorld()
          
          // Note: Pivot scale accumulates naturally as the user drags the gizmo
          // We'll reset it to 1,1,1 and update pivot position when dragging ends
        }
        
        // Don't process lights if we're handling a pivot wrapper
        return
      } else {
        // Reset scale tracking when not scaling a pivot wrapper
        // This ensures we re-initialize on the next scale operation
        // But only reset if we're not currently scaling (check if isTransforming)
        if (!isTransforming) {
          initialModelScale = null
          initialPivotScale = null
        }
      }

      if (!isTransforming) {
        // Reset previous position when not transforming
        previousDragPosition = null
      }

      // Handle lights
      let targetLight: THREE.Light | null = null
      if (attachedObject instanceof THREE.Light) {
        targetLight = attachedObject
      } else if (attachedObject.userData?.isLightGizmo) {
        targetLight = gizmoToLight.get(attachedObject) ?? null
        if (targetLight) {
          const mode = transformControls.getMode()
          if (mode === 'translate') {
            // Update light position when gizmo is moved
            targetLight.position.copy(attachedObject.position)
          } else if (mode === 'rotate') {
            // Update light rotation/direction when gizmo is rotated
            // For directional and spot lights: update target based on gizmo rotation
            if (targetLight instanceof THREE.DirectionalLight || targetLight instanceof THREE.SpotLight) {
              // Get the gizmo's forward direction (negative Y is default for directional lights)
              const defaultDirection = new THREE.Vector3(0, -1, 0)
              // Apply gizmo's rotation to the default direction
              const rotatedDirection = defaultDirection.applyQuaternion(attachedObject.quaternion)
              // Calculate target position: light position + direction * distance
              const targetDistance = 50 // Default distance for target
              const targetPosition = targetLight.position.clone().add(rotatedDirection.multiplyScalar(targetDistance))
              // Update light target
              targetLight.target.position.copy(targetPosition)
              targetLight.target.updateMatrixWorld()
              // Ensure target is in scene
              if (!targetLight.target.parent) {
                scene.add(targetLight.target)
              }
            } else if (targetLight instanceof THREE.RectAreaLight) {
              // For rect area lights: update quaternion directly
              targetLight.quaternion.copy(attachedObject.quaternion)
            }
            // Point lights and hemisphere lights don't have direction, so skip rotation
          }
        }
      } else if (attachedObject.userData?.isLightHelper) {
        // CRITICAL: Handle light helper dragging - update light position when helper is moved
        targetLight = helperToLight.get(attachedObject) ?? null
        if (targetLight) {
          const mode = transformControls.getMode()
          if (mode === 'translate') {
            // Update light position when helper is moved
            // Light helpers are positioned at the light's position, so copy helper position to light
            targetLight.position.copy(attachedObject.position)
          } else if (mode === 'rotate') {
            // For directional and spot lights: update target based on helper rotation
            if (targetLight instanceof THREE.DirectionalLight || targetLight instanceof THREE.SpotLight) {
              // Get the helper's forward direction (negative Y is default for directional lights)
              const defaultDirection = new THREE.Vector3(0, -1, 0)
              // Apply helper's rotation to the default direction
              const rotatedDirection = defaultDirection.applyQuaternion(attachedObject.quaternion)
              // Calculate target position: light position + direction * distance
              const targetDistance = 50 // Default distance for target
              const targetPosition = targetLight.position.clone().add(rotatedDirection.multiplyScalar(targetDistance))
              // Update light target
              targetLight.target.position.copy(targetPosition)
              targetLight.target.updateMatrixWorld()
              // Ensure target is in scene
              if (!targetLight.target.parent) {
                scene.add(targetLight.target)
              }
            } else if (targetLight instanceof THREE.RectAreaLight) {
              // For rect area lights: update quaternion directly
              targetLight.quaternion.copy(attachedObject.quaternion)
            }
            // Point lights and hemisphere lights don't have direction, so skip rotation
          }
        }
      }

      if (!targetLight) return

      // CRITICAL: Update gizmo and helper positions when light is transformed
      const gizmo = lightToGizmo.get(targetLight)
      if (gizmo && gizmo !== attachedObject && !attachedObject.userData?.isLightHelper) {
        const mode = transformControls.getMode()
        if (mode === 'translate') {
          gizmo.position.copy(targetLight.position)
        } else if (mode === 'rotate') {
          // Sync gizmo rotation with light direction
          if (targetLight instanceof THREE.DirectionalLight || targetLight instanceof THREE.SpotLight) {
            // Calculate rotation from light direction
            const lightDirection = computeLightDirection(targetLight)
            if (lightDirection) {
              const defaultDirection = new THREE.Vector3(0, -1, 0)
              _tempQuat.setFromUnitVectors(defaultDirection, lightDirection.normalize())
              gizmo.quaternion.copy(_tempQuat)
            }
          } else if (targetLight instanceof THREE.RectAreaLight) {
            gizmo.quaternion.copy(targetLight.quaternion)
          }
        }
      }
      
      // CRITICAL: Update helper position when light is transformed (if helper wasn't the one being dragged)
      if (!attachedObject.userData?.isLightHelper) {
        const helper = lightHelpers.get(
          Array.from(directionalLights.entries()).find(([_, light]) => light === targetLight)?.[0] || ''
        )
        if (helper && helper !== attachedObject) {
          const mode = transformControls.getMode()
          if (mode === 'translate') {
            // Update helper position to match light position
            // Light helpers automatically update their visual representation, but we need to update their position
            helper.position.copy(targetLight.position)
            // Call update() if available to refresh the helper's visual representation
            if (typeof (helper as any).update === 'function') {
              try {
                (helper as any).update()
              } catch (error) {
                // Silently ignore update errors
              }
            }
          }
        }
      }

      // Update light position and rotation in store when transformed via TransformControls
      const lightsConfig = useAppStore.getState().directionalLights
      const lightConfig = lightsConfig.find(l => {
        const light = directionalLights.get(l.id)
        return light === targetLight
      })
      if (lightConfig) {
        const mode = transformControls.getMode()
        if (mode === 'translate') {
          useAppStore.getState().updateDirectionalLight(
            lightConfig.id,
            {
              position: {
                x: targetLight.position.x,
                y: targetLight.position.y,
                z: targetLight.position.z
              }
            },
            { pushToUndoStack: false }
          )
        } else if (mode === 'rotate') {
          // Update target position for directional/spot lights
          if (targetLight instanceof THREE.DirectionalLight || targetLight instanceof THREE.SpotLight) {
            useAppStore.getState().updateDirectionalLight(
              lightConfig.id,
              {
                target: {
                  x: targetLight.target.position.x,
                  y: targetLight.target.position.y,
                  z: targetLight.target.position.z
                }
              },
              { pushToUndoStack: false }
            )
          }
          // Rect area lights use quaternion which is handled directly, no store update needed
        }
      }

      const cameraRef = viewerRef.current?.camera
      const updatedGizmo = lightToGizmo.get(targetLight)
      if (cameraRef && updatedGizmo) {
        updateLightGizmoFromLight(targetLight, updatedGizmo, cameraRef)
      }
    })
    
    transformControls.addEventListener('dragging-changed' as any, (event: any) => {
      const isDragging = event.value !== undefined ? event.value : true
      // Old path tracer removed - PathTracerDemo handles its own updates
      
      if (isDragging && !isTransforming) {
        // Start of transform drag - disable camera orbit/pan, keep zoom
        isTransforming = true
        controls.enableRotate = false
        controls.enablePan = false
        // Keep zoom and controls.enabled = true
        
        // Enable pointer events on canvas when transforming (for drag/scale to work with iframe overlay)
        if (viewerRef.current?.renderer) {
          applyViewerCanvasPointerEvents(
            viewerRef.current.renderer.domElement,
            useAppStore.getState(),
            transformControls
          )
        }
        
        // Capture initial transform for undo/redo
        const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
        if (attachedObject) {
          // For pivot wrappers, track the actual model's transform
          if (attachedObject.userData.isPivotWrapper && attachedObject.userData.originalModel) {
            transformObject = attachedObject.userData.originalModel as THREE.Object3D
          } else {
            transformObject = attachedObject
          }
          
          // Store initial transform
          initialTransform = {
            position: transformObject.position.clone(),
            rotation: transformObject.rotation.clone(),
            scale: transformObject.scale.clone()
          }
        }
        
        // Initialize position tracking for vertical drag detection (OSM Ground mode)
        if (attachedObject && transformControls.getMode() === 'translate') {
          previousDragPosition = attachedObject.position.clone()
        }
        
        // Initialize scale tracking when starting to scale a pivot wrapper
        // This MUST happen when dragging starts to ensure we have the correct initial state
        if (transformControls.getMode() === 'scale') {
          const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
          if (attachedObject && attachedObject.userData.isPivotWrapper) {
            const pivot = attachedObject as THREE.Group
            const model = pivot.userData.originalModel as THREE.Object3D
            if (model) {
              // Ensure pivot is at scale 1,1,1 before starting (it should be, but verify)
              // If pivot is not at 1,1,1, this means there's leftover state from a previous drag
              if (pivot.scale.x !== 1 || pivot.scale.y !== 1 || pivot.scale.z !== 1) {
                // Pivot is already scaled - this shouldn't happen, but handle it
                // Calculate the true model scale by removing the pivot scale
                const currentPivotScale = pivot.scale.clone()
                const currentModelScale = model.scale.clone()
                const trueModelScale = new THREE.Vector3(
                  currentModelScale.x / currentPivotScale.x,
                  currentModelScale.y / currentPivotScale.y,
                  currentModelScale.z / currentPivotScale.z
                )
                
                // Reset to clean state
                model.scale.copy(trueModelScale)
                model.updateMatrixWorld()
                pivot.scale.set(1, 1, 1)
                pivot.updateMatrixWorld()
                
                // Store true initial values
                initialModelScale = trueModelScale.clone()
                initialPivotScale = new THREE.Vector3(1, 1, 1)
                
                // Reattach transform controls with normalized pivot
                // CRITICAL: Only attach if pivot is in scene graph
                if (pivot.parent !== null) {
                  try {
                    transformControls.attach(pivot)
                  } catch (error) {
                    console.warn(`[ViewerCanvas] Failed to reattach transform controls to pivot:`, error)
                  }
                }
              } else {
                // Normal case: pivot is at 1,1,1, store current model scale
                initialModelScale = model.scale.clone()
                initialPivotScale = pivot.scale.clone() // Should be 1,1,1
              }
            }
          }
        }
        
      } else if (!isDragging && isTransforming) {
        // End of transform drag - restore camera controls immediately
        isTransforming = false
        previousDragPosition = null // Reset position tracking
        
        // Clean up any pending throttle timers for real-time sync
        if (transformObject) {
          const throttleTimer = syncThrottleTimers.get(transformObject)
          if (throttleTimer) {
            clearTimeout(throttleTimer)
            syncThrottleTimers.delete(transformObject)
          }
        }
        
        // If we were scaling a pivot wrapper, finalize the scale transfer
        // IMPORTANT: The scale has already been applied during dragging in the 'change' event
        // So we only need to reset the pivot scale and update the pivot position here
        if (transformControls.getMode() === 'scale') {
          const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
          if (attachedObject && attachedObject.userData.isPivotWrapper) {
            const pivot = attachedObject as THREE.Group
            const model = pivot.userData.originalModel as THREE.Object3D

            if (model) {
              // The model scale has already been applied during dragging
              // We just need to:
              // 1. Reset pivot scale to 1,1,1 (pivot should never be scaled)
              // 2. Update pivot position to keep it centered after scaling

              // Reset pivot scale back to 1,1,1 (pivot should never be scaled)
              // This ensures the pivot is always at scale 1 for future operations
              pivot.scale.set(1, 1, 1)
              pivot.updateMatrixWorld()

              // Update pivot position to keep it centered (or at bottom) after scaling
              // This recalculates the pivot position based on the new model bounding box
              // and adjusts the model's local position relative to the pivot
              updatePivotPosition(pivot, model)

              // Reattach transform controls to ensure they work correctly with the reset pivot
              // CRITICAL: Only attach if pivot is in scene graph
              if (pivot.parent !== null) {
                try {
                  transformControls.attach(pivot)
                } catch (error) {
                  console.warn(`[ViewerCanvas] Failed to reattach transform controls to pivot:`, error)
                }
              }
            }
          }
        }

        // After translating or rotating via a pivot wrapper, bake the world-space transform into
        // the model and recreate the pivot so registry local transforms and Streets GL sync align.
        const modeAtDragEnd = transformControls.getMode()
        if (modeAtDragEnd === 'translate' || modeAtDragEnd === 'rotate') {
          const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
          if (attachedObject?.userData?.isPivotWrapper) {
            const pivot = attachedObject as THREE.Group
            const model = pivot.userData.originalModel as THREE.Object3D | undefined
            if (model?.userData?.streetsGLObjectId) {
              const pivotMode = (pivot.userData.pivotMode as 'center' | 'bottom') || 'center'
              removePivotWrapper(pivot)
              const newPivot = createPivotWrapper(model, pivotMode)
              pivotWrappers.set(model, newPivot)
              if (newPivot.parent !== null) {
                try {
                  transformControls.attach(newPivot)
                } catch (error) {
                  console.warn('[ViewerCanvas] Failed to reattach transform controls after pivot bake:', error)
                }
              }
            }
          }
        }
        
        // Reset scale tracking when drag ends
        initialModelScale = null
        initialPivotScale = null
        
        // Update shadow camera bounds after object movement
        updateAllShadowCameraBoundsLocal()
        
        // Sync transform changes to Streets GL if object is synced
        if (transformObject && transformObject.userData.streetsGLObjectId) {
          const capturedTransformObject = transformObject
          const syncTimeout = (capturedTransformObject.userData as any).syncTimeout
          if (syncTimeout) {
            clearTimeout(syncTimeout)
          }
          const newTimeout = setTimeout(() => {
            try {
              if (capturedTransformObject) {
                syncProjectObjectTransformToStreetsGL(capturedTransformObject)
              }
            } catch (error) {
              console.error('[ViewerCanvas] Error syncing transform to Streets GL:', error)
            } finally {
              if (capturedTransformObject?.userData) {
                delete (capturedTransformObject.userData as any).syncTimeout
              }
            }
          }, 300)
          ;(capturedTransformObject.userData as any).syncTimeout = newTimeout
        }
        
        // Clear any accumulated damping/delta values to prevent drift
        ;(controls as any).sphericalDelta?.set(0, 0, 0)
        ;(controls as any).panOffset?.set(0, 0, 0)
        ;(controls as any).zoomOffset = 0
        
        // Re-enable all camera controls
        controls.enableRotate = true
        controls.enablePan = true
        controls.enableZoom = true
        controls.enabled = true
        
        // Restore canvas pointer events after transform (standard/hybrid keep navigation enabled)
        if (viewerRef.current?.renderer) {
          applyViewerCanvasPointerEvents(
            viewerRef.current.renderer.domElement,
            useAppStore.getState(),
            transformControls
          )
        }
        
        // Add transform change to undo stack (after all pivot wrapper logic is complete)
        if (transformObject && initialTransform) {
          // Get final transform (after all pivot wrapper adjustments)
          const finalTransform = {
            position: transformObject.position.clone(),
            rotation: transformObject.rotation.clone(),
            scale: transformObject.scale.clone()
          }
          
          // Check if transform actually changed (with tolerance for floating point precision)
          const EPSILON = 0.0001
          const positionChanged = 
            Math.abs(initialTransform.position.x - finalTransform.position.x) > EPSILON ||
            Math.abs(initialTransform.position.y - finalTransform.position.y) > EPSILON ||
            Math.abs(initialTransform.position.z - finalTransform.position.z) > EPSILON
          const rotationChanged = 
            Math.abs(initialTransform.rotation.x - finalTransform.rotation.x) > EPSILON ||
            Math.abs(initialTransform.rotation.y - finalTransform.rotation.y) > EPSILON ||
            Math.abs(initialTransform.rotation.z - finalTransform.rotation.z) > EPSILON
          const scaleChanged = 
            Math.abs(initialTransform.scale.x - finalTransform.scale.x) > EPSILON ||
            Math.abs(initialTransform.scale.y - finalTransform.scale.y) > EPSILON ||
            Math.abs(initialTransform.scale.z - finalTransform.scale.z) > EPSILON
          
          if (positionChanged || rotationChanged || scaleChanged) {
            // Add to undo stack
            const { addToUndoStack } = useAppStore.getState()
            addToUndoStack({
              type: 'transform-change',
              object: transformObject,
              previousTransform: initialTransform,
              newTransform: finalTransform
            })
          }
        }
        
        // Reset transform tracking
        initialTransform = null
        transformObject = null
        
        // Update controls to apply changes immediately
        controls.update()
      }
    })
    
    // Also listen to objectChange event for path tracer notifications
    // Note: We do NOT update pivot position here during scaling, as this would interfere
    // with the transform controls. Pivot position is only updated when dragging ends.
    transformControls.addEventListener('objectChange' as any, () => {
      // Old path tracer removed - PathTracerDemo handles its own updates
    })

    // Create a group for starting objects (lights)
    const startingObjectsGroup = new THREE.Group()
    startingObjectsGroup.name = 'Starting Objects'
    startingObjectsGroup.userData.isStartingObjectsGroup = true
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    ambientLight.name = 'Ambient Light'
    startingObjectsGroup.add(ambientLight)

    // Multiple directional lights system
    directionalLights = new Map<string, THREE.DirectionalLight>()
    lightHelpers = new Map<string, THREE.DirectionalLightHelper>()
    const shadowMapViewers = new Map<string, ShadowMapViewer>()
    lightGizmos = new Map<string, THREE.Object3D>()
    const lightToGizmo = new WeakMap<THREE.Light, THREE.Object3D>()
    const gizmoToLight = new WeakMap<THREE.Object3D, THREE.Light>()
    // CRITICAL: Map to find light from helper (for making helpers draggable)
    const helperToLight = new WeakMap<THREE.Object3D, THREE.Light>()
    let currentSelectedLightGizmo: THREE.Object3D | null = null
    let environmentMap: THREE.DataTexture | null = null
    
    // Helper function to update shadow camera bounds based on scene objects
    // This ensures shadows are sharp by focusing the shadow map on actual scene objects
    // IMPROVED: Better bounds calculation for close objects and visible area
    const updateShadowCameraBounds = (light: THREE.DirectionalLight, scene: THREE.Scene, camera?: THREE.Camera) => {
      if (!light.shadow) return
      
      // Calculate bounding box of all objects that cast shadows AND receive shadows
      // This ensures shadows are properly rendered on both casting and receiving objects
      const box = new THREE.Box3()
      let hasObjects = false
      
      // Also calculate bounds of visible objects (near camera) for better precision
      const visibleBox = new THREE.Box3()
      let hasVisibleObjects = false
      const cameraPosition = camera?.position || new THREE.Vector3(0, 0, 0)
      const maxVisibleDistance = 500 // Focus on objects within 500 units of camera
      
      scene.traverse((obj) => {
        // Skip helpers, gizmos, and system objects
        if (obj.userData.isShadowPlane || 
            obj.userData.isGridHelper ||
            obj.userData.isAxesHelper ||
            obj.userData.isLightGizmo ||
            obj.userData.isLightHelper ||
            obj.userData.isGroundedSkybox ||
            obj.userData.isDynamicSky ||
            obj.userData.isSun ||
            obj.userData.isMoon) {
          return
        }
        
        // CRITICAL: Only include objects that CAST shadows for shadow camera bounds calculation
        // Objects that only receive shadows (like shadow plane, GroundedSkybox) should NOT affect bounds
        // This ensures shadow camera focuses on objects that actually block light
        // Shadow receiving objects are handled separately - they don't need to be in the shadow camera bounds
        
        let objBox: THREE.Box3 | null = null
        
        // Check if this is a mesh that casts shadows
        if (obj instanceof THREE.Mesh && obj.castShadow) {
          objBox = new THREE.Box3().setFromObject(obj)
        } else if (obj instanceof THREE.Group || obj instanceof THREE.Object3D) {
          // For groups (like pivot wrappers or model groups), check if any child meshes cast shadows
          // This ensures models wrapped in groups are included in shadow calculations
          let groupHasShadowCastingMeshes = false
          const groupBox = new THREE.Box3()
          
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh && child.castShadow) {
              const childBox = new THREE.Box3().setFromObject(child)
              if (!childBox.isEmpty()) {
                if (!groupHasShadowCastingMeshes) {
                  groupBox.copy(childBox)
                  groupHasShadowCastingMeshes = true
                } else {
                  groupBox.union(childBox)
                }
              }
            }
          })
          
          if (groupHasShadowCastingMeshes && !groupBox.isEmpty()) {
            objBox = groupBox
          }
        }
        
        if (objBox && !objBox.isEmpty()) {
          // Add to full bounding box
          if (!hasObjects) {
            box.copy(objBox)
            hasObjects = true
          } else {
            box.union(objBox)
          }
          
          // Also track visible objects (near camera) for tighter bounds
          const objCenter = objBox.getCenter(new THREE.Vector3())
          const distanceToCamera = cameraPosition.distanceTo(objCenter)
          if (distanceToCamera < maxVisibleDistance) {
            if (!hasVisibleObjects) {
              visibleBox.copy(objBox)
              hasVisibleObjects = true
            } else {
              visibleBox.union(objBox)
            }
          }
        }
      })
      
      // Prefer visible objects for tighter bounds (better shadow quality on close objects)
      // Fall back to all objects if no visible objects found
      const targetBox = hasVisibleObjects ? visibleBox : box
      const useVisibleBounds = hasVisibleObjects && hasObjects
      
      if (hasObjects && !targetBox.isEmpty()) {
        const size = targetBox.getSize(new THREE.Vector3())
        const center = targetBox.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const minDim = Math.min(size.x, size.y, size.z)
        
        // IMPROVED: Calculate shadow camera bounds with better precision
        // For visible objects (close to camera), use tighter bounds (2x size instead of 5x)
        // This gives better shadow resolution for close objects
        // For distant objects, use slightly larger bounds (4x) for coverage
        // IMPROVED: Cap the bounds multiplier for very large objects to prevent excessive shadow camera coverage
        // Large models (like cars) can have bounding boxes of 100+ units, which would create 500+ unit shadow cameras
        // Cap at reasonable maximum to maintain shadow quality
        const baseMultiplier = useVisibleBounds ? 2.5 : 4.0
        // Reduce multiplier for very large objects to keep shadow camera coverage reasonable
        const sizeFactor = maxDim > 50 ? Math.max(0.5, 1.0 - (maxDim - 50) / 200) : 1.0 // Scale down for objects > 50 units
        const boundsMultiplier = baseMultiplier * sizeFactor
        const shadowSize = Math.max(maxDim * boundsMultiplier, minDim * 1.5, 50) // Minimum 50 units
        
        // Add padding based on object size to ensure shadows aren't clipped
        // Larger objects need more padding, but cap padding to prevent excessive coverage
        const padding = Math.min(Math.max(maxDim * 0.1, 10), 50) // 10% of size, min 10, max 50 units
        const finalShadowSize = shadowSize + padding
        
        // IMPROVED: Cap final shadow size to prevent excessive coverage, but allow larger scenes
        // For very large scenes (like Streets GL with map coordinates), we need larger shadow cameras
        // Use adaptive max size based on scene size: larger scenes get larger shadow cameras
        // This ensures shadows aren't cut off in large coordinate systems
        const adaptiveMaxSize = maxDim > 1000 ? Math.min(maxDim * 1.5, 10000) : 2000
        const maxShadowSize = Math.max(adaptiveMaxSize, 2000) // Minimum 2000, but scale up for large scenes
        const clampedShadowSize = Math.min(finalShadowSize, maxShadowSize)
        
        light.shadow.camera.left = -clampedShadowSize
        light.shadow.camera.right = clampedShadowSize
        light.shadow.camera.top = clampedShadowSize
        light.shadow.camera.bottom = -clampedShadowSize

        // CRITICAL: Use a very small near plane to capture interior surfaces and internal parts
        // 0.001 allows the shadow camera to see very close surfaces (like inside vents, openings, cavities)
        // This is essential for shadows to appear on internal parts of complex models like cars
        // For very small objects, use even smaller near plane
        const nearPlane = minDim < 1.0 ? 0.0005 : 0.001 // Reduced from 0.01 to 0.001 for better internal surface capture
        light.shadow.camera.near = nearPlane
        
        // Ensure far plane is large enough to include the entire scene
        // Calculate based on the depth of the bounding box plus margin
        // For close objects, use tighter far plane for better precision
        const depthSize = size.y > size.z ? size.y : size.z
        // Add extra margin for shadow projection (shadows can extend far from objects)
        const shadowProjectionMargin = maxDim * 2 // Shadows can extend 2x the object size
        const farPlane = useVisibleBounds 
          ? Math.max(depthSize * 3 + shadowProjectionMargin, maxDim * 6, 2000) // Increased for shadow projection
          : Math.max(depthSize * 5 + shadowProjectionMargin, maxDim * 10, 5000) // Much larger for full scene coverage
        
        light.shadow.camera.far = farPlane
        
        // CRITICAL: For directional lights, shadow camera position is independent of light position
        // The light position is arbitrary for directional lights (they're infinite)
        // Position the shadow camera at the center of the scene, offset along the light direction
        // This ensures shadows cover the entire scene, not just near the light position
        let lightDirection: THREE.Vector3
        if ((light as any) instanceof THREE.DirectionalLight || (light as any) instanceof THREE.SpotLight) {
          const computedDir = computeLightDirection(light)
          lightDirection = computedDir ? computedDir.clone() : new THREE.Vector3(0, -1, 0)
        } else {
          // For other light types, use default down direction
          lightDirection = new THREE.Vector3(0, -1, 0)
        }
        // Position shadow camera at center, but offset back along light direction to cover entire scene
        // Offset distance should cover half the scene depth to ensure full coverage
        const offsetDistance = Math.max(maxDim * 2, 500) // Offset by 2x max dimension or 500 units
        const shadowCameraPosition = center.clone().add(lightDirection.clone().multiplyScalar(-offsetDistance))
        light.shadow.camera.position.copy(shadowCameraPosition)
        
        // Look at the center of the bounding box (in direction of light)
        // This ensures the shadow camera sees the entire scene from the light's perspective
        light.shadow.camera.lookAt(center)
        light.shadow.camera.updateProjectionMatrix()
        
        // IMPROVED: Use adaptive or manual shadow bias based on user preference
        const useAdaptiveShadowSettings = useAppStore.getState().useAdaptiveShadowSettings
        
        if (useAdaptiveShadowSettings) {
          // Calculate adaptive shadow bias based on shadow map resolution and object size
          // Smaller objects and higher resolution shadow maps need smaller bias
          const shadowMapSize = light.shadow.mapSize.width
          const biasScale = shadowMapSize / 8192 // Normalize to 8192 base
          // Bias should be inversely proportional to shadow map size and object size
          // Smaller objects need smaller bias to prevent shadow acne
          // CRITICAL: Don't make bias too negative - this can cause shadows to leak through opaque objects
          // Use a conservative bias that prevents shadow acne without causing shadow bleeding
          // IMPROVED: Use slightly less negative bias for better self-shadowing on internal parts
          // Less negative bias helps shadows appear on close surfaces (like inside vents/openings)
          const adaptiveBias = -0.0001 * (minDim / maxDim) * biasScale
          // Clamp bias to reasonable range - ensure it's not too negative to prevent shadow bleeding
          // Minimum bias of -0.0005 prevents shadows from leaking through opaque objects
          // Maximum bias of -0.00005 allows better self-shadowing on internal parts
          light.shadow.bias = THREE.MathUtils.clamp(adaptiveBias, -0.0005, -0.00005)
          
          // IMPROVED: Add normal bias for better shadow quality on close objects
          // Normal bias helps reduce shadow acne on surfaces with sharp angles
          // Use adaptive normal bias based on object size
          const normalBiasScale = minDim < 1.0 ? 0.02 : 0.01 // Higher for smaller objects
          light.shadow.normalBias = normalBiasScale * (minDim / maxDim)
        } else {
          // Use manual override values from store
          light.shadow.bias = useAppStore.getState().shadowBiasOverride
          light.shadow.normalBias = useAppStore.getState().shadowNormalBiasOverride
        }
        
        // Force shadow map update
        light.shadow.needsUpdate = true
      } else {
        // Fallback to very large bounds if no objects found (for infinite coverage)
        // Increase bounds to prevent shadow cuts when no objects are found
        light.shadow.camera.left = -3000
        light.shadow.camera.right = 3000
        light.shadow.camera.top = 3000
        light.shadow.camera.bottom = -3000
        light.shadow.camera.near = 0.001 // Use very small near plane to capture internal surfaces (vents, openings, etc.)
        light.shadow.camera.far = 10000 // Increased far plane for better coverage
        // Position shadow camera at a reasonable location (offset from origin along light direction)
        let lightDirection: THREE.Vector3
        if ((light as any) instanceof THREE.DirectionalLight || (light as any) instanceof THREE.SpotLight) {
          const computedDir = computeLightDirection(light)
          lightDirection = computedDir ? computedDir.clone() : new THREE.Vector3(0, -1, 0)
        } else {
          // For other light types, use default down direction
          lightDirection = new THREE.Vector3(0, -1, 0)
        }
        const fallbackPosition = lightDirection.clone().multiplyScalar(-1000)
        light.shadow.camera.position.copy(fallbackPosition)
        light.shadow.camera.lookAt(0, 0, 0)
        light.shadow.camera.updateProjectionMatrix()
        
        // Use adaptive or manual shadow bias based on user preference
        const useAdaptiveShadowSettings = useAppStore.getState().useAdaptiveShadowSettings
        if (useAdaptiveShadowSettings) {
          // CRITICAL: Use conservative bias to prevent shadows leaking through opaque objects
          // IMPROVED: Use slightly less negative bias for better self-shadowing on internal parts
          // Less negative bias helps shadows appear on close surfaces (like inside vents/openings)
          light.shadow.bias = -0.00015 // Reduced from -0.0002 for better internal surface shadows
          light.shadow.normalBias = 0.005 // Reduced from 0.01 for better self-shadowing on close surfaces
        } else {
          light.shadow.bias = useAppStore.getState().shadowBiasOverride
          light.shadow.normalBias = useAppStore.getState().shadowNormalBiasOverride
        }
        light.shadow.needsUpdate = true
      }
    }
    
    // Initialize RectAreaLightUniformsLib for physical area lights (only once)
    RectAreaLightUniformsLib.init()
    
    // CRITICAL: Auto-create default directional light with shadows BEFORE reading lights from store
    // This ensures the default sun exists in the store before we try to initialize lights from it
    // This fixes the issue where shadows don't work because no sun light exists initially
    const lightsBeforeCheck = useAppStore.getState().directionalLights
    if (lightsBeforeCheck.length === 0) {
      try {
        useAppStore.getState().addDirectionalLight({
          name: 'Sun Light',
          type: 'directional',
          position: { x: 5, y: 10, z: 5 },
          intensity: 1.0,
          color: '#ffffff',
          castShadow: true,
          enabled: true,
          isSun: true
        }, { pushToUndoStack: false })
        console.log('[ViewerInit] Created default directional light with shadows enabled')
      } catch (error) {
        console.warn('[ViewerInit] Failed to create default light:', error)
      }
    }
    
    // Initialize lights from store (will be updated by effect)
    // Now read lights AFTER ensuring default sun exists
    const initialLights = useAppStore.getState().directionalLights
    initialLights.forEach((lightConfig) => {
      if (lightConfig && lightConfig.id) {
        try {
          const light = createLight(lightConfig, scene)
          directionalLights.set(lightConfig.id, light as THREE.DirectionalLight)
          startingObjectsGroup.add(light)
          
          // Add visual helper so user can see and interact with the light
          // Don't add helper for sun lights as SunMoonSystem provides the visual
          if (!lightConfig.isSun) {
            let helper: THREE.Object3D | null = null
            const lightColor = new THREE.Color(lightConfig.color || '#ffffff')
            
            if (light instanceof THREE.DirectionalLight) {
              helper = new THREE.DirectionalLightHelper(light, 5, lightColor)
            } else if (light instanceof THREE.PointLight) {
              helper = new THREE.PointLightHelper(light, 1, lightColor)
            } else if (light instanceof THREE.SpotLight) {
              helper = new THREE.SpotLightHelper(light, lightColor)
            } else if (light instanceof THREE.RectAreaLight) {
              helper = new RectAreaLightHelper(light)
            } else if (light instanceof THREE.HemisphereLight) {
              helper = new THREE.HemisphereLightHelper(light, 5, lightColor)
            }
            if (helper) {
              helper.userData.lightId = lightConfig.id
              helper.userData.isLightHelper = true // Mark as light helper for selection
              scene.add(helper)
              // Store helper reference for updates
              const helpersMap = (viewerRef.current as any)?.lightHelpers || lightHelpers
              helpersMap.set(lightConfig.id, helper)
              // CRITICAL: Map helper to light for drag functionality
              helperToLight.set(helper, light)
            }
          }

          ensureLightGizmo(scene, lightConfig, light, lightGizmos, lightToGizmo, gizmoToLight, camera)
        } catch (error) {
          console.warn('Failed to create light:', lightConfig.id, error)
        }
      }
    })

    // Add the starting objects group to the scene
    scene.add(startingObjectsGroup)

    // Create a group for native objects (grid, axes, shadow plane)
    const nativeObjectsGroup = new THREE.Group()
    nativeObjectsGroup.name = 'Native Objects'
    nativeObjectsGroup.userData.isNativeObjectsGroup = true
    
    // Grid helper with shadow-receiving plane
    // Use very large size to make it effectively infinite
    // Initial grid size from store
    const initialGridSize = useAppStore.getState().gridSize
    const gridHelper = new THREE.GridHelper(10000, initialGridSize, 0x444444, 0x222222)
    gridHelper.name = 'Grid'
    gridHelper.userData.isGridHelper = true
    gridHelper.renderOrder = 1 // Render grid before shadow plane to prevent z-fighting
    nativeObjectsGroup.add(gridHelper)
    
    // Shadow plane to receive shadows (can be toggled)
    // Use very large dimensions to make it effectively infinite
    // CRITICAL: Initialize visibility based on store state to prevent timing issues
    const initialShowShadowPlane = useAppStore.getState().showShadowPlane
    const shadowPlaneGeometry = new THREE.PlaneGeometry(10000, 10000)
    // Start with standard material, will be updated based on transparent option
    // CRITICAL: depthWrite MUST be true for shadows to render correctly on the plane
    const shadowPlaneMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: true // CRITICAL: Required for shadows to render on the plane
    })
    const shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial)
    shadowPlane.name = 'Shadow Plane'
    shadowPlane.rotation.x = -Math.PI / 2
    shadowPlane.position.y = -0.001 // Slightly lower than grid to prevent z-fighting
    shadowPlane.receiveShadow = true
    shadowPlane.castShadow = false // Shadow plane should not cast shadows
    shadowPlane.userData.isShadowPlane = true
    // CRITICAL: Set initial visibility from store to prevent visible flash before App.tsx effect runs
    shadowPlane.visible = initialShowShadowPlane
    // CRITICAL: Shadow plane must render after GroundedSkybox (renderOrder -1000) to properly occlude it
    // when viewed from below. Higher renderOrder means it renders later (on top).
    shadowPlane.renderOrder = 100 // Render shadow plane after grid and after GroundedSkybox
    nativeObjectsGroup.add(shadowPlane)

    // Axes helper
    const axesHelper = new THREE.AxesHelper(5)
    axesHelper.name = 'Axes'
    nativeObjectsGroup.add(axesHelper)

    // CineShader-style demo screen near the origin (acts like a framed light wall close to the car)
    try {
      const screenWidth = 3
      const screenHeight = 1.8

      // Initialize with high pixel resolution (Shadertoy expects pixel coordinates)
      const aspectRatio = screenWidth / screenHeight
      const pixelResolution = 1920.0
      const shaderScreenUniforms = {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(pixelResolution, pixelResolution / aspectRatio) },
        iMouse: { value: new THREE.Vector4(0, 0, 0, 0) } // x, y, click state
      }

      // Noise functions (shared between vertex and fragment shaders)
      const noiseFunctions = `
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
        
        float snoise(vec3 v){ 
            const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
            
            // First corner
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 =   v - i + dot(i, C.xxx) ;
            
            // Other corners
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );
            
            vec3 x1 = x0 - i1 + 1.0 * C.xxx;
            vec3 x2 = x0 - i2 + 2.0 * C.xxx;
            vec3 x3 = x0 - 1. + 3.0 * C.xxx;
            
            // Permutations
            i = mod(i, 289.0 ); 
            vec4 p = permute( permute( permute( 
                                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                             + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
            
            // Gradients
            float n_ = 1.0/7.0; // N=7
            vec3  ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);
            
            //Normalise gradients
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            // Mix final noise value
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                                              dot(p2,x2), dot(p3,x3) ) );
        }
        
        float fbm( vec3 p ) {
            float f = 0.0;
            f += 0.5000*snoise( p ); p = p*2.02;
            f += 0.2500*snoise( p ); p = p*2.03;
            f += 0.1250*snoise( p ); p = p*2.01;
            f += 0.0625*snoise( p );
            return f/0.9375;
        }
      `

      // Vertex shader with displacement for true 3D surface
      const vertexShader = `
        uniform vec2 iResolution;
        uniform float iTime;
        uniform vec4 iMouse;
        varying vec2 vUv;
        varying float vDisplacement;
        
        ${noiseFunctions}
        
        void main() {
          // Flip UV to fix inversion (vUv.y = 1.0 - uv.y)
          vUv = vec2(uv.x, 1.0 - uv.y);
          
          // Calculate displacement using the same noise function as fragment shader
          vec2 fragCoord = vUv * iResolution;
          vec2 uv_coord = fragCoord / iResolution.xy;
          float mouseRatio = smoothstep(100.0, 0.0, length(iMouse.xy - fragCoord.xy));
          float noise = 0.25 + fbm(vec3(uv_coord * 12.0 + (iMouse.xy - fragCoord.xy) * mouseRatio * 0.05, iTime * 0.18 + 0.5 * mouseRatio));
          noise *= 0.25 + snoise(vec3(uv_coord * 4.0 + 1.5, iTime * 0.15));
          
          vDisplacement = noise;
          
          // Displace vertex along normal vector (proper 3D displacement)
          vec3 newPosition = position;
          float displacementAmount = noise * 0.4; // Scale displacement for visible 3D effect
          // Displace along the normal vector to create proper 3D surface deformation
          newPosition += normal * displacementAmount;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `

      // CineShader turbulence noise shader with improved brightness and opacity
      const shaderScreenMaterial = new THREE.ShaderMaterial({
        uniforms: shaderScreenUniforms,
        vertexShader: vertexShader,
        fragmentShader: `
          precision highp float;
          
          uniform vec2 iResolution;
          uniform float iTime;
          uniform vec4 iMouse;
          varying vec2 vUv;
          varying float vDisplacement;
          
          ${noiseFunctions}
          
          void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
            // Original CineShader demo code with brightness and opacity adjustments
            vec2 uv = fragCoord / iResolution.xy;
            float mouseRatio = smoothstep(100.0, 0.0, length(iMouse.xy - fragCoord.xy));
            float noise = 0.25 + fbm(vec3(uv * 12.0 + (iMouse.xy - fragCoord.xy) * mouseRatio * 0.05, iTime * 0.18 + 0.5 * mouseRatio));
            noise *= 0.25 + snoise(vec3(uv * 4.0 + 1.5, iTime * 0.15));
            
            // Increase brightness and opacity - remap noise to higher range for more solid appearance
            float alpha = noise;
            alpha = smoothstep(0.0, 0.8, alpha); // Remap to increase overall brightness
            alpha = mix(0.6, 1.0, alpha); // Ensure minimum opacity of 0.6, max of 1.0
            
            fragColor = vec4(1.0, 1.0, 1.0, alpha);
          }
          
          void main() {
            vec2 fragCoord = vUv * iResolution;
            vec4 fragColor;
            mainImage(fragColor, fragCoord);
            gl_FragColor = fragColor;
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
        blending: THREE.NormalBlending
      })

      // Create subdivided plane for vertex displacement (more vertices = smoother 3D surface)
      const segments = 128 // High resolution for smooth displacement
      const shaderScreenGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight, segments, segments)

      // Simple physical frame around the screen
      const frameThickness = 0.12
      const frameDepth = 0.15
      
      const shaderScreen = new THREE.Mesh(shaderScreenGeometry, shaderScreenMaterial)
      shaderScreen.name = 'CineShaderDemoScreen'
      // Position screen in front of the frame (frame depth is 0.15, so position at frameDepth/2 + small offset)
      shaderScreen.position.set(0, 0, frameDepth / 2 + 0.02) // In front of frame
      // Rotate screen to face camera - PlaneGeometry faces +Z by default, camera is at +Z looking towards origin
      // So we need to rotate 180 degrees to face -Z (towards camera)
      shaderScreen.rotation.y = Math.PI // Face camera (rotate to face -Z)
      shaderScreen.castShadow = false
      shaderScreen.receiveShadow = false
      shaderScreen.renderOrder = 1000 // Render on top of frame
      shaderScreen.userData.isDemoShaderScreen = true
      const outerW = screenWidth + frameThickness * 2.0
      const outerH = screenHeight + frameThickness * 2.0

      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x111319,
        metalness: 0.65,
        roughness: 0.35
      })
      
      // Create frame as a border only (4 sides) instead of a box with inner cutout
      // This prevents the innerMesh from creating a black box that covers the screen
      const frameGroup = new THREE.Group()
      frameGroup.name = 'CineShaderDemoFrame'
      frameGroup.position.set(0, 0, 0) // Relative to parent group
      frameGroup.rotation.set(0, 0, 0)

      // Create frame border pieces (top, bottom, left, right)
      const borderThickness = frameThickness
      const borderDepth = frameDepth
      
      // Top border
      const topBorder = new THREE.Mesh(
        new THREE.BoxGeometry(outerW, borderThickness, borderDepth),
        frameMat
      )
      topBorder.position.set(0, screenHeight / 2 + borderThickness / 2, 0)
      
      // Bottom border
      const bottomBorder = new THREE.Mesh(
        new THREE.BoxGeometry(outerW, borderThickness, borderDepth),
        frameMat
      )
      bottomBorder.position.set(0, -screenHeight / 2 - borderThickness / 2, 0)
      
      // Left border
      const leftBorder = new THREE.Mesh(
        new THREE.BoxGeometry(borderThickness, screenHeight, borderDepth),
        frameMat
      )
      leftBorder.position.set(-screenWidth / 2 - borderThickness / 2, 0, 0)
      
      // Right border
      const rightBorder = new THREE.Mesh(
        new THREE.BoxGeometry(borderThickness, screenHeight, borderDepth),
        frameMat
      )
      rightBorder.position.set(screenWidth / 2 + borderThickness / 2, 0, 0)

      topBorder.castShadow = false
      topBorder.receiveShadow = true
      topBorder.renderOrder = 0
      bottomBorder.castShadow = false
      bottomBorder.receiveShadow = true
      bottomBorder.renderOrder = 0
      leftBorder.castShadow = false
      leftBorder.receiveShadow = true
      leftBorder.renderOrder = 0
      rightBorder.castShadow = false
      rightBorder.receiveShadow = true
      rightBorder.renderOrder = 0

      frameGroup.add(topBorder)
      frameGroup.add(bottomBorder)
      frameGroup.add(leftBorder)
      frameGroup.add(rightBorder)
      frameGroup.renderOrder = 0 // Frame renders first

      // Create a parent group to hold both screen and frame together
      const screenAndFrameGroup = new THREE.Group()
      screenAndFrameGroup.name = 'CineShaderDemoScreenGroup'
      screenAndFrameGroup.position.set(0, 1.4, -4)
      screenAndFrameGroup.rotation.y = THREE.MathUtils.degToRad(0)
      
      // Make the group selectable and draggable
      screenAndFrameGroup.userData.isModel = true
      screenAndFrameGroup.userData.isImportedModel = true
      screenAndFrameGroup.userData.isDemoShaderScreen = true
      screenAndFrameGroup.castShadow = false
      screenAndFrameGroup.receiveShadow = false

      // Add screen and frame to the parent group
      screenAndFrameGroup.add(shaderScreen)
      screenAndFrameGroup.add(frameGroup)

      const startTime = performance.now()
      const rendererSize = new THREE.Vector2()
      shaderScreen.onBeforeRender = (renderer) => {
        const now = performance.now()
        shaderScreenUniforms.iTime.value = (now - startTime) / 1000.0
        renderer.getSize(rendererSize)
        // Use pixel resolution (not world-space) - this is critical for proper noise detail
        // pixelResolution and aspectRatio are already defined in outer scope
        shaderScreenUniforms.iResolution.value.set(pixelResolution, pixelResolution / aspectRatio)
        // iMouse can be updated from mouse position if needed
      }

      // Hide by default - will be shown when shader editor panel is opened
      screenAndFrameGroup.visible = false
      
      // Add the parent group to the scene (not individual pieces)
      nativeObjectsGroup.add(screenAndFrameGroup)
      console.log('[ViewerCanvas] CineShader demo screen created:', {
        position: screenAndFrameGroup.position.clone(),
        rotation: screenAndFrameGroup.rotation.clone(),
        visible: screenAndFrameGroup.visible,
        screenVisible: shaderScreen.visible,
        materialType: shaderScreen.material?.type,
        hasUniforms: !!shaderScreen.material?.uniforms
      })
    } catch (error) {
      console.warn('[ViewerCanvas] Failed to create CineShader demo screen:', error)
    }
    
    // Add the group to the scene
    scene.add(nativeObjectsGroup)
    
    const frameObject = (object: THREE.Object3D, preserveZoom: boolean = false) => {
      // Check if object has a pivot wrapper - if so, frame the pivot instead
      let targetObject = object
      const pivot = pivotWrappers.get(object)
      if (pivot) {
        targetObject = pivot
      }
      
      // If this object is part of a Gaussian splat viewer, frame the splat viewer root instead
      // (internal meshes often have empty/invalid bbox; the root gives a usable frame)
      let p: THREE.Object3D | null = targetObject.parent
      while (p) {
        if ((p as any).userData?.isGaussianSplatViewer) {
          targetObject = p
          break
        }
        p = p.parent
      }
      
      // Update world matrices to ensure accurate bounding box calculation
      targetObject.updateMatrixWorld(true)
      
      // For lights, use their position directly; for models, calculate bounding box
      let center: THREE.Vector3
      const splatBounds =
        (targetObject as any).userData?.isGaussianSplatViewer === true
          ? getGaussianSplatBounds(targetObject)
          : null
      if (targetObject instanceof THREE.DirectionalLight || targetObject instanceof THREE.AmbientLight) {
        center = targetObject.position.clone()
      } else if (splatBounds) {
        center = splatBounds.getCenter(new THREE.Vector3())
      } else {
        const box = new THREE.Box3().setFromObject(targetObject)
        center = box.getCenter(new THREE.Vector3())
      }
      
      if (preserveZoom) {
        // Preserve current zoom distance - only adjust camera position to center the object
        // Calculate current distance from camera to current target
        const currentDistance = camera.position.distanceTo(controls.target)
        
        // Calculate direction from current camera position to object center
        const currentDirection = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
        
        // If direction is invalid (zero length), use a default diagonal view
        if (currentDirection.lengthSq() < 0.001) {
          currentDirection.set(1, 0.75, 1).normalize()
        }
        
        // Position camera at the same distance from the new center
        camera.position.copy(center).add(currentDirection.multiplyScalar(currentDistance))
        camera.lookAt(center)
        controls.target.copy(center)
      } else {
        // Normal framing: calculate appropriate distance based on object size
        let distance = 5
        if (!(targetObject instanceof THREE.DirectionalLight || targetObject instanceof THREE.AmbientLight)) {
          const box = splatBounds ?? new THREE.Box3().setFromObject(targetObject)
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          
          // Ensure minimum distance for very small objects
          if ((targetObject as any).userData?.isGaussianSplatViewer === true && maxDim > 0) {
            const radius = size.length() * 0.5
            const cameraAspect = camera.aspect || 1
            const verticalFov = THREE.MathUtils.degToRad(camera.fov || 50)
            const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * cameraAspect)
            const limitingFov = Math.min(verticalFov, horizontalFov)
            distance = Math.max((radius / Math.sin(Math.max(limitingFov / 2, 0.1))) * 1.15, 6)
          } else if (maxDim > 0) {
            distance = Math.max(maxDim * 2.5, 2) // Minimum 2 units distance
          } else {
            // Empty/invalid bbox (e.g. Gaussian splat internal meshes) — use default distance; only warn if not a splat viewer
            const isSplatViewer = (targetObject as any).userData?.isGaussianSplatViewer
            distance = isSplatViewer ? 15 : 5
            if (!isSplatViewer) {
              console.warn('[FrameObject] Invalid bounding box, using default distance')
            }
          }

          if ((targetObject as any).userData?.isGaussianSplatViewer) {
            console.log(
              '[FrameObject:Splat]',
              JSON.stringify({
                center: { x: Number(center.x.toFixed(3)), y: Number(center.y.toFixed(3)), z: Number(center.z.toFixed(3)) },
                size: { x: Number(size.x.toFixed(3)), y: Number(size.y.toFixed(3)), z: Number(size.z.toFixed(3)) },
                maxDim: Number(maxDim.toFixed(3)),
                distance: Number(distance.toFixed(3))
              })
            )
          }
          
          console.log(
            '[FrameObject] Framing object:',
            JSON.stringify({
              center: { x: Number(center.x.toFixed(2)), y: Number(center.y.toFixed(2)), z: Number(center.z.toFixed(2)) },
              size: { x: Number(size.x.toFixed(2)), y: Number(size.y.toFixed(2)), z: Number(size.z.toFixed(2)) },
              maxDim: Number(maxDim.toFixed(2)),
              distance: Number(distance.toFixed(2))
            })
          )
        }
        
        // Calculate camera position to look at object center from a good viewing angle
        // Use a diagonal direction for a nice 3/4 view
        const direction = new THREE.Vector3(1, 0.75, 1).normalize()
        camera.position.copy(center).add(direction.multiplyScalar(distance))
        camera.lookAt(center)
        controls.target.copy(center)
        
        console.log(
          '[FrameObject] Camera positioned:',
          JSON.stringify({
            position: {
              x: Number(camera.position.x.toFixed(2)),
              y: Number(camera.position.y.toFixed(2)),
              z: Number(camera.position.z.toFixed(2))
            },
            target: {
              x: Number(controls.target.x.toFixed(2)),
              y: Number(controls.target.y.toFixed(2)),
              z: Number(controls.target.z.toFixed(2))
            }
          })
        )
      }
      
      controls.update()
      
      // Force camera to update its projection matrix
      camera.updateProjectionMatrix()
    }

    const resetCamera = () => {
      camera.position.set(5, 5, 5)
      controls.target.set(0, 0, 0)
      controls.update()
    }
    
    // Get current camera state (position and target)
    const getCameraState = (): { position: THREE.Vector3; target: THREE.Vector3 } => {
      return {
        position: camera.position.clone(),
        target: controls.target.clone()
      }
    }
    
    // Set camera state (with optional smooth animation like Twinmotion)
    const setCameraState = (position: THREE.Vector3, target: THREE.Vector3, animate: boolean = true) => {
      if (animate) {
        // Smooth camera transition like Twinmotion
        const startPos = camera.position.clone()
        const startTarget = controls.target.clone()
        const duration = 1000 // 1 second transition
        const startTime = Date.now()
        
        const animateCamera = () => {
          const elapsed = Date.now() - startTime
          const progress = Math.min(elapsed / duration, 1)
          
          // Easing function (ease-in-out)
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2
          
          // Interpolate position and target
          camera.position.lerpVectors(startPos, position, eased)
          controls.target.lerpVectors(startTarget, target, eased)
          controls.update()
          
          if (progress < 1) {
            requestAnimationFrame(animateCamera)
          } else {
            // Ensure we end exactly at target
            camera.position.copy(position)
            controls.target.copy(target)
            controls.update()
          }
        }
        
        animateCamera()
      } else {
        // Instant camera change
        camera.position.copy(position)
        controls.target.copy(target)
        controls.update()
      }
    }

    const selectObject = (object: THREE.Object3D | null) => {
      // CRITICAL: Resolve light helpers to their associated lights
      let resolvedObject: THREE.Object3D | null = null
      if (object) {
        if (object.userData?.isLightGizmo) {
          resolvedObject = gizmoToLight.get(object) ?? null
        } else if (object.userData?.isLightHelper) {
          // Resolve light helper to its associated light
          resolvedObject = helperToLight.get(object) ?? null
        } else {
          resolvedObject = object
        }
      }

      if (object && object.userData?.isLightGizmo && !resolvedObject) {
        return
      }

      if (resolvedObject && (resolvedObject.userData.isModel || resolvedObject instanceof THREE.Light)) {
        setSelectedObject(resolvedObject)
        
        // clear previous light highlight if switching selections
        const existingGizmo = currentSelectedLightGizmo
        const nextGizmo = resolvedObject instanceof THREE.Light ? lightToGizmo.get(resolvedObject) ?? null : null
        if (existingGizmo && existingGizmo !== nextGizmo) {
          const existingLight = gizmoToLight.get(existingGizmo) ?? null
          setLightGizmoSelected(existingGizmo, false, viewerRef.current?.camera, existingLight)
          currentSelectedLightGizmo = null
        }

        const activeTransformMode = useAppStore.getState().transformMode || transformMode

        // Only create pivot wrapper for models, not lights
        if (resolvedObject.userData.isModel) {
          // Get current pivot mode
          const currentPivotMode = useAppStore.getState().pivotMode
          
          // Check if we need to recreate pivot due to mode change
          let pivot = pivotWrappers.get(resolvedObject)
          if (pivot && pivot.userData.pivotMode !== currentPivotMode) {
            // Remove old pivot
            removePivotWrapper(pivot)
            pivot = undefined
          }
          
          // Create pivot wrapper with current mode if needed
          if (!pivot) {
            pivot = createPivotWrapper(resolvedObject, currentPivotMode)
            pivotWrappers.set(resolvedObject, pivot)
          }
          
          // Note: Camera framing is now only done on double-click, not on single-click selection
          // Single click: Just select the object, no camera movement
          // Double click: Select AND frame the object in the viewport
          
          if (activeTransformMode) {
            transformControls.setMode(activeTransformMode)
            // CRITICAL: Only attach if pivot is in scene graph
            // Check if pivot is in scene by checking if it has a parent
            if (pivot.parent !== null) {
              try {
                transformControls.attach(pivot) // Attach to pivot, not the model directly
              } catch (error) {
                console.warn(`[ViewerCanvas] Failed to attach transform controls to pivot:`, error)
              }
            }
          }
        } else if (resolvedObject instanceof THREE.Light) {
          const gizmo = lightToGizmo.get(resolvedObject) ?? null
          // CRITICAL: Check if the original object was a light helper
          const isHelperSelected = object && object.userData?.isLightHelper
          const helper = isHelperSelected ? object : null
          
          // Note: Camera framing for lights is now only done on double-click
          
          // Allow translate or rotate mode for lights (both modes are useful)
          // Default to translate if no mode is set
          const modeToUse = activeTransformMode || transformMode || 'translate'
          
          // Set transform mode if not already set
          // This ensures the useEffect will attach transform controls
          if (!transformMode && !activeTransformMode) {
            setTransformMode('translate')
          }
          
          // Initialize gizmo rotation based on light direction when attaching
          if (gizmo && (modeToUse === 'rotate')) {
            // Sync gizmo rotation with light direction for proper initial state
            if (resolvedObject instanceof THREE.DirectionalLight || resolvedObject instanceof THREE.SpotLight) {
              const lightDirection = computeLightDirection(resolvedObject)
              if (lightDirection) {
                const defaultDirection = new THREE.Vector3(0, -1, 0)
                _tempQuat.setFromUnitVectors(defaultDirection, lightDirection.normalize())
                gizmo.quaternion.copy(_tempQuat)
                gizmo.updateMatrixWorld()
              }
            } else if (resolvedObject instanceof THREE.RectAreaLight) {
              gizmo.quaternion.copy(resolvedObject.quaternion)
              gizmo.updateMatrixWorld()
            }
          }
          
          // Attach transform controls immediately (don't wait for useEffect)
          transformControls.setMode(modeToUse)
          
          // CRITICAL: If helper was selected, attach to helper instead of gizmo
          // This allows dragging the helper directly
          if (helper && helper.parent !== null) {
            try {
              transformControls.attach(helper)
              setLightGizmoSelected(gizmo, true, viewerRef.current?.camera, resolvedObject)
              currentSelectedLightGizmo = gizmo
            } catch (error) {
              console.warn(`[ViewerCanvas] Failed to attach transform controls to helper:`, error)
            }
          } else if (gizmo && gizmo.parent !== null) {
            // CRITICAL: Only attach if gizmo is in scene graph
            try {
              transformControls.attach(gizmo)
              setLightGizmoSelected(gizmo, true, viewerRef.current?.camera, resolvedObject)
              currentSelectedLightGizmo = gizmo
            } catch (error) {
              console.warn(`[ViewerCanvas] Failed to attach transform controls to gizmo:`, error)
            }
          } else if (resolvedObject.parent !== null) {
            // Fallback: attach directly to light if no gizmo exists or gizmo not in scene
            // CRITICAL: Only attach if light is in scene graph
            try {
              transformControls.attach(resolvedObject)
            } catch (error) {
              console.warn(`[ViewerCanvas] Failed to attach transform controls to light:`, error)
            }
          }
        }
      } else {
        // Clean up pivot wrapper when deselecting - get current selected from store
        const currentSelected = useAppStore.getState().selectedObject
        if (currentSelected) {
          const pivot = pivotWrappers.get(currentSelected)
          if (pivot) {
            removePivotWrapper(pivot)
          }
        }
        transformControls.detach()
        setSelectedObject(null)
        if (currentSelectedLightGizmo) {
          const light = gizmoToLight.get(currentSelectedLightGizmo) ?? null
          setLightGizmoSelected(currentSelectedLightGizmo, false, viewerRef.current?.camera, light)
          currentSelectedLightGizmo = null
        }
      }
    }
    
    const MARQUEE_MIN_DRAG = 12
    
    const hideMarqueeOverlay = () => {
      const overlay = marqueeOverlayRef.current
      if (overlay) {
        overlay.style.display = 'none'
      }
    }
    
    const updateMarqueeOverlay = (state: MarqueeState) => {
      const overlay = marqueeOverlayRef.current
      const container = containerRef.current
      if (!overlay || !container) return
      
      const rect = container.getBoundingClientRect()
      const left = Math.min(state.startX, state.currentX) - rect.left
      const top = Math.min(state.startY, state.currentY) - rect.top
      const width = Math.abs(state.currentX - state.startX)
      const height = Math.abs(state.currentY - state.startY)
      
      overlay.style.display = 'block'
      overlay.style.transform = `translate(${left}px, ${top}px)`
      overlay.style.width = `${width}px`
      overlay.style.height = `${height}px`
    }
    
    const clearMarqueeState = () => {
      marqueeStateRef.current = null
      hideMarqueeOverlay()
      if (controls) {
        controls.enabled = true
      }
    }
    
    const rectsOverlap = (a: ScreenRect, b: ScreenRect): boolean => {
      return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY)
    }
    
    const computeOverlapArea = (a: ScreenRect, b: ScreenRect): number => {
      const overlapWidth = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX))
      const overlapHeight = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY))
      return overlapWidth * overlapHeight
    }
    
    const computeScreenRectForObject = (object: THREE.Object3D, domRect: DOMRect): ScreenRect | null => {
      if (!camera) return null
      
      const box = new THREE.Box3().setFromObject(object)
      if (box.isEmpty()) {
        return null
      }
      
      camera.updateMatrixWorld()
      
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z)
      ]
      
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      
      for (const corner of corners) {
        const projected = corner.clone().project(camera)
        if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
          continue
        }
        const screenX = domRect.left + (projected.x + 1) * 0.5 * domRect.width
        const screenY = domRect.top + (-projected.y + 1) * 0.5 * domRect.height
        
        minX = Math.min(minX, screenX)
        minY = Math.min(minY, screenY)
        maxX = Math.max(maxX, screenX)
        maxY = Math.max(maxY, screenY)
      }
      
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null
      }
      
      return { minX, minY, maxX, maxY }
    }
    
    const gatherMarqueeTargets = (): THREE.Object3D[] => {
      const targets: THREE.Object3D[] = []
      scene.traverse((object) => {
        if (!object.visible) return
        if (object.userData?.isPivotWrapper) return
        if (object.userData?.isHelper) return
        if (object.userData?.isTransformControls) return
        if (object.userData?.isHotspot || object.userData?.isHotspotLabel || object.userData?.isHotspotLine) return
        if (object.userData?.isGridHelper || object.userData?.isAxesHelper) return
        if (object.userData?.isShadowPlane) return
        if (object.userData?.isPanel || object.userData?.isWidget) return
        
        if (object.userData?.isModel || object.userData?.isImportedModel) {
          targets.push(object)
        }
      })
      return targets
    }
    
    const performMarqueeSelection = (state: MarqueeState, fallbackSelect: () => void) => {
      if (!containerRef.current || !camera) {
        fallbackSelect()
        return
      }
      
      const containerRect = containerRef.current.getBoundingClientRect()
      const selectionRect: ScreenRect = {
        minX: Math.min(state.startX, state.currentX),
        minY: Math.min(state.startY, state.currentY),
        maxX: Math.max(state.startX, state.currentX),
        maxY: Math.max(state.startY, state.currentY)
      }
      
      const width = selectionRect.maxX - selectionRect.minX
      const height = selectionRect.maxY - selectionRect.minY
      if (width < MARQUEE_MIN_DRAG && height < MARQUEE_MIN_DRAG) {
        fallbackSelect()
        return
      }
      
      const candidates = gatherMarqueeTargets()
      let bestMatch: { object: THREE.Object3D; score: number } | null = null
      
      for (const candidate of candidates) {
        const objectRect = computeScreenRectForObject(candidate, containerRect)
        if (!objectRect) continue
        if (!rectsOverlap(selectionRect, objectRect)) continue
        
        const overlapArea = computeOverlapArea(selectionRect, objectRect)
        const objectArea = Math.max(1, (objectRect.maxX - objectRect.minX) * (objectRect.maxY - objectRect.minY))
        const coverageScore = overlapArea / objectArea
        
        if (!bestMatch || coverageScore > bestMatch.score) {
          bestMatch = { object: candidate, score: coverageScore }
        }
      }
      
      if (bestMatch) {
        const selected = bestMatch.object
        setTransformMode('translate')
        selectObject(selected)
        
        const pivot = pivotWrappers.get(selected)
        if (pivot) {
          updatePivotPosition(pivot, selected)
        }
      } else {
        fallbackSelect()
      }
    }
    
    // Click handler for object selection (single click - select only, no centering)
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current || !mouse || !camera || !raycaster) return
      
      // Don't select if clicking on transform controls
      if ((event.target as HTMLElement).closest('.three-transform-controls')) {
        return
      }

      // If double-click is pending, ignore single click
      if (doubleClickPendingRef.current) {
        doubleClickPendingRef.current = false
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current)
          clickTimeoutRef.current = null
        }
        return
      }

      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)

      // Check for hotspot clicks and hover first (before object selection)
      const hotspots = (window as any).__hotspots as Array<{ id: string; name: string; position: { x: number; y: number; z: number }; content: any }> | undefined
      const setActiveHotspot = (window as any).__setActiveHotspot as ((hotspot: any) => void) | undefined
      const setHoveredHotspotId = (window as any).__setHoveredHotspotId as ((id: string | null) => void) | undefined
      const updateHotspotPosition = (window as any).__updateHotspotPosition as ((id: string, position: { x: number; y: number; z: number }) => void) | undefined
      
      if (hotspots) {
        // Find hotspot sprites, groups, and helpers in scene (icons, labels, and helper spheres)
        const hotspotObjects: THREE.Object3D[] = []
        scene.traverse((obj) => {
          if (obj.userData.isHotspot || obj.userData.isHotspotLabel || obj.userData.isHotspotHelper) {
            hotspotObjects.push(obj)
          }
          // Also check for hotspot groups
          if (obj instanceof THREE.Group && obj.userData.isHotspot) {
            hotspotObjects.push(obj)
            // Add helper sphere if it exists
            if (obj.userData.hotspotHelper) {
              hotspotObjects.push(obj.userData.hotspotHelper)
            }
          }
        })
        
        if (hotspotObjects.length > 0) {
          const hotspotIntersects = raycaster.intersectObjects(hotspotObjects, false)
          
          // Update hover state with visual feedback
          if (setHoveredHotspotId) {
            if (hotspotIntersects.length > 0) {
              const hoveredObj = hotspotIntersects[0].object
              const hotspotId = hoveredObj.userData.hotspotId || (hotspots.find(h => (h as any).label?.text === hoveredObj.userData.labelText)?.id)
              setHoveredHotspotId(hotspotId || null)
              
              // Visual feedback: Scale up on hover for easier selection
              if (hoveredObj.userData.isHotspot) {
                let targetSprite: THREE.Sprite | null = null
                
                // Handle groups, helpers, and sprites
                if (hoveredObj instanceof THREE.Group && hoveredObj.userData.hotspotSprite) {
                  targetSprite = hoveredObj.userData.hotspotSprite
                } else if (hoveredObj.userData.isHotspotHelper && hoveredObj.userData.associatedSprite) {
                  targetSprite = hoveredObj.userData.associatedSprite
                } else if (hoveredObj instanceof THREE.Sprite && !hoveredObj.userData.isHotspotHelper) {
                  targetSprite = hoveredObj
                }
                
                if (targetSprite) {
                  const baseScale = targetSprite.userData.baseScale || 1.5
                  targetSprite.scale.setScalar(baseScale * 1.2) // 20% larger on hover
                }
              }
            } else {
              setHoveredHotspotId(null)
              
              // Reset all hotspot scales when not hovering
              hotspotObjects.forEach((obj) => {
                if (obj.userData.isHotspot) {
                  let targetSprite: THREE.Sprite | null = null
                  
                  if (obj instanceof THREE.Group && obj.userData.hotspotSprite) {
                    targetSprite = obj.userData.hotspotSprite
                  } else if (obj instanceof THREE.Sprite && !obj.userData.isHotspotHelper) {
                    targetSprite = obj
                  }
                  
                  if (targetSprite) {
                    const baseScale = targetSprite.userData.baseScale || 1.5
                    const isSelected = transformControls && (
                      (transformControls as any).object === obj || 
                      (transformControls as any).object === targetSprite ||
                      ((transformControls as any).object?.userData?.hotspotId === obj.userData.hotspotId)
                    )
                    targetSprite.scale.setScalar(isSelected ? baseScale * 1.3 : baseScale) // Keep selected ones slightly larger
                  }
                }
              })
            }
          }
          
          // Handle clicks on hotspots
          if (hotspotIntersects.length > 0) {
            const clickedHotspotObj = hotspotIntersects[0].object
            const hotspotId = clickedHotspotObj.userData.hotspotId || (hotspots.find(h => (h as any).label?.text === clickedHotspotObj.userData.labelText)?.id)
            const hotspot = hotspots.find(h => h.id === hotspotId)
            
            if (hotspot) {
              // Check if clicking on hotspot icon, helper, or group - allow selection for moving
              if (clickedHotspotObj.userData.isHotspot || clickedHotspotObj.userData.isHotspotHelper) {
                // Determine the actual hotspot object (group, sprite, or helper)
                let hotspotObjToSelect: THREE.Object3D = clickedHotspotObj
                
                // If clicking on helper sphere, select the group or sprite
                if (clickedHotspotObj.userData.isHotspotHelper) {
                  if (clickedHotspotObj.parent && clickedHotspotObj.parent.userData.isHotspot) {
                    hotspotObjToSelect = clickedHotspotObj.parent
                  } else if (clickedHotspotObj.userData.associatedSprite) {
                    hotspotObjToSelect = clickedHotspotObj.userData.associatedSprite
                  }
                } else if (clickedHotspotObj instanceof THREE.Group && clickedHotspotObj.userData.hotspotSprite) {
                  // If clicking on group, use the sprite for selection (easier for transform controls)
                  hotspotObjToSelect = clickedHotspotObj.userData.hotspotSprite || clickedHotspotObj
                }
                
                // Visual feedback: Scale up when selected
                let targetSprite: THREE.Sprite | null = null
                if (hotspotObjToSelect instanceof THREE.Group && hotspotObjToSelect.userData.hotspotSprite) {
                  targetSprite = hotspotObjToSelect.userData.hotspotSprite
                } else if (hotspotObjToSelect instanceof THREE.Sprite) {
                  targetSprite = hotspotObjToSelect
                }
                
                if (targetSprite) {
                  const baseScale = targetSprite.userData.baseScale || 1.5
                  targetSprite.scale.setScalar(baseScale * 1.3) // 30% larger when selected
                }
                
                // Select the hotspot object (use sprite for transform controls, or group if sprite doesn't exist)
                const objectForTransform = targetSprite || hotspotObjToSelect
                
                console.log('[ViewerCanvas] Clicking hotspot icon:', {
                  hotspotId: objectForTransform.userData.hotspotId,
                  hotspotName: hotspot.name,
                  position: objectForTransform.position,
                  hasParent: !!objectForTransform.parent,
                  inScene: scene.children.includes(objectForTransform) || false,
                  objectType: objectForTransform.type
                })
                
                useAppStore.getState().setSelectedObject(objectForTransform)
                // Also open popup if clicking
                if (setActiveHotspot) {
                  setActiveHotspot(hotspot)
                }
                console.log('[ViewerCanvas] Hotspot selected for moving:', hotspot.name)
                return // Don't select other objects when clicking hotspot icon
              } else if (clickedHotspotObj.userData.isHotspotLabel) {
                // Clicking label - check if popup should show on click
                const showOnClick = hotspot.content?.popupSettings?.showOnClick
                if (showOnClick && setActiveHotspot) {
                  setActiveHotspot(hotspot)
                  console.log('[ViewerCanvas] Hotspot label clicked - opening popup:', hotspot.name)
                } else {
                  // Just select the hotspot marker for moving if showOnClick is false
                  const markerObj = scene.children.find((obj: THREE.Object3D) => 
                    obj.userData.isHotspot && obj.userData.hotspotId === hotspot.id
                  )
                  if (markerObj) {
                    useAppStore.getState().setSelectedObject(markerObj)
                    console.log('[ViewerCanvas] Hotspot label clicked - selecting marker:', hotspot.name)
                  }
                }
                return
              }
            }
          }
        } else if (setHoveredHotspotId) {
          setHoveredHotspotId(null)
        }
      }

      // Check if color picker mode is active - if so, include ALL meshes (not just models)
      const colorPickerMode = useAppStore.getState().colorPickerMode
      const subObjectSelectionMode = useAppStore.getState().subObjectSelectionMode
      
      // Get all selectable objects (models, lights, hotspot markers, and hotspot endpoints for moving, not helpers)
      const selectableObjects: THREE.Object3D[] = []
      const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
      scene.traverse((obj) => {
        if (obj instanceof THREE.Object3D && obj !== attachedObject) {
          // Exclude helpers, preview polygons, hotspot labels, and hotspot lines from selection
          // But include hotspot markers and endpoints so they can be selected and moved
          if (obj.userData.isHelper || obj.userData.isPolygonPreview || obj.userData.isHotspotLabel || obj.userData.isHotspotLine) {
            return
          }
          // Include hotspot markers for selection and moving
          if (obj.userData.isHotspot) {
            selectableObjects.push(obj)
            return
          }
          // Include hotspot endpoints for selection and moving
          if (obj.userData.isHotspotEndpoint) {
            selectableObjects.push(obj)
            return
          }
          
          // For sub-object selection mode, include ALL meshes (to select parts like car doors, primitives, etc.)
          if (subObjectSelectionMode && obj instanceof THREE.Mesh) {
            if (obj.userData.isDynamicSky) return
            // Include any mesh for sub-object selection (parts of models, primitives, etc.)
            selectableObjects.push(obj)
            return
          }
          
          // For color picker mode, include ALL meshes (to pick colors from any object)
          if (colorPickerMode && obj instanceof THREE.Mesh) {
            if (obj.userData.isDynamicSky) return
            // Include any mesh for color picking
            selectableObjects.push(obj)
            return
          }
          
          // Sky / weather volumes surround the camera — never selectable (blocks orbit navigation)
          if (obj.userData.isDynamicSky) {
            return
          }

          // Include models and lights (directional, ambient, etc.)
          // CRITICAL: Also include light helpers so they can be selected and dragged
          if (
            obj.userData.isModel ||
            obj instanceof THREE.Light ||
            obj.userData.isLightGizmo ||
            obj.userData.isLightHelper
          ) {
            selectableObjects.push(obj)
          }
        }
      })

      const intersects = raycaster.intersectObjects(selectableObjects, true)

      if (intersects.length > 0) {
        const intersected = intersects[0].object
        
        // Check if sub-object selection mode is active - handle sub-object/part selection
        if (subObjectSelectionMode && intersected instanceof THREE.Mesh) {
          const selectedSubObjects = useAppStore.getState().selectedSubObjects
          const setSelectedSubObjects = useAppStore.getState().setSelectedSubObjects
          
          // Check if Ctrl/Cmd is held for multi-select
          const isMultiSelect = event.ctrlKey || event.metaKey
          
          if (isMultiSelect) {
            // Multi-select: toggle selection
            const index = selectedSubObjects.findIndex(obj => obj.id === intersected.id)
            if (index >= 0) {
              // Deselect
              const filtered = selectedSubObjects.filter(obj => obj.id !== intersected.id)
              setSelectedSubObjects(filtered)
            } else {
              // Add to selection
              setSelectedSubObjects([...selectedSubObjects, intersected])
            }
          } else {
            // Single select: replace selection
            setSelectedSubObjects([intersected])
          }
          
          console.log(`[SubObjectSelection] Selected ${isMultiSelect ? 'added/removed' : 'set'}: ${intersected.name || 'Unnamed'}, total selected: ${useAppStore.getState().selectedSubObjects.length}`)
          return // Don't select object when in sub-object selection mode
        }
        
        // Check if polygon drawing is enabled - if so, handle polygon point addition OR control point editing
        const polygonDrawingEnabled = useAppStore.getState().polygonDrawingEnabled
        if (polygonDrawingEnabled) {
          // First check if clicking on a control point for editing
          const allObjects: THREE.Object3D[] = []
          scene.traverse((obj) => {
            if (obj.userData.isControlPoint || obj.userData.isPolygonPreview) {
              allObjects.push(obj)
            }
          })
          
          const controlPointIntersects = raycaster.intersectObjects(allObjects, false)
          
          if (controlPointIntersects.length > 0) {
            const clickedObj = controlPointIntersects[0].object
            if (clickedObj.userData.isControlPoint && typeof clickedObj.userData.controlPointIndex === 'number') {
              // Control point clicked - notify polygon panel to start editing
              const startControlPointEdit = (window as any).__startControlPointEdit as ((index: number, worldPos: THREE.Vector3) => void) | undefined
              if (startControlPointEdit) {
                startControlPointEdit(clickedObj.userData.controlPointIndex, clickedObj.position.clone())
              }
              return // Don't add new point or select object
            }
          }
          
          // Not clicking on control point - add new point
          // Call polygon drawing handler if available
          const polygonHandler = (window as any).__polygonDrawingHandler
          if (polygonHandler) {
            polygonHandler(event)
          }
          return // Skip other click handlers
        }
        
        // Face edit mode is handled in mousedown, not click
        // This allows us to track dragging properly
        
        // Check if color picker mode is active - if so, pick color from clicked object
        // Note: colorPickerMode is already checked above for selectableObjects
        const paintMode = useAppStore.getState().paintMode
        const selectedMaterial = useAppStore.getState().selectedMaterial
        
        // CRITICAL: Ensure mutual exclusivity - color picker takes absolute priority over paint mode
        // Disable paint mode immediately if color picker is active to prevent conflicts
        if (colorPickerMode && paintMode) {
          console.warn('[ViewerCanvas] Both paint mode and color picker are active - disabling paint mode immediately')
          useAppStore.getState().setPaintMode(false)
        }
        
        // CRITICAL: Color picker must be checked FIRST and return early to prevent object selection
        if (colorPickerMode) {
          if (!(intersected instanceof THREE.Mesh)) {
            console.warn('[ViewerCanvas] ⚠️ Color picker: Clicked object is not a mesh:', intersected.constructor.name)
            return // Don't select object when picking color
          }
          
          // If no material is selected, allow selecting material from clicked object to start color picking
          if (!selectedMaterial) {
            // Select material from clicked object so user can start color picking
            const clickedMaterial = intersected.material
            if (clickedMaterial) {
              const store = useAppStore.getState()
              let newSelectedMaterial
              
              if (Array.isArray(clickedMaterial)) {
                const faceIndex = intersects[0].faceIndex ?? 0
                const matIndex = Math.floor(faceIndex / 2)
                const mat = clickedMaterial[Math.min(matIndex, clickedMaterial.length - 1)]
                newSelectedMaterial = {
                  mesh: intersected,
                  material: mat,
                  index: matIndex
                }
              } else {
                newSelectedMaterial = {
                  mesh: intersected,
                  material: clickedMaterial
                }
              }
              
              store.setSelectedMaterial(newSelectedMaterial)
              
              // Auto-open material panel if it's closed so user can see the selected material
              if (!store.showMaterialPanel) {
                store.toggleMaterialPanel()
              }
              
              console.log('[ViewerCanvas] ✅ Selected material from clicked object for color picking:', {
                objectName: intersected.name || 'Unnamed',
                materialType: newSelectedMaterial.material?.constructor?.name,
                materialPanelOpened: !store.showMaterialPanel
              })
            }
            return // Don't select object, just select material
          }
          
          // Material is selected - pick color from clicked object and apply to selected material
          try {
            const clickedMaterial = intersected.material
            let sourceColor: THREE.Color | null = null
            
            // Get color from clicked material
            if (Array.isArray(clickedMaterial)) {
              const faceIndex = intersects[0].faceIndex ?? 0
              const matIndex = Math.floor(faceIndex / 2)
              const mat = clickedMaterial[Math.min(matIndex, clickedMaterial.length - 1)]
              if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
                sourceColor = mat.color.clone()
              }
            } else if (clickedMaterial && 'color' in clickedMaterial && clickedMaterial.color instanceof THREE.Color) {
              sourceColor = clickedMaterial.color.clone()
            } else {
              console.warn('[ViewerCanvas] ⚠️ Color picker: Material does not have a color property:', {
                materialType: clickedMaterial?.constructor?.name,
                hasMaterial: !!clickedMaterial,
                objectName: intersected.name || 'Unnamed'
              })
            }
            
            if (sourceColor) {
              // Get the selected material (this is the material we want to change)
              const targetMaterial = selectedMaterial.material
              const previousColor = targetMaterial && 'color' in targetMaterial && targetMaterial.color instanceof THREE.Color
                ? targetMaterial.color.clone()
                : null
              
              // CRITICAL: Check if the target material is shared (used by multiple meshes)
              // If it is, we need to clone it to avoid changing other objects
              let materialToModify = targetMaterial
              let needsClone = false
              
              // Check if this material is used by other meshes
              if (selectedMaterial.mesh) {
                let usageCount = 0
                scene.traverse((obj) => {
                  if (obj instanceof THREE.Mesh) {
                    if (Array.isArray(obj.material)) {
                      if (obj.material.includes(targetMaterial)) {
                        usageCount++
                      }
                    } else if (obj.material === targetMaterial) {
                      usageCount++
                    }
                  }
                })
                
                // If material is used by more than one mesh, clone it before modifying
                if (usageCount > 1) {
                  needsClone = true
                  console.log('[ViewerCanvas] ⚠️ Material is shared by multiple meshes - cloning before color change to prevent affecting other objects')
                }
              }
              
              // Clone material if needed
              if (needsClone && targetMaterial) {
                materialToModify = targetMaterial.clone()
                // Apply cloned material to the selected mesh
                if (Array.isArray(selectedMaterial.mesh.material)) {
                  const materials = [...selectedMaterial.mesh.material] as THREE.Material[]
                  const index = selectedMaterial.index ?? 0
                  materials[index] = materialToModify
                  selectedMaterial.mesh.material = materials
                } else {
                  selectedMaterial.mesh.material = materialToModify
                }
                // Update selectedMaterial reference
                useAppStore.getState().setSelectedMaterial({
                  mesh: selectedMaterial.mesh,
                  material: materialToModify,
                  index: selectedMaterial.index
                })
              }
              
              // Apply color to selected material (now guaranteed to be unique)
              if (materialToModify && 'color' in materialToModify && materialToModify.color instanceof THREE.Color) {
                materialToModify.color.copy(sourceColor)
                materialToModify.needsUpdate = true
                
                // Update material properties if it's PBR
                if (materialToModify instanceof THREE.MeshStandardMaterial || 
                    materialToModify instanceof THREE.MeshPhysicalMaterial) {
                  materialToModify.needsUpdate = true
                }
                
                // Add to undo stack
                if (previousColor) {
                  const { addToUndoStack } = useAppStore.getState()
                  addToUndoStack({
                    type: 'material-change',
                    material: materialToModify,
                    property: 'color',
                    previousValue: previousColor,
                    newValue: sourceColor.clone()
                  } as any)
                }
                
                console.log('[ViewerCanvas] ✅ Copied color to material:', {
                  from: intersected.name || 'Unnamed',
                  fromType: intersected.constructor.name,
                  to: selectedMaterial.mesh?.name || 'Unnamed',
                  color: `#${sourceColor.getHexString()}`,
                  colorRGB: `rgb(${Math.round(sourceColor.r * 255)}, ${Math.round(sourceColor.g * 255)}, ${Math.round(sourceColor.b * 255)})`,
                  materialCloned: needsClone
                })
              } else {
                console.warn('[ViewerCanvas] ⚠️ Color picker: Target material does not support color property:', {
                  hasMaterial: !!materialToModify,
                  materialType: materialToModify?.constructor?.name
                })
              }
            } else {
              console.warn('[ViewerCanvas] ⚠️ Color picker: Could not extract color from clicked object:', {
                objectName: intersected.name || 'Unnamed',
                objectType: intersected.constructor.name,
                hasMaterial: !!clickedMaterial,
                materialType: clickedMaterial?.constructor?.name
              })
            }
          } catch (error) {
            console.error('[ViewerCanvas] ❌ Failed to pick color:', error)
          }
          
          // CRITICAL: Return early to prevent object selection AND paint mode
          // Color picker should ONLY pick color, not select objects or paint
          return
        }
        
        // CRITICAL: Paint mode check - only runs if color picker was NOT active (already returned above)
        // Double-check paint mode state to ensure it wasn't enabled after color picker check
        const currentPaintMode = useAppStore.getState().paintMode
        if (currentPaintMode && !colorPickerMode) {
          if (currentPaintMode && selectedMaterial && intersected instanceof THREE.Mesh) {
          // Paint mode: Apply selected material to clicked mesh
          const sourceMaterial = selectedMaterial.material
          
          try {
            // Save previous material for undo
            const previousMaterial = intersected.material instanceof THREE.Material
              ? intersected.material.clone()
              : Array.isArray(intersected.material)
                ? (intersected.material as THREE.Material[]).map(mat => mat.clone())
                : null
            
            // Clone the material to avoid sharing references
            const clonedMaterial = sourceMaterial.clone()
            
            // CRITICAL: Explicitly copy all PBR material properties to ensure they're preserved
            // Three.js clone() should copy these, but we verify to prevent issues
            if (sourceMaterial instanceof THREE.MeshStandardMaterial || sourceMaterial instanceof THREE.MeshPhysicalMaterial) {
              const sourcePBR = sourceMaterial as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
              const clonedPBR = clonedMaterial as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
              
              // Copy standard PBR properties
              clonedPBR.metalness = sourcePBR.metalness
              clonedPBR.roughness = sourcePBR.roughness
              clonedPBR.envMapIntensity = sourcePBR.envMapIntensity
              
              // Copy Physical Material specific properties
              if (sourcePBR instanceof THREE.MeshPhysicalMaterial && clonedPBR instanceof THREE.MeshPhysicalMaterial) {
                clonedPBR.clearcoat = sourcePBR.clearcoat
                clonedPBR.clearcoatRoughness = sourcePBR.clearcoatRoughness
                clonedPBR.ior = sourcePBR.ior
                clonedPBR.transmission = sourcePBR.transmission
                clonedPBR.thickness = sourcePBR.thickness
                clonedPBR.sheen = sourcePBR.sheen
                clonedPBR.sheenRoughness = sourcePBR.sheenRoughness
                if (sourcePBR.sheenColor && clonedPBR.sheenColor) {
                  clonedPBR.sheenColor.copy(sourcePBR.sheenColor)
                }
              }
            }
            
            // CRITICAL: Copy texture properties (repeat, offset, rotation, wrapS, wrapT) for all textures
            // Three.js material.clone() shares texture references, so we need to ensure texture properties are copied
            const texturePropertyNames = [
              'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
              'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
              'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
              'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
              'specularIntensityMap', 'specularColorMap'
            ]
            
            texturePropertyNames.forEach(propName => {
              const sourceTexture = (sourceMaterial as any)[propName] as THREE.Texture | undefined
              const clonedTexture = (clonedMaterial as any)[propName] as THREE.Texture | undefined
              
              if (sourceTexture && sourceTexture instanceof THREE.Texture && clonedTexture && clonedTexture instanceof THREE.Texture) {
                // Copy texture transformation properties
                clonedTexture.repeat.copy(sourceTexture.repeat)
                clonedTexture.offset.copy(sourceTexture.offset)
                clonedTexture.rotation = sourceTexture.rotation
                clonedTexture.wrapS = sourceTexture.wrapS
                clonedTexture.wrapT = sourceTexture.wrapT
                clonedTexture.center.copy(sourceTexture.center)
                
                // CRITICAL: Ensure wrapping mode is set correctly for repeat to work
                // If repeat is not 1, use RepeatWrapping so textures tile properly
                if (clonedTexture.repeat.x !== 1 || clonedTexture.repeat.y !== 1) {
                  clonedTexture.wrapS = THREE.RepeatWrapping
                  clonedTexture.wrapT = THREE.RepeatWrapping
                }
                
                clonedTexture.needsUpdate = true
              }
            })
            
            // If target has multiple materials, apply to all or just the clicked face
            if (Array.isArray(intersected.material)) {
              // For multi-material meshes, determine which material slot to update
              const faceIndex = intersects[0].faceIndex ?? 0
              const matIndex = Math.floor(faceIndex / 2) // Approximate material index
              const materials = [...intersected.material] as THREE.Material[]
              materials[Math.min(matIndex, materials.length - 1)] = clonedMaterial
              intersected.material = materials
            } else {
              // Single material - replace it
              intersected.material = clonedMaterial
            }
            
            // Preserve shadow properties
            intersected.castShadow = intersected.castShadow
            intersected.receiveShadow = intersected.receiveShadow
            
            // Update material needs update flag
            clonedMaterial.needsUpdate = true
            
            // Add to undo stack
            if (previousMaterial) {
              const { addToUndoStack } = useAppStore.getState()
              addToUndoStack({
                type: 'material-change',
                mesh: intersected,
                previousMaterial,
                newMaterial: intersected.material instanceof THREE.Material ? intersected.material : null
              } as any)
            }
            
            console.log('[ViewerCanvas] ✅ Applied material to object:', intersected.name || 'Unnamed')
          } catch (error) {
            console.error('[ViewerCanvas] Failed to apply material:', error)
          }
          
          return // Don't select object when painting
          }
        }
        
        // Check if material editor is open - if so, clicking selects material instead of object
        // BUT: Only if color picker and paint mode are NOT active (they take priority)
        // Material pick mode is activated by Ctrl/Cmd click OR when material panel is open (without color picker/paint mode)
        const showMaterialPanel = useAppStore.getState().showMaterialPanel
        const isMaterialPickMode = (event.ctrlKey || event.metaKey) || (showMaterialPanel && !colorPickerMode && !paintMode)
        
        if (isMaterialPickMode) {
          // Select material
          if (intersected instanceof THREE.Mesh && intersected.material) {
            const material = intersected.material
            if (Array.isArray(material)) {
              // Multiple materials - use the intersected face index if available
              const faceIndex = intersects[0].faceIndex ?? 0
              const matIndex = Math.floor(faceIndex / 2) // Approximate material index
              const selectedMat = material[Math.min(matIndex, material.length - 1)]
              useAppStore.getState().setSelectedMaterial({
                mesh: intersected,
                material: selectedMat,
                index: matIndex
              })
            } else {
              useAppStore.getState().setSelectedMaterial({
                mesh: intersected,
                material: material
              })
            }
          }
          // Don't select object when picking material
          return
        } else {
          // Check if intersected is a light directly
          let selected: THREE.Object3D | null = null
          if (intersected.userData?.isLightGizmo) {
            selected = gizmoToLight.get(intersected) ?? null
          } else if (intersected instanceof THREE.Light) {
            selected = intersected
          } else {
            // Find the top-level model object
            selected = intersected
            while (selected && !selected.userData.isModel) {
              selected = selected.parent as THREE.Object3D
            }
            if (!selected || !selected.userData.isModel) {
              selected = null
            }
          }
          
          if (selected) {
            // Single click: select and center
            // Don't automatically set transform mode - let user decide
            // Transform mode will be set when user clicks transform buttons in toolbar
            selectObject(selected)
          }
        }
      } else {
        // Clicked on empty space - deselect only if we have a selected object
        // But only if we're sure it's a single click (not a double-click)
        const currentSelected = useAppStore.getState().selectedObject
        if (currentSelected) {
          // Clear any existing timeout
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current)
          }
          // Use a delay to check if double-click will follow
          clickTimeoutRef.current = setTimeout(() => {
            if (!doubleClickPendingRef.current && currentSelected === useAppStore.getState().selectedObject) {
              useAppStore.getState().setSelectedObject(null)
              setTransformMode(null)
            }
            clickTimeoutRef.current = null
          }, 250) // Typical double-click delay is 300ms, so 250ms is safe
        }
      }
    }

    // Double click handler for object selection and centering
    const handleDoubleClick = (event: MouseEvent) => {
      if (!containerRef.current || !mouse || !camera || !raycaster) return
      
      // Don't select if clicking on transform controls
      if ((event.target as HTMLElement).closest('.three-transform-controls')) {
        return
      }

      // Clear any pending click timeout
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
        clickTimeoutRef.current = null
      }

      // Mark that double-click is happening to prevent single-click handler from deselecting
      doubleClickPendingRef.current = true

      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)

      // Get all selectable objects (models and lights, including light helpers for dragging)
      const selectableObjects: THREE.Object3D[] = []
      const attachedObject = (transformControls as any).object as THREE.Object3D | undefined
      scene.traverse((obj) => {
        if (obj instanceof THREE.Object3D && obj !== attachedObject) {
          if (obj.userData.isDynamicSky) {
            return
          }
          // Include models and lights (directional, ambient, etc.)
          // CRITICAL: Also include light helpers so they can be selected and dragged
          if (
            obj.userData.isModel ||
            obj instanceof THREE.Light ||
            obj.userData.isLightGizmo ||
            obj.userData.isLightHelper
          ) {
            selectableObjects.push(obj)
          }
        }
      })

      const intersects = raycaster.intersectObjects(selectableObjects, true)

      if (intersects.length > 0) {
        // Check if intersected is a light directly
        let selected: THREE.Object3D | null = null
        if (intersects[0].object.userData?.isLightGizmo) {
          selected = gizmoToLight.get(intersects[0].object) ?? null
        } else if (intersects[0].object.userData?.isLightHelper) {
          // CRITICAL: Resolve light helper to its associated light
          selected = helperToLight.get(intersects[0].object) ?? null
        } else if (intersects[0].object instanceof THREE.Light) {
          selected = intersects[0].object
        } else {
          // Find the top-level model object
          selected = intersects[0].object
          while (selected && !selected.userData.isModel) {
            selected = selected.parent as THREE.Object3D
          }
          if (!selected || !selected.userData.isModel) {
            selected = null
          }
        }
        
        if (selected) {
          const isLight = selected instanceof THREE.Light
          const isModel = selected.userData?.isModel
          
          // Double-click: Enable transform controls and frame the object
          // For lights, always enable translate mode to allow moving them around
          if (isLight) {
            // Force translate mode for lights on double-click (this ensures transform controls are shown)
            setTransformMode('translate')
            
            // Select the light - this will set up transform controls via selectObject
            // selectObject will attach transform controls to the gizmo or light
            selectObject(selected)
            
            // Get the gizmo from the closure to ensure we have the right reference
            const gizmo = lightToGizmo.get(selected as THREE.Light) ?? null
            const cameraRef = viewerRef.current?.camera
            
            // Frame the object (gizmo if it exists, otherwise the light)
            if (gizmo) {
              frameObject(gizmo)
            } else {
              frameObject(selected)
            }
          } else if (isModel) {
            // For models, set transform mode if not set, then select and frame
            const storeMode = useAppStore.getState().transformMode
            if (!storeMode) {
              setTransformMode('translate')
            }
            
            selectObject(selected)
            
            // Frame the pivot wrapper if it exists, otherwise frame the model directly
            const pivot = viewerRef.current?.pivotWrappers?.get(selected) as THREE.Group | undefined
            const objectToFrame = pivot || selected
            frameObject(objectToFrame)
          }
        }
      }
      
      // Reset double-click flag after a delay
      setTimeout(() => {
        doubleClickPendingRef.current = false
      }, 300)
    }

    const handleMarqueeDrag = (event: MouseEvent) => {
      const state = marqueeStateRef.current
      if (!state) return
      
      state.currentX = event.clientX
      state.currentY = event.clientY
      
      if (!state.active) {
        const dx = Math.abs(state.currentX - state.startX)
        const dy = Math.abs(state.currentY - state.startY)
        if (dx > 4 || dy > 4) {
          state.active = true
          if (controls) {
            controls.enabled = false
          }
        }
      }
      
      if (state.active) {
        updateMarqueeOverlay(state)
        event.preventDefault()
        event.stopPropagation()
      }
    }
    
    function detachMarqueeListeners() {
      window.removeEventListener('mousemove', handleMarqueeDrag, true)
      window.removeEventListener('mouseup', handleMarqueeMouseUp, true)
    }
    
    function handleMarqueeMouseUp(event: MouseEvent) {
      const state = marqueeStateRef.current
      if (!state) return
      
      const stateSnapshot: MarqueeState = { ...state }
      const wasActive = state.active
      
      clearMarqueeState()
      detachMarqueeListeners()
      
      if (wasActive) {
        skipClickAfterMarqueeRef.current = true
        performMarqueeSelection(stateSnapshot, () => handleClick(event))
      }
    }
    
    const attachMarqueeListeners = () => {
      window.addEventListener('mousemove', handleMarqueeDrag, true)
      window.addEventListener('mouseup', handleMarqueeMouseUp, true)
    }
    
    // ========================================
    // MOUSE INTERACTION - Object Selection
    // ========================================
    // Strategy: Track mouse down position, only handle clicks (not drags)
    // OrbitControls automatically handles all drag operations
    // Click event only fires after a true click (not a drag)
    
    let mouseDownInfo: { x: number; y: number; time: number } | null = null
    
    const handleMouseDownForSelection = (event: MouseEvent) => {
      // Check if polygon drawing is enabled and we're clicking on a control point
      const polygonDrawingEnabled = useAppStore.getState().polygonDrawingEnabled
      if (polygonDrawingEnabled && mouse && camera && raycaster) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
          
          raycaster.setFromCamera(mouse, camera)
          
          // Check for control points
          const allObjects: THREE.Object3D[] = []
          scene.traverse((obj) => {
            if (obj.userData.isControlPoint || obj.userData.isPolygonPreview) {
              allObjects.push(obj)
            }
          })
          
          const controlPointIntersects = raycaster.intersectObjects(allObjects, false)
          
          if (controlPointIntersects.length > 0) {
            const clickedObj = controlPointIntersects[0].object
            if (clickedObj.userData.isControlPoint && typeof clickedObj.userData.controlPointIndex === 'number') {
              // Control point clicked - notify polygon panel (it will handle dragging)
              const startControlPointEdit = (window as any).__startControlPointEdit as ((index: number, worldPos: THREE.Vector3) => void) | undefined
              if (startControlPointEdit) {
                startControlPointEdit(clickedObj.userData.controlPointIndex, clickedObj.position.clone())
                // Don't prevent default - let the polygon panel's mousedown handler start the drag
                // This allows for better separation of concerns
              }
            }
          }
        }
      }
      // Only track left mouse button for object selection
      if (event.button === 0) {
        // CRITICAL: Skip face edit mode if color picker, paint mode, or sub-object selection is active (these take priority)
        const colorPickerMode = useAppStore.getState().colorPickerMode
        const paintMode = useAppStore.getState().paintMode
        const subObjectSelectionMode = useAppStore.getState().subObjectSelectionMode
        
        if (colorPickerMode || paintMode || subObjectSelectionMode) {
          // These modes are active - don't interfere with face edit mode checks
          // Just set mouseDownInfo and return to allow click event to fire
          mouseDownInfo = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now()
          }
          return // Exit early to allow click event to fire
        }
        
        // Check if face edit mode is active - handle face selection on mousedown
        const faceEditMode = useAppStore.getState().faceEditMode
        const selectedObject = useAppStore.getState().selectedObject
        
        if (faceEditMode && selectedObject && selectedObject.userData?.isPrimitive && selectedObject instanceof THREE.Mesh) {
          // Calculate mouse position for raycasting
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect && camera && raycaster) {
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
            
            raycaster.setFromCamera(mouse, camera)
            
            // Check if clicking on the selected primitive
            const intersects = raycaster.intersectObject(selectedObject, false)
            
            if (intersects.length > 0 && intersects[0].object === selectedObject) {
              // Check if this is a box primitive before importing
              const isBoxPrimitive = selectedObject.userData?.isPrimitive && 
                                     selectedObject.userData?.primitiveType === 'box' &&
                                     (selectedObject.geometry.type === 'BoxGeometry' || 
                                      selectedObject.geometry.constructor.name === 'BoxGeometry')
              
              if (!isBoxPrimitive) {
                console.log('[FaceEdit] Selected object is not a box primitive:', {
                  isPrimitive: selectedObject.userData?.isPrimitive,
                  primitiveType: selectedObject.userData?.primitiveType,
                  geometryType: selectedObject.geometry.type,
                  geometryConstructor: selectedObject.geometry.constructor.name
                })
                return
              }
              
              // Import face extrusion utilities dynamically
              import('../utils/faceExtrusion').then(({ getBoxFace }) => {
                // For box primitives, detect which face was clicked
                const faceName = getBoxFace(intersects[0], selectedObject)
                if (faceName) {
                  // Store face info for dragging
                  ;(window as any).__faceEditInfo = {
                    mesh: selectedObject,
                    faceName,
                    startDistance: 0,
                    startPoint: intersects[0].point.clone(),
                    originalStartPoint: intersects[0].point.clone(), // Store for distance calculation
                    originalGeometry: selectedObject.geometry.clone(),
                    originalPosition: selectedObject.position.clone(),
                    originalParams: null // Will be set in handleFaceDrag
                  }
                  
                  // Disable transform controls temporarily
                  if (transformControls) {
                    transformControls.detach()
                  }
                  
                  // Disable OrbitControls temporarily to allow face dragging
                  // Access controls from the closure scope where it's defined
                  if (controls) {
                    controls.enabled = false
                  }
                  
                  // Start drag tracking
                  ;(window as any).__faceEditDragActive = true
                  console.log(`[FaceEdit] Selected ${faceName} face for extrusion`)
                  
                  // Prevent default to stop OrbitControls
                  event.preventDefault()
                  event.stopPropagation()
                  return
                } else {
                  console.log('[FaceEdit] Could not determine face name from intersection')
                }
              }).catch((error) => {
                console.error('[FaceEdit] Failed to load face extrusion utilities:', error)
              })
            }
          }
        }
        
        // CRITICAL: Skip endpoint/panel dragging if color picker mode is active
        // Color picker needs clicks to work, not dragging
        const colorPickerModeForDrag = useAppStore.getState().colorPickerMode
        if (colorPickerModeForDrag) {
          // Color picker is active - don't start dragging, allow clicks to work
          mouseDownInfo = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now()
          }
          return // Exit early to allow click event to fire
        }
        
        // Check if clicking on hotspot endpoint for dragging
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect && camera && raycaster) {
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
          
          raycaster.setFromCamera(mouse, camera)
          
          // Get all hotspot endpoints
          const endpointObjects: THREE.Object3D[] = []
          scene.traverse((obj) => {
            if (obj.userData.isHotspotEndpoint) {
              endpointObjects.push(obj)
            }
          })
          
          if (endpointObjects.length > 0) {
            const endpointIntersects = raycaster.intersectObjects(endpointObjects, false)
            
            if (endpointIntersects.length > 0) {
              const clickedEndpoint = endpointIntersects[0].object
              const hotspotId = clickedEndpoint.userData.hotspotId
              
              if (hotspotId) {
                // Store endpoint drag info
                const endpointWorldPos = new THREE.Vector3()
                clickedEndpoint.getWorldPosition(endpointWorldPos)
                
                ;(window as any).__endpointDragInfo = {
                  endpoint: clickedEndpoint,
                  hotspotId: hotspotId,
                  startPosition: endpointWorldPos.clone(),
                  startMousePos: new THREE.Vector2(event.clientX, event.clientY),
                  plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), // Will be set based on camera view
                  dragging: true
                }
                
                // Disable transform controls temporarily
                if (transformControls) {
                  transformControls.detach()
                }
                
                // Disable OrbitControls temporarily to allow endpoint dragging
                if (controls) {
                  controls.enabled = false
                }
                
                // Set up dragging plane based on camera direction
                if ((camera as any) instanceof THREE.PerspectiveCamera || (camera as any) instanceof THREE.OrthographicCamera) {
                  const cameraDirection = new THREE.Vector3()
                  camera.getWorldDirection(cameraDirection)
                  // Create plane perpendicular to camera direction
                  ;(window as any).__endpointDragInfo.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                    cameraDirection,
                    endpointWorldPos
                  )
                }
                
                console.log('[ViewerCanvas] Started dragging hotspot endpoint:', hotspotId)
                
                // Prevent default to stop OrbitControls
                event.preventDefault()
                event.stopPropagation()
                return
              }
            }
          }
          
          // Check for panel dragging (only if panel objects exist)
          const panelObjects: THREE.Object3D[] = [] // Panel objects array - add panel objects here if needed
          if (panelObjects && panelObjects.length > 0) {
            const panelIntersects = raycaster.intersectObjects(panelObjects, false)
            
            if (panelIntersects.length > 0) {
              const clickedPanel = panelIntersects[0].object
              const hotspotId = clickedPanel.userData.hotspotId
              
              if (hotspotId) {
                // Store panel drag info
                const panelWorldPos = new THREE.Vector3()
                clickedPanel.getWorldPosition(panelWorldPos)
                
                ;(window as any).__panelDragInfo = {
                  panel: clickedPanel,
                  hotspotId: hotspotId,
                  startPosition: panelWorldPos.clone(),
                  startMousePos: new THREE.Vector2(event.clientX, event.clientY),
                  plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
                  dragging: true
                }
                
                // Disable transform controls temporarily
                if (transformControls) {
                  transformControls.detach()
                }
                
                // Disable OrbitControls temporarily to allow panel dragging
                if (controls) {
                  controls.enabled = false
                }
                
                // Set up dragging plane based on camera direction
                if ((camera as any) instanceof THREE.PerspectiveCamera || (camera as any) instanceof THREE.OrthographicCamera) {
                  const cameraDirection = new THREE.Vector3()
                  camera.getWorldDirection(cameraDirection)
                  // Create plane perpendicular to camera direction
                  ;(window as any).__panelDragInfo.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                    cameraDirection,
                    panelWorldPos
                  )
                }
                
                console.log('[ViewerCanvas] Started dragging hotspot panel:', hotspotId)
                
                // Prevent default to stop OrbitControls
                event.preventDefault()
                event.stopPropagation()
                return
              }
            }
          }
        }
        
        const canStartMarqueeSelection =
          event.shiftKey &&
          !colorPickerMode &&
          !paintMode &&
          !subObjectSelectionMode &&
          !polygonDrawingEnabled &&
          !faceEditMode
        
        if (canStartMarqueeSelection) {
          detachMarqueeListeners()
          marqueeStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            currentX: event.clientX,
            currentY: event.clientY,
            active: false
          }
          attachMarqueeListeners()
        } else if (marqueeStateRef.current) {
          clearMarqueeState()
          detachMarqueeListeners()
        }
        
        mouseDownInfo = {
          x: event.clientX,
          y: event.clientY,
          time: Date.now()
        }
      }
    }
    
    // Track mousedown - use capture phase to run early but don't prevent default
    renderer.domElement.addEventListener('mousedown', handleMouseDownForSelection, true)
    
    const handleClickForSelection = (event: MouseEvent) => {
      // Only handle left-click for object selection
      // Right-click and middle-click are for camera controls (pan)
      // Don't handle clicks if transform controls are being dragged
      if (event.button !== 0) return
      
      if (skipClickAfterMarqueeRef.current) {
        skipClickAfterMarqueeRef.current = false
        mouseDownInfo = null
        return
      }
      
      // Check if transform controls are currently dragging
      const transformControlsDragging = (transformControls as any)?.dragging || false
      if (transformControlsDragging) return
      
      // Check if color picker, paint mode, or sub-object selection mode is active - these need to work even if mouseDownInfo is missing
      const colorPickerMode = useAppStore.getState().colorPickerMode
      const paintMode = useAppStore.getState().paintMode
      const subObjectSelectionMode = useAppStore.getState().subObjectSelectionMode
      
      if (colorPickerMode || paintMode || subObjectSelectionMode) {
        // Color picker, paint mode, and sub-object selection need to work - call handleClick directly
        // But still check if this was a real click (not a drag) if mouseDownInfo exists
        if (mouseDownInfo) {
          const dx = Math.abs(event.clientX - mouseDownInfo.x)
          const dy = Math.abs(event.clientY - mouseDownInfo.y)
          const dt = Date.now() - mouseDownInfo.time
          
          // Only treat as click if mouse moved < 5 pixels and took < 200ms
          if (dx < 5 && dy < 5 && dt < 200) {
            handleClick(event)
          }
        } else {
          // No mouseDownInfo (might have been cleared), but these modes need to work
          // Call handleClick anyway for these modes
          handleClick(event)
        }
        
        mouseDownInfo = null
        return
      }
      
      // Normal selection: Check if this was a real click (not a drag)
      // If user dragged, OrbitControls handled it and this click should be ignored
      if (mouseDownInfo) {
        const dx = Math.abs(event.clientX - mouseDownInfo.x)
        const dy = Math.abs(event.clientY - mouseDownInfo.y)
        const dt = Date.now() - mouseDownInfo.time
        
        // Only treat as click if mouse moved < 5 pixels and took < 200ms
        // This ensures OrbitControls drags are not mistaken for clicks
        if (dx < 5 && dy < 5 && dt < 200) {
          handleClick(event)
        }
        
        mouseDownInfo = null
      }
    }
    
    renderer.domElement.addEventListener('click', handleClickForSelection)
    renderer.domElement.addEventListener('dblclick', (event: MouseEvent) => {
      // Only handle left-click double-click
      if (event.button === 0) {
        handleDoubleClick(event)
      }
    })
    
    // Handle hotspot hover for label visibility and endpoint dragging
    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current || !mouse || !camera || !raycaster) return
      if (marqueeStateRef.current && marqueeStateRef.current.active) {
        return
      }
      
      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      raycaster.setFromCamera(mouse, camera)
      
      // Handle panel dragging
      const panelDragInfo = (window as any).__panelDragInfo
      if (panelDragInfo && panelDragInfo.dragging) {
        event.preventDefault()
        event.stopPropagation()
        
        const { panel, hotspotId, plane } = panelDragInfo
        
        // Cast ray from camera through mouse position
        const ray = new THREE.Raycaster()
        ray.setFromCamera(mouse, camera)
        
        // Find intersection with dragging plane
        const intersection = new THREE.Vector3()
        const rayResult = ray.ray.intersectPlane(plane, intersection)
        
        if (rayResult) {
          // Update panel position
          if (panel.parent && panel.parent !== scene) {
            // Convert world intersection to local space relative to parent
            const localPos = new THREE.Vector3()
            panel.parent.worldToLocal(localPos.copy(intersection))
            panel.position.copy(localPos)
          } else {
            // Panel is directly in scene
            panel.position.copy(intersection)
          }
          panel.updateMatrixWorld(true)
          
          // Get world position
          const worldPosition = new THREE.Vector3()
          panel.getWorldPosition(worldPosition)
          
          // Update hotspot position in store (panel is offset above hotspot icon, so subtract offset)
          const updateHotspotPosition = (window as any).__updateHotspotPosition as ((id: string, position: { x: number; y: number; z: number }) => void) | undefined
          if (updateHotspotPosition) {
            // Panel is positioned 1.5 units above hotspot icon
            updateHotspotPosition(hotspotId, {
              x: worldPosition.x,
              y: worldPosition.y - 1.5,
              z: worldPosition.z
            })
          }
        }
        
        return // Don't process hover when dragging panel
      }
      
      // Handle endpoint dragging
      const endpointDragInfo = (window as any).__endpointDragInfo
      if (endpointDragInfo && endpointDragInfo.dragging) {
        event.preventDefault()
        event.stopPropagation()
        
        const { endpoint, hotspotId, plane } = endpointDragInfo
        
        // Cast ray from camera through mouse position
        const ray = new THREE.Raycaster()
        ray.setFromCamera(mouse, camera)
        
        // Find intersection with dragging plane
        const intersection = new THREE.Vector3()
        const rayResult = ray.ray.intersectPlane(plane, intersection)
        
        if (rayResult) {
          // Update endpoint position (endpoints are directly in scene, so position is in world space)
          // But we need to ensure it's relative to scene (parent), so if endpoint has a parent, convert to local space
          if (endpoint.parent && endpoint.parent !== scene) {
            // Convert world intersection to local space relative to parent
            const localPos = new THREE.Vector3()
            endpoint.parent.worldToLocal(localPos.copy(intersection))
            endpoint.position.copy(localPos)
          } else {
            // Endpoint is directly in scene, use world position
            endpoint.position.copy(intersection)
          }
          endpoint.updateMatrixWorld(true)
          
          // Get world position for updating hotspot
          const worldPosition = new THREE.Vector3()
          endpoint.getWorldPosition(worldPosition)
          
          // Update hotspot endpoint position
          const updateHotspotEndpointPosition = (window as any).__updateHotspotEndpointPosition as 
            ((id: string, position: { x: number; y: number; z: number }) => void) | undefined
          
          if (updateHotspotEndpointPosition) {
            updateHotspotEndpointPosition(hotspotId, {
              x: worldPosition.x,
              y: worldPosition.y,
              z: worldPosition.z
            })
          }
          
          // Update the connecting line
          const hotspotLines = (viewerRef.current as any)?.hotspotLines
          if (hotspotLines && hotspotLines instanceof Map) {
            const line = hotspotLines.get(hotspotId)
            if (line && line.geometry instanceof THREE.BufferGeometry) {
              const positions = line.geometry.attributes.position
              if (positions && positions.count >= 2) {
                // Get hotspot marker position (start of line)
                const hotspots = (window as any).__hotspots as Array<{ id: string; position: { x: number; y: number; z: number } }> | undefined
                if (hotspots) {
                  const hotspot = hotspots.find(h => h.id === hotspotId)
                  if (hotspot) {
                    positions.setXYZ(0, hotspot.position.x, hotspot.position.y, hotspot.position.z)
                  }
                }
                // Update endpoint position (end of line)
                positions.setXYZ(1, worldPosition.x, worldPosition.y, worldPosition.z)
                positions.needsUpdate = true
              }
            }
          }
        }
        
        return // Don't process hover when dragging
      }
      
      const hotspots = (window as any).__hotspots as Array<{ id: string; label?: { text: string } }> | undefined
      const setHoveredHotspotId = (window as any).__setHoveredHotspotId as ((id: string | null) => void) | undefined
      
      if (hotspots && setHoveredHotspotId) {
        const hotspotObjects: THREE.Object3D[] = []
        scene.traverse((obj) => {
          if (obj.userData.isHotspot || obj.userData.isHotspotLabel) {
            hotspotObjects.push(obj)
          }
        })
        
        if (hotspotObjects.length > 0) {
          const hotspotIntersects = raycaster.intersectObjects(hotspotObjects, false)
          if (hotspotIntersects.length > 0) {
            const hoveredObj = hotspotIntersects[0].object
            const hotspotId = hoveredObj.userData.hotspotId || (hotspots.find(h => h.label?.text === hoveredObj.userData.labelText)?.id)
            setHoveredHotspotId(hotspotId || null)
          } else {
            setHoveredHotspotId(null)
          }
        } else {
          setHoveredHotspotId(null)
        }
      }
    }
    
    // Handle mouseup to stop endpoint dragging
    const handleMouseUpForEndpointDrag = (event: MouseEvent) => {
      const endpointDragInfo = (window as any).__endpointDragInfo
      if (endpointDragInfo && endpointDragInfo.dragging) {
        // Stop dragging
        ;(window as any).__endpointDragInfo.dragging = false
        ;(window as any).__endpointDragInfo = null
        
        // Re-enable OrbitControls
        if (controls) {
          controls.enabled = true
        }
        
        console.log('[ViewerCanvas] Stopped dragging hotspot endpoint')
        
        event.preventDefault()
        event.stopPropagation()
      }
    }
    
    renderer.domElement.addEventListener('mousemove', handleMouseMove)
    renderer.domElement.addEventListener('mouseup', handleMouseUpForEndpointDrag, true)
    renderer.domElement.addEventListener('mouseleave', handleMouseUpForEndpointDrag) // Stop drag if mouse leaves window
    
    // Pre-load face extrusion utilities to avoid async import on every mousemove
    let faceExtrusionUtils: typeof import('../utils/faceExtrusion') | null = null
    import('../utils/faceExtrusion').then((utils) => {
      faceExtrusionUtils = utils
    })
    
    // Handle face dragging for face edit mode (SketchUp-style push/pull)
    const handleFaceDrag = (event: MouseEvent) => {
      const faceEditDragActive = (window as any).__faceEditDragActive
      if (!faceEditDragActive) return
      
      const faceEditInfo = (window as any).__faceEditInfo
      if (!faceEditInfo || !faceEditInfo.mesh) return
      
      // Wait for extrusion utils to load
      if (!faceExtrusionUtils) return
      
      event.preventDefault()
      event.stopPropagation()
      
      // Calculate mouse position in normalized device coordinates
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || !camera || !raycaster) return
      
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      raycaster.setFromCamera(mouse, camera)
      
      // Cast a ray perpendicular to the face to find extrusion distance
      const faceNormal = new THREE.Vector3()
      const mesh = faceEditInfo.mesh
      
      // Get face normal based on face name (in local space)
      switch (faceEditInfo.faceName) {
        case 'top':
          faceNormal.set(0, 1, 0)
          break
        case 'bottom':
          faceNormal.set(0, -1, 0)
          break
        case 'front':
          faceNormal.set(0, 0, 1)
          break
        case 'back':
          faceNormal.set(0, 0, -1)
          break
        case 'right':
          faceNormal.set(1, 0, 0)
          break
        case 'left':
          faceNormal.set(-1, 0, 0)
          break
      }
      
      // Transform normal to world space
      mesh.updateMatrixWorld()
      const worldNormal = faceNormal.clone().transformDirection(mesh.matrixWorld)
      
      // Use original start point stored when face was first clicked
      const originalStartPoint = faceEditInfo.originalStartPoint || faceEditInfo.startPoint
      
      // Create a plane at the original start point perpendicular to the face normal
      const plane = new THREE.Plane()
      plane.setFromNormalAndCoplanarPoint(worldNormal, originalStartPoint)
      
      // Find intersection with the plane
      const intersection = new THREE.Vector3()
      const intersectPoint = raycaster.ray.intersectPlane(plane, intersection)
      
      if (intersectPoint) {
        // Calculate total distance from original start point along face normal
        const offset = new THREE.Vector3().subVectors(intersectPoint, originalStartPoint)
        const totalDistance = offset.dot(worldNormal)
        
        try {
          // Store original start point and parameters if not already stored
          if (!faceEditInfo.originalStartPoint) {
            faceEditInfo.originalStartPoint = originalStartPoint.clone()
            // Store original geometry parameters if available
            const originalGeo = faceEditInfo.originalGeometry
            if (originalGeo && (originalGeo as any).parameters) {
              faceEditInfo.originalParams = {
                width: (originalGeo as any).parameters.width,
                height: (originalGeo as any).parameters.height,
                depth: (originalGeo as any).parameters.depth
              }
            } else {
              // Fallback: calculate from bounding box
              originalGeo.computeBoundingBox()
              const box3 = originalGeo.boundingBox
              if (box3) {
                const size = box3.getSize(new THREE.Vector3())
                faceEditInfo.originalParams = { width: size.x, height: size.y, depth: size.z }
              }
            }
            console.log('[FaceEdit] Stored original parameters:', faceEditInfo.originalParams)
          }
          
          // Dispose old geometry if it exists
          const oldGeometry = mesh.geometry
          if (oldGeometry && oldGeometry !== faceEditInfo.originalGeometry) {
            oldGeometry.dispose()
          }
          
          // Create new extruded geometry from original dimensions + total distance
          const newGeometry = faceExtrusionUtils.extrudeBoxFace(
            mesh, 
            faceEditInfo.faceName, 
            totalDistance,
            faceEditInfo.originalParams
          )
          mesh.geometry = newGeometry
          
          // Force update
          mesh.geometry.needsUpdate = true
          mesh.updateMatrixWorld(true)
          
          console.log(`[FaceEdit] Extruding ${faceEditInfo.faceName} face by ${totalDistance.toFixed(2)} units`)
          
        } catch (error) {
          console.error('[FaceEdit] Failed to extrude face:', error)
        }
      }
    }
    
    const handleFaceDragEnd = () => {
      const faceEditDragActive = (window as any).__faceEditDragActive
      if (faceEditDragActive) {
        ;(window as any).__faceEditDragActive = false
        ;(window as any).__faceEditInfo = null
        
        // Re-enable OrbitControls (access from closure scope)
        if (controls) {
          controls.enabled = true
        }
        
        console.log('[FaceEdit] Face extrusion completed')
      }
    }
    
    renderer.domElement.addEventListener('mousemove', handleFaceDrag)
    renderer.domElement.addEventListener('mouseup', handleFaceDragEnd)
    renderer.domElement.addEventListener('mouseleave', handleFaceDragEnd)
    
    // Prevent context menu on right-click to allow smooth panning
    renderer.domElement.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault()
    })
    
    // Wrapper function to update shadow bounds for all lights
    // Uses imported function from shadowManager utility
    const updateAllShadowCameraBoundsLocal = () => {
      updateAllShadowCameraBounds(directionalLights, scene, camera)
    }

    // Initialize particle systems and water arrays (will be set up in effects)
    const particleSystems: Array<import('./particles/ParticleSystem').ParticleSystem> = []
    let waterSystem: import('./effects/WaterSystem').WaterSystem | undefined
    // Streets GL only - Three.js Sky removed
    // Streets GL only - SunMoonSystem removed
    const viewer: ViewerInstance = {
      scene,
      camera,
      renderer,
      controls,
      transformControls,
      clock,
      frameObject,
      resetCamera,
      selectObject,
      raycaster,
      mouse,
      ambientLight,
      directionalLights,
      lightGizmos,
      lightToGizmo,
      gizmoToLight,
      lightHelpers,
      shadowMapViewers,
      environmentMap,
      pivotWrappers,
      startingObjectsGroup,
      particleSystems,
      waterSystem,
      animationMixers: [],
      captureScreenshot: () => captureViewerScreenshot({
        renderer,
        scene,
        camera,
        postProcessingSystem: viewerRef.current?.postProcessingSystem
      }),
      // Streets GL only - threeSky and sunMoonSystem removed
      getCameraState,
      setCameraState,
      updateShadowCameraBounds: updateAllShadowCameraBoundsLocal,
      runShadowDiagnostics: () => runShadowDiagnostics(scene, renderer, camera)
    }

    viewerRef.current = viewer

    // Restore visibility on models loaded before this session (stale hidden/layer state)
    requestAnimationFrame(() => {
      const restored = ensureImportedMeshesVisible(scene)
      if (restored > 0) {
        console.log(`[enhanceInternalShadows] Init restore: fixed ${restored} stale visibility/layer issue(s)`)
      }
      auditHiddenImportedMeshes(scene)
    })

    requestAnimationFrame(() => {
      try {
        buildScenePickBVH(scene)
      } catch (error) {
        console.warn('[ViewerInit] Failed to build pick BVH:', error)
      }
    })
    
    // Industry-standard: Call onViewerReady synchronously to ensure viewer is registered immediately
    // This prevents race conditions where files are loaded before the viewer is registered
    // IMPORTANT: Call onViewerReady AFTER setting viewerRef to ensure state is consistent
    if (onViewerReady) {
      try {
        // Call the callback synchronously - this will set sharedViewer in useViewer
        onViewerReady(viewer)
        
        // Verify the callback completed successfully
        try {
          console.log('[ViewerInit] onViewerReady callback completed successfully')
        } catch {}
      } catch (error) {
        console.error('[ViewerInit] Error in onViewerReady callback:', error)
        // Re-throw to ensure initialization failure is visible
        throw error
      }
    } else {
      console.warn('[ViewerInit] onViewerReady callback is not provided - viewer may not be registered')
    }

    // ========================================
    // ANIMATION LOOP
    // ========================================
    // Simple, predictable loop like Twinmotion
    // Always update controls for smooth damping
    // 
    // BEST PRACTICE: Uses requestAnimationFrame for browser-optimized rendering
    // - Automatically syncs with display refresh rate
    // - Handles tab visibility (pauses when tab hidden)
    // - FPS limiting and VSync support for performance control
    // - Proper cleanup on component unmount
    
    // Track last shadow update time to avoid updating too frequently
    // BEST PRACTICE: Throttle shadow map updates to prevent excessive GPU work
    // Shadow maps are expensive to regenerate - updating every frame is unnecessary
    let lastShadowUpdateTime = 0
    const shadowUpdateInterval = 1000 // Update shadows every 1 second during animation
    
    // VSync and FPS limiting
    let lastFrameTime = 0
    const getFrameInterval = () => {
      const store = useAppStore.getState()
      const effectiveFps = getEffectiveMaxFps(
        store.weatherQuality ?? 'high',
        maxFPS,
        !!store.enableStandaloneWeather
      )
      if (effectiveFps <= 0) return 0 // Unlimited or VSync (-1)
      return 1000 / effectiveFps
    }

    let documentVisible = typeof document === 'undefined' || !document.hidden
    let idlePauseEnabled = false
    let controlsInteracting = false
    const frameMotionPrevious = createFrameMotionState()
    captureFrameMotionState(frameMotionPrevious, camera, controls)

    const scheduleAnimationFrame = () => {
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    const restartAnimationLoop = () => {
      if (!documentVisible || webglContextLostRef.current) return
      restartAnimationLoopIfIdle(
        animationFrameRef.current,
        scheduleAnimationFrame,
        () => { idlePauseEnabled = false }
      )
    }

    const getSceneActivity = () => {
      const s = useAppStore.getState()
      return {
        enableStandaloneWeather: s.enableStandaloneWeather,
        windIntensity: s.windIntensity,
        cloudDensity: s.cloudDensity,
        rainIntensity: s.rainIntensity,
        snowIntensity: s.snowIntensity
      }
    }

    const needsViewerRenderUpdates = (): boolean =>
      controlsInteracting ||
      hasOrbitControlsDamping(controls) ||
      needsContinuousSceneUpdates(viewerRef.current, controls, getSceneActivity())

    if (viewerRef.current) {
      viewerRef.current.requestRender = restartAnimationLoop
    }

    const handleVisibilityChange = () => {
      documentVisible = !document.hidden
      if (document.hidden) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = undefined
        }
        return
      }
      restartAnimationLoop()
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
      cleanupVisibilityHandler = handleVisibilityChange
    }

    const handleControlsChange = () => restartAnimationLoop()
    const handleControlsStart = () => {
      controlsInteracting = true
      restartAnimationLoop()
    }
    const handleControlsEnd = () => {
      controlsInteracting = false
      restartAnimationLoop()
    }
    controls.addEventListener('change', handleControlsChange)
    controls.addEventListener('start', handleControlsStart)
    controls.addEventListener('end', handleControlsEnd)
    cleanupControlsChangeHandler = () => {
      controls.removeEventListener('change', handleControlsChange)
      controls.removeEventListener('start', handleControlsStart)
      controls.removeEventListener('end', handleControlsEnd)
    }

    const wakeAnimationLoopFromCanvas = () => restartAnimationLoop()
    renderer.domElement.addEventListener('pointerdown', wakeAnimationLoopFromCanvas)
    renderer.domElement.addEventListener('wheel', wakeAnimationLoopFromCanvas, { passive: true })
    cleanupCanvasWakeHandlers = () => {
      renderer.domElement.removeEventListener('pointerdown', wakeAnimationLoopFromCanvas)
      renderer.domElement.removeEventListener('wheel', wakeAnimationLoopFromCanvas)
    }

    const animate = (currentTime: number = performance.now()) => {
      if (webglContextLostRef.current || !documentVisible) {
        animationFrameRef.current = undefined
        return
      }

      // CRITICAL: Check if PathTracerDemo is running - if so, skip rendering but continue loop
      // PathTracerDemo uses setAnimationLoop() which handles rendering independently
      // BEST PRACTICE: Continue animation loop for controls updates even when path tracer is active
      // This ensures camera controls remain responsive during path tracing
      // Check if path tracer is running (with guard to prevent conflicts from multiple sessions)
      const pathTracerDemoRunning = (window as any).__pathTracerDemoRunning === true
      // Skip viewer raster render while any path tracer owns the WebGL context (panel or export).
      if (pathTracerDemoRunning) {
        // PathTracerDemo owns the render loop; keep controls responsive but skip viewer render.
        scheduleAnimationFrame()
        // Still update controls for camera interaction
        controls.update()
        return
      }
      
      // Handle VSync and FPS limiting
      if (vsyncEnabled && maxFPS === -1) {
        // Standard VSync: continue below and schedule at end
      } else if (maxFPS > 0) {
        // FPS cap: manually limit frame rate
        const frameInterval = getFrameInterval()
        const elapsed = currentTime - lastFrameTime
        
        if (elapsed < frameInterval) {
          scheduleAnimationFrame()
          return
        }

        lastFrameTime = currentTime - (elapsed % frameInterval)
      }
      
      // Update camera controls (handles damping)
      controls.update()

      const continuousUpdates = needsViewerRenderUpdates()
      const movedSinceLastFrame = hasFrameMotion(frameMotionPrevious, camera, controls)
      const shouldRenderFrame = !idlePauseEnabled || movedSinceLastFrame || continuousUpdates
      captureFrameMotionState(frameMotionPrevious, camera, controls)

      if (!shouldRenderFrame) {
        idlePauseEnabled = true
        animationFrameRef.current = undefined
        return
      }
      
      // Update CSM shadow system if standalone weather is enabled
      if (viewerRef.current?.csmShadowSystem?.isEnabled()) {
        // Update CSM camera (for dynamic cascade recalculation)
        viewerRef.current.csmShadowSystem.updateCamera(camera)
        // Update CSM (recalculates cascades based on camera position)
        viewerRef.current.csmShadowSystem.update()
        
        // Update water system (only when enabled)
        if (viewerRef.current.standaloneWaterSystem?.getConfig().enabled) {
          const sunDir = viewerRef.current.sunMoonSystem 
            ? viewerRef.current.sunMoonSystem.getSunDirection() 
            : new THREE.Vector3(0, 1, 0)
          viewerRef.current.standaloneWaterSystem.update(camera, sunDir)
        }
      }

      // Dynamic sky: camera-centered dome + cloud animation (independent of CSM tick)
      if (viewerRef.current?.dynamicSky) {
        viewerRef.current.dynamicSky.update(camera)
      }
      
      // Update hotspot panels to always face camera (billboard effect)
      scene.traverse((obj) => {
        if (obj.userData.isHotspotPanel && obj.userData.isBillboard) {
          // Make panel always face camera
          obj.lookAt(camera.position)
        }
      })
      
      // Update light helpers to reflect light positions and colors (like Twinmotion)
      // CRITICAL: Control Three.js helper visibility based on showLightHelpers setting
      // These are the native Three.js helpers (DirectionalLightHelper, PointLightHelper, etc.)
      const showLightHelpers = useAppStore.getState().showLightHelpers
      lightHelpers.forEach((helper, lightId) => {
        const light = directionalLights.get(lightId)
        if (light && helper) {
          // CRITICAL: Hide CSM lights - they're internal system lights and shouldn't be visible
          // CSM lights are marked with userData.isCSMLight = true
          if (light.userData.isCSMLight || light.userData.isInternal) {
            helper.visible = false
            return
          }
          // CRITICAL: Hide/show Three.js helpers based on showLightHelpers setting
          // These are separate from gizmos - gizmos should always be visible
          helper.visible = showLightHelpers && light.visible
          
          // Only call update() if the helper has an update method
          // Not all light helpers have update() (e.g., RectAreaLightHelper, HemisphereLightHelper)
          if (typeof (helper as any).update === 'function') {
            try {
              (helper as any).update()
            } catch (error) {
              // Silently ignore update errors - some helpers might not be fully initialized
              console.warn(`[ViewerCanvas] Failed to update light helper for ${lightId}:`, error)
            }
          }
        }
      })

      // CRITICAL: Control gizmo visibility based on showLightHelpers setting
      // Both Three.js helpers and gizmos are controlled by the same setting
      // BUT: Selected gizmos (with transform controls) should remain visible
      // CRITICAL: Hide CSM light gizmos - they're internal system lights
      const transformControls = viewerRef.current?.transformControls
      lightGizmos.forEach((gizmo, lightId) => {
        const light = directionalLights.get(lightId)
        // CRITICAL: Hide CSM lights - they're internal system lights and shouldn't be visible
        if (light && (light.userData.isCSMLight || light.userData.isInternal)) {
          gizmo.visible = false
          return
        }
        if (light && gizmo) {
          // Check if this gizmo is currently selected (has transform controls attached)
          const isSelected = transformControls && (transformControls as any).object === gizmo
          // Gizmos visibility: visible if selected OR if showLightHelpers is enabled
          // When showLightHelpers is false, gizmos are hidden UNLESS they're selected
          gizmo.visible = (isSelected || showLightHelpers) && light.visible
          updateLightGizmoFromLight(light, gizmo, camera)
        }
      })
      
      // Update particle systems and effects
      const deltaTime = clock.getDelta()
      if (viewerRef.current) {
        updateAnimationMixers(viewerRef.current, deltaTime)
      }
      // HDR-ONLY MODE: Skip all system updates
      const hdrOnlyMode = useAppStore.getState().hdrOnlyMode
      if (!hdrOnlyMode) {
        if (viewerRef.current?.particleSystems) {
          viewerRef.current.particleSystems.forEach(system => system.update(deltaTime, camera.position))
        }
        if (viewerRef.current?.waterSystem) {
          viewerRef.current.waterSystem.update(deltaTime)
        }
        // Three.js Sky doesn't need per-frame updates (it's a static shader)
      }


      // Streets GL only - SunMoonSystem removed
      
      // Periodically update shadow camera bounds during animation
      // This ensures shadows work when objects are moved via any means
      const now = Date.now()
      if (now - lastShadowUpdateTime > shadowUpdateInterval) {
        lastShadowUpdateTime = now
        updateAllShadowCameraBoundsLocal()
      }
      
      // CRITICAL: Ensure shadow camera bounds are updated on first render if not already done
      // This fixes cases where shadows don't appear because bounds weren't calculated
      if (!(viewerRef.current as any).__shadowBoundsInitialized) {
        updateAllShadowCameraBoundsLocal()
        ;(viewerRef.current as any).__shadowBoundsInitialized = true
      }
      
      // CRITICAL: Ensure shadows are enabled before every render
      // This prevents shadows from being accidentally disabled by other systems
      const shadowsEnabledFromStore = useAppStore.getState().shadowsEnabled
      if (shadowsEnabledFromStore && !renderer.shadowMap.enabled) {
        console.warn('[ShadowDebug] ⚠️ Shadows were disabled before render - RE-ENABLING')
        renderer.shadowMap.enabled = true
      }
      
      // IMPROVED: Run comprehensive shadow diagnostics periodically (every 10 seconds) to catch issues
      // CRITICAL: Only run diagnostics if scene has objects to avoid false positives on initial load
      // Reduced frequency to reduce console spam
      const lastDiagnosticsTime = (viewerRef.current as any).__lastShadowDiagnosticsTime || 0
      const diagnosticsInterval = 10000 // Run diagnostics every 10 seconds
      
      if (now - lastDiagnosticsTime >= diagnosticsInterval) {
        ;(viewerRef.current as any).__lastShadowDiagnosticsTime = now
        try {
          // Check if scene has any imported model meshes before running diagnostics
          // Skip diagnostics if no models have been loaded yet (prevents false positives)
          let hasImportedMeshes = false
          let hasMeshesWithShadows = false
          scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh && 
                !obj.userData.isShadowPlane && 
                !obj.userData.isGridHelper &&
                !obj.userData.isAxesHelper &&
                !obj.userData.isLightGizmo &&
                !obj.userData.isLightHelper &&
                !obj.userData.isGizmo &&
                !obj.userData.isHelper) {
              // IMPROVED: Skip LineBasicMaterial and other helper materials
              const material = obj.material
              if (material) {
                const materials = Array.isArray(material) ? material : [material]
                const hasLineMaterial = materials.some((mat: THREE.Material) => 
                  mat instanceof THREE.LineBasicMaterial ||
                  mat instanceof THREE.LineDashedMaterial ||
                  mat instanceof THREE.PointsMaterial ||
                  mat instanceof THREE.SpriteMaterial
                )
                if (hasLineMaterial) {
                  return // Skip line materials
                }
              }
              
              // Check if this is an imported model (has userData.isImportedModel or is part of model)
              if (obj.userData.isImportedModel || 
                  (obj.parent && obj.parent.userData.isImportedModel) ||
                  (obj.parent && obj.parent.userData.isModel)) {
                hasImportedMeshes = true
              }
              // Also check if mesh has shadows configured
              if (obj.castShadow || obj.receiveShadow) {
                hasMeshesWithShadows = true
              }
            }
          })
          
          // Only run diagnostics if we have imported model meshes OR meshes with shadows configured
          // This prevents false positive errors on initial load (before models are loaded)
          // AND prevents false positives if models are still loading
          if (hasImportedMeshes || hasMeshesWithShadows) {
            
            const diagnostics = runShadowDiagnostics(scene, renderer, camera)

            const diagnosticsSummary = JSON.stringify({
              status: diagnostics.overallStatus,
              entries: diagnostics.results
                .filter((result) => result.status !== 'pass')
                .map((result) => ({
                  category: result.category,
                  test: result.test,
                  status: result.status,
                  message: result.message,
                  recommendation: result.recommendation
                }))
            })

            const lastSummary = (viewerRef.current as any).__lastShadowDiagnosticsSummary
            if (diagnosticsSummary !== lastSummary) {
              (viewerRef.current as any).__lastShadowDiagnosticsSummary = diagnosticsSummary

              // Only show critical errors if we have actual imported models (not just on startup)
              // Suppress false positives when scene is empty or models are still loading
              if (diagnostics.overallStatus === 'critical' && hasImportedMeshes) {
                // Track if we've already attempted auto-fix for this diagnostic result
                const lastAutoFixAttempt = (viewerRef.current as any).__lastShadowAutoFixAttempt
                const shouldAutoFix = !lastAutoFixAttempt || lastAutoFixAttempt !== diagnosticsSummary
                
                if (shouldAutoFix) {
                  // Attempt to automatically fix shadow issues
                  console.group('🔴 CRITICAL SHADOW ISSUES DETECTED - Attempting Auto-Fix')
                  const fixResult = autoFixShadowIssues(scene, renderer)
                  
                  if (fixResult.fixesApplied.length > 0) {
                    console.log('✅ Auto-fix applied:', fixResult.fixesApplied)
                    if (fixResult.meshesFixed > 0) {
                      console.log(`   Fixed ${fixResult.meshesFixed} mesh(es)`)
                    }
                    if (fixResult.materialsConverted > 0) {
                      console.log(`   Converted ${fixResult.materialsConverted} material(s)`)
                    }
                    // Update shadow camera bounds after fixes
                    if (viewerRef.current?.updateShadowCameraBounds) {
                      viewerRef.current.updateShadowCameraBounds()
                    }
                  } else {
                    console.warn('⚠️ Auto-fix attempted but no fixes were applied')
                  }
                  
                  if (fixResult.errors.length > 0) {
                    console.warn('⚠️ Auto-fix errors:', fixResult.errors)
                  }
                  
                  // Mark that we've attempted auto-fix for this diagnostic state
                  ;(viewerRef.current as any).__lastShadowAutoFixAttempt = diagnosticsSummary
                  console.groupEnd()
                  
                  // Re-run diagnostics after fix to see if issues are resolved
                  // (Will be checked on next frame)
                } else {
                  // Already attempted auto-fix, just show the errors
                  console.group('🔴 CRITICAL SHADOW ISSUES DETECTED')
                  diagnostics.results.forEach(result => {
                    if (result.status === 'fail') {
                      console.error(`[ShadowDebug] ❌ ${result.category}: ${result.test}`, result.message)
                      if (result.recommendation) {
                        console.log('   💡 Recommendation:', result.recommendation)
                      }
                    }
                  })
                  console.log('📊 Full Report:', diagnostics)
                  console.log('💡 Auto-fix was already attempted. Please check your model materials and shadow settings.')
                  console.groupEnd()
                }
              } else if (diagnostics.overallStatus === 'issues') {
                console.group('⚠️ Shadow System Warnings')
                diagnostics.results.forEach(result => {
                  if (result.status === 'warning') {
                    console.warn(`[ShadowDebug] ⚠️ ${result.category}: ${result.test}`, result.message)
                    if (result.recommendation) {
                      console.log('   💡 Recommendation:', result.recommendation)
                    }
                  }
                })
                console.log('📊 Full Report:', diagnostics)
                console.groupEnd()
              }
            }

            ;(window as any).__lastShadowDiagnostics = diagnostics
          } else {
            // Scene is empty - don't run diagnostics at all to avoid false positives
            // This is expected behavior on initial load
          }
        } catch (error) {
          // Silently fail diagnostics - don't break the render loop
        }
      }

      // Splat debug: periodic log when SPLAT_DEBUG=1 or ?splat_debug=1 (visibility, layers, texture path)
      const splatDebug =
        typeof window !== 'undefined' &&
        (localStorage.getItem('SPLAT_DEBUG') === '1' || /[?&]splat_debug=1/i.test(window.location.search || ''))
      if (splatDebug && scene) {
        splatDebugFrameRef.current = (splatDebugFrameRef.current || 0) + 1
        const splatRoot = (scene as any).children?.find((c: any) => c?.userData?.isGaussianSplatViewer)
        if (splatRoot && !splatDebugLoggedOnceRef.current) {
          splatDebugLoggedOnceRef.current = true
          console.log('[SplatRender] SPLAT_DEBUG enabled. Logging every 60 frames (visibility, layers, splatCount, render target).')
        }
        if (splatDebugFrameRef.current % 60 === 0 && splatRoot) {
          const v = (splatRoot as any).viewer
          const sm = v?.splatMesh
          const rt = renderer.getRenderTarget?.()
          console.log(
            '[SplatRender] Every 60 frames:',
            JSON.stringify({
              splatRootVisible: splatRoot.visible,
              childrenCount: (splatRoot as any).children?.length ?? 0,
              cameraLayersMask: (camera as any).layers?.mask ?? null,
              rootLayersMask: (splatRoot as any).layers?.mask ?? null,
              splatMeshVisible: sm?.visible ?? null,
              splatCount: typeof sm?.getSplatCount === 'function' ? sm.getSplatCount() : null,
              splatRenderCount: typeof v?.splatRenderCount === 'number' ? v.splatRenderCount : null,
              initialized: !!v?.initialized,
              splatRenderReady: !!v?.splatRenderReady,
              splatScale: typeof sm?.getSplatScale === 'function' ? sm.getSplatScale() : null,
              cameraPosition: {
                x: Number(camera.position.x.toFixed(2)),
                y: Number(camera.position.y.toFixed(2)),
                z: Number(camera.position.z.toFixed(2))
              },
              cameraTarget: {
                x: Number(controls.target.x.toFixed(2)),
                y: Number(controls.target.y.toFixed(2)),
                z: Number(controls.target.z.toFixed(2))
              },
              renderTargetBeforeComposer: rt ? 'set' : 'null',
              postProcessingEnabled: !!viewerRef.current?.postProcessingSystem
            })
          )
          }
        }
      
      // Normal rendering when path tracer is not active
      // BEST PRACTICE: Use ref's scene/camera so we always render the live scene (with loaded models).
      const currentScene = viewerRef.current?.scene ?? scene
      const currentCamera = viewerRef.current?.camera ?? camera
      // Ensure we're drawing to the screen (some code paths may leave a render target set)
      if (renderer.getRenderTarget && renderer.getRenderTarget() !== null) {
        renderer.setRenderTarget(null)
      }
      const splatViewers: any[] = []
      currentScene.traverse((obj: any) => {
        if (obj?.userData?.isGaussianSplatViewer && obj.viewer) {
          splatViewers.push(obj.viewer)
        }
      })

      if (splatViewers.length === 0 && viewerRef.current?.postProcessingSystem) {
        viewerRef.current.postProcessingSystem.render()
        if (shadowsEnabledFromStore && !renderer.shadowMap.enabled) {
          console.warn('[ShadowDebug] ⚠️ Post-processing disabled shadows - RE-ENABLING')
          renderer.shadowMap.enabled = true
        }
      } else if (splatViewers.length === 0) {
        renderer.render(currentScene, currentCamera)
      }

      if (splatViewers.length > 0) {
        const previousAutoClear = renderer.autoClear
        splatViewers.forEach((viewer, index) => {
          viewer.threeScene = index === 0 ? currentScene : null
          if (typeof viewer.update === 'function') {
            viewer.update(renderer, currentCamera)
          }
          if (!splatRenderLoggedOnceRef.current) {
            splatRenderLoggedOnceRef.current = true
            console.log(
              '[Splat] Using shared renderer viewer render path.',
              'initialized:',
              !!viewer.initialized,
              'splatRenderReady:',
              !!viewer.splatRenderReady
            )
          }

          renderer.autoClear = index === 0
          if (typeof viewer.render === 'function') {
            viewer.render()
          }
        })
        renderer.autoClear = previousAutoClear
      }
      
      // Render shadow map viewers if enabled
      const shadowMapViewerEnabled = useAppStore.getState().shadowMapViewerEnabled
      if (shadowMapViewerEnabled && viewerRef.current?.shadowMapViewers) {
        viewerRef.current.shadowMapViewers.forEach((viewer) => {
          viewer.render(renderer)
        })
      }

      const keepAnimating = movedSinceLastFrame || needsViewerRenderUpdates()
      if (keepAnimating) {
        idlePauseEnabled = false
        scheduleAnimationFrame()
      } else {
        idlePauseEnabled = true
        animationFrameRef.current = undefined
      }
    }
    
    // CRITICAL: Start animation loop - must run in both initialization and HMR reuse cases
    // Check if animation loop is already running (from preserved viewer)
    if (!animationFrameRef.current) {
      scheduleAnimationFrame()
    } else {
      console.log('[ViewerCanvas] Animation loop already running, skipping restart')
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      webglContextLostRef.current = true
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
      console.warn('[ViewerCanvas] WebGL context lost — pausing render loop')
    }

    const handleContextRestored = () => {
      webglContextLostRef.current = false
      console.log('[ViewerCanvas] WebGL context restored — resuming render loop')
      const width = containerRef.current?.clientWidth ?? 1
      const height = containerRef.current?.clientHeight ?? 1
      renderer.setSize(width, height)
      if (viewerRef.current?.postProcessingSystem) {
        viewerRef.current.postProcessingSystem.setSize(width, height)
      }
      restartAnimationLoop()
    }

    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored)
    cleanupContextLostHandler = handleContextLost
    cleanupContextRestoredHandler = handleContextRestored

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      
      // Update post-processing system size
      if (viewerRef.current?.postProcessingSystem) {
        viewerRef.current.postProcessingSystem.setSize(width, height)
      }

      restartAnimationLoop()
    }

    window.addEventListener('resize', handleResize)
    cleanupResizeHandler = handleResize
    } // End of else block (normal initialization)

    // Cleanup
    return () => {
      // TEMPORARILY DISABLED: HMR preservation was causing blank page issues
      // Always perform full cleanup - viewer will reinitialize normally
      
      if (!isInitializedRef.current) return
      isInitializedRef.current = false
      
      // Stop animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
      
      // Clean up event listeners
      if (cleanupResizeHandler) {
        window.removeEventListener('resize', cleanupResizeHandler)
      }
      if (cleanupVisibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', cleanupVisibilityHandler)
      }
      if (cleanupControlsChangeHandler) {
        cleanupControlsChangeHandler()
      }
      if (cleanupCanvasWakeHandlers) {
        cleanupCanvasWakeHandlers()
      }
      if (renderer?.domElement) {
        if (cleanupContextLostHandler) {
          renderer.domElement.removeEventListener('webglcontextlost', cleanupContextLostHandler)
        }
        if (cleanupContextRestoredHandler) {
          renderer.domElement.removeEventListener('webglcontextrestored', cleanupContextRestoredHandler)
        }
      }
      
      // Dispose controls and transform gizmos (once)
      if (controls) {
        controls.dispose()
      }
      if (transformControls) {
        transformControls.dispose()
      }
      
      // Dispose of lights
      if (directionalLights) {
        directionalLights.forEach((light) => {
          if (scene && light) {
            scene.remove(light)
            light.dispose()
          }
        })
        directionalLights.clear()
      }

      if (lightGizmos) {
        lightGizmos.forEach((gizmo) => disposeLightGizmo(gizmo))
        lightGizmos.clear()
      }
      
      // Dispose of environment map
      if (environmentMap) {
        environmentMap.dispose()
        environmentMap = null
      }
      
      // Clear scene environment
      if (scene && scene.environment) {
        const env = scene.environment
        if (env instanceof THREE.Texture) {
          env.dispose()
        }
        scene.environment = null
      }
      
      // Dispose of scene objects
      if (scene) {
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            // Industry-standard: Dispose geometry first
            if (object.geometry) {
              try {
                object.geometry.dispose()
              } catch (e) {
                console.debug('Warning: Could not dispose geometry:', e)
              }
            }
            
            // Industry-standard: Dispose all textures from materials before disposing materials
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => {
                if (mat instanceof THREE.Material) {
                  disposeTexturesFromMaterial(mat)
                  try {
                    mat.dispose()
                  } catch (e) {
                    console.debug('Warning: Could not dispose material:', e)
                  }
                }
              })
            } else if (object.material instanceof THREE.Material) {
              disposeTexturesFromMaterial(object.material)
              try {
                object.material.dispose()
              } catch (e) {
                console.debug('Warning: Could not dispose material:', e)
              }
            }
          }
        })
        
        // Industry-standard: Clear all objects from scene
        while (scene.children.length > 0) {
          scene.remove(scene.children[0])
        }
      }
      
      // Industry-standard: Dispose all effect systems before disposing controls
      if (viewerRef.current) {
        // Dispose particle systems
        if (viewerRef.current.particleSystems) {
          viewerRef.current.particleSystems.forEach((system) => {
            try {
              system.destroy()
            } catch (e) {
              console.debug('Warning: Could not destroy particle system:', e)
            }
          })
          viewerRef.current.particleSystems = []
        }
        
        // Dispose water system
        if (viewerRef.current.waterSystem) {
          try {
            viewerRef.current.waterSystem.destroy()
          } catch (e) {
            console.debug('Warning: Could not destroy water system:', e)
          }
          viewerRef.current.waterSystem = undefined
        }
        
        // Streets GL only - Three.js Sky and SunMoonSystem removed
        
        // Dispose post-processing system
        if (viewerRef.current.postProcessingSystem) {
          try {
            viewerRef.current.postProcessingSystem.dispose()
          } catch (e) {
            console.debug('Warning: Could not dispose post-processing system:', e)
          }
          viewerRef.current.postProcessingSystem = undefined
        }
      }
      
      // Industry-standard: Remove canvas from DOM and dispose renderer
      if (renderer) {
        try {
          const canvas = renderer.domElement
          // Remove from DOM before disposing to encourage GC to clean up the context.
          if (canvas && containerRef.current && canvas.parentNode === containerRef.current) {
            containerRef.current.removeChild(canvas)
          }

          // Dispose renderer (this frees all GPU resources)
          renderer.dispose()
        } catch (e) {
          console.debug('Warning: Could not dispose renderer:', e)
        }
      }
      
      // Clear shared viewer singleton so consumers (e.g. primitive add path) don't
      // operate on a disposed renderer / emptied scene after the canvas unmounts
      // (e.g. when switching to city mode). Only clears if it still matches this viewer.
      clearSharedViewer(viewerRef.current)

      // Clear viewer reference
      revokeAllLoaderBlobUrls()
      viewerRef.current = null
    }
  }, []) // Empty dependency array - only run once on mount

  const pivotMode = useAppStore((state) => state.pivotMode)

  // Update cursor based on material picker or transform mode
  const colorPickerMode = useAppStore((state) => state.colorPickerMode)
  const paintMode = useAppStore((state) => state.paintMode)
  const subObjectSelectionMode = useAppStore((state) => state.subObjectSelectionMode)
  
  useEffect(() => {
    if (!viewerRef.current) return
    const { renderer } = viewerRef.current
    
    if (!renderer || !renderer.domElement) return
    
    // Color picker mode takes priority
    if (colorPickerMode) {
      // Color picker (eyedropper) cursor - only show when color picker is actually active
      // Custom dropper icon matching the design: black silhouette on transparent background
      // Angled dropper with rounded bulb at top (upper right), cylindrical body, tapered tip at bottom (lower left)
      // Design matches the dropper icon: simple black filled shape, angled from upper right to lower left
      // Hotspot is at the tip of the dropper (x=18, y=22) for accurate color picking
      // Dropper shape: rounded bulb (ellipse) + tapered body + pointed tip
      const pickerCursor = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 32 32\'%3E%3Cg fill=\'%23000000\'%3E%3Cellipse cx=\'26\' cy=\'8\' rx=\'3\' ry=\'3.5\'/%3E%3Cpath d=\'M24.5 11L18 17.5L12 23.5L6.5 29L5.5 28L11.5 22L17.5 16L24 9.5Z\'/%3E%3Cpath d=\'M25.5 11L18.5 18L12.5 24L7 29.5L6 28.5L12 23L18 17L25 10Z\'/%3E%3C/g%3E%3C/svg%3E") 18 22, crosshair'
      renderer.domElement.style.cursor = pickerCursor
    } else if (paintMode) {
      // Paint bucket cursor
      const paintCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23ffffff' d='M16.56 8.94L7.62 0L6.21 1.41l2.38 2.38-5.15 5.15c-.59.59-.59 1.54 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z'/%3E%3C/svg%3E") 12 12, crosshair`
      renderer.domElement.style.cursor = paintCursor
    } else if (subObjectSelectionMode) {
      // Sub-object selection cursor (crosshair)
      renderer.domElement.style.cursor = 'crosshair'
    } else {
      // Default cursor - material panel opening no longer changes cursor
      renderer.domElement.style.cursor = 'default'
    }
  }, [showMaterialPanel, transformMode, pivotMode, colorPickerMode, paintMode, subObjectSelectionMode])

  // Highlight selected sub-objects with emissive color
  const selectedSubObjects = useAppStore((state) => state.selectedSubObjects)
  
  // Use a ref to track previously highlighted objects across renders
  const previousHighlightedRef = useRef<Set<THREE.Mesh>>(new Set())
  const originalMaterialsRef = useRef<WeakMap<THREE.Mesh, {
    originalEmissive: THREE.Color | null
    originalEmissiveIntensity: number
  }>>(new WeakMap())
  
  useEffect(() => {
    if (!viewerRef.current?.scene) return
    
    const scene = viewerRef.current.scene
    const highlightColor = new THREE.Color(0x4a9eff) // Blue highlight
    const highlightIntensity = 0.5
    const selectedSet = new Set(selectedSubObjects.filter(obj => obj instanceof THREE.Mesh) as THREE.Mesh[])
    const previousHighlighted = previousHighlightedRef.current
    const originalMaterials = originalMaterialsRef.current
    
    // Remove highlight from objects that are no longer selected
    previousHighlighted.forEach((obj) => {
      if (!selectedSet.has(obj) && obj.material) {
        const stored = originalMaterials.get(obj)
        if (stored) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          
          materials.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial || 
                mat instanceof THREE.MeshPhysicalMaterial ||
                mat instanceof THREE.MeshLambertMaterial ||
                mat instanceof THREE.MeshPhongMaterial) {
              if (stored.originalEmissive) {
                mat.emissive = stored.originalEmissive.clone()
              } else {
                mat.emissive = new THREE.Color(0x000000)
              }
              if ('emissiveIntensity' in mat) {
                mat.emissiveIntensity = stored.originalEmissiveIntensity
              }
              mat.needsUpdate = true
            } else if (mat instanceof THREE.MeshBasicMaterial) {
              // MeshBasicMaterial doesn't have emissive property, skip it
              mat.needsUpdate = true
            }
          })
        }
        previousHighlighted.delete(obj)
      }
    })
    
    // Highlight newly selected objects
    selectedSet.forEach((obj) => {
      if (!previousHighlighted.has(obj) && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        let storedOriginal = originalMaterials.get(obj)
        
        if (!storedOriginal) {
          // Store original emissive properties for first material (assuming all materials are similar)
          const firstMat = materials[0]
          const originalEmissive = firstMat instanceof THREE.MeshStandardMaterial || 
                                  firstMat instanceof THREE.MeshPhysicalMaterial ||
                                  firstMat instanceof THREE.MeshLambertMaterial ||
                                  firstMat instanceof THREE.MeshPhongMaterial
            ? (firstMat.emissive ? firstMat.emissive.clone() : new THREE.Color(0x000000))
            : null
          const originalEmissiveIntensity = 'emissiveIntensity' in firstMat && typeof firstMat.emissiveIntensity === 'number'
            ? firstMat.emissiveIntensity
            : 1.0
          
          storedOriginal = { originalEmissive, originalEmissiveIntensity }
          originalMaterials.set(obj, storedOriginal)
        }
        
        // Apply highlight (emissive color)
        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial || 
              mat instanceof THREE.MeshPhysicalMaterial ||
              mat instanceof THREE.MeshLambertMaterial ||
              mat instanceof THREE.MeshPhongMaterial) {
            mat.emissive = highlightColor.clone()
            if ('emissiveIntensity' in mat) {
              mat.emissiveIntensity = highlightIntensity
            }
            mat.needsUpdate = true
          } else if (mat instanceof THREE.MeshBasicMaterial) {
            // MeshBasicMaterial doesn't have emissive property, skip it
            mat.needsUpdate = true
          }
        })
        
        previousHighlighted.add(obj)
      }
    })
    
    return () => {
      // Cleanup: restore all highlights on unmount
      previousHighlighted.forEach((obj) => {
        const stored = originalMaterials.get(obj)
        if (stored && obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          
          materials.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial || 
                mat instanceof THREE.MeshPhysicalMaterial ||
                mat instanceof THREE.MeshLambertMaterial ||
                mat instanceof THREE.MeshPhongMaterial) {
              if (stored.originalEmissive) {
                mat.emissive = stored.originalEmissive.clone()
              } else {
                mat.emissive = new THREE.Color(0x000000)
              }
              if ('emissiveIntensity' in mat) {
                mat.emissiveIntensity = stored.originalEmissiveIntensity
              }
              mat.needsUpdate = true
            } else if (mat instanceof THREE.MeshBasicMaterial) {
              // MeshBasicMaterial doesn't have emissive property, skip it
              mat.needsUpdate = true
            }
          })
        }
      })
      previousHighlighted.clear()
    }
  }, [selectedSubObjects])

  // Update pixel ratio and upscaling when quality settings change
  const upscalingEnabled = useAppStore((state) => state.upscalingEnabled)
  const upscalingQuality = useAppStore((state) => state.upscalingQuality)
  const weatherQualityForPixelRatio = useAppStore((state) => state.weatherQuality)
  
  useEffect(() => {
    if (!viewerRef.current) return
    const { renderer } = viewerRef.current
    
    // Calculate pixel ratio based on settings
    let effectivePixelRatio: number
    if (pixelRatio >= 0) {
      effectivePixelRatio = pixelRatio
    } else {
      effectivePixelRatio = getEffectivePixelRatio(
        window.devicePixelRatio,
        maxPixelRatio,
        containerRef.current?.clientWidth ?? window.innerWidth,
        weatherQualityForPixelRatio
      )
    }
    
    // Apply upscaling by adjusting pixel ratio
    if (upscalingEnabled) {
      // Reduce effective pixel ratio based on upscaling quality
      // e.g., 70% quality = render at 0.7x pixel ratio, browser upscales to 1.0x
      effectivePixelRatio = effectivePixelRatio * (upscalingQuality / 100)
    }
    
    renderer.setPixelRatio(effectivePixelRatio)
  }, [pixelRatio, maxPixelRatio, upscalingEnabled, upscalingQuality, weatherQualityForPixelRatio])

  // Resize viewer when panels toggle and re-center selected object
  useEffect(() => {
    if (!viewerRef.current) return
    const { renderer, camera, frameObject, pivotWrappers, controls } = viewerRef.current
    
    // Use a small delay to allow CSS transition to complete
    const timeout = setTimeout(() => {
      if (!containerRef.current) return
      
      // Get the actual visible viewport dimensions (after panels have opened/closed)
      const rect = containerRef.current.getBoundingClientRect()
      const width = rect.width
      const height = rect.height

              // Update camera and renderer size
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false) // false = don't update style, just render size
        
        // Update post-processing system size
        if (viewerRef.current?.postProcessingSystem) {
          viewerRef.current.postProcessingSystem.setSize(width, height)
        }
      
      // Update pixel ratio after resize
      let effectivePixelRatio: number
      if (pixelRatio >= 0) {
        effectivePixelRatio = pixelRatio
      } else {
        effectivePixelRatio = getEffectivePixelRatio(
          window.devicePixelRatio,
          maxPixelRatio,
          width,
          useAppStore.getState().weatherQuality
        )
      }
      renderer.setPixelRatio(effectivePixelRatio)
      
      // Re-center the selected object so it stays in the middle of the visible viewport
      // BUT only if user is not actively dragging transform controls
      // Check if transform controls are currently dragging by trying to access the property
      const transformControlsDragging = (viewerRef.current?.transformControls as any)?.dragging || false
      
      const currentSelected = useAppStore.getState().selectedObject
      if (currentSelected && !transformControlsDragging) {
        // Get the pivot wrapper if it exists, otherwise use the object itself
        const pivot = pivotWrappers?.get(currentSelected)
        const objectToFrame = pivot || currentSelected
        
        if (objectToFrame) {
          // Update world matrices before framing
          objectToFrame.updateMatrixWorld(true)
          
          // Frame the object PRESERVING zoom distance (only adjust position to keep centered)
          // This ensures zoom stays consistent when panels toggle
          frameObject(objectToFrame, true) // preserveZoom = true
          
          // Ensure controls are updated after framing
          controls.update()
          
          // Force a render update
          renderer.render(viewerRef.current!.scene, camera)
        }
      }
    }, 400) // Slightly longer than CSS transition (300ms) to ensure layout is complete

    return () => clearTimeout(timeout)
  }, [showMaterialPanel, selectedObject, showLightingPanel])

  // Separate effect to update transform controls when mode or selection changes
  useEffect(() => {
    if (!viewerRef.current?.transformControls) return

    const transformControls = viewerRef.current.transformControls

    const effectiveMode =
      transformMode ||
      (selectedObject instanceof THREE.Light ? 'translate' : null)

    if (effectiveMode && selectedObject) {
      // Verify object is still in the scene (not deleted)
      const scene = viewerRef.current.scene
      let objectStillInScene = false
      scene.traverse((obj) => {
        if (obj === selectedObject) {
          objectStillInScene = true
        }
      })
      
      // If object was deleted, detach controls
      if (!objectStillInScene) {
        transformControls.detach()
        return
      }
      
        // Check for hotspots FIRST (before other Object3D checks)
        // Hotspots are sprites (which extend Object3D) but should be handled specially
        if (selectedObject.userData?.isHotspot) {
          // Hotspots can only be moved (translated), not rotated or scaled
          transformControls.setMode('translate') // Force translate for hotspots
          console.log('[ViewerCanvas] Attaching transform controls to hotspot:', {
            hotspotId: selectedObject.userData.hotspotId,
            name: selectedObject.userData.hotspotName,
            position: selectedObject.position,
            hasParent: !!selectedObject.parent,
            inScene: viewerRef.current?.scene?.children.includes(selectedObject) || false
          })
          // CRITICAL: Only attach if object is in scene graph
          if (selectedObject.parent !== null) {
            try {
              // Set translate mode for hotspots (easiest to move)
              transformControls.setMode('translate')
              transformControls.setSpace('world') // Use world space for easier movement
              transformControls.attach(selectedObject)
              console.log('[ViewerCanvas] Transform controls attached to hotspot successfully')
            } catch (error) {
              console.error(`[ViewerCanvas] Failed to attach transform controls to hotspot:`, error)
            }
          } else {
            console.warn('[ViewerCanvas] Cannot attach transform controls to hotspot - object has no parent (not in scene)')
          }
        }
        // Check for hotspot endpoints (draggable line endpoint handles)
        else if (selectedObject.userData?.isHotspotEndpoint) {
          // Endpoints can only be moved (translated), not rotated or scaled
          transformControls.setMode('translate') // Force translate for endpoints
          console.log('[ViewerCanvas] Attaching transform controls to hotspot endpoint:', {
            hotspotId: selectedObject.userData.hotspotId,
            position: selectedObject.position,
            hasParent: !!selectedObject.parent,
            inScene: viewerRef.current?.scene?.children.includes(selectedObject) || false
          })
          // CRITICAL: Only attach if object is in scene graph
          if (selectedObject.parent !== null) {
            try {
              transformControls.attach(selectedObject)
              console.log('[ViewerCanvas] Transform controls attached to hotspot endpoint successfully')
            } catch (error) {
              console.error(`[ViewerCanvas] Failed to attach transform controls to hotspot endpoint:`, error)
            }
          } else {
            console.warn('[ViewerCanvas] Cannot attach transform controls to hotspot endpoint - object has no parent (not in scene)')
          }
        }
        // Get pivot wrapper if it exists (created during selection)
        // For now, we'll recreate it if needed - the pivot is managed in selectObject
        // We need to access the pivot from the closure or recreate it
        else if (selectedObject instanceof THREE.Object3D && selectedObject.userData?.isModel) {
          // The pivot should already be created in selectObject
          // Find the pivot wrapper in the scene
          let foundPivot: THREE.Group | null = null
          scene.traverse((obj) => {
            if (obj.userData.isPivotWrapper && obj.userData.originalModel === selectedObject) {
              foundPivot = obj as THREE.Group
            }
          })
          
          // Check if pivot mode changed - recreate if needed
          // Use explicit type assertion to avoid TypeScript narrowing issues
          const pivot = foundPivot as THREE.Group | null
          if (pivot) {
            const pivotUserData = (pivot as any).userData
            const pivotModeChanged = pivotUserData?.pivotMode !== pivotMode
            if (pivotModeChanged) {
              // Pivot mode changed - trigger reselection to recreate pivot with correct mode
              // The selectObject function will properly remove old pivot and create new one
              // using removePivotWrapper which preserves the model's world position
              const modelToReselect = selectedObject
              if (viewerRef.current.selectObject) {
                // Reselect the object to trigger pivot recreation with new mode
                // Use setTimeout to avoid re-entrancy issues
                setTimeout(() => {
                  if (viewerRef.current?.selectObject && modelToReselect) {
                    viewerRef.current.selectObject(modelToReselect)
                  }
                }, 0)
              }
              return
            }
            
            // Pivot exists and mode is correct - attach transform controls
            const pivotParent = (pivot as THREE.Object3D).parent
            if (pivotParent !== null) {
              // CRITICAL: Only attach if pivot is in scene graph
              try {
                transformControls.setMode(effectiveMode)
                transformControls.attach(pivot)
              } catch (error) {
                console.warn(`[ViewerCanvas] Failed to attach transform controls to pivot:`, error)
              }
              return
            }
          }
          
          // No pivot or pivot not in scene - attach directly to model
          if (selectedObject.parent !== null) {
            // Fallback: attach directly (will use object origin, not center)
            // CRITICAL: Only attach if object is in scene graph
            try {
              transformControls.setMode(effectiveMode)
              transformControls.attach(selectedObject)
            } catch (error) {
              console.warn(`[ViewerCanvas] Failed to attach transform controls to object:`, error)
            }
          }
        } else if (selectedObject instanceof THREE.Light) {
        // Allow both translate and rotate modes for lights
        const modeToUse = effectiveMode || 'translate'
        transformControls.setMode(modeToUse)
        const gizmo = viewerRef.current.lightToGizmo?.get(selectedObject as THREE.Light)
        const objectToAttach = (gizmo as THREE.Object3D) || selectedObject
        
        // Initialize gizmo rotation based on light direction when switching to rotate mode
        if (gizmo && modeToUse === 'rotate') {
          if (selectedObject instanceof THREE.DirectionalLight || selectedObject instanceof THREE.SpotLight) {
            const lightDirection = computeLightDirection(selectedObject)
            if (lightDirection) {
              const defaultDirection = new THREE.Vector3(0, -1, 0)
              _tempQuat.setFromUnitVectors(defaultDirection, lightDirection.normalize())
              gizmo.quaternion.copy(_tempQuat)
              gizmo.updateMatrixWorld()
            }
          } else if (selectedObject instanceof THREE.RectAreaLight) {
            gizmo.quaternion.copy(selectedObject.quaternion)
            gizmo.updateMatrixWorld()
          }
        }
        
        // CRITICAL: Only attach if object is in scene graph
        if (objectToAttach.parent !== null) {
          try {
            transformControls.attach(objectToAttach)
          } catch (error) {
            console.warn(`[ViewerCanvas] Failed to attach transform controls to light/gizmo:`, error)
          }
        }
      }
      // Note: Camera centering is now only done on double-click, not on selection or transform mode change
      
      // Enable pointer events on canvas when transform controls are attached (for gizmo visibility/interaction)
      if (viewerRef.current?.renderer) {
        applyViewerCanvasPointerEvents(
          viewerRef.current.renderer.domElement,
          useAppStore.getState(),
          transformControls
        )
      }
    } else {
      transformControls.detach()
      
      if (viewerRef.current?.renderer) {
        applyViewerCanvasPointerEvents(
          viewerRef.current.renderer.domElement,
          useAppStore.getState(),
          transformControls
        )
      }
    }
  }, [transformMode, selectedObject, pivotMode, streetsGLIframeOverlay, renderMode, streetsGLIframeInteractive])

  // Re-enable transform gizmo + orbit controls after path tracer exits
  useEffect(() => {
    if (!viewerRef.current?.transformControls || pathTracerActive) return

    const viewer = viewerRef.current
    const transformControls = viewer.transformControls
    if (!transformControls) return

    ;(transformControls as any).enabled = true

    const controls = viewer.controls
    if (controls) {
      controls.enabled = true
      controls.enableRotate = true
      controls.enablePan = true
      controls.enableZoom = true
      controls.update()
    }

    const { selectedObject: currentSelection, transformMode: currentMode } = useAppStore.getState()
    const effectiveMode =
      currentMode || (currentSelection instanceof THREE.Light ? 'translate' : null)

    if (!effectiveMode || !currentSelection || !viewer.selectObject) return

    const reattach = () => {
      if (useAppStore.getState().pathTracerActive) return
      viewer.selectObject?.(currentSelection)
      if (viewer.renderer) {
        applyViewerCanvasPointerEvents(
          viewer.renderer.domElement,
          useAppStore.getState(),
          transformControls
        )
      }
    }

    requestAnimationFrame(() => {
      reattach()
      setTimeout(reattach, 0)
      setTimeout(reattach, 100)
    })
  }, [pathTracerActive, selectedObject, transformMode])

  useEffect(() => {
    if (!viewerRef.current) return
    const gizmosMap = viewerRef.current.lightGizmos as Map<string, THREE.Object3D> | undefined
    const lightToGizmoMap = viewerRef.current.lightToGizmo as WeakMap<THREE.Light, THREE.Object3D> | undefined
    const gizmoToLightMap = viewerRef.current.gizmoToLight as WeakMap<THREE.Object3D, THREE.Light> | undefined
    const cameraRef = viewerRef.current.camera
    if (!gizmosMap || !lightToGizmoMap || !gizmoToLightMap) return

    gizmosMap.forEach((gizmo) => {
      const linkedLight = gizmoToLightMap.get(gizmo) ?? null
      setLightGizmoSelected(gizmo, false, cameraRef, linkedLight)
    })

    if (selectedObject instanceof THREE.Light) {
      const gizmo = lightToGizmoMap.get(selectedObject)
      if (gizmo) {
        setLightGizmoSelected(gizmo, true, cameraRef, selectedObject)
      }
    }
  }, [selectedObject])

  // IMPROVED: Effect to periodically update shadow camera bounds to accommodate object movement
  // This ensures shadows work even when objects are moved far away
  // Update more frequently (250ms instead of 500ms) for better quality on close objects
  useEffect(() => {
    if (!viewerRef.current) return
    
    const intervalId = setInterval(() => {
      if (viewerRef.current?.updateShadowCameraBounds) {
        viewerRef.current.updateShadowCameraBounds()
      }
    }, 250) // IMPROVED: Update every 250ms for better responsiveness
    
    return () => clearInterval(intervalId)
  }, [])

  // Effect to update ambient light
  const ambientIntensity = useAppStore((state) => state.ambientIntensity)
  const shadowsEnabled = useAppStore((state) => state.shadowsEnabled)
  const shadowIntensity = useAppStore((state) => state.shadowIntensity)
  const shadowBias = useAppStore((state) => state.shadowBias)
  const shadowPlaneTransparent = useAppStore((state) => state.shadowPlaneTransparent)
  const showShadowPlane = useAppStore((state) => state.showShadowPlane)
  const shadowMapSize = useAppStore((state) => state.shadowMapSize)
  const useAdaptiveShadowSettings = useAppStore((state) => state.useAdaptiveShadowSettings)
  const gridSize = useAppStore((state) => state.gridSize)
  const hdrEnabled = useAppStore((state) => state.hdrEnabled)
  const hdrIntensity = useAppStore((state) => state.hdrIntensity)
  const hdrGroundProjectionEnabled = useAppStore((state) => state.hdrGroundProjectionEnabled)

  useEffect(() => {
    if (!viewerRef.current) return
    const { renderer, scene, directionalLights } = viewerRef.current
    
    // Respect store shadow toggle and lighting-mode authority (CSM vs legacy sun maps)
    if (renderer) {
      renderer.shadowMap.enabled = shadowsEnabled

      if (shadowsEnabled && renderer.shadowMap.type !== THREE.PCFSoftShadowMap) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
      }
    }

    const store = useAppStore.getState()
    const csmSystem = viewerRef.current?.csmShadowSystem
    const csmActive = csmSystem?.isEnabled() ?? false
    const lightingMode = resolveLightingMode({
      enableStandaloneWeather: store.enableStandaloneWeather,
      streetsGLIframeOverlay: store.streetsGLIframeOverlay,
      pathTracerActive: store.pathTracerActive,
      hdrEnabled: store.hdrEnabled,
      hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
      csmEnabled: csmActive
    })

    const lightsMap = viewerRef.current.directionalLights
    const lightsConfig = store.directionalLights

    lightsMap.forEach((light, lightId) => {
      const lightConfig = lightsConfig.find((l) => l.id === lightId)
      if (!lightConfig) return

      const shouldCastShadow = resolveDirectionalCastShadow({
        mode: lightingMode,
        csmEnabled: csmActive,
        isSun: !!lightConfig.isSun,
        enabled: lightConfig.enabled,
        castShadowConfig: !!lightConfig.castShadow,
        shadowsEnabled
      })

      light.castShadow = shouldCastShadow
      if (shouldCastShadow && light.shadow) {
        light.shadow.needsUpdate = true
        if (light.shadow.camera) {
          light.shadow.camera.updateProjectionMatrix()
        }
      }
    })

    if (store.hdrEnabled && scene.environment) {
      viewerRef.current?.indirectLightingSystem?.refreshShadowContrast()
      const contrastCount = applyHdrShadowContrastToMaterials(
        scene,
        store.hdrIntensity,
        shadowsEnabled
      )
      if (contrastCount > 0) {
        console.log(
          `[ShadowDebug] HDR shadow contrast applied to ${contrastCount} material(s) (shadows ${shadowsEnabled ? 'on' : 'off'})`
        )
      }
    }
    
  const useHdrGroundShadowCatcher = shouldUseHdrGroundShadowCatcher({
    hdrEnabled: store.hdrEnabled,
    hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
    shadowsEnabled,
    showShadowPlane
  })
  const effectiveShowShadowPlane = effectiveShadowPlaneVisible(showShadowPlane, {
    hdrEnabled: store.hdrEnabled,
    hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
    shadowsEnabled
  })

    // Update shadow plane visibility
    scene.traverse((obj) => {
      if (obj.userData.isShadowPlane && obj instanceof THREE.Mesh) {
        const hiddenForPathTracer = Boolean(obj.userData.__hiddenForPathTracer)
        obj.visible = hiddenForPathTracer ? false : effectiveShowShadowPlane
        obj.receiveShadow = true

        if (useHdrGroundShadowCatcher) {
          applyHdrGroundShadowCatcherMaterial(obj, shadowIntensity)
        }
      }
    })
    
    if (csmActive && csmSystem) {
      // Apply shadow bias to CSM system
      if (!useAdaptiveShadowSettings) {
        const shadowBiasOverride = useAppStore.getState().shadowBiasOverride
        const shadowNormalBiasOverride = useAppStore.getState().shadowNormalBiasOverride
        csmSystem.setShadowBias(shadowBiasOverride)
        csmSystem.setShadowNormalBias(shadowNormalBiasOverride)
      } else {
        // Use store shadowBias when adaptive is enabled
        csmSystem.setShadowBias(shadowBias)
        csmSystem.setShadowNormalBias(useAppStore.getState().shadowNormalBiasOverride || 0.01)
      }
    } else {
      // Apply shadow bias to standard Three.js lights
      if (!useAdaptiveShadowSettings) {
        // Manual mode: Use shadowBiasOverride from store (set by slider)
        const shadowBiasOverride = useAppStore.getState().shadowBiasOverride
        const shadowNormalBiasOverride = useAppStore.getState().shadowNormalBiasOverride
        
        directionalLights.forEach((light) => {
          if (light.shadow && light.castShadow) {
            light.shadow.bias = shadowBiasOverride
            light.shadow.normalBias = shadowNormalBiasOverride
            light.shadow.needsUpdate = true
          }
        })
      } else {
        // Adaptive mode: Let updateShadowCameraBounds calculate adaptive bias
        // But first apply shadowBias as base value, then updateShadowCameraBounds will refine it
        directionalLights.forEach((light) => {
          if (light.shadow && light.castShadow) {
            // Set base bias value
            light.shadow.bias = shadowBias
            light.shadow.needsUpdate = true
          }
        })
        
        // Update shadow camera bounds to calculate adaptive bias
        // This will refine the bias based on object size, but won't override if we're in manual mode
        if (viewerRef.current?.updateShadowCameraBounds) {
          viewerRef.current.updateShadowCameraBounds()
        }
      }
    }
    
    // v1.7: Update shadow plane material based on transparent option and intensity
    scene.traverse((obj) => {
      if (obj.userData.isShadowPlane && obj instanceof THREE.Mesh) {
        if (useHdrGroundShadowCatcher) {
          applyHdrGroundShadowCatcherMaterial(obj, shadowIntensity)
          return
        }

        const currentMaterial = obj.material
        if (shadowPlaneTransparent) {
          // Use ShadowMaterial for transparent shadows
          // ShadowMaterial opacity: 0 = no shadow, 1 = fully dark shadow
          // Scale from 0.1 (very light) at intensity 0 to 1.0 (fully dark) at intensity 2.0
          const shadowOpacity = Math.min(1.0, 0.1 + (shadowIntensity / 2.0) * 0.9)
          
          if (!(currentMaterial instanceof THREE.ShadowMaterial)) {
            // Dispose old material
            if (currentMaterial instanceof THREE.Material) {
              currentMaterial.dispose()
            }
            const shadowMaterial = new THREE.ShadowMaterial({ 
              opacity: shadowOpacity
            })
            // CRITICAL: ShadowMaterial needs depthWrite = true for shadows to render
            shadowMaterial.depthWrite = true
            obj.material = shadowMaterial
          } else {
            // Already ShadowMaterial, update opacity based on intensity
            (currentMaterial as THREE.ShadowMaterial).opacity = shadowOpacity
            // Ensure depthWrite is still true
            if (currentMaterial.depthWrite !== true) {
              currentMaterial.depthWrite = true
            }
          }
        } else {
          // Use MeshStandardMaterial with semi-transparent appearance
          // For non-transparent mode, make the plane darker to show shadows better
          const planeOpacity = Math.min(1.0, 0.3 + (shadowIntensity / 2.0) * 0.7)
          
          if (!(currentMaterial instanceof THREE.MeshStandardMaterial)) {
            // Dispose old material
            if (currentMaterial instanceof THREE.Material) {
              currentMaterial.dispose()
            }
            const standardMaterial = new THREE.MeshStandardMaterial({ 
              color: 0x333333,
              transparent: true,
              opacity: planeOpacity,
              side: THREE.DoubleSide,
              depthWrite: true // CRITICAL: Required for shadows to render on the plane
            })
            obj.material = standardMaterial
          } else {
            // Update opacity based on shadow intensity
            (currentMaterial as THREE.MeshStandardMaterial).opacity = planeOpacity
            // CRITICAL: Ensure depthWrite is true for shadows
            if (currentMaterial.depthWrite !== true) {
              currentMaterial.depthWrite = true
              currentMaterial.needsUpdate = true
            }
          }
        }
        
        // CRITICAL: Ensure shadow plane always has correct shadow properties
        obj.receiveShadow = true
        obj.castShadow = false // Shadow plane should not cast shadows
        
        // Ensure material has depthWrite = true (required for shadows)
        const material = obj.material
        if (material && material.depthWrite !== true) {
          material.depthWrite = true
          material.needsUpdate = true
        }
        
        obj.material.needsUpdate = true
      }
    })
  }, [shadowsEnabled, shadowIntensity, shadowPlaneTransparent, shadowBias, showShadowPlane, shadowMapSize, useAdaptiveShadowSettings, hdrEnabled, hdrIntensity, hdrGroundProjectionEnabled])
  
  // Effect to update shadow map size and bias settings when they change
  useEffect(() => {
    if (!viewerRef.current) return

    const store = useAppStore.getState()
    const csmSystem = viewerRef.current.csmShadowSystem
    const csmActive = csmSystem?.isEnabled() ?? false
    const lightingMode = resolveLightingMode({
      enableStandaloneWeather: store.enableStandaloneWeather,
      streetsGLIframeOverlay: store.streetsGLIframeOverlay,
      pathTracerActive: store.pathTracerActive,
      hdrEnabled: store.hdrEnabled,
      hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
      csmEnabled: csmActive
    })

    if (shouldUseWeatherShadowMapTiers(lightingMode, csmActive)) {
      // Weather quality preset owns CSM resolution — ignore manual shadowMapSize slider
      return
    }

    if (csmActive && csmSystem) {
      // Apply settings to CSM shadow system
      
      // Update shadow map size (recreates CSM)
      csmSystem.setShadowMapSize(shadowMapSize)
      
      // Update bias settings
      if (!useAdaptiveShadowSettings) {
        const shadowBiasOverride = useAppStore.getState().shadowBiasOverride
        const shadowNormalBiasOverride = useAppStore.getState().shadowNormalBiasOverride
        csmSystem.setShadowBias(shadowBiasOverride)
        csmSystem.setShadowNormalBias(shadowNormalBiasOverride)
      } else {
        // Use store shadowBias when adaptive is enabled
        const shadowBias = useAppStore.getState().shadowBias
        const shadowNormalBias = useAppStore.getState().shadowNormalBiasOverride || 0.01
        csmSystem.setShadowBias(shadowBias)
        csmSystem.setShadowNormalBias(shadowNormalBias)
      }
    } else {
      // Apply settings to standard Three.js shadows
      const { directionalLights } = viewerRef.current
      
      // Update shadow map size for all existing lights
      directionalLights.forEach((light) => {
        if (light.shadow && light.castShadow) {
          // Update shadow map size
          if (light.shadow.mapSize.width !== shadowMapSize || light.shadow.mapSize.height !== shadowMapSize) {
            light.shadow.mapSize.width = shadowMapSize
            light.shadow.mapSize.height = shadowMapSize
            light.shadow.needsUpdate = true
          }
          
          // Update bias settings if adaptive is disabled
          if (!useAdaptiveShadowSettings) {
            const shadowBiasOverride = useAppStore.getState().shadowBiasOverride
            const shadowNormalBiasOverride = useAppStore.getState().shadowNormalBiasOverride
            light.shadow.bias = shadowBiasOverride
            light.shadow.normalBias = shadowNormalBiasOverride
            light.shadow.needsUpdate = true
          }
        }
      })
      
      // Trigger shadow camera bounds update to recalculate adaptive bias if enabled
      if (viewerRef.current.updateShadowCameraBounds) {
        viewerRef.current.updateShadowCameraBounds()
      }
    }
  }, [shadowMapSize, useAdaptiveShadowSettings])

  // Effect to apply shadow opacity to all materials in the scene
  const shadowOpacityEnabled = useAppStore((state) => state.shadowOpacityEnabled)
  const shadowOpacity = useAppStore((state) => state.shadowOpacity)
  const shadowColor = useAppStore((state) => state.shadowColor)
  
  useEffect(() => {
    if (!viewerRef.current) return
    const { scene } = viewerRef.current
    
    // Calculate effective shadow opacity based on shadow intensity or explicit opacity setting
    // Shadow intensity (0-2) controls shadow darkness: 0 = no shadow, 2 = very dark
    // When shadow opacity is explicitly enabled, use that value; otherwise derive from intensity
    const effectiveOpacity = shadowOpacityEnabled 
      ? shadowOpacity 
      : Math.min(1.0, shadowIntensity / 2.0) // Map intensity 0-2 to opacity 0-1
    
    // Using registry-based ShadowOpacityModifier for compatibility with other modifiers
    // Apply shadow opacity to all materials that receive shadows
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.receiveShadow) {
        // Skip shadow plane, grid, and axes helpers
        if (obj.userData.isShadowPlane || obj.userData.isGridHelper || obj.userData.isAxesHelper) {
          return
        }
        
        const material = obj.material
        if (material) {
          const materials = Array.isArray(material) ? material : [material]
          materials.forEach((mat: THREE.Material) => {
            // Apply shadow intensity/opacity when shadows are enabled
            // This makes shadow intensity actually affect shadow darkness on objects
            if (shadowsEnabled && effectiveOpacity > 0) {
              shadowOpacityModifierRegistry.applyToMaterial(mat, {
                enabled: true,
                opacity: effectiveOpacity,
                color: new THREE.Color(shadowColor)
              })
            } else {
              // Remove shadow opacity if disabled
              shadowOpacityModifierRegistry.removeFromMaterial(mat)
            }
          })
        }
      }
    })
  }, [shadowOpacityEnabled, shadowOpacity, shadowColor, shadowsEnabled, shadowIntensity])

  // Effect to sync multiple directional lights with store
  const directionalLightsConfig = useAppStore((state) => state.directionalLights)
  const shadowsEnabledForLights = useAppStore((state) => state.shadowsEnabled)
  const shadowBiasForLights = useAppStore((state) => state.shadowBias)
  // Sky params
  useEffect(() => {
    if (!viewerRef.current) return

    const viewer = viewerRef.current
    viewer.lightGizmos = viewer.lightGizmos || new Map()
    viewer.lightHelpers = viewer.lightHelpers || new Map()
    viewer.lightToGizmo = viewer.lightToGizmo || new WeakMap()
    viewer.gizmoToLight = viewer.gizmoToLight || new WeakMap()

    const {
      scene,
      directionalLights: lightsMap,
      startingObjectsGroup,
      lightGizmos: gizmosMap,
      lightToGizmo: lightToGizmoMap,
      gizmoToLight: gizmoToLightMap
    } = viewer

    // Remove lights that no longer exist in config
    const configIds = new Set(directionalLightsConfig.map(l => l.id))
    lightsMap.forEach((light, id) => {
      if (!configIds.has(id)) {
        // CRITICAL: Detach transform controls if this light or its gizmo is selected
        if (viewerRef.current?.transformControls) {
          const transformControls = viewerRef.current.transformControls
          const gizmo = gizmosMap?.get(id)
          const currentAttached = (transformControls as any).object
          if (currentAttached === light || currentAttached === gizmo) {
            transformControls.detach()
            // Clear selected object if it's this light or gizmo
            const currentSelected = useAppStore.getState().selectedObject
            if (currentSelected === light || currentSelected === gizmo) {
              useAppStore.getState().setSelectedObject(null)
            }
          }
        }
        
        if (startingObjectsGroup) {
          startingObjectsGroup.remove(light)
        } else {
          scene.remove(light)
        }
        // Remove helper as well
        const helpersMap = viewerRef.current?.lightHelpers || new Map()
        const helper = helpersMap.get(id)
        if (helper) {
          scene.remove(helper)
          helper.dispose()
          helpersMap.delete(id)
        }
        // Remove shadow map viewer as well
        if (viewerRef.current?.shadowMapViewers) {
          const shadowViewer = viewerRef.current.shadowMapViewers.get(id)
          if (shadowViewer) {
            viewerRef.current.shadowMapViewers.delete(id)
          }
        }
        if (gizmosMap && lightToGizmoMap && gizmoToLightMap) {
          removeLightGizmo(
            scene,
            id,
            gizmosMap as Map<string, THREE.Object3D>,
            lightToGizmoMap as WeakMap<THREE.Light, THREE.Object3D>,
            gizmoToLightMap as WeakMap<THREE.Object3D, THREE.Light>
          )
        }
        light.dispose()
        lightsMap.delete(id)
      }
    })

    // Update or create lights
    directionalLightsConfig.forEach((config) => {
      if (!config || !config.id) return
      
      // Validate position exists
      if (!config.position) {
        console.warn('Light config missing position:', config.id)
        return
      }
      
      let light = lightsMap.get(config.id)

      if (!light) {
        // Create new light using unified createLight function
        light = createLight(config, scene) as THREE.DirectionalLight
        
        if (startingObjectsGroup) {
          startingObjectsGroup.add(light)
        } else {
          scene.add(light)
        }
        lightsMap.set(config.id, light)
        
        // Add visual helper so user can see and interact with the light
        // Don't add helper for sun lights as SunMoonSystem provides the visual
        if (!config.isSun) {
          let helper: THREE.Object3D | null = null
          const lightColor = new THREE.Color(config.color || '#ffffff')
          
          if ((light as any).isDirectionalLight) {
            helper = new THREE.DirectionalLightHelper(light as unknown as THREE.DirectionalLight, 5, lightColor)
          } else if ((light as any).isPointLight) {
            helper = new THREE.PointLightHelper(light as unknown as THREE.PointLight, 1, lightColor)
          } else if ((light as any).isSpotLight) {
            helper = new THREE.SpotLightHelper(light as unknown as THREE.SpotLight, lightColor)
          } else if ((light as any).isRectAreaLight) {
            helper = new RectAreaLightHelper(light as any)
          } else if ((light as any).isHemisphereLight) {
            helper = new THREE.HemisphereLightHelper(light as unknown as THREE.HemisphereLight, 5, lightColor)
          }
          
          if (helper) {
            helper.userData.lightId = config.id
            scene.add(helper)
            // Store helper reference for updates
            const helpersMap = viewerRef.current?.lightHelpers || new Map()
            helpersMap.set(config.id, helper)
          }
        }
      }

      // CRITICAL: Always ensure gizmo is created for new lights (except sun/ambient)
      // This ensures gizmos appear immediately when lights are added
      if (gizmosMap && lightToGizmoMap && gizmoToLightMap) {
        const gizmo = ensureLightGizmo(
          scene,
          config,
          light,
          gizmosMap as Map<string, THREE.Object3D>,
          lightToGizmoMap as WeakMap<THREE.Light, THREE.Object3D>,
          gizmoToLightMap as WeakMap<THREE.Object3D, THREE.Light>,
          viewerRef.current?.camera
        )
        // CRITICAL: If gizmo was created, ensure it's visible and positioned correctly
        if (gizmo) {
          // CRITICAL: Set visibility based on showLightHelpers setting
          // Gizmos are controlled by the same setting as Three.js helpers
          const showLightHelpers = useAppStore.getState().showLightHelpers
          gizmo.visible = showLightHelpers && light.visible
          // CRITICAL: Update gizmo position to match light position
          updateLightGizmoFromLight(light, gizmo, viewerRef.current?.camera)
          
          // CRITICAL: Automatically select the light and attach transform controls when it's first created
          // This provides the same behavior as double-clicking on a light in the objects panel
          // Users can immediately drag the light around using the green/red/blue axes
          // Check if this is a newly created light (not just an update to an existing light)
          const isNewLight = !light.userData._hasBeenSelected
          if (isNewLight && gizmo && gizmo.parent !== null) {
            // Mark that we've selected this light to prevent re-selecting on every update
            light.userData._hasBeenSelected = true
            
            // Use setTimeout to ensure the gizmo is fully added to the scene and all state is ready
            setTimeout(() => {
              if (gizmo && gizmo.parent !== null && viewerRef.current?.transformControls && viewerRef.current?.selectObject) {
                try {
                  // CRITICAL: Ensure gizmo is visible before selecting (showLightHelpers might be false)
                  // We want the gizmo to be visible when transform controls are attached
                  const showLightHelpers = useAppStore.getState().showLightHelpers
                  if (showLightHelpers) {
                    gizmo.visible = true
                  }
                  
                  // Set transform mode to translate FIRST (same as double-click behavior)
                  // This ensures transform controls will be shown
                  setTransformMode('translate')
                  
                  // Select the light (this will trigger selectObject which sets up the selection state)
                  // selectObject will automatically attach transform controls and highlight the gizmo
                  // This is the same action that happens when double-clicking on a light
                  viewerRef.current.selectObject(light)
                  
                  // CRITICAL: After selecting, ensure gizmo remains visible
                  // The animation loop will maintain visibility based on showLightHelpers, but we ensure it here too
                  if (showLightHelpers && light.visible) {
                    gizmo.visible = true
                  }
                } catch (error) {
                  console.warn(`[ViewerCanvas] Failed to attach transform controls to new light gizmo:`, error)
                }
              }
            }, 0)
          }
        }
      }

      // Update existing light properties
      // Don't update sun light position/intensity/color here - weather effect controls it
      if (!config.isSun) {
        if (config.intensity !== undefined) light.intensity = config.intensity
        if (config.color) {
          light.color.set(config.color)
          // Update helper color to match (only for helpers that support color)
          const helpersMap = viewerRef.current?.lightHelpers
          if (helpersMap) {
            const helper = helpersMap.get(config.id)
            if (helper) {
              // Only set color if helper has a color property
              // DirectionalLightHelper, PointLightHelper, SpotLightHelper have color
              // RectAreaLightHelper and HemisphereLightHelper don't have color property
              if ('color' in helper && helper.color instanceof THREE.Color) {
                try {
                  helper.color.set(config.color)
                } catch (error) {
                  // Silently ignore color update errors
                  console.warn(`[ViewerCanvas] Failed to update helper color for ${config.id}:`, error)
                }
              }
            }
          }
        }
        if (config.position) {
          light.position.set(
            config.position.x ?? 0,
            config.position.y ?? 0,
            config.position.z ?? 0
          )
        }
        
        // IMPROVED: Update shadow map size if it changed in settings
        if (light.shadow && light.castShadow) {
          const shadowMapSize = useAppStore.getState().shadowMapSize
          if (light.shadow.mapSize.width !== shadowMapSize || light.shadow.mapSize.height !== shadowMapSize) {
            light.shadow.mapSize.width = shadowMapSize
            light.shadow.mapSize.height = shadowMapSize
            light.shadow.needsUpdate = true
          }
        }
        
        // Update physical light properties (point and spot lights)
        const isPointLight = (light as any).isPointLight
        const isSpotLight = (light as any).isSpotLight
        const isRectAreaLight = (light as any).isRectAreaLight
        const isHemisphereLight = (light as any).isHemisphereLight
        
        if (isPointLight || isSpotLight) {
          const physicalLight = light as unknown as THREE.PointLight | THREE.SpotLight
          
          // Update distance (attenuation distance)
          if (config.distance !== undefined) {
            physicalLight.distance = config.distance
          }
          
          // Update decay (attenuation decay)
          if (config.decay !== undefined) {
            physicalLight.decay = config.decay
          }
          
          // Update power (lumens) - this affects the light's intensity calculation
          if (config.power !== undefined) {
            physicalLight.power = config.power
          }
        }
        
        // Update spot light specific properties
        if (isSpotLight) {
          const spotLight = light as unknown as THREE.SpotLight
          
          // Update angle (cone angle in radians)
          if (config.angle !== undefined) {
            spotLight.angle = config.angle
            // Update shadow camera FOV to match angle
            if (spotLight.shadow) {
              spotLight.shadow.camera.fov = config.angle * (180 / Math.PI)
              spotLight.shadow.camera.updateProjectionMatrix()
            }
          }
          
          // Update penumbra (soft edge of spotlight cone, 0-1)
          if (config.penumbra !== undefined) {
            spotLight.penumbra = config.penumbra
          }
          
          // Update target position
          if (config.target) {
            spotLight.target.position.set(
              config.target.x ?? 0,
              config.target.y ?? 0,
              config.target.z ?? 0
            )
            // Ensure target is in scene
            if (!spotLight.target.parent) {
              scene.add(spotLight.target)
            }
          }
        }
        
        // Update rect area light specific properties
        if (isRectAreaLight) {
          const rectLight = light as unknown as THREE.RectAreaLight
          
          // Update width
          if (config.width !== undefined) {
            rectLight.width = config.width
          }
          
          // Update height
          if (config.height !== undefined) {
            rectLight.height = config.height
          }
          
          // Update power (lumens)
          if (config.power !== undefined) {
            rectLight.power = config.power
          }
          
          // Update target/rotation
          // RectAreaLight uses lookAt() to control direction (unlike DirectionalLight/SpotLight which use target)
          if (config.target && config.position) {
            // Calculate target position directly (target is absolute position, not relative)
            const targetPos = new THREE.Vector3(
              config.target.x ?? 0,
              config.target.y ?? 0,
              config.target.z ?? 0
            )
            // Update light rotation to face target using lookAt
            rectLight.lookAt(targetPos)
          }
        }
        
        // Update directional light target (controls light direction/rotation)
        if (light instanceof THREE.DirectionalLight) {
          // Update target position if provided
          if (config.target) {
            light.target.position.set(
              config.target.x ?? 0,
              config.target.y ?? 0,
              config.target.z ?? 0
            )
            // Ensure target is in scene
            if (!light.target.parent) {
              scene.add(light.target)
            }
          }
        }
        
        // Update hemisphere light specific properties
        if (isHemisphereLight) {
          const hemisphereLight = light as unknown as THREE.HemisphereLight
          
          // Update ground color
          if (config.groundColor) {
            hemisphereLight.groundColor.set(config.groundColor)
          }
        }
      }
      light.visible = config.enabled

      if (gizmosMap) {
        const gizmo = gizmosMap.get(config.id)
        if (gizmo) {
        updateLightGizmoFromLight(light, gizmo, viewerRef.current?.camera)
        }
      }
      
      // v1.7: Simple shadow configuration — respect lighting mode authority
      const store = useAppStore.getState()
      const csmActive = viewerRef.current?.csmShadowSystem?.isEnabled() ?? false
      const lightingMode = resolveLightingMode({
        enableStandaloneWeather: store.enableStandaloneWeather,
        streetsGLIframeOverlay: store.streetsGLIframeOverlay,
        pathTracerActive: store.pathTracerActive,
        hdrEnabled: store.hdrEnabled,
        hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
        csmEnabled: csmActive
      })
      const shouldCastShadow = resolveDirectionalCastShadow({
        mode: lightingMode,
        csmEnabled: csmActive,
        isSun: !!config.isSun,
        enabled: config.enabled,
        castShadowConfig: !!config.castShadow,
        shadowsEnabled: shadowsEnabledForLights
      })
      
      // Configure shadow if needed
      if (shouldCastShadow && ((light as any).isDirectionalLight || (light as any).isPointLight || (light as any).isSpotLight)) {
        const shadow = (light as any).shadow
        // Shadow is automatically created with DirectionalLight, just ensure it exists and configure it
        if (shadow) {
          // v1.7: Ultra-high resolution for crisp shadows (like Twinmotion)
          // IMPROVED: Use adaptive shadow map size and bias for better quality on close objects
          const shadowMapSize = useAppStore.getState().shadowMapSize
          shadow.mapSize.width = shadowMapSize
          shadow.mapSize.height = shadowMapSize
          // Initial bias will be refined in updateShadowCameraBounds based on object size
          shadow.bias = shadowBiasForLights
          // IMPROVED: Use initial normal bias - will be refined in updateShadowCameraBounds
          // Normal bias helps reduce shadow acne on surfaces with sharp angles
          shadow.normalBias = PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS
          // Physical-reference subtle PCF softness (see physicalShadowSettings.ts)
          shadow.radius = config.shadowRadius ?? PHYSICAL_DIRECTIONAL_SHADOW_RADIUS
          shadow.needsUpdate = true
          
          // Configure shadow camera based on light type
          if ((light as any).isDirectionalLight) {
            // CRITICAL: Use smaller near plane to capture interior surfaces
            // 0.01 allows the shadow camera to see very close surfaces (like inside a car)
            shadow.camera.near = 0.01
            shadow.camera.far = 5000
            shadow.camera.left = -2000
            shadow.camera.right = 2000
            shadow.camera.top = 2000
            shadow.camera.bottom = -2000
            // Shadow camera bounds will be updated at the end via updateAllShadowCameraBounds
          } else if ((light as any).isPointLight) {
            // Use smaller near plane for point lights to capture interior shadows
            shadow.camera.near = 0.01
            shadow.camera.far = config.distance ?? 100
          } else if ((light as any).isSpotLight) {
            // Use smaller near plane for spot lights to capture interior shadows
            shadow.camera.near = 0.01
            shadow.camera.far = config.distance ?? 100
            shadow.camera.fov = (config.angle ?? Math.PI / 6) * (180 / Math.PI)
          }
          
          // Shadow bounds will be updated at the end
        }
      }
      
      // v1.7: Simple castShadow assignment
      light.castShadow = shouldCastShadow
      
      // Create or remove shadow map viewer for shadow-casting lights
      if (viewerRef.current?.shadowMapViewers) {
        const shadowMapViewersMap = viewerRef.current.shadowMapViewers
        const lightHasShadow = (light as any).shadow !== undefined
        if (shouldCastShadow && lightHasShadow) {
          let shadowViewer = shadowMapViewersMap.get(config.id)
          if (!shadowViewer) {
            // Create new shadow map viewer
            shadowViewer = new ShadowMapViewer(light as any)
            shadowMapViewersMap.set(config.id, shadowViewer)
            // Set initial position and size from store
            const shadowMapViewerPosition = useAppStore.getState().shadowMapViewerPosition
            const shadowMapViewerSize = useAppStore.getState().shadowMapViewerSize
            shadowViewer.position.x = shadowMapViewerPosition.x
            shadowViewer.position.y = shadowMapViewerPosition.y
            shadowViewer.size.width = shadowMapViewerSize
            shadowViewer.size.height = shadowMapViewerSize
            shadowViewer.update()
          }
        } else {
          // Remove shadow map viewer if light no longer casts shadows
          const shadowViewer = shadowMapViewersMap.get(config.id)
          if (shadowViewer) {
            shadowMapViewersMap.delete(config.id)
          }
        }
      }
    })
    
    // v1.7: Update shadow camera bounds for all shadow-casting lights after scene changes
    // Calculate bounding box of all objects that cast shadows
    // CRITICAL: Must traverse into groups (pivot wrappers, model groups) to find actual meshes
    const box = new THREE.Box3()
    let hasObjects = false
    
    scene.traverse((obj) => {
      // Skip helpers, gizmos, and system objects
      if (obj.userData.isShadowPlane || 
          obj.userData.isGridHelper || 
          obj.userData.isAxesHelper ||
          obj.userData.isLightGizmo ||
          obj.userData.isLightHelper ||
          obj.userData.isTransformControls ||
          obj.userData.isGroundedSkybox ||
          obj.userData.isDynamicSky ||
          obj.userData.isSun ||
          obj.userData.isMoon) {
        return
      }
      
      // Check if this is a mesh that casts shadows
      if (obj instanceof THREE.Mesh && obj.castShadow) {
        const objBox = new THREE.Box3().setFromObject(obj)
        if (!objBox.isEmpty()) {
          if (!hasObjects) {
            box.copy(objBox)
            hasObjects = true
          } else {
            box.union(objBox)
          }
        }
      } else if (obj instanceof THREE.Group || obj instanceof THREE.Object3D) {
        // For groups (like pivot wrappers or model groups), check if any child meshes cast shadows
        // This ensures models wrapped in groups are included in shadow calculations
        let groupHasShadowCastingMeshes = false
        const groupBox = new THREE.Box3()
        
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.castShadow) {
            const childBox = new THREE.Box3().setFromObject(child)
            if (!childBox.isEmpty()) {
              if (!groupHasShadowCastingMeshes) {
                groupBox.copy(childBox)
                groupHasShadowCastingMeshes = true
              } else {
                groupBox.union(childBox)
              }
            }
          }
        })
        
        if (groupHasShadowCastingMeshes && !groupBox.isEmpty()) {
          if (!hasObjects) {
            box.copy(groupBox)
            hasObjects = true
          } else {
            box.union(groupBox)
          }
        }
      }
    })
    
    lightsMap.forEach((light: THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight) => {
      if (light.shadow && light.castShadow) {
        if (hasObjects && !box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          
          // CRITICAL: Use a much smaller near plane to capture interior surfaces
          // 0.01 allows the shadow camera to see very close surfaces (like inside a car)
          light.shadow.camera.near = 0.01
          
          // Configure shadow camera based on light type
          if (light instanceof THREE.DirectionalLight) {
            // Directional lights use orthographic camera
            const shadowSize = Math.max(maxDim * 5, 200)
            light.shadow.camera.left = -shadowSize
            light.shadow.camera.right = shadowSize
            light.shadow.camera.top = shadowSize
            light.shadow.camera.bottom = -shadowSize
            light.shadow.camera.far = Math.max(size.y * 5, maxDim * 8, 2000)
            light.shadow.camera.position.copy(light.position)
            light.shadow.camera.lookAt(center)
          } else if (light instanceof THREE.SpotLight) {
            // Spot lights use perspective camera - fov is already set, just update far plane
            // Calculate distance from light to center of objects
            const lightToCenter = new THREE.Vector3().subVectors(center, light.position)
            const distance = lightToCenter.length()
            // Set far plane to cover objects plus some margin
            light.shadow.camera.far = Math.max(distance + maxDim * 2, 200)
            // Ensure spot light target is pointing at center of objects
            if (light.target) {
              light.target.position.copy(center)
            }
          } else if (light instanceof THREE.PointLight) {
            // Point lights use perspective camera - just update far plane
            const lightToCenter = new THREE.Vector3().subVectors(center, light.position)
            const distance = lightToCenter.length()
            light.shadow.camera.far = Math.max(distance + maxDim * 2, 200)
          }
          
          light.shadow.camera.updateProjectionMatrix()
        } else {
          // Fallback to very large bounds for infinite coverage
          if (light instanceof THREE.DirectionalLight) {
            light.shadow.camera.left = -2000
            light.shadow.camera.right = 2000
            light.shadow.camera.top = 2000
            light.shadow.camera.bottom = -2000
            light.shadow.camera.far = 5000
            light.shadow.camera.lookAt(0, 0, 0)
          } else if (light instanceof THREE.SpotLight || light instanceof THREE.PointLight) {
            light.shadow.camera.far = 5000
          }
          light.shadow.camera.near = 0.01 // Also use smaller near plane in fallback
          light.shadow.camera.updateProjectionMatrix()
        }
        light.shadow.needsUpdate = true
      }
    })
    
    // CRITICAL: Force shadow camera bounds update after light configuration changes
    // This ensures new lights added from panel get proper shadow camera bounds
    if (viewerRef.current?.updateShadowCameraBounds) {
      viewerRef.current.updateShadowCameraBounds()
    }
  }, [directionalLightsConfig, shadowsEnabledForLights, shadowBiasForLights])

  // Effect to update shadow map viewers when settings change
  const shadowMapViewerPosition = useAppStore((state) => state.shadowMapViewerPosition)
  const shadowMapViewerSize = useAppStore((state) => state.shadowMapViewerSize)
  
  useEffect(() => {
    if (!viewerRef.current) return
    const shadowMapViewersMap = viewerRef.current.shadowMapViewers
    shadowMapViewersMap.forEach((viewer) => {
      viewer.position.x = shadowMapViewerPosition.x
      viewer.position.y = shadowMapViewerPosition.y
      viewer.size.width = shadowMapViewerSize
      viewer.size.height = shadowMapViewerSize
      viewer.update()
    })
  }, [shadowMapViewerPosition, shadowMapViewerSize])

  // Effect to update grid size
  useEffect(() => {
    if (!viewerRef.current) return
    const { scene } = viewerRef.current
    
    scene.traverse((obj) => {
      if (obj.userData.isGridHelper && obj instanceof THREE.GridHelper) {
        // Remove old grid from its parent (which might be the Native Objects group)
        if (obj.parent) {
          obj.parent.remove(obj)
        }
        // Dispose of geometry
        obj.geometry.dispose()
        
        // Create new grid with updated size
        const newGridHelper = new THREE.GridHelper(10000, gridSize, 0x444444, 0x222222)
        newGridHelper.name = 'Grid'
        newGridHelper.userData.isGridHelper = true
        newGridHelper.renderOrder = 1 // Preserve render order to prevent z-fighting
        
        // Find the Native Objects group and add to it
        let nativeGroup: THREE.Object3D | undefined
        scene.traverse((child) => {
          if (child.userData.isNativeObjectsGroup) {
            nativeGroup = child
          }
        })
        
        if (nativeGroup) {
          nativeGroup.add(newGridHelper)
        } else {
          // Fallback: add directly to scene if group not found
          scene.add(newGridHelper)
        }
      }
    })
  }, [gridSize])

  // Effect to handle HDR environment map - COMPLETE REWRITE using HDRSystem
  const hdrUrl = useAppStore((state) => state.hdrUrl)
  const hdrFile = useAppStore((state) => state.hdrFile)
  const hdrGroundProjectionHeight = useAppStore((state) => state.hdrGroundProjectionHeight)
  const hdrGroundProjectionRadius = useAppStore((state) => state.hdrGroundProjectionRadius)
  const hdrRotationAzimuth = useAppStore((state) => state.hdrRotationAzimuth)
  const hdrRotationElevation = useAppStore((state) => state.hdrRotationElevation)
  const hdrBackgroundVisible = useAppStore((state) => state.hdrBackgroundVisible)
  // Streets GL only - dynamicSkyEnabled removed
  
    // Post-Processing state
    const postProcessingEnabled = useAppStore((state) => state.postProcessingEnabled)
    const bloomEnabled = useAppStore((state) => state.bloomEnabled)
    const colorGradingEnabled = useAppStore((state) => state.colorGradingEnabled)
    const colorGradingExposure = useAppStore((state) => state.colorGradingExposure)
    const colorGradingContrast = useAppStore((state) => state.colorGradingContrast)
    const colorGradingHighlights = useAppStore((state) => state.colorGradingHighlights)
    const colorGradingShadows = useAppStore((state) => state.colorGradingShadows)
    const colorGradingWhites = useAppStore((state) => state.colorGradingWhites)
    const colorGradingBlacks = useAppStore((state) => state.colorGradingBlacks)
    const colorGradingHue = useAppStore((state) => state.colorGradingHue)
    const colorGradingSaturation = useAppStore((state) => state.colorGradingSaturation)
    const colorGradingVibrance = useAppStore((state) => state.colorGradingVibrance)
    const colorGradingGamma = useAppStore((state) => state.colorGradingGamma)
    const bloomStrength = useAppStore((state) => state.bloomStrength)
    const bloomRadius = useAppStore((state) => state.bloomRadius)
    const bloomThreshold = useAppStore((state) => state.bloomThreshold)
    const lutEnabled = useAppStore((state) => state.lutEnabled)
    const lutTexture = useAppStore((state) => state.lutTexture)
    const lutIntensity = useAppStore((state) => state.lutIntensity)
    const anamorphicEnabled = useAppStore((state) => state.anamorphicEnabled)
    const anamorphicIntensity = useAppStore((state) => state.anamorphicIntensity)
    const anamorphicThreshold = useAppStore((state) => state.anamorphicThreshold)
    const anamorphicScale = useAppStore((state) => state.anamorphicScale)
    const anamorphicColor = useAppStore((state) => state.anamorphicColor)
    const aoEnabled = useAppStore((state) => state.aoEnabled)
    const aoOutput = useAppStore((state) => state.aoOutput)
    const aoBias = useAppStore((state) => state.aoBias)
    const aoIntensity = useAppStore((state) => state.aoIntensity)
    const aoScale = useAppStore((state) => state.aoScale)
    const aoKernelRadius = useAppStore((state) => state.aoKernelRadius)
    const aoMinResolution = useAppStore((state) => state.aoMinResolution)
    const aoBlur = useAppStore((state) => state.aoBlur)
    const aoBlurRadius = useAppStore((state) => state.aoBlurRadius)
    const aoBlurStdDev = useAppStore((state) => state.aoBlurStdDev)
    const aoBlurDepthCutoff = useAppStore((state) => state.aoBlurDepthCutoff)
    const sssEnabled = useAppStore((state) => state.sssEnabled)
    const sssIntensity = useAppStore((state) => state.sssIntensity)
    const sssMaxRadius = useAppStore((state) => state.sssMaxRadius)
    const sssSamples = useAppStore((state) => state.sssSamples)
    const sssRayDistance = useAppStore((state) => state.sssRayDistance)
    const sssThickness = useAppStore((state) => state.sssThickness)
    const sssBias = useAppStore((state) => state.sssBias)
    const sssLightDirectionX = useAppStore((state) => state.sssLightDirectionX)
    const sssLightDirectionY = useAppStore((state) => state.sssLightDirectionY)
    const sssLightDirectionZ = useAppStore((state) => state.sssLightDirectionZ)
    const ssrEnabled = useAppStore((state) => state.ssrEnabled)
    const ssrIntensity = useAppStore((state) => state.ssrIntensity)
    const ssrThickness = useAppStore((state) => state.ssrThickness)
    const ssrMaxDistance = useAppStore((state) => state.ssrMaxDistance)
    const ssrMaxSteps = useAppStore((state) => state.ssrMaxSteps)
    const ssrMaxBinarySearchSteps = useAppStore((state) => state.ssrMaxBinarySearchSteps)
    const ssrRoughnessFade = useAppStore((state) => state.ssrRoughnessFade)
    const ssrFadeDistance = useAppStore((state) => state.ssrFadeDistance)
    const ssrFadeMargin = useAppStore((state) => state.ssrFadeMargin)
    const toneMappingType = useAppStore((state) => state.toneMappingType) || 'aces-filmic'
    const toneMappingExposure = useAppStore((state) => state.toneMappingExposure) || 1.0
    const toneMappingWhitePoint = useAppStore((state) => state.toneMappingWhitePoint) || 1.0
  
    // Initialize HDR System
  useEffect(() => {
    if (!viewerRef.current) return
    
    const { scene, renderer } = viewerRef.current
    
    // Create HDR System if it doesn't exist
    if (!viewerRef.current.hdrSystem) {
      viewerRef.current.hdrSystem = new HDRSystem(scene, renderer, {
        enabled: hdrEnabled,
        url: hdrUrl,
        intensity: hdrIntensity,
        rotationAzimuth: hdrRotationAzimuth,
        rotationElevation: hdrRotationElevation,
        backgroundVisible: hdrBackgroundVisible,
        groundProjection: {
          enabled: hdrGroundProjectionEnabled,
          height: hdrGroundProjectionHeight,
          radius: hdrGroundProjectionRadius
        }
      })
      
      // Expose HDRSystem globally for path tracer to access original HDR texture
      if (viewerRef.current.hdrSystem) {
        ;(window as any).__hdrSystem = viewerRef.current.hdrSystem
        viewerRef.current.hdrSystem.updateRotation(hdrRotationAzimuth, hdrRotationElevation)
        viewerRef.current.hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)
        console.log('[HDRSystem] Initialized HDR System and exposed globally for path tracer')
      }
    }

    if (!viewerRef.current.indirectLightingSystem) {
      viewerRef.current.indirectLightingSystem = new IndirectLightingSystem(scene, renderer)
    }
    
    return () => {
      // Cleanup on unmount
      if (viewerRef.current?.indirectLightingSystem) {
        viewerRef.current.indirectLightingSystem.dispose()
        viewerRef.current.indirectLightingSystem = undefined
      }
      if (viewerRef.current?.hdrSystem) {
        viewerRef.current.hdrSystem.dispose()
        viewerRef.current.hdrSystem = undefined
        // Clear global reference
        delete (window as any).__hdrSystem
      }
    }
  }, []) // Only run once on mount

  // Initialize Post-Processing System
  useEffect(() => {
    if (!viewerRef.current) return
    
    const { scene, camera, renderer } = viewerRef.current
    
    // Create Post-Processing System if it doesn't exist
    if (!viewerRef.current.postProcessingSystem) {
      const config: PostProcessingConfig = {
        enabled: postProcessingEnabled,
        bloom: {
          enabled: bloomEnabled,
          strength: bloomStrength,
          radius: bloomRadius,
          threshold: bloomThreshold
        },
        lut: {
          enabled: lutEnabled,
          lut: lutTexture,
          intensity: lutIntensity
        },
        anamorphic: {
          enabled: anamorphicEnabled,
          intensity: anamorphicIntensity,
          threshold: anamorphicThreshold,
          scale: anamorphicScale,
          color: new THREE.Color(anamorphicColor)
        },
        ao: {
          enabled: aoEnabled,
          output: aoOutput,
          saoBias: aoBias,
          saoIntensity: aoIntensity,
          saoScale: aoScale,
          saoKernelRadius: aoKernelRadius,
          saoMinResolution: aoMinResolution,
          saoBlur: aoBlur,
          saoBlurRadius: aoBlurRadius,
          saoBlurStdDev: aoBlurStdDev,
          saoBlurDepthCutoff: aoBlurDepthCutoff
        },
        sss: {
          enabled: sssEnabled,
          intensity: sssIntensity,
          maxRadius: sssMaxRadius,
          samples: sssSamples,
          rayDistance: sssRayDistance,
          thickness: sssThickness,
          bias: sssBias,
          lightDirection: new THREE.Vector3(sssLightDirectionX, sssLightDirectionY, sssLightDirectionZ)
        },
        ssr: {
          enabled: ssrEnabled,
          intensity: ssrIntensity,
          thickness: ssrThickness,
          maxDistance: ssrMaxDistance,
          maxSteps: ssrMaxSteps,
          maxBinarySearchSteps: ssrMaxBinarySearchSteps,
          roughnessFade: ssrRoughnessFade,
          fadeDistance: ssrFadeDistance,
          fadeMargin: ssrFadeMargin
        },
        toneMapping: {
          type: toneMappingType as ToneMappingType,
          exposure: toneMappingExposure,
          whitePoint: toneMappingWhitePoint
        },
        colorGrading: {
          enabled: colorGradingEnabled,
          exposure: colorGradingExposure,
          contrast: colorGradingContrast,
          highlights: colorGradingHighlights,
          shadows: colorGradingShadows,
          whites: colorGradingWhites,
          blacks: colorGradingBlacks,
          hue: colorGradingHue,
          saturation: colorGradingSaturation,
          vibrance: colorGradingVibrance,
          gamma: colorGradingGamma
        }
      }
      viewerRef.current.postProcessingSystem = new PostProcessingSystem(scene, camera, renderer, config)
      console.log('[PostProcessingSystem] Initialized Post-Processing System')
    }
    
    return () => {
      // Cleanup on unmount
      if (viewerRef.current?.postProcessingSystem) {
        viewerRef.current.postProcessingSystem.dispose()
        viewerRef.current.postProcessingSystem = undefined
      }
    }
  }, []) // Only run once on mount

  // Update Post-Processing System config
  useEffect(() => {
    if (!viewerRef.current?.postProcessingSystem) return
    
    const config: PostProcessingConfig = {
      enabled: postProcessingEnabled,
      bloom: {
        enabled: bloomEnabled,
        strength: bloomStrength,
        radius: bloomRadius,
        threshold: bloomThreshold
      },
      lut: {
        enabled: lutEnabled,
        lut: lutTexture,
        intensity: lutIntensity
      },
      anamorphic: {
        enabled: anamorphicEnabled,
        intensity: anamorphicIntensity,
        threshold: anamorphicThreshold,
        scale: anamorphicScale,
        color: new THREE.Color(anamorphicColor)
      },
      ao: {
        enabled: aoEnabled,
        output: aoOutput,
        saoBias: aoBias,
        saoIntensity: aoIntensity,
        saoScale: aoScale,
        saoKernelRadius: aoKernelRadius,
        saoMinResolution: aoMinResolution,
        saoBlur: aoBlur,
        saoBlurRadius: aoBlurRadius,
        saoBlurStdDev: aoBlurStdDev,
        saoBlurDepthCutoff: aoBlurDepthCutoff
      },
      sss: {
        enabled: sssEnabled,
        intensity: sssIntensity,
        maxRadius: sssMaxRadius,
        samples: sssSamples,
        rayDistance: sssRayDistance,
        thickness: sssThickness,
        bias: sssBias,
        lightDirection: new THREE.Vector3(sssLightDirectionX, sssLightDirectionY, sssLightDirectionZ)
      },
      ssr: {
        enabled: ssrEnabled,
        intensity: ssrIntensity,
        thickness: ssrThickness,
        maxDistance: ssrMaxDistance,
        maxSteps: ssrMaxSteps,
        maxBinarySearchSteps: ssrMaxBinarySearchSteps,
        roughnessFade: ssrRoughnessFade,
        fadeDistance: ssrFadeDistance,
        fadeMargin: ssrFadeMargin
      },
      toneMapping: {
        type: toneMappingType as ToneMappingType,
        exposure: toneMappingExposure,
        whitePoint: toneMappingWhitePoint
      },
      colorGrading: {
        enabled: colorGradingEnabled,
        exposure: colorGradingExposure,
        contrast: colorGradingContrast,
        highlights: colorGradingHighlights,
        shadows: colorGradingShadows,
        whites: colorGradingWhites,
        blacks: colorGradingBlacks,
        hue: colorGradingHue,
        saturation: colorGradingSaturation,
        vibrance: colorGradingVibrance,
        gamma: colorGradingGamma
      }
    }
    
    // Debug: Log SSS config when it changes
    if (config.sss) {
      console.log('[ViewerCanvas] Updating PostProcessingSystem with SSS config:', {
        enabled: config.sss.enabled,
        intensity: config.sss.intensity,
        maxRadius: config.sss.maxRadius,
        samples: config.sss.samples,
        postProcessingEnabled: config.enabled
      })
    }
    
    viewerRef.current.postProcessingSystem.updateConfig(config)
  }, [postProcessingEnabled, bloomEnabled, bloomStrength, bloomRadius, bloomThreshold, lutEnabled, lutTexture, lutIntensity, anamorphicEnabled, anamorphicIntensity, anamorphicThreshold, anamorphicScale, anamorphicColor, aoEnabled, aoOutput, aoBias, aoIntensity, aoScale, aoKernelRadius, aoMinResolution, aoBlur, aoBlurRadius, aoBlurStdDev, aoBlurDepthCutoff, sssEnabled, sssIntensity, sssMaxRadius, sssSamples, sssRayDistance, sssThickness, sssBias, sssLightDirectionX, sssLightDirectionY, sssLightDirectionZ, ssrEnabled, ssrIntensity, ssrThickness, ssrMaxDistance, ssrMaxSteps, ssrMaxBinarySearchSteps, ssrRoughnessFade, ssrFadeDistance, ssrFadeMargin, toneMappingType, toneMappingExposure, toneMappingWhitePoint, colorGradingEnabled, colorGradingExposure, colorGradingContrast, colorGradingHighlights, colorGradingShadows, colorGradingWhites, colorGradingBlacks, colorGradingHue, colorGradingSaturation, colorGradingVibrance, colorGradingGamma])

  // Effect to handle HDR loading and updates
  useEffect(() => {
    if (!viewerRef.current?.hdrSystem) return

    const hdrSystem = viewerRef.current.hdrSystem

    const applyHDR = async () => {
      // Use HDRSystem to handle all HDR operations
      try {
        const hdrSource = hdrFile ?? hdrUrl
        if (hdrEnabled && hdrSource) {
          // Load and apply HDR
          await hdrSystem.applyHDR(hdrSource, hdrIntensity)
          
          // Update intensity if changed
          if (hdrSystem.getPMREMMap()) {
            hdrSystem.updateIntensity(hdrIntensity)
            
            // Always apply ground projection (it will check if enabled internally)
            hdrSystem.updateGroundProjection({
              enabled: hdrGroundProjectionEnabled,
              height: hdrGroundProjectionHeight,
              radius: hdrGroundProjectionRadius
            })
          }
          
          // Streets GL only - Three.js Sky removed
          
          // Store references for backward compatibility
          if (viewerRef.current) {
            viewerRef.current.environmentMap = hdrSystem.getOriginalTexture()
            viewerRef.current.pmremEnvMap = hdrSystem.getPMREMMap()
          }
          
          // CRITICAL: Update path tracer environment if it's running or initializing
          // Path tracer needs to know about HDR environment changes
          // Wait a frame to ensure scene.environment is set
          await new Promise(resolve => requestAnimationFrame(resolve))
          
          // Get path tracer instance (with guard to prevent conflicts from multiple sessions)
          const pathTracerDemo = (window as any).__pathTracerDemo as import('./pathTracer/PathTracerDemo').PathTracerDemo | undefined
          const scene = viewerRef.current?.scene
          // Verify it's actually running before using it
          if (pathTracerDemo && pathTracerDemo.isRunning && pathTracerDemo.isRunning()) {
            if (typeof pathTracerDemo.updateEnvironment === 'function') {
              console.log('[HDRSystem] Updating path tracer environment with HDR', {
                hasPathTracer: !!pathTracerDemo,
                hasSceneEnvironment: !!scene?.environment,
                environmentType: scene?.environment?.constructor?.name
              })
              try {
                pathTracerDemo.updateEnvironment()
                console.log('[HDRSystem] ✅ Path tracer environment updated successfully')
              } catch (error) {
                console.warn('[HDRSystem] ⚠️ Failed to update path tracer environment:', error)
                // Don't throw - HDR should still work even if path tracer update fails
              }
            } else {
              console.log('[HDRSystem] Path tracer exists but updateEnvironment not available yet')
            }
          } else {
            console.log('[HDRSystem] Path tracer not initialized yet - will use HDR when initialized')
          }
          
          useAppStore.getState().setError(null)
          if (viewerRef.current?.csmShadowSystem) {
            // Re-run CSM material setup so shader patches survive the HDR recompile
            viewerRef.current.csmShadowSystem.setupSceneMaterials(true)
          }

          // HDR-derived SH probe replaces part of flat ambient fill (specular stays on scene.environment)
          const equirectForProbe =
            hdrSystem.getOriginalTexture() ??
            (viewerRef.current.scene.environment instanceof THREE.Texture
              ? viewerRef.current.scene.environment
              : null)
          if (viewerRef.current?.indirectLightingSystem && equirectForProbe) {
            viewerRef.current.indirectLightingSystem.applyFromEquirect(equirectForProbe, hdrIntensity)
          }

          // Re-apply interior cavity dimming after HDR overwrites envMapIntensity
          if (viewerRef.current?.scene) {
            refreshInteriorCavityEnhancements(viewerRef.current, viewerRef.current.scene)
          }
          
          // CRITICAL: Update shadow camera bounds after HDR application
          // HDR material updates may affect shadow rendering, so we need to recalculate bounds
          // This ensures shadows from directional lights work correctly with HDR environment
          if (viewerRef.current?.updateShadowCameraBounds) {
            // Wait a frame to ensure all material updates are complete
            requestAnimationFrame(() => {
              viewerRef.current?.updateShadowCameraBounds()
              console.log('[HDRSystem] ✅ Shadow camera bounds updated after HDR application')
            })
          }
          
          console.log('[HDRSystem] ✅ HDR applied successfully')
        } else {
          // Disable HDR
          hdrSystem.disableHDR()
          viewerRef.current?.indirectLightingSystem?.remove()
          
          // Streets GL only - Three.js Sky removed
          
          // Clear references
          if (viewerRef.current) {
            viewerRef.current.environmentMap = null
            viewerRef.current.pmremEnvMap = null
          }
          
          if (viewerRef.current?.csmShadowSystem) {
            viewerRef.current.csmShadowSystem.setupSceneMaterials(true)
          }
        }
      } catch (error) {
        console.error('[HDRSystem] Failed to apply HDR:', error)
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        useAppStore.getState().setError(`Failed to load HDR: ${errorMsg}`)
        hdrSystem.disableHDR()
      }
    }
    
          applyHDR()
    }, [
      hdrEnabled,
      hdrUrl,
      hdrFile
      // Streets GL only - dynamicSkyEnabled removed
      // NOTE: hdrIntensity removed to prevent HDR reload on slider changes - handled by separate effect below
      // NOTE: Ground projection parameters removed to prevent HDR reload on slider changes
    ])


  // Separate effect to update HDR intensity without reloading
  useEffect(() => {
    if (!viewerRef.current?.hdrSystem) return
    
    const hdrSystem = viewerRef.current.hdrSystem
    
    // Only update if HDR is enabled and has a PMREM map
    if (hdrEnabled && hdrSystem.getPMREMMap()) {
      hdrSystem.updateIntensity(hdrIntensity)
      viewerRef.current.indirectLightingSystem?.updateIntensity(hdrIntensity)
    }
  }, [hdrEnabled, hdrIntensity])

  useEffect(() => {
    if (!viewerRef.current?.hdrSystem) return
    
    viewerRef.current.hdrSystem.updateRotation(hdrRotationAzimuth, hdrRotationElevation)
  }, [hdrRotationAzimuth, hdrRotationElevation])

  useEffect(() => {
    if (!viewerRef.current?.hdrSystem) return
    
    viewerRef.current.hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)
  }, [hdrBackgroundVisible])

  // Effect to update ground projection settings without reloading HDR
  useEffect(() => {
    if (!viewerRef.current?.hdrSystem) return
    
    const hdrSystem = viewerRef.current.hdrSystem
    
    // Only update if HDR is enabled and has a PMREM map
    if (hdrEnabled && hdrSystem.getPMREMMap()) {
      hdrSystem.updateGroundProjection({
        enabled: hdrGroundProjectionEnabled,
        height: hdrGroundProjectionHeight,
        radius: hdrGroundProjectionRadius
      })
    }
  }, [hdrEnabled, hdrGroundProjectionEnabled, hdrGroundProjectionHeight, hdrGroundProjectionRadius])

  // OLD HDR CODE REMOVED - Now using HDRSystem above

  // Effect to apply weather settings to scene
  const weatherPreset = useAppStore((state) => state.weatherPreset)
  const cloudDensity = useAppStore((state) => state.cloudDensity)
  const cloudThickness = useAppStore((state) => state.cloudThickness)
  const cloudDetail = useAppStore((state) => state.cloudDetail)
  const cloudScale = useAppStore((state) => state.cloudScale)
  const cloudStorminess = useAppStore((state) => state.cloudStorminess)
  const cloudShadowStrength = useAppStore((state) => state.cloudShadowStrength)
  const cloudColor = useAppStore((state) => state.cloudColor)
  const fogDensity = useAppStore((state) => state.fogDensity)
  const fogHeight = useAppStore((state) => state.fogHeight)
  const fogColor = useAppStore((state) => state.fogColor)
  const rainIntensity = useAppStore((state) => state.rainIntensity)
  const snowIntensity = useAppStore((state) => state.snowIntensity)
  const windIntensity = useAppStore((state) => state.windIntensity)
  const timeOfDay = useAppStore((state) => state.timeOfDay)
  const skyTurbidity = useAppStore((state) => state.skyTurbidity)
  const skyAtmosphereDensity = useAppStore((state) => state.skyAtmosphereDensity)
  const skyRayleigh = useAppStore((state) => state.skyRayleigh)
  const skyMieCoefficient = useAppStore((state) => state.skyMieCoefficient)
  const skyMieDirectionalG = useAppStore((state) => state.skyMieDirectionalG)
  const skyExposure = useAppStore((state) => state.skyExposure)
  const skyElevation = useAppStore((state) => state.skyElevation)
  const skyAzimuth = useAppStore((state) => state.skyAzimuth)

  const northOffset = useAppStore((state) => state.northOffset)
  const waterEnabled = useAppStore((state) => state.waterEnabled)
  const waterLevel = useAppStore((state) => state.waterLevel)
  const waterColor = useAppStore((state) => state.waterColor)
  const waterOpacity = useAppStore((state) => state.waterOpacity)
  const waveSpeed = useAppStore((state) => state.waveSpeed)
  const waveHeight = useAppStore((state) => state.waveHeight)
  const waterReflectivity = useAppStore((state) => state.waterReflectivity)
  const sunSize = useAppStore((state) => state.sunSize)
  const moonSize = useAppStore((state) => state.moonSize)
  const weatherQuality = useAppStore((state) => state.weatherQuality)
  const enableStandaloneWeather = useAppStore((state) => state.enableStandaloneWeather)
  const darkenInteriorCavities = useAppStore((state) => state.darkenInteriorCavities)
  const streetsGLBridge = useAppStore((state) => state.streetsGLBridge)

  useEffect(() => {
    if (!viewerRef.current?.scene) return
    const scene = viewerRef.current.scene
    if (darkenInteriorCavities) {
      refreshInteriorCavityEnhancements(viewerRef.current, scene)
    } else {
      const restored = applyInteriorCavityDimming(scene, false)
      if (restored > 0) {
        console.log(`[CavityOcclusion] Restored brightness on ${restored} interior material(s)`)
      }
    }
  }, [darkenInteriorCavities])

  useEffect(() => {
    if (!viewerRef.current) return

    const { scene, ambientLight, directionalLights, renderer, camera } = viewerRef.current
    const hdrSunBoost = hdrEnabled
      ? THREE.MathUtils.clamp(0.85 + hdrIntensity * 0.35, 1.0, 2.2)
      : 1.0
    const hdrExposureBoost = hdrEnabled
      ? THREE.MathUtils.clamp(0.9 + hdrIntensity * 0.45, 1.0, 2.5)
      : 1.0

    // Apply exponential height fog (Twinmotion style)
    // When standalone weather is active, AtmosphericPerspective owns scene.fog to avoid double-application.
    const atmosphericFogActive =
      enableStandaloneWeather && !!viewerRef.current?.atmosphericPerspective

    if (!atmosphericFogActive) {
      if (fogDensity > 0) {
        applySceneFog(scene, fogDensity, fogColor)
      } else {
        scene.fog = null
        invalidateFogMeshesReady(scene)
      }
    } else if (fogDensity <= 0) {
      scene.fog = null
      invalidateFogMeshesReady(scene)
    } else {
      // AtmosphericPerspective owns scene.fog — still enable fog on imported model materials
      enableFogOnSceneMeshes(scene)
    }

    // Elevation-based sun + ambient (replaces coarse time-of-day buckets)
    const { elevation: sunElevation } = timeOfDayToSkyAngles(timeOfDay, northOffset)
    const elevationLighting = computeSunLightingFromElevation(sunElevation)
    let sunIntensity = elevationLighting.sunIntensity
    let sunColor = elevationLighting.sunColor
    let ambientIntensity = elevationLighting.ambientIntensity
    let ambientColor = elevationLighting.ambientColor
    let skyColor = '#87CEEB'
    if (sunElevation < 0) {
      skyColor = '#000033'
    } else if (sunElevation < 0.15) {
      skyColor = '#c8d0e0'
    }

    // Update ambient light
    // Streets GL only - ambient light controlled by Streets GL atmosphere
    if (ambientLight) {
      ambientLight.intensity = ambientIntensity
      ambientLight.color.set(ambientColor)
    }

    // Apply cloud and weather effects to lighting
    // Overcast: much darker, more diffuse lighting
    let weatherDimming = 1.0
    let toneMappingExposure = elevationLighting.toneMappingExposure
    const isDarkWeather = weatherPreset === 'overcast' || weatherPreset === 'foggy' || weatherPreset === 'stormy'
    const weatherMaterialKey = [
      weatherPreset,
      fogDensity.toFixed(3),
      fogColor,
      hdrEnabled,
      enableStandaloneWeather,
      isDarkWeather,
      hdrIntensity.toFixed(2)
    ].join('|')
    const weatherMaterialChanged = lastWeatherMaterialKeyRef.current !== weatherMaterialKey
    if (weatherMaterialChanged) {
      lastWeatherMaterialKeyRef.current = weatherMaterialKey
    }
    
    if (weatherPreset === 'overcast') {
      // Overcast: significantly reduce sun intensity (dense cloud cover blocks most sunlight)
      // But maintain contrast - sun should be HIGHER than ambient to preserve texture detail
      weatherDimming = 0.25 - (fogDensity * 0.08) // 17-25% of normal intensity (darker for overcast)
      ambientIntensity = 0.15 - (fogDensity * 0.04) // Lower ambient (11-15%) to maintain contrast
      sunColor = '#b8c4d1' // Cooler gray for overcast feel
      ambientColor = '#c0c8d0' // Cooler ambient to match overcast sky
      toneMappingExposure = 0.9 // Lower exposure for darker overcast appearance
      
      // Debug logging for overcast preset
      try {
        console.groupCollapsed('[TextureDebug] Overcast preset applied')
        console.log('Lighting adjustments:', {
          sunIntensity: `${(weatherDimming * 100).toFixed(1)}% of normal`,
          ambientIntensity: `${(ambientIntensity * 100).toFixed(1)}%`,
          sunColor,
          ambientColor,
          toneMappingExposure,
          fogDensity
        })
        console.log('Expected fixes:')
        console.log('- Sun brighter than ambient to preserve texture detail')
        console.log('- Warmer colors to preserve material colors')
        console.log('- Increased tone mapping exposure for better visibility')
        console.log('- Metallic materials will get 1.5x envMapIntensity boost')
        console.groupEnd()
      } catch {}
    } else if (weatherPreset === 'foggy') {
      // Foggy: very diffuse, but maintain contrast for metallic materials
      // Sun should be brighter than ambient to preserve metallic reflections
      weatherDimming = 0.25 - (fogDensity * 0.1) // 15-25% of normal intensity (darker for foggy)
      ambientIntensity = 0.15 - (fogDensity * 0.04) // Lower ambient (11-15%) to maintain contrast
      sunColor = '#c8d0d8' // Cooler gray for foggy atmosphere
      ambientColor = '#d0d8e0' // Cooler ambient for foggy feel
      toneMappingExposure = 0.9 // Lower exposure for foggy conditions
      
      // Debug logging for foggy preset (only log once per preset change)
      const lastFoggyLog = (window as any).__lastFoggyLog
      const foggyLogKey = `${weatherPreset}-${fogDensity.toFixed(2)}`
      if (lastFoggyLog !== foggyLogKey) {
        (window as any).__lastFoggyLog = foggyLogKey
        try {
          console.groupCollapsed('[TextureDebug] Foggy preset applied')
          console.log('Lighting adjustments:', {
            sunIntensity: `${(weatherDimming * 100).toFixed(1)}% of normal`,
            ambientIntensity: `${(ambientIntensity * 100).toFixed(1)}%`,
            sunColor,
            ambientColor,
            toneMappingExposure,
            fogDensity
          })
          console.log('Expected fixes:')
          console.log('- Sun brighter than ambient to preserve metallic reflections')
          console.log('- Warmer colors to avoid washing out metallic materials')
          console.log('- Increased tone mapping exposure for better metallic visibility')
          console.log('- Metallic materials will get 1.5x envMapIntensity boost')
          console.groupEnd()
        } catch {}
      }
    } else if (weatherPreset === 'stormy') {
      // Stormy: dark and dramatic, but maintain metallic material visibility
      // Ensure sun is brighter than ambient for metallic contrast
      weatherDimming = 0.15 - (cloudStorminess * 0.03) // 12-15% of normal intensity (much darker)
      ambientIntensity = 0.1 - (cloudStorminess * 0.02) // Lower ambient (8-10%) for contrast
      sunColor = '#8a9098' // Darker, more stormy gray for dramatic effect
      ambientColor = '#9098a0' // Darker ambient to make scene appear stormy
      toneMappingExposure = 0.85 // Lower exposure for stormy to make it darker and more dramatic
      
      // Debug logging for stormy preset
      try {
        console.groupCollapsed('[TextureDebug] Stormy preset applied')
        console.log('Lighting adjustments:', {
          sunIntensity: `${(weatherDimming * 100).toFixed(1)}% of normal`,
          ambientIntensity: `${(ambientIntensity * 100).toFixed(1)}%`,
          sunColor,
          ambientColor,
          toneMappingExposure,
          cloudStorminess
        })
        console.log('Expected fixes:')
        console.log('- Sun brighter than ambient for metallic contrast')
        console.log('- Less gray colors for better metallic visibility')
        console.log('- Higher tone mapping exposure for stormy conditions')
        console.log('- Metallic materials will get 1.5x envMapIntensity boost')
        console.groupEnd()
      } catch {}
    } else {
      // Other presets: standard weather dimming
      weatherDimming = 1.0 - (cloudDensity * 0.5) - (rainIntensity * 0.3) - (cloudStorminess * 0.3)
    }
    sunIntensity *= Math.max(0.1, weatherDimming) // Ensure minimum 10% intensity
    sunIntensity *= hdrSunBoost

    // v1.7: Update sun light (simple - just intensity and color)
    if (directionalLights) {
      directionalLights.forEach((light) => {
        if (light.userData.isSun) {
          light.intensity = sunIntensity
          light.color.set(sunColor)
        }
      })
    }
    if (viewerRef.current?.csmShadowSystem) {
      viewerRef.current.csmShadowSystem.setLightIntensity(sunIntensity)
      viewerRef.current.csmShadowSystem.setLightColor(new THREE.Color(sunColor))
    }

    // IMPROVED: Update ambient light
    // CRITICAL: When HDR is enabled, reduce ambient light significantly because HDR environment map already provides ambient lighting
    // HDR environment maps provide ambient lighting through reflections and environment mapping
    // Additional ambient light can wash out shadows and make the scene look flat
    if (ambientLight) {
      // Check if HDR is enabled and scene has environment map
      // hdrEnabled is already declared earlier in the file (line 3695)
      const hasHDREnvironment = hdrEnabled && scene.environment !== null
      const shadowsEnabled = useAppStore.getState().shadowsEnabled
      const probeActive = viewerRef.current?.indirectLightingSystem?.isActive() ?? false
      const effectiveAmbientIntensity = hasHDREnvironment
        ? computeHdrAmbientIntensity({
            sliderAmbient: ambientIntensity,
            shadowsEnabled,
            probeActive,
            hdrSunBoost
          })
        : ambientIntensity
      
      ambientLight.intensity = effectiveAmbientIntensity
      ambientLight.color.set(ambientColor)
      
      // IMPROVED: Debug logging for ambient light adjustment (throttled to prevent spam)
      // Only log when HDR is active, intensity is reduced, and value actually changed
      if (hasHDREnvironment && effectiveAmbientIntensity !== ambientIntensity) {
        const lastAmbientLog = (window as any).__lastAmbientLog || { value: -1, time: 0 }
        const now = Date.now()
        // Only log if value changed or it's been more than 2 seconds since last log
        if (lastAmbientLog.value !== effectiveAmbientIntensity || now - lastAmbientLog.time > 2000) {
          (window as any).__lastAmbientLog = { value: effectiveAmbientIntensity, time: now }
          console.log(`[AmbientLight] HDR enabled - adjusting ambient light from ${ambientIntensity.toFixed(2)} to ${effectiveAmbientIntensity.toFixed(2)} (auto HDR fill)`)
        }
      }
    }
    
    // Update tone mapping exposure for weather conditions
    // CRITICAL: If post-processing with custom tone mapping is enabled, disable renderer tone mapping
    // Custom tone mapping in post-processing handles exposure, so renderer should use neutral value
    if (postProcessingEnabled && toneMappingType) {
      // Custom tone mapping is active - disable renderer's tone mapping to prevent double application
      renderer.toneMappingExposure = 1.0
    } else {
      // No custom tone mapping - use renderer's tone mapping for weather/exposure control
      renderer.toneMappingExposure = toneMappingExposure * hdrExposureBoost
    }

    // Calculate sun position based on time of day with North offset
    const { sunPosition } = timeOfDayToSkyAngles(timeOfDay, northOffset)
    const skySunDir = standaloneSkySunDirection(sunPosition)
    const lightSunDir = enableStandaloneWeather
      ? standaloneLightSunDirection(skySunDir)
      : skySunDir.clone()
    const sunLightTravelDir = sunSkyDirectionToLightTravelDirection(lightSunDir)

    // Sky shader / moon use skySunDir (true elevation, including night below horizon).
    // CSM, directional lights, and water use lightSunDir (clamped above horizon).
    
    // DEBUG: Log the state values to understand which branch executes (preset changes only)
    if (weatherMaterialChanged) {
      console.log('[ViewerCanvas] Weather useEffect - State check:', {
        streetsGLIframeOverlay,
        streetsGLBridge: !!streetsGLBridge,
        enableStandaloneWeather,
        viewerRefCurrent: !!viewerRef.current
      })
    }
    
    // Option 1: Streets GL overlay is active - sync to Streets GL
    if (streetsGLIframeOverlay && streetsGLBridge) {
      if (weatherMaterialChanged) {
        console.log('[ViewerCanvas] Taking Streets GL branch')
      }
      // Sync timeOfDay to Streets GL sun direction
      streetsGLBridge.setSunDirection({
        x: lightSunDir.x,
        y: lightSunDir.y,
        z: lightSunDir.z
      })
      
      // Disable Three.js sun light when Streets GL is active
      if (directionalLights) {
        directionalLights.forEach((light) => {
          if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
            light.visible = false
            light.intensity = 0
          }
        })
      }
      
      // CRITICAL: If Dynamic Sky is enabled, sync its sun position with Streets GL sun direction
      // Since Streets GL sun direction is set from timeOfDay, use the same sunDir that was sent to Streets GL
      if (viewerRef.current.dynamicSky) {
        // Use the sunDir that was calculated from timeOfDay (same as what was sent to Streets GL)
        // Convert direction to position for Three.js Sky
        const finalSunPosition = skySunDir.clone().multiplyScalar(1000) // Scale to sky sphere radius
        
        const currentStore = useAppStore.getState()
        const { elevation, azimuth } = timeOfDayToSkyAngles(timeOfDay, currentStore.northOffset)
        viewerRef.current.dynamicSky.update({
          timeOfDay: timeOfDay,
          sunPosition: finalSunPosition,
          elevation: elevation,
          azimuth: azimuth,
          turbidity: currentStore.skyTurbidity || 10.0,
          atmosphereDensity: currentStore.skyAtmosphereDensity || 0.5,
          rayleigh: currentStore.skyRayleigh || 2.0,
          mieCoefficient: currentStore.skyMieCoefficient || 0.005,
          mieDirectionalG: currentStore.skyMieDirectionalG || 0.8,
          exposure: Math.max(currentStore.skyExposure ?? 1.0, 0.85),
          cloudDensity: currentStore.cloudDensity ?? 0,
          cloudThickness: currentStore.cloudThickness || 0.5,
          cloudDetail: currentStore.cloudDetail || 0.5,
          cloudScale: currentStore.cloudScale || 1.0,
          cloudStorminess: currentStore.cloudStorminess || 0.0,
          cloudShadowStrength: currentStore.cloudShadowStrength || 0.0,
          cloudColor: new THREE.Color(currentStore.cloudColor || '#ffffff'),
          windIntensity: currentStore.windIntensity || 0.0,
          cloudRenderingMode: 'box'
        })
      }
    }
    // Option 2: Standalone weather system is active - use CSM + visible sun + local sun light
    else if (enableStandaloneWeather && viewerRef.current) {
      activateDynamicSkyCamera(viewerRef.current)
      if (weatherMaterialChanged) {
        console.log('[ViewerCanvas] Taking standalone weather branch - initializing systems')
      }
      // Initialize standalone weather systems if they don't exist
      if (!viewerRef.current.csmShadowSystem) {
        console.log('[ViewerCanvas] Creating CSM shadow system')
        const csmShadowSystem = new CSMShadowSystem(scene, {
          camera,
          parent: scene,
          lightIntensity: 1.0,
          lightColor: new THREE.Color(0xffffff),
          cascades: getCsmCascadeCountForQuality(weatherQuality || 'high'),
          maxFar: 5000,
          shadowMapSize: getCsmShadowMapSizeForQuality(weatherQuality || 'high'),
          lightDirection: sunLightTravelDir,
          shadowBias: CSM_SHADER_BIAS,
          shadowNormalBias: CSM_SHADER_NORMAL_BIAS,
          shadowRadius: PHYSICAL_CSM_SHADOW_RADIUS
        })
        csmShadowSystem.init()
        viewerRef.current.csmShadowSystem = csmShadowSystem
        refreshInteriorCavityEnhancements(viewerRef.current, scene)
      }
      
      if (!viewerRef.current.sunMoonSystem) {
        console.log('[ViewerCanvas] Creating Sun/Moon system')
        const sunMoonSystem = new SunMoonSystem(scene, {
          timeOfDay: timeOfDay,
          sunPosition: skySunDir,
          sunColor: new THREE.Color(0xffffff),
          turbidity: 10,
          sunSize: sunSize,
          moonSize: moonSize,
          enableStandaloneWeather: true
        })
        viewerRef.current.sunMoonSystem = sunMoonSystem
      }
      
      if (!viewerRef.current.standaloneWaterSystem && waterEnabled) {
        console.log('[ViewerCanvas] Creating standalone water system')
        const standaloneWaterSystem = new StandaloneWaterSystem(scene, {
          enabled: true,
          level: waterLevel,
          color: waterColor,
          opacity: waterOpacity,
          waveSpeed: waveSpeed,
          waveHeight: waveHeight,
          reflectivity: waterReflectivity,
          sunDirection: lightSunDir
        })
        viewerRef.current.standaloneWaterSystem = standaloneWaterSystem
      } else if (viewerRef.current.standaloneWaterSystem) {
        if (waterEnabled) {
          viewerRef.current.standaloneWaterSystem.updateConfig({
            enabled: true,
            level: waterLevel,
            color: waterColor,
            opacity: waterOpacity,
            waveSpeed,
            waveHeight,
            reflectivity: waterReflectivity
          })
          viewerRef.current.standaloneWaterSystem.setSunDirection(lightSunDir)
        } else {
          viewerRef.current.standaloneWaterSystem.setEnabled(false)
        }
      }
      
      // Shadow plane: FrontSide during standalone weather so sky/cloud light does not bleed through underside
      scene.traverse((obj) => {
        if (obj.userData.isShadowPlane && obj instanceof THREE.Mesh) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of materials) {
            if (mat && 'side' in mat) {
              ;(mat as THREE.Material).side = THREE.FrontSide
              mat.needsUpdate = true
            }
          }
        }
      })
      
      if (!viewerRef.current.atmosphericPerspective) {
        console.log('[ViewerCanvas] Creating atmospheric perspective (fog/haze)')
        const { elevation } = timeOfDayToSkyAngles(timeOfDay, northOffset)
        let initialFogColor = '#87ceeb'
        if (elevation < 0) {
          initialFogColor = '#0a1020'
        } else if (elevation < 0.1) {
          initialFogColor = '#ff8c42'
        } else if (elevation < 0.3) {
          initialFogColor = '#ffb347'
        } else if (elevation < 0.5) {
          initialFogColor = '#87ceeb'
        } else {
          initialFogColor = '#5dade2'
        }
        const atmosphericPerspective = new AtmosphericPerspective(scene, {
          enabled: fogDensity > 0,
          density: fogDensity,
          color: initialFogColor,
          near: 100,
          far: 5000,
          heightFalloff: 0.5
        })
        viewerRef.current.atmosphericPerspective = atmosphericPerspective
      }
      
      if (!viewerRef.current.dynamicSky) {
        console.log('[ViewerCanvas] Creating DynamicSky with atmospheric scattering')
        const { elevation, azimuth } = timeOfDayToSkyAngles(timeOfDay, northOffset)
        const dynamicSky = new DynamicSky(scene, {
          timeOfDay: timeOfDay,
          sunPosition: skySunDir.clone(),
          sunColor: new THREE.Color(0xffffff),
          turbidity: skyTurbidity || 10.0,
          atmosphereDensity: skyAtmosphereDensity || 0.5,
          rayleigh: skyRayleigh || 2.0,
          mieCoefficient: skyMieCoefficient || 0.005,
          mieDirectionalG: skyMieDirectionalG || 0.8,
          exposure: skyExposure ?? 1.0,
          elevation: elevation,
          azimuth: azimuth,
          cloudDensity: cloudDensity ?? 0,
          cloudThickness: cloudThickness || 0.5,
          cloudDetail: cloudDetail || 0.5,
          cloudScale: cloudScale || 1.0,
          cloudStorminess: cloudStorminess || 0.0,
          cloudShadowStrength: cloudShadowStrength || 0.0,
          cloudColor: new THREE.Color(cloudColor || '#ffffff'),
          windIntensity: windIntensity || 0.0,
          quality: weatherQuality || 'high',
          cloudRenderingMode: 'iq'
        }, renderer) // Pass renderer for LUT system
        viewerRef.current.dynamicSky = dynamicSky
        activateDynamicSkyCamera(viewerRef.current)
        scene.background = null
        if (viewerRef.current.hdrSystem) {
          viewerRef.current.hdrSystem.updateBackgroundVisibility(false)
        }
        console.log('[ViewerCanvas] ✅ DynamicSky initialized - sky dome should be visible')
      }
      
      // Update CSM shadow system with sun direction
      if (viewerRef.current.csmShadowSystem) {
        viewerRef.current.csmShadowSystem.setLightDirection(sunLightTravelDir)
      }

      // Quality-gated cavity SAO (high/ultra only, requires post-processing)
      if (viewerRef.current) {
        const cavitySession = ensureCavityOcclusionSession(viewerRef.current)
        applyCavityAoIfEligible(
          true,
          weatherQuality || 'high',
          postProcessingEnabled,
          cavitySession
        )
      }
      
      // Update visible sun/moon mesh position based on time of day
      if (viewerRef.current.sunMoonSystem) {
        viewerRef.current.sunMoonSystem.update({
          timeOfDay: timeOfDay,
          sunPosition: skySunDir,
          sunColor: new THREE.Color(sunColor),
          turbidity: 10,
          sunSize: sunSize,
          moonSize: moonSize,
          enableStandaloneWeather: true
        })
      }
      
      // Update water system with sun direction (only when water is enabled)
      if (viewerRef.current.standaloneWaterSystem && waterEnabled) {
        viewerRef.current.standaloneWaterSystem.setSunDirection(lightSunDir)
      }
      
      // Update dynamic sky with new sun position and time of day
      if (viewerRef.current.dynamicSky) {
        const currentStore = useAppStore.getState()
        
        // CRITICAL: For standalone weather, use the same sunPosition as CSM and sun mesh
        // Only override if Streets GL is active (which has its own sun direction)
        let finalSunPosition = skySunDir.clone() // True sky direction (unclamped — night below horizon)
        if (streetsGLIframeOverlay && directionalLights) {
          // Streets GL branch: sync with Streets GL sun direction
          const sunLight = Array.from(directionalLights.values()).find(
            l => l.userData.isSun && l instanceof THREE.DirectionalLight
          )
          if (sunLight && sunLight.target) {
            // Calculate sun direction from Streets GL sun light (position to target)
            const sunDir = new THREE.Vector3()
            sunDir.subVectors(sunLight.target.position, sunLight.position).normalize()
            // Convert direction to position for Three.js Sky
            finalSunPosition = sunDir.clone().multiplyScalar(1000) // Scale to sky sphere radius
          }
        }
        // For standalone weather: finalSunPosition = sunPosition (normalized direction, same as CSM)
        
        const { elevation, azimuth } = timeOfDayToSkyAngles(timeOfDay, currentStore.northOffset)
        viewerRef.current.dynamicSky.update({
          timeOfDay: timeOfDay,
          sunPosition: finalSunPosition, // For standalone weather, this equals sunPosition (normalized)
          elevation: elevation,
          azimuth: azimuth,
          turbidity: currentStore.skyTurbidity || 10.0,
          atmosphereDensity: currentStore.skyAtmosphereDensity || 0.5, // Required but deprecated
          rayleigh: currentStore.skyRayleigh || 2.0,
          mieCoefficient: currentStore.skyMieCoefficient || 0.005,
          mieDirectionalG: currentStore.skyMieDirectionalG || 0.8,
          exposure: currentStore.skyExposure ?? 1.0,
          cloudDensity: currentStore.cloudDensity ?? 0,
          cloudThickness: currentStore.cloudThickness || 0.5,
          cloudDetail: currentStore.cloudDetail || 0.5,
          cloudScale: currentStore.cloudScale || 1.0,
          cloudStorminess: currentStore.cloudStorminess || 0.0,
          cloudShadowStrength: currentStore.cloudShadowStrength || 0.0,
          cloudColor: new THREE.Color(currentStore.cloudColor || '#ffffff'),
          windIntensity: currentStore.windIntensity || 0.0,
          cloudRenderingMode: 'iq'
        })
      }

      // Update atmospheric perspective (fog/haze) for standalone weather
      if (viewerRef.current.atmosphericPerspective) {
        const currentStore = useAppStore.getState()
        const { elevation } = timeOfDayToSkyAngles(timeOfDay, currentStore.northOffset)
        let aerialFogColor = '#87ceeb'
        if (elevation < 0) {
          aerialFogColor = '#0a1020'
        } else if (elevation < 0.1) {
          aerialFogColor = '#ff8c42'
        } else if (elevation < 0.3) {
          aerialFogColor = '#ffb347'
        } else if (elevation < 0.5) {
          aerialFogColor = '#87ceeb'
        } else {
          aerialFogColor = '#5dade2'
        }
        viewerRef.current.atmosphericPerspective.update({
          color: currentStore.fogDensity > 0 ? currentStore.fogColor : aerialFogColor,
          density: currentStore.fogDensity,
          enabled: currentStore.fogDensity > 0
        })
      }
      
      // Update Three.js sun light direction for consistency (but CSM provides shadows)
      // CRITICAL: Directional light direction = from light.position to light.target
      // Place the light along sunDir (toward the sun in the sky) so rays travel downward
      if (directionalLights) {
        directionalLights.forEach((light) => {
          if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
            const sunLightPosition = sunSkyDirectionToLightPosition(lightSunDir)
            light.position.copy(sunLightPosition)
            if (!light.target.parent) {
              scene.add(light.target)
            }
            light.target.position.set(0, 0, 0)
            light.target.updateMatrixWorld()
            // Keep light visible but disable shadows (CSM handles shadows)
            light.visible = true
            light.intensity = sunIntensity
            light.color.set(sunColor)
            light.castShadow = false // CSM handles shadows
          }
        })
      }
    }
    // Option 3: Neither Streets GL nor standalone weather - use standard Three.js sun
    else {
      if (weatherMaterialChanged) {
        console.log('[ViewerCanvas] Taking standard Three.js sun branch - no standalone weather initialization')
      }
      // Update Three.js sun light normally
      // CRITICAL: Directional light direction = from light.position to light.target
      // Place the light along adjustedSunDir so rays travel toward the scene
      if (directionalLights) {
        directionalLights.forEach((light) => {
          if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
            // CRITICAL: When HDR is enabled, adjust sun direction to match HDR rotation
            // HDR has been rotated 180° (both X and Y) to fix orientation, so sun light should match
            let adjustedSunDir = skySunDir.clone()
            const hdrEnabled = useAppStore.getState().hdrEnabled
            if (hdrEnabled) {
              // Apply 180° rotation to match HDR's rotated environment
              // Rotate 180° around X axis (flip Y), then 180° around Y axis (flip X)
              adjustedSunDir.x = -adjustedSunDir.x
              adjustedSunDir.y = -adjustedSunDir.y
              // Z might also need to be flipped depending on coordinate system
              adjustedSunDir.z = -adjustedSunDir.z
              adjustedSunDir.normalize()
            }
            
            const sunLightPosition = sunSkyDirectionToLightPosition(adjustedSunDir)
            light.position.copy(sunLightPosition)
            if (!light.target.parent) {
              scene.add(light.target)
            }
            light.target.position.set(0, 0, 0)
            light.target.updateMatrixWorld()
            light.visible = true
            light.intensity = sunIntensity
            light.color.set(sunColor)
            light.castShadow = true
          }
        })
      }
    }

    // ===== COMPREHENSIVE CONFLICT DETECTION & RESOLUTION =====
    const conflicts: string[] = []
    
    // Count light types for analysis
    const lightTypeCounts = {
      directional: 0,
      point: 0,
      spot: 0,
      rectarea: 0,
      hemisphere: 0
    }
    const enabledLights = directionalLightsConfig.filter(l => l.enabled)
    const shadowCastingLights = directionalLightsConfig.filter(l => l.enabled && l.castShadow)
    
    enabledLights.forEach(light => {
      const type = light.type || 'directional'
      if (type in lightTypeCounts) {
        lightTypeCounts[type as keyof typeof lightTypeCounts]++
      }
    })
    
    // ===== HDR CONFLICTS =====
    // Streets GL only - Three.js Sky removed
    if (hdrEnabled && scene.environment) {
      conflicts.push('INFO: HDR enabled - environment map used for reflections')
    }
    
    // ===== LIGHT TYPE CONFLICTS =====
    // Multiple directional lights (only one should be sun)
    const sunLights = directionalLightsConfig.filter(l => l.isSun && l.enabled)
    if (sunLights.length > 1) {
      conflicts.push(`WARNING: Multiple sun lights detected (${sunLights.length}) - only one sun should be active`)
    }
    
    // Too many lights (performance warning)
    const totalLights = enabledLights.length
    if (totalLights > 10) {
      conflicts.push(`WARNING: High light count (${totalLights}) - may impact performance`)
    }
    
    // RectAreaLight requires RectAreaLightUniformsLib initialization
    if (lightTypeCounts.rectarea > 0) {
      conflicts.push('INFO: RectAreaLight detected - requires RectAreaLightUniformsLib (should be initialized automatically)')
    }
    
    // Physical light properties conflicts
    const physicalLights = enabledLights.filter(l => 
      (l.type === 'point' || l.type === 'spot') && 
      (l.power !== undefined || l.decay !== undefined)
    )
    if (physicalLights.length > 0 && ambientIntensity > 0.8) {
      conflicts.push('INFO: Physical lights (with power/decay) + high ambient light - may cause overexposure')
    }
    
    // ===== SHADOW CONFLICTS (lighting context) =====
    const lightingMode = resolveLightingMode({
      enableStandaloneWeather,
      streetsGLIframeOverlay,
      pathTracerActive: useAppStore.getState().pathTracerActive,
      hdrEnabled,
      hdrGroundProjectionEnabled: useAppStore.getState().hdrGroundProjectionEnabled,
      csmEnabled: viewerRef.current?.csmShadowSystem?.isEnabled() ?? false,
      shadowsEnabled,
      sunLightCastShadowConfig: directionalLightsConfig.some((l) => l.isSun && l.castShadow),
      nonSunShadowCastingCount: shadowCastingLights.filter((l) => !l.isSun).length
    })
    const contextConflicts = detectLightingConflicts({
      enableStandaloneWeather,
      streetsGLIframeOverlay,
      pathTracerActive: useAppStore.getState().pathTracerActive,
      hdrEnabled,
      hdrGroundProjectionEnabled: useAppStore.getState().hdrGroundProjectionEnabled,
      csmEnabled: viewerRef.current?.csmShadowSystem?.isEnabled() ?? false,
      shadowsEnabled,
      sunLightCastShadowConfig: directionalLightsConfig.some((l) => l.isSun && l.castShadow),
      nonSunShadowCastingCount: shadowCastingLights.filter((l) => !l.isSun).length
    })
    contextConflicts.forEach((c) => {
      const prefix = c.severity === 'error' ? 'ERROR' : c.severity === 'warning' ? 'WARNING' : 'INFO'
      conflicts.push(`${prefix}: [${c.code}] ${c.message}`)
    })

    if (lightingMode === 'standalone-weather' && shadowCastingLights.some((l) => l.isSun && l.castShadow)) {
      conflicts.push('INFO: Sun legacy shadow maps suppressed — CSM provides sun shadows')
    }

    // ===== SHADOW CONFLICTS =====
    if (shadowCastingLights.length > 0 && !shadowsEnabled) {
      conflicts.push('WARNING: Shadow-casting lights enabled but global shadows disabled - shadows will not render')
    }
    
    if (shadowCastingLights.length > 4) {
      conflicts.push(`WARNING: High shadow-casting light count (${shadowCastingLights.length}) - may cause performance issues`)
    }
    
    // Point/Spot light shadows are expensive
    const expensiveShadowLights = shadowCastingLights.filter(l => 
      l.type === 'point' || l.type === 'spot'
    )
    if (expensiveShadowLights.length > 2) {
      conflicts.push(`WARNING: Multiple point/spot light shadows (${expensiveShadowLights.length}) - very expensive, consider reducing count`)
    }
    
    // ===== LENS FLARE CONFLICTS =====
    // Lens flare only works with sun (directional light)
    // Streets GL only - Lens flare removed (Streets GL handles sun rendering)
    
    // ===== HDR & MATERIAL CONFLICTS =====
    if (hdrEnabled && !scene.environment) {
      conflicts.push('WARNING: HDR enabled but no environment map loaded - reflections may not work')
    }
    
    if (hdrEnabled && hdrIntensity > 3.0) {
      conflicts.push('WARNING: Very high HDR intensity (>3.0) - may cause overexposure')
    }
    
    // ===== DISPERSION CONFLICTS =====
    // Dispersion requires transmission materials and HDR/environment map
    if (hdrEnabled && scene.environment) {
      // Check if any materials have dispersion enabled
      let dispersionMaterials = 0
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
          if (mat instanceof THREE.MeshPhysicalMaterial && 
              mat.userData.dispersionApplied && 
              mat.transmission > 0) {
            dispersionMaterials++
          }
        }
      })
      if (dispersionMaterials > 0) {
        conflicts.push(`INFO: ${dispersionMaterials} material(s) with dispersion enabled - requires HDR/environment map for best results`)
      }
    }
    
    // ===== INSTANCING CONFLICTS =====
    // Instancing works with all lights but may have performance implications
    let instancedMeshes = 0
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        instancedMeshes++
      }
    })
    if (instancedMeshes > 0 && totalLights > 5) {
      conflicts.push(`INFO: Instanced meshes (${instancedMeshes}) + multiple lights (${totalLights}) - ensure good performance`)
    }
    
          try {
        throttledDebugLog.groupCollapsed('[LightingDebug] System State & Conflicts')
      throttledDebugLog.log('State:', {
        // Streets GL only - dynamicSkyEnabled removed
        hdrEnabled,
        hasSceneEnvironment: !!scene.environment,
        hasSceneBackground: !!scene.background,
        cloudDensity,
        sunPosition: sunPosition.toArray(),
        totalLights,
        lightTypeCounts,
        shadowCastingLights: shadowCastingLights.length,
        shadowsEnabled,
        ambientIntensity,
        hdrIntensity
      })
      if (conflicts.length > 0) {
        // Log as info, not warning - these are informational messages about system interactions
        throttledDebugLog.log('ℹ️ Conflicts detected:', conflicts)
      } else {
        throttledDebugLog.log('✅ No conflicts detected')
      }
      throttledDebugLog.groupEnd()
    } catch {}

    // Handle background based on active systems
    // Priority: HDR (if enabled) > Three.js Sky > Solid Color

    // HDR-ONLY MODE: Skip Three.js Sky completely
    // Streets GL only - Three.js Sky and SunMoonSystem removed

    // Streets GL only - Dynamic Sky and CSM removed
    // All weather/sun/shadow systems are now handled by Streets GL
    // Removed entire Dynamic Sky/CSM/Three.js Sky initialization block (was ~350 lines)
    
    // Ensure a fallback environment for reflections when HDR is disabled
    if (!hdrEnabled && !scene.environment) {
        try {
          // Use centralized EnvironmentManager to prevent duplicate creation
          const envManager = EnvironmentManager.getInstance()
          envManager.initialize(renderer)
          if (!viewerRef.current.defaultEnvTexture) {
            viewerRef.current.defaultEnvTexture = envManager.getDefaultEnvironment()
          }
          const defaultEnv = viewerRef.current?.defaultEnvTexture
          if (defaultEnv) {
            scene.environment = defaultEnv
            
            // CRITICAL: Apply fallback envMap to ALL materials immediately when fallback is set
            let appliedCount = 0
            scene.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                const material = object.material
                if (Array.isArray(material)) {
                  material.forEach((mat: THREE.Material) => {
                    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                      if (!mat.envMap || mat.envMap !== defaultEnv) {
                        mat.envMap = defaultEnv
                        mat.needsUpdate = true
                        appliedCount++
                      }
                    }
                  })
                } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
                  if (!material.envMap || material.envMap !== defaultEnv) {
                    material.envMap = defaultEnv
                    material.needsUpdate = true
                    appliedCount++
                  }
                }
              }
            })
            
            try {
              console.log(`[WeatherDebug] Applied fallback RoomEnvironment to ${appliedCount} materials (Three.js Sky enabled, HDR disabled)`)
            } catch {}
          }
        } catch {}
      }
      
      // When HDR is enabled, HDR background takes priority - ensure it's set correctly
      // CRITICAL: This must ALWAYS override Three.js Sky background when HDR is enabled
      // BUT: Ground projection needs scene.background = null to render properly
      if (hdrEnabled && !hdrGroundProjectionEnabled) {
        const originalHdrTexture = viewerRef.current?.environmentMap as THREE.DataTexture | null
        if (originalHdrTexture && originalHdrTexture instanceof THREE.DataTexture && scene.environment) {
          // Force HDR background (original equirectangular texture) - ALWAYS override Three.js Sky
          originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
          originalHdrTexture.needsUpdate = true
          scene.background = originalHdrTexture
          
          // Ensure clear color is transparent to show HDR
          renderer.setClearColor(new THREE.Color(0x000000), 0)
          
          try {
            // DataTexture exposes width/height directly; fallback to image.* when available
            const width = (originalHdrTexture as any).width ?? (originalHdrTexture as any).image?.width ?? 0
            const height = (originalHdrTexture as any).height ?? (originalHdrTexture as any).image?.height ?? 0
            
            console.log('[HDR] FORCED HDR background (HDR takes priority over Three.js Sky)', {
              hasTexture: !!originalHdrTexture,
              width,
              height,
              mapping: originalHdrTexture.mapping,
              backgroundType: scene.background?.constructor?.name
            })
          } catch {}
        } else if (hdrEnabled && !hdrGroundProjectionEnabled && !originalHdrTexture) {
          // HDR is enabled but texture not loaded yet - wait for it
          try {
            console.log('[HDR] HDR enabled but texture not loaded yet, waiting...')
          } catch {}
          // Still set clear color to transparent
          renderer.setClearColor(new THREE.Color(0x000000), 0)
        } else if (hdrEnabled && !hdrGroundProjectionEnabled && !scene.environment) {
          // HDR enabled but no environment - PMREM might still be generating
          renderer.setClearColor(new THREE.Color(0x000000), 0)
        } else if (hdrEnabled && hdrGroundProjectionEnabled) {
          // Ground projection enabled - ensure background is null so GroundedSkybox can render
          scene.background = null
          renderer.setClearColor(new THREE.Color(0x000000), 0)
        }
      }
      // Streets GL only - Three.js Sky removed, no fallback needed
      
      if (weatherMaterialChanged) {
      const metallicBoost = isDarkWeather ? 1.5 : 1.0
      // Apply environment map to all PBR materials for reflections
      // Boost envMapIntensity for metallic materials in dark weather conditions
      // Note: metallicBoost is already declared earlier in this useEffect (line 7012)
      
      if (scene.environment) {
        try {
          let appliedCount = 0
          let boostedCount = 0
          let metallicMaterials = 0
          let lowIntensityMetallics = 0
          let missingEnvMapMetallics = 0
          const materialDetails: Array<{ type: string, metalness: number, envMapIntensity: number, hasEnvMap: boolean }> = []
          
          // Industry-standard exclusion check: Check if object should be excluded from sky/weather modifications
          const shouldExcludeFromModifications = (obj: THREE.Object3D): boolean => {
            // Check explicit exclusion flags (industry-standard approach)
            if (obj.userData.excludeFromSkyModifications === true) return true
            // Streets GL only - Dynamic Sky removed
          if (false && obj.userData.excludeFromWeatherModifications === true) return true
            
            // Check if object is part of an imported model (legacy check for backward compatibility)
            if (obj.userData.isModel || obj.userData.isImportedModel) return true
            
            // Recursive check: if any parent has exclusion flags, exclude this object
            let parent = obj.parent
            while (parent !== null) {
              if (parent.userData.excludeFromSkyModifications === true) return true
              // Streets GL only - Dynamic Sky removed
              if (false && parent!.userData.excludeFromWeatherModifications === true) return true
              if (parent.userData.isModel || parent.userData.isImportedModel) return true
              const nextParent = parent.parent
              if (nextParent === null) break
              parent = nextParent
            }
            
            return false
          }
          
          scene.traverse((object) => {
            // Industry-standard: Skip objects marked for exclusion from sky/weather modifications
            if (shouldExcludeFromModifications(object)) {
              return
            }
            
            if (object instanceof THREE.Mesh && object.material) {
              const materials = Array.isArray(object.material) ? object.material : [object.material]
              materials.forEach((mat: THREE.Material) => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                  // CRITICAL: Preserve depth masking settings (depthTest, depthWrite, opacity, transparent)
                  // These are set during model load and MUST NOT be overridden by weather system
                  const preserveDepthTest = mat.depthTest
                  const preserveDepthWrite = mat.depthWrite
                  const preserveOpacity = mat.opacity
                  const preserveTransparent = mat.transparent
                  
                  const metalness = mat.metalness !== undefined ? mat.metalness : 0
                  const isMetallic = metalness > 0.3
                  
                  if (isMetallic) {
                    metallicMaterials++
                    if (!mat.envMap) {
                      missingEnvMapMetallics++
                    }
                  }
                  
                  const needsUpdate = !mat.envMap || mat.envMap !== scene.environment
                  if (needsUpdate) {
                    mat.envMap = scene.environment
                    mat.needsUpdate = true
                    appliedCount++
                  }
                  
                  // Boost envMapIntensity for metallic materials in dark weather conditions
                  // Note: HDR system already boosts metallic materials by 1.5x, so we need to check if HDR is enabled
                  // Store original envMapIntensity if not already stored
                  if (!(mat as any).__originalEnvMapIntensity) {
                    (mat as any).__originalEnvMapIntensity = mat.envMapIntensity || 1.0
                  }
                  
                  const originalIntensity = (mat as any).__originalEnvMapIntensity || 1.0
                  
                  if (isDarkWeather && mat.metalness !== undefined && mat.metalness > 0.3) {
                    // Check if HDR is already boosting this material
                    // HDR sets envMapIntensity to hdrIntensity * 1.5 for metallic materials
                    // If HDR is enabled, use current intensity as base, otherwise use original
                    const baseIntensity = hdrEnabled ? (mat.envMapIntensity || originalIntensity) : originalIntensity
                    // Only apply weather boost if not already boosted by HDR
                    const boostedIntensity = hdrEnabled ? baseIntensity : (baseIntensity * metallicBoost)
                    if (mat.envMapIntensity !== boostedIntensity) {
                      mat.envMapIntensity = boostedIntensity
                      mat.needsUpdate = true
                      boostedCount++
                    }
                    if (boostedIntensity < 1.0) {
                      lowIntensityMetallics++
                    }
                    materialDetails.push({
                      type: mat.type,
                      metalness: metalness,
                      envMapIntensity: boostedIntensity,
                      hasEnvMap: !!mat.envMap
                    })
                  } else if (!isDarkWeather) {
                    // Reset to original intensity when not in dark weather
                    // But if HDR is enabled, it will set its own intensity in the HDR effect
                    if (!hdrEnabled && mat.envMapIntensity !== originalIntensity) {
                      mat.envMapIntensity = originalIntensity
                      mat.needsUpdate = true
                    }
                  }
                  
                  // Darken material colors for dark weather presets to reduce white appearance
                  // Skip when standalone weather is active — lighting presets already dim the scene
                  if (mat.color && !enableStandaloneWeather) {
                    // Always store original color if not already stored (before any modifications)
                    if (!(mat as any).__originalColor) {
                      (mat as any).__originalColor = mat.color.clone()
                    }
                    
                    if (isDarkWeather) {
                      // First restore original color, then apply new darkening (prevents cumulative darkening)
                      const originalColor = (mat as any).__originalColor
                      const colorDarkening = weatherPreset === 'stormy' ? 0.6 : (weatherPreset === 'overcast' ? 0.7 : 0.75)
                      mat.color.setRGB(
                        originalColor.r * colorDarkening,
                        originalColor.g * colorDarkening,
                        originalColor.b * colorDarkening
                      )
                      mat.needsUpdate = true
                    } else {
                      // Restore original color when not in dark weather
                      if ((mat as any).__originalColor) {
                        mat.color.copy((mat as any).__originalColor)
                        mat.needsUpdate = true
                      }
                    }
                  }
                  
                  // RESTORE depth masking settings (prevents weather system from breaking depth masking)
                  mat.depthTest = preserveDepthTest
                  mat.depthWrite = preserveDepthWrite
                  if (preserveOpacity !== undefined) mat.opacity = preserveOpacity
                  mat.transparent = preserveTransparent
                } else if (mat instanceof THREE.MeshPhongMaterial) {
                  if (!mat.envMap || mat.envMap !== scene.environment) {
                    mat.envMap = scene.environment
                    mat.reflectivity = mat.reflectivity || 0.5
                    mat.needsUpdate = true
                    appliedCount++
                  }
                }
              })
            }
          })
          
          // Comprehensive debug logging for dark weather presets (only log once, not every render)
          // Use a ref to track if we've already logged for this preset
          if (isDarkWeather && (boostedCount > 0 || missingEnvMapMetallics > 0 || lowIntensityMetallics > 0)) {
            // Only log when there are actual changes or issues, not on every render
            // This prevents console spam
            const lastLogKey = `weather-log-${weatherPreset}-${boostedCount}-${missingEnvMapMetallics}-${lowIntensityMetallics}`
            const lastLog = (window as any).__lastWeatherLog
            if (lastLog !== lastLogKey) {
              (window as any).__lastWeatherLog = lastLogKey
              try {
                console.groupCollapsed(`[TextureDebug] Material analysis for ${weatherPreset} preset`)
                console.log('Material statistics:', {
                  totalMetallicMaterials: metallicMaterials,
                  materialsWithBoostedEnvMap: boostedCount,
                  materialsMissingEnvMap: missingEnvMapMetallics,
                  materialsWithLowIntensity: lowIntensityMetallics,
                  envMapBoost: `${metallicBoost}x`,
                  toneMappingExposure,
                  colorDarkening: weatherPreset === 'stormy' ? '60%' : (weatherPreset === 'overcast' ? '70%' : '75%')
                })
                
                console.log(`✅ Material colors darkened to ${weatherPreset === 'stormy' ? '60%' : (weatherPreset === 'overcast' ? '70%' : '75%')} for dark weather appearance`)
                
                if (missingEnvMapMetallics > 0) {
                  console.warn(`⚠️ ${missingEnvMapMetallics} metallic materials missing envMap - reflections may not work`)
                }
                
                if (lowIntensityMetallics > 0) {
                  console.warn(`⚠️ ${lowIntensityMetallics} metallic materials have low envMapIntensity (< 1.0) - reflections may be dim`)
                }
                
                if (boostedCount > 0) {
                  console.log(`✅ Boosted envMapIntensity for ${boostedCount} metallic materials`)
                }
                
                if (materialDetails.length > 0 && materialDetails.length <= 10) {
                  console.log('Sample material details:', materialDetails.slice(0, 10))
                } else if (materialDetails.length > 10) {
                  console.log(`Sample material details (showing first 10 of ${materialDetails.length}):`, materialDetails.slice(0, 10))
                }
                
                console.log('Lighting state:', {
                  sunIntensity: `${(sunIntensity * 100).toFixed(1)}%`,
                  ambientIntensity: `${(ambientIntensity * 100).toFixed(1)}%`,
                  contrast: sunIntensity > ambientIntensity ? '✅ Sun > Ambient (good contrast)' : '⚠️ Sun <= Ambient (low contrast)',
                  hasEnvironment: !!scene.environment,
                  environmentSource: hdrEnabled ? 'HDR' : 'Fallback RoomEnvironment'
                })
                
                console.groupEnd()
              } catch {}
            }
          }
          
          if (appliedCount > 0 || boostedCount > 0) {
            try {
              if (appliedCount > 0) {
                console.log(`[MaterialDebug] Applied envMap to ${appliedCount} materials for reflections`)
              }
              if (boostedCount > 0) {
                console.log(`[MaterialDebug] Boosted envMapIntensity for ${boostedCount} metallic materials (${weatherPreset} weather)`)
              }
            } catch {}
          }
        } catch (error) {
          try {
            console.warn('[MaterialDebug] Error applying envMap to materials:', error)
          } catch {}
        }
      } else if (isDarkWeather) {
        // Warning when dark weather is active but no environment map
        try {
          console.warn(`[TextureDebug] ⚠️ ${weatherPreset} preset active but no environment map available - metallic materials may not reflect properly`)
        } catch {}
      }
      }
      
      // When Three.js Sky is disabled, HDR background should be handled by HDR effect
      // Only set background here if HDR is NOT enabled and DynamicSky is not rendering the sky
      const standaloneSkyActive =
        enableStandaloneWeather && !!viewerRef.current?.dynamicSky
      if (!hdrEnabled && !standaloneSkyActive) {
        // No HDR - use sky color as background
        scene.background = new THREE.Color(skyColor)
        renderer.setClearColor(new THREE.Color(skyColor), 1)
      } else if (standaloneSkyActive && !hdrEnabled) {
        scene.background = null
        renderer.setClearColor(new THREE.Color(0x000000), 0)
      } else {
        // HDR is enabled - DO NOT modify background here
        // The HDR effect and final check will handle it
        // Just ensure clear color is transparent if HDR is enabled
        renderer.setClearColor(new THREE.Color(0x000000), 0)
      }

    // Streets GL only - SunMoonSystem removed

    // Weather effect controls ambient light directly - no need to update store
    // The separate effect for ambient light syncs from store to light
    
    // ===== MATERIAL ANALYSIS & CONFLICT DETECTION =====
    if (weatherMaterialChanged) {
    const materialAnalysis = {
      totalMeshes: 0,
      materialsByType: {} as Record<string, number>,
      materialsWithEnvMap: 0,
      materialsWithoutEnvMap: 0,
      envMapSources: {
        hdr: 0,
        fallback: 0,
        none: 0
      },
      materialIssues: [] as string[],
      metallicMaterials: 0,
      reflectiveMaterials: 0,
      pbrMaterials: 0,
      nonPbrMaterials: 0
    }

    try {
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material) {
          materialAnalysis.totalMeshes++
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          
          materials.forEach((mat: THREE.Material) => {
            const matType = mat.type || 'Unknown'
            materialAnalysis.materialsByType[matType] = (materialAnalysis.materialsByType[matType] || 0) + 1

            // Check PBR materials
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
              materialAnalysis.pbrMaterials++
              
              // Check for environment map
              if (mat.envMap) {
                materialAnalysis.materialsWithEnvMap++
                // Determine envMap source
                if (scene.environment && mat.envMap === scene.environment) {
                  if (hdrEnabled && viewerRef.current?.environmentMap) {
                    materialAnalysis.envMapSources.hdr++
                  } else {
                    materialAnalysis.envMapSources.fallback++
                  }
                } else {
                  // Material has envMap but it's not the scene environment (unusual)
                  materialAnalysis.materialIssues.push(`${matType} has envMap but doesn't match scene.environment`)
                }
              } else {
                materialAnalysis.materialsWithoutEnvMap++
                materialAnalysis.envMapSources.none++
                // Check if material should have envMap based on weather system
                if (hdrEnabled && scene.environment) {
                  materialAnalysis.materialIssues.push(`${matType} missing envMap despite HDR being enabled`)
                } else if (!hdrEnabled && scene.environment) {
                  // Fallback RoomEnvironment should be applied
                  materialAnalysis.materialIssues.push(`${matType} missing envMap despite fallback environment being available`)
                }
              }

              // Check metallic/reflective properties
              if (mat.metalness !== undefined && mat.metalness > 0.3) {
                materialAnalysis.metallicMaterials++
              }
              if (mat.roughness !== undefined && mat.roughness < 0.5) {
                materialAnalysis.reflectiveMaterials++
              }

              // Check for conflicts with weather systems
              if (mat.metalness > 0.5 && !mat.envMap && (hdrEnabled || scene.environment)) {
                materialAnalysis.materialIssues.push(`Metallic ${matType} (metalness: ${mat.metalness.toFixed(2)}) missing envMap - reflections may not work correctly`)
              }

              // Check envMapIntensity
              if (mat.envMap && mat.envMapIntensity !== undefined) {
                if (mat.envMapIntensity === 0) {
                  materialAnalysis.materialIssues.push(`${matType} has envMap but intensity is 0 - reflections disabled`)
                }
                if (hdrEnabled && mat.envMapIntensity < 0.5 && mat.metalness > 0.5) {
                  materialAnalysis.materialIssues.push(`Metallic ${matType} has low envMapIntensity (${mat.envMapIntensity.toFixed(2)}) - reflections may be too dim`)
                }
              }
            } else {
              materialAnalysis.nonPbrMaterials++
              // Check non-PBR materials
              if (mat instanceof THREE.MeshPhongMaterial) {
                if (mat.envMap && scene.environment && mat.envMap !== scene.environment) {
                  materialAnalysis.materialIssues.push(`MeshPhongMaterial has envMap but doesn't match scene.environment`)
                }
                if (!mat.envMap && scene.environment) {
                  materialAnalysis.materialIssues.push(`MeshPhongMaterial missing envMap - reflections won't work`)
                }
              } else if (mat instanceof THREE.MeshBasicMaterial) {
                // Basic materials don't support reflections
                if (mat.envMap) {
                  materialAnalysis.materialIssues.push(`MeshBasicMaterial has envMap but won't reflect (not supported)`)
                }
              }
            }
          })
        }
      })
    } catch (error) {
      materialAnalysis.materialIssues.push(`Error analyzing materials: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // ===== MATERIAL-WEATHER CONFLICT DETECTION =====
    const materialWeatherConflicts: string[] = []
    
    if (hdrEnabled && materialAnalysis.materialsWithoutEnvMap > 0) {
      materialWeatherConflicts.push(`WARNING: ${materialAnalysis.materialsWithoutEnvMap} materials missing envMap despite HDR being enabled - reflections may not work`)
    }
    
    if (!hdrEnabled && scene.environment && materialAnalysis.materialsWithoutEnvMap > 0) {
      materialWeatherConflicts.push(`INFO: ${materialAnalysis.materialsWithoutEnvMap} materials missing fallback envMap - using RoomEnvironment for reflections`)
    }



    // Streets GL only - Dynamic Sky removed
    if (false && !hdrEnabled && materialAnalysis.materialsWithEnvMap === 0 && scene.environment) {
      materialWeatherConflicts.push(`INFO: Materials may use fallback RoomEnvironment for reflections while Three.js Sky handles background`)
    }

    if (materialAnalysis.metallicMaterials > 0 && !scene.environment) {
      materialWeatherConflicts.push(`WARNING: ${materialAnalysis.metallicMaterials} metallic materials found but no environment map - reflections won't work`)
    }

    // ===== FINAL STATE SUMMARY (for debugging/copying) =====
    try {
      const summary = {
        timestamp: new Date().toISOString(),
        systems: {

          // Streets GL only - threeSky removed
          hdr: {
            enabled: hdrEnabled,
            hasEnvironment: !!scene.environment,
            hasBackground: !!(scene.background && scene.background instanceof THREE.Texture)
          },
          lighting: {
            sunPosition: sunPosition.toArray(),
            ambientLightIntensity: ambientLight?.intensity || 0,
            shadowsEnabled: renderer.shadowMap.enabled
          }
        },
        materials: {
          totalMeshes: materialAnalysis.totalMeshes,
          materialsByType: materialAnalysis.materialsByType,
          pbrMaterials: materialAnalysis.pbrMaterials,
          nonPbrMaterials: materialAnalysis.nonPbrMaterials,
          withEnvMap: materialAnalysis.materialsWithEnvMap,
          withoutEnvMap: materialAnalysis.materialsWithoutEnvMap,
          envMapSources: materialAnalysis.envMapSources,
          metallicMaterials: materialAnalysis.metallicMaterials,
          reflectiveMaterials: materialAnalysis.reflectiveMaterials,
          issues: materialAnalysis.materialIssues.length > 0 ? materialAnalysis.materialIssues : null,
          weatherConflicts: materialWeatherConflicts.length > 0 ? materialWeatherConflicts : null
        },
        conflicts: conflicts.length > 0 ? conflicts : null,
        scene: {
          background: scene.background 
            ? (scene.background instanceof THREE.Texture ? 'HDR Texture' : 'Color') 
            : 'null', // Streets GL only - Three.js Sky removed
          environment: scene.environment ? 'Set' : 'null'
        },
        notes: [
          'Three.js Sky uses official Preetham atmospheric scattering model',
          'Rain and snow are mutually exclusive - snow takes priority when both are active',
          'HDR environment maps work for reflections even when Three.js Sky is active',
          'Materials with metalness > 0.3 require environment maps for proper reflections',
          'PBR materials (MeshStandardMaterial/MeshPhysicalMaterial) support envMap reflections',
          'Non-PBR materials may not reflect properly - consider converting to PBR'
        ]
      }
      throttledDebugLog.log('[LightingSummary] Complete state (copy this if reporting issues):', JSON.stringify(summary, null, 2))
    } catch {}
    }
    
    // CRITICAL FINAL CHECK: Ensure HDR background is ALWAYS set if HDR is enabled
    // This runs AFTER all lighting/weather logic to override any background changes
    // Must use original equirectangular texture, not PMREM cube map
    // BUT: Ground projection needs scene.background = null to render properly
    if (hdrEnabled && !hdrGroundProjectionEnabled && scene.environment) {
      const originalHdrTexture = viewerRef.current?.environmentMap as THREE.DataTexture | null
      if (originalHdrTexture && originalHdrTexture instanceof THREE.DataTexture) {
        originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
        originalHdrTexture.needsUpdate = true
        scene.background = originalHdrTexture
        // Streets GL only - Three.js Sky removed
        
        // Set clear color to transparent to show HDR
        const renderer = viewerRef.current?.renderer
        if (renderer) {
          renderer.setClearColor(new THREE.Color(0x000000), 0)
        }
        
        // IMPROVED: Throttled HDR final check logging to prevent spam
        // Only log when HDR state actually changes
        const lastHDRFinalCheck = (window as any).__lastHDRFinalCheck || { time: 0, hdrEnabled: false }
        const hdrCheckTimeValue = Date.now()
        const hdrStateChanged = lastHDRFinalCheck.hdrEnabled !== hdrEnabled
        if (hdrStateChanged || hdrCheckTimeValue - lastHDRFinalCheck.time > 10000) { // Log at most once every 10 seconds or on state change
          (window as any).__lastHDRFinalCheck = { time: hdrCheckTimeValue, hdrEnabled }
          try {
            console.log('[HDR] FINAL CHECK: HDR background enforced (after lighting effects)', {
              hasTexture: !!originalHdrTexture,
              mapping: originalHdrTexture.mapping,
              backgroundType: scene.background?.constructor?.name,
              backgroundIsTexture: scene.background instanceof THREE.Texture,
              backgroundMatches: scene.background === originalHdrTexture,
              // Streets GL only - threeSky removed
            })
          } catch {}
        }
      } else {
        // Original HDR texture not available yet - this is expected during initial load
        // The background will be set automatically when HDR finishes loading
        // No warning needed as this is normal behavior during loading
      }
    }
  }, [weatherPreset, cloudDensity, cloudThickness, cloudDetail, cloudScale, cloudStorminess, cloudShadowStrength, cloudColor, fogDensity, fogHeight, fogColor, rainIntensity, snowIntensity, windIntensity, timeOfDay, skyTurbidity, skyAtmosphereDensity, skyRayleigh, skyMieCoefficient, skyMieDirectionalG, skyExposure, skyElevation, skyAzimuth, hdrEnabled, hdrIntensity, sunSize, moonSize, northOffset, postProcessingEnabled, toneMappingType, enableStandaloneWeather, streetsGLIframeOverlay, streetsGLBridge, waterEnabled, waterLevel, waterColor, waterOpacity, waveSpeed, waveHeight, waterReflectivity, weatherQuality])

  // Effect to update ambient light intensity from store (user slider)
  // This MUST run AFTER weather system to ensure user's slider value takes precedence
  // IMPROVED: The weather system calculates ambientIntensity based on time of day, but user's slider should override it
  // CRITICAL: When HDR is enabled, reduce ambient light significantly because HDR environment map already provides ambient lighting
  // HDR environment maps provide ambient lighting through reflections and environment mapping
  // Additional ambient light can wash out shadows and make the scene look flat
  // NOTE: hdrEnabled is already declared earlier in the file (line 3695), reuse it via useAppStore.getState()
  useEffect(() => {
    if (!viewerRef.current) return
    const { ambientLight, scene } = viewerRef.current
    // Get HDR state from store (hdrEnabled is already declared earlier, avoid redeclaring)
    const hdrEnabledFromStore = useAppStore.getState().hdrEnabled
    
    if (ambientLight) {
      const hasHDREnvironment = hdrEnabledFromStore && scene.environment !== null
      const shadowsEnabled = useAppStore.getState().shadowsEnabled
      const probeActive = viewerRef.current?.indirectLightingSystem?.isActive() ?? false
      const hdrSunBoost = hdrEnabledFromStore
        ? THREE.MathUtils.clamp(
            0.85 + useAppStore.getState().hdrIntensity * 0.35,
            1.0,
            2.2
          )
        : 1.0
      const effectiveAmbientIntensity = hasHDREnvironment
        ? computeHdrAmbientIntensity({
            sliderAmbient: ambientIntensity,
            shadowsEnabled,
            probeActive,
            hdrSunBoost
          })
        : ambientIntensity
      
      ambientLight.intensity = effectiveAmbientIntensity
      
      // IMPROVED: Debug logging for ambient light adjustment (throttled to prevent spam)
      // Only log when HDR is active, intensity is reduced, and value actually changed
      if (hasHDREnvironment && effectiveAmbientIntensity !== ambientIntensity) {
        const lastAmbientLog = (window as any).__lastAmbientSliderLog || { value: -1, time: 0 }
        const now = Date.now()
        // Only log if value changed or it's been more than 2 seconds since last log
        if (lastAmbientLog.value !== effectiveAmbientIntensity || now - lastAmbientLog.time > 2000) {
          (window as any).__lastAmbientSliderLog = { value: effectiveAmbientIntensity, time: now }
          console.log(`[AmbientLight] HDR enabled - adjusting ambient light from ${ambientIntensity.toFixed(2)} to ${effectiveAmbientIntensity.toFixed(2)} (HDR shadow-aware fill)`)
        }
      }
    }
  }, [ambientIntensity, hdrEnabled, hdrIntensity, shadowsEnabled])

  // Effect to manage particle systems and water
  const rainParticleScale = useAppStore((state) => state.rainParticleScale)
  const rainParticleSpeed = useAppStore((state) => state.rainParticleSpeed)
  const rainCollisionEnabled = useAppStore((state) => state.rainCollisionEnabled)
  const snowParticleScale = useAppStore((state) => state.snowParticleScale)
  const snowParticleSpeed = useAppStore((state) => state.snowParticleSpeed)
  const snowCollisionEnabled = useAppStore((state) => state.snowCollisionEnabled)
  const windGustsEnabled = useAppStore((state) => state.windGustsEnabled)
  const oceanDistortionScale = useAppStore((state) => state.oceanDistortionScale)
  const oceanSize = useAppStore((state) => state.oceanSize)

  useEffect(() => {
    if (!viewerRef.current) return

    const { scene, particleSystems, waterSystem } = viewerRef.current
    const hdrActive = hdrEnabled && scene.environment
    
    // ===== HDR + PARTICLE SYSTEM CONFLICT DETECTION =====
    const particleConflicts: string[] = []
    if (hdrActive && rainIntensity > 0) {
      particleConflicts.push('INFO: HDR + Rain - Rain uses additive blending, may appear dim on bright HDR backgrounds')
    }
    if (hdrActive && snowIntensity > 0) {
      particleConflicts.push('INFO: HDR + Snow - Snow should work with HDR (normal blending)')
    }
    
    // IMPROVED: Throttled particle debug logging to prevent spam
    // Only log when there are actual conflicts or significant state changes
    try {
      if (particleConflicts.length > 0) {
        // Log conflicts immediately (they're important)
        const lastConflictLog = (window as any).__lastParticleConflictLog || { key: '', time: 0 }
        const conflictKey = JSON.stringify(particleConflicts)
        const now = Date.now()
        if (conflictKey !== lastConflictLog.key || now - lastConflictLog.time > 10000) {
          (window as any).__lastParticleConflictLog = { key: conflictKey, time: now }
          console.groupCollapsed('[ParticleDebug] HDR + Particles Interaction')
          console.log('HDR Active:', hdrActive)
          console.log('Rain Active:', rainIntensity > 0)
          console.log('Snow Active:', snowIntensity > 0)
          console.log('Scene Background:', scene.background ? 'Set' : 'null')
          console.log('Scene Environment:', scene.environment ? 'Set' : 'null')
          console.log('Notes:', particleConflicts)
          console.groupEnd()
        }
      }
    } catch {}

    // HDR-ONLY MODE: Disable all particle systems
    const hdrOnlyMode = useAppStore.getState().hdrOnlyMode
    if (hdrOnlyMode) {
      // Destroy all particle systems
      if (particleSystems) {
        particleSystems.forEach((system) => {
          try {
            system.destroy()
          } catch (e) {
            console.debug('Warning: Could not destroy particle system:', e)
          }
        })
        particleSystems.length = 0
      }
      // Destroy water system
      if (waterSystem) {
        try {
          waterSystem.destroy()
        } catch (e) {
          console.debug('Warning: Could not destroy water system:', e)
        }
        if (viewerRef.current) {
          viewerRef.current.waterSystem = undefined
        }
      }
      return // Skip all particle/water updates in HDR-only mode
    }

    // Update or create rain particle system
    // Note: Rain and snow cannot run simultaneously - enforce snow priority
    let rainSystem = particleSystems?.find((s: any) => s.config?.type === 'rain')
    const bothActive = rainIntensity > 0 && snowIntensity > 0
    if (bothActive) {
      try { 
        console.warn('[ConflictResolution] Both rain and snow > 0. Enforcing snow priority (rain disabled).') 
      } catch {}
      // Disable rain if exists
      if (rainSystem) { rainSystem.updateConfig({ enabled: false }) }
      // Note: We don't auto-reset rainIntensity in state to preserve user's slider setting
      // The rain system is just disabled in favor of snow
    }
    
    const shouldEnableRain = rainIntensity > 0 && snowIntensity === 0
    
    // IMPROVED: Throttled rain debug logging - only log when state actually changes
    // Remove frequent logging to prevent console spam
    // Only log when rain system is created/destroyed or when there are issues
    const rainStateChanged = (() => {
      const lastRainState = (window as any).__lastRainState || { enabled: null, intensity: -1 }
      const currentState = { enabled: shouldEnableRain, intensity: rainIntensity }
      const changed = lastRainState.enabled !== currentState.enabled || 
                      Math.abs(lastRainState.intensity - currentState.intensity) > 0.1
      if (changed) {
        (window as any).__lastRainState = currentState
      }
      return changed
    })()
    
    // Only log if state changed significantly (creation/destruction or intensity change > 0.1)
    if (rainStateChanged && (shouldEnableRain !== !!rainSystem || Math.abs((rainSystem?.config?.intensity || 0) - rainIntensity) > 0.1)) {
      try {
        console.log('[WeatherDebug] Rain system state changed:', { 
          shouldEnable: shouldEnableRain, 
          systemExists: !!rainSystem,
          intensity: rainIntensity 
        })
      } catch {}
    }
    
    if (shouldEnableRain) {
      if (!rainSystem) {
        try { console.log('[WeatherDebug] Creating new rain system') } catch {}
        rainSystem = new ParticleSystem(scene, {
          type: 'rain',
          intensity: rainIntensity,
          enabled: true,
          windIntensity,
          collisionEnabled: rainCollisionEnabled,
          particleScale: rainParticleScale,
          particleSpeed: rainParticleSpeed,
          windGusts: windGustsEnabled,
          quality: weatherQuality
        })
        if (particleSystems) {
          particleSystems.push(rainSystem)
        }
      } else {
        try { console.log('[WeatherDebug] Updating existing rain system to enabled') } catch {}
        rainSystem.updateConfig({
          intensity: rainIntensity,
          enabled: true,
          windIntensity,
          collisionEnabled: rainCollisionEnabled,
          particleScale: rainParticleScale,
          particleSpeed: rainParticleSpeed,
          windGusts: windGustsEnabled,
          quality: weatherQuality
        })
        // Force visibility to ensure it's shown
        if (rainSystem.particles) {
          rainSystem.particles.visible = true
        }
        if (rainSystem.material) {
          rainSystem.material.visible = true
        }
      }
    } else if (rainSystem) {
      try { console.log('[WeatherDebug] Disabling rain system') } catch {}
      rainSystem.updateConfig({ enabled: false })
    }

    // Update or create snow particle system
    let snowSystem = particleSystems?.find((s: any) => s.config?.type === 'snow')
    if (snowIntensity > 0 && (rainIntensity === 0 || bothActive)) {
      if (!snowSystem) {
        snowSystem = new ParticleSystem(scene, {
          type: 'snow',
          intensity: snowIntensity,
          enabled: true,
          windIntensity,
          collisionEnabled: snowCollisionEnabled,
          particleScale: snowParticleScale,
          particleSpeed: snowParticleSpeed,
          windGusts: windGustsEnabled,
          quality: weatherQuality
        })
        if (particleSystems) {
          particleSystems.push(snowSystem)
        }
      } else {
        snowSystem.updateConfig({
          intensity: snowIntensity,
          enabled: true,
          windIntensity,
          collisionEnabled: snowCollisionEnabled,
          particleScale: snowParticleScale,
          particleSpeed: snowParticleSpeed,
          windGusts: windGustsEnabled,
          quality: weatherQuality
        })
        // Force visibility for snow too
        if (snowSystem.particles) {
          snowSystem.particles.visible = true
        }
        if (snowSystem.material) {
          snowSystem.material.visible = true
        }
      }
    } else if (snowSystem) {
      snowSystem.updateConfig({ enabled: false })
    }

    // Fog is now handled by THREE.FogExp2 (exponential height fog) instead of particles
    // This creates more realistic volumetric fog similar to Twinmotion
    // Remove any fog particle systems - we use scene.fog instead
    const fogSystem = particleSystems?.find((s: any) => s.config?.type === 'fog')
    if (fogSystem && particleSystems) {
      fogSystem.destroy()
      const index = particleSystems.indexOf(fogSystem)
      if (index > -1) {
        particleSystems.splice(index, 1)
      }
    }

    // Update or create water system
    const waterMode = useAppStore.getState().waterMode
    const marchingCubesResolution = useAppStore.getState().marchingCubesResolution
    const marchingCubesIsolation = useAppStore.getState().marchingCubesIsolation
    const marchingCubesMetaballCount = useAppStore.getState().marchingCubesMetaballCount
    
    if (waterEnabled) {
      if (!waterSystem) {
                  viewerRef.current.waterSystem = new WaterSystem(scene, {
            enabled: true,
            level: waterLevel,
            color: waterColor,
            opacity: waterOpacity,
            waveSpeed,
            waveHeight,
            reflectivity: waterReflectivity,
            mode: waterMode,
            marchingCubesResolution,
            marchingCubesIsolation,
            marchingCubesMetaballCount,
            oceanDistortionScale,
            oceanSize
          })
      } else {
                  waterSystem.updateConfig({
            enabled: true,
            level: waterLevel,
            color: waterColor,
            opacity: waterOpacity,
            waveSpeed,
            waveHeight,
            reflectivity: waterReflectivity,
            mode: waterMode,
            marchingCubesResolution,
            marchingCubesIsolation,
            marchingCubesMetaballCount,
            oceanDistortionScale,
            oceanSize
          })
      }
    } else if (waterSystem) {
      waterSystem.updateConfig({ enabled: false })
    }

    // IMPROVED: PARTICLE SYSTEM SUMMARY - throttled and fixed to prevent Texture serialization errors
    // Only log when state actually changes or periodically (every 30 seconds)
    try {
      // Ensure we're working with number primitives, not Number objects
      const lastSummaryTimeValue = (() => {
        const stored = (window as any).__lastParticleSummaryTime
        if (typeof stored === 'number') return stored
        if (stored instanceof Number) return stored.valueOf()
        return 0
      })()
      const summaryTimeValue = Date.now() as number
      const shouldLogSummary = summaryTimeValue - lastSummaryTimeValue > 30000 // Log at most once every 30 seconds
      
      // Also check if state changed significantly
      const lastSummaryState = (window as any).__lastParticleSummaryState || { rain: -1, snow: -1, hdr: false }
      const stateChanged = lastSummaryState.rain !== rainIntensity || 
                          lastSummaryState.snow !== snowIntensity || 
                          lastSummaryState.hdr !== hdrActive
      
      if (shouldLogSummary || stateChanged) {
        // Store as primitive number (not Number object) - use explicit type assertion
        const storedTime = +summaryTimeValue // Convert to number primitive using unary plus
        ;(window as any).__lastParticleSummaryTime = storedTime
        ;(window as any).__lastParticleSummaryState = { rain: rainIntensity, snow: snowIntensity, hdr: hdrActive }
        
        // IMPROVED: Fix ParticleSummary to not try to serialize Texture objects
        // Instead of trying to serialize scene.environment (which is a Texture), just check if it exists
        const particleSummary = {
          timestamp: new Date().toISOString(),
          rain: {
            enabled: rainIntensity > 0,
            intensity: rainIntensity,
            systemExists: !!rainSystem,
            systemEnabled: rainSystem?.config?.enabled || false,
            visible: rainSystem?.particles?.visible || false
          },
          snow: {
            enabled: snowIntensity > 0,
            intensity: snowIntensity,
            systemExists: !!snowSystem,
            systemEnabled: snowSystem?.config?.enabled || false,
            visible: snowSystem?.particles?.visible || false
          },
          hdr: {
            enabled: hdrActive,
            hasEnvironment: !!scene.environment, // Just boolean, not the actual Texture
            hasBackground: !!scene.background, // Just boolean, not the actual Texture
            environmentType: scene.environment ? scene.environment.constructor?.name : null,
            backgroundType: scene.background ? scene.background.constructor?.name : null
          },
          conflicts: particleConflicts.length > 0 ? particleConflicts : null
        }
        console.log('[ParticleSummary] Complete state (copy this if reporting issues):', JSON.stringify(particleSummary, null, 2))
      }
      
      // IMPROVED: Remove WeatherDebug Update summary - it's redundant and spams console
      // Only log when there are actual issues or conflicts
      if (particleConflicts.length > 0) {
        const lastWeatherLog = (window as any).__lastWeatherDebugLog || { time: 0 }
        if (summaryTimeValue - lastWeatherLog.time > 10000) { // Log at most once every 10 seconds
          (window as any).__lastWeatherDebugLog = { time: summaryTimeValue }
          console.groupCollapsed('[WeatherDebug] Update summary (conflicts detected)')
          console.log({ rainIntensity, snowIntensity, cloudDensity, fogDensity, windIntensity })
          console.log('Conflicts:', particleConflicts)
          console.groupEnd()
        }
      }
    } catch (error) {
      // Silently catch errors to prevent console spam
    }
    
    // CRITICAL FINAL CHECK: Ensure HDR background is set if HDR is enabled
    // This runs AFTER all weather/Three.js Sky logic to ensure HDR takes priority
    // This is a DUPLICATE of the check above - removed to prevent conflicts
    // The lighting effect's final check is the authoritative one
    
  }, [rainIntensity, snowIntensity, fogDensity, windIntensity, rainParticleScale, rainParticleSpeed,
rainCollisionEnabled, snowParticleScale, snowParticleSpeed, snowCollisionEnabled, waterEnabled, waterLevel,
waterColor, waterOpacity, waveSpeed, waveHeight, waterReflectivity, oceanDistortionScale, oceanSize, windGustsEnabled, hdrEnabled, weatherQuality])

  // Scale CSM shadow quality when weather quality preset changes
  useEffect(() => {
    const csm = viewerRef.current?.csmShadowSystem
    if (!csm?.isEnabled()) return
    csm.applyWeatherQuality(weatherQuality)
  }, [weatherQuality])

  // Destroy particle/water systems only on viewer unmount (not on every slider change)
  useEffect(() => {
    return () => {
      if (viewerRef.current?.particleSystems) {
        viewerRef.current.particleSystems.forEach((system) => system.destroy())
        viewerRef.current.particleSystems.length = 0
      }
      if (viewerRef.current?.waterSystem) {
        viewerRef.current.waterSystem.destroy()
        viewerRef.current.waterSystem = undefined
      }
    }
  }, [])

  // Keep rain/snow/fog visible above Streets GL iframe (iframe z-index 25, default canvas 20)
  useEffect(() => {
    const canvas = viewerRef.current?.renderer?.domElement
    if (!canvas) return

    const weatherActive =
      isWeatherVisualActive({ fogDensity, rainIntensity, snowIntensity }) ||
      (cloudDensity > 0 && enableStandaloneWeather)
    const aboveStreetsGL = weatherActive && streetsGLIframeOverlay
    canvas.style.zIndex = aboveStreetsGL ? '30' : '20'
  }, [fogDensity, rainIntensity, snowIntensity, cloudDensity, enableStandaloneWeather, streetsGLIframeOverlay])

  // Update scene background and renderer when iframe overlay state changes
  useEffect(() => {
    if (!viewerRef.current) return
    
    const { scene, renderer } = viewerRef.current
    const canvas = renderer.domElement
    
    if (streetsGLIframeOverlay) {
      // Enable transparent background when iframe overlay is active
      scene.background = null
      renderer.setClearColor(0x000000, 0)
      applyViewerCanvasPointerEvents(
        canvas,
        useAppStore.getState(),
        viewerRef.current?.transformControls
      )
      // Hide all models in main scene (they will be rendered in Streets GL)
      // BUT: Keep primitives and Gaussian splats visible (splats cannot be rendered in Streets GL)
      scene.traverse((obj) => {
        if (obj.userData.excludeFromStreetsGLHiding || obj.userData.isGaussianSplatViewer) {
          obj.visible = true
          return
        }
        if (obj.userData.isModel || obj.userData.isImportedModel) {
          // Primitives should remain visible in main scene for transform controls
          if (obj.userData.isPrimitive) {
            obj.visible = true
            obj.userData.renderInStreetsGL = true // Still sync to Streets GL
          } else {
            obj.visible = false
            obj.userData.renderInStreetsGL = true
          }
        }
        // Force hide grid helper, axes helper, and shadow plane - they should not overlay Streets GL
        // The grid from main viewer is not synced with Streets GL's coordinate system
        if (obj.userData.isGridHelper || obj.userData.isAxesHelper || obj.userData.isShadowPlane) {
          if (obj.visible) {
            obj.userData.wasHiddenForStreetsGL = true
          }
          obj.visible = false
        }
      })
      console.log('[ViewerCanvas] Transparent background enabled for iframe overlay; canvas pointer events synced for render mode')
    } else {
      applyViewerCanvasPointerEvents(
        canvas,
        useAppStore.getState(),
        viewerRef.current?.transformControls
      )
      // Show all models in main scene (they are no longer in Streets GL)
      scene.traverse((obj) => {
        if (obj.userData.renderInStreetsGL) {
          obj.visible = true
          delete obj.userData.renderInStreetsGL
        }
        // Restore grid helper, axes helper, and shadow plane visibility
        if (obj.userData.wasHiddenForStreetsGL) {
          obj.visible = true
          delete obj.userData.wasHiddenForStreetsGL
        }
      })
      // Use default background when iframe overlay is disabled
      // Check if HDR or other systems have set a background - if not, use default
      const appStore = useAppStore.getState()
      const hasHDR = appStore.hdrEnabled
      const hasGroundProjection = appStore.hdrGroundProjectionEnabled
      
      // Check if background is the default HDR texture (which gets set even when HDR is disabled)
      const isDefaultHDRTexture = scene.background && 
        scene.background instanceof THREE.Texture &&
        !(scene.background instanceof THREE.Color)
      
      // Override default HDR background if HDR is not enabled and no ground projection
      // This ensures we get a proper dark background instead of the light blue default texture
      if (!hasHDR && !hasGroundProjection) {
        if (!scene.background || isDefaultHDRTexture || scene.background === null) {
          scene.background = new THREE.Color(0x1a1a1a)
          renderer.setClearColor(0x1a1a1a, 1)
          console.log('[ViewerCanvas] Default background restored (iframe overlay disabled)', {
            wasHDRTexture: isDefaultHDRTexture,
            wasNull: scene.background === null
          })
        }
      }
    }
  }, [streetsGLIframeOverlay, renderMode, streetsGLIframeInteractive, transformMode, selectedObject])

  // Keep canvas pointer-events aligned with render mode (standard/product always interactive).
  useEffect(() => {
    if (!viewerRef.current?.renderer) return
    applyViewerCanvasPointerEvents(
      viewerRef.current.renderer.domElement,
      useAppStore.getState(),
      viewerRef.current.transformControls
    )
    viewerRef.current.requestRender?.()
  }, [streetsGLIframeOverlay, renderMode, streetsGLIframeInteractive, transformMode, selectedObject])

  // Effect: Initialize/destroy standalone weather system (CSM shadows + visible sun)
  // This effect runs when enableStandaloneWeather or streetsGLIframeOverlay changes
  // It also needs to wait for viewerRef.current to be available
  useEffect(() => {
    console.log('[ViewerCanvas] Standalone weather useEffect triggered', { 
      hasViewerRef: !!viewerRef.current,
      enableStandaloneWeather,
      streetsGLIframeOverlay,
      timestamp: new Date().toISOString()
    })
    
    // Wait for viewerRef to be available (it's set in onViewerReady callback)
    if (!viewerRef.current) {
      console.log('[ViewerCanvas] ⚠️ viewerRef.current is null, skipping standalone weather initialization')
      return
    }
    
    const { scene, camera } = viewerRef.current
    const store = useAppStore.getState()
    
    // Get current state (may have changed)
    const currentEnableStandaloneWeather = useAppStore.getState().enableStandaloneWeather
    const currentStreetsGLIframeOverlay = useAppStore.getState().streetsGLIframeOverlay
    
    console.log('[ViewerCanvas] Standalone weather state:', {
      currentEnableStandaloneWeather,
      currentStreetsGLIframeOverlay,
      enableStandaloneWeatherFromHook: enableStandaloneWeather,
      streetsGLIframeOverlayFromHook: streetsGLIframeOverlay
    })
    
    // Don't initialize standalone weather if Streets GL overlay is active (they conflict)
    // CRITICAL: Only set state if it's not already false to prevent infinite loops
    if (currentStreetsGLIframeOverlay && currentEnableStandaloneWeather) {
      console.log('[ViewerCanvas] ⚠️ Streets GL overlay is active - disabling standalone weather to prevent conflicts')
      // Automatically disable standalone weather when Streets GL is enabled
      // Only update if not already false to prevent unnecessary re-renders
      if (currentEnableStandaloneWeather) {
        useAppStore.setState({ enableStandaloneWeather: false })
      }
      return
    }
    
    // Initialize standalone weather system when enabled (and Streets GL is not active)
    console.log('[ViewerCanvas] Standalone weather check:', { 
      enableStandaloneWeather: currentEnableStandaloneWeather, 
      streetsGLIframeOverlay: currentStreetsGLIframeOverlay, 
      shouldInit: currentEnableStandaloneWeather && !currentStreetsGLIframeOverlay 
    })
    if (currentEnableStandaloneWeather && !currentStreetsGLIframeOverlay) {
      // 1. Create CSM shadow system with Streets GL-quality settings (if not already exists)
      if (!viewerRef.current.csmShadowSystem) {
        console.log('[ViewerCanvas] Creating CSM shadow system')
        const csmShadowSystem = new CSMShadowSystem(scene, {
          camera,
          parent: scene,
          lightIntensity: 1.0,
          lightColor: new THREE.Color(0xffffff),
          cascades: getCsmCascadeCountForQuality(store.weatherQuality || 'high'),
          maxFar: 5000,
          shadowMapSize: getCsmShadowMapSizeForQuality(store.weatherQuality || 'high'),
          lightDirection: new THREE.Vector3(-1, -1, -1), // Will be updated by time of day
          shadowBias: CSM_SHADER_BIAS,
          shadowNormalBias: CSM_SHADER_NORMAL_BIAS,
          shadowRadius: PHYSICAL_CSM_SHADOW_RADIUS
        })
        
        // Initialize CSM
        csmShadowSystem.init()
        
        // CRITICAL: Immediately update CSM with current sun direction (don't wait for time of day effect)
        const { sunPosition: currentSunPosition } = timeOfDayToSkyAngles(store.timeOfDay, store.northOffset)
        const currentSunSkyDir = standaloneLightSunDirection(
          standaloneSkySunDirection(currentSunPosition)
        )
        const currentSunLightTravelDir = sunSkyDirectionToLightTravelDirection(currentSunSkyDir)
        csmShadowSystem.setLightDirection(currentSunLightTravelDir)
        console.log('[ViewerCanvas] CSM initialized and updated with current sun direction:', currentSunLightTravelDir)
        
        // Store in viewer
        viewerRef.current.csmShadowSystem = csmShadowSystem
        refreshInteriorCavityEnhancements(viewerRef.current, scene)
      }
      
      // CRITICAL: Ensure shadow plane receives CSM shadows (do this even if CSM already existed)
      // This ensures shadow plane is always properly configured when standalone weather is enabled
      if (viewerRef.current && viewerRef.current.csmShadowSystem) {
        const csmShadowSystem = viewerRef.current.csmShadowSystem
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.userData.isShadowPlane) {
            // Ensure shadow plane receives shadows
            obj.receiveShadow = true
            obj.castShadow = false
            
            // Ensure material is set up for CSM shadows
            const material = obj.material
            if (material instanceof THREE.MeshStandardMaterial || 
                material instanceof THREE.MeshPhysicalMaterial) {
              // Ensure material properties are correct for shadow receiving
              material.depthWrite = true // Required for shadows
              material.needsUpdate = true
              
              // If material hasn't been set up for CSM yet, manually set it up
              const anyMat = material as any
              if (!anyMat.userData?.csmSetup) {
                try {
                  // Manually setup this material for CSM
                  const csm = csmShadowSystem.getCSM()
                  if (csm) {
                    csm.setupMaterial(material)
                    anyMat.userData = anyMat.userData || {}
                    anyMat.userData.csmSetup = true
                    console.log('[ViewerCanvas] Shadow plane material set up for CSM')
                  }
                } catch (error) {
                  console.warn('[ViewerCanvas] Failed to setup shadow plane material for CSM:', error)
                }
              }
            }
            
            console.log('[ViewerCanvas] Shadow plane configured for CSM shadows:', {
              receiveShadow: obj.receiveShadow,
              castShadow: obj.castShadow,
              materialType: material?.type,
              csmSetup: (material as any)?.userData?.csmSetup
            })
          }
        })
      }
      
      // 2. Create Sun/Moon system for visible sun at different times of day (if not already exists)
      if (!viewerRef.current.sunMoonSystem) {
        console.log('[ViewerCanvas] Creating Sun/Moon system')
        const { sunPosition } = timeOfDayToSkyAngles(store.timeOfDay, store.northOffset)
        const sunMoonSystem = new SunMoonSystem(scene, {
          timeOfDay: store.timeOfDay,
          sunPosition: sunPosition,
          sunColor: new THREE.Color(0xffffff),
          turbidity: 10,
          sunSize: store.sunSize || 1.0,
          moonSize: store.moonSize || 1.0,
          enableStandaloneWeather: true // Enable sun mesh for standalone weather
        })
        
        // Store in viewer
        viewerRef.current.sunMoonSystem = sunMoonSystem
      }
      
      // 3. Create water system only when water panel is enabled (if not already exists)
      if (!viewerRef.current.standaloneWaterSystem && store.waterEnabled) {
        console.log('[ViewerCanvas] Creating standalone water system')
        const { sunPosition } = timeOfDayToSkyAngles(store.timeOfDay, store.northOffset)
        const initLightSunDir = standaloneLightSunDirection(standaloneSkySunDirection(sunPosition))
        const standaloneWaterSystem = new StandaloneWaterSystem(scene, {
          enabled: true,
          level: store.waterLevel,
          color: store.waterColor,
          opacity: store.waterOpacity,
          waveSpeed: store.waveSpeed,
          waveHeight: store.waveHeight,
          reflectivity: store.waterReflectivity,
          sunDirection: initLightSunDir
        })
        viewerRef.current.standaloneWaterSystem = standaloneWaterSystem
      }
      
      // 4. Create atmospheric perspective (fog/haze based on distance) (if not already exists)
      // Streets GL uses "aerial perspective" - distance-based atmospheric scattering that matches sky color
      if (!viewerRef.current.atmosphericPerspective) {
        console.log('[ViewerCanvas] Creating atmospheric perspective (fog/haze)')
        const { elevation } = timeOfDayToSkyAngles(store.timeOfDay, store.northOffset)
        
        // Calculate initial fog color based on sun elevation (matches sky color)
        let initialFogColor = '#87ceeb' // Default sky blue
        if (elevation < 0.1) {
          initialFogColor = '#ff8c42' // Sunrise/sunset - orange/red
        } else if (elevation < 0.3) {
          initialFogColor = '#ffb347' // Early morning/evening - orange-yellow
        } else if (elevation < 0.5) {
          initialFogColor = '#87ceeb' // Morning/afternoon - light blue
        } else {
          initialFogColor = '#5dade2' // Midday - bright blue
        }
        
        const atmosphericPerspective = new AtmosphericPerspective(scene, {
          enabled: store.fogDensity > 0,
          density: store.fogDensity,
          color: initialFogColor, // Match sky color based on time of day
          near: 100,
          far: 5000,
          heightFalloff: 0.5
        })
        viewerRef.current.atmosphericPerspective = atmosphericPerspective
        console.log('[ViewerCanvas] ✅ Atmospheric perspective (fog/haze) initialized - matches Streets GL aerial perspective')
      }
      
      // 5. Create dynamic sky with atmospheric scattering (Preetham model - same as Streets GL) (if not already exists)
      if (!viewerRef.current.dynamicSky) {
        console.log('[ViewerCanvas] Creating DynamicSky with atmospheric scattering')
        const { sunPosition, elevation, azimuth } = timeOfDayToSkyAngles(store.timeOfDay, store.northOffset)
        const initSkySunDir = standaloneSkySunDirection(sunPosition)
        const dynamicSky = new DynamicSky(scene, {
          timeOfDay: store.timeOfDay,
          sunPosition: initSkySunDir.clone(),
          sunColor: new THREE.Color(0xffffff),
          turbidity: store.skyTurbidity || 10.0,
          atmosphereDensity: store.skyAtmosphereDensity || 0.5, // Required but deprecated
          rayleigh: store.skyRayleigh || 2.0,
          mieCoefficient: store.skyMieCoefficient || 0.005,
          mieDirectionalG: store.skyMieDirectionalG || 0.8,
          exposure: store.skyExposure ?? 1.0,
          elevation: elevation,
          azimuth: azimuth,
          cloudDensity: store.cloudDensity ?? 0,
          cloudThickness: store.cloudThickness || 0.5,
          cloudDetail: store.cloudDetail || 0.5,
          cloudScale: store.cloudScale || 1.0,
          cloudStorminess: store.cloudStorminess || 0.0,
          cloudShadowStrength: store.cloudShadowStrength || 0.0,
          cloudColor: new THREE.Color(store.cloudColor || '#ffffff'),
          windIntensity: store.windIntensity || 0.0,
          quality: store.weatherQuality || 'high',
          cloudRenderingMode: 'iq'
        }, viewerRef.current.renderer) // Pass renderer for LUT system
        viewerRef.current.dynamicSky = dynamicSky
        activateDynamicSkyCamera(viewerRef.current)
        
        // Remove solid background color (sky will render instead)
        scene.background = null
        
        // Ensure HDR system doesn't override the sky background
        if (viewerRef.current.hdrSystem) {
          // Temporarily disable HDR background when standalone weather is active
          viewerRef.current.hdrSystem.updateBackgroundVisibility(false)
        }
        
        console.log('[ViewerCanvas] ✅ DynamicSky initialized - sky dome should be visible')
      }

      if (viewerRef.current.dynamicSky) {
        const { sunPosition, elevation, azimuth } = timeOfDayToSkyAngles(store.timeOfDay, store.northOffset)
        const skyDir = standaloneSkySunDirection(sunPosition)
        viewerRef.current.dynamicSky.update({
          timeOfDay: store.timeOfDay,
          sunPosition: skyDir.clone(),
          elevation,
          azimuth,
          turbidity: store.skyTurbidity ?? 10.0,
          atmosphereDensity: store.skyAtmosphereDensity ?? 0.5,
          rayleigh: store.skyRayleigh ?? 2.0,
          mieCoefficient: store.skyMieCoefficient ?? 0.005,
          mieDirectionalG: store.skyMieDirectionalG ?? 0.8,
          exposure: store.skyExposure ?? 1.0,
          cloudDensity: store.cloudDensity ?? 0,
          cloudThickness: store.cloudThickness ?? 0.5,
          cloudDetail: store.cloudDetail ?? 0.5,
          cloudScale: store.cloudScale ?? 1.0,
          cloudStorminess: store.cloudStorminess ?? 0.0,
          cloudShadowStrength: store.cloudShadowStrength ?? 0.0,
          cloudColor: new THREE.Color(store.cloudColor || '#ffffff'),
          windIntensity: store.windIntensity ?? 0.0,
          quality: store.weatherQuality || 'high',
          cloudRenderingMode: 'iq'
        })
        viewerRef.current.dynamicSky.update(camera)
      }
      
      // Disable standard Three.js sun light shadows (CSM handles shadows)
      if (viewerRef.current.directionalLights) {
        viewerRef.current.directionalLights.forEach((light) => {
          if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
            light.castShadow = false // CSM handles shadows
          }
        })
      }
      
      console.log('[ViewerCanvas] ✅ Standalone weather system initialized (CSM shadows + visible sun + sky)')
    }
    // Destroy standalone weather system when disabled OR when Streets GL is enabled
    else if (!currentEnableStandaloneWeather || currentStreetsGLIframeOverlay) {
      // Destroy CSM
      if (viewerRef.current.csmShadowSystem) {
        console.log('[ViewerCanvas] Destroying standalone CSM shadow system')
        viewerRef.current.csmShadowSystem.destroy()
        viewerRef.current.csmShadowSystem = undefined
      }
      
      // Destroy Sun/Moon system
      if (viewerRef.current.sunMoonSystem) {
        console.log('[ViewerCanvas] Destroying standalone sun/moon system')
        viewerRef.current.sunMoonSystem.destroy()
        viewerRef.current.sunMoonSystem = undefined
      }
      
      // Destroy water system
      if (viewerRef.current.standaloneWaterSystem) {
        console.log('[ViewerCanvas] Destroying standalone water system')
        viewerRef.current.standaloneWaterSystem.destroy()
        viewerRef.current.standaloneWaterSystem = undefined
      }
      
      // Destroy atmospheric perspective
      if (viewerRef.current.atmosphericPerspective) {
        console.log('[ViewerCanvas] Destroying atmospheric perspective')
        viewerRef.current.atmosphericPerspective.destroy()
        viewerRef.current.atmosphericPerspective = undefined
      }
      
      // Destroy dynamic sky
      if (viewerRef.current.dynamicSky) {
        console.log('[ViewerCanvas] Destroying dynamic sky')
        deactivateDynamicSkyCamera(viewerRef.current)
        viewerRef.current.dynamicSky.destroy()
        viewerRef.current.dynamicSky = undefined
      }
      
      // Restore HDR background if HDR is enabled
      // CRITICAL: Restore HDR background visibility when standalone weather is disabled
      if (viewerRef.current.hdrSystem) {
        const store = useAppStore.getState()
        const hdrEnabled = store.hdrEnabled
        const hdrBackgroundVisible = store.hdrBackgroundVisible
        
        if (hdrEnabled) {
          // Restore HDR background visibility using the stored state (user's preference)
          viewerRef.current.hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)
          console.log('[ViewerCanvas] ✅ HDR background restored after standalone weather disabled', {
            hdrEnabled,
            hdrBackgroundVisible
          })
        } else {
          // HDR not enabled - set default background color
          if (!scene.background) {
            scene.background = new THREE.Color(0x87ceeb) // Sky blue default
          }
        }
      } else {
        // No HDR system - set default background color
        if (!scene.background) {
          scene.background = new THREE.Color(0x87ceeb) // Sky blue default
        }
      }
      
      // Restore shadow plane DoubleSide when leaving standalone weather (HDR ground projection needs it)
      scene.traverse((obj) => {
        if (obj.userData.isShadowPlane && obj instanceof THREE.Mesh) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of materials) {
            if (mat && 'side' in mat) {
              ;(mat as THREE.Material).side = THREE.DoubleSide
              mat.needsUpdate = true
            }
          }
        }
      })
      
      // Re-enable standard Three.js sun light shadows
      if (viewerRef.current.directionalLights) {
        viewerRef.current.directionalLights.forEach((light) => {
          if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
            light.castShadow = true // Restore standard shadows
          }
        })
      }
      
      console.log('[ViewerCanvas] ✅ Standalone weather system destroyed')
    }
  }, [enableStandaloneWeather, streetsGLIframeOverlay])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={marqueeOverlayRef}
        style={{
          position: 'absolute',
          border: '2px solid rgba(111, 174, 255, 0.95)',
          background: 'rgba(111, 174, 255, 0.18)',
          boxShadow: '0 0 12px rgba(111, 174, 255, 0.45) inset',
          borderRadius: '2px',
          pointerEvents: 'none',
          display: 'none',
          zIndex: 40
        }}
      />
    </div>
  )
}
