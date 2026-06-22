# How to Export Model from Revit - Step by Step

## ✅ Current Status

Your connection is working! The logs show:
- ✅ Web app connected to server
- ✅ Server available
- ⏳ **Waiting for Revit export** (no model exported yet)

## 🎯 Step-by-Step: Export from Revit

### Step 1: Open Revit
1. **Open Revit 2026**
2. **Open your Revit model** (any .rvt file)

### Step 2: Find the "Revit to Web" Tab
1. Look at the **ribbon** (top menu bar)
2. Find the **"Revit to Web"** tab
3. If you don't see it:
   - The add-in might not be loaded
   - Check Revit journal for errors (see troubleshooting below)

### Step 3: Click "Direct Link"
1. **Click the "Direct Link" button** in the "Revit to Web" tab
2. **Wait for the dialog** to appear
3. You should see: **"✅ Direct Link established!"**

### Step 4: Wait for Export
1. **Revit will automatically export** your model (IFC format)
2. This takes **10-30 seconds** depending on model size
3. **Don't close Revit** during export

### Step 5: Check for Model in Browser
1. **Look at your browser** (3D viewer)
2. **Check browser console** (F12) for messages
3. You should see: **`[RevitConnection] Model update received`**

---

## 📊 What You'll See When It Works

### In Browser Console (F12):
```
[RevitConnection] ========================================
[RevitConnection] Model update received: {...}
[RevitConnection] File: model.ifc
[RevitConnection] Size: X.XX MB
[RevitConnection] URL: http://localhost:3002/...
[RevitConnection] ========================================
[RevitConnection] Loading model from: ...
[IFCLoader] Loading IFC...
[IFCLoader] Marked as Revit model - will remain visible
[RevitConnection] ✅ Model loaded and ensured visibility
```

### In Server Window:
```
[RevitSync] POST /api/revit/upload
[RevitSync] 📥 UPLOAD REQUEST RECEIVED
[RevitSync] ✅ Received IFC upload: model.ifc
[RevitSync] File size: X.XX MB
[RevitSync] Broadcasting MODEL_UPDATE to 1 client(s)
```

### In Revit:
- Dialog: **"✅ Direct Link established!"**
- Panel: **"Direct Link Active"** (if you click Direct Link again)

---

## 🆘 Troubleshooting

### Problem: "Revit to Web" Tab Not Showing

**Solution:**
1. **Check if DLL exists:**
   - `d:\ai-cursor\3d-test-software\revit-addin\RevitToWebExporter\bin\Release\RevitToWebExporter.dll`
   - If missing, build it in Visual Studio

2. **Check Revit Journal:**
   - Location: `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`
   - Open most recent journal file
   - Search for "RevitToWebExporter"
   - Look for error messages

3. **Restart Revit:**
   - Close Revit completely
   - Start Revit 2026 again
   - Check for the tab

---

### Problem: "Direct Link" Button Doesn't Work

**Solution:**
1. **Check Revit dialog** for error messages
2. **Check Visual Studio Output** (View → Output → Debug)
3. **Look for error messages** like:
   - "Modifying is forbidden" → Save your Revit file first
   - "Server not running" → Start the server first
   - "Export failed" → Check error details

---

### Problem: Model Exported But Doesn't Appear

**Check these:**

1. **Browser Console (F12):**
   - Look for `[RevitConnection] Model update received`
   - Look for `[IFCLoader] Loading IFC...`
   - Look for any error messages

2. **Server Window:**
   - Look for `POST /api/revit/upload`
   - Look for `Broadcasting MODEL_UPDATE`

3. **Model might be too small/large:**
   - Try zooming out (mouse wheel)
   - Check if camera is positioned correctly
   - Model might be at origin (0,0,0)

4. **Model might be invisible:**
   - Check if Streets GL overlay is disabled (should be automatic)
   - Check browser console for visibility messages

---

## 🔍 Quick Verification

### Check 1: Is Server Running?
Look at the server window - should show:
```
[RevitSync] ✅ Server initialized successfully
[RevitSync] ✅ WebSocket Server listening on ws://localhost:3003
[RevitSync] ✅ HTTP Server running on http://localhost:3002
```

### Check 2: Is Web App Connected?
Look at browser console - should show:
```
[RevitSync] Connected to server
[RevitConnection] Server is available
```

### Check 3: Did Export Happen?
Look for these messages:
- **Server:** `POST /api/revit/upload`
- **Browser:** `[RevitConnection] Model update received`

---

## 📋 Complete Checklist

- [ ] Revit 2026 is open
- [ ] Revit model (.rvt file) is open
- [ ] "Revit to Web" tab is visible in Revit
- [ ] Server is running (check server window)
- [ ] Web app is connected (check browser console)
- [ ] Clicked "Direct Link" button in Revit
- [ ] Waited for export to complete (10-30 seconds)
- [ ] Checked browser console for MODEL_UPDATE message
- [ ] Model appears in 3D viewer

---

## 💡 Tips

- **Save your Revit file first** before exporting
- **Wait for export to complete** - don't close Revit during export
- **Check browser console** (F12) for detailed messages
- **Check server window** for upload confirmation
- **Model might be at origin** - try zooming out if you don't see it

---

## 🎯 Next Steps

1. **Click "Direct Link" in Revit**
2. **Wait for export** (watch for dialog)
3. **Check browser console** for MODEL_UPDATE message
4. **Model should appear** automatically

If you still don't see the model after exporting, share:
- What you see in the Revit dialog
- What messages appear in browser console (F12)
- What messages appear in server window
