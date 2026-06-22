# Fix: "Initial Export Failed" Error

## Problem
Revit shows: **"Error: Initial export failed. Check server connection and try again."**

## What This Means
- ✅ Direct Link is established (connection works)
- ❌ The upload of the IFC file to the server is failing

## Root Cause
The Revit add-in is trying to upload the exported IFC file to `http://localhost:3002/api/revit/upload`, but the upload is failing.

## Solutions

### Solution 1: Check Server is Running
1. **Look for the server window** (where you ran `START_REVIT_SYNC_SERVER.bat`)
2. **Should show:**
   ```
   [RevitSync] ✅ Server initialized successfully
   [RevitSync] ✅ HTTP Server running on http://localhost:3002
   ```
3. **If not running:** Start `START_REVIT_SYNC_SERVER.bat`

### Solution 2: Test Server Connection
**In PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3002/api/revit/health" -Method GET
```

**Expected:** Status 200 (OK)
**If error:** Server is not accessible

### Solution 3: Check Firewall
Windows Firewall might be blocking Revit from connecting to localhost:3002.

**Fix:**
1. Open Windows Defender Firewall
2. Allow Revit through firewall
3. Or temporarily disable firewall to test

### Solution 4: Try Manual Sync
1. **In Revit:** Click "Direct Link" again
2. **Click "Synchronize Now"** button
3. **Watch for error messages**

### Solution 5: Check Visual Studio Output
1. **Open Visual Studio**
2. **View → Output** (Ctrl+Alt+O)
3. **Select "Debug"** from dropdown
4. **Look for error messages** starting with `[GLBExporter]`

## What I Fixed

I've improved the upload code to:
- ✅ **Test server connection first** (health check)
- ✅ **Better error messages** (tells you exactly what's wrong)
- ✅ **Longer timeout** (5 minutes for large files)
- ✅ **More detailed logging** (check Visual Studio Output)

## Next Steps

1. **Rebuild the DLL** in Visual Studio (to get the improved error messages)
2. **Restart Revit** (to load the new DLL)
3. **Try "Direct Link" again**
4. **Check Visual Studio Output** for detailed error messages

## Debugging

### Check Visual Studio Output
After clicking "Direct Link", check Visual Studio Output (View → Output → Debug) for:
```
[GLBExporter] Starting upload to server: ...
[GLBExporter] Testing server connection...
[GLBExporter] Server health check passed
[GLBExporter] Uploading to: ...
```

**If you see errors:**
- "Cannot connect to server" → Server not running
- "Health check failed" → Server not responding
- "Upload timed out" → File too large or server slow
- "Connection refused" → Firewall blocking

### Check Server Window
Look for:
```
[RevitSync] POST /api/revit/upload
[RevitSync] 📥 UPLOAD REQUEST RECEIVED
```

**If you DON'T see this:** Revit can't reach the server (firewall or server not running)

## Quick Test

1. **Make sure server is running** (check server window)
2. **In Revit:** Click "Synchronize Now" button
3. **Check Visual Studio Output** for error details
4. **Check server window** for upload request

## Common Issues

### Issue: "Connection refused"
**Fix:** 
- Start `START_REVIT_SYNC_SERVER.bat`
- Check Windows Firewall

### Issue: "Timeout"
**Fix:**
- File might be too large
- Try exporting a smaller model first
- Check server window for errors

### Issue: "Server not running"
**Fix:**
- Start `START_REVIT_SYNC_SERVER.bat`
- Wait for "Server initialized" message
