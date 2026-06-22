# Perplexity Query: Three.js Light Position userData Not Persisting

## Problem Description

We're experiencing an issue where `userData` properties on Three.js `DirectionalLight` objects are not persisting after CSM (Cascaded Shadow Maps) shadow system operations.

### Specific Issue

1. **Before enabling Weather GL (CSM)**: Light position is saved to `light.userData._originalPosition`
2. **After exiting Weather GL**: The same light object (from the Map) shows `userData._originalPositionSaved = false` and `userData._originalPosition = undefined`

### Code Flow

**Saving (before Weather GL):**
```typescript
// ViewerCanvas.tsx:10352-10365
if (light instanceof THREE.DirectionalLight && !light.userData._originalPositionSaved) {
  light.userData._originalPosition = light.position.clone()
  light.userData._originalTargetPosition = light.target.position.clone()
  light.userData._originalIntensity = light.intensity
  light.userData._originalCastShadow = light.castShadow
  light.userData._originalVisible = light.visible
  light.userData._originalPositionSaved = true
  console.log('💾 Saved original light position') // ✅ This logs successfully
}
```

**Restoring (after Weather GL exit):**
```typescript
// ViewerCanvas.tsx:10870-10893
lights.forEach(light => {
  const hasSavedData = light.userData._originalPositionSaved
  const savedPos = light.userData._originalPosition
  
  console.log({
    hasSavedData: hasSavedData ? '✅ YES' : '❌ NO', // ❌ Shows 'NO'
    saved: savedPos ? {...} : 'NOT SAVED' // ❌ Shows 'NOT SAVED'
  })
})
```

### Observations

- ✅ Light is from the Map (same instance)
- ✅ Position was saved before Weather GL (log confirms)
- ❌ `_originalPositionSaved` is `false` after exit
- ❌ `_originalPosition` is `undefined` after exit

### What Happens During Weather GL

1. CSM shadow system is created
2. `ShadowSystemCoordinator.switchSystem('csm')` is called
3. `ShadowManager.setShadowSystem('csm')` is called
4. Standard lights are disabled (but not removed from scene)
5. CSM lights are added to scene
6. When exiting: CSM is destroyed, system switches back to 'standard'

### Questions for Perplexity

1. **userData Persistence**: Does Three.js `userData` persist through scene operations, or can it be cleared/reset in certain scenarios?

2. **CSM Impact**: Could CSM shadow system operations (creating/destroying CSM lights, modifying scene graph) affect `userData` on other lights?

3. **ShadowManager Operations**: Could `ShadowManager.setShadowSystem()` or related shadow operations clear or reset light `userData`?

4. **Best Practices**: What's the recommended pattern for persisting light state across shadow system switches in Three.js?
   - Should we use a separate Map/registry instead of `userData`?
   - Should we save state outside the light object?
   - Is there a Three.js pattern for this?

5. **Reference Issues**: Could the light object reference change even though it's in the same Map? How to ensure we're using the same instance?

6. **Timing Issues**: Could `userData` be cleared asynchronously? Should we check immediately after operations?

### Current Workaround Attempts

1. ✅ Prioritizing Map lights (ensures same instance)
2. ✅ Checking `_originalPositionSaved` flag
3. ✅ Cloning Vector3 objects when saving
4. ❌ Still losing data - need architectural guidance

### Technical Context

- **Three.js version**: 0.162
- **React 18** with Vite
- **Custom CSM implementation** (StreetsGLCSM)
- **Shadow system switching**: Standard ↔ CSM ↔ HDR

### Request

Please provide:
1. Best practices for persisting object state in Three.js during scene operations
2. Common pitfalls with `userData` persistence
3. Recommended patterns for state management during shadow system switches
4. Whether we should use an external registry instead of `userData`





















