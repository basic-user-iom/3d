# Streets GL + 3D Viewer Integration Audit

Audit of duplicate actions, duplicate setup, and bugs in the 3D viewer ↔ Streets GL integration.

---

## 1. Duplicate / Conflicting Startup (FIXED)

### Issue
- **Electron**: `app.on('ready')` always called `startStreetsGLServer()`, and `npm run desktop:dev` runs **concurrently** `streets-gl:managed` + `electron`. So Streets GL could be started twice (script + Electron).
- **Result**: Two processes trying to bind to port 8081 or redundant spawns.

### Fix applied
- **electron/main.cjs**: Before starting Streets GL, we now check if `http://localhost:8081` is already responding (`isStreetsGLServerRunning()`). If yes, we skip spawn. Same check added to the IPC handler `start-streets-gl-server` so the "Start server" button and overlay error-path don’t spawn if the server is already up.

---

## 2. Stale Bridge in Store (FIXED)

### Issue
- When the user turned off the Streets GL overlay (`streetsGLIframeOverlay = false`), the store kept `streetsGLBridge` pointing at the old iframe. Other code (PrimitivesPanel, CubesViewer, LightingPanel, etc.) could still use that reference and try to sync or call bridge methods on a dead iframe.

### Fix applied
- **StreetsGLIframeOverlay.tsx**: When `streetsGLIframeOverlay` becomes `false`, we clear the bridge: set `streetsGLBridgeRef.current = null` and `useAppStore.getState().setStreetsGLBridge(null)` in a `useEffect` that depends on `streetsGLIframeOverlay`.

---

## 3. Sync When Bridge Not Ready (ALREADY FIXED)

- **useViewer.ts**: `syncModelToStreetsGL` now accepts `bridge: StreetsGLBridge | null | undefined` and resolves (no-op) when bridge is missing instead of rejecting. Callers no longer get uncaught "Bridge not available" errors.
- **useViewer.ts** `doSyncAndFrame`: Uses `useAppStore.getState().streetsGLBridge` at call time so we use the current bridge and don’t pass a stale closure.

---

## 4. No Duplicate Installations

- **Single Streets GL app**: One `streets-gl-alt` folder; one dev server (port 8081). No duplicate installations found.
- **Single bridge instance**: Only **StreetsGLIframeOverlay** creates and sets the bridge in the store. No other component creates a bridge.
- **Two panels, different roles**:
  - **OSMGroundV2Panel** (OSM 3D button): Main map controls, server status, “Start server”, overlay checkbox. This is the primary Streets GL UI.
  - **StreetsGLDemo** (Streets GL Demo button): Separate demo/standalone panel. Not a duplicate of OSM 3D; different entry in the menu.

---

## 5. Sync Call Sites (No Harmful Duplication)

| Caller | When | Duplicate risk |
|--------|------|----------------|
| **StreetsGLIframeOverlay** | On bridge `onReady`: syncs all `viewer.scene` children (models) | Same models can be synced once here; CubesViewer syncs only cubes without `streetsGLObjectId`, so after overlay sync they have IDs and aren’t re-synced. OK. |
| **CubesViewer** | (1) In `createCubes` when overlay + bridge; (2) In effect when `streetsGLBridge` appears | (1) and (2) are mutually exclusive by `streetsGLObjectId` check. OK. |
| **PrimitivesPanel** | When adding a primitive with overlay on | Single sync per add. OK. |
| **useViewer** `positionModelOnGround` | When placing with overlay/ground | Uses current bridge; sync is single per placement. OK. |
| **ViewerCanvas** | Transform debounce / throttle | Updates existing object by ID; idempotent. OK. |

No duplicate object creation in Streets GL; at most redundant updates by ID, which is acceptable.

---

## 6. Auto-Start Triggers (No Bad Duplication)

| Trigger | Where | Guard |
|---------|--------|--------|
| Electron `app.on('ready')` | main.cjs | Now checks port 8081; skips if server already up. |
| IPC `start-streets-gl-server` | main.cjs | Checks existing process + port 8081; skips if already running. |
| OSM panel auto-start effect | OSMGroundV2Panel | `hasTriggeredAutoStartRef` ensures one run per “server down” session. |
| Overlay error (isErrorPage / handleIframeError) | StreetsGLIframeOverlay | No ref; but IPC + main now skip if server already running. |
| “Start server” button | OSMGroundV2Panel | Same IPC; main guards. |

Result: Multiple triggers are safe; backend and port check prevent duplicate server processes.

---

## 7. COEP / Iframe Loading

- **Vite** (viewer) sets `Cross-Origin-Embedder-Policy: require-corp`.
- **streets-gl-alt** webpack devServer sends `Cross-Origin-Resource-Policy: cross-origin` so the viewer can embed the iframe and avoid `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`.
- No duplicate or conflicting COEP setup found.

---

## 8. Recommendations (Optional)

1. **StreetsGLDemo vs OSM 3D**: If “Streets GL Demo” is redundant with “OSM 3D”, consider hiding or removing it from the default menu; otherwise keep as a separate demo entry.
2. **Bridge cleanup on unmount**: The overlay returns `null` when `streetsGLIframeOverlay` is false but the component still mounts; the new effect clears the bridge when overlay turns false. If the component were ever fully unmounted (e.g. conditional render in App), adding a cleanup in a `useEffect` return could also clear the bridge; current behavior is already correct when toggling overlay off.
3. **Logging**: Consider reducing or gating `[StreetsGLIframe]` and `[StreetsGLSync]` logs behind a debug flag in production to avoid console noise.

---

## Summary

- **Duplicate startup**: Addressed by checking port 8081 and existing process in Electron before starting Streets GL.
- **Stale bridge**: Addressed by clearing the bridge in the store (and ref) when the overlay is disabled.
- **Sync with no bridge**: Already handled; sync no-ops and uses current bridge where relevant.
- **Duplicate installations / duplicate bridge creation**: None found; single Streets GL app and single bridge owner.
- **Sync and auto-start**: Multiple call sites and triggers are intentional and guarded; no harmful duplication.
