import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import {
  shadowPlaneYForHdrMode,
  groundProjectionShadowParamsFromStore,
  resolveGroundProjectionActive
} from './hdrGroundShadowCatcher'
import { computeLightDirection } from './lightGizmos'
import { CSMShadowSystem, CSMConfig } from '../effects/CSMShadowSystem'
import {
  applyAdaptiveDirectionalShadowBias,
  applyPhysicalDirectionalShadowDefaults,
  applyPhysicalOmnidirectionalShadowDefaults,
  applyPhysicalSpotShadowDefaults,
  computePointLightShadowFar,
  computeSpotLightShadowFar,
  computeTightShadowFrustum,
  PHYSICAL_DIRECTIONAL_SHADOW_RADIUS,
  PHYSICAL_OMNI_SHADOW_FAR_INITIAL
} from './physicalShadowSettings'

export type ShadowSystemType = 'standard' | 'csm' | 'streetsgl'

export interface ShadowManagerConfig {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  parent: THREE.Object3D
}

/** Scratch objects reused across bounds collection / application (PERF-2). */
const _meshBox = new THREE.Box3()
const _collectBox = new THREE.Box3()
const _workingBox = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _lightDir = new THREE.Vector3()
const _shadowCamPos = new THREE.Vector3()
const _expandPoint = new THREE.Vector3()

const BOUNDS_EPS = 1e-4

interface AppliedShadowBoundsState {
  hasObjects: boolean
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
  mapSize: number
  adaptive: boolean
  biasOverride: number
  normalBiasOverride: number
  groundProjection: boolean
  gpRadius: number
  gpHeight: number
  gpPositionY: number
  hdrEnabled: boolean
  shadowsEnabled: boolean
  lightPosX: number
  lightPosY: number
  lightPosZ: number
  targetX: number
  targetY: number
  targetZ: number
  dirX: number
  dirY: number
  dirZ: number
}

const _appliedShadowBounds = new WeakMap<THREE.Light, AppliedShadowBoundsState>()

function shouldSkipShadowBoundsObject(obj: THREE.Object3D): boolean {
  return !!(
    obj.userData.isShadowPlane ||
    obj.userData.isGridHelper ||
    obj.userData.isAxesHelper ||
    obj.userData.isLightGizmo ||
    obj.userData.isLightHelper ||
    obj.userData.isGroundedSkybox ||
    obj.userData.isDynamicSky ||
    obj.userData.isSun ||
    obj.userData.isMoon
  )
}

function meshContributesToShadowBounds(mesh: THREE.Mesh): boolean {
  return !!(mesh.castShadow || mesh.userData.isImportedModel || mesh.userData.isModel)
}

function expandMeshWorldBounds(mesh: THREE.Mesh, target: THREE.Box3): boolean {
  const geom = mesh.geometry
  if (geom) {
    if (!geom.boundingBox) {
      geom.computeBoundingBox()
    }
    if (geom.boundingBox && !geom.boundingBox.isEmpty()) {
      target.copy(geom.boundingBox).applyMatrix4(mesh.matrixWorld)
      return !target.isEmpty()
    }
  }
  target.setFromObject(mesh)
  return !target.isEmpty()
}

/**
 * Bounding box of imported / shadow-casting scene content (excludes helpers and HDR sky).
 * Single scene traversal — no nested retraversal of descendant trees (PERF-2).
 */
export function collectSceneShadowBounds(
  scene: THREE.Scene,
  target: THREE.Box3 = new THREE.Box3()
): THREE.Box3 | null {
  let hasObjects = false
  target.makeEmpty()

  scene.updateMatrixWorld(true)

  scene.traverse((obj) => {
    if (shouldSkipShadowBoundsObject(obj)) return
    if (!(obj instanceof THREE.Mesh)) return
    if (!meshContributesToShadowBounds(obj)) return

    if (!expandMeshWorldBounds(obj, _meshBox)) return

    if (!hasObjects) {
      target.copy(_meshBox)
      hasObjects = true
    } else {
      target.union(_meshBox)
    }
  })

  return hasObjects ? target : null
}

/** Center of shadow-relevant scene content, or null when the scene has no model. */
export function getSceneShadowBoundsCenter(scene: THREE.Scene): THREE.Vector3 | null {
  const box = collectSceneShadowBounds(scene, _collectBox)
  return box ? box.getCenter(new THREE.Vector3()) : null
}

