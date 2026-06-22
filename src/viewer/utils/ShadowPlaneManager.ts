/**
 * ShadowPlaneManager - Centralized shadow plane state management
 * 
 * Ensures shadow plane always has correct properties and material state
 * regardless of system switches (standard shadows, CSM, HDR, path tracer)
 */

import * as THREE from 'three'
import { materialUpdateQueue } from './MaterialUpdateQueue'

export interface ShadowPlaneConfig {
  transparent?: boolean
  opacity?: number
  intensity?: number
}

export class ShadowPlaneManager {
  private shadowPlane: THREE.Mesh
  private currentMaterialType: 'standard' | 'shadow' | null = null
  private originalMaterial: THREE.Material | null = null
  private isInitialized = false

  constructor(shadowPlane: THREE.Mesh) {
    if (!shadowPlane) {
      throw new Error('ShadowPlaneManager: shadowPlane is required')
    }
    this.shadowPlane = shadowPlane
    this.originalMaterial = shadowPlane.material instanceof THREE.Material 
      ? shadowPlane.material.clone() 
      : null
    this.ensureCriticalProperties()
    this.isInitialized = true
  }

  /**
   * Ensure critical shadow plane properties are always set correctly
   * This is called on initialization and can be called anytime to fix state
   */
  ensureCriticalProperties(): void {
    if (!this.shadowPlane) return

    // CRITICAL: These properties must always be set correctly
    this.shadowPlane.receiveShadow = true
    this.shadowPlane.castShadow = false

    // Ensure material has depthWrite = true (required for shadows)
    const material = this.shadowPlane.material
    if (material instanceof THREE.Material) {
      const materials = Array.isArray(material) ? material : [material]
      materials.forEach(mat => {
        if (mat.depthWrite !== true) {
          materialUpdateQueue.enqueue(mat, () => {
            mat.depthWrite = true
            mat.needsUpdate = true
          })
        }
      })
    }
  }

  /**
   * Update shadow plane material based on configuration
   */
  updateMaterial(config: ShadowPlaneConfig): void {
    if (!this.shadowPlane) return

    const { transparent = false, opacity = 0.8, intensity = 1.0 } = config
    const material = this.shadowPlane.material

    if (transparent) {
      // Use ShadowMaterial for transparent shadows
      const shadowOpacity = Math.min(1.0, 0.1 + (intensity / 2.0) * 0.9)
      
      if (!(material instanceof THREE.ShadowMaterial)) {
        // Dispose old material if it's not ShadowMaterial
        if (material instanceof THREE.Material && material !== this.originalMaterial) {
          material.dispose()
        }
        
        const shadowMaterial = new THREE.ShadowMaterial({ 
          opacity: shadowOpacity
        })
        shadowMaterial.depthWrite = true // CRITICAL
        this.shadowPlane.material = shadowMaterial
        this.currentMaterialType = 'shadow'
      } else {
        // Update existing ShadowMaterial
        // IMPROVED: Use property validator to ensure opacity is in valid range
        materialUpdateQueue.enqueue(material, () => {
          // Only set needsUpdate if opacity actually changed
          const currentOpacity = material.opacity ?? 1.0
          if (Math.abs(currentOpacity - shadowOpacity) > 0.001) {
            material.opacity = Math.max(0.0, Math.min(1.0, shadowOpacity)) // Clamp to valid range
            material.depthWrite = true
            material.needsUpdate = true
          }
        })
      }
    } else {
      // Use MeshStandardMaterial for non-transparent shadows
      const planeOpacity = Math.min(1.0, 0.3 + (intensity / 2.0) * 0.7)
      
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        // Dispose old material if it's not MeshStandardMaterial
        if (material instanceof THREE.Material && material !== this.originalMaterial) {
          material.dispose()
        }
        
        const standardMaterial = new THREE.MeshStandardMaterial({ 
          color: 0x333333,
          transparent: true,
          opacity: planeOpacity,
          side: THREE.DoubleSide,
          depthWrite: true // CRITICAL
        })
        this.shadowPlane.material = standardMaterial
        this.currentMaterialType = 'standard'
      } else {
        // Update existing MeshStandardMaterial
        // IMPROVED: Use property validator to ensure opacity is in valid range
        materialUpdateQueue.enqueue(material, () => {
          // Only set needsUpdate if opacity actually changed
          const currentOpacity = material.opacity ?? 1.0
          if (Math.abs(currentOpacity - planeOpacity) > 0.001) {
            material.opacity = Math.max(0.0, Math.min(1.0, planeOpacity)) // Clamp to valid range
            material.depthWrite = true
            material.needsUpdate = true
          }
        })
      }
    }

