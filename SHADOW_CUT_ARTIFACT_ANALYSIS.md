# Shadow Cut Artifact Analysis

## Problem
Shadows appear to be cut off or clipped in the 3D viewer, creating visible artifacts where shadows should extend further.

## Potential Causes

### 1. **Shadow Camera Frustum Bounds Too Small** ⚠️ MOST LIKELY
**Location**: `src/viewer/ViewerCanvas.tsx` lines 1556-1559

The shadow camera's left/right/top/bottom bounds are calculated based on object bounding boxes, but shadows can extend beyond object bounds, especially:
- When light is at an angle (not directly overhead)
- For large objects with extended shadow areas
- When shadow plane is much larger than the object

**Current Calculation**:
```typescript
const padding = Math.min(Math.max(maxDim * 0.1, 10), 50) // 10% of size, min 10, max 50 units
const finalShadowSize = shadowSize + padding
```

**Issue**: The padding (max 50 units) might be insufficient for shadows that extend far from objects.

### 2. **Shadow Camera Far Plane Too Close**
**Location**: `src/viewer/ViewerCanvas.tsx` lines 1574-1577

The far plane calculation might not account for shadows that extend far from objects:
```typescript
const farPlane = useVisibleBounds 
  ? Math.max(depthSize * 3 + shadowProjectionMargin, maxDim * 6, 2000)
  : Math.max(depthSize * 5 + shadowProjectionMargin, maxDim * 10, 5000)
```

**Issue**: If shadows extend beyond the calculated far plane, they'll be clipped.

### 3. **Shadow Camera Position/Rotation**
**Location**: `src/viewer/ViewerCanvas.tsx` lines 1598-1628

The shadow camera is positioned based on object center and light direction, but if the camera isn't centered on the shadow area, shadows can be cut off.

**Issue**: The camera might not be covering the full shadow projection area, especially for angled lights.

### 4. **Shadow Plane Size vs Shadow Camera Coverage Mismatch**
**Location**: 
- Shadow plane: `src/viewer/ViewerCanvas.tsx` line 1833 (50000x50000)
- Shadow camera bounds: Calculated dynamically (often 3000-5000 units in fallback)

**Issue**: The shadow plane is 50000x50000, but the shadow camera might only cover 3000-5000 units, causing shadows to be cut off at the edges.

### 5. **Bounds Calculation Only Includes Shadow-Casting Objects**
**Location**: `src/viewer/ViewerCanvas.tsx` lines 1460-1493

The shadow camera bounds are calculated only from objects that CAST shadows, not from the shadow plane or receiving objects.

**Issue**: If the shadow extends beyond the casting object's bounds, it won't be included in the camera frustum calculation.

## Recommended Fixes

### Fix 1: Increase Shadow Camera Padding
**File**: `src/viewer/ViewerCanvas.tsx` line 1544

Increase the padding to account for shadows that extend far from objects:
```typescript
// Current: max 50 units padding
const padding = Math.min(Math.max(maxDim * 0.1, 10), 50)

// Suggested: Increase max padding and add light angle factor
const lightAngleFactor = Math.max(1.0, 1.0 / Math.abs(lightDirection.y)) // More padding for angled lights
const padding = Math.min(Math.max(maxDim * 0.2, 20), 200) * lightAngleFactor
```

### Fix 2: Include Shadow Plane in Bounds Calculation
**File**: `src/viewer/ViewerCanvas.tsx` lines 1446-1516

Include the shadow plane bounds in the shadow camera calculation to ensure full coverage:
```typescript
// After calculating object bounds, also include shadow plane
scene.traverse((obj) => {
  if (obj.userData.isShadowPlane && obj.visible) {
    const planeBox = new THREE.Box3().setFromObject(obj)
    if (!planeBox.isEmpty()) {
      box.union(planeBox) // Include shadow plane in bounds
    }
  }
})
```

### Fix 3: Increase Fallback Shadow Camera Bounds
**File**: `src/viewer/ViewerCanvas.tsx` lines 1669-1672

Increase fallback bounds to match shadow plane size:
```typescript
// Current: -3000 to 3000
light.shadow.camera.left = -3000
light.shadow.camera.right = 3000
light.shadow.camera.top = 3000
light.shadow.camera.bottom = -3000

// Suggested: Match shadow plane size (50000)
light.shadow.camera.left = -25000  // Half of shadow plane size
light.shadow.camera.right = 25000
light.shadow.camera.top = 25000
light.shadow.camera.bottom = -25000
```

### Fix 4: Add Shadow Extension Margin
**File**: `src/viewer/ViewerCanvas.tsx` line 1540

Add additional margin specifically for shadow extension:
```typescript
// After calculating shadowSize, add shadow extension margin
const shadowExtensionMargin = Math.max(maxDim * 0.5, 100) // 50% of size or 100 units
const finalShadowSize = shadowSize + padding + shadowExtensionMargin
```

### Fix 5: Ensure Shadow Camera Covers Full Shadow Projection
**File**: `src/viewer/ViewerCanvas.tsx` lines 1598-1608

Calculate shadow camera bounds to include the full shadow projection area:
```typescript
// Calculate shadow projection area based on light angle and object height
const objectHeight = size.y
const lightAngle = Math.acos(Math.abs(lightDirection.y)) // Angle from vertical
const shadowLength = objectHeight * Math.tan(lightAngle) // Shadow extension length
const shadowExtension = Math.max(shadowLength, maxDim * 0.5) // At least 50% of object size

// Add shadow extension to bounds
const finalShadowSize = shadowSize + padding + shadowExtension
```

## Quick Diagnostic Steps

1. **Check shadow camera bounds in console**:
   ```javascript
   // In browser console
   const light = viewer.scene.children.find(c => c instanceof THREE.DirectionalLight && c.castShadow)
   console.log('Shadow camera bounds:', {
     left: light.shadow.camera.left,
     right: light.shadow.camera.right,
     top: light.shadow.camera.top,
     bottom: light.shadow.camera.bottom,
     near: light.shadow.camera.near,
     far: light.shadow.camera.far
   })
   ```

2. **Check shadow plane size**:
   ```javascript
   const shadowPlane = viewer.scene.getObjectByName('Shadow Plane')
   console.log('Shadow plane size:', shadowPlane.geometry.parameters.width, shadowPlane.geometry.parameters.height)
   ```

3. **Compare bounds**: If shadow camera bounds are much smaller than shadow plane size, that's likely the issue.

## Priority Fixes

1. **HIGH**: Fix 3 - Increase fallback bounds to match shadow plane
2. **HIGH**: Fix 1 - Increase padding with light angle factor
3. **MEDIUM**: Fix 2 - Include shadow plane in bounds calculation
4. **MEDIUM**: Fix 4 - Add shadow extension margin
5. **LOW**: Fix 5 - Calculate shadow projection area









































