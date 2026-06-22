# Perplexity Query: Shadow Restoration Issue After Disabling CSM/Weather System

## Problem Description

When disabling a Weather GL system (which uses Cascaded Shadow Maps - CSM), standard Three.js shadows are not restoring correctly. Shadows only appear in very specific, unusual positions:
- Shadows appear if the car/model is moved below the ground plane
- Shadows also appear above the car on the bottom part of the shadow plane

This suggests the shadow camera bounds or positioning are incorrect after the system switch.

## Technical Context

### System Architecture
- **Three.js** with React
- **ShadowManager**: Manages switching between shadow systems (standard, CSM, HDR)
- **ShadowSystemCoordinator**: Coordinates state preservation during system switches
- **CSMShadowSystem**: Cascaded Shadow Maps for Weather GL
- **Standard Shadows**: Regular Three.js directional light shadows

### Current Implementation

When disabling Weather GL (CSM system), the code:
1. Switches shadow system from 'csm' to 'standard' via `ShadowSystemCoordinator.switchSystem()`
2. Restores light positions atomically
3. Registers lights with ShadowManager
4. Updates shadow camera bounds using `updateShadowCameraBounds()`
5. Forces shadow map regeneration

### Code Flow

```typescript
// When disabling Weather GL
shadowCoordinator.switchSystem('standard', undefined, {
  preserveMaterials: true,
  preserveShadowPlane: true,
  preserveLightStates: true,
  restoreLightPositions: true
})

// Then in requestAnimationFrame:
// 1. Find lights (from Map or scene traversal)
// 2. Register with ShadowManager
// 3. Update shadow camera bounds
// 4. Force shadow map regeneration
```

### Shadow Camera Bounds Update Function

The `updateShadowCameraBounds()` function:
- Calculates bounding box of scene objects that cast shadows
- Configures shadow camera (OrthographicCamera) with left/right/top/bottom bounds
- Positions shadow camera based on light direction
- Uses scene center as the lookAt target

### Console Logs Analysis

From the logs:
- `[ViewerCanvas] ⚠️ No directional lights found to register with ShadowManager after Weather GL exit` - Lights not found initially
- `[ViewerCanvas] ✅ Standard shadows fully restored: 1 light(s) configured` - Lights found later in requestAnimationFrame
- Shadow camera bounds: `{left: -110, right: 110, top: 110, bottom: -110, near: 0.0005, ...}` - Bounds seem reasonable
- Shadow camera position and target are logged but not shown in provided logs

## Specific Questions

1. **Shadow Camera Positioning**: After switching from CSM to standard shadows, the shadow camera bounds are calculated but shadows only appear in specific positions. What could cause this?
   - Could the shadow camera position be incorrect?
   - Could the lookAt target be wrong?
   - Could the near/far planes be misconfigured?

2. **Timing Issues**: The lights are found in a `requestAnimationFrame` callback, but shadow camera bounds are updated immediately. Could there be a race condition where bounds are calculated before lights are properly positioned?

3. **CSM to Standard Transition**: When transitioning from CSM (which uses multiple cascaded shadow maps) to standard shadows (single shadow map), what specific steps are needed to ensure proper shadow camera configuration?
   - Should shadow camera be reset/recreated?
   - Should shadow map be explicitly disposed and recreated?
   - Are there any CSM-specific settings that need to be cleared?

4. **Shadow Plane Interaction**: The shadow plane is at y = -0.001. Could the shadow camera bounds calculation be including or excluding the shadow plane incorrectly, causing shadows to only appear at specific heights?

5. **Scene Bounding Box Calculation**: The `updateShadowCameraBounds()` function calculates bounding box from objects that cast shadows. After CSM is disabled, could there be leftover CSM lights or objects affecting the bounding box calculation?

## Code Snippets

### Shadow Camera Bounds Update (from shadowManager.ts)

```typescript
// Calculate bounding box of all objects that cast shadows
const box = new THREE.Box3()
scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh && obj.castShadow) {
    const objBox = new THREE.Box3().setFromObject(obj)
    if (!objBox.isEmpty()) {
      if (!hasObjects) {
        box.copy(objBox)
        hasObjects = true
      } else {
        box.union(objBox)
      }
    }
  }
})

// Configure shadow camera
if (light instanceof THREE.DirectionalLight) {
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  
  light.shadow.camera.left = -clampedShadowSize
  light.shadow.camera.right = clampedShadowSize
  light.shadow.camera.top = clampedShadowSize
  light.shadow.camera.bottom = -clampedShadowSize
  
  // Position shadow camera
  const offsetDistance = Math.max(maxDim * 2, 500)
  const shadowCameraPosition = center.clone().add(lightDirection.clone().multiplyScalar(-offsetDistance))
  light.shadow.camera.position.copy(shadowCameraPosition)
  light.shadow.camera.lookAt(center)
  light.shadow.camera.updateProjectionMatrix()
}
```

### System Switch Code (from ViewerCanvas.tsx)

```typescript
// Switch system
shadowCoordinator.switchSystem('standard', undefined, {
  preserveMaterials: true,
  preserveShadowPlane: true,
  preserveLightStates: true,
  restoreLightPositions: true
})

// Then in requestAnimationFrame (double nested):
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // Find lights
    // Register with ShadowManager
    // Update shadow camera bounds
    // Force shadow map regeneration
  })
})
```

## Potential Issues Identified

1. **Light Position Restoration**: Lights might be restored but shadow camera bounds calculated before positions are fully applied
2. **Shadow Camera LookAt Target**: The center point might be calculated from an empty or incorrect bounding box
3. **CSM Light Cleanup**: CSM lights might still be in the scene, affecting bounding box calculation
4. **Shadow Map State**: Shadow maps might not be properly disposed/recreated
5. **Shadow Camera Near/Far Planes**: Near plane (0.0005) might be too small, or far plane might not cover the scene

## Request for Guidance

Please provide:
1. Best practices for transitioning from CSM to standard shadows in Three.js
2. Common pitfalls when restoring shadow camera bounds after system switches
3. Recommended approach for ensuring shadow camera is correctly positioned and configured
4. Debugging steps to identify why shadows only appear in specific positions
5. Any Three.js-specific considerations for shadow camera bounds calculation after CSM disable





















