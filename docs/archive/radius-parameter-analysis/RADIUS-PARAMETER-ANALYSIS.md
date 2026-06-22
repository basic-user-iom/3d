# Radius Parameter Analysis

## Summary

**✅ YES, the radius parameter WORKS**
**⚠️ BUT it can only be set at creation time**

## How Radius Works

### At Creation Time (✅ Works Perfectly)

The `radius` parameter is used to create the SphereGeometry:

```javascript
// This WORKS - radius is set when creating the skybox
const skybox = new GroundedSkybox(envMap, height, radius);
```

Different radius values create different sizes:
- **radius = 50**: Small sphere, environment appears close
- **radius = 100**: Medium sphere (default), balanced view
- **radius = 200**: Large sphere, environment appears far

### After Creation (❌ Cannot Change Directly)

The radius is baked into the geometry and cannot be changed after creation:

```javascript
// This DOES NOT WORK
skybox.radius = 150;  // No effect - property doesn't exist

// This ALSO DOES NOT WORK
skybox.geometry.scale(2, 2, 2);  // Breaks the ground projection math
```

## Why Radius Can't Be Changed

Looking at the `GroundedSkybox` source code:

```javascript
constructor(map, height, radius, resolution = 128) {
    // 1. Create geometry with fixed radius
    const geometry = new SphereGeometry(radius, 2 * resolution, resolution);
    
    // 2. Modify vertices based on height (ground projection math)
    for (let i = 0; i < pos.count; ++i) {
        tmp.fromBufferAttribute(pos, i);
        if (tmp.y < 0) {
            const y1 = -height * 3 / 2;
            const f = tmp.y < y1 ? -height / tmp.y : (1 - tmp.y * tmp.y / (3 * y1 * y1));
            tmp.multiplyScalar(f);  // Ground projection math
            tmp.toArray(pos.array, 3 * i);
        }
    }
    
    // 3. Create mesh with modified geometry
    super(geometry, new MeshBasicMaterial({ map, depthWrite: false }));
}
```

**Problem**: The radius is used to create the geometry size, and then the vertices are modified with ground projection math. This math is dependent on the original radius value.

## Solution: Recreate When Radius Changes

To change the radius, you must recreate the entire GroundedSkybox:

```javascript
// Method 1: Manual recreation
scene.remove(oldSkybox);
oldSkybox.geometry.dispose();
const newSkybox = new GroundedSkybox(envMap, newHeight, newRadius);
newSkybox.position.y = newHeight - 0.01;
scene.add(newSkybox);

// Method 2: Use our helper function
await groundEnv.recreate(newHeight, newRadius);
```

## Height vs Radius

### Height Parameter ⚠️ Can Be Changed (But Complicated)

Height affects the ground projection calculation. While technically possible to recalculate all vertices with a new height, it's complex and requires recomputing the ground projection math for each vertex.

**Our Implementation**: We provide an `update(newHeight)` function that recalculates the geometry.

### Radius Parameter ❌ Must Recreate

Radius is the physical size of the sphere. Changing it requires creating a new geometry.

**Our Implementation**: We provide a `recreate(newHeight, newRadius)` function that disposes the old skybox and creates a new one.

## Test Results

### Test 1: Creation with Different Radii ✅ PASS

```javascript
// Small radius
const skybox1 = new GroundedSkybox(envMap, 15, 50);
// Result: Small sphere, environment feels close

// Large radius
const skybox2 = new GroundedSkybox(envMap, 15, 200);
// Result: Large sphere, environment feels distant
```

**Verdict**: Radius parameter works correctly at creation.

### Test 2: Changing Radius After Creation ❌ FAIL (Expected)

```javascript
const skybox = new GroundedSkybox(envMap, 15, 100);
skybox.radius = 200;  // Property doesn't exist
console.log(skybox.radius);  // undefined
```

**Verdict**: As expected, radius is not a mutable property.

### Test 3: Recreating with New Radius ✅ PASS

```javascript
// Original
const oldSkybox = new GroundedSkybox(envMap, 15, 100);
scene.add(oldSkybox);

// Recreate with new radius
scene.remove(oldSkybox);
oldSkybox.geometry.dispose();
const newSkybox = new GroundedSkybox(envMap, 15, 200);
scene.add(newSkybox);
```

**Verdict**: Recreation works perfectly.

## Updated API

### setupGroundProjectedEnv() Returns:

```javascript
{
    skybox: GroundedSkybox,      // The skybox mesh
    envMap: THREE.Texture,        // The HDR texture
    toggle: (enabled) => void,    // Toggle grounded/standard
    update: (height) => void,     // Update height (recalculates geometry)
    recreate: (height, radius) => GroundedSkybox  // Recreate with new radius
}
```

### Usage Examples:

```javascript
// Setup
const env = await setupGroundProjectedEnv(scene, {
    hdrPath: 'env.hdr',
    height: 15,
    radius: 100  // ✅ Works - sets initial radius
});

// Change height (fast)
env.update(20);  // ✅ Recalculates geometry vertices

// Change radius (requires recreation)
env.recreate(20, 150);  // ✅ Disposes old, creates new

// Try to change radius directly
env.skybox.radius = 150;  // ❌ Has no effect
```

## Performance Notes

### Height Changes
- **Speed**: Fast (only vertex updates)
- **Memory**: No new allocations
- **Use**: Can be done frequently (e.g., in animation loop)

### Radius Changes
- **Speed**: Slower (creates new geometry)
- **Memory**: Allocates new buffers, disposes old
- **Use**: Should be done sparingly (e.g., user interaction only)

## Visual Impact

### Height Parameter
- **Low (5-10)**: Ground appears very close, horizon lower
- **Medium (15-20)**: Balanced, natural looking
- **High (25-30)**: Ground appears far below, horizon higher

### Radius Parameter
- **Small (50-80)**: Tight environment, more visible edge
- **Medium (100-150)**: Standard view, good for most scenes
- **Large (150-200)**: Expansive feel, camera must stay centered

## Recommendations

1. **Choose radius carefully at initialization** based on your scene size
2. **Use height adjustments** for fine-tuning the ground appearance
3. **Only recreate for radius changes** when absolutely necessary
4. **Make radius larger than your scene bounds** to avoid camera going outside the skybox

## Conclusion

The radius parameter **WORKS CORRECTLY**. It's used at creation time to determine the size of the ground-projected environment sphere. 

**Key Insight**: It's not a bug that radius can't be changed dynamically—it's a fundamental aspect of how the geometry is constructed. The ground projection math is baked into the vertex positions based on the initial radius.

**Solution**: Our updated scripts now provide:
- `update(height)` for height changes (fast, frequent use)
- `recreate(height, radius)` for radius changes (slower, occasional use)

Both parameters work as intended! 🎉

