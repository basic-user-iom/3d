# Streets GL Integration Fixes - Summary

## Issues Fixed

### 1. ✅ Removed 200x Scale Multiplier
**Problem**: Objects were scaled 200x, making them way too large and not matching building sizes.

**Fix**: Removed the scale multiplier. Objects now use their natural Three.js scale, which matches the map scale.

**Location**: `src/viewer/useViewer.ts` - `syncObjectToStreetsGLInternal()`

---

### 2. ✅ Fixed Object Positioning on Ground
**Problem**: Objects were floating in the middle of the screen, not positioned on the ground at the map location.

**Fix**: 
- Objects at origin (0,0,0) are now positioned at map center (camera X/Z) on estimated ground level
- Ground level is estimated as `camera.y - 200m` (typical camera height above ground)
- Objects are placed on the ground, not floating

**Location**: `src/viewer/useViewer.ts` - `syncModelToStreetsGL()`

**Changes**:
- When object is at origin, place it at `(camera.x, estimatedGroundLevel, camera.z)`
- When object has offset, add to camera position
- Ground level calculation: `Math.max(0, cameraPos.y - 200)`

---

### 3. ✅ Added Shadow Support for External Objects
**Problem**: Objects had no shadows, making them look like they're floating or not integrated.

**Fix**: 
- Created `ExternalObjectDepthMaterialContainer` for shadow mapping
- Added `renderExternalObjects()` method to `ShadowMappingPass`
- External objects now participate in Streets GL's shadow system

**Files Created**:
- `streets-gl-alt/src/app/render/materials/ExternalObjectDepthMaterialContainer.ts`

**Files Modified**:
- `streets-gl-alt/src/app/render/passes/ShadowMappingPass.ts`
  - Added `externalObjectMaterial` property
  - Added `renderExternalObjects()` method
  - Added `getExternalObjects()` helper method
  - Integrated into shadow rendering loop

---

## Technical Details

### Shadow Integration
- External objects use the same depth shader as generic instances (`instanceGenericDepth`)
- Objects are rendered in shadow mapping pass (first 2 cascades only, like instances)
- Shadow maps are generated for external objects, allowing them to cast and receive shadows

### Positioning Logic
- **Origin objects (0,0,0)**: Placed at map center on ground
- **Offset objects**: Positioned relative to camera with offset
- **Ground level**: Estimated from camera height (camera.y - 200m)

### Scale
- **Before**: 200x multiplier (way too large)
- **After**: Natural scale (matches building sizes)

---

## Expected Results

After these fixes:
1. ✅ Objects positioned on the ground at map center
2. ✅ Objects scale naturally (match building sizes)
3. ✅ Objects cast and receive shadows
4. ✅ Objects are part of Streets GL's rendering pipeline

---

## Testing

To verify the fixes:
1. Create a primitive (box)
2. Check that it appears on the ground at map center
3. Check that it has shadows (cast and receive)
4. Check that it scales correctly relative to buildings
5. Move/rotate/scale the object - it should update in Streets GL

---

## Files Modified

1. `src/viewer/useViewer.ts`
   - Removed 200x scale multiplier
   - Fixed positioning to place objects on ground

2. `streets-gl-alt/src/app/render/materials/ExternalObjectDepthMaterialContainer.ts` (NEW)
   - Created depth material for external objects

3. `streets-gl-alt/src/app/render/passes/ShadowMappingPass.ts`
   - Added shadow rendering for external objects


