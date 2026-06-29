import * as THREE from 'three'
import { AtmosphereLUTSystem } from './AtmosphereLUTSystem'
import { getLUTBasedSkyFragmentShader } from './DynamicSkyLUTShader'
import {
  getIqCloudSkyFragmentShader,
  IQ_CLOUD_SKY_VERTEX_SHADER,
  iqCloudBandY
} from './IqCloudSkyShader'
import { getAdaptiveIqRaymarchSteps } from '../utils/weatherGpuUtils'
import { boxCloudAlphaScale, boxCloudCoverage } from '../utils/boxCloudCoverage'
import { DYNAMIC_SKY_SPHERE_RADIUS } from '../utils/dynamicSkyCamera'
import { WEATHER_GROUND_LEVEL } from '../utils/sceneFog'

/** Volumetric cloud layer height above ground (world units) */
const CLOUD_LAYER_HEIGHT = 12000

/** Horizontal half-extent — must fit inside DYNAMIC_SKY_SPHERE_RADIUS for stable clipping */
const CLOUD_BOX_HALF_WIDTH = 8000

export interface SkyConfig {
  timeOfDay: number // 0-24 hours (deprecated, use elevation/azimuth instead)
  turbidity: number // 2-20, atmospheric clarity (lower = clearer)
  atmosphereDensity: number // 0-1, density of atmosphere (deprecated, use rayleigh instead)
  sunPosition: THREE.Vector3
  sunColor: THREE.Color
  sunSize?: number // Size multiplier for sun glow
  // Three.js Sky shader parameters
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
  cloudScale?: number // 0.25-2, controls noise scale (lower = smaller clouds)
  cloudStorminess?: number // 0-1, darker heavier clouds
  cloudShadowStrength?: number // 0-1, self-shadow strength
  cloudColor?: THREE.Color
  quality?: 'low' | 'medium' | 'high' | 'ultra' // Performance quality preset
  /** 'iq' = integrated iq raymarch on sky dome; 'box' = Worley box + LUT sky; 'hybrid' = iq sky + box clouds */
  cloudRenderingMode?: 'iq' | 'box' | 'hybrid'
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
  private cloudRenderingMode: 'iq' | 'box' | 'hybrid' = 'box'

  private usesIqSky(): boolean {
    return this.cloudRenderingMode === 'iq' || this.cloudRenderingMode === 'hybrid'
  }

  private usesBoxClouds(): boolean {
    return this.cloudRenderingMode === 'box' || this.cloudRenderingMode === 'hybrid'
  }
  
  // Performance optimization: Cache expensive calculations
  // Removed legacy horizon color cache tied to timeOfDay (not used by shader)

  // Quality presets: [raymarchingSteps, noiseOctaves, shadowSamples]
  private readonly QUALITY_PRESETS = {
    low: { steps: 32, octaves: 3, shadowSamples: 1, densityMultiplier: 0.8, iqSteps: 48 },
    medium: { steps: 48, octaves: 4, shadowSamples: 2, densityMultiplier: 0.9, iqSteps: 56 },
    high: { steps: 64, octaves: 5, shadowSamples: 3, densityMultiplier: 1.0, iqSteps: 72 },
    ultra: { steps: 96, octaves: 6, shadowSamples: 4, densityMultiplier: 1.1, iqSteps: 88 }
  }

