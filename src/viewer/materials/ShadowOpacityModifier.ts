// @ts-nocheck

import * as THREE from 'three'

export interface ShadowOpacityConfig {
  enabled: boolean
  opacity: number // 0-1, shadow opacity multiplier
  color: THREE.Color // Shadow color tint
}

/**
 * @deprecated This standalone modifier is deprecated. Use ShadowOpacityModifierRegistry instead.
 * 
 * The registry version provides better compatibility with other modifiers through
 * the ShaderModifierRegistry system.
 * 
 * Migration: Replace `new ShadowOpacityModifier()` with `shadowOpacityModifierRegistry`
 * 
 * Modifier to add shadow opacity and color control to materials
 * Based on Three.js example: https://threejs.org/examples/webgpu_shadowmap_opacity.html
 */
export class ShadowOpacityModifier {
  private materialsWithShadowOpacity: WeakSet<THREE.Material> = new WeakSet()
  private originalOnBeforeCompile: WeakMap<THREE.Material, ((parameters: any, renderer: THREE.WebGLRenderer) => void) | undefined> = new WeakMap()
  private materialUniforms: WeakMap<THREE.Material, { shadowOpacity: { value: number }, shadowColor: { value: THREE.Color } }> = new WeakMap()

  /**
   * Apply shadow opacity modifications to a material
   */
  applyToMaterial(material: THREE.Material, config: ShadowOpacityConfig): void {
    if (!config.enabled) {
      this.removeFromMaterial(material)
      return
    }

    // Skip ALL MeshPhysicalMaterial instances - they have complex shaders that don't work well with our modifications
    // This includes glass materials which use transmission/thickness/ior
    if (material instanceof THREE.MeshPhysicalMaterial) {
      return
    }

    // CRITICAL: Skip ShaderMaterial instances - they have custom shaders that don't use Three.js chunk system
    // ShaderMaterials don't have #include <shadowmap_fragment> and our injection will break them
    // This includes water materials, particle systems, sky materials, path tracer materials, etc.
    if (material instanceof THREE.ShaderMaterial) {
      console.warn('[ShadowOpacityModifier] Skipping ShaderMaterial - custom shaders are not compatible with shadow opacity injection')
      return
    }

    // Skip if already applied
    if (this.materialsWithShadowOpacity.has(material)) {
      this.updateMaterialUniforms(material, config)
      return
    }

    // Store original onBeforeCompile if it exists
    // CRITICAL: Check userData first (like CausticsModifier does) to support chaining with other modifiers
    // This allows ShadowOpacityModifier to work with CausticsModifier, RandomUVModifier, etc.
    const userData = material.userData as any
    let originalCompile: ((parameters: any, renderer: THREE.WebGLRenderer) => void) | undefined
    
    if (userData.originalOnBeforeCompile) {
      // Another modifier is already using userData.originalOnBeforeCompile
      // Chain with the existing onBeforeCompile (which may be from another modifier)
      originalCompile = material.onBeforeCompile as ((parameters: any, renderer: THREE.WebGLRenderer) => void) | undefined
    } else {
      // First modifier on this material, store the original
      originalCompile = material.onBeforeCompile as ((parameters: any, renderer: THREE.WebGLRenderer) => void) | undefined
      userData.originalOnBeforeCompile = originalCompile
    }
    
    // Also store in WeakMap for backwards compatibility
    this.originalOnBeforeCompile.set(material, originalCompile)

    // Store config in material userData (this will be the source of truth)
    if (!material.userData.shadowOpacityConfig) {
      material.userData.shadowOpacityConfig = {}
    }
    material.userData.shadowOpacityConfig = {
      opacity: config.opacity,
      color: config.color.clone()
    }

    // Inject shadow opacity shader code (SAFE MODE)
    material.onBeforeCompile = (parameters: any, renderer: THREE.WebGLRenderer) => {
      // CRITICAL: Double-check that this is NOT a ShaderMaterial
      // This prevents issues if the material type changed or check was bypassed
      if (material instanceof THREE.ShaderMaterial) {
        console.error('[ShadowOpacityModifier] ERROR: onBeforeCompile called on ShaderMaterial - this should never happen!', {
          materialName: material.name,
          materialType: material.type,
          hasVertexShader: !!material.vertexShader,
          hasFragmentShader: !!material.fragmentShader
        })
        // Remove shadow opacity config immediately to prevent further issues
        if (material.userData.shadowOpacityConfig) {
          delete material.userData.shadowOpacityConfig
        }
        if (material.userData.shadowOpacityUniforms) {
          delete material.userData.shadowOpacityUniforms
        }
        // Call original if it exists, but don't modify shader
        if (originalCompile) {
          originalCompile.call(material, parameters, renderer)
        } else {
          // No original - restore to undefined to prevent shader compilation errors
          material.onBeforeCompile = undefined
        }
        return
      }
      
      // Call original onBeforeCompile first if it exists
      if (originalCompile) {
        originalCompile.call(material, parameters, renderer)
      }

      // Ensure uniforms object exists (CRITICAL: prevents null uniform errors)
      if (!parameters.uniforms) {
        parameters.uniforms = {}
      }

      // Ensure shader code exists and is valid BEFORE adding uniforms
      // This prevents Three.js from trying to process null shader strings
      if (!parameters.fragmentShader || typeof parameters.fragmentShader !== 'string') {
        console.warn('[ShadowOpacityModifier] Invalid fragment shader, skipping shadow opacity injection')
        return
      }
      if (!parameters.vertexShader || typeof parameters.vertexShader !== 'string') {
        console.warn('[ShadowOpacityModifier] Invalid vertex shader, skipping shadow opacity injection')
        return
      }

      // Get the latest config from userData (in case it was updated after applyToMaterial was called)
      const currentConfig = material.userData.shadowOpacityConfig || config
      const opacityValue = currentConfig.opacity ?? config.opacity
      const colorValue = currentConfig.color ? currentConfig.color.clone() : config.color.clone()

      // Add uniforms for shadow opacity (only after validating shader strings)
      const shadowOpacityUniform = { value: opacityValue }
      const shadowColorUniform = { value: colorValue }
      
      parameters.uniforms.shadowOpacity = shadowOpacityUniform
      parameters.uniforms.shadowColor = shadowColorUniform
      
      // Store uniform references on the material itself so they persist across modifier instances
      // This is critical because useEffect creates new modifier instances
      if (!material.userData.shadowOpacityUniforms) {
        material.userData.shadowOpacityUniforms = {}
      }
      material.userData.shadowOpacityUniforms.shadowOpacity = shadowOpacityUniform
      material.userData.shadowOpacityUniforms.shadowColor = shadowColorUniform
      
      // Also store in our WeakMap for backwards compatibility
      this.materialUniforms.set(material, {
        shadowOpacity: shadowOpacityUniform,
        shadowColor: shadowColorUniform
      })
      
      const shader = parameters

      // We only modify shaders that clearly have shadow code we can hook into safely
      // CRITICAL: Check for shadowmap_fragment include AFTER other modifiers may have modified the shader
      // This ensures we're checking the final shader state, not the initial state
      const hasShadowInclude = shader.fragmentShader.includes('#include <shadowmap_fragment>')
      
      // Check if shadowMask variable exists or will be created by shadowmap_fragment
      // shadowMask is declared inside shadowmap_fragment, so we just need the include
      if (!hasShadowInclude) {
        // Skip modification to avoid compile errors on materials without shadow support
        // This can happen with custom shaders or materials that don't support shadows
        // Only log once per material type to reduce console noise
        const materialType = material.type || 'Unknown'
        if (!material.userData._shadowOpacityWarningLogged) {
          material.userData._shadowOpacityWarningLogged = true
          // Use debug level instead of warn to reduce noise
          if (typeof console.debug === 'function') {
            console.debug(`[ShadowOpacityModifier] Material "${materialType}" does not support shadows, skipping shadow opacity`)
          }
        }
        return
      }

      // Check if we've already injected our code (prevents double injection if called multiple times)
      if (shader.fragmentShader.includes('// ShadowOpacityModifier:') || 
          shader.fragmentShader.includes('shadowOpacityLitColor')) {
        // Code already injected, just update uniforms (they're already set above)
        return
      }

      // Strategy: Wrap everything in USE_SHADOWMAP to ensure proper scope
      // CRITICAL: shadowmap_fragment is inside #ifdef USE_SHADOWMAP in Three.js shaders
      // We need to capture and apply within the same conditional block
      let fragmentShader = shader.fragmentShader
      
      // Check if shadowmap_fragment is already inside a USE_SHADOWMAP block
      const shadowIncludeIndex = fragmentShader.indexOf('#include <shadowmap_fragment>')
      const beforeInclude = fragmentShader.substring(Math.max(0, shadowIncludeIndex - 300), shadowIncludeIndex)
      const hasUseShadowmapBlock = beforeInclude.includes('#ifdef USE_SHADOWMAP') || 
                                    beforeInclude.includes('#if defined(USE_SHADOWMAP)')
      
      // If shadowmap_fragment is already in a block, we need to capture before that block opens
      // If not, we'll wrap everything ourselves
      let captureColorCode: string
      let applyShadowOpacityCode: string
      
      if (hasUseShadowmapBlock) {
        // shadowmap_fragment is inside USE_SHADOWMAP - capture before the block, apply inside
        // We need to capture gl_FragColor before the #ifdef USE_SHADOWMAP that contains shadowmap_fragment
        captureColorCode = `
        // ShadowOpacityModifier: Capture lit color before shadowmap block
        vec3 shadowOpacityLitColor = gl_FragColor.rgb;
        `
        
        applyShadowOpacityCode = `
        // ShadowOpacityModifier: Apply custom shadow opacity after shadowmap
        float shadowAmount = clamp(1.0 - shadowMask, 0.0, 1.0) * shadowOpacity;
        vec3 shadowedColor = shadowOpacityLitColor * shadowColor.rgb;
        gl_FragColor.rgb = mix(shadowOpacityLitColor, shadowedColor, shadowAmount);
        `
      } else {
        // shadowmap_fragment is not in a block - wrap everything in USE_SHADOWMAP
        captureColorCode = `
        // ShadowOpacityModifier: Capture lit color and apply custom shadow opacity
        #ifdef USE_SHADOWMAP
          vec3 shadowOpacityLitColor = gl_FragColor.rgb;
        `
        
        applyShadowOpacityCode = `
          float shadowAmount = clamp(1.0 - shadowMask, 0.0, 1.0) * shadowOpacity;
          vec3 shadowedColor = shadowOpacityLitColor * shadowColor.rgb;
          gl_FragColor.rgb = mix(shadowOpacityLitColor, shadowedColor, shadowAmount);
        #endif
        `
      }

      // Insert code to capture color BEFORE shadowmap_fragment, then apply custom shadow after
      // Only replace the FIRST occurrence to avoid conflicts
      const firstOccurrence = fragmentShader.indexOf('#include <shadowmap_fragment>')
      if (firstOccurrence !== -1) {
        try {
          // Validate that we're not breaking the shader structure
          // Check that gl_FragColor is likely to be set before shadowmap_fragment
          const beforeInclude = fragmentShader.substring(0, firstOccurrence)
          const hasOutputFragment = beforeInclude.includes('#include <output_fragment>') || 
                                    beforeInclude.includes('gl_FragColor') ||
                                    beforeInclude.includes('gl_FragColor.rgb')
          
          if (!hasOutputFragment && !beforeInclude.includes('gl_FragColor')) {
            // gl_FragColor might not be set yet - this is unsafe
            console.warn('[ShadowOpacityModifier] gl_FragColor may not be initialized before shadowmap_fragment, skipping injection to avoid shader errors')
            return
          }
          
          // Capture color before shadowmap_fragment, then apply after
          fragmentShader = fragmentShader.replace(
            '#include <shadowmap_fragment>',
            `${captureColorCode}
          #include <shadowmap_fragment>
          ${applyShadowOpacityCode}`
          )
          
          // Update the shader with our modifications
          shader.fragmentShader = fragmentShader
        } catch (error) {
          console.error('[ShadowOpacityModifier] Error injecting shader code:', error, {
            materialType: material.type,
            materialName: material.name,
            hasFragmentShader: !!shader.fragmentShader
          })
          // Don't break the shader - just skip shadow opacity injection
          return
        }
      } else {
        // This shouldn't happen since we checked above, but handle it gracefully
        console.warn('[ShadowOpacityModifier] shadowmap_fragment include not found after validation check')
        return
      }
    }

    // Mark material as modified
    this.materialsWithShadowOpacity.add(material)
    material.needsUpdate = true
  }

