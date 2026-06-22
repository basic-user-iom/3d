# Autodesk Forum Solutions for Revit 2026 Assembly Conflicts

## Research Summary
Based on Autodesk forums and community discussions, here are the official and recommended solutions for assembly version conflicts in Revit 2025/2026.

## Key Findings

### 1. Revit 2025/2026 Use .NET 8 Internally
- Revit 2025 and 2026 run on **.NET 8** internally
- Add-ins can still target **.NET Framework 4.8** (backward compatible)
- However, assembly conflicts occur when both .NET Framework 4.8 and .NET 8 assemblies are loaded

### 2. Our Current Approach (`Private=False`) is Correct
- Setting `Private=False` on Revit API references is **standard practice**
- This prevents copying Revit's assemblies to your output directory
- However, it may not fully resolve conflicts with third-party libraries

## Recommended Solutions (From Autodesk Forums)

### Solution 1: AssemblyLoadContext (Recommended for .NET 8)
**For Revit 2025/2026**, the recommended approach is to use **AssemblyLoadContext** to create an isolated environment for your add-in's dependencies.

**Pros:**
- Allows your add-in to load its own version of DLLs even if Revit has loaded different versions
- Native .NET 8 solution
- Proper isolation

**Cons:**
- More complex to implement
- Requires significant code changes

**References:**
- [How to best handle dll conflicts with revit addins](https://forums.autodesk.com/t5/revit-api-forum/how-to-best-handle-dll-conflicts-with-revit-addins/td-p/13285022)
- [DLLs loading in Revit 2025 but not in Revit 2024](https://forums.autodesk.com/t5/revit-api-forum/dlls-loading-in-revit-2025-but-not-in-revit-2024/td-p/13160446)

### Solution 2: Multi-Targeting (net8.0-windows + net48)
Target both .NET 8 and .NET Framework 4.8 in the same project:

```xml
<PropertyGroup>
  <TargetFrameworks>net8.0-windows;net48</TargetFrameworks>
  <PlatformTarget>x64</PlatformTarget>
</PropertyGroup>

<ItemGroup>
  <FrameworkReference Include="Microsoft.WindowsDesktop.App" />
</ItemGroup>
```

**Pros:**
- Supports both old and new Revit versions
- Can use .NET 8 features when available

**Cons:**
- Requires conditional compilation
- More complex build process

**References:**
- [Help upgrading Revit 2024 plugin (.NET Framework 4.8) to Revit 2025 (.NET 8)](https://forums.autodesk.com/t5/revit-api-forum/help-upgrading-revit-2024-plugin-net-framework-4-8-to-revit-2025/td-p/13867211)

### Solution 3: IL-Repack (Merge Dependencies)
Use **IL-Repack** to merge all dependencies into a single DLL.

**Pros:**
- Single DLL eliminates version conflicts
- No need to ship multiple DLLs

**Cons:**
- Merged DLLs can be large
- Some libraries don't merge well
- Requires build-time processing

**References:**
- [How to best handle dll conflicts with revit addins](https://forums.autodesk.com/t5/revit-api-forum/how-to-best-handle-dll-conflicts-with-revit-addins/td-p/13285022)

### Solution 4: Remove Problematic References
If `System.Net.Http` is causing conflicts, consider:
- Using `WebClient` instead of `HttpClient` (older API, fewer conflicts)
- Or removing HTTP calls from the export path entirely

## Our Specific Issue: IFC Export Failing

The IFC export is failing because:
1. Revit's internal IFC export code expects .NET 8 assemblies
2. Our add-in references .NET Framework 4.8 assemblies
3. The conflict occurs **inside Revit's code**, not ours

## Recommended Next Steps

### Option A: Try WebClient Instead of HttpClient (Simplest)
Replace `System.Net.Http.HttpClient` with `System.Net.WebClient`:
- Older API, less likely to conflict
- Still supports file uploads
- Minimal code changes

### Option B: Implement AssemblyLoadContext (Most Robust)
Create an isolated context for HTTP operations:
- More complex but proper solution
- Future-proof for Revit 2026+

### Option C: Separate Export Process (Workaround)
Run IFC export in a separate process:
- Avoids assembly conflicts entirely
- More complex architecture

## Diagnostic Tools

### Revit Dependency Scanner
Tool to analyze which DLLs are already loaded by Revit:
- [GitHub - symonkipkemei/revit-dependency-scanner](https://github.com/symonkipkemei/revit-dependency-scanner)

## Forum Threads Referenced

1. [Conflicts building Revit 2025 Plugin with .Net Framework 4.8](https://forums.autodesk.com/t5/revit-api-forum/conflicts-building-revit-2025-plugin-with-net-framework-4-8/td-p/12698947)
2. [Help upgrading Revit 2024 plugin to Revit 2025](https://forums.autodesk.com/t5/revit-api-forum/help-upgrading-revit-2024-plugin-net-framework-4-8-to-revit-2025/td-p/13867211)
3. [How to best handle dll conflicts with revit addins](https://forums.autodesk.com/t5/revit-api-forum/how-to-best-handle-dll-conflicts-with-revit-addins/td-p/13285022)
4. [Dependency Version Conflict (Assembly Binding for .DLLs)](https://forums.autodesk.com/t5/revit-api-forum/dependency-version-conflict-assembly-binding-for-dlls/td-p/9485961)

## Conclusion

The `Private=False` approach we're using is correct, but may not fully resolve conflicts with Revit 2026's internal .NET 8 code. The recommended solution is **AssemblyLoadContext**, but the simplest immediate fix would be to **replace HttpClient with WebClient** to reduce conflicts.
