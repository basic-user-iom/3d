# Debug: Objects Not Appearing in Streets GL

## Issue
Objects created in 3D Viewer are not appearing in Streets GL scene.

## Debugging Steps

### 1. Check Bridge Initialization
- [ ] Is Streets GL server running? (http://localhost:8081)
- [ ] Is iframe loaded successfully?
- [ ] Is bridge initialized? (Check console for `[StreetsGLBridge] Bridge is ready!`)
- [ ] Is `streetsGLIframeOverlay` enabled?

### 2. Check Object Creation
- [ ] Is primitive created in Three.js scene?
- [ ] Is `positionModelOnGround` called?
- [ ] Is `syncModelToStreetsGL` called?
- [ ] Are Web Mercator coordinates calculated correctly?

### 3. Check Bridge Communication
- [ ] Is `bridge.addObject()` called?
- [ ] Is message sent to Streets GL? (Check `sendMessage`)
- [ ] Is Streets GL receiving the message? (Check Streets GL console)
- [ ] Is object added to Streets GL scene?

### 4. Check Streets GL Rendering
- [ ] Is `ExternalRenderableObject` created?
- [ ] Is mesh created? (`updateMesh` called)
- [ ] Is object in scene?
- [ ] Is `GBufferPass` rendering the object?

## Common Issues

### Issue 1: Bridge Not Ready
**Symptom:** Console shows "Bridge not ready, queuing object"
**Fix:** Wait for bridge to initialize, or check iframe loaded correctly

### Issue 2: Coordinates Wrong
**Symptom:** Object added but not visible (wrong position)
**Fix:** Verify Web Mercator coordinate conversion

### Issue 3: Geometry Not Extracted
**Symptom:** Object added but no geometry
**Fix:** Check `extractGeometryFromThreeJS` function

### Issue 4: Streets GL Not Rendering
**Symptom:** Object in scene but not visible
**Fix:** Check `GBufferPass` rendering logic

## Next Steps
1. Add more detailed logging
2. Check Streets GL console for errors
3. Verify object is in Streets GL scene
4. Check if object is being culled (frustum culling)


