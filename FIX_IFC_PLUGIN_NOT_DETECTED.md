# Fix: IFC Plugin Installed But Not Detected by Revit

## Current Situation
✅ **Plugin is installed:** "Revit IFC 2026" version 26.4.1.0 is in your Programs list  
❌ **But IFC is still grayed out:** Revit isn't detecting the plugin

## Solution Steps

### Step 1: Complete Revit Restart (Most Important!)

**The plugin was installed on 1/25/2026, but Revit may not have been restarted since then:**

1. **Close ALL Revit windows completely**
2. **Open Task Manager** (Ctrl+Shift+Esc)
3. **Go to "Details" tab**
4. **Look for any "Revit.exe" processes**
5. **Right-click each one** → "End task"
6. **Wait 30 seconds** (let Windows clean up)
7. **Restart Revit 2026**
8. **Check File → Export → IFC** (should now be enabled)

### Step 2: Verify Plugin Location

**Check if plugin files are in the correct location:**

1. **Open File Explorer**
2. **Navigate to:** `C:\ProgramData\Autodesk\ApplicationPlugins\`
3. **Look for:** Folder named "IFCExporter.bundle" or "IFCExporter2026.bundle"
4. **If found:** ✅ Plugin files are in correct location
5. **If NOT found:** Check alternative location below

**Alternative location:**
- `C:\Program Files\Autodesk\Revit 2026\AddIns\`
- Look for "IFC" or "IFCExporter" folder

### Step 3: Check Add-In Manager

**Verify plugin is registered in Revit:**

1. **Open Revit 2026**
2. **Go to:** `Manage` tab → `Add-Ins` → `External Tools` → `Add-In Manager`
3. **Look for:** "IFC Exporter" or "Revit IFC" in the list
4. **Check if it's enabled** (checkbox should be checked)
5. **If disabled:** Enable it and restart Revit

### Step 4: Check Revit Journal for Errors

**See if Revit is reporting plugin loading errors:**

1. **Close Revit**
2. **Navigate to:** `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`
3. **Open the most recent journal file** (sorted by date, newest first)
4. **Search for:** "IFC" or "IFCExporter"
5. **Look for error messages** about the plugin failing to load

### Step 5: Reinstall Plugin (If Above Steps Don't Work)

**Sometimes a reinstall fixes registration issues:**

1. **Close Revit completely**
2. **Uninstall the plugin:**
   - Settings → Apps → Installed apps
   - Find "Revit IFC 2026" → Click "Uninstall"
3. **Restart your computer** (optional but recommended)
4. **Download fresh installer** from GitHub
5. **Right-click installer** → "Run as Administrator"
6. **Complete installation**
7. **Restart Revit**

## Quick Test: Try FBX Export

**To verify Revit exports work at all:**

1. **File → Export → FBX**
2. **If FBX works:** ✅ Revit exports are functional (just IFC plugin issue)
3. **If FBX also fails:** There may be a broader Revit problem

## Most Likely Fix

**Since the plugin is installed but not working, the #1 most common fix is:**

1. **Close Revit completely** (end all processes in Task Manager)
2. **Wait 30 seconds**
3. **Restart Revit**
4. **IFC should now be enabled**

**The plugin was installed on 1/25/2026 - if Revit was already running, it wouldn't have detected the new plugin until restart.**

## If Still Not Working After Restart

**Check these specific things:**

1. **Plugin version compatibility:**
   - Plugin: 26.4.1.0 ✅
   - Revit: 26.0.4.409 ✅
   - Versions should be compatible

2. **Check for multiple Revit installations:**
   - Make sure plugin installed to correct Revit 2026 instance
   - If you have multiple Revit versions, plugin might be in wrong folder

3. **Check Windows Event Viewer:**
   - Windows Key + X → Event Viewer
   - Windows Logs → Application
   - Look for errors related to "IFC" or "Revit" around installation time

## Alternative: Use FBX Export (Works Immediately)

**While troubleshooting IFC, you can use FBX:**

✅ **FBX is built-in** - No plugin needed  
✅ **Your viewer supports FBX** - Already implemented  
✅ **Works right now** - No waiting  
✅ **3D geometry with materials** - Good quality  

**I can update your add-in code to use FBX instead of IFC. This will work immediately while you troubleshoot the IFC plugin.**

## Next Steps

**Try this order:**

1. **First:** Complete Revit restart (Step 1 above) - **Most likely to fix it**
2. **If that doesn't work:** Check plugin location (Step 2)
3. **If still not working:** Check Add-In Manager (Step 3)
4. **Last resort:** Reinstall plugin (Step 5)

**Or:** Switch to FBX export now (I can do this immediately) and troubleshoot IFC later.

## Recommendation

**Since the plugin is installed:**
- **Try complete Revit restart first** (close all processes, wait, restart)
- **If that doesn't work:** Let me know and we'll check plugin location/registration
- **Meanwhile:** I can switch your add-in to FBX so you can test immediately

**Would you like me to:**
1. Help troubleshoot IFC plugin detection further?
2. Switch your add-in to FBX export (works immediately)?
