# Why cube may not show / focus, and how objects are added in Streets GL

## Summary (from Perplexity + codebase)

- **Why the cube doesn’t show or you can’t focus on it**
  1. **City mode** – In this app, when **Render mode = City**, the main Three.js viewer is **not rendered** (`App.tsx`: `renderMode !== 'city'` then show `ViewerCanvas`). Cubes are added only to that main viewer scene. So in City mode the 3D canvas is hidden and cubes are invisible; focus has no visible effect.
  2. **Focus** – Clicking a cube in Cubes Viewer now both selects it and calls `frameObject(cube)` so the camera focuses on it. This only has an effect when the viewer is visible (Product or Hybrid mode).

- **How objects are added in “Streets GL” in this app**
  - Here, “Streets GL” is **not** Mapbox GL JS. It’s a **separate iframe** that shows the map. The main app talks to it via **postMessage** and a **StreetsGLBridge**.
  - Objects are added to the **iframe’s scene** by:
    1. Building a `StreetsGLObject` (id, type: `'box' | 'sphere' | 'marker' | 'custom'`, position, rotation, scale, color, optional geometry).
    2. Calling `StreetsGLBridge.addObject(object)`, which sends a message `STREETS_GL_ADD_OBJECT` to the iframe.
  - The **Primitives** panel adds to both:
    - the main Three.js scene (`viewer.scene`), and  
    - when Streets GL overlay is on and the bridge is ready, **syncs** the same object to Streets GL via `syncModelToStreetsGL(mesh, streetsGLBridge)` (which uses `StreetsGLBridge.fromThreeJSObject` and `addObject()`).
  - The **Cubes Viewer** only adds cubes to the main Three.js scene; it does **not** sync to Streets GL. So cubes never appear in the map iframe.

- **How 3D objects are added in Mapbox/MapLibre (for comparison)**
  - In Mapbox GL JS / MapLibre, 3D objects are usually added via a **custom layer** with `type: 'custom'` and `renderingMode: '3d'`, where you create your own Three.js scene and render into the map’s WebGL context. Objects live in that custom layer’s scene, not in a separate app canvas. This app uses a different pattern: a full-screen Three.js viewer that is hidden in City mode, and a separate iframe for the map with object sync over postMessage.

## What was changed in code

1. **CubesViewer**
   - Uses `renderMode` from the store.
   - Creates cubes only when `renderMode !== 'city'` (so we don’t create cubes when the viewer isn’t on screen).
   - When `renderMode === 'city'`, shows a notice: cubes are only visible in Product or Hybrid; to add objects on the map in City mode, use the Primitives panel.
   - Clicking a cube in the list calls `frameObject(cube)` so the camera focuses on it (when the viewer is visible).

2. **Styling**
   - Added `.cubes-viewer-city-notice` in `CubesViewer.css` for the city-mode message.

## How to see and focus on cubes

- Use **Product** or **Hybrid** render mode (toolbar).
- Open **Cubes Viewer** and click a cube in the list: it selects and focuses the camera on that cube.
- In **City** mode, use **Primitives** to add boxes/objects; those can be synced to the Streets GL map via the bridge.
