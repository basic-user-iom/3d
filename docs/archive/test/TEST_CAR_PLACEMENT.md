# Test: Car Placement in Streets GL

## Implementation Status: ✅ COMPLETE

### What Was Implemented

1. **ExternalObjectMaterialContainer** (`streets-gl-alt/src/app/render/materials/ExternalObjectMaterialContainer.ts`)
   - Material for rendering external objects (cars, models)
   - Uses `instanceGeneric` shader (simple PBR)
   - Supports color and texture uniforms

2. **GBufferPass Rendering Support** (`streets-gl-alt/src/app/render/passes/GBufferPass.ts`)
   - Added `externalObjectMaterial` field
   - `getExternalObjects()` - Collects all ExternalRenderableObject instances from scene
   - `renderExternalObjects()` - Renders external objects with proper matrices and materials
   - Integrated into main `render()` method

### Code Flow

1. **Object Creation** (ExternalObjectBridge.ts:186)
   ```typescript
   this.sceneSystem.scene.add(object)  // Object added to scene
   ```

2. **Mesh Creation** (ExternalObjectBridge.ts:193)
   ```typescript
   object.updateMesh(renderer)  // Mesh created from geometry
   ```

3. **Object Collection** (GBufferPass.ts:533)
   ```typescript
   getExternalObjects()  // Traverses scene, finds ExternalRenderableObject instances
   ```

4. **Rendering** (GBufferPass.ts:552)
   ```typescript
   renderExternalObjects()  // Renders each object with proper materials
   ```

5. **Integration** (GBufferPass.ts:641)
   ```typescript
   this.renderExternalObjects()  // Called in main render loop
   ```

## How to Test

### Prerequisites
1. ✅ Main app server running: `npm run dev` (port 3000)
2. ✅ Streets GL server running: `cd streets-gl-alt && npm run dev` (port 8081)

### Test Steps

1. **Open the application**
   - Navigate to `http://localhost:3000`
   - Open browser console (F12)

2. **Enable Streets GL**
   - Click **🗺️ OSM 3D** button in toolbar
   - Check **"Show Streets GL 3D Buildings (iframe overlay)"**
   - Wait for Streets GL map to load

3. **Load a car model**
   - Click **"Open Files"** in toolbar
   - Select a `.glb` or `.gltf` car model file
   - Wait for model to load

4. **Check Console Logs**
   Look for these success messages:
   ```
   [StreetsGLSync] Syncing model to Streets GL: {id: "...", ...}
   [StreetsGLBridge] Bridge is ready!
   [ExternalObjectBridge] Adding object: {id: "...", ...}
   [ExternalObjectBridge] Created renderable object with geometry: {...}
   [ExternalObjectBridge] Mesh creation triggered for: ...
   [ExternalRenderableObject] Mesh created successfully
   [StreetsGLSync] Model successfully added to Streets GL scene: ...
   [ExternalObjectBridge] Object added successfully: ...
   ```

5. **Verify Visibility**
   - The car should be visible in the Streets GL iframe overlay
   - It should appear at the map center (origin 0,0,0)
   - The car should render with proper lighting and shading

### Expected Behavior

✅ **Working:**
- Object is added to Streets GL scene
- Mesh is created from geometry data
- Object is collected by `getExternalObjects()`
- Object is rendered in `renderExternalObjects()`
- Console shows success messages

⚠️ **If Not Visible:**
- Check browser console for errors
- Verify Streets GL server is running
- Check if object has geometry (not empty)
- Verify object is in camera frustum
- Check if material uniforms are set correctly

### Troubleshooting

**Object not visible:**
1. Check console for `[ExternalRenderableObject] Mesh created successfully`
2. Verify object is in scene: Check `getExternalObjects()` returns objects
3. Check camera position - object might be outside frustum
4. Verify material is being used: Check `renderExternalObjects()` is called

**Bridge not ready:**
- Wait a few seconds after enabling iframe overlay
- Check `http://localhost:8081` is accessible
- Look for `[ExternalObjectBridge] Notified parent that bridge is ready`

**No geometry:**
- Verify model file has mesh geometry
- Check console for `[StreetsGLBridge] extractGeometryFromThreeJS` logs
- Try a different model file

## Implementation Files

- ✅ `streets-gl-alt/src/app/render/materials/ExternalObjectMaterialContainer.ts`
- ✅ `streets-gl-alt/src/app/render/passes/GBufferPass.ts`
- ✅ `streets-gl-alt/src/app/objects/ExternalRenderableObject.ts` (already existed)
- ✅ `streets-gl-alt/src/app/ExternalObjectBridge.ts` (already existed)

## Status: Ready for Testing

All code is implemented and integrated. The car placement feature should work when:
1. Both servers are running
2. Streets GL iframe overlay is enabled
3. A 3D model is loaded

The implementation follows the same pattern as other object types in Streets GL (instances, aircraft, etc.) and should integrate seamlessly.





