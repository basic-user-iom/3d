# Streets GL Direct Integration Fix

## Problem
User wants objects to be placed **inside** the 3D OpenStreetMap as actual 3D objects (like buildings), not as an iframe overlay. Objects should be part of the Streets GL 3D scene itself.

## Solution

### 1. Enable Objects to Sync to Streets GL Scene
Objects are now synced to Streets GL when **either** iframe overlay **or** ground layer is enabled. This makes objects part of the Streets GL 3D scene, appearing alongside buildings.

### 2. Updated PrimitivesPanel
**File**: `src/components/PrimitivesPanel.tsx`

**Change**: Objects now sync to Streets GL for both modes:
```typescript
// Sync to Streets GL if bridge is available (for both iframe overlay AND ground layer)
// This makes objects part of the Streets GL 3D scene, like buildings
if (streetsGLBridge && (streetsGLIframeOverlay || streetsGLGroundEnabled)) {
  setTimeout(() => {
    syncModelToStreetsGL(mesh, streetsGLBridge)
    console.log('[PrimitivesPanel] Synced primitive to Streets GL scene (as 3D object)')
  }, 500)
}
```

### 3. Updated positionModelOnGround
**File**: `src/viewer/useViewer.ts`

**Change**: When using ground layer, objects now also sync to Streets GL:
```typescript
// IMPORTANT: For ground layer, we also need to sync to Streets GL so objects appear in the 3D scene
// Objects should be part of Streets GL scene (like buildings), not just in Three.js scene
const bridge = store.streetsGLBridge
if (bridge) {
  bridge.requestCameraPosition((cameraPos) => {
    // Calculate Streets GL position
    const streetsGLX = cameraPos.x + (targetX - 0)
    const streetsGLY = targetY
    const streetsGLZ = cameraPos.z + (targetZ - 0)
    
    // Store Streets GL position
    model.userData.streetsGLPosition = { x: streetsGLX, y: streetsGLY, z: streetsGLZ }
    model.userData.streetsGLCameraPosition = cameraPos
    
    // Sync to Streets GL
    setTimeout(() => {
      syncModelToStreetsGL(model, bridge)
    }, 200)
  })
}
```

## How It Works

1. **Object Creation**: When a primitive is created with ground layer enabled
2. **Positioning**: Object is positioned in Three.js scene using ground layer coordinates
3. **Streets GL Sync**: Object is also synced to Streets GL scene via the bridge
4. **Result**: Object appears in Streets GL 3D scene alongside buildings

## Usage

1. Enable **"Enable Ground Layer (Direct Integration)"** in OSM 3D panel
2. Create a primitive object (cube, sphere, etc.)
3. Object will be:
   - Positioned in Three.js scene on the ground layer
   - Synced to Streets GL scene as a 3D object
   - Visible in Streets GL alongside 3D buildings

## Notes

- Objects are now part of the Streets GL 3D scene, not just overlaid
- Objects appear alongside 3D buildings in Streets GL
- Transform controls (drag/scale) work and sync to Streets GL
- Shadows should work as objects are in the scene


