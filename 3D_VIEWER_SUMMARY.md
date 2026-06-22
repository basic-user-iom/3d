# 3D Viewer - Complete Project Summary

## Overview

A modern, feature-rich 3D model viewer built with React, Vite, and Three.js. This is a comprehensive web-based application for viewing, inspecting, and rendering 3D models with advanced lighting, post-processing, and real-time effects.

**Project Name**: 3D Test Software  
**Version**: 3.7 (Latest)  
**Package Version**: 2.2.0 (package.json - may be outdated)  
**Tech Stack**: React 19, Vite 7, Three.js 0.181, TypeScript, Zustand

---

## Core Features

### Model Loading & Formats

**Supported 3D Formats:**
- GLTF 2.0 (`.gltf`, `.gltf.json`)
- GLB (`.glb`) - Binary glTF (recommended)
- FBX (`.fbx`) - Autodesk FBX
- OBJ (`.obj`) - Wavefront OBJ with MTL material support
- STL (`.stl`) - Stereolithography
- PLY (`.ply`) - Polygon File Format
- 3MF (`.3mf`) - 3D Manufacturing Format
- Collada (`.dae`) - DAE format
- 3DS (`.3ds`) - 3ds Max format
- ZIP (`.zip`) - Archives containing models (auto-extracted)

**Loading Methods:**
- File picker (single or multiple files)
- Folder picker (loads all models in folder)
- Drag & drop directly onto viewer
- URL loading (with CORS support)
- Automatic format detection by file extension or magic bytes

**Texture & Image Formats:**
- Standard: JPG, JPEG, PNG, TGA, BMP, WEBP
- HDR: HDR (RGBE), EXR (OpenEXR) - for environment maps
- Compressed: KTX2, Basis Universal
- Substance 3D: SBAR, SBSAR (extraction attempted)

**Optional Decoders:**
- DRACO compression support (for optimized geometry)
- KTX2/Basis texture decoding (for compressed textures)

---

## Advanced Rendering Systems

### 1. GPU Path Tracer
- **Library**: `three-gpu-pathtracer` (v0.0.23)
- Progressive rendering with real-time accumulation
- Configurable bounces, samples, and resolution scale
- HDR environment map integration
- Ground projection support for realistic shadows
- Download rendered images as PNG
- Pause/Resume functionality for comparison
- Tile-based rendering (4×4 tiles by default)

### 2. Post-Processing Pipeline
- **Bloom** - Glowing highlights and emissive materials
- **Ambient Occlusion (AO)** - Screen-space ambient occlusion
- **Screen-Space Reflections (SSR)** - Real-time reflections
- **Subsurface Scattering (SSS)** - Realistic skin/material rendering
- **Tone Mapping** - Multiple algorithms (ACES, Reinhard, Uncharted2, etc.)
- **Color Grading** - LUT-based color correction
- **FXAA** - Fast approximate anti-aliasing
- **SMAA** - Enhanced morphological anti-aliasing

### 3. Shadow Systems
- **Cascaded Shadow Maps (CSM)** - High-quality directional light shadows
- **ShadowManager** - Unified shadow system coordinator
- **Shadow Opacity** - Adjustable shadow darkness
- **Shadow Plane** - Ground shadow matte with tinting
- **Shadow Quality Presets** - Low/Medium/High/Ultra
- **Shadow Diagnostics** - Built-in debugging tools
- **Multiple Shadow Systems** - Coordinated shadow rendering

---

## Lighting & Environment

### Lighting System
- **Ambient Light** - Global fill light with adjustable intensity
- **Directional Lights** - Multiple sun lights with individual controls
- **Light Gizmos** - Visual helpers for light positioning
- **Sun/Moon System** - Automatic sun positioning based on time of day
- **Rect Area Lights** - Area light support with helpers
- **Light Intensity & Color** - Per-light customization
- **Shadow Toggles** - Enable/disable shadows per light

