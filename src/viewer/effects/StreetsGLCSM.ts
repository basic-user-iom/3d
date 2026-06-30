import * as THREE from 'three'

/**
 * Streets GL CSM (Cascaded Shadow Maps) Implementation
 * 
 * This is a port of Streets GL's custom CSM system to work with Three.js.
 * Streets GL uses a custom CSM implementation with:
 * - Practical split algorithm (lambda = 0.5)
 * - Custom cascade cameras
 * - Custom shadow shader uniforms
 * - Fade offsets for smooth cascade transitions
 * 
 * Based on: streets-gl-alt/src/app/render/CSM.ts
 */

// IMPROVED: Optimized offset to balance coverage and shadow quality
// Reduced from 10000 to 5000 to improve effective resolution while still covering large models
const ShadowCameraTopOffset = 5000
const FadeOffsetFactor = 250

/** Streets GL CSM shader bias (scaled by cascade ortho size in getUniforms). */
export const CSM_SHADER_BIAS = -0.003
export const CSM_SHADER_NORMAL_BIAS = 0.002

/** Three.js shadow-map pass bias (unscaled; applied during depth render). */
export const CSM_LIGHT_SHADOW_BIAS = -0.0002
export const CSM_LIGHT_SHADOW_NORMAL_BIAS = 0.02

/** Cascade lights only render shadow depth maps; the user sun light provides direct illumination. */
export const CSM_CASCADE_LIGHT_RENDER_INTENSITY = 0

export interface StreetsGLCSMConfig {
  camera: THREE.PerspectiveCamera
  near: number
  far: number
  cascades: number
  resolution: number
  shadowBias: number
  shadowNormalBias: number
  direction?: THREE.Vector3
  intensity?: number
  biasScale?: number
  shadowRadius?: number // Shadow blur radius (0 = sharp, higher = softer)
}

export class StreetsGLCSM {
  private camera: THREE.PerspectiveCamera
  public near: number
  public far: number
  public cascades: number
  public resolution: number
  private shadowBias: number
  private shadowNormalBias: number
  public biasScale: number = 1
  public direction: THREE.Vector3
  public intensity: number = 0
  public shadowRadius: number = 0 // Shadow blur radius (0 = sharp, higher = softer)
  public cascadeCameras: THREE.OrthographicCamera[] = []
  private breaks: number[][] = []
  private fadeOffsets: number[] = []
  private shadowMaps: THREE.WebGLRenderTarget[] = []
  private lights: THREE.DirectionalLight[] = []
  /** Mutable uniform buffers — materials hold references; refreshed each update(). */
  private uniformBuffers: {
    CSMLightDirectionAndIntensity: THREE.Vector4
    CSMSplits: Float32Array
    CSMResolution: Float32Array
    CSMSize: Float32Array
    CSMBias: Float32Array
    CSMMatrixWorldInverse: Float32Array
    CSMFadeOffset: Float32Array
  } | null = null

  constructor(config: StreetsGLCSMConfig) {
    this.camera = config.camera
    this.near = config.near
    this.far = config.far
    this.cascades = config.cascades
    this.resolution = config.resolution
    this.shadowBias = config.shadowBias
    this.shadowNormalBias = config.shadowNormalBias
    this.direction = config.direction || new THREE.Vector3(-1, -1, -1).normalize()
    this.intensity = config.intensity || 1.0
    this.biasScale = config.biasScale || 1.0
    this.shadowRadius = config.shadowRadius ?? 0 // Default to sharp shadows

    this.updateCascades()
  }

  /**
   * Update cascade configuration
   */
  public updateCascades(): void {
    this.createCameras()
    this.updateBreaks()
    this.createShadowMaps()
    this.createLights()
    this.initUniformBuffers()
  }

  private initUniformBuffers(): void {
    const n = this.cascades
    this.uniformBuffers = {
      CSMLightDirectionAndIntensity: new THREE.Vector4(),
      CSMSplits: new Float32Array(n * 4),
      CSMResolution: new Float32Array(n * 4),
      CSMSize: new Float32Array(n * 4),
      CSMBias: new Float32Array(n * 4),
      CSMMatrixWorldInverse: new Float32Array(n * 16),
      CSMFadeOffset: new Float32Array(n * 4)
    }
  }

