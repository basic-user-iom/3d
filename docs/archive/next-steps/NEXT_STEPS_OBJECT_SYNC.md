# Next Steps: Fix Objects Not Appearing in Streets GL

## ✅ Changes Made

1. **Enhanced Logging** - Added detailed console logs throughout the sync process
2. **Promise-based Sync** - `syncModelToStreetsGL` now returns a Promise for better error handling
3. **Bridge Ready Check** - PrimitivesPanel now checks if bridge is ready before syncing
4. **Retry Logic** - If bridge not ready, waits 1 second and retries
5. **Timeout Detection** - 5-second timeout if Streets GL doesn't respond

## 🔍 How to Debug

### Step 1: Start Both Servers
```bash
npm run dev
```

### Step 2: Open 3D Viewer
- Navigate to http://localhost:3000
- Enable "Streets GL 3D Map" in OSM 3D panel
- Wait for bridge to initialize (check console for `[StreetsGLBridge] Bridge is ready!`)

### Step 3: Create a Primitive
- Open Primitives panel
- Click "Create Box"
- Watch console logs

### Step 4: Check Console Logs

**In 3D Viewer Console (localhost:3000):**
- `[PrimitivesPanel] 🔄 Attempting to sync primitive to Streets GL`
- `[StreetsGLSync] 🔄 Syncing object to Streets GL`
- `[StreetsGLBridge] 📤 Sending object to Streets GL`
- `[StreetsGLBridge] ✅ Object successfully added to Streets GL`

**In Streets GL Console (localhost:8081):**
- `[ExternalObjectBridge] Adding object:`
- `[ExternalObjectBridge] Created renderable object with geometry:`
- `[ExternalObjectBridge] ✅ Object added successfully:`
- `[GBufferPass] 🎬 Drawing object`

### Step 5: Identify the Issue

**If you see "Bridge not ready":**
- Wait for bridge to initialize
- Check if Streets GL iframe loaded correctly
- Verify Streets GL server is running

**If you see "No geometry extracted":**
- Check if primitive has valid geometry
- Verify geometry extraction function

**If object is added but not visible:**
- Check object position (might be too far from camera)
- Check if object is being culled (frustum culling)
- Verify object is in Streets GL scene

**If timeout occurs:**
- Streets GL might not be receiving messages
- Check postMessage communication
- Verify iframe is same-origin or CORS is configured

## 🐛 Common Issues

### Issue 1: Bridge Not Ready
**Symptom:** `[PrimitivesPanel] ⚠️ Bridge not ready yet`
**Fix:** Wait for bridge initialization, or check iframe loaded correctly

### Issue 2: Geometry Not Extracted
**Symptom:** `[StreetsGLBridge] No geometry extracted from object`
**Fix:** Check geometry extraction logic, verify primitive has valid geometry

### Issue 3: Object Too Far Away
**Symptom:** Object added but not visible
**Fix:** Check Web Mercator coordinates, verify object is at map center

### Issue 4: Object Culled
**Symptom:** Object in scene but not rendered
**Fix:** Frustum culling might be too aggressive, check GBufferPass rendering

## 📋 Test Checklist

- [ ] Streets GL server running (http://localhost:8081)
- [ ] 3D Viewer running (http://localhost:3000)
- [ ] Streets GL iframe loaded
- [ ] Bridge initialized (`[StreetsGLBridge] Bridge is ready!`)
- [ ] Primitive created in Three.js scene
- [ ] Object synced to Streets GL (check console)
- [ ] Object appears in Streets GL scene (check Streets GL console)
- [ ] Object rendered by GBufferPass (check Streets GL console)

## 🎯 Expected Behavior

1. Create primitive → Object appears in Three.js scene
2. Position on ground → Object positioned at map center
3. Sync to Streets GL → Object sent via postMessage
4. Streets GL receives → Object added to scene
5. Streets GL renders → Object visible in map

If any step fails, check the console logs to identify where it breaks.


