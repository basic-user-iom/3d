# CPU Path Tracer Optimisation Plan

## Current Behaviour Snapshot
- Renderer: single-threaded `PathTracerCore.renderSample()` running on the main thread (WebGL context reused for CPU fallback).
- Resolution: locked to full viewer resolution — `PathTracerConfig.width/height` mirror canvas size (`PathTracerModule.startPreview()` calls `captureRasterFallback()` and sets `config.width/height` to viewer dimensions).
- Timing: Manual profiling (Nov 8 2025) shows ~4–7 ms/sample average, 13–57 ms peaks on interaction restart, ≈140–230 samples/sec once stable.
- Interaction: Adaptive restart currently resets accumulation to 0 and restarts sampling at full resolution once camera/object settles.

## Optimisation Goals
1. Maintain responsive UI during interaction (prevent long stalls on CPU preview).
2. Improve overall convergence speed without compromising image quality.
3. Avoid duplicating shaders or diverging GPU/CPU code paths excessively.

## Options Under Consideration

### 1. Multi-threaded Sample Worker Pool
- **Approach**: Offload accumulation shader to Web Workers via `OffscreenCanvas` or WASM micro-kernels.
- **Pros**: Unlocks additional cores; better parallelism for heavy scenes.
- **Cons**: Requires reworking renderer to support multiple contexts; path tracer currently depends on Three.js materials and uniforms (WebGL stateful) — difficult to share across workers without major refactor.
- **Status**: Deep dive needed into `three` `WebGLRenderer` + `OffscreenCanvas` support; may demand switching to raw WebGL calls or porting sampling shader to WASM. High complexity.

### 2. Adaptive Resolution During Interaction (Preview Scaling)
- **Approach**: While `previewPausedForInteraction === false` but movement detected recently, render at reduced resolution (e.g. halve width/height) and upscale for display; restore full resolution after N stable frames.
- **Implementation Hooks**:
  - `PathTracerRenderer.scheduleInteractionRestart()` already knows when motion occurs — can set `this.config.width/height = baseSize / scale`.
  - Need to propagate new size to `PathTracerCore.updateConfig()` (already supports dynamic resize), ensure accumulation resetting handled.
  - Update preview material uniforms for resolution; ensure raster fallback crossfade still works.
- **Pros**: Immediate reduction in per-sample cost (~75% less pixels at 0.5 scale); minimal architectural change.
- **Cons**: Requires careful sync so resized targets don’t break preview overlay; need heuristics for when to return to full res (e.g. after 30 stable frames or when sample count > threshold).
- **Status**: High priority candidate; compatible with existing adaptive restart logic.

### 3. Sample Budget Throttling While Moving
- **Approach**: Cap max samples per restart when motion is ongoing (e.g. stop at 32 samples until stable to avoid wasted work).
- **Pros**: Avoids doing heavy work on frames that will be reset anyway.
- **Cons**: Doesn’t reduce per-sample cost, just total time; may produce noisier previews during movement.
- **Status**: Pair with adaptive resolution to keep preview meaningful while controlling cost.

### 4. Progressive Tile Rendering
- **Approach**: Subdivide render into coarse tiles (quarter res per tile) and fill sequentially; display partial results early.
- **Pros**: Keeps UI responsive; path tracer can focus on a subset each frame.
- **Cons**: Significant shader changes to support tile offsets; needs careful accumulation bookkeeping. More complex than adaptive resolution.

### 5. Denoiser Frequency Adjustment
- **Approach**: Skip or downscale denoiser while CPU preview is mid-accumulation; only run denoise every N samples.
- **Pros**: Saves extra fullscreen pass time; denoiser currently not run each sample but could be deferred further.
- **Cons**: Minor gains compared to renderSample cost; must ensure final frames still denoise correctly.

## Recommended Next Steps
1. **Prototype adaptive resolution scaling**:
   - Store base width/height in `PathTracerRenderer`.
   - When `scheduleInteractionRestart()` fires, set `interactionPreviewScale = 0.5` and call `updateConfig({ width: floor(baseWidth * scale), height: floor(baseHeight * scale) })`.
   - After `resumeAfterInteraction()` runs and sampleCount exceeds threshold (e.g. 64) or elapsed time > 1.5s, lerp back to 1.0 scale, resizing targets incrementally.
   - Update UI to report effective resolution and ensure telemetry records scaled sample throughput.
2. **Add sample budget throttling** while movement persists (e.g. clamp `config.samples` to `min(interactionMaxSamples, userTarget)` during interaction restarts).
3. **Measure** impact (ms/sample, throughput) using existing telemetry; document results.
4. **Re-evaluate multi-threading** only if adaptive resolution/budgeting insufficient — would require a longer-term architecture change (likely separate task/epic).

## Open Questions
- Minimum acceptable interaction quality (is 0.5 resolution enough, or do we need dynamic selection based on viewport size)?
- Should raster fallback capture operate at full resolution even when path tracer downscales (to avoid mismatched crossfade)?
- Do we need user-facing controls to lock preview scale or sample budget?

## Tracking
- Task ID: `cpu-optimization-investigation`
- Owner: Path tracer sub-team
- Dependencies: Adaptive restart logic (already merged), telemetry logging (available).




