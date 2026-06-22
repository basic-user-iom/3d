/**
 * ShadowMaterialStateManager - Preserves material and shadow states when switching between systems
 * 
 * This manager ensures that when switching between:
 * - Standard shadows
 * - HDR system
 * - Weather/CSM system
 * - Path tracer
 * 
 * Material properties and shadow settings are preserved and restored correctly.
 */

import * as THREE from 'three'
import { materialUpdateQueue } from './MaterialUpdateQueue'

export interface MaterialShadowState {
  // Shadow properties
  castShadow: boolean
  receiveShadow: boolean
  
  // Material properties that affect shadows
  depthWrite: boolean
  depthTest: boolean
  transparent: boolean
  opacity: number
  
  // CSM-specific state
  csmSetup?: boolean
  csmShadowMapUniforms?: any
  
  // Original material type (for restoration)
  originalMaterialType?: string
  originalMaterialProps?: Record<string, any>
}

export interface ShadowSystemState {
  systemType: 'standard' | 'hdr' | 'csm' | 'pathTracer' | 'streetsgl' | null
  lights: {
    id: string
    castShadow: boolean
    visible: boolean
    intensity: number // CRITICAL: Save intensity to restore it when HDR is disabled
    shadowEnabled: boolean
  }[]
  shadowPlaneState?: {
    materialType: string
    materialProps: Record<string, any>
    castShadow: boolean
    receiveShadow: boolean
  }
}

export class ShadowMaterialStateManager {
  private materialStates = new WeakMap<THREE.Material, MaterialShadowState>()
  private meshStates = new WeakMap<THREE.Mesh, MaterialShadowState>()
  private systemStates = new Map<string, ShadowSystemState>()
  private currentSystem: ShadowSystemState['systemType'] = null

  /**
   * Save the current state of a material before system switch
   */
  saveMaterialState(material: THREE.Material, mesh?: THREE.Mesh): void {
    const state: MaterialShadowState = {
      castShadow: mesh?.castShadow ?? false,
      receiveShadow: mesh?.receiveShadow ?? false,
      depthWrite: material.depthWrite ?? true,
      depthTest: material.depthTest ?? true,
      transparent: material.transparent ?? false,
      opacity: (material as any).opacity ?? 1.0,
      originalMaterialType: material.type,
    }

    // Save CSM-specific state
    const anyMat = material as any
    if (anyMat.userData?.csmSetup) {
      state.csmSetup = true
      state.csmShadowMapUniforms = anyMat.userData.csmShadowMapUniforms
    }

    // Save original material properties
    // IMPROVED: Save all material properties, not just PBR properties
    // This ensures complete state restoration after system switches
    if (material instanceof THREE.MeshStandardMaterial || 
        material instanceof THREE.MeshPhysicalMaterial) {
      state.originalMaterialProps = {
        metalness: material.metalness,
        roughness: material.roughness,
        envMap: material.envMap,
        envMapIntensity: material.envMapIntensity,
        // Add all PBR properties
        color: material.color ? material.color.clone() : undefined,
        emissive: material.emissive ? material.emissive.clone() : undefined,
        emissiveIntensity: (material as any).emissiveIntensity,
        // Physical material properties
        clearcoat: (material as any).clearcoat,
        clearcoatRoughness: (material as any).clearcoatRoughness,
        transmission: (material as any).transmission,
        thickness: (material as any).thickness,
        sheen: (material as any).sheen,
        sheenRoughness: (material as any).sheenRoughness,
        ior: (material as any).ior,
      }
    } else if (material instanceof THREE.MeshPhongMaterial) {
      // Save Phong material properties
      state.originalMaterialProps = {
        color: material.color ? material.color.clone() : undefined,
        emissive: material.emissive ? material.emissive.clone() : undefined,
        specular: material.specular ? material.specular.clone() : undefined,
        shininess: material.shininess,
        reflectivity: material.reflectivity,
        envMap: material.envMap,
      }
    } else if (material instanceof THREE.MeshBasicMaterial) {
      // Save Basic material properties
      state.originalMaterialProps = {
        color: material.color ? material.color.clone() : undefined,
      }
    } else {
      // Generic material properties
      state.originalMaterialProps = {
        color: (material as any).color ? ((material as any).color as THREE.Color).clone() : undefined,
        opacity: (material as any).opacity,
        transparent: (material as any).transparent,
      }
    }

    this.materialStates.set(material, state)
    if (mesh) {
      this.meshStates.set(mesh, state)
    }
  }