### HDR System
- **HDR Environment Maps** - Load `.hdr` and `.exr` files
- **PMREM Generation** - Pre-filtered environment maps for IBL
- **Ground Projection** - Dome geometry that receives real shadows
- **HDR Intensity & Rotation** - Adjustable exposure and orientation
- **Background Visibility Toggle** - Show/hide HDR background
- **Automatic Material Enhancement** - PBR material conversion for path tracer

### Dynamic Sky System
- **Atmospheric Scattering** - Physically-based sky rendering
- **Sun/Moon Positioning** - Time-of-day simulation
- **Multiple Scattering** - LUT-based multiple scattering calculations
- **Vertical Color Gradients** - Warm horizon to cool zenith
- **Altitude-Dependent Sampling** - Natural color variation
- **Frame-Based Updates** - Smooth sky transitions

### Atmospheric Effects
- **Fog** - Distance-based fog
- **Atmospheric Perspective** - Haze and depth cues
- **Dynamic Weather** - Rain, snow particle systems

---

## Interactive Features

### Camera Controls
- **OrbitControls** - Twinmotion-style navigation
- **Transform Controls** - Translate, rotate, scale gizmos
- **WASD Navigation** - Keyboard camera movement
- **Camera Views Panel** - Save/load camera positions
- **Quick Camera Menu** - Fast camera switching
- **Frame Object** - Auto-fit model to view
- **Reset Camera** - Return to default position

### Selection & Manipulation
- **Object Selection** - Click to select objects
- **Marquee Selection** - Drag to select multiple objects
- **Pivot Points** - Custom pivot positioning
- **Transform Gizmos** - Visual manipulation tools
- **Object Hierarchy** - Scene tree navigation

### UI Panels
- **Material Panel** - Material properties editor
- **Lighting Panel** - Light management and shadows
- **Transform Panel** - Object transformation controls
- **Texture Management Panel** - Texture optimization and replacement
- **Camera Views Panel** - Camera state management
- **Optimization Panel** - Performance tuning
- **Objects Panel** - Scene hierarchy browser
- **Rendering Quality Panel** - Quality presets
- **Weather Panel** - Particle and weather effects
- **Rendering Effects Panel** - Post-processing toggles
- **Path Tracer Panel** - Path tracer controls
- **Shader Editor Panel** - GLSL shader editing
- **Hotspots Panel** - Interactive hotspot management
- **Places Panel** - Location bookmarks
- **OSM Ground Panel** - OpenStreetMap terrain integration
- **Edge Enhancement Panel** - Edge detection and highlighting
- **Smoothing Panel** - Geometry smoothing tools
- **Primitives Panel** - Add basic shapes
- **Polygon Drawing Panel** - Draw custom polygons
- **Web Export Panel** - Export scenes for web
- **AI Enhancement Panel** - AI-powered material enhancement
- **Bug Tracker Panel** - Issue tracking system
- **Todo Panel** - Task management

---

## Advanced Features

### Streets GL Integration
- **Iframe Overlay** - Streets GL map integration
- **Model Synchronization** - Sync 3D models to map coordinates
- **Bridge System** - Communication between viewer and Streets GL
- **Coordinate Conversion** - Web Mercator to Three.js coordinates
- **Terrain Alignment** - Automatic ground positioning

### 360° Panorama Viewer
- **Standalone Mode** - Access via `?viewer=360` URL parameter
- **Format Support** - KTX2 (FastHDR), HDR, EXR, JPG, PNG, WebP
- **Drag & Drop** - Load images directly
- **URL Loading** - Load from web URLs
- **Interactive Controls** - Smooth rotation and zoom
- **Equirectangular Mapping** - Full 360° sphere rendering

### Material System
- **PBR Materials** - Physically-based rendering
- **Material Enhancement** - Automatic material improvements
- **Texture Optimization** - Automatic texture compression
- **Material Swatches** - Material library
- **Transparent Material Handling** - Advanced transparency support
- **Material Update Queue** - Batched material updates
- **Shadow Material State** - Shadow-aware material management

