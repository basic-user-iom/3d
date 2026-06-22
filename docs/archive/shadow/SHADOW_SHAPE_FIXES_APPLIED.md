# Shadow Shape Fixes Applied

## Problem Identified

Shadows appeared **blocky/pixelated** due to:
1. **Shadow camera coverage too large** (2000-3000 units minimum)
2. **Shadow radius too small** (1 pixel)
3. **Effective shadow resolution too low** (~4-10 pixels per unit)

## Fixes Applied

### Fix 1: Reduced Shadow Camera Bounds Multipliers
**File**: `src/viewer/ViewerCanvas.tsx` (line ~2082)

**Before**:
```typescript
const baseMultiplier = useVisibleBounds ? 2.5 : 4.0
```

**After**:
```typescript
const baseMultiplier = useVisibleBounds ? 1.5 : 2.5
```

**Impact**: 
- Tighter shadow camera bounds = higher effective resolution
- For a 10-unit car: shadow camera = 15-25 units (instead of 25-40 units)
- Effective resolution: **327-546 pixels per unit** (instead of 205-328 pixels per unit)

### Fix 2: Reduced Minimum Shadow Camera Size
**File**: `src/viewer/ViewerCanvas.tsx` (line ~2097-2098)

**Before**:
```typescript
const adaptiveMaxSize = maxDim > 1000 ? Math.min(maxDim * 1.5, 10000) : 2000
const maxShadowSize = Math.max(adaptiveMaxSize, 2000) // Minimum 2000
```

**After**:
```typescript
const adaptiveMaxSize = maxDim > 1000 ? Math.min(maxDim * 1.5, 10000) : 500
const maxShadowSize = Math.max(adaptiveMaxSize, 500) // Minimum 500
```

**Impact**:
- Minimum shadow camera coverage reduced from 2000 to 500 units
- For small objects: shadow camera = 500 units max (instead of 2000)
- Effective resolution: **16.4 pixels per unit** (instead of 4.1 pixels per unit)
- **4x improvement** in shadow resolution for small objects!

### Fix 3: Increased Shadow Radius
**File**: `src/viewer/ViewerCanvas.tsx` (line ~274 and ~6279)

**Before**:
```typescript
light.shadow.radius = config.shadowRadius ?? 1
```

**After**:
```typescript
light.shadow.radius = config.shadowRadius ?? 2
```

**Impact**:
- Softer shadow edges (2-pixel blur instead of 1-pixel)
- Reduces blocky appearance
- Still sharp enough for realistic shadows

### Fix 4: Reduced Fallback Shadow Camera Size
**File**: `src/viewer/ViewerCanvas.tsx` (line ~2190-2193)

**Before**:
```typescript
light.shadow.camera.left = -3000
light.shadow.camera.right = 3000
light.shadow.camera.top = 3000
light.shadow.camera.bottom = -3000
```

**After**:
```typescript
light.shadow.camera.left = -1000
light.shadow.camera.right = 1000
light.shadow.camera.top = 1000
light.shadow.camera.bottom = -1000
```

**Impact**:
- Better shadow resolution when no objects found
- Effective resolution: **8.2 pixels per unit** (instead of 2.7 pixels per unit)
- **3x improvement** in fallback shadow resolution

## Expected Results

### Before Fixes
- **Shadow Resolution**: ~4-10 pixels per unit (blocky)
- **Shadow Edges**: Hard, pixelated
- **Shadow Detail**: Low
- **Car Shadow**: Blocky, low detail
- **Cube Shadow**: Blocky edges
- **Sphere Shadow**: Blocky edges

### After Fixes
- **Shadow Resolution**: ~16-546 pixels per unit (smooth)
- **Shadow Edges**: Soft, realistic (2-pixel blur)
- **Shadow Detail**: High
- **Car Shadow**: Smooth, high detail
- **Cube Shadow**: Smooth edges
- **Sphere Shadow**: Smooth edges

## Performance Impact

- **Shadow Map Size**: Still 8192px (no change)
- **Shadow Camera Coverage**: Reduced by 2-4x
- **Effective Resolution**: Increased by 2-4x
- **Performance**: Same or better (smaller coverage = faster rendering)

## Testing

To verify the fixes:
1. Load a scene with car, cube, and sphere
2. Enable shadow plane
3. Check shadow quality - should be much smoother
4. Check shadow map viewer - should show higher detail
5. Verify shadows are not cut off (coverage is still sufficient)

## Summary

**4 fixes applied** to improve shadow shape quality:
1. ✅ Reduced shadow camera bounds multipliers (1.5/2.5 instead of 2.5/4.0)
2. ✅ Reduced minimum shadow camera size (500 instead of 2000)
3. ✅ Increased shadow radius (2 instead of 1)
4. ✅ Reduced fallback shadow camera size (1000 instead of 3000)

**Expected improvement**: Shadows should be **2-4x smoother** with **much less blockiness**.