    // Always ensure critical properties after material update
    this.ensureCriticalProperties()
  }

  /**
   * Setup material for CSM (Cascaded Shadow Maps)
   */
  setupForCSM(csm: any): void {
    if (!this.shadowPlane || !csm) return

    const material = this.shadowPlane.material
    if (material instanceof THREE.MeshStandardMaterial || 
        material instanceof THREE.MeshPhysicalMaterial) {
      // CSM needs to setup material for shadow receiving
      try {
        if (typeof csm.setupMaterial === 'function') {
          materialUpdateQueue.enqueue(material, () => {
            csm.setupMaterial(material)
            const anyMat = material as any
            anyMat.userData = anyMat.userData || {}
            anyMat.userData.csmSetup = true
            material.depthWrite = true // Ensure depthWrite is still true
            material.needsUpdate = true
          })
        }
      } catch (error) {
        console.warn('[ShadowPlaneManager] Failed to setup material for CSM:', error)
      }
    }

    // Ensure critical properties
    this.ensureCriticalProperties()
  }

  /**
   * Get current material type
   */
  getMaterialType(): 'standard' | 'shadow' | null {
    return this.currentMaterialType
  }

  /**
   * Get shadow plane reference
   */
  getShadowPlane(): THREE.Mesh {
    return this.shadowPlane
  }

  /**
   * Check if manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.shadowPlane !== null
  }

  /**
   * Protect shadow plane material from HDR environment map updates
   * Shadow plane should not receive HDR environment lighting
   * IMPROVED: Also ensures shadow plane visibility is maintained
   */
  protectFromHDR(): void {
    if (!this.shadowPlane) return

    // CRITICAL: Ensure shadow plane is visible (Perplexity finding: visibility must be explicitly managed)
    if (!this.shadowPlane.visible) {
      const store = (window as any).__appStore?.getState?.()
      const showShadowPlane = store?.showShadowPlane ?? true
      this.shadowPlane.visible = showShadowPlane
      console.log('[ShadowPlaneManager] ✅ Restored shadow plane visibility after HDR disable:', showShadowPlane)
    }

    const material = this.shadowPlane.material
    if (material instanceof THREE.Material) {
      const materials = Array.isArray(material) ? material : [material]
      materials.forEach(mat => {
        // Mark material to skip HDR updates
        const anyMat = mat as any
        anyMat.userData = anyMat.userData || {}
        anyMat.userData.skipHDRUpdates = true
        anyMat.userData.isShadowPlaneMaterial = true
        
        // Ensure shadow plane material doesn't have envMap (not needed for shadow plane)
        if ('envMap' in mat && mat.envMap) {
          materialUpdateQueue.enqueue(mat, () => {
            ;(mat as any).envMap = null
            mat.needsUpdate = true
          })
        }
        
        // CRITICAL: Ensure material color/opacity are preserved (Perplexity finding)
        // If material is MeshStandardMaterial, ensure it has proper color
        if (mat instanceof THREE.MeshStandardMaterial) {
          if (!mat.color || mat.color.getHex() === 0xffffff) {
            materialUpdateQueue.enqueue(mat, () => {
              mat.color.setHex(0x333333) // Default shadow plane color
              mat.needsUpdate = true
            })
          }
        }
      })
    }
    
    // Always ensure critical properties after HDR protection
    this.ensureCriticalProperties()
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Don't dispose shadow plane (it's managed by scene)
    // Only clear references
    this.shadowPlane = null as any
    this.originalMaterial = null
    this.isInitialized = false
  }
}

