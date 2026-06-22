# Complete Post-Processing & 3D Viewer Analysis Request for Perplexity

## Problem Statement
Three.js SAOPass causes entire 3D model to render as black silhouette when enabled, even with very conservative parameters (intensity: 0.05, scale: 0.5).

## Current Architecture

### Post-Processing System
- **EffectComposer** with custom render target
- **RenderPass** (first pass, renderToScreen: false)
- **SAOPass** (after RenderPass, renderToScreen: false)
- **Other passes:** SSS, SSR, Bloom, ToneMapping, ColorGrading, OutputPass
- **Render target:** WebGLRenderTarget with depthBuffer: true

### 3D Viewer System
- **Three.js 0.162**
- **React + Vite** application
- **Complex scene:** 252 meshes, 130 materials
- **Shadow system:** Shadow maps enabled
- **HDR system:** Environment maps
- **Lighting:** Directional lights with shadows

## Requested Analysis Areas

### 1. SAOPass Known Issues
- Known bugs with SAOPass in Three.js 0.162
- Black screen issues reported by others
- Depth texture reading problems
- Parameter sensitivity issues

### 2. EffectComposer Conflicts
- Conflicts between multiple post-processing passes
- Buffer swapping issues
- Depth texture handling problems
- Render target conflicts

### 3. Shadow System Conflicts
- Shadow maps interfering with post-processing
- Depth buffer conflicts
- Shadow rendering during RenderPass

### 4. Material Conflicts
- Material properties causing black rendering
- Transparency issues
- Material overrides during post-processing

### 5. Three.js Version Issues
- SAOPass compatibility with Three.js 0.162
- Breaking changes in recent versions
- Known regressions

### 6. Best Practices
- Official recommended setup for SAOPass
- Common pitfalls to avoid
- Performance considerations

## Specific Questions

1. Are there known conflicts between SAOPass and shadow maps?
2. Can multiple post-processing passes interfere with each other?
3. Are there material properties that cause black rendering with SAOPass?
4. Is there a Three.js version where SAOPass is known to be broken?
5. What are the most common causes of SAOPass black screen issues?
6. Are there alternative AO implementations that work better?
