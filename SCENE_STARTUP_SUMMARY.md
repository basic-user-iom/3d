# What Loads into the Scene When 3D Viewer Opens

## Core Infrastructure (Always Created)

1. **Scene** (`THREE.Scene`)
   - Main 3D container
   - Background: `0x1a1a1a` (dark gray) or transparent if Streets GL overlay enabled

2. **Camera** (`THREE.PerspectiveCamera`)
   - FOV: 50°
   - Near: 0.1, Far: 10000
   - Initial position: (5, 5, 5)
   - Looks at: (0, 0, 0)

3. **Renderer** (`THREE.WebGLRenderer`)
   - WebGL with antialiasing
   - Shadow maps: PCFSoftShadowMap
   - Color space: sRGB
   - Tone mapping: ACES Filmic

4. **CSS3DRenderer**
   - For DOM elements in 3D space (YouTube iframes, etc.)

5. **OrbitControls**
   - Camera controls (orbit, pan, zoom)
   - Damping enabled

6. **TransformControls**
   - Transform gizmo (hidden until object selected)

7. **Raycaster**
   - Object selection via mouse clicks

---

## Starting Objects Group (`startingObjectsGroup`)

All lights are grouped here:

8. **Ambient Light** (`THREE.AmbientLight`)
   - Color: `0xffffff` (white)
   - Intensity: 0.6
   - Name: "Ambient Light"

9. **Directional Lights** (from store)
   - Default "Sun Light" created if none exist:
     - Position: (5, 10, 5)
     - Intensity: 1.0
     - Color: `#ffffff`
     - Casts shadows: ✅ Yes
     - Is sun: ✅ Yes
   - Additional directional lights from store state

10. **Light Helpers** (`DirectionalLightHelper`)
    - One per directional light (except sun lights)
    - Size: 5 units
    - Color matches light color

11. **Light Gizmos**
    - Visual gizmos for dragging/interacting with lights
    - Created via `ensureLightGizmo()` function

---

## Native Objects Group (`nativeObjectsGroup`)

All helper/visual objects are grouped here:

12. **Grid Helper** (`THREE.GridHelper`)
    - Size: 10000 × 10000 units
    - Divisions: from store (`gridSize` default)
    - Colors: `0x444444` (primary), `0x222222` (secondary)
    - Name: "Grid"
    - Render order: 1
    - Visibility: controlled by `showGrid` store state

13. **Shadow Plane** (`THREE.Mesh`)
    - Geometry: `PlaneGeometry(50000, 50000)` - very large
    - Material: `MeshStandardMaterial`
      - Color: `0x333333`
      - Transparent: true
      - Opacity: 0.8
      - Side: DoubleSide
      - depthWrite: true (critical for shadows)
    - Rotation: -90° on X axis (horizontal)
    - Position: (0, -0.001, 0) - slightly below grid
    - Receives shadows: ✅ Yes
    - Casts shadows: ❌ No
    - Name: "Shadow Plane"
    - Render order: 0
    - Visibility: controlled by `showShadowPlane` store state

14. **Axes Helper** (`THREE.AxesHelper`)
    - Size: 5 units
    - Shows X (red), Y (green), Z (blue) axes
    - Name: "Axes"
    - Visibility: controlled by `showAxes` store state

15. **CineShader Demo Screen** (`CineShaderDemoScreenGroup`)
    - **NOT created on startup**
    - Created on-demand when Shader Editor Panel opens
    - Contains screen mesh and frame
    - Position: (0, 1.4, -4)

---

## Auto-Loaded Models (Optional)

16. **Pagani Utopia 2023 Car Model** (if file exists)
    - Path: `files-upload/Pagani-glb/Pagani Utopia 2023.gltf`
    - Auto-loads 1 second after viewer initialization
    - Only loads if file exists in public folder
    - Marked with `isAutoLoaded: true` flag
    - Automatically positioned and framed in viewport

---

## Environment

17. **Default Environment Texture**
    - Created by `EnvironmentManager`
    - Applied to scene.environment and scene.background
    - Used for reflections and lighting

---

## Summary

**Always Created:**
- 1 Scene
- 1 Camera
- 1 WebGL Renderer
- 1 CSS3D Renderer
- 1 OrbitControls
- 1 TransformControls
- 1 Raycaster
- 1 Ambient Light
- 1+ Directional Lights (default "Sun Light" + any from store)
- 0+ Light Helpers
- 0+ Light Gizmos
- 1 Grid Helper
- 1 Shadow Plane
- 1 Axes Helper

**Conditionally Created:**
- CineShader Demo Screen (only when Shader Editor Panel opens)
- Pagani Car Model (only if file exists at `files-upload/Pagani-glb/Pagani Utopia 2023.gltf`)

**Total Minimum Objects: 14**
**Total with Default Lights: 16+**

---

## Visibility States

- **Grid**: Visible by default (controlled by `showGrid`)
- **Axes**: Visible by default (controlled by `showAxes`)
- **Shadow Plane**: Hidden by default (controlled by `showShadowPlane`)
- **Light Helpers**: Hidden by default (controlled by `showLightHelpers`)
- **CineShader Screen**: Hidden by default (only created when panel opens)

---

## Notes

- All objects in `startingObjectsGroup` and `nativeObjectsGroup` are marked with `userData` flags
- These flags are used to filter objects in the Objects Panel
- The car model (if auto-loaded) is marked with `isAutoLoaded: true` to distinguish it from user-imported models


