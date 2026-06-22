// @ts-nocheck

import * as THREE from 'three'
import { shaderModifierRegistry, ShaderModifier } from './ShaderModifierRegistry'

export interface CausticsModifierConfig {
  enabled: boolean
  intensity: number
  texture: THREE.Texture | null
}

/**
 * Caustics Modifier using ShaderModifierRegistry
 * 
 * This modifier is registered with ShaderModifierRegistry to enable chaining with other modifiers
 */
class CausticsModifierRegistry {
  private static instance: CausticsModifierRegistry | null = null
  private materialConfigs: WeakMap<THREE.Material, CausticsModifierConfig> = new WeakMap()
  private materialUniforms: WeakMap<THREE.Material, {
    causticsTexture: { value: THREE.Texture }
    causticsEnabled: { value: number }
    causticsIntensity: { value: number }
  }> = new WeakMap()

  private constructor() {
    // Register the modifier with ShaderModifierRegistry
    const modifier: ShaderModifier = {
      id: 'caustics',
      name: 'Caustics',
      priority: 60, // Run after shadow opacity (priority 50) but before random UV (priority 70)
      apply: this.applyShaderModification.bind(this),
      cleanup: this.cleanupMaterial.bind(this)
    }
    
    shaderModifierRegistry.register(modifier)
  }

  static getInstance(): CausticsModifierRegistry {
    if (!CausticsModifierRegistry.instance) {
      CausticsModifierRegistry.instance = new CausticsModifierRegistry()
    }
    return CausticsModifierRegistry.instance
  }

  /**
   * Apply caustics to a material
   */
  applyToMaterial(material: THREE.Material, config?: Partial<CausticsModifierConfig>): void {
    // Only works with standard/physical materials
    // Skip ShaderMaterials to avoid shader compilation errors
    if (material instanceof THREE.ShaderMaterial) {
      return
    }
    if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
      return
    }

    // Merge with default config
    const defaultConfig: CausticsModifierConfig = {
      enabled: true,
      intensity: 1.0,
      texture: null
    }
    const finalConfig: CausticsModifierConfig = { ...defaultConfig, ...config }

    if (!finalConfig.enabled) {
      this.removeFromMaterial(material)
      return
    }

    // Store config
    this.materialConfigs.set(material, finalConfig)

    // Create or update uniforms
    if (!this.materialUniforms.has(material)) {
      // Create dummy texture if none provided
      const texture = finalConfig.texture || (() => {
        const dummyTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
        dummyTexture.needsUpdate = true
        return dummyTexture
      })()

      this.materialUniforms.set(material, {
        causticsTexture: { value: texture },
        causticsEnabled: { value: finalConfig.enabled ? 1.0 : 0.0 },
        causticsIntensity: { value: finalConfig.intensity }
      })
    } else {
      // Update existing uniforms
      const uniforms = this.materialUniforms.get(material)!
      if (finalConfig.texture) {
        uniforms.causticsTexture.value = finalConfig.texture
      }
      uniforms.causticsEnabled.value = finalConfig.enabled ? 1.0 : 0.0
      uniforms.causticsIntensity.value = finalConfig.intensity
    }

    // Apply modifier using registry (this will recompile shader if needed)
    shaderModifierRegistry.applyModifier(material, 'caustics')
    
