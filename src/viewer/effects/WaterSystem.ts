import * as THREE from 'three'
import { MarchingCubes } from './MarchingCubes'

export interface WaterConfig {
  enabled: boolean
  level: number // Y position of water surface
  color: string
  opacity: number
  waveSpeed: number
  waveHeight: number
  reflectivity: number
  mode?: 'plane' | 'marchingCubes' | 'ocean' // Water surface mode
  marchingCubesResolution?: number // Resolution for marching cubes
  marchingCubesIsolation?: number // Isolation threshold
  marchingCubesMetaballCount?: number // Number of metaballs
  oceanDistortionScale?: number // For ocean shader
  oceanSize?: number // For ocean shader
}

export class WaterSystem {
  private scene: THREE.Scene
  private config: WaterConfig
  private waterPlane: THREE.Mesh | null = null
  private marchingCubes: MarchingCubes | null = null
  private material: THREE.MeshStandardMaterial | THREE.ShaderMaterial | null = null
  private time: number = 0
  private causticsTexture: THREE.DataTexture | null = null
  private uniforms: {
    time: { value: number }
    waveHeight: { value: number }
    waveSpeed: { value: number }
    waveDir1: { value: THREE.Vector2 }
    waveDir2: { value: THREE.Vector2 }
    waveDir3: { value: THREE.Vector2 }
    waterColor: { value: THREE.Color }
    opacity: { value: number }
    reflectivity: { value: number }
    fresnelPower: { value: number }
    causticsStrength: { value: number }
    causticsScale: { value: number }
    normalScale: { value: number }
    distortionStrength: { value: number }
  } | null = null
  private oceanUniforms: {
    time: { value: number }
    distortionScale: { value: number }
    size: { value: number }
    waterColor: { value: THREE.Color }
    opacity: { value: number }
    sunDirection: { value: THREE.Vector3 }
    cameraPosition: { value: THREE.Vector3 }
    normalMap: { value: THREE.Texture | null }
  } | null = null

  constructor(scene: THREE.Scene, config: WaterConfig) {
    this.scene = scene
    this.config = config
    this.createCausticsTexture()
    this.setupWater()
  }

