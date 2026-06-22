import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js'
import { LUTShader } from './LUTShader'
import { AnamorphicShader } from './AnamorphicShader'
import { SSSShader } from './SSSShader'
import { SSRShader } from './SSRShader'
import { ToneMappingShader, ToneMappingType } from './ToneMappingShader'
import { ColorGradingShader } from './ColorGradingShader'
import { DepthRenderPass } from '../pathTracer/DepthRenderPass'
import { NormalRenderPass } from '../pathTracer/NormalRenderPass'

export interface PostProcessingConfig {
  enabled: boolean
  bloom?: {
    enabled: boolean
    strength: number
    radius: number
    threshold: number
  }
  lut?: {
    enabled: boolean
    lut: THREE.Texture | null
    intensity: number
  }
  anamorphic?: {
    enabled: boolean
    intensity: number
    threshold: number
    scale: number
    color: THREE.Color
  }
  ao?: {
    enabled: boolean
    output: number
    saoBias: number
    saoIntensity: number
    saoScale: number
    saoKernelRadius: number
    saoMinResolution: number
    saoBlur: boolean
    saoBlurRadius: number
    saoBlurStdDev: number
    saoBlurDepthCutoff: number
  }
  sss?: {
    enabled: boolean
    intensity: number
    maxRadius: number
    samples: number
    rayDistance: number
    thickness: number
    bias: number
    lightDirection: THREE.Vector3
    shadowMapIntensityMultiplier?: number // Multiplier when shadow maps are active (0.1-0.3, default 0.2)
  }
  ssr?: {
    enabled: boolean
    intensity: number
    thickness: number
    maxDistance: number
    maxSteps: number
    maxBinarySearchSteps: number
    roughnessFade: number
    fadeDistance: number
    fadeMargin: number
  }
  toneMapping?: {
    type: ToneMappingType
    exposure: number
    whitePoint: number // For Reinhard
  }
  colorGrading?: {
    enabled: boolean
    exposure: number // -2.0 to 2.0, 0.0 = neutral (in stops)
    contrast: number // -100 to 100, 0 = neutral (in percent)
    highlights: number // -100 to 100, 0 = neutral
    shadows: number // -100 to 100, 0 = neutral
    whites: number // -100 to 100, 0 = neutral
    blacks: number // -100 to 100, 0 = neutral
    hue: number // -180 to 180 degrees
    saturation: number // -100 to 100, 0 = neutral (in percent)
    vibrance: number // -100 to 100, 0 = neutral
    gamma: number // 0.1 - 3.0, 1.0 = neutral
  }
}

