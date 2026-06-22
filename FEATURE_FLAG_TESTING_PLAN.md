# Feature Flag Testing Plan

## Current Status
- ✅ Feature flag `useHookBasedViewer` exists in store
- ✅ Can be toggled via console: `useAppStore.getState().setUseHookBasedViewer(true/false)`
- ❌ No UI control for feature flag
- ⏳ No performance comparison tool

## Test Plan

### Test 1: Feature Flag Toggle Functionality
**Goal**: Verify feature flag can toggle between hook-based and existing initialization

**Steps**:
1. Create test utility function
2. Add UI control (developer panel or settings)
3. Test toggle in browser
4. Verify both paths work correctly
5. Compare console logs

**Expected Results**:
- Toggle works without page reload
- Hook-based path: All hooks initialize
- Existing path: Old initialization runs
- Both render the same scene

### Test 2: Performance Comparison
**Goal**: Compare performance between hook-based and existing initialization

**Metrics to Track**:
- Initialization time
- Memory usage
- Render performance (FPS)
- Hook initialization sequence timing

**Implementation**:
- Add performance markers
- Log timing data
- Compare metrics side-by-side

### Test 3: Feature Parity Verification
**Goal**: Ensure all features work in both paths

**Features to Test**:
- Camera controls
- Lighting system
- Shadow system
- Post-processing effects
- Model loading
- Object selection
- Transform controls
- Animation loop

## Implementation Steps

1. **Add Developer Panel UI Control**
   - Add toggle in developer/settings panel
   - Show current state
   - Add performance metrics display

2. **Create Test Utility Functions**
   - `window.testFeatureFlag()` - Toggle and compare
   - `window.comparePerformance()` - Performance metrics
   - `window.testBothPaths()` - Automated comparison

3. **Add Performance Monitoring**
   - Track initialization time
   - Monitor memory usage
   - Measure render performance














