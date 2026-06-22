# Streets GL Integration - Complete Test Checklist

## Research Findings

Based on deep analysis of Streets GL codebase, here's what we found:

### ✅ What We Have Correctly Implemented:
1. **ExternalObjectBridge** - Properly initialized in Streets GL App.ts
2. **PostMessage Communication** - Bridge listens for `STREETS_GL_ADD_OBJECT` messages
3. **Geometry Extraction** - We extract positions, normals, UVs, and indices from Three.js objects
4. **Object Creation** - ExternalRenderableObject is created with geometry data
5. **Mesh Creation** - `updateMesh()` is called to create the WebGL mesh
6. **Rendering Pipeline** - GBufferPass.renderExternalObjects() renders external objects
7. **Material System** - ExternalObjectMaterialContainer handles PBR materials

### ⚠️ Potential Issues Found:

1. **Coordinate System** - Streets GL uses Web Mercator projection. Objects need to be in Streets GL's coordinate space, not Three.js world space.

2. **Mesh Creation Timing** - Mesh must be created AFTER renderer is ready. Currently we call `updateMesh()` in `handleAddObject()`, but it might be called before renderer is fully initialized.

3. **Matrix Updates** - Objects need `updateMatrix()` and `updateMatrixWorld()` called before rendering.

4. **Frustum Culling** - Currently disabled in GBufferPass (line 630: `skipFrustumCheck = true`), but objects still need proper bounding boxes.

5. **Material Color** - We extract color but need to verify it's applied to the material correctly.

## Test Checklist

### Prerequisites
- [ ] Streets GL server running on http://localhost:8081
- [ ] Main app running on http://localhost:3000
- [ ] Browser console open (F12)

### Test 1: Server Availability
- [ ] Streets GL server responds to requests
- [ ] Iframe loads without errors
- [ ] Console shows: `[ExternalObjectBridge] Message listener set up`
- [ ] Console shows: `[ExternalObjectBridge] Notified parent that bridge is ready`

### Test 2: Bridge Initialization
- [ ] Console shows: `[App] Streets GL iframe loaded successfully`
- [ ] Console shows: `[App] Initializing Streets GL bridge...`
- [ ] Console shows: `[App] Streets GL bridge is ready`
- [ ] Bridge ready callback fires
- [ ] Bridge stored in global state

### Test 3: Enable Streets GL
- [ ] Open "OSM 3D" panel
- [ ] Check "✅ Enable Streets GL 3D Map"
- [ ] Streets GL map appears with 3D buildings
- [ ] No console errors

### Test 4: Create Primitive Object
- [ ] Open "Primitives" panel
- [ ] Create a Box primitive
- [ ] Console shows: `[PrimitivesPanel] Attempting to sync primitive to Streets GL`
- [ ] Console shows: `[StreetsGLBridge] Extracted geometry: {vertexCount: ..., ...}`
- [ ] Console shows: `[StreetsGLBridge] Sending object to Streets GL: {id: ..., ...}`

### Test 5: Object Received by Streets GL
- [ ] In Streets GL console (iframe), see: `[ExternalObjectBridge] Adding object: {id: ..., ...}`
- [ ] Console shows: `[ExternalObjectBridge] Created renderable object with geometry: {vertexCount: ..., ...}`
- [ ] Console shows: `[ExternalObjectBridge] Object added to scene: {id: ..., isRenderable: true, ...}`
- [ ] Console shows: `[ExternalObjectBridge] Creating mesh for renderable object: ...`
- [ ] Console shows: `[ExternalObjectBridge] Mesh creation completed for: ... {meshReady: true, hasMesh: true}`
- [ ] Console shows: `[ExternalObjectBridge] ✅ Object added successfully: ...`

### Test 6: Object Rendering
- [ ] In Streets GL console, see: `[GBufferPass] Found external object: ...`
- [ ] Console shows: `[GBufferPass] Scene traversal: checked X objects, found 1 external object(s)`
- [ ] Console shows: `[GBufferPass] Rendering 1 external object(s)`
- [ ] Console shows: `[GBufferPass] 🔍 Rendering object ...: {position: ..., meshReady: true, ...}`
- [ ] Object appears in Streets GL scene (visible alongside buildings)

