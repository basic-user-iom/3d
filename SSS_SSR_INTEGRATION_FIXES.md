# SSS & SSR Integration Fixes

## Issues Found and Fixes Applied

### 1. ✅ Remove Unnecessary `needsUpdate` Flags

**Issue**: Setting `texture.needsUpdate = true` on textures that are already updated by rendering.

**Location**: `PostProcessingSystem.ts` lines 368, 383, 388

**Fix**:
```typescript
// REMOVE these lines:
this.depthRenderTarget.texture.needsUpdate = true  // Line 368
this.depthRenderTarget.texture.needsUpdate = true  // Line 383
this.normalRenderTarget.texture.needsUpdate = true  // Line 388

// Textures are automatically updated when rendered to, no need to set needsUpdate
```

**Impact**: Reduces unnecessary GPU state changes, improves performance.

---

### 2. ⚠️ Update Camera Matrices in SSR Render Override

**Issue**: Camera matrices for SSR may be stale if camera moves after `updateSSRParameters()` is called.

**Location**: `PostProcessingSystem.ts` - SSR render override

**Fix**: Update matrices right before rendering in the render override:
```typescript
// In SSR render override, before calling originalSSRRender:
if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
  uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix)
  const projMatrix = this.camera.projectionMatrix.clone()
  uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()
  const viewMatrix = this.camera.matrixWorldInverse.clone()
  uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()
}
```

**Impact**: Ensures SSR reflections are accurate even when camera moves.

---

### 3. ⚠️ Update Light Direction Per Frame (SSS)

**Issue**: Light direction calculated once per config update, may be stale if sun light moves.

**Location**: `PostProcessingSystem.ts` - render() method

**Fix**: Update light direction in render() method if sun light exists:
```typescript
// In render() method, before composer.render():
if (this.sssPass && this.config.sss?.enabled) {
  // Auto-detect light direction from scene sun light if available
  let sunLight: THREE.DirectionalLight | null = null
  this.scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight && obj.userData.isSun && obj.visible) {
      sunLight = obj
    }
  })
  
  if (sunLight) {
    const lightDir = new THREE.Vector3()
    lightDir.subVectors(sunLight.target.position, sunLight.position).normalize()
    lightDir.negate()
    this.config.sss.lightDirection = lightDir
    this.updateSSSParameters() // Update with new light direction
  }
}
```

**Impact**: Ensures SSS shadows follow sun light movement.

---

### 4. ⚠️ Only Render Prepasses If SSS/SSR Enabled

**Issue**: Depth/normal prepasses render every frame even if SSS/SSR disabled.

**Location**: `PostProcessingSystem.ts` - render() method lines 337-397

**Fix**: Add explicit check:
```typescript
// Current code already has this check, but verify it's working:
if (this.config.enabled && (this.config.sss?.enabled || this.config.ssr?.enabled)) {
  // Render prepasses
}
```

**Impact**: Reduces unnecessary rendering overhead when SSS/SSR disabled.

---

### 5. ⚠️ Add Error Handling for Prepass Failures

**Issue**: If prepass rendering fails, SSS/SSR won't work but no error is reported.

**Location**: `PostProcessingSystem.ts` - render() method

**Fix**: Add try-catch around prepass rendering:
```typescript
try {
  if (this.depthRenderPass && this.depthRenderTarget) {
    // ... existing prepass code ...
    this.depthRenderPass.render(this.renderer, this.scene, this.camera, this.depthRenderTarget)
  }
} catch (error) {
  console.error('[PostProcessingSystem] ❌ Depth prepass failed:', error)
  if (this.config.sss?.enabled) {
    this.config.sss.enabled = false
  }
  if (this.config.ssr?.enabled) {
    this.config.ssr.enabled = false
  }
}
```

**Impact**: Better error reporting and automatic fallback.

---

### 6. ⚠️ Prevent Shadow Map Conflicts During Depth Prepass

**Issue**: Shadow maps may modify depth buffer, causing conflicts with depth prepass.

**Location**: `PostProcessingSystem.ts` - render() method

**Fix**: Temporarily disable shadow maps during depth prepass:
```typescript
// Before depth prepass:
const shadowMapEnabled = this.renderer.shadowMap.enabled
if (shadowMapEnabled) {
  this.renderer.shadowMap.enabled = false // Disable during prepass
}

// Render depth prepass
if (this.depthRenderPass && this.depthRenderTarget) {
  this.depthRenderPass.render(this.renderer, this.scene, this.camera, this.depthRenderTarget)
}

// Restore shadow maps
this.renderer.shadowMap.enabled = shadowMapEnabled
```

**Impact**: Prevents depth buffer conflicts between shadow maps and depth prepass.

---

### 7. ⚠️ Add Material Replacement Lock

**Issue**: Multiple systems may try to replace materials simultaneously.

**Location**: `DepthRenderPass.ts` and `NormalRenderPass.ts`

**Fix**: Add a simple lock mechanism:
```typescript
// In DepthRenderPass and NormalRenderPass:
private isReplacingMaterials = false

private replaceMaterials(object: THREE.Object3D): void {
  if (this.isReplacingMaterials) {
    console.warn('[DepthRenderPass] Material replacement already in progress')
    return
  }
  this.isReplacingMaterials = true
  try {
    // ... existing replacement code ...
  } finally {
    this.isReplacingMaterials = false
  }
}
```

**Impact**: Prevents race conditions in material replacement.

---

## Implementation Priority

### High Priority (Apply Immediately)
1. ✅ Remove unnecessary `needsUpdate` flags
2. ⚠️ Update camera matrices in SSR render override
3. ⚠️ Add error handling for prepass failures

### Medium Priority (Apply Soon)
4. ⚠️ Update light direction per frame
5. ⚠️ Prevent shadow map conflicts during depth prepass
6. ⚠️ Only render prepasses if enabled (verify current check works)

### Low Priority (Optimization)
7. ⚠️ Add material replacement lock
8. Add debug visualization
9. Add performance metrics

---

## Testing Checklist

After applying fixes, test:

- [ ] SSS works with shadow maps enabled
- [ ] SSS works with shadow maps disabled
- [ ] SSR works with camera movement
- [ ] SSR works with object movement
- [ ] Both SSS and SSR work together
- [ ] No WebGL errors in console
- [ ] Performance is acceptable (60 FPS)
- [ ] Shadows/reflections update correctly when light/camera moves
- [ ] No visual artifacts or glitches
- [ ] Error handling works (disable on failure)

---

## Notes

- All fixes are backward compatible
- No breaking changes to API
- Fixes can be applied incrementally
- Test each fix individually before applying next