export function aimSpotLightAtSceneCenter(
  spot: THREE.SpotLight,
  scene: THREE.Scene
): THREE.Vector3 | null {
  const center = getSceneShadowBoundsCenter(scene)
  if (!center) return null
  spot.target.position.copy(center)
  spot.target.updateMatrixWorld(true)
  return center
}

/**
 * ShadowManager - Unified shadow system management
 * Ensures only one shadow system is active at a time
 */
export class ShadowManager {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private renderer: THREE.WebGLRenderer
  private parent: THREE.Object3D
  private currentSystem: ShadowSystemType = 'standard'
  private csmSystem: CSMShadowSystem | null = null
  private standardLights: Set<THREE.DirectionalLight> = new Set()

  constructor(config: ShadowManagerConfig) {
    this.scene = config.scene
    this.camera = config.camera
    this.renderer = config.renderer
    this.parent = config.parent
  }

  /**
   * Set active shadow system (automatically disables previous)
   */
  setShadowSystem(type: ShadowSystemType, csmConfig?: CSMConfig): void {
    const previousSystem = this.currentSystem
    this.currentSystem = type

    // Disable previous system
    if (previousSystem === 'csm' && this.csmSystem) {
      this.csmSystem.destroy()
      this.csmSystem = null
    } else if (previousSystem === 'standard') {
      // Enable standard shadows
      this.standardLights.forEach(light => {
        light.castShadow = true
      })
      this.renderer.shadowMap.enabled = true
    }

    // Enable new system
    if (type === 'csm' && csmConfig) {
      this.csmSystem = new CSMShadowSystem(this.scene, csmConfig)
      this.csmSystem.init()
      
      // Disable standard shadows when CSM is active
      this.standardLights.forEach(light => {
        light.castShadow = false
      })
    } else if (type === 'standard') {
      // Enable standard shadows
      this.standardLights.forEach(light => {
        light.castShadow = true
      })
      this.renderer.shadowMap.enabled = true
    }
  }

  /**
   * Get current system type
   */
  getCurrentSystem(): ShadowSystemType {
    return this.currentSystem
  }

  /**
   * Check if a specific shadow system is currently active
   */
  isSystemActive(type: ShadowSystemType): boolean {
    return this.currentSystem === type
  }

  /**
   * Get CSM system (if active)
   */
  getCSMSystem(): CSMShadowSystem | null {
    return this.csmSystem
  }

  /**
   * Register standard light for management
   */
  registerStandardLight(light: THREE.DirectionalLight): void {
    this.standardLights.add(light)
    
    // Enable/disable based on current system
    if (this.currentSystem === 'standard') {
      light.castShadow = true
    } else if (this.currentSystem === 'csm') {
      light.castShadow = false
    }
  }

  /**
   * Get all registered standard lights
   */
  getStandardLights(): THREE.DirectionalLight[] {
    return Array.from(this.standardLights)
  }

  /**
   * Update shadow system (light direction, intensity, etc.)
   */
  update(lightDirection?: THREE.Vector3, lightIntensity?: number, lightColor?: THREE.Color): void {
    if (this.currentSystem === 'csm' && this.csmSystem) {
      if (lightDirection) {
        // lightDirection is toward the sun in the sky; CSM expects light travel direction
        this.csmSystem.setLightDirection(lightDirection.clone().negate())
      }
      if (lightIntensity !== undefined) {
        this.csmSystem.setLightIntensity(lightIntensity)
      }
      if (lightColor) {
        this.csmSystem.setLightColor(lightColor)
      }
    } else if (this.currentSystem === 'standard') {
      // Update standard lights
      this.standardLights.forEach(light => {
        if (lightDirection) {
          light.position.copy(lightDirection.clone().normalize().multiplyScalar(1000))
          light.target.position.set(0, 0, 0)
          light.target.updateMatrixWorld()
        }
        if (lightIntensity !== undefined) {
          light.intensity = lightIntensity
        }
        if (lightColor) {
          light.color.copy(lightColor)
        }
      })
    }
  }
}

function nearlyEqual(a: number, b: number, eps = BOUNDS_EPS): boolean {
  return Math.abs(a - b) <= eps
}

