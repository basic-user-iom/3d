# Critical Bugs Fixes - Based on Perplexity Research

**Date:** 2025-01-27  
**Source:** Perplexity AI research + code analysis

---

## BUG #1: Screen Space Shadows (SSS) - Testing Required

### Perplexity Findings

**Key Issues:**
1. SSS requires proper depth texture connection and light direction transformation
2. Intensity may be too low to be visible (especially with shadow maps active)
3. Light direction must be in view space, not world space
4. Depth texture must be properly formatted and connected

### Current Implementation Analysis

**✅ What's Working:**
- Depth prepass is rendering correctly
- Depth texture is being connected to `tDepth` uniform
- Light direction is being transformed from world to view space (line 496)
- Intensity multiplier is applied when shadow maps are active (line 460)

**⚠️ Potential Issues:**
1. **Intensity too low:** Default intensity multiplier is 0.2 (20%) when shadow maps are active, which may be too low to see
2. **Testing needed:** Algorithm is fixed but needs visual verification

### Recommended Fixes

#### Fix 1: Increase Default Intensity for Testing
```typescript
// In PostProcessingSystem.ts updateSSSParameters()
// Change default multiplier from 0.2 to 0.5 for better visibility during testing
const intensityMultiplier = sss.shadowMapIntensityMultiplier ?? 0.5 // Changed from 0.2
```

#### Fix 2: Add Visual Debug Mode
```typescript
// Enable debug mode to visualize depth texture
// In browser console:
const postProcessingSystem = window.viewerRef?.current?.postProcessingSystem
if (postProcessingSystem?.sssPass) {
  postProcessingSystem.sssPass.uniforms.debugMode.value = 1.0
  // This should show depth visualization
}
```

#### Fix 3: Verify Depth Texture Format
```typescript
// Add verification in updateSSSParameters()
if (uniforms.tDepth.value) {
  const depthTexture = uniforms.tDepth.value
  console.log('[SSS Debug] Depth texture:', {
    width: depthTexture.image?.width,
    height: depthTexture.image?.height,
    format: depthTexture.format,
    type: depthTexture.type
  })
}
```

### Testing Steps

1. **Enable SSS in UI:** Quality → Effects → SSS
2. **Increase intensity:** Set to 1.0 or higher
3. **Check console:** Look for depth texture connection logs
4. **Enable debug mode:** Set `debugMode = 1.0` to visualize depth
5. **Verify light direction:** Ensure light is casting shadows in the scene

---

## BUG #2: Screen Space Reflections (SSR) - Not Working

### Perplexity Findings

**Key Issues:**
1. SSR requires both depth AND normal textures properly connected
2. Normal texture encoding/decoding must be correct (0-1 to -1 to 1)
3. Camera matrices must be updated every frame
4. View space to screen space projection must be correct

### Current Implementation Analysis

**✅ What's Working:**
- Depth prepass is rendering
- Normal prepass is rendering
- Textures are being connected (lines 1193-1236)
- Normal decoding is correct: `normal * 2.0 - 1.0` (SSRShader.ts line 82)
- Camera matrices are updated every frame (lines 1178-1184)

**⚠️ Potential Issues:**
1. **Camera projection matrix:** May need to be set directly, not inverted
2. **Texture format:** May need float textures for proper depth/normal storage
3. **tDiffuse connection:** May not be getting the correct buffer from composer

### Recommended Fixes

#### Fix 1: Fix Camera Projection Matrix
```typescript
// In updateSSRParameters() - line 1179
// Current code inverts projection matrix, but we should store both
const projMatrix = this.camera.projectionMatrix.clone()
uniforms.cameraProjectionMatrix.value.copy(projMatrix) // ADD THIS
uniforms.cameraProjectionMatrixInverse.value.copy(projMatrix.invert())
```

#### Fix 2: Verify Texture Formats
```typescript
// Add texture format verification
if (this.depthRenderTarget) {
  console.log('[SSR Debug] Depth texture format:', {
    format: this.depthRenderTarget.texture.format,
    type: this.depthRenderTarget.texture.type,
    minFilter: this.depthRenderTarget.texture.minFilter,
    magFilter: this.depthRenderTarget.texture.magFilter
  })
}
```

#### Fix 3: Ensure tDiffuse is Connected from Correct Buffer
```typescript
// In render() method - line 391
// Ensure we're getting the buffer AFTER RenderPass, not before
if (this.composer && this.composer.readBuffer && this.composer.readBuffer.texture) {
  uniforms.tDiffuse.value = this.composer.readBuffer.texture
} else if (this.renderPass && (this.renderPass as any).renderTarget) {
  // Fallback: get from RenderPass render target
  uniforms.tDiffuse.value = (this.renderPass as any).renderTarget.texture
}
```

