// @ts-nocheck

import * as THREE from 'three'
import { shaderModifierRegistry, ShaderModifier } from './ShaderModifierRegistry'

export interface ShadowOpacityConfig {
  enabled: boolean
  opacity: number // 0-1, shadow opacity multiplier
  color: THREE.Color // Shadow color tint
}

/**
 * Shadow Opacity Modifier using ShaderModifierRegistry
 * Based on Three.js example: https://threejs.org/examples/webgpu_shadowmap_opacity.html
 * 
 * This modifier is registered with ShaderModifierRegistry to enable chaining with other modifiers
 */
class ShadowOpacityModifierRegistry {
  private static instance: ShadowOpacityModifierRegistry | null = null
  private materialConfigs: WeakMap<THREE.Material, ShadowOpacityConfig> = new WeakMap()
  private materialUniforms: WeakMap<THREE.Material, {
    shadowOpacity: { value: number }
    shadowColor: { value: THREE.Color }
  }> = new WeakMap()

  private constructor() {
    // Register the modifier with ShaderModifierRegistry
    const modifier: ShaderModifier = {
      id: 'shadow-opacity',
      name: 'Shadow Opacity',
      priority: 50, // Run after ground projection (priority 10) but before other effects (priority 100+)
      apply: this.applyShaderModification.bind(this),
      cleanup: this.cleanupMaterial.bind(this)
    }
    
    shaderModifierRegistry.register(modifier)
  }

  static getInstance(): ShadowOpacityModifierRegistry {
    if (!ShadowOpacityModifierRegistry.instance) {
      ShadowOpacityModifierRegistry.instance = new ShadowOpacityModifierRegistry()
    }
    return ShadowOpacityModifierRegistry.instance
  }

  /**
   * Apply shadow opacity to a material
   */
  applyToMaterial(material: THREE.Material, config: ShadowOpacityConfig): void {
    if (!config.enabled) {
      this.removeFromMaterial(material)
      return
    }

    // Skip ALL MeshPhysicalMaterial instances - they have complex shaders
    if (material instanceof THREE.MeshPhysicalMaterial) {
      return
    }

    // CRITICAL: Skip ShaderMaterial instances - they have custom shaders
    if (material instanceof THREE.ShaderMaterial) {
      return
    }

    // Store config
    this.materialConfigs.set(material, config)

    // Create or update uniforms
    if (!this.materialUniforms.has(material)) {
      this.materialUniforms.set(material, {
        shadowOpacity: { value: config.opacity },
        shadowColor: { value: config.color.clone() }
      })
    } else {
      // Update existing uniforms - CRITICAL: Update values directly so changes are reflected immediately
      const uniforms = this.materialUniforms.get(material)!
      uniforms.shadowOpacity.value = config.opacity
      uniforms.shadowColor.value.copy(config.color)
      
      // Also update uniforms stored in material.userData if they exist (for shader access)
      if (material.userData.shadowOpacityUniforms) {
        material.userData.shadowOpacityUniforms.shadowOpacity.value = config.opacity
        material.userData.shadowOpacityUniforms.shadowColor.value.copy(config.color)
      }
    }

    // Apply modifier using registry (this will recompile shader if needed)
    shaderModifierRegistry.applyModifier(material, 'shadow-opacity')
    
    // Force material update to ensure uniforms are synced
    material.needsUpdate = true
  }

  /**
   * Remove shadow opacity from a material
   */
  removeFromMaterial(material: THREE.Material): void {
    this.materialConfigs.delete(material)
    shaderModifierRegistry.removeModifier(material, 'shadow-opacity')
  }

  /**
   * Update material configuration
   */
  updateMaterialConfig(material: THREE.Material, config: Partial<ShadowOpacityConfig>): void {
    const existingConfig = this.materialConfigs.get(material)
    if (existingConfig) {
      const newConfig: ShadowOpacityConfig = {
        ...existingConfig,
        ...config
      }
      this.applyToMaterial(material, newConfig)
    }
  }

  /**
   * Shader modification function (called by registry)
   */
  private applyShaderModification(shader: any, material: THREE.Material, renderer: THREE.WebGLRenderer): void {
    const config = this.materialConfigs.get(material)
    if (!config || !config.enabled) return

    // Skip if material type changed
    if (material instanceof THREE.ShaderMaterial || material instanceof THREE.MeshPhysicalMaterial) {
      return
    }

    const fragmentShader = shader.fragmentShader
    if (!fragmentShader || typeof fragmentShader !== 'string') return

    // Check if shadowmap_fragment is present
    if (!fragmentShader.includes('#include <shadowmap_fragment>')) {
      return // No shadow support, skip
    }

    // Get uniforms
    let uniforms = this.materialUniforms.get(material)
    if (!uniforms) {
      uniforms = {
        shadowOpacity: { value: config.opacity },
        shadowColor: { value: config.color.clone() }
      }
      this.materialUniforms.set(material, uniforms)
    }

    // Add uniforms to shader
    shader.uniforms = shader.uniforms || {}
    shader.uniforms.shadowOpacity = uniforms.shadowOpacity
    shader.uniforms.shadowColor = uniforms.shadowColor

    // Capture color before shadowmap_fragment, then apply custom shadow after
    const captureColorCode = `
      #ifdef USE_SHADOWMAP
        vec3 shadowOpacityLitColor = gl_FragColor.rgb;
      #endif
    `

    const applyShadowOpacityCode = `
      #ifdef USE_SHADOWMAP
        // shadowMask is 1.0 in shadow, 0.0 in light
        // Calculate shadow amount: 1.0 - shadowMask gives us shadow factor (1.0 = full shadow, 0.0 = no shadow)
        float shadowFactor = 1.0 - shadowMask;
        // Apply opacity multiplier
        float shadowAmount = shadowFactor * shadowOpacity;
        // Apply shadow color tint
        vec3 shadowedColor = shadowOpacityLitColor * shadowColor.rgb;
        // Mix between lit color and shadowed color based on shadow amount
        gl_FragColor.rgb = mix(shadowOpacityLitColor, shadowedColor, shadowAmount);
      #endif
    `

    // Replace first occurrence of shadowmap_fragment
    const firstOccurrence = fragmentShader.indexOf('#include <shadowmap_fragment>')
    if (firstOccurrence !== -1) {
      try {
        const beforeInclude = fragmentShader.substring(0, firstOccurrence)
        const hasOutputFragment = beforeInclude.includes('#include <output_fragment>') || 
                                  beforeInclude.includes('gl_FragColor') ||
                                  beforeInclude.includes('gl_FragColor.rgb')
        
        if (!hasOutputFragment && !beforeInclude.includes('gl_FragColor')) {
          console.warn('[ShadowOpacityModifier] gl_FragColor may not be initialized, skipping injection')
          return
        }
        
        shader.fragmentShader = fragmentShader.replace(
          '#include <shadowmap_fragment>',
          `${captureColorCode}
          #include <shadowmap_fragment>
          ${applyShadowOpacityCode}`
        )
      } catch (error) {
        console.error('[ShadowOpacityModifier] Error injecting shader code:', error)
      }
    }
  }

  /**
   * Cleanup function (called by registry)
   */
  private cleanupMaterial(material: THREE.Material): void {
    this.materialConfigs.delete(material)
    // Keep uniforms in case material is re-used
  }
}

// Export singleton instance
export const shadowOpacityModifierRegistry = ShadowOpacityModifierRegistry.getInstance()