function buildInputSignature(
  light: THREE.Light,
  hasObjects: boolean,
  box: THREE.Box3 | null,
  store: ReturnType<typeof useAppStore.getState>,
  groundProjectionActive: boolean,
  gpRadius: number,
  gpHeight: number,
  gpPositionY: number
): AppliedShadowBoundsState {
  const dir = computeLightDirection(light as THREE.DirectionalLight | THREE.SpotLight)
  if (dir) {
    _lightDir.copy(dir)
  } else {
    _lightDir.set(0, -1, 0)
  }

  let targetX = 0
  let targetY = 0
  let targetZ = 0
  if (light instanceof THREE.SpotLight || light instanceof THREE.DirectionalLight) {
    targetX = light.target.position.x
    targetY = light.target.position.y
    targetZ = light.target.position.z
  }

  return {
    hasObjects,
    minX: box ? box.min.x : 0,
    minY: box ? box.min.y : 0,
    minZ: box ? box.min.z : 0,
    maxX: box ? box.max.x : 0,
    maxY: box ? box.max.y : 0,
    maxZ: box ? box.max.z : 0,
    mapSize: store.shadowMapSize,
    adaptive: store.useAdaptiveShadowSettings,
    biasOverride: store.shadowBiasOverride,
    normalBiasOverride: store.shadowNormalBiasOverride,
    groundProjection: groundProjectionActive,
    gpRadius,
    gpHeight,
    gpPositionY,
    hdrEnabled: store.hdrEnabled,
    shadowsEnabled: store.shadowsEnabled,
    lightPosX: light.position.x,
    lightPosY: light.position.y,
    lightPosZ: light.position.z,
    targetX,
    targetY,
    targetZ,
    dirX: _lightDir.x,
    dirY: _lightDir.y,
    dirZ: _lightDir.z
  }
}

function appliedStateMatches(
  prev: AppliedShadowBoundsState | undefined,
  next: AppliedShadowBoundsState
): boolean {
  if (!prev) return false
  if (prev.hasObjects !== next.hasObjects) return false
  if (prev.mapSize !== next.mapSize) return false
  if (prev.adaptive !== next.adaptive) return false
  if (prev.groundProjection !== next.groundProjection) return false
  if (prev.hdrEnabled !== next.hdrEnabled) return false
  if (prev.shadowsEnabled !== next.shadowsEnabled) return false
  if (!nearlyEqual(prev.gpRadius, next.gpRadius)) return false
  if (!nearlyEqual(prev.gpHeight, next.gpHeight)) return false
  if (!nearlyEqual(prev.gpPositionY, next.gpPositionY)) return false
  if (!nearlyEqual(prev.biasOverride, next.biasOverride)) return false
  if (!nearlyEqual(prev.normalBiasOverride, next.normalBiasOverride)) return false
  if (!nearlyEqual(prev.minX, next.minX)) return false
  if (!nearlyEqual(prev.minY, next.minY)) return false
  if (!nearlyEqual(prev.minZ, next.minZ)) return false
  if (!nearlyEqual(prev.maxX, next.maxX)) return false
  if (!nearlyEqual(prev.maxY, next.maxY)) return false
  if (!nearlyEqual(prev.maxZ, next.maxZ)) return false
  if (!nearlyEqual(prev.lightPosX, next.lightPosX)) return false
  if (!nearlyEqual(prev.lightPosY, next.lightPosY)) return false
  if (!nearlyEqual(prev.lightPosZ, next.lightPosZ)) return false
  if (!nearlyEqual(prev.targetX, next.targetX)) return false
  if (!nearlyEqual(prev.targetY, next.targetY)) return false
  if (!nearlyEqual(prev.targetZ, next.targetZ)) return false
  if (!nearlyEqual(prev.dirX, next.dirX)) return false
  if (!nearlyEqual(prev.dirY, next.dirY)) return false
  if (!nearlyEqual(prev.dirZ, next.dirZ)) return false
  return true
}

/**
 * Apply precomputed scene bounds to one light's shadow camera.
 * Sets `shadow.needsUpdate` only when bounds or shadow configuration changed.
 * @returns true when shadow configuration was applied / needsUpdate was set
 */
