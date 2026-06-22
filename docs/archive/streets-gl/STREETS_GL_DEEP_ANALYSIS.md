# Streets GL Deep Analysis - What We're Missing

## Critical Discovery: LUT-Based Atmospheric System

After deep research through Streets GL's source code, I've discovered that **Streets GL uses a completely different approach** than our current implementation:

### Our Current Implementation (Simplified)
- ❌ **Single-scattering approximation** with optical depth
- ❌ **Direct shader calculations** in real-time
- ❌ **No multiple scattering** consideration
- ❌ **Simplified ray sampling** (single point at moderate distance)

### Streets GL's Actual Implementation (LUT-Based)
- ✅ **Precomputed Look-Up Tables (LUTs)** for performance and accuracy
- ✅ **32-step ray marching** for accurate scattering integration
- ✅ **Multiple scattering** approximation (Equation 10 from paper)
- ✅ **Transmittance LUT** (40 steps for sun transmittance)
- ✅ **Multiple Scattering LUT** (20 steps, 8x8 samples)
- ✅ **Sky View LUT** (32-step ray marching per pixel)
- ✅ **Non-linear UV mapping** for better sky dome representation

## Key Differences

### 1. **Transmittance LUT** (`atmosphereTransmittance.frag`)
Streets GL precomputes a 2D texture where:
- **X-axis**: Sun zenith angle (cos theta from -1 to 1)
- **Y-axis**: Height in atmosphere (ground to atmosphere radius)
- **Value**: Transmittance from that point to the sun (40-step ray marching)

**Our implementation**: We approximate transmittance with a simple exponential, which is inaccurate.

### 2. **Multiple Scattering LUT** (`atmosphereMultipleScattering.frag`)
Streets GL precomputes multiple scattering using:
- **64 samples** (8x8 grid) for spherical integration
- **20-step ray marching** per sample
- **Ground albedo** contribution
- **Equation 10**: `psi = lum / (1.0 - f_ms)`

**Our implementation**: We completely ignore multiple scattering, which is critical for realistic sky colors.

### 3. **Sky View LUT** (`atmosphereSkyView.frag`)
Streets GL uses:
- **32-step ray marching** per view direction
- **Non-linear UV mapping** for better sky dome representation:
  ```glsl
  if (vUv.y < 0.5) {
      float coord = 1.0 - 2.0 * vUv.y;
      adjV = -coord * coord;  // Below horizon
  } else {
      float coord = vUv.y * 2.0 - 1.0;
      adjV = coord * coord;   // Above horizon
  }
  ```
- **Camera height** consideration
- **Ray-sphere intersection** for accurate path calculation

**Our implementation**: We use a single sample point, which produces inaccurate colors.

### 4. **Ray Marching Algorithm**
Streets GL's ray marching:
```glsl
for (float i = 0.0; i < numSteps; i += 1.0) {
    float newT = ((i + 0.3)/numSteps)*tMax;  // Offset by 0.3 for better sampling
    float dt = newT - t;
    t = newT;
    
    vec3 newPos = pos + t*rayDir;
    getScatteringValues(newPos, ...);
    
    vec3 sampleTransmittance = exp(-dt*extinction);
    vec3 sunTransmittance = getValFromTLUT(tTransmittanceLUT, newPos, sunDir);
    vec3 psiMS = getValFromMultiScattLUT(tMultipleScatteringLUT, newPos, sunDir);
    
    // Integrate scattering
    vec3 scatteringIntegral = (inScattering - inScattering * sampleTransmittance) / extinction;
    lum += scatteringIntegral*transmittance;
    transmittance *= sampleTransmittance;
}
```

**Our implementation**: We use a single-point approximation, missing the integration along the ray.

## What We Need to Implement

### Phase 1: LUT Generation System
1. **Transmittance LUT Pass**
   - Render a 2D texture (e.g., 256x64)
   - For each pixel, calculate sun transmittance with 40-step ray marching
   - Store as texture for fast lookup

2. **Multiple Scattering LUT Pass**
   - Render a 2D texture (e.g., 256x64)
   - For each pixel, calculate multiple scattering with 64 samples
   - Store as texture for fast lookup

3. **Sky View LUT Pass** (per frame)
   - Render a 2D texture (e.g., 512x512)
   - For each pixel, calculate sky color with 32-step ray marching
   - Use non-linear UV mapping
   - Update when sun direction changes

### Phase 2: Sky Rendering
1. **Skybox Material**
   - Sample from Sky View LUT
   - Use cube map or sphere mapping
   - Apply to scene background

2. **Aerial Perspective** (already partially implemented)
   - Use 16-slice 3D texture
   - Sample based on depth and view direction

## Implementation Priority

### High Priority (Critical for Visual Match)
1. ✅ **Transmittance LUT** - Essential for accurate sun transmittance
2. ✅ **Sky View LUT with ray marching** - Core of sky rendering
3. ✅ **Multiple Scattering LUT** - Critical for realistic colors

### Medium Priority
4. **Non-linear UV mapping** - Better sky dome representation
5. **Camera height consideration** - More accurate at different altitudes

### Low Priority (Nice to Have)
6. **Ground albedo contribution** - Subtle effect
7. **Optimized LUT updates** - Only update when sun changes

## Performance Considerations

- **LUT Generation**: Can be done once per frame (or when sun changes)
- **LUT Sizes**: 
  - Transmittance: 256x64 (small, static)
  - Multiple Scattering: 256x64 (small, static)
  - Sky View: 512x512 (larger, updates per frame)
- **Ray Marching Steps**: 32 steps is a good balance (Streets GL uses 32)

## References

- **Streets GL Source**: `streets-gl-alt/src/app/render/passes/AtmosphereLUTPass.ts`
- **Shaders**: `streets-gl-alt/src/resources/shaders/atmosphere*.frag`
- **Atmosphere Chunk**: `streets-gl-alt/src/resources/shaders/chunks/atmosphere.glsl`

## Conclusion

The **fundamental difference** is that Streets GL uses a **precomputed LUT-based system with accurate ray marching**, while we're using a **simplified single-scattering approximation**. To match Streets GL's visual quality, we need to implement the full LUT-based system with ray marching.


