import * as THREE from 'three'

/**
 * Diagnostic utility to check light sources, their positions, and if they change
 * when post-processing is enabled
 */
export function logLightDiagnostics(
  scene: THREE.Scene,
  postProcessingEnabled: boolean = false
): void {
  console.group(`🔍 Light Diagnostics ${postProcessingEnabled ? '(Post-Processing Enabled)' : '(Post-Processing Disabled)'}`)
  
  const lights: Array<{
    type: string
    name: string
    position: THREE.Vector3
    target?: THREE.Vector3
    visible: boolean
    intensity: number
    castShadow: boolean
    isSun?: boolean
    userData: any
  }> = []
  
  scene.traverse((object) => {
    if (object instanceof THREE.Light) {
      const lightInfo: any = {
        type: object.constructor.name,
        name: object.name || 'Unnamed',
        position: object.position.clone(),
        visible: object.visible,
        intensity: object.intensity,
        castShadow: (object as any).castShadow || false,
        isSun: (object as any).userData?.isSun || false,
        userData: { ...object.userData }
      }
      
      if (object instanceof THREE.DirectionalLight) {
        lightInfo.target = object.target.position.clone()
        lightInfo.direction = object.target.position.clone().sub(object.position).normalize()
      }
      
      lights.push(lightInfo)
    }
  })
  
  console.log(`📊 Total Lights Found: ${lights.length}`)
  console.log(`✅ Visible Lights: ${lights.filter(l => l.visible).length}`)
  console.log(`🌑 Shadow-Casting Lights: ${lights.filter(l => l.castShadow).length}`)
  console.log(`☀️ Sun Lights: ${lights.filter(l => l.isSun).length}`)
  
  console.group('📍 Light Details:')
  lights.forEach((light, index) => {
    console.group(`Light ${index + 1}: ${light.name} (${light.type})`)
    console.log('Position:', {
      x: light.position.x.toFixed(3),
      y: light.position.y.toFixed(3),
      z: light.position.z.toFixed(3)
    })
    
    if (light.target) {
      const direction = new THREE.Vector3().subVectors(light.target, light.position).normalize()
      console.log('Target:', {
        x: light.target.x.toFixed(3),
        y: light.target.y.toFixed(3),
        z: light.target.z.toFixed(3)
      })
      console.log('Direction:', {
        x: direction.x.toFixed(3),
        y: direction.y.toFixed(3),
        z: direction.z.toFixed(3)
      })
    }
    
    console.log('Properties:', {
      visible: light.visible,
      intensity: light.intensity.toFixed(2),
      castShadow: light.castShadow,
      isSun: light.isSun
    })
    
    if (Object.keys(light.userData).length > 0) {
      console.log('UserData:', light.userData)
    }
    
    console.groupEnd()
  })
  console.groupEnd()
  
  // Check for ambient light
  const ambientLights = lights.filter(l => l.type === 'AmbientLight')
  if (ambientLights.length > 0) {
    console.log('💡 Ambient Lights:', ambientLights.length)
    ambientLights.forEach(light => {
      console.log(`  - ${light.name}: intensity=${light.intensity.toFixed(2)}`)
    })
  }
  
  // Check for directional lights (sun lights)
  const directionalLights = lights.filter(l => l.type === 'DirectionalLight')
  if (directionalLights.length > 0) {
    console.log('☀️ Directional Lights:', directionalLights.length)
    directionalLights.forEach(light => {
      const isSun = light.isSun ? ' (SUN)' : ''
      console.log(`  - ${light.name}${isSun}:`, {
        position: `(${light.position.x.toFixed(1)}, ${light.position.y.toFixed(1)}, ${light.position.z.toFixed(1)})`,
        visible: light.visible,
        castShadow: light.castShadow,
        intensity: light.intensity.toFixed(2)
      })
    })
  }
  
  console.groupEnd()
}

/**
 * Compare light states before and after post-processing
 */
export function compareLightStates(
  before: Array<{ type: string; name: string; position: THREE.Vector3; visible: boolean; intensity: number; castShadow: boolean }>,
  after: Array<{ type: string; name: string; position: THREE.Vector3; visible: boolean; intensity: number; castShadow: boolean }>
): void {
  console.group('🔄 Light State Comparison (Before vs After Post-Processing)')
  
  if (before.length !== after.length) {
    console.warn(`⚠️ Light count changed: ${before.length} → ${after.length}`)
  }
  
  before.forEach((lightBefore, index) => {
    const lightAfter = after[index]
    if (!lightAfter) {
      console.warn(`⚠️ Light ${index + 1} (${lightBefore.name}) disappeared!`)
      return
    }
    
    const changes: string[] = []
    
    // Check position
    if (!lightBefore.position.equals(lightAfter.position)) {
      changes.push(`Position: (${lightBefore.position.x.toFixed(2)}, ${lightBefore.position.y.toFixed(2)}, ${lightBefore.position.z.toFixed(2)}) → (${lightAfter.position.x.toFixed(2)}, ${lightAfter.position.y.toFixed(2)}, ${lightAfter.position.z.toFixed(2)})`)
    }
    
    // Check visibility
    if (lightBefore.visible !== lightAfter.visible) {
      changes.push(`Visible: ${lightBefore.visible} → ${lightAfter.visible}`)
    }
    
    // Check intensity
    if (Math.abs(lightBefore.intensity - lightAfter.intensity) > 0.001) {
      changes.push(`Intensity: ${lightBefore.intensity.toFixed(2)} → ${lightAfter.intensity.toFixed(2)}`)
    }
    
    // Check castShadow
    if (lightBefore.castShadow !== lightAfter.castShadow) {
      changes.push(`CastShadow: ${lightBefore.castShadow} → ${lightAfter.castShadow}`)
    }
    
    if (changes.length > 0) {
      console.warn(`⚠️ ${lightBefore.name} changed:`, changes)
    } else {
      console.log(`✅ ${lightBefore.name}: No changes`)
    }
  })
  
  console.groupEnd()
}



















































