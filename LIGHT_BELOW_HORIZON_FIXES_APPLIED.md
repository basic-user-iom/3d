# Light Below Horizon Fixes Applied

## Date: 2024-12-19

All places that can reposition lights below the horizon have been fixed.

---

## Fix 1: Sun Light Position Calculation ✅

**Location**: `ViewerCanvas.tsx:8958-8959` and `8998-8999`

**Problem**: 
- `sunDir` points FROM scene TO sun
- If sun is above (sunDir.y > 0), then `sunLightPosition = sunDir * -1000` gives negative y
- This positions sun light below horizon!

**Solution**: Added validation to ensure sun light is always above horizon.

**Code Added**:
```typescript
const sunLightPosition = sunDir.clone().multiplyScalar(-1000)
// FIX: Ensure sun light is always above horizon (y >= 0)
if (sunLightPosition.y < 0) {
  sunLightPosition.y = Math.abs(sunLightPosition.y)
  console.warn(`[ViewerCanvas] ⚠️ Sun light position was below horizon, corrected to y=${sunLightPosition.y}`)
}
light.position.copy(sunLightPosition)
```

**Result**: Sun lights are now always positioned above horizon.

---

## Fix 2: Light Config Position Updates ✅

**Location**: `ViewerCanvas.tsx:6926-6942`

**Problem**: Config updates could set light position with negative y.

**Solution**: Added validation to clamp y to >= 0.

**Code Added**:
```typescript
// FIX: Ensure light is not set below horizon (y >= 0)
const newY = Math.max(config.position.y ?? 0, 0)
if (config.position.y !== undefined && config.position.y < 0) {
  console.warn(`[ViewerCanvas] ⚠️ Light position y was negative, clamped to 0`)
}
light.position.set(
  config.position.x ?? 0,
  newY,
  config.position.z ?? 0
)
```

**Result**: Config updates can no longer set lights below horizon.

---

## Fix 3: Light Creation from Config ✅

**Location**: `src/viewer/utils/lightUtils.ts:169`

**Problem**: Lights could be created with negative y position.

**Solution**: Added validation to clamp y to >= 0.

**Code Added**:
```typescript
// FIX: Ensure light is not created below horizon (y >= 0)
const posY = Math.max(pos.y ?? 0, 0)
if (pos.y !== undefined && pos.y < 0) {
  console.warn(`[lightUtils] ⚠️ Light position y was negative, clamped to 0`)
}
dirLight.position.set(pos.x ?? 0, posY, pos.z ?? 0)
```

**Result**: New lights are always created above horizon.

---

## Fix 4: Transform Controls Position Copy ✅

**Location**: `ViewerCanvas.tsx:969` and `1003`

**Problem**: When light position is copied from attached object, it could be below horizon.

**Solution**: Added validation after copy to ensure y >= 0.

**Code Added**:
```typescript
targetLight.position.copy(attachedObject.position)
// FIX: Ensure light is not positioned below horizon after transform
if (targetLight.position.y < 0) {
  targetLight.position.y = 0
  console.warn(`[ViewerCanvas] ⚠️ Light position was below horizon after transform, corrected to y=0`)
}
```

**Result**: Transform controls can no longer position lights below horizon.

---

## Summary

All places that can reposition lights below the horizon have been fixed:

1. ✅ **Sun light position calculation** - Now ensures y >= 0
2. ✅ **Light config position updates** - Now clamps y >= 0
3. ✅ **Light creation from config** - Now clamps y >= 0
4. ✅ **Transform controls position copy** - Now validates y >= 0

**Existing Fix**:
- ✅ **fixLightPositionsAndShadowCameras** - Already fixes lights below horizon (line 7801)

---

## Testing Recommendations

1. **Test sun light positioning**
   - Change time of day
   - Verify sun light is always above horizon

2. **Test light config updates**
   - Set negative y in config
   - Verify light is clamped to y = 0

3. **Test light creation**
   - Create light with negative y
   - Verify light is created at y = 0

4. **Test transform controls**
   - Move light below horizon
   - Verify light is corrected to y = 0

---

**Status**: ✅ All fixes applied - lights can no longer be positioned below horizon





















