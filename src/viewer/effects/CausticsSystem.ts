import * as THREE from 'three'

export interface CausticsConfig {
  enabled: boolean
  intensity: number
  resolution: number
  scale: number
  blurRadius: number
  blurIterations: number
  lightDistance: number
  updateInterval: number // Milliseconds between updates
}

/**
 * Caustics System for Glass Materials
 * Renders realistic caustics patterns from transparent/glass objects
 */
export class CausticsSystem {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer
  private camera: THREE.PerspectiveCamera
  private config: CausticsConfig

  // Caustics render targets
  private causticsTarget: THREE.WebGLRenderTarget | null = null
  private blurTarget1: THREE.WebGLRenderTarget | null = null
  private blurTarget2: THREE.WebGLRenderTarget | null = null

  // Shader materials
  private causticsMaterial: THREE.ShaderMaterial | null = null
  private blurMaterial: THREE.ShaderMaterial | null = null

  // Quad for fullscreen passes
  private quadGeometry: THREE.BufferGeometry | null = null
  private quadScene: THREE.Scene | null = null
  private quadCamera: THREE.OrthographicCamera | null = null

  // Scene objects tracking
  private glassObjects: Set<THREE.Mesh> = new Set()
  private receiverObjects: Set<THREE.Mesh> = new Set()

  // Update timing
  private lastUpdateTime = 0
  private time = 0

