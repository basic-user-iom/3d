# Streets.gl Modules Installation

This document describes the streets.gl modules that have been installed in this project.

## Installed Modules

The following modules from the [streets.gl repository](https://github.com/StrandedKitty/streets-gl) have been copied and integrated:

### 1. **renderer** - WebGL2 Renderer
- **Location**: `src/lib/renderer/`
- **Description**: A simple WebGL2 renderer built from scratch
- **Status**: WebGPU support is planned but not yet implemented
- **Exports**: 
  - `WebGL2Renderer` - Main renderer class
  - `WebGL2RenderPass` - Render pass management
  - `WebGL2Mesh`, `WebGL2Material`, `WebGL2Program` - Core rendering primitives
  - `WebGL2Texture*` - Various texture types (2D, 2DArray, 3D, Cube)
  - Abstract renderer interfaces for future WebGPU support

### 2. **render-graph** - Render Graph Implementation
- **Location**: `src/lib/render-graph/`
- **Description**: A minimal render graph (frame graph) implementation for easier rendering pipeline management
- **Features**:
  - Automatically reorders render passes each frame based on dependencies
  - Culls out render passes that don't contribute to the final image
  - Basic memory management for framebuffers
- **Exports**: 
  - `RenderGraph` - Main render graph class
  - `Pass`, `Node`, `Resource` - Core graph components
  - `PhysicalResource`, `PhysicalResourcePool` - Resource management

### 3. **math** - Math Utilities
- **Location**: `src/lib/math/`
- **Description**: Math utilities for 3D graphics
- **Exports**:
  - `Vec2`, `Vec3` - Vector classes
  - `Mat3`, `Mat4` - Matrix classes
  - `AABB`, `AABB2D`, `AABB3D` - Bounding box classes
  - `MathUtils`, `Easing`, `SeededRandom` - Utility functions

### 4. **core** - Scene Graph
- **Location**: `src/lib/core/`
- **Description**: Includes scene graph and basic classes that describe a 3D scene
- **Dependencies**: Depends on `math` module
- **Exports**:
  - `Object3D` - Base class for 3D objects
  - `Camera`, `PerspectiveCamera`, `OrthographicCamera` - Camera classes
  - `Frustum`, `Plane` - Geometry utilities

### 5. **bmfont** - Bitmap Font Generator
- **Location**: `src/lib/bmfont/`
- **Description**: Bitmap text geometry generator optimized for large bitmaps and real-time use
- **Exports**:
  - `WordWrapper` - Text wrapping utilities
  - `LayoutGenerator` - Text layout generation

## Usage

### Importing Modules

All modules use the `~/` path alias configured in `tsconfig.json` and `vite.config.ts`:

```typescript
// Import from renderer
import { WebGL2Renderer } from '~/lib/renderer';

// Import from render-graph
import { RenderGraph, Pass } from '~/lib/render-graph';

// Import from math
import { Vec3, Mat4 } from '~/lib/math';

// Import from core
import { Camera, Object3D } from '~/lib/core';

// Import from bmfont
import { WordWrapper, LayoutGenerator } from '~/lib/bmfont';
```

### Path Alias Configuration

The `~/` alias is configured in:
- **tsconfig.json**: `"paths": { "~/*": ["*"] }` with `"baseUrl": "./src"`
- **vite.config.ts**: `alias: { '~': path.resolve(__dirname, './src') }`

## Module Dependencies

- **core** depends on **math**
- **renderer** is standalone (no dependencies on other modules)
- **render-graph** is standalone
- **bmfont** is standalone

## Additional Modules

The streets.gl repository also includes:
- **road-graph** - Road network graph processing (copied but not documented here)
- **tile-processing** - Vector tile processing and 3D geometry generation (copied but not documented here)

## Notes

- These modules have **no external dependencies** and can be used in other projects with minimal modifications
- The modules are written in TypeScript and use ES6+ features
- Some modules use path aliases (`~/`) which have been configured in this project
- The renderer module is designed for WebGL2, with WebGPU support planned for the future

## Source

These modules are from the [streets.gl repository](https://github.com/StrandedKitty/streets-gl) by StrandedKitty, licensed under their respective license.







