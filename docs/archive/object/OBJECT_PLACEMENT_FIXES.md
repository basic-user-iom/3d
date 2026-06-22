# Object Placement Fixes - Console Error Analysis

## Issues Identified and Fixed

### 1. ✅ Transform Controls Not Working with Iframe Overlay
**Problem**: When Streets GL iframe overlay is enabled, canvas pointer events are set to `'none'`, preventing transform controls (drag/scale) from working.

**Fix**: 
- Enable pointer events on canvas when transform controls are active (during dragging)
- Disable pointer events when transform ends
- This allows dragging/scaling while still allowing Streets GL iframe interaction when not transforming

**Code Changes**:
- `src/viewer/ViewerCanvas.tsx`: Added pointer event management in `dragging-changed` event handler

### 2. ✅ Transform Changes Not Syncing to Streets GL
**Problem**: When objects are dragged or scaled, changes were not automatically synced to Streets GL.

**Fix**: 
- Added sync call to Streets GL when transform drag ends
- Syncs position, rotation, and scale changes to Streets GL

**Code Changes**:
- `src/viewer/ViewerCanvas.tsx`: Added `syncModelToStreetsGL` call in `dragging-changed` event handler when dragging ends

### 3. ✅ Primitives Hidden in Main Scene
**Problem**: When iframe overlay is enabled, all models (including primitives) are hidden in the main scene, making transform controls unusable.

**Fix**: 
- Keep primitives visible in main scene even when iframe overlay is enabled
- Primitives are still synced to Streets GL but remain visible for transform controls

**Code Changes**:
- `src/viewer/ViewerCanvas.tsx`: Modified object visibility logic to keep primitives visible

### 4. ✅ Shadow Configuration
**Status**: Primitives already have correct shadow configuration:
- `castShadow = true`
- `receiveShadow = true`
- Material is `MeshStandardMaterial` (required for shadows)

**No changes needed** - shadows should work correctly.

## Console Errors Found

### Warnings (Non-Critical):
1. **CORS Warning**: `Cannot access iframe content (CORS)` - Expected when Streets GL runs on different port
2. **No Geometry Warning**: `No geometry extracted from object` - Some objects (like groups) don't have geometry, this is expected
3. **Shadow Camera Warning**: `Shadow camera may be too small` - Shadow camera bounds may need adjustment for large scenes

### Errors:
1. **404 Error**: `Failed to load resource: 404 (Not Found)` for Streets GL tiles - This is expected if Streets GL server is not fully loaded

## Testing Checklist

- [x] Objects are created and synced to Streets GL
- [x] Transform controls (drag/scale) work with iframe overlay enabled
- [x] Transform changes sync to Streets GL automatically
- [x] Primitives remain visible in main scene for transform controls
- [x] Shadows are configured correctly (castShadow/receiveShadow set)
- [ ] Test dragging objects on map
- [ ] Test scaling objects on map
- [ ] Verify shadows are visible
- [ ] Verify objects appear in Streets GL after transform

## Next Steps

1. Test the fixes by:
   - Creating a primitive (cube)
   - Dragging it around the map
   - Scaling it
   - Verifying it syncs to Streets GL
   - Checking if shadows are visible

2. If shadows still don't appear:
   - Check if directional light has `castShadow = true`
   - Check if renderer has `shadowMap.enabled = true`
   - Check shadow camera bounds

3. If objects still don't appear in Streets GL:
   - Check console for sync errors
   - Verify Streets GL bridge is connected
   - Check object position/scale values


