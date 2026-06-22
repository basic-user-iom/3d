# Path Tracer Color Preservation Fix (v3.4)

## Date
2025-12-17

## Issue
Background color and ground plane color are removed when entering path tracer mode.

## Fixes Applied

### 1. Background Color Preservation ✅

**Problem**: Background Color was being replaced with gradient when starting path tracer.

**Fix**: 
- Preserve original Color in `originalBackground` (already saved in `initialize()`)
- In `start()`, if `originalBackground` is a Color, create a simple solid color texture from it
- This allows the path tracer to render the color (path tracer needs Texture, not Color)
- The original Color is preserved in `originalBackground` for restoration when stopping

**Code Changes**:
```typescript
// In start() method
if (this.originalBackground instanceof THREE.Color) {
  // Create a simple solid color texture from the Color for path tracer
  const size = 2
  const data = new Uint8Array(4)
  data[0] = Math.floor(this.originalBackground.r * 255) // R
  data[1] = Math.floor(this.originalBackground.g * 255) // G
  data[2] = Math.floor(this.originalBackground.b * 255) // B
  data[3] = 255 // A
  
  const colorTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  colorTexture.needsUpdate = true
  ;(colorTexture as any).mapping = THREE.EquirectangularReflectionMapping
  
  this.scene.background = colorTexture
  // originalBackground remains as Color for restoration
}
```

### 2. Ground Plane Color Preservation ✅

**Problem**: When creating a new ground plane, it used hardcoded gray color (0x888888) instead of preserving color from existing ground planes.

**Fix**:
- In `createGroundPlane()`, search for existing ground planes before creating new one
- Extract color from existing ground plane materials
- Use that color when creating new ground plane
- If no existing ground plane found, use default gray

**Code Changes**:
```typescript
// In createGroundPlane() method
// Find existing ground planes and extract their color
let existingGroundColor: THREE.Color | null = null
this.scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    // ... find ground planes ...
    if (isGroundPlane) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (mat.color) {
            existingGroundColor = mat.color.clone()
            break
          }
        }
      }
    }
  }
})

// Use existing color or default
const groundColor = existingGroundColor ? existingGroundColor.getHex() : 0x888888
const groundMaterial = new THREE.MeshStandardMaterial({
  color: groundColor, // ✅ Uses preserved color
  // ... other properties ...
})
```

### 3. Existing Ground Plane Color Preservation ✅

**Problem**: When modifying existing ground planes in `applyGroundRoughness()`, the original color wasn't being saved.

**Fix**:
- Save original color in `userData.originalColor` when modifying ground plane materials
- This ensures color is preserved even if material is modified
- Added logging to confirm color preservation

**Code Changes**:
```typescript
// In applyGroundRoughness() method
if (!mat.userData) mat.userData = {}
if (!mat.userData.originalColor && mat.color) {
  mat.userData.originalColor = mat.color.clone() // ✅ Save original color
}
// Color is not modified, only roughness/metalness/opacity are modified
```

## Verification

### Background Color
- ✅ Original Color is saved in `initialize()`
- ✅ Color texture is created from Color in `start()` for path tracer
- ✅ Original Color is restored in `stop()` (already implemented)

### Ground Plane Color
- ✅ Existing ground plane color is extracted before creating new plane
- ✅ New ground plane uses preserved color
- ✅ Original color is saved when modifying existing ground planes
- ✅ Color is not modified during roughness application

## Testing

To verify the fixes:
1. Set a blue background color in standard mode
2. Enter path tracer - background should remain blue
3. Check ground plane color matches standard mode
4. Exit path tracer - background should restore to original blue














