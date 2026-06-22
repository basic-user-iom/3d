# Path Tracer Reverted to v3.5

## Date
2025-12-17

## Action Taken
Reverted `src/viewer/pathTracer/PathTracerDemo.ts` to v3.5 backup version.

## Verification

### File Status
- ✅ File successfully reverted from backup
- Current line count: 2821 lines (matches v3.5 backup structure)

### Key Methods Confirmed (v3.5 Version)

#### 1. `getSampleCount()` - Simple Version
```typescript
getSampleCount(): number {
  const tracerSamples = Math.ceil(this.pathTracer.samples || 0)
  return Math.max(tracerSamples, this.accumulatedSamples)
}
```
✅ **Reverted** - No tile division, simple implementation

#### 2. `reset()` - Simple Version
```typescript
reset(): void {
  this.accumulatedSamples = 0
  this.maxSamplesReached = false
  this.pausedAtMax = false
  this.pathTracer.reset()
}
```
✅ **Reverted** - Simple reset, no error handling or frame preservation

#### 3. `start()` - v3.5 Version
```typescript
start(): void {
  // ... setup code ...
  this.reset()  // Called BEFORE _isRunning is set
  this._isRunning = true  // Set AFTER reset()
  // ... render loop ...
}
```
✅ **Reverted** - Original order (reset before _isRunning)

#### 4. `setMaxSamples()` - v3.5 Version
```typescript
setMaxSamples(maxSamples: number): void {
  ;(this.pathTracer as any).maxSamples = maxSamples  // Sets library's internal maxSamples
  this.params.maxSamples = maxSamples
  this.config.maxSamples = maxSamples
  this.reset()
}
```
✅ **Reverted** - Sets library's internal maxSamples (may cause premature exit)

## What Was Reverted

### Removed Features (from current version):
- ❌ Fixed sample counting (tile division)
- ❌ Fixed premature exit (library maxSamples handling)
- ❌ Enhanced reset() with error handling
- ❌ Fixed start() order (isRunning before reset)
- ❌ Final frame preservation (gray screen fix)
- ❌ Blank canvas detection
- ❌ Enhanced error handling and logging
- ❌ State synchronization improvements

### Restored (v3.5 version):
- ✅ Simple `getSampleCount()` (no tile division)
- ✅ Simple `reset()` (no error handling)
- ✅ Original `start()` order (reset before isRunning)
- ✅ Library's internal maxSamples setting
- ✅ Original max samples handling

## Notes

⚠️ **Warning**: The v3.5 version has known bugs:
1. Sample counting may be incorrect (counts tiles as samples)
2. May exit prematurely (library's maxSamples uses tiles)
3. Reset may fail if called before start()
4. Final frame may show gray screen at max samples

All other files remain unchanged - only the path tracer code was reverted.














