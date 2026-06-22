# Path Tracer Fixes Applied

## Date
2025-12-17

## Bugs Fixed

### 1. Premature Exit (2x Faster) - FIXED
**Root Cause**: 
- The library's internal `maxSamples` was being set directly
- The library checks `pathTracer.samples >= maxSamples`
- But `pathTracer.samples` counts TILES, not samples
- With 2x2 tiles = 4 tiles per frame, it would exit after ~13 frames (52 tiles) instead of 50 samples

**Fix Applied**:
- **Removed all assignments to `(this.pathTracer as any).maxSamples`**
- We now handle max samples check ourselves in `renderFrame()` using `accumulatedSamples`
- The library's internal max samples check is disabled

**Code Changes**:
- `start()` method: Commented out `(this.pathTracer as any).maxSamples = this.config.maxSamples`
- `initialize()` method: Commented out `(this.pathTracer as any).maxSamples = this.config.maxSamples`
- `setMaxSamples()` method: Commented out `(this.pathTracer as any).maxSamples = maxSamples`
- `clearMaxSamples()` method: Commented out `(this.pathTracer as any).maxSamples = undefined`

---

### 2. Reset Continues Samples - FIXED
**Root Cause**:
- Reset was calling `renderSample()` directly, which increments `pathTracer.samples`
- But `accumulatedSamples` was reset to 0
- Next `renderFrame()` increments `accumulatedSamples` to 1
- But `pathTracer.samples` is already at 1 (or more), creating a mismatch

**Fix Applied**:
- **Removed direct `renderSample()` call from reset**
- **Added reset of library's internal samples counter**: `(this.pathTracer as any).samples = 0`
- Let the next `renderFrame()` handle the first sample after reset
- This keeps `accumulatedSamples` and `pathTracer.samples` in sync

**Code Changes**:
- `reset()` method: 
  - Removed `this.pathTracer.renderSample()` call
  - Added `(this.pathTracer as any).samples = 0` to reset library counter
  - Simplified error handling (no longer needed since we're not rendering)

---

### 3. Sample Counting Still Wrong - FIXED
**Root Cause**:
- Library's internal `maxSamples` check was using `pathTracer.samples` (tiles)
- This caused premature exit

**Fix Applied**:
- Disabled library's internal max samples check
- Our `getSampleCount()` already uses `accumulatedSamples` correctly
- Max samples check in `renderFrame()` now only uses `accumulatedSamples`

---

## Testing Needed

1. **Test with Fast + 1080P preset** - Should render correct number of samples
2. **Test Reset button** - Should reset cleanly without continuing samples
3. **Test all buttons** - Start, Stop, Pause, Resume, Reset
4. **Verify sample count** - Should match expected max samples

---

## Files Modified

- `src/viewer/pathTracer/PathTracerDemo.ts`:
  - `start()` method (lines 2524-2531)
  - `initialize()` method (lines 684-686)
  - `reset()` method (lines 3052-3143)
  - `setMaxSamples()` method (lines 3311-3316)
  - `clearMaxSamples()` method (lines 3321-3325)
