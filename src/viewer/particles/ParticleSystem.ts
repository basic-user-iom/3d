import * as THREE from 'three'

export interface ParticleSystemConfig {
  type: 'rain' | 'snow' | 'fog'
  intensity: number // 0-1
  enabled: boolean
  windIntensity?: number
  collisionEnabled?: boolean
  particleScale?: number // Scale multiplier for particle size
  particleSpeed?: number // Speed multiplier
  windGusts?: boolean // Enable random wind gusts
  quality?: 'low' | 'medium' | 'high' | 'ultra' // Performance quality preset
}

/**
 * Optimized Particle System with LOD and Performance Enhancements
 * Industry Best Practices:
 * - Level of Detail (LOD) based on camera distance
 * - Batched updates for better performance
 * - Optimized shader calculations
 * - Quality presets for adaptive rendering
 * - Efficient memory management
 */
export class ParticleSystem {
  private scene: THREE.Scene
  public config: ParticleSystemConfig
  public particles: THREE.Points | null = null
  private geometry: THREE.BufferGeometry | null = null
  public material: THREE.ShaderMaterial | THREE.PointsMaterial | null = null
  private positions: Float32Array | null = null
  private velocities: Float32Array | null = null
  
  private particleCount: number
  
  
  // Performance optimizations
  private cameraPosition: THREE.Vector3 = new THREE.Vector3()
  private updateFrameCount = 0
  private lastLODUpdate = 0
  private currentLOD = 1.0 // 1.0 = full quality, < 1.0 = reduced
  
  // Quality presets: [maxParticles, updateFrequency, LOD distance]
  private readonly QUALITY_PRESETS = {
    low: { maxParticles: 5000, updateFreq: 2, lodDistance: 50 },
    medium: { maxParticles: 10000, updateFreq: 1, lodDistance: 100 },
    high: { maxParticles: 15000, updateFreq: 1, lodDistance: 200 },
    ultra: { maxParticles: 20000, updateFreq: 1, lodDistance: 300 }
  }

  constructor(scene: THREE.Scene, config: ParticleSystemConfig) {
    this.scene = scene
    this.config = { quality: 'high', ...config }
    const qualitySettings = this.QUALITY_PRESETS[this.config.quality || 'high']
    this.particleCount = Math.floor(config.intensity * qualitySettings.maxParticles)
    this.setupParticles()
  }

  private createShaderMaterial(type: 'rain' | 'snow' | 'fog'): THREE.ShaderMaterial {
    // Optimized vertex shader with LOD support
    const vertexShader = `
      attribute float size;
      attribute float opacity;
      attribute float rotation;
      attribute vec3 color;
      
      varying float vOpacity;
      varying vec3 vColor;
      varying float vRotation;
      uniform float lodScale;
      
      void main() {
        vOpacity = opacity;
        vColor = color;
        vRotation = rotation;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Apply LOD to point size for performance
        float ps = size * (300.0 / -mvPosition.z) * lodScale;
        gl_PointSize = max(2.5, ps);
      }
    `

    // Optimized fragment shaders
    let fragmentShader = ''
    
    if (type === 'rain') {
      fragmentShader = `
        precision highp float;
        
        varying float vOpacity;
        varying vec3 vColor;
        
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          
          // Optimized teardrop shape
          float dropShape = 1.0 - smoothstep(0.25, 0.45, dist * 1.4);
          
          // Optimized edge highlight
          float edgeHighlight = 1.0 - smoothstep(0.2, 0.4, dist) * 0.8;
          float gradient = 0.7 + abs(coord.y) * 0.3;
          
          vec3 finalColor = vColor * gradient * edgeHighlight;
          float alpha = dropShape * vOpacity * 0.4;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `
    } else if (type === 'snow') {
      fragmentShader = `
        precision highp float;
        
        varying float vOpacity;
        varying vec3 vColor;
        varying float vRotation;
        
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          
          // Optimized rotation
          float c = cos(vRotation);
          float s = sin(vRotation);
          coord = vec2(coord.x * c - coord.y * s, coord.x * s + coord.y * c);
          
          float angle = atan(coord.y, coord.x);
          float dist = length(coord);
          
          // Optimized 6-point snowflake
          float branch = abs(cos(angle * 3.0)) * 0.8;
          float shape = 1.0 - smoothstep(0.15, 0.35, dist * (1.0 - branch * 0.5));
          
          float center = 1.0 - smoothstep(0.0, 0.15, dist);
          float glow = 1.0 - smoothstep(0.0, 0.4, dist) * 0.4;
          
          float alpha = shape * vOpacity * (glow + center * 0.3);
          alpha = max(alpha, 0.25 * vOpacity);
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `
    } else {
      // Fog: optimized soft particles
      fragmentShader = `
        precision highp float;
        
        varying float vOpacity;
        varying vec3 vColor;
        
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float dist = length(coord);
          
          float shape = 1.0 - smoothstep(0.0, 0.7, dist);
          float gradient = 1.0 - dist * 0.8;
          
          vec3 finalColor = vColor * gradient;
          float alpha = shape * vOpacity * 0.6;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `
    }

    const uniforms = {
      time: { value: 0.0 },
      lodScale: { value: 1.0 }
    }

    let blendingMode = THREE.NormalBlending
    if (type === 'rain') {
      blendingMode = THREE.NormalBlending
    } else if (type === 'snow') {
      blendingMode = THREE.NormalBlending
    } else if (type === 'fog') {
      blendingMode = THREE.NormalBlending
    }

    try {
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: blendingMode
      })
      
