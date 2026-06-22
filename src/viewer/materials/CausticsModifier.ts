import * as THREE from 'three'

export interface CausticsModifierConfig {
  enabled: boolean
  intensity: number
  texture: THREE.Texture | null
}

/**
 * @deprecated This standalone modifier is deprecated. Use CausticsModifierRegistry instead.
 * 
 * The registry version provides better compatibility with other modifiers through
 * the ShaderModifierRegistry system.
 * 
 * Migration: Replace `CausticsModifier.getInstance()` with `causticsModifierRegistry`
 * 
 * Material modifier to inject caustics into materials
 * Uses onBeforeCompile to add caustics texture sampling and blending
 */
export class CausticsModifier {
  private static instance: CausticsModifier | null = null
  private config: CausticsModifierConfig

  constructor() {
    this.config = {
      enabled: true,
      intensity: 1.0,
      texture: null
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CausticsModifier {
    if (!CausticsModifier.instance) {
      CausticsModifier.instance = new CausticsModifier()
    }
    return CausticsModifier.instance
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

    const finalConfig = { ...this.config, ...config }

    // Store original onBeforeCompile in userData if not already stored
    const userData = material.userData as any
    if (!userData.originalOnBeforeCompile) {
      userData.originalOnBeforeCompile = material.onBeforeCompile
    }
    const originalOnBeforeCompile = userData.originalOnBeforeCompile

    material.onBeforeCompile = (parameters: any, renderer: THREE.WebGLRenderer) => {
      // Call original onBeforeCompile if it exists
      if (originalOnBeforeCompile) {
        originalOnBeforeCompile.call(material, parameters, renderer)
      }

      // Ensure shader code exists and is valid (CRITICAL: prevents null.trim() error)
      if (!parameters.vertexShader || typeof parameters.vertexShader !== 'string') {
        console.warn('[CausticsModifier] Invalid vertex shader, skipping caustics injection')
        return
      }
      if (!parameters.fragmentShader || typeof parameters.fragmentShader !== 'string') {
        console.warn('[CausticsModifier] Invalid fragment shader, skipping caustics injection')
        return
      }

      // Ensure uniforms object exists
      parameters.uniforms = parameters.uniforms || {}
      
      // Add USE_CAUSTICS define for shader optimization
      if (parameters.defines === undefined) {
        parameters.defines = {}
      }
      parameters.defines.USE_CAUSTICS = ''
      
      // Only add texture uniform if texture is not null (CRITICAL: prevents null uniform errors)
      if (finalConfig.texture && finalConfig.texture instanceof THREE.Texture) {
        parameters.uniforms.causticsTexture = { value: finalConfig.texture }
      } else {
        // Create a dummy 1x1 white texture if no texture provided
        const dummyTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
        dummyTexture.needsUpdate = true
        parameters.uniforms.causticsTexture = { value: dummyTexture }
      }
      
      parameters.uniforms.causticsEnabled = { value: finalConfig.enabled ? 1.0 : 0.0 }
      parameters.uniforms.causticsIntensity = { value: finalConfig.intensity }

      // Inject caustics vertex shader code to pass world position
      // CRITICAL: Ensure vWorldPosition is declared in vertex shader and assigned a value
      if (parameters.vertexShader) {
        const hasVaryingDecl = parameters.vertexShader.includes('varying vec3 vWorldPosition') || 
                                parameters.vertexShader.includes('varying vec3 vWorldPosition;')
        
        // Add varying declaration if not present
        if (!hasVaryingDecl) {
          // Try to add after common includes or before main
          if (parameters.vertexShader.includes('#include <common>')) {
            parameters.vertexShader = parameters.vertexShader.replace(
              '#include <common>',
              `#include <common>
varying vec3 vWorldPosition;`
            )
          } else if (parameters.vertexShader.includes('void main()')) {
            const mainMatch = parameters.vertexShader.match(/void main\(\)/);
            if (mainMatch && mainMatch.index !== undefined) {
              const beforeMain = parameters.vertexShader.substring(0, mainMatch.index)
              const afterMain = parameters.vertexShader.substring(mainMatch.index)
              parameters.vertexShader = beforeMain + 'varying vec3 vWorldPosition;\n' + afterMain
            }
          }
        }
        
        // Ensure vWorldPosition is assigned in vertex shader
        // Use worldPosition if available (from Three.js includes), otherwise calculate manually
        if (!parameters.vertexShader.includes('vWorldPosition =')) {
          if (parameters.vertexShader.includes('#include <worldpos_vertex>')) {
            // worldPosition is already available from the include, just assign it
            parameters.vertexShader = parameters.vertexShader.replace(
              '#include <worldpos_vertex>',
              `#include <worldpos_vertex>
vWorldPosition = worldPosition;`
            )
          } else if (parameters.vertexShader.includes('#include <project_vertex>')) {
            // Calculate world position manually
            parameters.vertexShader = parameters.vertexShader.replace(
              '#include <project_vertex>',
              `#include <project_vertex>
vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;`
            )
          } else if (parameters.vertexShader.includes('gl_Position =')) {
            // Add assignment near gl_Position calculation
            parameters.vertexShader = parameters.vertexShader.replace(
              /gl_Position\s*=/,
              `vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
gl_Position =`
            )
          }
        }
      }

      // Inject caustics fragment shader code
      // CRITICAL: Ensure vWorldPosition is declared in fragment shader to match vertex shader
      if (parameters.fragmentShader) {
        const hasVaryingDecl = parameters.fragmentShader.includes('varying vec3 vWorldPosition') || 
                                parameters.fragmentShader.includes('varying vec3 vWorldPosition;')
        
        // Add varying declaration if not present (must match vertex shader)
        if (!hasVaryingDecl) {
          if (parameters.fragmentShader.includes('#include <common>')) {
            parameters.fragmentShader = parameters.fragmentShader.replace(
              '#include <common>',
              `#include <common>
varying vec3 vWorldPosition;`
            )
          } else if (parameters.fragmentShader.includes('void main()')) {
            const mainMatch = parameters.fragmentShader.match(/void main\(\)/);
            if (mainMatch && mainMatch.index !== undefined) {
              const beforeMain = parameters.fragmentShader.substring(0, mainMatch.index)
              const afterMain = parameters.fragmentShader.substring(mainMatch.index)
              parameters.fragmentShader = beforeMain + 'varying vec3 vWorldPosition;\n' + afterMain
            }
          }
        }
        
        // Inject caustics calculation BEFORE output_fragment
        // CRITICAL: Must inject before output_fragment to work in linear color space
        // output_fragment applies tone mapping and color space conversion
        // Adding after output_fragment causes artifacts (mixing linear and tone-mapped colors)
        if (parameters.fragmentShader.includes('#include <output_fragment>')) {
          parameters.fragmentShader = parameters.fragmentShader.replace(
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
        }
      }
    }

    // Store config in material userData
    material.userData.causticsConfig = finalConfig
  }

  /**
   * Update caustics uniforms for an already modified material
   */
  updateMaterialUniforms(material: THREE.Material, config: Partial<CausticsModifierConfig>): void {
    const userData = material.userData as any
    if (!userData.causticsConfig) {
      return // Material not modified
    }

    const updatedConfig = { ...userData.causticsConfig, ...config }

    // Update uniforms if they exist
    if ((material as any).uniforms) {
      const uniforms = (material as any).uniforms
      if (uniforms.causticsTexture) {
        uniforms.causticsTexture.value = updatedConfig.texture || (() => {
          const dummyTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
          dummyTexture.needsUpdate = true
          return dummyTexture
        })()
      }
      if (uniforms.causticsEnabled) {
        uniforms.causticsEnabled.value = updatedConfig.enabled ? 1.0 : 0.0
      }
      if (uniforms.causticsIntensity) {
        uniforms.causticsIntensity.value = updatedConfig.intensity
      }
    }

    userData.causticsConfig = updatedConfig
  }

  /**
   * Remove caustics from a material
   */
  removeFromMaterial(material: THREE.Material): void {
    const userData = material.userData as any
    if (!userData.causticsConfig) {
      return // Material not modified
    }

    // Restore original onBeforeCompile
    if (userData.originalOnBeforeCompile) {
      material.onBeforeCompile = userData.originalOnBeforeCompile as any
      delete userData.originalOnBeforeCompile
    } else {
      delete (material as any).onBeforeCompile
    }

    delete userData.causticsConfig
  }

  /**
   * Apply caustics to all materials in an object hierarchy
   */
  applyToObject(object: THREE.Object3D, config?: Partial<CausticsModifierConfig>): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((mat) => {
          this.applyToMaterial(mat, config)
        })
      }
    })
  }

  /**
   * Remove caustics from all materials in an object hierarchy
   */
  removeFromObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((mat) => {
          this.removeFromMaterial(mat)
        })
      }
    })
  }

  /**
   * Update global config
   */
  updateConfig(config: Partial<CausticsModifierConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current config
   */
  getConfig(): CausticsModifierConfig {
    return { ...this.config }
  }
}
