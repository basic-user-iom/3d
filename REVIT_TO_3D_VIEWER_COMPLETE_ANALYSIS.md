# Complete Revit to 3D Viewer Link - Dependency Analysis

## System Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Revit 2026   │         │  Node.js Server  │         │  React Web App  │
│   (C# Add-in)  │────────▶│  (Express + WS)  │────────▶│  (Three.js)     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
      │                              │                            │
      │ IFC Export                   │ HTTP Upload               │ WebSocket
      │ HTTP POST                    │ WebSocket Broadcast       │ IFC Loader
      │                              │                            │
      └──────────────────────────────┴────────────────────────────┘
```

## Component Dependencies

### 1. Revit Add-in (C# .NET Framework 4.8)

**Dependencies:**
- ✅ Autodesk Revit 2026 API
- ✅ .NET Framework 4.8
- ✅ System.Net.Http (for HTTP uploads)
- ✅ System.IO (for file operations)

**Key Files:**
- `RevitToWebExporter.dll` - Main add-in assembly
- `RevitToWebExporter.addin` - Add-in manifest

**Critical Issue Found:**
- ❌ `DirectLinkManager.EstablishLink()` runs initial export in `Task.Run()` with **NO error handling**
- ❌ Errors are only logged to `Debug.WriteLine()` which users never see
- ❌ If export/upload fails, user gets no feedback

**Required Configuration:**
- Server URL: `http://localhost:3002` (must match server)
- WebSocket URL: `ws://localhost:3003` (optional, for real-time)

---

### 2. Node.js Sync Server (Express + WebSocket)

**Dependencies:**
- ✅ Node.js (v14+)
- ✅ `express` - HTTP server
- ✅ `ws` - WebSocket server
- ✅ `multer` - File upload handling
- ✅ `cors` - Cross-origin requests
- ✅ `gltf-pipeline` - GLB optimization (optional)

**Ports:**
- Port 3002: HTTP server (file uploads)
- Port 3003: WebSocket server (real-time updates)

**Endpoints:**
- `POST /api/revit/upload` - Receive IFC/GLB files from Revit
- `GET /api/revit/download/:sessionId` - Serve cached files to web app
- `GET /api/revit/sessions` - List active sessions
- `GET /api/revit/health` - Health check

**Critical Functions:**
- File upload handling (multipart/form-data)
- WebSocket broadcasting to connected clients
- File caching (24-hour TTL)

---

### 3. React Web Application (Three.js Viewer)

**Dependencies:**
- ✅ React 19.2.0
- ✅ Three.js 0.181.1
- ✅ `web-ifc` 0.0.74 - IFC parsing (WASM)
- ✅ `web-ifc-three` 0.0.126 - Three.js integration
- ✅ `zustand` - State management

**Key Components:**
- `RevitConnectionPanel.tsx` - Connection UI
- `revitSyncManager.ts` - WebSocket client
- `ifcLoader.ts` - IFC file loader
- `loaders/index.ts` - Format detection & routing

**Critical Functions:**
- WebSocket connection to `ws://localhost:3003`
- Format detection (Content-Type, Content-Disposition, magic bytes)
- IFC loading via `web-ifc-three`
- Model display in Three.js scene

---

## Data Flow

### Step 1: Revit Export
1. User clicks "Direct Link" in Revit
2. `DirectLinkCommand.Execute()` called
3. `DirectLinkManager.EstablishLink()` called
4. **Background task starts:** `Task.Run(async () => await SyncModel(true))`
5. `GLBExporter.Export()` called
6. `doc.Export(tempDir, "model", ifcOptions)` - IFC file created
7. `UploadToServer()` called with IFC file path

### Step 2: HTTP Upload
1. `HttpClient.PostAsync()` sends multipart/form-data
2. Server receives at `/api/revit/upload`
3. Server saves file to cache
4. Server broadcasts `MODEL_UPDATE` via WebSocket

### Step 3: WebSocket Broadcast
1. Server sends `MODEL_UPDATE` message to all connected clients
2. `revitSyncManager.ts` receives message
3. `onModelUpdate` callback triggered
4. `RevitConnectionPanel` calls `loadFromUrl()`

### Step 4: Model Loading
1. `loadFromUrl()` fetches file from `/api/revit/download/:sessionId`
2. Format detection checks Content-Type, Content-Disposition, magic bytes
3. Routes to `loadIFC()` if format is IFC
4. `IFCLoader` uses `web-ifc-three` to parse IFC
5. Model added to Three.js scene

---

## Known Issues & Fixes

### Issue 1: Silent Export Failures ✅ FIXED
**Problem:** `DirectLinkManager.EstablishLink()` has no error handling
**Location:** `revit-addin/RevitToWebExporter/DirectLinkManager.cs:58-61`
**Fix:** Add error handling with user notification

### Issue 2: Format Detection for URL-based Loading ✅ FIXED
**Problem:** URLs without extensions couldn't be detected
**Location:** `src/viewer/loaders/index.ts`
**Fix:** Added Content-Type, Content-Disposition, and magic byte detection

### Issue 3: IFC Loader API Usage ✅ FIXED
**Problem:** Using non-existent `loadAsync()` method
**Location:** `src/viewer/loaders/ifcLoader.ts`
**Fix:** Use `load()` for URLs, `parse()` for ArrayBuffer

### Issue 4: Server Crashes ✅ FIXED
**Problem:** Unhandled exceptions causing server to exit
**Location:** `server-revit-sync/server.js`
**Fix:** Added error handlers for uncaught exceptions

---

## Verification Checklist

### Revit Add-in
- [ ] DLL built successfully (`bin/Release/RevitToWebExporter.dll`)
- [ ] `.addin` file installed in `%APPDATA%\Autodesk\Revit\Addins\2026\`
- [ ] Add-in appears in Revit ribbon ("Revit to Web" tab)
- [ ] Settings dialog shows correct server URL
- [ ] "Test Connection" button works

### Node.js Server
- [ ] Server starts without errors
- [ ] Ports 3002 and 3003 are listening
- [ ] Health check endpoint responds: `http://localhost:3002/api/revit/health`
- [ ] WebSocket server shows "listening" message

### Web Application
- [ ] App loads at `http://localhost:3000`
- [ ] Revit Live Link panel opens
- [ ] Server detection works (shows "Server is available")
- [ ] WebSocket connects successfully
- [ ] IFC loader dependencies installed (`web-ifc-three`, `web-ifc`)

---

## Testing Workflow

1. **Start Server:**
   ```bash
   START_REVIT_SYNC_SERVER.bat
   ```
   Verify: Server console shows "HTTP Server running" and "WebSocket Server listening"

2. **Start Web App:**
   ```bash
   npm run dev
   ```
   Verify: Browser opens to `http://localhost:3000`

3. **Open Revit:**
   - Open a Revit model
   - Click "Settings" → Verify server URL is `http://localhost:3002`
   - Click "Test Connection" → Should succeed
   - Click "Direct Link" → Should show "Direct Link established!"

4. **Watch Server Console:**
   - Should see: `[RevitSync] POST /api/revit/upload`
   - Should see: `[RevitSync] 📥 UPLOAD REQUEST RECEIVED`
   - Should see: `[RevitSync] ✅ Received IFC upload: model.ifc`
   - Should see: `[RevitSync] Broadcasting MODEL_UPDATE to X client(s)`

5. **Watch Browser Console:**
   - Should see: `[RevitSync] Model update received`
   - Should see: `[RevitConnection] Loading model from: ...`
   - Should see: `[LoadModel] Content-Type: application/ifc`
   - Should see: `[IFCLoader] Loading from ArrayBuffer`
   - Should see: `[IFCLoader] Model parsed successfully`

6. **Check 3D Viewer:**
   - Model should appear in the scene
   - Camera should frame the model
   - Model should be visible and interactive

---

## Common Failure Points

### Failure Point 1: Revit Not Uploading
**Symptoms:** No messages in server console
**Causes:**
- Wrong server URL in Revit settings
- Firewall blocking connection
- Export failing silently (no error dialog)
- Network connectivity issues

**Debug:**
- Check Revit settings (Server URL)
- Test connection from Revit
- Check Revit journal files for errors
- Try "Export to Web" button (shows errors)

### Failure Point 2: Server Not Receiving
**Symptoms:** Server console shows nothing
**Causes:**
- Server not running
- Wrong port (should be 3002)
- Multer configuration issue
- Request format mismatch

**Debug:**
- Run `test-upload.ps1` to test server
- Check server console for errors
- Verify ports are listening (`netstat -ano | findstr :3002`)

### Failure Point 3: Server Not Broadcasting
**Symptoms:** Upload received but no WebSocket message
**Causes:**
- WebSocket server not running
- No clients connected
- Broadcast function error
**Debug:**
- Check server console for "Broadcasting" message
- Verify WebSocket clients count
- Check browser console for WebSocket connection

### Failure Point 4: Web App Not Receiving
**Symptoms:** Server broadcasts but web app doesn't react
**Causes:**
- WebSocket not connected
- Message handler not registered
- Format detection failing
**Debug:**
- Check browser console for `[RevitSync] Model update received`
- Verify WebSocket connection status
- Check message type matches `MODEL_UPDATE`

### Failure Point 5: IFC Loader Failing
**Symptoms:** Model update received but model doesn't appear
**Causes:**
- Format detection failing (wrong format)
- IFC loader error (WASM not loaded)
- Three.js scene not ready
**Debug:**
- Check browser console for `[IFCLoader]` messages
- Check format detection logs
- Verify WASM files are accessible
- Check for IFC parsing errors

---

## Required Dependencies Summary

### Revit Add-in
- Autodesk Revit 2026
- .NET Framework 4.8
- Revit API assemblies (provided by Revit)

### Node.js Server
```json
{
  "express": "^4.18.2",
  "ws": "^8.14.2",
  "multer": "^1.4.5-lts.1",
  "cors": "^2.8.5",
  "gltf-pipeline": "^4.3.0"
}
```

### Web Application
```json
{
  "react": "^19.2.0",
  "three": "^0.181.1",
  "web-ifc": "^0.0.74",
  "web-ifc-three": "^0.0.126",
  "zustand": "^5.0.8"
}
```

---

## Next Steps to Fix Current Issue

1. **Add error handling to DirectLinkManager** (see fix below)
2. **Test upload endpoint** using `test-upload.ps1`
3. **Check Revit journal files** for export errors
4. **Verify server URL** in Revit settings
5. **Try "Export to Web"** button to see if it shows errors
