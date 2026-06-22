# Critical Code Snippets for Perplexity Analysis

## 1. Shadow Map Preservation Setup

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

```typescript
// Lines 150-163: Initialize render target with depth buffer
this.composerRenderTarget = new THREE.WebGLRenderTarget(
  width,
  height,
  {
    depthBuffer: true,  // CRITICAL: Enable depth buffer for shadow maps
    stencilBuffer: false
  }
)
this.composer = new EffectComposer(this.renderer, this.composerRenderTarget)

// Lines 434-439: Ensure shadow maps enabled before render
if (!this.renderer.shadowMap.enabled) {
  this.renderer.shadowMap.enabled = true
}
```

**Question:** Is this the correct approach to preserve shadow maps?

---

## 2. Color Space Configuration

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

```typescript
// Lines 140-148: Disable renderer tone mapping
this.renderer.toneMapping = THREE.NoToneMapping
this.renderer.toneMappingExposure = 1.0
(this.renderer as any).outputColorSpace = THREE.LinearSRGBColorSpace

// Lines 326-337: OutputPass configuration
this.outputPass = new OutputPass()
this.outputPass.toneMappingExposure.value = 1.0
(this.outputPass as any).toneMapping = THREE.NoToneMapping
```

**File:** `src/viewer/postprocessing/ToneMappingShader.ts`

```glsl
// Lines 104-107: REMOVED gamma correction
void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  
  // Apply tone mapping
  color.rgb = applyToneMapping(color.rgb, toneMappingType, exposure, whitePoint);
  
  // REMOVED: color = pow(color, vec3(1.0 / 2.2));
  // OutputPass handles sRGB conversion
  
  gl_FragColor = color;
}
```

**Question:** Is this correct? Why are colors still washed out?

---

## 3. Pass Order

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

```typescript
// Lines 290-320: Pass initialization order
this.composer.addPass(this.renderPass)        // 1. Base scene
if (this.aoPass) this.composer.addPass(this.aoPass)  // 2. AO
if (this.sssPass) this.composer.addPass(this.sssPass) // 3. SSS
if (this.ssrPass) this.composer.addPass(this.ssrPass) // 4. SSR
if (this.bloomPass) this.composer.addPass(this.bloomPass) // 5. Bloom
if (this.anamorphicPass) this.composer.addPass(this.anamorphicPass) // 6. Anamorphic
if (this.toneMappingPass) this.composer.addPass(this.toneMappingPass) // 7. Tone Mapping
if (this.lutPass) this.composer.addPass(this.lutPass) // 8. LUT
if (this.colorGradingPass) this.composer.addPass(this.colorGradingPass) // 9. Color Grading
this.composer.addPass(this.outputPass) // 10. Output (sRGB conversion)
```

**Question:** Is this the correct order?

---

## 4. SSS Light Direction Conversion

**File:** `src/viewer/postprocessing/SSSShader.ts`

```glsl
// Lines 115-135: Light direction conversion
void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float depth = sampleDepth(vUv);
  
  if (depth >= 1.0) {
    gl_FragColor = color;
    return;
  }
  
  // Calculate ray direction in screen space
  vec3 normalizedLightDir = normalize(lightDirection);
  
  // FIX: For screen-space shadows, we need to project the light direction onto the screen
  vec3 rayDir = vec3(
    normalizedLightDir.x * maxRadius,
    normalizedLightDir.y * maxRadius,
    normalizedLightDir.z * rayDistance
  );
  
  // Normalize the ray direction for screen space
  float rayLength = length(rayDir);
  if (rayLength > 0.0) {
    rayDir = rayDir / rayLength;
  } else {
    rayDir = vec3(0.0, -maxRadius, rayDistance);
    rayDir = normalize(rayDir);
  }
  
  // Trace shadow
  float shadow = traceShadow(vUv, rayDir, rayDistance);
  float finalShadow = shadow * intensity;
  color.rgb *= (1.0 - finalShadow);
  
  gl_FragColor = color;
}
```

**Question:** Is this the correct way to convert world-space light direction to screen space?

---

## 5. SSR Camera Matrices Update

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

```typescript
// Lines 503-507: Update camera before SSR pass
if (this.ssrPass && this.config.ssr?.enabled) {
  // FIX: Update camera matrices before SSR pass renders
  if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }
  this.updateSSRParameters()
}

// Lines 1568-1583: Update SSR parameters
updateSSRParameters() {
  // ... other updates ...
  
  // Update camera matrices
  if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
    // CRITICAL: Update camera matrices before calculating inverses
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    
    uniforms.cameraNear.value = this.camera.near
    uniforms.cameraFar.value = this.camera.far
    
    // Calculate inverse projection matrix
    const projMatrix = this.camera.projectionMatrix.clone()
    uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()
    
    // Calculate inverse view matrix
    const viewMatrix = this.camera.matrixWorldInverse.clone()
    uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()
  }
}
```

**Question:** Should camera matrices update every frame or only on change?

---

## 6. Depth/Normal Prepass Material Replacement

**File:** `src/viewer/pathTracer/DepthRenderPass.ts`

```typescript
// Lines 40-80: Material replacement using WeakMap
private originalMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>()

render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, renderTarget: THREE.WebGLRenderTarget) {
  // Store original materials
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material) {
      if (!this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, object.material)
      }
      object.material = this.depthMaterial
    }
  })
  
  // Render
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  
  // Restore original materials
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && this.originalMaterials.has(object)) {
      object.material = this.originalMaterials.get(object)!
    }
  })
}
```

**Question:** Is there a better way to render depth/normals without material replacement?

---

## 7. SSS Intensity Fix

**File:** `src/viewer/postprocessing/SSSShader.ts`

```glsl
// Line 96: FIXED - Return shadow without intensity
float traceShadow(vec2 uv, vec3 rayDir, float maxDistance) {
  // ... shadow tracing logic ...
  
  // FIX: Return shadow without intensity - intensity will be applied in main()
  return min(shadow, 1.0);  // REMOVED: * intensity
}

// Line 142: Apply intensity once in main()
void main() {
  // ... setup ...
  
  float shadow = traceShadow(vUv, rayDir, rayDistance);
  
  // FIX: Apply shadow to color with intensity (intensity applied once here)
  float finalShadow = shadow * intensity;
  color.rgb *= (1.0 - finalShadow);
  
  gl_FragColor = color;
}
```

**Status:** FIXED - Intensity no longer applied twice

---

## Summary of Questions

1. **Shadow Maps:** Is custom render target with depthBuffer correct?
2. **Color Space:** What is the correct setup? Why are colors washed out?
3. **Pass Order:** Is the current order correct?
4. **SSS Light Direction:** How to correctly convert world-space to screen space?
5. **SSR Camera Matrices:** Update every frame or only on change?
6. **Material Replacement:** Better approach for depth/normal prepasses?
7. **Performance:** Further optimizations?
8. **Memory:** Any remaining leaks?


























