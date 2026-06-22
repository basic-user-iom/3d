# Troubleshooting: IFC Still Grayed Out After Installation

## Current Status
The IFC export option is still grayed out in your Revit menu. This means either:
1. The plugin hasn't been installed yet
2. The installation didn't complete successfully
3. Revit needs to be restarted
4. The plugin installed but isn't being detected

## Step-by-Step Troubleshooting

### Step 1: Check if Plugin is Installed

**Check Windows Programs:**
1. **Press:** `Windows Key + I` (opens Settings)
2. **Go to:** Apps → Installed apps
3. **Search for:** "IFC" or "Revit IFC"
4. **If you see "IFC Exporter 2026" or similar:** ✅ Plugin is installed
5. **If nothing appears:** ❌ Plugin is not installed

### Step 2: Verify Installation Location

**Check if files exist:**
1. **Open File Explorer**
2. **Navigate to:** `C:\Program Files\Autodesk\Revit 2026\AddIns\`
3. **Look for:** Folder named "IFC" or "IFCExporter"
4. **If folder exists:** ✅ Plugin files are present
5. **If folder doesn't exist:** ❌ Installation may have failed

**Alternative location:**
- `C:\ProgramData\Autodesk\ApplicationPlugins\`
- Look for "IFCExporter.bundle" or similar

### Step 3: Restart Revit Completely

**Full restart process:**
1. **Close all Revit windows**
2. **Open Task Manager** (Ctrl+Shift+Esc)
3. **Check "Processes" tab** for any "Revit.exe" processes
4. **End all Revit processes** if found
5. **Wait 10 seconds**
6. **Restart Revit 2026**
7. **Check File → Export → IFC again**

### Step 4: Reinstall the Plugin

**If plugin is installed but not working:**
1. **Close Revit completely**
2. **Uninstall the plugin:**
   - Settings → Apps → Installed apps
   - Find "IFC Exporter" → Click "Uninstall"
3. **Download fresh installer** from GitHub
4. **Right-click installer** → "Run as Administrator"
5. **Complete installation**
6. **Restart Revit**

### Step 5: Check Revit Version

**Verify you have Revit 2026:**
1. **In Revit:** Help → About Autodesk Revit
2. **Check version:** Should say "Revit 2026"
3. **If it's 2025 or earlier:** The v26.4.1 plugin won't work
4. **You need:** Revit 2026 specifically

### Step 6: Try Autodesk App Store Method

**If GitHub installer doesn't work:**
1. **Open Revit 2026**
2. **Go to:** Manage tab → Add-Ins → Autodesk App Store
3. **Search:** "IFC 2026"
4. **Install directly from App Store**
5. **Restart Revit**

## Alternative Solution: Use FBX Export Instead

**If IFC installation continues to fail, use FBX:**

✅ **FBX is built-in** - No plugin needed  
✅ **Your viewer supports FBX** - Already implemented  
✅ **Works immediately** - No installation required  
✅ **3D geometry with materials** - Good quality  

**I can update your add-in code to use FBX instead of IFC right now.**

## Quick Test: Can You Export FBX?

**To verify Revit export is working:**
1. **File → Export → FBX**
2. **If FBX export works:** ✅ Revit exports are functional
3. **If FBX also fails:** There may be a broader Revit issue

## Common Issues and Fixes

### Issue: "Installation completed but IFC still grayed out"
**Fix:**
- Restart Revit completely (close all processes)
- Check if plugin installed to correct Revit version folder
- Verify you're using Revit 2026 (not 2025)

### Issue: "Installer says 'Revit not found'"
**Fix:**
- Make sure Revit 2026 is installed
- Installer should auto-detect, but you can manually specify path:
  - Default: `C:\Program Files\Autodesk\Revit 2026\`

### Issue: "Installer requires admin rights"
**Fix:**
- Right-click installer → "Run as Administrator"
- Or log in as Administrator

### Issue: "Antivirus blocks installation"
**Fix:**
- Temporarily disable antivirus
- Add exception for Autodesk installers
- Or download from Autodesk App Store instead

## What to Do Next

**Option A: Continue Troubleshooting IFC**
1. Follow steps 1-6 above
2. Check installation logs if available
3. Contact Autodesk support if still not working

**Option B: Switch to FBX (Recommended for Speed)**
1. I can update your add-in code to use FBX
2. No installation needed
3. Works immediately
4. You can always switch back to IFC later

## Recommendation

**Since IFC installation is proving difficult:**
- **Switch to FBX export now** - Get it working immediately
- **Install IFC plugin later** - When you have time to troubleshoot
- **Both formats work** - Your viewer supports both

**Would you like me to update the code to use FBX export instead?**