### Geometry Tools
- **Geometry Repair** - Degenerate triangle removal
- **Mesh Optimization** - MeshOptimizer integration
- **Simplification** - Automatic decimation
- **Non-Manifold Detection** - Geometry validation
- **Edge Splitting** - Edge enhancement
- **Smoothing** - Geometry smoothing algorithms

### Water System
- **Water Rendering** - Realistic water surfaces
- **Standalone Water** - Alternative water implementation
- **Reflections** - Water reflections
- **Caustics** - Light caustics on water (optional)

### Particle Systems
- **Rain Effects** - Weather particle effects
- **Snow Effects** - Snow particle system
- **Custom Particles** - Extensible particle system

---

## Performance & Optimization

### Performance Features
- **Resource Tracker** - Memory management and cleanup
- **Unified Animation Loop** - Centralized rendering loop
- **Material Update Batching** - Optimized material updates
- **Texture Filtering** - Automatic texture quality optimization
- **Pixel Ratio Control** - Adjustable render resolution
- **High-Performance GPU Mode** - GPU optimization flags
- **Logarithmic Depth Buffer** - Improved depth precision
- **Stats Overlay** - FPS and performance monitoring
- **Memory Monitor** - Memory usage tracking

### Quality Settings
- **Rendering Quality Presets** - Low/Medium/High/Ultra
- **Shadow Quality** - Adjustable shadow map resolution
- **Post-Processing Quality** - Effect quality levels
- **Texture Quality** - Anisotropic filtering levels

---

## Developer Features

### Development Tools
- **Shader Editor** - Live GLSL shader editing
- **Debug Overlays** - Grid, axes, stats
- **Console Diagnostics** - Built-in debugging functions
- **Shadow Map Viewer** - Visualize shadow maps
- **Texture Diagnostics** - Texture analysis tools
- **Bug Tracker** - Integrated issue tracking
- **Test Runner** - Automated test execution

### Keyboard Shortcuts
- **WASD** - Camera movement
- **Transform Modes** - Quick transform switching
- **Panel Toggles** - Fast panel access
- **View Controls** - Camera and view shortcuts

---

## Architecture

### Core Components
- **ViewerCanvas.tsx** (~11,451 lines) - Main viewer component
- **useViewer.ts** (~2,091 lines) - Viewer hook for model loading
- **App.tsx** (~1,884 lines) - Main application component
- **useAppStore.ts** (~2,303 lines) - Zustand state management

### System Architecture
- **React Hooks-Based** - Modern React patterns
- **Modular Systems** - Separated effect systems
- **Resource Management** - Automatic cleanup and disposal
- **State Management** - Zustand for global state
- **Type Safety** - Full TypeScript implementation

### Key Systems
1. **Rendering Systems**: WebGLRenderer, CSS3DRenderer, PostProcessingSystem, PathTracer
2. **Lighting Systems**: AmbientLight, DirectionalLights, Light Gizmos, ShadowManager, CSM
3. **Environment Systems**: HDRSystem, EnvironmentManager, DynamicSky, SunMoonSystem
4. **Effects Systems**: ParticleSystem, WaterSystem, AtmosphericPerspective, PostProcessing
5. **Utility Systems**: ResourceTracker, UnifiedAnimationLoop, MaterialUpdateQueue

---

## Development Status

### Current State (Version 3.7)
- **Stable Core** - Main viewer functionality complete
- **Path Tracer** - Stable with HDR support, camera lock, UI controls, adaptive restart logic
- **Shadow System** - Unified shadow system with CSM
- **Post-Processing** - Full pipeline with multiple effects
- **Material System** - Advanced PBR material handling
- **HDR System** - Complete with ground projection
- **Atmosphere** - Dynamic sky with atmospheric scattering
- **Hook-Based Architecture** - Refactored to modular React hooks

### Version 3.7 Improvements
Based on documentation analysis, v3.7 includes:

**Path Tracer Enhancements:**
- Adaptive restart logic (pauses during camera/object interactions)
- GPU/CPU telemetry collection and metrics display
- Raster fallback capture with shader-driven crossfade
- Hardened GPU path tracer lifecycle
- Unified preview overlay rendering
- GPU preview consumes original equirectangular HDR texture

