import * as THREE from 'three'

/**
 * Unified Shader Modifier Registry
 * 
 * Prevents conflicts between multiple shader modifiers by:
 * 1. Chaining onBeforeCompile hooks instead of overwriting
 * 2. Tracking which modifiers are applied to each material
 * 3. Ensuring proper cleanup and restoration
 * 
 * Industry-standard approach: Single onBeforeCompile that chains all modifiers
 */

// Shader type for onBeforeCompile - use 'any' to match Three.js's WebGLProgramParametersWithUniforms
// Three.js doesn't export this type publicly, so we use 'any' for flexibility
export type ShaderMaterialShader = any

export interface ShaderModifier {
  id: string
  name: string
  priority: number // Lower = runs first
  apply: (shader: ShaderMaterialShader, material: THREE.Material, renderer: THREE.WebGLRenderer) => void
  cleanup?: (material: THREE.Material) => void
}

class ShaderModifierRegistry {
  private modifiers: Map<string, ShaderModifier> = new Map()
  private materialHooks: WeakMap<THREE.Material, {
    originalOnBeforeCompile?: (shader: ShaderMaterialShader, renderer: THREE.WebGLRenderer) => void
    modifiers: Set<string>
  }> = new WeakMap()

  /**
   * Register a shader modifier
   */
  register(modifier: ShaderModifier): void {
    this.modifiers.set(modifier.id, modifier)
  }

  /**
   * Unregister a shader modifier
   */
  unregister(modifierId: string): void {
    this.modifiers.delete(modifierId)
  }

  /**
   * Apply a modifier to a material
   */
  applyModifier(material: THREE.Material, modifierId: string): void {
    const modifier = this.modifiers.get(modifierId)
    if (!modifier) {
      console.warn(`[ShaderModifierRegistry] Modifier ${modifierId} not found`)
      return
    }

    // Get or create material hook data
    let hookData = this.materialHooks.get(material)
    if (!hookData) {
      hookData = {
        originalOnBeforeCompile: material.onBeforeCompile ? material.onBeforeCompile as any : undefined,
        modifiers: new Set<string>()
      }
      this.materialHooks.set(material, hookData)

      // Set up unified onBeforeCompile hook
      // Capture hookData in closure to ensure it's always available
      const capturedHookData = hookData // hookData is guaranteed to exist here
      material.onBeforeCompile = (shader: ShaderMaterialShader, renderer: THREE.WebGLRenderer) => {
        // Call original onBeforeCompile first
        if (capturedHookData && capturedHookData.originalOnBeforeCompile) {
          capturedHookData.originalOnBeforeCompile.call(material, shader, renderer)
        }

        // Chain all registered modifiers in priority order
        if (capturedHookData) {
          const sortedModifiers = Array.from(this.modifiers.values())
            .filter(m => capturedHookData.modifiers.has(m.id))
            .sort((a, b) => a.priority - b.priority)

          for (const mod of sortedModifiers) {
            try {
              mod.apply(shader, material, renderer)
            } catch (error) {
              console.error(`[ShaderModifierRegistry] Error applying modifier ${mod.id}:`, error)
            }
          }
        }
      }
    }

    // Add modifier to this material's set
    // hookData is guaranteed to exist here (either from get or created above)
    if (hookData) {
      hookData.modifiers.add(modifierId)
    }
    material.needsUpdate = true
  }

  /**
   * Remove a modifier from a material
   */
  removeModifier(material: THREE.Material, modifierId: string): void {
    const hookData = this.materialHooks.get(material)
    if (!hookData) return

    hookData.modifiers.delete(modifierId)

    // If no modifiers left, restore original onBeforeCompile
    if (hookData.modifiers.size === 0) {
      if (hookData.originalOnBeforeCompile) {
        material.onBeforeCompile = hookData.originalOnBeforeCompile
      } else {
        delete (material as any).onBeforeCompile
      }
      this.materialHooks.delete(material)
    }

    // Call cleanup if provided
    const modifier = this.modifiers.get(modifierId)
    if (modifier?.cleanup) {
      modifier.cleanup(material)
    }

    material.needsUpdate = true
  }

  /**
   * Remove all modifiers from a material
   */
  removeAllModifiers(material: THREE.Material): void {
    const hookData = this.materialHooks.get(material)
    if (!hookData) return

    // Call cleanup for all modifiers
    for (const modifierId of hookData.modifiers) {
      const modifier = this.modifiers.get(modifierId)
      if (modifier?.cleanup) {
        modifier.cleanup(material)
      }
    }

    // Restore original
    if (hookData.originalOnBeforeCompile) {
      material.onBeforeCompile = hookData.originalOnBeforeCompile
    } else {
      delete (material as any).onBeforeCompile
    }

    this.materialHooks.delete(material)
    material.needsUpdate = true
  }

  /**
   * Check if a modifier is applied to a material
   */
  hasModifier(material: THREE.Material, modifierId: string): boolean {
    const hookData = this.materialHooks.get(material)
    return hookData?.modifiers.has(modifierId) ?? false
  }

  /**
   * Get all modifiers applied to a material
   */
  getMaterialModifiers(material: THREE.Material): string[] {
    const hookData = this.materialHooks.get(material)
    return hookData ? Array.from(hookData.modifiers) : []
  }
}

// Export singleton instance
export const shaderModifierRegistry = new ShaderModifierRegistry()