export function applyShadowCameraBounds(
  light: THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight,
  sceneBounds: THREE.Box3 | null,
  scene: THREE.Scene,
  _camera?: THREE.Camera,
  options?: { groundProjectionActive?: boolean }
): boolean {
  if (!light.shadow) return false

  const store = useAppStore.getState()
  const useAdaptiveShadowSettings = store.useAdaptiveShadowSettings

  // Skip scene GP traversal when HDR/shadows are off — catcher expand cannot apply.
  let groundProjectionActive = options?.groundProjectionActive
  if (groundProjectionActive === undefined) {
    if (store.hdrEnabled && store.shadowsEnabled) {
      groundProjectionActive = resolveGroundProjectionActive(
        store.hdrGroundProjectionEnabled,
        scene
      )
    } else {
      groundProjectionActive = false
    }
  }

  const gp = groundProjectionActive
    ? groundProjectionShadowParamsFromStore(store)
    : null

  const baseBox = sceneBounds && !sceneBounds.isEmpty() ? sceneBounds : null
  const hasObjects = !!baseBox

  let workingBox: THREE.Box3 | null = null
  if (baseBox) {
    workingBox = _workingBox.copy(baseBox)
    if (store.hdrEnabled && store.shadowsEnabled && groundProjectionActive && gp) {
      const catcherY = shadowPlaneYForHdrMode(true, gp)
      const halfExtent = Math.max(gp.radius, 25)
      // Expand in-place (avoid expandBoundsWithShadowCatcher clone allocation).
      workingBox.expandByPoint(_expandPoint.set(-halfExtent, catcherY, -halfExtent))
      workingBox.expandByPoint(_expandPoint.set(halfExtent, catcherY, halfExtent))
    }
  }

  const signature = buildInputSignature(
    light,
    hasObjects,
    workingBox,
    store,
    !!groundProjectionActive,
    gp?.radius ?? 0,
    gp?.height ?? 0,
    gp?.positionY ?? 0
  )

  if (appliedStateMatches(_appliedShadowBounds.get(light), signature)) {
    return false
  }

  const mapSize = store.shadowMapSize
  if (
    light.shadow.mapSize.width !== mapSize ||
    light.shadow.mapSize.height !== mapSize
  ) {
    light.shadow.mapSize.width = mapSize
    light.shadow.mapSize.height = mapSize
  }

  if (hasObjects && workingBox && !workingBox.isEmpty()) {
    const size = workingBox.getSize(_size)
    const center = workingBox.getCenter(_center)
    const maxDim = Math.max(size.x, size.y, size.z)
    const minDim = Math.min(size.x, size.y, size.z)
    const depthSize = size.y > size.z ? size.y : size.z
    const useVisibleBounds = false
    const frustum = computeTightShadowFrustum(maxDim, minDim, depthSize, useVisibleBounds)

    if (light instanceof THREE.DirectionalLight) {
      light.shadow.camera.left = -frustum.orthoHalfExtent
      light.shadow.camera.right = frustum.orthoHalfExtent
      light.shadow.camera.top = frustum.orthoHalfExtent
      light.shadow.camera.bottom = -frustum.orthoHalfExtent

      const currentNear = light.shadow.camera.near
      light.shadow.camera.near =
        currentNear <= frustum.near ? currentNear : frustum.near

      light.shadow.camera.far = frustum.far
      if (groundProjectionActive && gp) {
        light.shadow.camera.far = Math.max(
          light.shadow.camera.far,
          Math.max(gp.radius * 3, 5000)
        )
      }

      const computedDir = computeLightDirection(light)
      if (computedDir) {
        _lightDir.copy(computedDir)
      } else {
        _lightDir.set(0, -1, 0)
      }

      _shadowCamPos
        .copy(center)
        .addScaledVector(_lightDir, -frustum.offsetDistance)
      light.shadow.camera.position.copy(_shadowCamPos)
      light.shadow.camera.lookAt(center)
      light.shadow.camera.updateProjectionMatrix()
    } else if (light instanceof THREE.SpotLight) {
      // CRITICAL: Do NOT redirect spot.target here. User / LightingPanel aim must be
      // preserved (v3.17 behavior). Auto-aiming at scene center broke spotlights on
      // large terrains — attenuation distance often ends before the bbox center.
      if (!light.target.parent) {
        scene.add(light.target)
      }
      light.target.updateMatrixWorld(true)
      const farPlane = computeSpotLightShadowFar(
        light.position,
        light.target.position,
        workingBox
      )
      if (light.shadow.camera instanceof THREE.PerspectiveCamera) {
        light.shadow.camera.near = Math.max(
          light.position.distanceTo(light.target.position) * 0.01,
          0.01
        )
        light.shadow.camera.far = farPlane
        light.shadow.camera.updateProjectionMatrix()
      }
    } else if (light instanceof THREE.PointLight) {
      const farPlane = computePointLightShadowFar(light.position, workingBox)

      if (light.shadow.camera instanceof THREE.PerspectiveCamera) {
        light.shadow.camera.far = farPlane
        light.shadow.camera.updateProjectionMatrix()
      }
    }

    if (useAdaptiveShadowSettings) {
      if (light instanceof THREE.DirectionalLight) {
        applyAdaptiveDirectionalShadowBias(light, maxDim, minDim)
        light.shadow.radius = PHYSICAL_DIRECTIONAL_SHADOW_RADIUS
      } else if (light instanceof THREE.PointLight) {
        applyPhysicalOmnidirectionalShadowDefaults(light)
      } else if (light instanceof THREE.SpotLight) {
        applyPhysicalSpotShadowDefaults(light)
      }
    } else {
      light.shadow.bias = store.shadowBiasOverride
      light.shadow.normalBias = store.shadowNormalBiasOverride
    }
  } else {
    // Fallback to very large bounds if no objects found
    if (light instanceof THREE.DirectionalLight) {
      light.shadow.camera.left = -3000
      light.shadow.camera.right = 3000
      light.shadow.camera.top = 3000
      light.shadow.camera.bottom = -3000
      light.shadow.camera.near = 0.001
      light.shadow.camera.far = 10000

      const computedDir = computeLightDirection(light)
      if (computedDir) {
        _lightDir.copy(computedDir)
      } else {
        _lightDir.set(0, -1, 0)
      }
      _shadowCamPos.copy(_lightDir).multiplyScalar(-1000)
      light.shadow.camera.position.copy(_shadowCamPos)
      light.shadow.camera.lookAt(0, 0, 0)
      light.shadow.camera.updateProjectionMatrix()
    } else if (light instanceof THREE.SpotLight || light instanceof THREE.PointLight) {
      if (light.shadow.camera instanceof THREE.PerspectiveCamera) {
        light.shadow.camera.far = PHYSICAL_OMNI_SHADOW_FAR_INITIAL
        light.shadow.camera.updateProjectionMatrix()
      }
    }

    if (useAdaptiveShadowSettings) {
      if (light instanceof THREE.DirectionalLight) {
        applyPhysicalDirectionalShadowDefaults(light)
      } else if (light instanceof THREE.PointLight) {
        applyPhysicalOmnidirectionalShadowDefaults(light)
      } else if (light instanceof THREE.SpotLight) {
        applyPhysicalSpotShadowDefaults(light)
      }
    } else {
      light.shadow.bias = store.shadowBiasOverride
      light.shadow.normalBias = store.shadowNormalBiasOverride
    }
  }

  light.shadow.needsUpdate = true
  _appliedShadowBounds.set(light, signature)
  return true
}

