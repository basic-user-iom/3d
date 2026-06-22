# Path Tracer Automated Test Plan

Goal: cover critical behaviours of the path tracer preview system via automated tests (unit + integration) to prevent regressions as adaptive logic evolves.

## Test Areas
1. **Mode Toggles**  
   - Switching between GPU and CPU modes updates renderer state, respects `forceCpuPreview`, and restores previous mode gracefully.
   - Sample targets reflect the selected mode (store + renderer matches).

2. **Adaptive Restart Thresholds**  
   - Camera/object interaction triggers pause → resume with accumulation reset and raster fallback refresh.
   - Camera jitter below thresholds does not cause restart.

3. **Telemetry Handling**  
   - Profiling logs populate telemetry snapshot; UI selectors receive updates.
   - On preview stop, telemetry persists its last value; new preview resets history.

4. **Raster Fallback Matching**  
   - After viewport resize, fallback render target resizes and crossfade resets.

5. **Telemetry-Driven Auto Target (future)**  
   - Once implemented, ensure adaptive targets adjust respecting bounds and user overrides.

## Proposed Test Types & Tools
| Area | Type | Tooling |
|------|------|---------|
| Renderer state (toggle GPU/CPU, restart thresholds) | Jest unit w/ mocked `PathTracerCore` & `WebGLPathTracer` | `@testing-library/jest-dom`, custom mocks |
| Store integration (sample targets) | Zustand store unit tests | `jest` + store helper |
| Telemetry updates | Unit tests on `logGpuProfiling`/`logCpuProfiling` | Mock timers/performance |
| UI binding (PathTracerPreview) | React Testing Library | DOM queries for sample counters & telemetry |
| Viewport resize fallback | Unit test invoking `captureRasterFallback` with mocked renderer size | Jest |

## Helpful Hooks / APIs
- `PathTracerRenderer.startPreview` / `stopPreview` / `restartPreview`
- `notifySceneInteraction` & `handleViewerCameraChange`
- Store actions: `setPathTracerMode`, `setPathTracerSampleTarget`
- UI component: `PathTracerPreview.tsx`

## Implementation Notes
1. **Mocking Three.js**  
   - Use lightweight mocks for `THREE.WebGLRenderer`, `WebGLRenderTarget`, `Texture`.
   - Provide fake `render` / `setSize` / `getSize`.

2. **Mock PathTracerCore**  
   - Replace CPU path tracer with stub: record `renderSample` call counts, allow manual sample increments.

3. **Testing Loop / requestAnimationFrame**  
   - Use fake timers or manual invocation of stored callback (`renderSampleFn`) to simulate rendering loop.

4. **UI Tests**  
   - Render `PathTracerPreview` with providers, simulate toggles and ensure sample counters/resets update.

5. **CI Considerations**  
   - Prefer headless tests; avoid real WebGL contexts to keep CI light-weight.

## Coverage Tasks (for tracking)
1. `tests/pathTracerRenderer.spec.ts`  
   - Mode toggles (GPU ↔ CPU)  
   - notifySceneInteraction: pause/resume behaviour  
   - Telemetry logging sets `telemetry` snapshot  
   - Raster fallback sizes update when mocked renderer size changes  
   - GPU HDR integration supplies equirect environment without crashing (`EquirectHdrInfoUniform`)

2. `tests/pathTracerPreview.spec.tsx`  
   - UI reflects sample progress, telemetry, mode dropdown  
   - Start/stop buttons reset sample counters  
   - Manual target change updates store

3. (Later) `tests/pathTracerAutoTarget.spec.ts`  
   - Adaptive target evaluation once implemented

4. Store tests verifying actions update `pathTracerSampleTargets`, `pathTracerAutoTarget` (when added).

## Next Steps
- Scaffold tests under `tests/` or `src/__tests__/`.
- Mock Three.js + GPU tracer to isolate logic.
- Integrate into existing npm test script (`npm test` or configure `vitest` if project adopts it).

