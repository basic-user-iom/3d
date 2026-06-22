# ViewerCanvas Integration - Step by Step Guide

## Current Status
✅ All 8 hooks created
✅ Imports added to ViewerCanvas
⏳ Integration in progress

## Integration Strategy

Due to the complexity of ViewerCanvas (11,215 lines), integration must be done incrementally to avoid breaking changes.

### Phase 1: Add Hook Calls (Current)
Add hook calls at the component level, but keep existing initialization code as fallback.

### Phase 2: Replace Initialization
Gradually replace initialization code with hook results.

### Phase 3: Remove Old Code
Remove duplicate initialization code once hooks are fully integrated.

## Integration Order

1. **useThreeScene** - Foundation (scene, camera, renderer)
2. **useThreeControls** - Depends on scene
3. **useThreeLighting** - Depends on scene
4. **useThreeShadows** - Depends on scene, lights
5. **useThreeEffects** - Depends on scene, renderer
6. **useThreeModelLoader** - Depends on scene
7. **useThreeObjectManager** - Depends on scene, controls
8. **useThreeAnimation** - Depends on all

## Current Approach

Since ViewerCanvas has complex initialization logic that's tightly coupled, we'll:
1. Add hooks alongside existing code
2. Use hooks when available, fallback to existing code
3. Gradually migrate functionality
4. Test at each step

## Next Steps

1. Add hook calls in ViewerCanvas component
2. Build ViewerInstance from hook results
3. Test basic functionality
4. Migrate remaining features
5. Remove old code














