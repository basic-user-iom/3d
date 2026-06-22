# SSS and SSR Best Practices & Troubleshooting Guide
## Based on Perplexity Research & Implementation Analysis

---

## 1. ✅ Ping-Pong Buffering & Feedback Loop Prevention

### How EffectComposer Manages Buffers

**Key Concept**: EffectComposer uses ping-pong buffering to prevent feedback loops by alternating between two render targets.

```javascript
// EffectComposer maintains two buffers internally
this.readBuffer = new WebGLRenderTarget(width, height, options);
this.writeBuffer = new WebGLRenderTarget(width, height, options);

// After each pass, buffers swap
const temp = this.readBuffer;
this.readBuffer = this.writeBuffer;
this.writeBuffer = temp;
```

### ✅ Our Implementation (Correct)

**In SSR Render Override:**
```typescript
// CRITICAL: Set tDiffuse FIRST from readBuffer before any checks
// This ensures we're always reading from the correct buffer (previous pass output)
uniforms.tDiffuse.value = readBuffer.texture

// CRITICAL: Prevent feedback loop - check if readBuffer and writeBuffer are the same
if (writeBuffer.texture === readBuffer.texture) {
  console.warn('Feedback loop detected, skipping render')
  return
}
```

**Why This Works:**
- `tDiffuse` always reads from `readBuffer` (output of previous pass)
- Each pass writes to `writeBuffer` (different buffer)
- After pass completes, EffectComposer swaps buffers
- Next pass reads from what was the write buffer

### ❌ Common Mistakes

1. **Setting tDiffuse too early**: Setting `tDiffuse` in `render()` method before EffectComposer swaps buffers
2. **Not checking for feedback loops**: Assuming buffers are always different
3. **Using writeBuffer.texture as input**: This creates a feedback loop

---

## 2. ✅ Shader Uniform Management

### Critical Uniforms for SSR

**Camera Matrices** (All Required):
```typescript
// ✅ CORRECT - All three matrices set
uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix)
uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()
uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()
```

**Common Issue**: Missing `cameraProjectionMatrix`
- **Symptom**: Shader compilation fails with "uniform not found" or "INVALID_OPERATION"
- **Fix**: Always set all three camera matrices in `updateSSRParameters()`

### Texture Uniforms

**SSS Requires:**
- `tDiffuse`: Previous pass output (set by EffectComposer)
- `tDepth`: Depth prepass texture (from `depthRenderTarget.texture`)

**SSR Requires:**
- `tDiffuse`: Previous pass output (set by EffectComposer)
- `tDepth`: Depth prepass texture (from `depthRenderTarget.texture`)
- `tNormal`: Normal prepass texture (from `normalRenderTarget.texture`)

### ✅ Best Practice: Set Uniforms in Render Override

```typescript
// Set textures right before rendering (ensures they're fresh)
uniforms.tDepth.value = this.depthRenderTarget.texture
uniforms.tNormal.value = this.normalRenderTarget.texture
uniforms.tDiffuse.value = readBuffer.texture // From EffectComposer
```

---

## 3. ✅ Depth & Normal Prepass Management

### Depth Prepass

**Purpose**: Extract normalized linear depth (0 = near, 1 = far)

**Key Implementation Details:**
```glsl
// Fragment shader calculates linear depth
float linearDepth = -vViewPosition.z;
float normalizedLinearDepth = (linearDepth - cameraNear) / (cameraFar - cameraNear);
gl_FragColor = vec4(normalizedLinearDepth, 0.0, 0.0, 1.0);
```

**Why Normalized Linear Depth:**
- Easier to work with in shaders (0-1 range)
- Better precision distribution
- Works with any camera near/far values

### Normal Prepass

**Purpose**: Extract view space normals for SSR ray marching

**Key Implementation Details:**
```glsl
// Vertex shader: Transform to view space
vNormal = normalize(normalMatrix * normal);

// Fragment shader: Encode to 0-1 range
vec3 normal = normalize(vNormal);
gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0); // Encode: -1 to 1 -> 0 to 1
```

**Why View Space:**
- SSR ray marching happens in view space
- Avoids world-to-view transformations in fragment shader
- More efficient

### ✅ Prepass Render Timing

