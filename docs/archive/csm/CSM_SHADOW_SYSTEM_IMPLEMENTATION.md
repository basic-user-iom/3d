# CSM Shadow System Implementation

## Overview

Implemented **CSM (Cascaded Shadow Maps)** shadow system for the 3D Viewer, providing Streets GL-quality shadows when Dynamic Sky is enabled. This gives you the same high-quality shadow system that Streets GL uses, even when Streets GL overlay is not active.

## What is CSM?

**Cascaded Shadow Maps (CSM)** is an advanced shadow mapping technique that:
- Splits the view frustum into multiple cascades (layers) at different distances
- Provides **high-quality shadows** at close range (first cascade)
- Provides **lower resolution but still accurate shadows** at far distances (later cascades)
- Offers **better performance** than single shadow map for large scenes
- Matches the shadow quality of Streets GL

## Implementation Details

### 1. CSM Shadow System (`src/viewer/effects/CSMShadowSystem.ts`)

Created a new `CSMShadowSystem` class that:
- Wraps the `three-csm` library
- Provides Streets GL-quality shadows (3 cascades, 2048x2048 resolution)
- Syncs with sun direction from time of day
- Updates automatically in the render loop

**Configuration**:
- **Cascades**: 3 (high quality, like Streets GL)
- **Shadow Map Size**: 2048x2048 (high resolution, like Streets GL)
- **Mode**: 'practical' (best quality)
- **Max Far**: 5000 units

### 2. Integration with Dynamic Sky

**When Dynamic Sky is enabled**:
- ✅ CSM Shadow System is automatically initialized
- ✅ Standard Three.js sun light shadows are disabled (CSM replaces them)
- ✅ CSM shadows sync with sun direction from time of day
- ✅ CSM updates in the render loop

**When Dynamic Sky is disabled**:
- ✅ CSM Shadow System is destroyed
- ✅ Standard Three.js sun light shadows are re-enabled

### 3. Code Changes

**File**: `src/viewer/ViewerCanvas.tsx`

1. **Added CSM import**:
   ```typescript
   import { CSMShadowSystem } from './effects/CSMShadowSystem'
   ```

2. **Added CSM to viewer ref**:
   ```typescript
   csmShadowSystem?: import('./effects/CSMShadowSystem').CSMShadowSystem
   ```

3. **CSM initialization** (when Dynamic Sky is enabled):
   - Creates CSM with 3 cascades, 2048x2048 resolution
   - Syncs with sun direction from time of day
   - Disables standard Three.js sun light shadows

4. **CSM update in render loop**:
   - Updates CSM camera when main camera changes
   - Updates CSM every frame for smooth shadows

5. **CSM cleanup** (when Dynamic Sky is disabled):
   - Destroys CSM system
   - Re-enables standard Three.js sun light shadows

### 4. Dependencies

**Installed**: `three-csm` npm package
- Provides CSM implementation for Three.js
- Compatible with Three.js r181+

## Usage

### Enable CSM Shadows

1. **Enable Dynamic Sky** in Weather Panel
2. CSM shadows are automatically activated
3. Shadows will have Streets GL-quality (3 cascades, high resolution)

### Features

- ✅ **High-quality shadows** at all distances
- ✅ **Automatic sun direction sync** from time of day
- ✅ **Works without Streets GL** - CSM is native to 3D Viewer
- ✅ **Automatic cleanup** when Dynamic Sky is disabled

## Comparison: Standard Shadows vs CSM

### Standard Three.js Shadows
- Single shadow map
- Fixed resolution for entire scene
- Can have quality issues at far distances
- Simpler, but lower quality

### CSM Shadows (Streets GL Quality)
- Multiple cascades (3 layers)
- High resolution at close range
- Lower resolution but accurate at far distances
- Better performance for large scenes
- **Matches Streets GL shadow quality**

## Technical Details

### CSM Configuration

```typescript
{
  cascades: 3,              // 3 cascades (like Streets GL)
  shadowMapSize: 2048,      // High resolution (like Streets GL)
  mode: 'practical',        // Best quality mode
  maxFar: 5000,             // Shadow distance
  shadowBias: -0.0002,      // Prevents shadow acne
  shadowNormalBias: 0.01,   // Reduces shadow acne on sharp angles
  shadowRadius: 3           // Shadow softness
}
```

### Sun Direction Sync

CSM automatically syncs with:
- Time of day slider (calculates sun position)
- Manual sun elevation/azimuth (if set)
- Streets GL sun direction (if Streets GL is active)

## Benefits

1. **Streets GL-quality shadows** without needing Streets GL overlay
2. **Better shadow quality** at all distances
3. **Automatic activation** when Dynamic Sky is enabled
4. **Seamless integration** with existing shadow system
5. **Performance optimized** with cascaded approach

## Notes

- CSM is **only active when Dynamic Sky is enabled**
- When Dynamic Sky is disabled, standard Three.js shadows are used
- CSM shadows work independently of Streets GL overlay
- CSM shadows sync with sun direction from time of day

## Future Enhancements

Potential improvements:
- CSM quality settings (low/medium/high)
- CSM cascade count configuration
- CSM shadow map size configuration
- CSM mode selection (practical/uniform/logarithmic)

---

## Summary

✅ **CSM Shadow System implemented**
✅ **Streets GL-quality shadows available when Dynamic Sky is enabled**
✅ **Works without Streets GL overlay**
✅ **Automatic activation/deactivation with Dynamic Sky**
✅ **Seamless integration with existing systems**

You now have Streets GL-quality shadows in your 3D Viewer when Dynamic Sky is enabled! 🎉


