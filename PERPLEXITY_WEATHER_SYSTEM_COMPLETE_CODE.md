# Complete Weather System Code - For Perplexity Analysis

## Overview
This document contains the complete implementation of our standalone weather system, which implements atmospheric scattering, LUT-based sky rendering, volumetric clouds, and time-of-day transitions. We request Perplexity to compare this implementation with the official Streets GL documentation and provide recommendations for improvements.

**Reference Repository**: https://github.com/StrandedKitty/streets-gl

## Key Components

1. **DynamicSky.ts** - Main sky system with atmospheric scattering
2. **AtmosphereLUTSystem.ts** - LUT generation system (Transmittance, Multiple Scattering, Sky View)
3. **DynamicSkyLUTShader.ts** - LUT-based sky shader
4. **SunMoonSystem.ts** - Sun and moon positioning
5. **AtmosphericPerspective.ts** - Fog/haze system
6. **ViewerCanvas.tsx** - Integration code

---

## 1. DynamicSky.ts - Complete Implementation

```typescript
import * as THREE from 'three'
import { AtmosphereLUTSystem } from './AtmosphereLUTSystem'
import { getLUTBasedSkyFragmentShader } from './DynamicSkyLUTShader'

export interface SkyConfig {
  timeOfDay: number // 0-24 hours (deprecated, use elevation/azimuth instead)
  turbidity: number // 2-20, atmospheric clarity (lower = clearer)
  atmosphereDensity: number // 0-1, density of atmosphere (deprecated, use rayleigh instead)
  sunPosition: THREE.Vector3
  sunColor: THREE.Color
  sunSize?: number // Size multiplier for sun glow
  elevation?: number // Sun elevation angle in radians (0 = horizon, PI/2 = zenith)
  azimuth?: number // Sun azimuth angle in radians (0 = north)
  rayleigh?: number // Rayleigh scattering coefficient (default: 3)
  mieCoefficient?: number // Mie scattering coefficient (default: 0.005)
  mieDirectionalG?: number // Mie directional scattering (default: 0.7)
  exposure?: number // Exposure for tone mapping (default: 0.5)
  cloudDensity?: number // 0-1, amount of clouds (coverage for volumetric)
  windIntensity?: number // 0-1, affects cloud scrolling speed
  cloudThickness?: number // 0-1, affects opacity/volume
  cloudDetail?: number // 0-1, fine detail contribution
  cloudScale?: number // 0.5-2, controls noise scale
  cloudStorminess?: number // 0-1, darker heavier clouds
  cloudShadowStrength?: number // 0-1, self-shadow strength
  cloudColor?: THREE.Color
  quality?: 'low' | 'medium' | 'high' | 'ultra' // Performance quality preset
}

/**
 * Optimized Dynamic Sky System with Volumetric Clouds
 * Industry Best Practices:
 * - Adaptive quality based on preset (performance vs quality)
 * - Optimized raymarching with early exit and adaptive steps
 * - Cached atmospheric calculations
 * - Unified update system for better performance
 * - Temporal accumulation for smoother clouds
 */
export class DynamicSky {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer | null = null
  private skyMesh: THREE.Mesh | null = null
  private skyMaterial: THREE.ShaderMaterial | null = null
  private volumetricCloudMesh: THREE.Mesh | null = null
  private volumetricCloudMaterial: THREE.ShaderMaterial | null = null
  private config: SkyConfig
  private lastUpdateTime = performance.now()
  private cloudTime = 0
  private cameraDistance = 0
  private frameCount = 0
  private lutSystem: AtmosphereLUTSystem | null = null
  private useLUTSystem: boolean = true // Enable LUT-based rendering
  
  // Quality presets: [raymarchingSteps, noiseOctaves, shadowSamples]
  private readonly QUALITY_PRESETS = {
    low: { steps: 32, octaves: 3, shadowSamples: 1, densityMultiplier: 0.8 },
    medium: { steps: 48, octaves: 4, shadowSamples: 2, densityMultiplier: 0.9 },
    high: { steps: 64, octaves: 5, shadowSamples: 3, densityMultiplier: 1.0 },
    ultra: { steps: 96, octaves: 6, shadowSamples: 4, densityMultiplier: 1.1 }
  }

  constructor(scene: THREE.Scene, config: SkyConfig, renderer?: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer || null
    this.config = { quality: 'high', ...config }
    
    // Initialize LUT system if renderer is available
    if (this.useLUTSystem && this.renderer) {
      try {
        this.lutSystem = new AtmosphereLUTSystem(this.renderer, scene)
        // CRITICAL: Defer LUT generation to avoid WebGL shader compilation conflicts
        this.lutSystem.generateStaticLUTs()
        console.log('[DynamicSky] LUT system initialized (LUTs will be generated on next frame)')
      } catch (error) {
        console.warn('[DynamicSky] Failed to initialize LUT system, falling back to direct calculations:', error)
        this.useLUTSystem = false
      }
    }
    
    this.setupSky()
    
    // Ensure LUT texture is set after setup (in case setupSky runs before LUTs are ready)
    if (this.useLUTSystem && this.lutSystem && this.skyMaterial && this.skyMaterial.uniforms.tSkyViewLUT) {
      // CRITICAL: Defer LUT texture initialization to next frame to avoid shader conflicts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Double frame delay to ensure static LUTs are generated first
          const sunPos = this.config.sunPosition.clone().normalize()
          const cameraHeight = 0.0
          const skyViewTexture = this.lutSystem!.getSkyViewTexture(sunPos, cameraHeight)
          if (skyViewTexture && this.skyMaterial) {
            this.skyMaterial.uniforms.tSkyViewLUT.value = skyViewTexture
            console.log('[DynamicSky] LUT texture initialized after setup')
          } else {
            // If texture not ready, try again next frame
            requestAnimationFrame(() => {
              const retryTexture = this.lutSystem!.getSkyViewTexture(sunPos, cameraHeight)
              if (retryTexture && this.skyMaterial) {
                this.skyMaterial.uniforms.tSkyViewLUT.value = retryTexture
                console.log('[DynamicSky] LUT texture initialized on retry')
              }
            })
          }
        })
      })
    }
  }

  private setupSky() {
    // Create optimized sphere geometry (fewer segments for better performance)
    // IMPROVED: Much larger sky sphere (20x larger) for realistic appearance
    // At 40,000 units radius, the sky sphere is 20x larger than before (was 2000)
    // This matches the sun distance of 50,000 units for proper scale
    const geometry = new THREE.SphereGeometry(40000, 32, 32) // 20x larger (was 2000)

    // Three.js Sky shader vertex (physically-based atmospheric scattering)
    const vertexShader = `
      uniform vec3 sunPosition;
      varying vec3 vWorldPosition;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    // Choose shader based on LUT system availability
    // CRITICAL: Only use LUT shader if LUT system is ready, otherwise use direct calculation
    const useLUTShader = this.useLUTSystem && this.lutSystem && this.lutSystem.areStaticLUTsReady
    const fragmentShader = useLUTShader
      ? getLUTBasedSkyFragmentShader() // LUT-based shader (Streets GL approach)
      : `
      #ifdef USE_FOG
        #undef USE_FOG
      #endif
      precision highp float;
      
      uniform vec3 sunPosition;
      uniform float turbidity;
      uniform float rayleigh;
      uniform float mieCoefficient;
      uniform float mieDirectionalG;
      uniform float exposure;
      
      varying vec3 vWorldPosition;
      
      // Streets GL atmospheric constants (from atmosphere.glsl)
      const float PI = 3.141592653589793;
      const float groundRadiusMM = 6.360;        // Earth radius in megameters
      const float atmosphereRadiusMM = 6.460;    // Atmosphere radius in megameters
      
      // Streets GL scattering coefficients (exact match)
      const vec3 rayleighScatteringBase = vec3(5.802, 13.558, 33.1);
      const float rayleighAbsorptionBase = 0.0;
      const float mieScatteringBase = 3.996;
      const float mieAbsorptionBase = 4.4;
      const vec3 ozoneAbsorptionBase = vec3(0.650, 1.881, 0.085);
      const vec3 groundAlbedo = vec3(0.3);
      
      const vec3 up = vec3(0.0, 1.0, 0.0);
      
      // Streets GL altitude-based density functions
      vec3 getScatteringValues(vec3 pos, out vec3 rayleighScattering, out float mieScattering, out vec3 extinction) {
        float altitudeKM = (length(pos) - groundRadiusMM) * 1000.0;
        
        // Streets GL altitude-based density (exact match)
        float rayleighDensity = exp(-altitudeKM / 8.0);
        float mieDensity = exp(-altitudeKM / 1.2);
        
        rayleighScattering = rayleighScatteringBase * rayleighDensity * rayleigh;
        float rayleighAbsorption = rayleighAbsorptionBase * rayleighDensity;
        
        mieScattering = mieScatteringBase * mieDensity * mieCoefficient;
        float mieAbsorption = mieAbsorptionBase * mieDensity;
        
        // Ozone absorption (peaks at 25km altitude) - Streets GL feature
        vec3 ozoneAbsorption = ozoneAbsorptionBase * max(0.0, 1.0 - abs(altitudeKM - 25.0) / 15.0);
        
        extinction = rayleighScattering + vec3(rayleighAbsorption) + vec3(mieScattering) + vec3(mieAbsorption) + ozoneAbsorption;
      }
      
      // Streets GL phase functions
      float getMiePhase(float cosTheta) {
        const float g = mieDirectionalG;
        const float scale = 3.0 / (8.0 * PI);
        float num = (1.0 - g * g) * (1.0 + cosTheta * cosTheta);
        float denom = (2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5);
        return scale * num / denom;
      }
      
      float getRayleighPhase(float cosTheta) {
        const float k = 3.0 / (16.0 * PI);
        return k * (1.0 + cosTheta * cosTheta);
      }
      
      // Streets GL-style atmospheric scattering
      vec3 skyColorCalc(vec3 viewDir, vec3 sunDir) {
        float sunDotView = dot(sunDir, viewDir);
        float sunDotUp = dot(sunDir, up);
        
        // FIX: Sample atmosphere at multiple altitudes for vertical color gradients
        // This is critical for evening colors - different altitudes have different scattering
        vec3 viewPos = vec3(0.0, groundRadiusMM + 0.0005, 0.0);
        
        // Calculate view direction altitude for vertical gradient
        float viewDotUp = dot(viewDir, up);
        float viewAltitude = clamp(viewDotUp, -1.0, 1.0); // -1 (below) to 1 (above)
        
        // Sample at altitude-dependent distance for vertical color variation
        // Near horizon: sample closer (more scattering, warmer)
        // At zenith: sample further (less scattering, cooler)
        float altitudeFactor = 1.0 - abs(viewAltitude) * 0.5; // 1.0 at horizon, 0.5 at zenith
        float sampleDistance = 0.05 + altitudeFactor * 0.15; // 0.05-0.2 range
        vec3 pos = viewPos + viewDir * sampleDistance;
        
        // Get scattering values using Streets GL altitude-based density
        vec3 rayleighScattering;
        float mieScattering;
        vec3 extinction;
        getScatteringValues(pos, rayleighScattering, mieScattering, extinction);
        
        // Phase functions
        // FIX: Use negative sign to match Streets GL convention (view direction vs light direction)
        float rayleighPhase = getRayleighPhase(-sunDotView); // Negative sign matches Streets GL
        float miePhase = getMiePhase(sunDotView);
        
        // Optical depth approximation (simplified for sky dome)
        float sunAngle = clamp(sunDotUp, 0.0, 1.0);
        float viewAngle = clamp(viewDotUp, 0.0, 1.0);
        
        float sunZenithAngle = acos(sunAngle);
        float viewZenithAngle = acos(viewAngle);
        
        // Streets GL optical depth approximation
        float sunAngleFactor = 1.0 / (cos(sunZenithAngle) + 0.15 * pow(93.885 - sunZenithAngle * 180.0 / PI, -1.253));
        float viewAngleFactor = 1.0 / (cos(viewZenithAngle) + 0.15 * pow(93.885 - viewZenithAngle * 180.0 / PI, -1.253));
        
        // FIX: Improve optical depth calculation for sunset (longer path through atmosphere)
        // At sunset, light travels through more atmosphere, so we need to increase path length
        float sunElevationFactor = max(0.1, sunDotUp); // Prevent division by zero
        float pathLengthMultiplier = 1.0 / max(0.1, sunElevationFactor); // Longer path at sunset
        
        // Optical depth with path length multiplier for sunset
        vec3 opticalDepthR = rayleighScattering * (sunAngleFactor + viewAngleFactor) * pathLengthMultiplier;
        vec3 opticalDepthM = vec3(mieScattering) * (sunAngleFactor + viewAngleFactor) * turbidity * pathLengthMultiplier;
        
        // Transmittance
        vec3 transmittance = exp(-(opticalDepthR + opticalDepthM));
        
        // Inscatter (Streets GL style)
        vec3 inscatter = (rayleighScattering * rayleighPhase + vec3(mieScattering) * miePhase) * sunAngleFactor * transmittance;
        
        // FIX: Improved multiple scattering approximation for better evening colors
        // Multiple scattering accounts for light that has scattered multiple times
        // IMPROVED: Increase approximation factor and add altitude-dependent scaling
        float horizonFactor = 1.0 - clamp(viewDotUp, 0.0, 1.0); // 1.0 at horizon, 0.0 at zenith
        float multipleScatteringFactor = 0.25 + 0.15 * horizonFactor; // 0.25-0.4 range
        vec3 multipleScatteringApprox = rayleighScattering * multipleScatteringFactor * (1.0 - transmittance);
        inscatter += multipleScatteringApprox;
        
        // Sun disk - IMPROVED: Much larger sun disk for realistic appearance
        float sunDisk = smoothstep(0.995, 1.0, sunDotView); // Wider range for larger sun
        vec3 sunColor = vec3(2.0) * sunDisk; // Brighter sun
        
        // Final color
        vec3 color = inscatter + sunColor;
        
        // FIX: Add vertical color gradient for evening (darker at bottom, brighter at top)
        // Vertical gradient factor: 0.0 at horizon (bottom), 1.0 at zenith (top)
        float verticalGradient = clamp((viewAltitude + 1.0) * 0.5, 0.0, 1.0);
        
        // Apply gradient more strongly during evening (low sun)
        float sunElevation = dot(sunDir, up);
        float eveningFactor = 1.0 - clamp((sunElevation + 0.1) / 0.4, 0.0, 1.0); // Strong at sunset
        
        if (eveningFactor > 0.1) {
          // Evening: enhance vertical gradient
          float gradientStrength = 0.3 * eveningFactor;
          
          // Warmer colors at horizon (more red/orange)
          vec3 horizonColor = vec3(1.2, 0.9, 0.7); // Warm orange-red
          vec3 zenithColor = vec3(0.8, 0.9, 1.1); // Cool blue
          
          // Blend based on vertical position
          vec3 gradientColor = mix(horizonColor, zenithColor, verticalGradient);
          color = mix(color, color * gradientColor, gradientStrength);
        }
        
        // Tone mapping with exposure (higher exposure = brighter sky)
        color = vec3(1.0) - exp(-color * max(exposure, 0.5));
        
        // Ensure minimum sky brightness (prevent pure black) - only for very dark scenes
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        if (luminance < 0.05) {
          float minBrightness = 0.05;
          color = max(color, vec3(minBrightness * 0.3, minBrightness * 0.5, minBrightness * 0.7)); // Slight blue tint
        }
        
        return color;
      }
      
      void main() {
          vec3 viewDir = normalize(vWorldPosition);
          vec3 sunDir = normalize(sunPosition);
          
          // Get sky color using Preetham model
          vec3 color = skyColorCalc(viewDir, sunDir);
          
          // Calculate sun elevation to determine time of day
          float sunDotUp = dot(sunDir, vec3(0.0, 1.0, 0.0));
          float sunElevation = sunDotUp; // -1 to 1, negative = below horizon
          
          // Only apply minimum brightness clamping during nighttime/twilight
          if (sunElevation < -0.1) {
            // Nighttime (sun well below horizon) - apply minimum to prevent pure black
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            float minLuminance = 0.06; // Very dark but visible
            vec3 minColor = vec3(0.02, 0.03, 0.05); // Dark blue
            
            if (luminance < minLuminance) {
              float darkFactor = 1.0 - (luminance / minLuminance);
              color = mix(color, minColor, darkFactor * 0.5); // Gentle blend
            }
            
            // Absolute minimum for night
            vec3 absoluteMin = vec3(0.01, 0.015, 0.025);
            color = max(color, absoluteMin);
          } else if (sunElevation < 0.1 && sunElevation > -0.1) {
            // Twilight (sun near horizon) - preserve natural sunset colors
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            if (luminance < 0.06) {
              vec3 minColor = vec3(0.03, 0.04, 0.06); // Darker, less blue
              color = mix(color, minColor, 0.2); // Less aggressive blending
            }
          }
          
          // Calculate sun brightness for alpha (only sun area is opaque, rest is transparent)
          float sunDotView = dot(viewDir, sunDir);
          float sunBrightness = smoothstep(0.995, 1.0, sunDotView); // Wider range for larger sun
          float alpha = sunBrightness;
          
          gl_FragColor = vec4(color, alpha);
        }
    `

    // Calculate sun position from elevation/azimuth if provided, otherwise use sunPosition
    let sunPos = this.config.sunPosition.clone()
    if (this.config.elevation !== undefined && this.config.azimuth !== undefined) {
      const elevation = this.config.elevation
      const azimuth = this.config.azimuth
      sunPos.set(
        Math.cos(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(azimuth) * Math.cos(elevation)
      ).multiplyScalar(50000) // Scale to much larger sky sphere radius (50x further, was 1000)
    }
    
    // Create uniforms based on shader type
    let uniforms: any
    
    if (this.useLUTSystem && this.lutSystem) {
      // Create a placeholder texture (1x1 white) to prevent shader errors
      const placeholderTexture = new THREE.DataTexture(
        new Uint8Array([255, 255, 255, 255]),
        1,
        1,
        THREE.RGBAFormat
      )
      placeholderTexture.needsUpdate = true
      
      // LUT-based uniforms
      uniforms = {
        tSkyViewLUT: { value: placeholderTexture }, // Placeholder until LUT is ready
        sunPosition: { value: sunPos },
        exposure: { value: this.config.exposure ?? 1.0 },
        cameraHeight: { value: 0.0 } // Will be updated
      }
    } else {
      // Direct calculation uniforms
      uniforms = {
        sunPosition: { value: sunPos },
        turbidity: { value: this.config.turbidity ?? 10.0 },
        rayleigh: { value: this.config.rayleigh ?? 1.2 },
        mieCoefficient: { value: this.config.mieCoefficient ?? 0.8 },
        mieDirectionalG: { value: this.config.mieDirectionalG ?? 0.8 },
        exposure: { value: this.config.exposure ?? 1.0 }
      }
    }

    // Add fog uniforms to the uniforms object BEFORE creating the material
    if (!uniforms.fogColor) {
      uniforms.fogColor = { value: new THREE.Color(0xffffff) }
      uniforms.fogDensity = { value: 0.0 }
      uniforms.fogNear = { value: 1.0 }
      uniforms.fogFar = { value: 2000.0 }
      uniforms.fogExp2 = { value: 0.0 }
    }
    
    try {
      this.skyMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        side: THREE.BackSide, // Render inside of sphere (sky dome)
        transparent: true, // Enable transparency for sun-only visibility
        depthWrite: false,
        depthTest: false,
        fog: false, // Sky doesn't use fog
        defines: {
          USE_FOG: false,
          FOG_EXP2: false,
          FOG_EXP: false
        }
      })
      
      this.skyMaterial.name = 'DynamicSky'
    } catch (error) {
      console.error('[DynamicSky] Failed to create sky shader material:', error)
      throw error
    }

    this.skyMesh = new THREE.Mesh(geometry, this.skyMaterial)
    this.skyMesh.name = 'Dynamic Sky'
    this.skyMesh.userData.isDynamicSky = true
    this.skyMesh.userData.isModel = true
    this.skyMesh.userData.isImportedModel = true
    this.skyMesh.userData.isLocked = true
    this.skyMesh.renderOrder = -999
    this.skyMesh.frustumCulled = false
    this.skyMesh.visible = true
    this.scene.add(this.skyMesh)
    
    // Initialize LUT texture immediately if using LUT system
    if (this.useLUTSystem && this.lutSystem && this.skyMaterial.uniforms.tSkyViewLUT) {
      const sunPos = this.config.sunPosition.clone().normalize()
      const cameraHeight = 0.0
      const skyViewTexture = this.lutSystem.getSkyViewTexture(sunPos, cameraHeight)
      if (skyViewTexture) {
        this.skyMaterial.uniforms.tSkyViewLUT.value = skyViewTexture
        console.log('[DynamicSky] Initial LUT texture set')
      }
    }

    // Setup volumetric clouds with quality-based optimization
    this.setupVolumetricClouds()
  }

  // ... (setupVolumetricClouds method - see full file for cloud shader implementation)

  update(config: Partial<SkyConfig> | THREE.Camera) {
    // If called with camera, update position and animation
    if (config instanceof THREE.Camera) {
      if (this.skyMesh) {
        this.skyMesh.position.copy(config.position)
      }
      if (this.volumetricCloudMesh) {
        this.volumetricCloudMesh.position.set(config.position.x, 0, config.position.z)
        this.cameraDistance = config.position.length()
      }
      
      // Advance time for cloud animation
      const now = performance.now()
      const dt = Math.min(0.05, (now - this.lastUpdateTime) / 1000)
      this.lastUpdateTime = now
      this.cloudTime += dt
      this.frameCount++
      
      // Update cloud time uniform
      if (this.volumetricCloudMaterial && this.volumetricCloudMaterial.uniforms) {
        this.volumetricCloudMaterial.uniforms.iTime.value = this.cloudTime
        this.volumetricCloudMaterial.uniforms.cameraDistance.value = this.cameraDistance
      }
      
      return
    }
    
    // Otherwise update material uniforms
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...config }
    
    // Update sky dome uniforms
    if (this.skyMaterial && this.skyMaterial.uniforms) {
      // CRITICAL: Use provided sunPosition directly if available
      let sunPos = this.config.sunPosition.clone()
      if (config.sunPosition === undefined && this.config.elevation !== undefined && this.config.azimuth !== undefined) {
        const elevation = this.config.elevation
        const azimuth = this.config.azimuth
        sunPos.set(
          Math.cos(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.sin(azimuth) * Math.cos(elevation)
        )
        sunPos.normalize().multiplyScalar(50000) // Much further away (was 1000) - 50x further
      } else {
        if (sunPos.length() < 1000) {
          sunPos.normalize().multiplyScalar(50000) // Much further away (was 1000) - 50x further
        } else {
          sunPos.normalize().multiplyScalar(50000) // Much further away (was 1000) - 50x further
        }
      }
      
      // Check if using LUT system
      if (this.useLUTSystem && this.lutSystem && this.skyMaterial.uniforms.tSkyViewLUT) {
        // LUT-based: Update Sky View LUT and sample texture
        // FIX: Update every frame for smoother transitions (matches official Streets GL)
        const updateEveryFrame = true // Match official Streets GL behavior
        const sunDir = sunPos.clone().normalize()
        const cameraHeight = 0.0 // Could be updated from camera position
        const skyViewTexture = this.lutSystem.getSkyViewTexture(sunDir, cameraHeight, updateEveryFrame)
        
        if (skyViewTexture) {
          const oldTexture = this.skyMaterial.uniforms.tSkyViewLUT.value
          this.skyMaterial.uniforms.tSkyViewLUT.value = skyViewTexture
          
          // Debug: Log texture update
          if (oldTexture !== skyViewTexture) {
            const image = skyViewTexture.image as any
            console.log('[DynamicSky] LUT texture updated:', {
              hasTexture: !!skyViewTexture,
              textureWidth: image?.width,
              textureHeight: image?.height,
              sunDir: sunDir,
              exposure: this.config.exposure ?? 1.0
            })
          }
        }
        this.skyMaterial.uniforms.sunPosition.value = sunPos
        if (this.skyMaterial.uniforms.exposure) {
          this.skyMaterial.uniforms.exposure.value = this.config.exposure ?? 1.0
        }
        if (this.skyMaterial.uniforms.cameraHeight) {
          this.skyMaterial.uniforms.cameraHeight.value = cameraHeight / 1e6 // Convert to megameters
        }
      } else {
        // Direct calculation: Update all uniforms
        this.skyMaterial.uniforms.sunPosition.value = sunPos
        if (this.skyMaterial.uniforms.turbidity) {
          this.skyMaterial.uniforms.turbidity.value = this.config.turbidity
        }
        const rayleighValue = this.config.rayleigh ?? (this.config.atmosphereDensity ? this.config.atmosphereDensity * 3.0 : 2.869)
        if (this.skyMaterial.uniforms.rayleigh) {
          this.skyMaterial.uniforms.rayleigh.value = rayleighValue
        }
        const mieValue = this.config.mieCoefficient ?? (this.config.atmosphereDensity ? this.config.atmosphereDensity * 0.01 : 0.008)
        if (this.skyMaterial.uniforms.mieCoefficient) {
          this.skyMaterial.uniforms.mieCoefficient.value = mieValue
        }
        if (this.skyMaterial.uniforms.mieDirectionalG) {
          this.skyMaterial.uniforms.mieDirectionalG.value = this.config.mieDirectionalG ?? 0.7
        }
        if (this.skyMaterial.uniforms.exposure) {
          this.skyMaterial.uniforms.exposure.value = this.config.exposure ?? 0.0905
        }
      }
    }

    // Update volumetric clouds
    // ... (cloud update code)
  }

  destroy() {
    // Dispose LUT system
    if (this.lutSystem) {
      this.lutSystem.dispose()
      this.lutSystem = null
    }
    if (this.skyMesh) {
      this.scene.remove(this.skyMesh)
      this.skyMesh.geometry.dispose()
      this.skyMesh = null
    }
    if (this.skyMaterial) {
      this.skyMaterial.dispose()
      this.skyMaterial = null
    }
    if (this.volumetricCloudMesh) {
      this.scene.remove(this.volumetricCloudMesh)
      this.volumetricCloudMesh.geometry.dispose()
      this.volumetricCloudMesh = null
    }
    if (this.volumetricCloudMaterial) {
      this.volumetricCloudMaterial.dispose()
      this.volumetricCloudMaterial = null
    }
  }
}
```

---

## 2. AtmosphereLUTSystem.ts - Complete Implementation

```typescript
import * as THREE from 'three'

