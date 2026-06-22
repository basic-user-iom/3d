# How to Install IFC Exporter v26.4.1 for Revit 2026

## Quick Installation Steps

### Step 1: Download the Installer

1. **Go to:** https://github.com/Autodesk/revit-ifc/releases/tag/IFC.v26.4.1
2. **Scroll down** to the "Assets" section
3. **Download** the installer file (usually named something like `IFCExporter-26.4.1.exe` or `IFCExporter-26.4.1.msi`)

**Note:** The file will be a Windows installer (.exe or .msi)

### Step 2: Close Revit

⚠️ **IMPORTANT:** Make sure **Revit 2026 is completely closed** before installing.

1. **Close all Revit windows**
2. **Check Task Manager** (Ctrl+Shift+Esc) to make sure no Revit processes are running
3. **If Revit is running, the installer may fail or require a restart**

### Step 3: Run the Installer

1. **Double-click** the downloaded installer file
2. **Follow the installation wizard:**
   - Accept the license agreement
   - Choose installation location (default is usually fine)
   - Click "Install"
3. **Wait for installation to complete**

### Step 4: Restart Revit

1. **Open Revit 2026**
2. **The IFC export option should now be enabled** in the File → Export menu

### Step 5: Verify Installation

**Check if it's installed:**
1. **File** → **Export** → **IFC**
2. **If the option is enabled (not grayed out):** ✅ Installation successful!
3. **If still grayed out:** See troubleshooting below

## Alternative: Install from Autodesk App Store

If the GitHub download doesn't work, try the Autodesk App Store:

1. **Open Revit 2026**
2. **Go to:** `Manage` tab → `Add-Ins` → `Autodesk App Store`
3. **Search for:** "IFC 2026" or "Revit IFC Exporter"
4. **Click:** "Install" or "Get"
5. **Follow the prompts**
6. **Restart Revit**

## What This Plugin Does

Once installed, the IFC Exporter plugin:
- ✅ **Enables IFC export** in Revit's native menu
- ✅ **Enables your add-in's IFC export code** to work
- ✅ **Provides IFC4.3 Reference View** support (new in v26.4.1)
- ✅ **Fixes bugs** from previous versions

## After Installation

**Your add-in should now work:**
- ✅ IFC export code in `GLBExporter.cs` will function
- ✅ The assembly conflicts might still exist, but IFC export should be available
- ✅ You can test "Direct Link" again

## Troubleshooting

### Problem: Installer won't run
**Solution:**
- Right-click installer → "Run as Administrator"
- Check if you have admin rights
- Disable antivirus temporarily (if it blocks the installer)

### Problem: Installation completes but IFC is still grayed out
**Solutions:**
1. **Restart Revit** (close completely and reopen)
2. **Check Revit version:** Make sure you're using Revit 2026 (not 2025 or earlier)
3. **Check installation location:** The plugin should install to Revit's add-in folder
4. **Reinstall:** Uninstall first, then reinstall

### Problem: "This app can't run on your PC"
**Solution:**
- Make sure you downloaded the correct version (64-bit for Revit 2026)
- Check Windows compatibility

### Problem: Installation says "Revit not found"
**Solution:**
- Make sure Revit 2026 is installed
- The installer should auto-detect Revit, but you may need to specify the path manually

## Uninstallation

**To remove the plugin:**
1. **Close Revit**
2. **Windows Settings** → **Apps** → **Installed apps**
3. **Search for:** "IFC Exporter" or "Revit IFC"
4. **Click:** "Uninstall"

**OR:**
1. **Run the installer again**
2. **Select:** "Uninstall" or "Remove"

## Current Status After Installation

Once installed:
- ✅ **IFC Export:** Enabled in Revit menu
- ✅ **Your Add-in:** IFC export code should work
- ⚠️ **Assembly Conflicts:** May still exist (but IFC export should function)

## Next Steps

After installing:
1. **Restart Revit**
2. **Test IFC export** from File → Export → IFC (to verify plugin works)
3. **Test your add-in** "Direct Link" button
4. **If assembly conflicts persist:** Consider switching to FBX export as a workaround

## Download Links

- **GitHub Release:** https://github.com/Autodesk/revit-ifc/releases/tag/IFC.v26.4.1
- **Autodesk App Store:** Search "IFC 2026" in Revit's App Store
