# Shader Modifier Registry Migration Plan

## Overview
Migrate all shader modifiers from manual `onBeforeCompile` chaining to the unified `ShaderModifierRegistry` system to prevent conflicts and enable multiple modifiers to work together.

## Current Status

### ✅ Completed
- **ShadowOpacityModifierRegistry** - Registry-based version created (`src/viewer/materials/ShadowOpacityModifierRegistry.ts`)
- **ShaderModifierRegistry** - Core registry system implemented

### ⏳ In Progress  
- **Ground Projection Debug** - Adding visibility checks and logging

### ❌ Pending Migrations
1. **ShadowOpacityModifier** → Use registry-based version
2. **Ground Projection** (if shader injection exists) → Create registry modifier
3. **ShadowIntensity** (ViewerCanvas.tsx) → Create registry modifier
4. **CausticsModifier** → Migrate to registry
5. **RandomUVModifier** → Migrate to registry
6. **MaterialPanel dispersion** → Migrate to registry
7. **WaterSystem waves/caustics** → Migrate to registry

## Migration Steps

### Step 1: Complete ShadowOpacityModifier Migration ✅ (Code Created)
**File:** `src/viewer/materials/ShadowOpacityModifierRegistry.ts`
- ✅ Created registry-based version
- ⏳ Update imports in `useViewer.ts` and `ViewerCanvas.tsx`
- ⏳ Replace old `ShadowOpacityModifier` with `shadowOpacityModifierRegistry`

### Step 2: Debug Ground Projection
**Files:** `src/viewer/effects/ground-projection-setup.ts`, `src/viewer/effects/HDRSystem.ts`
- ✅ Added debug logging
- ⏳ Verify GroundedSkybox is visible
- ⏳ Check material rendering
- ⏳ Verify texture loading

### Step 3: Create Ground Projection Modifier (if needed)
**Note:** `GroundedSkybox` is a visual dome, not a shader modifier. However, if materials need to be modified to use ground-projected environment sampling, create a registry modifier.

### Step 4: Create Shadow Intensity Modifier
**File:** `src/viewer/materials/ShadowIntensityModifier.ts` (new)
- Extract shadow intensity injection from `ViewerCanvas.tsx`
- Register with `ShaderModifierRegistry`
- Priority: 40 (after ground projection, before shadow opacity)

### Step 5: Migrate Remaining Modifiers
1. **CausticsModifier** - Priority: 60
2. **RandomUVModifier** - Priority: 70
3. **WaterSystem** - Priority: 80
4. **MaterialPanel dispersion** - Priority: 90

## Priority Order (for modifier execution)
1. **Ground Projection** - Priority: 10 (affects environment map sampling)
2. **Shadow Intensity** - Priority: 40 (modifies shadow darkness)
3. **Shadow Opacity** - Priority: 50 (modifies shadow color/opacity)
4. **Caustics** - Priority: 60 (adds caustics effects)
5. **Random UV** - Priority: 70 (modifies UV coordinates)
6. **Water/Caustics** - Priority: 80 (water-specific effects)
7. **Dispersion** - Priority: 90 (chromatic aberration)

## Benefits of Migration
1. **No Conflicts** - All modifiers work together
2. **Maintainable** - Single source of truth for modifier chaining
3. **Debuggable** - Can list all modifiers applied to a material
4. **Extensible** - Easy to add new modifiers
5. **Clean** - Proper cleanup and restoration

## Testing Checklist
- [ ] Shadow opacity + shadow intensity + ground projection work together
- [ ] All modifiers can be enabled simultaneously
- [ ] Modifiers can be removed without breaking others
- [ ] Material cleanup works correctly
- [ ] No shader compilation errors

## Next Actions
1. Update `useViewer.ts` to use `shadowOpacityModifierRegistry`
2. Add ground projection debug logging (✅ Done)
3. Test ground projection visibility
4. Create shadow intensity modifier
5. Migrate remaining modifiers incrementally














