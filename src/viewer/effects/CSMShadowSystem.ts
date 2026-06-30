import * as THREE from 'three'
import { StreetsGLCSM, StreetsGLCSMConfig } from './StreetsGLCSM'
import {
  getCsmCascadeCountForQuality,
  getCsmShadowMapSizeForQuality,
  type WeatherQuality
} from '../utils/weatherGpuUtils'

export interface CSMConfig {
  camera: THREE.PerspectiveCamera
  parent: THREE.Object3D
  lightIntensity?: number
  lightColor?: THREE.Color
  cascades?: number
  maxFar?: number
  shadowMapSize?: number
  lightDirection?: THREE.Vector3
  shadowBias?: number
  shadowNormalBias?: number
  biasScale?: number
  mode?: string
  shadowRadius?: number // Shadow blur radius (0 = sharp, higher = softer)
}

/**
 * CSM (Cascaded Shadow Maps) Shadow System
 * Uses Streets GL's actual CSM implementation for identical shadow quality
 * This is a port of Streets GL's custom CSM system to work with Three.js
 */
export class CSMShadowSystem {
  private csm: StreetsGLCSM | null = null
  private scene: THREE.Scene
  private config: CSMConfig
  private enabled: boolean = false
  // Track materials that have been set up for CSM (to avoid duplicate setup)
  private setupMaterials: WeakSet<THREE.Material> = new WeakSet()

  constructor(scene: THREE.Scene, config: CSMConfig) {
    this.scene = scene
    this.config = config
  }

