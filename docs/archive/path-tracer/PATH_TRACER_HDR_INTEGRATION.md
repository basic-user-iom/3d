# Path Tracer + HDR Integration

## Problem
Path tracer was not using HDR environment maps, showing only a gray background instead of the HDR environment.

## Root Cause
1. **PathTracerDemo was overriding HDR environment**: The `setupEnvironment()` method was setting `scene.environment` to a gradient map, overriding the HDR environment set by HDRSystem.
2. **No environment update on HDR load**: When HDR was loaded, the path tracer wasn't notified to update its environment.

## Solution

### 1. Modified `setupEnvironment()` to check for HDR
- Now checks if `scene.environment` already exists (from HDR)
- Only sets gradient fallback if no HDR environment is present
- Doesn't override existing HDR environment

### 2. Updated `initialize()` to use HDR
- After `setScene()`, checks if HDR environment exists
- If HDR exists, calls `updateEnvironment()` to use it
- If no HDR, sets up gradient fallback

### 3. Added HDR update notification
- When HDR is loaded in ViewerCanvas, it now notifies the path tracer
- Path tracer updates its environment when HDR changes
- Uses `window.__pathTracerDemo` to access the path tracer instance

## Implementation Details

### PathTracerDemo.ts Changes:
```typescript
// setupEnvironment() now checks for HDR first
private setupEnvironment(): void {
  if (this.scene.environment && this.scene.environment !== this.gradientMap) {
    // HDR environment exists - use it
    return
  }
  // No HDR - use gradient fallback
  // ...
}

// initialize() updates environment after setScene
if (this.scene.environment && this.scene.environment !== this.gradientMap) {
  this.pathTracer.updateEnvironment() // Use HDR
} else {
  this.setupEnvironment() // Use gradient
  this.pathTracer.updateEnvironment()
}
```

### ViewerCanvas.tsx Changes:
```typescript
// After HDR is loaded, notify path tracer
const pathTracerDemo = (window as any).__pathTracerDemo
if (pathTracerDemo && typeof pathTracerDemo.updateEnvironment === 'function') {
  pathTracerDemo.updateEnvironment()
}
```

## How It Works

1. **HDR Loads First**: HDRSystem sets `scene.environment = pmremEnvMap`
2. **Path Tracer Initializes**: Checks if `scene.environment` exists
3. **Uses HDR**: If HDR exists, path tracer uses it via `updateEnvironment()`
4. **HDR Changes**: When HDR is loaded/changed, path tracer is notified and updates

## Testing

1. Enable HDR in Lighting Panel
2. Load an HDR file
3. Start path tracer
4. Path tracer should now use HDR environment for lighting and reflections
5. Background should show HDR (if `hdrBackgroundVisible` is enabled)

## Notes

- Path tracer uses `scene.environment` for environment lighting
- HDRSystem sets `scene.environment` to PMREM cube map
- Path tracer's `updateEnvironment()` reads from `scene.environment`
- GroundedSkybox is automatically excluded from path tracing (to prevent dark areas)















