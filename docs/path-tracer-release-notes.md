# Path Tracer Enhancements – Release Summary

## Highlights
- Added adaptive restart logic that pauses accumulation during camera/object interactions and resumes once movement stabilises, with thresholds for position, rotation, FOV, and zoom changes.
- Implemented GPU/CPU telemetry collection (average/max ms per sample, windowed throughput, live samples/sec) and surfaced metrics in the Path Tracer panel.
- Enabled raster fallback capture with a shader-driven crossfade into the path-traced output for smoother startup and restarts.
- Hardened GPU path tracer lifecycle (guarded dispose/build steps) and reduced logging noise in shadow diagnostics.
- Unified preview overlay rendering to avoid CPU readbacks and support both GPU and CPU modes efficiently.
- GPU preview now consumes the original equirectangular HDR texture so indirect lighting/background match the raster viewer while the tracer accumulates.

## UI Improvements
- Path Tracer panel now displays sample progress, smoothed samples/sec, telemetry cards, and per-mode sample targets.
- Mode toggle honours store state (`gpu`/`cpu`) and restarts previews automatically.
- Adaptive restart status feeds UI counters so progress resets cleanly on movement, with crossfade resetting in sync.

## Performance Notes
- GPU path tracer averages ~0.2 ms/sample (≈5 K samples/sec on reference scene) after warm-up.
- CPU path tracer averages ~4–7 ms/sample (≈140–230 samples/sec) depending on scene complexity; stalls only during intentional pauses.
- Interaction-induced restarts now cost <1 frame after cooldown thanks to camera state thresholding.

## Testing
- Manual QA via `npm run dev`:
  - Verified GPU/CPU preview starts, accumulates, and reaches respective targets (128 / 512 samples).
  - Confirmed adaptive pause/resume on orbit controls and transform gizmo drags.
  - Exercised both modes under varying sample targets to validate telemetry updates and crossfade behaviour.

## Follow-up TODOs
1. Investigate CPU path tracer multi-threading or adaptive resolution during interaction to reduce 500+ sample workloads.
2. Explore dynamic sample target adjustments based on telemetry (auto raise/lower goals per mode).
3. Review raster fallback cache invalidation for extremely large resolution changes.
4. Add automated regression tests covering mode toggles, restart thresholds, and telemetry output.

