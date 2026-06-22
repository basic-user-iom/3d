// @ts-nocheck

import * as THREE from 'three'
import { shaderModifierRegistry, ShaderModifier } from './ShaderModifierRegistry'

export interface RandomUVConfig {
  enabled: boolean
  offsetRange: number // Maximum UV offset (0-1)
  rotationRange: number // Maximum rotation in radians
  scaleRange: { min: number; max: number } // UV scale range
}

/**
 * Random UV Modifier using ShaderModifierRegistry
 * 
 * This modifier is registered with ShaderModifierRegistry to enable chaining with other modifiers
 */
class RandomUVModifierRegistry {
  private static instance: RandomUVModifierRegistry | null = null
  private materialConfigs: WeakMap<THREE.Material, RandomUVConfig> = new WeakMap()
  private materialUniforms: WeakMap<THREE.Material, {
    randomUVOffset: { value: THREE.Vector2 }
    randomUVRotation: { value: number }
    randomUVScale: { value: number }
  }> = new WeakMap()

  private constructor() {
    // Register the modifier with ShaderModifierRegistry
    const modifier: ShaderModifier = {
      id: 'random-uv',
      name: 'Random UV',
      priority: 70, // Run after caustics (priority 60)
      apply: this.applyShaderModification.bind(this),
      cleanup: this.cleanupMaterial.bind(this)
    }
    
    shaderModifierRegistry.register(modifier)
  }

  static getInstance(): RandomUVModifierRegistry {
    if (!RandomUVModifierRegistry.instance) {
      RandomUVModifierRegistry.instance = new RandomUVModifierRegistry()
    }
    return RandomUVModifierRegistry.instance
  }

  /**
   * Apply random UV modifications to a material
   */
  applyToMaterial(material: THREE.Material, config: RandomUVConfig): void {
    if (!config.enabled) {
      this.removeFromMaterial(material)
      return
    }

    // Store config
    this.materialConfigs.set(material, config)

    // Generate random UV transformation (only once per material)
    let uniforms = this.materialUniforms.get(material)
    if (!uniforms) {
      const uvOffset = new THREE.Vector2(
        (Math.random() - 0.5) * config.offsetRange * 2,
        (Math.random() - 0.5) * config.offsetRange * 2
      )
      const uvRotation = (Math.random() - 0.5) * config.rotationRange * 2
      const uvScale = 
        config.scaleRange.min + 
        Math.random() * (config.scaleRange.max - config.scaleRange.min)

      uniforms = {
        randomUVOffset: { value: uvOffset },
        randomUVRotation: { value: uvRotation },
        randomUVScale: { value: uvScale }
      }
      this.materialUniforms.set(material, uniforms)
    }

    // Apply modifier using registry (this will recompile shader if needed)
    shaderModifierRegistry.applyModifier(material, 'random-uv')
    
    // Force material update to ensure uniforms are synced
    material.needsUpdate = true
  }

  /**
   * Remove random UV modifications from a material
   */
  removeFromMaterial(material: THREE.Material): void {
    this.materialConfigs.delete(material)
    shaderModifierRegistry.removeModifier(material, 'random-uv')
  }

  /**
   * Update material configuration
   */
  updateMaterialConfig(material: THREE.Material, config: Partial<RandomUVConfig>): void {
    const existingConfig = this.materialConfigs.get(material)
    if (existingConfig) {
      const newConfig: RandomUVConfig = {
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

    // Ensure shader code exists and is valid
    if (!shader.vertexShader || typeof shader.vertexShader !== 'string') {
      console.warn('[RandomUVModifierRegistry] Invalid vertex shader, skipping random UV injection')
      return
    }
    if (!shader.fragmentShader || typeof shader.fragmentShader !== 'string') {
      console.warn('[RandomUVModifierRegistry] Invalid fragment shader, skipping random UV injection')
      return
    }

    // Get uniforms
    let uniforms = this.materialUniforms.get(material)
    if (!uniforms) {
      // Generate random UV transformation
      const uvOffset = new THREE.Vector2(
        (Math.random() - 0.5) * config.offsetRange * 2,
        (Math.random() - 0.5) * config.offsetRange * 2
      )
      const uvRotation = (Math.random() - 0.5) * config.rotationRange * 2
      const uvScale = 
        config.scaleRange.min + 
        Math.random() * (config.scaleRange.max - config.scaleRange.min)

      uniforms = {
        randomUVOffset: { value: uvOffset },
        randomUVRotation: { value: uvRotation },
        randomUVScale: { value: uvScale }
      }
      this.materialUniforms.set(material, uniforms)
    }

    // Add uniforms to shader
    shader.uniforms = shader.uniforms || {}
    shader.uniforms.randomUVOffset = uniforms.randomUVOffset
    shader.uniforms.randomUVRotation = uniforms.randomUVRotation
    shader.uniforms.randomUVScale = uniforms.randomUVScale

    // Modify vertex shader to transform UVs
    const uvTransformCode = `
      #ifdef USE_UV
        vec2 uvTransformed = vUv;
        
        // Apply scale
        uvTransformed = (uvTransformed - 0.5) * randomUVScale + 0.5;
        
        // Apply rotation
        float cosRot = cos(randomUVRotation);
        float sinRot = sin(randomUVRotation);
        uvTransformed = (uvTransformed - 0.5) * mat2(cosRot, -sinRot, sinRot, cosRot) + 0.5;
        
        // Apply offset
        uvTransformed += randomUVOffset;
        
        vUv = uvTransformed;
      #endif
    `

    // Insert after UV declaration (only if the include exists)
    if (shader.vertexShader.includes('#include <uv_vertex>')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        ${uvTransformCode}`
      )
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
export const randomUVModifierRegistry = RandomUVModifierRegistry.getInstance()
