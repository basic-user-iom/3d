# Streets GL Integration - Complete Test

## Understanding the Architecture

**Important**: Objects ARE being rendered by Streets GL's engine, NOT just composited in an iframe.

### How It Works:
1. **Object Creation**: Primitive/model created in Three.js scene
2. **Geometry Extraction**: Geometry (positions, normals, UVs, indices) extracted from Three.js object
3. **PostMessage Bridge**: Object sent to Streets GL via `postMessage` (cross-origin communication)
4. **Streets GL Scene**: Object added to Streets GL's scene as `ExternalRenderableObject`
5. **Mesh Creation**: Streets GL creates WebGL mesh from geometry data
6. **Rendering**: Streets GL's `GBufferPass.renderExternalObjects()` renders the object in its rendering pipeline
7. **Display**: Streets GL renders everything (buildings + external objects) to its canvas, which is displayed in the iframe

**The iframe is just a container** - objects are rendered by Streets GL's engine, not composited on top.

---

## Test Procedure

### Step 1: Open Browser Console
1. Open http://localhost:3000
2. Press F12 to open DevTools
3. Go to Console tab

### Step 2: Enable Streets GL
1. Open "OSM 3D" panel
2. Check "✅ Enable Streets GL 3D Map"
3. Wait for Streets GL to load

**Expected Console Logs (Main App)**:
```
[App] Streets GL iframe loaded successfully
[App] Initializing Streets GL bridge...
[App] Streets GL bridge is ready
```

### Step 3: Open Streets GL Console
1. Right-click on the Streets GL map (iframe)
2. Select "Inspect" or "Inspect Element"
3. This opens DevTools for the iframe
4. Go to Console tab in the iframe DevTools

**Expected Console Logs (Streets GL iframe)**:
```
[ExternalObjectBridge] Message listener set up
[ExternalObjectBridge] Notified parent that bridge is ready
```

### Step 4: Create a Primitive
1. Open "Primitives" panel
2. Click "Create Box" button
3. Watch BOTH consoles (main app + Streets GL iframe)

**Expected Console Logs (Main App)**:
```
[PrimitivesPanel] Attempting to sync primitive to Streets GL
[StreetsGLBridge] Extracted geometry: {vertexCount: 24, indexCount: 36, hasNormals: true/false, ...}
[StreetsGLBridge] Computed normals from positions and indices: {normalCount: 24, ...} (if normals were missing)
[StreetsGLBridge] Sending object to Streets GL: {id: "...", geometry: {...}}
```

**Expected Console Logs (Streets GL iframe)**:
```
[ExternalObjectBridge] Adding object: {id: "...", geometry: {...}}
[ExternalObjectBridge] Created renderable object with geometry: {vertexCount: 24, ...}
[ExternalObjectBridge] Object added to scene: {id: "...", isRenderable: true, ...}
[ExternalObjectBridge] Creating mesh for renderable object: ...
[ExternalRenderableObject] Mesh created successfully
[ExternalObjectBridge] Mesh creation completed for: ... {meshReady: true, hasMesh: true}
[ExternalObjectBridge] ✅ Object added successfully: ...
```

### Step 5: Verify Rendering
Watch Streets GL console for rendering messages:

**Expected Console Logs (Streets GL iframe)**:
```
[GBufferPass] Found external object: ...
[GBufferPass] Scene traversal: checked X objects, found 1 external object(s)
[GBufferPass] Rendering 1 external object(s)
[GBufferPass] 🔍 Rendering object ...: {position: {...}, meshReady: true, ...}
[GBufferPass] 🎬 Drawing object ...: pos(...), dist=...m, vertices=present
```

### Step 6: Visual Verification
1. Look at the Streets GL map
2. Object should be visible alongside buildings
3. Object should have proper lighting (not flat)
4. Object should be at correct position

---

## Troubleshooting

### Issue 1: No Console Logs in Streets GL
**Problem**: Console logs don't appear in Streets GL iframe
**Solution**: 
- Make sure you're looking at the iframe's console, not the main app console
- Right-click on the map → Inspect → Console tab

### Issue 2: Object Not Visible
**Possible Causes**:
1. **Wrong Position**: Object might be at (0,0,0) which is far from camera
2. **Too Small**: Object might be too small to see (check scale)
3. **Frustum Culling**: Object might be outside camera view (check console logs)
4. **Mesh Not Created**: Check if `meshReady: true` in console logs

**Debug Steps**:
1. Check Streets GL console for `[GBufferPass] 🎬 Drawing object` messages
2. Check object position in console logs
3. Check camera position vs object position
4. Check if `meshReady: true`

### Issue 3: Object Renders But Looks Wrong
**Possible Causes**:
1. **Missing Normals**: Check if normals were computed
2. **Wrong Scale**: Object might be too large/small
3. **Wrong Coordinates**: Object might be in wrong coordinate system

**Debug Steps**:
1. Check `[StreetsGLBridge] Computed normals` message
2. Check object scale in console logs
3. Check object position vs camera position

---

## Key Verification Points

✅ **Object Added to Scene**: `[ExternalObjectBridge] Object added to scene`
✅ **Mesh Created**: `[ExternalObjectBridge] Mesh creation completed for: ... {meshReady: true}`
✅ **Object Found by GBufferPass**: `[GBufferPass] Found external object`
✅ **Object Rendered**: `[GBufferPass] 🎬 Drawing object`
✅ **Object Visible**: Object appears in Streets GL map

---

## Architecture Confirmation

**Objects ARE rendered by Streets GL's engine**:
- Objects are added to Streets GL's scene (`sceneSystem.scene.add(object)`)
- Objects are rendered by GBufferPass (`renderExternalObjects()`)
- Objects use Streets GL's material system (`ExternalObjectMaterialContainer`)
- Objects are part of Streets GL's rendering pipeline, not composited

**The iframe is just a container** that displays Streets GL's rendered output. Objects are rendered by Streets GL, not by the iframe.


