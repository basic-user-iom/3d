/**
 * ShadowSystemCoordinator - Coordinates shadow system switches and preserves material states
 * 
 * This coordinator ensures smooth transitions between:
 * - Standard shadows
 * - HDR system (with standard shadows)
 * - Weather/CSM system
 * - Path tracer
 * 
 * It preserves material and shadow states during transitions.
 */

import * as THREE from 'three'
import { ShadowManager, ShadowSystemType } from './shadowManager'
import { shadowMaterialStateManager, ShadowSystemState } from './ShadowMaterialStateManager'
import { materialUpdateQueue } from './MaterialUpdateQueue'
import { ShadowPlaneManager } from './ShadowPlaneManager'

export interface SystemTransition {
  from: ShadowSystemType
  to: ShadowSystemType
  preserveMaterials: boolean
  preserveShadowPlane: boolean
}

export class ShadowSystemCoordinator {
  private shadowManager: ShadowManager
  private scene: THREE.Scene
  private directionalLights: Map<string, THREE.DirectionalLight>
  private shadowPlane?: THREE.Mesh
  private shadowPlaneManager?: ShadowPlaneManager

  constructor(
    shadowManager: ShadowManager,
    scene: THREE.Scene,
    directionalLights: Map<string, THREE.DirectionalLight>,
    shadowPlane?: THREE.Mesh
  ) {
    this.shadowManager = shadowManager
    this.scene = scene
    this.directionalLights = directionalLights
    this.shadowPlane = shadowPlane
    
    // Initialize ShadowPlaneManager if shadow plane is provided
    if (shadowPlane) {
      this.shadowPlaneManager = new ShadowPlaneManager(shadowPlane)
      console.log('[ShadowSystemCoordinator] ShadowPlaneManager initialized')
    }
  }

  /**
   * Switch shadow system with state preservation
   */
  switchSystem(
    targetSystem: ShadowSystemType,
    csmConfig?: any,
    options: {
      preserveMaterials?: boolean
      preserveShadowPlane?: boolean
      preserveLightStates?: boolean
      restoreLightPositions?: boolean // FIX: New option for atomic light position restoration
    } = {}
  ): void {
    const {
      preserveMaterials = true,
      preserveShadowPlane = true,
      preserveLightStates = true,
      restoreLightPositions = false, // FIX: Default to false for backward compatibility
    } = options

    const currentSystem = this.shadowManager.getCurrentSystem()
    const lights = Array.from(this.directionalLights.values())
    
    // FIX: Save light positions before switching (for atomic restoration)
    const lightPositions: Map<THREE.DirectionalLight, {
      position: THREE.Vector3
      targetPosition: THREE.Vector3
      intensity: number
      castShadow: boolean
      visible: boolean
    }> = new Map()
    
    if (restoreLightPositions) {
      lights.forEach(light => {
        if (light.userData._originalPositionSaved && light.userData._originalPosition) {
          lightPositions.set(light, {
            position: light.userData._originalPosition.clone(),
            targetPosition: light.userData._originalTargetPosition?.clone() || light.target.position.clone(),
            intensity: light.userData._originalIntensity ?? light.intensity,
            castShadow: light.userData._originalCastShadow ?? light.castShadow,
            visible: light.userData._originalVisible ?? light.visible
          })
        }
      })
    }
    
    // Save current state before switching
    if (preserveMaterials || preserveShadowPlane || preserveLightStates) {
      shadowMaterialStateManager.saveSystemState(currentSystem, lights, this.shadowPlane)
      
      if (preserveMaterials) {
        shadowMaterialStateManager.saveSceneState(this.scene, lights, this.shadowPlane)
      }
    }

    // Switch system
    this.shadowManager.setShadowSystem(targetSystem, csmConfig)

    // FIX: Restore light positions atomically with system switch
    if (restoreLightPositions && lightPositions.size > 0) {
      lightPositions.forEach((savedState, light) => {
        light.position.copy(savedState.position)
        light.target.position.copy(savedState.targetPosition)
        light.target.updateMatrixWorld()
        light.intensity = savedState.intensity
        light.castShadow = savedState.castShadow
        light.visible = savedState.visible
      })
      console.log(`[ShadowSystemCoordinator] ✅ Restored ${lightPositions.size} light position(s) atomically with system switch`)
    }

    // Restore states after switch
    if (preserveLightStates) {
      shadowMaterialStateManager.restoreSystemState(targetSystem, lights, this.shadowPlane)
    }

    // Ensure shadow properties are correct for the new system
    this.ensureShadowProperties(targetSystem)
  }

