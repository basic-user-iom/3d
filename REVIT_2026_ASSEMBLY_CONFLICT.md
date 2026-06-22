# Revit 2026 Assembly Version Conflict - Known Issue

## Problem
Revit 2026 uses .NET 8.0 internally, but add-ins must target .NET Framework 4.8. This causes assembly version conflicts that can prevent IFC exports from working.

**Error in Journal:**
```
Assembly version conflict in some references in RevitToWebExporter.dll assembly
ApplicationException is being thrown on behalf of the function exportToIFC
```

## Current Solution Attempted
We've set `Private=False` on conflicting assemblies in the `.csproj` file:
- `System.Net.Http`
- `System.Windows.Forms`
- `System.Drawing`
- `System.Data.DataSetExtensions`
- `Microsoft.CSharp`

This tells MSBuild not to copy these assemblies, forcing the add-in to use Revit's loaded versions.

## Why It's Still Failing
Even with `Private=False`, the assembly conflicts persist because:
1. Revit 2026's internal code (including IFC export) expects .NET 8.0 assemblies
2. Our add-in references .NET Framework 4.8 assemblies
3. The CLR cannot fully resolve these conflicts at runtime

## Potential Workarounds

### Option 1: Use a Separate Process (Advanced)
Run the IFC export in a separate process that doesn't load conflicting assemblies.

### Option 2: Try Different Export Format
Instead of IFC, try exporting to a different format (FBX, DWG) that might have fewer conflicts.

### Option 3: Wait for Autodesk Update
This is a known issue with Revit 2026. Autodesk may release a fix in a future update.

### Option 4: Use Revit 2025 or Earlier
Revit 2025 and earlier versions don't have this .NET 8.0 conflict.

## Current Status
- ✅ Add-in loads successfully
- ✅ UI buttons appear
- ❌ IFC export fails due to assembly conflicts
- ❌ No models uploaded to server

## Next Steps
1. Check Autodesk forums for official solutions
2. Consider using a different export format temporarily
3. Monitor for Revit 2026 updates that address this issue
