# Streets GL Troubleshooting

This guide covers the most common issues when working with the embedded Streets
GL renderer (iframe on port 8081) and its bridge.

## Quick Status Checklist

1. **Server running?**  
   - `npm run dev` → starts the managed Streets GL server via
     `scripts/start-streets-gl-server.js`.  
   - `npm run streets-gl` → runs the standalone `streets-gl-alt` dev server.
   - Watch the terminal for `[StreetsGLBridge]` or `[start-streets-gl]` output
     confirming port/host.

2. **Iframe visible?**  
   - The iframe lives under `App.tsx` (`STREETS_GL_ALT_URL` default
     `http://localhost:8081`).  
   - If it’s blank/white: ensure port 8081 isn’t already taken, check DevTools
     network tab for 404/connection errors, and restart the server.

3. **Bridge ready?**  
   - Look for `[App] Streets GL bridge is ready`.  
   - If you only see `[App] Initializing Streets GL bridge…` but no “ready” log,
     check that the iframe actually loaded (no CSP/CORS errors).

## Common Issues & Fixes

| Symptom | Fix |
| ------- | --- |
| **Iframe blank** | Server probably not running. Re-run `npm run dev` or `npm run streets-gl`. Verify no port conflict on 8081. |
| **Bridge never ready** | Inspect console for `STREETS_GL_BRIDGE_READY`. If missing, the iframe’s JS bundle didn’t load—check `streets-gl-alt` for compile errors. |
| **Clicks blocked** | Toggle `streetsGLIframeInteractive` in the store (toolbar toggle) so clicks pass through to the Three.js canvas when needed. |
| **Object sync fails** | `syncModelToStreetsGL` runs after the bridge is ready. If models aren’t syncing, look for `[App] Syncing existing models…` logs or confirm the object has `userData.isModel`. |
| **Cube/primitive not visible in Streets GL** | Objects are scaled 100× when synced so they’re visible at map zoom. External objects are placed at least 500 m above ground in Streets GL to avoid terrain occlusion. Ensure Streets GL overlay is on before or when adding; if the bridge wasn’t ready, a retry runs after 1 s. Check console for `[PrimitivesPanel] ✅ Sync completed` or `[StreetsGLSync] ✅ Model successfully added`. If you see “No geometry sent”, the object isn’t a Mesh with geometry (e.g. use Primitives panel to add a box/cube). After an iframe reload (e.g. HMR), re-add the cube or re-sync from the main app. |
| **CORS “Cannot access iframe content”** | Expected when the iframe is cross-origin (e.g. app on :3000, Streets GL on :8081). The overlay no longer touches the iframe’s document in that case, so this warning should not appear. If it does, ensure `StreetsGLIframeOverlay.tsx` only accesses `contentDocument` when same-origin. |
| **Overlay misaligned** | If Streets GL overlays the Three.js canvas incorrectly, toggle `streetsGLIframeOverlay` off/on to refresh layout. |

## Manual Reset

If the iframe or bridge gets stuck:

1. Toggle the “Show Streets GL overlay” (or `setStreetsGLIframeOverlay(false)`),
   then re-enable.  
2. If still blank, restart the managed server (`Ctrl+C` the dev terminal, rerun
   `npm run dev`).  
3. As a last resort, open `http://localhost:8081` directly in the browser to
   ensure the standalone app itself is running; if not, check `streets-gl-alt`
   dependencies.

## Diagnostics to Capture

- Console logs from React app (`[App] Streets GL bridge…`).  
- Browser console from the iframe (open DevTools, use the “target iframe”
  dropdown).  
- Terminal output from `npm run dev` or `npm run streets-gl`.

## Errors from Inside the Streets GL Iframe

These appear in the console when the **Streets GL app** (port 8081) has issues. They originate from the iframe’s WebGL/tile stack, not from the main app:

| Console message | Cause | Where to fix |
|-----------------|--------|--------------|
| **Unrecognized feature: 'webgl'** | Fixed in main app: the iframe’s `allow` attribute no longer uses invalid `webgl` (only valid Permissions Policy features like `fullscreen` are used). | N/A (resolved in `StreetsGLIframeOverlay.tsx`) |
| **GL_INVALID_FRAMEBUFFER_OPERATION: Attachment layer is greater than texture layer count** | WebGL in the Streets GL renderer is attaching a framebuffer to a texture layer that doesn’t exist (e.g. 2D array texture with too few layers). | Fixed in `streets-gl-alt/src/lib/renderer/webgl2-renderer/WebGL2Framebuffer.ts`: layer is clamped to [0, texture.depth - 1] before framebufferTextureLayer. Rebuild Streets GL and full reload. |
| **Failed to load resource: 404** for `/vector/z/x/y` | Vector tile requested by Streets GL (e.g. `PBFVectorFeatureProvider`) is missing on the tile server or the URL is wrong. | Streets GL tile config or tile server; ensure the vector tile endpoint and zoom/x/y are correct. |

The main app cannot fix WebGL or tile 404s inside the iframe; changes must be made in the Streets GL server/renderer and tile configuration.

### GBufferPass log spam

Verbose GBufferPass logging has been reduced in `streets-gl-alt/src/app/render/passes/GBufferPass.ts`:

- **“Found external object”** and **per-draw** logs (Drawing object, Material check, Successfully drew) are removed.
- **“Scene traversal: checked N objects, found M external object(s)”** is logged only when there is at least one external object, at most every 2 seconds. When there are zero external objects, this line is not logged (so no “found 0” spam after iframe reload).

If you need full verbose logging for debugging, add temporary `console.log` calls in `renderExternalObjects()` and `getExternalObjects()`.

**If you still see “Scene traversal: … found 0” every second:** the iframe is likely running an old bundle. Do a **full page reload** (or hard refresh, e.g. Ctrl+Shift+R) so the iframe loads the latest Streets GL build from port 8081. HMR does not apply to the iframe’s bundle.

## Related Files

- `src/App.tsx` – iframe, bridge initialization, overlay toggles.
- `src/components/StreetsGLIframeOverlay.tsx` – iframe element, `allow` attribute, same-origin checks to avoid CORS console warnings.
- `src/utils/streetsGLBridge.ts` – message passing between the viewer and
  Streets GL.
- `src/viewer/useViewer.ts` – `syncModelToStreetsGL` helper that pushes Three.js
  models into the Streets GL scene.