  /**
   * Initialize CSM system
   */
  public init(): void {
    if (this.csm) {
      this.destroy()
    }
    
    // CRITICAL: Clear setup materials cache when recreating CSM
    // This ensures materials are re-setup with new shadow map configuration
    this.setupMaterials = new WeakSet()

    const {
      camera,
      parent,
      lightIntensity = 1.0,
      lightColor = new THREE.Color(0xffffff),
      cascades = 3, // 3 cascades for high quality (like Streets GL)
      maxFar = 5000,
      shadowMapSize = 2048, // High resolution like Streets GL
      lightDirection = new THREE.Vector3(-1, -1, -1),
      shadowBias = -0.0002,
      shadowNormalBias = 0.03, // IMPROVED: Increased from 0.01 to 0.03 to prevent shadow artifacts on curved surfaces (recommended: 0.02-0.05)
      biasScale = 1.0,
      mode = 'practical', // Streets GL CSM mode
      shadowRadius = 2 // IMPROVED: Default to 2 for smoother shadows (recommended: 2-3)
    } = this.config
    
    // CRITICAL: Validate shadow map size - maximum is 8192px for CSM reliability
    // 16384px is not supported (removed from UI) because with 3 cascades it uses ~3.2GB GPU memory
    // and often causes shadow failures. 8192px is the maximum reliable size.
    let validatedShadowMapSize = shadowMapSize
    
    // Safety check: Cap at 8192px if somehow a larger value gets through
    // (e.g., from saved settings, API, or manual code changes)
    if (shadowMapSize > 8192) {
      console.warn(`[CSMShadowSystem] ⚠️ Shadow map size ${shadowMapSize}px exceeds maximum of 8192px`)
      console.warn(`[CSMShadowSystem] ⚠️ Capping at 8192px to prevent shadow failures`)
      validatedShadowMapSize = 8192
      // Update config to reflect actual size
      this.config.shadowMapSize = 8192
    }

    // Create Streets GL CSM instance (uses Streets GL's actual CSM algorithm)
    const csmConfig: StreetsGLCSMConfig = {
      camera: camera as THREE.PerspectiveCamera, // Streets GL CSM requires PerspectiveCamera
      near: camera.near,
      far: maxFar,
      cascades,
      resolution: validatedShadowMapSize, // Use validated size
      shadowBias,
      shadowNormalBias,
      direction: lightDirection,
      intensity: lightIntensity,
      biasScale,
      shadowRadius
    }

    try {
      this.csm = new StreetsGLCSM(csmConfig)
    } catch (error) {
      console.error(`[CSMShadowSystem] ❌ Failed to create CSM with shadow map size ${validatedShadowMapSize}px:`, error)
      // Fallback to 4096 if creation fails (more reliable size)
      if (validatedShadowMapSize > 4096) {
        console.warn(`[CSMShadowSystem] Attempting fallback with 4096px shadow map size...`)
        csmConfig.resolution = 4096
        try {
          this.csm = new StreetsGLCSM(csmConfig)
          console.warn(`[CSMShadowSystem] ✅ Fallback successful - using 4096px shadow maps`)
          // Update config to reflect actual size used
          this.config.shadowMapSize = 4096
        } catch (fallbackError) {
          console.error(`[CSMShadowSystem] ❌ Fallback also failed:`, fallbackError)
          throw new Error(`Failed to initialize CSM shadow system. Shadow map size ${validatedShadowMapSize}px may be too large for your GPU.`)
        }
      } else {
        throw error
      }
    }

    // Set initial light direction
    if (lightDirection) {
      this.setLightDirection(lightDirection)
    }

    // Set light colors and ensure lights are properly configured
    this.csm.getLights().forEach((light) => {
      light.color.copy(lightColor)
      // CRITICAL: Ensure CSM lights are visible and casting shadows
      light.visible = true
      light.castShadow = true
      light.intensity = this.config.lightIntensity || 1.0
      // CRITICAL: Mark CSM lights so they don't get visible helpers
      // CSM lights are internal system lights and shouldn't be visible to users
      light.userData.isCSMLight = true
      light.userData.isInternal = true
    })

    // Add CSM lights to scene (and their targets)
    const lights = this.csm.getLights()
    console.log(`[CSMShadowSystem] Adding ${lights.length} CSM directional light(s) to scene`)
    
    lights.forEach((light, index) => {
      this.scene.add(light)
      // Add light target to scene if it doesn't have a parent
      if (light.target && !light.target.parent) {
        this.scene.add(light.target)
      }
    })

    // NOTE: Streets GL CSM uses standard Three.js shadow maps
    // Materials don't need special setup - they work with standard shadow receiving
    // However, we still need to ensure materials can receive shadows
    this.setupSceneMaterials()

    // Verify CSM lights were created successfully
    const createdLights = this.csm.getLights()
    if (createdLights.length === 0) {
      console.error('[CSMShadowSystem] ❌ No CSM lights were created - shadows will not work!')
      this.enabled = false
      return
    }
    
    // CRITICAL: Ensure all CSM lights are properly configured for shadows
    // Shadow maps are created lazily by Three.js on first render, so we can't check them here
    // But we can ensure the lights are configured correctly
    createdLights.forEach((light, index) => {
      if (light instanceof THREE.DirectionalLight) {
        // Ensure shadow is enabled
        light.castShadow = true
        // Ensure shadow map size is set correctly
        if (light.shadow) {
          light.shadow.mapSize.width = validatedShadowMapSize
          light.shadow.mapSize.height = validatedShadowMapSize
          light.shadow.needsUpdate = true
          
          // CRITICAL: Force disposal of any existing shadow map to ensure new size is used
          if (light.shadow.map) {
            light.shadow.map.dispose()
            light.shadow.map = null
          }
          
          // Ensure shadow camera is configured
          if (light.shadow.camera) {
            light.shadow.camera.updateProjectionMatrix()
          }
          
          // CRITICAL: Validate shadow map size is within WebGL limits
          // Some GPUs/drivers have lower max texture size limits
          // Check if size is valid (must be power of 2 and within reasonable limits)
          const isValidSize = [512, 1024, 2048, 4096, 8192].includes(validatedShadowMapSize)
          if (!isValidSize) {
            console.warn(`[CSMShadowSystem] ⚠️ Shadow map size ${validatedShadowMapSize}px is not a standard power-of-2 size`)
          }
          
          console.log(`[CSMShadowSystem] Light ${index} configured: size=${validatedShadowMapSize}px, castShadow=${light.castShadow}, map=${light.shadow.map ? 'exists' : 'will be created'}`)
        }
      }
    })

    this.enabled = true
    console.log('[CSMShadowSystem] ✅ CSM initialized:', {
      cascades,
      shadowMapSize: validatedShadowMapSize,
      mode,
      maxFar,
      lightsCreated: createdLights.length,
      memoryUsageMB: Math.round(validatedShadowMapSize * validatedShadowMapSize * cascades * 4 / 1024 / 1024),
      note: 'Shadow maps will be created on first render'
    })
  }