  /**
   * Ensure shadow properties are correct for the active system
   */
  private ensureShadowProperties(systemType: ShadowSystemType): void {
    const lights = Array.from(this.directionalLights.values())

    if (systemType === 'csm') {
      // CSM system: Ensure materials can receive CSM shadows
      this.scene.traverse((obj) => {
        // Skip system objects
        if (
          obj.userData.isShadowPlane ||
          obj.userData.isGridHelper ||
          obj.userData.isAxesHelper ||
          obj.userData.isLightGizmo ||
          obj.userData.isLightHelper ||
          obj.userData.isGroundedSkybox ||
          obj.userData.isDynamicSky
        ) {
          return
        }

        if (obj instanceof THREE.Mesh) {
          // Ensure mesh can receive shadows
          if (!obj.receiveShadow) {
            obj.receiveShadow = true
          }

          // Ensure material is set up for CSM if needed
          const material = obj.material
          if (material instanceof THREE.Material) {
            const materials = Array.isArray(material) ? material : [material]
            materials.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial || 
                  mat instanceof THREE.MeshPhysicalMaterial) {
                // Ensure depthWrite is true for shadow receiving
                if (mat.depthWrite !== true) {
                  materialUpdateQueue.enqueue(mat, () => {
                    mat.depthWrite = true
                    mat.needsUpdate = true
                  })
                }
              }
            })
          }
        }
      })

      // Ensure shadow plane is configured for CSM
      // IMPROVED: Use ShadowPlaneManager to ensure correct state
      if (this.shadowPlaneManager) {
        this.shadowPlaneManager.ensureCriticalProperties()
        
        // Setup for CSM if needed
        const csmSystem = this.shadowManager.getCSMSystem()
        if (csmSystem) {
          const csm = csmSystem.getCSM()
          if (csm) {
            this.shadowPlaneManager.setupForCSM(csm)
          }
        }
      } else if (this.shadowPlane) {
        // Fallback if manager not available
        this.shadowPlane.receiveShadow = true
        this.shadowPlane.castShadow = false

        const material = this.shadowPlane.material
        if (material instanceof THREE.MeshStandardMaterial || 
            material instanceof THREE.MeshPhysicalMaterial) {
          materialUpdateQueue.enqueue(material, () => {
            material.depthWrite = true
            material.needsUpdate = true
          })
        }
      }
    } else if (systemType === 'standard') {
      // Standard shadows: Ensure lights are configured
      lights.forEach(light => {
        if (light.shadow) {
          light.castShadow = true
          light.shadow.enabled = true
        }
      })

      // Ensure shadow plane is configured
      // IMPROVED: Use ShadowPlaneManager to ensure correct state
      if (this.shadowPlaneManager) {
        this.shadowPlaneManager.ensureCriticalProperties()
      } else if (this.shadowPlane) {
        // Fallback if manager not available
        this.shadowPlane.receiveShadow = true
        this.shadowPlane.castShadow = false
      }
    }
  }

  /**
   * Handle path tracer start (save states)
   */
  onPathTracerStart(): void {
    const currentSystem = this.shadowManager.getCurrentSystem()
    const lights = Array.from(this.directionalLights.values())
    
    // Save current state
    shadowMaterialStateManager.saveSystemState(currentSystem, lights, this.shadowPlane)
    shadowMaterialStateManager.saveSceneState(this.scene, lights, this.shadowPlane)
  }

  /**
   * Handle path tracer stop (restore states)
   * IMPROVED: Ensures shadow plane state is restored correctly, including color/opacity
   * Perplexity finding: Material color/opacity must be explicitly restored after path tracer
   */
  onPathTracerStop(): void {
    const currentSystem = this.shadowManager.getCurrentSystem()
    const lights = Array.from(this.directionalLights.values())
    
    // Restore state
    shadowMaterialStateManager.restoreSystemState(currentSystem, lights, this.shadowPlane)
    
    // Restore material states
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach(mat => {
          if (mat instanceof THREE.Material) {
            shadowMaterialStateManager.restoreMaterialState(mat, obj)
          }
        })
      }
    })
    
    // IMPROVED: Ensure shadow plane state is correct after restoration
    // CRITICAL: Restore shadow plane material color/opacity explicitly
    if (this.shadowPlaneManager) {
      this.shadowPlaneManager.ensureCriticalProperties()
      
      // Get current user settings for shadow plane
      const store = (window as any).__appStore?.getState?.()
      const shadowPlaneTransparent = store?.shadowPlaneTransparent ?? false
      const shadowIntensity = store?.shadowIntensity ?? 1.0
      
      // Restore shadow plane material based on user settings
      // This ensures color/opacity are restored correctly after path tracer
      this.shadowPlaneManager.updateMaterial({
        transparent: shadowPlaneTransparent,
        opacity: shadowPlaneTransparent ? 0.8 : 0.8,
        intensity: shadowIntensity
      })
      
      // If CSM is active, ensure shadow plane is set up for CSM
      if (currentSystem === 'csm') {
        const csmSystem = this.shadowManager.getCSMSystem()
        if (csmSystem) {
          const csm = csmSystem.getCSM()
          if (csm) {
            this.shadowPlaneManager.setupForCSM(csm)
          }
        }
      }
      
      console.log('[ShadowSystemCoordinator] ✅ Shadow plane material restored after path tracer stop', {
        transparent: shadowPlaneTransparent,
        intensity: shadowIntensity
      })
    }
  }

  /**
   * Update shadow plane for current system
   * IMPROVED: Uses ShadowPlaneManager for centralized state management
   */
  updateShadowPlane(transparent: boolean, intensity: number): void {
    if (!this.shadowPlane || !this.shadowPlaneManager) {
      console.warn('[ShadowSystemCoordinator] Cannot update shadow plane - not initialized')
      return
    }

    // Use ShadowPlaneManager for material updates
    this.shadowPlaneManager.updateMaterial({
      transparent,
      opacity: transparent ? 0.8 : 0.8,
      intensity
    })

    // If CSM is active, ensure material is set up for CSM
    const systemType = this.shadowManager.getCurrentSystem()
    if (systemType === 'csm') {
      const csmSystem = this.shadowManager.getCSMSystem()
      if (csmSystem) {
        const csm = csmSystem.getCSM()
        if (csm) {
          this.shadowPlaneManager.setupForCSM(csm)
        }
      }
    }

    // Ensure shadow properties are correct
    this.ensureShadowProperties(systemType)
  }

  /**
   * Get current system type
   */
  getCurrentSystem(): ShadowSystemType {
    return this.shadowManager.getCurrentSystem()
  }

  /**
   * Get ShadowPlaneManager instance
   */
  getShadowPlaneManager(): ShadowPlaneManager | undefined {
    return this.shadowPlaneManager
  }

  /**
   * Ensure shadow plane is in correct state for current system
   * Call this after any system switch or state change
   */
  ensureShadowPlaneState(): void {
    if (this.shadowPlaneManager) {
      this.shadowPlaneManager.ensureCriticalProperties()
      
      const systemType = this.shadowManager.getCurrentSystem()
      if (systemType === 'csm') {
        const csmSystem = this.shadowManager.getCSMSystem()
        if (csmSystem) {
          const csm = csmSystem.getCSM()
          if (csm) {
            this.shadowPlaneManager.setupForCSM(csm)
          }
        }
      }
      
      // Always protect shadow plane from HDR updates
      this.shadowPlaneManager.protectFromHDR()
    }
  }

  /**
   * Protect shadow plane from HDR system material updates
   * Shadow plane should not receive HDR environment lighting
   */
  protectShadowPlaneFromHDR(): void {
    if (this.shadowPlaneManager) {
      this.shadowPlaneManager.protectFromHDR()
      console.log('[ShadowSystemCoordinator] ✅ Shadow plane protected from HDR updates')
    }
  }
}

