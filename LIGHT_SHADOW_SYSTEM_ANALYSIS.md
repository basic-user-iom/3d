# Light and Shadow System Analysis

## Issues Identified

### 1. Interior Shadows Not Appearing
**Problem**: Shadows don't appear inside car models

**Root Causes**:
- **Inconsistent shadow camera near plane values**:
  - `shadowManager.ts`: Uses `0.1` for most cases (TOO LARGE for interior shadows)
  - `ViewerCanvas.tsx`: Uses `0.001` or `0.0005` (CORRECT for interior shadows)
  - `lightUtils.ts`: Uses `0.01` (MARGINAL - may work but not optimal)
  - `shadowAutoFixer.ts`: Uses `0.001` or `0.0005` (CORRECT)

- **Conflict**: `shadowManager.ts` was recently changed to use `0.1` to prevent z-fighting, but this breaks interior shadows

**Solution**: Use dynamic near plane based on scene scale:
  - Very small objects (< 0.01 units): `0.001`
  - Small objects (< 0.1 units): `0.01`
  - Normal objects: `0.1` (prevents z-fighting)
  - But for interior shadows, we need `0.001` regardless

### 2. Duplicate Code
**Problem**: Shadow camera configuration is duplicated in multiple files

**Locations**:
1. `ViewerCanvas.tsx` - Has its own `updateShadowCameraBounds` function (lines 1473-1751)
2. `shadowManager.ts` - Has `updateShadowCameraBounds` function (lines 152-357)
3. `lightUtils.ts` - Sets initial shadow camera values (lines 222-242)
4. `shadowAutoFixer.ts` - Also sets shadow camera values (lines 123-139)

**Solution**: Consolidate to use `shadowManager.ts` as the single source of truth

### 3. Light Configuration Issues
**Problem**: Lights might not be properly registered or configured

**Potential Issues**:
- Lights created in `ViewerCanvas.tsx` might not be registered with `ShadowManager`
- Multiple light creation paths (direct creation vs. `createLight` utility)
- Shadow settings might not be consistently applied

### 4. Compatibility Issues
**Problem**: Shadow system and light system might have compatibility issues

**Issues**:
- `ShadowManager` manages shadow systems but lights are created separately
- No unified light management system
- Shadow camera updates might conflict between systems

## Best Practices from Perplexity Analysis

1. **Centralized Shadow Manager**: Create a single shadow manager to avoid duplicate code
2. **Dynamic Near Plane**: Use scene-scale-based near plane calculation
3. **Transparent Materials**: Ensure `castShadow=false`, `depthWrite=false`, `receiveShadow=true`
4. **Interior Shadows**: Use very small near plane (0.001) for interior surfaces
5. **Light Registration**: All lights should be registered with shadow manager

## Recommended Fixes

### Fix 1: Unify Shadow Camera Near Plane Logic
- Use `shadowManager.ts` as single source of truth
- Implement dynamic near plane that balances z-fighting prevention with interior shadow capture
- For interior shadows, prioritize small near plane over z-fighting prevention

### Fix 2: Remove Duplicate Code
- Remove `updateShadowCameraBounds` from `ViewerCanvas.tsx`
- Use `shadowManager.ts` version exclusively
- Update all call sites to use `shadowManager.updateShadowCameraBounds`

### Fix 3: Ensure All Lights Are Registered
- Verify all lights are registered with `ShadowManager`
- Ensure `createLight` utility registers lights automatically
- Add validation to check for unregistered lights

### Fix 4: Improve Interior Shadow Support
- Ensure `enhanceInternalShadows` is called after model load
- Verify transparent materials are properly configured
- Check that shadow camera near plane is set correctly for interior shadows









