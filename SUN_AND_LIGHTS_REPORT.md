# Sun Light Configuration & Light Sources Report

## Sun Light Configuration in Standard Mode

### ✅ Sun Light is Properly Configured

**Location**: `src/viewer/ViewerCanvas.tsx` (lines 1766-1775)

**Default Sun Light Creation**:
- **Name**: "Sun Light"
- **Type**: `THREE.DirectionalLight`
- **Position**: `(5, 10, 5)`
- **Intensity**: `1.0`
- **Color**: `#ffffff` (white)
- **castShadow**: `true` ✅
- **enabled**: `true` ✅
- **isSun**: `true` ✅

**Shadow Configuration** (via `lightUtils.ts` lines 199-245):
- **Shadow Map Size**: From store (configurable, default typically 1024x1024 or higher)
- **Shadow Bias**: `-0.0002` ✅
- **Normal Bias**: `0.02` ✅
- **Shadow Radius**: `3` (configurable via `shadowRadius` in config)
- **Shadow Camera Near**: `0.001` ✅ (for interior shadows)
- **Shadow Camera Far**: `5000` ✅
- **Shadow Camera Bounds**: `-2000` to `2000` (initial, then updated via `updateAllShadowCameraBounds`)

**Status**: ✅ **PROPERLY CONFIGURED** for standard mode

### Sun Light Marking
- Sun light is marked with `userData.isSun = true` (line 196 in `lightUtils.ts`)
- Sun lights don't get visual helpers (line 1824 in `ViewerCanvas.tsx`)
- Sun light is registered with `ShadowManager` for unified management

## Light Sources Count

### Default Lights (Always Present)

1. **Ambient Light** (`THREE.AmbientLight`)
   - **Location**: `src/viewer/ViewerCanvas.tsx` (line 1454)
   - **Intensity**: `0.6` (adjustable via store `ambientIntensity`)
   - **Color**: `0xffffff` (white, adjustable via store)
   - **Name**: "Ambient Light"
   - **Purpose**: Provides base illumination to prevent completely dark areas

2. **Sun Light** (`THREE.DirectionalLight`)
   - **Location**: Auto-created if no lights exist (line 1766-1775)
   - **Intensity**: `1.0`
   - **Position**: `(5, 10, 5)`
   - **Casts Shadows**: Yes ✅
   - **Purpose**: Main directional light source (like sunlight)

### Additional Lights (User-Configurable)

Lights are stored in `directionalLights` Map in the viewer instance, but can include:
- **Directional Lights**: Main light type (can have multiple)
- **Point Lights**: Omnidirectional lights (like light bulbs)
- **Spot Lights**: Directional cone lights (like spotlights)
- **RectArea Lights**: Rectangular area lights (physically-based)
- **Hemisphere Lights**: Sky/ground color lights (for ambient-like effects)

**Count**: Minimum **2 lights** (1 Ambient + 1 Sun), but can have many more based on user configuration.

## How to Check Current Light Count

Run this in browser console:

```javascript
// Get viewer instance
const viewer = window.__viewer || (window as any).__viewer

if (!viewer) {
  console.error('Viewer not found')
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
  console.log(`  └─ Sun Light: ${sunLight ? '✅ Found' : '❌ Not Found'}`)
  console.log(`- Point Lights: ${pointLights.length}`)
  console.log(`- Spot Lights: ${spotLights.length}`)
  console.log(`- RectArea Lights: ${rectAreaLights.length}`)
  console.log(`- Hemisphere Lights: ${hemisphereLights.length}`)
  
  if (sunLight) {
    console.log('\n=== SUN LIGHT CONFIGURATION ===')
    console.log({
      name: sunLight.name,
      position: { x: sunLight.position.x, y: sunLight.position.y, z: sunLight.position.z },
      intensity: sunLight.intensity,
      color: `#${sunLight.color.getHexString()}`,
      visible: sunLight.visible,
      castShadow: sunLight.castShadow,
      shadowMapSize: sunLight.shadow ? {
        width: sunLight.shadow.mapSize.width,
        height: sunLight.shadow.mapSize.height
      } : null,
      shadowBias: sunLight.shadow?.bias,
      shadowNormalBias: sunLight.shadow?.normalBias,
      shadowCameraNear: sunLight.shadow?.camera?.near,
      status: sunLight.castShadow && sunLight.visible ? '✅ PROPERLY CONFIGURED' : '⚠️ ISSUES'
    })
  }
}
```

## Summary

- **Sun Light**: ✅ Properly configured with shadows enabled
- **Minimum Light Count**: **2 lights** (1 Ambient + 1 Sun)
- **Maximum Light Count**: Unlimited (user can add more via Lighting Panel)
- **Shadow System**: ✅ Fully configured for interior shadows