  constructor(scene: THREE.Scene, config: SkyConfig, renderer?: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer || null
    this.config = { quality: 'high', cloudRenderingMode: 'box', ...config }
    this.cloudRenderingMode = this.config.cloudRenderingMode ?? 'box'

    // iq / hybrid sky skips LUT; box mode uses LUT or direct atmospheric shader
    if (this.usesIqSky()) {
      this.useLUTSystem = false
    }
    
    // Initialize LUT system if renderer is available
    if (this.useLUTSystem && this.renderer) {
      try {
        this.lutSystem = new AtmosphereLUTSystem(this.renderer, scene)
        // CRITICAL: Defer LUT generation to avoid WebGL shader compilation conflicts
        // generateStaticLUTs() now defers internally, but we still need to call it
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
      // Use requestAnimationFrame instead of setTimeout for better synchronization
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
    console.log('[DynamicSky] Sky dome created and added to scene', {
      hasSkyMesh: !!this.skyMesh,
      hasMaterial: !!this.skyMaterial,
      sunPosition: this.config.sunPosition,
      usingLUTSystem: this.useLUTSystem && !!this.lutSystem
    })
  }

  private setupSky() {
    // Create optimized sphere geometry (fewer segments for better performance)
    // Sky dome radius must fit inside the camera far plane (default far ≈ 10k).
    // iq mode uses a camera-centered dome; box/LUT mode uses the same radius for consistency.
    const skyRadius = DYNAMIC_SKY_SPHERE_RADIUS
    const geometry = new THREE.SphereGeometry(skyRadius, 32, 32)

    // Three.js Sky shader vertex (physically-based atmospheric scattering)
    const useIqShader = this.usesIqSky()
    const vertexShader = useIqShader
      ? IQ_CLOUD_SKY_VERTEX_SHADER
      : `
      uniform vec3 sunPosition;
      varying vec3 vWorldPosition;
      
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    // Choose shader based on rendering mode
    const useLUTShader = !useIqShader && this.useLUTSystem && this.lutSystem && this.lutSystem.areStaticLUTsReady
    const fragmentShader = useIqShader
      ? getIqCloudSkyFragmentShader({ skyOnly: this.cloudRenderingMode === 'hybrid' })
      : useLUTShader
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
      // FIX: GLSL ES 2.0 doesn't support 'out' parameters - inline calculations instead
      // Helper function to calculate altitude-based density
      float getRayleighDensity(float altitudeKM) {
        return exp(-altitudeKM / 8.0);
      }
      
      float getMieDensity(float altitudeKM) {
        return exp(-altitudeKM / 1.2);
      }
      
      vec3 getOzoneAbsorption(float altitudeKM) {
        return ozoneAbsorptionBase * max(0.0, 1.0 - abs(altitudeKM - 25.0) / 15.0);
      }
      
      // Streets GL phase functions
      float getMiePhase(float cosTheta) {
        // FIX: GLSL ES 2.0 doesn't allow 'const' for uniform-dependent variables
        float g = mieDirectionalG;
        float scale = 3.0 / (8.0 * PI);
        float num = (1.0 - g * g) * (1.0 + cosTheta * cosTheta);
        float denom = (2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5);
        return scale * num / denom;
      }
      
      float getRayleighPhase(float cosTheta) {
        // FIX: 'const' is fine here since it's a compile-time constant, but removed for consistency
        float k = 3.0 / (16.0 * PI);
        return k * (1.0 + cosTheta * cosTheta);
      }
      
      // Streets GL-style atmospheric scattering
      vec3 skyColorCalc(vec3 viewDir, vec3 sunDir) {
        float sunDotView = dot(sunDir, viewDir);
        float sunDotUp = dot(sunDir, up);
        
        // FIX: Sample atmosphere at multiple altitudes for vertical color gradients
        // This is critical for evening colors - different altitudes have different scattering
        // Lower altitudes (near horizon) have more scattering = warmer colors
        // Higher altitudes (zenith) have less scattering = cooler colors
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
        // FIX: Calculate directly (GLSL ES 2.0 doesn't support 'out' parameters)
        float altitudeKM = (length(pos) - groundRadiusMM) * 1000.0;
        float rayleighDensity = getRayleighDensity(altitudeKM);
        float mieDensity = getMieDensity(altitudeKM);
        
        vec3 rayleighScattering = rayleighScatteringBase * rayleighDensity * rayleigh;
        float rayleighAbsorption = rayleighAbsorptionBase * rayleighDensity;
        
        float mieScattering = mieScatteringBase * mieDensity * mieCoefficient;
        float mieAbsorption = mieAbsorptionBase * mieDensity;
        
        vec3 ozoneAbsorption = getOzoneAbsorption(altitudeKM);
        vec3 extinction = rayleighScattering + vec3(rayleighAbsorption) + vec3(mieScattering) + vec3(mieAbsorption) + ozoneAbsorption;
        
        // Phase functions
        // FIX: Use negative sign to match Streets GL convention (view direction vs light direction)
        // This is critical for correct color matching with official implementation
        float rayleighPhase = getRayleighPhase(-sunDotView); // Negative sign matches Streets GL
        float miePhase = getMiePhase(sunDotView);
        
        // Optical depth approximation (simplified for sky dome)
        // Note: viewDotUp already declared above (line 222), reuse it
        float sunAngle = clamp(sunDotUp, 0.0, 1.0);
        float viewAngle = clamp(viewDotUp, 0.0, 1.0);
        
        float sunZenithAngle = acos(sunAngle);
        float viewZenithAngle = acos(viewAngle);
        
        // Streets GL optical depth approximation
        float sunAngleFactor = 1.0 / (cos(sunZenithAngle) + 0.15 * pow(93.885 - sunZenithAngle * 180.0 / PI, -1.253));
        float viewAngleFactor = 1.0 / (cos(viewZenithAngle) + 0.15 * pow(93.885 - viewZenithAngle * 180.0 / PI, -1.253));
        
        // FIX: Improve optical depth calculation for sunset (longer path through atmosphere)
        // At sunset, light travels through more atmosphere, so we need to increase path length
        // This physically accounts for why sunsets are red/orange (more blue light scattered away)
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
        // This is especially important at sunset/sunrise and near the horizon
        // IMPROVED: Increase approximation factor and add altitude-dependent scaling
        // Near horizon (evening): more multiple scattering = warmer colors
        // At zenith: less multiple scattering = cooler colors
        // Note: viewDotUp already declared above, reuse it
        float horizonFactor = 1.0 - clamp(viewDotUp, 0.0, 1.0); // 1.0 at horizon, 0.0 at zenith
        float multipleScatteringFactor = 0.25 + 0.15 * horizonFactor; // 0.25-0.4 range
        vec3 multipleScatteringApprox = rayleighScattering * multipleScatteringFactor * (1.0 - transmittance);
        inscatter += multipleScatteringApprox;
        
        // Sun disk - IMPROVED: Much larger sun disk for realistic appearance
        // Real sun angular size is ~0.5 degrees, so we need a wider smoothstep range
        // At 50,000 units distance with 400-unit radius, angular size is ~0.46 degrees
        // Use wider smoothstep (0.995 to 1.0) for larger visible sun disk
        float sunDisk = smoothstep(0.995, 1.0, sunDotView); // Wider range for larger sun (was 0.99-1.0)
        // FIX: Make sun much brighter and warmer (yellow/orange) instead of pale white
        // Real sun is very bright and has a warm color temperature (~5500K = yellow-white)
        // Use warm yellow-orange color and much higher brightness
        vec3 sunColorWarm = vec3(1.2, 1.0, 0.7); // Warm yellow-orange (not pure white)
        vec3 sunColor = sunColorWarm * sunDisk * 8.0; // Much brighter (was 2.0, now 8.0)
        
        // FIX: Add vertical color gradient for evening (darker at bottom, brighter at top)
        // This creates the rich color gradients seen in real evening skies
        // Perplexity analysis: Evening skies should have vertical color distribution
        // Note: viewDotUp and viewAltitude already declared above (lines 222-223), reuse them
        
        // Vertical gradient factor: 0.0 at horizon (bottom), 1.0 at zenith (top)
        float verticalGradient = clamp((viewAltitude + 1.0) * 0.5, 0.0, 1.0);
        
        // Apply gradient more strongly during evening (low sun)
        float sunElevation = dot(sunDir, up);
        float eveningFactor = 1.0 - clamp((sunElevation + 0.1) / 0.4, 0.0, 1.0); // Strong at sunset
        
        // Tone mapping with exposure (higher exposure = brighter sky)
        // Use more balanced tone mapping to prevent overly saturated colors
        // FIX: Apply tone mapping to sky, but add bright sun after to preserve its brightness
        vec3 skyColorOnly = inscatter; // Sky without sun
        skyColorOnly = vec3(1.0) - exp(-skyColorOnly * max(exposure, 0.5));
        
        // Apply evening gradient to sky color (before adding sun)
        if (eveningFactor > 0.1) {
          // Evening: enhance vertical gradient
          // Bottom (horizon): warmer, more saturated
          // Top (zenith): cooler, less saturated
          float gradientStrength = 0.3 * eveningFactor;
          
          // Warmer colors at horizon (more red/orange)
          vec3 horizonColor = vec3(1.2, 0.9, 0.7); // Warm orange-red
          vec3 zenithColor = vec3(0.8, 0.9, 1.1); // Cool blue
          
          // Blend based on vertical position
          vec3 gradientColor = mix(horizonColor, zenithColor, verticalGradient);
          skyColorOnly = mix(skyColorOnly, skyColorOnly * gradientColor, gradientStrength);
        }
        
        // Add bright sun after tone mapping to prevent it from being compressed
        vec3 color = skyColorOnly + sunColor;
        
        // FIX: Removed RGB post-processing adjustments - these were a hack
        // Physical parameter adjustments (turbidity, optical depth, exposure) are now handled
        // in TypeScript code based on sun elevation, which is more physically accurate
        
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
          
          // Calculate elevation and azimuth from sun position
          float elevation = asin(sunDir.y);
          float azimuth = atan(sunDir.z, sunDir.x);
          
          // Get sky color using Preetham model
          vec3 color = skyColorCalc(viewDir, sunDir);
          
          // Calculate sun elevation to determine time of day
          float sunDotUp = dot(sunDir, vec3(0.0, 1.0, 0.0));
          float sunElevation = sunDotUp; // -1 to 1, negative = below horizon
          
          // Only apply minimum brightness clamping during nighttime/twilight
          // During daytime (sun above horizon), trust the Preetham model to produce correct bright sky
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
            // Twilight (sun near horizon) - preserve natural sunset colors, don't force blue
            // Only apply minimum if it's getting too dark
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            if (luminance < 0.06) {
              // Very dark twilight - add slight minimum but preserve sunset colors
              vec3 minColor = vec3(0.03, 0.04, 0.06); // Darker, less blue
              color = mix(color, minColor, 0.2); // Less aggressive blending
            }
          }
          // During daytime (sunElevation >= 0.1), don't clamp - let the Preetham model work naturally
          
          // Calculate sun brightness for alpha (only sun area is opaque, rest is transparent)
          float sunDotView = dot(viewDir, sunDir);
          // Make sun area opaque (alpha = 1.0) where sun is bright, transparent (alpha = 0.0) elsewhere
          // IMPROVED: Wider smoothstep range for larger visible sun disk
          float sunBrightness = smoothstep(0.995, 1.0, sunDotView); // Wider range for larger sun (was 0.98-1.0)
          // Only show the bright white sun area, make everything else transparent
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
        ).multiplyScalar(DYNAMIC_SKY_SPHERE_RADIUS)
      }
      
      // Create uniforms based on shader type
      let uniforms: any
      const qualitySettings = this.QUALITY_PRESETS[this.config.quality || 'high']
      
      if (useIqShader) {
        const cloudBand = iqCloudBandY(0)
        uniforms = {
          sunPosition: { value: sunPos },
          iTime: { value: 0 },
          coverage: { value: this.config.cloudDensity ?? 0 },
          storminess: { value: this.config.cloudStorminess ?? 0 },
          windSpeed: { value: (this.config.windIntensity ?? 0) * 0.2 + 0.05 },
          exposure: { value: this.config.exposure ?? 1.0 },
          cloudScale: { value: this.config.cloudScale ?? 1.0 },
          cloudDetail: { value: this.config.cloudDetail ?? 0.5 },
          cloudBaseY: { value: cloudBand.base },
          cloudTopY: { value: cloudBand.top },
          raymarchSteps: {
            value: getAdaptiveIqRaymarchSteps(
              this.config.quality || 'high',
              this.config.cloudDensity ?? 0
            )
          }
        }
      } else if (this.useLUTSystem && this.lutSystem) {
        // Create a placeholder texture (1x1 white) to prevent shader errors
        // This will be replaced with the actual LUT texture in update()
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
          rayleigh: { value: this.config.rayleigh ?? 1.2 }, // Slightly increased for better blue sky during day
          mieCoefficient: { value: this.config.mieCoefficient ?? 0.8 }, // Slightly reduced to prevent orange dominance
          mieDirectionalG: { value: this.config.mieDirectionalG ?? 0.8 }, // Match Streets GL (from getMiePhase)
          exposure: { value: this.config.exposure ?? 1.0 } // Higher = brighter sky
        }
      }

    // Add fog uniforms to the uniforms object BEFORE creating the material
    // This prevents Three.js from trying to access undefined fog uniforms
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
        transparent: !useIqShader, // iq mode renders full opaque sky + clouds
        depthWrite: false,
        depthTest: true, // Respect shadow/ground plane depth so sky does not show below floor
        fog: false, // Sky doesn't use fog
        // Ensure shader compiles correctly - explicitly disable fog uniforms
        defines: {
          USE_FOG: false,
          FOG_EXP2: false,
          FOG_EXP: false
        }
      })
      
      // Store material name for debugging
      this.skyMaterial.name = 'DynamicSky'
    } catch (error) {
      console.error('[DynamicSky] Failed to create sky shader material:', error)
      throw error
    }

    this.skyMesh = new THREE.Mesh(geometry, this.skyMaterial)
    this.skyMesh.name = 'Dynamic Sky'
    this.skyMesh.userData.isDynamicSky = true
    // CRITICAL: Lock the sky dome by default to prevent accidental movement
    // Users can unlock it in the Objects Panel if needed
    this.skyMesh.userData.isLocked = true
    this.skyMesh.renderOrder = -999
    this.skyMesh.frustumCulled = false
    this.skyMesh.visible = true
    this.scene.add(this.skyMesh)
    
    // Initialize LUT texture immediately if using LUT system
    // Note: LUT may not be ready on first frame (static LUTs generate asynchronously)
    // This is expected behavior - the LUT will be set in the update() method once ready
    if (this.useLUTSystem && this.lutSystem && this.skyMaterial.uniforms.tSkyViewLUT) {
      // Try to generate initial Sky View LUT with current sun position
      const sunPos = this.config.sunPosition.clone().normalize()
      const cameraHeight = 0.0
      const skyViewTexture = this.lutSystem.getSkyViewTexture(sunPos, cameraHeight)
      if (skyViewTexture) {
        this.skyMaterial.uniforms.tSkyViewLUT.value = skyViewTexture
        console.log('[DynamicSky] Initial LUT texture set')
      } else {
        // LUT not ready yet (static LUTs still generating) - this is expected on first frame
        // The LUT system will generate it on next frame via requestAnimationFrame
        // The update() method will set it once ready - no action needed here
        // Note: The LUT shader will work once the texture is set, even if it's null initially
      }
    }

    // Setup volumetric box clouds (box + hybrid modes)
    if (this.usesBoxClouds()) {
      this.setupVolumetricClouds()
    }
  }

  private rebuildSkyForModeChange() {
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
      this.volumetricCloudMaterial?.dispose()
      this.volumetricCloudMesh = null
      this.volumetricCloudMaterial = null
    }
    if (this.lutSystem) {
      this.lutSystem.dispose()
      this.lutSystem = null
    }
    this.useLUTSystem = !this.usesIqSky()
    if (this.useLUTSystem && this.renderer) {
      try {
        this.lutSystem = new AtmosphereLUTSystem(this.renderer, this.scene)
        this.lutSystem.generateStaticLUTs()
      } catch {
        this.useLUTSystem = false
      }
    }
    this.setupSky()
  }

  private setupVolumetricClouds() {
    if (!this.usesBoxClouds()) return
    const uiDensity = this.config.cloudDensity ?? 0.0
    const cloudDensity = boxCloudCoverage(uiDensity)
    if (cloudDensity <= 0) return

    const quality = this.config.quality || 'high'
    const qualitySettings = this.QUALITY_PRESETS[quality]

    // Cloud layer sits above ground — bottom at WEATHER_GROUND_LEVEL, top at GROUND + HEIGHT
    const cloudBoxCenterY = WEATHER_GROUND_LEVEL + CLOUD_LAYER_HEIGHT / 2
    // Camera-centered sphere proxy — one fragment per pixel with correct view rays.
    // BoxGeometry BackSide from inside draws six overlapping face quads (dark shards).
    const geo = new THREE.SphereGeometry(DYNAMIC_SKY_SPHERE_RADIUS, 32, 32)
    
    const uniforms = {
      iTime: { value: 0 },
      coverage: { value: cloudDensity },
      alphaScale: { value: boxCloudAlphaScale(uiDensity) },
      thickness: { value: Math.max(0.2, (this.config.cloudThickness ?? 0.5) * 1.2) },
      detail: { value: this.config.cloudDetail ?? 0.5 },
      sunDir: { value: this.config.sunPosition.clone().normalize() },
      cloudColor: { value: this.config.cloudColor ?? new THREE.Color(1, 1, 1) },
      storminess: { value: this.config.cloudStorminess ?? 0.0 },
      windSpeed: { value: (this.config.windIntensity ?? 0.0) * 0.2 + 0.02 },
      raymarchSteps: { value: qualitySettings.steps },
      noiseOctaves: { value: qualitySettings.octaves },
      cameraDistance: { value: 0.0 },
      cloudBoxCenter: { value: new THREE.Vector3(0, cloudBoxCenterY, 0) }
    }
    
    const vShader = `
      precision highp float;
      varying vec3 vWorldPos;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    // Enhanced volumetric cloud shader with advanced raymarching
    const fShader = `
      precision highp float;
      varying vec3 vWorldPos;
      uniform float iTime; 
      uniform float coverage; 
      uniform float alphaScale;
      uniform float thickness; 
      uniform float detail; 
      uniform vec3 sunDir; 
      uniform vec3 cloudColor;
      uniform float storminess;
      uniform float windSpeed;
      uniform int raymarchSteps;
      uniform int noiseOctaves;
      uniform float cameraDistance;
      uniform vec3 cloudBoxCenter;
      
      const float PI = 3.14159265359;
      const float CLOUD_HALF_W = ${CLOUD_BOX_HALF_WIDTH.toFixed(1)};
      const float CLOUD_HALF_H = ${(CLOUD_LAYER_HEIGHT / 2).toFixed(1)};
      
      // Improved hash function for better noise quality
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p += dot(p, p.yzx + 19.19);
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      
      // Improved 3D noise with better distribution
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f); // Smoothstep
        
        float n = 0.0;
        for(int x = 0; x < 2; x++) {
          for(int y = 0; y < 2; y++) {
            for(int z = 0; z < 2; z++) {
              vec3 o = vec3(float(x), float(y), float(z));
              float h = hash(i + o);
              vec3 d = f - o;
              n += h * (d.x * d.y * d.z);
            }
          }
        }
        return n;
      }
      
      // Worley noise for cloud shape (cell noise)
      float worleyNoise(vec3 p) {
        vec3 id = floor(p);
        vec3 f = fract(p);
        
        float minDist = 1.0;
        for(int x = -1; x <= 1; x++) {
          for(int y = -1; y <= 1; y++) {
            for(int z = -1; z <= 1; z++) {
              vec3 neighbor = vec3(float(x), float(y), float(z));
              vec3 point = neighbor + hash(id + neighbor);
              float dist = length(neighbor + point - f);
              minDist = min(minDist, dist);
            }
          }
        }
        return minDist;
      }
      
      // Fractional Brownian Motion with multiple noise types
      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        float normalization = 0.0;
        
        for(int i = 0; i < 6; i++) {
          if(i >= noiseOctaves) break;
          value += amplitude * noise(p * frequency);
          normalization += amplitude;
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        return value / normalization;
      }
      
      // Cloud shape noise (uses Worley for base, FBM for details)
      float cloudShape(vec3 p) {
        // Base shape using Worley noise
        float worley = worleyNoise(p * 0.002);
        float shape = 1.0 - worley;
        
        // Add detail using FBM
        float detailNoise = fbm(p * 0.01);
        shape = mix(shape, shape * detailNoise, detail);
        
        // Erosion for more realistic cloud edges
        float erosion = fbm(p * 0.05);
        shape = shape - erosion * 0.3;
        
        return clamp(shape, 0.0, 1.0);
      }
      
      // Height gradient for cloud density distribution
      float heightGradient(vec3 pos, vec3 bmin, vec3 bmax) {
        float h = (pos.y - bmin.y) / max(1.0, (bmax.y - bmin.y));
        
        // Cloud layer shape (thicker in middle, thinner at edges)
        float bottom = smoothstep(0.0, 0.2, h);
        float top = smoothstep(1.0, 0.7, h);
        return bottom * top;
      }
      
      // Sample cloud density at a point (no density below ground plane)
      float sampleCloudDensity(vec3 pos, vec3 windDir, float time, vec3 bmin, vec3 bmax) {
        if (pos.y < ${WEATHER_GROUND_LEVEL.toFixed(1)}) return 0.0;
        // Animated sampling position
        vec3 samplePos = pos * 0.003 + windDir * time + vec3(0.0, time * 0.01, 0.0);
        
        // Get cloud shape
        float shape = cloudShape(samplePos);
        
        // Height gradient
        float heightFactor = heightGradient(pos, bmin, bmax);
        
        // Coverage threshold
        float threshold = (1.0 - coverage) * (1.0 - storminess * 0.3);
        float density = clamp((shape - threshold) * 2.0, 0.0, 1.0);
        
        // Apply height and thickness
        density *= heightFactor * thickness * (1.0 + storminess * 0.5);
        
        return density;
      }
      
      // Calculate cloud normal for lighting
      vec3 cloudNormal(vec3 pos, vec3 windDir, float time, vec3 bmin, vec3 bmax) {
        float eps = 2.0;
        float d = sampleCloudDensity(pos, windDir, time, bmin, bmax);
        float dx = sampleCloudDensity(pos + vec3(eps, 0.0, 0.0), windDir, time, bmin, bmax) - d;
        float dy = sampleCloudDensity(pos + vec3(0.0, eps, 0.0), windDir, time, bmin, bmax) - d;
        float dz = sampleCloudDensity(pos + vec3(0.0, 0.0, eps), windDir, time, bmin, bmax) - d;
        return normalize(vec3(dx, dy, dz));
      }
      
      // Shadow raymarching (light occlusion)
      float lightOcclusion(vec3 pos, vec3 lightDir, vec3 windDir, float time, vec3 bmin, vec3 bmax) {
        float shadow = 1.0;
        vec3 shadowPos = pos;
        float shadowStep = 10.0;
        
        // Fewer steps for shadow (performance optimization)
        int shadowSteps = 8;
        for(int i = 0; i < 8; i++) {
          if(i >= shadowSteps) break;
          shadowPos += lightDir * shadowStep;
          
          // Check if still in cloud domain
          if(shadowPos.y < bmin.y || shadowPos.y > bmax.y) break;
          
          float shadowDensity = sampleCloudDensity(shadowPos, windDir, time, bmin, bmax);
          shadow *= exp(-shadowDensity * shadowStep * 0.1);
          
          // Early exit if fully occluded
          if(shadow < 0.01) break;
        }
        
        return shadow;
      }
      
      // Henyey-Greenstein phase function for light scattering
      float phaseFunction(float cosTheta, float g) {
        float g2 = g * g;
        return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
      }
      
      // Optimized ray-box intersection
      // FIX: GLSL ES 2.0 doesn't support 'out' parameters - calculate inline
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = normalize(vWorldPos - cameraPosition);
        
        // Cloud domain follows the camera-centered box mesh (cloudBoxCenter uniform)
        vec3 bmin = cloudBoxCenter - vec3(CLOUD_HALF_W, CLOUD_HALF_H, CLOUD_HALF_W);
        vec3 bmax = cloudBoxCenter + vec3(CLOUD_HALF_W, CLOUD_HALF_H, CLOUD_HALF_W);
        
        // Calculate ray-box intersection inline (GLSL ES 2.0 doesn't support 'out' parameters)
        vec3 inv = 1.0 / max(abs(rd), vec3(0.0001));
        vec3 tmin = (bmin - ro) * inv;
        vec3 tmax = (bmax - ro) * inv;
        vec3 t1v = min(tmin, tmax);
        vec3 t2v = max(tmin, tmax);
        float tNear = max(max(t1v.x, t1v.y), t1v.z);
        float tFar = min(min(t2v.x, t2v.y), t2v.z);
        
        if(tFar <= tNear) discard;
        tNear = max(tNear, 0.0);
        
        // Adaptive step size based on quality
        int steps = raymarchSteps;
        float dt = (tFar - tNear) / float(steps);
        
        // Wind direction
        vec3 windDir = normalize(vec3(1.0, 0.0, 0.3)) * windSpeed;
        
        // Raymarching
        vec3 pos = ro + rd * tNear;
        vec3 color = vec3(0.0);
        float transmittance = 1.0;
        float density = 0.0;
        
        // Light direction (normalized)
        vec3 lightDir = normalize(sunDir);
        
        // Phase function parameter (forward scattering)
        float g = 0.7;
        
        for(int i = 0; i < 96; i++) {
          if(i >= steps) break;
          
          // Sample density
          float d = sampleCloudDensity(pos, windDir, iTime, bmin, bmax);
          
          if(d > 0.01) {
            // Calculate lighting
            vec3 normal = cloudNormal(pos, windDir, iTime, bmin, bmax);
            float NdotL = dot(normal, lightDir);
            
            // Shadow/occlusion
            float shadow = lightOcclusion(pos, lightDir, windDir, iTime, bmin, bmax);
            
            // Phase function for scattering
            float cosTheta = dot(rd, lightDir);
            float phase = phaseFunction(cosTheta, g);
            
            // Light intensity (ambient + directional)
            float ambient = 0.3;
            float directional = max(0.0, NdotL) * shadow;
            float lightIntensity = ambient + directional * 0.7;
            
            // Beer's law for absorption
            float absorption = exp(-d * dt * 0.5);
            
            // Scattering contribution
            vec3 scattering = cloudColor * lightIntensity * phase;
            vec3 scatteredLight = scattering * (1.0 - absorption);
            
            // Accumulate color using Beer's law
            color += scatteredLight * transmittance * dt;
            transmittance *= absorption;
            
            density += d * dt;
            
            // Early exit if fully opaque
            if(transmittance < 0.01) break;
          }
          
          pos += rd * dt;
        }
        
        // Apply storminess to color (darker, more dramatic)
        color *= (1.0 - storminess * 0.3);
        
        // Alpha from Beer-Lambert transmittance; RGB is in-scattered light only
        float alpha = 1.0 - transmittance;
        alpha *= coverage * alphaScale;
        alpha = clamp(alpha, 0.0, 0.95);
        if (alpha < 0.004) discard;
        
        vec3 finalColor = color / max(alpha, 0.004);
        gl_FragColor = vec4(finalColor, alpha);
      }
    `

    try {
      this.volumetricCloudMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vShader,
        fragmentShader: fShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.BackSide
      })
      
      // Store material name for debugging
      this.volumetricCloudMaterial.name = 'VolumetricClouds'
    } catch (error) {
      console.error('[DynamicSky] Failed to create volumetric cloud shader material:', error)
      throw error
    }
    
    this.volumetricCloudMesh = new THREE.Mesh(geo, this.volumetricCloudMaterial)
    this.volumetricCloudMesh.frustumCulled = false
    this.volumetricCloudMesh.renderOrder = -998
    this.volumetricCloudMesh.name = 'Volumetric Clouds (Optimized)'
    this.volumetricCloudMesh.visible = uiDensity > 0
    this.volumetricCloudMesh.userData.isDynamicSky = true
    this.volumetricCloudMesh.raycast = () => {}
    // Position updated each frame from camera (see update(camera))
    
    this.scene.add(this.volumetricCloudMesh)
  }