/**
 * Atmosphere LUT System
 * Implements Streets GL's LUT-based atmospheric scattering system
 * Uses precomputed Look-Up Tables for accurate and performant sky rendering
 */

export interface AtmosphereLUTConfig {
  transmittanceSize?: { width: number; height: number }
  multipleScatteringSize?: { width: number; height: number }
  skyViewSize?: { width: number; height: number }
  numScatteringSteps?: number
  numTransmittanceSteps?: number
  numMultipleScatteringSteps?: number
  sqrtSamples?: number
}

export class AtmosphereLUTSystem {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private config: Required<AtmosphereLUTConfig>
  
  // LUT Textures
  private transmittanceLUT: THREE.WebGLRenderTarget | null = null
  private multipleScatteringLUT: THREE.WebGLRenderTarget | null = null
  private skyViewLUT: THREE.WebGLRenderTarget | null = null
  
  // Materials
  private transmittanceMaterial: THREE.ShaderMaterial | null = null
  private multipleScatteringMaterial: THREE.ShaderMaterial | null = null
  private skyViewMaterial: THREE.ShaderMaterial | null = null
  
  // Fullscreen quad for rendering
  private fullscreenQuad: THREE.Mesh | null = null
  
  // State
  private staticLUTsReady: boolean = false
  private lastSunDirection: THREE.Vector3 | null = null
  private lastCameraHeight: number | null = null
  
