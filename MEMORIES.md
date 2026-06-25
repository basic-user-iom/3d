# Bug Investigation Memory

Persistent record of investigated bugs, fixes, and open PRs. **Do not re-investigate bugs with open PRs listed here.**

## Open PRs

_None._

## Investigated Bugs

### 2026-06-25 — Path tracer gizmo restore broken (`__appStore` never set)

- **Severity:** High (user-facing breakage)
- **Trigger:** Select an object → start path tracer from panel → stop path tracer. Transform gizmo stays hidden/detached; selection not restored.
- **Root cause:** Commit `f785214` saved/restored selection via `window.__appStore`, but `App.tsx` only exposes `window.__viewer` — `__appStore` was never assigned. `hdrGroundProjectionEnabled` and other store reads in `PathTracerDemo` also silently defaulted to wrong values.
- **Fix:** Import `useAppStore` directly in `PathTracerDemo.ts`; replace all `window.__appStore` usages.
- **Status:** Fixed in commit.

### 2026-06-25 — Concurrent path tracer instances (camera view export)

- **Severity:** High (WebGL crash / renderer corruption risk)
- **Trigger:** Start Camera Views path-tracer export → while rendering, open Path Tracer panel and start live preview. Export did not set `__pathTracerDemoRunning`, so panel could start a second `PathTracerDemo` on the same renderer.
- **Fix:** Set/clear `window.__pathTracerDemoRunning` in `pathTracerExport.ts` during export lifecycle.
- **Status:** Fixed in commit.

## Program Health (2026-06-25)

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm test -- --run` | 88/88 pass |
| `npm run test:smoke` | Pass (build + Playwright) |
| Open GitHub PRs | None |
| Remote | `basic-user-iom/3d` |

## Notes

- Untracked root `main.cjs` differs from `electron/main.cjs` (not byte-identical; keep untracked or review before delete); `package.json` points to `electron/main.cjs`. Safe to delete locally.
- Streets GL bridge uses `postMessage(..., '*')` — acceptable for localhost iframe integration, not a production auth surface.
