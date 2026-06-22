# Streets GL Full Rendering Integration

## Problem
User wants 3D objects to be rendered **directly inside Streets GL engine** with full rendering features (shadows, materials, etc.), without needing the iframe overlay option. Objects should be part of Streets GL's rendering pipeline.

## Solution

### 1. Material and Shadow Data Extraction
**File**: `src/utils/streetsGLBridge.ts`

Added functions to extract material and shadow information from Three.js objects:

- **`extractMaterialFromThreeJS()`**: Extracts color from Three.js materials
- **`extractShadowSettings()`**: Extracts `castShadow` and `receiveShadow` settings

### 2. Enhanced Object Conversion
**File**: `src/utils/streetsGLBridge.ts`

Updated `fromThreeJSObject()` to include:
- Material color in the `color` field
- Material and shadow settings in `metadata`:
  ```typescript
  metadata: {
    material: material,
    shadows: shadowSettings,
    castShadow: shadowSettings?.castShadow ?? true,
    receiveShadow: shadowSettings?.receiveShadow ?? true
  }
  ```

### 3. Automatic Sync to Streets GL
**Files**: 
- `src/components/PrimitivesPanel.tsx`
- `src/viewer/useViewer.ts`

Objects automatically sync to Streets GL when:
- **Ground layer is enabled** (`streetsGLGroundEnabled`)
- **OR iframe overlay is enabled** (`streetsGLIframeOverlay`)

The bridge uses `postMessage` to communicate with Streets GL, so it works even without a visible iframe.

### 4. Full Rendering in Streets GL
Streets GL's rendering system (`GBufferPass.renderExternalObjects()`) handles:
- **Geometry rendering** with positions, normals, UVs, and indices
- **Material application** using `ExternalObjectMaterialContainer`
- **Shadow rendering** (objects participate in Streets GL's shadow system)
- **Lighting** (PBR shader with normals for proper lighting)

## How It Works

1. **Object Creation**: When a primitive or model is created
2. **Material Extraction**: Material color and properties are extracted
3. **Shadow Settings**: `castShadow` and `receiveShadow` are extracted
4. **Geometry Extraction**: Full geometry (positions, normals, UVs, indices) is extracted
5. **Sync to Streets GL**: Object is sent to Streets GL via postMessage bridge
6. **Rendering**: Streets GL renders the object in its GBuffer pass with:
   - Full geometry
   - Material colors
   - Shadow casting/receiving
   - Proper lighting with normals

## Usage

1. **Enable Ground Layer**: Check "Enable Ground Layer (Direct Integration)" in OSM 3D panel
2. **Create Object**: Create a primitive or load a model
3. **Automatic Sync**: Object is automatically synced to Streets GL
4. **Full Rendering**: Object is rendered in Streets GL with:
   - Materials (colors)
   - Shadows (casting and receiving)
   - Proper lighting
   - All rendering features

## Technical Details

### Material Support
- Extracts color from Three.js materials
- Supports `MeshStandardMaterial`, `MeshBasicMaterial`, etc.
- Color is sent to Streets GL for rendering

### Shadow Support
- Extracts `castShadow` and `receiveShadow` from meshes
- Defaults to `true` for both if not specified
- Objects participate in Streets GL's shadow system

### Geometry Support
- Full geometry extraction (positions, normals, UVs, indices)
- Supports indexed and non-indexed geometry
- Handles complex scene graphs (traverses children)

### Bridge Communication
- Uses `postMessage` for cross-origin communication
- Works even if iframe is not visible
- Automatic retry and error handling

## Notes

- **No iframe needed**: The bridge works via postMessage, so objects can be rendered in Streets GL even without the iframe overlay
- **Full rendering**: Objects are rendered in Streets GL's rendering pipeline, not just composited
- **Shadows work**: Objects cast and receive shadows in Streets GL
- **Materials work**: Object colors are applied in Streets GL
- **Lighting works**: Normals are used for proper PBR lighting


