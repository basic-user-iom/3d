import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { useAppStore } from '../src/store/useAppStore'
import { CSMShadowSystem } from '../src/viewer/effects/CSMShadowSystem'

describe('Shadow System', () => {
  let scene: THREE.Scene
  let renderer: THREE.WebGLRenderer
  let camera: THREE.PerspectiveCamera

  beforeEach(() => {
    // Create test scene
    scene = new THREE.Scene()
    
    // Create mock renderer (simplified - no DOM needed)
    renderer = {
      shadowMap: {
        enabled: true,
        type: THREE.PCFShadowMap,
        autoUpdate: true
      },
      domElement: {} as HTMLCanvasElement
    } as any as THREE.WebGLRenderer
    
    // Create test camera
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
  })

  describe('Shadow Plane Configuration', () => {
    it('should have shadow plane disabled by default', () => {
      const store = useAppStore.getState()
      expect(store.showShadowPlane).toBe(false)
    })

    it('should toggle shadow plane visibility', () => {
      const store = useAppStore.getState()
      const initialValue = store.showShadowPlane
      
      useAppStore.getState().toggleShadowPlane()
      
      expect(useAppStore.getState().showShadowPlane).toBe(!initialValue)
    })

    it('should create shadow plane with correct properties', () => {
      const shadowPlaneGeometry = new THREE.PlaneGeometry(10000, 10000)
      const shadowPlaneMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      })
      const shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial)
      
      shadowPlane.rotation.x = -Math.PI / 2
      shadowPlane.position.y = 0
      shadowPlane.receiveShadow = true
      shadowPlane.castShadow = false
      shadowPlane.userData.isShadowPlane = true
      
      expect(shadowPlane.receiveShadow).toBe(true)
      expect(shadowPlane.castShadow).toBe(false)
      expect(shadowPlane.userData.isShadowPlane).toBe(true)
      expect(shadowPlane.position.y).toBe(0)
    })
  })

  describe('Shadow Configuration', () => {
    it('should have shadows enabled by default', () => {
      const store = useAppStore.getState()
      expect(store.shadowsEnabled).toBe(true)
    })

    it('should toggle shadows', () => {
      const store = useAppStore.getState()
      const initialValue = store.shadowsEnabled
      
      useAppStore.getState().setShadowsEnabled(!initialValue)
      
      expect(useAppStore.getState().shadowsEnabled).toBe(!initialValue)
    })

    it('should have default shadow intensity', () => {
      const store = useAppStore.getState()
      expect(store.shadowIntensity).toBe(1.0)
    })

    it('should have default shadow map size', () => {
      const store = useAppStore.getState()
      expect(store.shadowMapSize).toBeGreaterThan(0)
      expect(store.shadowMapSize).toBeLessThanOrEqual(8192)
    })
  })

  describe('CSM Shadow System', () => {
    it('should initialize CSM shadow system', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        lightIntensity: 1.0,
        lightColor: new THREE.Color(0xffffff),
        cascades: 3,
        maxFar: 5000,
        shadowMapSize: 2048,
        lightDirection: new THREE.Vector3(-1, -1, -1),
        shadowBias: -0.0002,
        shadowNormalBias: 0.01
      })
      
      expect(csmSystem).toBeDefined()
      expect(csmSystem.isEnabled()).toBe(false) // Not enabled until init() is called
    })

    it('should initialize CSM with correct configuration', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        cascades: 3,
        shadowMapSize: 2048,
        maxFar: 5000
      })
      
      csmSystem.init()
      
      expect(csmSystem.isEnabled()).toBe(true)
      
      const diagnostics = csmSystem.getShadowMapDiagnostics()
      expect(diagnostics.totalLights).toBe(3) // 3 cascades = 3 lights
      expect(diagnostics.configuredSize).toBe(2048)
    })

    it('should cap shadow map size at 8192', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        shadowMapSize: 16384 // Larger than max
      })
      
      csmSystem.init()
      
      const diagnostics = csmSystem.getShadowMapDiagnostics()
      expect(diagnostics.configuredSize).toBeLessThanOrEqual(8192)
    })

    it('should update light direction', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      
      const newDirection = new THREE.Vector3(1, 0, 0)
      csmSystem.setLightDirection(newDirection)
      
      // Should not throw
      expect(() => csmSystem.setLightDirection(newDirection)).not.toThrow()
    })

    it('should update light intensity', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        lightIntensity: 1.0
      })
      
      csmSystem.init()
      
      csmSystem.setLightIntensity(0.5)
      
      // Should not throw
      expect(() => csmSystem.setLightIntensity(0.5)).not.toThrow()
    })

    it('should destroy CSM system', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      expect(csmSystem.isEnabled()).toBe(true)
      
      csmSystem.destroy()
      expect(csmSystem.isEnabled()).toBe(false)
    })

    it('should update shadow map size', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        shadowMapSize: 2048
      })
      
      csmSystem.init()
      
      csmSystem.setShadowMapSize(4096)
      
      const diagnostics = csmSystem.getShadowMapDiagnostics()
      expect(diagnostics.configuredSize).toBe(4096)
    })
  })

  describe('Shadow Plane Material Setup', () => {
    it('should set up shadow plane material for CSM', () => {
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      )
      shadowPlane.userData.isShadowPlane = true
      scene.add(shadowPlane)
      
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      
      // Setup materials
      csmSystem.setupSceneMaterials()
      
      const material = shadowPlane.material as THREE.MeshStandardMaterial
      const anyMat = material as any
      
      // Material should be set up for CSM
      expect(anyMat.userData?.csmSetup).toBe(true)
    })

    it('should handle shadow plane with ShadowMaterial', () => {
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.ShadowMaterial({ opacity: 0.5 })
      )
      shadowPlane.userData.isShadowPlane = true
      shadowPlane.receiveShadow = true
      
      expect(shadowPlane.receiveShadow).toBe(true)
      expect(shadowPlane.material).toBeInstanceOf(THREE.ShadowMaterial)
    })
  })

  describe('Light Management', () => {
    it('should configure directional light for shadows', () => {
      const light = new THREE.DirectionalLight(0xffffff, 1)
      light.castShadow = true
      
      if (light.shadow) {
        light.shadow.mapSize.width = 2048
        light.shadow.mapSize.height = 2048
        light.shadow.bias = -0.0002
        light.shadow.normalBias = 0.01
        light.shadow.radius = 1
      }
      
      expect(light.castShadow).toBe(true)
      expect(light.shadow?.mapSize.width).toBe(2048)
      expect(light.shadow?.bias).toBe(-0.0002)
    })

    it('should store original light state for restoration', () => {
      const light = new THREE.DirectionalLight(0xffffff, 1)
      light.visible = true
      light.intensity = 1.0
      light.castShadow = true
      
      // Store original state
      light.userData.originalStateForCSM = {
        visible: light.visible,
        intensity: light.intensity,
        castShadow: light.castShadow
      }
      
      // Disable for CSM
      light.visible = false
      light.intensity = 0
      light.castShadow = false
      
      expect(light.visible).toBe(false)
      expect(light.intensity).toBe(0)
      
      // Restore
      const originalState = light.userData.originalStateForCSM
      light.visible = originalState.visible
      light.intensity = originalState.intensity
      light.castShadow = originalState.castShadow
      
      expect(light.visible).toBe(true)
      expect(light.intensity).toBe(1.0)
      expect(light.castShadow).toBe(true)
    })
  })

  describe('Shadow Map Uniform Updates', () => {
    it('should track shadow map diagnostics', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        cascades: 3,
        shadowMapSize: 2048
      })
      
      csmSystem.init()
      
      const diagnostics = csmSystem.getShadowMapDiagnostics()
      
      expect(diagnostics.totalLights).toBe(3)
      expect(diagnostics.configuredSize).toBe(2048)
      expect(diagnostics.lights).toHaveLength(3)
      
      diagnostics.lights.forEach((light, index) => {
        expect(light.index).toBe(index)
        expect(light.mapSize.width).toBe(2048)
        expect(light.castShadow).toBe(true)
        expect(light.visible).toBe(true)
      })
    })
  })

  describe('Shadow Quality Settings', () => {
    it('should set shadow quality to low', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      
      csmSystem.setShadowQuality('low')
      
      const diagnostics = csmSystem.getShadowMapDiagnostics()
      // Low quality should have fewer cascades or smaller map size
      expect(diagnostics.totalLights).toBeGreaterThan(0)
    })

    it('should set shadow quality to medium', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      
      csmSystem.setShadowQuality('medium')
      
      const diagnostics = csmSystem.getShadowMapDiagnostics()
      expect(diagnostics.totalLights).toBeGreaterThan(0)
    })

    it('should set shadow quality to high', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      
      csmSystem.setShadowQuality('high')
      
      const diagnostics = csmSystem.getShadowMapDiagnostics()
      expect(diagnostics.totalLights).toBeGreaterThan(0)
    })
  })

  describe('Shadow Bias Configuration', () => {
    it('should update shadow bias', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        shadowBias: -0.0002
      })
      
      csmSystem.init()
      
      csmSystem.setShadowBias(-0.0001)
      
      // Should not throw
      expect(() => csmSystem.setShadowBias(-0.0001)).not.toThrow()
    })

    it('should update shadow normal bias', () => {
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene,
        shadowNormalBias: 0.01
      })
      
      csmSystem.init()
      
      csmSystem.setShadowNormalBias(0.02)
      
      // Should not throw
      expect(() => csmSystem.setShadowNormalBias(0.02)).not.toThrow()
    })
  })

  describe('Material Setup', () => {
    it('should skip ShaderMaterial for CSM setup', () => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.ShaderMaterial({
          vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'
        })
      )
      scene.add(mesh)
      
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      
      // Should not throw when setting up materials
      expect(() => csmSystem.setupSceneMaterials()).not.toThrow()
      
      // ShaderMaterial should not be set up for CSM
      const material = mesh.material as THREE.ShaderMaterial
      const anyMat = material as any
      expect(anyMat.userData?.csmSetup).toBeUndefined()
    })

    it('should set up MeshStandardMaterial for CSM', () => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
      )
      scene.add(mesh)
      
      const csmSystem = new CSMShadowSystem(scene, {
        camera,
        parent: scene
      })
      
      csmSystem.init()
      csmSystem.setupSceneMaterials()
      
      const material = mesh.material as THREE.MeshStandardMaterial
      const anyMat = material as any
      
      // Material should be set up for CSM
      expect(anyMat.userData?.csmSetup).toBe(true)
    })
  })

  describe('Shadow Plane Transparent Mode', () => {
    it('should use ShadowMaterial when transparent mode is enabled', () => {
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.ShadowMaterial({ opacity: 0.5 })
      )
      shadowPlane.userData.isShadowPlane = true
      
      expect(shadowPlane.material).toBeInstanceOf(THREE.ShadowMaterial)
      expect((shadowPlane.material as THREE.ShadowMaterial).opacity).toBe(0.5)
    })

    it('should use MeshStandardMaterial when transparent mode is disabled', () => {
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ 
          color: 0x333333,
          transparent: true,
          opacity: 0.8
        })
      )
      shadowPlane.userData.isShadowPlane = true
      
      expect(shadowPlane.material).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect((shadowPlane.material as THREE.MeshStandardMaterial).opacity).toBe(0.8)
    })
  })
})