#### Fix 4: Add SSR Debug Visualization
```typescript
// Add to SSRShader.ts fragment shader for debugging
// Temporarily return depth or normal to verify textures
// In fragment shader main():
// gl_FragColor = vec4(texture2D(tDepth, vUv).rgb, 1.0); // Debug depth
// gl_FragColor = vec4(texture2D(tNormal, vUv).rgb, 1.0); // Debug normal
```

### Testing Steps

1. **Enable SSR in UI:** Quality → Effects → SSR
2. **Increase intensity:** Set to 1.0
3. **Check console:** Look for texture connection logs
4. **Verify matrices:** Check that camera matrices are updating
5. **Test with reflective materials:** Use materials with high roughness for visible reflections

---

## BUG #3: Path Tracer GPU Mode - Broken

### Perplexity Findings

**Key Issues:**
1. Shader compilation is expensive and should be separated from uniform updates
2. WebGL 2.0 requires proper shader compilation error checking
3. Lazy shader compilation may need multiple frames to complete
4. KHR_parallel_shader_compile extension can help with non-blocking compilation

### Current Implementation Analysis

**✅ What's Working:**
- WebGL 2.0 context is verified
- Error detection is implemented
- Retry logic with exponential backoff exists
- CPU fallback works

**⚠️ Potential Issues:**
1. **Shader compilation timing:** May need more frames to wait
2. **Error checking:** Not using `getShaderInfoLog()` for detailed errors
3. **Extension support:** Not checking for KHR_parallel_shader_compile

### Recommended Fixes

#### Fix 1: Enhanced Shader Error Logging
```typescript
// In PathTracerDemo.ts initialize() method
// Add detailed shader error checking
const gl = this.renderer.getContext() as WebGL2RenderingContext

// Check for shader compilation errors
const program = (this.pathTracer as any).program // Access internal program if available
if (program) {
  const linkStatus = gl.getProgramParameter(program, gl.LINK_STATUS)
  if (!linkStatus) {
    const infoLog = gl.getProgramInfoLog(program)
    console.error('[PathTracerDemo] Program link error:', infoLog)
    
    // Try to get vertex shader info
    const vertexShader = gl.getAttachedShaders(program)?.[0]
    if (vertexShader) {
      const vertexInfo = gl.getShaderInfoLog(vertexShader)
      if (vertexInfo) console.error('[PathTracerDemo] Vertex shader error:', vertexInfo)
    }
    
    // Try to get fragment shader info
    const fragmentShader = gl.getAttachedShaders(program)?.[1]
    if (fragmentShader) {
      const fragmentInfo = gl.getShaderInfoLog(fragmentShader)
      if (fragmentInfo) console.error('[PathTracerDemo] Fragment shader error:', fragmentInfo)
    }
  }
}
```

#### Fix 2: Check for Parallel Shader Compile Extension
```typescript
// Add extension check for better compilation
const gl = this.renderer.getContext() as WebGL2RenderingContext
const parallelShaderCompile = gl.getExtension('KHR_parallel_shader_compile')

if (parallelShaderCompile) {
  console.log('[PathTracerDemo] ✅ KHR_parallel_shader_compile extension available')
  // Can use non-blocking compilation
} else {
  console.warn('[PathTracerDemo] ⚠️ KHR_parallel_shader_compile not available - compilation may be slower')
}
```

#### Fix 3: Increase Wait Frames for Shader Compilation
```typescript
// Increase wait frames for lazy compilation
// Current: 1 frame, try 3-5 frames
for (let frame = 0; frame < 5; frame++) {
  await new Promise(resolve => requestAnimationFrame(resolve))
  
  // Check if shaders are compiled
  const error = gl.getError()
  if (error === gl.NO_ERROR) {
    // Additional check: try to render a sample
    try {
      this.pathTracer.renderSample()
      const renderError = gl.getError()
      if (renderError === gl.NO_ERROR) {
        console.log(`[PathTracerDemo] ✅ Shaders compiled after ${frame + 1} frames`)
        break
      }
    } catch (e) {
      // Continue waiting
    }
  }
}
```

#### Fix 4: Check WebGL 2.0 Extensions Required
```typescript
// Verify required extensions are available
const requiredExtensions = [
  'EXT_color_buffer_float',
  'OES_texture_float_linear',
  'WEBGL_depth_texture'
]

const availableExtensions = requiredExtensions.map(ext => {
  const available = !!gl.getExtension(ext)
  if (!available) {
    console.warn(`[PathTracerDemo] ⚠️ Required extension not available: ${ext}`)
  }
  return { extension: ext, available }
})

console.log('[PathTracerDemo] WebGL 2.0 Extensions:', availableExtensions)
```

