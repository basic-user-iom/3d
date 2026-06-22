# Three.js Feature URLs - Implementation References

## Completed Features

1. **Ground-Projected Environment Maps**
   - Status: ✅ Implemented (but needs fixing)
   - Reference: Custom implementation (Twinmotion-style)

2. **360 Panorama Export**
   - Status: ✅ Complete
   - Reference: Custom implementation

3. **Random UV for Materials**
   - URL: `https://threejs.org/examples/#webgl_random_uv`
   - Status: ✅ Complete
   - Location: `src/viewer/materials/RandomUVModifier.ts`

4. **Shadow Map with Opacity**
   - URL: `https://threejs.org/examples/webgpu_shadowmap_opacity.html`
   - Status: ✅ Complete (but conflicts with ground projection)
   - Location: `src/viewer/materials/ShadowOpacityModifier.ts`

## In Progress / Pending Features

5. **Emissive Bloom Post-Processing**
   - Status: ⏳ In Progress
   - Infrastructure exists, needs integration

6. **3D LUT Post-Processing**
   - URL: `https://threejs.org/examples/webgl_postprocessing_3dlut.html`
   - Status: ⏳ Pending
   - Location: `src/viewer/postprocessing/LUTShader.ts`, `LUTLoader.ts`

7. **Anamorphic Lens Flares**
   - URL: `https://threejs.org/examples/webgpu_postprocessing_anamorphic.html`
   - Status: ⏳ Pending
   - Location: `src/viewer/postprocessing/AnamorphicShader.ts`

8. **Ocean Shader**
   - Status: ⏳ Pending (replace WaterSystem)
   - Note: Not found in current Three.js examples, may need custom implementation

9. **Sky Shader**
   - Status: ⏳ Pending (replace DynamicSky)
   - Note: Custom implementation needed

10. **Volume Cloud Shader**
    - Status: ⏳ Pending
    - Note: Custom implementation needed

11. **Path Tracer with Denoiser**
    - Status: ⏳ Pending
    - Note: Custom implementation needed

12. **Caustics for Glass Materials (WebGPU)**
    - URL: `https://threejs.org/examples/webgpu_caustics.html`
    - Status: ⏳ Pending
    - Location: `src/viewer/effects/CausticsSystem.ts`
    - Note: Custom WebGL implementation exists, but the WebGPU caustics example from Three.js is not integrated. Current implementation uses render targets with custom shaders.

13. **Ambient Occlusion (AO)**
    - Status: ⏳ Pending
    - Note: Custom implementation needed

14. **Screen-Space Shadows (SSS)**
    - URL: `https://threejs.org/examples/webgpu_postprocessing_sss.html`
    - Status: ⏳ Pending
    - Location: `src/viewer/postprocessing/SSSShader.ts`

15. **Screen-Space Reflections (SSR)**
    - URL: `https://threejs.org/examples/webgpu_postprocessing_ssr.html`
    - Status: ⏳ Pending
    - Location: `src/viewer/postprocessing/SSRShader.ts`

16. **Batch LOD BVH (Level of Detail with Bounding Volume Hierarchy)**
    - URL: `https://threejs.org/examples/#webgl_batch_lod_bvh`
    - Status: ⏳ Pending
    - Note: Performance optimization for rendering large numbers of objects with LOD and efficient culling

17. **Instancing Performance**
    - URL: `https://threejs.org/examples/#webgl_instancing_performance`
    - Status: ⏳ Pending
    - Note: Performance optimization for rendering thousands of instances efficiently using GPU instancing

18. **CSS3D Mixed (Hotspot Displays)**
    - URL: `https://threejs.org/examples/#css3d_mixed`
    - Status: ⏳ Pending
    - Planned Use: Use this example as the base for hotspot displays (3D‑positioned HTML/CSS panels for text, images, and UI around hotspots).

19. **Physical Transmission Materials**
    - URL: `https://threejs.org/examples/#webgl_materials_physical_transmission`
    - Status: ✅ Implemented (80% complete, enhanced with presets and auto-optimization)
    - Location: `src/utils/physicalTransmission.ts`, `src/components/MaterialPanel.tsx`, `src/viewer/loaders/gltfLoader.ts`
    - Note: Glass material presets, auto-IOR detection, optimal thickness calculation, enhanced envMap intensity

## Other References

- **Physical Lights**: `https://threejs.org/examples/#webgl_lights_physical`
  - Location: `src/viewer/ViewerCanvas.tsx`

- **GLTF Instancing**: `https://threejs.org/examples/#webgl_loader_gltf_instancing`
  - Location: `src/viewer/loaders/gltfLoader.ts`

- **GLTF Dispersion**: `https://threejs.org/examples/#webgl_loader_gltf_dispersion`
  - Location: `src/viewer/loaders/gltfLoader.ts`

- **3DM Loader**: `https://threejs.org/examples/#webgl_loader_3dm`
  - Location: `src/viewer/loaders/3dmLoader.ts`

## Summary

**Total Features**: 19
**Completed**: 5 (Random UV, Shadow Opacity, Ground Projection, Panorama, Physical Transmission)
**In Progress**: 1 (Emissive Bloom)
**Pending**: 13 (LUT, Anamorphic, Ocean, Sky, Clouds, Path Tracer, Caustics, AO, SSS, SSR, Batch LOD BVH, Instancing Performance, CSS3D Mixed Hotspots)

**Three.js Example URLs Found**: 14
- `webgl_random_uv`
- `webgpu_shadowmap_opacity`
- `webgl_postprocessing_3dlut`
- `webgpu_postprocessing_anamorphic`
- `webgpu_postprocessing_sss`
- `webgpu_postprocessing_ssr`
- `webgpu_caustics`
- `webgl_lights_physical`
- `webgl_loader_gltf_instancing`
- `webgl_loader_gltf_dispersion`
- `webgl_loader_3dm`
- `webgl_batch_lod_bvh`
- `webgl_instancing_performance`
- `css3d_mixed`
- `webgl_materials_physical_transmission`







