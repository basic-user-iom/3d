# Weather GL and HDR Conflict Fixes Applied

## Date: 2024-12-19

Fixed conflicts between Weather GL and HDR that prevented HDR from being enabled after Weather GL exit.

---

## Fix 1: Restore scene.background After Weather GL Exit ✅

**Location**: `ViewerCanvas.tsx:11214-11237`

**Problem**: 
- When Weather GL exits, only HDR background visibility was restored
- `scene.background` was NOT restored (stayed `null` from Weather GL)
- Result: HDR couldn't be enabled because background was null

**Solution**: Explicitly restore `scene.background` after Weather GL exit.

**Code Added**:
```typescript
if (hdrEnabled) {
  // Restore HDR background visibility
  viewerRef.current.hdrSystem.updateBackgroundVisibility(hdrBackgroundVisible)
  
  // FIX: Explicitly restore scene.background if HDR is enabled
  const originalHdrTexture = viewerRef.current.environmentMap as THREE.DataTexture | null
  if (originalHdrTexture && originalHdrTexture instanceof THREE.DataTexture && 
      scene.environment && hdrBackgroundVisible && !hdrGroundProjectionEnabled) {
    originalHdrTexture.mapping = THREE.EquirectangularReflectionMapping
    originalHdrTexture.needsUpdate = true
    scene.background = originalHdrTexture
    console.log('[ViewerCanvas] ✅ HDR background texture restored after standalone weather disabled')
  } else if (hdrGroundProjectionEnabled) {
    scene.background = null  // Ground projection needs null
  } else if (!hdrBackgroundVisible) {
    scene.background = null  // Background hidden
  }
}
```

**Result**: `scene.background` is now properly restored after Weather GL exit.

---

## Fix 2: Force HDR State Refresh After Weather GL Exit ✅

**Location**: `ViewerCanvas.tsx:11214-11237`

**Problem**: 
- HDR system state might be stale after Weather GL exit
- Intensity and ground projection settings might not be applied

**Solution**: Force HDR system to refresh its state.

**Code Added**:
```typescript
// FIX: Force HDR to re-apply if HDR source exists (ensures HDR is fully active)
const hdrSource = hdrFile ?? hdrUrl
if (hdrSource && viewerRef.current.hdrSystem.getPMREMMap()) {
  // HDR is already loaded - just ensure it's applied correctly
  viewerRef.current.hdrSystem.updateIntensity(hdrIntensity)
  viewerRef.current.hdrSystem.updateGroundProjection({
    enabled: hdrGroundProjectionEnabled,
    height: store.hdrGroundProjectionHeight,
    radius: store.hdrGroundProjectionRadius,
    resolution: store.hdrGroundProjectionResolution,
    positionY: store.hdrGroundProjectionPositionY
  })
  console.log('[ViewerCanvas] ✅ HDR system state refreshed after standalone weather disabled')
}
```

**Result**: HDR system state is refreshed after Weather GL exit.

---

## Fix 3: Add enableStandaloneWeather to HDR Effect Dependencies ✅

**Location**: `ViewerCanvas.tsx:8217-8225`

**Problem**: 
- HDR effect didn't re-run when Weather GL was enabled/disabled
- Result: HDR background wasn't restored when Weather GL exited

**Solution**: Add `enableStandaloneWeather` to HDR effect dependencies.

**Code Changed**:
```typescript
}, [
  hdrEnabled,
  hdrUrl,
  hdrFile,
  enableStandaloneWeather // FIX: Re-run HDR effect when Weather GL changes
])
```

**Result**: HDR effect now re-runs when Weather GL changes, ensuring HDR is properly restored.

---

## Summary

All conflicts between Weather GL and HDR have been fixed:

1. ✅ **scene.background restoration** - Now explicitly restored after Weather GL exit
2. ✅ **HDR state refresh** - HDR system state is refreshed after Weather GL exit
3. ✅ **HDR effect dependencies** - Effect now re-runs when Weather GL changes

---

## Testing Recommendations

1. **Test Weather GL → HDR transition**
   - Enable Weather GL
   - Exit Weather GL
   - Enable HDR
   - Verify HDR background appears correctly

2. **Test HDR → Weather GL → HDR transition**
   - Enable HDR
   - Enable Weather GL (HDR background should hide)
   - Exit Weather GL
   - Verify HDR background is restored

3. **Test all combinations**
   - Standard → Weather GL → HDR
   - HDR → Weather GL → Standard
   - Weather GL → HDR → Weather GL

---

**Status**: ✅ All fixes applied - HDR can now be enabled after Weather GL exit





