export class PostProcessingSystem {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer | null = null
  private config: PostProcessingConfig
  private renderPass: RenderPass | null = null
  private bloomPass: UnrealBloomPass | null = null
  private lutPass: ShaderPass | null = null
  private anamorphicPass: ShaderPass | null = null
  private saoPass: SAOPass | null = null
  private sssPass: ShaderPass | null = null
  private ssrPass: ShaderPass | null = null
  private toneMappingPass: ShaderPass | null = null
  private colorGradingPass: ShaderPass | null = null
  private outputPass: OutputPass | null = null
  private depthRenderTarget: THREE.WebGLRenderTarget | null = null
  private normalRenderTarget: THREE.WebGLRenderTarget | null = null
  private depthRenderPass: DepthRenderPass | null = null
  private normalRenderPass: NormalRenderPass | null = null
  private originalToneMapping: THREE.ToneMapping
  private originalToneMappingExposure: number

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    config: PostProcessingConfig
  ) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.config = config
    this.originalToneMapping = renderer.toneMapping
    this.originalToneMappingExposure = renderer.toneMappingExposure
    if (config.enabled) {
      this.initialize()
    }
  }

  private applyPostProcessingToneMappingOverride(): void {
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.toneMappingExposure = 1.0
  }

  private restoreRendererToneMapping(): void {
    this.renderer.toneMapping = this.originalToneMapping
    this.renderer.toneMappingExposure = this.originalToneMappingExposure
  }

  private initialize() {
    // CRITICAL: Disable renderer's built-in tone mapping when using post-processing
    // This prevents double tone mapping and washed out images
    this.applyPostProcessingToneMappingOverride()
    
    this.composer = new EffectComposer(this.renderer)
    // RenderPass renders the full scene (no layer filtering); Gaussian splats and other
    // transparent objects in the scene are included. Splats use depthWrite: false and
    // are drawn when Three.js traverses the scene into the composer's render target.
    this.renderPass = new RenderPass(this.scene, this.camera)
    // CRITICAL: RenderPass should NOT render to screen (it's an intermediate pass)
    this.renderPass.renderToScreen = false
    this.composer.addPass(this.renderPass)

    // Phase 1: Geometry-based effects (SSS, SSR) - these need depth/normal data
    // These must come early, right after render pass

    // Create depth and normal render targets for SSS/SSR (needed for both)
    // Depth prepass writes depth values to color texture (red channel)
    // Normal prepass writes normals to color texture (RGB channels)
    const width = this.renderer.domElement.width || 1
    const height = this.renderer.domElement.height || 1
    this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true, // Keep depth buffer for proper rendering
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat
    })
    // Note: DepthRenderPass writes depth to color texture (red channel), not depthTexture
    
    this.normalRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat
    })
    
    // Create depth and normal render passes if SSS or SSR are enabled
    if ((this.config.sss?.enabled || this.config.ssr?.enabled) && this.camera) {
      this.depthRenderPass = new DepthRenderPass(this.camera)
      // CRITICAL: Normal prepass is needed for SSR
      if (this.config.ssr?.enabled) {
        this.normalRenderPass = new NormalRenderPass()
        const width = this.renderer.domElement.width || 1
        const height = this.renderer.domElement.height || 1
        this.normalRenderTarget = new THREE.WebGLRenderTarget(width, height, {
          depthBuffer: true,
          stencilBuffer: false,
          type: THREE.UnsignedByteType,
          format: THREE.RGBAFormat
        })
      }
    }

    // NOTE: SSS and SSR passes are NOT added here in initialize()
    // They are added dynamically in updateConfig() to ensure correct order
    // and to avoid conflicts when enabling/disabling them later
    // This prevents duplicate passes and ensures proper insertion order

    // Phase 1b: SAO (ambient occlusion) - composites onto render pass output
    if (this.config.ao?.enabled) {
      this.addSAOPass()
    }

    // Phase 2: Lighting effects (Bloom, Anamorphic) - these enhance lighting
    // Order: Bloom before Anamorphic (bloom can enhance anamorphic flares)
    if (this.config.bloom?.enabled) {
      const resolution = new THREE.Vector2(
        this.renderer.domElement.width,
        this.renderer.domElement.height
      )
      this.bloomPass = new UnrealBloomPass(
        resolution,
        this.config.bloom.strength,
        this.config.bloom.radius,
        this.config.bloom.threshold
      )
      this.composer.addPass(this.bloomPass)
    }

    if (this.config.anamorphic?.enabled) {
      this.anamorphicPass = new ShaderPass(AnamorphicShader)
      this.anamorphicPass.uniforms.intensity.value = this.config.anamorphic.intensity
      this.anamorphicPass.uniforms.threshold.value = this.config.anamorphic.threshold
      this.anamorphicPass.uniforms.scale.value = this.config.anamorphic.scale
      this.anamorphicPass.uniforms.color.value = this.config.anamorphic.color
      this.composer.addPass(this.anamorphicPass)
    }

    // Phase 3: Color grading (LUT) - must come before tone mapping
    if (this.config.lut?.enabled && this.config.lut.lut) {
      this.lutPass = new ShaderPass(LUTShader)
      const lutSize = this.config.lut.lut.userData.lutSize || 32
      this.lutPass.uniforms.lutMap.value = this.config.lut.lut
      this.lutPass.uniforms.lutSize.value = lutSize
      this.lutPass.uniforms.intensity.value = this.config.lut.intensity
      this.composer.addPass(this.lutPass)
    }

    // Phase 4: Tone mapping (custom) - comes before color grading
    if (this.config.toneMapping) {
      this.toneMappingPass = new ShaderPass(ToneMappingShader)
      this.toneMappingPass.uniforms.exposure.value = this.config.toneMapping.exposure
      this.toneMappingPass.uniforms.toneMappingType.value = this.getToneMappingTypeValue(this.config.toneMapping.type)
      this.toneMappingPass.uniforms.whitePoint.value = this.config.toneMapping.whitePoint
      this.toneMappingPass.renderToScreen = false
      this.composer.addPass(this.toneMappingPass)
    }

    // Phase 5: Color grading (contrast, hue, saturation, brightness, vibrance, gamma) - comes after tone mapping, before output
    if (this.config.colorGrading?.enabled) {
      this.colorGradingPass = new ShaderPass(ColorGradingShader)
      this.updateColorGradingParameters()
      this.colorGradingPass.renderToScreen = false
      this.composer.addPass(this.colorGradingPass)
    }

    // Phase 6: Final output - must be last
    // OutputPass handles final color space conversion (but we use custom tone mapping)
    this.outputPass = new OutputPass()
    // CRITICAL: Disable tone mapping in OutputPass to prevent double tone mapping
    // We handle tone mapping with our custom ToneMappingShader, so OutputPass should not apply it
    if (this.outputPass.uniforms && 'toneMappingExposure' in this.outputPass.uniforms) {
      (this.outputPass.uniforms as any).toneMappingExposure.value = 1.0 // Neutral exposure (no tone mapping)
    }
    // Also ensure renderer's tone mapping doesn't interfere
    this.applyPostProcessingToneMappingOverride()
    // CRITICAL: OutputPass must render to screen (it's the final pass)
    this.outputPass.renderToScreen = true
    this.composer.addPass(this.outputPass)
    
    // Final validation: Ensure correct order
    // Expected order: Render → SSS → SSR → Bloom → Anamorphic → LUT → ToneMapping → ColorGrading → Output
    this.validatePassOrder()
    
    // Log pass order for debugging
    if (this.composer) {
      const passNames = this.composer.passes.map((pass, index) => {
        if (pass === this.renderPass) return `${index}: RenderPass`
        if (pass === this.sssPass) return `${index}: SSSPass`
        if (pass === this.ssrPass) return `${index}: SSRPass`
        if (pass === this.bloomPass) return `${index}: BloomPass`
        if (pass === this.anamorphicPass) return `${index}: AnamorphicPass`
        if (pass === this.saoPass) return `${index}: SAOPass`
        if (pass === this.lutPass) return `${index}: LUTPass`
        if (pass === this.toneMappingPass) return `${index}: ToneMappingPass`
        if (pass === this.colorGradingPass) return `${index}: ColorGradingPass`
        if (pass === this.outputPass) return `${index}: OutputPass`
        return `${index}: ${pass.constructor.name}`
      })
      console.log('[PostProcessingSystem] Pass order:', passNames)
    }
  }

  private getToneMappingTypeValue(type: ToneMappingType): number {
    switch (type) {
      case ToneMappingType.LINEAR:
        return 0
      case ToneMappingType.REINHARD:
        return 1
      case ToneMappingType.CINEON:
        return 2
      case ToneMappingType.ACES_FILMIC:
        return 3
      case ToneMappingType.UNCHARTED2:
        return 4
      default:
        return 3 // Default to ACES Filmic
    }
  }
  
  /**
   * Validate and correct post-processing pass order
   * Ensures: Render → SSS → SSR → Bloom → Anamorphic → LUT → ToneMapping → ColorGrading → Output
   */
  private validatePassOrder(): void {
    if (!this.composer) return
    
    const passes = this.composer.passes
    const renderIndex = passes.findIndex(p => p instanceof RenderPass)
    const sssIndex = this.sssPass ? passes.indexOf(this.sssPass) : -1
    const saoIndex = this.saoPass ? passes.indexOf(this.saoPass) : -1
    const ssrIndex = this.ssrPass ? passes.indexOf(this.ssrPass) : -1
    const bloomIndex = this.bloomPass ? passes.indexOf(this.bloomPass) : -1
    const anamorphicIndex = this.anamorphicPass ? passes.indexOf(this.anamorphicPass) : -1
    const lutIndex = this.lutPass ? passes.indexOf(this.lutPass) : -1
    const toneMappingIndex = this.toneMappingPass ? passes.indexOf(this.toneMappingPass) : -1
    const colorGradingIndex = this.colorGradingPass ? passes.indexOf(this.colorGradingPass) : -1
    const outputIndex = this.outputPass ? passes.indexOf(this.outputPass) : -1
    
    // Reorder if needed (this should rarely happen, but ensures correctness)
    const correctOrder: Array<{ pass: any; name: string }> = []
    if (renderIndex !== -1) correctOrder.push({ pass: passes[renderIndex], name: 'Render' })
    if (saoIndex !== -1) correctOrder.push({ pass: passes[saoIndex], name: 'SAO' })
    if (sssIndex !== -1) correctOrder.push({ pass: passes[sssIndex], name: 'SSS' })
    if (ssrIndex !== -1) correctOrder.push({ pass: passes[ssrIndex], name: 'SSR' })
    if (bloomIndex !== -1) correctOrder.push({ pass: passes[bloomIndex], name: 'Bloom' })
    if (anamorphicIndex !== -1) correctOrder.push({ pass: passes[anamorphicIndex], name: 'Anamorphic' })
    if (lutIndex !== -1) correctOrder.push({ pass: passes[lutIndex], name: 'LUT' })
    if (toneMappingIndex !== -1) correctOrder.push({ pass: passes[toneMappingIndex], name: 'ToneMapping' })
    if (colorGradingIndex !== -1) correctOrder.push({ pass: passes[colorGradingIndex], name: 'ColorGrading' })
    if (outputIndex !== -1) correctOrder.push({ pass: passes[outputIndex], name: 'Output' })
    
    // Only reorder if actually out of order
    let needsReorder = false
    for (let i = 0; i < correctOrder.length; i++) {
      const currentIndex = passes.indexOf(correctOrder[i].pass)
      if (currentIndex !== i) {
        needsReorder = true
        break
      }
    }
    
    if (needsReorder) {
      console.warn('[PostProcessingSystem] Correcting pass order')
      // Remove all passes except render
      passes.splice(1)
      // Add in correct order
      correctOrder.slice(1).forEach(({ pass }) => {
        this.composer!.addPass(pass)
      })
    }
  }

  render() {
    // CRITICAL: Preserve shadow map settings during post-processing render
    // Store shadow state before render
    const shadowMapEnabled = this.renderer.shadowMap.enabled
    const shadowMapType = this.renderer.shadowMap.type
    const shadowMapAutoUpdate = this.renderer.shadowMap.autoUpdate
    
    // CRITICAL: Render depth and normal prepasses before SSS/SSR if needed
    // These need to be rendered before the composer so textures are available
    if (this.config.enabled && (this.config.sss?.enabled || this.config.ssr?.enabled)) {
      // CRITICAL: Temporarily disable shadow maps during prepass to prevent depth buffer conflicts
      const shadowMapEnabled = this.renderer.shadowMap.enabled
      if (shadowMapEnabled) {
        this.renderer.shadowMap.enabled = false
      }
      
      try {
        if (this.depthRenderPass && this.depthRenderTarget) {
          // Update render target size if needed
          const width = this.renderer.domElement.width || 1
          const height = this.renderer.domElement.height || 1
          if (this.depthRenderTarget.width !== width || this.depthRenderTarget.height !== height) {
            this.depthRenderTarget.setSize(width, height)
          }
          // Render depth prepass - writes depth to color texture (red channel)
          this.depthRenderPass.render(this.renderer, this.scene, this.camera, this.depthRenderTarget)
        }
        
        if (this.normalRenderPass && this.normalRenderTarget) {
          // Update render target size if needed
          const width = this.renderer.domElement.width || 1
          const height = this.renderer.domElement.height || 1
          if (this.normalRenderTarget.width !== width || this.normalRenderTarget.height !== height) {
            this.normalRenderTarget.setSize(width, height)
          }
          // Render normal prepass
          this.normalRenderPass.render(this.renderer, this.scene, this.camera, this.normalRenderTarget)
        }
      } catch (error) {
        console.error('[PostProcessingSystem] ❌ Prepass rendering failed:', error)
        // Disable SSS/SSR if prepass fails
        if (this.config.sss?.enabled) {
          this.config.sss.enabled = false
          console.warn('[PostProcessingSystem] ⚠️ SSS disabled due to prepass failure')
        }
        if (this.config.ssr?.enabled) {
          this.config.ssr.enabled = false
          console.warn('[PostProcessingSystem] ⚠️ SSR disabled due to prepass failure')
        }
      } finally {
        // Restore shadow maps
        this.renderer.shadowMap.enabled = shadowMapEnabled
      }
      
      // CRITICAL: Update SSS/SSR parameters AFTER rendering prepasses
      // This ensures textures are available and connected
      if (this.sssPass && this.config.sss?.enabled) {
        // Force texture update - depth prepass just rendered
        const uniforms = this.sssPass.uniforms
        if (this.depthRenderTarget && this.depthRenderTarget.texture) {
          uniforms.tDepth.value = this.depthRenderTarget.texture
          // Note: Texture is automatically updated when rendered to, no need to set needsUpdate
        }
        // CRITICAL: Do NOT set tDiffuse here - ShaderPass handles it automatically
        // Setting it here can cause feedback loops with EffectComposer's ping-pong buffering
        // Update all other parameters
        this.updateSSSParameters()
      }
      if (this.ssrPass && this.config.ssr?.enabled) {
        // Force texture update - prepasses just rendered
        const uniforms = this.ssrPass.uniforms
        if (this.depthRenderTarget && this.depthRenderTarget.texture) {
          uniforms.tDepth.value = this.depthRenderTarget.texture
          // Note: Texture is automatically updated when rendered to, no need to set needsUpdate
        }
        if (this.normalRenderTarget && this.normalRenderTarget.texture) {
          uniforms.tNormal.value = this.normalRenderTarget.texture
          // Note: Texture is automatically updated when rendered to, no need to set needsUpdate
        }
        // CRITICAL: Do NOT set tDiffuse here - EffectComposer uses ping-pong buffering
        // and the readBuffer/writeBuffer swap between passes. Setting tDiffuse here
        // can cause it to point to writeBuffer, creating a feedback loop.
        // The SSR render override will set tDiffuse correctly from readBuffer at render time.
        // Update all other parameters (camera matrices, etc.)
        this.updateSSRParameters()
      }
    }
    
    if (this.composer && this.config.enabled) {
      this.applyPostProcessingToneMappingOverride()
      this.composer.render()
    } else {
      // Fallback to direct render if post-processing is disabled
      // This is expected behavior when post-processing is off
      this.restoreRendererToneMapping()
      this.renderer.render(this.scene, this.camera)
    }
    
    // CRITICAL: Restore shadow map settings after render (in case post-processing modified them)
    this.renderer.shadowMap.enabled = shadowMapEnabled
    this.renderer.shadowMap.type = shadowMapType
    this.renderer.shadowMap.autoUpdate = shadowMapAutoUpdate
  }

  setSize(width: number, height: number) {
    if (this.composer) {
      this.composer.setSize(width, height)
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(width, height)
    }
    if (this.sssPass) {
      this.sssPass.setSize(width, height)
    }
    if (this.depthRenderTarget) {
      this.depthRenderTarget.setSize(width, height)
    }
    if (this.normalRenderTarget) {
      this.normalRenderTarget.setSize(width, height)
    }
    if (this.ssrPass) {
      this.ssrPass.setSize(width, height)
    }
    if (this.toneMappingPass) {
      this.toneMappingPass.setSize(width, height)
    }
    if (this.colorGradingPass) {
      this.colorGradingPass.setSize(width, height)
    }
    if (this.saoPass) {
      this.saoPass.setSize(width, height)
    }
    // LUT pass doesn't need size update (it uses the composer's size)
  }

  private getPassInsertIndexAfterRender(): number {
    if (!this.composer || !this.renderPass) return 1
    const renderPassIndex = this.composer.passes.indexOf(this.renderPass)
    return renderPassIndex !== -1 ? renderPassIndex + 1 : 1
  }

  private addSAOPass(): void {
    if (!this.composer || this.saoPass) return

    const width = this.renderer.domElement.width || 1
    const height = this.renderer.domElement.height || 1
    this.saoPass = new SAOPass(this.scene, this.camera, new THREE.Vector2(width, height))
    this.saoPass.renderToScreen = false
    this.updateSAOParameters()
    this.composer.passes.splice(this.getPassInsertIndexAfterRender(), 0, this.saoPass)
  }

  private updateSAOParameters(): void {
    if (!this.saoPass || !this.config.ao) return
    const ao = this.config.ao
    this.saoPass.params.output = ao.output
    this.saoPass.params.saoBias = ao.saoBias
    this.saoPass.params.saoIntensity = ao.saoIntensity
    this.saoPass.params.saoScale = ao.saoScale
    this.saoPass.params.saoKernelRadius = ao.saoKernelRadius
    this.saoPass.params.saoMinResolution = ao.saoMinResolution
    this.saoPass.params.saoBlur = ao.saoBlur
    this.saoPass.params.saoBlurRadius = ao.saoBlurRadius
    this.saoPass.params.saoBlurStdDev = ao.saoBlurStdDev
    this.saoPass.params.saoBlurDepthCutoff = ao.saoBlurDepthCutoff
  }

  private updateSSSParameters() {
    if (!this.sssPass || !this.config.sss || !this.camera) {
      // Silent return - these checks are expected during initialization
      // The pass will be created in updateConfig's pass management section
      return
    }
    
    const sss = this.config.sss
    const uniforms = this.sssPass.uniforms
    
    // Store previous values to detect changes
    const prevIntensity = uniforms.intensity.value
    const prevMaxRadius = uniforms.maxRadius.value
    
    // CRITICAL FIX: Reduce SSS intensity when shadow maps are enabled to prevent double shadows
    // Shadow maps already provide shadows, so SSS should only add subtle contact shadows
    // Use configurable multiplier (default 0.2 = 20%) when shadow maps are active
    const shadowMapsActive = this.renderer.shadowMap.enabled
    const intensityMultiplier = sss.shadowMapIntensityMultiplier ?? 0.2 // Default 20% if not specified
    const effectiveIntensity = shadowMapsActive 
      ? sss.intensity * intensityMultiplier  // Reduce by multiplier when shadow maps are active
      : sss.intensity                         // Use full intensity when shadow maps are disabled
    
    // Log intensity calculation for debugging (throttled to prevent console spam)
    if (Math.random() < 0.01) { // 1% of calls
      const lightDir = uniforms.lightDirection.value
      const lightDirLength = lightDir.length()
      console.log('[PostProcessingSystem] SSS Intensity:', {
        baseIntensity: sss.intensity,
        shadowMapsActive,
        intensityMultiplier: shadowMapsActive ? intensityMultiplier : 1.0,
        effectiveIntensity: effectiveIntensity.toFixed(3),
        lightDirection: { 
          x: lightDir.x.toFixed(3), 
          y: lightDir.y.toFixed(3), 
          z: lightDir.z.toFixed(3),
          length: lightDirLength.toFixed(3)
        },
        note: effectiveIntensity < 0.2 ? '⚠️ Low intensity - may not be visible! Try increasing intensity to 1.0+' : 
              lightDirLength < 0.1 ? '⚠️ Light direction too small - may not cast shadows!' : 
              '✅ Intensity OK'
      })
    }
    
    // Update all parameters
    uniforms.intensity.value = effectiveIntensity
    uniforms.maxRadius.value = sss.maxRadius
    uniforms.samples.value = sss.samples
    uniforms.rayDistance.value = sss.rayDistance
    uniforms.thickness.value = sss.thickness
    uniforms.bias.value = sss.bias
    
    // CRITICAL: Transform light direction from world space to view space
    // SSS shader expects light direction in view space (camera's perspective)
    const worldLightDir = sss.lightDirection.clone().normalize()
    const viewLightDir = worldLightDir.applyMatrix4(this.camera.matrixWorldInverse)
    uniforms.lightDirection.value.copy(viewLightDir)
    
    // Debug mode (can be enabled via console: postProcessingSystem.sssPass.uniforms.debugMode.value = 1.0)
    if (!uniforms.debugMode) {
      uniforms.debugMode = { value: 0.0 }
    }
    
    // Update resolution uniform
    if (!uniforms.resolution) {
      uniforms.resolution = { value: new THREE.Vector2(1, 1) }
    }
    const width = this.renderer.domElement.width || 1
    const height = this.renderer.domElement.height || 1
    uniforms.resolution.value.set(width, height)
    
    // Only log when parameters change significantly (throttled to prevent console flooding)
    const intensityChanged = Math.abs(prevIntensity - uniforms.intensity.value) > 0.01
    const maxRadiusChanged = Math.abs(prevMaxRadius - uniforms.maxRadius.value) > 0.1
    
    // Throttle logging to prevent console blocking (log only 1% of updates)
    if ((intensityChanged || maxRadiusChanged) && Math.random() < 0.01) {
      const hasDepthTexture = !!uniforms.tDepth.value
      const effectiveIntensityValue = uniforms.intensity.value
      
      console.log('[PostProcessingSystem] ✅ SSS parameters changed:', {
        baseIntensity: sss.intensity,
        effectiveIntensity: effectiveIntensityValue,
        maxRadius: uniforms.maxRadius.value,
        samples: uniforms.samples.value,
        hasDepthTexture,
        shadowMapsActive: this.renderer.shadowMap.enabled,
        warning: effectiveIntensityValue < 0.1 ? '⚠️ Intensity too low - may not be visible!' : undefined
      })
      
      // Warn if intensity is too low to be visible
      if (effectiveIntensityValue < 0.1 && hasDepthTexture) {
        console.warn('[PostProcessingSystem] ⚠️ SSS intensity is very low (' + effectiveIntensityValue.toFixed(3) + '). Increase SSS intensity in settings to see the effect!')
      }
    }
    if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
      uniforms.cameraNear.value = this.camera.near
      uniforms.cameraFar.value = this.camera.far
    } else {
      uniforms.cameraNear.value = 0.1
      uniforms.cameraFar.value = 1000
    }
    
    // CRITICAL: Get depth texture from depth prepass render target
    // The depth prepass renders depth to depthRenderTarget
    let depthTexture: THREE.Texture | null = null
    
    // Priority 1: Use depth prepass texture (most reliable)
      if (this.depthRenderTarget && this.depthRenderTarget.texture) {
        depthTexture = this.depthRenderTarget.texture
        // Verify texture is valid (only warn on errors, don't log success every time)
        const image = depthTexture.image as HTMLImageElement | HTMLCanvasElement | ImageData | null
        if (!image || (image && 'width' in image && 'height' in image && (image.width === 0 || image.height === 0))) {
          console.warn('[PostProcessingSystem] ⚠️ Depth texture exists but has no valid image data')
        }
      }
    // Priority 2: Try depth texture from depth render target
    else if (this.depthRenderTarget && this.depthRenderTarget.depthTexture) {
      // Note: DepthTexture needs special handling - convert to regular texture
      // For now, use the color texture from depth prepass
      console.warn('[PostProcessingSystem] DepthTexture found but using color texture instead')
    }
    // Priority 3: Fallback to composer's depth texture
    else if (this.composer) {
      const composerAny = this.composer as any
      if (composerAny.readBuffer?.depthTexture) {
        depthTexture = composerAny.readBuffer.depthTexture
        console.log('[PostProcessingSystem] Using depth texture from composer readBuffer')
      }
    }
    
    if (depthTexture) {
      // VALIDATION: Verify depth texture format and dimensions
      const image = depthTexture.image as HTMLImageElement | HTMLCanvasElement | ImageData | null
      if (image && 'width' in image && 'height' in image) {
        if (image.width === 0 || image.height === 0) {
          console.error('[PostProcessingSystem] ❌ SSS depth texture has invalid dimensions:', { 
            width: image.width, 
            height: image.height 
          })
        }
      }
      
      uniforms.tDepth.value = depthTexture
      
      // CRITICAL: Ensure tDiffuse is set from composer's readBuffer
      // ShaderPass should do this automatically, but we verify it's set
      if (this.composer && this.composer.readBuffer && this.composer.readBuffer.texture) {
        uniforms.tDiffuse.value = this.composer.readBuffer.texture
      } else {
        console.warn('[PostProcessingSystem] ⚠️ SSS tDiffuse not available from composer readBuffer')
      }
      
      // Initialize debugMode uniform if it doesn't exist
      if (!uniforms.debugMode) {
        uniforms.debugMode = { value: 0.0 }
      }
      
      // Log depth texture info (heavily throttled to prevent console blocking)
      if (Math.random() < 0.001) { // 0.1% of calls (reduced from 1%)
        console.log('[PostProcessingSystem] ✅ SSS textures connected:', {
          tDepth: !!uniforms.tDepth.value,
          tDiffuse: !!uniforms.tDiffuse.value,
          hasDepthImage: !!depthTexture.image
        })
      }
    } else {
      console.error('[PostProcessingSystem] ❌ SSS depth texture NOT found! SSS will not work.')
      console.error('[PostProcessingSystem] Debug info:', {
        composerExists: !!this.composer,
        depthRenderTargetExists: !!this.depthRenderTarget,
        depthRenderPassExists: !!this.depthRenderPass,
        postProcessingEnabled: this.config.enabled,
        sssEnabled: this.config.sss?.enabled
      })
    }
  }


  updateConfig(config: Partial<PostProcessingConfig>) {
    // Merge config deeply for nested objects
    if (config.bloom) {
      this.config.bloom = { ...this.config.bloom, ...config.bloom }
    }
    if (config.lut) {
      this.config.lut = { ...this.config.lut, ...config.lut }
    }
    if (config.anamorphic) {
      this.config.anamorphic = { ...this.config.anamorphic, ...config.anamorphic }
    }
    if (config.ao) {
      this.config.ao = { ...(this.config.ao || {}), ...config.ao }
      if (this.saoPass && this.config.ao) {
        this.updateSAOParameters()
      }
    }
    if (config.sss) {
      this.config.sss = { ...(this.config.sss || {}), ...config.sss }
      // CRITICAL: Immediately update SSS parameters when config changes
      if (this.sssPass && this.config.sss) {
        this.updateSSSParameters()
      }
      // Note: If pass doesn't exist yet, it will be created in the pass management section below
      // No need to warn - this is expected during initialization
    }
    if (config.ssr) {
      this.config.ssr = { ...(this.config.ssr || {}), ...config.ssr }
    }
    if (config.toneMapping) {
      this.config.toneMapping = { ...(this.config.toneMapping || {}), ...config.toneMapping }
    }
    if (config.colorGrading) {
      this.config.colorGrading = { ...(this.config.colorGrading || {}), ...config.colorGrading }
    }
    this.config = { ...this.config, ...config }
    
    // CONFLICT DETECTION: Check for common issues
    if (this.config.bloom?.enabled && !this.config.enabled) {
      console.warn('[PostProcessingSystem] ⚠️ CONFLICT: Bloom is enabled but post-processing is disabled. Bloom requires post-processing to be enabled.')
    }
    if (this.config.sss?.enabled && !this.config.enabled) {
      console.warn('[PostProcessingSystem] ⚠️ CONFLICT: SSS is enabled but post-processing is disabled. SSS requires post-processing to be enabled.')
    }
    if (this.config.ssr?.enabled && !this.config.enabled) {
      console.warn('[PostProcessingSystem] ⚠️ CONFLICT: SSR is enabled but post-processing is disabled. SSR requires post-processing to be enabled.')
    }
    if (this.config.ao?.enabled && !this.config.enabled) {
      console.warn('[PostProcessingSystem] ⚠️ CONFLICT: AO is enabled but post-processing is disabled. AO requires post-processing to be enabled.')
    }
    
    // Initialize if enabled but composer doesn't exist
    if (this.config.enabled && !this.composer) {
      this.initialize()
    }
    if (!this.config.enabled) {
      this.restoreRendererToneMapping()
    }
    
    // Handle bloom pass enable/disable
    if (this.composer && this.config.bloom) {
      const shouldHaveBloom = this.config.enabled && this.config.bloom.enabled
      const hasBloom = this.bloomPass !== null
      
      if (shouldHaveBloom && !hasBloom) {
        // Add bloom pass
        const resolution = new THREE.Vector2(
          this.renderer.domElement.width,
          this.renderer.domElement.height
        )
        this.bloomPass = new UnrealBloomPass(
          resolution,
          this.config.bloom.strength,
          this.config.bloom.radius,
          this.config.bloom.threshold
        )
        // Insert before output pass
        const outputPassIndex = this.composer.passes.length - 1
        this.composer.passes.splice(outputPassIndex, 0, this.bloomPass)
      } else if (!shouldHaveBloom && hasBloom) {
        // Remove bloom pass
        if (this.bloomPass) {
          const index = this.composer.passes.indexOf(this.bloomPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.bloomPass.dispose()
          this.bloomPass = null
        }
             } else if (hasBloom && this.bloomPass && this.config.bloom) {
        // Update bloom parameters
        this.bloomPass.strength = this.config.bloom.strength
        this.bloomPass.radius = this.config.bloom.radius
        this.bloomPass.threshold = this.config.bloom.threshold
      }
    }
    
    // Handle LUT pass
    if (this.composer && this.config.lut) {
      const shouldHaveLUT = this.config.enabled && this.config.lut.enabled && this.config.lut.lut !== null
      const hasLUT = this.lutPass !== null
      
      if (shouldHaveLUT && !hasLUT && this.config.lut.lut) {
        // Add LUT pass
        this.lutPass = new ShaderPass(LUTShader)
        const lutSize = this.config.lut.lut.userData.lutSize || 32
        this.lutPass.uniforms.lutMap.value = this.config.lut.lut
        this.lutPass.uniforms.lutSize.value = lutSize
        this.lutPass.uniforms.intensity.value = this.config.lut.intensity
        // Insert before output pass
        const outputPassIndex = this.composer.passes.length - 1
        this.composer.passes.splice(outputPassIndex, 0, this.lutPass)
      } else if (!shouldHaveLUT && hasLUT) {
        // Remove LUT pass
        if (this.lutPass) {
          const index = this.composer.passes.indexOf(this.lutPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.lutPass.dispose()
          this.lutPass = null
        }
              } else if (hasLUT && this.lutPass && this.config.lut.lut) {
        // Update LUT parameters
        const lutSize = this.config.lut.lut.userData.lutSize || 32
        this.lutPass.uniforms.lutMap.value = this.config.lut.lut
        this.lutPass.uniforms.lutSize.value = lutSize
        this.lutPass.uniforms.intensity.value = this.config.lut.intensity
      }
    }
    
    // Handle Anamorphic pass
    if (this.composer && this.config.anamorphic) {
      const shouldHaveAnamorphic = this.config.enabled && this.config.anamorphic.enabled
      const hasAnamorphic = this.anamorphicPass !== null
      
      if (shouldHaveAnamorphic && !hasAnamorphic) {
        // Add anamorphic pass
        this.anamorphicPass = new ShaderPass(AnamorphicShader)
        this.anamorphicPass.uniforms.intensity.value = this.config.anamorphic.intensity
        this.anamorphicPass.uniforms.threshold.value = this.config.anamorphic.threshold
        this.anamorphicPass.uniforms.scale.value = this.config.anamorphic.scale
        this.anamorphicPass.uniforms.color.value = this.config.anamorphic.color
        // Insert before output pass
        const outputPassIndex = this.composer.passes.length - 1
        this.composer.passes.splice(outputPassIndex, 0, this.anamorphicPass)
      } else if (!shouldHaveAnamorphic && hasAnamorphic) {
        // Remove anamorphic pass
        if (this.anamorphicPass) {
          const index = this.composer.passes.indexOf(this.anamorphicPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.anamorphicPass.dispose()
          this.anamorphicPass = null
        }
      } else if (hasAnamorphic && this.anamorphicPass && this.config.anamorphic) {
        // Update anamorphic parameters
        this.anamorphicPass.uniforms.intensity.value = this.config.anamorphic.intensity
        this.anamorphicPass.uniforms.threshold.value = this.config.anamorphic.threshold
        this.anamorphicPass.uniforms.scale.value = this.config.anamorphic.scale
        this.anamorphicPass.uniforms.color.value = this.config.anamorphic.color
      }
    }
    
    // Handle SAO (ambient occlusion) pass
    if (this.composer && this.config.ao) {
      const shouldHaveAO = this.config.enabled && this.config.ao.enabled
      const hasAO = this.saoPass !== null

      if (shouldHaveAO && !hasAO) {
        this.addSAOPass()
      } else if (!shouldHaveAO && hasAO) {
        if (this.saoPass) {
          const index = this.composer.passes.indexOf(this.saoPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.saoPass.dispose()
          this.saoPass = null
        }
      } else if (hasAO && this.saoPass && this.config.ao) {
        this.updateSAOParameters()
        if (!this.composer.passes.includes(this.saoPass)) {
          this.composer.passes.splice(this.getPassInsertIndexAfterRender(), 0, this.saoPass)
        }
      }
    }
    
    // Handle SSS pass
    if (this.composer && this.config.sss && this.camera) {
      const shouldHaveSSS = this.config.enabled && this.config.sss.enabled
      const hasSSS = this.sssPass !== null
      
      // CRITICAL: Warn if SSS is enabled but post-processing is disabled
      if (this.config.sss.enabled && !this.config.enabled) {
        console.warn('[PostProcessingSystem] ⚠️ SSS is enabled but post-processing is disabled. Enable post-processing first!')
      }
      
      if (shouldHaveSSS && !hasSSS) {
        // Add SSS pass
        this.sssPass = new ShaderPass(SSSShader)
        this.sssPass.renderToScreen = false
        
        // CRITICAL: Override render method to ensure textures are connected right before rendering
        // This ensures depth texture is always fresh from the prepass
        const originalRender = this.sssPass.render.bind(this.sssPass)
        this.sssPass.render = (renderer: THREE.WebGLRenderer, writeBuffer: any, readBuffer: any, deltaTime: number = 0, maskActive: boolean = false) => {
          const gl = renderer.getContext() as WebGLRenderingContext
          
          // CRITICAL: Clear any previous WebGL errors first
          while (gl.getError() !== gl.NO_ERROR) {}
          
          // CRITICAL: Prevent feedback loop - check BEFORE setting any uniforms
          if (writeBuffer && readBuffer) {
            if (writeBuffer.texture === readBuffer.texture || 
                (writeBuffer.texture && readBuffer.texture && writeBuffer.texture.uuid === readBuffer.texture.uuid)) {
              console.warn('[PostProcessingSystem] ⚠️ SSS: Feedback loop detected, skipping render')
              return
            }
          }
          
          // CRITICAL: Validate shader program BEFORE rendering (if it exists)
          // Note: ShaderPass compiles shaders lazily on first render, so program might not exist yet
          const material = (this.sssPass as any).material
          
          // CRITICAL: Force shader compilation if material exists but program doesn't
          // This ensures program is ready before we try to use it
          if (material && !material.program) {
            // Force material to compile by setting needsUpdate
            material.needsUpdate = true
          }
          
          if (material && material.program && material.program.program) {
            const program = material.program.program
            const isLinked = gl.getProgramParameter(program, gl.LINK_STATUS)
            if (!isLinked) {
              // Get detailed shader compilation errors
              const vertexShader = gl.getAttachedShaders(program)?.[0]
              const fragmentShader = gl.getAttachedShaders(program)?.[1]
              
              let errorMsg = '[PostProcessingSystem] ❌ SSS shader program not linked, skipping render'
              
              if (vertexShader) {
                const vertexCompiled = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)
                if (!vertexCompiled) {
                  const vertexInfo = gl.getShaderInfoLog(vertexShader)
                  errorMsg += `\n  ❌ Vertex Shader Error:\n${vertexInfo}`
                }
              }
              
              if (fragmentShader) {
                const fragmentCompiled = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)
                if (!fragmentCompiled) {
                  const fragmentInfo = gl.getShaderInfoLog(fragmentShader)
                  errorMsg += `\n  ❌ Fragment Shader Error:\n${fragmentInfo}`
                }
              }
              
              const programInfo = gl.getProgramInfoLog(program)
              if (programInfo) {
                errorMsg += `\n  ❌ Program Link Error:\n${programInfo}`
              }
              
              console.error(errorMsg)
              
              // Disable SSS to prevent repeated errors
              if (this.config.sss) {
                this.config.sss.enabled = false
                console.warn('[PostProcessingSystem] ⚠️ SSS disabled due to shader linking failure')
              }
              return
            }
          }
          // If program doesn't exist yet, ShaderPass will compile it on first render
          // We'll check for errors after render
          
          // Ensure depth texture is connected right before rendering
          const uniforms = this.sssPass!.uniforms
          if (this.depthRenderTarget && this.depthRenderTarget.texture) {
            uniforms.tDepth.value = this.depthRenderTarget.texture
          }
          
          // CRITICAL: Explicitly set tDiffuse to readBuffer.texture BEFORE calling originalRender
          // This ensures we're reading from the correct buffer and prevents feedback loops
          // ShaderPass will also set it, but we set it first to ensure correctness
          if (!readBuffer || !readBuffer.texture) {
            console.warn('[PostProcessingSystem] ⚠️ SSS: readBuffer.texture not available')
            return
          }
          
          // CRITICAL: Set tDiffuse explicitly to readBuffer.texture to prevent feedback loops
          uniforms.tDiffuse.value = readBuffer.texture
          
          // CRITICAL: Double-check tDiffuse is not pointing to writeBuffer
          if (writeBuffer && writeBuffer.texture && uniforms.tDiffuse.value === writeBuffer.texture) {
            console.error('[PostProcessingSystem] ❌ SSS: tDiffuse would point to writeBuffer, skipping render')
            if (this.config.sss) {
              this.config.sss.enabled = false
            }
            return
          }
          
          // Call original render - ShaderPass will compile shader on first render if needed
          // Note: ShaderPass will also set tDiffuse, but we've already set it correctly above
          try {
            originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
            
            // CRITICAL: After render, verify tDiffuse wasn't set to writeBuffer
            // This can happen if EffectComposer's buffer swap timing is off
            if (uniforms.tDiffuse.value && writeBuffer && writeBuffer.texture) {
              if (uniforms.tDiffuse.value === writeBuffer.texture ||
                  uniforms.tDiffuse.value.uuid === writeBuffer.texture.uuid) {
                console.error('[PostProcessingSystem] ❌ SSS: tDiffuse was set to writeBuffer after render!')
                // This shouldn't happen, but if it does, disable SSS
                if (this.config.sss) {
                  this.config.sss.enabled = false
                }
                return
              }
            }
            
            // CRITICAL: After render, validate shader program (in case it was just compiled)
            // This catches compilation errors on first render
            if (material && material.program && material.program.program) {
              const program = material.program.program
              const isLinked = gl.getProgramParameter(program, gl.LINK_STATUS)
              if (!isLinked) {
                // Get detailed shader compilation errors
                const vertexShader = gl.getAttachedShaders(program)?.[0]
                const fragmentShader = gl.getAttachedShaders(program)?.[1]
                
                let errorMsg = '[PostProcessingSystem] ❌ SSS shader program not linked after render'
                
                if (vertexShader) {
                  const vertexCompiled = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)
                  if (!vertexCompiled) {
                    const vertexInfo = gl.getShaderInfoLog(vertexShader)
                    errorMsg += `\n  ❌ Vertex Shader Error:\n${vertexInfo}`
                  }
                }
                
                if (fragmentShader) {
                  const fragmentCompiled = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)
                  if (!fragmentCompiled) {
                    const fragmentInfo = gl.getShaderInfoLog(fragmentShader)
                    errorMsg += `\n  ❌ Fragment Shader Error:\n${fragmentInfo}`
                  }
                }
                
                const programInfo = gl.getProgramInfoLog(program)
                if (programInfo) {
                  errorMsg += `\n  ❌ Program Link Error:\n${programInfo}`
                }
                
                console.error(errorMsg)
                
                // Disable SSS to prevent repeated errors
                if (this.config.sss) {
                  this.config.sss.enabled = false
                  console.warn('[PostProcessingSystem] ⚠️ SSS disabled due to shader linking failure')
                }
                return
              }
            }
            
            // CRITICAL: Check for WebGL errors immediately after render
            // This catches errors before they accumulate
            let glError = gl.getError()
            if (glError !== gl.NO_ERROR) {
              const errorName = this.getGLErrorName(glError)
              console.error(`[PostProcessingSystem] ❌ SSS: WebGL error after render: ${errorName}`)
              
              // CRITICAL: Disable SSS immediately on ANY error to prevent error spam
              // INVALID_OPERATION usually means feedback loop or invalid program
              if (glError === gl.INVALID_OPERATION) {
                console.warn('[PostProcessingSystem] ⚠️ SSS disabled due to INVALID_OPERATION error (likely feedback loop or invalid shader)')
                if (this.config.sss) {
                  this.config.sss.enabled = false
                }
                return
              }
              
              // Also disable on other critical errors
              if (glError === gl.INVALID_FRAMEBUFFER_OPERATION || glError === gl.OUT_OF_MEMORY) {
                console.warn(`[PostProcessingSystem] ⚠️ SSS disabled due to ${errorName} error`)
                if (this.config.sss) {
                  this.config.sss.enabled = false
                }
                return
              }
            }
          } catch (error) {
            console.error('[PostProcessingSystem] ❌ SSS render exception:', error)
            if (this.config.sss) {
              this.config.sss.enabled = false
            }
          }
        }
        
        // CRITICAL: Ensure depth prepass exists
        if (!this.depthRenderPass && this.camera) {
          this.depthRenderPass = new DepthRenderPass(this.camera)
          const width = this.renderer.domElement.width || 1
          const height = this.renderer.domElement.height || 1
          if (!this.depthRenderTarget) {
            this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {
              depthBuffer: true,
              stencilBuffer: false,
              type: THREE.UnsignedByteType,
              format: THREE.RGBAFormat
            })
          }
        }
        
        // CRITICAL: Update parameters to connect depth texture
        this.updateSSSParameters()
        // Insert after render pass
        const renderPassIndex = this.composer.passes.findIndex((pass) => pass instanceof RenderPass)
        const insertIndex = renderPassIndex !== -1 ? renderPassIndex + 1 : 1
        this.composer.passes.splice(insertIndex, 0, this.sssPass)
        // Log pass creation with diagnostic info
        const lightDir = this.sssPass.uniforms.lightDirection.value
        console.log('[PostProcessingSystem] ✅ SSS pass added with render override', {
          passIndex: insertIndex,
          totalPasses: this.composer.passes.length,
          lightDirection: { x: lightDir.x.toFixed(3), y: lightDir.y.toFixed(3), z: lightDir.z.toFixed(3) },
          effectiveIntensity: this.sssPass.uniforms.intensity.value.toFixed(3),
          hasDepthTexture: !!this.sssPass.uniforms.tDepth.value,
          hasDiffuseTexture: !!this.sssPass.uniforms.tDiffuse.value
        })
      } else if (!shouldHaveSSS && hasSSS) {
        // Remove SSS pass
        if (this.sssPass) {
          const index = this.composer.passes.indexOf(this.sssPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.sssPass.dispose()
          this.sssPass = null
        }
      } else if (hasSSS && this.sssPass && this.config.sss) {
        // Update SSS parameters (including depth texture connection)
        // CRITICAL: Always update parameters when SSS is enabled and pass exists
        this.updateSSSParameters()
        
        // Verify depth texture is still connected
        const uniforms = this.sssPass.uniforms
        if (!uniforms.tDepth.value) {
          console.warn('[PostProcessingSystem] ⚠️ SSS depth texture lost during update! Reconnecting...')
          this.updateSSSParameters() // Try again
        }
        // Removed frequent logging that was blocking console - only log errors
        
        // Verify SSS pass is in composer
        if (this.composer && !this.composer.passes.includes(this.sssPass)) {
          console.error('[PostProcessingSystem] ❌ SSS pass exists but is NOT in composer! Re-adding...')
          const renderPassIndex = this.composer.passes.findIndex((pass) => pass instanceof RenderPass)
          const insertIndex = renderPassIndex !== -1 ? renderPassIndex + 1 : 1
          this.composer.passes.splice(insertIndex, 0, this.sssPass)
        }
        
        // DEBUG: Enable debug mode to visualize depth/shadow
        // Uncomment the next line to see depth texture:
        // this.sssPass.uniforms.debugMode.value = 1.0
        // Or to see shadow only:
        // this.sssPass.uniforms.debugMode.value = 2.0
      }
    }
    
    // Handle SSR pass
    if (this.composer && this.config.ssr && this.camera) {
      const shouldHaveSSR = this.config.enabled && this.config.ssr.enabled
      const hasSSR = this.ssrPass !== null
      
      if (shouldHaveSSR && !hasSSR) {
        // Add SSR pass
        this.ssrPass = new ShaderPass(SSRShader)
        this.ssrPass.renderToScreen = false
        
        // CRITICAL: Override render method to ensure textures are connected right before rendering
        // This ensures depth and normal textures are always fresh from the prepasses
        const originalSSRRender = this.ssrPass.render.bind(this.ssrPass)
        this.ssrPass.render = (renderer: THREE.WebGLRenderer, writeBuffer: any, readBuffer: any, deltaTime: number = 0, maskActive: boolean = false) => {
          const gl = renderer.getContext() as WebGLRenderingContext
          
          // CRITICAL: Clear any previous WebGL errors first
          while (gl.getError() !== gl.NO_ERROR) {}
          
          // CRITICAL: Prevent feedback loop - check BEFORE setting any uniforms
          if (writeBuffer && readBuffer) {
            if (writeBuffer.texture === readBuffer.texture || 
                (writeBuffer.texture && readBuffer.texture && writeBuffer.texture.uuid === readBuffer.texture.uuid)) {
              console.warn('[PostProcessingSystem] ⚠️ SSR: Feedback loop detected, skipping render')
              return
            }
          }
          
          // Validate material exists
          const material = (this.ssrPass as any).material
          if (!material) {
            console.error('[PostProcessingSystem] ❌ SSR: Material not found, skipping render')
            return
          }
          
          // CRITICAL: Validate shader program BEFORE rendering (if it exists)
          // Note: ShaderPass compiles shaders lazily on first render, so program might not exist yet
          
          // CRITICAL: Force shader compilation if material exists but program doesn't
          // This ensures program is ready before we try to use it
          if (material && !material.program) {
            // Force material to compile by setting needsUpdate
            material.needsUpdate = true
          }
          
          if (material.program && material.program.program) {
            const program = material.program.program
            const isLinked = gl.getProgramParameter(program, gl.LINK_STATUS)
            if (!isLinked) {
              // Get detailed shader compilation errors
              const vertexShader = gl.getAttachedShaders(program)?.[0]
              const fragmentShader = gl.getAttachedShaders(program)?.[1]
              
              let errorMsg = '[PostProcessingSystem] ❌ SSR shader program not linked, skipping render'
              
              if (vertexShader) {
                const vertexCompiled = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)
                if (!vertexCompiled) {
                  const vertexInfo = gl.getShaderInfoLog(vertexShader)
                  errorMsg += `\n  ❌ Vertex Shader Error:\n${vertexInfo}`
                }
              }
              
              if (fragmentShader) {
                const fragmentCompiled = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)
                if (!fragmentCompiled) {
                  const fragmentInfo = gl.getShaderInfoLog(fragmentShader)
                  errorMsg += `\n  ❌ Fragment Shader Error:\n${fragmentInfo}`
                }
              }
              
              const programInfo = gl.getProgramInfoLog(program)
              if (programInfo) {
                errorMsg += `\n  ❌ Program Link Error:\n${programInfo}`
              }
              
              console.error(errorMsg)
              
              // Disable SSR to prevent repeated errors
              if (this.config.ssr) {
                this.config.ssr.enabled = false
                console.warn('[PostProcessingSystem] ⚠️ SSR disabled due to shader linking failure')
              }
              return
            }
          }
          // If program doesn't exist yet, ShaderPass will compile it on first render
          // We'll check for errors after render
          
          // Validate buffers before proceeding
          if (!readBuffer || !readBuffer.texture) {
            console.warn('[PostProcessingSystem] ⚠️ SSR: readBuffer.texture not available, skipping render')
            return
          }
          
          // Set depth and normal textures
          if (!this.depthRenderTarget || !this.depthRenderTarget.texture) {
            console.warn('[PostProcessingSystem] ⚠️ SSR: Depth texture not available, skipping render')
            return
          }
          if (!this.normalRenderTarget || !this.normalRenderTarget.texture) {
            console.warn('[PostProcessingSystem] ⚠️ SSR: Normal texture not available, skipping render')
            return
          }
          
          const uniforms = this.ssrPass!.uniforms
          uniforms.tDepth.value = this.depthRenderTarget.texture
          uniforms.tNormal.value = this.normalRenderTarget.texture
          
          // CRITICAL: Update camera matrices right before rendering to ensure they're current
          // This prevents stale matrices if camera moved after updateSSRParameters()
          if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
            uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix)
            const projMatrix = this.camera.projectionMatrix.clone()
            uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()
            const viewMatrix = this.camera.matrixWorldInverse.clone()
            uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()
          }
          
          // CRITICAL: Explicitly set tDiffuse to readBuffer.texture BEFORE calling originalRender
          // This ensures we're reading from the correct buffer and prevents feedback loops
          // ShaderPass will also set it, but we set it first to ensure correctness
          uniforms.tDiffuse.value = readBuffer.texture
          
          // CRITICAL: Double-check tDiffuse is not pointing to writeBuffer
          if (writeBuffer && writeBuffer.texture && uniforms.tDiffuse.value === writeBuffer.texture) {
            console.error('[PostProcessingSystem] ❌ SSR: tDiffuse would point to writeBuffer, skipping render')
            if (this.config.ssr) {
              this.config.ssr.enabled = false
            }
            return
          }
          
          // Call original render - ShaderPass will compile shader on first render if needed
          // Note: ShaderPass will also set tDiffuse, but we've already set it correctly above
          try {
            originalSSRRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
            
            // CRITICAL: After render, verify tDiffuse wasn't set to writeBuffer
            // This can happen if EffectComposer's buffer swap timing is off
            if (uniforms.tDiffuse.value && writeBuffer && writeBuffer.texture) {
              if (uniforms.tDiffuse.value === writeBuffer.texture ||
                  uniforms.tDiffuse.value.uuid === writeBuffer.texture.uuid) {
                console.error('[PostProcessingSystem] ❌ SSR: tDiffuse was set to writeBuffer after render!')
                // This shouldn't happen, but if it does, disable SSR
                if (this.config.ssr) {
                  this.config.ssr.enabled = false
                }
                return
              }
            }
            
            // CRITICAL: After render, validate shader program (in case it was just compiled)
            // This catches compilation errors on first render
            if (material.program && material.program.program) {
              const program = material.program.program
              const isLinked = gl.getProgramParameter(program, gl.LINK_STATUS)
              if (!isLinked) {
                // Get detailed shader compilation errors
                const vertexShader = gl.getAttachedShaders(program)?.[0]
                const fragmentShader = gl.getAttachedShaders(program)?.[1]
                
                let errorMsg = '[PostProcessingSystem] ❌ SSR shader program not linked after render'
                
                if (vertexShader) {
                  const vertexCompiled = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)
                  if (!vertexCompiled) {
                    const vertexInfo = gl.getShaderInfoLog(vertexShader)
                    errorMsg += `\n  ❌ Vertex Shader Error:\n${vertexInfo}`
                  }
                }
                
                if (fragmentShader) {
                  const fragmentCompiled = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)
                  if (!fragmentCompiled) {
                    const fragmentInfo = gl.getShaderInfoLog(fragmentShader)
                    errorMsg += `\n  ❌ Fragment Shader Error:\n${fragmentInfo}`
                  }
                }
                
                const programInfo = gl.getProgramInfoLog(program)
                if (programInfo) {
                  errorMsg += `\n  ❌ Program Link Error:\n${programInfo}`
                }
                
                console.error(errorMsg)
                
                // Disable SSR to prevent repeated errors
                if (this.config.ssr) {
                  this.config.ssr.enabled = false
                  console.warn('[PostProcessingSystem] ⚠️ SSR disabled due to shader linking failure')
                }
                return
              }
            }
            
            // CRITICAL: Check for WebGL errors immediately after render
            // This catches errors before they accumulate
            let glError = gl.getError()
            if (glError !== gl.NO_ERROR) {
              const errorName = this.getGLErrorName(glError)
              console.error(`[PostProcessingSystem] ❌ SSR: WebGL error after render: ${errorName}`)
              
              // CRITICAL: Disable SSR immediately on ANY error to prevent error spam
              // INVALID_OPERATION usually means feedback loop or invalid program
              if (glError === gl.INVALID_OPERATION) {
                console.warn('[PostProcessingSystem] ⚠️ SSR disabled due to INVALID_OPERATION error (likely feedback loop or invalid shader)')
                if (this.config.ssr) {
                  this.config.ssr.enabled = false
                }
                return
              }
              
              // Also disable on other critical errors
              if (glError === gl.INVALID_FRAMEBUFFER_OPERATION || glError === gl.OUT_OF_MEMORY) {
                console.warn(`[PostProcessingSystem] ⚠️ SSR disabled due to ${errorName} error`)
                if (this.config.ssr) {
                  this.config.ssr.enabled = false
                }
                return
              }
            }
          } catch (error) {
            console.error('[PostProcessingSystem] ❌ SSR render exception:', error)
            
            // If this is a shader compilation error, get detailed info
            if (material.program && material.program.program) {
              const program = material.program.program
              const vertexShader = gl.getAttachedShaders(program)?.[0]
              const fragmentShader = gl.getAttachedShaders(program)?.[1]
              
              if (vertexShader) {
                const vertexCompiled = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)
                if (!vertexCompiled) {
                  const vertexInfo = gl.getShaderInfoLog(vertexShader)
                  console.error('[PostProcessingSystem] ❌ SSR Vertex Shader Error:', vertexInfo)
                }
              }
              
              if (fragmentShader) {
                const fragmentCompiled = gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)
                if (!fragmentCompiled) {
                  const fragmentInfo = gl.getShaderInfoLog(fragmentShader)
                  console.error('[PostProcessingSystem] ❌ SSR Fragment Shader Error:', fragmentInfo)
                }
              }
              
              const programInfo = gl.getProgramInfoLog(program)
              if (programInfo) {
                console.error('[PostProcessingSystem] ❌ SSR Program Link Error:', programInfo)
              }
            }
            
            // Disable SSR to prevent repeated errors
            if (this.config.ssr) {
              this.config.ssr.enabled = false
              console.warn('[PostProcessingSystem] ⚠️ SSR disabled due to render exception')
            }
          }
        }
        
        // CRITICAL: Ensure normal prepass exists and render target is created
        if (!this.normalRenderPass && this.camera) {
          this.normalRenderPass = new NormalRenderPass()
        }
        if (!this.normalRenderTarget) {
          const width = this.renderer.domElement.width || 1
          const height = this.renderer.domElement.height || 1
          this.normalRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            depthBuffer: true,
            stencilBuffer: false,
            type: THREE.UnsignedByteType,
            format: THREE.RGBAFormat
          })
        }
        
        // CRITICAL: Update parameters to connect depth and normal textures
        this.updateSSRParameters()
        // Insert after SSS if present, otherwise after render pass
        const sssIndex = this.sssPass ? this.composer.passes.indexOf(this.sssPass) : -1
        const renderPassIndex = this.composer.passes.findIndex((pass) => pass instanceof RenderPass)
        const insertIndex = sssIndex !== -1 ? sssIndex + 1 : (renderPassIndex !== -1 ? renderPassIndex + 1 : 1)
        this.composer.passes.splice(insertIndex, 0, this.ssrPass)
        
        // Log SSR pass creation with diagnostic info
        const hasDepth = !!this.ssrPass.uniforms.tDepth.value
        const hasNormal = !!this.ssrPass.uniforms.tNormal.value
        console.log('[PostProcessingSystem] ✅ SSR pass added with render override', {
          passIndex: insertIndex,
          totalPasses: this.composer.passes.length,
          hasDepthTexture: hasDepth,
          hasNormalTexture: hasNormal,
          intensity: this.ssrPass.uniforms.intensity.value,
          maxSteps: this.ssrPass.uniforms.maxSteps.value
        })
      } else if (!shouldHaveSSR && hasSSR) {
        // Remove SSR pass
        if (this.ssrPass) {
          const index = this.composer.passes.indexOf(this.ssrPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.ssrPass.dispose()
          this.ssrPass = null
        }
      } else if (hasSSR && this.ssrPass && this.config.ssr) {
        // Update SSR parameters (including depth and normal texture connection)
        // CRITICAL: Always update parameters when SSR is enabled and pass exists
        this.updateSSRParameters()
        
        // Verify textures are still connected
        const uniforms = this.ssrPass.uniforms
        if (!uniforms.tDepth.value) {
          console.warn('[PostProcessingSystem] ⚠️ SSR depth texture lost during update! Reconnecting...')
          this.updateSSRParameters() // Try again
        }
        if (!uniforms.tNormal.value) {
          console.warn('[PostProcessingSystem] ⚠️ SSR normal texture lost during update! Reconnecting...')
          this.updateSSRParameters() // Try again
        }
        
        // Verify SSR pass is in composer
        if (this.composer && !this.composer.passes.includes(this.ssrPass)) {
          console.error('[PostProcessingSystem] ❌ SSR pass exists but is NOT in composer! Re-adding...')
          const sssIndex = this.sssPass ? this.composer.passes.indexOf(this.sssPass) : -1
          const renderPassIndex = this.composer.passes.findIndex((pass) => pass instanceof RenderPass)
          const insertIndex = sssIndex !== -1 ? sssIndex + 1 : (renderPassIndex !== -1 ? renderPassIndex + 1 : 1)
          this.composer.passes.splice(insertIndex, 0, this.ssrPass)
        }
      }
    }

    // Handle Tone Mapping pass
    if (this.composer && this.config.toneMapping) {
      const shouldHaveToneMapping = this.config.enabled && this.config.toneMapping
      const hasToneMapping = this.toneMappingPass !== null
      
      if (shouldHaveToneMapping && !hasToneMapping) {
        // Add tone mapping pass
        this.toneMappingPass = new ShaderPass(ToneMappingShader)
        this.updateToneMappingParameters()
        // Insert before output pass (tone mapping comes before final output)
        const outputPassIndex = this.composer.passes.length - 1
        this.composer.passes.splice(outputPassIndex, 0, this.toneMappingPass)
      } else if (!shouldHaveToneMapping && hasToneMapping) {
        // Remove tone mapping pass
        if (this.toneMappingPass) {
          const index = this.composer.passes.indexOf(this.toneMappingPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.toneMappingPass.dispose()
          this.toneMappingPass = null
        }
      } else if (hasToneMapping && this.toneMappingPass && this.config.toneMapping) {
        // Update tone mapping parameters
        this.updateToneMappingParameters()
      }
    }

    // Handle Color Grading pass
    if (this.composer && this.config.colorGrading) {
      const shouldHaveColorGrading = this.config.enabled && this.config.colorGrading.enabled
      const hasColorGrading = this.colorGradingPass !== null
      
      if (shouldHaveColorGrading && !hasColorGrading) {
        // Add color grading pass
        this.colorGradingPass = new ShaderPass(ColorGradingShader)
        this.updateColorGradingParameters()
        // Insert after tone mapping, before output pass
        const outputPassIndex = this.composer.passes.length - 1
        this.composer.passes.splice(outputPassIndex, 0, this.colorGradingPass)
      } else if (!shouldHaveColorGrading && hasColorGrading) {
        // Remove color grading pass
        if (this.colorGradingPass) {
          const index = this.composer.passes.indexOf(this.colorGradingPass)
          if (index !== -1) {
            this.composer.passes.splice(index, 1)
          }
          this.colorGradingPass.dispose()
          this.colorGradingPass = null
        }
      } else if (hasColorGrading && this.colorGradingPass && this.config.colorGrading) {
        // Update color grading parameters
        this.updateColorGradingParameters()
      }
    }
  }

  private updateColorGradingParameters() {
    if (!this.colorGradingPass || !this.config.colorGrading) return
    
    const colorGrading = this.config.colorGrading
    const uniforms = this.colorGradingPass.uniforms
    
    // Update all color grading parameters with validation
    const exposure = Number(colorGrading.exposure)
    if (!isNaN(exposure) && isFinite(exposure)) {
      uniforms.exposure.value = Math.max(-2.0, Math.min(2.0, exposure))
    }
    
    const contrast = Number(colorGrading.contrast)
    if (!isNaN(contrast) && isFinite(contrast)) {
      uniforms.contrast.value = Math.max(-100, Math.min(100, contrast))
    }
    
    const highlights = Number(colorGrading.highlights)
    if (!isNaN(highlights) && isFinite(highlights)) {
      uniforms.highlights.value = Math.max(-100, Math.min(100, highlights))
    }
    
    const shadows = Number(colorGrading.shadows)
    if (!isNaN(shadows) && isFinite(shadows)) {
      uniforms.shadows.value = Math.max(-100, Math.min(100, shadows))
    }
    
    const whites = Number(colorGrading.whites)
    if (!isNaN(whites) && isFinite(whites)) {
      uniforms.whites.value = Math.max(-100, Math.min(100, whites))
    }
    
    const blacks = Number(colorGrading.blacks)
    if (!isNaN(blacks) && isFinite(blacks)) {
      uniforms.blacks.value = Math.max(-100, Math.min(100, blacks))
    }
    
    const hue = Number(colorGrading.hue)
    if (!isNaN(hue) && isFinite(hue)) {
      uniforms.hue.value = Math.max(-180, Math.min(180, hue))
    }
    
    const saturation = Number(colorGrading.saturation)
    if (!isNaN(saturation) && isFinite(saturation)) {
      uniforms.saturation.value = Math.max(-100, Math.min(100, saturation))
    }
    
    const vibrance = Number(colorGrading.vibrance)
    if (!isNaN(vibrance) && isFinite(vibrance)) {
      uniforms.vibrance.value = Math.max(-100, Math.min(100, vibrance))
    }
    
    const gamma = Number(colorGrading.gamma)
    if (!isNaN(gamma) && isFinite(gamma)) {
      uniforms.gamma.value = Math.max(0.1, Math.min(3.0, gamma))
    }
  }

  private updateToneMappingParameters() {
    if (!this.toneMappingPass || !this.config.toneMapping) return
    
    const toneMapping = this.config.toneMapping
    const uniforms = this.toneMappingPass.uniforms
    
    // Update exposure with validation
    const exposure = Number(toneMapping.exposure)
    if (!isNaN(exposure) && isFinite(exposure)) {
      const clampedExposure = Math.max(0.1, Math.min(5, exposure))
      uniforms.exposure.value = clampedExposure
      if (Math.abs(exposure - clampedExposure) > 0.01) {
        console.warn(`[PostProcessingSystem] ⚠️ Tone mapping exposure clamped from ${exposure} to ${clampedExposure}`)
      }
    }
    
    // Update tone mapping type
    uniforms.toneMappingType.value = this.getToneMappingTypeValue(toneMapping.type)
    
    // Update white point (for Reinhard) with validation
    const whitePoint = Number(toneMapping.whitePoint)
    if (!isNaN(whitePoint) && isFinite(whitePoint)) {
      const clampedWhitePoint = Math.max(0.5, Math.min(5, whitePoint))
      uniforms.whitePoint.value = clampedWhitePoint
      if (Math.abs(whitePoint - clampedWhitePoint) > 0.01) {
        console.warn(`[PostProcessingSystem] ⚠️ Tone mapping white point clamped from ${whitePoint} to ${clampedWhitePoint}`)
      }
    }
  }

  dispose() {
    this.restoreRendererToneMapping()
    if (this.bloomPass) {
      this.bloomPass.dispose()
    }
    if (this.lutPass) {
      this.lutPass.dispose()
    }
    if (this.anamorphicPass) {
      this.anamorphicPass.dispose()
    }
    if (this.saoPass) {
      this.saoPass.dispose()
      this.saoPass = null
    }
    if (this.sssPass) {
      this.sssPass.dispose()
    }
    if (this.depthRenderTarget) {
      this.depthRenderTarget.dispose()
    }
    if (this.normalRenderTarget) {
      this.normalRenderTarget.dispose()
    }
    if (this.ssrPass) {
      this.ssrPass.dispose()
    }
    if (this.toneMappingPass) {
      this.toneMappingPass.dispose()
    }
    if (this.colorGradingPass) {
      this.colorGradingPass.dispose()
    }
    if (this.composer) {
      this.composer.dispose()
    }
  }

  private updateSSRParameters() {
    if (!this.ssrPass || !this.config.ssr || !this.camera) return
    
    const ssr = this.config.ssr
    const uniforms = this.ssrPass.uniforms
    uniforms.intensity.value = ssr.intensity
    uniforms.thickness.value = ssr.thickness
    uniforms.maxDistance.value = ssr.maxDistance
    uniforms.maxSteps.value = ssr.maxSteps
    uniforms.maxBinarySearchSteps.value = ssr.maxBinarySearchSteps
    uniforms.roughnessFade.value = ssr.roughnessFade
    uniforms.fadeDistance.value = ssr.fadeDistance
    uniforms.fadeMargin.value = ssr.fadeMargin
    
    // Update resolution
    const width = this.renderer.domElement.width || 1
    const height = this.renderer.domElement.height || 1
    uniforms.resolution.value.set(width, height)
    
    // Update camera matrices
    if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
      uniforms.cameraNear.value = this.camera.near
      uniforms.cameraFar.value = this.camera.far
      
      // CRITICAL: Set cameraProjectionMatrix (required by shader)
      uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix)
      
      // Calculate inverse projection matrix
      const projMatrix = this.camera.projectionMatrix.clone()
      uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()
      
      // Calculate inverse view matrix
      const viewMatrix = this.camera.matrixWorldInverse.clone()
      uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()
    } else {
      uniforms.cameraNear.value = 0.1
      uniforms.cameraFar.value = 1000
      // Set default identity matrices for non-standard cameras
      uniforms.cameraProjectionMatrix.value.identity()
      uniforms.cameraProjectionMatrixInverse.value.identity()
      uniforms.cameraViewMatrixInverse.value.identity()
    }
    
    // CRITICAL: Get depth and normal textures from prepass render targets
    // Priority 1: Use depth prepass texture (most reliable)
    let depthTexture: THREE.Texture | null = null
    if (this.depthRenderTarget && this.depthRenderTarget.texture) {
      depthTexture = this.depthRenderTarget.texture
      uniforms.tDepth.value = depthTexture
      // Verify texture is valid (only warn on errors, don't log success every time)
      const image = depthTexture.image as HTMLImageElement | HTMLCanvasElement | ImageData | null
      if (image && 'width' in image && 'height' in image && (image.width === 0 || image.height === 0)) {
        console.warn('[PostProcessingSystem] ⚠️ SSR depth texture exists but has no valid image data')
      }
    }
    // Priority 2: Fallback to composer's depth texture
    else if (this.composer && (this.composer as any).readBuffer?.depthTexture) {
      depthTexture = (this.composer as any).readBuffer.depthTexture
      uniforms.tDepth.value = depthTexture
    }
    else {
      console.error('[PostProcessingSystem] ❌ SSR depth texture NOT found! SSR will not work.')
      console.error('[PostProcessingSystem] Debug info:', {
        composerExists: !!this.composer,
        depthRenderTargetExists: !!this.depthRenderTarget,
        depthRenderPassExists: !!this.depthRenderPass,
        postProcessingEnabled: this.config.enabled,
        ssrEnabled: this.config.ssr?.enabled
      })
    }
    
    // CRITICAL: Get normal texture from normal prepass
    let normalTexture: THREE.Texture | null = null
    if (this.normalRenderTarget && this.normalRenderTarget.texture) {
      normalTexture = this.normalRenderTarget.texture
      uniforms.tNormal.value = normalTexture
      // Verify texture is valid
      const image = normalTexture.image as HTMLImageElement | HTMLCanvasElement | ImageData | null
      if (image && 'width' in image && 'height' in image && (image.width === 0 || image.height === 0)) {
        console.warn('[PostProcessingSystem] ⚠️ SSR normal texture exists but has no valid image data')
      }
    } else {
      console.error('[PostProcessingSystem] ❌ SSR normal texture NOT found! SSR will not work properly.')
      console.error('[PostProcessingSystem] Debug info:', {
        normalRenderTargetExists: !!this.normalRenderTarget,
        normalRenderPassExists: !!this.normalRenderPass,
        postProcessingEnabled: this.config.enabled,
        ssrEnabled: this.config.ssr?.enabled
      })
    }
    
    // Log texture connection status (throttled to prevent console blocking)
    if (Math.random() < 0.01) { // 1% of calls
      console.log('[PostProcessingSystem] ✅ SSR textures connected:', {
        tDepth: !!uniforms.tDepth.value,
        tNormal: !!uniforms.tNormal.value,
        tDiffuse: !!uniforms.tDiffuse.value,
        hasDepthImage: !!depthTexture?.image,
        hasNormalImage: !!normalTexture?.image
      })
    }
  }
  
  /**
   * Get human-readable name for WebGL error codes
   */
  private getGLErrorName(error: number): string {
    const gl = this.renderer.getContext() as WebGLRenderingContext
    switch (error) {
      case gl.NO_ERROR: return 'NO_ERROR'
      case gl.INVALID_ENUM: return 'INVALID_ENUM'
      case gl.INVALID_VALUE: return 'INVALID_VALUE'
      case gl.INVALID_OPERATION: return 'INVALID_OPERATION'
      case gl.INVALID_FRAMEBUFFER_OPERATION: return 'INVALID_FRAMEBUFFER_OPERATION'
      case gl.OUT_OF_MEMORY: return 'OUT_OF_MEMORY'
      case gl.CONTEXT_LOST_WEBGL: return 'CONTEXT_LOST_WEBGL'
      default: return `UNKNOWN_ERROR(${error})`
    }
  }
}
