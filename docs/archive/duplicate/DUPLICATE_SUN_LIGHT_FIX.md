# Duplicate Sun Light Source Fix

## Issue Found
**Problem**: Two sun light sources were active simultaneously:
1. **Three.js sun light** (directional light with `isSun` flag) - Still enabled and casting light
2. **Streets GL sun system** - Provides its own sun lighting

**Result**: Scene was over-lit with two sun sources, causing incorrect lighting and shadows.

## Root Cause
When Streets GL overlay is active:
- Streets GL provides its own sun lighting system
- Three.js sun light was still enabled and contributing to the scene
- Both systems were active simultaneously, creating duplicate light sources

## Fix Applied

### Disable Three.js Sun Light When Streets GL is Active
**File**: `src/viewer/ViewerCanvas.tsx` (lines 6777-6807)

**When Streets GL is active**:
- Sync `timeOfDay` to Streets GL sun direction
- **Disable Three.js sun light**: Set `light.visible = false` and `light.intensity = 0`
- Still update position/direction for consistency (in case Streets GL is disabled later)

**When Streets GL is NOT active**:
- Re-enable Three.js sun light: Set `light.visible = true`
- Restore intensity from store configuration
- Update sun light position from `timeOfDay` normally

## Code Changes

**Before** (both lights active):
```typescript
if (streetsGLIframeOverlay && streetsGLBridge) {
  // Sync to Streets GL
  streetsGLBridge.setSunDirection({ ... })
  // Three.js sun light still enabled and casting light ❌
  light.position.copy(sunLightPosition)
  // ...
}
```

**After** (only Streets GL light active):
```typescript
if (streetsGLIframeOverlay && streetsGLBridge) {
  // Sync to Streets GL
  streetsGLBridge.setSunDirection({ ... })
  // CRITICAL: Disable Three.js sun light to prevent duplicate light sources
  light.visible = false
  light.intensity = 0
  // Still update position for consistency
  light.position.copy(sunLightPosition)
  // ...
} else {
  // Re-enable Three.js sun light when Streets GL is inactive
  light.visible = true
  light.intensity = sunLightConfig.intensity || 1.0
  // ...
}
```

## Status
✅ **FIXED** - Only one sun light source is active at a time:
- ✅ When Streets GL is active: Streets GL sun provides lighting, Three.js sun light disabled
- ✅ When Streets GL is inactive: Three.js sun light provides lighting
- ✅ No duplicate light sources
- ✅ Proper light restoration when switching between systems


