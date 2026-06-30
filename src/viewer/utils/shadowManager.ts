import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import { computeLightDirection } from './lightGizmos'
import { CSMShadowSystem, CSMConfig } from '../effects/CSMShadowSystem'
import {
  applyAdaptiveDirectionalShadowBias,
  applyPhysicalDirectionalShadowDefaults,
  computeTightShadowFrustum,
  PHYSICAL_DIRECTIONAL_SHADOW_RADIUS
} from './physicalShadowSettings'

export type ShadowSystemType = 'standard' | 'csm' | 'streetsgl'

export interface ShadowManagerConfig {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  parent: THREE.Object3D
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

/**
 * Updates shadow camera bounds for a directional light based on scene objects
 * This ensures shadows are sharp by focusing the shadow map on actual scene objects
 */
export function updateShadowCameraBounds(
  light: THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight,
  scene: THREE.Scene,
  camera?: THREE.Camera
): void {
  if (!light.shadow) return

  // Calculate bounding box of all objects that cast shadows AND receive shadows
  const box = new THREE.Box3()
  let hasObjects = false

  // Also calculate bounds of visible objects (near camera) for better precision
  const visibleBox = new THREE.Box3()
  let hasVisibleObjects = false
  const cameraPosition = camera?.position || new THREE.Vector3(0, 0, 0)
  const maxVisibleDistance = 500 // Focus on objects within 500 units of camera

  scene.traverse((obj) => {
    // Skip helpers, gizmos, and system objects
    if (
      obj.userData.isShadowPlane ||
      obj.userData.isGridHelper ||
      obj.userData.isAxesHelper ||
      obj.userData.isLightGizmo ||
      obj.userData.isLightHelper ||
      obj.userData.isGroundedSkybox ||
      obj.userData.isDynamicSky ||
      obj.userData.isSun ||
      obj.userData.isMoon
    ) {
      return
    }

    // CRITICAL: Include ALL imported model objects (including interior) for shadow camera bounds
    // This ensures shadow camera covers entire model, not just objects that currently cast shadows
    // Interior objects might not cast shadows yet, but they should be included in bounds calculation
    // to ensure shadow camera can see them when they do cast shadows
    let objBox: THREE.Box3 | null = null

    // Check if this is a mesh that casts shadows OR is an imported model (for bounds calculation)
    if (obj instanceof THREE.Mesh) {
      // CRITICAL: Include ALL imported model meshes in bounds calculation (not just shadow-casting ones)
      // This ensures shadow camera covers entire model including interior parts
      // Interior objects need to be in shadow camera frustum even if they don't cast shadows yet
      if (obj.castShadow || obj.userData.isImportedModel || obj.userData.isModel) {
        objBox = new THREE.Box3().setFromObject(obj)
      }
    } else if (obj instanceof THREE.Group || obj instanceof THREE.Object3D) {
      // For groups (like pivot wrappers or model groups), check if any child meshes exist
      // CRITICAL: Include groups that contain imported models (for interior shadow coverage)
      let groupHasMeshes = false
      const groupBox = new THREE.Box3()

      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Include ALL meshes in imported models (not just shadow-casting ones)
          // This ensures shadow camera bounds cover entire model including interior
          if (child.castShadow || child.userData.isImportedModel || child.userData.isModel) {
            const childBox = new THREE.Box3().setFromObject(child)
            if (!childBox.isEmpty()) {
              if (!groupHasMeshes) {
                groupBox.copy(childBox)
                groupHasMeshes = true
              } else {
                groupBox.union(childBox)
              }
            }
          }
        }
      })

      if (groupHasMeshes && !groupBox.isEmpty()) {
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

  // CRITICAL: For interior shadows, we need to use ALL objects, not just visible ones
  // Visible bounds might be too tight and miss interior parts
  // Use full bounding box to ensure all parts of the model are covered
  const targetBox = hasObjects ? box : visibleBox
  const useVisibleBounds = false // Always use full bounds for interior shadows

  if (hasObjects && !targetBox.isEmpty()) {
    const size = targetBox.getSize(new THREE.Vector3())
    const center = targetBox.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const minDim = Math.min(size.x, size.y, size.z)
    const depthSize = size.y > size.z ? size.y : size.z
    const frustum = computeTightShadowFrustum(maxDim, minDim, depthSize, useVisibleBounds)

    // Configure shadow camera for directional lights
    if (light instanceof THREE.DirectionalLight) {
      light.shadow.camera.left = -frustum.orthoHalfExtent
      light.shadow.camera.right = frustum.orthoHalfExtent
      light.shadow.camera.top = frustum.orthoHalfExtent
      light.shadow.camera.bottom = -frustum.orthoHalfExtent

      const currentNear = light.shadow.camera.near
      light.shadow.camera.near =
        currentNear <= frustum.near ? currentNear : frustum.near

      light.shadow.camera.far = frustum.far

      let lightDirection: THREE.Vector3
      const computedDir = computeLightDirection(light)
      lightDirection = computedDir ? computedDir.clone() : new THREE.Vector3(0, -1, 0)

      const shadowCameraPosition = center
        .clone()
        .add(lightDirection.clone().multiplyScalar(-frustum.offsetDistance))
      light.shadow.camera.position.copy(shadowCameraPosition)
      light.shadow.camera.lookAt(center)
      light.shadow.camera.updateProjectionMatrix()
    } else if (light instanceof THREE.SpotLight || light instanceof THREE.PointLight) {
      // For spot and point lights, adjust far plane
      const depthSize = size.y > size.z ? size.y : size.z
      const shadowProjectionMargin = maxDim * 2
      const farPlane = useVisibleBounds
        ? Math.max(depthSize * 3 + shadowProjectionMargin, maxDim * 6, 2000)
        : Math.max(depthSize * 5 + shadowProjectionMargin, maxDim * 10, 5000)

      if (light.shadow.camera instanceof THREE.PerspectiveCamera) {
        light.shadow.camera.far = farPlane
        light.shadow.camera.updateProjectionMatrix()
      }
    }

    // Use adaptive or manual shadow bias based on user preference
    const useAdaptiveShadowSettings = useAppStore.getState().useAdaptiveShadowSettings

    if (useAdaptiveShadowSettings) {
      if (light instanceof THREE.DirectionalLight) {
        applyAdaptiveDirectionalShadowBias(light, maxDim, minDim)
        light.shadow.radius = PHYSICAL_DIRECTIONAL_SHADOW_RADIUS
      }
    } else {
      // Use manual override values from store
      light.shadow.bias = useAppStore.getState().shadowBiasOverride
      light.shadow.normalBias = useAppStore.getState().shadowNormalBiasOverride
    }

    // Force shadow map update
    light.shadow.needsUpdate = true
  } else {
    // Fallback to very large bounds if no objects found
    if (light instanceof THREE.DirectionalLight) {
      light.shadow.camera.left = -3000
      light.shadow.camera.right = 3000
      light.shadow.camera.top = 3000
      light.shadow.camera.bottom = -3000
      light.shadow.camera.near = 0.001 // CRITICAL: Use small near plane for interior shadows (car interiors need this)
      light.shadow.camera.far = 10000

      let lightDirection: THREE.Vector3
      const computedDir = computeLightDirection(light)
      lightDirection = computedDir ? computedDir.clone() : new THREE.Vector3(0, -1, 0)
      const fallbackPosition = lightDirection.clone().multiplyScalar(-1000)
      light.shadow.camera.position.copy(fallbackPosition)
      light.shadow.camera.lookAt(0, 0, 0)
      light.shadow.camera.updateProjectionMatrix()
    }

    // Use adaptive or manual shadow bias
    const useAdaptiveShadowSettings = useAppStore.getState().useAdaptiveShadowSettings
    if (useAdaptiveShadowSettings) {
      if (light instanceof THREE.DirectionalLight) {
        applyPhysicalDirectionalShadowDefaults(light)
      }
    } else {
      light.shadow.bias = useAppStore.getState().shadowBiasOverride
      light.shadow.normalBias = useAppStore.getState().shadowNormalBiasOverride
    }
    light.shadow.needsUpdate = true
  }
}

/**
 * Updates shadow camera bounds for all lights in a map
 */
export function updateAllShadowCameraBounds(
  lights: Map<string, THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight>,
  scene: THREE.Scene,
  camera?: THREE.Camera
): void {
  const shadowMapSize = useAppStore.getState().shadowMapSize
  lights.forEach((light) => {
    if (light.shadow && light.castShadow) {
      // Update shadow map size if it changed
      if (
        light.shadow.mapSize.width !== shadowMapSize ||
        light.shadow.mapSize.height !== shadowMapSize
      ) {
        light.shadow.mapSize.width = shadowMapSize
        light.shadow.mapSize.height = shadowMapSize
        light.shadow.needsUpdate = true
      }
      updateShadowCameraBounds(light, scene, camera)
    }
  })
}

