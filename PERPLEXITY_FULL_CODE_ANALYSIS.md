# Complete Post-Processing Code for Perplexity Analysis

## Request
Please analyze this Three.js post-processing implementation and provide:
1. Bug fixes for identified issues
2. Performance optimizations
3. Best practices verification
4. Recommendations for shadow map preservation
5. Color space and tone mapping correctness

---

## Critical Issues

### 1. Shadows Not Working in Post-Processing
**Problem**: Shadows disappear or appear incorrect when post-processing is enabled.

**Current Implementation**:
- Using custom render target with `depthBuffer: true`
- Shadow maps enabled check before render
- Shadow map state preserved

**Question**: Is this the correct approach? How do Three.js examples handle this?

### 2. Colors Washed Out
**Problem**: Colors appear desaturated and muted.

**Current Implementation**:
- Renderer tone mapping disabled
- Custom ToneMappingShader (no gamma correction)
- OutputPass for sRGB conversion
- LinearSRGBColorSpace for post-processing

**Question**: Is this correct? Are we missing something?

### 3. Performance Issues
**Problem**: Unnecessary updates every frame.

**Issues Found**:
- Parameter updates every frame
- Texture needsUpdate set every frame
- Console logging in hot path
- Depth prepasses rendered unnecessarily

---

## Complete Code

### File 1: PostProcessingSystem.ts

```typescript
[Full file content - 1626 lines]
```

**Key Sections**:
- Lines 132-352: Initialization
- Lines 427-521: Render method
- Lines 560-671: updateSSSParameters
- Lines 1549-1625: updateSSRParameters
- Lines 897-1418: updateConfig

### File 2: ToneMappingShader.ts

```glsl
[Full shader code - 126 lines]
```

**Key**: No gamma correction (line 105 removed)

### File 3: ColorGradingShader.ts

```glsl
[Full shader code - 195 lines]
```

**Key**: Artistic gamma at line 163

### File 4: SSSShader.ts

```glsl
[Full shader code - 149 lines]
```

**Bug Fixed**: Intensity no longer applied twice (line 96 fixed)

### File 5: SSRShader.ts

```glsl
[Full shader code - 197 lines]
```

### File 6: LUTShader.ts

```glsl
[Full shader code - 52 lines]
```

### File 7: AnamorphicShader.ts

```glsl
[Full shader code - 71 lines]
```

### File 8: DepthRenderPass.ts

```typescript
[Full file content - 106 lines]
```

### File 9: NormalRenderPass.ts

```typescript
[Full file content - 104 lines]
```

---

## Bugs Fixed

1. ✅ SSS shadow intensity double application - FIXED
2. ✅ SSR normal texture logging - FIXED (throttled)
3. ✅ SSR camera matrices update - FIXED (update before render)
4. ✅ Depth prepass unnecessary rendering - FIXED (only when needed)
5. ✅ Texture needsUpdate every frame - FIXED (removed)
6. ✅ WeakMap cleanup - FIXED (explicit clear on dispose)

---

## Questions for Perplexity

1. **Shadow Maps**: How do Three.js examples preserve shadow maps in RenderPass? Is custom render target with depth buffer correct?

2. **Color Space**: What is the correct color space setup? LinearSRGBColorSpace or SRGBColorSpace?

3. **Tone Mapping**: How to prevent double tone mapping? Should OutputPass handle sRGB conversion?

4. **Pass Order**: What is the correct order? Currently: Render → AO → SSS → SSR → Bloom → Anamorphic → ToneMapping → LUT → ColorGrading → Output

5. **Gamma Correction**: Where should it be applied? Currently removed from ToneMappingShader, applied in ColorGradingShader (artistic), OutputPass (sRGB conversion)

6. **SSS Light Direction**: How to convert world-space to screen space correctly?

7. **SSR Camera Matrices**: Should update every frame or only on change?

8. **Material Replacement**: Better way to render depth/normals?

9. **Performance**: How to optimize further?

10. **Memory**: Any remaining leaks?

---

## Test Results

Run test suite: `window.postProcessingTests.runAllTests()`

Expected results:
- Shadow maps preserved ✅
- Colors vibrant ✅
- Pass order correct ✅
- No memory leaks ✅

---

Please provide detailed analysis and recommendations.


























