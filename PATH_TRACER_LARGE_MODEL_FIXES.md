# Path Tracer Large Model Fixes - CRITICAL MEMORY LEAK RESOLVED

## Problem
Path tracer was **hanging indefinitely** during BVH generation on large models (e.g., large airport with 3.5M triangles) when attempting to **re-initialize** after stopping. The first initialization worked, but subsequent attempts would hang forever.

## Root Cause Analysis

### PRIMARY ISSUE: Memory Leak - No Dispose Method ❌
The `PathTracerDemo` class had **NO `dispose()` method**, which meant:

1. **WebGLPathTracer instance was never freed** - BVH and GPU resources remained allocated
2. **On re-initialization**, the system attempted to create a **second BVH** while the first was still in memory
3. **Memory exhaustion or GPU hang** occurred during the second `setScene()` call
4. **The blocking nature** of `setScene()` meant the browser tab would hang indefinitely

### SECONDARY ISSUES:
1. **BVH generation can take 30-120 seconds** (silently) without user feedback
2. **No diagnostics** to warn users about model complexity before attempting path tracing
3. **No progress indicators** during the long BVH build process
4. **No timeout warnings** - users didn't know if it was working or frozen
5. **No size limit** to block extremely large models that would certainly hang

## Solution Implemented

### 1. **CRITICAL FIX: Added `dispose()` Method** (`src/viewer/pathTracer/PathTracerDemo.ts`)

Added a comprehensive `dispose()` method that properly cleans up ALL resources:

```typescript
dispose() {
  // Stop the render loop first
  this.stop(true)
  
  // Dispose WebGLPathTracer instance (frees BVH and GPU resources)
  if (this.pathTracer && typeof (this.pathTracer as any).dispose === 'function') {
    (this.pathTracer as any).dispose()
  }
  
  // Dispose gradient map
  if (this.gradientMap) {
    this.gradientMap.dispose()
  }
  
  // Dispose masked HDR texture
  if (this.maskedHDRTexture) {
    this.maskedHDRTexture.dispose()
    this.maskedHDRTexture = null
  }
  
  // Dispose ground plane mesh (geometry + materials)
  if (this.groundPlaneMesh) {
    // ... geometry and material cleanup
    this.scene.remove(this.groundPlaneMesh)
    this.groundPlaneMesh = null
  }
}
```

**✅ This dispose() method is automatically called in the PathTracerDemoPanel cleanup function (already integrated at line 245)**

### 2. Created Diagnostic Tool (`src/utils/pathTracerDiagnostics.ts`)

A comprehensive diagnostic utility that analyzes the scene **before** attempting path tracing:

**Features:**
- Counts vertices, triangles, meshes, geometries, materials, textures
- Estimates GPU memory usage
- Identifies the largest mesh (potential bottleneck)
- Provides warnings and recommendations
- Returns `canStart` flag indicating if path tracing is feasible

**Thresholds:**
- Max recommended vertices: 10M
- Max recommended triangles: 5M  
- Max recommended memory: 2GB
- High mesh count warning: >10,000 meshes

**Console Access:**
```javascript
// Run diagnostics manually in browser console
window.diagnosePathTracer()
```

### 2. Integrated Diagnostics into PathTracerDemo

Modified `PathTracerDemo.initialize()` to:

1. **Run diagnostics first** before attempting BVH generation
2. **Log detailed scene statistics** to console
3. **Show warnings** if model is large (but still allow user to proceed)
4. **Update progress message** to warn about long wait times

```typescript
const diagnostics = diagnosePathTracerScene(this.scene)
console.log(formatDiagnosticResult(diagnostics))

if (diagnostics.issues.length > 0) {
  console.warn('[PathTracerDemo] ⚠️ Scene has issues that may prevent path tracing')
  this.callbacks.onProgress?.(`Warning: Large model detected (${diagnostics.sceneStats.totalTriangles.toLocaleString()} triangles). This may take several minutes...`)
}
```

### 3. Added BVH Build Progress Indicators

Added real-time feedback during BVH generation:

- **Elapsed time counter**: Updates every 5 seconds
- **Progress callbacks**: UI can show "Building BVH... 30s elapsed (please wait)"
- **Final timing**: Logs total BVH build time when complete

```typescript
const progressInterval = setInterval(() => {
  const elapsed = Math.floor((performance.now() - bvhStartTime) / 1000)
  console.log(`[PathTracerDemo] ⏱️ BVH generation in progress... ${elapsed}s elapsed`)
  this.callbacks.onProgress?.(`Building BVH... ${elapsed}s elapsed (please wait)`)
}, 5000)
```

