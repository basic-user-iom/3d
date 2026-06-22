# 3D Viewer – Complete Feature List (for Webpage)

**Product name:** 3D Viewer  
**Version:** 3.7.0  
**Tagline:** Modern, client-side 3D model viewer — load, inspect, and present models in the browser or desktop.

---

## Overview

- **Web & desktop:** Runs in the browser (Vite + React) and as an Electron app.
- **Tech stack:** React 19, Vite 7, Three.js, Zustand.
- **Core use cases:** Load 3D models, inspect with orbit controls, adjust lighting and materials, create camera views and hotspots, export for web or images/video/panorama.

---

## 1. Files & Loading

| Feature | Description |
|--------|-------------|
| **Open files** | Load one or more 3D files via file picker. |
| **Open folder** | Load a folder (model + textures); paths resolved for relative assets. |
| **Load from URL** | Load a model from a URL (with timeout and basic error handling). |
| **Save project** | Save current scene, camera views, hotspots, and settings to a project file. |
| **Load project** | Restore a saved project (scene, views, hotspots, options). |
| **Drag & drop** | Drop model files or folders onto the viewer to load. |

### Supported formats

- **glTF / GLB** – Primary web format; full PBR support.
- **FBX** – With texture resolution and material handling.
- **OBJ** – With MTL and texture loading.
- **STL** – ASCII and binary.
- **PLY** – Point clouds and meshes.
- **3MF** – 3D Manufacturing.
- **Collada (DAE)** – With textures.
- **3DS** – Legacy 3D Studio.
- **3DM** – Rhino.
- **DXF** – Polylines (e.g. Revit room boundaries).
- **IFC** – Industry Foundation Classes (BIM).
- **ZIP** – Archives containing supported formats (e.g. GLB + textures).

*Note: DWG is not supported; DXF export from Revit is recommended.*

---

## 2. Modeling & Scene

| Feature | Description |
|--------|-------------|
| **Objects panel** | Scene hierarchy (tree/table), visibility, selection, rename, frame in view, sort by name/size/triangles. |
| **Transform panel** | Position, rotation, scale for selected object; move/rotate/scale modes; pivot mode; bounding box toggle. |
| **Rooms panel** | List and color rooms/spaces from DXF/IFC; frame room in view; room metadata (name, number). |
| **Primitives panel** | Add box, sphere, plane, cone, cylinder, torus, tetrahedron, octahedron; optional texture; scale; sync to Streets GL. |
| **Polygon drawing** | Draw polygons on surfaces; snap to surface; spline mode; control-point editing; line/fill color, opacity, thickness, style (solid/dashed/dotted). |
| **Cubes viewer** | Add multiple cubes with adjustable edge softening (bevel); apply softening to all. |
| **Optimization panel** | Mesh simplification (target % triangles) via Meshopt; reduce polygon count for performance. |
| **Material panel** | Per-material: color, metalness, roughness, emissive; texture slots (map, normal, roughness, etc.); UV repeat/offset/rotation; convert Basic → Standard; transparency; random UV; internal shadow enhancement. |
| **Texture management** | List textures from scene; group duplicates; merge textures; extract from model; assign/replace; load with model or from folder. |
| **Edge enhancement** | Sub-object selection; apply edge smoothing (Autosoft Edge–style) to selected parts. |
| **Smoothing panel** | Smooth entire model or selected meshes; intensity; mesh selection mode; wireframe preview. |
| **OSM 3D ground** | Optional OpenStreetMap 3D ground layer (Streets GL) with lat/lon/zoom; toggle overlay and interactivity. |

---

## 3. Lighting & Environment

| Feature | Description |
|--------|-------------|
| **Lighting panel** | Ambient intensity; directional/sun lights (multiple); shadows on/off, intensity, bias, map size; shadow plane (ground); HDR environment. |
| **HDR environment** | Load HDR for reflections and background; intensity; ground projection for correct shadows. |
| **Fast HDR converter** | Convert HDR for use in the viewer. |
| **Shadow options** | Cascaded shadow maps (CSM), radius, adaptive settings; shadow plane transparent/opaque; shadow map viewer (debug). |
| **Weather / time** | Time of day; north offset; optional sync with Streets GL sun direction; standalone weather when map is off. |

---

## 4. Rendering & Quality

| Feature | Description |
|--------|-------------|
| **Rendering quality panel** | Pixel ratio, max pixel ratio; anisotropy; logarithmic depth; high-performance GPU; vsync; max FPS; upscaling. |
| **Post-processing** | Bloom (strength, radius, threshold); LUT (color grading); anamorphic; SSS (subsurface scattering); SSR (screen-space reflections); tone mapping; color grading (exposure, contrast, highlights, shadows, hue, saturation, vibrance, gamma). |
| **Rendering effects** | Fog, fire, particles, atmospheric, lens flare, bloom, motion blur (UI toggles; some wired to post-processing). |
| **Path tracer** | GPU/CPU path tracing; bounces, samples, resolution presets (1080p–8K); denoise; auto-stop at max samples; HDR/ground projection support. |
| **Dynamic sky** | Procedural sky with sun/moon; LUT-based atmosphere. |
| **Atmosphere** | Atmospheric perspective and LUT systems for sky and haze. |

---

## 5. Presentation & Camera