  // Public getter to check if static LUTs are ready
  public get areStaticLUTsReady(): boolean {
    return this.staticLUTsReady
  }

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, config?: AtmosphereLUTConfig) {
    this.renderer = renderer
    this.scene = scene
    
    this.config = {
      transmittanceSize: config?.transmittanceSize || { width: 256, height: 64 },
      multipleScatteringSize: config?.multipleScatteringSize || { width: 256, height: 64 },
      skyViewSize: config?.skyViewSize || { width: 512, height: 512 },
      numScatteringSteps: config?.numScatteringSteps || 32,
      numTransmittanceSteps: config?.numTransmittanceSteps || 40,
      numMultipleScatteringSteps: config?.numMultipleScatteringSteps || 20,
      sqrtSamples: config?.sqrtSamples || 8
    }
    
    // Create orthographic camera for fullscreen rendering
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    
    this.init()
  }

  private init() {
    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.fullscreenQuad = new THREE.Mesh(geometry)
    this.fullscreenQuad.visible = false
    
    // Create LUT render targets
    this.transmittanceLUT = new THREE.WebGLRenderTarget(
      this.config.transmittanceSize.width,
      this.config.transmittanceSize.height,
      {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        generateMipmaps: false
      }
    )
    
    this.multipleScatteringLUT = new THREE.WebGLRenderTarget(
      this.config.multipleScatteringSize.width,
      this.config.multipleScatteringSize.height,
      {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        generateMipmaps: false
      }
    )
    
    this.skyViewLUT = new THREE.WebGLRenderTarget(
      this.config.skyViewSize.width,
      this.config.skyViewSize.height,
      {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        generateMipmaps: false
      }
    )
    
    // Create materials
    this.createTransmittanceMaterial()
    this.createMultipleScatteringMaterial()
    this.createSkyViewMaterial()
    
    console.log('[AtmosphereLUTSystem] Initialized LUT system')
  }

  private createTransmittanceMaterial() {
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `
    
    const fragmentShader = `
      precision highp float;
      
      ${this.getAtmosphereChunk()}
      
      uniform float numSteps;
      
      vec3 getSunTransmittance(vec3 pos, vec3 sunDir) {
        if (rayIntersectSphere(pos, sunDir, groundRadiusMM) > 0.0) {
          return vec3(0.0);
        }
        
        float atmoDist = rayIntersectSphere(pos, sunDir, atmosphereRadiusMM);
        float t = 0.0;
        
        vec3 transmittance = vec3(1.0);
        for (float i = 0.0; i < numSteps; i += 1.0) {
          float newT = ((i + 0.3) / numSteps) * atmoDist;
          float dt = newT - t;
          t = newT;
          
          vec3 newPos = pos + t * sunDir;
          
          vec3 rayleighScattering, extinction;
          float mieScattering;
          getScatteringValues(newPos, rayleighScattering, mieScattering, extinction);
          
          transmittance *= exp(-dt * extinction);
        }
        
        return transmittance;
      }
      
      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(${this.config.transmittanceSize.width}.0, ${this.config.transmittanceSize.height}.0);
        
        float sunCosTheta = 2.0 * uv.x - 1.0;
        float sunTheta = safeacos(sunCosTheta);
        float height = mix(groundRadiusMM, atmosphereRadiusMM, uv.y);
        
        vec3 pos = vec3(0.0, height, 0.0);
        vec3 sunDir = normalize(vec3(0.0, sunCosTheta, -sin(sunTheta)));
        
        vec3 transmittance = getSunTransmittance(pos, sunDir);
        gl_FragColor = vec4(transmittance, 1.0);
      }
    `
    
    this.transmittanceMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        numSteps: { value: this.config.numTransmittanceSteps }
      }
    })
  }

  private createMultipleScatteringMaterial() {
    // ... (see full file for complete implementation)
    // Key features:
    // - Uses Transmittance LUT for sun transmittance lookup
    // - Samples multiple directions for multiple scattering
    // - Calculates lumTotal and f_ms for multiple scattering approximation
    // - Outputs psi = lum / (1.0 - f_ms)
  }

  private createSkyViewMaterial() {
    // ... (see full file for complete implementation)
    // Key features:
    // - Uses both Transmittance and Multiple Scattering LUTs
    // - Raymarches scattering along view direction
    // - Non-linear UV mapping for altitude (Streets GL style)
    // - Returns vec4(lum, transmittance)
  }

  private getAtmosphereChunk(): string {
    return `
      #define PI 3.141592653589793
      
      const float groundRadiusMM = 6.360;
      const float atmosphereRadiusMM = 6.460;
      
      const vec3 rayleighScatteringBase = vec3(5.802, 13.558, 33.1);
      const float rayleighAbsorptionBase = 0.0;
      const float mieScatteringBase = 3.996;
      const float mieAbsorptionBase = 4.4;
      const vec3 ozoneAbsorptionBase = vec3(0.650, 1.881, 0.085);
      const vec3 groundAlbedo = vec3(0.3);
      const vec3 viewPos = vec3(0.0, groundRadiusMM + 0.0005, 0.0);
      
      float rayIntersectSphere(vec3 ro, vec3 rd, float rad) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - rad*rad;
        if (c > 0.0 && b > 0.0) return -1.0;
        float discr = b*b - c;
        if (discr < 0.0) return -1.0;
        if (discr > b*b) return (-b + sqrt(discr));
        return -b - sqrt(discr);
      }
      
      void getScatteringValues(vec3 pos, out vec3 rayleighScattering, out float mieScattering, out vec3 extinction) {
        float altitudeKM = (length(pos) - groundRadiusMM) * 1000.0;
        float rayleighDensity = exp(-altitudeKM/8.0);
        float mieDensity = exp(-altitudeKM/1.2);
        
        rayleighScattering = rayleighScatteringBase * rayleighDensity;
        float rayleighAbsorption = rayleighAbsorptionBase * rayleighDensity;
        
        mieScattering = mieScatteringBase * mieDensity;
        float mieAbsorption = mieAbsorptionBase * mieDensity;
        
        vec3 ozoneAbsorption = ozoneAbsorptionBase * max(0.0, 1.0 - abs(altitudeKM - 25.0) / 15.0);
        
        extinction = rayleighScattering + vec3(rayleighAbsorption) + vec3(mieScattering) + vec3(mieAbsorption) + ozoneAbsorption;
      }
      
      float safeacos(const float x) {
        return acos(clamp(x, -1.0, 1.0));
      }
      
      float getMiePhase(float cosTheta) {
        const float g = 0.8;
        const float scale = 3.0/(8.0*PI);
        float num = (1.0-g*g)*(1.0+cosTheta*cosTheta);
        float denom = (2.0+g*g)*pow((1.0 + g*g - 2.0*g*cosTheta), 1.5);
        return scale*num/denom;
      }
      
      float getRayleighPhase(float cosTheta) {
        const float k = 3.0/(16.0*PI);
        return k*(1.0+cosTheta*cosTheta);
      }
    `
  }

  /**
   * Generate static LUTs (Transmittance and Multiple Scattering)
   * These only need to be generated once
   * CRITICAL: Defer to next frame to avoid WebGL shader compilation conflicts
   */
  public generateStaticLUTs() {
    if (this.staticLUTsReady) return
    
    // CRITICAL: Defer LUT generation to next frame to avoid WebGL shader compilation conflicts
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._generateStaticLUTsSync()
      })
    })
  }

  private _generateStaticLUTsSync() {
    if (this.staticLUTsReady) return
    
    console.log('[AtmosphereLUTSystem] Generating static LUTs...')
    
    // Generate Transmittance LUT
    if (this.transmittanceMaterial && this.fullscreenQuad) {
      this.fullscreenQuad.material = this.transmittanceMaterial
      const oldRenderTarget = this.renderer.getRenderTarget()
      this.renderer.setRenderTarget(this.transmittanceLUT)
      this.renderer.render(this.fullscreenQuad, this.camera)
      this.renderer.setRenderTarget(oldRenderTarget)
    }
    
    // Generate Multiple Scattering LUT (depends on Transmittance LUT)
    if (this.multipleScatteringMaterial && this.transmittanceLUT && this.fullscreenQuad) {
      this.multipleScatteringMaterial.uniforms.tTransmittanceLUT.value = this.transmittanceLUT.texture
      this.fullscreenQuad.material = this.multipleScatteringMaterial
      const oldRenderTarget = this.renderer.getRenderTarget()
      this.renderer.setRenderTarget(this.multipleScatteringLUT)
      this.renderer.render(this.fullscreenQuad, this.camera)
      this.renderer.setRenderTarget(oldRenderTarget)
    }
    
    this.staticLUTsReady = true
    console.log('[AtmosphereLUTSystem] ✅ Static LUTs generated')
  }

  /**
   * Generate Sky View LUT (needs to be updated when sun direction or camera height changes)
   * IMPROVED: Added forceUpdate parameter to allow frame-based updates
   */
  public generateSkyViewLUT(sunDirection: THREE.Vector3, cameraHeight: number = 0.0, forceUpdate: boolean = false): THREE.Texture | null {
    // Check if we need to regenerate
    const needsUpdate = forceUpdate ||
      !this.lastSunDirection ||
      !this.lastSunDirection.equals(sunDirection) ||
      this.lastCameraHeight !== cameraHeight
    
    if (!needsUpdate && this.skyViewLUT) {
      return this.skyViewLUT.texture
    }
    
    // Ensure static LUTs are ready first
    if (!this.staticLUTsReady) {
      this.generateStaticLUTs()
      // Defer Sky View LUT generation with multiple frame delay
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this._generateSkyViewLUTSync(sunDirection, cameraHeight)
          })
        })
      })
      return null
    }
    
    return this._generateSkyViewLUTSync(sunDirection, cameraHeight)
  }

  private _generateSkyViewLUTSync(sunDirection: THREE.Vector3, cameraHeight: number = 0.0): THREE.Texture | null {
    if (!this.skyViewMaterial || !this.transmittanceLUT || !this.multipleScatteringLUT || !this.fullscreenQuad) {
      return null
    }
    
    // Update uniforms
    this.skyViewMaterial.uniforms.tTransmittanceLUT.value = this.transmittanceLUT.texture
    this.skyViewMaterial.uniforms.tMultipleScatteringLUT.value = this.multipleScatteringLUT.texture
    this.skyViewMaterial.uniforms.sunDirection.value.copy(sunDirection)
    this.skyViewMaterial.uniforms.cameraHeight.value = cameraHeight / 1e6 // Convert to megameters
    
    // Render Sky View LUT
    this.fullscreenQuad.material = this.skyViewMaterial
    const oldRenderTarget = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(this.skyViewLUT)
    this.renderer.render(this.fullscreenQuad, this.camera)
    this.renderer.setRenderTarget(oldRenderTarget)
    
    this.lastSunDirection = sunDirection.clone()
    this.lastCameraHeight = cameraHeight
    
    return this.skyViewLUT?.texture || null
  }

  public getSkyViewTexture(sunDirection: THREE.Vector3, cameraHeight: number = 0.0, forceUpdate: boolean = false): THREE.Texture | null {
    return this.generateSkyViewLUT(sunDirection, cameraHeight, forceUpdate)
  }

  public dispose() {
    // Cleanup all resources
    // ... (dispose implementation)
  }
}
```