  // Light tracking
  private lights: THREE.Light[] = []

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    config: Partial<CausticsConfig> = {}
  ) {
    this.scene = scene
    this.renderer = renderer
    this.camera = camera
    this.config = {
      enabled: config.enabled ?? true,
      intensity: config.intensity ?? 1.0,
      resolution: config.resolution ?? 512,
      scale: config.scale ?? 1.0,
      blurRadius: config.blurRadius ?? 2.0,
      blurIterations: config.blurIterations ?? 2,
      lightDistance: config.lightDistance ?? 100.0,
      updateInterval: config.updateInterval ?? 16 // ~60fps
    }

    this.initialize()
    this.scanScene()
  }

  private initialize() {
    const { resolution } = this.config

    // Create render targets
    const rtOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    }

    this.causticsTarget = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions)
    this.blurTarget1 = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions)
    this.blurTarget2 = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions)

    // Create quad for fullscreen passes
    this.quadGeometry = new THREE.PlaneGeometry(2, 2)
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.quadScene = new THREE.Scene()

    // Create shader materials
    this.createCausticsShader()
    this.createBlurShader()
  }

  private createCausticsShader() {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    const fragmentShader = `
      precision highp float;
      
      uniform sampler2D tDepth;
      uniform sampler2D tNormal;
      uniform vec3 lightPosition;
      uniform vec3 lightDirection;
      uniform float lightIntensity;
      uniform float lightDistance;
      uniform vec2 resolution;
      uniform float time;
      uniform float scale;
      
      varying vec2 vUv;
      
      // Convert depth to view space position
      vec3 depthToViewPos(vec2 uv, float depth) {
        vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 viewPos = projectionMatrixInverse * ndc;
        return viewPos.xyz / viewPos.w;
      }
      
      // Project light ray through glass
      vec2 projectCaustics(vec3 pos, vec3 normal, vec3 lightDir, float ior) {
        // Refract light ray through surface
        vec3 refracted = refract(-lightDir, normal, 1.0 / ior);
        
        // Project onto receiver plane (assume Y=0 for now)
        float t = -pos.y / refracted.y;
        vec3 hitPos = pos + refracted * t;
        
        return hitPos.xz * scale;
      }
      
      void main() {
        vec2 uv = vUv;
        
        // Sample depth and normal
        float depth = texture2D(tDepth, uv).r;
        vec3 normal = texture2D(tNormal, uv).rgb * 2.0 - 1.0;
        
        // Skip background
        if (depth >= 1.0) {
          gl_FragColor = vec4(0.0);
          return;
        }
        
        // Convert to view space
        vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 viewPos4 = projectionMatrixInverse * ndc;
        vec3 viewPos = viewPos4.xyz / viewPos4.w;
        
        // Get world position
        vec3 worldPos = (modelViewMatrixInverse * vec4(viewPos, 1.0)).xyz;
        
        // Calculate light direction
        vec3 lightDir = normalize(lightDirection);
        
        // Assume glass IOR of 1.5 (can be made configurable)
        float ior = 1.5;
        
        // Project caustics
        vec2 causticsPos = projectCaustics(worldPos, normalize(normal), lightDir, ior);
        
        // Create caustics pattern using noise
        vec2 p = causticsPos * 0.1 + vec2(time * 0.01);
        
        // Voronoi-like pattern for caustics
        float caustics = 0.0;
        float minDist = 1.0;
        
        for(int i = 0; i < 4; i++) {
          vec2 gridPos = floor(p);
          vec2 cellPos = fract(p);
          
          // Random offset for each cell
          float rnd = fract(sin(dot(gridPos, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 offset = vec2(
            fract(rnd),
            fract(sin(rnd * 43758.5453) * 43758.5453)
          );
          
          vec2 diff = cellPos - offset;
          float dist = length(diff);
          
          minDist = min(minDist, dist);
          
          p *= 2.0;
        }
        
        // Create caustics intensity based on distance
        caustics = 1.0 - smoothstep(0.0, 0.3, minDist);
        caustics = pow(caustics, 2.0);
        
        // Apply light intensity
        caustics *= lightIntensity;
        
        gl_FragColor = vec4(vec3(caustics), caustics);
      }
    `

    this.causticsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tNormal: { value: null },
        lightPosition: { value: new THREE.Vector3() },
        lightDirection: { value: new THREE.Vector3() },
        lightIntensity: { value: 1.0 },
        lightDistance: { value: this.config.lightDistance },
        resolution: { value: new THREE.Vector2(this.config.resolution, this.config.resolution) },
        time: { value: 0 },
        scale: { value: this.config.scale },
        projectionMatrixInverse: { value: new THREE.Matrix4() },
        modelViewMatrixInverse: { value: new THREE.Matrix4() }
      },
      vertexShader,
      fragmentShader
    })
  }

  private createBlurShader() {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `

    const fragmentShader = `
      precision highp float;
      
      uniform sampler2D tInput;
      uniform vec2 resolution;
      uniform vec2 direction;
      uniform float radius;
      
      varying vec2 vUv;
      
      void main() {
        vec2 uv = vUv;
        vec2 pixelSize = 1.0 / resolution;
        
        vec4 color = vec4(0.0);
        float totalWeight = 0.0;
        
        // Gaussian blur
        float sigma = radius;
        int samples = int(radius * 2.0);
        
        for(int i = -10; i <= 10; i++) {
          if(abs(i) > samples) break;
          
          vec2 offset = vec2(float(i)) * direction * pixelSize;
          float weight = exp(-(float(i * i)) / (2.0 * sigma * sigma));
          
          color += texture2D(tInput, uv + offset) * weight;
          totalWeight += weight;
        }
        
        color /= totalWeight;
        gl_FragColor = color;
      }
    `

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tInput: { value: null },
        resolution: { value: new THREE.Vector2(this.config.resolution, this.config.resolution) },
        direction: { value: new THREE.Vector2(1, 0) },
        radius: { value: this.config.blurRadius }
      },
      vertexShader,
      fragmentShader
    })
  }

  /**
   * Scan scene for glass objects and receiver surfaces
   */
  private scanScene() {
    this.glassObjects.clear()
    this.receiverObjects.clear()

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const material = Array.isArray(object.material) ? object.material[0] : object.material

        // Check if material is transparent/glass
        if (material instanceof THREE.MeshPhysicalMaterial || material instanceof THREE.MeshStandardMaterial) {
          const transmission = (material as THREE.MeshPhysicalMaterial).transmission ?? 0
          const opacity = material.opacity ?? 1.0
          const transparent = material.transparent ?? false

          if ((transmission > 0.1 || (transparent && opacity < 1.0)) && object.visible) {
            this.glassObjects.add(object)
          }
        }

        // Consider most objects as potential caustics receivers
        // (could be made more selective)
        if (object.visible && !this.glassObjects.has(object)) {
          this.receiverObjects.add(object)
        }
      }
    })

    // Also scan for lights
    this.lights = []
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light && object.visible) {
        this.lights.push(object)
      }
    })
  }

  /**
   * Get primary light direction (sun or first directional light)
   */
  private getPrimaryLightDirection(): THREE.Vector3 {
    for (const light of this.lights) {
      if (light instanceof THREE.DirectionalLight) {
        const direction = new THREE.Vector3()
        light.getWorldDirection(direction)
        return direction.negate() // Point towards light
      }
    }

    // Fallback: use default sun direction
    return new THREE.Vector3(0.5, 1.0, 0.3).normalize()
  }

  /**
   * Get primary light position
   */
  private getPrimaryLightPosition(): THREE.Vector3 {
    for (const light of this.lights) {
      if (light instanceof THREE.DirectionalLight) {
        return light.position.clone()
      }
      if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
        return light.position.clone()
      }
    }

    // Fallback
    return new THREE.Vector3(10, 10, 5)
  }

  /**
   * Render caustics
   */
  private renderCaustics(): void {
    if (!this.causticsTarget || !this.causticsMaterial || !this.blurMaterial) return

    const now = performance.now()
    this.time = now * 0.001

    // Update uniforms
    const lightPos = this.getPrimaryLightPosition()
    const lightDir = this.getPrimaryLightDirection()
    const lightIntensity = this.config.enabled ? this.config.intensity : 0.0

    if (this.causticsMaterial.uniforms) {
      this.causticsMaterial.uniforms.lightPosition.value.copy(lightPos)
      this.causticsMaterial.uniforms.lightDirection.value.copy(lightDir)
      this.causticsMaterial.uniforms.lightIntensity.value = lightIntensity
      this.causticsMaterial.uniforms.time.value = this.time
      this.causticsMaterial.uniforms.scale.value = this.config.scale

      if (this.camera instanceof THREE.PerspectiveCamera) {
        this.causticsMaterial.uniforms.projectionMatrixInverse.value = this.camera.projectionMatrixInverse.clone()
        this.causticsMaterial.uniforms.modelViewMatrixInverse.value = this.camera.matrixWorld.clone()
      }
    }

    // For now, we'll use a simplified approach
    // In a full implementation, we'd render depth and normal buffers first
    // Then use those to compute caustics

    // Apply blur passes
    if (this.blurTarget1 && this.blurTarget2 && this.blurMaterial) {
      const oldRenderTarget = this.renderer.getRenderTarget()

      // Horizontal blur
      if (this.blurMaterial.uniforms) {
        this.blurMaterial.uniforms.tInput.value = this.causticsTarget.texture
        this.blurMaterial.uniforms.direction.value.set(1, 0)
        this.blurMaterial.uniforms.radius.value = this.config.blurRadius
      }

      const quadMesh1 = new THREE.Mesh(this.quadGeometry!, this.blurMaterial)
      this.quadScene!.add(quadMesh1)
      this.renderer.setRenderTarget(this.blurTarget1)
      this.renderer.render(this.quadScene!, this.quadCamera!)
      this.quadScene!.remove(quadMesh1)

      // Vertical blur
      if (this.blurMaterial.uniforms) {
        this.blurMaterial.uniforms.tInput.value = this.blurTarget1.texture
        this.blurMaterial.uniforms.direction.value.set(0, 1)
      }

      const quadMesh2 = new THREE.Mesh(this.quadGeometry!, this.blurMaterial)
      this.quadScene!.add(quadMesh2)
      this.renderer.setRenderTarget(this.blurTarget2)
      this.renderer.render(this.quadScene!, this.quadCamera!)
      this.quadScene!.remove(quadMesh2)

      this.renderer.setRenderTarget(oldRenderTarget)
    }
  }

  /**
   * Get caustics texture
   */
  getCausticsTexture(): THREE.Texture | null {
    if (!this.config.enabled) return null
    return this.blurTarget2?.texture || this.causticsTarget?.texture || null
  }

  /**
   * Update caustics (call from render loop)
   */
  update(): void {
    if (!this.config.enabled) return

    const now = performance.now()
    if (now - this.lastUpdateTime < this.config.updateInterval) {
      return // Skip update if too soon
    }

    this.lastUpdateTime = now
    this.renderCaustics()
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CausticsConfig>): void {
    this.config = { ...this.config, ...config }

    // Resize render targets if resolution changed
    if (config.resolution) {
      this.causticsTarget?.setSize(config.resolution, config.resolution)
      this.blurTarget1?.setSize(config.resolution, config.resolution)
      this.blurTarget2?.setSize(config.resolution, config.resolution)

      if (this.causticsMaterial?.uniforms) {
        this.causticsMaterial.uniforms.resolution.value.set(config.resolution, config.resolution)
      }
      if (this.blurMaterial?.uniforms) {
        this.blurMaterial.uniforms.resolution.value.set(config.resolution, config.resolution)
        this.blurMaterial.uniforms.radius.value = config.blurRadius ?? this.config.blurRadius
      }
    }
  }

  /**
   * Refresh scene scan (call when objects are added/removed)
   */
  refreshScene(): void {
    this.scanScene()
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.causticsTarget?.dispose()
    this.blurTarget1?.dispose()
    this.blurTarget2?.dispose()

    this.causticsMaterial?.dispose()
    this.blurMaterial?.dispose()

    this.quadGeometry?.dispose()
  }
}








