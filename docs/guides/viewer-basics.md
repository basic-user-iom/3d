# Viewer Basics & Setup

This guide collects everything you need to run the viewer locally, understand the
feature set, and troubleshoot common problems. It mirrors the original README
content so the repository root can stay lightweight.

## Feature Highlights

- Multiple format support: GLB, GLTF, FBX, OBJ, STL, PLY, 3MF, Collada (DAE), 3DS
- Drag & drop or URL-based model loading (with CORS support)
- Advanced tooling:
  - DRACO compression and KTX2/Basis texture decoding
  - Animation controls
  - Orbit / zoom / pan camera inputs
  - Grid, axes, stats overlays, and screenshot export

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Install & Run

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Optional Decoders

### DRACO

- Grab decoder files from
  https://github.com/google/draco/tree/master/javascript/example/draco_decoder_gltf
- Place `draco_decoder_gltf.js` and `draco_decoder_gltf.wasm` in
  `public/draco/gltf/`

### KTX2 / Basis

- Download from
  https://github.com/BinomialLLC/basis_universal/tree/master/webgl
- Place `basis_transcoder.js` and `basis_transcoder.wasm` in `public/basis/`

> The viewer works without these decoders, but compressed assets will fall back
> to slower code paths.

## Texture Support

- Standard: JPG, JPEG, PNG, TGA, BMP, WEBP
- HDR: HDR, EXR
- Compressed: KTX2, Basis Universal
- SBAR/SBSAR extraction is best-effort. If it fails, export textures from
  Substance Painter/Designer first.

## Usage

### Loading Models

- **File**: click “Open File” or drag & drop onto the canvas
- **URL**: paste a URL into the toolbar input (server must allow CORS)

### Controls

- Orbit: left mouse drag
- Zoom: scroll/pinch
- Pan: right drag or middle button

### Toolbar

- Fit, Reset, Screenshot, Grid, Axes, Stats toggles

### Animation Sidebar

Appears automatically when the model has animation clips.

## Supported Formats

| Format | Extension(s) | Notes |
| ------ | ------------- | ----- |
| glTF   | `.gltf`, `.gltf.json` | Full glTF 2.0 support |
| GLB    | `.glb` | Binary glTF |
| FBX    | `.fbx` | Autodesk FBX |
| OBJ    | `.obj` | MTL materials supported |
| STL    | `.stl` | Stereolithography |
| PLY    | `.ply` | Polygon File Format |
| 3MF    | `.3mf` | 3D Manufacturing Format |
| Collada| `.dae` | Collada DAE |
| 3DS    | `.3ds` | Via Assimp loader |

## CORS Considerations

When loading from a URL, the host must serve the appropriate headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
```

## Development Reference

### Project Structure

```
src/
├── components/       # React UI panels
├── viewer/           # Three.js viewer logic
│   ├── loaders/      # Format-specific loaders
│   └── ViewerCanvas.tsx
├── lib/              # Shared utilities
└── store/            # Zustand slices
```

### Build & Preview

```bash
npm run build   # outputs dist/
npm run preview # serves the production build locally
```

## Environment Maps

Add HDR/EXR assets to `public/env/` and the viewer will load them via
Three.js `RGBELoader` for realistic reflections.

## Troubleshooting

- **Model fails to load**: check the browser console and confirm the format is
  supported. For URL loads, inspect CORS headers.
- **Textures missing**: ensure texture files are co-located with the model (for
  local loads) and that the paths inside the asset are correct.
- **SBAR/SBSAR issues**: export textures from Substance apps first.
- **Performance**: disable grid/axes/stats, reduce model complexity, or prefer
  DRACO/KTX2 assets.