  update(config: Partial<SkyConfig> | THREE.Camera) {
    // If called with camera, update position and animation
    if (config instanceof THREE.Camera) {
      if (this.skyMesh) {
        this.skyMesh.position.copy(config.position)
      }
      if (this.volumetricCloudMesh) {
        const centerY = WEATHER_GROUND_LEVEL + CLOUD_LAYER_HEIGHT / 2
        // Ray proxy sphere is camera-centered; cloud AABB stays at fixed altitude
        this.volumetricCloudMesh.position.copy(config.position)
        if (this.volumetricCloudMaterial?.uniforms?.cloudBoxCenter) {
          this.volumetricCloudMaterial.uniforms.cloudBoxCenter.value.set(
            config.position.x,
            centerY,
            config.position.z
          )
        }
        
        // Calculate camera distance for adaptive quality
        this.cameraDistance = config.position.length()
      }
      
      // Advance time for cloud animation
      const now = performance.now()
      const dt = Math.min(0.05, (now - this.lastUpdateTime) / 1000)
      this.lastUpdateTime = now
      this.cloudTime += dt
      this.frameCount++
      
      // Update cloud time uniform (iq sky + box clouds)
      if (this.skyMaterial?.uniforms?.iTime) {
        this.skyMaterial.uniforms.iTime.value = this.cloudTime
      }
      if (this.cloudRenderingMode === 'iq' && this.skyMaterial?.uniforms?.cloudBaseY) {
        const band = iqCloudBandY(config.position.y)
        this.skyMaterial.uniforms.cloudBaseY.value = band.base
        this.skyMaterial.uniforms.cloudTopY.value = band.top
      }
      if (this.volumetricCloudMaterial && this.volumetricCloudMaterial.uniforms) {
        this.volumetricCloudMaterial.uniforms.iTime.value = this.cloudTime
        this.volumetricCloudMaterial.uniforms.cameraDistance.value = this.cameraDistance
      }
      
      // Sky shader no longer uses legacy horizon color cache based on timeOfDay
      
      return
    }
    
    // Otherwise update material uniforms
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...config }

