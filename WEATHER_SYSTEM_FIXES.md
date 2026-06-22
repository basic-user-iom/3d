# Weather System Fixes

## Issues Fixed

### 1. ✅ Light Positions Not Restored

**Problem**: When disabling the standalone weather system, light positions were not restored to their original values.

**Solution**: 
- Added code to save original light positions when enabling standalone weather
- Saves: position, target position, intensity, castShadow, and visible state
- Restores all saved values when disabling standalone weather

**Location**: `src/viewer/ViewerCanvas.tsx` lines ~10100-10120 (save) and ~10568-10595 (restore)

**Code Added**:
```javascript
// When enabling standalone weather - SAVE original positions
light.userData._originalPosition = light.position.clone()
light.userData._originalTargetPosition = light.target.position.clone()
light.userData._originalIntensity = light.intensity
light.userData._originalCastShadow = light.castShadow
light.userData._originalVisible = light.visible
light.userData._originalPositionSaved = true

// When disabling standalone weather - RESTORE original positions
light.position.copy(light.userData._originalPosition)
light.target.position.copy(light.userData._originalTargetPosition)
light.intensity = light.userData._originalIntensity
light.castShadow = light.userData._originalCastShadow
light.visible = light.userData._originalVisible
```

### 2. ✅ Shadows Appear When Camera Moves Below Shadow Plane

**Problem**: When the camera moves below the shadow plane (y < -0.001), shadows would appear above the viewer, which looks incorrect.

**Solution**: 
- Added check in animation loop to hide shadow plane when camera is below it
- Shadow plane is hidden when `cameraY < shadowPlaneY - 0.1` (with 0.1 threshold to prevent flicker)
- Shadow plane is shown again when camera moves above it (if user has it enabled)

**Location**: `src/viewer/ViewerCanvas.tsx` animation loop (~line 5018)

**Code Added**:
```javascript
// Hide shadow plane when camera moves below it
const showShadowPlane = useAppStore.getState().showShadowPlane
scene.traverse((obj) => {
  if (obj.userData.isShadowPlane && obj instanceof THREE.Mesh) {
    const cameraY = camera.position.y
    const shadowPlaneY = obj.position.y
    const shouldHide = cameraY < shadowPlaneY - 0.1
    
    if (shouldHide && obj.visible) {
      obj.visible = false
    } else if (!shouldHide && !obj.visible && showShadowPlane) {
      obj.visible = true
    }
  }
})
```

## Testing

### Test 1: Light Position Restoration
1. Position a light at a specific location
2. Enable standalone weather system
3. Disable standalone weather system
4. **Expected**: Light should return to its original position

### Test 2: Shadow Plane Visibility
1. Enable shadow plane visibility
2. Move camera above the shadow plane (y > -0.001)
3. **Expected**: Shadow plane should be visible, shadows appear on it
4. Move camera below the shadow plane (y < -0.1)
5. **Expected**: Shadow plane should be hidden, no shadows visible above viewer

## Notes

- Light positions are saved only once when enabling standalone weather (prevents overwriting)
- Shadow plane visibility check runs every frame in the animation loop for smooth updates
- Threshold of 0.1 units prevents flickering when camera is near the shadow plane boundary


























