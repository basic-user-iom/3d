import * as THREE from 'three'

export interface StandaloneWaterConfig {
  enabled: boolean
  level: number // Y position of water surface
  color: string // Water color (hex string)
  opacity: number // Water opacity (0-1)
  waveSpeed: number // Wave animation speed
  waveHeight: number // Wave height
  reflectivity: number // Water reflectivity (0-1)
  sunDirection?: THREE.Vector3 // Sun direction for reflections
}

/**
 * Standalone Water System
 * Renders water planes that work with the standalone weather system
 * Can be extended to support OSM-based water data in the future
 */
export class StandaloneWaterSystem {
  private scene: THREE.Scene
  private config: StandaloneWaterConfig
  private waterPlane: THREE.Mesh | null = null
  private material: THREE.ShaderMaterial | null = null
  private time: number = 0
  private isInitialized: boolean = false
  private uniforms: {
    time: { value: number }
    waveHeight: { value: number }
    waveSpeed: { value: number }
    waterColor: { value: THREE.Color }
    opacity: { value: number }
    reflectivity: { value: number }
    sunDirection: { value: THREE.Vector3 }
    // Fog uniforms (required by Three.js even when fog is disabled)
    fogColor: { value: THREE.Color }
    fogDensity: { value: number }
    fogNear: { value: number }
    fogFar: { value: number }
    fogExp2: { value: number }
  } | null = null

  constructor(scene: THREE.Scene, config: StandaloneWaterConfig) {
    this.scene = scene
    this.config = config
    this.setup()
  }