  private refreshUniformBuffers(): void {
    if (!this.uniformBuffers) {
      this.initUniformBuffers()
    }
    const u = this.uniformBuffers!
    u.CSMLightDirectionAndIntensity.set(
      this.direction.x,
      this.direction.y,
      this.direction.z,
      this.intensity
    )

    for (let i = 0; i < this.cascades; i++) {
      const splitBase = i * 4
      u.CSMSplits[splitBase] = this.breaks[i][0] * (this.far - this.near)
      u.CSMSplits[splitBase + 1] = this.breaks[i][1] * (this.far - this.near)
      u.CSMSplits[splitBase + 2] = 0
      u.CSMSplits[splitBase + 3] = 0

      const resBase = i * 4
      u.CSMResolution[resBase] = this.resolution
      u.CSMResolution[resBase + 1] = 0
      u.CSMResolution[resBase + 2] = 0
      u.CSMResolution[resBase + 3] = 0

      const sizeBase = i * 4
      u.CSMSize[sizeBase] = this.cascadeCameras[i].top
      u.CSMSize[sizeBase + 1] = 0
      u.CSMSize[sizeBase + 2] = 0
      u.CSMSize[sizeBase + 3] = 0

      const bias = this.shadowBias * this.cascadeCameras[i].top * this.biasScale
      const normalBias = this.shadowNormalBias * this.cascadeCameras[i].top * this.biasScale
      const biasBase = i * 4
      u.CSMBias[biasBase] = bias
      u.CSMBias[biasBase + 1] = normalBias
      u.CSMBias[biasBase + 2] = 0
      u.CSMBias[biasBase + 3] = 0

      const matrix = this.cascadeCameras[i].matrixWorldInverse
      const matBase = i * 16
      for (let j = 0; j < 16; j++) {
        u.CSMMatrixWorldInverse[matBase + j] = matrix.elements[j]
      }

      const fadeBase = i * 4
      u.CSMFadeOffset[fadeBase] = this.fadeOffsets[i]
      u.CSMFadeOffset[fadeBase + 1] = 0
      u.CSMFadeOffset[fadeBase + 2] = 0
      u.CSMFadeOffset[fadeBase + 3] = 0
    }
  }

