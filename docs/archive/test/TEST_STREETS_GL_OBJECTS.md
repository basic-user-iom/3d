# Testing Streets GL Object Integration

## Prerequisites
✅ Both servers are running:
- Main app: `http://localhost:3000`
- Streets GL: `http://localhost:8081`

## Test Steps

### 1. Open the Application
1. Open your browser to `http://localhost:3000`
2. Open the browser console (F12 → Console tab)

### 2. Enable Streets GL Iframe Overlay
1. Click the **🗺️ OSM 3D** button in the toolbar
2. Check **"Show Streets GL 3D Buildings (iframe overlay)"**
3. Wait for the Streets GL map to load

### 3. Load a 3D Model
1. Click **"Open Files"** in the toolbar
2. Select a 3D model file (e.g., `.glb`, `.gltf`, `.fbx`, `.obj`)
3. Wait for the model to load

### 4. Check Console Logs
Look for these messages in the console:

**Expected Success Messages:**
```
[StreetsGLSync] Syncing model to Streets GL: {id: "...", position: {...}, ...}
[StreetsGLBridge] Bridge is ready!
[ExternalObjectBridge] Adding object: {id: "...", ...}
[ExternalObjectBridge] Created renderable object with geometry: {vertexCount: ..., ...}
[ExternalObjectBridge] Mesh creation triggered for: ...
[StreetsGLSync] Model successfully added to Streets GL scene: ...
```

**If you see errors:**
- `Bridge not available` → Streets GL iframe not loaded yet
- `Scene not available` → Streets GL systems not initialized
- `No geometry data` → Model has no mesh geometry

### 5. Verify Object Position
1. The model should be positioned at the map center (origin: 0,0,0)
2. Check console for position logs:
   ```
   [ModelPosition] Using iframe overlay - positioned at origin (map center)
   ```

### 6. Check Mesh Creation
Look for:
```
[ExternalRenderableObject] Mesh created successfully
```

## What Should Happen

✅ **Working:**
- Object is added to Streets GL scene
- Mesh is created with geometry
- Position/rotation/scale are synced
- Console shows success messages

⚠️ **Not Yet Visible:**
- Objects won't be visible yet because they need to be added to Streets GL's render pipeline
- This is expected - the infrastructure is working, but rendering support needs to be added

## Troubleshooting

### Object Not Added
- Check if Streets GL iframe loaded (should see map)
- Check console for bridge ready message
- Verify model has geometry (not just empty Object3D)

### Bridge Not Ready
- Wait a few seconds after enabling iframe overlay
- Check if `http://localhost:8081` is accessible
- Look for `[ExternalObjectBridge] Notified parent that bridge is ready`

### No Geometry Extracted
- Model might not have mesh geometry
- Check console for `[StreetsGLBridge] extractGeometryFromThreeJS` logs
- Try a different model file

## Next Steps

Once you confirm objects are being added successfully, we can:
1. Add rendering support to make objects visible
2. Add material support for proper shading
3. Add texture support if needed






