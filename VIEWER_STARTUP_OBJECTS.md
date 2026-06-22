# Objects That Load with 3D Viewer on Startup

This document lists all objects that are automatically created and added to the scene when the 3D viewer initializes.

## Core Scene Objects

### 1. **Scene** (`THREE.Scene`)
- Main 3D scene container
- Background color: `0x1a1a1a` (dark gray) or transparent if Streets GL overlay is enabled

### 2. **Camera** (`THREE.PerspectiveCamera`)
- Field of view: 50 degrees
- Near plane: 0.1
- Far plane: 10000
- Initial position: (5, 5, 5)
- Looks at origin (0, 0, 0)

### 3. **Renderer** (`THREE.WebGLRenderer`)
- WebGL renderer with antialiasing
- Shadow maps enabled (PCFSoftShadowMap)
- sRGB color space
- ACES Filmic tone mapping

### 4. **CSS3DRenderer**
- For rendering DOM elements in 3D space
- Used for YouTube iframes and other HTML content

### 5. **OrbitControls**
- Camera controls (orbit, pan, zoom)
- Damping enabled for smooth movement

### 6. **TransformControls**
- Gizmo for transforming objects (move, rotate, scale)
- Added to scene but hidden until object is selected

### 7. **Raycaster**
- For object selection via mouse clicks

---

## Starting Objects Group

All objects in this group are added to `startingObjectsGroup`:

### 8. **Ambient Light** (`THREE.AmbientLight`)
- Color: `0xffffff` (white)
- Intensity: 3.0
- Name: "Ambient Light"

### 9. **Directional Lights** (from store)
- Default "Sun Light" created if none exist:
  - Position: (5, 10, 5)
  - Intensity: 1.0
  - Color: `#ffffff`
  - Casts shadows: true
  - Is sun: true
- Additional directional lights from store state

### 10. **Light Helpers**
- `DirectionalLightHelper` for each directional light (except sun lights)
- Size: 5 units
- Color matches light color

### 11. **Light Gizmos**
- Visual gizmos for each light (for dragging/interaction)
- Created via `ensureLightGizmo()` function

---

## Native Objects Group

All objects in this group are added to `nativeObjectsGroup`:

### 12. **Grid Helper** (`THREE.GridHelper`)
- Size: 10000 x 10000 units
- Divisions: from store (`gridSize`)
- Colors: `0x444444` (primary), `0x222222` (secondary)
- Name: "Grid"
- Render order: 1

### 13. **Shadow Plane** (`THREE.Mesh`)
- Geometry: `PlaneGeometry(50000, 50000)` - very large plane
- Material: `MeshStandardMaterial`
  - Color: `0x333333`
  - Transparent: true
  - Opacity: 0.8
  - Side: DoubleSide
  - depthWrite: true (critical for shadows)
- Rotation: -90 degrees on X axis (horizontal)
- Position: (0, -0.001, 0) - slightly below grid
- Receives shadows: true
- Casts shadows: false
- Name: "Shadow Plane"
- Render order: 0
- Visibility: controlled by `showShadowPlane` store state

### 14. **Axes Helper** (`THREE.AxesHelper`)
- Size: 5 units
- Shows X (red), Y (green), Z (blue) axes
- Name: "Axes"

### 15. **CineShader Demo Screen** (`CineShaderDemoScreenGroup`)
- **NOT CREATED ON STARTUP** - Created on-demand when Shader Editor Panel is opened
- **Screen Mesh** (`CineShaderDemoScreen`)
  - Geometry: `PlaneGeometry(3, 1.8, 128, 128)` - high resolution for displacement
  - Material: `ShaderMaterial` with turbulence noise shader
  - Position: (0, 0, 0.095) relative to group
  - Rotation: 180 degrees on Y axis (faces camera)
  - Render order: 1000
  
- **Frame Group** (`CineShaderDemoFrame`)
  - 4 border pieces (top, bottom, left, right)
  - Material: `MeshStandardMaterial`
    - Color: `0x111319`
    - Metalness: 0.65
    - Roughness: 0.35
  - Frame thickness: 0.12
  - Frame depth: 0.15
  - Render order: 0
  
- **Parent Group** (`CineShaderDemoScreenGroup`)
  - Contains both screen and frame
  - Position: (0, 1.4, -4)
  - Rotation: 0 degrees
  - Name: "CineShaderDemoScreenGroup"
  - Created in App.tsx when `showShaderEditorPanel` becomes true
  - Visibility controlled by `showShaderEditorPanel` state

---

## Summary

**Total Objects Created on Startup:**

1. Scene (1)
2. Camera (1)
3. Renderer (1)
4. CSS3DRenderer (1)
5. OrbitControls (1)
6. TransformControls (1)
7. Raycaster (1)
8. Ambient Light (1)
9. Directional Lights (1+ from store)
10. Light Helpers (0+ depending on lights)
11. Light Gizmos (0+ depending on lights)
12. Grid Helper (1)
13. Shadow Plane (1)
14. Axes Helper (1)
15. CineShader Demo Screen Group (0 - created on-demand)

**Note:** The CineShader Demo Screen is **NOT created on startup**. It is created on-demand when the Shader Editor Panel is opened (when `showShaderEditorPanel` becomes true) in App.tsx.

---

## Visibility Control

- **Grid Helper**: Controlled by `showGrid` store state
- **Axes Helper**: Controlled by `showAxes` store state  
- **Shadow Plane**: Controlled by `showShadowPlane` store state
- **CineShader Demo Screen**: Controlled by `showShaderEditorPanel` store state (hidden by default)
- **Light Helpers**: Controlled by `showLightHelpers` store state
- **Light Gizmos**: Controlled by `showLightHelpers` store state

