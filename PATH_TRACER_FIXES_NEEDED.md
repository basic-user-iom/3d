# Path Tracer Fixes Needed

## Root Cause Analysis

### Issue 1: Premature Exit (2x Faster)
**Root Cause**: 
- We set `(this.pathTracer as any).maxSamples = maxSamples` directly
- The library's internal code checks `pathTracer.samples >= maxSamples`
- But `pathTracer.samples` counts TILES, not samples
- With 2x2 tiles = 4 tiles per frame, `pathTracer.samples` increments by 4 per frame
- If maxSamples = 50, library checks: `pathTracer.samples >= 50`
- After 13 frames: `pathTracer.samples = 52` (but only 13 actual samples)
- Library exits prematurely!

**Fix**: 
- Option 1: Don't set library's internal maxSamples (let our code handle it)
- Option 2: Set it to `maxSamples * totalTiles` to match tile count
- **Recommended**: Option 1 - disable library's internal check, use our own

### Issue 2: Reset Continues Samples
**Root Cause**:
- Reset calls `renderSample()` directly, which increments `pathTracer.samples`
- But `accumulatedSamples` is reset to 0
- Next `renderFrame()` increments `accumulatedSamples` to 1
- But `pathTracer.samples` is already at 1 (or more)
- This creates a mismatch and "leaves last sample"

**Fix**:
- Don't call `renderSample()` directly in reset
- Let the next `renderFrame()` handle the first sample after reset
- Or sync `pathTracer.samples` with `accumulatedSamples` after reset

### Issue 3: Sample Counting Still Wrong
**Root Cause**:
- Our `getSampleCount()` is correct (uses `accumulatedSamples`)
- But the library's internal `maxSamples` check uses `pathTracer.samples` (tiles)
- This causes premature exit

**Fix**:
- Disable library's internal maxSamples check
- Use only our own max samples check in `renderFrame()`














