# Path Tracer Premature Exit Diagnostics

## Issue Report

User reports: "It starts, renders few frames and exits path tracer"

This is **different** from the previous hang issue - now the path tracer:
- ✅ Starts successfully
- ✅ Begins rendering
- ❌ **Exits after only a few frames** (instead of continuing to 64 samples)

## Possible Causes

### 1. **External stop() Call**
Something external (panel, viewer, React cleanup) is calling `pathTracer.stop()` unexpectedly

### 2. **_isRunning Set to False**
The `_isRunning` flag is being set to `false` somewhere outside of `stop()`

### 3. **Early maxSamples Trigger**
The maxSamples check is triggering too early (unlikely, but possible if state is wrong)

### 4. **WebGL Context Loss**
GPU/browser losing WebGL context during rendering

### 5. **React useEffect Cleanup Race**
Panel cleanup running when it shouldn't (e.g., on state change instead of unmount)

## Diagnostic Logging Added

### 1. **Enhanced Loop Exit Logging**

```typescript
if (!this._isRunning) {
  console.error('[PathTracerDemo] ❌ RENDER LOOP STOPPED UNEXPECTEDLY', {
    sampleCount: this.getSampleCount(),
    pausedAtMax: this.pausedAtMax,
    maxSamplesReached: this.maxSamplesReached,
    accumulatedSamples: this.accumulatedSamples,
    timestamp: new Date().toISOString()
  })
  console.trace('[PathTracerDemo] Stack trace at loop exit')
  ...
}
```

**What this shows:**
- Clear error message when loop stops unexpectedly
- Current sample count (if < 10, something is very wrong)
- Stack trace to see what triggered the exit

### 2. **Enhanced stop() Call Logging**

```typescript
const logLevel = (sampleCount < 10 && !force && !this.pausedAtMax) ? 'error' : 'log'
const message = '[PathTracerDemo] 🛑 stop() called' + 
  (sampleCount < 10 ? ' (⚠️ PREMATURE STOP - only ' + sampleCount + ' samples!)' : '')

console[logLevel](message, {
  force,
  pausedAtMax,
  maxSamplesReached,
  isRunning: this._isRunning,
  sampleCount,
  accumulatedSamples,
  timestamp,
  stackTrace: stackTrace?.split('\n').slice(1, 5).join('\n')
})
```

**What this shows:**
- **ERROR-level log** if stopped with < 10 samples (premature)
- Complete stack trace showing WHO called stop()
- All relevant state flags
- Timestamps for timing analysis

## How to Use These Diagnostics

### Step 1: Open Browser Console
Press F12 and go to Console tab

### Step 2: Load Model
Load your airport model (`blosm_.glb`)

### Step 3: Start Path Tracer
Click the "Start" button in the path tracer panel

### Step 4: Watch Console
Look for these messages:

#### ✅ **Normal Operation (What You SHOULD See):**
```
[PathTracerDemo] ✅ Path tracer ready - starting render loop
[PathTracerDemo] 📊 Pre-render state: {sampleCount: 0, ...}
[PathTracerDemo] 📊 Pre-render state: {sampleCount: 1, ...}
[PathTracerDemo] 📊 Pre-render state: {sampleCount: 2, ...}
...
[PathTracerDemo] ⏸️ Max samples reached - pausing for capture {sampleCount: 64, ...}
```

#### ❌ **Premature Exit (What You're Experiencing):**
```
[PathTracerDemo] ✅ Path tracer ready - starting render loop
[PathTracerDemo] 📊 Pre-render state: {sampleCount: 0, ...}
[PathTracerDemo] 📊 Pre-render state: {sampleCount: 1, ...}
[PathTracerDemo] 📊 Pre-render state: {sampleCount: 2, ...}
❌ [PathTracerDemo] 🛑 stop() called (⚠️ PREMATURE STOP - only 3 samples!)
   {
     force: false,
     sampleCount: 3,
     stackTrace: "at PathTracerDemo.stop (PathTracerDemo.ts:2095)
                  at PathTracerDemoPanel.useEffect (PathTracerDemoPanel.tsx:...)
                  at ...WHO CALLED IT..."
   }
```

**OR:**

```
❌ [PathTracerDemo] ❌ RENDER LOOP STOPPED UNEXPECTEDLY - _isRunning is false
   {
     sampleCount: 3,
     pausedAtMax: false,
     maxSamplesReached: false,
     ...
   }
   Stack trace at loop exit
```

### Step 5: Analyze Stack Trace

The stack trace will show you **exactly what caused the premature stop**:

- **If stack shows PathTracerDemoPanel cleanup:** React is unmounting too early
- **If stack shows handleStop:**User clicked stop button (or button triggered programmatically)
- **If stack shows WebGL context loss:** GPU/browser issue
- **If NO stop() call but loop exits:** `_isRunning` being set false elsewhere

## Expected Sample Count Timeline

For 64 samples at ~60fps:
- **Sample 0-5:** First second (should see these logs)
- **Sample 10:** ~0.17 seconds
- **Sample 30:** ~0.5 seconds  
- **Sample 60:** ~1 second
- **Sample 64:** ~1.07 seconds = COMPLETE

**If stopping at sample 2-3, something is killing it within the first 50ms!**

## Common Culprits

### 1. React useEffect Cleanup Triggered Too Early

```typescript
useEffect(() => {
  // ... path tracer setup ...
  return () => {
    pathTracer.stop(true)  // ❌ This might be running on state change!
  }
}, [someStateThatChanges])  // ❌ If this changes, cleanup runs!
```

**Fix:** Only depend on `viewer` in the PathTracerDemoPanel useEffect

### 2. Viewer Re-initialization

If the viewer ref changes during render, the panel cleanup runs and stops the path tracer.

### 3. State Updates Causing Re-render

Panel state like `status`, `sampleCount`, etc. updating might trigger cleanup if dependencies are wrong.

## Next Steps

1. **Run the path tracer** with dev server at http://localhost:3001
2. **Check browser console** for the new error-level logs
3. **Copy the full stack trace** from the console
4. **Report back** with:
   - Sample count when it stopped
   - Full stack trace showing who called stop()
   - Any other error messages

This will tell us **exactly** what's causing the premature exit and allow me to fix it.

## Files Modified

- `src/viewer/pathTracer/PathTracerDemo.ts`:
  - Enhanced render loop exit logging (line ~2067)
  - Enhanced stop() call logging (line ~2099-2108)
  - Added stack traces and error-level logs for premature stops














