# Revit Export Formats - Compatibility with 3D Viewer

## Summary

Your 3D viewer supports **many formats**, and Revit can export several of them natively. Here's what works:

## ✅ Best Options (Native Revit Export + Viewer Support)

### 1. **FBX** ⭐ (Recommended Alternative to IFC)
**Revit Export:** ✅ Native (`FBXExportOptions`)  
**Viewer Support:** ✅ Full support (`fbxLoader.ts`)  
**Pros:**
- Native Revit export (no conflicts expected)
- 3D geometry with materials
- Smaller files than IFC
- Your viewer already supports it
- **Might avoid assembly conflicts** (older format, fewer .NET 8 dependencies)

**Cons:**
- Less BIM metadata than IFC
- Materials may be simplified

**Implementation:**
```csharp
FBXExportOptions fbxOptions = new FBXExportOptions();
doc.Export(tempDir, "model", fbxOptions);
```

### 2. **IFC** (Current - But Failing Due to Conflicts)
**Revit Export:** ✅ Native (`IFCExportOptions`)  
**Viewer Support:** ✅ Full support (`ifcLoader.ts`)  
**Pros:**
- Rich BIM metadata (rooms, properties, relationships)
- Industry standard
- Your viewer already supports it

**Cons:**
- ❌ **Currently failing due to assembly conflicts**
- Large file sizes
- Curved surfaces become faceted

**Status:** Working in code, but failing at runtime due to Revit 2026 .NET 8 conflicts

### 3. **OBJ** (If Available)
**Revit Export:** ⚠️ May require plugin or custom code  
**Viewer Support:** ✅ Full support (`objLoader.ts`)  
**Pros:**
- Simple format
- Small file sizes
- Fast loading
- Your viewer supports it

**Cons:**
- May not be native Revit export
- Less metadata than IFC/FBX

**Note:** Check if `OBJExportOptions` exists in Revit 2026 API

### 4. **STL** (Simple Geometry Only)
**Revit Export:** ✅ Native  
**Viewer Support:** ✅ Full support (`stlLoader.ts`)  
**Pros:**
- Native export
- Simple format
- Fast loading

**Cons:**
- **No materials** (geometry only)
- **No metadata**
- Large file sizes (uncompressed)

## ❌ Not Recommended

### DWG/DXF
- **Revit Export:** ✅ Native
- **Viewer Support:** ⚠️ DXF only (2D room polylines), DWG not supported
- **Issue:** DWG is binary format, not web-friendly. DXF is 2D only.

### GLB/GLTF
- **Revit Export:** ❌ Not native (requires third-party tools)
- **Viewer Support:** ✅ Full support
- **Issue:** Would need to convert from another format

## Recommended Solution: Try FBX Export

Since IFC is failing due to assembly conflicts, **FBX is the best alternative**:

1. ✅ Native Revit export (no third-party tools)
2. ✅ Your viewer already supports it
3. ✅ Might avoid .NET 8 assembly conflicts
4. ✅ 3D geometry with materials
5. ✅ Smaller files than IFC

### Quick Implementation

Replace IFC export with FBX export in `GLBExporter.cs`:

```csharp
// Instead of IFC:
// IFCExportOptions ifcOptions = new IFCExportOptions();
// doc.Export(tempDir, "model", ifcOptions);

// Use FBX:
FBXExportOptions fbxOptions = new FBXExportOptions();
// Configure FBX options
fbxOptions.ExportLinks = false; // Don't export linked models
fbxOptions.SharedCoordinates = false;
doc.Export(tempDir, "model", fbxOptions);
```

## Format Comparison

| Format | Revit Native? | Viewer Support? | BIM Metadata? | File Size | Assembly Conflicts? |
|--------|---------------|-----------------|----------------|-----------|---------------------|
| **IFC** | ✅ | ✅ | ✅✅✅ | Large | ❌ **Yes (failing)** |
| **FBX** | ✅ | ✅ | ✅✅ | Medium | ✅ **Likely OK** |
| **OBJ** | ⚠️? | ✅ | ✅ | Small | ✅ **Likely OK** |
| **STL** | ✅ | ✅ | ❌ | Large | ✅ **Likely OK** |
| **GLB** | ❌ | ✅ | ✅✅ | Small | N/A (not native) |

## Next Steps

1. **Try FBX Export** - Replace IFC with FBX in `GLBExporter.cs`
2. **Test if it works** - FBX might avoid the assembly conflicts
3. **If FBX works:** You can use it as a workaround until IFC conflicts are resolved
4. **If FBX also fails:** Then we know it's a broader Revit 2026 issue

## Current Status

- ✅ Viewer supports: GLB, GLTF, FBX, OBJ, IFC, STL, PLY, 3MF, Collada, 3DS, 3DM, DXF
- ✅ Revit exports natively: IFC, FBX, DWG, DXF, STL
- ❌ IFC export failing due to assembly conflicts
- ⭐ **Recommendation: Try FBX export instead**