---

## 3. DynamicSkyLUTShader.ts

```typescript
/**
 * LUT-based sky shader for DynamicSky
 * Samples from precomputed Sky View LUT (Streets GL approach)
 */

export const getLUTBasedSkyFragmentShader = (): string => {
  return `
    #ifdef USE_FOG
      #undef USE_FOG
    #endif
    precision highp float;
    
    uniform sampler2D tSkyViewLUT;
    uniform vec3 sunPosition;
    uniform float exposure;
    uniform float cameraHeight;
    
    varying vec3 vWorldPosition;
    
    const float PI = 3.141592653589793;
    const float groundRadiusMM = 6.360;
    const float atmosphereRadiusMM = 6.460;
    const vec3 viewPos = vec3(0.0, groundRadiusMM + 0.0005, 0.0);
    
    float safeacos(const float x) {
      return acos(clamp(x, -1.0, 1.0));
    }
    
    void main() {
      vec3 viewDir = normalize(vWorldPosition);
      
      // Convert view direction to UV coordinates matching Streets GL's Sky View LUT
      // Non-linear mapping (same as Streets GL)
      float azimuthAngle = atan(viewDir.z, viewDir.x);
      float uvX = azimuthAngle / (2.0 * PI) + 0.5;
      
      // Calculate altitude angle
      float height = groundRadiusMM + cameraHeight;
      float horizonAngle = safeacos(sqrt(height * height - groundRadiusMM * groundRadiusMM) / height) - 0.5 * PI;
      float altitudeAngle = asin(viewDir.y) - horizonAngle;
      
      // Non-linear mapping for altitude (Streets GL style)
      float adjV;
      if (altitudeAngle < 0.0) {
        float coord = -altitudeAngle / (0.5 * PI);
        adjV = 0.5 - coord * coord * 0.5; // Below horizon
      } else {
        float coord = altitudeAngle / (0.5 * PI);
        adjV = 0.5 + coord * coord * 0.5; // Above horizon
      }
      
      vec2 uv = vec2(uvX, adjV);
      
      // Sample from Sky View LUT (RGB = sky color, A = transmittance)
      vec4 lutSample = texture2D(tSkyViewLUT, uv);
      vec3 color = lutSample.rgb;
      
      // Apply exposure
      color = vec3(1.0) - exp(-color * max(exposure, 0.5));
      
      // Sun disk (add bright spot for sun)
      vec3 sunDir = normalize(sunPosition);
      float sunDotView = dot(sunDir, viewDir);
      float sunDisk = smoothstep(0.995, 1.0, sunDotView); // Wider range for larger sun
      color += vec3(sunDisk * 3.0); // Brighter sun
      
      // Calculate sun brightness for alpha
      float sunBrightness = smoothstep(0.995, 1.0, sunDotView);
      float alpha = sunBrightness;
      
      gl_FragColor = vec4(color, alpha);
    }
  `
}
```