  /**
   * Update shadow opacity configuration for an already modified material
   */
  updateMaterialUniforms(material: THREE.Material, config: ShadowOpacityConfig): void {
    if (!this.materialsWithShadowOpacity.has(material)) {
      this.applyToMaterial(material, config)
      return
    }

    // Update stored config
    if (!material.userData.shadowOpacityConfig) {
      material.userData.shadowOpacityConfig = {}
    }
    material.userData.shadowOpacityConfig.opacity = config.opacity
    material.userData.shadowOpacityConfig.color = config.color.clone()

    // Update uniforms directly if they exist (much more efficient than recompiling)
    // Check material.userData first (persists across modifier instances), then WeakMap as fallback
    const uniforms = material.userData.shadowOpacityUniforms || this.materialUniforms.get(material)
    if (uniforms && uniforms.shadowOpacity && uniforms.shadowColor) {
      uniforms.shadowOpacity.value = config.opacity
      uniforms.shadowColor.value.copy(config.color)
    } else {
      // Uniforms don't exist yet (material not compiled), force recompilation
      // This happens when the material hasn't been rendered yet
      material.needsUpdate = true
    }
  }

  /**
   * Remove shadow opacity modifications from a material
   */
  removeFromMaterial(material: THREE.Material): void {
    // CRITICAL: Skip ShaderMaterials - they should never have shadow opacity applied
    if (material instanceof THREE.ShaderMaterial) {
      return
    }
    
    if (!this.materialsWithShadowOpacity.has(material)) {
      return
    }

    // Restore original onBeforeCompile
    // CRITICAL: Check userData first to support proper chaining with other modifiers
    const userData = material.userData as any
    const originalCompile = userData.originalOnBeforeCompile || this.originalOnBeforeCompile.get(material)
    
    if (originalCompile) {
      material.onBeforeCompile = originalCompile as ((parameters: any, renderer: THREE.WebGLRenderer) => void)
      
      // Only clear userData.originalOnBeforeCompile if we're the first modifier
      // (check if material.onBeforeCompile is still our function)
      // Actually, we can't easily check this, so we'll leave it for other modifiers to handle
    } else {
      // If no original, remove the onBeforeCompile entirely
      delete (material as any).onBeforeCompile
      // Also clear userData if it was ours
      if (userData.originalOnBeforeCompile && !this.originalOnBeforeCompile.has(material)) {
        delete userData.originalOnBeforeCompile
      }
    }

    // Clean up userData
    delete material.userData.shadowOpacityConfig
    delete material.userData.shadowOpacityUniforms

    // Remove uniform references
    this.materialUniforms.delete(material)

    // Remove from tracking
    this.materialsWithShadowOpacity.delete(material)
    material.needsUpdate = true
  }

  /**
   * Apply shadow opacity to all materials in an object hierarchy
   */
  applyToObject(object: THREE.Object3D, config: ShadowOpacityConfig): void {
    object.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => {
          this.applyToMaterial(mat, config)
        })
      }
    })
  }

  /**
   * Remove shadow opacity from all materials in an object hierarchy
   */
  removeFromObject(object: THREE.Object3D): void {
    object.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat) => {
          this.removeFromMaterial(mat)
        })
      }
    })
  }
}