  private createCausticsTexture() {
    // Create a procedural caustics texture using canvas
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    
    // Create animated caustic pattern
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)')
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    
    // Add multiple light caustic spots
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const radius = 20 + Math.random() * 60
      const spotGradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
      spotGradient.addColorStop(0, `rgba(255, 255, 255, ${0.4 + Math.random() * 0.4})`)
      spotGradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.2 + Math.random() * 0.2})`)
      spotGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = spotGradient
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
    
    const imageData = ctx.getImageData(0, 0, size, size)
    this.causticsTexture = new THREE.DataTexture(
      imageData.data,
      size,
      size,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    )
    this.causticsTexture.wrapS = THREE.RepeatWrapping
    this.causticsTexture.wrapT = THREE.RepeatWrapping
    this.causticsTexture.needsUpdate = true
  }

  private setupWater() {
    if (!this.config.enabled) {
      this.destroy()
      return
    }

    const mode = this.config.mode || 'plane'
    
          if (mode === 'marchingCubes') {
        this.setupMarchingCubes()
      } else if (mode === 'ocean') {
        this.setupOceanShader()
      } else {
        this.setupPlaneWater()
      }
  }

  private setupPlaneWater() {
    // Remove marching cubes if it exists
    if (this.marchingCubes) {
      this.scene.remove(this.marchingCubes)
      if (this.marchingCubes.geometry) {
        this.marchingCubes.geometry.dispose()
      }
      this.marchingCubes = null
    }

    // Create a high-resolution plane for detailed waves
    const geometry = new THREE.PlaneGeometry(5000, 5000, 256, 256)
    
    // Parse color
    const waterColor = new THREE.Color(this.config.color)
    const opacity = Math.max(0.0, Math.min(1.0, this.config.opacity))
    const reflectivity = Math.max(0.0, Math.min(1.0, this.config.reflectivity))
    
    // Initialize uniforms
    this.uniforms = {
      time: { value: 0 },
      waveHeight: { value: Math.max(0.0, this.config.waveHeight) },
      waveSpeed: { value: Math.max(0.0, this.config.waveSpeed) },
      waveDir1: { value: new THREE.Vector2(1.0, 0.3).normalize() },
      waveDir2: { value: new THREE.Vector2(-0.7, 1.0).normalize() },
      waveDir3: { value: new THREE.Vector2(0.5, -0.8).normalize() },
      waterColor: { value: waterColor },
      opacity: { value: opacity },
      reflectivity: { value: reflectivity },
      fresnelPower: { value: 2.5 },
      causticsStrength: { value: 1.0 },
      causticsScale: { value: 2.0 },
      normalScale: { value: 1.5 },
      distortionStrength: { value: 0.1 }
    }

    // Add caustics texture to uniforms
    const uniformsWithTexture = {
      ...this.uniforms,
      causticsTexture: { value: this.causticsTexture }
    }
    this.uniforms = uniformsWithTexture as any

    // Create MeshStandardMaterial for automatic environment mapping support
    // We'll inject custom wave and caustics effects via onBeforeCompile
    this.material = new THREE.MeshStandardMaterial({
      color: waterColor,
      transparent: opacity < 1.0,
      opacity: opacity,
      metalness: reflectivity,
      roughness: 0.08,
      envMap: this.scene.environment || null,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
      depthWrite: opacity > 0.99,
      depthTest: true
    })

          // Inject custom wave displacement and caustics via shader hooks
      const material = this.material // Capture for closure
      material.onBeforeCompile = (shader) => {
        // Add custom uniforms
        shader.uniforms.time = this.uniforms!.time
        shader.uniforms.waveHeight = this.uniforms!.waveHeight
        shader.uniforms.waveSpeed = this.uniforms!.waveSpeed
        shader.uniforms.waveDir1 = this.uniforms!.waveDir1
        shader.uniforms.waveDir2 = this.uniforms!.waveDir2
        shader.uniforms.waveDir3 = this.uniforms!.waveDir3
        shader.uniforms.causticsTexture = { value: this.causticsTexture }
        shader.uniforms.causticsStrength = { value: 1.0 }
        shader.uniforms.causticsScale = { value: 2.0 }
        shader.uniforms.distortionStrength = { value: 0.1 }

      // Inject wave functions and displacement in vertex shader
      // Explicitly ensure vUv is declared and set (Three.js should do this, but ensure compatibility)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         uniform float time;
         uniform float waveHeight;
         uniform float waveSpeed;
         uniform vec2 waveDir1;
         uniform vec2 waveDir2;
         uniform vec2 waveDir3;
         
         // Gerstner wave function for realistic water waves
         vec3 gerstnerWave(vec2 direction, float amplitude, float frequency, float speed, vec3 pos) {
           float phase = dot(direction, pos.xz) * frequency + time * waveSpeed * speed;
           float cosine = cos(phase);
           float sine = sin(phase);
           return vec3(direction.x * amplitude * cosine, amplitude * sine, direction.y * amplitude * cosine);
         }
         
         vec3 applyWaveDisplacement(vec3 pos) {
           if (waveHeight > 0.001) {
             vec3 wave1 = gerstnerWave(waveDir1, waveHeight, 0.02, 1.0, pos);
             vec3 wave2 = gerstnerWave(waveDir2, waveHeight * 0.6, 0.04, 1.3, pos);
             vec3 wave3 = gerstnerWave(waveDir3, waveHeight * 0.3, 0.08, 1.7, pos);
             pos += wave1 + wave2 + wave3;
           }
           return pos;
         }
         
         vec3 calculateWaveNormal(vec3 pos) {
           if (waveHeight > 0.001) {
             float t = time * waveSpeed;
             float freq1 = 0.02, freq2 = 0.04, freq3 = 0.08;
             float phase1 = dot(waveDir1, pos.xz) * freq1 + t;
             float phase2 = dot(waveDir2, pos.xz) * freq2 + t * 1.3;
             float phase3 = dot(waveDir3, pos.xz) * freq3 + t * 1.7;
             float dy_dx = -waveDir1.x * waveHeight * freq1 * sin(phase1) +
                           -waveDir2.x * waveHeight * 0.6 * freq2 * sin(phase2) +
                           -waveDir3.x * waveHeight * 0.3 * freq3 * sin(phase3);
             float dy_dz = -waveDir1.y * waveHeight * freq1 * sin(phase1) +
                           -waveDir2.y * waveHeight * 0.6 * freq2 * sin(phase2) +
                           -waveDir3.y * waveHeight * 0.3 * freq3 * sin(phase3);
             vec3 tangent = normalize(vec3(1.0, dy_dx, 0.0));
             vec3 bitangent = normalize(vec3(0.0, dy_dz, 1.0));
             return normalize(cross(bitangent, tangent));
           }
           return vec3(0.0, 1.0, 0.0);
         }`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         objectNormal = calculateWaveNormal(position);`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed = applyWaveDisplacement(transformed);`
      )
      
      // Ensure vUv is explicitly declared and set in vertex shader (required for fragment shader)
      if (!shader.vertexShader.includes('varying vec2 vUv')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `varying vec2 vUv;
           #include <common>`
        )
      }
      if (!shader.vertexShader.includes('vUv = uv')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `vUv = uv;
           #include <project_vertex>`
        )
      }

      // Inject caustics in fragment shader
      // Declare vUv to match vertex shader if not already declared
      if (!shader.fragmentShader.includes('varying vec2 vUv')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float time;
           uniform float waveSpeed;
           uniform sampler2D causticsTexture;
           uniform float causticsStrength;
           uniform float causticsScale;
           uniform float distortionStrength;
           varying vec2 vUv;
           
           float sampleCaustics(vec2 uv, float t) {
             vec2 distorted = uv + vec2(
               sin(uv.y * 10.0 + t * 2.0) * distortionStrength,
               cos(uv.x * 10.0 + t * 2.5) * distortionStrength
             );
             return texture2D(causticsTexture, distorted * causticsScale + vec2(t * 0.1, t * 0.15)).r;
           }`
        )
      } else {
        // vUv already declared, just add our uniforms and function
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float time;
           uniform float waveSpeed;
           uniform sampler2D causticsTexture;
           uniform float causticsStrength;
           uniform float causticsScale;
           uniform float distortionStrength;
           
           float sampleCaustics(vec2 uv, float t) {
             vec2 distorted = uv + vec2(
               sin(uv.y * 10.0 + t * 2.0) * distortionStrength,
               cos(uv.x * 10.0 + t * 2.5) * distortionStrength
             );
             return texture2D(causticsTexture, distorted * causticsScale + vec2(t * 0.1, t * 0.15)).r;
           }`
        )
      }
      
      // Add caustics effect in color fragment
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Add caustics effect using vUv
         float t = time * waveSpeed * 0.5;
         float caustics = sampleCaustics(vUv, t);
         caustics += sampleCaustics(vUv * 2.0, t * 1.3) * 0.5;
         caustics = pow(caustics, 1.5) * causticsStrength;
         diffuseColor.rgb += caustics * vec3(0.2, 0.2, 0.15);`
      )
              
        // Store reference to modified shader for potential future updates
        material.userData.shader = shader
      }

    this.waterPlane = new THREE.Mesh(geometry, this.material)
    this.waterPlane.rotation.x = -Math.PI / 2
    this.waterPlane.position.y = this.config.level
    this.waterPlane.receiveShadow = true
    this.waterPlane.userData.isWater = true
    this.waterPlane.name = 'Water Plane'
    
    this.scene.add(this.waterPlane)
  }

  private setupOceanShader() {
    // Remove existing water objects
    if (this.waterPlane) {
      this.scene.remove(this.waterPlane)
      if (this.waterPlane.geometry) {
        this.waterPlane.geometry.dispose()
      }
      this.waterPlane = null
    }
    if (this.marchingCubes) {
      this.scene.remove(this.marchingCubes as unknown as THREE.Object3D)
      if (this.marchingCubes.geometry) {
        this.marchingCubes.geometry.dispose()
      }
      this.marchingCubes = null
    }

    // Create a large, high-resolution plane for ocean
    const size = 10000
    const segments = 512
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)

    // Ocean shader parameters
    const distortionScale = this.config.oceanDistortionScale ?? 3.7
    const oceanSize = this.config.oceanSize ?? 1.0
    const waterColor = new THREE.Color(this.config.color)
    const opacity = Math.max(0.0, Math.min(1.0, this.config.opacity))

    // Initialize ocean uniforms
    this.oceanUniforms = {
      time: { value: 0 },
      distortionScale: { value: distortionScale },
      size: { value: oceanSize },
      waterColor: { value: waterColor },
      opacity: { value: opacity },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      cameraPosition: { value: new THREE.Vector3() },
      normalMap: { value: null }
    }

    // Ocean shader based on Three.js ocean example
    // Vertex shader with Gerstner waves
    const vertexShader = `
      precision highp float;
      
      uniform float time;
      uniform float distortionScale;
      uniform float size;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      // Gerstner wave function for realistic ocean waves
      vec3 gerstnerWave(vec2 direction, float amplitude, float frequency, float speed, vec2 pos) {
        float phase = dot(direction, pos) * frequency + time * speed;
        return vec3(
          direction.x * amplitude * cos(phase),
          amplitude * sin(phase),
          direction.y * amplitude * cos(phase)
        );
      }
      
      void main() {
        vUv = uv;
        
        vec3 pos = position;
        
        // Apply multiple Gerstner waves with different frequencies and amplitudes
        vec2 worldPos = pos.xz * size;
        pos += gerstnerWave(vec2(1.0, 0.0), 10.0 * distortionScale, 0.02, 0.5, worldPos);
        pos += gerstnerWave(vec2(0.0, 1.0), 8.0 * distortionScale, 0.04, 0.7, worldPos);
        pos += gerstnerWave(normalize(vec2(1.0, 1.0)), 6.0 * distortionScale, 0.08, 0.9, worldPos);
        pos += gerstnerWave(normalize(vec2(-0.5, 1.0)), 4.0 * distortionScale, 0.16, 1.1, worldPos);
        
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
      uniform float distortionScale;
      uniform vec3 waterColor;
      uniform float opacity;
      uniform vec3 sunDirection;
      uniform vec3 cameraPosition;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        vec3 normal = normalize(vNormal);
        
        // Fresnel effect for water
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);
        
        // Sun reflection
        vec3 reflectDir = reflect(-sunDirection, normal);
        float sunReflection = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
        
        // Water color with depth variation
        vec3 finalColor = waterColor;
        finalColor = mix(finalColor * 0.5, finalColor, fresnel);
        finalColor += vec3(sunReflection * 0.5);
        
        gl_FragColor = vec4(finalColor, opacity);
      }
    `

    // Create shader material
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: this.oceanUniforms,
      vertexShader,
      fragmentShader,
      transparent: opacity < 1.0,
      side: THREE.DoubleSide,
      depthWrite: opacity > 0.99,
      depthTest: true,
      name: 'OceanShader'
    })
    this.material = shaderMaterial

    // Create water plane
    this.waterPlane = new THREE.Mesh(geometry, shaderMaterial)
    this.waterPlane.position.y = this.config.level
    this.waterPlane.rotation.x = -Math.PI / 2
    this.waterPlane.receiveShadow = true
    this.waterPlane.userData.isWater = true
    this.scene.add(this.waterPlane)
  }

  private setupMarchingCubes() {
    // Remove plane if it exists
    if (this.waterPlane) {
      this.scene.remove(this.waterPlane)
      if (this.waterPlane.geometry) {
        this.waterPlane.geometry.dispose()
      }
      this.waterPlane = null
    }

    const resolution = this.config.marchingCubesResolution || 50
    const isolation = this.config.marchingCubesIsolation || 80
    const metaballCount = this.config.marchingCubesMetaballCount || 10

    // Parse color
    const waterColor = new THREE.Color(this.config.color)
    const opacity = Math.max(0.0, Math.min(1.0, this.config.opacity))
    const reflectivity = Math.max(0.0, Math.min(1.0, this.config.reflectivity))

    // Create material for marching cubes
    this.material = new THREE.MeshStandardMaterial({
      color: waterColor,
      transparent: opacity < 1.0,
      opacity: opacity,
      metalness: reflectivity,
      roughness: 0.08,
      envMap: this.scene.environment || null,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
      depthWrite: opacity > 0.99,
      depthTest: true
    })

    // Create marching cubes
    this.marchingCubes = new MarchingCubes(resolution, this.material, isolation)
    this.marchingCubes.position.y = this.config.level
    this.marchingCubes.scale.set(1000, 1000, 1000) // Scale to match plane size
    this.marchingCubes.userData.isWater = true
    this.marchingCubes.name = 'Water Marching Cubes'

    // Add metaballs for water animation
    this.addMetaballs(metaballCount)

    this.scene.add(this.marchingCubes)
  }

  private addMetaballs(count: number) {
    if (!this.marchingCubes) return

    this.marchingCubes.reset()

    for (let i = 0; i < count; i++) {
      const ballx = (Math.random() * 2 - 1) * 0.5
      const bally = (Math.random() * 2 - 1) * 0.5
      const ballz = (Math.random() * 2 - 1) * 0.5
      const strength = 0.5 + Math.random() * 0.3
      const subtract = 12

      this.marchingCubes.addBall(ballx, bally, ballz, strength, subtract)
    }
  }

  update(deltaTime: number, cameraPosition?: THREE.Vector3) {
    this.time += deltaTime

    if (this.config.mode === 'marchingCubes' && this.marchingCubes) {
      // Update marching cubes
      this.marchingCubes.update(this.time * this.config.waveSpeed)
      
      // Sync environment map from scene for reflections
      if (this.material && this.material instanceof THREE.MeshStandardMaterial && this.scene.environment) {
        this.material.envMap = this.scene.environment
        this.material.needsUpdate = true
      }
    } else if (this.config.mode === 'ocean' && this.waterPlane && this.oceanUniforms) {
      // Update ocean shader
      const oceanUniforms = this.oceanUniforms // Capture in local variable for type narrowing
      oceanUniforms.time.value = this.time
      if (this.config.oceanDistortionScale !== undefined) {
        oceanUniforms.distortionScale.value = this.config.oceanDistortionScale
      }
      if (this.config.oceanSize !== undefined) {
        oceanUniforms.size.value = this.config.oceanSize
      }
      if (cameraPosition) {
        oceanUniforms.cameraPosition.value.copy(cameraPosition)
      }
      // Update sun direction from scene lights if available
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && obj.visible) {
          const direction = new THREE.Vector3()
          obj.getWorldDirection(direction)
          oceanUniforms.sunDirection.value.copy(direction.normalize())
        }
      })
    } else if (this.waterPlane && this.material && this.uniforms && this.material instanceof THREE.MeshStandardMaterial) {
      // Update plane water
      this.uniforms.time.value = this.time
      this.uniforms.waveHeight.value = Math.max(0.0, this.config.waveHeight)
      this.uniforms.waveSpeed.value = Math.max(0.0, this.config.waveSpeed)
      
      // Sync environment map from scene for reflections
      if (this.scene.environment) {
        this.material.envMap = this.scene.environment
        this.material.needsUpdate = true
      }
    }
  }

  updateConfig(config: Partial<WaterConfig>) {
    const modeChanged = config.mode && config.mode !== this.config.mode
    this.config = { ...this.config, ...config }
    
    // If mode changed, recreate water
    if (modeChanged) {
      this.setupWater()
      return
    }

    if (this.waterPlane) {
      this.waterPlane.position.y = this.config.level
    }
    
    if (this.marchingCubes) {
      this.marchingCubes.position.y = this.config.level
      
      // Update marching cubes parameters - recreate if needed
      if (config.marchingCubesResolution !== undefined || 
          config.marchingCubesIsolation !== undefined ||
          config.marchingCubesMetaballCount !== undefined) {
        this.setupMarchingCubes()
        return
      }
    }
    
          // Update ocean shader uniforms if in ocean mode
      if (this.config.mode === 'ocean' && this.oceanUniforms) {
        const waterColor = new THREE.Color(this.config.color)
        const opacity = Math.max(0.0, Math.min(1.0, this.config.opacity))
        
        this.oceanUniforms.waterColor.value.copy(waterColor)
        this.oceanUniforms.opacity.value = opacity
        if (this.config.oceanDistortionScale !== undefined) {
          this.oceanUniforms.distortionScale.value = this.config.oceanDistortionScale
        }
        if (this.config.oceanSize !== undefined) {
          this.oceanUniforms.size.value = this.config.oceanSize
        }
        
        if (this.material instanceof THREE.ShaderMaterial) {
          this.material.transparent = opacity < 1.0
          this.material.depthWrite = opacity > 0.99
          this.material.needsUpdate = true
        }
      } else if (this.material && this.uniforms && this.material instanceof THREE.MeshStandardMaterial) {
        // Update plane water material properties
        const waterColor = new THREE.Color(this.config.color)
        const opacity = Math.max(0.0, Math.min(1.0, this.config.opacity))
        const reflectivity = Math.max(0.0, Math.min(1.0, this.config.reflectivity))
        
        // Update material properties
        this.material.color.set(waterColor)
        this.material.transparent = opacity < 1.0
        this.material.opacity = opacity
        this.material.metalness = reflectivity
        this.material.depthWrite = opacity > 0.99
        
        // Sync environment map
        if (this.scene.environment) {
          this.material.envMap = this.scene.environment
        }
        
        this.material.needsUpdate = true
      }

    if (this.config.enabled && !this.waterPlane && !this.marchingCubes) {
      this.setupWater()
    } else if (!this.config.enabled && (this.waterPlane || this.marchingCubes)) {
      this.destroy()
          } else if (this.config.enabled && this.waterPlane) {
        // Update uniforms without recreating
        if (this.config.mode === 'ocean' && this.oceanUniforms) {
          if (this.config.oceanDistortionScale !== undefined) {
            this.oceanUniforms.distortionScale.value = this.config.oceanDistortionScale
          }
          if (this.config.oceanSize !== undefined) {
            this.oceanUniforms.size.value = this.config.oceanSize
          }
          const waterColor = new THREE.Color(this.config.color)
          this.oceanUniforms.waterColor.value.copy(waterColor)
          this.oceanUniforms.opacity.value = Math.max(0.0, Math.min(1.0, this.config.opacity))
        } else if (this.uniforms) {
          this.uniforms.waveHeight.value = Math.max(0.0, this.config.waveHeight)
          this.uniforms.waveSpeed.value = Math.max(0.0, this.config.waveSpeed)
        }
        
        // Force material recompilation if needed
        if (this.material) {
          this.material.needsUpdate = true
        }
      }
  }

  destroy() {
    if (this.waterPlane) {
      this.scene.remove(this.waterPlane)
      if (this.waterPlane.geometry) {
        this.waterPlane.geometry.dispose()
      }
      this.waterPlane = null
    }
    if (this.marchingCubes) {
      this.scene.remove(this.marchingCubes)
      if (this.marchingCubes.geometry) {
        this.marchingCubes.geometry.dispose()
      }
      this.marchingCubes = null
    }
    if (this.material) {
      this.material.dispose()
      this.material = null
    }
    if (this.causticsTexture) {
      this.causticsTexture.dispose()
      this.causticsTexture = null
    }
          this.uniforms = null
      this.oceanUniforms = null
    }
  }
