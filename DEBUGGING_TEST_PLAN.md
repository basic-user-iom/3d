# Debugging Test Plan for AO Black Screen Issue

## Test Sequence

### Test 1: Shadow Maps Disabled (HIGH PRIORITY)
**Purpose:** Determine if shadow maps are interfering with SAOPass

**Steps:**
1. Temporarily disable shadow maps
2. Enable post-processing and AO
3. Check if black screen persists

**Code:**
```javascript
// In browser console
const viewer = window.__viewer || window.sharedViewer
if (viewer && viewer.renderer) {
  const originalShadowEnabled = viewer.renderer.shadowMap.enabled
  viewer.renderer.shadowMap.enabled = false
  console.log('Shadow maps disabled - test AO now')
  // Re-enable after test:
  // viewer.renderer.shadowMap.enabled = originalShadowEnabled
}
```

**Expected Result:**
- If AO works: Shadow maps are the issue
- If AO still black: Issue is elsewhere

### Test 2: Minimal Scene (HIGH PRIORITY)
**Purpose:** Isolate issue from complex scene

**Steps:**
1. Create simple test scene with box/sphere
2. Basic material (no transparency, no alphaTest)
3. No shadows
4. Only RenderPass + SAOPass
5. Test if AO works

**Code:**
```javascript
// Create minimal test scene
const testScene = new THREE.Scene()
const testGeometry = new THREE.BoxGeometry(1, 1, 1)
const testMaterial = new THREE.MeshStandardMaterial({ 
  color: 0xffffff,
  depthTest: true,
  depthWrite: true
})
const testMesh = new THREE.Mesh(testGeometry, testMaterial)
testScene.add(testMesh)

// Test with minimal post-processing setup
```

### Test 3: Pass Order Verification (MEDIUM PRIORITY)
**Purpose:** Ensure passes are in correct order

**Steps:**
1. Check current pass order
2. Verify SAOPass is second (after RenderPass)
3. Test with only RenderPass + SAOPass

**Code:**
```javascript
// Check pass order
const composer = viewer.postProcessingSystem.composer
const passNames = composer.passes.map(p => p.constructor.name)
console.log('Current pass order:', passNames)

// Expected: ['RenderPass', 'SAOPass', ...]
// If SAOPass is not second, that's the issue
```

### Test 4: Material Properties Check (MEDIUM PRIORITY)
**Purpose:** Find materials with problematic properties

**Steps:**
1. Check all materials for `alphaTest`
2. Check for `depthTest: false`
3. Check for `depthWrite: false` on opaque materials

**Code:**
```javascript
// Check all materials
const problematicMaterials = []
viewer.scene.traverse((obj) => {
  if (obj.material) {
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material
    const issues = []
    
    if (mat.alphaTest !== undefined && mat.alphaTest > 0) {
      issues.push(`alphaTest: ${mat.alphaTest}`)
    }
    if (mat.depthTest === false) {
      issues.push('depthTest: false')
    }
    if (mat.depthWrite === false && !mat.transparent) {
      issues.push('depthWrite: false on opaque material')
    }
    
    if (issues.length > 0) {
      problematicMaterials.push({
        name: mat.name || 'unnamed',
        mesh: obj.name || 'unnamed',
        issues: issues
      })
    }
  }
})

console.log('Problematic materials:', problematicMaterials)
```

### Test 5: WebGL Error Check (LOW PRIORITY)
**Purpose:** Find shader compilation or WebGL errors

**Steps:**
1. Check browser console for WebGL errors
2. Check for shader compilation errors
3. Verify WebGL capabilities

**Code:**
```javascript
// Check WebGL errors
const gl = viewer.renderer.getContext()
const error = gl.getError()
if (error !== gl.NO_ERROR) {
  console.error('WebGL error code:', error)
  // gl.NO_ERROR = 0
  // gl.INVALID_ENUM = 1280
  // gl.INVALID_VALUE = 1281
  // gl.INVALID_OPERATION = 1282
  // gl.INVALID_FRAMEBUFFER_OPERATION = 1286
}

// Check WebGL capabilities
console.log('WebGL capabilities:', {
  maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  depthBits: gl.getParameter(gl.DEPTH_BITS),
  stencilBits: gl.getParameter(gl.STENCIL_BITS)
})
```

## Test Execution Order

1. **Test 1: Shadow Maps** (5 minutes)
   - Quickest test
   - Most likely cause
   - Easy to revert

2. **Test 3: Pass Order** (2 minutes)
   - Quick verification
   - Critical for SAOPass
   - Easy to check

3. **Test 4: Material Properties** (5 minutes)
   - Find problematic materials
   - May reveal issues
   - Easy to check

4. **Test 2: Minimal Scene** (15 minutes)
   - More time consuming
   - But isolates issue
   - Worth doing if other tests fail

5. **Test 5: WebGL Errors** (5 minutes)
   - Check for errors
   - May reveal shader issues
   - Easy to check

## Expected Outcomes

### If Shadow Maps Are the Issue
- **Solution:** Need to ensure shadow maps don't interfere with depth texture
- **Fix:** May need to render shadows separately or adjust shadow map configuration

### If Pass Order Is Wrong
- **Solution:** Ensure SAOPass is second pass
- **Fix:** Reorder passes in PostProcessingSystem

### If Material Properties Are Wrong
- **Solution:** Fix problematic material properties
- **Fix:** Update materials to have correct depth settings

### If Minimal Scene Works
- **Solution:** Issue is with complex scene
- **Fix:** Gradually add complexity to find what breaks

### If WebGL Errors Found
- **Solution:** Fix shader or WebGL issues
- **Fix:** May need to adjust shader precision or use different approach












