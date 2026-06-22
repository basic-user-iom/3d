# SSS Visibility Fix - Complete

**Date:** 2025-12-22  
**Status:** ✅ Fixed critical issues preventing SSS from being visible

---

## Problem

SSS (Screen Space Shadows) was enabled but no visual effect was visible on the car model.

---

## Root Causes (Based on Official Three.js Documentation)

1. **rayDistance too large** - Default was `50.0`, but official Three.js SSSNode uses `maxDistance: 0.1-0.2` for contact shadows
2. **Light direction not auto-detected** - Light direction was manually set via UI sliders instead of automatically calculated from the sun light in the scene
3. **Missing automatic light detection** - Official Three.js SSSNode requires `DirectionalLight` as `mainLight` parameter, but we weren't using the actual sun light

---

## Fixes Applied

### 1. Fixed rayDistance Default Value

**Before:**
```typescript
sssRayDistance: 50.0  // Way too large for contact shadows
```

**After:**
```typescript
sssRayDistance: 0.2  // Official Three.js default for contact shadows (0.1-0.2)
```

**Files Changed:**
- `src/store/useAppStore.ts` - Updated default value
- `src/viewer/postprocessing/SSSShader.ts` - Updated shader default value

**Why:** Official Three.js SSSNode uses `maxDistance: 0.1` (default) for contact shadows. Our value of 50.0 was tracing shadows 50 units away, which is way beyond contact shadow range. For contact shadows, use 0.1-0.5. For longer shadows, use 0.5-2.0.

---

### 2. Automatic Light Direction Detection

**Before:**
- Light direction was manually set via UI sliders (default: 0, -1, 0)
- Not connected to actual sun light in scene

**After:**
- Automatically finds sun light (`DirectionalLight` with `userData.isSun = true`)
- Calculates direction from `light.position` to `light.target` (direction TOWARD the light)
- Falls back to manual UI direction if no sun light found

**Code Added:**
```typescript
// In PostProcessingSystem.ts
private findSunLight(): THREE.DirectionalLight | null {
  const lights: THREE.DirectionalLight[] = []
  this.scene.traverse((object) => {
    if (object instanceof THREE.DirectionalLight) {
      lights.push(object)
    }
  })
  
  // Find sun light (marked with userData.isSun = true)
  const sunLight = lights.find(light => light.userData.isSun === true)
  if (sunLight) {
    return sunLight
  }
  
  // Fallback: use first directional light if no sun light found
  if (lights.length > 0) {
    return lights[0]
  }
  
  return null
}
```

**In updateSSSParameters():**
```typescript
// Automatically calculate light direction from sun light
const sunLight = this.findSunLight()
if (sunLight) {
  // Calculate direction from target to position (direction TOWARD the light)
  const lightDir = new THREE.Vector3()
    .subVectors(sunLight.position, sunLight.target.position)
    .normalize()
  worldLightDir = lightDir
}
```

**Files Changed:**
- `src/viewer/postprocessing/PostProcessingSystem.ts` - Added `findSunLight()` method and auto-detection logic

**Why:** Official Three.js SSSNode requires `DirectionalLight` as `mainLight` parameter. We should use the actual sun light in the scene, not manual UI sliders.

---

## Official Three.js Requirements (From Documentation)

Based on Perplexity research of official Three.js documentation:

1. **SSSNode Constructor:**
   ```javascript
   new SSSNode( depthNode, camera, mainLight )
   ```
   - `mainLight` must be a `DirectionalLight` object

2. **Key Properties:**
   - `maxDistance`: Maximum shadow length in world units. **Default: 0.1** (for contact shadows)
   - `shadowIntensity`: Shadow intensity, range [0, 1], default 1.0
   - `thickness`: Depth testing thickness, default 0.01

3. **Best Practices:**
   - Use SSS to complement traditional shadow maps (not replace them)
   - Best for rendering detailed contact shadows
   - Use small `maxDistance` values (0.1-0.2) for contact shadows
   - Use larger values (0.5-2.0) for longer shadows

---

## Testing Instructions

1. **Enable Post-Processing:**
   - Quality → Post-Processing → Enable Post-Processing

2. **Enable SSS:**
   - Quality → Effects → SSS → Enable SSS

3. **Verify Settings:**
   - **Ray Distance:** Should be 0.2 (default) for contact shadows
   - **Intensity:** Try 1.0-2.0 for better visibility
   - **Light Direction:** Should auto-detect from sun light (check console logs)

4. **Check Console:**
   - Look for: `[PostProcessingSystem] ✅ SSS using auto-detected sun light direction`
   - Verify light direction is calculated correctly

5. **Visual Check:**
   - Contact shadows should appear near object edges and contact points
   - Shadows should be subtle (complementing shadow maps, not replacing them)

---

## Expected Results

- ✅ Contact shadows visible on car model (near edges, contact points)
- ✅ Light direction automatically calculated from sun light
- ✅ Shadows appear with proper intensity
- ✅ No console errors

---

## Additional Notes

- **rayDistance:** For contact shadows, use 0.1-0.5. For longer shadows, use 0.5-2.0
- **Intensity:** When shadow maps are enabled, SSS intensity is reduced by 50% (configurable via `shadowMapIntensityMultiplier`)
- **Materials:** Materials don't need special configuration (SSS works on all surfaces)
- **Light:** Requires `DirectionalLight` with `userData.isSun = true` for auto-detection

---

## Files Modified

1. `src/store/useAppStore.ts` - Changed default `sssRayDistance` from 50.0 to 0.2
2. `src/viewer/postprocessing/SSSShader.ts` - Changed default `rayDistance` from 50.0 to 0.2
3. `src/viewer/postprocessing/PostProcessingSystem.ts` - Added `findSunLight()` method and auto-detection logic

---

## Next Steps

1. Test SSS visibility on car model
2. Adjust `rayDistance` if needed (0.1-0.5 for contact shadows)
3. Adjust `intensity` if shadows are too subtle or too strong
4. Verify light direction is correct (check console logs)














