# Path Tracer Guide

Use this guide to run the built-in GPU path tracer, tune sampling settings, and
debug the common pitfalls around HDR ground projection and performance.

## Where to Find It

- Open the “Path Tracer” panel from the viewer UI (look for the Path Tracer demo
  toggle/button in the sidebar).
- The panel wraps `PathTracerDemo` (`src/viewer/pathTracer/PathTracerDemo.ts`)
  via `PathTracerDemoPanel.tsx`.

## Requirements

- The main viewer must already be running (see `viewer-basics.md` for setup).
- HDR ground projection integration is optional but unlocks better ground
  shadows; the panel automatically detects whether `hdrGroundProjectionEnabled`
  is active via `useAppStore`.

## Starting the Path Tracer

1. Launch `npm run dev` or `npm run dev:full`.
2. Load a model in the viewer.
3. Open the Path Tracer panel and wait for the status to show “Ready”.
4. Click **Start**.

Behind the scenes, the panel:

- Creates a `PathTracerDemo` with the current renderer, camera, scene, and
  controls.
- Uses optimized defaults (0.75 resolution scale, 4×4 tiles, 4 bounces, 0
  min samples) so results appear quickly.
- Exposes the demo instance on `window.__pathTracerDemo` for debugging.

## Controls & Settings

| Control | Description |
| ------- | ----------- |
| **Start / Stop** | Begins or halts progressive rendering. |
| **Pause / Resume** | Freezes accumulation without clearing samples (useful for comparing states). |
| **Reset** | Clears accumulated samples and status text. |
| **Download Image** | Saves a PNG of the current path-traced frame. |
| **Bounces** | Maximum light bounces (higher = better realism, slower). |
| **Min Samples** | Minimum samples before the first image is shown. Set to 0 for instant feedback. |

The sample counter updates every ~100 ms (`sampleIntervalRef` in the panel).

## HDR Ground Projection Notes

- When HDR ground projection is enabled, the path tracer includes the
  `GroundedSkybox` mesh so shadows appear correctly.
- When disabled, the skybox is excluded and the environment map drives lighting
  directly (`excludeGroundedSkybox` flag).

## Troubleshooting

- **“Failed to initialize”**: The panel retries initialization; watch the console
  for logged errors from `PathTracerDemo`. Ensure the viewer has a valid scene
  and renderer before opening the panel.
- **Black or noisy output**: Increase `minSamples`, raise `resolutionScale`,
  and let the tracer accumulate longer. Check that HDR environment maps are
  loaded.
- **Slow performance**: Lower `bounces`, reduce `resolutionScale`, or close
  other heavy panels. Remember that pausing orbit controls while path tracing
  reduces camera jitter.
- **Download button disabled**: The panel only enables actions after the demo
  initializes; wait until status reads “Ready” or “Running”.

## Related Files

- `src/components/PathTracerDemoPanel.tsx` – React wrapper + UI logic.
- `src/viewer/pathTracer/PathTracerDemo.ts` – core tracer integration.
- `docs/archive/path-tracer/*` – historical research and deep-dive notes.


