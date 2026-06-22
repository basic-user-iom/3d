# Where to Find Logs - Complete Guide

## 📍 Three Places to Check Logs

### 1. **Server Logs** (Revit Sync Server)
**Location:** The command window where you ran `START_REVIT_SYNC_SERVER.bat`

**What you'll see:**
```
[RevitSync] ✅ Server initialized successfully
[RevitSync] ✅ WebSocket Server listening on ws://localhost:3003
[RevitSync] ✅ HTTP Server running on http://localhost:3002
[RevitSync] Client connected: client-xxxxx
[RevitSync] GET /api/revit/sessions
[RevitSync] POST /api/revit/upload (when you export from Revit)
[RevitSync] Broadcasting MODEL_UPDATE to 1 client(s)
```

**How to see it:**
- Look for the command window titled "Revit Sync Server"
- If you can't find it, run `START_REVIT_SYNC_SERVER.bat` again
- Keep this window open to see all server activity

---

### 2. **Browser Logs** (Web App)
**Location:** Browser Developer Console

**How to open:**
1. Press **F12** in your browser
2. Or right-click → "Inspect" → "Console" tab
3. Or press **Ctrl+Shift+I** → "Console" tab

**What you'll see:**
```
[RevitSync] Connecting to ws://localhost:3003...
[RevitSync] Connected to server
[RevitSync] Connected as client-xxxxx
[RevitConnection] Server is available
[RevitSync] MODEL_UPDATE received from Revit! (when you export)
[RevitConnection] Loading model from: ...
[IFCLoader] Loading IFC...
[ModelLoad] Revit model detected and marked as always visible
```

**Filter logs:**
- Type `RevitSync` or `RevitConnection` in the console filter box
- This shows only Revit-related logs

---

### 3. **Revit Logs** (Add-in Debug Output)
**Location:** Visual Studio Output Window OR Revit Journal File

#### Option A: Visual Studio Output Window
1. Open Visual Studio
2. Go to **View → Output** (or press **Ctrl+Alt+O**)
3. In the "Show output from:" dropdown, select **"Debug"**
4. When you export from Revit, you'll see:
   ```
   [GLBExporter] Starting IFC export...
   [GLBExporter] IFC export completed: X.XX MB
   [DirectLink] Sync failed: [error message]
   ```

#### Option B: Revit Journal File
1. Location: `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`
2. Open the most recent journal file (sorted by date)
3. Search for: `RevitToWebExporter` or `GLBExporter` or `DirectLink`
4. Look for error messages or debug output

---

## 🔍 Quick Reference

| Log Type | Where to Find | What It Shows |
|----------|---------------|---------------|
| **Server Logs** | Command window (START_REVIT_SYNC_SERVER.bat) | Server activity, uploads, broadcasts |
| **Browser Logs** | Browser Console (F12) | Web app activity, model loading |
| **Revit Logs** | Visual Studio Output (Ctrl+Alt+O) or Journal file | Add-in activity, export errors |

---

## 📊 What to Look For When Exporting

### ✅ Success - You'll see:

**In Server Window:**
```
[RevitSync] POST /api/revit/upload
[RevitSync] 📥 UPLOAD REQUEST RECEIVED
[RevitSync] ✅ Received IFC upload: model.ifc
[RevitSync] File size: X.XX MB
[RevitSync] Broadcasting MODEL_UPDATE to 1 client(s)
```

**In Browser Console (F12):**
```
[RevitSync] MODEL_UPDATE received from Revit!
[RevitConnection] Loading model from: http://localhost:3002/...
[IFCLoader] Loading IFC...
[IFCLoader] Marked as Revit model - will remain visible
[ModelLoad] Revit model detected and marked as always visible
[RevitConnection] ✅ Model loaded and ensured visibility
```

### ❌ Error - You'll see:

**In Revit Dialog:**
- Error message in the "Direct Link" dialog

**In Visual Studio Output (View → Output, Debug):**
```
[GLBExporter] IFC export error: [full error message]
[DirectLink] Sync failed: [error details]
```

**In Server Window:**
```
[RevitSync] Upload error: [error message]
```

---

## 🎯 Right Now - Check These:

1. **Server Window** - Should show:
   - `[RevitSync] ✅ Server initialized successfully`
   - `[RevitSync] Client connected: client-xxxxx`
   - `[RevitSync] GET /api/revit/sessions` (every 5 seconds - normal)

2. **Browser Console (F12)** - Should show:
   - `[RevitSync] Connected to server`
   - `[RevitConnection] Server is available`

3. **When you export from Revit:**
   - Server window: `POST /api/revit/upload`
   - Browser console: `MODEL_UPDATE received from Revit!`

---

## 💡 Tips

- **Keep server window visible** - It shows all server activity
- **Keep browser console open (F12)** - It shows web app activity
- **Filter browser console** - Type "Revit" to see only Revit logs
- **Check Visual Studio Output** - If export fails, check View → Output → Debug

---

## 🚨 If You Can't Find Logs

1. **Server not running?**
   - Run `START_REVIT_SYNC_SERVER.bat` again
   - Look for the command window that opens

2. **Browser console empty?**
   - Press F12 in your browser
   - Make sure you're on the "Console" tab
   - Refresh the page (F5)

3. **No Visual Studio Output?**
   - Open Visual Studio
   - View → Output (Ctrl+Alt+O)
   - Select "Debug" from dropdown