    if (config.cloudRenderingMode && config.cloudRenderingMode !== oldConfig.cloudRenderingMode) {
      this.cloudRenderingMode = config.cloudRenderingMode
      this.rebuildSkyForModeChange()
      return
    }
    
    // Check if quality changed (requires shader recompilation for box clouds; iq steps update on sky material)
    if (config.quality && config.quality !== oldConfig.quality) {
      if (this.cloudRenderingMode === 'iq' && this.skyMaterial?.uniforms?.raymarchSteps) {
        this.skyMaterial.uniforms.raymarchSteps.value = getAdaptiveIqRaymarchSteps(
          config.quality,
          this.config.cloudDensity ?? 0
        )
      } else if (this.volumetricCloudMesh) {
        this.scene.remove(this.volumetricCloudMesh)
        this.volumetricCloudMesh.geometry.dispose()
        this.volumetricCloudMaterial?.dispose()
        this.volumetricCloudMesh = null
        this.volumetricCloudMaterial = null
      }
      if (this.usesBoxClouds()) {
        this.setupVolumetricClouds()
      }
    }
    
    // Update sky dome uniforms (Three.js Sky shader)
    if (this.skyMaterial && this.skyMaterial.uniforms) {
      // CRITICAL: Use provided sunPosition directly if available (for synchronization with CSM/sun mesh)
      // Only recalculate from elevation/azimuth if sunPosition is not explicitly provided in this update
      let sunPos = this.config.sunPosition.clone()
      // Only recalculate if sunPosition wasn't provided in this update AND elevation/azimuth are available
      // This ensures we use the exact same direction as CSM shadows and sun mesh
      if (config.sunPosition === undefined && this.config.elevation !== undefined && this.config.azimuth !== undefined) {
        const elevation = this.config.elevation
        const azimuth = this.config.azimuth
        sunPos.set(
          Math.cos(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.sin(azimuth) * Math.cos(elevation)
        )
        // IMPROVED: Scale sun position to much further distance for realistic appearance
        // Real sun is ~149.6 million km away, but for 3D scenes we use scaled distance
        // Use 50,000 units distance (50x further than before) to match larger sun size
        sunPos.normalize().multiplyScalar(DYNAMIC_SKY_SPHERE_RADIUS)
      } else {
        // Use provided sunPosition directly - ensure it's normalized then scaled
        // sunPosition from timeOfDayToSkyAngles is already normalized, so just scale it
        // IMPROVED: Scale to much further distance for realistic appearance
        if (sunPos.length() < 1000) {
          // If it's a normalized direction vector, scale it to far distance
          sunPos.normalize().multiplyScalar(DYNAMIC_SKY_SPHERE_RADIUS)
        } else {
          // Already scaled, but ensure it's at the correct far distance
          sunPos.normalize().multiplyScalar(DYNAMIC_SKY_SPHERE_RADIUS)
        }
      }
      
      // iq integrated sky (XslGRr-style volumetric clouds + sun disk)
      if (this.cloudRenderingMode === 'iq' && this.skyMaterial.uniforms.coverage) {
        const band = iqCloudBandY(this.skyMesh?.position.y ?? 0)
        this.skyMaterial.uniforms.sunPosition.value = sunPos
        this.skyMaterial.uniforms.coverage.value = this.config.cloudDensity ?? 0
        this.skyMaterial.uniforms.storminess.value = this.config.cloudStorminess ?? 0
        this.skyMaterial.uniforms.windSpeed.value = (this.config.windIntensity ?? 0) * 0.2 + 0.05
        this.skyMaterial.uniforms.exposure.value = this.config.exposure ?? 1.0
        this.skyMaterial.uniforms.cloudScale.value = this.config.cloudScale ?? 1.0
        this.skyMaterial.uniforms.cloudDetail.value = this.config.cloudDetail ?? 0.5
        this.skyMaterial.uniforms.cloudBaseY.value = band.base
        this.skyMaterial.uniforms.cloudTopY.value = band.top
        this.skyMaterial.uniforms.raymarchSteps.value = getAdaptiveIqRaymarchSteps(
          this.config.quality || 'high',
          this.config.cloudDensity ?? 0
        )
      } else if (this.cloudRenderingMode === 'hybrid' && this.skyMaterial.uniforms.sunPosition) {
        this.skyMaterial.uniforms.sunPosition.value = sunPos
        if (this.skyMaterial.uniforms.exposure) {
          this.skyMaterial.uniforms.exposure.value = this.config.exposure ?? 1.0
        }
        if (this.skyMaterial.uniforms.windSpeed) {
          this.skyMaterial.uniforms.windSpeed.value = (this.config.windIntensity ?? 0) * 0.2 + 0.05
        }
      } else if (this.useLUTSystem && this.lutSystem && this.skyMaterial.uniforms.tSkyViewLUT) {
        // LUT-based: Update Sky View LUT and sample texture
        // FIX: Update every frame for smoother transitions (matches official Streets GL)
        // Official Streets GL updates Sky View LUT every frame (AtmosphereLUTPass.ts lines 99-108)
        // This ensures smooth color transitions during time-of-day changes
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
        } else {
          // LUT not ready yet - this can happen if static LUTs are still generating
          // The LUT system will generate it on next frame, so this is not an error
          // The shader will fall back to direct calculation if LUT is not available
          if (this.skyMaterial.uniforms.tSkyViewLUT.value === null) {
            // Only log once to avoid spam
            console.log('[DynamicSky] Sky View LUT not ready yet (static LUTs generating), using direct calculation fallback')
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
        // Use rayleigh if provided, otherwise derive from deprecated atmosphereDensity, or use default
        const rayleighValue = this.config.rayleigh ?? (this.config.atmosphereDensity ? this.config.atmosphereDensity * 3.0 : 2.869)
        if (this.skyMaterial.uniforms.rayleigh) {
          this.skyMaterial.uniforms.rayleigh.value = rayleighValue
        }
        // Use mieCoefficient if provided, otherwise derive from deprecated atmosphereDensity, or use default
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

    // Update volumetric box clouds (box + hybrid modes)
    if (!this.usesBoxClouds()) {
      if (this.volumetricCloudMesh) {
        this.scene.remove(this.volumetricCloudMesh)
        this.volumetricCloudMesh.geometry.dispose()
        this.volumetricCloudMaterial?.dispose()
        this.volumetricCloudMesh = null
        this.volumetricCloudMaterial = null
      }
      return
    }

    const uiDensity = this.config.cloudDensity ?? 0.0
    const cloudVisible = uiDensity > 0
    
    if (cloudVisible && !this.volumetricCloudMesh) {
      this.setupVolumetricClouds()
    } else if (!cloudVisible && this.volumetricCloudMesh) {
      this.scene.remove(this.volumetricCloudMesh)
      this.volumetricCloudMesh.geometry.dispose()
      this.volumetricCloudMaterial?.dispose()
      this.volumetricCloudMesh = null
      this.volumetricCloudMaterial = null
    }
    
    if (this.volumetricCloudMaterial && this.volumetricCloudMaterial.uniforms) {
      const qualitySettings = this.QUALITY_PRESETS[this.config.quality || 'high']
      const mappedCoverage = boxCloudCoverage(uiDensity)

      this.volumetricCloudMaterial.uniforms.coverage.value = mappedCoverage
      if (this.volumetricCloudMaterial.uniforms.alphaScale) {
        this.volumetricCloudMaterial.uniforms.alphaScale.value = boxCloudAlphaScale(uiDensity)
      }
      this.volumetricCloudMaterial.uniforms.thickness.value = Math.max(0.2, (this.config.cloudThickness ?? 0.5) * 1.2)
      this.volumetricCloudMaterial.uniforms.detail.value = this.config.cloudDetail ?? 0.5
      this.volumetricCloudMaterial.uniforms.sunDir.value = this.config.sunPosition.clone().normalize()
      this.volumetricCloudMaterial.uniforms.cloudColor.value = this.config.cloudColor ?? new THREE.Color(1, 1, 1)
      this.volumetricCloudMaterial.uniforms.storminess.value = this.config.cloudStorminess ?? 0.0
      this.volumetricCloudMaterial.uniforms.windSpeed.value = (this.config.windIntensity ?? 0.0) * 0.2 + 0.02
      this.volumetricCloudMaterial.uniforms.raymarchSteps.value = qualitySettings.steps
      this.volumetricCloudMaterial.uniforms.noiseOctaves.value = qualitySettings.octaves
    }
    
    if (this.volumetricCloudMesh) {
      this.volumetricCloudMesh.visible = cloudVisible
      const centerY = WEATHER_GROUND_LEVEL + CLOUD_LAYER_HEIGHT / 2
      if (this.volumetricCloudMaterial?.uniforms?.cloudBoxCenter) {
        this.volumetricCloudMaterial.uniforms.cloudBoxCenter.value.set(
          this.volumetricCloudMesh.position.x,
          centerY,
          this.volumetricCloudMesh.position.z
        )
      }
    }
  }

  // Removed legacy getHorizonColorForTime (no longer used)

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
    // No legacy caches to clear
  }
}
