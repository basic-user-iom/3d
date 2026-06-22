import * as THREE from 'three'

/**
 * Simple HDR Shadow Demo
 * Creates a test scene with objects and shadows to verify HDR + shadow compatibility
 */
export function createHDRShadowDemo(scene: THREE.Scene, renderer: THREE.WebGLRenderer): {
  objects: THREE.Mesh[]
  ground: THREE.Mesh
  light: THREE.DirectionalLight
  cleanup: () => void
} {
  console.log('[HDRShadowDemo] Creating test scene with shadows...')
  
  const objects: THREE.Mesh[] = []
  const cleanupFunctions: (() => void)[] = []
  
  // Get current environment map if HDR is loaded
  const envMap = scene.environment
  const envMapIntensity = 1.0 // Default intensity
  
  // Create ground plane
  const groundGeometry = new THREE.PlaneGeometry(50, 50)
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.8,
    metalness: 0.1
  })
  
  // Apply environment map to ground if available
  if (envMap) {
    groundMaterial.envMap = envMap
    groundMaterial.envMapIntensity = envMapIntensity
    console.log('[HDRShadowDemo] Applied environment map to ground material')
  }
  
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0
  ground.receiveShadow = true
  ground.name = 'HDRShadowDemo_Ground'
  scene.add(ground)
  cleanupFunctions.push(() => scene.remove(ground))
  
  // Create test objects
  const objectConfigs = [
    { type: 'box', position: [-5, 1, 0], color: 0xff6b6b, size: 2 },
    { type: 'sphere', position: [0, 1, 0], color: 0x4ecdc4, size: 1 },
    { type: 'box', position: [5, 1, 0], color: 0x95e1d3, size: 1.5 },
    { type: 'cylinder', position: [-2.5, 1, -3], color: 0xf38181, size: 1 },
    { type: 'box', position: [2.5, 1, -3], color: 0xa8e6cf, size: 1.2 }
  ]
  
  objectConfigs.forEach((config, index) => {
    let geometry: THREE.BufferGeometry
    let height = config.size
    
    switch (config.type) {
      case 'box':
        geometry = new THREE.BoxGeometry(config.size, config.size * 2, config.size)
        height = config.size
        break
      case 'sphere':
        geometry = new THREE.SphereGeometry(config.size, 32, 32)
        height = config.size
        break
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(config.size * 0.5, config.size * 0.5, config.size * 2, 32)
        height = config.size
        break
      default:
        geometry = new THREE.BoxGeometry(config.size, config.size * 2, config.size)
    }
    
    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.3,
      metalness: 0.7
    })
    
    // Apply environment map if available
    if (envMap) {
      material.envMap = envMap
      material.envMapIntensity = envMapIntensity
    }
    
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(config.position[0], config.position[1] + height, config.position[2])
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `HDRShadowDemo_Object_${index}`
    
    scene.add(mesh)
    objects.push(mesh)
    cleanupFunctions.push(() => scene.remove(mesh))
  })
  
  // Create directional light with shadows
  const light = new THREE.DirectionalLight(0xffffff, 1.5)
  light.position.set(10, 20, 10)
  light.castShadow = true
  light.shadow.mapSize.width = 2048
  light.shadow.mapSize.height = 2048
  light.shadow.camera.near = 0.5
  light.shadow.camera.far = 50
  light.shadow.camera.left = -25
  light.shadow.camera.right = 25
  light.shadow.camera.top = 25
  light.shadow.camera.bottom = -25
  light.shadow.bias = -0.0001
  light.shadow.normalBias = 0.02
  light.shadow.radius = 2
  light.name = 'HDRShadowDemo_Light'
  scene.add(light)
  cleanupFunctions.push(() => scene.remove(light))
  
  // Ensure shadow map is enabled
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  
  // Update shadow camera
  light.shadow.camera.updateProjectionMatrix()
  
  console.log('[HDRShadowDemo] ✅ Created test scene:', {
    objects: objects.length,
    ground: 'created',
    light: 'created',
    shadowMapEnabled: renderer.shadowMap.enabled,
    shadowMapType: renderer.shadowMap.type,
    hasEnvironmentMap: !!envMap
  })
  
  return {
    objects,
    ground,
    light,
    cleanup: () => {
      console.log('[HDRShadowDemo] Cleaning up test scene...')
      cleanupFunctions.forEach(cleanup => cleanup())
      console.log('[HDRShadowDemo] ✅ Cleanup complete')
    }
  }
}