---

## 4. Integration Code from ViewerCanvas.tsx

```typescript
// Update dynamic sky with new sun position and time of day
if (viewerRef.current.dynamicSky) {
  const currentStore = useAppStore.getState()
  
  // CRITICAL: For standalone weather, use the same sunPosition as CSM and sun mesh
  let finalSunPosition = sunPosition // Use same normalized direction as CSM and sun mesh
  
  const { elevation, azimuth } = timeOfDayToSkyAngles(timeOfDay, currentStore.northOffset)
  
  // FIX: Calculate exposure dynamically based on sun elevation for realistic time-of-day transitions
  const sunElevationDeg = THREE.MathUtils.radToDeg(elevation)
  let calculatedExposure = currentStore.skyExposure
  if (!currentStore.skyExposure || currentStore.skyExposure === 0.68) {
    if (sunElevationDeg < 0) {
      calculatedExposure = 0.15 // Night: very low exposure
    } else if (sunElevationDeg < 10) {
      calculatedExposure = 0.3 + 0.2 * (sunElevationDeg / 10) // Sunrise/sunset: 0.3-0.5
    } else if (sunElevationDeg < 45) {
      calculatedExposure = 0.5 + 0.3 * ((sunElevationDeg - 10) / 35) // Morning/evening: 0.5-0.8
    } else {
      calculatedExposure = 0.8 + 0.4 * Math.min(1, (sunElevationDeg - 45) / 45) // Day: 0.8-1.2
    }
  }
  
  // FIX: Improved turbidity and mie coefficient adjustments for better evening colors
  let calculatedTurbidity = currentStore.skyTurbidity || 10.0
  let calculatedMieCoefficient = currentStore.skyMieCoefficient || 0.005
  if (sunElevationDeg < 10 && sunElevationDeg > -5) {
    // Sunrise/sunset: increase turbidity and mie for more atmospheric scattering
    const sunsetFactor = 1.0 - Math.max(0, sunElevationDeg / 10)
    calculatedTurbidity = 10.0 + 10.0 * sunsetFactor // More haze at sunset (10-20 range)
    calculatedMieCoefficient = 0.005 + 0.015 * sunsetFactor // More mie scattering (0.005-0.02)
  }
  
  viewerRef.current.dynamicSky.update({
    timeOfDay: timeOfDay,
    sunPosition: finalSunPosition,
    elevation: elevation,
    azimuth: azimuth,
    turbidity: calculatedTurbidity,
    rayleigh: currentStore.skyRayleigh || 2.0,
    mieCoefficient: calculatedMieCoefficient,
    mieDirectionalG: currentStore.skyMieDirectionalG || 0.8,
    exposure: calculatedExposure,
    cloudDensity: currentStore.cloudDensity || 0.0,
    // ... other cloud parameters
  })
  
  // Update atmospheric perspective (fog/haze) to match sky color
  if (viewerRef.current.atmosphericPerspective) {
    const sunElevation = elevation
    let fogColor = '#87ceeb' // Default sky blue
    
    if (sunElevation < 0.1) {
      fogColor = '#ff8c42' // Sunrise/sunset - orange/red fog
    } else if (sunElevation < 0.3) {
      fogColor = '#ffb347' // Early morning/evening - orange-yellow fog
    } else if (sunElevation < 0.5) {
      fogColor = '#87ceeb' // Morning/afternoon - light blue fog
    } else {
      fogColor = '#5dade2' // Midday - bright blue fog
    }
    
    viewerRef.current.atmosphericPerspective.update({
      color: fogColor,
      density: currentStore.fogDensity || 0.3
    })
  }
}
```