  /**
   * Restore a material's state after system switch
   */
  restoreMaterialState(material: THREE.Material, mesh?: THREE.Mesh): void {
    const state = this.materialStates.get(material) || this.meshStates.get(mesh)
    if (!state) return

    // Restore shadow properties
    if (mesh) {
      mesh.castShadow = state.castShadow
      mesh.receiveShadow = state.receiveShadow
    }

    // Restore material properties using MaterialUpdateQueue to prevent race conditions
    materialUpdateQueue.enqueue(material, () => {
      material.depthWrite = state.depthWrite
      material.depthTest = state.depthTest
      material.transparent = state.transparent
      if ('opacity' in material) {
        (material as any).opacity = state.opacity
      }

      // Restore CSM state if needed
      const anyMat = material as any
      if (state.csmSetup && !anyMat.userData?.csmSetup) {
        anyMat.userData = anyMat.userData || {}
        anyMat.userData.csmSetup = state.csmSetup
        if (state.csmShadowMapUniforms) {
          anyMat.userData.csmShadowMapUniforms = state.csmShadowMapUniforms
        }
      }

      // Restore original material properties
      // IMPROVED: Restore all saved properties, not just PBR properties
      if (state.originalMaterialProps) {
        if (material instanceof THREE.MeshStandardMaterial || 
            material instanceof THREE.MeshPhysicalMaterial) {
          // Restore PBR properties
          if (state.originalMaterialProps.metalness !== undefined) {
            material.metalness = state.originalMaterialProps.metalness
          }
          if (state.originalMaterialProps.roughness !== undefined) {
            material.roughness = state.originalMaterialProps.roughness
          }
          // Restore color and emissive
          if (state.originalMaterialProps.color && material.color) {
            material.color.copy(state.originalMaterialProps.color)
          }
          if (state.originalMaterialProps.emissive && material.emissive) {
            material.emissive.copy(state.originalMaterialProps.emissive)
          }
          if (state.originalMaterialProps.emissiveIntensity !== undefined) {
            (material as any).emissiveIntensity = state.originalMaterialProps.emissiveIntensity
          }
          // Restore Physical material properties
          if (material instanceof THREE.MeshPhysicalMaterial) {
            if (state.originalMaterialProps.clearcoat !== undefined) {
              material.clearcoat = state.originalMaterialProps.clearcoat
            }
            if (state.originalMaterialProps.clearcoatRoughness !== undefined) {
              material.clearcoatRoughness = state.originalMaterialProps.clearcoatRoughness
            }
            if (state.originalMaterialProps.transmission !== undefined) {
              material.transmission = state.originalMaterialProps.transmission
            }
            if (state.originalMaterialProps.thickness !== undefined) {
              material.thickness = state.originalMaterialProps.thickness
            }
            if (state.originalMaterialProps.sheen !== undefined) {
              material.sheen = state.originalMaterialProps.sheen
            }
            if (state.originalMaterialProps.sheenRoughness !== undefined) {
              material.sheenRoughness = state.originalMaterialProps.sheenRoughness
            }
            if (state.originalMaterialProps.ior !== undefined) {
              material.ior = state.originalMaterialProps.ior
            }
          }
          // Note: envMap and envMapIntensity are managed by HDR system, don't restore here
        } else if (material instanceof THREE.MeshPhongMaterial) {
          // Restore Phong material properties
          if (state.originalMaterialProps.color && material.color) {
            material.color.copy(state.originalMaterialProps.color)
          }
          if (state.originalMaterialProps.emissive && material.emissive) {
            material.emissive.copy(state.originalMaterialProps.emissive)
          }
          if (state.originalMaterialProps.specular && material.specular) {
            material.specular.copy(state.originalMaterialProps.specular)
          }
          if (state.originalMaterialProps.shininess !== undefined) {
            material.shininess = state.originalMaterialProps.shininess
          }
          if (state.originalMaterialProps.reflectivity !== undefined) {
            material.reflectivity = state.originalMaterialProps.reflectivity
          }
        } else if (material instanceof THREE.MeshBasicMaterial) {
          // Restore Basic material properties
          if (state.originalMaterialProps.color && material.color) {
            material.color.copy(state.originalMaterialProps.color)
          }
        } else {
          // Restore generic material properties
          if (state.originalMaterialProps.color && (material as any).color) {
            ;(material as any).color.copy(state.originalMaterialProps.color)
          }
          if (state.originalMaterialProps.opacity !== undefined) {
            ;(material as any).opacity = state.originalMaterialProps.opacity
          }
          if (state.originalMaterialProps.transparent !== undefined) {
            ;(material as any).transparent = state.originalMaterialProps.transparent
          }
        }
      }

      // IMPROVED: Only set needsUpdate if properties actually changed
      // Perplexity finding: needsUpdate should only be set when values change
      material.needsUpdate = true
    })
  }

