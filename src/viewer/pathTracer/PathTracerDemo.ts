/**
 * Path Tracer Demo Module
 * A clean, reusable implementation of the three-gpu-pathtracer demo
 * Can be integrated into any Three.js viewer
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RectAreaLightHelper } from 'three-stdlib'
import { WebGLPathTracer, BlurredEnvMapGenerator, GradientEquirectTexture } from 'three-gpu-pathtracer'
import {
  downloadDataUrl,
  readRenderTargetToDataUrl,
  readRendererFrameToDataUrl
} from '../utils/screenshotCapture'
import { useAppStore } from '../../store/useAppStore'
import {
  capturePathTracerMovementState,
  schedulePathTracerMovementRestore,
  shouldSuppressPathTracerTransformInteraction,
  type PathTracerMovementSnapshot
} from './pathTracerMovementRestore'
// Note: MaskedHDRTexture utility is available but not used (rolled back to original HDR with ground)
// import { createBlackMaskedHDRTexture } from './utils/MaskedHDRTexture'

const noopRasterize = () => {}

export interface PathTracerDemoConfig {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  controls?: OrbitControls
  enableControls?: boolean
  resolutionScale?: number
  tiles?: number
  minSamples?: number
  maxSamples?: number
  bounces?: number
  denoiseEnabled?: boolean
  denoiseStrength?: number
  previewWhileInteractive?: boolean
  excludeGroundedSkybox?: boolean // Option to exclude GroundedSkybox from path tracing (default: true)
  groundRoughness?: number // Roughness for ground plane material (0.0 = mirror, 1.0 = matte, default: 0.8)
  groundOpacity?: number // Opacity for ground plane material (0.0 = transparent, 1.0 = opaque, default: 0.85)
  groundMetalness?: number // Metalness for ground plane material (0.0 = dielectric, 1.0 = metal, default: 0.0)
  createGroundPlane?: boolean // Create a ground plane if none exists (default: false)
}

export interface PathTracerDemoCallbacks {
  onProgress?: (message: string) => void
  onError?: (error: Error) => void
  onReady?: () => void
  onMaxSamplesReached?: (info: { sampleCount: number; maxSamples: number }) => void
}

export class PathTracerDemo {
  private renderer: THREE.WebGLRenderer
  private camera: THREE.PerspectiveCamera
  private scene: THREE.Scene
  private controls?: OrbitControls
  private pathTracer: WebGLPathTracer
  private gradientMap: GradientEquirectTexture
  private maskedHDRTexture: THREE.DataTexture | null = null // HDR with lower hemisphere masked
  private _isRunning = false
  private _isStopping = false
  private originalBackground: THREE.Texture | THREE.Color | null = null
  private colorTexture: THREE.DataTexture | null = null // Store color texture to prevent recreation
  private originalEnvironment: THREE.Texture | null = null
  private originalToneMappingExposure: number | undefined
  private originalDirectionalLights: Array<{
    light: THREE.DirectionalLight
    position: THREE.Vector3
    targetPosition: THREE.Vector3
    intensity: number
    castShadow: boolean
    shadowProps?: {
      mapSize: { w: number; h: number }
      near: number
      far: number
      left: number
      right: number
      top: number
      bottom: number
      bias: number
      normalBias: number
    }
  }> = []

  // Configuration
  private config: Required<Pick<PathTracerDemoConfig, 'resolutionScale' | 'tiles' | 'minSamples' | 'excludeGroundedSkybox' | 'groundRoughness' | 'groundOpacity' | 'groundMetalness' | 'createGroundPlane'>> &
    Partial<Pick<PathTracerDemoConfig, 'maxSamples' | 'bounces' | 'denoiseEnabled' | 'denoiseStrength' | 'previewWhileInteractive'>>
  private callbacks: PathTracerDemoCallbacks
  private originalRasterizeCallback?: (scene: THREE.Scene, camera: THREE.Camera) => void
  private groundPlaneMesh: THREE.Mesh | null = null // Ground plane created by path tracer (if any)
  private expectedGroundPlaneY: number | null = null // Expected Y position for ground plane (to detect drift)
  private sizeLogCount = 0
  private preRenderLogCount = 0
  // Track total rendered samples since last reset/start to enforce maxSamples even if accumulation resets
  private accumulatedSamples = 0
  // Track when we've hit maxSamples so we pause for capture instead of tearing down
  private maxSamplesReached = false
  // Track if we are paused specifically because the cap was reached
  private pausedAtMax = false
  // CRITICAL: Track if we've already incremented accumulatedSamples this frame
  // This prevents double-counting if renderFrame() is called multiple times per frame
  private _frameSampleIncremented = false
  private _lastPathTracerSamples = 0 // Track pathTracer.samples to detect complete frames
  private _lastTotalTiles = 0 // Track previous tile count to detect tile changes
  // Store original helper visibility states before hiding them during path tracing
  private _originalHelperStates: Array<{
    obj: THREE.Object3D
    wasVisible: boolean
    helperType: 'grid' | 'axes' | 'lightHelper' | 'lightGizmo' | 'transformControls' | 'otherHelper'
  }> = []
  private _prePathTracerMovement: PathTracerMovementSnapshot | null = null
  // Helper for debugging layout/sizing issues
  private getElementSizeInfo(el: HTMLElement | null) {
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      client: { w: el.clientWidth, h: el.clientHeight },
      offset: { w: el.offsetWidth, h: el.offsetHeight },
      scroll: { w: el.scrollWidth, h: el.scrollHeight },
      rect: { w: rect.width, h: rect.height, x: rect.x, y: rect.y },
      style: { w: el.style.width, h: el.style.height }
    }
  }

  /**
   * Detect if camera matrices changed (with tolerance) to avoid resetting accumulation unnecessarily
   */
  private hasCameraChanged(epsilon = 1e-7): boolean {
    const m = this.camera.matrixWorld.elements
    const lastM = this.lastCameraMatrix.elements
    let changed = false
    for (let i = 0; i < 16; i++) {
      if (Math.abs(m[i] - lastM[i]) > epsilon) {
        changed = true
        break
      }
    }

    const p = this.camera.projectionMatrix.elements
    const lastP = this.lastProjectionMatrix.elements
    for (let i = 0; i < 16 && !changed; i++) {
      if (Math.abs(p[i] - lastP[i]) > epsilon) {
        changed = true
        break
      }
    }

    if (changed) {
      this.lastCameraMatrix.copy(this.camera.matrixWorld)
      this.lastProjectionMatrix.copy(this.camera.projectionMatrix)
    }

    return changed
  }

  // State
  private params = {
    enable: true,
    pause: false,
    toneMapping: true,
    maxSamples: undefined as number | undefined,
  }
  private rafHandle: number | null = null
  private lastCameraMatrix = new THREE.Matrix4()
  private lastProjectionMatrix = new THREE.Matrix4()
  private cameraStateInitialized = false

  /**
   * Render a single path tracer frame.
   * This method is called from the viewer animation loop while the demo is running.
   */
  renderFrame(): void {
    if (!this._isRunning) {
      return
    }
    
    // Lightweight re-hide only — full scene traverse runs once in start()/initialize()
    // CRITICAL: Continuously hide gizmos that might reappear (defensive check every frame)
    // Some gizmos might be re-shown by other code, so we need to keep hiding them
    if (this._originalHelperStates && this._originalHelperStates.length > 0) {
      this._originalHelperStates.forEach(({ obj, wasVisible }) => {
        if (obj && obj.visible) {
          // Gizmo was re-shown, hide it again
          obj.visible = false
        }
      })
    }
    
    // CRITICAL: Continuously hide shadow plane (ViewerCanvas animation loop might re-show it)
    // The shadow plane is not needed in path tracer - shadows appear on GroundedSkybox or HDR ground
    const hiddenShadowPlanes = (this as any)._hiddenShadowPlanes as Array<{ obj: THREE.Object3D }> | undefined
    if (hiddenShadowPlanes && hiddenShadowPlanes.length > 0) {
      hiddenShadowPlanes.forEach(({ obj }) => {
        if (obj && obj.visible) {
          obj.visible = false
          // Also ensure it's not in the scene's visible objects
          if (obj instanceof THREE.Mesh && obj.userData?.isShadowPlane) {
            // Double-check visibility is false
            obj.visible = false
          }
        }
      })
    } else {
      // Fallback: search for shadow plane even if not in hidden list
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && (obj.userData?.isShadowPlane === true || obj.name === 'Shadow Plane')) {
          if (obj.visible) {
            obj.visible = false
            console.log('[PathTracerDemo] 🔒 Force-hiding shadow plane (was re-shown by other code)')
          }
        }
      })
    }
    
    // CRITICAL: Also hide path tracer ground plane if HDR ground projection is enabled
    // The gray ground plane is not needed when GroundedSkybox handles the ground surface
    // Shadows will appear on GroundedSkybox lower hemisphere instead of the gray plane
    const hdrGroundProjectionEnabled = useAppStore.getState()?.hdrGroundProjectionEnabled ?? false
    if (hdrGroundProjectionEnabled) {
      // Hide path tracer ground plane - GroundedSkybox handles ground and shadows
      if (this.groundPlaneMesh && this.groundPlaneMesh.visible) {
        this.groundPlaneMesh.visible = false
      }
      // Also search for any ground planes that might have been created
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData?.isPathTracerGroundPlane === true && obj.visible) {
          obj.visible = false
        }
      })
    }
    
    const suppressTransformInteraction = shouldSuppressPathTracerTransformInteraction(
      this._isRunning,
      this.pausedAtMax,
      this.maxSamplesReached,
      this.params.pause === true
    )

    if (suppressTransformInteraction) {
      // CRITICAL: Continuously disable and hide transform controls (they might be re-enabled/re-attached)
      // This must run every frame because the viewer's useEffect might re-attach them
      const viewer = (window as any).__viewer
      if (viewer?.transformControls) {
        const transformControls = viewer.transformControls

        // Force disable (prevents interaction)
        if (transformControls.enabled !== false) {
          transformControls.enabled = false
        }

        // Force detach from any object (removes gizmo from object)
        if (transformControls.object) {
          transformControls.detach()
        }

        // Force hide (prevents rendering)
        if (transformControls.visible) {
          transformControls.visible = false
        }

        // Also hide all children continuously (axes, boxes, lines, etc.)
        transformControls.traverse((child: any) => {
          if (child !== transformControls && child.visible) {
            child.visible = false
          }
        })

        // CRITICAL: Also check if transform controls are in the scene and remove them
        if (this.scene && transformControls.parent) {
          transformControls.parent.remove(transformControls)
        }
      }

      // CRITICAL: Also clear selectedObject from store every frame to prevent re-attachment
      // This is the most reliable way to prevent the viewer from re-attaching transform controls
      try {
        const state = useAppStore.getState()
        const currentSelected = state.selectedObject
        if (currentSelected !== null && currentSelected !== undefined) {
          state.setSelectedObject(null)
        }
      } catch {
        // Silently fail if store is not available
      }

      // CRITICAL: Also check scene for any TransformControls objects and hide them
      this.scene.traverse((obj) => {
        if (obj.type === 'TransformControls' || obj.constructor?.name === 'TransformControls') {
          const tc = obj as any
          if (tc.enabled !== false) tc.enabled = false
          if (tc.object) tc.detach()
          if (tc.visible) tc.visible = false
          tc.traverse((child: any) => {
            if (child !== tc && child.visible) {
              child.visible = false
            }
          })
        }
      })
    }
    
    // CRITICAL: Ensure ground plane stays fixed in world space (not linked to car position)
    if (this.groundPlaneMesh && this.groundPlaneMesh.userData.fixedWorldPosition) {
      // Verify plane is at world origin for X and Z, and check if Y has drifted
      const expectedX = 0
      const expectedZ = 0
      const expectedY = this.expectedGroundPlaneY
      
      let positionChanged = false
      const currentPos = this.groundPlaneMesh.position.clone()
      
      // Check if X or Z have been changed
      if (Math.abs(this.groundPlaneMesh.position.x - expectedX) > 0.001 || 
          Math.abs(this.groundPlaneMesh.position.z - expectedZ) > 0.001) {
        positionChanged = true
        console.warn('[PathTracerDemo] ⚠️ Ground plane X/Z position was modified, resetting to world origin:', {
          wasX: this.groundPlaneMesh.position.x,
          wasZ: this.groundPlaneMesh.position.z,
          wasY: this.groundPlaneMesh.position.y
        })
      }
      
      // CRITICAL: Check if Y position has drifted (this was missing before!)
      if (expectedY !== null && Math.abs(this.groundPlaneMesh.position.y - expectedY) > 0.001) {
        positionChanged = true
        console.warn('[PathTracerDemo] ⚠️ Ground plane Y position was modified, resetting to expected height:', {
          wasY: this.groundPlaneMesh.position.y,
          expectedY: expectedY,
          drift: (this.groundPlaneMesh.position.y - expectedY).toFixed(4)
        })
      }
      
      // Reset position if any component has changed
      if (positionChanged) {
        this.groundPlaneMesh.position.set(
          expectedX, 
          expectedY !== null ? expectedY : currentPos.y, 
          expectedZ
        )
        this.groundPlaneMesh.updateMatrixWorld(true)
      }
      
      // Verify plane is direct child of scene, not parented to car or other objects
      if (this.groundPlaneMesh.parent !== this.scene) {
        console.warn('[PathTracerDemo] ⚠️ Ground plane was reparented, fixing:', {
          parent: this.groundPlaneMesh.parent?.name || 'Unknown',
          parentType: this.groundPlaneMesh.parent?.type,
          currentY: this.groundPlaneMesh.position.y,
          expectedY: expectedY
        })
        if (this.groundPlaneMesh.parent) {
          this.groundPlaneMesh.parent.remove(this.groundPlaneMesh)
        }
        this.scene.add(this.groundPlaneMesh)
        // CRITICAL: After reparenting, verify Y position hasn't changed
        if (expectedY !== null && Math.abs(this.groundPlaneMesh.position.y - expectedY) > 0.001) {
          console.warn('[PathTracerDemo] ⚠️ Ground plane Y changed after reparenting, fixing:', {
            wasY: this.groundPlaneMesh.position.y,
            expectedY: expectedY
          })
          this.groundPlaneMesh.position.set(0, expectedY, 0)
        }
        this.groundPlaneMesh.updateMatrixWorld(true)
      }
    }
    
    // CRITICAL: If paused at max samples, we MUST still go through the render path
    // to display the accumulated result. We just set pausePathTracing=true to prevent
    // new samples from accumulating, but the renderToCanvasCallback will still be called
    // to display the accumulated result.
    // However, if manually paused (not at max), we also need to ensure pausePathTracing is set
    // CRITICAL FIX: Ensure path tracer is NOT paused unless explicitly paused
    // This prevents the path tracer from getting stuck on one tile
    if (this.pausedAtMax || this.maxSamplesReached) {
      // Ensure pause is set before we continue with the render path
      this.params.pause = true
      this.pathTracer.pausePathTracing = true
      // Continue through the normal render path - don't return early!
      // The path tracer will display the accumulated result when pausePathTracing=true
    } else if (this.params.pause) {
      // Manually paused (not at max) - ensure pausePathTracing is set
      this.pathTracer.pausePathTracing = true
    } else {
      // CRITICAL: Not paused - ensure pausePathTracing is FALSE to allow tile progression
      // This is essential - if pausePathTracing is true, the path tracer will get stuck on one tile
      this.pathTracer.pausePathTracing = false
      
      // Also ensure enablePathTracing is true when not paused
      if (!this.pathTracer.enablePathTracing) {
        this.pathTracer.enablePathTracing = true
        console.warn('[PathTracerDemo] ⚠️ Path tracer was disabled, re-enabling to prevent stuck tiles')
      }
    }

    const gl = this.renderer.getContext() as WebGL2RenderingContext | null
    if (!gl) {
      console.error('[PathTracerDemo] ❌ WebGL context lost – stopping path tracer')
      this.stop(true)
      return
    }

    const errorBefore = gl.getError()
    if (errorBefore !== gl.NO_ERROR && errorBefore !== gl.CONTEXT_LOST_WEBGL) {
      console.warn('[PathTracerDemo] ⚠️ WebGL error before render:', errorBefore)
    }

    this.renderer.toneMapping = this.params.toneMapping
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping

    if (this.params.toneMapping) {
      const hasGroundedSkybox = !this.config.excludeGroundedSkybox
      const targetExposure = hasGroundedSkybox ? 2.5 : 1.2
      if (!this.renderer.toneMappingExposure || hasGroundedSkybox) {
        this.renderer.toneMappingExposure = targetExposure
      }
    }

    if ('outputColorSpace' in this.renderer) {
      const rendererAny = this.renderer as any
      if (rendererAny.outputColorSpace !== 'srgb') {
        rendererAny.outputColorSpace = 'srgb'
      }
    }

    // CRITICAL: Ensure path tracer is enabled and not paused (unless explicitly paused)
    // This prevents the path tracer from getting stuck on one tile
    this.pathTracer.enablePathTracing = this.params.enable !== false
    // Only pause if explicitly paused (not if we're just starting or running normally)
    this.pathTracer.pausePathTracing = this.params.pause === true || this.pausedAtMax || this.maxSamplesReached
    
    // Debug logging for path tracer state (only log first few times to avoid spam)
    if (this.accumulatedSamples < 3) {
      console.log('[PathTracerDemo] 🔍 Path tracer state check:', {
        enablePathTracing: this.pathTracer.enablePathTracing,
        pausePathTracing: this.pathTracer.pausePathTracing,
        paramsEnable: this.params.enable,
        paramsPause: this.params.pause,
        pausedAtMax: this.pausedAtMax,
        maxSamplesReached: this.maxSamplesReached,
        tiles: `${this.pathTracer.tiles.x}x${this.pathTracer.tiles.y}`,
        pathTracerSamples: Math.floor(this.pathTracer.samples || 0),
        accumulatedSamples: this.accumulatedSamples
      })
    }

    const oldRenderTarget = this.renderer.getRenderTarget()
    const oldViewport = this.renderer.getViewport(new THREE.Vector4())
    const oldAutoClear = this.renderer.autoClear
    const oldClearColor = this.renderer.getClearColor(new THREE.Color())
    const oldClearAlpha = this.renderer.getClearAlpha()

    this.renderer.autoClear = false
    this.renderer.setRenderTarget(null)
    const canvas = this.renderer.domElement
    // Force sizing based on the actual canvas client size to avoid overestimation
    const clientW = Math.max(1, canvas.clientWidth || 0)
    const clientH = Math.max(1, canvas.clientHeight || 0)
    const fallbackW = Math.max(1, window.innerWidth)
    const fallbackH = Math.max(1, window.innerHeight)
    const targetCssWidth = clientW || fallbackW
    const targetCssHeight = clientH || fallbackH
    const dpr = this.renderer.getPixelRatio()
    const displayWidth = Math.max(1, Math.floor(targetCssWidth * dpr))
    const displayHeight = Math.max(1, Math.floor(targetCssHeight * dpr))

    // Keep canvas CSS in sync with client target
    const cssW = `${targetCssWidth}px`
    const cssH = `${targetCssHeight}px`
    if (canvas.style.width !== cssW) {
      canvas.style.width = cssW
    }
    if (canvas.style.height !== cssH) {
      canvas.style.height = cssH
    }
    if (canvas.style.position !== 'absolute') {
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.left = '0'
    }
    if (canvas.style.display !== 'block') {
      canvas.style.display = 'block'
    }

    // Apply renderer size exactly to the CSS pixels of the canvas
    this.renderer.setSize(targetCssWidth, targetCssHeight, false)

    const size = new THREE.Vector2()
    this.renderer.getSize(size) // size in CSS pixels after setSize
    // Log a few times for debugging
    if (this.sizeLogCount < 10) {
      const parent = canvas.parentElement as HTMLElement | null
      const grand = parent?.parentElement || null
      const sizingInfo = {
        targetCssWidth,
        targetCssHeight,
        displayWidth,
        displayHeight,
        rendererGetSize: { w: size.x, h: size.y },
        canvasClient: { w: canvas.clientWidth, h: canvas.clientHeight },
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        parent: this.getElementSizeInfo(parent),
        grandParent: this.getElementSizeInfo(grand),
        canvasRect: this.getElementSizeInfo(canvas),
        dpr
      }
      console.log('[PathTracerDemo] 🖼️ Sizing', sizingInfo)
      console.log('[PathTracerDemo] 🖼️ Sizing JSON', JSON.stringify(sizingInfo))
      this.sizeLogCount++
    }
    this.renderer.setViewport(0, 0, displayWidth, displayHeight)
    this.renderer.setScissor(0, 0, displayWidth, displayHeight)
    this.renderer.setScissorTest(true)

    const rendererSize = new THREE.Vector2(displayWidth / dpr, displayHeight / dpr)
    // Cache sampling limits/counts up front so we can log and enforce caps
    // CRITICAL: Only use our own params.maxSamples and config.maxSamples
    // Do NOT use pathTracer.maxSamples because pathTracer.samples counts tiles, not frames
    // If pathTracer.maxSamples is set, WebGLPathTracer will pause prematurely when pathTracer.samples
    // (which counts tiles) reaches that value. We handle maxSamples checking ourselves using
    // accumulatedSamples (which counts complete frames).
    const maxSamples = this.params.maxSamples ?? this.config.maxSamples
    const sampleCount = Math.ceil(this.getSampleCount())
    
    // Debug logging for maxSamples issue
    if (sampleCount < 10 && sampleCount % 2 === 0) {
      console.log('[PathTracerDemo] 🔍 Max samples check:', {
        sampleCount,
        accumulatedSamples: this.accumulatedSamples,
        pathTracerSamples: Math.ceil(this.pathTracer.samples || 0),
        tiles: `${this.pathTracer.tiles.x}x${this.pathTracer.tiles.y}`,
        maxSamples,
        paramsMaxSamples: this.params.maxSamples,
        pathTracerMaxSamples: (this.pathTracer as any).maxSamples,
        configMaxSamples: this.config.maxSamples,
        note: 'Using accumulatedSamples (complete frames), not pathTracer.samples (which counts tiles)'
      })
      // Also log as a simple string for easier reading
      console.log(`[PathTracerDemo] 🔍 Max samples check: sampleCount=${sampleCount}, accumulatedSamples=${this.accumulatedSamples}, maxSamples=${maxSamples}, params.maxSamples=${this.params.maxSamples}, config.maxSamples=${this.config.maxSamples}`)
    }

    try {
      // Update controls (returns true if changed when damping is on)
      let controlsChanged = false
      if (this.controls && typeof (this.controls as any).update === 'function') {
        controlsChanged = (this.controls as any).update()
      }

      // Only update the PT camera when the camera actually changed to avoid reset flicker
      const cameraChanged = !this.cameraStateInitialized || this.hasCameraChanged()
      if (controlsChanged || cameraChanged) {
        this.cameraStateInitialized = true
        this.pathTracer.updateCamera()
      }

      if (sampleCount < 5 && this.preRenderLogCount < 5) {
        const preRenderInfo = {
          hasTarget: !!this.pathTracer.target,
          hasTexture: !!this.pathTracer.target?.texture,
          rendererSize: { width: rendererSize.x, height: rendererSize.y },
          canvasSize: { width: canvas.width, height: canvas.height },
          clientSize: { width: canvas.clientWidth, height: canvas.clientHeight },
          sampleCount,
          renderTarget: oldRenderTarget ? 'has target' : 'null (main canvas)'
        }
        console.log('[PathTracerDemo] 📊 Pre-render state:', preRenderInfo)
        console.log('[PathTracerDemo] 📊 Pre-render state JSON', JSON.stringify(preRenderInfo))
        this.preRenderLogCount++
      }

      // CRITICAL: When paused (either manually or at max), we still need to call renderSample() 
      // to trigger renderToCanvasCallback and display the accumulated result.
      // pausePathTracing=true will prevent new samples from accumulating but still display the result.
      // CRITICAL FIX: Ensure path tracer is enabled before rendering to prevent stuck tiles
      if (!this.pathTracer.enablePathTracing && !this.params.pause) {
        console.warn('[PathTracerDemo] ⚠️ Path tracer was disabled, re-enabling before renderSample()')
        this.pathTracer.enablePathTracing = true
      }
      this.pathTracer.renderSample()
      
      // CRITICAL: Only increment accumulatedSamples ONCE per complete frame, not per tile
      // pathTracer.samples counts tiles (e.g., 16 for 4x4 tiles), so we detect when it increases
      // by the number of tiles, which indicates a complete frame has been rendered
      const currentPathTracerSamples = Math.floor(this.pathTracer.samples || 0)
      const totalTiles = this.pathTracer.tiles.x * this.pathTracer.tiles.y
      const samplesSinceLastFrame = currentPathTracerSamples - this._lastPathTracerSamples
      
      // CRITICAL FIX: Detect if path tracer is stuck on one tile (not progressing)
      // If samples haven't increased for multiple frames, the path tracer might be stuck
      if (this._lastPathTracerSamples > 0 && samplesSinceLastFrame === 0 && !this.params.pause) {
        // Path tracer samples haven't increased - might be stuck
        // Only log warning after a few frames to avoid spam
        if (this.accumulatedSamples > 0 && this.accumulatedSamples % 10 === 0) {
          console.warn('[PathTracerDemo] ⚠️ Path tracer samples not increasing - might be stuck on one tile:', {
            currentSamples: currentPathTracerSamples,
            lastSamples: this._lastPathTracerSamples,
            samplesSinceLastFrame,
            totalTiles,
            enablePathTracing: this.pathTracer.enablePathTracing,
            pausePathTracing: this.pathTracer.pausePathTracing,
            paramsPause: this.params.pause,
            accumulatedSamples: this.accumulatedSamples
          })
          
          // Try to force re-enable path tracer if it's stuck
          if (!this.pathTracer.enablePathTracing) {
            console.warn('[PathTracerDemo] 🔧 Attempting to re-enable stuck path tracer')
            this.pathTracer.enablePathTracing = true
            this.pathTracer.pausePathTracing = false
          }
        }
      }
      
      // Debug logging for first few frames to verify tile counting logic
      if (this.accumulatedSamples === 0 && currentPathTracerSamples > 0) {
        console.log('[PathTracerDemo] 🔍 Frame counting debug (first frames):', {
          currentPathTracerSamples,
          lastPathTracerSamples: this._lastPathTracerSamples,
          totalTiles,
          samplesSinceLastFrame,
          tiles: `${this.pathTracer.tiles.x}x${this.pathTracer.tiles.y}`,
          isPaused: this.params.pause,
          pausedAtMax: this.pausedAtMax,
          maxSamplesReached: this.maxSamplesReached,
          frameSampleIncremented: this._frameSampleIncremented
        })
      }
      
      // CRITICAL: Handle tile count changes during rendering
      // If tiles changed, pathTracer.samples might reset or jump, so reset our tracking
      if (this._lastTotalTiles > 0 && totalTiles !== this._lastTotalTiles) {
        console.warn('[PathTracerDemo] ⚠️ Tile count changed during rendering, resetting frame tracking', {
          oldTotalTiles: this._lastTotalTiles,
          newTotalTiles: totalTiles,
          currentSamples: currentPathTracerSamples,
          lastSamples: this._lastPathTracerSamples
        })
        this._lastPathTracerSamples = currentPathTracerSamples
        this._frameSampleIncremented = false
      }
      this._lastTotalTiles = totalTiles
      
      // A complete frame is done when pathTracer.samples has increased by the number of tiles
      // This means all tiles have been processed once
      const isCompleteFrame = samplesSinceLastFrame >= totalTiles && totalTiles > 0
      
      if (isCompleteFrame) {
        // Reset the increment flag for the next frame
        this._frameSampleIncremented = false
        this._lastPathTracerSamples = currentPathTracerSamples
      }
      
      // Only increment accumulatedSamples if:
      // 1. Not paused (manually or at max)
      // 2. Not already incremented this frame (prevents double-counting)
      // 3. A complete frame has been rendered (all tiles processed)
      if (!this.params.pause && !this.pausedAtMax && !this.maxSamplesReached && !this._frameSampleIncremented && isCompleteFrame) {
      this.accumulatedSamples++
        this._frameSampleIncremented = true
        // Debug logging for tile counting verification
        if (this.accumulatedSamples % 10 === 0 || this.accumulatedSamples <= 5) {
          console.log('[PathTracerDemo] 🔍 Frame counting verification:', {
            accumulatedSamples: this.accumulatedSamples,
            pathTracerSamples: currentPathTracerSamples,
            tiles: `${this.pathTracer.tiles.x}x${this.pathTracer.tiles.y}`,
            totalTiles,
            samplesSinceLastFrame,
            isCompleteFrame,
            note: 'accumulatedSamples counts complete frames, not tiles'
          })
        }
      }

      // CRITICAL: Use accumulatedSamples directly, not pathTracer.samples
      // pathTracer.samples counts tiles (e.g., 16 for 4x4 tiles), not complete frames
      // accumulatedSamples counts complete screen renders (1 per renderFrame call)
      const sampleCountPost = this.accumulatedSamples
      if (
        !this.pausedAtMax && // Don't check again if already paused
        !this.maxSamplesReached && // Don't check again if already reached
        maxSamples !== undefined &&
        maxSamples !== null &&
        sampleCountPost >= maxSamples
      ) {
        // Pause on the frame that reaches the cap so the user can capture it.
        // Keep the PT "running" but lock rendering until the user resumes/raises the cap.
        this.maxSamplesReached = true
        this.pausedAtMax = true
        this.params.pause = true
        this.pathTracer.pausePathTracing = true
        console.log('[PathTracerDemo] ⏸️ Max samples reached - pausing for capture', {
          sampleCount: sampleCountPost,
          accumulatedSamples: this.accumulatedSamples,
          pathTracerSamples: Math.ceil(this.pathTracer.samples || 0),
          tiles: `${this.pathTracer.tiles.x}x${this.pathTracer.tiles.y}`,
          maxSamples,
          paramsMaxSamples: this.params.maxSamples,
          configMaxSamples: this.config.maxSamples,
          pathTracerMaxSamples: (this.pathTracer as any).maxSamples,
          comparison: `${sampleCountPost} >= ${maxSamples}`,
          note: 'Using accumulatedSamples (complete frames), not pathTracer.samples (which counts tiles)'
        })
        this.callbacks.onMaxSamplesReached?.({ sampleCount: sampleCountPost, maxSamples })
        this.releaseTransformInteractionForPausedViewing()
        return
      }

      if (this.getSampleCount() % 100 === 0) {
        // CRITICAL: Don't overwrite color texture if originalBackground is a Color
        // This prevents flickering and preserves the user's background color
        if (this.originalBackground instanceof THREE.Color) {
          // Keep the color texture - don't change background
          const currentBg = this.scene.background
          const isColorTexture = currentBg instanceof THREE.DataTexture && 
                                (currentBg as any).image?.data instanceof Uint8Array &&
                                currentBg.mapping === THREE.EquirectangularReflectionMapping
          
          // Check if our stored color texture is still set
          const isOurColorTexture = this.colorTexture && currentBg === this.colorTexture
          
          if (!isOurColorTexture) {
            // Color texture was lost somehow, restore it using stored texture
            console.log('[PathTracerDemo] 🔄 Restoring color texture in render loop...')
            
            if (!this.colorTexture) {
              // Recreate if it doesn't exist
              const width = 4
              const height = 2
              const data = new Uint8Array(width * height * 4)
              const r = Math.floor(this.originalBackground.r * 255)
              const g = Math.floor(this.originalBackground.g * 255)
              const b = Math.floor(this.originalBackground.b * 255)
              
              for (let i = 0; i < width * height; i++) {
                const idx = i * 4
                data[idx] = r
                data[idx + 1] = g
                data[idx + 2] = b
                data[idx + 3] = 255
              }
              
              this.colorTexture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
              this.colorTexture.needsUpdate = true
              this.colorTexture.mapping = THREE.EquirectangularReflectionMapping
              this.colorTexture.colorSpace = THREE.LinearSRGBColorSpace
            }
            
            this.scene.background = this.colorTexture
            this.pathTracer.updateEnvironment()
          }
          // If color texture exists, don't change it
        } else {
          // Not a Color background, use HDR or gradient as before
          const hdrSystem = (window as any).__hdrSystem as import('../effects/HDRSystem').HDRSystem | undefined
          const originalHDRTexture =
            hdrSystem && typeof hdrSystem.getOriginalHDRTexture === 'function'
              ? hdrSystem.getOriginalHDRTexture()
              : null

          const desiredBackground = originalHDRTexture || this.gradientMap
          if (!this.scene.background || this.scene.background !== desiredBackground) {
            this.scene.background = desiredBackground
            this.pathTracer.updateEnvironment()
          }
        }
      }

      this.renderer.setRenderTarget(oldRenderTarget)
      this.renderer.setViewport(oldViewport.x, oldViewport.y, oldViewport.z, oldViewport.w)
      this.renderer.autoClear = oldAutoClear
      this.renderer.setClearColor(oldClearColor, oldClearAlpha)

      if (this.getSampleCount() % 200 === 0 && this.getSampleCount() > 0) {
        console.log(`[PathTracerDemo] 📊 Sample ${this.getSampleCount()}:`, {
          bounces: this.pathTracer.bounces,
          resolutionScale: this.pathTracer.renderScale,
          tiles: `${this.pathTracer.tiles.x}x${this.pathTracer.tiles.y}`
        })
      }
    } catch (renderError) {
      const shaderError = gl.getError()
      const errorMsg = renderError instanceof Error ? renderError.message : String(renderError)

      console.error('[PathTracerDemo] ❌ Error during renderSample:', {
        error: errorMsg,
        webglError: shaderError,
        sampleCount: this.getSampleCount(),
        hasTarget: !!this.pathTracer.target,
        hasTexture: !!this.pathTracer.target?.texture,
        rendererSize: { width: rendererSize.x, height: rendererSize.y },
        canvasSize: { width: canvas.width, height: canvas.height },
        clientSize: { width: canvas.clientWidth, height: canvas.clientHeight }
      })

      const isShaderWarning =
        errorMsg.includes('Fragment shader is not compiled') ||
        errorMsg.includes('Shader Error 0')

      if (!isShaderWarning && shaderError !== gl.NO_ERROR && shaderError !== gl.CONTEXT_LOST_WEBGL) {
        console.error('[PathTracerDemo] ❌ Stopping due to WebGL error:', shaderError)
        this.stop(true)
        return
      }

      if (!isShaderWarning) {
        const err = renderError instanceof Error ? renderError : new Error(String(renderError))
        this.callbacks.onError?.(err)
      }
    } finally {
      gl.getError()
    }
  }

  constructor(config: PathTracerDemoConfig, callbacks: PathTracerDemoCallbacks = {}) {
    this.renderer = config.renderer
    this.camera = config.camera
    this.scene = config.scene
    this.controls = config.controls
    this.callbacks = callbacks

    this.config = {
      // Performance optimization: Lower resolution scale for faster initial preview
      // User can increase later for final quality render
      resolutionScale: config.resolutionScale ?? 1.0, // Default 1.0 to reduce flicker and match canvas
      // Tiles: Higher = better parallelization but more GPU memory
      tiles: config.tiles ?? 2, // Default 2 for faster convergence and less reset cost
      // Min samples: Lower = faster initial display but more noise
      minSamples: config.minSamples ?? 4, // Default 4 to reduce flicker on first frames
      excludeGroundedSkybox: config.excludeGroundedSkybox ?? true, // Default to true to exclude dome
      groundRoughness: config.groundRoughness ?? 0.8, // Default 0.8 (fairly matte)
      groundOpacity: config.groundOpacity ?? 0.95, // Default 0.95 (nearly opaque for visible ground projection)
      groundMetalness: config.groundMetalness ?? 0.0, // Default 0.0 (pure dielectric)
      createGroundPlane: config.createGroundPlane ?? false, // Default false - don't create ground plane
      maxSamples: config.maxSamples ?? undefined,
      bounces: config.bounces ?? undefined,
      denoiseEnabled: config.denoiseEnabled ?? undefined,
      denoiseStrength: config.denoiseStrength ?? undefined,
      // Default: keep last GPU path-traced frame during interaction (no raster fallback)
      previewWhileInteractive: config.previewWhileInteractive ?? false
    }

    // Verify WebGL 2.0 support before initializing
    const gl = this.renderer.getContext() as WebGL2RenderingContext | null
    if (!gl) {
      const err = new Error('WebGL context not available')
      this.callbacks.onError?.(err)
      throw err
    }

    const isWebGL2 = gl instanceof WebGL2RenderingContext
    if (!isWebGL2) {
      const err = new Error('WebGL 2.0 is required for path tracing')
      this.callbacks.onError?.(err)
      throw err
    }

    // Create gradient environment map
    this.gradientMap = new GradientEquirectTexture()
    this.gradientMap.topColor.set(0xeeeeee)
    this.gradientMap.bottomColor.set(0xeaeaea)
    this.gradientMap.update()

    // Initialize path tracer with error handling
    try {
      this.pathTracer = new WebGLPathTracer(this.renderer)
      // VISUAL QUALITY: Optimize filter glossiness for better quality
      // Lower values (0.5-0.8) reduce noise in glossy reflections but can blur details
      // Higher values (0.8-1.0) preserve detail but may have more noise
      // 0.8 is a good balance for most scenes
      this.pathTracer.filterGlossyFactor = 0.8 // Optimized for quality/speed balance (was 1.0)
      
      // VISUAL QUALITY: Enable importance sampling if available (reduces noise)
      // This focuses sampling on important light paths
      if ('filterImportance' in this.pathTracer) {
        (this.pathTracer as any).filterImportance = 0.5 // Optional: reduce noise via importance sampling
      }
      
      this.pathTracer.minSamples = this.config.minSamples
      this.pathTracer.renderScale = this.config.resolutionScale
      this.pathTracer.tiles.set(this.config.tiles, this.config.tiles)
      // CRITICAL: Explicitly set pathTracer.maxSamples to undefined to prevent WebGLPathTracer's
      // internal pause logic from triggering. pathTracer.samples counts tiles (e.g., 16 for 4x4 tiles),
      // not complete frames, so if pathTracer.maxSamples is set, it will pause prematurely.
      // We handle maxSamples checking ourselves using accumulatedSamples (which counts complete frames).
      ;(this.pathTracer as any).maxSamples = undefined
      
      // CRITICAL: Patch shader code using onBeforeCompile hook
      // Access material via _pathTracer.material (internal structure)
      const pathTracingMaterial = (this.pathTracer as any)._pathTracer?.material
      console.log('[PathTracerDemo] 🔍 Checking path tracing material after creation:', {
        hasPathTracer: !!this.pathTracer,
        hasInternalPathTracer: !!(this.pathTracer as any)._pathTracer,
        hasMaterial: !!pathTracingMaterial,
        materialType: pathTracingMaterial?.constructor?.name,
        hasOnBeforeCompile: typeof pathTracingMaterial?.onBeforeCompile === 'function'
      })
      
      if (pathTracingMaterial && typeof pathTracingMaterial.onBeforeCompile === 'function') {
        // Store original onBeforeCompile
        const originalOnBeforeCompile = pathTracingMaterial.onBeforeCompile.bind(pathTracingMaterial)
        
        // Wrap with shader patching
        pathTracingMaterial.onBeforeCompile = (shader: any) => {
          // Call original first
          originalOnBeforeCompile(shader)
          
          // Ensure shader has fragment shader code
          if (!shader.fragmentShader || typeof shader.fragmentShader !== 'string') {
            console.warn('[PathTracerDemo] ⚠️ Invalid fragment shader in onBeforeCompile')
            return
          }
          
          let patched = false
          
          // Pattern to match: vec2 xi = rand2( 100u + uint( sampleIndex ) );
          // This should already be fixed in node_modules, but patch just in case
          const problematicPattern = /vec2\s+xi\s*=\s*rand2\s*\(\s*100u\s*\+\s*uint\s*\(\s*sampleIndex\s*\)\s*\)\s*;/g
          if (problematicPattern.test(shader.fragmentShader)) {
            console.log('[PathTracerDemo] 🔧 Found problematic rand2() call in onBeforeCompile, patching...')
            shader.fragmentShader = shader.fragmentShader.replace(
              problematicPattern,
              `#if RANDOM_TYPE == 0
									vec2 xi = vec2( pcgRand(), pcgRand() );
								#elif RANDOM_TYPE == 1
									vec2 xi = sobol2( 100 + sampleIndex );
								#elif RANDOM_TYPE == 2
									vec2 xi = vec2( rand( 100 + sampleIndex ), rand( 101 + sampleIndex ) );
								#else
									vec2 xi = vec2( rand( 0 ), rand( 1 ) );
								#endif`
            )
            patched = true
          }
          
          // Check for any other problematic rand2 calls that might cause compilation errors
          // Look for rand2 calls with uint or complex expressions
          const rand2Pattern = /rand2\s*\(\s*[^)]*u\s*[^)]*\)/g
          const matches = shader.fragmentShader.match(rand2Pattern)
          if (matches && matches.length > 0) {
            console.warn('[PathTracerDemo] ⚠️ Found potentially problematic rand2() calls:', matches)
            // Don't auto-patch these as they might be intentional, just log
          }
          
          if (patched) {
            console.log('[PathTracerDemo] ✅ Fragment shader patched in onBeforeCompile')
          }
        }
        
        console.log('[PathTracerDemo] ✅ onBeforeCompile hook installed for shader patching')
        pathTracingMaterial.needsUpdate = true
      } else {
        console.warn('[PathTracerDemo] ⚠️ Material not accessible or does not have onBeforeCompile')
      }
      
      // CRITICAL: Ensure renderToCanvas is enabled so output is displayed
      // This is the default, but let's be explicit
      this.pathTracer.renderToCanvas = true
      
      // CRITICAL: Enable rasterizeScene as fallback so something renders while path tracer accumulates samples
      // Allow disabling via config.previewWhileInteractive (default true)
      this.pathTracer.rasterizeScene = true
      
      // CRITICAL: Override rasterizeSceneCallback to ensure it renders correctly
      // The default callback should render the scene, but let's verify and allow disabling
      this.originalRasterizeCallback = this.pathTracer.rasterizeSceneCallback
      let rasterizeCallCount = 0
      if (this.config.previewWhileInteractive) {
        this.pathTracer.rasterizeSceneCallback = (scene: THREE.Scene, camera: THREE.Camera) => {
          rasterizeCallCount++
          
          // Ensure renderer is set to main canvas before rendering fallback
          const currentRenderTarget = this.renderer.getRenderTarget()
          if (currentRenderTarget !== null) {
            console.warn('[PathTracerDemo] ⚠️ Render target not null in rasterizeSceneCallback, resetting', {
              callCount: rasterizeCallCount,
              renderTarget: currentRenderTarget
            })
            this.renderer.setRenderTarget(null)
          }
          
          // Ensure viewport is correct
          const viewport = this.renderer.getViewport(new THREE.Vector4())
          const canvas = this.renderer.domElement
          if (viewport.x !== 0 || viewport.y !== 0 || 
              viewport.z !== canvas.width || viewport.w !== canvas.height) {
            console.warn('[PathTracerDemo] ⚠️ Viewport incorrect in rasterizeSceneCallback, resetting', {
              callCount: rasterizeCallCount,
              viewport: { x: viewport.x, y: viewport.y, z: viewport.z, w: viewport.w },
              canvasSize: { width: canvas.width, height: canvas.height }
            })
            this.renderer.setViewport(0, 0, canvas.width, canvas.height)
          }
          
          // Log first few calls to verify it's being invoked
          if (rasterizeCallCount <= 5) {
            console.log('[PathTracerDemo] 🖼️ rasterizeSceneCallback called', {
              callCount: rasterizeCallCount,
              hasScene: !!scene,
              hasCamera: !!camera,
              sceneChildren: scene?.children?.length || 0
            })
          }
          
          // Call original callback
          this.originalRasterizeCallback?.(scene, camera)
        }
      } else {
        // Disable raster preview; keep last GPU path-traced frame during interaction
        this.pathTracer.rasterizeSceneCallback = noopRasterize
      }
      
      // CRITICAL: Reduce renderDelay to 0 so output shows immediately
      // Default is 100ms delay, which might cause white screen
      this.pathTracer.renderDelay = 0
      
      // CRITICAL: Set fadeDuration to 0 for immediate display (no fade-in)
      // Default is 500ms fade, which might cause white screen initially
      this.pathTracer.fadeDuration = 0
      
      // Respect configured minSamples (0 = immediate preview); cap at 1 to avoid library edge cases
      this.pathTracer.minSamples = Math.max(this.config.minSamples, 0)
      this.config.minSamples = this.pathTracer.minSamples
      
      // PERFORMANCE: Optimize bounces for speed/quality balance
      // 3-5 bounces is optimal for most scenes (higher = slower but better indirect lighting)
      // Default 4 bounces is a good balance (was 10 - too slow)
      if (this.config.bounces !== undefined) {
        this.pathTracer.bounces = this.config.bounces
      } else if (this.pathTracer.bounces === undefined || this.pathTracer.bounces > 5) {
        this.pathTracer.bounces = 4 // Default to 4 bounces for good quality/speed balance
      }

      if (this.config.denoiseEnabled !== undefined) {
        ;(this.pathTracer as any).denoiseEnabled = this.config.denoiseEnabled
      }
      if (this.config.denoiseStrength !== undefined && 'denoiseStrength' in (this.pathTracer as any)) {
        ;(this.pathTracer as any).denoiseStrength = this.config.denoiseStrength
      }
      
      // CRITICAL: Override renderToCanvasCallback to add debugging and ensure it's called
      // Also ensure renderer state is correct before rendering
      const originalCallback = this.pathTracer.renderToCanvasCallback
      let callbackCallCount = 0
      this.pathTracer.renderToCanvasCallback = (target, renderer, quad) => {
        callbackCallCount++
        
        // CRITICAL: Ensure renderer is set to main canvas before rendering
        // Other systems (post-processing, HDR, Caustics, etc.) might have left it in a bad state
        const currentRenderTarget = renderer.getRenderTarget()
        if (currentRenderTarget !== null) {
          console.warn('[PathTracerDemo] ⚠️ Renderer has non-null render target, resetting to main canvas', {
            callCount: callbackCallCount,
            renderTarget: currentRenderTarget
          })
          renderer.setRenderTarget(null)
        }
        
        // Ensure viewport is set correctly
        const viewport = renderer.getViewport(new THREE.Vector4())
        const canvas = renderer.domElement
        if (viewport.x !== 0 || viewport.y !== 0 || 
            viewport.z !== canvas.width || viewport.w !== canvas.height) {
          const viewportInfo = {
            callCount: callbackCallCount,
            viewport: { x: viewport.x, y: viewport.y, z: viewport.z, w: viewport.w },
            canvasSize: { width: canvas.width, height: canvas.height }
          }
          console.warn('[PathTracerDemo] ⚠️ Viewport incorrect, resetting', viewportInfo)
          console.warn('[PathTracerDemo] ⚠️ Viewport incorrect JSON', JSON.stringify(viewportInfo))
          renderer.setViewport(0, 0, canvas.width, canvas.height)
        }
        
        // Log callback invocation (always log first 10 times, then every 50th)
        if (callbackCallCount <= 10 || callbackCallCount % 50 === 0) {
          const material = quad.material as THREE.MeshStandardMaterial
          const cbInfo = {
            callCount: callbackCallCount,
            hasTarget: !!target,
            hasTexture: !!target?.texture,
            quadMaterialMap: !!(material && 'map' in material && material.map),
            quadMaterialOpacity: quad.material.opacity,
            rendererAutoClear: renderer.autoClear,
            renderTarget: renderer.getRenderTarget() ? 'has target' : 'null (main canvas)',
            canvasWidth: renderer.domElement.width,
            canvasHeight: renderer.domElement.height,
            viewport: renderer.getViewport(new THREE.Vector4())
          }
          console.log('[PathTracerDemo] 🎨 renderToCanvasCallback called', cbInfo)
          if (callbackCallCount <= 5) {
            console.log('[PathTracerDemo] 🎨 renderToCanvasCallback JSON', JSON.stringify(cbInfo))
          }
        }
        
        // CRITICAL: Ensure renderer state is correct before calling original callback
        // The original callback does: renderer.autoClear = false; quad.render(renderer); renderer.autoClear = currentAutoClear;
        // But we need to ensure renderer is set to main canvas
        const renderTargetBeforeCallback = renderer.getRenderTarget()
        if (renderTargetBeforeCallback !== null) {
          console.warn('[PathTracerDemo] ⚠️ Render target not null before quad.render, resetting', {
            callCount: callbackCallCount,
            renderTarget: renderTargetBeforeCallback
          })
          renderer.setRenderTarget(null)
        }
        
        // Call original callback
        originalCallback(target, renderer, quad)
        
        // Verify render happened
        const renderTargetAfterCallback = renderer.getRenderTarget()
        if (renderTargetAfterCallback !== null && callbackCallCount <= 10) {
          console.warn('[PathTracerDemo] ⚠️ Render target changed after quad.render', {
            callCount: callbackCallCount,
            renderTarget: renderTargetAfterCallback
          })
        }
        
        // Verify render happened (only check occasionally to avoid spam)
        if (callbackCallCount % 50 === 0) {
          const gl = renderer.getContext() as WebGL2RenderingContext
          if (gl) {
            const error = gl.getError()
            if (error !== gl.NO_ERROR && error !== gl.CONTEXT_LOST_WEBGL) {
              console.warn('[PathTracerDemo] ⚠️ WebGL error after quad.render:', error, {
                callCount: callbackCallCount
              })
            }
          }
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('[PathTracerDemo] Failed to create WebGLPathTracer:', err)
      this.callbacks.onError?.(err)
      throw err
    }

    // Setup controls if provided
    // BEST PRACTICE: Update camera only when it actually changes (not every frame)
    // Path tracers accumulate samples over time - camera updates reset accumulation
    // This event-driven approach is more efficient than checking every frame
    if (this.controls && config.enableControls !== false) {
      this.controls.addEventListener('change', () => {
        this.pathTracer.updateCamera()
      })
    }

    // Don't setup environment here - wait until initialize() when we can check for HDR
    // setupEnvironment() will be called in initialize() if no HDR is present
  }

  /**
   * Setup environment lighting
   * Uses HDR environment if available, otherwise falls back to gradient
   */
  private setupEnvironment(): void {
    // CRITICAL: Path tracer needs equirectangular texture with image.data array
    // HDRSystem converts HDR to PMREM cube map for regular rendering, but path tracer needs original equirectangular
    // Check if HDRSystem has an original HDR texture available
    
    // Try to get original HDR texture from HDRSystem (if available)
    const hdrSystem = (window as any).__hdrSystem as import('../effects/HDRSystem').HDRSystem | undefined
    let originalHDRTexture: THREE.DataTexture | null = null
    
    if (hdrSystem && typeof hdrSystem.getOriginalHDRTexture === 'function') {
      originalHDRTexture = hdrSystem.getOriginalHDRTexture()
      console.log('[PathTracerDemo] 🔍 Checking HDRSystem for original HDR texture:', {
        hasHDRSystem: !!hdrSystem,
        hasOriginalHDR: !!originalHDRTexture,
        hdrTextureType: originalHDRTexture?.constructor?.name
      })
    }
    
    // If we have original HDR texture, use it for path tracing
    if (originalHDRTexture) {
      const envTexture = originalHDRTexture as any
      
      // Validate texture structure - must have image.data for EquirectHdrInfoUniform
      const hasImage = !!envTexture?.image
      const hasDataArray = hasImage && (
        envTexture.image.data instanceof Uint8Array || 
        envTexture.image.data instanceof Float32Array ||
        envTexture.image.data instanceof Uint16Array
      )
      
      if (hasDataArray && envTexture.image.width && envTexture.image.height) {
        console.log('[PathTracerDemo] ✅ Using original HDR equirectangular texture from HDRSystem for path tracing', {
          hasImage,
          hasData: hasDataArray,
          dataType: envTexture.image.data.constructor.name,
          width: envTexture.image.width,
          height: envTexture.image.height,
          dataLength: envTexture.image.data.length,
          mapping: envTexture.mapping,
          type: envTexture.constructor.name
        })
        
        // Use original HDR texture for path tracer (includes reflective ground)
        // ROLLED BACK: Removed masked texture creation - using full HDR with ground
        // Set original HDR texture for path tracer (temporarily override scene.environment)
        // This won't affect regular rendering since HDRSystem manages scene.environment separately
        // But path tracer will use this equirectangular texture (with ground included)
        const hdrTextureForPathTracer = originalHDRTexture
        
        // Dispose masked texture if it exists (no longer needed)
        if (this.maskedHDRTexture && this.maskedHDRTexture !== originalHDRTexture) {
          try {
            this.maskedHDRTexture.dispose()
            this.maskedHDRTexture = null
          } catch (disposeError) {
            console.warn('[PathTracerDemo] ⚠️ Error disposing masked texture:', disposeError)
          }
        }
        
        console.log('[PathTracerDemo] ✅ Using original HDR texture for path tracer (includes reflective ground)')
        hdrTextureForPathTracer.mapping = THREE.EquirectangularReflectionMapping
        hdrTextureForPathTracer.needsUpdate = true
        
        // CRITICAL FIX: Check if ground projection is enabled
        // If ground projection is enabled, we should NOT set scene.background to full HDR
        // GroundedSkybox handles the ground surface - setting background would show both full HDR AND ground projection
        const hdrGroundProjectionEnabled = useAppStore.getState()?.hdrGroundProjectionEnabled ?? false
        
        // Always set environment for lighting (path tracer needs this for reflections and global illumination)
        this.scene.environment = hdrTextureForPathTracer
        console.log('[PathTracerDemo] ✅ Set scene.environment to HDR texture for path tracer lighting')
        
        // CRITICAL: Only set background if ground projection is NOT enabled
        // When ground projection is enabled, GroundedSkybox handles the background/ground surface
        // Setting scene.background to full HDR would show both the full 360 HDR AND the ground-projected HDR simultaneously
        if (!hdrGroundProjectionEnabled) {
          // Ground projection is disabled - set background to full HDR
          const isOurColorTexture = this.colorTexture && this.scene.background === this.colorTexture
          const isDataTexture = this.scene.background instanceof THREE.DataTexture && 
                               (this.scene.background as any)?.image?.data instanceof Uint8Array
          const needsBackgroundChange = !isOurColorTexture && (
            !this.scene.background || 
            (this.scene.background instanceof THREE.Color) ||
            (this.scene.background instanceof THREE.Texture && this.scene.background !== hdrTextureForPathTracer && 
             !isDataTexture && !(this.scene.background as any)?.image?.data) // Not an equirectangular texture with data
          )
          
          if (needsBackgroundChange) {
            this.scene.background = hdrTextureForPathTracer
            console.log('[PathTracerDemo] 📊 Set scene.background to full HDR (ground projection disabled)')
          } else {
            console.log('[PathTracerDemo] ✅ Keeping existing scene.background')
          }
        } else {
          // Ground projection is enabled - DON'T set background to full HDR
          // GroundedSkybox will handle the background/ground surface
          // Keep background as null or existing value (GroundedSkybox manages it)
          console.log('[PathTracerDemo] 🔒 Ground projection enabled - NOT setting scene.background to full HDR (GroundedSkybox handles ground)')
          if (this.scene.background === hdrTextureForPathTracer) {
            // If background was set to HDR, clear it (GroundedSkybox will show instead)
            this.scene.background = null
            console.log('[PathTracerDemo] 🔒 Cleared scene.background (GroundedSkybox will show ground projection)')
          }
        }
        
        return
      } else {
        console.warn('[PathTracerDemo] ⚠️ Original HDR texture exists but lacks required structure:', {
          hasImage,
          hasDataArray,
          hasWidth: !!envTexture?.image?.width,
          hasHeight: !!envTexture?.image?.height,
          dataType: envTexture?.image?.data?.constructor?.name || 'undefined',
          textureType: envTexture?.constructor?.name
        })
        console.warn('[PathTracerDemo] ⚠️ HDR texture might still be loading. Will use gradient fallback for now.')
      }
    }
    
    // Check scene.environment directly (fallback for non-HDRSystem cases)
    if (this.scene.environment && this.scene.environment !== this.gradientMap) {
      const envTexture = this.scene.environment as any
      
      // Check if it's an equirectangular texture with data array
      const isEquirectangular = envTexture?.image?.data || (envTexture?.image && !envTexture?.images)
      const hasDataArray = envTexture?.image?.data instanceof Uint8Array || 
                           envTexture?.image?.data instanceof Float32Array ||
                           envTexture?.data instanceof Uint8Array ||
                           envTexture?.data instanceof Float32Array
      
      if (isEquirectangular && hasDataArray) {
        console.log('[PathTracerDemo] ✅ Using existing equirectangular environment for path tracing', {
          hasImage: !!envTexture.image,
          hasData: hasDataArray,
          dataType: envTexture?.image?.data?.constructor?.name || envTexture?.data?.constructor?.name
        })
        return
      } else {
        console.warn('[PathTracerDemo] ⚠️ Environment exists but is not equirectangular with data array', {
          hasImage: !!envTexture.image,
          hasImages: !!envTexture.images,
          hasData: hasDataArray,
          isCubeTexture: !!envTexture.images,
          textureType: envTexture.constructor?.name
        })
        console.warn('[PathTracerDemo] ⚠️ Setting up gradient fallback (equirectangular with data)')
      }
    }
    
    // NATURAL ENVIRONMENT: Use realistic sky gradient (not all blue)
    if (this.colorTexture && this.originalBackground instanceof THREE.Color) {
      console.log('[PathTracerDemo] 🎨 Using original sky color for background, natural realistic gradient for environment')
      // Set the color texture as background (sky color - matches standard mode)
      this.scene.background = this.colorTexture
      
      // Use a natural, realistic gradient environment (not all blue)
      // Realistic sky: light blue at top, white/light gray at horizon, darker gray at bottom
      if (!this.gradientMap) {
        this.gradientMap = new GradientEquirectTexture()
      }
      
      // Create a more natural gradient: light blue at top, transitioning to white/gray at bottom
      // This creates a realistic sky appearance without everything being blue
      const topColor = new THREE.Color(0x87CEEB) // Sky blue at top
      const bottomColor = new THREE.Color(0xE0E0E0) // Light gray at bottom (not blue)
      
      this.gradientMap.topColor.copy(topColor)
      this.gradientMap.bottomColor.copy(bottomColor)
      this.gradientMap.update()
      
      // Use gradient for environment (reflections) - natural and not all blue
      this.scene.environment = this.gradientMap
      console.log('[PathTracerDemo] ✅ Path tracer: blue sky background + natural gradient environment (not all blue)')
      return
    }
    
    // No valid equirectangular HDR environment - use gradient fallback
    console.log('[PathTracerDemo] Setting up gradient fallback (equirectangular with data array)')
    
    // Ensure gradient map is updated
    if (!this.gradientMap) {
      this.gradientMap = new GradientEquirectTexture()
      this.gradientMap.topColor.set(0xeeeeee)
      this.gradientMap.bottomColor.set(0xeaeaea)
    }
    this.gradientMap.update()
    
    // Use gradient texture directly as environment (equirectangular format)
    this.scene.environment = this.gradientMap
    // Only set background if it's null or not a valid equirectangular texture
    // CRITICAL: Don't overwrite our color texture
    const isOurColorTexture = this.colorTexture && this.scene.background === this.colorTexture
    const isDataTexture = this.scene.background instanceof THREE.DataTexture && 
                         (this.scene.background as any)?.image?.data instanceof Uint8Array
    if (!isOurColorTexture && (
      !this.scene.background || 
      (this.scene.background instanceof THREE.Color) ||
      (this.scene.background instanceof THREE.Texture && !isDataTexture && !(this.scene.background as any)?.image?.data)
    )) {
      this.scene.background = this.gradientMap
      console.log('[PathTracerDemo] 📊 Set scene.background to gradient fallback', {
        reason: !this.scene.background ? 'was null' : 
                this.scene.background instanceof THREE.Color ? 'was Color' :
                'was incompatible texture'
      })
    } else {
      console.log('[PathTracerDemo] ✅ Keeping existing scene.background - already compatible with path tracer', {
        isOurColorTexture,
        isDataTexture,
        hasImageData: !!(this.scene.background as any)?.image?.data
      })
    }
    
    console.log('[PathTracerDemo] ✅ Gradient environment set:', {
      hasImage: !!(this.gradientMap as any)?.image,
      hasData: !!(this.gradientMap as any)?.image?.data,
      dataType: (this.gradientMap as any)?.image?.data?.constructor?.name,
      width: (this.gradientMap as any)?.image?.width,
      height: (this.gradientMap as any)?.image?.height
    })
  }

  /**
   * Find and modify ground plane materials to apply roughness
   * This reduces the reflective quality of the ground surface in path tracer
   */
  private applyGroundRoughness(): void {
    const groundPlanes: THREE.Mesh[] = []
    // Find lowest object; clamp to a sane range to avoid extreme offsets
    const minYRaw = this.findLowestObjectY()
    const minYClamped = isFinite(minYRaw) ? Math.max(-10000, Math.min(10000, minYRaw)) : 0
    
    console.log('[PathTracerDemo] 🔍 Searching for ground planes in scene...', {
      lowestY: minYClamped,
      targetRoughness: this.config.groundRoughness,
      sceneChildren: this.scene.children.length
    })
    
    // Find potential ground planes (PlaneGeometry meshes near the lowest Y position)
    // Traverse ALL objects, including hidden ones (visibility doesn't affect material modification)
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Check if it's a PlaneGeometry (could be ground plane)
        const isPlaneGeometry = obj.geometry instanceof THREE.PlaneGeometry
        
        // Check if it's horizontal (rotated -90 degrees around X axis)
        const isHorizontal = Math.abs(obj.rotation.x + Math.PI / 2) < 0.1 // Approximately -PI/2
        
        // Check if it's near the lowest Y position (within 5 units)
        // EXCLUDE shadow plane - it's not needed in path tracer (HDR handles ground lighting)
        const isShadowPlane = obj.userData?.isShadowPlane === true || obj.name === 'Shadow Plane'
        const isNearLowest = !isShadowPlane && Math.abs(obj.position.y - minYClamped) < 5 // Exclude shadow plane
        
        // Check if it's marked as ground/floor in userData or name
        // EXCLUDE shadow plane - it's a viewer-specific shadow receiver, not needed in path tracer
        // Path tracer uses HDR environment for ground lighting, shadow plane is redundant and makes gray plane visible
        const isShadowPlaneMarker = obj.userData?.isShadowPlane === true || obj.name === 'Shadow Plane'
        const isMarkedGround = 
          !isShadowPlaneMarker && ( // Exclude shadow plane from ground detection
            obj.userData?.isGroundPlane === true ||
            obj.userData?.isFloor === true ||
            obj.userData?.isPathTracerGroundPlane === true ||
            (obj.name || '').toLowerCase().includes('ground') ||
            (obj.name || '').toLowerCase().includes('floor') ||
            ((obj.name || '').toLowerCase().includes('plane') && !isShadowPlaneMarker) // Include planes but not shadow plane
          )
        
        // Identify as ground plane if:
        // 1. It's a plane geometry AND horizontal AND near lowest Y
        // 2. OR it's marked as ground/floor in userData/name
        const isGroundPlane = (isPlaneGeometry && isHorizontal && isNearLowest) || isMarkedGround
        
        if (isGroundPlane) {
          groundPlanes.push(obj)
          console.log('[PathTracerDemo] 🔍 Found potential ground plane:', {
            name: obj.name || 'Unnamed',
            type: obj.type,
            geometryType: obj.geometry.constructor?.name,
            rotationX: obj.rotation.x,
            isHorizontal,
            positionY: obj.position.y.toFixed(2),
            isNearLowest,
            materialType: Array.isArray(obj.material) 
              ? obj.material.map(m => m.constructor?.name).join(', ')
              : obj.material.constructor?.name
          })
        }
      }
    })
    
    // Modify found ground planes
    let modifiedCount = 0
    groundPlanes.forEach((ground, index) => {
      const materials = Array.isArray(ground.material) ? ground.material : [ground.material]
      materials.forEach((mat, matIndex) => {
        // CRITICAL: Shadow Catcher Material approach (based on Blender/Maya/Unity best practices)
        // Professional renderers use "shadow catcher" materials that are nearly invisible except where shadows hit
        // Technique: Very low opacity (0.1-0.2) makes material nearly transparent, showing HDR background
        // Shadows darken the transparent material where they hit, making those areas visible
        // This matches how Blender Cycles, Maya V-Ray, and Unity HDRP handle transparent ground + HDR backgrounds
        if (mat instanceof THREE.ShadowMaterial) {
          console.log(`[PathTracerDemo] 🔄 Creating Shadow Catcher Material for path tracer (ground plane ${index + 1}, material ${matIndex + 1})`)
          
          // Store original material for restoration later
          const originalMaterial = mat
          const originalOpacity = mat.opacity
          
          // CRITICAL: Path tracer shadow catcher - requires adequate opacity for shadows to compute
          // Path tracers compute shadows via ray tracing - transparent materials need sufficient opacity to block light
          // Research shows path tracers typically need opacity ~0.5-0.7 for reliable shadow computation
          // However, we want HDR background visible, so use moderate-high opacity (0.5-0.7)
          // Shadows will darken the material where they hit, making those areas more visible
          // Non-shadow areas will be semi-transparent, showing HDR background
          // IMPORTANT: Don't rely on originalOpacity - use fixed range for consistent shadow computation
          // CRITICAL: Path tracers need higher opacity for shadow computation
          // Based on research, path tracers typically need opacity 0.6-0.8 for reliable shadows
          // Use fixed opacity 0.6 as minimum for shadow computation while still showing HDR background
          const shadowCatcherOpacity = 0.6 // Fixed 0.6 opacity for reliable path tracer shadows + HDR visibility
          
          // Create Shadow Catcher Material using MeshStandardMaterial
          // Path tracers need PBR materials for proper shadow computation via ray tracing
          // Very low opacity ensures material is nearly invisible except where shadows darken it
          const newMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000, // Black - shadows will darken this further
            roughness: 1.0, // Maximum roughness - matte surface, no reflections
            metalness: 0.0, // No metalness - pure diffuse
            side: THREE.DoubleSide,
            transparent: true, // Transparent to show HDR background
            opacity: shadowCatcherOpacity, // Very low opacity - shadow catcher effect
            depthWrite: false // Don't write to depth buffer for transparent ground
          })
          
          // Mark as modified by path tracer
          if (!newMaterial.userData) newMaterial.userData = {}
          newMaterial.userData.pathTracerModified = true
          newMaterial.userData.originalMaterial = originalMaterial
          newMaterial.userData.wasShadowMaterial = true
          newMaterial.userData.originalOpacity = originalOpacity
          
          // Replace material
          if (Array.isArray(ground.material)) {
            ground.material[matIndex] = newMaterial
          } else {
            ground.material = newMaterial
          }
          
          // CRITICAL: Ensure ground plane receives shadows
          // Path tracers need receiveShadow = true to compute shadows on the surface
          ground.receiveShadow = true
          ground.castShadow = false // Don't cast shadows, only receive them
          
          // CRITICAL: Ensure ground plane is visible and included in BVH
          // Path tracer needs the ground plane in the scene to render shadows on it
          ground.visible = true
          
          newMaterial.needsUpdate = true
          
          modifiedCount++
          console.log(`[PathTracerDemo] ✅ Created Shadow Catcher Material for path tracer:`, {
            name: ground.name || 'Unnamed',
            originalMaterialType: originalMaterial.constructor?.name,
            newMaterialType: newMaterial.constructor?.name,
            originalOpacity: originalOpacity.toFixed(2),
            shadowCatcherOpacity: newMaterial.opacity.toFixed(2),
            roughness: newMaterial.roughness.toFixed(2),
            receiveShadow: ground.receiveShadow,
            visible: ground.visible,
            position: { 
              x: ground.position.x.toFixed(2), 
              y: ground.position.y.toFixed(2), 
              z: ground.position.z.toFixed(2) 
            },
            note: `Shadow Catcher Material (opacity ${shadowCatcherOpacity.toFixed(2)}, roughness ${newMaterial.roughness.toFixed(2)}) - path tracer needs minimum opacity for shadow computation, HDR background visible through transparent areas`
          })
          
          // ShadowMaterial conversion complete - skip to next material
          return
        } else if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          const oldRoughness = mat.roughness
          const oldMetalness = mat.metalness
          const oldOpacity = mat.opacity
          
          // CRITICAL FIX: Save original color to preserve it (color is not modified, but we save it for reference)
          if (!mat.userData) mat.userData = {}
          if (!mat.userData.originalColor && mat.color) {
            mat.userData.originalColor = mat.color.clone()
          }
          
          // Apply roughness (higher = less reflective/more matte)
          mat.roughness = Math.max(0.0, Math.min(1.0, this.config.groundRoughness))
          
          // Also reduce metalness for less reflective appearance
          // High metalness makes surfaces mirror-like, low metalness = diffuse
          if (mat.metalness > 0.3) {
            mat.metalness = Math.min(0.3, mat.metalness * 0.6)
          }
          
          // CRITICAL: Path tracer shadow catcher - requires adequate opacity for shadows to compute
          // Path tracers compute shadows via ray tracing - transparent materials need sufficient opacity to block light
          // Research shows path tracers typically need opacity ~0.5-0.7 for reliable shadow computation
          // However, we want HDR background visible, so use moderate-high opacity (0.5-0.7)
          // Shadows will darken the material where they hit, making those areas more visible
          // Non-shadow areas will be semi-transparent, showing HDR background
          // IMPORTANT: Don't rely on oldOpacity - use fixed range for consistent shadow computation
          if (!mat.transparent || mat.opacity > 0.7) {
            mat.transparent = true
            // CRITICAL: Path tracers need higher opacity for shadow computation
            // Use fixed opacity 0.6 as minimum for shadow computation while still showing HDR background
            mat.opacity = 0.6 // Fixed 0.6 opacity for reliable path tracer shadows + HDR visibility
            mat.depthWrite = false // Don't write to depth buffer for transparent ground
            mat.userData.originalOpacity = oldOpacity
            mat.userData.opacityAdjusted = true
          }
          
          // CRITICAL: Ensure ground plane receives shadows
          // This is essential for shadows to appear on the transparent ground
          ground.receiveShadow = true
          ground.castShadow = false // Don't cast shadows, only receive them
          
          mat.needsUpdate = true
          
          // Mark as modified by path tracer
          mat.userData.pathTracerModified = true
          mat.userData.originalRoughness = oldRoughness
          mat.userData.originalMetalness = oldMetalness
          
          modifiedCount++
          console.log(`[PathTracerDemo] ✅ Applied roughness to ground plane ${index + 1}, material ${matIndex + 1}:`, {
            name: ground.name || 'Unnamed',
            oldRoughness: oldRoughness.toFixed(2),
            newRoughness: mat.roughness.toFixed(2),
            oldMetalness: oldMetalness.toFixed(2),
            newMetalness: mat.metalness.toFixed(2),
            oldOpacity: oldOpacity.toFixed(2),
            newOpacity: mat.opacity.toFixed(2),
            opacityAdjusted: mat.userData.opacityAdjusted || false,
            originalColor: mat.userData.originalColor ? `#${mat.userData.originalColor.getHexString()}` : 'N/A',
            currentColor: mat.color ? `#${mat.color.getHexString()}` : 'N/A',
            position: { 
              x: ground.position.x.toFixed(2), 
              y: ground.position.y.toFixed(2), 
              z: ground.position.z.toFixed(2) 
            },
            effect: mat.roughness > 0.7 ? 'matte' : mat.roughness > 0.3 ? 'semi-matte' : 'glossy'
          })
        } else {
          console.log(`[PathTracerDemo] ⚠️ Ground plane ${index + 1}, material ${matIndex + 1} is not PBR material:`, {
            name: ground.name || 'Unnamed',
            materialType: mat.constructor?.name,
            note: 'Cannot apply roughness to this material type'
          })
        }
      })
    })
    
    if (modifiedCount === 0) {
      console.log('[PathTracerDemo] ℹ️ No ground planes with PBR materials found to modify')
      console.log('[PathTracerDemo] 💡 Note: Reflections may come from HDR environment map lower hemisphere, not a ground plane mesh')
      console.log('[PathTracerDemo] 💡 To reduce HDR ground reflections, you could use masked HDR texture (lower hemisphere = black)')
    } else {
      console.log(`[PathTracerDemo] ✅ Modified ${modifiedCount} ground plane material(s) with roughness ${this.config.groundRoughness}`)
    }
    
    // CRITICAL: Disable shadow map updates during ground plane setup to prevent flickering
    const originalShadowMapAutoUpdate = this.renderer.shadowMap.autoUpdate
    this.renderer.shadowMap.autoUpdate = false
    console.log('[PathTracerDemo] 🔒 Disabled shadow map auto-update during ground plane setup')
    
    try {
      // CRITICAL: Check if HDR ground projection is enabled - if so, don't create/hide ground plane
      // GroundedSkybox handles the ground surface and shadows, so we don't need a separate gray ground plane
      const hdrGroundProjectionEnabled = useAppStore.getState()?.hdrGroundProjectionEnabled ?? false
      
      if (hdrGroundProjectionEnabled) {
        // HDR ground projection is enabled - hide any existing path tracer ground plane
        if (this.groundPlaneMesh) {
          this.groundPlaneMesh.visible = false
          console.log('[PathTracerDemo] 🔒 Hiding path tracer ground plane (HDR ground projection handles ground)')
        }
        // Don't create new ground plane when ground projection is enabled
        console.log('[PathTracerDemo] ℹ️ Skipping ground plane creation (HDR ground projection enabled - GroundedSkybox handles ground)')
      } else {
        // No ground projection - create ground plane if needed
        if (groundPlanes.length === 0 && this.config.createGroundPlane && !this.groundPlaneMesh) {
          this.createGroundPlane()
        } else if (this.groundPlaneMesh && this.config.createGroundPlane) {
          // Ground plane already exists, ensure it's visible and stable
          if (!this.groundPlaneMesh.visible) {
            this.groundPlaneMesh.visible = true
            console.log('[PathTracerDemo] ✅ Ground plane already exists, ensuring visibility')
          }
          // Ensure position is stable
          if (this.expectedGroundPlaneY !== null) {
            this.groundPlaneMesh.position.set(0, this.expectedGroundPlaneY, 0)
            this.groundPlaneMesh.updateMatrixWorld(true)
          }
        }
      }
    } finally {
      // CRITICAL: Restore shadow map auto-update after ground plane setup
      this.renderer.shadowMap.autoUpdate = originalShadowMapAutoUpdate
      console.log('[PathTracerDemo] ✅ Restored shadow map auto-update after ground plane setup:', originalShadowMapAutoUpdate)
    }
  }
  
  /**
   * Find the lowest Y position of objects in the scene
   */
  private findLowestObjectY(): number {
    let minY = Infinity
    const bbox = new THREE.Box3()
    
    this.scene.traverse((obj) => {
      // Skip GroundedSkybox and lights
      if ((obj as any).isGroundedSkybox === true || 
          obj instanceof THREE.Light ||
          obj instanceof THREE.Camera ||
          obj.userData?.isGroundedSkybox === true) {
        return
      }
      
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
        bbox.setFromObject(obj)
        if (bbox.min.y < minY) {
          minY = bbox.min.y
        }
      }
    })
    
    return isFinite(minY) ? minY : 0
  }
  
  /**
   * Create a ground plane with specified roughness
   */
  private createGroundPlane(): void {
    // CRITICAL: Prevent flickering by disabling shadow map updates during creation
    const originalShadowMapAutoUpdate = this.renderer.shadowMap.autoUpdate
    this.renderer.shadowMap.autoUpdate = false
    console.log('[PathTracerDemo] 🔒 Disabled shadow map auto-update during ground plane creation to prevent flickering')
    
    try {
      // Place the PT ground plane at world Y=0 to avoid deep offsets
      const minYRaw = this.findLowestObjectY()
      const bbox = new THREE.Box3()
    
    // CRITICAL FIX: Find existing ground planes and extract their color AND position
    let existingGroundColor: THREE.Color | null = null as THREE.Color | null
    let existingGroundY: number | null = null as number | null
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const isPlaneGeometry = obj.geometry instanceof THREE.PlaneGeometry
        const isHorizontal = Math.abs(obj.rotation.x + Math.PI / 2) < 0.1
        const isMarkedGround = 
          obj.userData?.isGroundPlane === true ||
          obj.userData?.isFloor === true ||
          (obj.name || '').toLowerCase().includes('ground') ||
          (obj.name || '').toLowerCase().includes('floor')
        
        // Also check for shadow plane (standard mode uses this)
        const isShadowPlane = obj.userData?.isShadowPlane === true || obj.name === 'Shadow Plane'
        
        if ((isPlaneGeometry && isHorizontal) || isMarkedGround || isShadowPlane) {
          // Extract Y position from existing ground/shadow plane
          if (existingGroundY === null) {
            existingGroundY = obj.position.y
            console.log('[PathTracerDemo] 📍 Found existing ground/shadow plane Y position:', {
              name: obj.name || 'Unnamed',
              positionY: existingGroundY.toFixed(4)
            })
          }
          
          // Extract color from materials (including shadow plane)
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of materials) {
            // Check for MeshStandardMaterial, MeshPhysicalMaterial, or ShadowMaterial
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
              if (mat.color && existingGroundColor === null) {
                existingGroundColor = mat.color.clone()
                console.log('[PathTracerDemo] 🎨 Found existing ground plane color:', {
                  name: obj.name || 'Unnamed',
                  color: `#${existingGroundColor.getHexString()}`,
                  r: existingGroundColor.r,
                  g: existingGroundColor.g,
                  b: existingGroundColor.b
                })
                break
              }
            } else if (mat instanceof THREE.ShadowMaterial) {
              // ShadowMaterial doesn't have a color property, but we can use a default dark color
              // or check if there's a userData color stored
              if (existingGroundColor === null) {
                // Use a dark gray color for shadow planes (they're typically dark)
                existingGroundColor = new THREE.Color(0x333333)
                console.log('[PathTracerDemo] 🎨 Using default color for shadow plane:', {
                  name: obj.name || 'Unnamed',
                  color: `#${existingGroundColor.getHexString()}`,
                  note: 'ShadowMaterial has no color property, using default dark gray'
                })
                break
              }
            }
          }
        }
      }
    })
    
    // Calculate scene bounds (excluding ground planes to avoid circular dependency)
    this.scene.traverse((obj) => {
      if ((obj as any).isGroundedSkybox === true || 
          obj instanceof THREE.Light ||
          obj instanceof THREE.Camera ||
          obj.userData?.isGroundedSkybox === true ||
          obj.userData?.isPathTracerGroundPlane === true || // Exclude our ground plane
          obj.userData?.isGroundPlane === true || // Exclude existing ground planes
          obj.userData?.isShadowPlane === true) { // Exclude shadow planes
        return
      }
      
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Group) {
        bbox.expandByObject(obj)
      }
    })
    
    // Use a fixed large size for ground plane, not dependent on scene bounds
    // This ensures the plane doesn't move when objects move
    const size = Math.max(bbox.getSize(new THREE.Vector3()).x, bbox.getSize(new THREE.Vector3()).z, 50)
    const groundSize = Math.max(size * 2, 1000) // Make ground at least 1000 units, or 2x scene size
    
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize)
    // FIX: Use natural ground color (not blue) - check if existing color is too blue and replace it
    let groundColor = 0x888888 // Default: neutral gray
    if (existingGroundColor && existingGroundColor instanceof THREE.Color) {
      // Check if the color is too blue (blue component is dominant)
      const isBlue = existingGroundColor.b > existingGroundColor.r && existingGroundColor.b > existingGroundColor.g
      const isTooBlue = existingGroundColor.b > 0.5 // If blue component is high
      
      if (isBlue || isTooBlue) {
        // Use natural ground color instead of blue
        groundColor = 0x8B7355 // Natural tan/brown ground color
        console.log('[PathTracerDemo] 🎨 Existing ground color is blue, using natural ground color instead:', {
          originalColor: `#${existingGroundColor.getHexString()}`,
          newColor: `#${groundColor.toString(16)}`
        })
      } else {
        // Use existing color if it's not too blue
        groundColor = existingGroundColor.getHex()
      }
    }
    
    // IMPROVED: Use configurable material properties
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: groundColor,
      roughness: this.config.groundRoughness,
      metalness: this.config.groundMetalness, // Use configurable metalness (default: 0.0)
      opacity: this.config.groundOpacity,
      transparent: this.config.groundOpacity < 1.0,
      side: THREE.DoubleSide
    })
    
    this.groundPlaneMesh = new THREE.Mesh(groundGeometry, groundMaterial)
    this.groundPlaneMesh.rotation.x = -Math.PI / 2
    
    // CRITICAL FIX: Use existing ground plane Y position if found, otherwise use default
    // Standard mode shadow plane is at -0.001, so we should match that height
    // CRITICAL: Set position in world coordinates (0, y, 0) - not relative to any object
    if (existingGroundY !== null) {
      this.groundPlaneMesh.position.set(0, existingGroundY, 0) // Fixed world position
      this.expectedGroundPlaneY = existingGroundY // Store expected Y for drift detection
      console.log('[PathTracerDemo] 📍 Using existing ground plane Y position:', existingGroundY.toFixed(4))
    } else {
      // Fallback: Use -0.001 to match standard mode shadow plane position
      const defaultY = -0.001
      this.groundPlaneMesh.position.set(0, defaultY, 0) // Fixed world position at origin
      this.expectedGroundPlaneY = defaultY // Store expected Y for drift detection
      console.log('[PathTracerDemo] 📍 Using default ground plane Y position (matching standard mode shadow plane):', defaultY)
    }
    
    // CRITICAL: Ensure plane is in world space, not parented to any object
    this.groundPlaneMesh.updateMatrixWorld(true)
    
    this.groundPlaneMesh.receiveShadow = true
    this.groundPlaneMesh.castShadow = false
    
    // Mark as path tracer ground plane
    this.groundPlaneMesh.userData.isPathTracerGroundPlane = true
    this.groundPlaneMesh.userData.isGroundPlane = true
    // CRITICAL: Mark that this plane should never move (fixed in world space)
    this.groundPlaneMesh.userData.fixedWorldPosition = true
    
    // CRITICAL: Only add to scene if not already added (prevents flickering)
    if (!this.scene.children.includes(this.groundPlaneMesh)) {
      this.scene.add(this.groundPlaneMesh)
      console.log('[PathTracerDemo] ✅ Ground plane added to scene')
    } else {
      console.log('[PathTracerDemo] ✅ Ground plane already in scene, skipping add')
    }
    
    // CRITICAL: Verify it's not parented to anything (should be direct child of scene)
    if (this.groundPlaneMesh.parent !== this.scene) {
      console.warn('[PathTracerDemo] ⚠️ Ground plane is parented to something other than scene!', {
        parent: this.groundPlaneMesh.parent?.name || 'Unknown',
        parentType: this.groundPlaneMesh.parent?.type
      })
      // Force reparent to scene
      if (this.groundPlaneMesh.parent) {
        this.groundPlaneMesh.parent.remove(this.groundPlaneMesh)
      }
      // Only add if not already in scene
      if (!this.scene.children.includes(this.groundPlaneMesh)) {
        this.scene.add(this.groundPlaneMesh)
      }
    }
    
    // CRITICAL: Ensure ground plane is visible and stable (prevent flickering)
    this.groundPlaneMesh.visible = true
    
    console.log('[PathTracerDemo] ✅ Created ground plane with preserved color and position:', {
      size: groundSize,
      positionY: this.groundPlaneMesh.position.y.toFixed(4),
      roughness: this.config.groundRoughness,
      metalness: this.config.groundMetalness,
      color: (existingGroundColor && existingGroundColor instanceof THREE.Color) ? `#${existingGroundColor.getHexString()} (preserved from existing ground)` : `#${groundColor.toString(16)} (default)`,
      matchedExistingHeight: existingGroundY !== null
    })
    } finally {
      // CRITICAL: Restore shadow map auto-update after ground plane creation
      this.renderer.shadowMap.autoUpdate = originalShadowMapAutoUpdate
      console.log('[PathTracerDemo] ✅ Restored shadow map auto-update:', originalShadowMapAutoUpdate)
    }
  }

  /**
   * Initialize the path tracer with the scene
   */
  async initialize(): Promise<void> {
    try {
      console.log('[PathTracerDemo] 🔄 Starting initialization...')
      this.callbacks.onProgress?.('Initializing path tracer...')

      // CRITICAL: Save complete original state BEFORE any modifications
      // This ensures we capture the true original state, not a modified state
      // This state will be used for restoration when path tracer stops
      if (!(this as any)._stateBeforePT) {
        console.log('[PathTracerDemo] 💾 Saving original state BEFORE any modifications...')
        
        // Save original environment/background and exposure
        if (this.scene.background) {
          if (this.scene.background instanceof THREE.Texture) {
            this.originalBackground = this.scene.background
          } else if (this.scene.background instanceof THREE.Color) {
            // Save the exact color values
            this.originalBackground = new THREE.Color(this.scene.background.r, this.scene.background.g, this.scene.background.b)
            
            // SIMPLEST FIX: Create color texture immediately from the original color
            // This ensures the path tracer uses the exact same sky color as standard mode
            console.log('[PathTracerDemo] 🎨 Creating color texture from original sky color:', {
              r: this.originalBackground.r,
              g: this.originalBackground.g,
              b: this.originalBackground.b,
              hex: `#${this.originalBackground.getHexString()}`
            })
            
            const width = 4
            const height = 2
            const data = new Uint8Array(width * height * 4)
            const r = Math.floor(this.originalBackground.r * 255)
            const g = Math.floor(this.originalBackground.g * 255)
            const b = Math.floor(this.originalBackground.b * 255)
            
            for (let i = 0; i < width * height; i++) {
              const idx = i * 4
              data[idx] = r
              data[idx + 1] = g
              data[idx + 2] = b
              data[idx + 3] = 255
            }
            
            // Dispose old texture if it exists
            if (this.colorTexture) {
              this.colorTexture.dispose()
            }
            
            this.colorTexture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
            this.colorTexture.needsUpdate = true
            this.colorTexture.mapping = THREE.EquirectangularReflectionMapping
            this.colorTexture.colorSpace = THREE.LinearSRGBColorSpace
            
            console.log('[PathTracerDemo] ✅ Color texture created with exact same color as standard mode sky')
          } else {
            this.originalBackground = this.scene.background
          }
        } else {
          this.originalBackground = null
        }
        
        this.originalEnvironment = this.scene.environment ? 
          (this.scene.environment instanceof THREE.Texture ? this.scene.environment : this.scene.environment) : null
        this.originalToneMappingExposure = this.renderer.toneMappingExposure
        
        // Save HDR state
        const hdrSystem = (window as any).__hdrSystem
        const store = useAppStore.getState()
        ;(this as any)._originalHdrState = {
          hdrEnabled: store?.hdrEnabled ?? false,
          hdrBackgroundVisible: store?.hdrBackgroundVisible ?? true,
          hdrGroundProjectionEnabled: store?.hdrGroundProjectionEnabled ?? false,
          hdrUrl: store?.hdrUrl,
          sceneBackground: this.scene.background ? (this.scene.background instanceof THREE.Texture ? 'texture' : 'color') : null,
          sceneEnvironment: this.scene.environment ? (this.scene.environment instanceof THREE.Texture ? 'texture' : 'other') : null,
          toneMappingExposure: this.renderer.toneMappingExposure,
          shadowMapEnabled: this.renderer.shadowMap.enabled,
          shadowMapType: this.renderer.shadowMap.type
        }
        
        // Save directional lights
        this.originalDirectionalLights = []
        this.scene.traverse((obj) => {
          if (obj instanceof THREE.DirectionalLight) {
            this.originalDirectionalLights.push({
              light: obj,
              position: obj.position.clone(),
              targetPosition: obj.target?.position?.clone?.() || new THREE.Vector3(),
              intensity: obj.intensity,
              castShadow: obj.castShadow,
              shadowProps: obj.shadow
                ? {
                    mapSize: { w: obj.shadow.mapSize.width, h: obj.shadow.mapSize.height },
                    near: obj.shadow.camera.near,
                    far: obj.shadow.camera.far,
                    left: obj.shadow.camera.left,
                    right: obj.shadow.camera.right,
                    top: obj.shadow.camera.top,
                    bottom: obj.shadow.camera.bottom,
                    bias: obj.shadow.bias ?? 0,
                    normalBias: obj.shadow.normalBias ?? 0
                  }
                : undefined
            })
          }
        })
        
        // Save complete state snapshot
        const stateBeforePT: any = {
          timestamp: new Date().toISOString(),
          scene: {
            background: this.scene.background ? (
              this.scene.background instanceof THREE.Color ? {
                type: 'Color',
                r: this.scene.background.r,
                g: this.scene.background.g,
                b: this.scene.background.b,
                hex: this.scene.background.getHexString()
              } : this.scene.background instanceof THREE.Texture ? {
                type: 'Texture',
                uuid: this.scene.background.uuid,
                image: this.scene.background.image ? { width: (this.scene.background.image as any).width, height: (this.scene.background.image as any).height } : null
              } : { type: 'Other', constructor: (this.scene.background as any).constructor?.name }
            ) : null,
            environment: this.scene.environment ? (
              this.scene.environment instanceof THREE.Texture ? {
                type: 'Texture',
                uuid: this.scene.environment.uuid
              } : { type: 'Other', constructor: (this.scene.environment as any).constructor?.name }
            ) : null,
            childrenCount: this.scene.children.length
          },
          renderer: {
            toneMappingExposure: this.renderer.toneMappingExposure,
            shadowMapEnabled: this.renderer.shadowMap.enabled,
            shadowMapType: this.renderer.shadowMap.type,
            autoClear: this.renderer.autoClear
          },
          hdrState: (this as any)._originalHdrState,
          lights: this.originalDirectionalLights.map(l => ({
            name: l.light.name || 'Unnamed',
            position: { x: l.position.x, y: l.position.y, z: l.position.z },
            intensity: l.intensity,
            castShadow: l.castShadow
          })),
          shadowPlanes: (() => {
            const planes: any[] = []
            this.scene.traverse((obj) => {
              if (obj.userData?.isShadowPlane === true || (obj as any).name === 'Shadow Plane') {
                const material = obj instanceof THREE.Mesh ? (Array.isArray(obj.material) ? obj.material[0] : obj.material) : null
                planes.push({
                  name: obj.name || 'Shadow Plane',
                  uuid: obj.uuid,
                  visible: obj.visible,
                  receiveShadow: obj instanceof THREE.Mesh ? obj.receiveShadow : undefined,
                  castShadow: obj instanceof THREE.Mesh ? obj.castShadow : undefined,
                  position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                  rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                  scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
                  material: material ? {
                    type: material.constructor?.name,
                    uuid: material.uuid,
                    transparent: (material as any).transparent,
                    opacity: (material as any).opacity,
                    visible: (material as any).visible,
                    color: (material as any).color ? {
                      r: (material as any).color.r,
                      g: (material as any).color.g,
                      b: (material as any).color.b,
                      hex: (material as any).color.getHexString ? (material as any).color.getHexString() : 'N/A'
                    } : null
                  } : null,
                  inScene: obj.parent === this.scene || (obj.parent && this.scene.children.includes(obj.parent as any)),
                  userData: obj.userData ? { ...obj.userData } : null
                })
              }
            })
            return planes
          })(),
          groundedSkyboxes: (() => {
            const skyboxes: any[] = []
            this.scene.traverse((obj) => {
              if (obj.userData?.isGroundedSkybox === true || (obj as any).isGroundedSkybox === true) {
                skyboxes.push({
                  name: obj.name || 'GroundedSkybox',
                  visible: obj.visible
                })
              }
            })
            return skyboxes
          })()
        }
        console.log('[PathTracerDemo] 📸 COMPLETE STATE BEFORE PATH TRACER (saved in initialize):', JSON.stringify(stateBeforePT, null, 2))
        console.log('[PathTracerDemo] 📸 COMPLETE STATE BEFORE PATH TRACER (readable):', stateBeforePT)
        ;(this as any)._stateBeforePT = stateBeforePT
        console.log('[PathTracerDemo] ✅ Original state saved BEFORE any modifications')
      } else {
        console.log('[PathTracerDemo] ℹ️ Original state already saved, skipping duplicate save')
      }

      // Check WebGL context
      const gl = this.renderer.getContext() as WebGL2RenderingContext
      if (!gl) {
        console.error('[PathTracerDemo] ❌ WebGL context not available')
        throw new Error('WebGL context not available')
      }
      
      console.log('[PathTracerDemo] ✅ WebGL context available:', {
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
      })

      // Render once to ensure everything is initialized
      console.log('[PathTracerDemo] 🔄 Rendering initial scene...')
      this.renderer.render(this.scene, this.camera)

      // Wait a frame to ensure renderer state is stable
      await new Promise(resolve => requestAnimationFrame(resolve))

      this.callbacks.onProgress?.('Generating BVH...')
      console.log('[PathTracerDemo] 🔄 Setting scene on path tracer...')

      // Find and modify ground plane materials to apply roughness
      // Ground planes are typically PlaneGeometry meshes positioned below objects
      // CRITICAL: Must be called BEFORE setScene() so BVH uses modified materials
      console.log('[PathTracerDemo] 🔄 Applying ground roughness BEFORE setScene()...')
      this.applyGroundRoughness()
      console.log('[PathTracerDemo] ✅ Ground roughness applied, proceeding with setScene()...')

      // CRITICAL: Convert GroundedSkybox material to PBR for path tracer shadow support
      // GroundedSkybox uses MeshBasicMaterial which doesn't work well with path tracers
      // Convert to MeshStandardMaterial that can receive shadows from the HDR lower hemisphere
      const groundedSkyboxes: Array<{ obj: THREE.Object3D; wasVisible: boolean; originalMaterial?: THREE.Material }> = []
      const convertedSkyboxes: Array<{ obj: THREE.Mesh; originalMaterial: THREE.Material; newMaterial: THREE.MeshStandardMaterial }> = []
      
      // CRITICAL: Hide shadow plane during path tracing - it's not needed (HDR handles ground lighting)
      // Shadow plane is a viewer-specific feature for shadow visualization, path tracer uses HDR environment
      // Store original properties for proper restoration
      const shadowPlanes: Array<{ 
        obj: THREE.Object3D
        wasVisible: boolean
        originalReceiveShadow?: boolean
        originalCastShadow?: boolean
        originalMaterial?: THREE.Material
        originalMaterialProps?: {
          opacity?: number
          transparent?: boolean
          color?: THREE.Color
          depthWrite?: boolean
          visible?: boolean
        }
        originalPosition?: THREE.Vector3
        originalRotation?: THREE.Euler
        originalScale?: THREE.Vector3
      }> = []
      
      // Search for shadow plane and hide it
      this.scene.traverse((obj) => {
        const isShadowPlane = obj.userData?.isShadowPlane === true || obj.name === 'Shadow Plane'
        if (isShadowPlane && obj instanceof THREE.Mesh) {
          const wasVisible = obj.visible
          const originalReceiveShadow = obj.receiveShadow
          const originalCastShadow = obj.castShadow
          const originalMaterial = Array.isArray(obj.material) ? obj.material[0] : obj.material
          // CRITICAL: Save original transform to restore exactly
          const originalPosition = obj.position.clone()
          const originalRotation = obj.rotation.clone()
          const originalScale = obj.scale.clone()
          
          // CRITICAL: Save original material properties for complete restoration
          const originalMaterialProps = originalMaterial instanceof THREE.Material ? {
            opacity: (originalMaterial as any).opacity,
            transparent: (originalMaterial as any).transparent,
            color: (originalMaterial as any).color ? (originalMaterial as any).color.clone() : undefined,
            depthWrite: (originalMaterial as any).depthWrite,
            visible: (originalMaterial as any).visible
          } : undefined
          
          obj.visible = false // Hide shadow plane during path tracing
          shadowPlanes.push({ 
            obj, 
            wasVisible,
            originalReceiveShadow,
            originalCastShadow,
            originalMaterial: originalMaterial instanceof THREE.Material ? originalMaterial : undefined,
            originalMaterialProps,
            originalPosition,
            originalRotation,
            originalScale
          })
          const material = Array.isArray(obj.material) ? obj.material[0] : obj.material
          console.log('[PathTracerDemo] 🔍 Hiding shadow plane during path tracing:', {
            name: obj.name || 'Unnamed',
            uuid: obj.uuid,
            wasVisible,
            nowVisible: false,
            originalReceiveShadow,
            originalCastShadow,
            originalPosition: { x: originalPosition.x, y: originalPosition.y, z: originalPosition.z },
            originalRotation: { x: originalRotation.x, y: originalRotation.y, z: originalRotation.z },
            originalScale: { x: originalScale.x, y: originalScale.y, z: originalScale.z },
            material: material ? {
              type: material.constructor?.name,
              uuid: material.uuid,
              transparent: (material as any).transparent,
              opacity: (material as any).opacity
            } : null,
            inScene: obj.parent === this.scene || (obj.parent && this.scene.children.includes(obj.parent as any)),
            reason: 'Shadow plane not needed in path tracer - HDR environment handles ground lighting'
          })
        }
      })
      
      // Store shadow planes for restoration later
      ;(this as any)._hiddenShadowPlanes = shadowPlanes
      
      // CRITICAL: Search for GroundedSkybox objects in the scene
      // Based on Perplexity research: Path tracers need GroundedSkybox included in BVH for ground projection shadows
      // GroundedSkybox must be:
      // 1. Visible (obj.visible = true)
      // 2. Have PBR material (MeshStandardMaterial) with receiveShadow = true
      // 3. Have adequate opacity (0.6-0.8) for path tracer shadow computation
      // 4. Have directional lights with castShadow = true for shadows to appear
      // Search for GroundedSkybox objects in the scene
      this.scene.traverse((obj) => {
        const isGroundedSkybox = 
          obj.userData?.isGroundedSkybox === true ||
          (obj as any).isGroundedSkybox === true ||
          obj.type === 'GroundedSkybox' ||
          (obj instanceof THREE.Mesh && 
           obj.material instanceof THREE.MeshBasicMaterial && 
           obj.geometry instanceof THREE.SphereGeometry &&
           obj.geometry.parameters.radius > 50) // GroundedSkybox typically has large radius
        
        if (isGroundedSkybox && obj instanceof THREE.Mesh) {
          const wasVisible = obj.visible
          const originalMaterial = obj.material instanceof THREE.Material ? obj.material : (Array.isArray(obj.material) ? obj.material[0] : null)
          
          groundedSkyboxes.push({ obj, wasVisible, originalMaterial: originalMaterial || undefined })
          
          if (this.config.excludeGroundedSkybox) {
            // Hide GroundedSkybox completely (original behavior)
            obj.visible = false
            console.log('[PathTracerDemo] 🔍 Excluding GroundedSkybox from path tracing:', {
              name: obj.name || 'Unnamed',
              type: obj.type,
              wasVisible,
              nowVisible: false,
              position: { x: obj.position.x.toFixed(2), y: obj.position.y.toFixed(2), z: obj.position.z.toFixed(2) },
              radius: obj.geometry instanceof THREE.SphereGeometry 
                ? obj.geometry.parameters.radius 
                : 'N/A'
            })
          } else {
            // Convert GroundedSkybox material to PBR for path tracer shadow support
            // The lower hemisphere will act as a shadow-receiving surface
            // Only convert if GroundedSkybox is visible (ground projection is enabled)
            if (originalMaterial && obj.material && obj.visible) {
              try {
                console.log('[PathTracerDemo] 🔄 Converting GroundedSkybox material to PBR for path tracer shadow support:', {
                  name: obj.name || 'Unnamed',
                  originalMaterialType: originalMaterial.constructor?.name,
                  hasMap: !!(originalMaterial as any).map,
                  hasEnvMap: !!(originalMaterial as any).envMap,
                  isVisible: obj.visible
                })
                
                // Create PBR material that can receive shadows
                // Use the same texture map from GroundedSkybox (HDR lower hemisphere)
                // Try both map and envMap properties (GroundedSkybox might use either)
                const textureMap = (originalMaterial as any).map || (originalMaterial as any).envMap || null
                
                // If no texture map, create a default gray material (safety fallback)
                if (!textureMap) {
                  console.warn('[PathTracerDemo] ⚠️ GroundedSkybox material has no texture map, using default gray material')
                }
                
                // CRITICAL FIX: Ground projection should NOT be transparent - it should be opaque or nearly opaque
                // The user reported that ground projection appears transparent, which is incorrect
                // Ground projection should show the HDR ground surface clearly, not be see-through
                // Path tracers compute shadows via ray tracing - material needs adequate opacity to block light and show shadows
                // Based on Perplexity research and user feedback: ground projection should be opaque (0.9-1.0) for clear visibility
                // CRITICAL: Increase opacity to make ground projection visible and not transparent
                // Previous range (0.6-0.9) was too transparent - user sees it as transparent
                // New range (0.85-1.0) ensures ground projection is clearly visible while still allowing some light transmission
                const groundOpacity = Math.max(0.85, Math.min(1.0, this.config.groundOpacity || 0.95)) // Clamp to 0.85-1.0 for visible ground
                const newMaterial = new THREE.MeshStandardMaterial({
                  map: textureMap, // Use same HDR texture from GroundedSkybox (lower hemisphere)
                  roughness: this.config.groundRoughness, // Configurable roughness for matte appearance
                  metalness: this.config.groundMetalness, // Configurable metalness (default: 0.0 = pure diffuse)
                  side: THREE.DoubleSide,
                  transparent: groundOpacity < 1.0, // Transparent if opacity < 1.0
                  opacity: groundOpacity, // Clamped opacity for reliable path tracer shadow computation
                  depthWrite: true, // Write to depth buffer for proper shadow computation
                  color: textureMap ? 0xffffff : 0x888888, // White if texture exists, gray if not
                })
                
                // Mark as converted
                if (!newMaterial.userData) newMaterial.userData = {}
                newMaterial.userData.pathTracerModified = true
                newMaterial.userData.wasGroundedSkyboxMaterial = true
                newMaterial.userData.originalMaterial = originalMaterial
                
                // Replace material
                obj.material = newMaterial
                
                // CRITICAL: Enable shadow receiving on GroundedSkybox lower hemisphere
                obj.receiveShadow = true
                obj.castShadow = false
                
                // Ensure it's visible for path tracer
                obj.visible = true
                
                convertedSkyboxes.push({ obj, originalMaterial, newMaterial })
                newMaterial.needsUpdate = true
                
                // Log ground position and scene info for debugging
                const groundY = obj.position.y
                const sceneBounds = this.scene.children
                  .filter(child => child !== obj && !child.userData.isGroundedSkybox)
                  .map(child => {
                    const box = new THREE.Box3().setFromObject(child)
                    return { 
                      name: child.name || 'Unnamed', 
                      minY: box.min.y, 
                      maxY: box.max.y,
                      centerY: (box.min.y + box.max.y) / 2 
                    }
                  })
                  .filter(bounds => !isNaN(bounds.minY) && !isNaN(bounds.maxY))
                
                // CRITICAL: Verify shadow-casting lights exist for ground projection shadows
                let shadowCastingLightCount = 0
                this.scene.traverse((light) => {
                  if (light instanceof THREE.DirectionalLight && light.castShadow) {
                    shadowCastingLightCount++
                  }
                })
                
                console.log('[PathTracerDemo] ✅ Converted GroundedSkybox material to PBR for path tracer:', {
                  name: obj.name || 'Unnamed',
                  originalMaterialType: originalMaterial.constructor?.name,
                  newMaterialType: newMaterial.constructor?.name,
                  hasMap: !!newMaterial.map,
                  roughness: newMaterial.roughness.toFixed(2),
                  opacity: newMaterial.opacity.toFixed(2),
                  receiveShadow: obj.receiveShadow,
                  visible: obj.visible,
                  groundPosition: { x: obj.position.x, y: groundY, z: obj.position.z },
                  sceneObjectsAboveGround: sceneBounds.filter(b => b.minY > groundY),
                  sceneObjectsBelowGround: sceneBounds.filter(b => b.maxY < groundY),
                  sceneObjectsOnGround: sceneBounds.filter(b => b.minY <= groundY && b.maxY >= groundY),
                  shadowCastingLights: shadowCastingLightCount,
                  note: 'Lower hemisphere of HDR will act as shadow-receiving surface in path tracer',
                  warning: sceneBounds.some(b => b.maxY < groundY) 
                    ? '⚠️ Some objects are below ground - shadows may not be visible!' 
                    : shadowCastingLightCount === 0
                    ? '⚠️ No shadow-casting lights found - shadows may not appear on ground projection!'
                    : undefined
                })
                
                if (shadowCastingLightCount === 0) {
                  console.warn('[PathTracerDemo] ⚠️ Ground projection shadows require directional lights with castShadow = true')
                  console.warn('[PathTracerDemo] 💡 Path tracers compute shadows via ray tracing - lights must have castShadow = true')
                }
              } catch (error) {
                console.error('[PathTracerDemo] ❌ Error converting GroundedSkybox material:', error)
                console.error('[PathTracerDemo] Error details:', {
                  message: error instanceof Error ? error.message : String(error),
                  stack: error instanceof Error ? error.stack : undefined,
                  name: obj.name || 'Unnamed',
                  originalMaterialType: originalMaterial.constructor?.name
                })
                // Don't throw - continue without conversion
              }
            }
          }
        }
      })
      
      if (groundedSkyboxes.length === 0) {
        console.log('[PathTracerDemo] ℹ️ No GroundedSkybox found in scene (this is OK)')
      } else {
        if (this.config.excludeGroundedSkybox) {
          console.log('[PathTracerDemo] 📝 Excluded GroundedSkybox objects from path tracing:', groundedSkyboxes.length)
        } else {
          console.log('[PathTracerDemo] 📝 Converted GroundedSkybox materials to PBR for path tracer shadow support:', convertedSkyboxes.length)
          
          // CRITICAL: Verify GroundedSkybox is properly configured for shadows
          convertedSkyboxes.forEach(({ obj, newMaterial }, index) => {
            const issues: string[] = []
            if (!obj.visible) issues.push('GroundedSkybox is not visible')
            if (!obj.receiveShadow) issues.push('receiveShadow is false')
            if (obj.castShadow) issues.push('castShadow should be false (only receive shadows)')
            if (!(newMaterial instanceof THREE.MeshStandardMaterial)) issues.push('Material is not MeshStandardMaterial')
            if (newMaterial.opacity < 0.6) issues.push(`Opacity too low (${newMaterial.opacity.toFixed(2)}) - path tracers need >= 0.6 for reliable shadows`)
            if (!newMaterial.depthWrite) issues.push('depthWrite is false - may affect shadow computation')
            
            if (issues.length > 0) {
              console.warn(`[PathTracerDemo] ⚠️ GroundedSkybox ${index + 1} configuration issues:`, issues)
            } else {
              console.log(`[PathTracerDemo] ✅ GroundedSkybox ${index + 1} properly configured for path tracer shadows:`, {
                name: obj.name || 'Unnamed',
                visible: obj.visible,
                receiveShadow: obj.receiveShadow,
                castShadow: obj.castShadow,
                materialType: newMaterial.constructor?.name,
                opacity: newMaterial.opacity.toFixed(2),
                roughness: newMaterial.roughness.toFixed(2),
                depthWrite: newMaterial.depthWrite,
                hasMap: !!newMaterial.map
              })
            }
          })
        }
      }
      
      // Store converted materials for restoration
      if (convertedSkyboxes.length > 0) {
        ;(this as any)._convertedSkyboxMaterials = convertedSkyboxes
      }
      
      // Store hidden GroundedSkyboxes for restoration
      if (groundedSkyboxes.length > 0 && this.config.excludeGroundedSkybox) {
        ;(this as any)._hiddenGroundedSkyboxes = groundedSkyboxes.map(({ obj, wasVisible }) => ({ obj, wasVisible }))
      }

      // Validate scene and camera before setting
      if (!this.scene) {
        throw new Error('Scene is undefined')
      }
      if (!this.camera) {
        throw new Error('Camera is undefined')
      }
      
      // Validate scene structure
      if (!Array.isArray(this.scene.children)) {
        throw new Error('Scene.children is not an array')
      }
      
      // Validate camera properties that might be accessed with [0]
      if (!this.camera.position || typeof this.camera.position.x !== 'number') {
        throw new Error('Camera position is invalid')
      }
      if (!this.camera.rotation || typeof this.camera.rotation.x !== 'number') {
        throw new Error('Camera rotation is invalid')
      }
      
      // Ensure scene has children (objects) before setting
      if (this.scene.children.length === 0) {
        console.warn('[PathTracerDemo] ⚠️ Scene has no children - path tracer may not work correctly')
      }
      
      // CRITICAL: Ensure scene has a valid environment map before setScene()
      // WebGLPathTracer.updateEnvironment() (called during setScene) expects environment to have data
      // The EquirectHdrInfoUniform.updateFrom() tries to access environment texture data which must exist
      // If no HDR environment is set, we need to set a default one first
      // IMPORTANT: We always set up the environment, even if HDR exists, to ensure it has proper data structure
      console.log('[PathTracerDemo] 🔄 Setting up environment before setScene()', {
        hasSceneEnvironment: !!this.scene.environment,
        environmentIsGradient: this.scene.environment === this.gradientMap
      })
      
      // Always call setupEnvironment - it checks if HDR exists and uses it, or creates gradient fallback
      this.setupEnvironment()
      
      // Verify environment was set correctly
      if (!this.scene.environment) {
        throw new Error('Environment setup failed - scene.environment is still undefined')
      }
      
      // Verify environment has required data structure
      const envTexture = this.scene.environment
      if (!envTexture) {
        throw new Error('Environment texture is null')
      }
      
      // Log environment details for debugging
      console.log('[PathTracerDemo] ✅ Environment prepared:', {
        hasEnvironment: !!this.scene.environment,
        environmentType: this.scene.environment?.constructor?.name,
        isGradient: this.scene.environment === this.gradientMap,
        hasImage: !!(this.scene.environment as any)?.image,
        hasData: !!(this.scene.environment as any)?.data,
        width: (this.scene.environment as any)?.image?.width || (this.scene.environment as any)?.width,
        height: (this.scene.environment as any)?.image?.height || (this.scene.environment as any)?.height
      })
      
      // Verify ground plane is in scene and visible for BVH (path tracer needs it for shadows)
      let shadowPlaneCount = 0
      const shadowPlaneInfo: any[] = []
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && (obj.userData?.isShadowPlane === true || obj.name === 'Shadow Plane')) {
          shadowPlaneCount++
          const material = Array.isArray(obj.material) ? obj.material[0] : obj.material
          shadowPlaneInfo.push({
            name: obj.name || 'Unnamed',
            visible: obj.visible,
            receiveShadow: obj.receiveShadow,
            castShadow: obj.castShadow,
            materialType: material?.constructor?.name || 'unknown',
            opacity: (material as any)?.opacity ?? 'unknown',
            position: { x: obj.position.x.toFixed(2), y: obj.position.y.toFixed(2), z: obj.position.z.toFixed(2) },
            inScene: obj.parent === this.scene || (obj.parent && this.scene.children.includes(obj.parent as any))
          })
        }
      })
      
      console.log('[PathTracerDemo] 🔍 Shadow plane verification before setScene:', {
        shadowPlaneCount,
        shadowPlaneInfo: shadowPlaneInfo.length > 0 ? shadowPlaneInfo : 'No shadow plane found'
      })
      
      // Log detailed scene structure for debugging
      console.log('[PathTracerDemo] 🔍 Scene structure before setScene:', {
        sceneChildren: this.scene.children.length,
        hasCamera: !!this.camera,
        cameraType: this.camera?.constructor?.name,
        cameraPosition: this.camera?.position ? { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z } : null,
        hasRenderer: !!this.renderer,
        rendererType: this.renderer?.constructor?.name,
        sceneType: this.scene?.constructor?.name,
        sceneBackground: !!this.scene.background,
        sceneEnvironment: !!this.scene.environment,
        environmentType: this.scene.environment?.constructor?.name,
        environmentIsGradient: this.scene.environment === this.gradientMap,
        shadowPlaneCount
      })
      
      // Set scene on path tracer with detailed error handling
      try {
        // Ensure path tracer exists
        if (!this.pathTracer) {
          throw new Error('Path tracer instance is undefined')
        }
        
        // Check if setScene method exists
        if (typeof this.pathTracer.setScene !== 'function') {
          throw new Error('Path tracer setScene method is not a function')
        }
        
        console.log('[PathTracerDemo] 🔄 Calling setScene...')
      this.pathTracer.setScene(this.scene, this.camera)
        console.log('[PathTracerDemo] ✅ Scene set successfully', {
          sceneChildren: this.scene.children.length,
          hasCamera: !!this.camera
        })
      } catch (error) {
        console.error('[PathTracerDemo] ❌ Error setting scene:', error)
        console.error('[PathTracerDemo] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          errorType: error?.constructor?.name,
          sceneChildren: this.scene?.children?.length ?? 'N/A',
          hasCamera: !!this.camera,
          hasPathTracer: !!this.pathTracer,
          pathTracerType: this.pathTracer?.constructor?.name ?? 'N/A',
          sceneEnvironment: !!this.scene?.environment,
          environmentType: this.scene?.environment?.constructor?.name ?? 'N/A'
        })
        throw new Error(`Failed to set scene: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Note: Environment is already set before setScene() to prevent undefined access errors
      // Now update the path tracer to use the current environment (which could be HDR or gradient)
      // Wait a frame to ensure HDR has finished loading if it's in progress
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      // Update environment on path tracer (it may have changed if HDR loaded)
      if (this.scene.environment && this.scene.environment !== this.gradientMap) {
        console.log('[PathTracerDemo] 🔄 Updating path tracer environment to use HDR', {
          hasEnvironment: !!this.scene.environment,
          isGradientMap: this.scene.environment === this.gradientMap,
          environmentType: this.scene.environment?.constructor?.name
        })
        try {
      this.pathTracer.updateEnvironment()
        } catch (error) {
          console.error('[PathTracerDemo] ❌ Error updating environment to use HDR:', error)
          // Don't throw - environment might have been set during setScene already
          console.warn('[PathTracerDemo] ⚠️ Continuing despite environment update error')
        }
      } else {
        // Using gradient fallback (already set before setScene)
        console.log('[PathTracerDemo] Using gradient fallback environment', {
          hasEnvironment: !!this.scene.environment,
          environmentType: this.scene.environment?.constructor?.name
        })
        try {
          // Environment should already be set, but update to be sure
          this.pathTracer.updateEnvironment()
        } catch (error) {
          console.error('[PathTracerDemo] ❌ Error updating environment with gradient:', error)
          // Don't throw - environment might have been set during setScene already
          console.warn('[PathTracerDemo] ⚠️ Continuing despite environment update error')
        }
      }
      
      // Note: GroundedSkybox references are already stored above (lines 962-967)
      // _convertedSkyboxMaterials for converted materials
      // _hiddenGroundedSkyboxes for hidden skyboxes (only if excludeGroundedSkybox is true)
      
      // CRITICAL: Patch shader code directly after setScene (material is now fully initialized)
      // Access material via _pathTracer.material (internal structure based on WebGLPathTracer source)
      const pathTracingMaterial = (this.pathTracer as any)._pathTracer?.material
      if (pathTracingMaterial && pathTracingMaterial.fragmentShader && !pathTracingMaterial.userData?._shaderPatched) {
        console.log('[PathTracerDemo] 🔍 Material found, patching fragmentShader directly...', {
          materialType: pathTracingMaterial.constructor?.name,
          hasFragmentShader: !!pathTracingMaterial.fragmentShader,
          fragmentShaderLength: pathTracingMaterial.fragmentShader?.length || 0
        })
        
        let patched = false
        const originalFragmentShader = pathTracingMaterial.fragmentShader
        
        // Pattern to match the problematic line: vec2 xi = rand2( 100u + uint( sampleIndex ) );
        const problematicPattern = /vec2\s+xi\s*=\s*rand2\s*\(\s*100u\s*\+\s*uint\s*\(\s*sampleIndex\s*\)\s*\)\s*;/g
        if (problematicPattern.test(pathTracingMaterial.fragmentShader)) {
          console.log('[PathTracerDemo] 🔧 Found problematic rand2() call, patching...')
          pathTracingMaterial.fragmentShader = pathTracingMaterial.fragmentShader.replace(
            problematicPattern,
            `#if RANDOM_TYPE == 0
									vec2 xi = vec2( pcgRand(), pcgRand() );
								#elif RANDOM_TYPE == 1
									vec2 xi = sobol2( 100 + sampleIndex );
								#elif RANDOM_TYPE == 2
									vec2 xi = vec2( rand( 100 + sampleIndex ), rand( 101 + sampleIndex ) );
								#else
									vec2 xi = vec2( rand( 0 ), rand( 1 ) );
								#endif`
          )
          patched = true
        }
        
        // Also patch rand2(2) in sampleBackground
        const backgroundPattern = /sampleBackground\s*\(\s*ray\.direction\s*,\s*rand2\s*\(\s*2\s*\)\s*\)/g
        if (backgroundPattern.test(pathTracingMaterial.fragmentShader)) {
          console.log('[PathTracerDemo] 🔧 Patching rand2(2) call in sampleBackground')
          pathTracingMaterial.fragmentShader = pathTracingMaterial.fragmentShader.replace(
            backgroundPattern,
            (match: string) => {
              return match.replace(
                /rand2\s*\(\s*2\s*\)/,
                `(
								#if RANDOM_TYPE == 0
									pcgRand2()
								#elif RANDOM_TYPE == 1
									sobol2( 2 )
								#elif RANDOM_TYPE == 2
									rand2( 2 )
								#else
									rand2( 2 )
								#endif
							)`
              )
            }
          )
          patched = true
        }
        
        if (patched) {
          console.log('[PathTracerDemo] ✅ Fragment shader patched successfully')
          pathTracingMaterial.needsUpdate = true
          if (!pathTracingMaterial.userData) pathTracingMaterial.userData = {}
          pathTracingMaterial.userData._shaderPatched = true
        } else {
          console.warn('[PathTracerDemo] ⚠️ No problematic patterns found in fragment shader')
        }
      } else {
        console.warn('[PathTracerDemo] ⚠️ Material not found or already patched:', {
          hasMaterial: !!pathTracingMaterial,
          hasFragmentShader: !!pathTracingMaterial?.fragmentShader,
          alreadyPatched: !!pathTracingMaterial?.userData?._shaderPatched
        })
      }
      
      // Note: updateEnvironment() is already called above (in the HDR check)
      // Don't call it again here to avoid duplicate calls
      
      // Verify lights are configured for shadows before updating
      let lightCount = 0
      let shadowCastingLightCount = 0
      const lightInfo: any[] = []
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Light) {
          lightCount++
          const isShadowCasting = (obj as any).castShadow === true
          if (isShadowCasting) shadowCastingLightCount++
          lightInfo.push({
            type: obj.constructor?.name || 'Unknown',
            name: obj.name || 'Unnamed',
            castShadow: isShadowCasting,
            visible: obj.visible,
            intensity: (obj as any).intensity || 'N/A',
            position: obj.position ? { x: obj.position.x.toFixed(2), y: obj.position.y.toFixed(2), z: obj.position.z.toFixed(2) } : 'N/A'
          })
        }
      })
      
      // Log detailed light information
      console.log('[PathTracerDemo] 🔍 Light verification before updateLights():')
      console.log(`  Total lights: ${lightCount}`)
      console.log(`  Shadow casting lights: ${shadowCastingLightCount}`)
      if (lightInfo.length > 0) {
        console.log('  Light details:')
        lightInfo.forEach((light, index) => {
          console.log(`    Light ${index + 1}:`, {
            type: light.type,
            name: light.name,
            castShadow: light.castShadow,
            visible: light.visible,
            intensity: light.intensity,
            position: light.position
          })
        })
      } else {
        console.log('  No lights found in scene')
      }
      
      // CRITICAL FIX: Ensure at least one directional light casts shadows for ground projection shadows
      // Based on Perplexity research: Path tracers need explicit directional lights with castShadow = true
      // Environment maps (HDR) provide ambient lighting but don't cast direct shadows
      // Ground projection shadows require directional lights with shadows enabled
      if (shadowCastingLightCount === 0 && lightCount > 0) {
        console.warn('[PathTracerDemo] ⚠️ No lights are casting shadows - shadows may not appear in path tracer')
        console.warn('[PathTracerDemo] 💡 Path tracers need lights with castShadow = true to compute shadows')
        console.warn('[PathTracerDemo] 💡 HDR ground projection shadows require directional lights with castShadow = true')
        
        // Auto-fix: Enable shadows on first directional light if available
        let fixed = false
        this.scene.traverse((obj) => {
          if (!fixed && obj instanceof THREE.DirectionalLight) {
            // Enable shadows even if already enabled (to ensure proper configuration)
            obj.castShadow = true
            if (obj.shadow) {
              // CRITICAL: Configure shadow camera to cover ground projection area
              // Path tracers need shadow cameras with adequate bounds to cover the entire scene including ground
              obj.shadow.mapSize.width = 2048
              obj.shadow.mapSize.height = 2048
              obj.shadow.camera.near = 0.001 // Small near plane for interior shadows (matches standard mode)
              obj.shadow.camera.far = 200
              // Expand shadow camera bounds to ensure ground projection is covered
              // Calculate bounds based on scene size if available
              const sceneBox = new THREE.Box3()
              this.scene.traverse((child) => {
                if (child instanceof THREE.Mesh && !child.userData?.isGroundedSkybox) {
                  sceneBox.expandByObject(child)
                }
              })
              const sceneSize = sceneBox.getSize(new THREE.Vector3())
              const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z)
              const shadowSize = Math.max(maxDim * 2, 100) // At least 2x scene size, minimum 100
              obj.shadow.camera.left = -shadowSize
              obj.shadow.camera.right = shadowSize
              obj.shadow.camera.top = shadowSize
              obj.shadow.camera.bottom = -shadowSize
              obj.shadow.camera.updateMatrixWorld(true)
            }
            console.log('[PathTracerDemo] ✅ Auto-enabled shadows on directional light:', {
              name: obj.name || 'Unnamed',
              shadowMapSize: obj.shadow ? `${obj.shadow.mapSize.width}x${obj.shadow.mapSize.height}` : 'N/A',
              shadowBounds: obj.shadow ? {
                left: obj.shadow.camera.left.toFixed(2),
                right: obj.shadow.camera.right.toFixed(2),
                top: obj.shadow.camera.top.toFixed(2),
                bottom: obj.shadow.camera.bottom.toFixed(2),
                near: obj.shadow.camera.near.toFixed(4),
                far: obj.shadow.camera.far.toFixed(2)
              } : 'N/A'
            })
            fixed = true
          }
        })
        
        // If still no shadow-casting lights, create a default sun light
        if (!fixed) {
          console.log('[PathTracerDemo] 💡 Creating default directional light with shadows for path tracer')
          const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
          sunLight.position.set(5, 10, 5)
          sunLight.castShadow = true
          sunLight.shadow.mapSize.width = 2048
          sunLight.shadow.mapSize.height = 2048
          sunLight.shadow.camera.near = 0.001 // Small near plane for interior shadows
          sunLight.shadow.camera.far = 200
          // Calculate shadow camera bounds based on scene size
          const sceneBox = new THREE.Box3()
          this.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && !child.userData?.isGroundedSkybox) {
              sceneBox.expandByObject(child)
            }
          })
          const sceneSize = sceneBox.getSize(new THREE.Vector3())
          const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z)
          const shadowSize = Math.max(maxDim * 2, 100) // At least 2x scene size, minimum 100
          sunLight.shadow.camera.left = -shadowSize
          sunLight.shadow.camera.right = shadowSize
          sunLight.shadow.camera.top = shadowSize
          sunLight.shadow.camera.bottom = -shadowSize
          sunLight.name = 'Path Tracer Sun Light'
          sunLight.userData.pathTracerCreated = true
          this.scene.add(sunLight)
          sunLight.shadow.camera.updateMatrixWorld(true)
          console.log('[PathTracerDemo] ✅ Created default sun light with shadows:', {
            shadowMapSize: `${sunLight.shadow.mapSize.width}x${sunLight.shadow.mapSize.height}`,
            shadowBounds: {
              left: sunLight.shadow.camera.left.toFixed(2),
              right: sunLight.shadow.camera.right.toFixed(2),
              top: sunLight.shadow.camera.top.toFixed(2),
              bottom: sunLight.shadow.camera.bottom.toFixed(2),
              near: sunLight.shadow.camera.near.toFixed(4),
              far: sunLight.shadow.camera.far.toFixed(2)
            }
          })
        }
      } else if (shadowCastingLightCount > 0) {
        // CRITICAL: Ensure existing shadow-casting lights have proper shadow camera configuration
        // This ensures ground projection shadows are visible even if lights were already configured
        this.scene.traverse((obj) => {
          if (obj instanceof THREE.DirectionalLight && obj.castShadow && obj.shadow) {
            // Ensure shadow camera near plane is small enough for interior shadows
            if (obj.shadow.camera.near > 0.001) {
              obj.shadow.camera.near = 0.001
              console.log('[PathTracerDemo] ✅ Updated shadow camera near plane for interior shadows:', obj.name || 'Unnamed')
            }
            // Ensure shadow camera bounds cover the scene including ground projection
            const sceneBox = new THREE.Box3()
            this.scene.traverse((child) => {
              if (child instanceof THREE.Mesh && !child.userData?.isGroundedSkybox) {
                sceneBox.expandByObject(child)
              }
            })
            if (!sceneBox.isEmpty()) {
              const sceneSize = sceneBox.getSize(new THREE.Vector3())
              const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z)
              const currentShadowSize = Math.max(
                Math.abs(obj.shadow.camera.right - obj.shadow.camera.left),
                Math.abs(obj.shadow.camera.top - obj.shadow.camera.bottom)
              ) / 2
              const requiredShadowSize = Math.max(maxDim * 2, 100)
              if (currentShadowSize < requiredShadowSize) {
                obj.shadow.camera.left = -requiredShadowSize
                obj.shadow.camera.right = requiredShadowSize
                obj.shadow.camera.top = requiredShadowSize
                obj.shadow.camera.bottom = -requiredShadowSize
                obj.shadow.camera.updateMatrixWorld(true)
                console.log('[PathTracerDemo] ✅ Expanded shadow camera bounds for ground projection:', {
                  name: obj.name || 'Unnamed',
                  oldSize: currentShadowSize.toFixed(2),
                  newSize: requiredShadowSize.toFixed(2),
                  bounds: {
                    left: obj.shadow.camera.left.toFixed(2),
                    right: obj.shadow.camera.right.toFixed(2),
                    top: obj.shadow.camera.top.toFixed(2),
                    bottom: obj.shadow.camera.bottom.toFixed(2)
                  }
                })
              }
            }
          }
        })
      }
      
      // Update lights and materials with error handling
      try {
      this.pathTracer.updateLights()
        console.log('[PathTracerDemo] ✅ Lights updated')
      } catch (error) {
        console.error('[PathTracerDemo] ❌ Error updating lights:', error)
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[PathTracerDemo] Error details:', {
          message: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
          error
        })
        throw new Error(`Failed to update lights: ${errorMsg}`)
      }
      
      try {
        // CRITICAL: updateMaterials() syncs material properties to path tracer's internal state
        // This must be called AFTER applyGroundRoughness() and AFTER setScene()
        // Verify ground plane materials before update
        console.log('[PathTracerDemo] 🔍 Verifying ground plane materials before updateMaterials()...')
        this.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.userData?.isShadowPlane === true) {
            const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
            if (mat instanceof THREE.MeshStandardMaterial) {
              console.log('[PathTracerDemo] 🔍 Ground plane material state before updateMaterials():', {
                name: obj.name || 'Unnamed',
                materialType: mat.constructor?.name,
                roughness: mat.roughness.toFixed(3),
                metalness: mat.metalness.toFixed(3),
                opacity: mat.opacity.toFixed(3),
                color: `#${mat.color.getHexString()}`,
                needsUpdate: mat.needsUpdate,
                pathTracerModified: mat.userData?.pathTracerModified || false
              })
            }
          }
        })
        
      this.pathTracer.updateMaterials()
        console.log('[PathTracerDemo] ✅ Materials updated')
      } catch (error) {
        console.error('[PathTracerDemo] ❌ Error updating materials:', error)
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[PathTracerDemo] Error details:', {
          message: errorMsg,
          stack: error instanceof Error ? error.stack : undefined,
          error
        })
        throw new Error(`Failed to update materials: ${errorMsg}`)
      }

      // Wait for BVH to build and shaders to compile
      // WebGLPathTracer compiles shaders lazily on first renderSample() call
      // We need to trigger compilation and wait for it to complete
      console.log('[PathTracerDemo] 🔄 Waiting for BVH and shader compilation...')
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      // Trigger shader compilation by rendering a sample
      // This may produce warnings but is necessary to compile shaders
      // Reuse the gl context from earlier check
      if (gl) {
        let shaderCompilationAttempts = 0
        const maxAttempts = 10
        
        console.log('[PathTracerDemo] 🔄 Triggering shader compilation...')
        
        // Try to compile shaders with retries
        while (shaderCompilationAttempts < maxAttempts) {
          try {
            // Clear any previous errors
            gl.getError()
            
            // Set render target to null to ensure we're rendering to canvas
            this.renderer.setRenderTarget(null)
            
            // Render one sample to trigger shader compilation
            // This may throw warnings but is necessary
            console.log(`[PathTracerDemo] 🔄 Attempt ${shaderCompilationAttempts + 1}/${maxAttempts}: Rendering sample...`)
            this.pathTracer.renderSample()
            
            // Wait a frame for shaders to compile
            await new Promise(resolve => requestAnimationFrame(resolve))
            
            // Check if shaders compiled successfully
            const error = gl.getError()
            if (error === gl.NO_ERROR || error === gl.CONTEXT_LOST_WEBGL) {
              // Shaders compiled successfully
              console.log('[PathTracerDemo] ✅ Shaders compiled successfully')
              break
            } else {
              console.warn(`[PathTracerDemo] ⚠️ WebGL error after render (attempt ${shaderCompilationAttempts + 1}):`, error)
            }
            
            shaderCompilationAttempts++
            if (shaderCompilationAttempts < maxAttempts) {
              // Wait a bit longer and retry
              await new Promise(resolve => setTimeout(resolve, 50))
            }
          } catch (initError) {
            // Shader compilation errors are expected during initialization
            // WebGLPathTracer compiles shaders lazily, so errors are normal
            const errorMsg = initError instanceof Error ? initError.message : String(initError)
            console.warn(`[PathTracerDemo] ⚠️ Shader compilation attempt ${shaderCompilationAttempts + 1} failed (may be normal):`, errorMsg)
            
            shaderCompilationAttempts++
            if (shaderCompilationAttempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 50))
            } else {
              console.warn('[PathTracerDemo] ⚠️ Shader compilation took multiple attempts (this is normal)')
            }
          }
        }
        
        // Check final state
        const finalError = gl.getError()
        const hasTarget = !!this.pathTracer.target
        const hasTexture = !!this.pathTracer.target?.texture
        
        console.log('[PathTracerDemo] 📊 Initialization state:', {
          attempts: shaderCompilationAttempts,
          finalWebGLError: finalError,
          hasTarget,
          hasTexture,
          sampleCount: this.getSampleCount()
        })
        
        // Wait one more frame to ensure everything is ready
        await new Promise(resolve => requestAnimationFrame(resolve))
      }

      // CRITICAL: Hide all helpers and gizmos right before initialization completes
      // This ensures gizmos are hidden before the first render frame
      this.hideAllHelpersAndGizmos()
      console.log('[PathTracerDemo] 🔒 Hid all helpers and gizmos during initialization')

      this.callbacks.onProgress?.('Path tracer ready')
      console.log('[PathTracerDemo] ✅ Initialization complete!')
      this.callbacks.onReady?.()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('[PathTracerDemo] ❌ Initialization error:', err)
      console.error('[PathTracerDemo] Error stack:', err.stack)
      this.callbacks.onError?.(err)
      throw err
    }
  }

  /** Save transform gizmo state before path tracing hides/detaches it. */
  private captureTransformStateForRestore(): void {
    const viewer = (window as any).__viewer
    this._prePathTracerMovement = capturePathTracerMovementState(viewer)
  }

  /** Re-attach transform gizmo after path tracing stops. */
  private restoreTransformControlsAfterPathTracer(): void {
    const viewer = (window as any).__viewer
    const snapshot = this._prePathTracerMovement
    this._prePathTracerMovement = null

    if (!snapshot || !viewer?.transformControls) {
      return
    }

    schedulePathTracerMovementRestore(this.scene, viewer, snapshot)
  }

  /** Allow gizmo movement while path tracer is paused (max samples or user pause). */
  private releaseTransformInteractionForPausedViewing(): void {
    if (!this._prePathTracerMovement) return
    const viewer = (window as any).__viewer
    schedulePathTracerMovementRestore(this.scene, viewer, this._prePathTracerMovement)
  }

  private getViewerTransformControls(): THREE.Object3D | null {
    return (window as any).__viewer?.transformControls ?? null
  }

  private isTransformControlsDescendant(obj: THREE.Object3D): boolean {
    const root = this.getViewerTransformControls()
    if (!root || obj === root) return false
    let node: THREE.Object3D | null = obj
    while (node) {
      if (node === root) return true
      node = node.parent
    }
    return false
  }

  private isExcludedFromMaterialBasedHelperHide(obj: THREE.Object3D): boolean {
    const data = obj.userData
    return !!(
      data?.isShadowPlane ||
      data?.isPathTracerGroundPlane ||
      data?.isGroundedSkybox ||
      data?.isGridHelper ||
      data?.isAxesHelper ||
      data?.isNativeObjectsGroup ||
      data?.isPivotWrapper
    )
  }

  private removePathTracerTransientMeshes(): void {
    if (this.groundPlaneMesh) {
      if (this.groundPlaneMesh.parent) {
        this.groundPlaneMesh.parent.remove(this.groundPlaneMesh)
      } else {
        this.scene.remove(this.groundPlaneMesh)
      }
      this.groundPlaneMesh.geometry?.dispose()
      const materials = Array.isArray(this.groundPlaneMesh.material)
        ? this.groundPlaneMesh.material
        : [this.groundPlaneMesh.material]
      materials.forEach((mat) => {
        if (mat instanceof THREE.Material) mat.dispose()
      })
      this.groundPlaneMesh = null
    }

    const toRemove: THREE.Mesh[] = []
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData?.isPathTracerGroundPlane === true) {
        toRemove.push(obj)
      }
    })
    toRemove.forEach((obj) => {
      if (obj.parent) obj.parent.remove(obj)
      else this.scene.remove(obj)
      obj.geometry?.dispose()
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach((mat) => {
        if (mat instanceof THREE.Material) mat.dispose()
      })
    })
  }

  /**
   * Hide all helpers and gizmos in the scene
   * This is called both during initialize() and start() to ensure everything is hidden
   */
  private hideAllHelpersAndGizmos(): void {
    // Deselect once at start — not every frame (selectObject + scene traverse is expensive)
    const viewerForDeselect = (window as any).__viewer
    if (viewerForDeselect?.selectObject) {
      viewerForDeselect.selectObject(null)
    }
    try {
      const { setSelectedObject } = useAppStore.getState()
      setSelectedObject(null)
    } catch {
      // store unavailable
    }

    // CRITICAL: Hide ALL helpers and gizmos during path tracing
    // This ensures a clean path-traced render without visual clutter
    if (!this._originalHelperStates) {
      this._originalHelperStates = []
    }
    let hiddenCount = 0
    
    this.scene.traverse((obj) => {
      let shouldHide = false
      let helperType: 'grid' | 'axes' | 'lightHelper' | 'lightGizmo' | 'transformControls' | 'otherHelper' | undefined
      
      // Grid helper
      if (obj instanceof THREE.GridHelper || obj.userData?.isGridHelper === true) {
        shouldHide = true
        helperType = 'grid'
      }
      // Axes helper
      else if (obj instanceof THREE.AxesHelper || obj.userData?.isAxesHelper === true) {
        shouldHide = true
        helperType = 'axes'
      }
      // Light helpers (Three.js DirectionalLightHelper, PointLightHelper, SpotLightHelper, etc.)
      else if (obj.userData?.isLightHelper === true || 
               (obj.type && obj.type.includes('Helper') && obj.userData?.light) ||
               (THREE.DirectionalLightHelper && obj instanceof THREE.DirectionalLightHelper) ||
               (THREE.PointLightHelper && obj instanceof THREE.PointLightHelper) ||
               (THREE.SpotLightHelper && obj instanceof THREE.SpotLightHelper) ||
               (obj instanceof RectAreaLightHelper) ||
               (THREE.HemisphereLightHelper && obj instanceof THREE.HemisphereLightHelper)) {
        shouldHide = true
        helperType = 'lightHelper'
      }
      // Light gizmos (custom gizmo objects)
      else if (obj.userData?.isLightGizmo === true) {
        shouldHide = true
        helperType = 'lightGizmo'
      }
      // Any other helper types (BoxHelper, CameraHelper, etc.)
      else if (obj instanceof THREE.BoxHelper ||
               obj instanceof THREE.CameraHelper ||
               obj instanceof THREE.PlaneHelper ||
               obj instanceof THREE.SkeletonHelper ||
               (obj.type && obj.type.includes('Helper') && !obj.userData?.isGroundedSkybox)) {
        shouldHide = true
        helperType = 'otherHelper'
      }
      
      if (shouldHide && obj.visible && !this._originalHelperStates.find(s => s.obj === obj)) {
        this._originalHelperStates.push({ obj, wasVisible: obj.visible, helperType: helperType! })
        obj.visible = false
        hiddenCount++
      }
    })
    
    // Hide transform controls root only — child visibility is managed by TransformControls
    const hideTransformControlsRoot = (transformControls: THREE.Object3D) => {
      if (!transformControls?.visible) return 0
      if (this._originalHelperStates.find((s) => s.obj === transformControls)) return 0
      this._originalHelperStates.push({
        obj: transformControls,
        wasVisible: transformControls.visible,
        helperType: 'transformControls'
      })
      transformControls.visible = false
      return 1
    }

    // Hide transform controls from viewer - COMPLETE DISABLE METHOD
    const viewer = (window as any).__viewer
    if (viewer?.transformControls) {
      const transformControls = viewer.transformControls
      
      // CRITICAL: Disable transform controls completely (prevents interaction AND rendering)
      if (transformControls.enabled !== false) {
        transformControls.enabled = false
        console.log('[PathTracerDemo] 🔒 Disabled transform controls (enabled=false)')
      }
      
      // CRITICAL: Detach from any object (removes gizmo from object)
      if (transformControls.object) {
        transformControls.detach()
        console.log('[PathTracerDemo] 🔒 Detached transform controls from object')
      }
      
      // Hide the transform controls itself
      const hidden = hideTransformControlsRoot(transformControls)
      hiddenCount += hidden
      if (hidden > 0) {
        console.log('[PathTracerDemo] 🔒 Hiding transform controls and children from viewer:', hidden)
      }
    }
    
    // Also check scene for TransformControls directly and hide them + children
    this.scene.traverse((obj) => {
      if (obj.type === 'TransformControls' || obj.constructor?.name === 'TransformControls') {
        const transformControls = obj as any
        
        // CRITICAL: Disable transform controls completely
        if (transformControls.enabled !== false) {
          transformControls.enabled = false
          console.log('[PathTracerDemo] 🔒 Disabled transform controls in scene (enabled=false)')
        }
        
        // CRITICAL: Detach from any object
        if (transformControls.object) {
          transformControls.detach()
          console.log('[PathTracerDemo] 🔒 Detached transform controls from object in scene')
        }
        
        const hidden = hideTransformControlsRoot(transformControls)
        hiddenCount += hidden
        if (hidden > 0) {
          console.log('[PathTracerDemo] 🔒 Hiding transform controls and children from scene:', hidden)
        }
      }
    })
    
    // Hide ALL gizmos - check for any object with "gizmo" in name, type, or userData
    this.scene.traverse((obj) => {
      const name = obj.name?.toLowerCase() || ''
      const type = obj.type?.toLowerCase() || ''
      const constructorName = obj.constructor?.name?.toLowerCase() || ''
      const hasGizmoFlag = obj.userData?.isGizmo === true || 
                          obj.userData?.gizmo === true ||
                          obj.userData?.isLightGizmo === true ||
                          obj.userData?.isTransformGizmo === true
      
      const isGizmo = hasGizmoFlag || 
                     name.includes('gizmo') || 
                     type.includes('gizmo') || 
                     constructorName.includes('gizmo')
      
      if (isGizmo && obj.visible && !this._originalHelperStates.find(s => s.obj === obj)) {
        this._originalHelperStates.push({ 
          obj, 
          wasVisible: obj.visible, 
          helperType: 'lightGizmo' 
        })
        obj.visible = false
        hiddenCount++
        console.log('[PathTracerDemo] 🔒 Hiding gizmo during path tracing:', obj.name || obj.type || obj.constructor?.name)
      }
    })
    
    // Hide any objects with userData.isHelper or userData.helper
    this.scene.traverse((obj) => {
      if ((obj.userData?.isHelper === true || obj.userData?.helper === true) && 
          obj.visible && 
          !this._originalHelperStates.find(s => s.obj === obj)) {
        this._originalHelperStates.push({ 
          obj, 
          wasVisible: obj.visible, 
          helperType: 'otherHelper' 
        })
        obj.visible = false
        hiddenCount++
        console.log('[PathTracerDemo] 🔒 Hiding helper during path tracing:', obj.name || obj.type)
      }
    })
    
    // Hide axes helpers (red/green/blue arrows), yellow cubes, green gizmos, and semi-transparent planes
    this.scene.traverse((obj) => {
      if (this.isExcludedFromMaterialBasedHelperHide(obj) || this.isTransformControlsDescendant(obj)) {
        return
      }
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.ArrowHelper || obj instanceof THREE.PlaneHelper) {
        const mat = (obj as any).material
        const isArray = Array.isArray(mat)
        const materials = isArray ? mat : [mat]
        
        for (const material of materials) {
          if (material) {
            const color = material.color
            // Detect red axis (X-axis)
            const isRedAxis = color && color.r > 0.9 && color.g < 0.1 && color.b < 0.1
            // Detect green axis (Y-axis) or green gizmo
            const isGreenAxis = color && color.r < 0.1 && color.g > 0.9 && color.b < 0.1
            // Detect blue axis (Z-axis)
            const isBlueAxis = color && color.r < 0.1 && color.g < 0.1 && color.b > 0.9
            // Detect yellow cube (transform control center)
            const isYellowCube = color && color.r > 0.8 && color.g > 0.8 && color.b < 0.2
            // Detect green gizmo (bright green triangular gizmo)
            const isGreenGizmo = color && color.g > 0.8 && color.r < 0.3 && color.b < 0.3
            
            // Detect semi-transparent planes (transform control helper planes)
            const isSemiTransparentPlane = material.transparent === true && 
                                         material.opacity < 1.0 && 
                                         material.opacity > 0.0 &&
                                         (obj instanceof THREE.Mesh || obj instanceof THREE.PlaneHelper)
            
            // Detect PlaneHelper (semi-transparent plane helpers)
            const isPlaneHelper = obj instanceof THREE.PlaneHelper
            
            if ((isRedAxis || isGreenAxis || isBlueAxis || isYellowCube || isGreenGizmo || isSemiTransparentPlane || isPlaneHelper) &&
                obj.visible && 
                !this._originalHelperStates.find(s => s.obj === obj)) {
              this._originalHelperStates.push({ 
                obj, 
                wasVisible: obj.visible, 
                helperType: 'transformControls' 
              })
              obj.visible = false
              hiddenCount++
            }
          }
        }
      }
    })
    
    if (hiddenCount > 0) {
      console.log(`[PathTracerDemo] 🔒 Hidden ${hiddenCount} helper(s) and gizmo(s) for clean path tracing`)
    }
  }

  /**
   * Start the path tracer animation loop
   * Uses setAnimationLoop() which replaces the renderer's animation loop
   * This is the recommended way to use WebGLPathTracer according to three-gpu-pathtracer docs
   */
  start(): void {
    if (this._isRunning) {
      console.log('[PathTracerDemo] Already running, skipping start')
      return
    }
    this.accumulatedSamples = 0
    this.maxSamplesReached = false
    this.pausedAtMax = false
    this._frameSampleIncremented = false
    this._lastPathTracerSamples = 0
    this._lastTotalTiles = 0

    // Capture selection before hiding — user may have re-selected after panel init
    this.captureTransformStateForRestore()

    // CRITICAL: Hide all helpers and gizmos when starting path tracer
    this.hideAllHelpersAndGizmos()

    // CRITICAL: State should already be saved in initialize() BEFORE any modifications
    // Verify state was saved, and log a warning if it wasn't (defensive check)
    if (!(this as any)._stateBeforePT) {
      console.error('[PathTracerDemo] ❌ CRITICAL: State not saved in initialize() - restoration may fail!')
      console.error('[PathTracerDemo] This should not happen - initialize() should save state before modifying scene')
      // Don't try to save state here - scene is already modified by initialize()
      // Just log the error and continue (restoration will fail, but at least we know why)
    } else {
      console.log('[PathTracerDemo] ✅ Using state saved in initialize() (before modifications)')
      // Verify that saved state references are still valid
      if (this.originalBackground === undefined && this.originalBackground !== null) {
        console.warn('[PathTracerDemo] ⚠️ originalBackground not set - may have been saved incorrectly')
      }
    }

    console.log('[PathTracerDemo] Starting path tracer (viewer-driven loop)...')
    
    // CRITICAL: Log current background state for debugging
    console.log('[PathTracerDemo] 📊 Current background state:', {
      hasOriginalBackground: this.originalBackground !== null && this.originalBackground !== undefined,
      originalBackgroundType: this.originalBackground instanceof THREE.Color ? 'Color' : 
                             this.originalBackground instanceof THREE.Texture ? 'Texture' : 
                             this.originalBackground ? 'Other' : 'null',
      currentSceneBackground: this.scene.background ? 
        (this.scene.background instanceof THREE.Color ? 'Color' : 
         this.scene.background instanceof THREE.Texture ? 'Texture' : 'Other') : 'null',
      hasColorTexture: !!this.colorTexture,
      colorTextureIsSet: this.colorTexture && this.scene.background === this.colorTexture
    })
    
    // NATURAL ENVIRONMENT: Use realistic sky gradient (not all blue)
    if (this.originalBackground instanceof THREE.Color && this.colorTexture) {
      console.log('[PathTracerDemo] 🎨 Using original sky color for background, natural realistic gradient for environment:', {
        color: `#${this.originalBackground.getHexString()}`,
        r: this.originalBackground.r,
        g: this.originalBackground.g,
        b: this.originalBackground.b
      })
      // Set the color texture as background (exact same color as standard mode sky)
      this.scene.background = this.colorTexture
      
      // Use a natural, realistic gradient environment (not all blue)
      // Realistic sky: light blue at top, white/light gray at horizon, darker gray at bottom
      if (!this.gradientMap) {
        this.gradientMap = new GradientEquirectTexture()
      }
      
      // Create a more natural gradient: light blue at top, transitioning to white/gray at bottom
      // This creates a realistic sky appearance without everything being blue
      const topColor = new THREE.Color(0x87CEEB) // Sky blue at top
      const bottomColor = new THREE.Color(0xE0E0E0) // Light gray at bottom (not blue)
      
      this.gradientMap.topColor.copy(topColor)
      this.gradientMap.bottomColor.copy(bottomColor)
      this.gradientMap.update()
      
      // Use gradient for environment (reflections) - natural and not all blue
      this.scene.environment = this.gradientMap
      console.log('[PathTracerDemo] ✅ Path tracer: blue sky background + natural gradient environment (not all blue)')
    } else {
      // No color background, set up environment normally
      console.log('[PathTracerDemo] 🔄 Setting up environment before starting...')
      this.setupEnvironment()
    }
    
    // CRITICAL: Update path tracer environment AFTER setting background
    // This ensures the path tracer uses the correct background texture
    // But first, verify color texture is still set (updateEnvironment might change it)
    if (this.originalBackground instanceof THREE.Color && this.colorTexture) {
      // Double-check before updating environment
      if (this.scene.background !== this.colorTexture) {
        console.warn('[PathTracerDemo] ⚠️ Color texture lost before updateEnvironment(), restoring...')
        this.scene.background = this.colorTexture
      }
    }
    
    console.log('[PathTracerDemo] 🔄 Updating path tracer environment...')
    this.pathTracer.updateEnvironment()
    
    // CRITICAL: Verify color texture is still set after updateEnvironment()
    // updateEnvironment() might have changed the background
    if (this.originalBackground instanceof THREE.Color && this.colorTexture) {
      if (this.scene.background !== this.colorTexture) {
        console.warn('[PathTracerDemo] ⚠️ Color texture lost after updateEnvironment(), restoring...', {
          currentBackground: this.scene.background?.constructor?.name
        })
        this.scene.background = this.colorTexture
        // Update environment again with correct background
        this.pathTracer.updateEnvironment()
      } else {
        console.log('[PathTracerDemo] ✅ Color texture preserved after updateEnvironment()')
      }
    }
    
    // Ensure maxSamples param is applied for this run
    // CRITICAL: Explicitly set pathTracer.maxSamples to undefined to prevent WebGLPathTracer's
    // internal pause logic from triggering. pathTracer.samples counts tiles, not frames.
    // We handle maxSamples checking ourselves using accumulatedSamples (which counts complete frames).
    if (this.config.maxSamples !== undefined && this.config.maxSamples !== null) {
      this.params.maxSamples = this.config.maxSamples
      ;(this.pathTracer as any).maxSamples = undefined // Explicitly disable internal check
    } else {
      this.params.maxSamples = undefined
      ;(this.pathTracer as any).maxSamples = undefined // Explicitly disable internal check
    }

    // Hard reset accumulation and internal counters so tiny caps (e.g., 1–3) don't inherit old samples
    this.reset()

    // Ensure path tracer output is enabled when starting
    this.pathTracer.enablePathTracing = true
    this.pathTracer.renderToCanvas = true
    
    this._isRunning = true
    console.log('[PathTracerDemo] ✅ Path tracer ready - starting dedicated render loop')
    
    // CRITICAL: Hide ALL helpers and gizmos when starting path tracer (already done earlier, but ensure it's done)
    // This ensures a clean path-traced render without visual clutter
    this.hideAllHelpersAndGizmos()
    
    // NOTE: The following code is now handled by hideAllHelpersAndGizmos() method above
    // Keeping this comment for reference, but the actual hiding is done in the method
    /*
    this._originalHelperStates = []
    let hiddenCount = 0
    
    this.scene.traverse((obj) => {
      let shouldHide = false
      let helperType: 'grid' | 'axes' | 'lightHelper' | 'lightGizmo' | 'transformControls' | undefined
      
      // Grid helper
      if (obj instanceof THREE.GridHelper || obj.userData?.isGridHelper === true) {
        shouldHide = true
        helperType = 'grid'
      }
      // Axes helper
      else if (obj instanceof THREE.AxesHelper || obj.userData?.isAxesHelper === true) {
        shouldHide = true
        helperType = 'axes'
      }
      // Light helpers (Three.js DirectionalLightHelper, PointLightHelper, SpotLightHelper, etc.)
      else if (obj.userData?.isLightHelper === true || 
               (obj.type && obj.type.includes('Helper') && obj.userData?.light) ||
               (THREE.DirectionalLightHelper && obj instanceof THREE.DirectionalLightHelper) ||
               (THREE.PointLightHelper && obj instanceof THREE.PointLightHelper) ||
               (THREE.SpotLightHelper && obj instanceof THREE.SpotLightHelper) ||
               (obj instanceof RectAreaLightHelper) ||
               (THREE.HemisphereLightHelper && obj instanceof THREE.HemisphereLightHelper)) {
        shouldHide = true
        helperType = 'lightHelper'
      }
      // Light gizmos (custom gizmo objects)
      else if (obj.userData?.isLightGizmo === true) {
        shouldHide = true
        helperType = 'lightGizmo'
      }
      // Any other helper types (BoxHelper, CameraHelper, etc.)
      else if (obj instanceof THREE.BoxHelper ||
               obj instanceof THREE.CameraHelper ||
               obj instanceof THREE.PlaneHelper ||
               obj instanceof THREE.SkeletonHelper ||
               (obj.type && obj.type.includes('Helper') && !obj.userData?.isGroundedSkybox)) {
        shouldHide = true
        helperType = 'lightHelper' // Use generic type for other helpers
      }
      
      if (shouldHide && obj.visible) {
        this._originalHelperStates.push({ obj, wasVisible: obj.visible, helperType: helperType! })
        obj.visible = false
        hiddenCount++
      }
    })
    
    // Hide transform controls and ALL their children/gizmos (axes, boxes, lines, etc.)
    const hideTransformControlsAndChildren = (transformControls: any) => {
      if (!transformControls) return 0
      
      let hidden = 0
      
      // Hide the transform controls itself
      if (transformControls.visible) {
        this._originalHelperStates.push({ 
          obj: transformControls, 
          wasVisible: transformControls.visible, 
          helperType: 'transformControls' 
        })
        transformControls.visible = false
        hidden++
      }
      
      // Hide ALL children of transform controls (axes, boxes, lines, etc.)
      transformControls.traverse((child: any) => {
        if (child !== transformControls && child.visible) {
          // Check if already hidden
          if (!this._originalHelperStates.find(s => s.obj === child)) {
            this._originalHelperStates.push({ 
              obj: child, 
              wasVisible: child.visible, 
              helperType: 'transformControls' 
            })
            child.visible = false
            hidden++
            console.log('[PathTracerDemo] 🔒 Hiding transform control child:', child.type || child.constructor?.name || 'Unknown')
          }
        }
      })
      
      return hidden
    }
    
    // Hide transform controls from viewer - COMPLETE DISABLE METHOD
    const viewer = (window as any).__viewer
    if (viewer?.transformControls) {
      const transformControls = viewer.transformControls
      
      // CRITICAL: Disable transform controls completely (prevents interaction AND rendering)
      if (transformControls.enabled !== false) {
        transformControls.enabled = false
        console.log('[PathTracerDemo] 🔒 Disabled transform controls (enabled=false)')
      }
      
      // CRITICAL: Detach from any object (removes gizmo from object)
      if (transformControls.object) {
        transformControls.detach()
        console.log('[PathTracerDemo] 🔒 Detached transform controls from object')
      }
      
      // Hide the transform controls itself
      const hidden = hideTransformControlsRoot(transformControls)
      hiddenCount += hidden
      if (hidden > 0) {
        console.log('[PathTracerDemo] 🔒 Hiding transform controls and children from viewer:', hidden)
      }
    }
    
    // Also check scene for TransformControls directly and hide them + children
    this.scene.traverse((obj) => {
      if (obj.type === 'TransformControls' || obj.constructor?.name === 'TransformControls') {
        const transformControls = obj as any
        
        // CRITICAL: Disable transform controls completely
        if (transformControls.enabled !== false) {
          transformControls.enabled = false
          console.log('[PathTracerDemo] 🔒 Disabled transform controls in scene (enabled=false)')
        }
        
        // CRITICAL: Detach from any object
        if (transformControls.object) {
          transformControls.detach()
          console.log('[PathTracerDemo] 🔒 Detached transform controls from object in scene')
        }
        
        const hidden = hideTransformControlsRoot(transformControls)
        hiddenCount += hidden
        if (hidden > 0) {
          console.log('[PathTracerDemo] 🔒 Hiding transform controls and children from scene:', hidden)
        }
      }
    })
    
    // Hide any objects that are linked to transform controls (attached objects)
    // Transform controls often attach to objects - hide any axes/helpers on those objects
    this.scene.traverse((obj) => {
      // Check if object has transform controls attached or is being transformed
      if (obj.userData?.isTransformTarget === true || 
          obj.userData?.isSelected === true ||
          obj.userData?.hasTransformControls === true) {
        // Hide any axes or helpers on this object
        obj.traverse((child: any) => {
          const isAxis = child.type?.includes('Axis') || 
                       child.name?.toLowerCase().includes('axis') ||
                       (child.geometry && child.material && 
                        (child.material.color?.r === 1 && child.material.color?.g === 0 && child.material.color?.b === 0) || // Red axis
                        (child.material.color?.r === 0 && child.material.color?.g === 1 && child.material.color?.b === 0) || // Green axis
                        (child.material.color?.r === 0 && child.material.color?.g === 0 && child.material.color?.b === 1)) // Blue axis
          
          const isGizmo = child.userData?.isGizmo === true ||
                         child.name?.toLowerCase().includes('gizmo') ||
                         child.type?.toLowerCase().includes('gizmo')
          
          if ((isAxis || isGizmo) && child.visible && !this._originalHelperStates.find(s => s.obj === child)) {
            this._originalHelperStates.push({ 
              obj: child, 
              wasVisible: child.visible, 
              helperType: 'transformControls' 
            })
            child.visible = false
            hiddenCount++
            console.log('[PathTracerDemo] 🔒 Hiding axis/gizmo on transform target:', child.name || child.type)
          }
        })
      }
    })
    
    // Hide ALL gizmos - check for any object with "gizmo" in name, type, or userData
    this.scene.traverse((obj) => {
      const name = obj.name?.toLowerCase() || ''
      const type = obj.type?.toLowerCase() || ''
      const constructorName = obj.constructor?.name?.toLowerCase() || ''
      const hasGizmoFlag = obj.userData?.isGizmo === true || 
                          obj.userData?.gizmo === true ||
                          obj.userData?.isLightGizmo === true ||
                          obj.userData?.isTransformGizmo === true
      
      const isGizmo = hasGizmoFlag || 
                     name.includes('gizmo') || 
                     type.includes('gizmo') || 
                     constructorName.includes('gizmo')
      
      if (isGizmo && obj.visible && !this._originalHelperStates.find(s => s.obj === obj)) {
        this._originalHelperStates.push({ 
          obj, 
          wasVisible: obj.visible, 
          helperType: 'lightGizmo' 
        })
        obj.visible = false
        hiddenCount++
        console.log('[PathTracerDemo] 🔒 Hiding gizmo during path tracing:', obj.name || obj.type || obj.constructor?.name)
      }
    })
    
    // Hide any objects with userData.isHelper or userData.helper
    this.scene.traverse((obj) => {
      if ((obj.userData?.isHelper === true || obj.userData?.helper === true) && 
          obj.visible && 
          !this._originalHelperStates.find(s => s.obj === obj)) {
        this._originalHelperStates.push({ 
          obj, 
          wasVisible: obj.visible, 
          helperType: 'otherHelper' 
        })
        obj.visible = false
        hiddenCount++
        console.log('[PathTracerDemo] 🔒 Hiding helper during path tracing:', obj.name || obj.type)
      }
    })
    
    // Hide axes helpers (red/green/blue arrows), yellow cubes, green gizmos, and semi-transparent planes
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.ArrowHelper || obj instanceof THREE.PlaneHelper) {
        const mat = (obj as any).material
        const isArray = Array.isArray(mat)
        const materials = isArray ? mat : [mat]
        
        for (const material of materials) {
          if (material) {
            const color = material.color
            // Detect red axis (X-axis)
            const isRedAxis = color && color.r > 0.9 && color.g < 0.1 && color.b < 0.1
            // Detect green axis (Y-axis) or green gizmo
            const isGreenAxis = color && color.r < 0.1 && color.g > 0.9 && color.b < 0.1
            // Detect blue axis (Z-axis)
            const isBlueAxis = color && color.r < 0.1 && color.g < 0.1 && color.b > 0.9
            // Detect yellow cube (transform control center)
            const isYellowCube = color && color.r > 0.8 && color.g > 0.8 && color.b < 0.2
            // Detect green gizmo (bright green triangular gizmo)
            const isGreenGizmo = color && color.g > 0.8 && color.r < 0.3 && color.b < 0.3
            
            // Detect semi-transparent planes (transform control helper planes)
            const isSemiTransparentPlane = material.transparent === true && 
                                         material.opacity < 1.0 && 
                                         material.opacity > 0.0 &&
                                         (obj instanceof THREE.Mesh || obj instanceof THREE.PlaneHelper)
            
            // Detect PlaneHelper (semi-transparent plane helpers)
            const isPlaneHelper = obj instanceof THREE.PlaneHelper
            
            if ((isRedAxis || isGreenAxis || isBlueAxis || isYellowCube || isGreenGizmo || isSemiTransparentPlane || isPlaneHelper) && 
                obj.visible && 
                !this._originalHelperStates.find(s => s.obj === obj)) {
              this._originalHelperStates.push({ 
                obj, 
                wasVisible: obj.visible, 
                helperType: 'transformControls' 
              })
              obj.visible = false
              hiddenCount++
              console.log('[PathTracerDemo] 🔒 Hiding gizmo/helper:', {
                type: isRedAxis ? 'Red Axis (X)' : 
                      isGreenAxis ? 'Green Axis (Y)' : 
                      isBlueAxis ? 'Blue Axis (Z)' : 
                      isYellowCube ? 'Yellow Cube' :
                      isGreenGizmo ? 'Green Gizmo' :
                      isSemiTransparentPlane ? 'Semi-transparent Plane' :
                      isPlaneHelper ? 'PlaneHelper' : 'Unknown',
                name: obj.name || 'Unnamed',
                transparent: material.transparent,
                opacity: material.opacity
              })
              break // Found a match, no need to check other materials
            }
          }
        }
      }
      
      // Also check for ArrowHelper instances (Three.js axes)
      if (obj instanceof THREE.ArrowHelper || obj.type === 'ArrowHelper') {
        if (obj.visible && !this._originalHelperStates.find(s => s.obj === obj)) {
          this._originalHelperStates.push({ 
            obj, 
            wasVisible: obj.visible, 
            helperType: 'transformControls' 
          })
          obj.visible = false
          hiddenCount++
          console.log('[PathTracerDemo] 🔒 Hiding ArrowHelper (axis):', obj.name || 'Unnamed')
        }
      }
      
      // Hide PlaneHelper instances (semi-transparent plane helpers)
      if (obj instanceof THREE.PlaneHelper) {
        if (obj.visible && !this._originalHelperStates.find(s => s.obj === obj)) {
          this._originalHelperStates.push({ 
            obj, 
            wasVisible: obj.visible, 
            helperType: 'transformControls' 
          })
          obj.visible = false
          hiddenCount++
          console.log('[PathTracerDemo] 🔒 Hiding PlaneHelper (semi-transparent plane):', obj.name || 'Unnamed')
        }
      }
    })
    
    console.log(`[PathTracerDemo] 🔒 Hid ${hiddenCount} helper(s) and gizmo(s) during path tracing`)
    */
    
    const loop = () => {
      if (!this._isRunning) {
        console.log('[PathTracerDemo] ⚠️ Render loop stopped - _isRunning is false', {
          sampleCount: this.getSampleCount(),
          pausedAtMax: this.pausedAtMax,
          maxSamplesReached: this.maxSamplesReached
        })
        this.rafHandle = null
        return
      }
      try {
        this.renderFrame()
      } catch (error) {
        console.error('[PathTracerDemo] ❌ Render loop error:', error)
        // Don't stop on error - let it continue trying
        // Only stop if it's a critical error
        if (error instanceof Error && error.message.includes('WebGL context lost')) {
          console.error('[PathTracerDemo] ❌ WebGL context lost - stopping path tracer')
          this.stop(true)
          return
        }
      }
      this.rafHandle = requestAnimationFrame(loop)
    }
    this.rafHandle = requestAnimationFrame(loop)
  }

  /**
   * Stop the path tracer animation loop
   */
  stop(force = false): void {
    const sampleCount = this.getSampleCount()
    const stackTrace = new Error().stack || ''
    
    // Check if this is from cleanup (component unmount) vs user action
    // Look for cleanup patterns in the stack trace
    const isCleanup = stackTrace.includes('PathTracerDemoPanel') && 
                     (stackTrace.includes('cleanup') || 
                      stackTrace.includes('return ()') ||
                      stackTrace.includes('useEffect') ||
                      stackTrace.includes('at PathTracerDemoPanel'))
    
    console.log('[PathTracerDemo] 🛑 stop() called', {
      force,
      pausedAtMax: this.pausedAtMax,
      maxSamplesReached: this.maxSamplesReached,
      isRunning: this._isRunning,
      sampleCount,
      accumulatedSamples: this.accumulatedSamples,
      isCleanup,
      stackTrace: stackTrace?.split('\n').slice(1, 4).join('\n') // First 3 stack frames
    })
    
    if (this.pausedAtMax && !force) {
      console.log('[PathTracerDemo] stop() ignored because pausedAtMax and force=false')
      return
    }
    if (this.maxSamplesReached && !force) {
      console.log('[PathTracerDemo] stop() ignored because maxSamplesReached and force=false')
      return
    }
    // CRITICAL: Even with force=true, log if stopping while paused at max
    // This is OK during cleanup/unmount, but should be prevented by UI during normal operation
    if (this.pausedAtMax && force) {
      // Use the isCleanup flag we already computed above
      if (isCleanup) {
        console.log('[PathTracerDemo] Cleanup: Force stopping while paused at max (this is expected during panel cleanup/unmount)')
      } else {
        console.warn('[PathTracerDemo] ⚠️ Force stopping while paused at max samples - this should be prevented by UI', {
          stackTrace: stackTrace.split('\n').slice(0, 5).join('\n')
        })
      }
    }
    if (this._isStopping) {
      console.log('[PathTracerDemo] stop() already in progress, skipping duplicate call')
      return
    }
    this._isStopping = true
    const stopCore = () => {
      this._isRunning = false
      if (this.rafHandle !== null) {
        cancelAnimationFrame(this.rafHandle)
        this.rafHandle = null
      }
      try {
        this.renderer.setAnimationLoop(null)
      } catch (error) {
        // Ignore if renderer doesn't support get/setAnimationLoop
        console.warn('[PathTracerDemo] Unable to reset animation loop:', error)
      }
      // Cache store flag for consistent shadow plane restore + desired bounds for positioning
      const showShadowPlaneFlag = useAppStore.getState().showShadowPlane
      const shadowPlaneVisibility = new Map<THREE.Object3D, boolean>()
      const sceneBounds = (() => {
        const bbox = new THREE.Box3()
        let hasBounds = false
        this.scene.traverse((child) => {
          const isHelper =
            child.userData?.isShadowPlane === true ||
            child.userData?.isGroundedSkybox === true ||
            child.userData?.isGridHelper === true ||
            child.userData?.isAxesHelper === true ||
            child.userData?.isLightHelper === true
          if (isHelper) return
          if (child instanceof THREE.Mesh) {
            const box = new THREE.Box3().setFromObject(child)
            if (Number.isFinite(box.min.x) && Number.isFinite(box.min.y) && Number.isFinite(box.min.z)) {
              bbox.union(box)
              hasBounds = true
            }
          }
        })
        if (!hasBounds) return null
        return {
          minY: bbox.min.y,
          center: bbox.getCenter(new THREE.Vector3())
        }
      })()

      // Remove path-tracer-only meshes before restoring viewer helpers
      this.removePathTracerTransientMeshes()

      // Restore helpers (grid, axes, light helpers) — skip transform-control internals
      if (this._originalHelperStates && this._originalHelperStates.length > 0) {
        console.log('[PathTracerDemo] 🔓 Restoring helpers after path tracing:', this._originalHelperStates.length)
        this._originalHelperStates.forEach(({ obj, wasVisible, helperType }) => {
          if (!obj || typeof obj.visible === 'undefined') return
          if (helperType === 'transformControls' && this.isTransformControlsDescendant(obj)) {
            return
          }
          if (obj.userData?.isShadowPlane || obj.userData?.isPathTracerGroundPlane) {
            return
          }
          obj.visible = wasVisible
          console.log(`[PathTracerDemo] ✅ Restored ${helperType} visibility:`, wasVisible)
        })
        this._originalHelperStates = []
      }

      this.restoreTransformControlsAfterPathTracer()

      // Restore shadow plane visibility and properties if it was hidden
      const hiddenShadowPlanes = (this as any)._hiddenShadowPlanes as Array<{ 
        obj: THREE.Object3D
        wasVisible: boolean
        originalReceiveShadow?: boolean
        originalCastShadow?: boolean
        originalMaterial?: THREE.Material
        originalMaterialProps?: {
          opacity?: number
          transparent?: boolean
          color?: THREE.Color
          depthWrite?: boolean
          visible?: boolean
        }
        originalPosition?: THREE.Vector3
        originalRotation?: THREE.Euler
        originalScale?: THREE.Vector3
      }> | undefined
      if (hiddenShadowPlanes && hiddenShadowPlanes.length > 0) {
        hiddenShadowPlanes.forEach(({ obj, wasVisible, originalReceiveShadow, originalCastShadow, originalMaterial, originalMaterialProps, originalPosition, originalRotation, originalScale }) => {
          const desiredVisibility =
            showShadowPlaneFlag !== undefined ? !!showShadowPlaneFlag : wasVisible ?? true
          shadowPlaneVisibility.set(obj, desiredVisibility)
          
          if (obj instanceof THREE.Mesh) {
            // CRITICAL: Ensure shadow plane is visible (unless explicitly hidden by user)
            // The path tracer ground plane has been removed, so the standard shadow plane should be visible
            obj.visible = desiredVisibility
            
            // Restore original shadow receiving/casting properties
            if (originalReceiveShadow !== undefined) {
              obj.receiveShadow = originalReceiveShadow
            } else {
              obj.receiveShadow = true // Default to receiving shadows
            }
            if (originalCastShadow !== undefined) {
              obj.castShadow = originalCastShadow
            } else {
              obj.castShadow = false // Default to not casting shadows
            }
            
            // CRITICAL: Verify path tracer ground plane is not interfering
            // If there's still a path tracer ground plane in the scene, log a warning
            this.scene.traverse((otherObj) => {
              if (otherObj !== obj && otherObj instanceof THREE.Mesh && otherObj.userData?.isPathTracerGroundPlane === true) {
                console.warn('[PathTracerDemo] ⚠️ Path tracer ground plane still exists when restoring shadow plane!', {
                  groundPlaneName: otherObj.name || 'Unnamed',
                  groundPlaneUuid: otherObj.uuid,
                  shadowPlaneName: obj.name || 'Shadow Plane'
                })
              }
            })
            // CRITICAL: Restore original transform exactly as it was before path tracer
            if (originalPosition) {
              obj.position.copy(originalPosition)
            }
            if (originalRotation) {
              obj.rotation.copy(originalRotation)
            }
            if (originalScale) {
              obj.scale.copy(originalScale)
            }
            
            // CRITICAL: Check user's current transparency setting BEFORE restoring material
            // We will NOT set restoration flags - let ViewerCanvas handle material type based on user setting
            // This allows user to toggle transparency on/off after path tracer exits
            const userStore = useAppStore.getState()
            const currentUserWantsTransparent = userStore?.shadowPlaneTransparent ?? false
            const restoredIsShadowMaterial = originalMaterial instanceof THREE.ShadowMaterial
            const materialTypeMatchesUserSetting = (currentUserWantsTransparent && restoredIsShadowMaterial) ||
                                                   (!currentUserWantsTransparent && !restoredIsShadowMaterial)
            
            console.log('[PathTracerDemo] 🔍 Material type vs user setting check:', {
              restoredMaterialType: originalMaterial?.constructor?.name,
              restoredIsShadowMaterial,
              currentUserWantsTransparent,
              materialTypeMatchesUserSetting,
              note: materialTypeMatchesUserSetting 
                ? 'Material type matches - will restore properties but allow ViewerCanvas to manage material'
                : 'Material type mismatch - ViewerCanvas will change material type to match user setting'
            })
            
            if (originalMaterial && originalMaterial instanceof THREE.Material && obj instanceof THREE.Mesh) {
              // Restore the original material instance
              // CRITICAL: Don't dispose the current material - it might be the same instance
              // Only replace if it's actually different
              const currentMaterial = Array.isArray(obj.material) ? obj.material[0] : obj.material
              if (currentMaterial !== originalMaterial) {
                // Only dispose if it's a different material instance
                if (currentMaterial instanceof THREE.Material && currentMaterial !== originalMaterial) {
                  // Check if current material was created by ViewerCanvas (not the original)
                  const wasViewerCanvasMaterial = !currentMaterial.userData?._pathTracerRestored && 
                                                   (currentMaterial instanceof THREE.ShadowMaterial || 
                                                    currentMaterial instanceof THREE.MeshStandardMaterial)
                  if (wasViewerCanvasMaterial) {
                    // Dispose only if it's a ViewerCanvas-created material
                    currentMaterial.dispose()
                  }
                }
                obj.material = originalMaterial
                
                // CRITICAL: DO NOT set restoration flags - always let ViewerCanvas manage the material
                // This allows user to toggle transparency on/off after path tracer exits
                // We restore the material properties (opacity, color, etc.) but ViewerCanvas will
                // change the material type (ShadowMaterial vs MeshStandardMaterial) based on user setting
                console.log('[PathTracerDemo] ✅ Restored material instance, but NOT setting restoration flags', {
                  restoredMaterialType: originalMaterial.constructor?.name,
                  userWantsTransparent: currentUserWantsTransparent,
                  note: 'ViewerCanvas will manage material type based on user transparency setting'
                })
                
                // CRITICAL: Restore all material properties including opacity and transparency
                if (originalMaterialProps) {
                  // Restore opacity (CRITICAL for shadow plane transparency)
                  if ('opacity' in originalMaterial && originalMaterialProps.opacity !== undefined) {
                    (originalMaterial as any).opacity = originalMaterialProps.opacity
                    console.log('[PathTracerDemo] ✅ Restored material opacity:', {
                      materialType: originalMaterial.constructor?.name,
                      opacity: originalMaterialProps.opacity
                    })
                  }
                  // Restore transparent flag (CRITICAL for shadow plane transparency)
                  if ('transparent' in originalMaterial && originalMaterialProps.transparent !== undefined) {
                    (originalMaterial as any).transparent = originalMaterialProps.transparent
                    console.log('[PathTracerDemo] ✅ Restored material transparent flag:', {
                      materialType: originalMaterial.constructor?.name,
                      transparent: originalMaterialProps.transparent
                    })
                  }
                  // Restore color if we have saved properties (for both ShadowMaterial and MeshStandardMaterial)
                  if (originalMaterialProps.color && 'color' in originalMaterial) {
                    const matColor = (originalMaterial as any).color
                    if (matColor && matColor instanceof THREE.Color) {
                      // Use setRGB to ensure color is properly restored
                      matColor.setRGB(
                        originalMaterialProps.color.r,
                        originalMaterialProps.color.g,
                        originalMaterialProps.color.b
                      )
                      console.log('[PathTracerDemo] ✅ Restored material color:', {
                        materialType: originalMaterial.constructor?.name,
                        color: { r: matColor.r, g: matColor.g, b: matColor.b },
                        savedColor: originalMaterialProps.color
                      })
                    } else if (matColor && typeof matColor.copy === 'function') {
                      matColor.copy(originalMaterialProps.color)
                      console.log('[PathTracerDemo] ✅ Restored material color (via copy):', {
                        materialType: originalMaterial.constructor?.name,
                        savedColor: originalMaterialProps.color
                      })
                    }
                  } else if (!originalMaterialProps.color && originalMaterial instanceof THREE.ShadowMaterial) {
                    // ShadowMaterial default color is black (0,0,0) - ensure it's set correctly
                    const matColor = (originalMaterial as any).color
                    if (matColor && matColor instanceof THREE.Color && (matColor.r !== 0 || matColor.g !== 0 || matColor.b !== 0)) {
                      matColor.setRGB(0, 0, 0) // ShadowMaterial should be black
                      console.log('[PathTracerDemo] ✅ Reset ShadowMaterial color to black (default)')
                    }
                  }
                  // Restore depthWrite if saved
                  if ('depthWrite' in originalMaterial && originalMaterialProps.depthWrite !== undefined) {
                    (originalMaterial as any).depthWrite = originalMaterialProps.depthWrite
                  }
                  originalMaterial.needsUpdate = true
                }
                console.log('[PathTracerDemo] ✅ Restored original material instance:', {
                  materialType: originalMaterial.constructor?.name,
                  materialUuid: originalMaterial.uuid,
                  wasDifferent: currentMaterial !== originalMaterial,
                  opacity: originalMaterialProps?.opacity !== undefined ? {
                    saved: originalMaterialProps.opacity,
                    restored: (originalMaterial as any).opacity,
                    match: originalMaterialProps.opacity === (originalMaterial as any).opacity
                  } : null,
                  transparent: originalMaterialProps?.transparent !== undefined ? {
                    saved: originalMaterialProps.transparent,
                    restored: (originalMaterial as any).transparent,
                    match: originalMaterialProps.transparent === (originalMaterial as any).transparent
                  } : null,
                  colorRestored: originalMaterialProps?.color ? {
                    r: (originalMaterial as any).color?.r,
                    g: (originalMaterial as any).color?.g,
                    b: (originalMaterial as any).color?.b
                  } : null
                })
              } else {
                // Same material instance - just restore properties
                // Use the same variables already declared above
                if (originalMaterialProps) {
                  if ('opacity' in originalMaterial && originalMaterialProps.opacity !== undefined) {
                    (originalMaterial as any).opacity = originalMaterialProps.opacity
                  }
                  if ('transparent' in originalMaterial && originalMaterialProps.transparent !== undefined) {
                    (originalMaterial as any).transparent = originalMaterialProps.transparent
                  }
                  if ('color' in originalMaterial && originalMaterialProps.color) {
                    // CRITICAL: Restore color by copying RGB values
                    const matColor = (originalMaterial as any).color
                    if (matColor && matColor instanceof THREE.Color) {
                      matColor.setRGB(
                        originalMaterialProps.color.r,
                        originalMaterialProps.color.g,
                        originalMaterialProps.color.b
                      )
                      console.log('[PathTracerDemo] ✅ Restored material color (same instance):', {
                        materialType: originalMaterial.constructor?.name,
                        color: { r: matColor.r, g: matColor.g, b: matColor.b },
                        savedColor: originalMaterialProps.color
                      })
                    } else if (matColor && typeof matColor.copy === 'function') {
                      matColor.copy(originalMaterialProps.color)
                      console.log('[PathTracerDemo] ✅ Restored material color (via copy, same instance):', {
                        materialType: originalMaterial.constructor?.name,
                        savedColor: originalMaterialProps.color
                      })
                    }
                  } else if (!originalMaterialProps.color && originalMaterial instanceof THREE.ShadowMaterial) {
                    // ShadowMaterial default color is black (0,0,0) - ensure it's set correctly
                    const matColor = (originalMaterial as any).color
                    if (matColor && matColor instanceof THREE.Color && (matColor.r !== 0 || matColor.g !== 0 || matColor.b !== 0)) {
                      matColor.setRGB(0, 0, 0) // ShadowMaterial should be black
                      originalMaterial.needsUpdate = true
                      console.log('[PathTracerDemo] ✅ Reset ShadowMaterial color to black (default, same instance)')
                    }
                  }
                  originalMaterial.needsUpdate = true
                }
                
                // CRITICAL: DO NOT set restoration flags - always let ViewerCanvas manage the material
                // This allows user to toggle transparency on/off after path tracer exits
                console.log('[PathTracerDemo] ✅ Material instance unchanged, restored properties, but NOT setting restoration flags', {
                  materialType: originalMaterial.constructor?.name,
                  opacity: originalMaterialProps?.opacity,
                  transparent: originalMaterialProps?.transparent,
                  userWantsTransparent: currentUserWantsTransparent,
                  note: 'ViewerCanvas will manage material type based on user transparency setting'
                })
              }
            } else if (originalMaterialProps) {
              // Fallback: Restore original material properties if we don't have the original instance
              const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
              materials.forEach((mat) => {
                if (mat instanceof THREE.Material) {
                  // Restore original material properties
                  if ('opacity' in mat && originalMaterialProps.opacity !== undefined) {
                    (mat as any).opacity = originalMaterialProps.opacity
                  }
                  if ('transparent' in mat && originalMaterialProps.transparent !== undefined) {
                    (mat as any).transparent = originalMaterialProps.transparent
                  }
                  if ('color' in mat && originalMaterialProps.color) {
                    (mat as any).color.copy(originalMaterialProps.color)
                  }
                  if ('visible' in mat && originalMaterialProps.visible !== undefined) {
                    (mat as any).visible = originalMaterialProps.visible
                  }
                  // depthWrite: use original if saved, otherwise ensure it's true for shadows
                  if ('depthWrite' in mat) {
                    (mat as any).depthWrite = originalMaterialProps.depthWrite !== undefined 
                      ? originalMaterialProps.depthWrite 
                      : true // Default to true for shadow rendering
                  }
                  mat.needsUpdate = true
                }
              })
              console.log('[PathTracerDemo] ✅ Restored original material properties (fallback):', {
                opacity: originalMaterialProps.opacity,
                transparent: originalMaterialProps.transparent,
                hasColor: !!originalMaterialProps.color
              })
            } else {
              // No original material or props - ensure depthWrite is true for shadow rendering
              const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
              materials.forEach((mat) => {
                if (mat instanceof THREE.Material) {
                  if ('depthWrite' in mat) {
                    (mat as any).depthWrite = true
                  }
                  mat.needsUpdate = true
                }
              })
            }
            
            // CRITICAL: Store restored position/rotation/scale in userData for drift detection (like weather system pattern)
            // This allows ViewerCanvas to detect and correct any position drift after restoration
            if (originalPosition) {
              obj.userData._restoredPosition = originalPosition.clone()
            }
            if (originalRotation) {
              obj.userData._restoredRotation = originalRotation.clone()
            }
            if (originalScale) {
              obj.userData._restoredScale = originalScale.clone()
            }
            
            // CRITICAL: DO NOT set restoration flags for material - always let ViewerCanvas manage it
            // This allows user to toggle transparency on/off after path tracer exits
            // We only set position/rotation/scale restoration flags to prevent position drift
            console.log('[PathTracerDemo] ✅ Shadow plane restored - ViewerCanvas will manage material type based on user transparency setting', {
              restoredMaterialType: originalMaterial?.constructor?.name,
              userWantsTransparent: currentUserWantsTransparent,
              note: 'User can toggle transparency on/off - ViewerCanvas will handle material type changes'
            })
          }
          
          const material = obj instanceof THREE.Mesh ? (Array.isArray(obj.material) ? obj.material[0] : obj.material) : null
          const materialColor = material && 'color' in material && (material as any).color instanceof THREE.Color 
            ? { r: (material as any).color.r, g: (material as any).color.g, b: (material as any).color.b, hex: (material as any).color.getHexString() }
            : null
          console.log('[PathTracerDemo] 🔄 Restored shadow plane visibility and properties (weather system pattern):', {
            name: obj.name || 'Unnamed',
            uuid: obj.uuid,
            visible: obj.visible,
            wasVisible,
            desiredVisibility,
            visibilityRestored: obj.visible === desiredVisibility,
            receiveShadow: obj instanceof THREE.Mesh ? obj.receiveShadow : 'N/A',
            castShadow: obj instanceof THREE.Mesh ? obj.castShadow : 'N/A',
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            material: material ? {
              type: material.constructor?.name,
              uuid: material.uuid,
              transparent: (material as any).transparent,
              opacity: (material as any).opacity,
              depthWrite: (material as any).depthWrite,
              color: materialColor
            } : null,
            savedMaterialProps: originalMaterialProps ? {
              opacity: originalMaterialProps.opacity,
              transparent: originalMaterialProps.transparent,
              color: originalMaterialProps.color ? {
                r: originalMaterialProps.color.r,
                g: originalMaterialProps.color.g,
                b: originalMaterialProps.color.b
              } : null,
              depthWrite: originalMaterialProps.depthWrite
            } : null,
            materialPropsRestored: originalMaterialProps ? {
              opacity: (material as any)?.opacity === originalMaterialProps.opacity,
              transparent: (material as any)?.transparent === originalMaterialProps.transparent,
              color: materialColor && originalMaterialProps.color ? {
                r: materialColor.r === originalMaterialProps.color.r,
                g: materialColor.g === originalMaterialProps.color.g,
                b: materialColor.b === originalMaterialProps.color.b
              } : null
            } : null,
            inScene: obj.parent === this.scene || (obj.parent && this.scene.children.includes(obj.parent as any)),
            showShadowPlaneFlag,
            pathTracerGroundPlaneRemoved: this.groundPlaneMesh === null
          })
        })
        ;(this as any)._hiddenShadowPlanes = null
        console.log('[PathTracerDemo] ✅ Restored shadow plane visibility and properties after path tracing')
      }
      // Fallback: ensure any shadow planes in the scene are re-shown even if the hidden list was lost
      this.scene.traverse((obj) => {
        const isShadowPlane =
          obj.userData?.isShadowPlane === true || (obj as any).name === 'Shadow Plane'
        if (isShadowPlane && obj instanceof THREE.Mesh) {
          const desiredVisibility = showShadowPlaneFlag !== undefined ? !!showShadowPlaneFlag : true
          obj.visible = desiredVisibility
          obj.receiveShadow = true
          obj.castShadow = false
          const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
          if (mat && mat instanceof THREE.Material) {
            mat.needsUpdate = true
          }
          console.log('[PathTracerDemo] 🔄 Fallback re-show shadow plane:', {
            name: obj.name || 'Shadow Plane',
            visible: obj.visible,
            desiredVisibility,
            showShadowPlaneFlag
          })
        }
      })
      
      // Restore GroundedSkybox visibility if it was hidden
      const hiddenGroundedSkyboxes = (this as any)._hiddenGroundedSkyboxes as Array<{ obj: THREE.Object3D; wasVisible: boolean }> | undefined
      if (hiddenGroundedSkyboxes && hiddenGroundedSkyboxes.length > 0) {
        hiddenGroundedSkyboxes.forEach(({ obj, wasVisible }) => {
          obj.visible = wasVisible
          console.log('[PathTracerDemo] 🔄 Restored GroundedSkybox visibility:', {
            name: obj.name || 'Unnamed',
            visible: obj.visible,
            wasVisible
          })
        })
        ;(this as any)._hiddenGroundedSkyboxes = null
        console.log('[PathTracerDemo] ✅ Restored GroundedSkybox visibility after path tracing')
      }
      
      // Restore GroundedSkybox materials if they were converted to PBR
      const convertedSkyboxMaterials = (this as any)._convertedSkyboxMaterials as Array<{ obj: THREE.Mesh; originalMaterial: THREE.Material; newMaterial: THREE.MeshStandardMaterial }> | undefined
      if (convertedSkyboxMaterials && convertedSkyboxMaterials.length > 0) {
        convertedSkyboxMaterials.forEach(({ obj, originalMaterial, newMaterial }) => {
          // Restore original material
          obj.material = originalMaterial
          
          // Dispose PBR material we created
          if (newMaterial.map) {
            // Don't dispose the map - it's shared with original material
            newMaterial.map = null
          }
          newMaterial.dispose()
          
          console.log('[PathTracerDemo] 🔄 Restored GroundedSkybox original material:', {
            name: obj.name || 'Unnamed',
            originalMaterialType: originalMaterial.constructor?.name,
            restoredMaterialType: obj.material instanceof THREE.Material ? obj.material.constructor?.name : 'N/A'
          })
        })
        ;(this as any)._convertedSkyboxMaterials = null
        console.log('[PathTracerDemo] ✅ Restored GroundedSkybox original materials after path tracing')
      }
      
      // NOTE: Path tracer ground plane removal was moved to BEFORE shadow plane restoration
      // to ensure the standard shadow plane is visible and not covered by the path tracer ground plane
      
      // Remove any default lights created by the path tracer and restore original light transforms
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && obj.userData?.pathTracerCreated === true) {
          if (obj.parent) {
            obj.parent.remove(obj)
          } else {
            this.scene.remove(obj)
          }
          console.log('[PathTracerDemo] 🧹 Removed path-tracer-created light:', obj.name || 'Unnamed')
        }
      })
      if (this.originalDirectionalLights.length > 0) {
        this.originalDirectionalLights.forEach(({ light, position, targetPosition, intensity, castShadow, shadowProps }) => {
          light.position.copy(position)
          if (light.target) {
            light.target.position.copy(targetPosition)
          }
          light.intensity = intensity
          light.castShadow = castShadow
          if (light.shadow && shadowProps) {
            light.shadow.mapSize.width = shadowProps.mapSize.w
            light.shadow.mapSize.height = shadowProps.mapSize.h
            light.shadow.camera.near = shadowProps.near
            light.shadow.camera.far = shadowProps.far
            light.shadow.camera.left = shadowProps.left
            light.shadow.camera.right = shadowProps.right
            light.shadow.camera.top = shadowProps.top
            light.shadow.camera.bottom = shadowProps.bottom
            light.shadow.bias = shadowProps.bias
            light.shadow.normalBias = shadowProps.normalBias
            light.shadow.needsUpdate = true
          }
          console.log('[PathTracerDemo] 🔄 Restored light transform after path tracer:', {
            name: light.name || 'Unnamed',
            position: { x: position.x, y: position.y, z: position.z },
            target: { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }
          })
        })
        this.originalDirectionalLights = []
      }
      
      // CRITICAL: Restore shadow plane transform from saved original position
      // Do NOT recalculate - use the exact position it had before path tracer started
      // The "Reset shadow plane transform" code was incorrectly recalculating position,
      // causing the shadow plane to be moved to wrong locations (e.g., y: -50000)
      // NOTE: Position should already be restored in the hiddenShadowPlanes loop above,
      // but we check here as a safety net in case the loop didn't run or the plane wasn't in the list
      this.scene.traverse((obj) => {
        if (obj.userData?.isShadowPlane === true) {
          // Check if position was already restored (from the hiddenShadowPlanes loop above)
          // We check if the position is reasonable (not the fallback extreme value like -50000)
          // and if _restoredPosition exists in userData (set during restoration)
          // NOTE: We no longer set _pathTracerRestored flag, so only check position
          const wasAlreadyRestored = obj.position.y > -1000 && 
                                     obj.userData._restoredPosition
          
          type HiddenShadowPlane = {
            obj: THREE.Object3D
            wasVisible: boolean
            originalReceiveShadow?: boolean
            originalCastShadow?: boolean
            originalMaterial?: THREE.Material
            originalMaterialProps?: {
              opacity?: number
              transparent?: boolean
              color?: THREE.Color
              depthWrite?: boolean
              visible?: boolean
            }
            originalPosition?: THREE.Vector3
            originalRotation?: THREE.Euler
            originalScale?: THREE.Vector3
          }
          let savedPlane: HiddenShadowPlane | undefined = undefined
          let restoredFromSaved = false
          
          if (!wasAlreadyRestored) {
            // Try to restore from saved hidden shadow planes first (if still available)
            savedPlane = hiddenShadowPlanes?.find(sp => sp.obj === obj || sp.obj.uuid === obj.uuid)
            if (savedPlane && savedPlane.originalPosition && savedPlane.originalRotation && savedPlane.originalScale) {
              // Restore exact original transform
              obj.position.copy(savedPlane.originalPosition)
              obj.rotation.copy(savedPlane.originalRotation)
              obj.scale.copy(savedPlane.originalScale)
              // Store in userData for future checks
              obj.userData._restoredPosition = savedPlane.originalPosition.clone()
              obj.userData._restoredRotation = savedPlane.originalRotation.clone()
              obj.userData._restoredScale = savedPlane.originalScale.clone()
              restoredFromSaved = true
              console.log('[PathTracerDemo] ✅ Restored shadow plane transform from saved original:', {
                name: obj.name || 'Shadow Plane',
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
              })
            } else if (obj.userData._restoredPosition) {
              // Fallback: Use stored position from userData if available
              obj.position.copy(obj.userData._restoredPosition)
              obj.rotation.copy(obj.userData._restoredRotation)
              obj.scale.copy(obj.userData._restoredScale)
              restoredFromSaved = true
              console.log('[PathTracerDemo] ✅ Restored shadow plane transform from userData:', {
                name: obj.name || 'Shadow Plane',
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z }
              })
            } else {
              // Last resort: Only recalculate if we don't have saved position AND it wasn't already restored
              // This should rarely happen, but provides a safety net
              console.warn('[PathTracerDemo] ⚠️ No saved shadow plane transform found, recalculating (fallback)')
          const minY = Number.isFinite(sceneBounds?.minY ?? Infinity) ? sceneBounds!.minY : -0.001
          const targetY = Math.min(-0.001, (sceneBounds?.minY ?? -0.001) - 0.02)
          const center = sceneBounds?.center ?? new THREE.Vector3()
          obj.position.set(center.x, targetY, center.z)
          obj.rotation.set(-Math.PI / 2, 0, 0)
          obj.scale.set(1, 1, 1)
              restoredFromSaved = false
            }
          } else {
            // Position was already restored in the hiddenShadowPlanes loop - skip duplicate restoration
            restoredFromSaved = true
            console.log('[PathTracerDemo] ℹ️ Shadow plane transform already restored, skipping duplicate restoration')
          }

          // CRITICAL: Ensure shadow plane flags are correct (similar to weather system restoration)
          // This ensures shadow plane is properly visible and configured after path tracer
          if (obj instanceof THREE.Mesh && obj.material) {
            const desiredVisibility =
              shadowPlaneVisibility.get(obj) ??
              (showShadowPlaneFlag !== undefined ? !!showShadowPlaneFlag : true)
            obj.visible = desiredVisibility
            obj.receiveShadow = true
            obj.castShadow = false // Shadow plane should not cast shadows
            
            // Ensure shadow plane material has correct properties for shadow rendering
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            materials.forEach((mat) => {
              if (mat instanceof THREE.Material) {
                // CRITICAL: Ensure depthWrite is true for proper shadow rendering (like weather system does)
                if (mat.depthWrite !== true) {
                  mat.depthWrite = true
                }
                mat.needsUpdate = true
              }
            })
            
            console.log('[PathTracerDemo] ✅ Shadow plane properties restored (weather system pattern):', {
              name: obj.name || 'Shadow Plane',
              visible: obj.visible,
              receiveShadow: obj.receiveShadow,
              castShadow: obj.castShadow,
              position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
              materialType: materials[0]?.constructor?.name,
              depthWrite: materials[0] instanceof THREE.Material ? materials[0].depthWrite : 'N/A'
            })
          }

          console.log('[PathTracerDemo] 🔄 Reset shadow plane transform after path tracing:', {
            name: obj.name || 'Shadow Plane',
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
            showShadowPlaneFlag,
            storedVisibility: shadowPlaneVisibility.get(obj),
            restoredFromSaved,
            wasAlreadyRestored: obj.userData._pathTracerRestored && obj.userData._restoredPosition
          })
          
          // CRITICAL: Store position/rotation/scale restoration flags for position drift protection
          // BUT: DO NOT set _pathTracerRestored flag - this allows ViewerCanvas to manage material type
          // ViewerCanvas has render loop code that recalculates shadow plane position and material based on settings
          // We only protect position from drift, but allow ViewerCanvas to change material type based on user transparency setting
          if (!obj.userData) obj.userData = {}
          // Only set position restoration flags (for position drift protection)
          // DO NOT set _pathTracerRestored flag - ViewerCanvas needs to manage material type
          obj.userData._restoredPosition = savedPlane?.originalPosition ? {
            x: savedPlane.originalPosition.x,
            y: savedPlane.originalPosition.y,
            z: savedPlane.originalPosition.z
          } : {
            x: obj.position.x,
            y: obj.position.y,
            z: obj.position.z
          }
          obj.userData._restoredRotation = savedPlane?.originalRotation ? {
            x: savedPlane.originalRotation.x,
            y: savedPlane.originalRotation.y,
            z: savedPlane.originalRotation.z
          } : {
            x: obj.rotation.x,
            y: obj.rotation.y,
            z: obj.rotation.z
          }
          obj.userData._restoredScale = savedPlane?.originalScale ? {
            x: savedPlane.originalScale.x,
            y: savedPlane.originalScale.y,
            z: savedPlane.originalScale.z
          } : {
            x: obj.scale.x,
            y: obj.scale.y,
            z: obj.scale.z
          }
          // DO NOT store material restoration flags - ViewerCanvas will manage material type
          console.log('[PathTracerDemo] ✅ Stored position restoration flags (material flags NOT set - ViewerCanvas will manage material)')
        }
      })
      
      // CRITICAL: Restore complete original state, regardless of HDR status
      // First restore the saved scene background/environment and renderer settings
      const originalHdrState = (this as any)._originalHdrState
      
      if (originalHdrState) {
        console.log('[PathTracerDemo] 🔄 Restoring complete original state after path tracing', originalHdrState)
        
        // Restore renderer settings first
        if (originalHdrState.toneMappingExposure !== undefined) {
          this.renderer.toneMappingExposure = originalHdrState.toneMappingExposure
        }
        if (originalHdrState.shadowMapEnabled !== undefined) {
          this.renderer.shadowMap.enabled = originalHdrState.shadowMapEnabled
        }
        if (originalHdrState.shadowMapType !== undefined) {
          this.renderer.shadowMap.type = originalHdrState.shadowMapType
        }
        
        // Restore HDR system state if HDR system exists
        const hdrSystem = (window as any).__hdrSystem
        if (hdrSystem) {
          // CRITICAL: Check current HDR state in store to avoid unnecessary operations
          const currentStore = useAppStore.getState()
          const currentHdrEnabled = currentStore?.hdrEnabled ?? false
          
          // CRITICAL: Only restore HDR state if HDR was actually enabled before path tracer
          // If HDR was disabled, don't call any HDR methods to avoid flickering
          if (originalHdrState.hdrEnabled) {
            // HDR was enabled - restore all HDR settings
            // But only if current state doesn't match (to avoid flickering)
            if (currentHdrEnabled) {
              // HDR is already enabled - just restore settings without re-applying
              console.log('[PathTracerDemo] ✅ HDR already enabled - restoring settings without re-application to avoid flickering', {
                originalHdrEnabled: originalHdrState.hdrEnabled,
                currentHdrEnabled
              })
              
              // Restore ground projection state (only if it changed)
              if (typeof hdrSystem.setGroundProjectionEnabled === 'function') {
                const currentGroundProjection = currentStore?.hdrGroundProjectionEnabled ?? false
                if (currentGroundProjection !== (originalHdrState.hdrGroundProjectionEnabled ?? false)) {
                  hdrSystem.setGroundProjectionEnabled(originalHdrState.hdrGroundProjectionEnabled ?? false)
                  console.log('[PathTracerDemo] ✅ Restored HDR ground projection:', originalHdrState.hdrGroundProjectionEnabled)
                }
              }
              
              // Restore HDR background visibility (only if it changed)
              if (typeof hdrSystem.updateBackgroundVisibility === 'function') {
                const currentBackgroundVisible = currentStore?.hdrBackgroundVisible ?? true
                if (currentBackgroundVisible !== (originalHdrState.hdrBackgroundVisible ?? true)) {
                  hdrSystem.updateBackgroundVisibility(originalHdrState.hdrBackgroundVisible ?? true)
                  console.log('[PathTracerDemo] ✅ Restored HDR background visibility:', originalHdrState.hdrBackgroundVisible)
                }
              }
            } else {
              // HDR was enabled but got disabled - re-enable it
              console.log('[PathTracerDemo] 🔄 Re-enabling HDR (was disabled during path tracer)', {
                hdrUrl: originalHdrState.hdrUrl
              })
              
              // Restore ground projection state
              if (typeof hdrSystem.setGroundProjectionEnabled === 'function') {
                hdrSystem.setGroundProjectionEnabled(originalHdrState.hdrGroundProjectionEnabled ?? false)
              }
              
              // Re-apply HDR if we have a URL
              if (originalHdrState.hdrUrl && typeof hdrSystem.applyHDR === 'function') {
                const hdrIntensity = currentStore?.hdrIntensity ?? 1.0
                hdrSystem.applyHDR(originalHdrState.hdrUrl, hdrIntensity).then(() => {
                  this.scene.environment = this.originalEnvironment
                  console.log('[PathTracerDemo] ✅ Restored environment after HDR re-application')
                }).catch((err: any) => {
                  console.warn('[PathTracerDemo] ⚠️ Failed to re-apply HDR texture:', err)
                  this.scene.environment = this.originalEnvironment
                })
              } else {
                this.scene.environment = this.originalEnvironment
              }
            }
          } else {
            // HDR was NOT enabled - ensure it stays disabled
            if (currentHdrEnabled) {
              // HDR got enabled somehow - disable it to match original state
              console.log('[PathTracerDemo] ⚠️ HDR was enabled during path tracer but should be disabled - disabling now', {
                originalHdrEnabled: originalHdrState.hdrEnabled,
                currentHdrEnabled
              })
              if (typeof hdrSystem.disableHDR === 'function') {
                hdrSystem.disableHDR()
              }
            } else {
              // HDR is already disabled - don't call disableHDR() to avoid flickering
              console.log('[PathTracerDemo] ✅ HDR was disabled before path tracer - keeping it disabled (no flickering)', {
                originalHdrEnabled: originalHdrState.hdrEnabled,
                currentHdrEnabled
              })
            }
            // Restore environment immediately
            this.scene.environment = this.originalEnvironment
          }
        } else {
          // No HDR system - just restore environment
          this.scene.environment = this.originalEnvironment
        }
        
        // CRITICAL: Restore scene background AFTER all HDR operations complete
        // This ensures HDR system doesn't override our background restoration
        // Use setTimeout to ensure HDR operations complete first
        // Note: __pathTracerJustStopped flag is already set before stopCore() is called
        // IMPROVED: Perplexity finding - background restoration must be coordinated with all systems
        setTimeout(() => {
          if (this.originalBackground instanceof THREE.Color) {
            // CRITICAL: Create new Color instance to avoid reference issues
            const restoredColor = new THREE.Color(this.originalBackground.r, this.originalBackground.g, this.originalBackground.b)
            this.scene.background = restoredColor
            // Also update renderer clear color to match (for proper background display)
            this.renderer.setClearColor(restoredColor, 1.0)
            console.log('[PathTracerDemo] ✅ Restored original background color:', {
              r: restoredColor.r,
              g: restoredColor.g,
              b: restoredColor.b,
              hex: restoredColor.getHexString()
            })
          } else if (this.originalBackground instanceof THREE.Texture) {
            // CRITICAL: Restore the exact same texture instance that was saved
            this.scene.background = this.originalBackground
            // Reset clear color for texture backgrounds
            this.renderer.setClearColor(0x000000, 0)
            console.log('[PathTracerDemo] ✅ Restored original background texture:', {
              uuid: this.originalBackground.uuid,
              type: this.originalBackground.constructor?.name
            })
          } else if (this.originalBackground) {
            this.scene.background = this.originalBackground
            console.log('[PathTracerDemo] ✅ Restored original background')
          } else {
            this.scene.background = null
            this.renderer.setClearColor(0x000000, 0)
            console.log('[PathTracerDemo] ✅ Restored null background')
          }
          
          // Clear the flag after background restoration completes
          // This gives ViewerCanvas the all-clear to resume normal updates
          setTimeout(() => {
            ;(window as any).__pathTracerJustStopped = false
            ;(window as any).__pathTracerStopTime = undefined // Clear timestamp
          }, 150) // Additional delay to ensure all restoration is complete
        }, 50) // Initial delay to ensure HDR operations complete
        
        // Clear saved state
        ;(this as any)._originalHdrState = null
      } else {
        // Fallback: Restore from saved originalBackground/originalEnvironment if state wasn't saved
        // CRITICAL: Create a new Color instance if it's a Color to avoid reference issues
        // For Texture, restore the exact same texture instance
        if (this.originalBackground instanceof THREE.Color) {
          this.scene.background = new THREE.Color(this.originalBackground.r, this.originalBackground.g, this.originalBackground.b)
        } else if (this.originalBackground instanceof THREE.Texture) {
          this.scene.background = this.originalBackground
          console.log('[PathTracerDemo] ✅ Restored original background texture (fallback):', {
            uuid: this.originalBackground.uuid
          })
        } else {
          this.scene.background = this.originalBackground
        }
      this.scene.environment = this.originalEnvironment
      if (this.originalToneMappingExposure !== undefined) {
        this.renderer.toneMappingExposure = this.originalToneMappingExposure
      }
      
        // Fallback: Use current store state if we didn't save original state
        const hdrSystem = (window as any).__hdrSystem
        if (hdrSystem) {
          const store = useAppStore.getState()
          if (store) {
            const hdrEnabled = store.hdrEnabled
            const hdrBackgroundVisible = store.hdrBackgroundVisible ?? true
            
            if (hdrEnabled && typeof hdrSystem.updateBackgroundVisibility === 'function') {
              console.log('[PathTracerDemo] 🔄 Restoring HDR system state (fallback - no saved state)', {
                hdrEnabled,
                hdrBackgroundVisible
              })
              hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)
            }
            
            if (store.hdrGroundProjectionEnabled && typeof hdrSystem.setGroundProjectionEnabled === 'function') {
              console.log('[PathTracerDemo] 🔄 Restoring HDR ground projection (fallback)')
              hdrSystem.setGroundProjectionEnabled(true)
            }
          }
        }
      }
      
      // CRITICAL: Force shadow system to refresh after PT teardown (similar to weather system restoration)
      // Shadows must be fully re-enabled and all shadow maps regenerated
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap // Ensure soft shadows are enabled
      this.renderer.shadowMap.needsUpdate = true
      
      // Re-enable standard Three.js directional light shadows (similar to weather system)
      // This ensures shadows are properly restored after path tracer exits
      this.scene.traverse((obj) => {
        obj.updateMatrixWorld(true)
        
        // Re-enable directional lights with shadows (like weather system does)
        if (obj instanceof THREE.DirectionalLight && obj.userData?.isSun) {
          obj.castShadow = true // Restore standard shadows
          obj.visible = true // Ensure light is visible
          if (obj.shadow) {
            obj.shadow.needsUpdate = true
            obj.shadow.map?.dispose() // Force regeneration
            obj.shadow.map = null
          }
        } else if (obj instanceof THREE.Light && obj.shadow) {
          // Other lights: ensure shadow maps are regenerated
          obj.shadow.needsUpdate = true
          obj.shadow.map?.dispose() // Force regeneration
          obj.shadow.map = null
        }
        
        // Ensure all meshes can receive shadows
        if (obj instanceof THREE.Mesh) {
          obj.receiveShadow = true
          
          // CRITICAL: Shadow plane was already restored in the hiddenShadowPlanes loop above
          // Only ensure shadow properties are correct here (don't override position/material that was already restored)
          if (obj.userData?.isShadowPlane === true) {
            // Shadow plane was already restored above - just ensure shadow properties are correct
            // Don't override visibility, position, or material that was already restored
            obj.receiveShadow = true
            obj.castShadow = false // Shadow plane should not cast shadows
            
            // Ensure shadow plane material has depthWrite = true (critical for shadow rendering)
            const material = Array.isArray(obj.material) ? obj.material[0] : obj.material
            if (material instanceof THREE.Material && material.depthWrite !== true) {
              material.depthWrite = true
              material.needsUpdate = true
            }
          }
          
          // Update all materials to ensure they're ready for shadow rendering
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((mat) => {
            if (mat instanceof THREE.Material) {
              mat.needsUpdate = true
            }
          })
        }
      })
      
      // Force a render to regenerate shadow maps immediately
      this.renderer.setRenderTarget(null)
      this.renderer.autoClear = true
      this.renderer.clear()
      this.renderer.render(this.scene, this.camera)
      
      // Force a one-frame shadow refresh to ensure raster shadows reappear after PT
      try {
        // Ensure path tracing output is disabled and raster path is restored
        this.pathTracer.enablePathTracing = false
        this.pathTracer.pausePathTracing = false
        this.pathTracer.renderToCanvas = false
        this.renderer.setRenderTarget(null)
        this.renderer.autoClear = true
        this.renderer.clear(true, true, true)
        // Render twice to guarantee swap chain / color buffer is filled with raster
        this.renderer.render(this.scene, this.camera)
        this.renderer.render(this.scene, this.camera)
      } catch (e) {
        console.warn('[PathTracerDemo] Shadow refresh render failed after stop:', e)
      }
      
      // DEBUG: Capture complete state snapshot after restoration
      const stateAfterPT: any = {
        timestamp: new Date().toISOString(),
        scene: {
        background: this.scene.background ? (
          this.scene.background instanceof THREE.Color ? {
            type: 'Color',
            r: this.scene.background.r,
            g: this.scene.background.g,
            b: this.scene.background.b,
            hex: this.scene.background.getHexString()
          } : this.scene.background instanceof THREE.Texture ? {
            type: 'Texture',
            uuid: this.scene.background.uuid,
            image: this.scene.background.image ? { width: (this.scene.background.image as any).width, height: (this.scene.background.image as any).height } : null
          } : { type: 'Other', constructor: (this.scene.background as any).constructor?.name }
        ) : null,
        environment: this.scene.environment ? (
          this.scene.environment instanceof THREE.Texture ? {
            type: 'Texture',
            uuid: this.scene.environment.uuid
          } : { type: 'Other', constructor: (this.scene.environment as any).constructor?.name }
        ) : null,
          childrenCount: this.scene.children.length
        },
        renderer: {
          toneMappingExposure: this.renderer.toneMappingExposure,
          shadowMapEnabled: this.renderer.shadowMap.enabled,
          shadowMapType: this.renderer.shadowMap.type,
          autoClear: this.renderer.autoClear
        },
        hdrState: (() => {
          const store = useAppStore.getState()
          return store ? {
            hdrEnabled: store.hdrEnabled,
            hdrBackgroundVisible: store.hdrBackgroundVisible,
            hdrGroundProjectionEnabled: store.hdrGroundProjectionEnabled,
            hdrUrl: store.hdrUrl
          } : null
        })(),
        lights: (() => {
          const lights: any[] = []
          this.scene.traverse((obj) => {
            if (obj instanceof THREE.DirectionalLight) {
              lights.push({
                name: obj.name || 'Unnamed',
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                intensity: obj.intensity,
                castShadow: obj.castShadow
              })
            }
          })
          return lights
        })(),
        shadowPlanes: (() => {
          const planes: any[] = []
          this.scene.traverse((obj) => {
            if (obj.userData?.isShadowPlane === true || (obj as any).name === 'Shadow Plane') {
              const material = obj instanceof THREE.Mesh ? (Array.isArray(obj.material) ? obj.material[0] : obj.material) : null
              planes.push({
                name: obj.name || 'Shadow Plane',
                uuid: obj.uuid,
                visible: obj.visible,
                receiveShadow: obj instanceof THREE.Mesh ? obj.receiveShadow : undefined,
                castShadow: obj instanceof THREE.Mesh ? obj.castShadow : undefined,
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
                material: material ? {
                  type: material.constructor?.name,
                  uuid: material.uuid,
                  transparent: (material as any).transparent,
                  opacity: (material as any).opacity,
                  visible: (material as any).visible,
                  color: (material as any).color ? {
                    r: (material as any).color.r,
                    g: (material as any).color.g,
                    b: (material as any).color.b,
                    hex: (material as any).color.getHexString ? (material as any).color.getHexString() : 'N/A'
                  } : null
                } : null,
                inScene: obj.parent === this.scene || (obj.parent && this.scene.children.includes(obj.parent as any)),
                userData: obj.userData ? { ...obj.userData } : null
              })
            }
          })
          return planes
        })(),
        groundedSkyboxes: (() => {
          const skyboxes: any[] = []
          this.scene.traverse((obj) => {
            if (obj.userData?.isGroundedSkybox === true || (obj as any).isGroundedSkybox === true) {
              skyboxes.push({
                name: obj.name || 'GroundedSkybox',
                visible: obj.visible
              })
            }
          })
          return skyboxes
        })(),
        groundPlaneRemoved: this.groundPlaneMesh === null
      }
      console.log('[PathTracerDemo] 📸 COMPLETE STATE AFTER PATH TRACER RESTORATION:', JSON.stringify(stateAfterPT, null, 2))
      console.log('[PathTracerDemo] 📸 COMPLETE STATE AFTER PATH TRACER RESTORATION (readable):', stateAfterPT)
      
      // Compare before and after
      const originalState = (this as any)._stateBeforePT
      if (originalState) {
        console.log('[PathTracerDemo] 🔍 STATE COMPARISON:')
        
        // Compare background - check UUID for textures, hex for colors
        let backgroundMatch = false
        if (originalState.scene.background === null && stateAfterPT.scene.background === null) {
          backgroundMatch = true
        } else if (originalState.scene.background?.type === 'Color' && stateAfterPT.scene.background?.type === 'Color') {
          backgroundMatch = originalState.scene.background.hex === stateAfterPT.scene.background.hex
        } else if (originalState.scene.background?.type === 'Texture' && stateAfterPT.scene.background?.type === 'Texture') {
          // For textures, compare UUID to ensure it's the same texture instance
          backgroundMatch = originalState.scene.background.uuid === stateAfterPT.scene.background.uuid
        }
        console.log('[PathTracerDemo] 🔍 Background match:', backgroundMatch, {
          before: originalState.scene.background,
          after: stateAfterPT.scene.background
        })
        
        console.log('[PathTracerDemo] 🔍 Shadow map enabled match:', 
          originalState.renderer.shadowMapEnabled === stateAfterPT.renderer.shadowMapEnabled)
        console.log('[PathTracerDemo] 🔍 Tone mapping exposure match:', 
          Math.abs((originalState.renderer.toneMappingExposure || 0) - (stateAfterPT.renderer.toneMappingExposure || 0)) < 0.001)
        console.log('[PathTracerDemo] 🔍 Environment match:', 
          originalState.scene.environment?.uuid === stateAfterPT.scene.environment?.uuid ||
          (originalState.scene.environment === null && stateAfterPT.scene.environment === null))
        
        // Compare shadow planes
        console.log('[PathTracerDemo] 🔍 SHADOW PLANE COMPARISON:')
        const beforePlanes = originalState.shadowPlanes || []
        const afterPlanes = stateAfterPT.shadowPlanes || []
        console.log('[PathTracerDemo] 🔍 Shadow plane count - Before:', beforePlanes.length, 'After:', afterPlanes.length)
        
        if (beforePlanes.length === 0 && afterPlanes.length === 0) {
          console.log('[PathTracerDemo] 🔍 No shadow planes found in either state')
        } else if (beforePlanes.length !== afterPlanes.length) {
          console.warn('[PathTracerDemo] ⚠️ Shadow plane count mismatch!', {
            before: beforePlanes.length,
            after: afterPlanes.length
          })
        } else {
          beforePlanes.forEach((beforePlane: any, index: number) => {
            const afterPlane = afterPlanes[index]
            if (afterPlane) {
              const matches = {
                uuid: beforePlane.uuid === afterPlane.uuid,
                visible: beforePlane.visible === afterPlane.visible,
                receiveShadow: beforePlane.receiveShadow === afterPlane.receiveShadow,
                castShadow: beforePlane.castShadow === afterPlane.castShadow,
                position: Math.abs(beforePlane.position.x - afterPlane.position.x) < 0.001 &&
                         Math.abs(beforePlane.position.y - afterPlane.position.y) < 0.001 &&
                         Math.abs(beforePlane.position.z - afterPlane.position.z) < 0.001,
                rotation: Math.abs(beforePlane.rotation.x - afterPlane.rotation.x) < 0.001 &&
                         Math.abs(beforePlane.rotation.y - afterPlane.rotation.y) < 0.001 &&
                         Math.abs(beforePlane.rotation.z - afterPlane.rotation.z) < 0.001,
                scale: Math.abs(beforePlane.scale.x - afterPlane.scale.x) < 0.001 &&
                       Math.abs(beforePlane.scale.y - afterPlane.scale.y) < 0.001 &&
                       Math.abs(beforePlane.scale.z - afterPlane.scale.z) < 0.001,
                materialType: beforePlane.material?.type === afterPlane.material?.type,
                materialUuid: beforePlane.material?.uuid === afterPlane.material?.uuid,
                materialOpacity: Math.abs((beforePlane.material?.opacity ?? 1) - (afterPlane.material?.opacity ?? 1)) < 0.001,
                materialTransparent: beforePlane.material?.transparent === afterPlane.material?.transparent,
                materialVisible: beforePlane.material?.visible === afterPlane.material?.visible,
                materialColor: beforePlane.material?.color && afterPlane.material?.color ? (
                  Math.abs((beforePlane.material.color.r ?? 0) - (afterPlane.material.color.r ?? 0)) < 0.001 &&
                  Math.abs((beforePlane.material.color.g ?? 0) - (afterPlane.material.color.g ?? 0)) < 0.001 &&
                  Math.abs((beforePlane.material.color.b ?? 0) - (afterPlane.material.color.b ?? 0)) < 0.001
                ) : (beforePlane.material?.color === null && afterPlane.material?.color === null),
                inScene: beforePlane.inScene === afterPlane.inScene
              }
              
              // Check if all critical properties match (visible is controlled by UI settings, so it's OK if it differs)
              const criticalMatches = {
                uuid: matches.uuid,
                position: matches.position,
                rotation: matches.rotation,
                scale: matches.scale,
                materialType: matches.materialType,
                materialUuid: matches.materialUuid,
                materialOpacity: matches.materialOpacity,
                materialTransparent: matches.materialTransparent,
                materialColor: matches.materialColor,
                receiveShadow: matches.receiveShadow,
                castShadow: matches.castShadow
              }
              const allCriticalMatch = Object.values(criticalMatches).every(v => v === true)
              
              if (allCriticalMatch) {
                // All critical properties match - visibility difference is OK (controlled by UI)
                if (matches.visible) {
                  console.log(`[PathTracerDemo] ✅ Shadow plane ${index + 1} fully restored:`, {
                    name: beforePlane.name,
                    matches
                  })
                } else {
                  console.log(`[PathTracerDemo] ✅ Shadow plane ${index + 1} restored (visibility differs due to UI settings):`, {
                    name: beforePlane.name,
                    matches: criticalMatches,
                    visibilityNote: `Before: ${beforePlane.visible}, After: ${afterPlane.visible} (UI controlled)`
                  })
                }
              } else {
                // Some critical properties don't match - log warning
                console.warn(`[PathTracerDemo] ⚠️ Shadow plane ${index + 1} restoration issues:`, {
                  name: beforePlane.name,
                  matches,
                  criticalMatches,
                  before: beforePlane,
                  after: afterPlane,
                  materialDetails: {
                    before: {
                      type: beforePlane.material?.type,
                      uuid: beforePlane.material?.uuid,
                      opacity: beforePlane.material?.opacity,
                      transparent: beforePlane.material?.transparent,
                      color: beforePlane.material?.color
                    },
                    after: {
                      type: afterPlane.material?.type,
                      uuid: afterPlane.material?.uuid,
                      opacity: afterPlane.material?.opacity,
                      transparent: afterPlane.material?.transparent,
                      color: afterPlane.material?.color
                    }
                  }
                })
              }
            } else {
              console.error(`[PathTracerDemo] ❌ Shadow plane ${index + 1} missing after restoration!`, {
                before: beforePlane
              })
            }
          })
        }
      }
    }
    
    try {
      // CRITICAL: Set a flag BEFORE calling stopCore() to prevent ViewerCanvas from modifying restored state
      // ViewerCanvas effects might run right after stop() and override our restoration
      // This flag tells ViewerCanvas to wait a bit before applying its own updates
      // The flag will be cleared after background restoration completes (in stopCore's setTimeout)
      ;(window as any).__pathTracerJustStopped = true
      ;(window as any).__pathTracerStopTime = Date.now() // Track when path tracer stopped

      stopCore()
      
    } catch (err) {
      console.error('[PathTracerDemo] stop() encountered an error during teardown:', err)
      // Clear flag even on error after a delay
      setTimeout(() => {
        ;(window as any).__pathTracerJustStopped = false
        ;(window as any).__pathTracerStopTime = undefined // Clear timestamp
      }, 200)
    } finally {
      this._isStopping = false
    }
  }

  /**
   * Update camera (call when camera changes)
   * 
   * BEST PRACTICE: Only call when camera actually moves/changes
   * - Automatically called via controls 'change' event listener (if controls provided)
   * - Calling every frame is unnecessary and resets accumulation
   * - Path tracers accumulate samples over time - frequent camera updates reduce quality
   */
  updateCamera(): void {
    this.pathTracer.updateCamera()
  }

  /**
   * Update materials (call when materials change)
   */
  updateMaterials(): void {
    this.pathTracer.updateMaterials()
  }

  /**
   * Update lights (call when lights change)
   */
  updateLights(): void {
    this.pathTracer.updateLights()
  }

  /**
   * Update environment (call when environment changes, e.g., when HDR is loaded)
   * Re-checks HDRSystem for original HDR texture and sets up environment accordingly
   */
  updateEnvironment(): void {
    console.log('[PathTracerDemo] 🔄 Updating environment...')
    
    // Re-run setupEnvironment to check if HDR is now available
    // This allows the path tracer to pick up HDR that was loaded after initialization
    const previousEnvironment = this.scene.environment
    this.setupEnvironment()
    
    // Log environment change
    const newEnvironment = this.scene.environment
    const environmentChanged = previousEnvironment !== newEnvironment
    console.log('[PathTracerDemo] 🔄 Environment check complete:', {
      environmentChanged,
      previousType: previousEnvironment?.constructor?.name || 'null',
      newType: newEnvironment?.constructor?.name || 'null',
      isHDR: newEnvironment && newEnvironment !== this.gradientMap,
      hasImage: !!(newEnvironment as any)?.image,
      hasData: !!(newEnvironment as any)?.image?.data
    })
    
    // Update the path tracer's internal environment state
    try {
    this.pathTracer.updateEnvironment()
      console.log('[PathTracerDemo] ✅ Path tracer environment updated successfully')
      
      // Verify the update worked by checking the material
      const material = (this.pathTracer as any)._pathTracer?.material
      if (material) {
        const hasEnvMapInfo = !!material.envMapInfo
        const hasBackgroundMap = !!material.backgroundMap
        console.log('[PathTracerDemo] 📊 Path tracer material state:', {
          hasEnvMapInfo,
          hasBackgroundMap,
          envMapInfoMap: !!material.envMapInfo?.map,
          backgroundMapType: material.backgroundMap?.constructor?.name || 'null'
        })
      }
    } catch (error) {
      console.error('[PathTracerDemo] ❌ Error updating path tracer environment:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[PathTracerDemo] Error details:', {
        message: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
        sceneEnvironment: this.scene.environment?.constructor?.name || 'null',
        sceneBackground: this.scene.background?.constructor?.name || 'null'
      })
      // Don't throw - allow fallback to gradient
    }
  }

  /**
   * Reset the path tracer (restart accumulation)
   */
  reset(): void {
    this.accumulatedSamples = 0
    this.maxSamplesReached = false
    this.pausedAtMax = false
    this.params.pause = false // Clear pause state on reset
    this._frameSampleIncremented = false
    this._lastPathTracerSamples = 0
    this._lastTotalTiles = 0
    
    // CRITICAL: If running, reset the path tracer but ensure it continues rendering
    // If not running, we still reset but need to ensure viewer can render normally
    const wasRunning = this._isRunning
    this.pathTracer.reset()
    
    // CRITICAL: After pathTracer.reset(), ensure maxSamples is still undefined
    // pathTracer.reset() might reset internal state, so we need to explicitly
    // disable the internal maxSamples check again
    ;(this.pathTracer as any).maxSamples = undefined
    
    // CRITICAL: If was running, ensure path tracer continues to render after reset
    // Reset clears the render target, so we need to ensure it starts accumulating again
    if (wasRunning) {
      // Ensure path tracer is enabled and will continue rendering
      this.pathTracer.enablePathTracing = true
      this.pathTracer.renderToCanvas = true
      this.pathTracer.pausePathTracing = false
      console.log('[PathTracerDemo] Reset while running - path tracer will continue rendering')
    } else {
      // Not running - ensure renderer is set to main canvas and restore normal rendering
      // This prevents black screen after reset when path tracer is stopped
      this.renderer.setRenderTarget(null)
      this.renderer.autoClear = true
      
      // CRITICAL: Ensure path tracer is disabled so viewer's normal render loop can work
      this.pathTracer.enablePathTracing = false
      this.pathTracer.renderToCanvas = false
      this.pathTracer.pausePathTracing = false
      
      // Force a render to show the scene (not black)
      try {
        this.renderer.clear(true, true, true)
        this.renderer.render(this.scene, this.camera)
      } catch (error) {
        console.warn('[PathTracerDemo] Error rendering scene after reset:', error)
      }
      
      console.log('[PathTracerDemo] Reset while not running - restored viewer render')
    }
  }

  /**
   * Get current sample count
   */
  getSampleCount(): number {
    // CRITICAL: Use accumulatedSamples as the primary counter because pathTracer.samples
    // counts tiles, not complete screen renders. With 4x4 tiles, pathTracer.samples increments
    // by 16 per frame, not 1. We want to count complete frames, not tiles.
    // accumulatedSamples is incremented once per renderFrame() call, which is correct.
    return this.accumulatedSamples
  }

  /**
   * Enable/disable path tracing
   */
  setEnabled(enabled: boolean): void {
    this.params.enable = enabled
  }

  /**
   * Pause/resume path tracing
   */
  setPaused(paused: boolean): void {
    this.params.pause = paused
    // CRITICAL: Immediately update pausePathTracing flag so pause/resume works correctly
    if (this.pathTracer) {
      this.pathTracer.pausePathTracing = paused
    }

    if (paused) {
      this.releaseTransformInteractionForPausedViewing()
    }
    
    // CRITICAL: If resuming from pause at max, clear the pause-at-max flags
    // This allows the user to resume after reaching max samples
    if (!paused && this.pausedAtMax) {
      console.log('[PathTracerDemo] Resuming from pause at max - clearing pause-at-max flags')
      this.pausedAtMax = false
      this.maxSamplesReached = false
    }
  }

  /**
   * Set tone mapping (ACES Filmic)
   */
  setToneMapping(enabled: boolean): void {
    this.params.toneMapping = enabled
    // Update exposure when tone mapping changes
    if (enabled && !this.renderer.toneMappingExposure) {
      this.renderer.toneMappingExposure = 1.2
    }
  }
  
  /**
   * Set tone mapping exposure (brightness control)
   * Higher values = brighter image (good for dark scenes)
   * Lower values = darker image (good for bright scenes)
   * Recommended range: 0.5 - 2.0
   */
  setToneMappingExposure(exposure: number): void {
    if (this.params.toneMapping) {
      this.renderer.toneMappingExposure = Math.max(0.1, Math.min(5.0, exposure))
    }
  }

  /**
   * Set resolution scale
   */
  setResolutionScale(scale: number): void {
    // CRITICAL: Only reset if scale actually changed to avoid unnecessary resets
    if (this.config.resolutionScale === scale) {
      // Value hasn't changed - just update internal state without resetting
      this.pathTracer.renderScale = scale
      this.config.resolutionScale = scale
      return
    }
    
    // CRITICAL: Don't reset if paused at max samples - this would clear the pause state
    // and potentially cause the path tracer to exit. Resolution can be changed after download.
    if (this.pausedAtMax) {
      console.log('[PathTracerDemo] ⚠️ Resolution scale change requested while paused at max - deferring reset until resume', {
        currentScale: this.config.resolutionScale,
        requestedScale: scale,
        accumulatedSamples: this.accumulatedSamples
      })
      // Still update the config so it applies on next start/resume
      this.pathTracer.renderScale = scale
      this.config.resolutionScale = scale
      return
    }
    
    this.pathTracer.renderScale = scale
    this.config.resolutionScale = scale
    this.reset()
  }

  /**
   * Set tile count
   */
  setTiles(tiles: number): void {
    const clamped = Math.max(1, Math.floor(tiles) || 1)
    // CRITICAL: Only reset if tiles actually changed to avoid unnecessary resets
    if (this.config.tiles === clamped) {
      // Value hasn't changed - just update internal state without resetting
    this.pathTracer.tiles.set(clamped, clamped)
    this.config.tiles = clamped
      return
    }
    
    // CRITICAL: Don't reset if paused at max samples - this would clear the pause state
    // and potentially cause the path tracer to exit. Tiles can be changed after download.
    if (this.pausedAtMax) {
      console.log('[PathTracerDemo] ⚠️ Tiles change requested while paused at max - deferring reset until resume', {
        currentTiles: this.config.tiles,
        requestedTiles: clamped,
        accumulatedSamples: this.accumulatedSamples
      })
      // Still update the config so it applies on next start/resume
      this.pathTracer.tiles.set(clamped, clamped)
      this.config.tiles = clamped
      return
    }
    
    this.pathTracer.tiles.set(clamped, clamped)
    this.config.tiles = clamped
    // CRITICAL: Reset tile tracking when tiles change to prevent incorrect frame detection
    // When tiles change, pathTracer.samples resets, so we need to reset our tracking too
    this._lastPathTracerSamples = 0
    this._frameSampleIncremented = false
    // Reset accumulation to rebuild targets/viewport with new tiling
    this.reset()
  }

  /**
   * Set maximum samples
   */
  setMaxSamples(maxSamples: number): void {
    // CRITICAL: Only reset if maxSamples actually changed to avoid unnecessary resets
    const currentMax = this.params.maxSamples
    if (currentMax === maxSamples) {
      // Value hasn't changed - just update internal state without resetting
      // CRITICAL: Explicitly set pathTracer.maxSamples to undefined to prevent internal pause logic
      ;(this.pathTracer as any).maxSamples = undefined
      this.params.maxSamples = maxSamples
      this.config.maxSamples = maxSamples
      return
    }
    
    // CRITICAL: Explicitly set pathTracer.maxSamples to undefined to prevent WebGLPathTracer's
    // internal pause logic from triggering. We handle maxSamples checking ourselves.
    ;(this.pathTracer as any).maxSamples = undefined
    this.params.maxSamples = maxSamples
    this.config.maxSamples = maxSamples
    this.reset()
  }

  /**
   * Clear maximum samples (no limit)
   */
  clearMaxSamples(): void {
    // CRITICAL: Only reset if maxSamples was actually set (not already cleared)
    const wasSet = this.params.maxSamples !== undefined
    if (!wasSet) {
      // Already cleared - just update internal state without resetting
      // CRITICAL: Explicitly set pathTracer.maxSamples to undefined to prevent internal pause logic
      ;(this.pathTracer as any).maxSamples = undefined
      this.params.maxSamples = undefined
      this.config.maxSamples = undefined
      return
    }
    
    // CRITICAL: Explicitly set pathTracer.maxSamples to undefined to prevent WebGLPathTracer's
    // internal pause logic from triggering. We handle maxSamples checking ourselves.
    ;(this.pathTracer as any).maxSamples = undefined
    this.params.maxSamples = undefined
    this.config.maxSamples = undefined
    this.reset()
  }

  /**
   * Set number of bounces
   */
  setBounces(bounces: number): void {
    this.pathTracer.bounces = bounces
  }

  /**
   * Set minimum samples before displaying path-traced output
   */
  setMinSamples(samples: number): void {
    this.pathTracer.minSamples = samples
    this.config.minSamples = samples
  }

  /**
   * Set denoise toggle/strength (if supported by the underlying path tracer)
   */
  setDenoise(enabled: boolean, strength?: number): void {
    ;(this.pathTracer as any).denoiseEnabled = enabled
    this.config.denoiseEnabled = enabled
    if (strength !== undefined && 'denoiseStrength' in (this.pathTracer as any)) {
      ;(this.pathTracer as any).denoiseStrength = strength
      this.config.denoiseStrength = strength
    }
  }

  /**
   * Enable/disable raster preview while interacting (orbit/pan). When disabled, the last GPU path-traced
   * frame is kept instead of raster fallback. Default: enabled.
   */
  setPreviewWhileInteractive(enabled: boolean): void {
    this.config.previewWhileInteractive = enabled
    if (!this.pathTracer) return
    if (enabled) {
      this.pathTracer.rasterizeSceneCallback =
        this.originalRasterizeCallback ||
        ((scene: THREE.Scene, camera: THREE.Camera) => {
          this.originalRasterizeCallback?.(scene, camera)
        })
    } else {
      this.pathTracer.rasterizeSceneCallback = noopRasterize
    }
  }

  /**
   * Check if path tracer is currently running
   */
  isRunning(): boolean {
    return this._isRunning
  }

  /**
   * Whether rendering is paused because maxSamples was reached.
   */
  isPausedAtMax(): boolean {
    return this.pausedAtMax
  }

  /**
   * Download current render as image
   */
  downloadImage(filename: string = 'pathtraced-render.png'): void {
    try {
      console.log('[PathTracerDemo] 📥 Starting image download...', {
        isRunning: this._isRunning,
        pausedAtMax: this.pausedAtMax,
        accumulatedSamples: this.accumulatedSamples,
        hasTarget: !!this.pathTracer?.target,
        renderToCanvas: this.pathTracer?.renderToCanvas
      })

      const captureFromRenderTarget = (): string | null => {
        if (!this.pathTracer?.target) return null

        const targetRT = this.pathTracer.target
        const targetWidth = targetRT.width
        const targetHeight = targetRT.height
        if (targetWidth <= 0 || targetHeight <= 0) return null

        const oldRenderTarget = this.renderer.getRenderTarget()
        const oldAutoClear = this.renderer.autoClear

        try {
          if (this._isRunning) {
            this.pathTracer.enablePathTracing = true
            this.pathTracer.renderToCanvas = true
            this.pathTracer.pausePathTracing = this.pausedAtMax || this.params.pause
            this.pathTracer.renderSample()
          }

          const dataUrl = readRenderTargetToDataUrl(
            this.renderer,
            targetRT,
            targetWidth,
            targetHeight
          )

          const pixels = new Uint8Array(targetWidth * targetHeight * 4)
          this.renderer.readRenderTargetPixels(targetRT, 0, 0, targetWidth, targetHeight, pixels)
          let hasNonBlackPixels = false
          const sampleSize = Math.min(10000, pixels.length)
          const sampleStep = Math.max(1, Math.floor(sampleSize / 1000))
          for (let i = 0; i < sampleSize; i += sampleStep * 4) {
            if (pixels[i] > 5 || pixels[i + 1] > 5 || pixels[i + 2] > 5) {
              hasNonBlackPixels = true
              break
            }
          }

          if (!hasNonBlackPixels) {
            console.warn('[PathTracerDemo] ⚠️ Render target appears empty, falling back to renderer frame')
            return null
          }

          return dataUrl
        } finally {
          this.renderer.setRenderTarget(oldRenderTarget)
          this.renderer.autoClear = oldAutoClear
        }
      }

      if (this.pathTracer?.renderToCanvas && this.renderer.domElement) {
        console.log('[PathTracerDemo] Reading from main canvas (renderToCanvas is enabled)')
        downloadDataUrl(filename, readRendererFrameToDataUrl(this.renderer))
        console.log('[PathTracerDemo] ✅ Image downloaded from renderer frame')
        return
      }

      const renderTargetDataUrl = captureFromRenderTarget()
      if (renderTargetDataUrl) {
        console.log('[PathTracerDemo] ✅ Image downloaded from render target')
        downloadDataUrl(filename, renderTargetDataUrl)
        return
      }

      console.log('[PathTracerDemo] Using fallback: downloading from renderer frame')
      downloadDataUrl(filename, readRendererFrameToDataUrl(this.renderer))
      console.log('[PathTracerDemo] ✅ Image downloaded from renderer frame (fallback)')
    } catch (error) {
      console.error('[PathTracerDemo] Error downloading image:', error)
      try {
        downloadDataUrl(filename, readRendererFrameToDataUrl(this.renderer))
      } catch (fallbackError) {
        console.error('[PathTracerDemo] Fallback download failed:', fallbackError)
      }
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop(true)
    
    // Restore original material properties on ground planes if modified
    if (this.groundPlaneMesh) {
      // Dispose created ground plane
      if (this.groundPlaneMesh.parent) {
        this.scene.remove(this.groundPlaneMesh)
      }
      if (this.groundPlaneMesh.geometry) {
        this.groundPlaneMesh.geometry.dispose()
      }
      const materials = Array.isArray(this.groundPlaneMesh.material) 
        ? this.groundPlaneMesh.material 
        : [this.groundPlaneMesh.material]
      materials.forEach(mat => {
        if (mat instanceof THREE.Material) {
          mat.dispose()
        }
      })
      this.groundPlaneMesh = null
    }
    
    // Restore original material properties on modified ground planes
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat, matIndex) => {
          if (mat.userData?.pathTracerModified === true) {
            // Check if we converted from ShadowMaterial
            if (mat.userData.wasShadowMaterial === true && mat.userData.originalMaterial) {
              // Restore original ShadowMaterial
              const originalMaterial = mat.userData.originalMaterial as THREE.ShadowMaterial
              if (Array.isArray(obj.material)) {
                obj.material[matIndex] = originalMaterial
              } else {
                obj.material = originalMaterial
              }
              
              // Dispose the PBR material we created
              if (mat instanceof THREE.Material) {
                mat.dispose()
              }
              
              console.log('[PathTracerDemo] 🔄 Restored ShadowMaterial on ground plane:', {
                name: obj.name || 'Unnamed'
              })
            } else if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
              // Restore original roughness and metalness
              if (mat.userData.originalRoughness !== undefined) {
                mat.roughness = mat.userData.originalRoughness
              }
              if (mat.userData.originalMetalness !== undefined) {
                mat.metalness = mat.userData.originalMetalness
              }
              // Restore original opacity if it was adjusted
              if (mat.userData.opacityAdjusted && mat.userData.originalOpacity !== undefined) {
                mat.opacity = mat.userData.originalOpacity
              }
              delete mat.userData.opacityAdjusted
              mat.needsUpdate = true
            }
            
            // Clean up userData
            delete mat.userData.pathTracerModified
            delete mat.userData.originalRoughness
            delete mat.userData.originalMetalness
            delete mat.userData.wasShadowMaterial
            delete mat.userData.originalMaterial
            delete mat.userData.originalOpacity
            delete mat.userData.disposeOriginalOnCleanup
          }
        })
      }
    })
    
    // Dispose masked HDR texture if it exists
    if (this.maskedHDRTexture) {
      // Only dispose if it's not the original texture (which is managed by HDRSystem)
      // Check if it's a masked texture by comparing with gradientMap (they should never be equal)
      const isManagedTexture = this.maskedHDRTexture === this.gradientMap
      if (!isManagedTexture) {
        try {
          this.maskedHDRTexture.dispose()
        } catch (error) {
          console.warn('[PathTracerDemo] Error disposing masked HDR texture:', error)
        }
      }
      this.maskedHDRTexture = null
    }
    
    // Dispose color texture if it exists
    if (this.colorTexture) {
      try {
        this.colorTexture.dispose()
        this.colorTexture = null
      } catch (error) {
        console.warn('[PathTracerDemo] Error disposing color texture:', error)
      }
    }
    
    // Note: WebGLPathTracer doesn't have a dispose method, but we clean up our resources
    this.gradientMap = null as any
  }

  /**
   * Get path tracer instance (for advanced usage)
   */
  getPathTracer(): WebGLPathTracer {
    return this.pathTracer
  }

  /**
   * Helper to get WebGL error name
   */
  private getWebGLErrorName(error: number): string {
    const gl = this.renderer.getContext() as WebGL2RenderingContext
    if (!gl) return 'Unknown'
    
    const errorMap: Record<number, string> = {
      [gl.NO_ERROR]: 'NO_ERROR',
      [gl.INVALID_ENUM]: 'INVALID_ENUM',
      [gl.INVALID_VALUE]: 'INVALID_VALUE',
      [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
      [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
      [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
      [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL'
    }
    
    return errorMap[error] || `Unknown (${error})`
  }
}

/**
 * Helper function to create a simple test scene with geometric objects
 */
export function createTestScene(): {
  scene: THREE.Scene
  objects: THREE.Object3D[]
  floor: THREE.Mesh
} {
  const scene = new THREE.Scene()
  const objects: THREE.Object3D[] = []
  const group = new THREE.Group()

  // Sphere
  const sphereGeometry = new THREE.SphereGeometry(1, 32, 32)
  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6b6b,
    roughness: 0.3,
    metalness: 0.7,
  })
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
  sphere.position.set(-2, 1, 0)
  group.add(sphere)
  objects.push(sphere)

  // Box
  const boxGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5)
  const boxMaterial = new THREE.MeshStandardMaterial({
    color: 0x4ecdc4,
    roughness: 0.2,
    metalness: 0.8,
  })
  const box = new THREE.Mesh(boxGeometry, boxMaterial)
  box.position.set(2, 0.75, 0)
  group.add(box)
  objects.push(box)

  // Torus
  const torusGeometry = new THREE.TorusGeometry(0.8, 0.4, 16, 100)
  const torusMaterial = new THREE.MeshStandardMaterial({
    color: 0x95e1d3,
    roughness: 0.1,
    metalness: 0.9,
  })
  const torus = new THREE.Mesh(torusGeometry, torusMaterial)
  torus.position.set(0, 1.2, -2)
  group.add(torus)
  objects.push(torus)

  // Cylinder
  const cylinderGeometry = new THREE.CylinderGeometry(0.6, 0.6, 2, 32)
  const cylinderMaterial = new THREE.MeshStandardMaterial({
    color: 0xf38181,
    roughness: 0.4,
    metalness: 0.6,
  })
  const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
  cylinder.position.set(-2, 1, -2)
  group.add(cylinder)
  objects.push(cylinder)

  scene.add(group)

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(5, 10, 5)
  scene.add(directionalLight)

  const pointLight = new THREE.PointLight(0xffffff, 0.8)
  pointLight.position.set(-5, 8, 5)
  scene.add(pointLight)

  // Floor
  const floorGeometry = new THREE.PlaneGeometry(1, 1)
  const floorTexture = generateRadialFloorTexture(1024)
  const floor = new THREE.Mesh(
    floorGeometry,
    new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.15,
      metalness: 0.9,
      map: floorTexture,
      transparent: true,
    })
  )

  const bbox = new THREE.Box3().setFromObject(group)
  const maxDim = Math.max(
    bbox.getSize(new THREE.Vector3()).x,
    bbox.getSize(new THREE.Vector3()).y,
    bbox.getSize(new THREE.Vector3()).z
  )

  floor.scale.setScalar(maxDim * 10)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = bbox.min.y - 0.01
  scene.add(floor)

  return { scene, objects, floor }
}

/**
 * Generate radial floor texture
 */
function generateRadialFloorTexture(dim: number): THREE.DataTexture {
  const data = new Uint8Array(dim * dim * 4)

  for (let x = 0; x < dim; x++) {
    for (let y = 0; y < dim; y++) {
      const xNorm = x / (dim - 1)
      const yNorm = y / (dim - 1)

      const xCent = 2.0 * (xNorm - 0.5)
      const yCent = 2.0 * (yNorm - 0.5)
      let a = Math.max(Math.min(1.0 - Math.sqrt(xCent ** 2 + yCent ** 2), 1.0), 0.0)
      a = a ** 1.5
      a = a * 1.5
      a = Math.min(a, 1.0)

      const i = y * dim + x
      data[i * 4 + 0] = 255
      data[i * 4 + 1] = 255
      data[i * 4 + 2] = 255
      data[i * 4 + 3] = a * 255
    }
  }

  const tex = new THREE.DataTexture(data, dim, dim)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

