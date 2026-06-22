# ViewerCanvas Hooks - Null Safety Fix

## Issue Fixed

**Error**: `Cannot read properties of null (reading 'container')` at `useThreeScene.ts:235`

**Root Cause**: The `useThreeScene` hook was trying to access `config.container` in the dependency array when `config` could be `null`.

## Fix Applied

### useThreeScene.ts

1. **Updated function signature** to accept null:
   ```typescript
   // Before: export function useThreeScene(config: ThreeSceneConfig)
   // After: export function useThreeScene(config: ThreeSceneConfig | null)
   ```

2. **Added null check** in useEffect:
   ```typescript
   // Before: if (!config.container) return
   // After: if (!config || !config.container) return
   ```

3. **Used optional chaining** in dependency array:
   ```typescript
   // Before: [config.container, config.pixelRatio, ...]
   // After: [config?.container, config?.pixelRatio, ...]
   ```

### ViewerCanvas.tsx

4. **Removed unnecessary type cast**:
   ```typescript
   // Before: useThreeScene(sceneConfig as any)
   // After: useThreeScene(sceneConfig)
   ```

## Verification

All other hooks already handle null configs correctly:

- ✅ **useThreeControls**: Accepts `ThreeControlsConfig | null`, uses optional chaining
- ✅ **useThreeLighting**: Accepts `ThreeLightingConfig | null`, uses safe pattern
- ✅ **useThreeShadows**: Accepts `ThreeShadowsConfig | null`, uses optional chaining
- ✅ **useThreeEffects**: Accepts `ThreeEffectsConfig | null`, uses safe pattern
- ✅ **useThreeModelLoader**: Accepts `ThreeModelLoaderConfig | null`, uses safe pattern
- ✅ **useThreeObjectManager**: Accepts `ThreeObjectManagerConfig | null`, uses safe pattern
- ✅ **useThreeAnimation**: Accepts `ThreeAnimationConfig | null`, uses safe pattern

## Best Practices Applied

1. **Null-safe function signatures**: All hooks accept `Config | null`
2. **Early return pattern**: Check for null config at start of useEffect
3. **Optional chaining in dependencies**: Use `config?.property` in dependency arrays
4. **Stable identifiers**: Use string identifiers instead of object references when possible

## Testing

To verify the fix:

1. **Check browser console** - No more null reference errors
2. **Verify hook initialization** - All hooks should initialize when config becomes available
3. **Test container ref timing** - Hooks should wait for container to be ready
4. **Check feature flag** - Both hook-based and existing initialization should work

## Notes

- Hooks are designed to handle null configs gracefully
- They return `null` when config is not available
- They initialize when config becomes available
- This pattern allows for conditional initialization based on container availability














