# How Objects Are Added to Streets GL – Formats and Why They Might Not Show

This doc summarizes **online MapLibre/Mapbox documentation** on adding 3D objects to a map, then describes **our Streets GL** (internal iframe + bridge) format and a **checklist for objects not showing**.

---

## 1. What the “Online” Documentation Says (MapLibre / Mapbox GL JS)

From Perplexity search and official docs:

### How 3D objects are added

- **Custom style layer** with **Three.js** (or Babylon.js): you add a layer with `type: 'custom'`, `renderingMode: '3d'`, and implement `onAdd(map, gl)` and `render(gl, args)`.
- The map’s WebGL context (or a shared canvas) is used; you create a Three.js scene, camera, and renderer and render into that context.
- **Positioning** uses **Web Mercator**:
  - `maplibregl.MercatorCoordinate.fromLngLat([lon, lat], altitude)` gives Mercator coordinates.
  - A **model transform** (translate, rotate, scale) is applied so the model sits correctly on the map. Scale often uses `meterInMercatorCoordinateUnits()` because the model is in real-world meters.

**References:**  
MapLibre – [Add a 3D model using three.js](https://www.maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/), [Add a 3D model to globe using three.js](https://www.maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-to-globe-using-threejs/), [Custom style layer](https://www.maplibre.org/maplibre-gl-js/docs/examples/add-a-custom-style-layer/).

### Which formats are supported (MapLibre / Mapbox)

- **GLTF / GLB** are the standard formats: loaded with **GLTFLoader** in the custom layer, then added to the Three.js scene.
- There is **no built-in “import file” API** for other formats; you implement a custom layer and load whatever you want (e.g. OBJ, FBX) in that layer. In practice, examples and docs focus on **GLTF/GLB**.
- You do **not** send raw geometry buffers through a “map API”; you load a 3D file inside the custom layer and position it with Mercator + model transform.

So in the **public, online** world:
- **Formats:** GLTF/GLB are the documented, supported 3D model formats.
- **How:** Custom layer + Three.js (or similar) + MercatorCoordinate + model transform.
- **Import:** You load a URL (e.g. GLTF) inside the custom layer; there is no “upload and add object” API in the core map library.

---

## 2. Our Streets GL (Internal App) – How Objects Are Added

Our setup is **not** standard MapLibre. We have:

- **Main app** (e.g. localhost:3000): Three.js viewer, loads models (GLTF, OBJ, FBX, etc.).
- **Streets GL iframe** (e.g. localhost:8081): custom renderer (streets-gl-alt) with tiles, buildings, atmosphere.
- **Bridge:** `postMessage` between main app and iframe. Main app sends **object payloads**; iframe adds them via **ExternalObjectBridge**.

So “how objects are added” in **our** Streets GL is:

1. In the main app, we have a Three.js object (e.g. loaded model or cube).
2. We call `syncModelToStreetsGL(model, bridge)` (see `src/viewer/useViewer.ts` and `src/utils/streetsGLBridge.ts`).
3. That converts the model to a **StreetsGLObject** (id, type, position, rotation, scale, color, **geometry**, metadata) and sends it with `STREETS_GL_ADD_OBJECT`.
4. The iframe’s **ExternalObjectBridge** (`streets-gl-alt/src/app/ExternalObjectBridge.ts`) receives the message and calls `handleAddObject(payload)`.
5. If the payload has **geometry.positions** (and length &gt; 0), it creates an **ExternalRenderableObject** with that geometry and adds it to the scene; the renderer (GBufferPass, etc.) draws it. If there is no geometry, it creates a simple container (no mesh, so nothing visible).

### Format Streets GL (our app) recognizes

The iframe expects an **ExternalObject** (same shape as our **StreetsGLObject**):

| Field       | Type   | Required | Description |
|------------|--------|----------|-------------|
| `id`       | string | yes      | Unique ID. |
| `type`     | string | yes      | One of: `'box' \| 'sphere' \| 'marker' \| 'custom'`. We send `'custom'` for converted Three.js models. |
| `position` | `{ x, y, z }` | yes | **Streets GL world position:** Web Mercator–style: **x** = north–south (Mercator Y), **z** = east–west (Mercator X), **y** = height in meters. |
| `rotation` | `{ x, y, z }` | yes | Radians. |
| `scale`    | `{ x, y, z }` | yes | Scale factors. |
| `color`    | `{ r, g, b }` | no  | 0–1. Used for tint if no texture. |
| `visible`  | boolean | no   | Default true. |
| `metadata` | any    | no      | Passed through (e.g. name, userData). |
| `geometry` | object | **needed for visibility** | See below. |

**Geometry (required for the object to be drawn):**

- `geometry.positions`: **required** – array or Float32Array of numbers: `[x, y, z, x, y, z, ...]` (local/model space).
- `geometry.normals`: optional – same layout, recommended for lighting.
- `geometry.uvs`: optional – `[u, v, u, v, ...]`.
- `geometry.indices`: optional – triangle indices (Uint32Array or array).

If **geometry is missing or positions length is 0**, the bridge still adds an object to the scene, but it is a **non-renderable container** (no mesh), so **nothing is drawn**. So for something to “show”, you **must** send valid `geometry.positions`.

### What we effectively “import” into Streets GL

- We **do not** import files (GLTF, OBJ, etc.) **inside** the Streets GL iframe.
- We **import/load** models in the **main app** (Three.js): GLTF, GLB, OBJ, FBX, 3DS, etc. Whatever the main app can load and turn into a `THREE.Mesh` with geometry, we can **convert** and send to Streets GL.
- Conversion: we **extract** from the Three.js object:
  - positions (and optionally normals, uvs, indices) via `StreetsGLBridge.extractGeometryFromThreeJS()`.
  - position/rotation/scale and optional color.
- So **supported “import” for Streets GL** = any format the main app can load and from which we can read mesh geometry (positions, etc.). In code that’s currently **Mesh with geometry.attributes.position**; other attributes (normal, uv) are used if present.

---

## 3. Why Our Objects Might Not Be Showing – Checklist

Use this to debug when an object is synced but not visible in the Streets GL view.

1. **No geometry sent**
   - If `geometry` is missing or `geometry.positions.length === 0`, the iframe creates only a container (no mesh). **Fix:** Ensure the Three.js object has mesh(es) with `geometry.attributes.position` and that `extractGeometryFromThreeJS` is used and returns positions (see `streetsGLBridge.ts`).

2. **Wrong coordinate system**
   - Streets GL uses **Web Mercator–style** world position: **x** = north–south, **z** = east–west, **y** = height. If we send Three.js local/world coords (e.g. small numbers like 0–10) instead of Mercator, the object will be at the wrong place (e.g. near origin) or far from the camera. **Fix:** Use `latLonToStreetsGL(lat, lon, height)` or the stored `model.userData.streetsGLPosition` when building the payload in `syncModelToStreetsGL` (see `useViewer.ts` and `mapCoordinates.ts`).

3. **Scale too small or wrong**
   - If the model is in meters but the map is in Mercator units, a scale of 1 might make it invisibly small. Our bridge sends scale from Three.js; Streets GL applies it. **Check:** Log scale and position in both apps; ensure object is not scaled down to zero or tiny values.

4. **Mesh never created in Streets GL**
   - ExternalObjectBridge creates the mesh only when `object instanceof ExternalRenderableObject && this.renderSystem` and `renderer` exists, then calls `object.updateMesh(renderer)`. If the renderer isn’t ready or `createMesh` fails, the object stays without a mesh and is not drawn. **Check:** In the iframe console, look for `[ExternalObjectBridge] Mesh creation completed for: <id>` and `[ExternalRenderableObject] Mesh created successfully`; if you see “Renderer not available” or mesh creation errors, fix the Streets GL renderer/WebGL state (e.g. framebuffer/context issues).

5. **WebGL errors in the iframe**
   - Errors like `GL_INVALID_FRAMEBUFFER_OPERATION` or “too many errors” can prevent the whole pass from drawing, so external objects disappear even if they’re in the scene. **Fix:** Resolve WebGL/framebuffer issues in Streets GL (see `docs/guides/streets-gl-troubleshooting.md`).

6. **Frustum culling**
   - If the camera is far from the object or the bounding box is wrong, the object may be culled. **Check:** GBufferPass logs “Object … culled (not in frustum)” and distance; temporarily you can disable culling in GBufferPass for debugging.

7. **Bridge not ready**
   - If we send `STREETS_GL_ADD_OBJECT` before the iframe has sent `STREETS_GL_BRIDGE_READY`, the main app may queue the object; ensure the bridge ready callback runs and that we sync after “bridge is ready” (e.g. after overlay load and bridge init in `StreetsGLIframeOverlay.tsx`).

8. **postMessage serialization**
   - Float32Array/Uint32Array are serialized as plain arrays. The iframe converts them back to typed arrays. If something is lost in serialization (e.g. huge arrays), geometry could be empty or wrong. **Check:** Log `geometry.positions.length` and first few values in both main app and iframe.

---

## 4. Summary Table

| Topic | MapLibre/Mapbox (online) | Our Streets GL (iframe + bridge) |
|-------|---------------------------|-----------------------------------|
| **How objects are added** | Custom style layer + Three.js (or similar), render in map’s context | postMessage `STREETS_GL_ADD_OBJECT` → ExternalObjectBridge → add to scene |
| **3D model format** | GLTF/GLB (loaded via GLTFLoader in the layer) | **Raw geometry** only: positions (required), normals, uvs, indices (arrays/Float32Array/Uint32Array) |
| **Position** | MercatorCoordinate + model transform (translate, rotate, scale) | position `{x, y, z}` in Streets GL world: x = Mercator Y, z = Mercator X, y = height |
| **What can be “imported”** | Any format you load in the custom layer (docs show GLTF/GLB) | Whatever the main app loads (GLTF, OBJ, FBX, etc.) and converts to mesh geometry + transform |
| **Why objects might not show** | Wrong Mercator/transform, model not loaded, layer not rendered | No geometry, wrong coordinates/scale, mesh creation failure, WebGL errors, culling, bridge not ready |

---

## 5. Related Files

- **Main app:** `src/utils/streetsGLBridge.ts` (StreetsGLObject, fromThreeJSObject, extractGeometryFromThreeJS), `src/viewer/useViewer.ts` (syncModelToStreetsGL), `src/utils/mapCoordinates.ts` (latLonToStreetsGL, streetsGLToLatLon).
- **Streets GL iframe:** `streets-gl-alt/src/app/ExternalObjectBridge.ts` (handleAddObject), `streets-gl-alt/src/app/objects/ExternalRenderableObject.ts` (GeometryData, mesh creation), `streets-gl-alt/src/app/render/passes/GBufferPass.ts` (getExternalObjects, renderExternalObjects).
- **Troubleshooting:** `docs/guides/streets-gl-troubleshooting.md`.
