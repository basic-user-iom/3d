# System Consolidation Plan

## Current State Analysis

### Shadow Systems
**Status**: Partially consolidated

**Current Systems**:
1. ✅ **ShadowManager** - Unified system (used in hooks)
2. ⚠️ **CSMShadowSystem** - Still used directly in ViewerCanvas.tsx (67 references)
3. ✅ **ShadowSystemCoordinator** - Coordinates systems (used in hooks)

**Issue**: Hook-based viewer uses ShadowManager, but old ViewerCanvas code still uses CSMShadowSystem directly, causing duplication.

**Solution**: 
- ✅ Hooks already use ShadowManager (consolidated)
- ⏳ Old ViewerCanvas code should migrate to ShadowManager
- ⏳ Remove direct CSMShadowSystem usage

### Water Systems
**Status**: Not consolidated

**Current Systems**:
1. **WaterSystem** - Original implementation (complex, supports multiple modes)
2. **StandaloneWaterSystem** - Alternative implementation (simpler, for standalone weather)

**Issue**: Both systems exist and are used in different contexts.

**Solution Options**:
- **Option A**: Merge features into single WaterSystem
- **Option B**: Keep both but make StandaloneWaterSystem extend WaterSystem
- **Option C**: Deprecate one and migrate all usage to the other

**Recommendation**: Option A - Merge features into single unified WaterSystem

## Consolidation Strategy

### Phase 1: Shadow System Consolidation ✅ (Hooks Complete)
- ✅ ShadowManager used in `useThreeShadows` hook
- ✅ ShadowSystemCoordinator integrated
- ⏳ Migrate old ViewerCanvas code to use ShadowManager
- ⏳ Remove direct CSMShadowSystem references

### Phase 2: Water System Consolidation ⏳
- ⏳ Analyze feature differences between WaterSystem and StandaloneWaterSystem
- ⏳ Create unified WaterSystem with all features
- ⏳ Migrate StandaloneWaterSystem usage to unified system
- ⏳ Remove StandaloneWaterSystem

### Phase 3: Code Cleanup ⏳
- ⏳ Remove deprecated code
- ⏳ Update documentation
- ⏳ Test all scenarios

## Implementation Priority

1. **High Priority**: Shadow system consolidation (hooks done, old code remains)
2. **Medium Priority**: Water system consolidation
3. **Low Priority**: Code cleanup and documentation

## Next Steps

1. Create unified WaterSystem interface
2. Migrate StandaloneWaterSystem features to WaterSystem
3. Update all water system references
4. Remove StandaloneWaterSystem
5. Test water rendering in all scenarios














