# Sun Light Configuration Diagnostic

## Diagnostic Function

Run this in the browser console to check sun configuration and count all lights:

```javascript
// Get viewer instance
const viewer = window.__viewer || (window as any).__viewer

if (!viewer) {
  console.error('Viewer not found. Make sure viewer is initialized.')
} else {
  const scene = viewer.scene
  const lights = []
  let sunLight = null
  let ambientLight = null
  let directionalLights = []
  let pointLights = []
  let spotLights = []
  let rectAreaLights = []
  let hemisphereLights = []
  
  scene.traverse((obj) => {
    if (obj instanceof THREE.Light) {
      lights.push(obj)
      
      if (obj instanceof THREE.AmbientLight) {
        ambientLight = obj
      } else if (obj instanceof THREE.DirectionalLight) {
        directionalLights.push(obj)
        if (obj.userData.isSun || obj.name === 'Sun Light') {
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
  
  console.log('=== LIGHT SOURCE COUNT ===')
  console.log(`Total Lights: ${lights.length}`)
  console.log(`- Ambient Light: ${ambientLight ? 1 : 0}`)
  console.log(`- Directional Lights: ${directionalLights.length}`)
  console.log(`- Point Lights: ${pointLights.length}`)
  console.log(`- Spot Lights: ${spotLights.length}`)
  console.log(`- RectArea Lights: ${rectAreaLights.length}`)
  console.log(`- Hemisphere Lights: ${hemisphereLights.length}`)
  
  console.log('\n=== SUN LIGHT CONFIGURATION ===')
  if (sunLight) {
    const shadow = sunLight.shadow
    const cam = shadow?.camera as THREE.OrthographicCamera | undefined
    
    console.log('✅ Sun Light Found:', {
      name: sunLight.name,
      type: 'DirectionalLight',
      position: {
        x: sunLight.position.x.toFixed(2),
        y: sunLight.position.y.toFixed(2),
        z: sunLight.position.z.toFixed(2)
      },
      target: {
        x: sunLight.target.position.x.toFixed(2),
        y: sunLight.target.position.y.toFixed(2),
        z: sunLight.target.position.z.toFixed(2)
      },
      intensity: sunLight.intensity,
      color: `#${sunLight.color.getHexString()}`,
      visible: sunLight.visible,
      enabled: sunLight.visible,
      castShadow: sunLight.castShadow,
      isSun: sunLight.userData.isSun || false,
      shadowMapSize: shadow ? {
        width: shadow.mapSize.width,
        height: shadow.mapSize.height
      } : null,
      shadowBias: shadow?.bias,
      shadowNormalBias: shadow?.normalBias,
      shadowRadius: shadow?.radius,
      shadowCamera: cam ? {
        near: cam.near,
        far: cam.far,
        left: cam.left,
        right: cam.right,
        top: cam.top,
        bottom: cam.bottom
      } : null,
      status: sunLight.castShadow && sunLight.visible ? '✅ PROPERLY CONFIGURED' : '⚠️ ISSUES DETECTED'
    })
    
    // Check for issues
    const issues = []
    if (!sunLight.castShadow) issues.push('castShadow is false')
    if (!sunLight.visible) issues.push('light is not visible')
    if (!shadow) issues.push('shadow is not configured')
    if (shadow && shadow.mapSize.width < 1024) issues.push('shadow map size < 1024')
    if (cam && cam.near > 0.001) issues.push('shadow camera near plane > 0.001 (may miss interior shadows)')
    
    if (issues.length > 0) {
      console.warn('⚠️ Sun Light Issues:', issues)
    } else {
      console.log('✅ Sun Light is properly configured for standard mode')
    }
  } else {
    console.warn('⚠️ NO SUN LIGHT FOUND!')
    console.log('Available Directional Lights:', directionalLights.map(l => ({
      name: l.name,
      isSun: l.userData.isSun || false,
      castShadow: l.castShadow
    })))
  }
  
  console.log('\n=== ALL LIGHTS DETAIL ===')
  lights.forEach((light, index) => {
    console.log(`${index + 1}. ${light.constructor.name}:`, {
      name: light.name,
      type: light.constructor.name,
      visible: light.visible,
      intensity: light.intensity,
      castShadow: light.castShadow || false,
      isSun: light.userData?.isSun || false
    })
  })
}
```