    // Force material update to ensure uniforms are synced
    material.needsUpdate = true
  }

  /**
   * Remove caustics from a material
   */
  removeFromMaterial(material: THREE.Material): void {
    this.materialConfigs.delete(material)
    shaderModifierRegistry.removeModifier(material, 'caustics')
  }

  /**
   * Update material configuration
   */
  updateMaterialConfig(material: THREE.Material, config: Partial<CausticsModifierConfig>): void {
    const existingConfig = this.materialConfigs.get(material)
    if (existingConfig) {
      const newConfig: CausticsModifierConfig = {
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
    if (material instanceof THREE.ShaderMaterial) {
      return
    }
    if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial)) {
      return
    }

    // Ensure shader code exists and is valid
    if (!shader.vertexShader || typeof shader.vertexShader !== 'string') {
      console.warn('[CausticsModifierRegistry] Invalid vertex shader, skipping caustics injection')
      return
    }
    if (!shader.fragmentShader || typeof shader.fragmentShader !== 'string') {
      console.warn('[CausticsModifierRegistry] Invalid fragment shader, skipping caustics injection')
      return
    }

    // Get uniforms
    let uniforms = this.materialUniforms.get(material)
    if (!uniforms) {
      const texture = config.texture || (() => {
        const dummyTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
        dummyTexture.needsUpdate = true
        return dummyTexture
      })()

      uniforms = {
        causticsTexture: { value: texture },
        causticsEnabled: { value: config.enabled ? 1.0 : 0.0 },
        causticsIntensity: { value: config.intensity }
      }
      this.materialUniforms.set(material, uniforms)
    }

    // Add uniforms to shader
    shader.uniforms = shader.uniforms || {}
    shader.uniforms.causticsTexture = uniforms.causticsTexture
    shader.uniforms.causticsEnabled = uniforms.causticsEnabled
    shader.uniforms.causticsIntensity = uniforms.causticsIntensity
    
    // Add USE_CAUSTICS define for shader optimization
    if (shader.defines === undefined) {
      shader.defines = {}
    }
    shader.defines.USE_CAUSTICS = ''

    // Inject caustics vertex shader code to pass world position
    if (shader.vertexShader) {
      const hasVaryingDecl = shader.vertexShader.includes('varying vec3 vWorldPosition') || 
                              shader.vertexShader.includes('varying vec3 vWorldPosition;')
      
      // Add varying declaration if not present
      if (!hasVaryingDecl) {
        if (shader.vertexShader.includes('#include <common>')) {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
varying vec3 vWorldPosition;`
          )
        } else if (shader.vertexShader.includes('void main()')) {
          const mainMatch = shader.vertexShader.match(/void main\(\)/)
          if (mainMatch && mainMatch.index !== undefined) {
            const beforeMain = shader.vertexShader.substring(0, mainMatch.index)
            const afterMain = shader.vertexShader.substring(mainMatch.index)
            shader.vertexShader = beforeMain + 'varying vec3 vWorldPosition;\n' + afterMain
          }
        }
      }
      
      // Ensure vWorldPosition is assigned in vertex shader
      if (!shader.vertexShader.includes('vWorldPosition =')) {
        if (shader.vertexShader.includes('#include <worldpos_vertex>')) {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
vWorldPosition = worldPosition;`
          )
        } else if (shader.vertexShader.includes('#include <project_vertex>')) {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>
vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`
          )
        } else if (shader.vertexShader.includes('gl_Position =')) {
          shader.vertexShader = shader.vertexShader.replace(
            /gl_Position\s*=/,
            `vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
gl_Position =`
          )
        }
      }
    }

    // Inject caustics fragment shader code
    if (shader.fragmentShader) {
      const hasVaryingDecl = shader.fragmentShader.includes('varying vec3 vWorldPosition') || 
                              shader.fragmentShader.includes('varying vec3 vWorldPosition;')
      
      // Add varying declaration if not present
      if (!hasVaryingDecl) {
        if (shader.fragmentShader.includes('#include <common>')) {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
varying vec3 vWorldPosition;`
          )
        } else if (shader.fragmentShader.includes('void main()')) {
          const mainMatch = shader.fragmentShader.match(/void main\(\)/)
          if (mainMatch && mainMatch.index !== undefined) {
            const beforeMain = shader.fragmentShader.substring(0, mainMatch.index)
            const afterMain = shader.fragmentShader.substring(mainMatch.index)
            shader.fragmentShader = beforeMain + 'varying vec3 vWorldPosition;\n' + afterMain
          }
        }
      }
      
      // Inject caustics calculation BEFORE output_fragment
      // CRITICAL: Must inject before output_fragment to work in linear color space
      // output_fragment applies tone mapping and color space conversion
      // Adding after output_fragment causes artifacts (mixing linear and tone-mapped colors)
      if (shader.fragmentShader.includes('#include <output_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <output_fragment>',
          `// Caustics injection (before output_fragment for proper color space handling)
#ifdef USE_CAUSTICS
  if (causticsEnabled > 0.5) {
    // Calculate caustics UV from world position
    // Project onto ground plane (Y=0) for caustics UV
    vec2 causticsUV = vWorldPosition.xz * 0.01 + 0.5;
    
    // Sample caustics texture (use texture2D for WebGL1 compatibility)
    vec4 causticsSample = texture2D(causticsTexture, causticsUV);
    float causticsIntensity = causticsSample.r * causticsIntensity;
    
    // Add caustics to final color in linear space (before tone mapping)
    // This ensures proper color space handling and prevents artifacts
    gl_FragColor.rgb += causticsIntensity * 0.5;
  }
#endif

#include <output_fragment>`
        )
      } else {
        // Fallback: If output_fragment is not found, inject at end of main()
        // This is less ideal but ensures caustics still work
        if (shader.fragmentShader.includes('void main()')) {
          const mainEndMatch = shader.fragmentShader.match(/}\s*$/)
          if (mainEndMatch) {
            shader.fragmentShader = shader.fragmentShader.replace(
              /}\s*$/,
              `
  // Caustics injection (fallback - before final output)
  if (causticsEnabled > 0.5) {
    vec2 causticsUV = vWorldPosition.xz * 0.01 + 0.5;
    vec4 causticsSample = texture2D(causticsTexture, causticsUV);
    float causticsIntensity = causticsSample.r * causticsIntensity;
    gl_FragColor.rgb += causticsIntensity * 0.5;
  }
}`
            )
          }
        }
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
export const causticsModifierRegistry = CausticsModifierRegistry.getInstance()
