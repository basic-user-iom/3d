# Light Position Below Horizon Analysis

## Places That Can Set Lights Below Horizon (y < 0)

### Issue 1: Light Config Position Updates ⚠️

**Location**: `ViewerCanvas.tsx:6927-6931`

**Code**:
```typescript
if (config.position) {
  light.position.set(
    config.position.x ?? 0,
    config.position.y ?? 0,  // ⚠️ Could be negative if config has negative y
    config.position.z ?? 0
  )
}
```

**Problem**: If config has `position.y < 0`, light will be set below horizon.

**Current Protection**: 
- Checks if position was recently restored (line 6929-6932)
- But if config explicitly sets y < 0, it will still be applied

**Recommendation**: Add validation to ensure `y >= 0` or at least warn.

---

### Issue 2: Light Creation from Config ⚠️

**Location**: `src/viewer/utils/lightUtils.ts:169`

**Code**:
```typescript
dirLight.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)
```

**Problem**: If config has `position.y < 0`, light will be created below horizon.

**Current Protection**: None - light is created exactly as specified in config.

**Recommendation**: Add validation in `createLight` to ensure `y >= 0`.

---

### Issue 3: Sun Light Position Calculation ⚠️

**Location**: `ViewerCanvas.tsx:8958-8959` and `8998-8999`

**Code**:
```typescript
const sunLightPosition = sunDir.clone().multiplyScalar(-1000)
light.position.copy(sunLightPosition)
```

**Problem**: If `sunDir` has negative y component, `sunLightPosition.y` will be positive (because of -1000 multiplier). But if sunDir.y is positive, sunLightPosition.y will be negative!

**Example**:
- If `sunDir = (0, 1, 0)` (sun above), then `sunLightPosition = (0, -1000, 0)` ❌ Below horizon!
- If `sunDir = (0, -1, 0)` (sun below), then `sunLightPosition = (0, 1000, 0)` ✅ Above horizon

**Current Protection**: None - sun light position is calculated directly from sun direction.

**Recommendation**: Ensure sun light is always above horizon, or at least validate.

---

### Issue 4: Transform Controls Position Copy ⚠️

**Location**: `ViewerCanvas.tsx:969` and `1003`

**Code**:
```typescript
targetLight.position.copy(attachedObject.position)
```

**Problem**: If attached object is below horizon, light will be positioned below horizon.

**Current Protection**: None - light position is copied directly from attached object.

**Recommendation**: Add validation or fix after copy.

---

### Issue 5: Light Target Position from Config ⚠️

**Location**: `ViewerCanvas.tsx:7039-7043`

**Code**:
```typescript
if (config.target) {
  light.target.position.set(
    config.target.x ?? 0,
    config.target.y ?? 0,  // ⚠️ Could be negative
    config.target.z ?? 0
  )
}
```

**Problem**: Target position could be set below horizon, but this is less critical than light position.

**Current Protection**: Checks if target was recently restored, but doesn't validate y value.

**Recommendation**: Add validation to ensure target is reasonable.

---

### Issue 6: Shadow Camera Position Calculation ⚠️ (Not Light, But Related)

**Location**: `ViewerCanvas.tsx:1629` and `1720`

**Code**:
```typescript
const shadowCameraPosition = center.clone().add(lightDirection.clone().multiplyScalar(-offsetDistance))
light.shadow.camera.position.copy(shadowCameraPosition)
```

**Problem**: Shadow camera could be positioned below horizon if light direction calculation is wrong.

**Current Protection**: None for shadow camera position.

**Note**: This is shadow camera, not light position, but could affect shadow rendering.

---

## Places That FIX Lights Below Horizon ✅

### Fix 1: fixLightPositionsAndShadowCameras ✅

**Location**: `ViewerCanvas.tsx:7801-7808`

**Code**:
```typescript
if (shouldFixPosition && obj.position.y < -100) {
  obj.position.y = 10 // Fix extreme case
} else if (shouldFixPosition && obj.position.y < 0) {
  obj.position.y = Math.max(obj.position.y, 10) // Fix below horizon
}
```

**Status**: ✅ **FIXES** lights below horizon - this is good!

**Protection**: Respects restored positions, only fixes if clearly wrong.

---

## Summary

### Places That CAN Set Lights Below Horizon:

1. ⚠️ **Light config position updates** (line 6927) - No validation
2. ⚠️ **Light creation from config** (lightUtils.ts:169) - No validation
3. ⚠️ **Sun light position calculation** (lines 8958, 8998) - Could be negative if sunDir.y > 0
4. ⚠️ **Transform controls position copy** (lines 969, 1003) - No validation
5. ⚠️ **Light target position from config** (line 7039) - No validation

### Places That FIX Lights Below Horizon:

1. ✅ **fixLightPositionsAndShadowCameras** (line 7801) - Fixes lights below horizon

---

## Recommendations

### Fix 1: Add Validation to Light Config Updates

```typescript
if (config.position) {
  const wasRecentlyRestored = light.userData._originalPositionSaved && 
    light.userData._originalPosition &&
    light.position.distanceTo(light.userData._originalPosition) < 0.1
  
  if (!wasRecentlyRestored) {
    // FIX: Ensure light is not set below horizon
    const newY = Math.max(config.position.y ?? 0, 0) // At least y = 0
    light.position.set(
      config.position.x ?? 0,
      newY,
      config.position.z ?? 0
    )
    if (config.position.y < 0) {
      console.warn(`[ViewerCanvas] ⚠️ Light position y was negative (${config.position.y}), clamped to 0`)
    }
  }
}
```

### Fix 2: Add Validation to Light Creation

```typescript
// In lightUtils.ts
const posY = Math.max(pos.y ?? 0, 0) // Ensure y >= 0
dirLight.position.set(pos.x ?? 0, posY, pos.z ?? 0)
```

### Fix 3: Fix Sun Light Position Calculation

```typescript
const sunLightPosition = sunDir.clone().multiplyScalar(-1000)
// FIX: Ensure sun light is always above horizon
if (sunLightPosition.y < 0) {
  sunLightPosition.y = Math.abs(sunLightPosition.y) // Flip to positive
  console.warn(`[ViewerCanvas] ⚠️ Sun light position was below horizon, corrected to y=${sunLightPosition.y}`)
}
light.position.copy(sunLightPosition)
```

### Fix 4: Add Validation to Transform Controls

```typescript
targetLight.position.copy(attachedObject.position)
// FIX: Ensure light is not below horizon
if (targetLight.position.y < 0) {
  targetLight.position.y = Math.max(targetLight.position.y, 0)
  console.warn(`[ViewerCanvas] ⚠️ Light position was below horizon after transform, corrected to y=${targetLight.position.y}`)
}
```

---

## Priority

**High Priority**:
- Fix 3: Sun light position calculation (most likely to cause issues)
- Fix 1: Light config updates (user can set negative y)

**Medium Priority**:
- Fix 2: Light creation validation
- Fix 4: Transform controls validation

**Low Priority**:
- Fix 5: Light target validation (less critical)

---

**Status**: Analysis complete - 5 places identified that can set lights below horizon





