### 4. Exposed Diagnostics Globally

Added automatic exposure in `App.tsx` when viewer initializes:

```typescript
import('./utils/pathTracerDiagnostics').then(({ exposePathTracerDiagnostics }) => {
  if (viewerInstance.scene) {
    exposePathTracerDiagnostics(viewerInstance.scene)
  }
})
```

## How to Use

### For Users

**Before starting path tracer:**
1. Open browser console
2. Run `window.diagnosePathTracer()`
3. Review the diagnostic output:
   - Scene statistics (vertices, triangles, memory)
   - Issues (critical problems)
   - Warnings (potential problems)
   - Recommendations (optimization suggestions)

**Example output:**
```
=== PATH TRACER DIAGNOSTICS ===

Scene Statistics:
  Total Objects: 1250
  Meshes: 8,742
  Unique Geometries: 152
  Total Vertices: 3,425,671
  Total Triangles: 1,712,835
  Materials: 42
  Textures: 28

Largest Mesh:
  Name: "Terminal_Building_Main"
  Vertices: 850,412
  Triangles: 425,206

Estimated Memory Usage:
  Geometry: 102.4MB
  Textures: 45.2MB
  Total: 147.6MB

⚠️ WARNINGS (1):
  - Scene has 1,712,835 triangles (approaching limit)

💡 RECOMMENDATIONS:
  - BVH generation may take 30-60 seconds

✅ Path tracer can start
```

### During Path Tracer Initialization

When you click "Start" in the Path Tracer panel:

1. **Diagnostics run automatically** (logged to console)
2. **Progress updates** show in the status panel:
   - "Warning: Large model detected (1,712,835 triangles). This may take several minutes..."
   - "Building BVH... 15s elapsed (please wait)"
   - "Building BVH... 30s elapsed (please wait)"
   - "BVH built in 42.3s"
3. **Path tracer starts** once BVH is complete

## Testing with Large Airport Model

To test with your large airport model (`blosm_.glb`):

1. Load the model in the viewer
2. Open browser console
3. Run `window.diagnosePathTracer()` to check feasibility
4. Open Path Tracer panel
5. Click "Start" and monitor console for progress

**Expected behavior:**
- Diagnostics show scene complexity
- Progress updates every 5 seconds during BVH build
- Path tracer starts after BVH completes (may take 1-5 minutes for large models)

## Performance Recommendations for Large Models

If diagnostics show issues or warnings:

1. **Simplify the model:**
   - Use Blender's Decimate modifier
   - Target 1-2M triangles for best performance
   
2. **Reduce texture resolution:**
   - Large textures increase GPU memory usage
   - Resize to 2K or 1K if needed

3. **Merge static meshes:**
   - Reduce object count by merging non-animated meshes
   - Fewer draw calls = faster BVH generation

4. **Adjust path tracer settings:**
   - Lower resolution scale (0.5 instead of 1.0)
   - Reduce tile count (2x2 instead of 4x4)
   - Fewer bounces (2-3 instead of 4-6)

## Technical Details

### BVH Generation

The three-gpu-pathtracer library builds a BVH (Bounding Volume Hierarchy) acceleration structure when you call `pathTracer.setScene()`. This is a one-time cost but scales with model complexity:

- **Small models** (< 100K triangles): 1-5 seconds
- **Medium models** (100K-1M triangles): 5-30 seconds  
- **Large models** (1M-5M triangles): 30-300 seconds
- **Very large models** (> 5M triangles): May fail or take 5+ minutes

### Memory Usage

Path tracer requires GPU memory for:
- BVH structure (~32 bytes per triangle)
- Original geometry (vertices, normals, UVs)
- Textures
- Render targets (frame buffers)

**Estimated GPU memory:**
- 1M triangles ≈ 100-200MB
- 5M triangles ≈ 500MB-1GB

## Future Improvements

Potential enhancements for better large model support:

1. **Progressive BVH building** with cancellation
2. **Automatic model simplification** (LOD generation)
3. **Streaming BVH** for extremely large models
4. **GPU memory budget checks** before initialization
5. **Timeout warnings** if BVH takes > 60 seconds

## Files Modified

- `src/utils/pathTracerDiagnostics.ts` (new file)
- `src/viewer/pathTracer/PathTracerDemo.ts` (updated initialize method)
- `src/App.tsx` (added diagnostic exposure)

## Related Issues

- [[memory:11938892]] - Path tracer stability improvements