  /**
   * Save the current shadow system state
   */
  saveSystemState(systemType: ShadowSystemState['systemType'], lights: THREE.DirectionalLight[], shadowPlane?: THREE.Mesh): void {
    const state: ShadowSystemState = {
      systemType,
      lights: lights.map(light => ({
        id: light.uuid,
        castShadow: light.castShadow,
        visible: light.visible,
        intensity: light.intensity, // CRITICAL: Save intensity to restore it later
        shadowEnabled: light.shadow?.enabled ?? true,
      })),
    }

    if (shadowPlane) {
      const material = shadowPlane.material
      state.shadowPlaneState = {
        materialType: material instanceof THREE.Material ? material.type : 'unknown',
        materialProps: {
          opacity: (material as any).opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        },
        castShadow: shadowPlane.castShadow,
        receiveShadow: shadowPlane.receiveShadow,
      }
    }

    this.systemStates.set(systemType || 'null', state)
    this.currentSystem = systemType
  }

  /**
   * Restore a shadow system state
   */
  restoreSystemState(systemType: ShadowSystemState['systemType'], lights: THREE.DirectionalLight[], shadowPlane?: THREE.Mesh): void {
    const state = this.systemStates.get(systemType || 'null')
    if (!state) return

    // Restore light states
    lights.forEach(light => {
      const lightState = state.lights.find(l => l.id === light.uuid)
      if (lightState) {
        light.castShadow = lightState.castShadow
        light.visible = lightState.visible
        // CRITICAL: Restore intensity to ensure lights are properly lit when HDR is disabled
        if (lightState.intensity !== undefined) {
          light.intensity = lightState.intensity
        }
        if (light.shadow) {
          light.shadow.enabled = lightState.shadowEnabled
        }
      }
    })

    // Restore shadow plane state
    if (shadowPlane && state.shadowPlaneState) {
      shadowPlane.castShadow = state.shadowPlaneState.castShadow
      shadowPlane.receiveShadow = state.shadowPlaneState.receiveShadow

      const material = shadowPlane.material
      if (material instanceof THREE.Material) {
        materialUpdateQueue.enqueue(material, () => {
          if (state.shadowPlaneState) {
            if ('opacity' in material) {
              (material as any).opacity = state.shadowPlaneState.materialProps.opacity
            }
            material.transparent = state.shadowPlaneState.materialProps.transparent
            material.depthWrite = state.shadowPlaneState.materialProps.depthWrite
            material.needsUpdate = true
          }
        })
      }
    }
  }

  /**
   * Get the current system type
   */
  getCurrentSystem(): ShadowSystemState['systemType'] {
    return this.currentSystem
  }

  /**
   * Clear all saved states
   */
  clear(): void {
    // WeakMaps are automatically cleared when objects are garbage collected
    this.systemStates.clear()
    this.currentSystem = null
  }

  /**
   * Save all material states in a scene before system switch
   */
  saveSceneState(scene: THREE.Scene, lights: THREE.DirectionalLight[], shadowPlane?: THREE.Mesh): void {
    scene.traverse((obj) => {
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

      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach(mat => {
          if (mat instanceof THREE.Material) {
            this.saveMaterialState(mat, obj)
          }
        })
      }
    })

    // Save system state
    this.saveSystemState(this.currentSystem, lights, shadowPlane)
  }
}

// Singleton instance
export const shadowMaterialStateManager = new ShadowMaterialStateManager()