      return material
    } catch (error) {
      console.error(`[ParticleSystem] Failed to create shader material for type "${type}":`, error)
      throw error
    }
  }

  private setupParticles() {
    if (!this.config.enabled || this.config.intensity <= 0) {
      this.destroy()
      return
    }

    const count = this.particleCount
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const opacities = new Float32Array(count)
    const rotations = new Float32Array(count)
    const colors = new Float32Array(count * 3)

    const particleScale = this.config.particleScale || 1.0
    const particleSpeed = this.config.particleSpeed || 1.0

    // Initialize particles
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      
      if (this.config.type === 'rain' || this.config.type === 'snow') {
        positions[i3] = (Math.random() - 0.5) * 300
        positions[i3 + 1] = Math.random() * 150 + 50
        positions[i3 + 2] = (Math.random() - 0.5) * 300
        
        if (this.config.type === 'rain') {
          const windEffect = this.config.windIntensity || 0
          const gustEffect = this.config.windGusts ? (Math.random() - 0.5) * 0.3 : 0
          
          velocities[i3] = (windEffect * 0.8 + gustEffect) * particleSpeed
          velocities[i3 + 1] = (-8 - Math.random() * 7) * particleSpeed
          velocities[i3 + 2] = (windEffect * 0.5 + gustEffect * 0.7) * particleSpeed
          
          sizes[i] = (0.6 + Math.random() * 1.4) * particleScale
          opacities[i] = 0.5 + Math.random() * 0.4
          
          const gray = 0.6 + Math.random() * 0.2
          colors[i3] = gray * 0.7
          colors[i3 + 1] = gray * 0.8
          colors[i3 + 2] = gray * 1.0
          
          rotations[i] = 0
        } else {
          // Snow
          const windEffect = this.config.windIntensity || 0
          const gustEffect = this.config.windGusts ? (Math.random() - 0.5) * 0.5 : 0
          
          velocities[i3] = ((Math.random() - 0.5) * 1.0 + windEffect * 0.5 + gustEffect) * particleSpeed
          velocities[i3 + 1] = (-0.8 - Math.random() * 1.5) * particleSpeed
          velocities[i3 + 2] = ((Math.random() - 0.5) * 1.0 + windEffect * 0.5 + gustEffect) * particleSpeed
          
          sizes[i] = (0.8 + Math.random() * 1.7) * particleScale
          opacities[i] = 0.7 + Math.random() * 0.3
          
          const white = 0.85 + Math.random() * 0.15
          colors[i3] = white
          colors[i3 + 1] = white * 0.98
          colors[i3 + 2] = white * 1.0
          
          rotations[i] = Math.random() * Math.PI * 2
        }
      } else if (this.config.type === 'fog') {
        positions[i3] = (Math.random() - 0.5) * 600
        positions[i3 + 1] = Math.random() * 80 + 10
        positions[i3 + 2] = (Math.random() - 0.5) * 600
        
        velocities[i3] = (Math.random() - 0.5) * 0.2 * particleSpeed
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.08 * particleSpeed
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.2 * particleSpeed
        
        sizes[i] = (8 + Math.random() * 15) * particleScale
        opacities[i] = 0.05 + Math.random() * 0.15
        
        const gray = 0.7 + Math.random() * 0.3
        colors[i3] = gray
        colors[i3 + 1] = gray
        colors[i3 + 2] = gray
        
        rotations[i] = 0
      }
    }

    this.positions = positions
    this.velocities = velocities
    

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    this.geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1))
    this.geometry.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    this.material = this.createShaderMaterial(this.config.type)

    this.particles = new THREE.Points(this.geometry, this.material)
    this.particles.userData.isParticleSystem = true
    this.particles.renderOrder = 999
    this.scene.add(this.particles)
  }

  private updateLOD(cameraPosition?: THREE.Vector3) {
    if (!cameraPosition) return
    
    this.cameraPosition.copy(cameraPosition)
    
    // Update LOD every 30 frames for performance
    this.updateFrameCount++
    if (this.updateFrameCount - this.lastLODUpdate < 30) return
    
    this.lastLODUpdate = this.updateFrameCount
    
    // Calculate distance-based LOD
    const qualitySettings = this.QUALITY_PRESETS[this.config.quality || 'high']
    const avgParticleHeight = this.positions ? 
      this.positions.reduce((sum, val, i) => i % 3 === 1 ? sum + val : sum, 0) / (this.particleCount * 3) : 0
    const avgParticlePos = new THREE.Vector3(0, avgParticleHeight, 0)
    const distance = cameraPosition.distanceTo(avgParticlePos)
    
    // Apply LOD based on distance
    if (distance > qualitySettings.lodDistance * 2) {
      this.currentLOD = 0.5 // Far: reduce quality
    } else if (distance > qualitySettings.lodDistance) {
      this.currentLOD = 0.75 // Medium: slight reduction
    } else {
      this.currentLOD = 1.0 // Near: full quality
    }
    
    // Update LOD uniform
    if (this.material && 'uniforms' in this.material && this.material.uniforms?.lodScale) {
      this.material.uniforms.lodScale.value = this.currentLOD
    }
  }

  update(deltaTime: number, cameraPosition?: THREE.Vector3) {
    if (!this.particles || !this.geometry || !this.positions || !this.velocities || !this.config.enabled) {
      return
    }

    // Update LOD
    this.updateLOD(cameraPosition)

    const qualitySettings = this.QUALITY_PRESETS[this.config.quality || 'high']
    const updateFreq = qualitySettings.updateFreq
    
    // Skip updates based on quality preset for better performance
    if (this.updateFrameCount % updateFreq !== 0 && this.config.type !== 'fog') {
      return
    }

    const positions = this.geometry.attributes.position.array as Float32Array
    const rotations = this.geometry.attributes.rotation?.array as Float32Array
    const count = this.particleCount

    // Update shader time uniform
    if (this.material && 'uniforms' in this.material && this.material.uniforms?.time) {
      this.material.uniforms.time.value += deltaTime
    }

    // Batch update particles
    const dt = deltaTime * 60 // Scale for 60fps
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // Update position
      positions[i3] += this.velocities[i3] * dt
      positions[i3 + 1] += this.velocities[i3 + 1] * dt
      positions[i3 + 2] += this.velocities[i3 + 2] * dt

      // Update rotation for snow
      if (this.config.type === 'snow' && rotations) {
        rotations[i] += (0.5 + Math.random() * 0.5) * deltaTime
        if (rotations[i] > Math.PI * 2) {
          rotations[i] -= Math.PI * 2
        }
      }

      // Wind gusts (optimized)
      if (this.config.windGusts && (this.config.type === 'rain' || this.config.type === 'snow') && this.updateFrameCount % 10 === 0) {
        const gustStrength = 0.3
        const gustDirection = Math.random() * Math.PI * 2
        this.velocities[i3] += Math.sin(gustDirection) * gustStrength * dt
        this.velocities[i3 + 2] += Math.cos(gustDirection) * gustStrength * dt
      }

      // Collision handling
      if (this.config.collisionEnabled && positions[i3 + 1] < 0) {
        if (this.config.type === 'rain') {
          positions[i3 + 1] = 150 + Math.random() * 50
          positions[i3] = (Math.random() - 0.5) * 300
          positions[i3 + 2] = (Math.random() - 0.5) * 300
          this.velocities[i3 + 1] = (-8 - Math.random() * 7) * (this.config.particleSpeed || 1.0)
        } else {
          // Snow collision
          positions[i3 + 1] = 0
          this.velocities[i3 + 1] *= -0.1
          this.velocities[i3] *= 0.7
          this.velocities[i3 + 2] *= 0.7
          if (Math.abs(this.velocities[i3 + 1]) < 0.2) {
            this.velocities[i3 + 1] = 0
          }
        }
      }

      // Reset particles that fall below
      if (this.config.type === 'rain' || this.config.type === 'snow') {
        if (positions[i3 + 1] < -10) {
          positions[i3] = (Math.random() - 0.5) * 300
          positions[i3 + 1] = 150 + Math.random() * 50
          positions[i3 + 2] = (Math.random() - 0.5) * 300
        }
      }

      // Wrap fog particles
      if (this.config.type === 'fog') {
        if (positions[i3] > 300) positions[i3] = -300
        if (positions[i3] < -300) positions[i3] = 300
        if (positions[i3 + 2] > 300) positions[i3 + 2] = -300
        if (positions[i3 + 2] < -300) positions[i3 + 2] = 300
      }
    }

    // Mark attributes for update (only when needed)
    this.geometry.attributes.position.needsUpdate = true
    if (rotations && this.config.type === 'snow') {
      this.geometry.attributes.rotation.needsUpdate = true
    }
  }

  updateConfig(config: Partial<ParticleSystemConfig>) {
    const oldConfig = { ...this.config }
    this.config = { ...this.config, ...config }
    
    // Check if quality changed
    if (config.quality && config.quality !== oldConfig.quality) {
      const qualitySettings = this.QUALITY_PRESETS[this.config.quality || 'high'];
      if (qualitySettings) {
        this.particleCount = Math.floor(this.config.intensity * qualitySettings.maxParticles);
        this.destroy();
        this.setupParticles();
        return;
      }
    }
    
    const newCount = Math.floor(this.config.intensity * this.QUALITY_PRESETS[this.config.quality || 'high'].maxParticles)
    const countChanged = Math.abs(newCount - this.particleCount) > 1000
    const scaleChanged = config.particleScale !== undefined && config.particleScale !== oldConfig.particleScale
    const speedChanged = config.particleSpeed !== undefined && config.particleSpeed !== oldConfig.particleSpeed
    const gustsChanged = config.windGusts !== undefined && config.windGusts !== oldConfig.windGusts

    // In-place updates for performance
    if (this.geometry && (scaleChanged || speedChanged)) {
      if (scaleChanged && this.geometry.getAttribute('size')) {
        const sizeAttr = this.geometry.getAttribute('size') as THREE.BufferAttribute
        const factor = (this.config.particleScale || 1.0) / (oldConfig.particleScale || 1.0)
        for (let i = 0; i < sizeAttr.array.length; i++) {
          sizeAttr.array[i] *= factor
        }
        sizeAttr.needsUpdate = true
      }
      if (speedChanged && this.velocities) {
        const factor = (this.config.particleSpeed || 1.0) / (oldConfig.particleSpeed || 1.0)
        for (let i = 0; i < this.velocities.length; i++) {
          this.velocities[i] *= factor
        }
      }
    }

    // Recreate only when necessary
    if (countChanged || gustsChanged) {
      this.particleCount = newCount
      this.destroy()
      this.setupParticles()
    }

    // Update visibility
    if (this.material) {
      if (this.material instanceof THREE.PointsMaterial) {
        this.material.opacity = this.config.intensity * (this.config.type === 'fog' ? 0.3 : 0.8)
        this.material.visible = this.config.enabled && this.config.intensity > 0
      } else {
        this.material.visible = this.config.enabled && this.config.intensity > 0
      }
    }
    
    if (this.particles) {
      this.particles.visible = this.config.enabled && this.config.intensity > 0
    }
  }

  

  destroy() {
    if (this.particles) {
      this.scene.remove(this.particles)
      this.particles = null
    }
    if (this.geometry) {
      this.geometry.dispose()
      this.geometry = null
    }
    if (this.material) {
      this.material.dispose()
      this.material = null
    }
    this.positions = null
    this.velocities = null
    
  }
}
