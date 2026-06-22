# Fix: Interior Shadows Not Receiving

## Problem
Interior shadows (like inside a car) are no longer receiving shadows.

## Root Cause
The shadow auto-fix was setting the shadow camera near plane to `0.1`, which is too large to capture shadows on close interior surfaces. Interior surfaces need a much smaller near plane (0.001 or 0.0005) to properly capture shadows.

## Fix Applied

### 1. Updated Shadow Auto-Fix Near Plane
**File:** `src/utils/shadowAutoFixer.ts`

**Changes:**
- Changed `shadowCamera.near = 0.1` to `shadowCamera.near = 0.001` for directional lights
- Added dynamic near plane calculation based on scene size:
  - For small objects (< 1.0 units): `0.0005`
  - For larger objects: `0.001`

**Why:**
- A smaller near plane allows the shadow camera to see very close surfaces
- This is essential for shadows to appear on internal parts of complex models like cars
- Interior surfaces are often very close together, so a large near plane culls them

### 2. Shadow Camera Settings
The shadow camera now uses:
- **Near plane:** `0.001` (or `0.0005` for very small objects)
- **Far plane:** Based on scene size with margin
- **Bias:** Optimized for self-shadowing on internal parts

## How It Works

1. **Model Loading:** When a model loads, `enhanceInternalShadows()` is called
2. **Shadow Auto-Fix:** The auto-fix now uses a smaller near plane
3. **Shadow Camera Update:** `updateAllShadowCameraBounds()` uses `0.001` near plane

## Testing

To verify interior shadows are working:
1. Load a car model (like Pagani Utopia)
2. Look inside the car interior
3. Shadows should appear on interior surfaces (seats, dashboard, etc.)
4. Check console for: `[ShadowEnhancement] Enhanced shadows on internal surfaces`

## Additional Notes

- The `enhanceInternalShadows()` function also makes materials double-sided for better shadow visibility
- Shadow bias is optimized for self-shadowing on internal parts
- All meshes should have `receiveShadow = true` (checked during model load)

