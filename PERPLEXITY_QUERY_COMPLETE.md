# Complete Path Tracer Code & Issues - Perplexity Query

## Summary of Issues

1. **Color Loss**: Blue colors disappear when switching from standard mode to path tracer
2. **Gray Screen**: Path tracer shows gray screen at end instead of final frame
3. **Large Models**: Need best practices for handling 10M+ triangle models
4. **Best Practices**: How professional software handles these issues

## Complete Code Reference

All code is in the repository. Key files:
- `src/viewer/pathTracer/PathTracerDemo.ts` (3403 lines) - Main path tracer implementation
- `src/components/PathTracerDemoPanel.tsx` (1330 lines) - React UI component
- `src/viewer/pathTracer/PathTracerModule.ts` (174 lines) - Compatibility wrapper

## Detailed Questions for Perplexity

### Question 1: Material Color Preservation

**Problem**: When switching from standard raster mode to path tracer, material colors (especially blue) disappear. When switching back, colors don't match the original.

**Current Code Behavior**:
- Path tracer modifies materials for compatibility (lines 1004-1238 in PathTracerDemo.ts)
- Saves original material in `userData.originalMaterial` for ShadowMaterial
- Saves roughness/metalness/opacity in userData
- Does NOT explicitly save/restore material color

**Questions**:
1. Should we explicitly save material.color.clone() in userData before modifications?
2. Does Three.js material.clone() preserve all color properties correctly?
3. Are there known issues with color preservation when materials are modified for path tracing?
4. Should we preserve background color separately from scene.background?

### Question 2: Gray Screen at End

**Problem**: Path tracer reaches max samples, pauses, but shows gray screen instead of final rendered frame.

**Current Code** (lines 152-166, 318-331):
```typescript
if (this.pausedAtMax || this.maxSamplesReached) {
  // Don't render new samples - keep the last frame visible
  return
}
```

**Questions**:
1. Why might the final frame buffer be cleared or not displayed?
2. Should we preserve the render target texture before pausing?
3. Are there WebGLPathTracer-specific issues with paused state?
4. Should we force a final render before pausing?

### Question 3: Large Model Optimization

**Current Implementation**:
- Hard limit: 5 million triangles
- BVH generation can hang/crash with large models
- No LOD or progressive loading

**Questions**:
1. What are industry best practices for 10M+ triangle path tracing?
2. Should we implement spatial partitioning before BVH generation?
3. Are there WebGL-specific optimizations (e.g., Opacity MicroMaps, BLAS compaction)?
4. Should we use scene simplification or LOD systems?

### Question 4: Professional Software Patterns

**Questions**:
1. How do Blender Cycles, Maya Arnold, V-Ray preserve materials when switching engines?
2. How do progressive renderers handle final frame preservation?
3. What techniques do professional software use for large scene optimization?

## Request

Please provide:
1. **Specific code solutions** for color preservation
2. **Analysis** of gray screen issue with fixes
3. **Best practices** for large model handling
4. **References** to professional software patterns
5. **WebGL/GPU-specific** optimization techniques