### Test 7: Object Visibility
- [ ] Object is visible in Streets GL view
- [ ] Object appears at correct position
- [ ] Object has correct scale
- [ ] Object has correct rotation
- [ ] Object has correct color/material

### Test 8: Transform Controls
- [ ] Select the object in Three.js scene
- [ ] Enable transform controls (move/rotate/scale)
- [ ] Transform the object
- [ ] Console shows: `[ViewerCanvas] Synced transform changes to Streets GL`
- [ ] Object position updates in Streets GL
- [ ] Object remains visible after transform

### Test 9: Multiple Objects
- [ ] Create multiple primitives (box, sphere, cylinder)
- [ ] All objects sync to Streets GL
- [ ] All objects appear in Streets GL scene
- [ ] Console shows correct count: `[GBufferPass] Rendering X external object(s)`

### Test 10: Model Loading
- [ ] Load a 3D model file (GLB/GLTF)
- [ ] Model syncs to Streets GL
- [ ] Model appears in Streets GL scene
- [ ] Model geometry is correct (not distorted)

### Test 11: Coordinate System
- [ ] Object positioned at origin (0,0,0) appears at Streets GL camera position
- [ ] Object positioned relative to camera appears correctly
- [ ] Console shows: `[StreetsGLSync] Using stored Streets GL coordinates: {...}`
- [ ] Coordinates match Streets GL's Web Mercator system

### Test 12: Error Handling
- [ ] Disable Streets GL (uncheck checkbox)
- [ ] Try to create object
- [ ] Console shows warning: `[PrimitivesPanel] ⚠️ Cannot sync to Streets GL`
- [ ] No errors thrown

## Expected Console Log Flow

### Successful Object Addition:
```
[App] Streets GL iframe loaded successfully
[App] Initializing Streets GL bridge...
[ExternalObjectBridge] Message listener set up
[ExternalObjectBridge] Notified parent that bridge is ready
[App] Streets GL bridge is ready
[PrimitivesPanel] Attempting to sync primitive to Streets GL
[StreetsGLBridge] Extracted geometry: {vertexCount: 24, indexCount: 36, ...}
[StreetsGLBridge] Sending object to Streets GL: {id: "...", geometry: {...}}
[ExternalObjectBridge] Adding object: {id: "...", geometry: {...}}
[ExternalObjectBridge] Created renderable object with geometry: {vertexCount: 24, ...}
[ExternalObjectBridge] Object added to scene: {id: "...", isRenderable: true}
[ExternalObjectBridge] Creating mesh for renderable object: ...
[ExternalRenderableObject] Mesh created successfully
[ExternalObjectBridge] Mesh creation completed for: ... {meshReady: true}
[ExternalObjectBridge] ✅ Object added successfully: ...
[GBufferPass] Found external object: ...
[GBufferPass] Rendering 1 external object(s)
[GBufferPass] 🔍 Rendering object ...: {position: {...}, meshReady: true}
```

## Common Issues and Fixes

### Issue 1: Bridge Not Ready
**Symptom**: `[PrimitivesPanel] ⚠️ Cannot sync to Streets GL: hasBridge: false`
**Fix**: Wait for bridge ready callback before creating objects

### Issue 2: Geometry Not Extracted
**Symptom**: `[StreetsGLBridge] No geometry extracted from object`
**Fix**: Ensure object has mesh geometry with position attributes

### Issue 3: Mesh Not Created
**Symptom**: `[GBufferPass] Cannot draw object: mesh is null!`
**Fix**: Ensure `updateMesh()` is called after renderer is ready

### Issue 4: Object Not Visible
**Symptom**: Object added but not visible in Streets GL
**Fix**: Check coordinate system, ensure object is in Streets GL's coordinate space

### Issue 5: Object Culled
**Symptom**: `[GBufferPass] Object culled (not in frustum)`
**Fix**: Check bounding box, ensure object is within camera view


