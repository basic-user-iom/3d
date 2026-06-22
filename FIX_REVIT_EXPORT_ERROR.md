# Fix: "GLB export failed: Modifying is forbidden"

## Problem
When clicking "Direct Link" in Revit, the connection is established successfully, but the export fails with:
```
Error: Sync failed: GLB export failed: Modifying is forbidden
```

## Root Cause
1. **Misleading Error Message**: The error says "GLB export failed" but the code is actually doing IFC export
2. **Document State**: The "Modifying is forbidden" error occurs when:
   - Document is being saved
   - There's an active transaction
   - An element is being edited
   - Document is in an invalid state for export

## Solution Applied

### 1. Fixed Error Message
**File:** `revit-addin/RevitToWebExporter/GLBExporter.cs`

- Changed error message from "GLB export failed" to "IFC export failed" (accurate)
- Added better error handling for "Modifying is forbidden" cases

### 2. Better Error Handling
- Added specific catch blocks for `ModifyingForbiddenException`
- Added catch for any exception containing "Modifying" or "forbidden"
- Provides clearer error messages to the user

### 3. Removed Incorrect Checks
- Removed `doc.IsReadOnly` check (IFC export works on read-only documents)
- Removed `doc.IsModifiable` check (IFC export doesn't modify the document)

## Changes Made

### GLBExporter.cs
```csharp
// Before: Incorrect checks
if (doc.IsReadOnly) {
    throw new Exception("Document is read-only...");
}
if (!doc.IsModifiable) {
    throw new Exception("Document cannot be modified...");
}

// After: Better error handling
try {
    doc.Export(tempDir, "model", ifcOptions);
}
catch (Autodesk.Revit.Exceptions.ModifyingForbiddenException ex) {
    throw new Exception("Export failed: Document is being modified or is in use. Please save the document, close any active editing operations, and try again.", ex);
}
catch (Exception ex) when (ex.Message.Contains("Modifying") || ex.Message.Contains("forbidden")) {
    throw new Exception("Export failed: Document cannot be modified during export. Please save the document, close any active editing operations, and try again.", ex);
}
```

### Error Message Update
```csharp
// Before
throw new Exception($"GLB export failed: {ex.Message}", ex);

// After
throw new Exception($"IFC export failed: {errorMsg}", ex);
```

## What This Fixes

✅ **Accurate error messages** - Now says "IFC export failed" instead of "GLB export failed"
✅ **Better error handling** - Catches "Modifying is forbidden" errors specifically
✅ **Clearer user guidance** - Tells user to save document and close active operations

## User Actions to Resolve "Modifying is forbidden"

If you still get this error after rebuilding:

1. **Save the document** - Press Ctrl+S or File → Save
2. **Close any active editing operations** - Finish editing any elements
3. **Wait for any background operations** - Let Revit finish any ongoing tasks
4. **Try again** - Click "Synchronize Now" in the Direct Link dialog

## Next Steps

1. **Rebuild the DLL** in Visual Studio (Release mode)
2. **Close Revit** before rebuilding
3. **Restart Revit** after rebuild
4. **Save your document** before clicking "Direct Link"
5. **Try the export again**

## Technical Notes

- IFC export doesn't modify the document, so it should work even on read-only documents
- The "Modifying is forbidden" error typically means there's a conflict with an active operation
- The export runs asynchronously, but Revit API calls need proper thread handling
- If the error persists, it might be a Revit API limitation that requires the document to be in a specific state
