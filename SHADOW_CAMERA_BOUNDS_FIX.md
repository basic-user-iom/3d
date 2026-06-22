# Shadow Camera Bounds Fix for Interior Shadows

## Problem Identified

From console logs, the shadow camera bounds are very small:
```
Shadow camera for Sun Light: {left: -60, right: 60, top: 60, bottom: -60, near: 0.001, …}
```

This is only **120 units** wide/tall, which might be too small to cover the entire car model, especially interior parts.

## Root Cause

The shadow camera bounds calculation was using **visible bounds** (objects near the camera) instead of **full bounds** (all objects in the scene). This creates tight bounds that might miss interior parts of the model.

## Fix Applied

### 1. Always Use Full Bounds (Not Visible Bounds)
**File**: `src/viewer/utils/shadowManager.ts` (line 238-240)

**Before**:
```typescript
const targetBox = hasVisibleObjects ? visibleBox : box
const useVisibleBounds = hasVisibleObjects && hasObjects
```

**After**:
```typescript
// CRITICAL: For interior shadows, we need to use ALL objects, not just visible ones
// Visible bounds might be too tight and miss interior parts
const targetBox = hasObjects ? box : visibleBox
const useVisibleBounds = false // Always use full bounds for interior shadows
```

### 2. Increased Shadow Camera Bounds Multipliers
**File**: `src/viewer/utils/shadowManager.ts` (lines 248-261)

**Changes**:
- Base multiplier: `2.5/4.0` → `3.0` (always use larger value)
- Size factor minimum: `0.5` → `0.6` (less reduction for large objects)
- MinDim multiplier: `1.5` → `2.0` (more coverage for thin objects)
- Padding: `0.1/10/50` → `0.15/15/100` (more padding for shadow extension)
- Max size: `1.5/10000/2000` → `2.0/15000/3000` (allow larger bounds)

**Result**: Shadow camera will now cover the entire model, including interior parts.

## Expected Result

After this fix:
- Shadow camera bounds should be larger (covering full model)
- Interior shadows should be visible
- Shadow camera near plane remains at 0.001 for interior shadows
- Full model coverage ensures no parts are cut off

## Testing

1. Load car model
2. Check console for shadow camera bounds - should be larger than before
3. Look inside car interior - shadows should appear
4. Verify shadow camera covers entire model (not just visible parts)









