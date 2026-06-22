# Conflict Analysis & Fixes

## Issues Found:

### 1. Duplicate RoomEnvironment Creation
- **Location**: Multiple places create RoomEnvironment and PMREMGenerator
- **Impact**: Memory leaks, inconsistent state
- **Fix**: Created `EnvironmentManager` singleton to centralize creation

### 2. Duplicate PMREMGenerator Creation
- **Location**: HDRSystem, ViewerCanvas (2 places)
- **Impact**: Memory leaks, unnecessary overhead
- **Fix**: EnvironmentManager now manages single PMREMGenerator instance

### 3. Multiple Shader Modifiers Without Chaining
- **Conflict**: When multiple modifiers try to modify `onBeforeCompile`, they overwrite each other
- **Modifiers Found**:
  - HDRSystem ground projection
  - ShadowIntensity injection
  - ShadowOpacity modifier
  - WaterSystem waves/caustics
  - CausticsModifier
  - RandomUVModifier (2 variants)
  - MaterialPanel dispersion
- **Fix**: Created `ShaderModifierRegistry` to chain modifiers properly

### 4. Environment Map Applied in Multiple Places
- **Location**: HDRSystem.applyToMaterials(), ViewerCanvas.tsx (4+ places)
- **Impact**: Redundant work, potential conflicts
- **Status**: Identified, needs consolidation

### 5. Shadow System Conflicts
- Shadow intensity and shadow opacity both modify shaders
- Both disabled when ground projection is active (temporary fix)
- **Fix Needed**: Use ShaderModifierRegistry to chain properly

## Next Steps:
1. ✅ Created EnvironmentManager - consolidates RoomEnvironment/PMREM
2. ✅ Created ShaderModifierRegistry - framework for chaining modifiers
3. ⏳ Integrate ShaderModifierRegistry with all modifiers
4. ⏳ Re-enable ground projection with proper chaining
5. ⏳ Test all systems together







