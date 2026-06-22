# Fix: FBX Export Failed - "External c..." Error

## The Problem

You're seeing: **"Sync failed: FBX export failed: Export failed: External c..."**

The error message is **truncated** - we need to see the full error to fix it.

## Step 1: Get the Full Error Message

### Option A: Check Visual Studio Output Window

**If you're debugging:**
1. **Open Visual Studio**
2. **View → Output** (or press `Ctrl+Alt+O`)
3. **Select "Debug"** from the dropdown
4. **Look for:** `[GLBExporter]` messages
5. **Find the full error** - it should show the complete exception message

### Option B: Check Revit Journal Files

**Revit logs all errors to journal files:**

1. **Close Revit**
2. **Navigate to:** `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`
3. **Open the most recent journal file** (sorted by date, newest first)
4. **Search for:** "FBX" or "export" or "External"
5. **Look for the full error message**

### Option C: Improve Error Display in Code

I can update the code to show the full error message in a TaskDialog so you can see it directly in Revit.

## Common FBX Export Errors

### Error 1: "No 3D views found"
**Fix:** Create a 3D view in Revit

### Error 2: "ViewSet is empty"
**Fix:** The code should check for this, but if it happens, create a 3D view

### Error 3: "Invalid view" or "View is not a 3D view"
**Fix:** Make sure all views in the ViewSet are actually 3D views

### Error 4: "External command failed"
**This might mean:**
- The export method signature is wrong
- There's an exception in the export code
- Revit's internal export failed

## Quick Fix: Add Better Error Handling

I can update the code to:
1. **Show full error messages** in a TaskDialog
2. **Log detailed error info** to Visual Studio Output
3. **Check ViewSet before exporting**
4. **Validate views** before adding to ViewSet

## What to Do Now

**Immediate steps:**

1. **Check Visual Studio Output** (if debugging)
   - Look for `[GLBExporter]` messages
   - Find the full exception message

2. **Or check Revit Journal**
   - Open the latest journal file
   - Search for "FBX" or "export"
   - Copy the full error message

3. **Share the full error message** so I can fix it

**Or I can:**
- Update the code to show full errors in a dialog
- Add better error handling
- Add validation checks

## Most Likely Causes

Based on the truncated error "External c...", it's probably:

1. **"External command failed"** - The export method threw an exception
2. **"External command exception"** - Something in the export code failed
3. **ViewSet issue** - The views might not be valid for export

**The full error message will tell us exactly what's wrong.**

## Next Steps

**Option 1: Get the full error**
- Check Visual Studio Output or Revit Journal
- Share the complete error message

**Option 2: I can improve error handling**
- Update code to show full errors
- Add validation checks
- Better error messages

Which would you prefer?
