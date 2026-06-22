import * as THREE from 'three'

/**
 * Comprehensive sun light verification utility
 * Verifies sun light configuration and counts all light sources
 */
export interface SunLightVerificationReport {
  totalLights: number
  sunLight: {
    found: boolean
    name?: string
    position?: { x: number; y: number; z: number }
    target?: { x: number; y: number; z: number }
    intensity?: number
    color?: string
    visible?: boolean
    castShadow?: boolean
    isSun?: boolean
    shadowMapSize?: { width: number; height: number }
    shadowBias?: number
    shadowNormalBias?: number
    shadowRadius?: number
    shadowCamera?: {
      near: number
      far: number
      left: number
      right: number
      top: number
      bottom: number
    }
    status: '✅ PROPERLY CONFIGURED' | '⚠️ ISSUES DETECTED' | '❌ NOT FOUND'
    issues?: string[]
  }
  lights: Array<{
    type: string
    name: string
    visible: boolean
    intensity: number
    castShadow: boolean
    isSun?: boolean
  }>
  ambientLight: {
    found: boolean
    intensity?: number
    color?: string
  }
  directionalLights: number
  pointLights: number
  spotLights: number
  rectAreaLights: number
  hemisphereLights: number
}

/**
 * Verify sun light configuration and count all light sources
 */
export function verifySunLight(scene: THREE.Scene): SunLightVerificationReport {
  const lights: THREE.Light[] = []
  let sunLight: THREE.DirectionalLight | null = null
  let ambientLight: THREE.AmbientLight | null = null
  const directionalLights: THREE.DirectionalLight[] = []
  const pointLights: THREE.PointLight[] = []
  const spotLights: THREE.SpotLight[] = []
  const rectAreaLights: THREE.RectAreaLight[] = []
  const hemisphereLights: THREE.HemisphereLight[] = []
  
  // Traverse scene to find all lights
  scene.traverse((obj) => {
    if (obj instanceof THREE.Light) {
      lights.push(obj)
      
      if (obj instanceof THREE.AmbientLight) {
        ambientLight = obj
      } else if (obj instanceof THREE.DirectionalLight) {
        directionalLights.push(obj)
        if (obj.userData.isSun || obj.name === 'Sun Light' || obj.name.includes('Sun')) {
          sunLight = obj
        }
      } else if (obj instanceof THREE.PointLight) {
        pointLights.push(obj)
      } else if (obj instanceof THREE.SpotLight) {
        spotLights.push(obj)
      } else if (obj instanceof THREE.RectAreaLight) {
        rectAreaLights.push(obj)
      } else if (obj instanceof THREE.HemisphereLight) {
        hemisphereLights.push(obj)
      }
    }
  })
  
  // If no sun light found by name/userData, use first directional light as fallback
  if (!sunLight && directionalLights.length > 0) {
    sunLight = directionalLights[0]
    console.warn('[SunLightVerification] ⚠️ No sun light marked with isSun=true, using first directional light as fallback')
  }
  
  // Build sun light report
  const sunLightReport: SunLightVerificationReport['sunLight'] = {
    found: !!sunLight,
    status: sunLight ? '✅ PROPERLY CONFIGURED' : '❌ NOT FOUND'
  }
  
  if (sunLight) {
    const shadow = sunLight.shadow
    const cam = shadow?.camera as THREE.OrthographicCamera | undefined
    
    sunLightReport.name = sunLight.name
    sunLightReport.position = {
      x: parseFloat(sunLight.position.x.toFixed(2)),
      y: parseFloat(sunLight.position.y.toFixed(2)),
      z: parseFloat(sunLight.position.z.toFixed(2))
    }
    sunLightReport.target = {
      x: parseFloat(sunLight.target.position.x.toFixed(2)),
      y: parseFloat(sunLight.target.position.y.toFixed(2)),
      z: parseFloat(sunLight.target.position.z.toFixed(2))
    }
    sunLightReport.intensity = sunLight.intensity
    sunLightReport.color = `#${sunLight.color.getHexString()}`
    sunLightReport.visible = sunLight.visible
    sunLightReport.castShadow = sunLight.castShadow
    sunLightReport.isSun = sunLight.userData.isSun || false
    
    if (shadow) {
      sunLightReport.shadowMapSize = {
        width: shadow.mapSize.width,
        height: shadow.mapSize.height
      }
      sunLightReport.shadowBias = shadow.bias
      sunLightReport.shadowNormalBias = shadow.normalBias
      sunLightReport.shadowRadius = shadow.radius
      
      if (cam) {
        sunLightReport.shadowCamera = {
          near: cam.near,
          far: cam.far,
          left: cam.left,
          right: cam.right,
          top: cam.top,
          bottom: cam.bottom
        }
      }
    }
    
    // Check for issues
    const issues: string[] = []
    if (!sunLight.castShadow) issues.push('castShadow is false')
    if (!sunLight.visible) issues.push('light is not visible')
    if (!shadow) issues.push('shadow is not configured')
    if (shadow && shadow.mapSize.width < 1024) issues.push('shadow map size < 1024 (may cause low quality shadows)')
    if (cam && cam.near > 0.001) issues.push('shadow camera near plane > 0.001 (may miss interior shadows)')
    if (shadow && shadow.bias > -0.0001) issues.push('shadow bias too positive (may cause shadow acne)')
    if (shadow && shadow.normalBias < 0.01) issues.push('shadow normal bias too low (may cause shadow acne)')
    
    if (issues.length > 0) {
      sunLightReport.status = '⚠️ ISSUES DETECTED'
      sunLightReport.issues = issues
    }
  }
  
  // Build lights array
  const lightsArray: SunLightVerificationReport['lights'] = lights.map((light) => ({
    type: light.constructor.name,
    name: light.name || 'Unnamed',
    visible: light.visible,
    intensity: light.intensity,
    castShadow: (light as any).castShadow || false,
    isSun: (light as any).userData?.isSun || false
  }))
  
  // Build ambient light report
  const ambientLightReport: SunLightVerificationReport['ambientLight'] = {
    found: !!ambientLight
  }
  if (ambientLight) {
    ambientLightReport.intensity = ambientLight.intensity
    ambientLightReport.color = `#${ambientLight.color.getHexString()}`
  }
  
  return {
    totalLights: lights.length,
    sunLight: sunLightReport,
    lights: lightsArray,
    ambientLight: ambientLightReport,
    directionalLights: directionalLights.length,
    pointLights: pointLights.length,
    spotLights: spotLights.length,
    rectAreaLights: rectAreaLights.length,
    hemisphereLights: hemisphereLights.length
  }
}

