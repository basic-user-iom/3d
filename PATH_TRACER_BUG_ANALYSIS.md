# Path Tracer Bug Analysis

## Issues Identified

### 1. Premature Exit (2x Faster)
**Root Cause Hypothesis**:
- The library's internal `maxSamples` might be using `pathTracer.samples` (which counts tiles)
- With 4x4 tiles, `pathTracer.samples` increments by 16 per frame
- If `maxSamples` is set to 50, and the library checks `pathTracer.samples >= 50`, it will exit after ~3 frames (48 tiles = 3 samples)
- This would make it finish ~16x faster, but user says 2x, so maybe tiles are 2x2?

**Fix Needed**:
- Don't set `(this.pathTracer as any).maxSamples` directly
- Or ensure we're dividing by tiles when setting it
- Or disable the library's internal max samples check

### 2. Reset Continues Samples
**Root Cause Hypothesis**:
- Reset calls `renderSample()` directly, which increments `pathTracer.samples`
- But `accumulatedSamples` is reset to 0
- Next `renderFrame()` increments `accumulatedSamples` to 1
- But `pathTracer.samples` might already be at 1 (or more)
- This creates a mismatch

**Fix Needed**:
- Don't call `renderSample()` directly in reset
- Let the next `renderFrame()` handle the first sample
- Or sync `pathTracer.samples` with `accumulatedSamples` after reset

### 3. Sample Counting Still Wrong
**Root Cause Hypothesis**:
- `getSampleCount()` uses `accumulatedSamples` correctly
- But the library's internal `maxSamples` check might be using `pathTracer.samples` directly
- This causes premature exit

**Fix Needed**:
- Check if library has internal max samples check
- If so, either disable it or set it correctly (divided by tiles)














