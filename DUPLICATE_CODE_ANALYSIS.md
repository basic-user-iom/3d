# Duplicate Code Analysis Report

**Generated:** 2025-01-27  
**Purpose:** Identify duplicate code patterns and opportunities for code consolidation

---

## Executive Summary

After analyzing the codebase, I found **several areas with duplicate code patterns**, but **SSS and SSR are NOT duplicates** - they implement different algorithms for different purposes. However, there are opportunities to consolidate shared infrastructure and common patterns.

---

## 1. SSS vs SSR - Are They Duplicates?

### ❌ **NO - They Are NOT Duplicates**

**SSS (Screen Space Shadows)** and **SSR (Screen Space Reflections)** are **fundamentally different algorithms**:

#### **SSS (Screen Space Shadows)**
- **Purpose:** Traces shadows in screen space using light direction
- **Algorithm:** Simple ray-marching in screen space (2D UV + depth)
- **Inputs:** 
  - `tDiffuse` (color texture)
  - `tDepth` (depth texture)
  - `lightDirection` (world space)
- **Output:** Darkens areas where objects block light
- **Complexity:** ~200 lines, simpler algorithm

**Key Code Pattern:**
```typescript
// SSS traces along light direction in screen space
vec2 screenOffset = normalizedLightDir.xy * maxRadius;
float depthChange = normalizedLightDir.z * rayDistance;
vec3 rayDir = normalize(vec3(screenOffset, depthChange));
float shadow = traceShadow(vUv, rayDir, rayDistance);
color.rgb *= (1.0 - shadow); // Darken based on shadow
```

#### **SSR (Screen Space Reflections)**
- **Purpose:** Traces reflection rays in screen space using view direction and normals
- **Algorithm:** Complex ray-marching in view space with binary search refinement
- **Inputs:**
  - `tDiffuse` (color texture)
  - `tDepth` (depth texture)
  - `tNormal` (normal texture) - **SSR needs normals, SSS doesn't**
  - Camera matrices (projection/view inverses)
- **Output:** Reflects scene content on reflective surfaces
- **Complexity:** ~200 lines, more complex algorithm

**Key Code Pattern:**
```typescript
// SSR traces along reflection direction in view space
vec3 viewDir = normalize(-viewPos);
vec3 reflectDir = reflect(viewDir, normal);
vec3 hitCoord = viewPos;
float hitDepth = rayMarch(reflectDir * maxDistance / float(maxSteps), hitCoord);
// Binary search for precise intersection
reflectionColor = texture2D(tDiffuse, projectedCoord);
color.rgb = mix(color.rgb, reflectionColor.rgb, reflectionColor.a); // Blend reflection
```

### **Shared Infrastructure (NOT Duplicate Code)**

Both SSS and SSR **share infrastructure** (which is good design):

