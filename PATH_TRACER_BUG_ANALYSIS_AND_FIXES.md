# Path Tracer Bug Analysis and Fixes

## Bug 1: Sample Count Divergence

### Root Cause
The divergence occurs because:
1. `accumulatedSamples` is manually incremented once per `renderSample()` call
2. `pathTracer.samples` is the library's internal counter that may track tiles differently
3. The division by `totalTiles` assumes perfect synchronization, which may not be true
4. The warning threshold (5 samples) is too low and triggers too frequently

### Fix
- **Rely solely on `accumulatedSamples`** as the source of truth since we control it
- **Remove or significantly increase the divergence warning threshold** (e.g., only warn if difference > 50)
- **Use `pathTracer.samples` only as a fallback** when `accumulatedSamples` is 0

### Implementation
```typescript
getSampleCount(): number {
  const totalTiles = this.pathTracer.tiles.x * this.pathTracer.tiles.y
  if (totalTiles <= 0) {
    return Math.ceil(this.pathTracer.samples || 0)
  }
  
  // Use accumulatedSamples as primary source of truth
  // Only use tracerSamples as fallback during initialization
  if (this.accumulatedSamples > 0) {
    return this.accumulatedSamples
  }
  
  // Fallback during initialization
  const tracerSamples = Math.ceil((this.pathTracer.samples || 0) / totalTiles)
  return tracerSamples
}
```

---

## Bug 2: Blank Canvas at Regular Intervals

### Root Cause
The blank canvas detection is likely a **false positive** caused by:
1. **Timing issue**: Canvas pixel reading happens before the frame is fully rendered/displayed
2. **Render target switching**: The path tracer might be switching render targets during tile processing
3. **Pixel reading at wrong time**: We're reading pixels immediately after `renderSample()`, but the frame might not be displayed yet

### Fix
- **Remove or reduce the frequency** of blank canvas checks (only check every 50 samples instead of 10)
- **Add a delay** before reading pixels to ensure the frame is displayed
- **Check the accumulation buffer** instead of the canvas (if possible)
- **Only warn if blank canvas persists** across multiple samples

### Implementation
```typescript
// Only check every 50 samples, not every 10
if (this.getSampleCount() >= 50 && this.getSampleCount() % 50 === 0) {
  // Add small delay to ensure frame is displayed
  setTimeout(() => {
    // Check canvas pixels
  }, 100)
}
```

---

## Bug 3: Reset Called Before Running

### Root Cause
Reset is being called during initialization when syncing settings, before `start()` sets `_isRunning = true`.

### Fix
- **Make reset a no-op during initialization** without logging warnings
- **Track initialization state** separately
- **Only allow reset when path tracer is fully initialized and running**

### Implementation
```typescript
reset(): void {
  // Silently return if not running (no warning during initialization)
  if (!this._isRunning) {
    return
  }
  
  // ... rest of reset logic
}
```

---

## Bug 4: Environment Setup Fallback

### Root Cause
The path tracer expects equirectangular HDR textures with a data array, but the scene might have a different format.

### Fix
- **Convert environment textures** to the format the path tracer expects
- **Preserve original environment** for restoration
- **Better error handling** for unsupported formats

### Note
This is a lower priority issue and may require more investigation into the three-gpu-pathtracer API.

---

## Recommended Changes Summary

1. **Simplify sample counting** - Use `accumulatedSamples` as single source of truth
2. **Reduce blank canvas check frequency** - Check every 50 samples, not every 10
3. **Silent reset during initialization** - Don't log warnings when reset is called before running
4. **Improve state management** - Consider tracking initialization state separately














