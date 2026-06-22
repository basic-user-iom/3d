# LOD with BVH Integration Plan

Based on the Three.js example: https://threejs.org/examples/#webgl_batch_lod_bvh

## Current Status

- ✅ `three-mesh-bvh` is installed (v0.9.2)
- ✅ Basic LOD implementation exists in `gltfLoader.ts` and `webExport.ts`
- ✅ BVH acceleration integrated via `lodBVHManager.ts`
- ✅ BVH automatically built for all LOD objects during model loading
- ⚠️ LOD may not be triggering (needs debugging with console logs)

## Three.js Example Features

The example demonstrates:
1. **BatchedMesh** - Batching multiple geometries and instances (requires Three.js r160+)
2. **Multiple LOD levels** - 5 LODs per geometry using meshoptimizer
3. **BVH acceleration** - For frustum culling and raycasting

## Integration Strategy

### Phase 1: Fix Current LOD (Priority)
1. ✅ Add better logging to see why LOD isn't running
2. ✅ Verify triangle count calculation
3. ✅ Ensure async LOD generation doesn't block UI

### Phase 2: Enhance with BVH ✅ COMPLETED
1. ✅ Use `three-mesh-bvh` for accelerated frustum culling on LOD objects
2. ✅ Build BVH for LOD geometries automatically during generation
3. ✅ Created `lodBVHManager.ts` utility for BVH management
4. ⏳ Future: Use BVH to optimize LOD distance calculations dynamically

### Phase 3: BatchedMesh (If Available)
1. Check if `BatchedMesh` is available in Three.js 0.181.1
2. If not, consider upgrading Three.js or using alternative batching
3. Integrate `@sogelink/batched-mesh-extensions` if needed

## Implementation Notes

- Current LOD uses `MeshoptSimplifier` (already installed)
- LOD distances: High (0-50), Medium (50-150), Low (150-300) units
- Reduction factors: 70% for medium, 50% for low (less aggressive for quality)

## Next Steps

1. Debug why LOD isn't running (check console logs)
2. Verify triangle count > 500K threshold
3. Test with airport GLB file
4. Once working, add BVH acceleration