### Testing Steps

1. **Open browser console:** Check for extension availability
2. **Try GPU mode:** Enable in Path Tracer panel
3. **Check error logs:** Look for detailed shader compilation errors
4. **Wait longer:** Give shaders more time to compile (5+ frames)
5. **Check GPU drivers:** Ensure GPU drivers are up to date

---

## BUG #4: Primitives Face Editing - Geometry Not Updating

### Perplexity Findings

**Key Issues:**
1. Must dispose old geometry before replacing
2. Must update mesh geometry property directly
3. May need to update bounding box/sphere
4. Scene may need manual re-render trigger

### Current Implementation Analysis

**✅ What's Working:**
- Face detection works correctly
- Geometry extrusion function creates new geometry
- Distance calculation is correct

**⚠️ Potential Issues:**
1. **Geometry not being assigned:** New geometry is created but not assigned to mesh
2. **Old geometry not disposed:** Memory leak and potential rendering issues
3. **Bounding box not updated:** Frustum culling may hide updated geometry

### Recommended Fixes

#### Fix 1: Properly Update Mesh Geometry
```typescript
// In ViewerCanvas.tsx - find where performFaceExtrusion is called
// Need to find the function that calls extrudeFaceGeneric and update it

// After creating new geometry:
function updateMeshGeometry(mesh: THREE.Mesh, newGeometry: THREE.BufferGeometry) {
  // 1. Dispose old geometry
  if (mesh.geometry) {
    mesh.geometry.dispose()
  }
  
  // 2. Assign new geometry
  mesh.geometry = newGeometry
  
  // 3. Update bounding box and sphere (critical for rendering)
  mesh.geometry.computeBoundingBox()
  mesh.geometry.computeBoundingSphere()
  
  // 4. Update matrix world (ensures transforms are correct)
  mesh.updateMatrixWorld(true)
  
  // 5. Force renderer update (if needed)
  // The render loop should pick this up automatically, but we can force it
  console.log('[FaceEdit] ✅ Geometry updated:', {
    vertices: mesh.geometry.attributes.position.count,
    boundingBox: mesh.geometry.boundingBox,
    boundingSphere: mesh.geometry.boundingSphere
  })
}
```

#### Fix 2: Find performFaceExtrusion Function
```typescript
// Search for performFaceExtrusion in ViewerCanvas.tsx
// It should call extrudeFaceGeneric and then update the mesh
// Example implementation:

function performFaceExtrusion(distance: number, options: any) {
  const faceEditInfo = (window as any).__faceEditInfo
  if (!faceEditInfo || !faceEditInfo.mesh) return
  
  // Create new geometry
  const newGeometry = extrudeFaceGeneric({
    mesh: faceEditInfo.mesh,
    faceIndex: faceEditInfo.faceIndex,
    distance: distance,
    worldNormal: faceEditInfo.worldNormal,
    originalGeometry: faceEditInfo.originalGeometry,
    originalMatrixWorld: faceEditInfo.originalMatrixWorld
  })
  
  // FIX: Update mesh geometry properly
  updateMeshGeometry(faceEditInfo.mesh, newGeometry)
  
  // Update faceEditInfo
  faceEditInfo.currentDistance = distance
  faceEditInfo.geometry = newGeometry // Store reference
}
```

#### Fix 3: Verify Geometry Update in Console
```typescript
// Add debugging to verify geometry is updating
console.log('[FaceEdit] Before update:', {
  vertices: mesh.geometry.attributes.position.count,
  boundingBox: mesh.geometry.boundingBox
})

// After update
console.log('[FaceEdit] After update:', {
  vertices: mesh.geometry.attributes.position.count,
  boundingBox: mesh.geometry.boundingBox,
  sameReference: mesh.geometry === oldGeometry // Should be false
})
```

### Testing Steps

1. **Select primitive:** Click on a box primitive
2. **Enable face edit mode:** Click face edit button
3. **Click and drag face:** Should see geometry update
4. **Check console:** Look for geometry update logs
5. **Verify visually:** Geometry should change shape immediately

---

## Implementation Priority

1. **BUG #4 (Face Editing)** - Most straightforward fix, clear issue
2. **BUG #1 (SSS)** - Mostly working, just needs testing/verification
3. **BUG #2 (SSR)** - Needs matrix and texture connection fixes
4. **BUG #3 (Path Tracer GPU)** - Most complex, may need library updates

---

## Next Steps

1. Implement fixes in order of priority
2. Test each fix individually
3. Update todo list as bugs are fixed
4. Document any additional findings














