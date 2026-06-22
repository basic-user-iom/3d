# Streets GL Lighting and Shadow System

## Lighting System

### Primary Light Source
- **Type**: **Directional Light** (Sun Light)
- **Implementation**: Uses a single directional light representing the sun
- **Library**: Uses `suncalc` npm package for calculating sun position based on time and location
- **Shader**: `applyDirectionalLight()` function in `shading.frag`

### Lighting Features
1. **PBR (Physically Based Rendering)**
   - Uses physically-based shading model
   - Material properties: roughness, metallic, albedo
   - GGX specular BRDF for realistic reflections

2. **IBL (Image Based Lighting)**
   - Environment lighting contribution via `getIBLContribution()`
   - Uses reflection color for ambient lighting
   - Provides realistic ambient occlusion

3. **Light Calculation**
   ```glsl
   vec3 applyDirectionalLight(Light light, MaterialInfo materialInfo, vec3 normal, vec3 view) {
       vec3 pointToLight = -light.direction;
       vec3 shade = getPointShade(pointToLight, materialInfo, normal, view);
       return light.intensity * light.color * shade;
   }
   ```

## Shadow System

### Shadow Technique: **CSM (Cascaded Shadow Maps)**

CSM is an advanced shadow mapping technique that splits the view frustum into multiple cascades (layers) at different distances. This provides:
- **High-quality shadows** at close range (first cascade)
- **Lower resolution but still accurate shadows** at far distances (later cascades)
- **Better performance** than single shadow map for large scenes

### CSM Implementation Details

1. **Cascade Cameras**
   - Uses `CSMCascadeCamera` (extends `OrthographicCamera`)
   - Multiple orthographic cameras, one per cascade
   - Each cascade covers a different distance range from the viewer

2. **Configuration**
   ```typescript
   // Low quality settings
   csm.cascades = 1;        // Single cascade
   csm.resolution = 2048;   // 2048x2048 shadow map
   csm.far = 3000;          // Shadow distance
   
   // High quality settings
   csm.cascades = 3;        // Three cascades
   csm.resolution = 2048;   // 2048x2048 per cascade
   csm.far = 4000;          // Extended shadow distance
   ```

3. **Shadow Mapping Pass**
   - **File**: `ShadowMappingPass.ts`
   - Renders depth maps from light's perspective
   - Uses depth-only materials for shadow casting
   - External objects are included in shadow rendering (line 339)

4. **Shadow Rendering Process**
   ```typescript
   // For each cascade camera
   for (let i = 0; i < csm.cascadeCameras.length; i++) {
       const camera = csm.cascadeCameras[i];
       
       // Render shadow casters to depth map
       if (i < 2) {
           this.renderInstances(camera);
           this.renderAircraft(camera);
           this.renderExternalObjects(camera); // Your objects!
       }
       
       this.renderExtrudedMeshes(camera);  // Buildings
       this.renderHuggingMeshes(camera);   // Ground features
   }
   ```

5. **Shadow Application**
   - Shadow factor is calculated in shader
   - Applied to directional light contribution:
   ```glsl
   color += applyDirectionalLight(light, materialInfo, worldNormal, worldView) * shadowFactor;
   ```

### External Objects Shadow Support

Your external objects (from Three.js viewer) are integrated into the shadow system:

1. **Shadow Casting**
   - `ExternalObjectDepthMaterialContainer` - depth material for shadow maps
   - Uses same shader as generic instances
   - Rendered in first 2 cascades only (for performance)

2. **Shadow Receiving**
   - Objects receive shadows from Streets GL terrain and buildings
   - Shadow factor is applied in the main shading shader

### Shadow Parameters

- **Shadow Bias**: Prevents shadow acne (self-shadowing artifacts)
- **Shadow Normal Bias**: Additional bias based on surface normal
- **Bias Scale**: Global multiplier for shadow bias
- **Direction**: Light direction vector (typically sun direction)
- **Intensity**: Light intensity (0 = no shadows)

### Files Reference

- **CSM System**: `streets-gl-alt/src/app/render/CSM.ts`
- **Cascade Camera**: `streets-gl-alt/src/app/render/CSMCascadeCamera.ts`
- **Shadow Pass**: `streets-gl-alt/src/app/render/passes/ShadowMappingPass.ts`
- **External Object Depth Material**: `streets-gl-alt/src/app/render/materials/ExternalObjectDepthMaterialContainer.ts`
- **Shading Shader**: `streets-gl-alt/src/resources/shaders/shading.frag`

## Summary

**Lighting**: Single directional light (sun) with PBR shading and IBL
**Shadows**: CSM (Cascaded Shadow Maps) with 1-3 cascades, 2048x2048 resolution per cascade
**Your Objects**: Fully integrated - can cast and receive shadows in Streets GL

