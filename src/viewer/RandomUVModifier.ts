// @ts-nocheck

import * as THREE from 'three'

export interface RandomUVConfig {
  enabled: boolean
  offsetX: number // Random offset range for U (0-1)
  offsetY: number // Random offset range for V (0-1)
  rotation: number // Random rotation range in radians
  scaleX: number // Random scale range for U
  scaleY: number // Random scale range for V
}

/**
 * RandomUVModifier - Applies random UV transformations to materials
 * Based on: https://threejs.org/examples/webgl_random_uv.html
 * 
 * This allows each instance to have unique UV coordinates for variation in textures
 */
export class RandomUVModifier {
  private materialsWithRandomUV: WeakSet<THREE.Material> = new WeakSet()
  private originalOnBeforeCompile: WeakMap<THREE.Material, ((shader: THREE.Shader) => void) | undefined> = new WeakMap()
  private materialRandomValues: WeakMap<THREE.Material, { offsetX: number; offsetY: number; rotation: number; scaleX: number; scaleY: number }> = new WeakMap()

  /**
   * Apply random UV transformations to a material
   */
  applyToMaterial(material: THREE.Material, config: RandomUVConfig): void {
    if (!config.enabled) {
      this.removeFromMaterial(material)
      return
    }

    // Check if already applied
    if (this.materialsWithRandomUV.has(material)) {
      this.updateMaterialUniforms(material, config)
      return
    }

    // Generate random values for this material instance
    const randomValues = {
      offsetX: (Math.random() - 0.5) * config.offsetX,
      offsetY: (Math.random() - 0.5) * config.offsetY,
      rotation: (Math.random() - 0.5) * config.rotation,
      scaleX: 1.0 + (Math.random() - 0.5) * config.scaleX,
      scaleY: 1.0 + (Math.random() - 0.5) * config.scaleY
    }

    this.materialRandomValues.set(material, randomValues)

    // Store original onBeforeCompile
    if (material.onBeforeCompile) {
      this.originalOnBeforeCompile.set(material, material.onBeforeCompile)
    }

    // Create uniforms
    if (!material.userData.randomUVUniforms) {
      material.userData.randomUVUniforms = {
        randomUVOffset: { value: new THREE.Vector2(randomValues.offsetX, randomValues.offsetY) },
        randomUVRotation: { value: randomValues.rotation },
        randomUVScale: { value: new THREE.Vector2(randomValues.scaleX, randomValues.scaleY) }
      }
    }

    // Inject shader code
    material.onBeforeCompile = (shader) => {
      // Add uniforms
      shader.uniforms.randomUVOffset = material.userData.randomUVUniforms.randomUVOffset
      shader.uniforms.randomUVRotation = material.userData.randomUVUniforms.randomUVRotation
      shader.uniforms.randomUVScale = material.userData.randomUVUniforms.randomUVScale

      // Add random UV transformation code
      const randomUVCode = `
        uniform vec2 randomUVOffset;
        uniform float randomUVRotation;
        uniform vec2 randomUVScale;

        vec2 transformRandomUV(vec2 uv) {
          // Apply offset
          vec2 transformed = uv + randomUVOffset;
          
          // Apply rotation around center (0.5, 0.5)
          vec2 center = vec2(0.5, 0.5);
          transformed -= center;
          
          float cosRot = cos(randomUVRotation);
          float sinRot = sin(randomUVRotation);
          transformed = vec2(
            transformed.x * cosRot - transformed.y * sinRot,
            transformed.x * sinRot + transformed.y * cosRot
          );
          
          transformed += center;
          
          // Apply scale around center
          transformed = (transformed - center) * randomUVScale + center;
          
          return transformed;
        }
      `

      // Inject code before main function
      shader.fragmentShader = randomUVCode + shader.fragmentShader

      // Replace UV usage in fragment shader
      // Find common UV variable names and transform them
      const uvPatterns = [
        /vUv/g,
        /vUv2/g,
        /vUv0/g,
        /vUv1/g,
        /\buv\b/g // Generic uv variable (be careful with this)
      ]

      // Transform UV coordinates for texture sampling
      shader.fragmentShader = shader.fragmentShader.replace(
        /(texture2D|texture)\((map_[^,]+|diffuseMap|normalMap|roughnessMap|metalnessMap|aoMap|emissiveMap|bumpMap|displacementMap|alphaMap|clearcoatMap|clearcoatNormalMap|clearcoatRoughnessMap|sheenColorMap|sheenRoughnessMap|transmissionMap|thicknessMap|specularMap|specularIntensityMap|specularColorMap|envMap)[^,]*,\s*([^)]+)\)/g,
        (match, textureFunc, mapName, uvVar) => {
          // Extract UV variable from the texture call
          const uvMatch = match.match(/,\s*([^)]+)\)/)
          if (uvMatch && uvMatch[1]) {
            const uv = uvMatch[1].trim()
            // Check if it's a vec2 UV coordinate (not already transformed)
            if (uv.match(/^(vUv|vUv[0-9]|uv)\b/)) {
              return match.replace(uv, `transformRandomUV(${uv})`)
            }
          }
          return match
        }
      )

      // Also handle direct UV assignments and usage in common patterns
      shader.fragmentShader = shader.fragmentShader.replace(
        /(vec2\s+(vUv|vUv[0-9]|uv)\s*=)\s*([^;]+);/g,
        (match, decl, varName, value) => {
          if (value.includes('transformRandomUV')) {
            return match // Already transformed
          }
          return `${decl} transformRandomUV(${value});`
        }
      )

      // Call original onBeforeCompile if it exists
      const originalOnBeforeCompile = this.originalOnBeforeCompile.get(material)
      if (originalOnBeforeCompile) {
        originalOnBeforeCompile(shader)
      }
    }

    material.needsUpdate = true
    this.materialsWithRandomUV.add(material)
  }

  /**
   * Update existing material uniforms
   */
  updateMaterialUniforms(material: THREE.Material, config: RandomUVConfig): void {
    if (!material.userData.randomUVUniforms) return

    const randomValues = this.materialRandomValues.get(material)
    if (randomValues) {
      material.userData.randomUVUniforms.randomUVOffset.value.set(
        randomValues.offsetX,
        randomValues.offsetY
      )
      material.userData.randomUVUniforms.randomUVRotation.value = randomValues.rotation
      material.userData.randomUVScale.value.set(randomValues.scaleX, randomValues.scaleY)
      material.needsUpdate = true
    }
  }

  /**
   * Remove random UV transformations from a material
   */
  removeFromMaterial(material: THREE.Material): void {
    if (!this.materialsWithRandomUV.has(material)) return

    // Restore original onBeforeCompile
    const originalOnBeforeCompile = this.originalOnBeforeCompile.get(material)
    if (originalOnBeforeCompile !== undefined) {
      material.onBeforeCompile = originalOnBeforeCompile
    } else {
      material.onBeforeCompile = undefined
    }

    // Clean up userData
    delete material.userData.randomUVUniforms
    this.materialRandomValues.delete(material)
    material.needsUpdate = true

    // Remove from tracking (WeakSet doesn't have delete, but we can check)
    // The WeakSet will automatically remove it when material is garbage collected
  }

  /**
   * Apply to all materials in an object hierarchy
   */
  applyToObject(object: THREE.Object3D, config: RandomUVConfig): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material

        if (Array.isArray(material)) {
          material.forEach((mat) => {
            if (mat instanceof THREE.Material) {
              this.applyToMaterial(mat, config)
            }
          })
        } else if (material instanceof THREE.Material) {
          this.applyToMaterial(material, config)
        }
      }
    })
  }

  /**
   * Remove from all materials in an object hierarchy
   */
  removeFromObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material

        if (Array.isArray(material)) {
          material.forEach((mat) => {
            if (mat instanceof THREE.Material) {
              this.removeFromMaterial(mat)
            }
          })
        } else if (material instanceof THREE.Material) {
          this.removeFromMaterial(material)
        }
      }
    })
  }
}