/**
 * Updates shadow camera bounds for a directional / spot / point light based on scene objects.
 * This ensures shadows are sharp by focusing the shadow map on actual scene objects.
 */
export function updateShadowCameraBounds(
  light: THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight,
  scene: THREE.Scene,
  camera?: THREE.Camera
): void {
  if (!light.shadow) return
  const box = collectSceneShadowBounds(scene, _collectBox)
  const store = useAppStore.getState()
  const groundProjectionActive =
    store.hdrEnabled && store.shadowsEnabled
      ? resolveGroundProjectionActive(store.hdrGroundProjectionEnabled, scene)
      : false
  applyShadowCameraBounds(light, box, scene, camera, { groundProjectionActive })
}

/**
 * Updates shadow camera bounds for all lights in a map.
 * Computes aggregate scene bounds once, then applies to each light (PERF-2).
 */
export function updateAllShadowCameraBounds(
  lights: Map<string, THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight>,
  scene: THREE.Scene,
  camera?: THREE.Camera
): void {
  const box = collectSceneShadowBounds(scene, _collectBox)
  const store = useAppStore.getState()
  const groundProjectionActive =
    store.hdrEnabled && store.shadowsEnabled
      ? resolveGroundProjectionActive(store.hdrGroundProjectionEnabled, scene)
      : false

  lights.forEach((light) => {
    if (light.shadow && light.castShadow) {
      applyShadowCameraBounds(light, box, scene, camera, { groundProjectionActive })
    }
  })
}

/** Whether a static scene should skip periodic shadow-bounds work (PERF-2). */
export function shouldPeriodicallyUpdateShadowBounds(options: {
  hasActiveAnimations?: boolean
  isTransformDragging?: boolean
}): boolean {
  return !!(options.hasActiveAnimations || options.isTransformDragging)
}