/**
 * Test shadows with HDR
 * Creates demo objects and verifies shadows work
 */
export async function testHDRShadows(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hdrSystem: any
): Promise<{
  success: boolean
  message: string
  details: any
}> {
  console.log('[HDRShadowDemo] Starting HDR shadow test...')
  
  const results = {
    success: false,
    message: '',
    details: {} as any
  }
  
  try {
    // Create demo scene
    const demo = createHDRShadowDemo(scene, renderer)
    
    // Wait a frame for shadows to render
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    // Check if HDR is loaded
    const hasHDR = hdrSystem && hdrSystem.getPMREMMap()
    const envMap = scene.environment
    
    // CRITICAL: Reapply HDR to demo objects if HDR is loaded
    // This ensures materials get the environment map even if objects were created before HDR
    if (hasHDR && envMap && hdrSystem) {
      const pmremMap = hdrSystem.getPMREMMap()
      const intensity = (hdrSystem as any).config?.intensity || 1.0
      
      if (pmremMap) {
        console.log('[HDRShadowDemo] Reapplying HDR environment map to demo objects...')
        
        // Apply to all demo objects
        demo.objects.forEach((obj) => {
          const mat = obj.material
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            mat.envMap = pmremMap
            mat.envMapIntensity = intensity
            mat.needsUpdate = true
          }
        })
        
        // Apply to ground
        const groundMat = demo.ground.material
        if (groundMat instanceof THREE.MeshStandardMaterial || groundMat instanceof THREE.MeshPhysicalMaterial) {
          groundMat.envMap = pmremMap
          groundMat.envMapIntensity = intensity
          groundMat.needsUpdate = true
        }
        
        console.log('[HDRShadowDemo] ✅ Reapplied HDR to demo objects')
      }
    }
    
    // Verify shadow system
    const shadowMapEnabled = renderer.shadowMap.enabled
    const shadowCastingLights = scene.children.filter(
      (obj): obj is THREE.DirectionalLight => 
        obj instanceof THREE.DirectionalLight && obj.castShadow
    )
    
    // Check if objects have shadows
    const objectsWithShadows = demo.objects.filter(obj => obj.castShadow)
    const groundReceivesShadows = demo.ground.receiveShadow
    
    // Check materials have envMap
    const objectsWithEnvMap = demo.objects.filter(obj => {
      const mat = obj.material
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
        return !!mat.envMap
      }
      return false
    })
    
    results.details = {
      hasHDR,
      hasEnvironment: !!envMap,
      shadowMapEnabled,
      shadowCastingLights: shadowCastingLights.length,
      objectsCreated: demo.objects.length,
      objectsWithShadows: objectsWithShadows.length,
      groundReceivesShadows,
      objectsWithEnvMap: objectsWithEnvMap.length
    }
    
    // Determine success
    const shadowsWorking = shadowMapEnabled && shadowCastingLights.length > 0 && objectsWithShadows.length > 0
    const hdrWorking = hasHDR && envMap && objectsWithEnvMap.length > 0
    
    if (shadowsWorking && hdrWorking) {
      results.success = true
      results.message = '✅ Shadows and HDR are both working correctly!'
    } else if (shadowsWorking && !hdrWorking) {
      results.success = false
      results.message = '⚠️ Shadows work but HDR is not loaded or not applied to materials'
    } else if (!shadowsWorking && hdrWorking) {
      results.success = false
      results.message = '⚠️ HDR works but shadows are not configured correctly'
    } else {
      results.success = false
      results.message = '❌ Neither shadows nor HDR are working correctly'
    }
    
    console.log('[HDRShadowDemo] Test results:', results)
    
    // Store cleanup function for later
    ;(window as any).__hdrShadowDemoCleanup = demo.cleanup
    
    return results
  } catch (error) {
    results.success = false
    results.message = `❌ Error during test: ${error}`
    results.details = { error: String(error) }
    console.error('[HDRShadowDemo] Test failed:', error)
    return results
  }
}

