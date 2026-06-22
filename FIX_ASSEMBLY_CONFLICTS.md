# Fix: Assembly Version Conflicts Causing IFC Export to Fail

## Problem Found

The Revit journal file shows:
```
Assembly version conflict in some references in RevitToWebExporter.dll assembly
Addin's module System.Net.Http of version 4.2.0.0 conflicts with same preloaded module of version 8.0.0.0
Addin's module System.Windows.Forms of version 4.0.0.0 conflicts with same preloaded module of version 8.0.0.0
Addin's module System.Drawing of version 4.0.0.0 conflicts with same preloaded module of version 8.0.0.0
Expect a soft crash after this warning.

ApplicationException is being thrown on behalf of the function <bool __cdecl ADocument::exportToIFC(...)>
```

## Root Cause

Revit 2026 uses **.NET 8.0** assemblies, but your add-in is targeting **.NET Framework 4.8**. When the add-in tries to use `System.Net.Http`, `System.Windows.Forms`, and `System.Drawing`, it's using version 4.x, but Revit has already loaded version 8.0.0.0, causing a conflict that crashes the IFC export.

## Solution Applied

I've created an `App.config` file with **binding redirects** that tell .NET Framework 4.8 to use the newer versions (8.0.0.0) that Revit has already loaded.

## What You Need to Do

### Step 1: Rebuild the DLL
1. **Open Visual Studio**
2. **Open the project:** `d:\ai-cursor\3d-test-software\revit-addin\RevitToWebExporter\RevitToWebExporter.csproj`
3. **Build → Rebuild Solution** (or press `Ctrl+Shift+B`)
4. **Wait for build to complete**

### Step 2: Close and Restart Revit
1. **Close Revit completely** (if it's open)
2. **Start Revit 2026 again**
3. **Open your model**

### Step 3: Try Direct Link Again
1. **Click "Direct Link" button**
2. **The export should work now!**

## What Changed

**New file created:**
- `revit-addin/RevitToWebExporter/App.config` - Contains binding redirects

**Project file updated:**
- `RevitToWebExporter.csproj` - Now includes App.config

## How Binding Redirects Work

Binding redirects tell .NET Framework:
- "When the code asks for version 4.2.0.0 of System.Net.Http"
- "Use version 8.0.0.0 instead (which Revit already loaded)"

This prevents the version conflict and allows the IFC export to work.

## Verification

After rebuilding and restarting Revit, check the journal file again:
1. **Run:** `CHECK_REVIT_JOURNAL.bat`
2. **Look for:** The assembly conflict errors should be **gone**
3. **Look for:** IFC export should **succeed** (no ApplicationException)

## If It Still Doesn't Work

If you still see errors after rebuilding:

1. **Check the journal file again** using `CHECK_REVIT_JOURNAL.bat`
2. **Look for new error messages**
3. **Share the new errors** - they might be different now

## Technical Details

- **Revit 2026:** Uses .NET 8.0 runtime
- **Your Add-in:** Targets .NET Framework 4.8
- **Solution:** Binding redirects bridge the version gap
- **App.config:** Automatically copied to output directory as `RevitToWebExporter.dll.config`

The `App.config` file gets renamed to `RevitToWebExporter.dll.config` in the output directory, and .NET Framework reads it automatically when loading the DLL.