1. **Depth Prepass** - Both use `DepthRenderPass` from `src/viewer/pathTracer/DepthRenderPass.ts`
2. **Normal Prepass** - SSR uses `NormalRenderPass` (SSS doesn't need it)
3. **Post-Processing Integration** - Both integrated via `PostProcessingSystem`
4. **Common Uniforms** - Both use `tDiffuse`, `tDepth`, `cameraNear`, `cameraFar`

**This is NOT duplicate code - it's proper code reuse!**

---

## 2. Identified Duplicate Code Patterns

### 🔴 **HIGH PRIORITY - Duplicate Vertex Shaders**

**Location:** Multiple post-processing shaders

**Pattern Found:**
```glsl
// This exact vertex shader appears in:
// - SSSShader.ts (line 24-29)
// - SSRShader.ts (line 28-33)
// - DepthPassShader.ts (line 12-17)
// - NormalPassShader.ts (likely)
// - LUTShader.ts (likely)
// - AnamorphicShader.ts (likely)
// - ToneMappingShader.ts (likely)
// - ColorGradingShader.ts (likely)

vertexShader: `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
```

**Recommendation:** Extract to shared constant:
```typescript
// src/viewer/postprocessing/shared/CommonShaders.ts
export const STANDARD_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
```

**Impact:** Reduces code duplication across 8+ shader files

---

### 🟡 **MEDIUM PRIORITY - Duplicate Depth Reading Functions**

**Location:** 
- `SSSShader.ts` - `sampleDepth()` function (line 50-52)
- `SSRShader.ts` - `readDepth()` function (line 58-65)

**Pattern Found:**
```glsl
// SSS uses simple depth reading:
float sampleDepth(vec2 uv) {
  return texture2D(tDepth, uv).x; // Direct depth value
}

// SSR uses complex depth conversion:
float readDepth(sampler2D depthSampler, vec2 coord) {
  float fragCoordZ = texture2D(depthSampler, coord).x;
  float n = cameraNear;
  float f = cameraFar;
  float z_ndc = fragCoordZ * 2.0 - 1.0;
  float z_eye = 2.0 * n * f / (f + n - z_ndc * (f - n));
  return (z_eye - n) / (f - n); // Linear depth
}
```

**Analysis:**
- **SSS** uses **normalized depth** (0-1, non-linear)
- **SSR** uses **linear depth** (for view space calculations)

**Recommendation:** Keep separate - they serve different purposes. But document the difference clearly.

---

### 🟡 **MEDIUM PRIORITY - Duplicate Shadow System Implementations**

**Location:** Multiple shadow systems that may conflict

**Pattern Found:**
1. **Standard Three.js Shadows** - `src/viewer/ViewerCanvas.tsx`
2. **CSM Shadows** - `src/viewer/effects/CSMShadowSystem.ts`
3. **Streets GL Shadows** - `streets-gl-alt/src/app/render/passes/ShadowMappingPass.ts`
4. **Shadow Opacity Modifier** - `src/viewer/materials/ShadowOpacityModifier.ts`
5. **Internal Shadows** - `src/utils/enhanceInternalShadows.ts`

**Issue:** Multiple shadow systems can be active simultaneously, causing conflicts (documented in `docs/archive/shadow/SHADOW_SYSTEM_COMPREHENSIVE_REVIEW.md`)

**Recommendation:** 
- Create unified `ShadowManager` class (as suggested in `SHADOW_SYSTEM_ARCHITECTURE_ANALYSIS.md`)
- Ensure only ONE shadow system is active at a time
- Consolidate shadow-related utilities

---

### 🟡 **MEDIUM PRIORITY - Duplicate Material Modifier Patterns**

**Location:** Multiple material modifier registries

**Pattern Found:**
1. **ShaderModifierRegistry** - `src/viewer/materials/ShaderModifierRegistry.ts`
2. **ShadowOpacityModifierRegistry** - `src/viewer/materials/ShadowOpacityModifierRegistry.ts`
3. **CausticsModifierRegistry** - `src/viewer/materials/CausticsModifierRegistry.ts`
4. **ShadowOpacityModifier** - `src/viewer/materials/ShadowOpacityModifier.ts` (standalone version)

**Pattern:**
All modifiers follow similar patterns:
- `applyToMaterial()` method
- `removeFromMaterial()` method
- `onBeforeCompile` hook management
- Material tracking with `WeakMap`/`WeakSet`
- Uniform management

**Recommendation:**
- ✅ **Already partially consolidated** - `ShaderModifierRegistry` exists
- ⚠️ **ShadowOpacityModifier** has both registry and standalone versions - consolidate
- Consider base class or interface for modifiers

---

### 🟢 **LOW PRIORITY - Duplicate Render Pass Setup**

**Location:** Post-processing system

**Pattern Found:**
```typescript
// Similar setup code for SSS and SSR passes:
if (this.config.sss?.enabled) {
  this.sssPass = new ShaderPass(SSSShader)
  this.updateSSSParameters()
  // ... setup code
}

if (this.config.ssr?.enabled) {
  this.ssrPass = new ShaderPass(SSRShader)
  this.updateSSRParameters()
  // ... similar setup code
}
```

**Recommendation:** Extract common setup to helper method:
```typescript
private createScreenSpacePass<T>(
  shader: T,
  config: { enabled: boolean },
  updateFn: () => void
): ShaderPass | null {
  if (!config.enabled) return null
  const pass = new ShaderPass(shader)
  updateFn()
  pass.renderToScreen = false
  return pass
}
```

---

### 🟢 **LOW PRIORITY - Duplicate Depth/Normal Prepass Setup**

**Location:** `PostProcessingSystem.ts` (lines 197-221)

**Pattern Found:**
Both depth and normal prepasses use similar setup:
```typescript
// Depth prepass
this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {...})
this.depthRenderPass = new DepthRenderPass(this.camera)

