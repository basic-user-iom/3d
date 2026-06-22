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
          
          // FIX: Calculate scattering values inline (GLSL ES 2.0 doesn't support 'out' parameters)
          float altitudeKM = (length(newPos) - groundRadiusMM) * 1000.0;
          float rayleighDensity = getRayleighDensity(altitudeKM);
          float mieDensity = getMieDensity(altitudeKM);
          
          vec3 rayleighScattering = rayleighScatteringBase * rayleighDensity;
          float rayleighAbsorption = rayleighAbsorptionBase * rayleighDensity;
          float mieScattering = mieScatteringBase * mieDensity;
          float mieAbsorption = mieAbsorptionBase * mieDensity;
          vec3 ozoneAbsorption = getOzoneAbsorption(altitudeKM);
          vec3 extinction = rayleighScattering + vec3(rayleighAbsorption) + vec3(mieScattering) + vec3(mieAbsorption) + ozoneAbsorption;
          
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
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `
    
    const fragmentShader = `
      precision highp float;
      
      ${this.getAtmosphereChunk()}
      
      uniform sampler2D tTransmittanceLUT;
      uniform float mulScattSteps;
      uniform float sqrtSamples;
      
      vec3 getSphericalDir(float theta, float phi) {
        float cosPhi = cos(phi);
        float sinPhi = sin(phi);
        float cosTheta = cos(theta);
        float sinTheta = sin(theta);
        return vec3(sinPhi*sinTheta, cosPhi, sinPhi*cosTheta);
      }
      
      vec3 getValFromTLUT(sampler2D tex, vec3 pos, vec3 sunDir) {
        float height = length(pos);
        vec3 up = pos / height;
        float sunCosZenithAngle = dot(sunDir, up);
        vec2 uv = vec2(
          clamp(0.5 + 0.5*sunCosZenithAngle, 0.0, 1.0),
          max(0.0, min(1.0, (height - groundRadiusMM) / (atmosphereRadiusMM - groundRadiusMM)))
        );
        return texture2D(tex, uv).rgb;
      }
      
      // FIX: GLSL ES 2.0 doesn't support 'out' parameters - calculate values directly in main()
      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(${this.config.multipleScatteringSize.width}.0, ${this.config.multipleScatteringSize.height}.0);
        
        float sunCosTheta = 2.0 * uv.x - 1.0;
        float sunTheta = safeacos(sunCosTheta);
        float height = mix(groundRadiusMM, atmosphereRadiusMM, uv.y);
        
        vec3 pos = vec3(0.0, height, 0.0);
        vec3 sunDir = normalize(vec3(0.0, sunCosTheta, -sin(sunTheta)));
        
        // Calculate multiple scattering values directly (no 'out' parameters)
        vec3 lumTotal = vec3(0.0);
        vec3 fms = vec3(0.0);
        
        float invSamples = 1.0 / (sqrtSamples * sqrtSamples);
        for (int i = 0; i < ${this.config.sqrtSamples}; i++) {
          for (int j = 0; j < ${this.config.sqrtSamples}; j++) {
            float theta = PI * (float(i) + 0.5) / sqrtSamples;
            float phi = safeacos(1.0 - 2.0*(float(j) + 0.5) / sqrtSamples);
            vec3 rayDir = getSphericalDir(theta, phi);
            
            float atmoDist = rayIntersectSphere(pos, rayDir, atmosphereRadiusMM);
            float groundDist = rayIntersectSphere(pos, rayDir, groundRadiusMM);
            float tMax = atmoDist;
            if (groundDist > 0.0) {
              tMax = groundDist;
            }
            
            float cosTheta = dot(rayDir, sunDir);
            
            float miePhaseValue = getMiePhase(cosTheta);
            float rayleighPhaseValue = getRayleighPhase(-cosTheta);
            
            vec3 lum = vec3(0.0), lumFactor = vec3(0.0), transmittance = vec3(1.0);
            float t = 0.0;
            for (float stepI = 0.0; stepI < mulScattSteps; stepI += 1.0) {
              float newT = ((stepI + 0.3)/mulScattSteps)*tMax;
              float dt = newT - t;
              t = newT;
              
              vec3 newPos = pos + t*rayDir;
              
              // FIX: Calculate scattering values inline (GLSL ES 2.0 doesn't support 'out' parameters)
              float altitudeKM = (length(newPos) - groundRadiusMM) * 1000.0;
              float rayleighDensity = getRayleighDensity(altitudeKM);
              float mieDensity = getMieDensity(altitudeKM);
              
              vec3 rayleighScattering = rayleighScatteringBase * rayleighDensity;
              float rayleighAbsorption = rayleighAbsorptionBase * rayleighDensity;
              float mieScattering = mieScatteringBase * mieDensity;
              float mieAbsorption = mieAbsorptionBase * mieDensity;
              vec3 ozoneAbsorption = getOzoneAbsorption(altitudeKM);
              vec3 extinction = rayleighScattering + vec3(rayleighAbsorption) + vec3(mieScattering) + vec3(mieAbsorption) + ozoneAbsorption;
              
              vec3 sampleTransmittance = exp(-dt*extinction);
              
              vec3 scatteringNoPhase = rayleighScattering + mieScattering;
              vec3 scatteringF = (scatteringNoPhase - scatteringNoPhase * sampleTransmittance) / extinction;
              lumFactor += transmittance*scatteringF;
              
              vec3 sunTransmittance = getValFromTLUT(tTransmittanceLUT, newPos, sunDir);
              
              vec3 rayleighInScattering = rayleighScattering*rayleighPhaseValue;
              float mieInScattering = mieScattering*miePhaseValue;
              vec3 inScattering = (rayleighInScattering + mieInScattering)*sunTransmittance;
              
              vec3 scatteringIntegral = (inScattering - inScattering * sampleTransmittance) / extinction;
              
              lum += scatteringIntegral*transmittance;
              transmittance *= sampleTransmittance;
            }
            
            if (groundDist > 0.0) {
              vec3 hitPos = pos + groundDist*rayDir;
              if (dot(pos, sunDir) > 0.0) {
                hitPos = normalize(hitPos)*groundRadiusMM;
                lum += transmittance*groundAlbedo*getValFromTLUT(tTransmittanceLUT, hitPos, sunDir);
              }
            }
            
            fms += lumFactor*invSamples;
            lumTotal += lum*invSamples;
          }
        }
        
        vec3 psi = lumTotal / (1.0 - fms);
        gl_FragColor = vec4(psi, 1.0);
      }
    `
    
    this.multipleScatteringMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tTransmittanceLUT: { value: null },
        mulScattSteps: { value: this.config.numMultipleScatteringSteps },
        sqrtSamples: { value: this.config.sqrtSamples }
      }
    })
  }

  private createSkyViewMaterial() {
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `
    
    const fragmentShader = `
      precision highp float;
      
      ${this.getAtmosphereChunk()}
      
      uniform sampler2D tTransmittanceLUT;
      uniform sampler2D tMultipleScatteringLUT;
      uniform vec3 sunDirection;
      uniform float cameraHeight;
      uniform float numScatteringSteps;
      
      vec3 getValFromTLUT(sampler2D tex, vec3 pos, vec3 sunDir) {
        float height = length(pos);
        vec3 up = pos / height;
        float sunCosZenithAngle = dot(sunDir, up);
        vec2 uv = vec2(
          clamp(0.5 + 0.5*sunCosZenithAngle, 0.0, 1.0),
          max(0.0, min(1.0, (height - groundRadiusMM) / (atmosphereRadiusMM - groundRadiusMM)))
        );
        return texture2D(tex, uv).rgb;
      }
      
      vec3 getValFromMultiScattLUT(sampler2D tex, vec3 pos, vec3 sunDir) {
        float height = length(pos);
        vec3 up = pos / height;
        float sunCosZenithAngle = dot(sunDir, up);
        vec2 uv = vec2(
          clamp(0.5 + 0.5*sunCosZenithAngle, 0.0, 1.0),
          max(0.0, min(1.0, (height - groundRadiusMM)/(atmosphereRadiusMM - groundRadiusMM)))
        );
        return texture2D(tex, uv).rgb;
      }
      
      vec4 raymarchScattering(vec3 pos, vec3 rayDir, vec3 sunDir, float tMax, float numSteps) {
        float cosTheta = dot(rayDir, sunDir);
        
        float miePhaseValue = getMiePhase(cosTheta);
        float rayleighPhaseValue = getRayleighPhase(-cosTheta);
        
        vec3 lum = vec3(0.0);
        vec3 transmittance = vec3(1.0);
        float t = 0.0;
        for (float i = 0.0; i < numSteps; i += 1.0) {
          float newT = ((i + 0.3)/numSteps)*tMax;
          float dt = newT - t;
          t = newT;
          
          vec3 newPos = pos + t*rayDir;
          
          // FIX: Calculate scattering values inline (GLSL ES 2.0 doesn't support 'out' parameters)
          float altitudeKM = (length(newPos) - groundRadiusMM) * 1000.0;
          float rayleighDensity = getRayleighDensity(altitudeKM);
          float mieDensity = getMieDensity(altitudeKM);
          
          vec3 rayleighScattering = rayleighScatteringBase * rayleighDensity;
          float rayleighAbsorption = rayleighAbsorptionBase * rayleighDensity;
          float mieScattering = mieScatteringBase * mieDensity;
          float mieAbsorption = mieAbsorptionBase * mieDensity;
          vec3 ozoneAbsorption = getOzoneAbsorption(altitudeKM);
          vec3 extinction = rayleighScattering + vec3(rayleighAbsorption) + vec3(mieScattering) + vec3(mieAbsorption) + ozoneAbsorption;
          
          vec3 sampleTransmittance = exp(-dt*extinction);
          
          vec3 sunTransmittance = getValFromTLUT(tTransmittanceLUT, newPos, sunDir);
          vec3 psiMS = getValFromMultiScattLUT(tMultipleScatteringLUT, newPos, sunDir);
          
          vec3 rayleighInScattering = rayleighScattering*(rayleighPhaseValue*sunTransmittance + psiMS);
          vec3 mieInScattering = mieScattering*(miePhaseValue*sunTransmittance + psiMS);
          vec3 inScattering = (rayleighInScattering + mieInScattering);
          
          vec3 scatteringIntegral = (inScattering - inScattering * sampleTransmittance) / extinction;
          
          lum += scatteringIntegral*transmittance;
          
          transmittance *= sampleTransmittance;
        }
        return vec4(lum, transmittance);
      }
      
      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(${this.config.skyViewSize.width}.0, ${this.config.skyViewSize.height}.0);
        
        float azimuthAngle = (uv.x - 0.5) * 2.0 * PI;
        
        // Non-linear mapping of altitude (Streets GL style)
        float adjV;
        if (uv.y < 0.5) {
          float coord = 1.0 - 2.0 * uv.y;
          adjV = -coord * coord;
        } else {
          float coord = uv.y * 2.0 - 1.0;
          adjV = coord * coord;
        }
        
        float height = groundRadiusMM + cameraHeight;
        float horizonAngle = safeacos(sqrt(height * height - groundRadiusMM * groundRadiusMM) / height) - 0.5 * PI;
        float altitudeAngle = adjV * 0.5 * PI - horizonAngle;
        
        float cosAltitude = cos(altitudeAngle);
        vec3 rayDir = vec3(cosAltitude*sin(azimuthAngle), sin(altitudeAngle), -cosAltitude * cos(azimuthAngle));
        
        float atmoDist = rayIntersectSphere(viewPos, rayDir, atmosphereRadiusMM);
        float groundDist = rayIntersectSphere(viewPos, rayDir, groundRadiusMM);
        float tMax = (groundDist < 0.0) ? atmoDist : groundDist;
        
        vec4 result = raymarchScattering(viewPos, rayDir, -sunDirection, tMax, numScatteringSteps);
        gl_FragColor = result;
      }
    `
    
    this.skyViewMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tTransmittanceLUT: { value: null },
        tMultipleScatteringLUT: { value: null },
        sunDirection: { value: new THREE.Vector3() },
        cameraHeight: { value: 0.0 },
        numScatteringSteps: { value: this.config.numScatteringSteps }
      }
    })
  }

  private getAtmosphereChunk(): string {
    // This will be replaced with the actual atmosphere.glsl chunk
    // For now, we'll inline the essential functions
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
      
      // FIX: GLSL ES 2.0 doesn't support 'out' parameters - use helper functions instead
      float getRayleighDensity(float altitudeKM) {
        return exp(-altitudeKM/8.0);
      }
      
      float getMieDensity(float altitudeKM) {
        return exp(-altitudeKM/1.2);
      }
      
      vec3 getOzoneAbsorption(float altitudeKM) {
        return ozoneAbsorptionBase * max(0.0, 1.0 - abs(altitudeKM - 25.0) / 15.0);
      }
      
      // Scattering values are now calculated inline (GLSL ES 2.0 doesn't support 'out' or 'inout' parameters)
      
      // FIX: GLSL ES 2.0 doesn't allow 'const' in function parameters
      float safeacos(float x) {
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
    // This prevents "useProgram: program not valid" errors when the main render loop
    // tries to use shaders while LUT generation is compiling its own shaders
    // Use double frame delay to ensure main render loop is stable
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._generateStaticLUTsSync()
      })
    })
  }

  /**
   * Internal method to generate static LUTs synchronously
   * Called from generateStaticLUTs() after deferring to next frame
   */
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
   * CRITICAL: Returns a promise to allow async LUT generation and prevent shader conflicts
   */
  public generateSkyViewLUT(sunDirection: THREE.Vector3, cameraHeight: number = 0.0, forceUpdate: boolean = false): THREE.Texture | null {
    // Check if we need to regenerate
    // IMPROVED: Added forceUpdate parameter to allow frame-based updates
    // For smoother transitions, can be called every frame with forceUpdate=true
    const needsUpdate = forceUpdate ||
      !this.lastSunDirection ||
      !this.lastSunDirection.equals(sunDirection) ||
      this.lastCameraHeight !== cameraHeight
    
    if (!needsUpdate && this.skyViewLUT) {
      return this.skyViewLUT.texture
    }
    
    // Ensure static LUTs are ready first
    if (!this.staticLUTsReady) {
      // If static LUTs aren't ready, generate them and defer Sky View LUT generation
      this.generateStaticLUTs()
      // Defer Sky View LUT generation with multiple frame delay to ensure static LUTs complete
      // Static LUTs need 2 frames, so Sky View LUT needs 3 frames total
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this._generateSkyViewLUTSync(sunDirection, cameraHeight)
          })
        })
      })
      // Return null for now - will be available after static LUTs are ready
      return null
    }
    
    return this._generateSkyViewLUTSync(sunDirection, cameraHeight)
  }

  /**
   * Internal method to generate Sky View LUT synchronously
   * Called from generateSkyViewLUT() after ensuring static LUTs are ready
   */
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
    
    const texture = this.skyViewLUT?.texture || null
    if (texture && this.skyViewLUT) {
      console.log('[AtmosphereLUTSystem] Sky View LUT generated:', {
        width: this.skyViewLUT.width,
        height: this.skyViewLUT.height,
        format: texture.format,
        sunDirection: sunDirection,
        cameraHeight: cameraHeight
      })
    } else {
      console.warn('[AtmosphereLUTSystem] Failed to generate Sky View LUT texture')
    }
    
    return texture
  }

  /**
   * Get Sky View LUT texture (for use in sky rendering)
   */
  public getSkyViewTexture(sunDirection: THREE.Vector3, cameraHeight: number = 0.0, forceUpdate: boolean = false): THREE.Texture | null {
    return this.generateSkyViewLUT(sunDirection, cameraHeight, forceUpdate)
  }

  /**
   * Cleanup
   */
  public dispose() {
    if (this.transmittanceLUT) {
      this.transmittanceLUT.dispose()
      this.transmittanceLUT = null
    }
    if (this.multipleScatteringLUT) {
      this.multipleScatteringLUT.dispose()
      this.multipleScatteringLUT = null
    }
    if (this.skyViewLUT) {
      this.skyViewLUT.dispose()
      this.skyViewLUT = null
    }
    if (this.transmittanceMaterial) {
      this.transmittanceMaterial.dispose()
      this.transmittanceMaterial = null
    }
    if (this.multipleScatteringMaterial) {
      this.multipleScatteringMaterial.dispose()
      this.multipleScatteringMaterial = null
    }
    if (this.skyViewMaterial) {
      this.skyViewMaterial.dispose()
      this.skyViewMaterial = null
    }
    if (this.fullscreenQuad) {
      this.fullscreenQuad.geometry.dispose()
      this.fullscreenQuad = null
    }
  }
}

