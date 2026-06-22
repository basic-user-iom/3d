# Dynamic Sample Target Design (Telemetry-Driven)

## Goal
Automatically adjust GPU/CPU path tracer sample targets based on live telemetry so previews converge quickly while respecting scene/device performance.

## Inputs Available
- `PathTracerModule.getTelemetry()` → { mode, avgSampleTimeMs, maxSampleTimeMs, samplesPerSecond, samplesMeasured, lastUpdated } (updated every ~5 s or on force flush).
- Current accumulation state: `getSampleCount()` / `getSampleTarget()`; adaptive restart resets counts to 0.
- User intents: store values `pathTracerSampleTargets.gpu/cpu` (initial defaults 128 each) exposed in UI inputs.
- Interaction context: `previewPausedForInteraction`, camera/object restart triggers.

## Proposed Strategy

### 1. Baseline Targets
- Keep user-configured targets as **upper bounds** (e.g. GPU 128, CPU 512).
- Introduce per-mode **minimum** (e.g. GPU min 32, CPU min 32) for acceptable noise floor.

### 2. Telemetry Window Classification
- For each telemetry update, compute effective throughput vs. target duration:
  - `expectedTime = (targetSamples - currentSamples) / samplesPerSecond`
  - Use moving percentile of `avgSampleTimeMs` to smooth spikes.
- Define tiers:
  1. **Fast**: expectedTime < 1.5 s → can increase target (up to max).
  2. **Nominal**: 1.5 s ≤ expectedTime ≤ 4 s → hold target steady.
  3. **Slow**: expectedTime > 4 s or `avgSampleTimeMs > slowThreshold` (e.g. 12 ms CPU, 2 ms GPU) → decrease target (down to min).

### 3. Adjustment Mechanics
- Maintain `adaptiveTarget` per mode inside `PathTracerRenderer`.
- Changes only when preview is stable (not paused for interaction, accumulation count > 0).
- Use hysteresis (e.g. require two consecutive telemetry windows in same tier) to avoid flip-flopping.
- Apply adjustments gradually:
  - Increase by +25% increments (capped by user max).
  - Decrease by -20% increments (floored by min).
- When target changes:
  - Invoke new `setDynamicSampleTarget(mode, adaptiveTarget)` in store that updates UI hint but does **not** overwrite user input until they explicitly change it.
  - Trigger `notifyDynamicSampleTargetChange` event so UI can show toast (“Auto-target: GPU 96 samples”).

### 4. Store/UI Integration
- Extend Zustand store with:
  ```ts
  pathTracerAutoTarget: {
    gpu: number | null
    cpu: number | null
  }
  setPathTracerAutoTarget(mode, value | null)
  ```
- In `PathTracerPreview.tsx`:
  - Display both `User target: X` and `Auto target: Y` (if Y differs from user value).
  - Provide toggle/checkbox “Lock target” to disable auto adjustments per mode (writes to store).

### 5. Renderer Logic
- Add fields to `PathTracerRenderer`:
  ```ts
  private adaptiveTargets = { gpu: null, cpu: null }
  private telemetryHistory = { gpu: [], cpu: [] }
  private autoTargetEnabled = { gpu: true, cpu: true }
  ```
- On telemetry log flush (`logGpuProfiling`, `logCpuProfiling`):
  - Push latest ms/sample, s/sec into history.
  - Call `evaluateAdaptiveTarget('gpu' | 'cpu')`.
- When preview starts/resumes:
  - Reset history; set initial `adaptiveTarget = userTarget`.
- `evaluateAdaptiveTarget(mode)`:
  1. Guard: if auto disabled, exit.
  2. Determine tier from history.
  3. If tier warrants change, compute new target, update renderer config (`this.config.samples`) and notify store.

### 6. Edge Cases
- **GPU building / CPU fallback**: skip adjustments until tracer ready.
- **Paused for interaction**: do not change targets while accumulation paused; instead mark pending change and apply after resume.
- **Large target reductions**: ensure we still capture final frame (if target lowered below current sample count, clamp to current+margin to avoid immediate completion).
- **User overrides**: any manual change to sample input should reset adaptive target to null and disable auto for that mode until toggled back on.

## Implementation Checklist
1. Store: add `pathTracerAutoTarget`, `setPathTracerAutoTarget`, `setPathTracerAutoTargetEnabled`.
2. Renderer: track telemetry history & evaluation logic.
3. UI: surface auto target info, add lock toggle, handle manual override resets.
4. Telemetry: ensure profiling flush occurs at preview completion so final target persists.
5. Tests: cover increase/decrease behaviour, user override, disable toggle (captured in future automation task `path-tracer-tests`).

## Open Questions
- Should auto target adjustments persist across sessions (store in local storage)? Initial approach: no, reset per session.
- Do we need separate heuristics for denoised vs. raw preview? For first pass, treat both the same.
- What to display when GPU and CPU telemetry run concurrently (e.g. GPU active but CPU fallback running)? Use active mode only.




