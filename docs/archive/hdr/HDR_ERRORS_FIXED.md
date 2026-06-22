# HDR Errors Fixed

## Critical Issues Found and Fixed

### 1. **Fallback Environment Detection Bug**
**Problem**: When HDR is enabled but not loaded yet, `scene.environment` might be set to the fallback `RoomEnvironment`. The code was checking `if (hdrEnabled && scene.environment)` and assuming HDR was already loaded, causing it to skip loading.

**Fix**: Added check to detect if `scene.environment` is from fallback:
```typescript
const isFallbackEnvironment = viewerRef.current?.defaultEnvTexture && 
                              scene.environment === viewerRef.current.defaultEnvTexture

if (isFallbackEnvironment) {
  // scene.environment is from fallback, not HDR - proceed to load HDR
  console.log('[HDR] HDR enabled but not loaded yet - loading HDR now')
}
```

**Location**: `ViewerCanvas.tsx` line ~2177-2189

### 2. **DataTexture Property Access**
**Problem**: Code was accessing `hdrTexture.image?.width` and `hdrTexture.image?.height`, but `DataTexture` (used for EXR files) stores dimensions directly in `width` and `height` properties, not in `image`.

**Fix**: Added fallback to check both `image.width` and `width`:
```typescript
const textureWidth = hdrTexture.image?.width || hdrTexture.width || 0
const textureHeight = hdrTexture.image?.height || hdrTexture.height || 0
```

**Locations**: 
- Line ~2342: HDR loaded successfully log
- Line ~2345: Memory calculation
- Line ~2408: Background set log
- Line ~2088: Using stored texture log
- Line ~3294: FORCED background log

## Summary

**Root Cause**: The HDR effect was detecting that `scene.environment` existed (from fallback RoomEnvironment) and assuming HDR was already loaded, preventing the actual HDR file from being loaded.

**Impact**: HDR would not load when:
- HDR was enabled for the first time
- Scene had fallback environment from DynamicSky
- HDR URL was set but file hadn't loaded yet

**Status**: ✅ FIXED - HDR should now load correctly even when fallback environment is present.





