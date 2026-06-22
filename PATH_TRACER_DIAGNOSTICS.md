# Path Tracer Diagnostics for Large Airport Model

## Issue Summary
Path tracer completes 64/64 samples but shows blank/gray canvas. Model is extremely large (23,144 units across).

## Sample Counting - VERIFIED CORRECT ✅
- Line 2580-2583: `getSampleCount()` returns `Math.ceil(this.pathTracer.samples)`
- Line 307-308: Each `renderSample()` increments `accumulatedSamples++`
- **Samples ≠ Tiles**: Tiles are 2x2 grid subdivision (default), samples are ray bounces

## Diagnostic Commands to Run

### 1. Check Camera Position vs Model Bounds
Open browser console and run:
```javascript
// Get current camera info
const viewer = window.__viewer || window.sharedViewer
console.log('Camera:', {
  position: viewer.camera.position,
  near: viewer.camera.near,
  far: viewer.camera.far
})

// Get scene bounds
const bbox = new THREE.Box3().setFromObject(viewer.scene)
console.log('Scene bounds:', {
  min: bbox.min,
  max: bbox.max,
  size: bbox.getSize(new THREE.Vector3()),
  center: bbox.getCenter(new THREE.Vector3())
})

// Check if camera is inside model or too far away
const center = bbox.getCenter(new THREE.Vector3())
const distance = viewer.camera.position.distanceTo(center)
console.log('Camera distance from center:', distance)
```

### 2. Check Path Tracer Camera Sync
```javascript
const pt = window.__pathTracerDemo
if (pt) {
  console.log('PathTracer camera:', {
    position: pt.camera?.position,
    rotation: pt.camera?.rotation,
    aspect: pt.camera?.aspect,
    fov: pt.camera?.fov
  })
}
```

### 3. Test Different Quality Presets
```javascript
// Try each preset and observe results:
// Fast: 2 bounces, 1x resolution
// Balanced: 4 bounces, 1x resolution  
// High: 10 bounces, 1x resolution
// Ultra: 10 bounces, 2x resolution
```

### 4. Check Render Output
```javascript
const pt = window.__pathTracerDemo
if (pt && pt.pathTracer) {
  console.log('PathTracer state:', {
    samples: pt.pathTracer.samples,
    tiles: `${pt.pathTracer.tiles.x}x${pt.pathTracer.tiles.y}`,
    renderScale: pt.pathTracer.renderScale,
    target: pt.pathTracer.target,
    targetSize: pt.pathTracer.target ? 
      `${pt.pathTracer.target.width}x${pt.pathTracer.target.height}` : 'null'
  })
}
```

## Likely Issues

### 1. Camera Far Plane Clipping (MOST LIKELY)
Your model is **23,144 units across**. Default camera far plane might be 1000-2000, which would clip the model.

**Fix:**
```javascript
// Increase camera far plane
window.__viewer.camera.far = 100000
window.__viewer.camera.updateProjectionMatrix()
```

### 2. Camera Too Far Away
The framing puts camera at 57,860 units away. At this distance with default settings, the model might not render correctly in path tracer.

**Fix:**
```javascript
// Frame model closer
const bbox = new THREE.Box3().setFromObject(window.__viewer.scene)
const center = bbox.getCenter(new THREE.Vector3())
const size = bbox.getSize(new THREE.Vector3())
window.__viewer.camera.position.set(
  center.x + size.x * 0.5,
  center.y + size.y * 0.5,
  center.z + size.z * 1.5
)
window.__viewer.camera.lookAt(center)
```

### 3. Tiles Setting Too High
With 4 tiles, each tile must render the entire model. For such a large model, try reducing tiles.

**Fix:** In UI, set Tiles to 1 or 2.

### 4. Environment/Lighting
The gradient fallback environment might be too dark for outdoor scenes.

## Test Procedure

1. **Before starting path tracer:**
   ```javascript
   // Set up proper camera
   const viewer = window.__viewer
   viewer.camera.far = 100000
   viewer.camera.updateProjectionMatrix()
   
   // Frame model
   const bbox = new THREE.Box3().setFromObject(viewer.scene)
   const center = bbox.getCenter(new THREE.Vector3())
   const size = bbox.getSize(new THREE.Vector3())
   const maxDim = Math.max(size.x, size.y, size.z)
   viewer.camera.position.set(
     center.x,
     center.y + maxDim * 0.3,
     center.z + maxDim * 0.8
   )
   viewer.camera.lookAt(center)
   ```

2. **Start path tracer with minimal settings:**
   - Quality: Fast (2 bounces)
   - Resolution: 1080p (1x scale)
   - Tiles: 2
   - Max Samples: 16 (quick test)

3. **Click Start and watch console for:**
   - "renderToCanvasCallback called" messages
   - Any viewport/render target warnings
   - Sample count incrementing 0→1→2→...→16

4. **If still blank, download image** to check if it rendered but isn't displaying

## Perplexity Research Query

```
WebGL path tracer shows blank canvas after completing samples for large 3D model (23km size). 
Using three-gpu-pathtracer library with WebGLPathTracer class.
- Model: 3.5M triangles, 23,144 units across
- Camera distance: 57,860 units from center  
- Path tracer completes 64/64 samples successfully
- renderToCanvasCallback is called (logs show correct execution)
- quad.material.map is set correctly
- Viewport is correct (2018x1019)
- No WebGL errors

Possible causes:
1. Camera far plane clipping large scenes?
2. Path tracer camera not syncing with viewport camera?
3. Tiles rendering incorrectly for large models?
4. Alpha blending issues with renderToCanvasCallback?

How to debug blank path traced output when renderSample() completes successfully?
```