---

## Key Features Implemented

1. **LUT-Based Atmospheric Scattering**
   - Transmittance LUT (256x64)
   - Multiple Scattering LUT (256x64)
   - Sky View LUT (512x512, updated every frame)

2. **Direct Calculation Fallback**
   - Falls back to direct calculation when LUTs aren't ready
   - Uses Streets GL atmospheric constants and formulas

3. **Evening Color Improvements**
   - Vertical color gradients (altitude-dependent sampling)
   - Multiple scattering approximation (0.25-0.4 range)
   - Path length multiplier for sunset optical depth
   - Dynamic exposure, turbidity, and Mie coefficient

4. **Frame-Based LUT Updates**
   - Sky View LUT updates every frame (`forceUpdate = true`)
   - Matches official Streets GL behavior for smooth transitions

5. **Large Sky Sphere**
   - Sky sphere radius: 40,000 units (20x larger)
   - Sun distance: 50,000 units (50x further)
   - Cloud domain: 40,000 × 12,000 × 40,000 units

---

## Questions for Perplexity

1. **LUT Generation**: Is our deferred LUT generation approach (using `requestAnimationFrame`) correct? Does Streets GL use a similar approach?

2. **Multiple Scattering**: Our multiple scattering approximation uses `rayleighScattering * multipleScatteringFactor * (1.0 - transmittance)`. Is this sufficient, or should we use a more sophisticated approach?