| Feature | Description |
|--------|-------------|
| **Camera views panel** | Save/load camera positions; name and thumbnail; static view, video, or panorama type. |
| **Camera actions** | Fit view to selection or scene; reset scene; quick camera menu. |
| **View export (Camera panel)** | Export current view as image (720p–4K); export as video; export 360° panorama (2K–8K equirectangular). |
| **Scene snapshot** | Export/import scene snapshot (camera, state); load from file. |
| **Screenshot** | Capture current view as image. |
| **Fullscreen** | Toggle fullscreen. |
| **Shortcuts overlay** | On-screen list of keyboard shortcuts. |
| **Stats** | FPS and performance stats toggle. |

---

## 6. Hotspots & Web Export

| Feature | Description |
|--------|-------------|
| **Hotspots panel** | Add 3D hotspots in the scene; connect line to object or custom endpoint; icon (emoji, symbol, custom image). |
| **Hotspot content** | Text, image, YouTube, video, HTML; panel open/closed state; formatting (font, size, color, alignment). |
| **Web export panel** | Export standalone web presentation: include model, HDR, camera views, animations; presentation mode with transitions; auto-play, loop; quality; texture compression; export as ZIP or separate files. |
| **Export options** | Include model, HDR, camera views, animations; transition duration; quality (low–ultra); shadow quality; compress textures; background color. |
| **Preview** | Preview web export in new tab before download. |

---

## 7. Integration & External

| Feature | Description |
|--------|-------------|
| **Revit connection** | Connect to Revit sync server (HTTP + WebSocket); list sessions; load model from Revit; live updates when Revit exports. |
| **Streets GL** | Optional map overlay (Streets GL); 3D buildings; sun direction sync; lat/lon/zoom for ground; toggle UI and interactivity. |
| **Places panel** | Experimental places/locations (under consideration). |

---

## 8. Developer & Experimental

| Feature | Description |
|--------|-------------|
| **Shader editor panel** | Custom GLSL-style shader demo; parameters (speed, intensity, color, rotation, glow, vignette); cine-style stage. |
| **AI enhancement panel** | AI image enhancement (e.g. Replicate): upscale, detail, texture, edges, or full; optional API key. |
| **HDR test panel** | HDR and tonemap testing. |
| **HDR shadow demo** | HDR-based shadow demo. |
| **Shadow system test** | Shadow system diagnostics and tests. |
| **Todo panel** | In-app TODO list; task status (pending, in progress, completed). |
| **Bug tracker panel** | Bug reporting / tracking (if enabled). |
| **Menu layout** | Toolbar sections: Files, Modeling, Rendering, Presentation, Under consideration; drag to reorder; save/reset menu layout. |

---

## 9. Viewer & UX

| Feature | Description |
|--------|-------------|
| **Orbit controls** | Rotate, pan, zoom around scene or selection. |
| **Selection** | Click to select object; marquee selection (if implemented). |
| **Transform gizmo** | On-screen move/rotate/scale handles for selected object. |
| **Keyboard shortcuts** | Fit view, reset, undo/redo, camera views, etc. (see Shortcuts overlay). |
| **Floating panels** | Draggable, stackable panels; minimize; anchor left/right. |
| **Missing texture dialog** | Detect and list missing textures; options to fix or ignore. |
| **Toast notifications** | Success/error messages for load, export, etc. |
| **Project persistence** | Save/load project with scene, views, hotspots, and key settings. |

---

## 10. Export & Output Summary

| Output | Description |
|--------|-------------|
| **Image** | Screenshot or camera-view export (720p, 1080p, 1440p, 4K). |
| **Video** | Export camera view as video (resolution options). |
| **360° panorama** | Equirectangular panorama (2K–8K) from current camera. |
| **Web export** | ZIP (or files) with HTML + model + HDR + config + thumbnails for standalone web presentation. |
| **Scene snapshot** | Export/import JSON snapshot (camera + state). |
| **Project file** | Save/load full project (scene, views, hotspots, settings). |

---

## 11. One-Liner Feature List (for bullets or meta)

- Open files, folder, or URL • Save/load project • Drag & drop
- Formats: GLB, GLTF, FBX, OBJ, STL, PLY, 3MF, DAE, 3DS, 3DM, DXF, IFC, ZIP
- Scene hierarchy, transform, rooms, primitives, polygon drawing, cubes
- Materials & textures, texture merge, optimization (mesh simplification)
- Edge enhancement, smoothing, OSM 3D ground
- Lighting, HDR environment, shadows, weather/time of day
- Post-processing: bloom, LUT, anamorphic, SSS, SSR, tone mapping, color grading
- Path tracer (GPU/CPU), dynamic sky, atmosphere
- Camera views, fit/reset, screenshot, image/video/panorama export
- Hotspots (text, image, video, YouTube, HTML)
- Web export (standalone presentation with camera views)
- Revit connection (live sync), Streets GL map overlay
- Shader editor, AI enhancement, HDR/shadow tests
- Customizable toolbar, shortcuts, floating panels

---

## 12. Suggested Webpage Sections

1. **Hero** – Name, tagline, short description, CTA (e.g. “Try in browser” or “Download”).
2. **Features** – Group by: **Files & formats**, **Modeling**, **Lighting & rendering**, **Presentation & export**, **Integrations**.
3. **Supported formats** – Table or list of GLB, FBX, OBJ, etc.
4. **Screenshots / gallery** – Viewer with model, panels, path tracer, web export.
5. **Export options** – Image, video, panorama, web export, project save.
6. **Integrations** – Revit, Streets GL (and optionally “Under consideration”).
7. **Tech** – React, Vite, Three.js, Electron.
8. **Download / run** – `npm run dev`, desktop build, link to repo or docs.
9. **Docs** – Link to `docs/`, README, quick start.

Use **FEATURES_FOR_WEBPAGE.md** (this file) as the single source for copy and structure when building the webpage.
