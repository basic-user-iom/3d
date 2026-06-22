# Comprehensive Test Plan for 3D Viewer

## Critical Issues to Test

### 1. Depth Masking Conflicts
**Problem**: Depth masking (depthTest, depthWrite, opacity) could be overridden by:
- HDR material modifications
- Weather system material modifications
- Material panel user edits
- Fallback material creation

**Test Cases**:
- [ ] Load model with HDR enabled - verify depth masking persists
- [ ] Apply weather preset - verify depth masking persists
- [ ] Modify material opacity in Material Panel - should respect depth masking
- [ ] Load model without textures (fallback material) - verify depth masking applied

### 2. Material Modification Order
**Problem**: Multiple systems modify materials - need correct order:
1. Model load (depth masking + fog exclusion)
2. HDR application (if enabled)
3. Weather system (if enabled)
4. User modifications (Material Panel)

**Test Cases**:
- [ ] Load model → Enable HDR → Apply weather → Verify all systems work
- [ ] Enable HDR → Load model → Verify depth masking overrides HDR transparency
- [ ] Apply weather → Load model → Verify depth masking persists

### 3. Exclusion Flag Conflicts
**Problem**: Materials might be modified even when excluded:
- HDR modifications should skip imported models
- Weather modifications should skip imported models
- Depth masking should ONLY apply to imported models

**Test Cases**:
- [ ] Load model → Enable HDR → Verify imported model materials NOT modified by HDR
- [ ] Load model → Apply weather preset → Verify imported model materials NOT modified by weather
- [ ] Load model → Verify depth masking IS applied to imported models
- [ ] Check native objects (grid, shadow plane) → Verify they DON'T get depth masking

### 4. Transparency/Opacity Conflicts
**Problem**: Materials could be made transparent when they should be opaque:
- HDR might set transparent: true
- Weather might modify opacity
- Depth masking sets opacity: 1.0, transparent: false

**Test Cases**:
- [ ] Load opaque model → Enable HDR → Verify model remains opaque
- [ ] Load model with alpha map → Verify alpha testing enabled, not transparency
- [ ] Load model → Apply weather preset → Verify opacity not reduced below 1.0

### 5. Fog Exclusion Conflicts
**Problem**: Fog exclusion should work with depth masking:
- Fog disabled on imported models
- Depth masking enabled on imported models
- Both should work together

**Test Cases**:
- [ ] Load model → Enable fog → Verify fog disabled on model, depth masking enabled
- [ ] Load model → Enable fog → Verify background not visible through model

### 6. Viewer Initialization Race Conditions
**Problem**: Files might load before viewer is ready

**Test Cases**:
- [ ] Load file immediately on page load → Should wait for viewer
- [ ] Load multiple files quickly → Should handle sequentially
- [ ] Load file while viewer is initializing → Should wait properly

### 7. Material Property Storage/Restoration
**Problem**: Original properties might be lost or incorrectly restored

**Test Cases**:
- [ ] Load model → Enable HDR → Disable HDR → Verify original properties restored
- [ ] Load model → Apply weather → Change weather → Verify properties restored correctly
- [ ] Load model → Modify material → Enable HDR → Disable HDR → Verify user modifications preserved

## Potential Issues Found

### Issue 1: HDR Material Modifications Don't Preserve Depth Masking
**Location**: `ViewerCanvas.tsx` lines 1929-2019
**Problem**: HDR modifications don't check if depth masking was applied
**Fix Needed**: Ensure HDR doesn't override depthTest, depthWrite, opacity settings on imported models

### Issue 2: Weather Material Modifications Don't Preserve Depth Masking
**Location**: `ViewerCanvas.tsx` lines 2700-2900
**Problem**: Weather modifications might override opacity
**Fix Needed**: Ensure weather system doesn't modify opacity on imported models

### Issue 3: Material Panel Might Override Depth Masking
**Location**: `MaterialPanel.tsx`
**Problem**: User can manually set transparent: true, opacity < 1.0
**Fix Needed**: Add validation to prevent breaking depth masking

### Issue 4: Multiple Traversals Could Cause Performance Issues
**Problem**: Scene is traversed multiple times for different modifications
**Fix Needed**: Consider batching material modifications

## Test Execution Checklist

- [ ] Test 1: Basic model loading
- [ ] Test 2: HDR with imported models
- [ ] Test 3: Weather presets with imported models
- [ ] Test 4: Depth masking functionality
- [ ] Test 5: Fog exclusion
- [ ] Test 6: Material Panel modifications
- [ ] Test 7: Multiple systems interaction
- [ ] Test 8: Viewer initialization timing
- [ ] Test 9: Property restoration
- [ ] Test 10: Performance with large models
