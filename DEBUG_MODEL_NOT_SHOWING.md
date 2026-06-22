# Debug: Model Not Showing in 3D Viewer

## Quick Checklist

### Step 1: Check if Export is Succeeding in Revit

**In Revit:**
1. Click "Direct Link" button
2. **What error do you see?**
   - If you see "Initial export failed" → The export isn't working (see FIX_INITIAL_EXPORT_FAILED.md)
   - If you see "Direct Link Active" with no error → Export might be working

### Step 2: Check Server Window

**Look at the server window** (where `START_REVIT_SYNC_SERVER.bat` is running):

**You should see:**
```
[RevitSync] POST /api/revit/upload - ...
[RevitSync] 📥 UPLOAD REQUEST RECEIVED
[RevitSync] ✅ Received IFC upload: model.ifc
[RevitSync] Broadcasting MODEL_UPDATE to 1 client(s)
```

**If you DON'T see these:**
- Revit export is failing before reaching the server
- Check Revit journal: `CHECK_REVIT_JOURNAL.bat`

### Step 3: Check Browser Console (F12)

**Open browser console** (F12 → Console tab) and look for:

**✅ Good signs:**
```
[RevitSync] MODEL_UPDATE received from Revit!
[RevitConnection] Model update received: {...}
[RevitConnection] Loading model from: http://localhost:3002/...
[IFCLoader] Loading IFC from URL: ...
[IFCLoader] Model loaded from URL successfully
```

**❌ Bad signs:**
```
[RevitConnection] Cannot load model: viewer or scene not available
[IFCLoader] Error loading from URL: ...
[RevitSync] No model update callback registered!
```

### Step 4: Check What's Actually Happening

**In browser console, run these commands:**

```javascript
// Check if sync manager is connected
window.revitSyncManager?.isConnected()

// Check active sessions
fetch('http://localhost:3002/api/revit/sessions')
  .then(r => r.json())
  .then(console.log)

// Check if viewer is ready
window.viewer?.scene
```

## Common Issues

### Issue 1: Export Failing in Revit

**Symptoms:**
- Revit shows "Initial export failed"
- No messages in server window
- No MODEL_UPDATE in browser console

**Solution:**
- See `FIX_INITIAL_EXPORT_FAILED.md`
- Check Visual Studio Output (View → Output → Debug)
- Check Revit journal: `CHECK_REVIT_JOURNAL.bat`

### Issue 2: Model Update Not Received

**Symptoms:**
- Server shows upload succeeded
- But browser console shows no MODEL_UPDATE

**Solution:**
1. Check WebSocket connection:
   ```javascript
   // In browser console
   window.revitSyncManager?.ws?.readyState
   // Should be 1 (OPEN)
   ```
2. Try reconnecting:
   - Click "Disconnect" then "Connect" in Revit Live Link panel

### Issue 3: IFC Loader Failing

**Symptoms:**
- MODEL_UPDATE received
- But `[IFCLoader] Error loading from URL` appears

**Solution:**
1. Check if WASM files are loading:
   ```javascript
   // In browser console
   fetch('https://unpkg.com/web-ifc@0.0.44/web-ifc.wasm')
     .then(r => console.log('WASM available:', r.ok))
   ```
2. Check CORS errors in Network tab (F12 → Network)
3. Try downloading the IFC file manually:
   - Copy the URL from console
   - Paste in browser address bar
   - See if file downloads

### Issue 4: Model Loaded But Invisible

**Symptoms:**
- All logs show success
- But model doesn't appear

**Solution:**
1. Check if model is in scene:
   ```javascript
   // In browser console
   window.viewer?.scene?.children
   // Should show your model
   ```
2. Check visibility:
   ```javascript
   // Find Revit model
   window.viewer?.scene?.children.forEach(child => {
     if (child.userData?.isRevitModel) {
       console.log('Revit model:', child, 'visible:', child.visible)
     }
   })
   ```
3. Try zooming out (mouse wheel) - model might be far from camera
4. Try framing:
   ```javascript
   // Frame all objects
   window.viewer?.controls?.fitToBox(
     new THREE.Box3().setFromObject(window.viewer.scene)
   )
   ```

## Step-by-Step Debugging

### 1. Verify Export is Working

**In Revit:**
- Click "Direct Link"
- Check for errors
- If error appears, note the exact message

**Check journal:**
```batch
CHECK_REVIT_JOURNAL.bat
```
- Look for `ApplicationException` or `exportToIFC` errors
- Look for assembly conflicts

### 2. Verify Server Received Upload

**Server window should show:**
```
POST /api/revit/upload
📥 UPLOAD REQUEST RECEIVED
✅ Received IFC upload: model.ifc
```

**If not:**
- Export is failing before reaching server
- Fix Revit export first

### 3. Verify Web App Received Update

**Browser console should show:**
```
[RevitSync] MODEL_UPDATE received from Revit!
[RevitConnection] Model update received: {...}
```

**If not:**
- WebSocket connection issue
- Try reconnecting

### 4. Verify Model is Loading

**Browser console should show:**
```
[IFCLoader] Loading IFC from URL: ...
[IFCLoader] Model loaded from URL successfully
```

**If error:**
- Check Network tab for failed requests
- Check CORS errors
- Check WASM loading

### 5. Verify Model is Visible

**Check scene:**
```javascript
// In browser console
const scene = window.viewer?.scene
console.log('Scene children:', scene?.children.length)
scene?.children.forEach(child => {
  console.log(child.name || child.type, 'visible:', child.visible)
})
```

**If model exists but invisible:**
- Check `child.visible` - should be `true`
- Check `child.userData.isRevitModel` - should be `true`
- Try forcing visibility:
  ```javascript
  scene.children.forEach(child => {
    if (child.userData?.isRevitModel) {
      child.visible = true
      child.traverse(c => c.visible = true)
    }
  })
  ```

## Getting Help

When asking for help, provide:

1. **Revit Error Message** (screenshot or exact text)
2. **Server Window Output** (copy/paste)
3. **Browser Console Output** (F12 → Console, copy all `[RevitSync]` and `[IFCLoader]` messages)
4. **Network Tab** (F12 → Network, look for failed requests to `/api/revit/download` or `.ifc` files)
5. **What You Tried** (did you rebuild DLL? restart Revit? etc.)

## Quick Test

**Test if everything is connected:**

1. **In browser console:**
   ```javascript
   // Check connection
   console.log('Connected:', window.revitSyncManager?.isConnected())
   
   // Check server
   fetch('http://localhost:3002/api/revit/health')
     .then(r => r.json())
     .then(d => console.log('Server:', d))
   
   // Check sessions
   fetch('http://localhost:3002/api/revit/sessions')
     .then(r => r.json())
     .then(d => console.log('Sessions:', d))
   ```

2. **In Revit:**
   - Click "Direct Link"
   - Watch browser console for `MODEL_UPDATE`

3. **Check server window:**
   - Should show `POST /api/revit/upload`

If all three work, the model should appear!
