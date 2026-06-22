# Car Visibility Test Checklist

## Prerequisites
1. ✅ Main app server running on http://localhost:3000
2. ✅ Streets GL server running on http://localhost:8081
3. ✅ Streets GL iframe overlay enabled in the app

## Test Steps

### 1. Open the Application
- Navigate to http://localhost:3000
- Open browser DevTools (F12) → Console tab
- Clear console logs

### 2. Load a Car Model
- Use the file upload or drag-and-drop to load a car model (GLTF/GLB)
- Watch for console logs

### 3. Check Console Logs - Model Loading
Look for these logs in order:

#### A. Model Position Logs
```
[ModelPosition] Starting positioning, model structure: {...}
[ModelPosition] Using iframe overlay - positioned at origin (map center): {...}
[ModelPosition] Requesting camera position from Streets GL...
```

#### B. Camera Position Response
```
[ModelPosition] ✅ Camera position received: {x: ..., y: ..., z: ...}
[ModelPosition] ✅ Repositioned car in front of camera (centered on screen): {...}
[ModelPosition] Re-syncing car to Streets GL with new position
```

#### C. Geometry Extraction
```
[StreetsGLBridge] Extracted geometry: {
  id: "...",
  vertexCount: <number>,
  indexCount: <number>,
  hasNormals: true/false,
  hasUVs: true/false,
  position: {x: ..., y: ..., z: ...},
  scale: {x: ..., y: ..., z: ...}
}
```

#### D. Object Added to Streets GL
```
[ExternalObjectBridge] Object added to scene: {
  id: "...",
  position: {x: ..., y: ..., z: ...},
  rotation: {...},
  scale: {...},
  isRenderable: true,
  sceneChildrenCount: <number>
}
[ExternalObjectBridge] Creating mesh for renderable object: ...
[ExternalObjectBridge] Mesh creation completed for: ... {
  meshReady: true,
  hasMesh: true
}
[ExternalObjectBridge] ✅ Object added successfully: ...
```

#### E. Rendering Logs (Every Frame)
```
[GBufferPass] Scene traversal: checked <number> objects, found <number> external object(s)
[GBufferPass] Found external object: <id> {
  position: {x: ..., y: ..., z: ...},
  scale: {...},
  meshReady: true,
  hasBoundingBox: true
}
[GBufferPass] 🎬 Drawing object <id>: pos(x, y, z), dist=<distance>m, scale=(x, y, z), vertices=present
[GBufferPass] ✅ Successfully drew object <id>
```

### 4. Verify Object Visibility

#### Expected Behavior:
- Car should appear in Streets GL view (not in main Three.js viewer)
- Car should be positioned 50m in front of camera at ground level
- Car should be visible and properly scaled

#### If Car is NOT Visible, Check:

**A. Mesh Creation Failed?**
Look for:
```
[GBufferPass] ❌ Cannot draw object: mesh is null!
```
**Fix**: Check geometry extraction logs - verify `vertexCount > 0`

**B. Position Issue?**
Check the distance in logs:
```
[GBufferPass] 🎬 Drawing object ... dist=<distance>m
```
- If distance > 1000m: Car is too far from camera
- If distance < 1m: Car might be inside camera or too close

**C. Scale Issue?**
Check scale values:
```
scale=(x, y, z)
```
- If all values < 0.01: Car is too small to see
- If all values > 100: Car might be too large (clipped)

**D. Frustum Culling?**
Look for:
```
[GBufferPass] Object ... culled (not in frustum)
```
**Note**: Frustum culling is currently disabled (`skipFrustumCheck = true`), so this shouldn't appear

**E. Material/Texture Issue?**
Check for errors:
```
[GBufferPass] ❌ Error drawing object ...: ...
```
Look for WebGL errors or material uniform errors

### 5. Camera Position Verification

Check that camera position is being received:
```
[ModelPosition] ✅ Camera position received: {x: ..., y: ..., z: ...}
```

If this log doesn't appear:
- Check if Streets GL bridge is ready
- Look for `[StreetsGLBridge] Bridge is ready!` log
- Verify Streets GL iframe is loaded

### 6. Object Position Verification

After car is positioned, check:
```
[ModelPosition] ✅ Repositioned car in front of camera: {
  cameraPosition: {x: ..., y: ..., z: ...},
  carPosition: {x: ..., y: ..., z: ...},
  distance: <number>,
  note: 'Car placed 50m in front of camera at ground level, centered on screen'
}
```

Verify:
- `distance` should be approximately 50m
- `carPosition.y` should be 5 (5m above ground)
- `carPosition.x` should be close to `cameraPosition.x`
- `carPosition.z` should be `cameraPosition.z - 25` (approximately, since forward is -Z)

### 7. Rendering Verification

Check that object is being drawn every frame:
```
[GBufferPass] 🎬 Drawing object ... (should appear every frame)
[GBufferPass] ✅ Successfully drew object ... (should appear every frame)
```

If these logs don't appear:
- Object might not be in scene
- Check `[GBufferPass] Found external object:` logs
- Verify `sceneChildrenCount` in object added log

## Common Issues and Solutions

### Issue: "No geometry extracted"
**Symptoms**: `[StreetsGLBridge] No geometry extracted from object`
**Solution**: Verify model has valid geometry. Check Three.js model structure.

### Issue: "Mesh is null"
**Symptoms**: `[GBufferPass] ❌ Cannot draw object: mesh is null!`
**Solution**: Check mesh creation logs. Verify renderer is available.

### Issue: "Object not found in scene"
**Symptoms**: `[GBufferPass] Scene traversal: checked X objects, found 0 external object(s)`
**Solution**: Verify object was added to scene. Check `[ExternalObjectBridge] Object added to scene` log.

### Issue: "Camera position timeout"
**Symptoms**: `[ModelPosition] Camera position request timed out, using default position`
**Solution**: Streets GL bridge might not be ready. Check bridge ready logs.

### Issue: "Car too far from camera"
**Symptoms**: Distance > 1000m in logs
**Solution**: Camera position might be incorrect. Verify Streets GL camera position response.

## Expected Console Output Summary

When everything works correctly, you should see:

1. ✅ Model positioning logs
2. ✅ Camera position received
3. ✅ Car repositioned in front of camera
4. ✅ Geometry extracted (vertexCount > 0)
5. ✅ Object added to Streets GL scene
6. ✅ Mesh created successfully
7. ✅ Object found during scene traversal
8. ✅ Object drawn every frame
9. ✅ Car visible in Streets GL view

## Next Steps if Car is Still Not Visible

1. **Check browser console for errors** - Look for red error messages
2. **Verify Streets GL is loaded** - Check if Streets GL map is visible
3. **Check object position** - Use logs to verify car position relative to camera
4. **Verify scale** - Check if car scale is reasonable (not too small/large)
5. **Check WebGL errors** - Look for WebGL context lost or shader errors
6. **Verify material** - Check if material uniforms are set correctly

## Debug Commands

In browser console, you can run:

```javascript
// Check if Streets GL bridge is ready
window.sharedViewer?.scene?.children.forEach(child => {
  if (child.userData?.renderInStreetsGL) {
    console.log('Model marked for Streets GL:', child);
  }
});

// Check Streets GL scene (if accessible)
// Note: This requires Streets GL to expose its scene
```

## Reporting Issues

When reporting that car is not visible, please provide:

1. ✅ All console logs (especially error messages)
2. ✅ Screenshot of Streets GL view
3. ✅ Object position from logs
4. ✅ Camera position from logs
5. ✅ Distance from camera
6. ✅ Scale values
7. ✅ Any error messages