  /**
   * Create cascade cameras (orthographic cameras for each cascade)
   */
  private createCameras(): void {
    this.cascadeCameras = []

    for (let i = 0; i < this.cascades; i++) {
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000)
      this.cascadeCameras.push(camera)
    }
  }

  /**
   * Create shadow map render targets for each cascade
   */
  private createShadowMaps(): void {
    // Dispose old shadow maps
    this.shadowMaps.forEach((rt) => rt.dispose())
    this.shadowMaps = []

    for (let i = 0; i < this.cascades; i++) {
      const shadowMap = new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
        type: THREE.FloatType,
        format: THREE.DepthFormat,
        depthBuffer: true,
        stencilBuffer: false
      })
      this.shadowMaps.push(shadowMap)
    }
  }

  /**
   * Create directional lights for each cascade
   */
  private createLights(parent?: THREE.Object3D): void {
    // Remove old lights from scene before disposing
    const oldLightCount = this.lights.length
    if (oldLightCount > 0) {
      console.log(`[StreetsGLCSM] Cleaning up ${oldLightCount} old directional light(s)`)
    }
    
    this.lights.forEach((light) => {
      // Remove light target if it exists
      if (light.target && light.target.parent) {
        light.target.parent.remove(light.target)
      }
      // Remove light from scene
      if (light.parent) {
        light.parent.remove(light)
      }
      // Dispose shadow map
      if (light.shadow.map) light.shadow.map.dispose()
    })
    this.lights = []

    for (let i = 0; i < this.cascades; i++) {
      const light = new THREE.DirectionalLight(0xffffff, CSM_CASCADE_LIGHT_RENDER_INTENSITY)
      light.castShadow = true
      light.shadow.mapSize.width = this.resolution
      light.shadow.mapSize.height = this.resolution
      light.shadow.camera.near = 0.1
      light.shadow.camera.far = 10000
      // Three.js shadow depth pass — use standard unscaled bias (separate from CSM shader CSMBias)
      light.shadow.bias = CSM_LIGHT_SHADOW_BIAS
      light.shadow.normalBias = CSM_LIGHT_SHADOW_NORMAL_BIAS
      light.shadow.radius = this.shadowRadius // Configurable shadow blur radius
      this.lights.push(light)
    }
    
    console.log(`[StreetsGLCSM] Created ${this.lights.length} directional light(s) for CSM cascades`)
  }

  /**
   * Update cascade breaks (split distances)
   * Uses Streets GL's practical split algorithm (lambda = 0.5)
   */
  private updateBreaks(): void {
    const breaks = this.practicalSplit(this.cascades, this.near, this.far, 0.5)

    this.breaks = []
    this.fadeOffsets = []

    for (let i = 0; i < breaks.length; i++) {
      const prevBreak = i === 0 ? 0 : breaks[i - 1]
      this.fadeOffsets.push(breaks[i] * FadeOffsetFactor)
      this.breaks.push([prevBreak, breaks[i] + this.fadeOffsets[i] / (this.far - this.near)])
    }
  }

  /**
   * Practical split algorithm (Streets GL's default)
   * Combines logarithmic and uniform splits with lambda = 0.5
   */
  private practicalSplit(splits: number, near: number, far: number, lambda: number): number[] {
    const log = this.logarithmicSplit(splits, near, far)
    const uni = this.uniformSplit(splits, near, far)
    const r: number[] = []

    for (let i = 1; i < splits; i++) {
      r.push(lambda * log[i - 1] + (1 - lambda) * uni[i - 1])
    }

    r.push(1)
    return r
  }

  /**
   * Logarithmic split algorithm
   */
  private logarithmicSplit(splits: number, near: number, far: number): number[] {
    const r: number[] = []

    for (let i = 1; i < splits; i++) {
      r.push((near * Math.pow(far / near, i / splits)) / far)
    }

    r.push(1)
    return r
  }

  /**
   * Uniform split algorithm
   */
  private uniformSplit(splits: number, near: number, far: number): number[] {
    const r: number[] = []

    for (let i = 1; i < splits; i++) {
      r.push((near + (far - near) * i / splits) / far)
    }

    r.push(1)
    return r
  }

  /**
   * Update CSM (call every frame)
   * Updates cascade camera positions and orientations based on main camera frustum
   */
  private checkForCameraChanges(): void {
    if (
      this.camera.fov !== (this.camera as THREE.PerspectiveCamera & { _lastCsmFov?: number })._lastCsmFov ||
      this.camera.aspect !== (this.camera as THREE.PerspectiveCamera & { _lastCsmAspect?: number })._lastCsmAspect
    ) {
      ;(this.camera as THREE.PerspectiveCamera & { _lastCsmFov?: number })._lastCsmFov = this.camera.fov
      ;(this.camera as THREE.PerspectiveCamera & { _lastCsmAspect?: number })._lastCsmAspect = this.camera.aspect
      this.near = this.camera.near
      this.updateBreaks()
    }
  }

  public update(): void {
    this.checkForCameraChanges()
    this.fixDirection()

    // Get camera frustum
    const frustum = new THREE.Frustum()
    const matrix = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    frustum.setFromProjectionMatrix(matrix)

    // CRITICAL: Calculate all cascade bounding boxes first to determine common alignment grid
    // This ensures all cascades snap to the same texel grid for proper alignment
    const cascadeBBoxes: Array<{ center: THREE.Vector3, size: THREE.Vector3, bbox: THREE.Box3 }> = []
    const lightMatrix = new THREE.Matrix4().lookAt(
      new THREE.Vector3(),
      this.direction,
      new THREE.Vector3(0, 1, 0)
    )
    const lightMatrixInverse = new THREE.Matrix4().copy(lightMatrix).invert()
    
    // First pass: calculate all cascade bounding boxes
    for (let i = 0; i < this.cascades; i++) {
      const breakStart = this.breaks[i][0] * (this.far - this.near)
      const breakEnd = this.breaks[i][1] * (this.far - this.near)
      const corners = this.getFrustumCorners(breakStart, breakEnd)
      const lightSpaceCorners = corners.map((corner) => {
        return corner.clone().applyMatrix4(lightMatrixInverse)
      })
      const bbox = new THREE.Box3()
      if (lightSpaceCorners.length > 0) {
        bbox.setFromPoints(lightSpaceCorners)
      } else {
        bbox.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(100, 100, 100))
      }
      const center = bbox.getCenter(new THREE.Vector3())
      const size = bbox.getSize(new THREE.Vector3())
      cascadeBBoxes.push({ center, size, bbox })
    }
    
    // Find the largest cascade size for consistent texel grid
    const maxCascadeSize = Math.max(...cascadeBBoxes.map(bb => Math.max(bb.size.x, bb.size.y)))
    const baseTexelSize = maxCascadeSize / this.resolution

    // Update each cascade
    for (let i = 0; i < this.cascades; i++) {
      const cascadeData = cascadeBBoxes[i]
      const bbox = cascadeData.bbox
      let bboxCenter = cascadeData.center.clone()
      const bboxSize = cascadeData.size
      const cascadeCamera = this.cascadeCameras[i]
      
      // Ensure bbox is valid and has valid min/max
      if (!bbox.isEmpty() && bbox.min && bbox.max && 
          (bbox.max.x > bbox.min.x || bbox.max.y > bbox.min.y || bbox.max.z > bbox.min.z)) {
        
        // CRITICAL: Snap to common texel grid for proper cascade alignment
        // All cascades use the same baseTexelSize to ensure they align at boundaries
        // This prevents visible seams between cascades
        bboxCenter.x = Math.floor(bboxCenter.x / baseTexelSize) * baseTexelSize
        bboxCenter.y = Math.floor(bboxCenter.y / baseTexelSize) * baseTexelSize
        
        // CRITICAL: Position shadow camera above all objects in the scene
        // For downward-pointing lights, objects above the ground have higher Z values in light space
        // Use bbox.max.z (farthest from light, i.e., objects above ground) and add offset
        // This ensures the shadow camera captures objects both above and below the shadow plane
        bboxCenter.z = bbox.max.z + ShadowCameraTopOffset

        // Transform back to world space
        bboxCenter = bboxCenter.clone().applyMatrix4(lightMatrix)

        // Set cascade camera position and look at target
        cascadeCamera.position.copy(bboxCenter)
        const target = bboxCenter.clone().add(this.direction)
        cascadeCamera.lookAt(target)

        // Set cascade camera bounds
        // IMPROVED: Optimize bounds to achieve better effective resolution (at least 1.0 pixels/unit)
        // Reduced padding from 50% to 25% to improve shadow quality while still ensuring coverage
        // IMPORTANT: Snap bounds to common texel grid to ensure cascade alignment
        const padding = Math.max(bboxSize.x, bboxSize.y) * 0.25 // IMPROVED: Reduced from 0.5 to 0.25 for better resolution
        let maxSize = Math.max(bboxSize.x, bboxSize.y) + padding
        
        // Snap bounds to common texel grid (ensures cascades align at boundaries)
        // Use baseTexelSize so all cascades use the same grid
        const halfSize = maxSize / 2
        const snappedHalfSize = Math.ceil(halfSize / baseTexelSize) * baseTexelSize
        maxSize = snappedHalfSize * 2
        
        cascadeCamera.left = -snappedHalfSize
        cascadeCamera.right = snappedHalfSize
        cascadeCamera.top = snappedHalfSize
        cascadeCamera.bottom = -snappedHalfSize
        // First cascade uses a tighter near plane for close detail (engine bays, exhaust gaps)
        cascadeCamera.near = i === 0 ? 0.01 : 0.1
        // CRITICAL: Far plane must be large enough to capture objects both above and below the shadow plane
        // Calculate far plane based on bounding box depth plus offset for objects above ground
        // Increased far plane to cover larger models
        const bboxDepth = bboxSize.z
        const farPlane = Math.max(bboxDepth + ShadowCameraTopOffset * 2, 50000) // Increased from 10000 to 50000
        cascadeCamera.far = farPlane
        cascadeCamera.updateProjectionMatrix()
        cascadeCamera.updateMatrixWorld()

        // Update corresponding light
        const light = this.lights[i]
        light.position.copy(bboxCenter)
        light.target.position.copy(target)
        light.target.updateMatrixWorld()
        light.shadow.camera.left = cascadeCamera.left
        light.shadow.camera.right = cascadeCamera.right
        light.shadow.camera.top = cascadeCamera.top
        light.shadow.camera.bottom = cascadeCamera.bottom
        light.shadow.camera.updateProjectionMatrix()
      } else {
        console.warn(`[StreetsGLCSM] Empty bounding box for cascade ${i}, skipping update`)
      }
    }

    this.refreshUniformBuffers()
  }

  /**
   * Get frustum corners for a given depth range
   */
  private getFrustumCorners(near: number, far: number): THREE.Vector3[] {
    const corners: THREE.Vector3[] = []
    const fov = this.camera.fov * (Math.PI / 180)
    const aspect = this.camera.aspect

    const nearHeight = 2 * Math.tan(fov / 2) * near
    const nearWidth = nearHeight * aspect
    const farHeight = 2 * Math.tan(fov / 2) * far
    const farWidth = farHeight * aspect

    // Near plane corners
    corners.push(new THREE.Vector3(-nearWidth / 2, -nearHeight / 2, -near))
    corners.push(new THREE.Vector3(nearWidth / 2, -nearHeight / 2, -near))
    corners.push(new THREE.Vector3(nearWidth / 2, nearHeight / 2, -near))
    corners.push(new THREE.Vector3(-nearWidth / 2, nearHeight / 2, -near))

    // Far plane corners
    corners.push(new THREE.Vector3(-farWidth / 2, -farHeight / 2, -far))
    corners.push(new THREE.Vector3(farWidth / 2, -farHeight / 2, -far))
    corners.push(new THREE.Vector3(farWidth / 2, farHeight / 2, -far))
    corners.push(new THREE.Vector3(-farWidth / 2, farHeight / 2, -far))

    // Transform to world space
    return corners.map((corner) => {
      return corner.applyMatrix4(this.camera.matrixWorld)
    })
  }

  /**
   * Fix direction (normalize and ensure not zero)
   */
  private fixDirection(): void {
    this.direction.normalize()
    if (this.direction.length() === 0) {
      this.direction.set(1, 0, 0)
    }
  }

  /**
   * Get CSM uniforms for shader
   * Returns uniforms matching Streets GL's CSM shader format
   */
  public getUniforms(): {
    CSMLightDirectionAndIntensity: THREE.Vector4
    CSMSplits: Float32Array
    CSMResolution: Float32Array
    CSMSize: Float32Array
    CSMBias: Float32Array
    CSMMatrixWorldInverse: Float32Array
    CSMFadeOffset: Float32Array
    CSMShadowRadius: number
  } {
    this.refreshUniformBuffers()
    const u = this.uniformBuffers!
    return {
      CSMLightDirectionAndIntensity: u.CSMLightDirectionAndIntensity,
      CSMSplits: u.CSMSplits,
      CSMResolution: u.CSMResolution,
      CSMSize: u.CSMSize,
      CSMBias: u.CSMBias,
      CSMMatrixWorldInverse: u.CSMMatrixWorldInverse,
      CSMFadeOffset: u.CSMFadeOffset,
      CSMShadowRadius: this.shadowRadius
    }
  }

  /**
   * Get cascade cameras
   */
  public getCascadeCameras(): THREE.OrthographicCamera[] {
    return this.cascadeCameras
  }

  /**
   * Get shadow maps
   */
  public getShadowMaps(): THREE.WebGLRenderTarget[] {
    return this.shadowMaps
  }

  /**
   * Get lights
   */
  public getLights(): THREE.DirectionalLight[] {
    return this.lights
  }

  /**
   * Setup material to receive CSM shadows
   * Injects Streets GL's CSM shader code into Three.js materials
   */
  public setupMaterial(material: THREE.Material): void {
    if (!(material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhysicalMaterial ||
          material instanceof THREE.MeshLambertMaterial ||
          material instanceof THREE.MeshPhongMaterial)) {
      // Only support standard Three.js materials
      return
    }

    const uniforms = this.getUniforms()
    
    // Store original onBeforeCompile (chain with existing hooks)
    const originalOnBeforeCompile = material.onBeforeCompile
    material.userData = material.userData || {}
    
    // If there's already an original stored (from another system), use that
    // Otherwise, store the current one
    if (!material.userData.originalOnBeforeCompile) {
      material.userData.originalOnBeforeCompile = originalOnBeforeCompile
    }
    
    // Get the actual original (might be from userData if chained)
    const actualOriginal = material.userData.originalOnBeforeCompile || originalOnBeforeCompile

      // Inject CSM shader code (chain with existing hooks)
    material.onBeforeCompile = (shader: any, renderer: THREE.WebGLRenderer) => {
      // Call original onBeforeCompile first (chains with existing shader modifications)
      if (actualOriginal) {
        try {
          actualOriginal.call(material, shader, renderer)
        } catch (error) {
          console.warn(`[StreetsGLCSM] Error in original onBeforeCompile for material "${material.name || 'unnamed'}":`, error)
        }
      }

      // Validate shader structure before modifying
      if (!shader.fragmentShader || typeof shader.fragmentShader !== 'string') {
        console.warn(`[StreetsGLCSM] Invalid fragment shader for material "${material.name || 'unnamed'}", skipping CSM injection`)
        return
      }
      if (!shader.vertexShader || typeof shader.vertexShader !== 'string') {
        console.warn(`[StreetsGLCSM] Invalid vertex shader for material "${material.name || 'unnamed'}", skipping CSM injection`)
        return
      }

      // Ensure uniforms object exists
      if (!shader.uniforms) {
        shader.uniforms = {}
      }

      // Add CSM uniforms
      // Note: Three.js uses individual shadow maps per light, not texture arrays
      // We'll use the shadow maps from the DirectionalLight objects
      shader.uniforms.CSMLightDirectionAndIntensity = { value: uniforms.CSMLightDirectionAndIntensity }
      shader.uniforms.CSMSplits = { value: uniforms.CSMSplits }
      shader.uniforms.CSMResolution = { value: uniforms.CSMResolution }
      shader.uniforms.CSMSize = { value: uniforms.CSMSize }
      shader.uniforms.CSMBias = { value: uniforms.CSMBias }
      shader.uniforms.CSMMatrixWorldInverse = { value: uniforms.CSMMatrixWorldInverse }
      shader.uniforms.CSMFadeOffset = { value: uniforms.CSMFadeOffset }
      shader.uniforms.CSMShadowRadius = { value: uniforms.CSMShadowRadius }
      
      // Store shadow maps from lights as individual uniforms (WebGL 1 compatibility)
      // CRITICAL: Use Three.js shadow maps if available, otherwise use StreetsGLCSM shadow maps
      // CRITICAL: Store uniform references in material.userData so we can update them later
      if (!material.userData.csmShadowMapUniforms) {
        material.userData.csmShadowMapUniforms = {}
      }
      
      this.lights.forEach((light, index) => {
        const uniformName = `CSMShadowMap${index}` as keyof typeof shader.uniforms
        // Prefer Three.js shadow map (created automatically by renderer)
        // Three.js creates shadow maps lazily on first render, so we check for it
        let shadowMapTexture: THREE.Texture | null = null
        
        if (light.shadow && light.shadow.map) {
          // Three.js shadow map exists - use it
          shadowMapTexture = light.shadow.map as unknown as THREE.Texture
        } else {
          // Fallback to StreetsGLCSM shadow map if Three.js hasn't created one yet
          const renderTarget = this.shadowMaps[index]
          if (renderTarget && renderTarget.texture) {
            shadowMapTexture = renderTarget.texture as THREE.Texture
          } else {
            // Create a white dummy texture if no shadow map exists (prevents shader errors)
            // This will result in no shadows, but won't break rendering
            if (!shader.uniforms[uniformName] || !(shader.uniforms[uniformName] as any).value) {
              const dummyTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
              dummyTexture.needsUpdate = true
              shadowMapTexture = dummyTexture
              console.warn(`[StreetsGLCSM] No shadow map available for cascade ${index} (size: ${light.shadow?.mapSize?.width || 'unknown'}), using dummy texture. Shadow maps will be created on next render.`)
            }
          }
        }
        
        if (shadowMapTexture) {
          shader.uniforms[uniformName] = { value: shadowMapTexture }
          // Store reference for later updates
          material.userData.csmShadowMapUniforms[uniformName] = shader.uniforms[uniformName]
        }
      })

      // Add CSM defines
      shader.defines = shader.defines || {}
      shader.defines.CSM_CASCADES = this.cascades.toString()
      shader.defines.USE_CSM = ''

      // Add varying declarations before they're used
      if (!shader.vertexShader.includes('varying vec4 vWorldPosition')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
          #ifdef USE_CSM
            varying vec4 vWorldPosition;
            varying vec3 vWorldNormal;
          #endif`
        )
      }
      
      // Inject CSM vertex shader code (after world position is calculated)
      // We need both world position and world normal for CSM
      // Note: Three.js's worldPosition is already a vec3, we need to convert it to vec4
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_CSM
          vWorldPosition = vec4(worldPosition.xyz, 1.0);
          // Calculate world normal (transform normal from object space to world space)
          // Use a different variable name to avoid conflict with Three.js's transformedNormal
          vec3 csmWorldNormal = normalMatrix * normal;
          vWorldNormal = csmWorldNormal;
        #endif`
      )

      // Inject CSM fragment shader code
      // This replaces the standard shadow calculation with CSM
      const fragmentCSMCode = `
        #ifdef USE_CSM
          uniform vec4 CSMLightDirectionAndIntensity;
          uniform vec2 CSMSplits[CSM_CASCADES];
          uniform float CSMResolution[CSM_CASCADES];
          uniform float CSMSize[CSM_CASCADES];
          uniform vec2 CSMBias[CSM_CASCADES];
          uniform mat4 CSMMatrixWorldInverse[CSM_CASCADES];
          uniform float CSMFadeOffset[CSM_CASCADES];
          uniform float CSMShadowRadius; // Shadow blur radius (0 = sharp, higher = softer)
          // Use individual sampler uniforms instead of array (WebGL 1 compatibility)
          uniform sampler2D CSMShadowMap0;
          uniform sampler2D CSMShadowMap1;
          uniform sampler2D CSMShadowMap2;
          
          varying vec4 vWorldPosition;
          varying vec3 vWorldNormal;
          
          // Get shadow factor for a specific cascade
          // Note: Three.js uses depth textures, so we sample the depth directly
          float getCSMShadowFactor(int cascadeId, vec3 worldPosition, vec3 worldNormal) {
            mat4 shadowMatrix = CSMMatrixWorldInverse[cascadeId];
            float shadowResolution = CSMResolution[cascadeId];
            float shadowSize = CSMSize[cascadeId];
            float shadowBias = CSMBias[cascadeId].x;
            float normalBias = CSMBias[cascadeId].y;
            
            // Apply normal bias
            vec3 biasedPosition = worldPosition + worldNormal * normalBias;
            vec4 shadowPosition = shadowMatrix * vec4(biasedPosition, 1.0);
            
            // Convert to shadow UV (orthographic projection)
            vec2 shadowUV = (shadowPosition.xy / shadowSize + 1.0) * 0.5;
            
            // Check if in frustum
            if (shadowUV.x < 0.0 || shadowUV.x > 1.0 || shadowUV.y < 0.0 || shadowUV.y > 1.0) {
              return 1.0;
            }
            
            // For orthographic cameras, depth is linear
            float fragmentDepth = -shadowPosition.z + shadowBias;
            
            // Sample shadow map depth (use if-else for sampler selection)
            float shadowDepth;
            if (cascadeId == 0) {
              shadowDepth = texture2D(CSMShadowMap0, shadowUV).r;
            } else if (cascadeId == 1) {
              shadowDepth = texture2D(CSMShadowMap1, shadowUV).r;
            } else {
              shadowDepth = texture2D(CSMShadowMap2, shadowUV).r;
            }
            
            // Compare depths (Three.js uses reversed depth for orthographic)
            float shadow = (fragmentDepth > shadowDepth) ? 0.0 : 1.0;
            
            // PCF soft shadows: Use multi-sample filtering for smoother shadow edges
            // Shadow radius is controlled by CSMShadowRadius uniform (0 = sharp, higher = softer)
            float shadowSum = shadow;
            float texelSize = 1.0 / shadowResolution;
            // Use uniform shadow radius (passed from CSM system)
            float radius = CSMShadowRadius;
            
            // Only apply PCF if radius > 0 (sharp shadows when radius = 0)
            if (radius > 0.0) {
              // 3x3 PCF filter for smooth shadow edges
              for (int x = -1; x <= 1; x++) {
                for (int y = -1; y <= 1; y++) {
                  if (x == 0 && y == 0) continue; // Already sampled center
                  vec2 offset = vec2(float(x), float(y)) * texelSize * radius;
                  float depth;
                  if (cascadeId == 0) {
                    depth = texture2D(CSMShadowMap0, shadowUV + offset).r;
                  } else if (cascadeId == 1) {
                    depth = texture2D(CSMShadowMap1, shadowUV + offset).r;
                  } else {
                    depth = texture2D(CSMShadowMap2, shadowUV + offset).r;
                  }
                  shadowSum += (fragmentDepth > depth) ? 0.0 : 1.0;
                }
              }
              return shadowSum / 9.0; // Average of 9 samples
            }
            
            // Sharp shadows (radius = 0): Use single sample
            return shadow;
          }
          
          // Calculate CSM shadow factor
          float getCSMShadow(vec3 worldPosition, vec3 worldNormal, float viewDepth) {
            float shadowFactor = 1.0;
            
            // Find which cascade to use based on view depth
            for (int i = 0; i < CSM_CASCADES; i++) {
              float splitStart = CSMSplits[i].x;
              float splitEnd = CSMSplits[i].y;
              
              if (viewDepth > splitStart && viewDepth <= splitEnd) {
                float shadowValue = 1.0 - getCSMShadowFactor(i, worldPosition, worldNormal);
                float fadeOffset = CSMFadeOffset[i];
                
                // Fade at cascade boundaries
                if (viewDepth > splitEnd - fadeOffset) {
                  float f = (viewDepth - (splitEnd - fadeOffset)) / fadeOffset;
                  shadowValue *= smoothstep(0.0, 1.0, f);
                } else if (i > 0 && viewDepth < CSMSplits[i - 1].y) {
                  float f = 1.0 - (viewDepth - CSMSplits[i - 1].x) / CSMFadeOffset[i - 1];
                  shadowValue *= smoothstep(0.0, 1.0, f);
                }
                
                shadowFactor -= shadowValue;
                break;
              }
            }
            
            return shadowFactor;
          }
        #endif
      `

      // Inject CSM code before output_fragment
      if (shader.fragmentShader.includes('#include <output_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <output_fragment>',
          fragmentCSMCode + '\n#include <output_fragment>'
        )
      } else {
        // Fallback: inject at the end of the shader
        shader.fragmentShader += fragmentCSMCode
      }

      // Replace Three.js's standard shadow calculation with CSM
      // Three.js uses shadowmap_fragment chunk which calculates shadowMask
      // We replace it with CSM shadow calculation
      if (shader.fragmentShader.includes('#include <shadowmap_fragment>')) {
        // Replace shadowmap_fragment with CSM shadow calculation
        const csmShadowReplacement = `
          #ifdef USE_CSM
            // Calculate view-space depth (Three.js uses position as view-space position)
            float viewDepth = -position.z;
            
            // Get world position and normal
            vec3 worldPos = vWorldPosition.xyz;
            vec3 worldNormal = normalize(vWorldNormal);
            
            // Calculate CSM shadow factor
            float csmShadowFactor = getCSMShadow(worldPos, worldNormal, viewDepth);
            
            // Three.js expects shadowMask (1.0 = fully lit, 0.0 = fully shadowed)
            // CSM shadow factor is the same (1.0 = fully lit, 0.0 = fully shadowed)
            shadowMask = csmShadowFactor;
          #else
            // Fallback to standard shadow calculation if CSM is not enabled
            #include <shadowmap_fragment>
          #endif
        `
        
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <shadowmap_fragment>',
          csmShadowReplacement
        )
      } else {
        // If shadowmap_fragment is not present, we need to add CSM shadow calculation
        // Find where to inject it (before output_fragment or at the end)
        if (shader.fragmentShader.includes('#include <output_fragment>')) {
          const csmShadowCode = `
            #ifdef USE_CSM
              // Calculate view-space depth
              float viewDepth = -position.z;
              
              // Get world position and normal
              vec3 worldPos = vWorldPosition.xyz;
              vec3 worldNormal = normalize(vWorldNormal);
              
              // Calculate CSM shadow factor
              float csmShadowFactor = getCSMShadow(worldPos, worldNormal, viewDepth);
              
              // Apply CSM shadow to lighting
              // Three.js uses shadowMask variable for shadows
              #ifndef shadowMask
                float shadowMask = 1.0;
              #endif
              shadowMask = csmShadowFactor;
            #endif
          `
          
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <output_fragment>',
            csmShadowCode + '\n#include <output_fragment>'
          )
        }
      }
      
      // Ensure shadowMask is declared if it doesn't exist
      if (!shader.fragmentShader.includes('float shadowMask')) {
        // Add shadowMask declaration before CSM code
        shader.fragmentShader = shader.fragmentShader.replace(
          '#ifdef USE_CSM',
          `float shadowMask = 1.0;
          #ifdef USE_CSM`
        )
      }
    }

    // Mark material as updated
    material.needsUpdate = true
  }

  public setShaderBias(bias: number): void {
    this.shadowBias = bias
  }

  public setShaderNormalBias(normalBias: number): void {
    this.shadowNormalBias = normalBias
  }

  /**
   * Set light direction
   */
  public setDirection(direction: THREE.Vector3): void {
    this.direction.copy(direction).normalize()
  }

  /**
   * Set light intensity
   */
  public setIntensity(intensity: number): void {
    this.intensity = intensity
    this.lights.forEach((light) => {
      light.intensity = CSM_CASCADE_LIGHT_RENDER_INTENSITY
    })
    this.refreshUniformBuffers()
  }

  /**
   * Set shadow radius (blur amount)
   * 0 = sharp shadows, higher values = softer shadows
   */
  public setShadowRadius(radius: number): void {
    this.shadowRadius = Math.max(0, radius) // Clamp to 0 or higher
    this.lights.forEach((light) => {
      light.shadow.radius = this.shadowRadius
    })
    
    // Update uniforms for all materials that use CSM
    // This requires updating the CSMShadowRadius uniform in all materials
    // Note: We can't update uniforms directly here, but we can trigger a material update
    // The uniform will be updated when getUniforms() is called next
  }

  /**
   * Update shadow map uniforms for all materials that use CSM
   * This should be called after shadow maps are created (e.g., in render loop)
   * CRITICAL: This updates uniforms dynamically without requiring shader recompilation
   */
  public updateShadowMapUniforms(scene: THREE.Scene): void {
    let updatedCount = 0
    let dummyTextureCount = 0
    const csmUniforms = this.getUniforms()
    
    // Update uniforms for all materials in the scene
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          // Update CSM uniforms (including shadow radius)
          if (material.userData?.csmShadowMapUniforms || (material as any).uniforms) {
            const shaderUniforms = (material as any).uniforms
            if (shaderUniforms) {
              // Update CSMShadowRadius uniform
              if (shaderUniforms.CSMShadowRadius) {
                shaderUniforms.CSMShadowRadius.value = csmUniforms.CSMShadowRadius
              }
            }
          }
          
          if (material.userData?.csmShadowMapUniforms) {
            // Material has CSM shadow map uniforms - update them
            const uniforms = material.userData.csmShadowMapUniforms
            this.lights.forEach((light, index) => {
              const uniformName = `CSMShadowMap${index}`
              if (uniforms[uniformName]) {
                const currentTexture = uniforms[uniformName].value
                let newTexture: THREE.Texture | null = null
                
                // CRITICAL: Always check for Three.js shadow map first (preferred)
                if (light.shadow && light.shadow.map) {
                  newTexture = light.shadow.map as unknown as THREE.Texture
                } else {
                  // Fallback to StreetsGLCSM shadow map
                  const renderTarget = this.shadowMaps[index]
                  if (renderTarget && renderTarget.texture) {
                    newTexture = renderTarget.texture as THREE.Texture
                  }
                }
                
                // CRITICAL: Always update if we have a real shadow map and current is dummy or different
                // This ensures dummy textures are replaced with real shadow maps as soon as they're created
                if (newTexture) {
                  // Check if current texture is a dummy (white texture)
                  // A dummy texture is a DataTexture with 4 bytes (RGBA) all set to 255 (white)
                  const isDummy = currentTexture instanceof THREE.DataTexture && 
                                  currentTexture.image?.data?.length === 4 &&
                                  currentTexture.image.data[0] === 255 &&
                                  currentTexture.image.data[1] === 255 &&
                                  currentTexture.image.data[2] === 255
                  
                  // Also check if current texture is not a RenderTargetTexture (real shadow maps are RenderTargetTextures)
                  const isRealShadowMap = newTexture instanceof THREE.DepthTexture || 
                                         (newTexture as any).isRenderTargetTexture === true ||
                                         (newTexture as any).image?.width === light.shadow?.mapSize?.width
                  
                  // Update if: texture changed OR current is dummy OR new texture is a real shadow map
                  // Always prefer real shadow maps over dummy textures
                  if (currentTexture !== newTexture || isDummy || (isRealShadowMap && !isDummy)) {
                    uniforms[uniformName].value = newTexture
                    updatedCount++
                    if (isDummy) {
                      // Log when we replace a dummy texture with a real shadow map
                      console.log(`[StreetsGLCSM] ✅ Replaced dummy texture with real shadow map for cascade ${index} (size: ${light.shadow?.mapSize?.width || 'unknown'}px)`)
                    }
                  }
                } else if (currentTexture) {
                  // No shadow map available yet - check if current is dummy
                  const isDummy = currentTexture instanceof THREE.DataTexture && 
                                  currentTexture.image?.data?.length === 4 &&
                                  currentTexture.image.data[0] === 255 &&
                                  currentTexture.image.data[1] === 255 &&
                                  currentTexture.image.data[2] === 255
                  if (isDummy) {
                    dummyTextureCount++
                  }
                }
              }
            })
          }
        })
      }
    })
    
    // Log diagnostic info (only occasionally to avoid spam, but always log if there are issues)
    // CRITICAL: Always log when dummy textures are found or when updates occur
    const shouldLog = dummyTextureCount > 0 || updatedCount > 0 || Math.random() < 0.01
    if (shouldLog) {
      const shadowMapStatus = this.lights.map((light, index) => ({
        cascade: index,
        hasThreeJSMap: !!(light.shadow && light.shadow.map),
        mapSize: light.shadow?.mapSize?.width || 'unknown',
        hasStreetsGLMap: !!(this.shadowMaps[index] && this.shadowMaps[index].texture),
        castShadow: light.castShadow,
        visible: light.visible
      }))
      
      if (dummyTextureCount > 0) {
        console.warn(`[StreetsGLCSM] ⚠️ Shadow map status: ${dummyTextureCount} material(s) still using dummy textures`, shadowMapStatus)
      } else if (updatedCount > 0) {
        console.log(`[StreetsGLCSM] ✅ Shadow map status: Updated ${updatedCount} uniform(s) with real shadow maps`, shadowMapStatus)
      } else {
        // Only log occasionally if no issues
        if (Math.random() < 0.01) {
          console.log(`[StreetsGLCSM] Shadow map status:`, shadowMapStatus)
        }
      }
    }
  }

  /**
   * Dispose CSM system
   */
  public dispose(parent?: THREE.Object3D): void {
    const lightCount = this.lights.length
    if (lightCount > 0) {
      console.log(`[StreetsGLCSM] Disposing ${lightCount} directional light(s) and removing from scene`)
    }
    
    // Remove lights and their targets from scene before disposing
    this.lights.forEach((light) => {
      // Remove light target if it exists
      if (light.target && light.target.parent) {
        light.target.parent.remove(light.target)
      }
      // Remove light from scene
      if (light.parent) {
        light.parent.remove(light)
      }
      // Dispose shadow map
      if (light.shadow.map) light.shadow.map.dispose()
    })
    
    // Dispose shadow maps
    this.shadowMaps.forEach((rt) => rt.dispose())
    
    // Clear arrays
    this.lights = []
    this.shadowMaps = []
    this.cascadeCameras = []
    
    if (lightCount > 0) {
      console.log(`[StreetsGLCSM] ✅ Cleaned up ${lightCount} directional light(s)`)
    }
  }
}

