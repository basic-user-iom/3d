# Solution Summary - Revit 2026 Assembly Conflicts

## Research Results from Autodesk Forums

### Key Findings

1. **Revit 2025/2026 Use .NET 8 Internally**
   - Add-ins can still target .NET Framework 4.8
   - Assembly conflicts occur when both .NET Framework 4.8 and .NET 8 assemblies are loaded

2. **Our Current Approach is Correct**
   - `Private=False` on Revit API references is standard practice
   - However, it may not fully resolve conflicts with Revit's internal .NET 8 code

3. **The Problem**
   - IFC export fails **inside Revit's internal code** (`exportToIFC`)
   - This happens before our HTTP upload code runs
   - The conflict occurs during assembly loading, not during our code execution

## Recommended Solutions (From Autodesk Forums)

### Option 1: AssemblyLoadContext (Most Robust - Advanced)
Use .NET 8's `AssemblyLoadContext` to isolate dependencies:
- **Pros:** Proper isolation, future-proof
- **Cons:** Complex to implement, requires significant refactoring
- **Reference:** [How to best handle dll conflicts](https://forums.autodesk.com/t5/revit-api-forum/how-to-best-handle-dll-conflicts-with-revit-addins/td-p/13285022)

### Option 2: Multi-Targeting (net8.0-windows + net48)
Target both frameworks in the same project:
```xml
<TargetFrameworks>net8.0-windows;net48</TargetFrameworks>
```
- **Pros:** Supports both old and new Revit versions
- **Cons:** Requires conditional compilation, more complex builds

### Option 3: Remove System.Net.Http (Simpler)
Replace `HttpClient` with `WebClient`:
- **Pros:** Reduces assembly conflicts, simpler API
- **Cons:** Requires code changes, WebClient is older/synchronous
- **Note:** Won't fix IFC export issue directly, but might reduce overall conflicts

### Option 4: Try Different Export Format
Export to FBX or DWG instead of IFC:
- **Pros:** Might have fewer conflicts
- **Cons:** Loses BIM metadata that IFC provides

## Immediate Next Steps

### Recommended: Try Removing System.Net.Http
Even though it won't fix the IFC export directly, removing `System.Net.Http` from references might reduce overall assembly conflicts during initial load, which could help.

**Steps:**
1. Remove `System.Net.Http` reference from `.csproj`
2. Replace `HttpClient` with `WebClient` in all code
3. Rebuild and test

### Alternative: Contact Autodesk Support
Since this is a known issue with Revit 2026, consider:
- Reporting to Autodesk support
- Checking for Revit 2026 updates/patches
- Asking on Autodesk forums for IFC export-specific solutions

## Current Status

- ✅ Add-in loads successfully
- ✅ UI appears correctly
- ✅ `Private=False` configured correctly
- ❌ IFC export fails due to assembly conflicts in Revit's internal code
- ❌ No models uploaded to server

## Conclusion

The assembly conflict is happening **inside Revit's IFC export code**, not in our add-in code. The `Private=False` approach is correct but may not fully resolve conflicts with Revit 2026's internal .NET 8 code.

**Best immediate action:** Try removing `System.Net.Http` to reduce conflicts, then test if IFC export works. If it still fails, this is likely a Revit 2026 compatibility issue that requires an Autodesk fix or a more advanced solution like AssemblyLoadContext.
