# Revit Connection Checklist

## Current Status
Your console logs show the web app is running, but **no Revit connection logs**. This means:
- ❌ Revit sync server might not be running
- ❌ Web app might not be connected to the server
- ❌ Revit add-in might not be exporting

## Step-by-Step Connection Process

### 1. Start the Revit Sync Server

**Location:** `d:\ai-cursor\3d-test-software\START_REVIT_SYNC_SERVER.bat`

**What to do:**
1. Double-click `START_REVIT_SYNC_SERVER.bat`
2. A command window should open and stay open
3. You should see:
   ```
   ========================================
   Starting Revit Sync Server
   ========================================
   HTTP Server on port 3002
   WebSocket Server on port 3003
   ========================================
   Server started successfully!
   ```

**If the window closes immediately:**
- Check if ports 3002 or 3003 are already in use
- Look for error messages in the window before it closes

### 2. Connect from Web App

**In the web app:**
1. Look for the **"Revit Live Link"** panel (usually on the right side)
2. Click **"Connect"** button
3. Check the browser console - you should see:
   ```
   [RevitConnection] Server is available
   [RevitSync] Connecting to ws://localhost:3003...
   [RevitSync] Connected to server
   [RevitSync] Connected as client-xxxxx
   [RevitConnection] Disabled Streets GL overlay for Revit models
   ```

**If you don't see these logs:**
- The panel might be hidden - look for a "Revit" button in the toolbar
- The server might not be running - go back to step 1

### 3. Export from Revit

**In Revit 2026:**
1. Open your Revit model
2. Look for the **"Revit to Web"** tab in the ribbon
3. Click **"Direct Link"** button
4. You should see a dialog saying "Direct Link Active"
5. The model should start exporting automatically

**In the browser console, you should see:**
```
[RevitSync] ========================================
[RevitSync] MODEL_UPDATE received from Revit!
[RevitSync] Session ID: xxxxx
[RevitSync] File: model.ifc
[RevitSync] Size: X.XX MB
[RevitSync] URL: /api/revit/download/xxxxx/model.ifc
[RevitSync] ========================================
[RevitConnection] Loading model from: http://localhost:3002/api/revit/download/xxxxx/model.ifc
[IFCLoader] Loading IFC - url: yes
[IFCLoader] Marked as Revit model - will remain visible
[ModelLoad] Revit model detected and marked as always visible
[RevitConnection] ✅ Model loaded and ensured visibility
```

### 4. Verify Model is Visible

**After the model loads:**
1. Check the 3D viewer - you should see the Revit model
2. Check the console for:
   - `[ModelLoad] Forced Revit model visibility after adding to scene`
   - `[RevitConnection] ✅ Model loaded and ensured visibility`
3. If you still don't see it:
   - Check if Streets GL overlay is enabled (it should be auto-disabled)
   - Look in the Objects Panel to see if the model is listed

## Troubleshooting

### No Connection Logs
**Problem:** No `[RevitSync]` or `[RevitConnection]` logs in console

**Solutions:**
1. Make sure the server is running (step 1)
2. Make sure you clicked "Connect" in the web app (step 2)
3. Check browser console for WebSocket errors
4. Verify server URL is `http://localhost:3002` and WS URL is `ws://localhost:3003`

### Server Won't Start
**Problem:** `START_REVIT_SYNC_SERVER.bat` closes immediately

**Solutions:**
1. Check if Node.js is installed: `node --version`
2. Check if ports are in use:
   ```powershell
   netstat -ano | findstr :3002
   netstat -ano | findstr :3003
   ```
3. Kill processes using those ports if needed
4. Try running the server manually:
   ```powershell
   cd d:\ai-cursor\3d-test-software\server-revit-sync
   node server.js
   ```

### Model Not Visible
**Problem:** Model loads but doesn't appear in 3D viewer

**Solutions:**
1. Check console for `[ModelLoad] Revit model detected` - if missing, URL detection failed
2. Check if Streets GL overlay is enabled - it should auto-disable
3. Look in Objects Panel - is the model listed?
4. Try manually disabling Streets GL overlay in settings
5. Check camera position - model might be outside view

### Revit Add-in Not Working
**Problem:** "Direct Link" button doesn't work or shows errors

**Solutions:**
1. Make sure the DLL is built (Visual Studio, Release mode)
2. Make sure Revit is closed when building
3. Check Revit journal file for errors:
   - Location: `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`
   - Open the most recent journal file
   - Search for "RevitToWebExporter" or "error"
4. Make sure the server is running before clicking "Direct Link"

## Expected Console Log Sequence

When everything works, you should see this sequence:

```
1. [RevitConnection] Server is available
2. [RevitSync] Connecting to ws://localhost:3003...
3. [RevitSync] Connected to server
4. [RevitSync] Connected as client-xxxxx
5. [RevitConnection] Disabled Streets GL overlay for Revit models
6. [RevitSync] MODEL_UPDATE received from Revit!
7. [RevitConnection] Loading model from: http://localhost:3002/...
8. [IFCLoader] Loading IFC...
9. [IFCLoader] Marked as Revit model - will remain visible
10. [ModelLoad] Revit model detected and marked as always visible
11. [ModelLoad] Forced Revit model visibility after adding to scene
12. [RevitConnection] ✅ Model loaded and ensured visibility
```

## Quick Test

To quickly test if everything is connected:

1. **Open browser console** (F12)
2. **Start the server** (`START_REVIT_SYNC_SERVER.bat`)
3. **In web app, click "Connect"** in Revit Live Link panel
4. **Look for:** `[RevitSync] Connected to server`
5. **In Revit, click "Direct Link"**
6. **Look for:** `[RevitSync] MODEL_UPDATE received from Revit!`

If you see these logs, the connection is working! If the model still doesn't appear, it's a visibility issue, not a connection issue.
