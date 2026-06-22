# ViewerCanvas Refactoring Summary

## Completed Extractions

### 1. Light Utilities (`src/viewer/utils/lightUtils.ts`)
- ✅ `timeOfDayToSkyAngles` - Converts time of day to sun angles
- ✅ `computeLightDirection` - Computes light direction vector
- ✅ `createLight` - Creates lights with physical properties

### 2. Light Gizmos (`src/viewer/utils/lightGizmos.ts`)
- ✅ `createLightIconTexture` - Creates texture for light icons
- ✅ `computeGizmoScale` - Computes gizmo scale based on camera
- ✅ `createLightGizmoObject` - Creates visual gizmo for lights
- ✅ `updateLightGizmoFromLight` - Updates gizmo from light state
- ✅ `ensureLightGizmo` - Ensures gizmo exists for a light
- ✅ `removeLightGizmo` - Removes gizmo from scene
- ✅ `setLightGizmoSelected` - Sets gizmo selected state
- ✅ `disposeLightGizmo` - Disposes gizmo resources

### 3. Shadow Management (`src/viewer/utils/shadowManager.ts`)
- ✅ `updateShadowCameraBounds` - Updates shadow camera bounds for a light
- ✅ `updateAllShadowCameraBounds` - Updates bounds for all lights

## Remaining Work

### High Priority
1. **Remove duplicate function definitions** from `ViewerCanvas.tsx`:
   - Remove `createLightLegacy` (lines ~97-280)
   - Remove `createLightIconTexture` (lines ~282-388)
   - Remove `computeGizmoScale` (lines ~403-419)
   - Remove `createLightGizmoObject` (lines ~422-558)
   - Remove `setLightGizmoSelected` (lines ~391-405)
   - Remove `computeLightDirection` (lines ~407-423)
   - Remove `updateLightGizmoFromLight` (lines ~425-533)
   - Remove `ensureLightGizmo` (lines ~535-583)
   - Remove `removeLightGizmo` (lines ~585-619)
   - Remove `disposeLightGizmo` (lines ~360-389)

2. **Update local shadow functions** to use imported versions:
   - Replace local `updateShadowCameraBounds` (line ~2021) with imported version
   - Replace local `updateAllShadowCameraBounds` (line ~4603) with imported version

### Medium Priority
3. **Extract event handlers** to `src/viewer/utils/eventHandlers.ts`:
   - Mouse event handlers
   - Keyboard event handlers
   - Click handlers
   - Marquee selection

4. **Extract transform controls** to `src/viewer/utils/transformControls.ts`:
   - Transform control setup
   - Transform control event handlers

5. **Extract render loop** to `src/viewer/utils/renderLoop.ts`:
   - Animation loop logic
   - Per-frame updates

## File Size Reduction

- **Before**: 9,225 lines
- **After extraction**: ~8,500 lines (estimated)
- **Target**: <7,000 lines (after all extractions)

## Benefits

1. **Improved Maintainability**: Smaller, focused modules
2. **Better Testability**: Functions can be tested in isolation
3. **Code Reusability**: Functions can be reused in other components
4. **Easier Debugging**: Smaller files are easier to navigate
5. **Better Organization**: Related functionality grouped together

## Next Steps

1. Remove duplicate function definitions from ViewerCanvas.tsx
2. Update all function calls to use imported versions
3. Test to ensure all functionality still works
4. Continue with remaining extractions (event handlers, transform controls, render loop)

