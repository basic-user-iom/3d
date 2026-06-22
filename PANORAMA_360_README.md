# 360° Panorama Viewer

A standalone 360° panorama viewer that supports KTX2 (FastHDR), HDR, EXR, and standard image formats.

## Features

- **Multiple Format Support**: KTX2 (FastHDR), HDR, EXR, JPG, PNG, WebP
- **Interactive Controls**: Drag to rotate, scroll to zoom
- **Drag & Drop**: Simply drag and drop image files onto the viewer
- **URL Loading**: Load images from URLs
- **Full 360° Rotation**: Smooth camera controls with damping

## How to Access

### Option 1: URL Parameter (Recommended)
Open the app with the `?viewer=360` query parameter:
```
http://localhost:3000/?viewer=360
```

### Option 2: Direct Navigation
The viewer is available as a standalone app component that can be accessed via the URL parameter.

## Usage

1. **Load an Image**:
   - Click "Load Image" button to browse for files
   - Or drag and drop an image file onto the viewer
   - Or click "Load from URL" to enter an image URL

2. **Navigate**:
   - **Drag** with mouse/touch to rotate the view
   - **Scroll** to zoom in/out
   - The view automatically centers on the sphere

3. **Supported Formats**:
   - **KTX2** - Compressed HDR format (FastHDR)
   - **HDR** - High Dynamic Range images
   - **EXR** - OpenEXR format
   - **JPG/PNG/WebP** - Standard image formats

## Technical Details

- Uses Three.js for 3D rendering
- Sphere geometry with equirectangular mapping
- OrbitControls for smooth camera movement
- Automatic format detection based on file extension
- KTX2 transcoder uses Needle's CDN for FastHDR compatibility

## KTX2 Format Notes

- KTX2 files can be either:
  - **PMREM (FastHDR)**: Pre-computed cubemaps using `CubeUVReflectionMapping`
  - **Equirectangular**: Standard 360° images using `EquirectangularReflectionMapping`
- The viewer automatically detects and handles both types
- For best results with FastHDR, use UASTC-encoded KTX2 files

## Development

The viewer component is located at:
- `src/components/Panorama360Viewer.tsx` - Main viewer component
- `src/Panorama360App.tsx` - Standalone app wrapper
- `src/main.tsx` - Entry point with URL parameter detection

To add the viewer to the main app menu, you can add a menu action in `src/config/toolbarMenu.ts`.









































