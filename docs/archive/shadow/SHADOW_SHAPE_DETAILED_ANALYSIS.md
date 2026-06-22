# Shadow Shape Detailed Analysis

## Visual Observation from Screenshot

### Shadow Appearance
- **Car Shadow**: Complex shape, follows car silhouette, but appears **blocky/pixelated**
- **Cube Shadow**: Square shape, **blocky edges**
- **Sphere Shadow**: Circular shape, **blocky edges**
- **Shadow Map Viewer**: Enabled, showing "Sun Light" debug overlay in top-left

### Issue Identified: **Blocky/Pixelated Shadows**

The shadows appear blocky, which indicates:
1. **Shadow map resolution may be too low** for the shadow camera coverage
2. **Shadow camera coverage may be too large** (reducing effective resolution)
3. **Shadow filtering (PCF) may need adjustment**

## Technical Analysis

### Current Configuration
- **Shadow Map Size**: 8192px (ultra quality) ✅
- **Shadow Type**: PCFShadowMap (soft shadows)
- **Shadow Radius**: 1 (sharp with minimal aliasing)
- **Shadow Camera**: Dynamic bounds based on scene

### Root Cause: Shadow Camera Coverage vs Resolution

The blocky appearance suggests the **shadow camera coverage is too large** relative to the shadow map resolution.

**Formula**: Effective shadow resolution = Shadow Map Size / Shadow Camera Coverage

If shadow camera covers 2000 units and shadow map is 8192px:
- Effective resolution = 8192 / 2000 = **4.1 pixels per unit**

For a car that's ~10 units wide:
- Shadow detail = 10 × 4.1 = **41 pixels** (very low!)

### Shadow Camera Bounds Calculation

From code analysis (`ViewerCanvas.tsx` lines 2082-2099):
```typescript
const baseMultiplier = useVisibleBounds ? 2.5 : 4.0
const sizeFactor = maxDim > 50 ? Math.max(0.5, 1.0 - (maxDim - 50) / 200) : 1.0
const boundsMultiplier = baseMultiplier * sizeFactor
const shadowSize = Math.max(maxDim * boundsMultiplier, minDim * 1.5, 50)
```

**Problem**: For a car with `maxDim = 10`:
- `shadowSize = 10 × 2.5 = 25 units` (if visible)
- `shadowSize = 10 × 4.0 = 40 units` (if not visible)
- Effective resolution = 8192 / 40 = **205 pixels per unit** ✅ (should be good!)

But if shadow camera is covering a larger area (e.g., 2000 units):
- Effective resolution = 8192 / 2000 = **4.1 pixels per unit** ❌ (too low!)

## Solutions

### 1. **Reduce Shadow Camera Coverage** (Recommended)
Focus shadow camera on visible objects only:

```typescript
// In updateShadowCameraBounds
const useVisibleBounds = hasVisibleObjects && hasObjects
const targetBox = hasVisibleObjects ? visibleBox : box

// Use tighter bounds for better resolution
const baseMultiplier = useVisibleBounds ? 1.5 : 2.5  // Reduced from 2.5/4.0
```

### 2. **Increase Shadow Map Size** (If GPU supports)
- Current: 8192px
- Maximum: 8192px (capped for CSM reliability)
- **Note**: Already at maximum for standard shadows

### 3. **Improve Shadow Filtering**
Increase shadow radius for softer edges:

```typescript
light.shadow.radius = 2  // Increased from 1
```

### 4. **Use PCFSoftShadowMap** (Softer shadows)
```typescript
renderer.shadowMap.type = THREE.PCFSoftShadowMap
```

## Shadow Shape Quality Assessment

### Car Shadow
- **Shape Accuracy**: ✅ Good - matches car silhouette
- **Edge Quality**: ❌ **Blocky** - needs better filtering
- **Detail Level**: ❌ **Low** - shadow camera coverage too large
- **Recommendation**: Reduce shadow camera coverage, increase shadow radius

### Cube Shadow
- **Shape Accuracy**: ✅ Perfect - rectangular
- **Edge Quality**: ❌ **Blocky** - needs better filtering
- **Detail Level**: ❌ **Low** - shadow camera coverage too large
- **Recommendation**: Reduce shadow camera coverage, increase shadow radius

### Sphere Shadow
- **Shape Accuracy**: ✅ Perfect - circular
- **Edge Quality**: ❌ **Blocky** - needs better filtering
- **Detail Level**: ❌ **Low** - shadow camera coverage too large
- **Recommendation**: Reduce shadow camera coverage, increase shadow radius

## Recommended Fixes

### Fix 1: Tighter Shadow Camera Bounds
**File**: `src/viewer/ViewerCanvas.tsx`
**Line**: ~2082

```typescript
// Reduce bounds multiplier for better resolution
const baseMultiplier = useVisibleBounds ? 1.5 : 2.5  // Reduced from 2.5/4.0
```

### Fix 2: Increase Shadow Radius
**File**: `src/viewer/ViewerCanvas.tsx`
**Line**: ~274

```typescript
light.shadow.radius = config.shadowRadius ?? 2  // Increased from 1
```

### Fix 3: Use PCFSoftShadowMap (Optional)
**File**: `src/viewer/ViewerCanvas.tsx`
**Line**: ~975

```typescript
renderer.shadowMap.type = THREE.PCFSoftShadowMap  // Softer shadows
```

## Expected Results After Fixes

### Before (Current)
- Shadow resolution: ~4-10 pixels per unit
- Shadow edges: Blocky, pixelated
- Shadow detail: Low

### After (Fixed)
- Shadow resolution: ~200+ pixels per unit
- Shadow edges: Smooth, realistic
- Shadow detail: High

## Testing Checklist

- [ ] Check shadow camera coverage in console
- [ ] Verify shadow map size is 8192px
- [ ] Test with reduced shadow camera bounds
- [ ] Test with increased shadow radius (2)
- [ ] Test with PCFSoftShadowMap
- [ ] Compare shadow quality before/after

## Conclusion

**Issue**: Shadows are blocky due to **shadow camera coverage being too large** relative to shadow map resolution.

**Solution**: 
1. Reduce shadow camera bounds multiplier (1.5/2.5 instead of 2.5/4.0)
2. Increase shadow radius (2 instead of 1)
3. Optionally use PCFSoftShadowMap for softer edges

**Expected Improvement**: Shadows will be much smoother and more detailed.





