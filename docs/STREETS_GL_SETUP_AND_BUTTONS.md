# Streets GL – Complete Setup and Button Linkage

## Overview

Streets GL is the 3D map renderer (OpenStreetMap with buildings) shown in an iframe at **http://localhost:8081**. The 3D viewer controls it via store state and two main entry points: **City/Hybrid** (render mode) and **OSM 3D** (panel + overlay).

---

## 1. Store state (useAppStore)

| State | Default | Meaning |
|-------|--------|--------|
| `renderMode` | `'product'` | `'product'` \| `'city'` \| `'hybrid'` |
| `streetsGLIframeOverlay` | `false` | Whether the Streets GL iframe is visible and covering the view |
| `streetsGLIframeInteractive` | `false` | Whether clicks go to the map (true) or to the 3D scene (false) |
| `showOSMGroundV2Panel` | `false` | Whether the right-hand "OSM 3D" panel is open |
| `streetsGLGroundLat/Lon/Zoom` | 32.89917, -97.03813, 15 | Map location and zoom |
| `streetsGLBridge` | `null` | Set when iframe loads; used to sync objects to Streets GL |

---

## 2. Buttons and what they do

### Product / City / Hybrid (RenderModeSelector, toolbar)

- **Product**  
  - `setRenderMode('product')`  
  - `setStreetsGLIframeOverlay(false)`  
  - Streets GL iframe hidden; only Three.js viewer.

- **City**  
  - `setRenderMode('city')`  
  - `setStreetsGLIframeOverlay(true)`  
  - `setStreetsGLIframeInteractive(true)`  
  - If OSM 3D panel is closed, `toggleOSMGroundV2Panel()` opens it.  
  - ViewerCanvas is **not** rendered (`renderMode !== 'city'` in App.tsx).  
  - Only Streets GL iframe is shown (full screen).

- **Hybrid**  
  - `setRenderMode('hybrid')`  
  - `setStreetsGLIframeOverlay(true)`  
  - `setStreetsGLIframeInteractive(false)`  
  - Both ViewerCanvas and Streets GL iframe are shown; clicks go to 3D scene.

### OSM 3D (Modeling toolbar, config: `toggleOSMGroundV2Panel`)

- **Click**  
  - `toggleOSMGroundV2Panel()`  
  - Toggles `showOSMGroundV2Panel` (opens/closes the OSM 3D panel).  
  - When **opening** the panel and overlay is off, also sets `streetsGLIframeOverlay: true`.

- **Panel**  
  - Rendered when `showOSMGroundV2Panel === true` (App.tsx: `{showOSMGroundV2Panel && <OSMGroundV2Panel />}`).  
  - Contains:  
    - “Enable Streets GL 3D Map” checkbox → `setStreetsGLIframeOverlay(checked)`  
    - “Allow Streets GL Interaction” checkbox → `setStreetsGLIframeInteractive(checked)`  
    - Location (lat/lon/zoom), “Start server” / “Copy command”, server status.

---

## 3. What renders what

| Component | When it renders | Depends on |
|-----------|-----------------|------------|
| **ViewerCanvas** | `renderMode !== 'city'` | App.tsx |
| **StreetsGLIframeOverlay** | Always mounted; **visible** only when `streetsGLIframeOverlay === true` (returns `null` when false) | App.tsx passes `streetsGLIframeOverlay` |
| **OSMGroundV2Panel** | `showOSMGroundV2Panel === true` | App.tsx |

- Iframe **src**: `http://localhost:8081#{lat},{lon},45,0,2000` (lat/lon/zoom from store).

---

## 4. How Streets GL is started

### One-click / one-command launchers (recommended)

| Goal | Script to run | What it starts |
|------|----------------|----------------|
| **Browser** (viewer + map in browser) | `Start_BOTH_SERVERS.bat` or `npm run start:both` | Streets GL (8081) + Vite (3000), opens browser |
| **Desktop** (Electron app + map) | `Start_Both_Desktop.bat` or `npm run start:desktop` | Streets GL (8081) + Vite (3000) + Electron window |

- **Browser:** Double-click `Start_BOTH_SERVERS.bat` or in a terminal run `npm run start:both` (or `npm run dev`). Then open City or OSM 3D in the app.
- **Desktop:** Double-click `Start_Both_Desktop.bat` or run `npm run start:desktop` (or `npm run desktop:dev`). Waits for Vite to be ready, then opens the Electron window. Use City or OSM 3D in the app; the desktop app can start Streets GL automatically if it wasn’t running.

### Browser (Vite only)

- **No** automatic process start from the page.
- Start Streets GL by using a script that runs both viewer and Streets GL:
  - `npm run dev` or `npm run start:both` – Streets GL + 3D viewer (opens browser)
  - `npm run dev:viewer-only` – Streets GL + 3D viewer (no --open)
- Or run Streets GL alone: `npm run streets-gl:managed` or `cd streets-gl-alt && npm run dev`.

### Electron (desktop)

- **On app open**: `app.on('ready')` in `electron/main.cjs` calls `startStreetsGLServer()` so Streets GL starts as soon as the 3D viewer window opens.
- **From UI**: “Start server” in OSM 3D panel (and iframe error path) calls `window.electronAPI.startStreetsGLServer()` → IPC `start-streets-gl-server` → same `startStreetsGLServer()` in main (spawns `npm run dev` in `streets-gl-alt`).

### Scripts (package.json)

- `streets-gl:managed` – `node scripts/start-streets-gl-server.js` (starts and restarts Streets GL).
- `dev` / `dev:viewer-only` / `desktop:dev` – run Streets GL (managed) together with the viewer/Electron.

---

## 5. Config and menu

- **Toolbar menu** (`src/config/toolbarMenu.ts`): OSM 3D is the action `toggleOSMGroundV2Panel` in the **modeling** section.
- **Toolbar** (`Toolbar.tsx`): That action is rendered as the “OSM 3D” button; `onClick={toggleOSMGroundV2Panel}`, active when `showOSMGroundV2Panel`.

---

## 6. COEP and iframe loading

- Vite dev server sets **Cross-Origin-Embedder-Policy: require-corp** (for SharedArrayBuffer, etc.).
- Streets GL dev server (webpack in `streets-gl-alt`) must send **Cross-Origin-Resource-Policy: cross-origin** so the viewer can embed the iframe and avoid `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`.
- That header is set in `streets-gl-alt/webpack.config.js` → `devServer.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'`.

---

## 7. Summary diagram

```
[Product]     → renderMode=product, overlay OFF   → only ViewerCanvas
[City]        → renderMode=city,   overlay ON, interactive ON, open OSM panel → only iframe
[Hybrid]      → renderMode=hybrid, overlay ON, interactive OFF → ViewerCanvas + iframe

[OSM 3D]      → toggle OSM panel; if opening and overlay OFF → overlay ON

"Enable Streets GL 3D Map" (in panel)  → setStreetsGLIframeOverlay(checked)
"Allow Streets GL Interaction"        → setStreetsGLIframeInteractive(checked)

Streets GL server: localhost:8081
  - Started by: npm scripts (concurrently), Electron on ready, or "Start server" in Electron.
  - Iframe visibility: streetsGLIframeOverlay.
  - Panel visibility: showOSMGroundV2Panel.
```

This is the complete setup and how all Streets GL–related buttons and toggles are linked.
