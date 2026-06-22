# Comprehensive Streets GL Integration Test Script

## Test Execution Steps

### Prerequisites
- ✅ Streets GL server running on http://localhost:8081
- ✅ Main app running on http://localhost:3000
- ✅ Both servers confirmed running

### Test 1: Verify Bridge Initialization

**Action**:
1. Open http://localhost:3000
2. Open browser console (F12)
3. Open "OSM 3D" panel
4. Check "✅ Enable Streets GL 3D Map"

**Expected Results**:
- Main console: `[App] Streets GL bridge is ready`
- Streets GL iframe console: `[ExternalObjectBridge] Notified parent that bridge is ready`
- Streets GL map visible with 3D buildings

**Status**: ⏳ _To be tested_

---

### Test 2: Create Primitive and Verify Sync

**Action**:
1. Open "Primitives" panel
2. Click "Create Box"
3. Monitor both consoles (main + Streets GL iframe)

**Expected Results**:

**Main Console**:
```
[PrimitivesPanel] Attempting to sync primitive to Streets GL
[StreetsGLBridge] Extracted geometry: {vertexCount: 24, indexCount: 36, ...}
[StreetsGLBridge] Sending object to Streets GL: {id: "...", ...}
```

**Streets GL Console (iframe)**:
```
[ExternalObjectBridge] Adding object: {id: "...", geometry: {...}}
[ExternalObjectBridge] Created renderable object with geometry: {vertexCount: 24, ...}
[ExternalObjectBridge] Object added to scene: {id: "...", isRenderable: true, ...}
[ExternalObjectBridge] Creating mesh for renderable object: ...
[ExternalObjectBridge] Mesh creation completed for: ... {meshReady: true}
[ExternalObjectBridge] ✅ Object added successfully: ...
```

**Status**: ⏳ _To be tested_

---

### Test 3: Verify Object Rendering

**Action**:
1. Watch Streets GL console for rendering messages
2. Look at Streets GL map for visible object

**Expected Results**:

**Streets GL Console**:
```
[GBufferPass] Found external object: ...
[GBufferPass] Rendering 1 external object(s)
[GBufferPass] 🎬 Drawing object ...: pos(...), dist=...m, vertices=present
```

**Visual**:
- Object visible in Streets GL map
- Object appears alongside buildings
- Object has proper lighting (not flat)

**Status**: ⏳ _To be tested_

---

### Test 4: Verify Object Position

**Action**:
1. Check console logs for object position
2. Check camera position
3. Verify object is at correct location

**Expected Results**:
- Object position logged in Streets GL console
- Camera position logged
- Object should be near camera position (if positioned at origin)
- Object visible in view

**Status**: ⏳ _To be tested_

---

### Test 5: Test Transform Controls

**Action**:
1. Select object in Three.js scene
2. Use transform controls to move/rotate/scale
3. Monitor console for sync messages

**Expected Results**:

**Main Console**:
```
[ViewerCanvas] Synced transform changes to Streets GL
[StreetsGLSync] Updating existing object in Streets GL: {id: "...", ...}
```

**Streets GL Console**:
```
[ExternalObjectBridge] Updating object: {id: "...", ...}
[ExternalObjectBridge] ✅ Object updated: {id: "...", ...}
```

**Visual**:
- Object position updates in Streets GL
- Object remains visible

**Status**: ⏳ _To be tested_

---

### Test 6: Test Multiple Objects

**Action**:
1. Create multiple primitives (box, sphere, cylinder)
2. Verify all sync to Streets GL
3. Check rendering count

**Expected Results**:

**Streets GL Console**:
```
[GBufferPass] Rendering X external object(s) (where X = number of objects)
```

**Visual**:
- All objects visible in Streets GL
- All objects render correctly

**Status**: ⏳ _To be tested_

---

## Critical Verification Points

### ✅ Object Integration
- [ ] Object added to Streets GL scene (`sceneSystem.scene.add(object)`)
- [ ] Object is `ExternalRenderableObject` instance
- [ ] Object has geometry data
- [ ] Object mesh created successfully

### ✅ Rendering Pipeline
- [ ] Object found by `GBufferPass.getExternalObjects()`
- [ ] Object rendered by `GBufferPass.renderExternalObjects()`
- [ ] Object uses `ExternalObjectMaterialContainer`
- [ ] Object drawn with proper matrices

### ✅ Visual Confirmation
- [ ] Object visible in Streets GL map
- [ ] Object appears alongside buildings
- [ ] Object has proper lighting
- [ ] Object at correct position

---

## Architecture Verification

**Objects ARE rendered by Streets GL's engine**:
- ✅ Objects added to Streets GL's scene (not just iframe overlay)
- ✅ Objects rendered by GBufferPass (part of Streets GL's rendering pipeline)
- ✅ Objects use Streets GL's material system
- ✅ Objects are part of Streets GL's 3D scene, like buildings

**The iframe is just a container** - it displays Streets GL's rendered output. Objects are rendered by Streets GL's engine, not composited on top.

---

## Test Results

**Date**: _To be filled_
**Tester**: _To be filled_

| Test | Status | Notes |
|------|--------|-------|
| Test 1: Bridge Initialization | ⏳ | |
| Test 2: Create Primitive | ⏳ | |
| Test 3: Object Rendering | ⏳ | |
| Test 4: Object Position | ⏳ | |
| Test 5: Transform Controls | ⏳ | |
| Test 6: Multiple Objects | ⏳ | |

---

## Issues Found

_To be documented during testing_


