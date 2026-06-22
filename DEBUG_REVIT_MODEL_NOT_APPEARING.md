# Debug: Revit Model Not Appearing in Viewer

## Current Status from Your Logs

✅ **Viewer is connected:** `[RevitSync] Connected to server`  
✅ **Server is available:** `[RevitConnection] Server is available`  
❌ **No model update received:** No `MODEL_UPDATE` messages in console

## Step-by-Step Diagnosis

### Step 1: Did You Export from Revit?

**Check:**
1. **In Revit:** Did you click "Direct Link" → "Synchronize Now"?
2. **Did you see any error messages?** (e.g., "No 3D views found")
3. **Did the export dialog appear?** (progress bar or completion message)

**If you haven't exported yet:**
- Make sure you have a **3D view** in your Revit model
- Click "Direct Link" → "Synchronize Now"
- Watch for any error messages

### Step 2: Check Server Console

**Look at the server window** (where `START_REVIT_SYNC_SERVER.bat` is running):

**You should see messages like:**
```
[RevitSync] 📥 UPLOAD REQUEST RECEIVED
[RevitSync] ✅ Received FBX upload: model.fbx
[RevitSync] File size: X.XX MB
[RevitSync] Broadcasting MODEL_UPDATE to X client(s)
```

**If you DON'T see these messages:**
- ❌ The export didn't reach the server
- Check Revit for error messages
- Check if the server URL is correct in Revit settings

**If you DO see these messages:**
- ✅ Upload worked, but viewer didn't receive it
- Continue to Step 3

### Step 3: Check Browser Console for MODEL_UPDATE

**After exporting, check browser console (F12):**

**You should see:**
```
[RevitConnection] ========================================
[RevitConnection] Model update received: {...}
[RevitConnection] File: model.fbx
[RevitConnection] Size: X.XX MB
[RevitConnection] URL: /api/revit/download/...
[RevitConnection] ========================================
[RevitConnection] Loading model from: http://localhost:3002/api/revit/download/...
```

**If you DON'T see these messages:**
- ❌ WebSocket message wasn't received
- Check server console - did it say "Broadcasted to X client(s)"?
- Try refreshing the browser page

**If you DO see these messages:**
- ✅ Message received, but model loading failed
- Continue to Step 4

### Step 4: Check for Loading Errors

**Look for error messages in browser console:**

**Common errors:**
- `Failed to load model update: ...`
- `Cannot load model: viewer or scene not available`
- `Model loader not available`
- `404 Not Found` (file not found on server)

**If you see errors:**
- Copy the full error message
- Check what it says - this will tell us what's wrong

## Quick Test Checklist

**Before exporting, verify:**

- [ ] **3D view exists** in Revit (Project Browser → 3D Views)
- [ ] **Server is running** (check server window)
- [ ] **Viewer is open** and connected (check browser console)
- [ ] **No errors** in Revit when clicking "Synchronize Now"

**After exporting, check:**

- [ ] **Server console shows upload** (file size, success message)
- [ ] **Browser console shows MODEL_UPDATE** message
- [ ] **Browser console shows loading progress** messages
- [ ] **No error messages** in browser console

## Common Issues and Fixes

### Issue 1: "No 3D views found in document"

**Fix:**
1. Create a 3D view in Revit
2. Go to: `View` tab → `3D View` → `Default 3D View`
3. Try exporting again

### Issue 2: Server console shows upload, but browser doesn't receive it

**Possible causes:**
- WebSocket connection dropped
- Browser needs refresh
- Server broadcast failed

**Fix:**
1. Refresh the browser page
2. Check server console - does it say "Broadcasted to X client(s)"?
3. If it says "Broadcasted to 0 client(s)", the WebSocket connection is broken
4. Restart the server and refresh browser

### Issue 3: MODEL_UPDATE received, but model doesn't load

**Check browser console for:**
- `[RevitConnection] Loading model from: ...`
- `[LoadModel]` or `[FBXLoader]` messages
- Any error messages after "Loading model from"

**Common errors:**
- `404 Not Found` - File wasn't saved on server
- `Failed to parse FBX` - File is corrupted
- `Viewer not ready` - Viewer wasn't initialized

### Issue 4: Export completes but nothing happens

**Check:**
1. **Revit:** Did you see "Export successful" or any completion message?
2. **Server:** Do you see upload messages in server console?
3. **Browser:** Do you see any new console messages after export?

**If nothing appears anywhere:**
- The export might have failed silently
- Check Revit journal files for errors
- Check Visual Studio Output window (if debugging)

## What to Share for Help

**If the model still doesn't appear, share:**

1. **Server console output** (from when you clicked "Synchronize Now")
2. **Browser console output** (F12, after clicking "Synchronize Now")
3. **Any error messages** from Revit
4. **Whether you have a 3D view** in your model

## Manual Test: Check Server Directly

**Test if the server is working:**

1. **Open browser:** `http://localhost:3002/api/revit/health`
2. **Should show:** `{"status":"ok","server":"Revit Sync Server"}`
3. **If it doesn't work:** Server isn't running or port is blocked

**Test if files are being saved:**

1. **Check folder:** `server-revit-sync/cache/`
2. **After exporting, you should see:** Files with session IDs
3. **If folder is empty:** Files aren't being saved (check server console for errors)

## Next Steps

1. **Try exporting again** from Revit
2. **Watch both consoles** (server and browser) simultaneously
3. **Look for the specific messages** mentioned above
4. **Share what you see** (or don't see) in the consoles

The key is to see where the process stops:
- ❌ No upload message in server = Export failed
- ✅ Upload in server, ❌ No MODEL_UPDATE in browser = WebSocket issue
- ✅ MODEL_UPDATE in browser, ❌ No loading = Model loading issue