3. **Sky View LUT Updates**: We update the Sky View LUT every frame (`forceUpdate = true`). Is this the correct approach, or should we only update when sun direction changes significantly?

4. **Evening Colors**: Our evening color implementation uses vertical gradients and altitude-dependent sampling. Does Streets GL use similar techniques?

5. **Optical Depth Calculation**: Our optical depth uses a path length multiplier for sunset. Is this physically accurate?

6. **Phase Functions**: We use `getRayleighPhase(-sunDotView)` (negative sign). Is this correct for matching Streets GL?

7. **Atmospheric Constants**: Are our atmospheric constants (groundRadiusMM, atmosphereRadiusMM, scattering coefficients) matching Streets GL exactly?

8. **Performance**: Are there any performance optimizations we should implement?

9. **Missing Features**: Are there any Streets GL atmosphere features we're missing?

10. **Shader Code**: Are there any differences in our shader code compared to Streets GL that could affect visual quality?

---

## Reference

- **Official Streets GL Repository**: https://github.com/StrandedKitty/streets-gl
- **Key Files to Compare**:
  - `src/resources/shaders/atmosphere*.frag`
  - `src/lib/atmosphere/AtmosphereLUTSystem.ts` (if exists)
  - `src/lib/atmosphere/AtmosphereLUTPass.ts` (if exists)

Please analyze our implementation and provide recommendations for improvements to match the official Streets GL quality and behavior.
