**Architecture Improvements:**
- Hook-based viewer refactoring (8 focused React hooks)
- Code consolidation (removed ~50 lines of duplicate code)
- Shadow system consolidation (unified ShadowManager)
- Performance optimizations (memoization, frame limiting)

**Bug Fixes:**
- Path tracer sample counting bug fixed
- Premature exit bug resolved
- Reset functionality improved
- Gray screen bug fixed
- Better error handling and diagnostics

### Recent Improvements (v3.0 - v3.7)
- Path tracer stability fixes (faces, camera lock, UI, ground, tiles)
- Shadow system consolidation and optimization
- Material enhancement and texture optimization
- HDR system with ground projection
- Atmospheric scattering implementation
- Post-processing pipeline completion
- Memory management improvements
- Hook-based architecture refactoring

### Known Areas for Optimization
- Path tracer performance (lower resource use, faster rendering)
- HDR behavior verification with path tracer
- Further rendering optimizations

### Note on Changelog
No formal CHANGELOG.md file found. Version information tracked via:
- `VERSION_INFO.json` - Current version metadata
- Backup scripts (`backup-v3.7.ps1`) - Version backup tracking
- Various feature documentation files in project root

---

## Technical Specifications

### Dependencies
- **three**: ^0.181.1 - Core 3D library
- **three-gpu-pathtracer**: ^0.0.23 - GPU path tracing
- **three-mesh-bvh**: ^0.9.2 - Bounding volume hierarchy
- **three-csm**: ^4.2.1 - Cascaded shadow maps
- **three-stdlib**: ^2.36.1 - Three.js standard library
- **3d-tiles-renderer**: ^0.4.18 - 3D Tiles support
- **gltf-pipeline**: ^4.3.0 - GLTF processing
- **meshoptimizer**: ^0.25.0 - Mesh optimization
- **ktx2-encoder**: ^0.5.1 - KTX2 texture encoding

### Build & Run
```bash
npm install
npm run dev          # Starts viewer + Streets GL server
npm run dev:full     # Starts bug server + Streets GL + viewer
npm run build        # Production build
npm run preview      # Preview production build
```

### Server Configuration
- **Viewer**: http://localhost:3000
- **Bug Server**: http://localhost:3001
- **Streets GL**: http://localhost:8081

---

## Documentation

### Guides Available
- `docs/guides/viewer-basics.md` - Setup & usage
- `docs/guides/selection-and-gizmo.md` - Selection tools
- `docs/guides/streets-gl-integration.md` - Streets GL workflow
- `docs/guides/path-tracer.md` - Path tracer controls
- `docs/guides/lighting-hdr.md` - Lighting & HDR
- `docs/guides/shader-editor.md` - GLSL editing
- `docs/guides/dev-workflow.md` - Development workflow

### Archive
- Historical investigations and deep-dive notes in `docs/archive/`

---

## Use Cases

1. **3D Model Inspection** - View and analyze 3D models
2. **Architectural Visualization** - Render architectural scenes
3. **Product Visualization** - Showcase products with realistic lighting
4. **Educational** - Learn 3D graphics and rendering
5. **Prototyping** - Test 3D assets before production
6. **Presentation** - Interactive 3D presentations
7. **Web Integration** - Embed 3D viewers in web applications

---

## Summary

This is a production-ready, feature-complete 3D viewer with advanced rendering capabilities including GPU path tracing, comprehensive post-processing, dynamic lighting, HDR environments, and extensive material/geometry tools. The application is built with modern web technologies and provides both user-friendly interfaces and developer tools for advanced use cases.

**Key Strengths:**
- Extensive format support
- Advanced rendering (path tracing, post-processing)
- Comprehensive lighting and shadow systems
- Professional-grade material handling
- Developer-friendly architecture
- Active development and optimization

**Ideal For:**
- 3D artists and designers
- Web developers building 3D applications
- Architectural visualization
- Product showcases
- Educational purposes
- Professional 3D workflows

