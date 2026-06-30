# Bug Investigation Memory

Persistent record of investigated bugs, fixes, and open PRs. **Do not re-investigate bugs with open PRs listed here.**

## Open PRs

- [#1 — Fix idle render pause blocking weather/lighting slider updates](https://github.com/basic-user-iom/3d/pull/1)

## Investigated Bugs

### 2026-06-30 — Idle render pause freezes weather/HDR slider updates

- **Severity:** High (significant user-facing breakage)
- **Trigger:** Standalone weather active, camera static (idle pause engaged). Move time-of-day, cloud, HDR intensity, or shadow sliders — scene lighting/sky does not repaint until camera nudge.
- **Root cause:** `cc498c9` stopped continuous redraw when CSM/sky were static, but React lighting effects mutate the scene without calling `viewer.requestRender()`.
- **Fix:** `wakeViewerRender()` helper; call from weather, shadow, and ambient effects; restore sun `castShadow` via `resolveDirectionalCastShadow` when exiting weather.
- **Status:** Fixed in PR #1

### 2026-06-25 — Camera-view export concurrent WebGL render (mutex incomplete)

- **Severity:** Critical (WebGL corruption / crash risk)
- **Trigger:** Start Camera Views path-tracer export while the viewer render loop is active. Export set `__pathTracerDemoRunning` but did not register `__pathTracerDemo`, and `ViewerCanvas` only skipped raster renders when both the flag and a running panel instance were present — so export and the viewer both rendered to the same WebGL context. Panel could also start a second tracer during export (no start guard) or clear the export lock on unmount.
- **Fix:** Owner-scoped lock helpers in `pathTracerExport.ts` (`PATH_TRACER_EXPORT_LOCK_ID`); export registers `__pathTracerDemo`; `ViewerCanvas` skips raster render on `__pathTracerDemoRunning` alone; panel blocks start when a foreign lock is held and only clears flags it owns.
- **Status:** Fixed in commit.

### 2026-06-25 — Path tracer gizmo restore broken (`__appStore` never set)

- **Severity:** High (user-facing breakage)
- **Trigger:** Select an object → start path tracer from panel → stop path tracer. Transform gizmo stays hidden/detached; selection not restored.
- **Root cause:** Commit `f785214` saved/restored selection via `window.__appStore`, but `App.tsx` only exposes `window.__viewer` — `__appStore` was never assigned.
- **Fix:** Import `useAppStore` directly in `PathTracerDemo.ts`; movement restore extracted to `pathTracerMovementRestore.ts` (commits `5c8959e`, `04f0d56`).
- **Status:** Fixed.

### 2026-06-25 — Concurrent path tracer instances (camera view export)

- **Severity:** High (WebGL crash / renderer corruption risk)
- **Trigger:** Start Camera Views path-tracer export → while rendering, open Path Tracer panel and start live preview.
- **Fix:** Set/clear `__pathTracerDemoRunning` in `pathTracerExport.ts` during export lifecycle; hardened with owner-scoped lock (see critical bug above).
- **Status:** Fixed.

### 2026-06-25 — Path tracer exit white transparent artifacts

- **Severity:** High (user-facing visual breakage)
- **Trigger:** Exit path tracer after rendering; semi-transparent helper planes or transform-control children left visible.
- **Fix:** Commit `1f87951` — hide transform-control root only; exclude ground/shadow planes from material-based helper hide; skip restoring transform-control descendants; dispose path-tracer ground meshes before helper restore.
- **Status:** Fixed (audited, no further critical issues).

## Program Health (2026-06-30)

| Check | Result |
|-------|--------|
| Audit range | `c4cb8f8..fa64e38` (last 25 commits on master) |
| Critical bugs found | 1 (idle pause + slider updates) — fixed |
| Targeted tests | 90/90 pass (audit subset + fix) |

## Program Health (2026-06-25)

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm test -- --run` | 95/95 pass |
| Open GitHub PRs | None |
| Remote | `basic-user-iom/3d` |
| Audit range | `5c8959e..HEAD` (+ fixes) |

## Notes

- Untracked root `main.cjs` differs from `electron/main.cjs`; `package.json` points to `electron/main.cjs`. Safe to delete locally.
- Streets GL bridge uses `postMessage(..., '*')` — acceptable for localhost iframe integration, not a production auth surface.
- `useViewer.ts` / `electron/main.cjs` unchanged since `5c8959e`; no new critical issues in those areas this audit.