```typescript
// CRITICAL: Render prepasses BEFORE composer
if (this.depthRenderPass && this.depthRenderTarget) {
  this.depthRenderPass.render(this.renderer, this.scene, this.camera, this.depthRenderTarget)
}

if (this.normalRenderPass && this.normalRenderTarget) {
  this.normalRenderPass.render(this.renderer, this.scene, this.camera, this.normalRenderTarget)
}

// Then render composer (which uses prepass textures)
this.composer.render()
```

---

## 4. ✅ Ray Marching Best Practices

### SSS Ray Marching

**Key Parameters:**
- `samples`: Number of ray steps (8-16 recommended for performance)
- `maxRadius`: Screen-space search radius (3-5 recommended)
- `rayDistance`: Maximum world-space distance (50-100 recommended)
- `thickness`: Shadow penumbra size (0.02 recommended)

**Performance Optimization:**
```glsl
// Early exit for background/sky
if (currentDepth >= 0.999) {
  return 0.0;
}

// Skip self-comparison (start from i=1)
for (int i = 1; i < 64; i++) {
  if (i > samples) break;
  // ... ray marching logic
}
```

### SSR Ray Marching

**Key Parameters:**
- `maxSteps`: Ray march steps (20-30 recommended)
- `maxBinarySearchSteps`: Binary search refinement (8 recommended)
- `maxDistance`: Maximum reflection distance (80-100 recommended)
- `thickness`: Intersection thickness (0.01 recommended)

**Two-Phase Approach:**
1. **Ray March**: Coarse search for intersection
2. **Binary Search**: Fine refinement for accurate hit point

```glsl
// Phase 1: Ray march
float hitDepth = rayMarch(reflectDir, hitCoord);

// Phase 2: Binary search (if intersection found)
if (hitDepth < 1.0) {
  binarySearch(dir, hitCoord, depthDiff);
}
```

---

## 5. ⚠️ Common Issues & Solutions

### Issue 1: Shader Compilation Failure

**Symptoms:**
- `INVALID_OPERATION: useProgram: program not valid`
- `Shader compilation failed - program not created`

**Common Causes:**
1. Missing uniform (e.g., `cameraProjectionMatrix`)
2. Uniform type mismatch
3. GLSL syntax error

**Solutions:**
```typescript
// ✅ Always set all required uniforms
uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix)
uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()
uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()

// ✅ Validate shader compilation
const isLinked = gl.getProgramParameter(program, gl.LINK_STATUS)
if (!isLinked) {
  const programInfo = gl.getProgramInfoLog(program)
  console.error('Shader link error:', programInfo)
}
```

### Issue 2: Feedback Loop Detected

**Symptoms:**
- `Feedback loop detected (tDiffuse = writeBuffer), skipping render`
- Black screen or artifacts

**Solutions:**
```typescript
// ✅ Set tDiffuse from readBuffer at start of render override
uniforms.tDiffuse.value = readBuffer.texture

// ✅ Check for feedback loop before rendering
if (readBuffer.texture === writeBuffer.texture) {
  console.warn('Feedback loop detected, skipping render')
  return
}
```

### Issue 3: No Shadows/Reflections Visible

**Common Causes:**
1. Intensity too low
2. Light direction incorrect
3. Depth texture not connected
4. Samples/steps too low

**Solutions:**
```typescript
// ✅ Verify textures are connected
console.log('SSS textures:', {
  tDepth: !!uniforms.tDepth.value,
  tDiffuse: !!uniforms.tDiffuse.value
})

// ✅ Check intensity (should be > 0.1 to be visible)
if (uniforms.intensity.value < 0.1) {
  console.warn('Intensity too low, increase to see effect')
}

// ✅ Verify light direction (should be normalized)
const lightDir = uniforms.lightDirection.value
if (lightDir.length() < 0.1) {
  console.warn('Light direction too small')
}
```

### Issue 4: Performance Issues

**Symptoms:**
- Low FPS when SSS/SSR enabled
- Frame drops

**Optimizations:**
```typescript
// ✅ Reduce samples/steps for better performance
sssSamples: 8,        // Instead of 64
ssrMaxSteps: 20,      // Instead of 100

// ✅ Only render prepasses when needed
if (this.config.sss?.enabled || this.config.ssr?.enabled) {
  // Render prepasses
}

// ✅ Use lower resolution for prepasses (optional)
const prepassWidth = width * 0.5  // Half resolution
const prepassHeight = height * 0.5
```

