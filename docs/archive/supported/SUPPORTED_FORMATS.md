# Supported File Formats

## 3D Model Formats

The viewer supports the following 3D model formats:

| Format | Extensions | Description |
|--------|-----------|-------------|
| **glTF 2.0** | `.gltf`, `.gltf.json` | Text-based glTF format |
| **GLB** | `.glb` | Binary glTF format (recommended) |
| **FBX** | `.fbx` | Autodesk FBX format |
| **OBJ** | `.obj` | Wavefront OBJ format (with MTL material support) |
| **STL** | `.stl` | Stereolithography format |
| **PLY** | `.ply` | Polygon File Format |
| **3MF** | `.3mf` | 3D Manufacturing Format |
| **Collada** | `.dae` | Collada DAE format |
| **3DS** | `.3ds` | 3ds Max format (via Assimp loader) |
| **ZIP** | `.zip` | ZIP archives containing models (auto-extracted) |

## Texture & Image Formats

The viewer supports the following texture and image formats:

| Format | Extensions | Usage |
|--------|-----------|-------|
| **Standard Images** | `.jpg`, `.jpeg`, `.png`, `.tga`, `.bmp`, `.webp` | Texture maps (albedo, normal, roughness, etc.) |
| **HDR Environment** | `.hdr`, `.exr` | Environment maps for lighting and reflections |
| **Compressed** | `.ktx2`, `.basis` | Compressed texture formats for better performance |
| **Substance 3D** | `.sbar`, `.sbsar` | Substance 3D archives (extraction attempted, may not work) |
| **GLTF Binary** | `.bin` | Binary data for GLTF models |

## HDR/EXR Environment Maps

Both `.hdr` and `.exr` files can be loaded as environment maps:
- **HDR (.hdr)**: RGBE format, loaded via RGBELoader
- **EXR (.exr)**: OpenEXR format, loaded via EXRLoader
- Files over 1GB will be rejected to prevent browser crashes
- Files over 200MB will show a warning
- Very large files (16K+) may take several minutes to load and generate PMREM

## Loading Methods

### Models
- **File Picker**: Click "Open Files" button (supports multiple files)
- **Folder Picker**: Click "Folder" button (loads all models in folder)
- **Drag & Drop**: Drag files directly onto the viewer
- **URL**: Enter URL and click "Load URL" (requires CORS support)

### Textures
- Automatically loaded with models when in the same folder
- Can be manually replaced via Material Panel → Texture Tools → Replace Textures
- Can be uploaded individually via Material Panel texture slots

### HDR Environment Maps
- Load via Lighting Panel → HDR Environment → "Load HDR File"
- Supports multiple file selection (prioritizes EXR over HDR if both present)
- Can also load via URL

## Notes

- **Large Files**: Files over 500MB will show a warning dialog
- **FBX Files**: Very large FBX files (>1GB) may cause browser crashes. Convert to GLB/glTF for better performance.
- **ZIP Files**: Automatically extracted in-browser. All supported formats inside ZIP are supported.
- **Substance Files**: SBAR/SBSAR files may not work as they require proprietary Substance Engine. Export textures as PNG/JPG/KTX2 instead.

