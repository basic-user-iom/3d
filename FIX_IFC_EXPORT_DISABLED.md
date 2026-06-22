# Fix: IFC Export Grayed Out in Revit 2026

## The Problem

In Revit 2026, **IFC export is no longer built-in**. It's now a **separate plugin** that must be installed. If the IFC option is grayed out in the export menu, the plugin is not installed.

## Solution: Install IFC Exporter Plugin

### Option 1: Install from Autodesk App Store (Recommended)

1. **Open Revit 2026**
2. **Go to:** `Manage` tab → `Add-Ins` → `Autodesk App Store`
3. **Search for:** "IFC 2026" or "Revit IFC Exporter"
4. **Install** the official Autodesk IFC Exporter plugin
5. **Restart Revit** after installation

### Option 2: Download from GitHub

1. **Visit:** https://github.com/Autodesk/revit-ifc/releases
2. **Download:** Latest "Revit IFC 2026" installer
3. **Run the installer**
4. **Restart Revit**

### Option 3: Check Autodesk Account

1. **Log in to:** https://manage.autodesk.com
2. **Go to:** Products & Services
3. **Find:** Revit 2026
4. **Check:** Available downloads/add-ons
5. **Download:** IFC Exporter if available

## After Installation

Once installed:
- ✅ IFC option will be **enabled** in the export menu
- ✅ Your add-in's IFC export code should work
- ✅ Native Revit IFC export will work

## Alternative: Use FBX Export (No Plugin Needed)

**If you can't install the IFC plugin**, use **FBX export** instead:

1. ✅ **No plugin required** - FBX is built-in
2. ✅ **Your viewer supports FBX** - Already implemented
3. ✅ **Might avoid assembly conflicts** - Older format
4. ✅ **3D geometry with materials** - Good quality

**I can update your add-in code to use FBX instead of IFC.**

## Why This Happened

Revit 2026 changed IFC export from:
- **Before:** Built-in feature (always available)
- **Now:** Separate plugin (must be installed)

This allows Autodesk to:
- Update IFC export independently
- Fix bugs faster
- Add new features without full Revit updates

## Check if Plugin is Installed

**In Revit:**
1. **File** → **Export** → **IFC**
2. **If enabled:** Plugin is installed ✅
3. **If grayed out:** Plugin is missing ❌

## Current Status

- ❌ **IFC Export:** Disabled (plugin not installed)
- ✅ **FBX Export:** Available (built-in)
- ✅ **Your Viewer:** Supports both IFC and FBX

## Recommendation

**Immediate Solution:**
1. **Install IFC Exporter plugin** (if you need IFC)
2. **OR use FBX export** (no plugin needed, already supported)

**I can help you:**
- Switch the add-in to use FBX export (quick fix)
- Or wait until you install the IFC plugin