---

## 6. ✅ Performance Recommendations

### Quality Presets

**Low Quality (60+ FPS):**
- SSS Samples: 4-8
- SSR Max Steps: 10-15
- SSR Max Binary Search Steps: 4

**Medium Quality (30-60 FPS):**
- SSS Samples: 8-16
- SSR Max Steps: 20-30
- SSR Max Binary Search Steps: 8

**High Quality (<30 FPS):**
- SSS Samples: 16-32
- SSR Max Steps: 30-50
- SSR Max Binary Search Steps: 8-16

### Adaptive Quality

```typescript
// Adjust quality based on FPS
const targetFPS = 60
const currentFPS = getCurrentFPS()

if (currentFPS < targetFPS * 0.8) {
  // Reduce quality
  sssSamples = Math.max(4, sssSamples * 0.8)
  ssrMaxSteps = Math.max(10, ssrMaxSteps * 0.8)
} else if (currentFPS > targetFPS * 1.2) {
  // Increase quality
  sssSamples = Math.min(32, sssSamples * 1.2)
  ssrMaxSteps = Math.min(50, ssrMaxSteps * 1.2)
}
```

---

## 7. ✅ Testing & Debugging

### Debug Modes

**SSS Debug Modes:**
```typescript
// Depth visualization
postProcessingSystem.sssPass.uniforms.debugMode.value = 1.0

// Shadow visualization
postProcessingSystem.sssPass.uniforms.debugMode.value = 2.0

// Raw texture RGB
postProcessingSystem.sssPass.uniforms.debugMode.value = 3.0
```

### Validation Checks

```typescript
// Check if textures are connected
const uniforms = postProcessingSystem.sssPass.uniforms
console.log('SSS Textures:', {
  tDepth: !!uniforms.tDepth.value,
  tDiffuse: !!uniforms.tDiffuse.value,
  hasDepthImage: !!uniforms.tDepth.value?.image
})

// Check if SSR textures are connected
const ssrUniforms = postProcessingSystem.ssrPass.uniforms
console.log('SSR Textures:', {
  tDepth: !!ssrUniforms.tDepth.value,
  tNormal: !!ssrUniforms.tNormal.value,
  tDiffuse: !!ssrUniforms.tDiffuse.value
})

// Check camera matrices
console.log('SSR Camera Matrices:', {
  hasProjection: !!ssrUniforms.cameraProjectionMatrix.value,
  hasProjectionInverse: !!ssrUniforms.cameraProjectionMatrixInverse.value,
  hasViewInverse: !!ssrUniforms.cameraViewMatrixInverse.value
})
```

---

## 8. 📋 Summary of Best Practices

### ✅ DO:
1. Set `tDiffuse` from `readBuffer.texture` at start of render override
2. Check for feedback loops before rendering
3. Set all camera matrices for SSR
4. Render prepasses before composer
5. Use normalized linear depth (0-1 range)
6. Transform normals to view space
7. Validate shader compilation with error logging
8. Use reasonable sample/step counts for performance

### ❌ DON'T:
1. Set `tDiffuse` in `render()` method (before EffectComposer buffer swap)
2. Use `writeBuffer.texture` as input
3. Skip feedback loop checks
4. Forget to set `cameraProjectionMatrix` uniform
5. Use world space normals in SSR
6. Use non-linear depth (gl_FragCoord.z directly)
7. Use excessive samples/steps without performance monitoring
8. Render prepasses when SSS/SSR are disabled

---

## 9. 🔧 Quick Reference

### SSS Parameters (Recommended)
```typescript
{
  enabled: true,
  intensity: 0.8,
  maxRadius: 3.0,
  samples: 8,
  rayDistance: 50.0,
  thickness: 0.02,
  bias: 0.01,
  lightDirection: new THREE.Vector3(0, -1, 0)
}
```

### SSR Parameters (Recommended)
```typescript
{
  enabled: true,
  intensity: 1.0,
  thickness: 0.01,
  maxDistance: 80.0,
  maxSteps: 20,
  maxBinarySearchSteps: 8,
  roughnessFade: 1.0,
  fadeDistance: 15.0,
  fadeMargin: 0.05
}
```

---

**Last Updated**: 2026-01-21
**Based on**: Perplexity research + Implementation analysis
**Status**: ✅ Best Practices Documented