  /**
   * Setup water rendering
   */
  private setup(): void {
    this.isInitialized = false
    
    if (!this.config.enabled) {
      this.destroy()
      return
    }

    // Remove existing water if present
    if (this.waterPlane) {
      this.scene.remove(this.waterPlane)
      if (this.waterPlane.geometry) {
        this.waterPlane.geometry.dispose()
      }
      this.waterPlane = null
    }

    // Create water plane geometry
    const geometry = new THREE.PlaneGeometry(10000, 10000, 128, 128)
    
    // Parse color
    const waterColor = new THREE.Color(this.config.color)
    const opacity = Math.max(0.0, Math.min(1.0, this.config.opacity))
    const reflectivity = Math.max(0.0, Math.min(1.0, this.config.reflectivity))
    
    // Initialize uniforms
    this.uniforms = {
      time: { value: 0 },
      waveHeight: { value: Math.max(0.0, this.config.waveHeight) },
      waveSpeed: { value: Math.max(0.0, this.config.waveSpeed) },
      waterColor: { value: waterColor },
      opacity: { value: opacity },
      reflectivity: { value: reflectivity },
      sunDirection: { value: this.config.sunDirection || new THREE.Vector3(0, 1, 0) },
      // Fog uniforms (required by Three.js even when fog is disabled)
      fogColor: { value: new THREE.Color(0xffffff) },
      fogDensity: { value: 0.0 },
      fogNear: { value: 1.0 },
      fogFar: { value: 2000.0 },
      fogExp2: { value: 0.0 }
    }

    // Vertex shader with wave animation
    const vertexShader = `
      precision highp float;
      
      uniform float time;
      uniform float waveHeight;
      uniform float waveSpeed;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      // Simple wave function
      float wave(vec2 pos, float frequency, float speed) {
        return sin(dot(pos, vec2(frequency, frequency * 0.7)) + time * speed) * waveHeight;
      }
      
      void main() {
        vec3 pos = position;
        
        // Apply multiple wave layers for realistic water
        pos.y += wave(pos.xz, 0.02, waveSpeed);
        pos.y += wave(pos.xz, 0.04, waveSpeed * 1.3) * 0.5;
        pos.y += wave(pos.xz, 0.08, waveSpeed * 1.7) * 0.25;
        
        vPosition = pos;
        vNormal = normalize(normal);
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `

    // Fragment shader with realistic water appearance
    const fragmentShader = `
      precision highp float;
      
      uniform float time;
      uniform vec3 waterColor;
      uniform float opacity;
      uniform float reflectivity;
      uniform vec3 sunDirection;
      // cameraPosition is provided by Three.js automatically, don't redefine it
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 normal = normalize(vNormal);
        
        // Fresnel effect for water
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);
        
        // Sun reflection
        vec3 reflectDir = reflect(-normalize(sunDirection), normal);
        float sunReflection = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
        
        // Water color with depth variation
        vec3 finalColor = waterColor;
        finalColor = mix(finalColor * 0.5, finalColor, fresnel);
        finalColor += vec3(sunReflection * reflectivity * 0.5);
        
        gl_FragColor = vec4(finalColor, opacity);
      }
    `

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: opacity < 1.0,
      side: THREE.FrontSide,
      depthWrite: opacity > 0.99,
      depthTest: true,
      fog: false, // Water doesn't use fog (atmospheric perspective is handled separately)
      name: 'StandaloneWaterShader'
    })

    // Create water plane
    this.waterPlane = new THREE.Mesh(geometry, this.material)
    this.waterPlane.position.y = this.config.level
    this.waterPlane.rotation.x = -Math.PI / 2
    this.waterPlane.receiveShadow = true
    this.waterPlane.castShadow = false
    this.waterPlane.userData.isWater = true
    this.waterPlane.userData.isStandaloneWater = true
    this.scene.add(this.waterPlane)

    this.isInitialized = true

    console.log('[StandaloneWaterSystem] Water system initialized:', {
      level: this.config.level,
      color: this.config.color,
      opacity: this.config.opacity
    })
  }

  /**
   * Update water system (call in render loop)
   */
  public update(camera?: THREE.Camera, sunDirection?: THREE.Vector3): void {
    // Safety checks: ensure everything is initialized
    if (!this.config.enabled || !this.isInitialized || !this.uniforms || !this.material || !this.waterPlane) {
      return
    }

    // Additional check: ensure material uniforms are accessible
    if (!this.material.uniforms) {
      return
    }

    try {
      // Update time for wave animation
      this.time += 0.016 // ~60fps
      if (this.uniforms.time && this.uniforms.time.value !== undefined) {
        this.uniforms.time.value = this.time
      }

      // Note: cameraPosition is automatically provided by Three.js, no need to update it manually

      // Update sun direction
      if (sunDirection && this.uniforms.sunDirection && this.uniforms.sunDirection.value) {
        this.uniforms.sunDirection.value.copy(sunDirection)
      }
    } catch (error) {
      // Silently handle errors during update (prevents console spam)
      // Only log once to avoid spam
      if (!(this as any)._updateErrorLogged) {
        console.warn('[StandaloneWaterSystem] Update error:', error)
        ;(this as any)._updateErrorLogged = true
      }
    }
  }

  /**
   * Update water config
   */
  public updateConfig(config: Partial<StandaloneWaterConfig>): void {
    this.config = { ...this.config, ...config }
    this.setup()
  }

  /**
   * Set sun direction
   */
  public setSunDirection(direction: THREE.Vector3): void {
    this.config.sunDirection = direction
    if (this.uniforms && this.uniforms.sunDirection) {
      this.uniforms.sunDirection.value.copy(direction)
    }
  }

  /**
   * Get current config
   */
  public getConfig(): StandaloneWaterConfig {
    return { ...this.config }
  }

  /**
   * Enable/disable water
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    this.setup()
  }

  /**
   * Destroy water system
   */
  public destroy(): void {
    if (this.waterPlane) {
      this.scene.remove(this.waterPlane)
      if (this.waterPlane.geometry) {
        this.waterPlane.geometry.dispose()
      }
      if (this.material) {
        this.material.dispose()
      }
      this.waterPlane = null
      this.material = null
    }
    this.uniforms = null
    this.isInitialized = false
    console.log('[StandaloneWaterSystem] Water system destroyed')
  }
}