// Normal prepass  
this.normalRenderTarget = new THREE.WebGLRenderTarget(width, height, {...})
this.normalRenderPass = new NormalRenderPass()
```

**Recommendation:** Extract to helper method (minor improvement)

---

## 3. Code That Should NOT Be Consolidated

### ✅ **DepthRenderPass vs DepthPassShader**

**Location:**
- `src/viewer/pathTracer/DepthRenderPass.ts` - Full render pass class
- `src/viewer/postprocessing/DepthPassShader.ts` - Shader only

**Analysis:** These serve different purposes:
- `DepthRenderPass` - Renders scene with depth material replacement
- `DepthPassShader` - Post-processing shader (unused?)

**Recommendation:** Check if `DepthPassShader.ts` is actually used. If not, remove it.

---

### ✅ **Multiple SSR Implementations in streets-gl**

**Location:**
- `streets-gl-alt/src/app/render/passes/SSRPass.ts`
- `src/viewer/postprocessing/SSRShader.ts`

**Analysis:** These are for different rendering systems:
- Streets GL SSR - Part of Streets GL render graph
- Post-processing SSR - Standalone Three.js post-processing

**Recommendation:** Keep separate - they're for different systems.

---

## 4. Recommendations Summary

### **Immediate Actions (High Priority)**

1. **Extract Common Vertex Shader**
   - Create `src/viewer/postprocessing/shared/CommonShaders.ts`
   - Replace duplicate vertex shaders in 8+ files
   - **Estimated Impact:** ~50 lines of duplicate code removed

2. **Consolidate Shadow Systems**
   - Create unified `ShadowManager` class
   - Ensure only one shadow system active at a time
   - **Estimated Impact:** Fixes shadow conflicts, reduces complexity

3. **Remove Unused DepthPassShader**
   - Check if `DepthPassShader.ts` is used
   - Remove if unused
   - **Estimated Impact:** Removes dead code

### **Future Improvements (Medium Priority)**

4. **Consolidate Material Modifiers**
   - Ensure all modifiers use `ShaderModifierRegistry`
   - Remove standalone `ShadowOpacityModifier` if registry version works
   - **Estimated Impact:** Cleaner architecture

5. **Extract Common Post-Processing Setup**
   - Create helper methods for common pass setup patterns
   - **Estimated Impact:** Reduces code duplication in `PostProcessingSystem.ts`

### **Low Priority (Nice to Have)**

6. **Document Depth Reading Differences**
   - Add comments explaining why SSS uses normalized depth vs SSR uses linear depth
   - **Estimated Impact:** Better code understanding

---

## 5. Code Quality Metrics

### **Duplicate Code Statistics**

- **Total Duplicate Patterns Found:** 6
- **High Priority:** 1 (vertex shader)
- **Medium Priority:** 3 (shadow systems, modifiers, depth reading)
- **Low Priority:** 2 (render pass setup, prepass setup)

### **Estimated Code Reduction**

- **Vertex Shader Consolidation:** ~50 lines
- **Shadow System Consolidation:** ~200-300 lines (complexity reduction)
- **Material Modifier Consolidation:** ~100 lines
- **Total Potential Reduction:** ~350-450 lines

### **Risk Assessment**

- **Low Risk:** Vertex shader extraction (simple refactor)
- **Medium Risk:** Shadow system consolidation (requires testing)
- **Low Risk:** Material modifier consolidation (already partially done)

---

## 6. Conclusion

### **Key Findings**

1. ✅ **SSS and SSR are NOT duplicates** - They implement different algorithms
2. ⚠️ **Shared infrastructure is good** - Depth/normal prepasses are properly reused
3. 🔴 **Vertex shader duplication** - Should be extracted to shared constant
4. 🟡 **Shadow system conflicts** - Multiple systems can conflict, needs consolidation
5. 🟡 **Material modifier patterns** - Similar but serve different purposes

### **Priority Actions**

1. Extract common vertex shader (quick win, low risk)
2. Consolidate shadow systems (high impact, medium risk)
3. Review and remove unused code (quick win, no risk)

---

**Next Steps:**
1. Review this analysis
2. Prioritize which consolidations to implement
3. Create implementation plan for high-priority items
4. Test thoroughly after consolidations
















