/**
 * Log sun light verification report to console
 */
export function logSunLightVerification(scene: THREE.Scene): SunLightVerificationReport {
  const report = verifySunLight(scene)
  
  console.group('☀️ Sun Light Verification Report')
  
  console.log('=== LIGHT SOURCE COUNT ===')
  console.log(`Total Lights: ${report.totalLights}`)
  console.log(`- Ambient Light: ${report.ambientLight.found ? 1 : 0}`)
  console.log(`- Directional Lights: ${report.directionalLights}`)
  console.log(`- Point Lights: ${report.pointLights}`)
  console.log(`- Spot Lights: ${report.spotLights}`)
  console.log(`- RectArea Lights: ${report.rectAreaLights}`)
  console.log(`- Hemisphere Lights: ${report.hemisphereLights}`)
  
  console.log('\n=== SUN LIGHT CONFIGURATION ===')
  if (report.sunLight.found) {
    console.log('✅ Sun Light Found:', {
      name: report.sunLight.name,
      type: 'DirectionalLight',
      position: report.sunLight.position,
      target: report.sunLight.target,
      intensity: report.sunLight.intensity,
      color: report.sunLight.color,
      visible: report.sunLight.visible,
      enabled: report.sunLight.visible,
      castShadow: report.sunLight.castShadow,
      isSun: report.sunLight.isSun,
      shadowMapSize: report.sunLight.shadowMapSize,
      shadowBias: report.sunLight.shadowBias,
      shadowNormalBias: report.sunLight.shadowNormalBias,
      shadowRadius: report.sunLight.shadowRadius,
      shadowCamera: report.sunLight.shadowCamera,
      status: report.sunLight.status
    })
    
    if (report.sunLight.issues && report.sunLight.issues.length > 0) {
      console.warn('⚠️ Sun Light Issues:', report.sunLight.issues)
    } else {
      console.log('✅ Sun Light is properly configured for standard mode')
    }
  } else {
    console.warn('⚠️ NO SUN LIGHT FOUND!')
    console.log('Available Directional Lights:', report.lights.filter(l => l.type === 'DirectionalLight').map(l => ({
      name: l.name,
      isSun: l.isSun,
      castShadow: l.castShadow
    })))
  }
  
  console.log('\n=== ALL LIGHTS DETAIL ===')
  report.lights.forEach((light, index) => {
    console.log(`${index + 1}. ${light.type}:`, {
      name: light.name,
      type: light.type,
      visible: light.visible,
      intensity: light.intensity,
      castShadow: light.castShadow,
      isSun: light.isSun
    })
  })
  
  console.groupEnd()
  
  return report
}









