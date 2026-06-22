# Fix: "IFC Export Failed" Error

## Problem
Revit shows: **"Error: Sync failed: IFC export failed: Export failed: Documen..."** (truncated)

## What This Means
The IFC export is failing, likely due to:
- Document not saved
- Document in invalid state
- Active operations blocking export

## Solutions

### Solution 1: Save Your Document
**Most Common Fix:**
1. **In Revit:** Press `Ctrl+S` to save your document
2. **Or:** File → Save
3. **Then:** Try "Synchronize Now" again

### Solution 2: Check Document State
**Before exporting:**
- ✅ Document must be saved (not "Untitled")
- ✅ No active editing operations
- ✅ No active transactions
- ✅ Document is not corrupted

### Solution 3: Check Visual Studio Output
**To see the full error message:**
1. **Open Visual Studio**
2. **View → Output** (Ctrl+Alt+O)
3. **Select "Debug"** from dropdown
4. **Look for:** `[GLBExporter] Export exception: ...`

The full error message will show exactly what's wrong.

## What I Fixed

I've improved the export code to:
- ✅ **Check if document is saved** before export
- ✅ **Show full error messages** (not truncated)
- ✅ **Better document state logging** (check Visual Studio Output)
- ✅ **More detailed error handling** for document-related issues

## Next Steps

1. **Rebuild the DLL** in Visual Studio (Release mode)
2. **Restart Revit** (to load the new DLL)
3. **Save your document** (Ctrl+S)
4. **Try "Synchronize Now" again**
5. **Check Visual Studio Output** for full error details

## Common Error Messages

### "Document must be saved before exporting"
**Fix:** Save your Revit file first (Ctrl+S)

### "Document is being modified or is in use"
**Fix:** 
- Close any active editing operations
- Wait for any ongoing operations to complete
- Save the document

### "Document may be in an invalid state"
**Fix:**
- Save the document
- Close and reopen the document
- Check for document corruption

## Debugging

### Check Visual Studio Output
After clicking "Synchronize Now", check Visual Studio Output (View → Output → Debug) for:
```
[GLBExporter] Checking document state...
[GLBExporter] Document title: ...
[GLBExporter] Document path: ...
[GLBExporter] Is read-only: ...
[GLBExporter] Starting IFC export...
[GLBExporter] Export exception: [FULL ERROR MESSAGE HERE]
```

This will show you exactly what's wrong.

## Quick Test

1. **Save your document** (Ctrl+S)
2. **In Revit:** Click "Synchronize Now"
3. **Check Visual Studio Output** for error details
4. **If still failing:** Share the full error message from Visual Studio Output
