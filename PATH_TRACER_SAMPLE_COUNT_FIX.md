# Path Tracer Sample Count Fix - Tiles vs Samples

## Issue
Tiles are being counted as samples, causing incorrect sample counts. For example, with 4x4 tiles (16 tiles), each frame was being counted as 16 samples instead of 1.

## Root Cause
The `pathTracer.samples` property counts **tiles**, not actual samples. When using tile-based rendering:
- With 2x2 tiles = 4 tiles per frame
- With 4x4 tiles = 16 tiles per frame
- `pathTracer.samples` increments by the number of tiles per frame

## Solution
Fixed `getSampleCount()` to:
1. **Divide by tile count**: Convert `pathTracer.samples` (tiles) to actual samples by dividing by `tiles.x * tiles.y`
2. **Use accumulatedSamples as primary**: Since we control `accumulatedSamples` and increment it once per `renderSample()` call, it's the accurate count
3. **Fallback logic**: Only use `pathTracer.samples` (divided by tiles) if `accumulatedSamples` is 0 (initial state)

## Implementation

**File**: `src/viewer/pathTracer/PathTracerDemo.ts`

**Method**: `getSampleCount()`

**Before**:
```typescript
getSampleCount(): number {
  const tracerSamples = Math.ceil(this.pathTracer.samples || 0)
  return Math.max(tracerSamples, this.accumulatedSamples)
}
```

**After**:
```typescript
getSampleCount(): number {
  // CRITICAL: pathTracer.samples counts TILES, not actual samples
  // With 4x4 tiles, pathTracer.samples increments by 16 per frame (one per tile)
  // We need to divide by the number of tiles to get the actual sample count
  const totalTiles = this.pathTracer.tiles.x * this.pathTracer.tiles.y
  const tracerSamples = totalTiles > 0 
    ? Math.ceil((this.pathTracer.samples || 0) / totalTiles)
    : Math.ceil(this.pathTracer.samples || 0)
  
  // Use accumulatedSamples as the primary source of truth since we increment it once per renderSample() call
  // This ensures we count actual samples (complete frames), not tiles
  // Only use tracerSamples as a fallback if accumulatedSamples is 0 (initial state)
  return this.accumulatedSamples > 0 ? this.accumulatedSamples : tracerSamples
}
```

## Result
- ✅ Sample count now correctly shows actual samples, not tiles
- ✅ With 4x4 tiles, sample count increments by 1 per frame (not 16)
- ✅ `accumulatedSamples` is used as primary source (we control it)
- ✅ `pathTracer.samples` (divided by tiles) used as fallback only

## Testing
- Sample count should now increment by 1 per frame regardless of tile count
- Max samples limit should work correctly (e.g., 64 samples = 64 frames, not 64 tiles)














