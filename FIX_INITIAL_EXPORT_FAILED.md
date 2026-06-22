# Fix: "Initial export failed. Check server connection and try again."

## Problem
You see this error in Revit:
```
❌ Error: Initial export failed. Check server connection and try again.
```

But the server IS running and the web app IS connected!

## Why This Happens

The error is **generic** - it doesn't tell you what actually failed. The failure could be:
1. **IFC export failed** (Revit couldn't export the model)
2. **Upload failed** (Export worked, but couldn't upload to server)
3. **Server connection failed** (Even though health check might pass)

## Step 1: Find the REAL Error

The actual error is logged in **Visual Studio Output**. Here's how to see it:

### In Visual Studio:
1. **Open Visual Studio** (if not already open)
2. **Open your project:** `d:\ai-cursor\3d-test-software\revit-addin\RevitToWebExporter\RevitToWebExporter.csproj`
3. **View → Output** (or press `Ctrl+Alt+O`)
4. **In the "Show output from:" dropdown**, select **"Debug"**
5. **Look for messages starting with:**
   - `[GLBExporter]` - Export process
   - `[DirectLink]` - Direct Link process
   - `[GLBExporter] IFC export error:` - Export errors
   - `[GLBExporter] Health check failed:` - Server connection errors
   - `[GLBExporter] Upload error:` - Upload errors

### What to Look For:

**IFC Export Failed:**
```
[GLBExporter] IFC export error: ...
[GLBExporter] Inner exception: ...
```
**Common causes:**
- Document not saved → Save your Revit file (Ctrl+S)
- "Modifying is forbidden" → Close any active editing operations
- Document in use → Close other Revit instances

**Server Connection Failed:**
```
[GLBExporter] Health check failed: ...
[GLBExporter] Cannot connect to server at ...
```
**Common causes:**
- Server not running → Start `START_REVIT_SYNC_SERVER.bat`
- Firewall blocking → Check Windows Firewall settings
- Wrong URL → Check server URL in Revit settings

**Upload Failed:**
```
[GLBExporter] Upload error: ...
[GLBExporter] HTTP error: ...
```
**Common causes:**
- File too large → Try a smaller model
- Upload timeout → Increase timeout in code
- Server error → Check server window for errors

---

## Step 2: Quick Fixes to Try

### Fix 1: Save Your Revit File
1. **In Revit:** Press `Ctrl+S` to save
2. **Wait** for save to complete
3. **Try "Direct Link" again**

### Fix 2: Close Active Editing Operations
1. **In Revit:** Finish any active commands (walls, doors, etc.)
2. **Press `Esc`** to cancel any active tools
3. **Try "Direct Link" again**

### Fix 3: Restart Server
1. **Close** the server window (Ctrl+C)
2. **Start again:** Double-click `START_REVIT_SYNC_SERVER.bat`
3. **Wait** for "Server initialized" message
4. **Try "Direct Link" again**

### Fix 4: Check File Location
If you're using a sample file from `C:\Program Files\...`:
1. **Copy the file** to your Documents folder
2. **Open the copy** in Revit
3. **Try "Direct Link" again**

See `FIX_SAMPLE_FILE_ERROR.md` for details.

---

## Step 3: Check Server Logs

**Look at the server window** (where `START_REVIT_SYNC_SERVER.bat` is running):

**You should see:**
```
[RevitSync] GET /api/revit/health - ...
[RevitSync] POST /api/revit/upload - ...
[RevitSync] 📥 UPLOAD REQUEST RECEIVED
```

**If you DON'T see these:**
- Revit isn't reaching the server
- Check Visual Studio Output for connection errors

**If you see errors:**
- Copy the error message
- Share it when asking for help

---

## Step 4: Manual Test

### Test 1: Health Check
1. **Open browser:** Go to `http://localhost:3002/api/revit/health`
2. **Should see:** `{"status":"ok",...}`
3. **If not:** Server isn't running correctly

### Test 2: Manual Export
1. **In Revit:** Click "Export to Web" (not "Direct Link")
2. **See if export works** (this tests export without Direct Link)
3. **If this fails:** The problem is with IFC export, not Direct Link

---

## Common Error Messages and Solutions

### "Modifying is forbidden"
**Solution:** Save your Revit file (Ctrl+S) and close any active editing operations.

### "Document must be saved before exporting"
**Solution:** Save your Revit file (Ctrl+S).

### "Cannot connect to server"
**Solution:** 
1. Check if `START_REVIT_SYNC_SERVER.bat` is running
2. Check if port 3002 is listening: `netstat -ano | findstr ":3002"`
3. Check Windows Firewall

### "Upload timed out"
**Solution:** 
- Your model might be too large
- Try a smaller model first
- Or increase timeout in code (requires code change)

### "Server upload failed: 400"
**Solution:** 
- Check server window for error details
- File might be corrupted
- Try exporting again

---

## Getting Help

When asking for help, provide:

1. **Visual Studio Output** (View → Output → Debug)
   - Copy all `[GLBExporter]` and `[DirectLink]` messages
   - Especially any error messages

2. **Server Window Logs**
   - Copy the server output
   - Look for `POST /api/revit/upload` messages

3. **Revit Dialog Screenshot**
   - The exact error message shown

4. **What You Tried**
   - Did you save the file?
   - Did you restart the server?
   - What file are you trying to export?

---

## Quick Checklist

- [ ] Revit file is saved (Ctrl+S)
- [ ] No active editing operations in Revit
- [ ] Server is running (`START_REVIT_SYNC_SERVER.bat`)
- [ ] Health check works: `http://localhost:3002/api/revit/health`
- [ ] Web app is connected (green status)
- [ ] Checked Visual Studio Output for real error
- [ ] File is in a writable location (not Program Files)

---

## Most Likely Cause

Based on your setup:
- ✅ Server is running
- ✅ Web app is connected
- ❌ Export is failing

**Most likely:** The IFC export itself is failing, not the server connection.

**Check Visual Studio Output** to see the actual error!
