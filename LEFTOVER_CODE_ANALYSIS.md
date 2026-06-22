# Leftover Code Analysis - Potential Conflicts

## Potential Issues Found

### Issue 1: Light Position Set from Config (Line 6927) ⚠️

**Location**: `ViewerCanvas.tsx:6927-6931`

**Code**:
```typescript
if (config.position) {
  light.position.set(
    config.position.x ?? 0,
    config.position.y ?? 0,
    config.position.z ?? 0
  )
}
```

**Problem**: This sets light position from config without checking if position was recently restored.

**Context**: This is in a light update function that applies config changes to lights.

**Risk**: If this function is called after Weather GL → Standard transition, it could override restored positions.

**Recommendation**: 
- Check if `light.userData._originalPositionSaved` before setting position
- Or ensure this function is not called after position restoration

---

### Issue 2: Light Target Set from Config (Line 7039) ⚠️

**Location**: `ViewerCanvas.tsx:7039-7043`

**Code**:
```typescript
if (config.target) {
  light.target.position.set(
    config.target.x ?? 0,
    config.target.y ?? 0,
    config.target.z ?? 0
  )
}
```

**Problem**: Same as Issue 1 - sets target position without checking if it was recently restored.

**Risk**: Could override restored target positions.

**Recommendation**: Same as Issue 1.

---

### Issue 3: Sun Light Position Updates (Lines 8940, 8979) ⚠️

**Location**: `ViewerCanvas.tsx:8936-8951` and `8961-8988`

**Code**:
```typescript
directionalLights.forEach((light) => {
  if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
    const sunLightPosition = sunDir.clone().multiplyScalar(-1000)
    light.position.copy(sunLightPosition)
    light.target.position.set(0, 0, 0)
    // ...
  }
})
```

**Problem**: Sun lights are updated based on sun direction, but this might override restored positions if sun light was restored.

**Context**: This is in the time-of-day update effect that runs continuously.

**Risk**: 
- If sun light was restored after Weather GL exit, this will override it
- However, sun lights might be special (marked with `userData.isSun`) and should be updated

**Recommendation**: 
- Check if sun lights should be excluded from restoration
- Or check if position was recently restored before updating
- Or ensure sun lights are not included in `_originalPositionSaved` logic

---

### Issue 4: Shadow Camera Position Copy (Line 7242) ✅ SAFE

**Location**: `ViewerCanvas.tsx:7242`

**Code**:
```typescript
light.shadow.camera.position.copy(light.position)
```

**Status**: ✅ **SAFE** - This is shadow camera position, not light position. It's correct to copy from light position.

---

### Issue 5: Data Copying Logic (Lines 11010-11026) ✅ SAFE

**Location**: `ViewerCanvas.tsx:11010-11026`

**Code**:
```typescript
const mapLight = mapLights.find(l => 
  l.name === light.name || 
  (l.position.distanceTo(light.position) < 0.001 && l.target.position.distanceTo(light.target.position) < 0.001)
)
if (mapLight && mapLight.userData._originalPositionSaved) {
  // Copy saved data to the found light
  light.userData._originalPosition = mapLight.userData._originalPosition?.clone()
  // ...
}
```

**Status**: ✅ **SAFE** - This is copying saved data TO the light, not modifying the light's position. This is correct.

---

## Summary

### Issues That Need Fixing:

1. **Light Position Set from Config (Line 6927)** ⚠️
   - Should check `_originalPositionSaved` before setting
   - Or ensure function is not called after restoration

2. **Light Target Set from Config (Line 7039)** ⚠️
   - Same as Issue 1

3. **Sun Light Position Updates (Lines 8940, 8979)** ⚠️
   - Need to determine if sun lights should be excluded from restoration
   - Or check if position was recently restored

### Issues That Are Safe:

4. **Shadow Camera Position Copy (Line 7242)** ✅
   - Correct behavior

5. **Data Copying Logic (Lines 11010-11026)** ✅
   - Correct behavior

---

## Recommendations

### Fix 1: Light Config Updates Should Respect Restored Positions

**Option A**: Check before setting
```typescript
if (config.position) {
  // Only set if position wasn't recently restored
  if (!light.userData._originalPositionSaved || 
      light.position.distanceTo(light.userData._originalPosition) > 0.1) {
    light.position.set(
      config.position.x ?? 0,
      config.position.y ?? 0,
      config.position.z ?? 0
    )
  }
}
```

**Option B**: Don't set if restoration flag is set
```typescript
if (config.position && !light.userData._skipPositionUpdate) {
  light.position.set(...)
}
```

### Fix 2: Sun Light Updates Should Check Restoration

**Option A**: Exclude sun lights from restoration
- Don't save `_originalPositionSaved` for sun lights
- Or check `userData.isSun` before saving

**Option B**: Check before updating sun lights
```typescript
if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
  // Only update if position wasn't recently restored
  if (!light.userData._originalPositionSaved || 
      light.position.distanceTo(light.userData._originalPosition) > 0.1) {
    light.position.copy(sunLightPosition)
  }
}
```

---

## Next Steps

1. ✅ Check if light config update function is called after restoration
2. ✅ Determine if sun lights should be excluded from restoration
3. ✅ Implement fixes for Issues 1, 2, and 3





