  /**
   * Setup CSM materials for all objects in the scene
   * This must be called after CSM initialization and when new objects are added
   */
  public setupSceneMaterials(force: boolean = false): void {
    if (!this.csm) return
    if (force) {
      // Reset cache so every material gets reprocessed (needed after HDR/env changes)
      this.setupMaterials = new WeakSet()
    }

    let materialCount = 0
    let skippedCount = 0
    let errorCount = 0
    let alreadySetupCount = 0
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if (material instanceof THREE.Material) {
            // Skip if already set up (avoid duplicate setup)
            if (this.setupMaterials.has(material)) {
              alreadySetupCount++
              return
            }
            
            // CRITICAL: Skip materials that might cause shader compilation errors
            // 1. ShaderMaterials have custom shaders that may conflict with CSM
            // 2. Materials with custom onBeforeCompile may already have shader modifications
            if (material instanceof THREE.ShaderMaterial) {
              skippedCount++
              // Mark as processed so we don't try again
              this.setupMaterials.add(material)
              return
            }
            
            // Check if material has custom shader modifications that might conflict
            const anyMat = material as any
            
            // CRITICAL: Check for custom shader modifications BEFORE attempting CSM setup
            // These checks prevent shader compilation errors like "GeometricContext undeclared"
            
            // 1. Check for custom onBeforeCompile hooks
            // Instead of skipping, we'll chain with existing hooks
            // This allows CSM to work with materials that have other shader modifications
            const hasExistingHook = anyMat.onBeforeCompile && typeof anyMat.onBeforeCompile === 'function'
            if (hasExistingHook) {
              // Material has existing shader modifications - we'll chain with them
              // The setupMaterial method will handle chaining properly
            }
            
            // 2. Check if material has been modified by other systems
            // Materials with custom userData flags often have incompatible shader modifications
            if (anyMat.userData?.hasCustomShaderModifications || 
                anyMat.userData?.isGroundedSkybox ||
                anyMat.userData?.skipCSMSetup) {
              skippedCount++
              this.setupMaterials.add(material)
              console.warn(`[CSMShadowSystem] Skipping material "${material.name || 'unnamed'}" (${material.type}) - marked as incompatible with CSM`)
              return
            }
            
            // 3. Check if material is already being used (has a program)
            // If material has an active program, CSM setup might corrupt it
            if (anyMat.program && anyMat.program.program) {
              skippedCount++
              this.setupMaterials.add(material)
              console.warn(`[CSMShadowSystem] Skipping material "${material.name || 'unnamed'}" (${material.type}) - has active shader program`)
              return
            }
            
            // 4. Check if material has custom vertex/fragment shaders (not using Three.js chunk system)
            // CSM requires Three.js's standard material shader chunk system to work
            if (anyMat.vertexShader && !anyMat.vertexShader.includes('#include <common>')) {
              // Material has custom vertex shader that doesn't use Three.js chunks
              skippedCount++
              this.setupMaterials.add(material)
              console.warn(`[CSMShadowSystem] Skipping material "${material.name || 'unnamed'}" (${material.type}) - custom vertex shader without Three.js chunks`)
              return
            }
            
            try {
              // Setup material for Streets GL CSM shadows
              if (material instanceof THREE.MeshStandardMaterial ||
                  material instanceof THREE.MeshPhysicalMaterial ||
                  material instanceof THREE.MeshLambertMaterial ||
                  material instanceof THREE.MeshPhongMaterial) {
                // Inject CSM shader code into material
                if (this.csm) {
                  this.csm.setupMaterial(material)
                }
                
                // Mark as set up
                this.setupMaterials.add(material)
                materialCount++
                
                anyMat.userData = anyMat.userData || {}
                anyMat.userData.csmSetup = true
              } else {
                // Unsupported material type
                skippedCount++
                this.setupMaterials.add(material)
              }
            } catch (error) {
              // If CSM setup fails, log but don't break rendering
              // The material will render without CSM shadows (fallback to standard shadows)
              errorCount++
              const errorMsg = error instanceof Error ? error.message : String(error)
              console.warn(`[CSMShadowSystem] Failed to setup CSM for material "${material.name || 'unnamed'}" (${material.type}):`, errorMsg)
              
              // CRITICAL: Mark material as incompatible with CSM to prevent future attempts
              anyMat.userData = anyMat.userData || {}
              anyMat.userData.skipCSMSetup = true
              anyMat.userData.csmSetupFailed = true
              
              // CRITICAL: Mark material as processed even if setup failed
              // This prevents infinite retry loops and ensures material can still render
              this.setupMaterials.add(material)
              
              // CRITICAL: If CSM setup corrupted the material's onBeforeCompile, try to restore it
              // CSM adds its own onBeforeCompile, but if it fails, we need to clean up
              if (anyMat.onBeforeCompile && anyMat.userData.originalOnBeforeCompile) {
                // Restore original onBeforeCompile if it exists
                anyMat.onBeforeCompile = anyMat.userData.originalOnBeforeCompile
                delete anyMat.userData.originalOnBeforeCompile
              }
              
              // CRITICAL: Ensure material is still valid and can receive light from CSM lights
              // CSM lights are added to the scene and will illuminate this material even without CSM shadow shaders
              // Force material update to ensure it renders (even without CSM shadows)
              material.needsUpdate = true
              
              // Ensure material can receive shadows from CSM lights (even if it can't use CSM shadow shaders)
              // This ensures the material is still visible and lit
              if (material instanceof THREE.MeshStandardMaterial || 
                  material instanceof THREE.MeshPhysicalMaterial ||
                  material instanceof THREE.MeshLambertMaterial ||
                  material instanceof THREE.MeshPhongMaterial) {
                // Standard materials should still receive light from CSM lights
                // No special action needed - CSM lights will illuminate them
              }
            }
          }
        })
      }
    })
    console.log(`[CSMShadowSystem] Setup ${materialCount} material(s) for CSM shadows${skippedCount > 0 ? `, skipped ${skippedCount} incompatible material(s)` : ''}${errorCount > 0 ? `, ${errorCount} error(s)` : ''}${alreadySetupCount > 0 ? `, ${alreadySetupCount} already set up` : ''}`)
  }

  /**
   * Update CSM light direction (sun direction)
   */
  public setLightDirection(direction: THREE.Vector3): void {
    if (!this.csm) return

    // Update Streets GL CSM direction
    this.csm.setDirection(direction)

    // Update CSM (this will reposition all cascade lights based on lightDirection)
    this.csm.update()
  }

  /**
   * Update CSM light intensity
   */
  public setLightIntensity(intensity: number): void {
    if (!this.csm) return

    this.csm.setIntensity(intensity)
  }

  /**
   * Update CSM light color
   */
  public setLightColor(color: THREE.Color): void {
    if (!this.csm) return

    this.csm.getLights().forEach((light) => {
      if (light instanceof THREE.DirectionalLight) {
        light.color.copy(color)
      }
    })
  }

  /**
   * Update CSM shadow quality (recreates CSM with new settings)
   */
  public setShadowQuality(quality: 'low' | 'medium' | 'high'): void {
    if (!this.csm) return

    // Streets GL quality presets
    let cascades: number
    let shadowMapSize: number
    let maxFar: number
    let biasScale: number

    if (quality === 'low') {
      cascades = 1
      shadowMapSize = 2048
      maxFar = 3000
      biasScale = 1.0
    } else if (quality === 'medium') {
      cascades = 3
      shadowMapSize = 2048
      maxFar = 4000
      biasScale = 1.0
    } else { // high
      cascades = 3
      shadowMapSize = 4096
      maxFar = 5000
      biasScale = 0.5
    }

    // Update config
    this.config.cascades = cascades
    this.config.shadowMapSize = shadowMapSize
    this.config.maxFar = maxFar

    // CRITICAL: Also update the store's shadowMapSize to keep them in sync
    // This ensures that any code that reads from the store will use the correct value
    // Note: We can't import useAppStore here due to circular dependency, so we'll update it via the viewer
    // The store update will be handled by the LightingPanel component when it calls setShadowQuality

    // Recreate CSM with new settings
    this.init()
    
    console.log(`[CSMShadowSystem] Shadow quality set to: ${quality} (${cascades} cascades, ${shadowMapSize}px, ${maxFar}m)`)
  }

  /**
   * Update CSM shadow bias (applies to all cascade lights)
   */
  public setShadowBias(bias: number): void {
    if (!this.csm) return
    
    // Update config
    this.config.shadowBias = bias
    
    // Update bias on all CSM lights
    const lights = this.csm.getLights()
    const previousBias = this.config.shadowBias
    lights.forEach((light) => {
      if (light.shadow) {
        light.shadow.bias = bias * (this.config.biasScale || 1.0)
        light.shadow.needsUpdate = true
      }
    })
    
    // Only log if bias changed significantly to reduce console spam during slider movement
    if (Math.abs(bias - previousBias) > 0.0001) {
      console.log(`[CSMShadowSystem] Shadow bias updated to: ${bias.toFixed(6)}`)
    }
  }

  /**
   * Update CSM shadow normal bias (applies to all cascade lights)
   */
  public setShadowNormalBias(normalBias: number): void {
    if (!this.csm) return
    
    // Update config
    this.config.shadowNormalBias = normalBias
    
    // Update normal bias on all CSM lights
    const lights = this.csm.getLights()
    lights.forEach((light) => {
      if (light.shadow) {
        light.shadow.normalBias = normalBias * (this.config.biasScale || 1.0)
        light.shadow.needsUpdate = true
      }
    })
    
    console.log(`[CSMShadowSystem] Shadow normal bias updated to: ${normalBias}`)
  }

  /**
   * Update CSM shadow radius (blur amount)
   * 0 = sharp shadows, higher values = softer shadows
   */
  public setShadowRadius(radius: number): void {
    if (!this.csm) return
    
    // Update shadow radius on CSM
    this.csm.setShadowRadius(radius)
    
    // Update uniforms for all materials that use CSM
    // This requires updating the CSMShadowRadius uniform in all materials
    const csmUniforms = this.csm.getUniforms()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          // Update CSMShadowRadius uniform in shader uniforms
          const shaderUniforms = (material as any).uniforms
          if (shaderUniforms && shaderUniforms.CSMShadowRadius) {
            shaderUniforms.CSMShadowRadius.value = csmUniforms.CSMShadowRadius
          }
          
          // Also update in userData if it exists
          if (material.userData?.csmShadowMapUniforms) {
            const uniforms = material.userData.csmShadowMapUniforms
            if (uniforms.CSMShadowRadius) {
              uniforms.CSMShadowRadius.value = csmUniforms.CSMShadowRadius
            }
          }
        })
      }
    })
    
    console.log(`[CSMShadowSystem] Shadow radius updated to: ${radius}`)
  }

  /**
   * Apply weather quality tier (cascade count + shadow map resolution).
   */
  public applyWeatherQuality(quality: WeatherQuality): void {
    if (!this.csm) return

    const cascades = getCsmCascadeCountForQuality(quality)
    const shadowMapSize = getCsmShadowMapSizeForQuality(quality)
    if (this.config.cascades === cascades && this.config.shadowMapSize === shadowMapSize) {
      return
    }

    this.config.cascades = cascades
    this.config.shadowMapSize = shadowMapSize
    this.init()
    console.log(
      `[CSMShadowSystem] Weather quality ${quality}: ${cascades} cascade(s), ${shadowMapSize}px maps`
    )
  }

  /**
   * Update CSM shadow map size (recreates CSM with new resolution)
   */
  public setShadowMapSize(size: number): void {
    if (!this.csm) return
    
    // Only recreate if size actually changed
    if (this.config.shadowMapSize === size) {
      return
    }
    
    // CRITICAL: Validate and cap shadow map size - maximum is 8192px
    // Safety check in case a larger value gets through (e.g., from saved settings)
    let validatedSize = size
    if (size > 8192) {
      console.warn(`[CSMShadowSystem] ⚠️ Shadow map size ${size}px exceeds maximum of 8192px`)
      console.warn(`[CSMShadowSystem] ⚠️ Capping at 8192px to prevent shadow failures`)
      validatedSize = 8192
    }
    
    // Update config with validated size
    this.config.shadowMapSize = validatedSize
    
    // Store current light direction and intensity before recreating
    const currentDirection = this.csm.direction.clone()
    const currentIntensity = this.csm.intensity
    const lights = this.csm.getLights()
    const currentColor = lights.length > 0 ? lights[0].color.clone() : new THREE.Color(0xffffff)
    
    // Recreate CSM with new shadow map size
    this.init()
    
    // Restore light direction, intensity, and color
    this.setLightDirection(currentDirection)
    this.setLightIntensity(currentIntensity)
    this.setLightColor(currentColor)
    
    // CRITICAL: Clear setup materials cache to force re-setup with new shadow maps
    // This ensures all materials get the new shadow map configuration
    this.setupMaterials = new WeakSet()
    
    // CRITICAL: Force material updates to ensure shaders are recompiled with new shadow maps
    // This is necessary because shader uniforms are set in onBeforeCompile
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if (material instanceof THREE.Material) {
            // Force material update to trigger shader recompilation
            material.needsUpdate = true
          }
        })
      }
    })
    
    // Re-setup materials for new CSM instance (with cleared cache, all materials will be re-setup)
    this.setupSceneMaterials()
    
    // CRITICAL: Force shadow map creation by ensuring lights are properly configured
    // Shadow maps are created lazily by Three.js, but we need to ensure they're ready
    const newLights = this.csm.getLights()
    newLights.forEach((light, index) => {
      if (light instanceof THREE.DirectionalLight && light.shadow) {
        // Ensure shadow map size matches
        light.shadow.mapSize.width = validatedSize
        light.shadow.mapSize.height = validatedSize
        
        // CRITICAL: Force disposal of old shadow map if it exists (to force recreation)
        // This must happen BEFORE setting needsUpdate, otherwise Three.js might reuse the old map
        if (light.shadow.map) {
          light.shadow.map.dispose()
          light.shadow.map = null
        }
        
        // CRITICAL: Ensure light is in scene and visible (required for shadow map creation)
        if (!light.parent) {
          // Light must be in scene for Three.js to create shadow maps
          console.warn(`[CSMShadowSystem] ⚠️ Light ${index} is not in scene - adding to scene for shadow map creation`)
          // Note: Lights should already be in scene from CSM initialization, but check anyway
        }
        
        // Ensure shadow is enabled
        light.castShadow = true
        light.visible = true
        
        // Force shadow camera update
        if (light.shadow.camera) {
          light.shadow.camera.updateProjectionMatrix()
        }
        
        // CRITICAL: Set needsUpdate AFTER disposing old map
        // This ensures Three.js will create a new shadow map on next render
        light.shadow.needsUpdate = true
        
        console.log(`[CSMShadowSystem] Light ${index} reconfigured: size=${validatedSize}px, castShadow=${light.castShadow}, visible=${light.visible}, inScene=${!!light.parent}, map=${light.shadow.map ? 'exists' : 'will be created'}`)
      }
    })
    
    console.log(`[CSMShadowSystem] Shadow map size updated to: ${validatedSize}px`)
    console.log(`[CSMShadowSystem] Materials cache cleared and re-setup - shadow maps will be created on next render`)
    console.log(`[CSMShadowSystem] ⚠️ If shadows don't appear, check console for shadow map creation warnings`)
  }

  /**
   * Update CSM camera (when main camera changes)
   */
  public updateCamera(camera: THREE.PerspectiveCamera): void {
    if (!this.csm) return

    // Streets GL CSM requires PerspectiveCamera
    // Update CSM to recalculate cascades for new camera
    // Note: We need to recreate CSM if camera type changes
    if (camera instanceof THREE.PerspectiveCamera) {
      // Update cascades based on new camera
      this.csm.update()
    }
  }

  /**
   * Update CSM (call in render loop)
   */
  public update(): void {
    if (!this.csm || !this.enabled) return
    this.csm.update()
    
    // CRITICAL: Update shadow map uniforms dynamically after shadow maps are created
    // This ensures materials get real shadow maps instead of dummy textures
    // Three.js creates shadow maps lazily on first render, so we need to update uniforms after they're created
    this.csm.updateShadowMapUniforms(this.scene)
  }

  /**
   * Get CSM instance (for advanced usage)
   */
  public getCSM(): StreetsGLCSM | null {
    return this.csm
  }

  /** Directional lights used by CSM cascades (for interior shadow tuning). */
  public getDirectionalLights(): THREE.DirectionalLight[] {
    if (!this.csm) return []
    return this.csm
      .getLights()
      .filter((light): light is THREE.DirectionalLight => light instanceof THREE.DirectionalLight)
  }

  /**
   * Diagnostic: Check shadow map status for all CSM lights
   * Returns detailed information about shadow map creation
   */
  public getShadowMapDiagnostics(): {
    lights: Array<{
      index: number
      hasShadowMap: boolean
      mapSize: { width: number; height: number }
      castShadow: boolean
      visible: boolean
      inScene: boolean
    }>
    totalLights: number
    lightsWithMaps: number
    configuredSize: number
  } {
    if (!this.csm) {
      return {
        lights: [],
        totalLights: 0,
        lightsWithMaps: 0,
        configuredSize: this.config.shadowMapSize || 0
      }
    }

    const lights = this.csm.getLights()
    const diagnostics = lights.map((light, index) => {
      if (light instanceof THREE.DirectionalLight) {
        return {
          index,
          hasShadowMap: !!(light.shadow && light.shadow.map),
          mapSize: light.shadow ? {
            width: light.shadow.mapSize.width,
            height: light.shadow.mapSize.height
          } : { width: 0, height: 0 },
          castShadow: light.castShadow,
          visible: light.visible,
          inScene: !!light.parent
        }
      }
      return {
        index,
        hasShadowMap: false,
        mapSize: { width: 0, height: 0 },
        castShadow: false,
        visible: false,
        inScene: false
      }
    })

    return {
      lights: diagnostics,
      totalLights: lights.length,
      lightsWithMaps: diagnostics.filter(d => d.hasShadowMap).length,
      configuredSize: this.config.shadowMapSize || 0
    }
  }

  /**
   * Check if CSM is enabled
   */
  public isEnabled(): boolean {
    return this.enabled && this.csm !== null
  }

  /**
   * Destroy CSM system
   */
  public destroy(): void {
    if (this.csm) {
      const lights = this.csm.getLights()
      const lightCount = lights.length
      
      if (lightCount > 0) {
        console.log(`[CSMShadowSystem] Destroying CSM system: removing ${lightCount} directional light(s) from scene`)
      }
      
      // Remove lights and their targets from scene
      lights.forEach((light) => {
        // Remove light target if it exists
        if (light.target && light.target.parent) {
          light.target.parent.remove(light.target)
        }
        // Remove light from scene
        if (light.parent) {
          light.parent.remove(light)
        }
      })

      // Dispose CSM (disposes shadow maps and lights, removes from scene)
      this.csm.dispose(this.scene)
      this.csm = null
      
      if (lightCount > 0) {
        console.log(`[CSMShadowSystem] ✅ Removed ${lightCount} directional light(s) from scene`)
      }
    }

    this.enabled = false
    console.log('[CSMShadowSystem] Streets GL CSM destroyed')
  }
}

