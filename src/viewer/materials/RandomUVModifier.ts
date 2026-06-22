// @ts-nocheck

import * as THREE from 'three'

export interface RandomUVConfig {
  enabled: boolean
  offsetRange: number // Maximum UV offset (0-1)
  rotationRange: number // Maximum rotation in radians
  scaleRange: { min: number; max: number } // UV scale range
}

/**
 * @deprecated This standalone modifier is deprecated. Use RandomUVModifierRegistry instead.
 * 
 * The registry version provides better compatibility with other modifiers through
 * the ShaderModifierRegistry system.
 * 
 * Migration: Replace `new RandomUVModifier()` with `randomUVModifierRegistry`
 * 
 * Applies random UV transformations to materials for variation
 * Based on: https://threejs.org/examples/#webgl_random_uv
 */
export class RandomUVModifier {
  private materialsWithRandomUV = new WeakSet<THREE.Material>()
  private originalOnBeforeCompile = new WeakMap<THREE.Material, (shader: THREE.Shader) => void>()

  /**
   * Apply random UV modifications to a material
   */
  applyToMaterial(material: THREE.Material, config: RandomUVConfig): void {
    if (!config.enabled) {
      this.removeFromMaterial(material)
      return
    }

    if (this.materialsWithRandomUV.has(material)) {
      // Already applied, just update uniforms
      this.updateMaterialUniforms(material, config)
      return
    }

    // Store original onBeforeCompile
    const originalOnBeforeCompile = material.onBeforeCompile
    this.originalOnBeforeCompile.set(material, originalOnBeforeCompile)

    // Generate random UV transformation
    const uvOffset = new THREE.Vector2(
      (Math.random() - 0.5) * config.offsetRange * 2,
      (Math.random() - 0.5) * config.offsetRange * 2
    )
    const uvRotation = (Math.random() - 0.5) * config.rotationRange * 2
    const uvScale = 
      config.scaleRange.min + 
      Math.random() * (config.scaleRange.max - config.scaleRange.min)

    // Store in material userData for later updates
    material.userData.randomUVConfig = config
    material.userData.randomUVOffset = uvOffset
    material.userData.randomUVRotation = uvRotation
    material.userData.randomUVScale = uvScale

    // Inject shader code
    material.onBeforeCompile = (shader: THREE.Shader) => {
      // Ensure uniforms object exists (CRITICAL: prevents null uniform errors)
      if (!shader.uniforms) {
        shader.uniforms = {}
      }

      // Ensure shader code exists and is valid BEFORE adding uniforms or modifying shaders
      // This prevents Three.js from trying to process null shader strings
      if (!shader.vertexShader || typeof shader.vertexShader !== 'string') {
        console.warn('[RandomUVModifier] Invalid vertex shader, skipping random UV injection')
        // Call original onBeforeCompile if it existed
        if (originalOnBeforeCompile) {
          originalOnBeforeCompile.call(material, shader)
        }
        return
      }
      if (!shader.fragmentShader || typeof shader.fragmentShader !== 'string') {
        console.warn('[RandomUVModifier] Invalid fragment shader, skipping random UV injection')
        // Call original onBeforeCompile if it existed
        if (originalOnBeforeCompile) {
          originalOnBeforeCompile.call(material, shader)
        }
        return
      }

      // Add uniforms (only after validating shader strings)
      shader.uniforms.randomUVOffset = { value: uvOffset }
      shader.uniforms.randomUVRotation = { value: uvRotation }
      shader.uniforms.randomUVScale = { value: uvScale }

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

      // Call original onBeforeCompile if it existed
      if (originalOnBeforeCompile) {
        originalOnBeforeCompile.call(material, shader)
      }
    }

    material.needsUpdate = true
    this.materialsWithRandomUV.add(material)
  }

  /**
   * Update random UV uniforms for an already modified material
   */
  private updateMaterialUniforms(material: THREE.Material, config: RandomUVConfig): void {
    if (!material.userData.randomUVConfig) return

    // Update config
    material.userData.randomUVConfig = config

    // Note: Uniforms are set during onBeforeCompile, so we need to trigger a recompile
    // This is a limitation - full update would require storing uniform references
    // For now, just mark for update
    material.needsUpdate = true
  }

  /**
   * Remove random UV modifications from a material
   */
  removeFromMaterial(material: THREE.Material): void {
    if (!this.materialsWithRandomUV.has(material)) return

    // Restore original onBeforeCompile
    const originalOnBeforeCompile = this.originalOnBeforeCompile.get(material)
    material.onBeforeCompile = originalOnBeforeCompile

    // Clean up userData
    delete material.userData.randomUVConfig
    delete material.userData.randomUVOffset
    delete material.userData.randomUVRotation
    delete material.userData.randomUVScale

    material.needsUpdate = true
    this.materialsWithRandomUV.delete(material)
  }

  /**
   * Apply to all materials in an object
   */
  applyToObject(object: THREE.Object3D, config: RandomUVConfig): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => {
          this.applyToMaterial(material, config)
        })
      }
    })
  }

  /**
   * Remove from all materials in an object
   */
  removeFromObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => {
          this.removeFromMaterial(material)
        })
      }
    })
  }
}




