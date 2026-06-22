# Post-Processing Effects Analysis for Perplexity AI

## Request
Analyze and fix issues with four post-processing effects in a Three.js application:
1. **Ambient Occlusion (AO)** - Effect not visible
2. **Screen Space Shadows (SSS)** - No visual changes
3. **Screen Space Reflections (SSR)** - No visual changes
4. **Emissive Bloom** - Needs UI integration

---

## 1. AMBIENT OCCLUSION (AO) - Not Visible

### Problem
AO pass is created successfully, parameters are set correctly, but the effect is not visible on the model.

### Implementation Details

**File:** `src/viewer/postprocessing/PostProcessingSystem.ts`

**AO Pass Creation (lines 145-194):**
```typescript
if (this.config.ao?.enabled && this.scene && this.camera) {
  let width = this.renderer.domElement.width
  let height = this.renderer.domElement.height
  if (width === 0 || height === 0) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    width = rect.width || window.innerWidth
    height = rect.height || window.innerHeight
  }
  if (width === 0 || height === 0) {
    width = 1920
    height = 1080
  }
  
  this.composer.setSize(width, height)
  this.aoPass = new (SAOPass as any)(this.scene, this.camera, width, height)
  this.updateAOParameters()
  this.aoPass.setSize(width, height)
  this.aoPass.renderToScreen = false
  this.composer.addPass(this.aoPass)
}
```

**Parameter Update (lines 593-796):**
```typescript
private updateAOParameters() {
  if (!this.aoPass || !this.config.ao) return
  
  const ao = this.config.ao
  const SAOPassOutput = (SAOPass as any).OUTPUT || {
    Default: 0,
    SAO: 1,
    Normal: 2
  }
  
  // Map UI output (0-4) to SAOPass.OUTPUT (0, 1, 2)
  let saoOutput = SAOPassOutput.Default
  if (validOutput === 0) saoOutput = SAOPassOutput.Default // Beauty
  else if (validOutput === 2) saoOutput = SAOPassOutput.SAO // SAO Only
  else if (validOutput === 4) saoOutput = SAOPassOutput.Normal // Normal
  
  const passAny = this.aoPass as any
  const params = passAny.params
  
  if (params) {
    if ('output' in params) params.output = saoOutput
    if ('saoIntensity' in params) params.saoIntensity = clampedIntensity // 0-2
    if ('saoScale' in params) params.saoScale = clampedScale // 0.1-10
    if ('saoBias' in params) params.saoBias = clampedBias // 0-1
    if ('saoKernelRadius' in params) params.saoKernelRadius = clampedRadius // 1-200
    if ('saoMinResolution' in params) params.saoMinResolution = clampedResolution // 0-1
    if ('saoBlur' in params) params.saoBlur = Boolean(ao.saoBlur)
    if ('saoBlurRadius' in params) params.saoBlurRadius = clampedBlurRadius // 1-20
    if ('saoBlurStdDev' in params) params.saoBlurStdDev = clampedBlurStdDev // 0.1-10
    if ('saoBlurDepthCutoff' in params) params.saoBlurDepthCutoff = clampedBlurDepthCutoff // 0-0.1
  }
  
  // Also try setting output directly
  if ('output' in passAny) {
    passAny.output = saoOutput
  }
}
```

### Issues to Investigate

1. **SAOPass.OUTPUT Constants**: Verify correct constants (Default=0, SAO=1, Normal=2)
2. **Output Mode**: UI uses 0-4, but SAOPass only has 0, 1, 2 - mapping may be wrong
3. **Pass Order**: AO must come after RenderPass but before other effects
4. **Parameter Application**: Parameters set in `params` object - verify SAOPass reads from there
5. **Intensity Too Low**: Default intensity may be too low to be visible
6. **Scene Requirements**: Scene needs geometry with proper normals for AO to work

### Test Commands
```javascript
// In browser console:
const postProcessingSystem = window.__postProcessingSystem
// Test AO Only mode (should show AO as grayscale)
postProcessingSystem.aoPass.params.output = 1 // SAO Only
postProcessingSystem.aoPass.params.saoIntensity = 2.0 // Max intensity
```

---

## 2. SCREEN SPACE SHADOWS (SSS) - No Visual Changes

### Problem
SSS pass is created and parameters are set, but no visual changes occur. SSS requires depth texture.

### Implementation Details

**SSS Pass Creation (lines 1112-1206):**
```typescript
if (shouldHaveSSS && !hasSSS) {
  this.sssPass = new ShaderPass(SSSShader)
  this.sssPass.renderToScreen = false
  
  // Override render method to ensure textures are connected
  const originalRender = this.sssPass.render.bind(this.sssPass)
  this.sssPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
    const uniforms = this.sssPass!.uniforms
    if (this.depthRenderTarget && this.depthRenderTarget.texture) {
      uniforms.tDepth.value = this.depthRenderTarget.texture
    }
    if (readBuffer && readBuffer.texture) {
      uniforms.tDiffuse.value = readBuffer.texture
    }
    originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  }
  
  // Ensure depth prepass exists
  if (!this.depthRenderPass && this.camera) {
    this.depthRenderPass = new DepthRenderPass(this.camera)
    this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat
    })
  }
  
  this.updateSSSParameters()
  this.composer.passes.splice(insertIndex, 0, this.sssPass)
}
```

**Depth Prepass Rendering (lines 386-430):**
```typescript
if (this.config.enabled && (this.config.sss?.enabled || this.config.ssr?.enabled)) {
  if (this.depthRenderPass && this.depthRenderTarget) {
    const width = this.renderer.domElement.width || 1
    const height = this.renderer.domElement.height || 1
    if (this.depthRenderTarget.width !== width || this.depthRenderTarget.height !== height) {
      this.depthRenderTarget.setSize(width, height)
    }
    // Render depth prepass - writes depth to color texture (red channel)
    this.depthRenderPass.render(this.renderer, this.scene, this.camera, this.depthRenderTarget)
  }
  
  // Update SSS parameters AFTER rendering prepass
  if (this.sssPass && this.config.sss?.enabled) {
    const uniforms = this.sssPass.uniforms
    if (this.depthRenderTarget && this.depthRenderTarget.texture) {
      uniforms.tDepth.value = this.depthRenderTarget.texture
      this.depthRenderTarget.texture.needsUpdate = true
    }
    if (this.composer && this.composer.readBuffer && this.composer.readBuffer.texture) {
      uniforms.tDiffuse.value = this.composer.readBuffer.texture
    }
    this.updateSSSParameters()
  }
}
```

**SSS Shader (src/viewer/postprocessing/SSSShader.ts):**
```typescript
export const SSSShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    lightDirection: { value: new THREE.Vector3(0, -1, 0) },
    intensity: { value: 0.5 },
    maxRadius: { value: 5.0 },
    samples: { value: 8 },
    rayDistance: { value: 50.0 },
    thickness: { value: 0.02 },
    bias: { value: 0.01 }
  },
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 lightDirection;
    uniform float intensity;
    uniform float maxRadius;
    uniform int samples;
    uniform float rayDistance;
    uniform float thickness;
    uniform float bias;
    varying vec2 vUv;

    // Convert depth buffer value to linear depth
    float readDepth(sampler2D depthSampler, vec2 coord) {
      float fragCoordZ = texture2D(depthSampler, coord).x; // Read from red channel
      float n = cameraNear;
      float f = cameraFar;
      float z_ndc = fragCoordZ * 2.0 - 1.0;
      float z_eye = 2.0 * n * f / (f + n - z_ndc * (f - n));
      return (z_eye - n) / (f - n);
    }

    // Ray-march in screen space
    float traceShadow(vec2 uv, vec3 rayDir, float rayLength) {
      float shadow = 0.0;
      float currentDepth = sampleDepth(uv);
      
      if (currentDepth >= 1.0) {
        return 0.0; // Sky or background
      }
      
      vec2 step = rayDir.xy * maxRadius / float(samples);
      float stepDepth = rayDir.z * rayLength / float(samples);
      
      for (int i = 0; i < 64; i++) {
        if (i >= samples) break;
        
        vec2 sampleUV = uv + step * float(i);
        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
          break;
        }
        
        float sampleDepthValue = sampleDepth(sampleUV);
        float rayDepth = currentDepth + accumulatedDepth + stepDepth * float(i);
        
        if (sampleDepthValue < rayDepth - bias) {
          float shadowFactor = 1.0 - smoothstep(0.0, thickness, rayDepth - sampleDepthValue);
          shadow += shadowFactor / float(samples);
        }
        
        accumulatedDepth += stepDepth;
      }
      
      return min(shadow * intensity, 1.0);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float depth = sampleDepth(vUv);
      
      if (depth >= 1.0) {
        gl_FragColor = color;
        return;
      }
      
      // Calculate ray direction in screen space
      vec3 normalizedLightDir = normalize(lightDirection);
      vec3 rayDir = vec3(
        normalizedLightDir.x * maxRadius,
        normalizedLightDir.y * maxRadius,
        normalizedLightDir.z * rayDistance
      );
      
      float rayLength = length(rayDir);
      if (rayLength > 0.0) {
        rayDir = rayDir / rayLength;
      }
      
      // Trace shadow
      float shadow = traceShadow(vUv, rayDir, rayDistance);
      
      // Apply shadow to color
      float finalShadow = shadow * intensity;
      color.rgb *= (1.0 - finalShadow);
      
      gl_FragColor = color;
    }
  `
}
```

**Depth Render Pass (src/viewer/pathTracer/DepthRenderPass.ts):**
```typescript
export class DepthRenderPass {
  private depthMaterial: THREE.ShaderMaterial
  
  constructor(camera: THREE.Camera) {
    this.depthMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec4 vViewPosition;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = mvPosition;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec4 vViewPosition;
        void main() {
          float depth = gl_FragCoord.z; // 0 to 1 (automatic depth)
          gl_FragColor = vec4(depth, 0.0, 0.0, 1.0); // Pack in red channel
        }
      `
    })
  }
  
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, renderTarget: THREE.WebGLRenderTarget) {
    // Replace all materials with depth material
    // Render scene to renderTarget
    // Restore original materials
  }
}
```

### Issues to Investigate

1. **Depth Texture Format**: Depth is packed in red channel as `gl_FragCoord.z` (0-1), but shader reads it correctly
2. **Light Direction**: Light direction is in world space, but shader converts to screen space - may need proper transformation
3. **Depth Reading**: `readDepth()` converts NDC to linear depth - verify formula is correct
4. **Texture Connection Timing**: Depth texture may not be available when SSS pass renders
5. **Ray Direction**: Screen space ray direction calculation may be incorrect
6. **Intensity**: Default intensity (0.5) may be too low

### Test Commands
```javascript
// In browser console:
const postProcessingSystem = window.__postProcessingSystem
// Enable debug mode to visualize depth
postProcessingSystem.sssPass.uniforms.debugMode = { value: 1.0 }
// Increase intensity
postProcessingSystem.sssPass.uniforms.intensity.value = 1.0
// Check if depth texture is connected
console.log('Depth texture:', postProcessingSystem.sssPass.uniforms.tDepth.value)
```

---

## 3. SCREEN SPACE REFLECTIONS (SSR) - No Visual Changes

### Problem
SSR pass is created and parameters are set, but no visual changes occur. SSR requires depth and normal textures.

### Implementation Details

**SSR Pass Creation (lines 1208-1237):**
```typescript
if (shouldHaveSSR && !hasSSR) {
  this.ssrPass = new ShaderPass(SSRShader)
  this.updateSSRParameters()
  // Insert after SSS or AO
  this.composer.passes.splice(insertIndex, 0, this.ssrPass)
}
```

**Normal Prepass Rendering (lines 400-409):**
```typescript
if (this.normalRenderPass && this.normalRenderTarget) {
  const width = this.renderer.domElement.width || 1
  const height = this.renderer.domElement.height || 1
  if (this.normalRenderTarget.width !== width || this.normalRenderTarget.height !== height) {
    this.normalRenderTarget.setSize(width, height)
  }
  // Render normal prepass
  this.normalRenderPass.render(this.renderer, this.scene, this.camera, this.normalRenderTarget)
}

if (this.ssrPass && this.config.ssr?.enabled) {
  this.updateSSRParameters()
}
```

**SSR Parameter Update (lines 1420-1478):**
```typescript
private updateSSRParameters() {
  if (!this.ssrPass || !this.config.ssr || !this.camera) return
  
  const ssr = this.config.ssr
  const uniforms = this.ssrPass.uniforms
  uniforms.intensity.value = ssr.intensity
  uniforms.thickness.value = ssr.thickness
  uniforms.maxDistance.value = ssr.maxDistance
  uniforms.maxSteps.value = ssr.maxSteps
  uniforms.maxBinarySearchSteps.value = ssr.maxBinarySearchSteps
  uniforms.roughnessFade.value = ssr.roughnessFade
  uniforms.fadeDistance.value = ssr.fadeDistance
  uniforms.fadeMargin.value = ssr.fadeMargin
  
  // Update resolution
  const width = this.renderer.domElement.width || 1
  const height = this.renderer.domElement.height || 1
  uniforms.resolution.value.set(width, height)
  
  // Update camera matrices
  if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
    uniforms.cameraNear.value = this.camera.near
    uniforms.cameraFar.value = this.camera.far
    
    // Calculate inverse projection matrix
    const projMatrix = this.camera.projectionMatrix.clone()
    uniforms.cameraProjectionMatrixInverse.value = projMatrix.invert()
    
    // Calculate inverse view matrix
    const viewMatrix = this.camera.matrixWorldInverse.clone()
    uniforms.cameraViewMatrixInverse.value = viewMatrix.invert()
  }
  
  // Get depth texture
  if (this.depthRenderTarget && this.depthRenderTarget.texture) {
    uniforms.tDepth.value = this.depthRenderTarget.texture
  }
  
  // Get normal texture
  if (this.normalRenderTarget && this.normalRenderTarget.texture) {
    uniforms.tNormal.value = this.normalRenderTarget.texture
  }
}
```

**SSR Shader (src/viewer/postprocessing/SSRShader.ts):**
```typescript
export const SSRShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
    cameraViewMatrixInverse: { value: new THREE.Matrix4() },
    thickness: { value: 0.01 },
    maxDistance: { value: 100.0 },
    maxSteps: { value: 20 },
    maxBinarySearchSteps: { value: 8 },
    intensity: { value: 1.0 },
    roughnessFade: { value: 1.0 },
    fadeDistance: { value: 10.0 },
    fadeMargin: { value: 0.05 }
  },
  fragmentShader: `
    precision highp float;
    
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec2 resolution;
    uniform mat4 cameraProjectionMatrixInverse;
    uniform mat4 cameraViewMatrixInverse;
    uniform float thickness;
    uniform float maxDistance;
    uniform int maxSteps;
    uniform int maxBinarySearchSteps;
    uniform float intensity;
    uniform float roughnessFade;
    uniform float fadeDistance;
    uniform float fadeMargin;
    varying vec2 vUv;

    // Convert depth buffer value to linear depth
    float readDepth(sampler2D depthSampler, vec2 coord) {
      float fragCoordZ = texture2D(depthSampler, coord).x;
      float n = cameraNear;
      float f = cameraFar;
      float z_ndc = fragCoordZ * 2.0 - 1.0;
      float z_eye = 2.0 * n * f / (f + n - z_ndc * (f - n));
      return (z_eye - n) / (f - n);
    }

    // Reconstruct view position from depth
    vec3 getViewPos(vec2 uv, float depth) {
      vec4 ndcPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 viewPos = cameraProjectionMatrixInverse * ndcPos;
      viewPos /= viewPos.w;
      return viewPos.xyz;
    }

    // Convert world normal to view space normal
    vec3 getViewNormal(vec2 uv) {
      vec3 normal = texture2D(tNormal, uv).xyz * 2.0 - 1.0; // Decode from 0-1 to -1 to 1
      return normalize(normal);
    }

    // Project view space to screen space
    vec2 projectViewToScreen(vec3 viewPos) {
      vec4 clipPos = projectionMatrix * vec4(viewPos, 1.0);
      clipPos.xy /= clipPos.w;
      return clipPos.xy * 0.5 + 0.5;
    }

    // Binary search for intersection
    float binarySearch(vec3 dir, inout vec3 hitCoord, float dDepth) {
      float depth;
      vec2 projectedCoord;
      
      for (int i = 0; i < 64; i++) {
        if (i >= maxBinarySearchSteps) break;
        
        projectedCoord = projectViewToScreen(hitCoord);
        depth = readDepth(tDepth, projectedCoord);
        float depthDiff = hitCoord.z - depth;
        
        if (depthDiff < 0.0) {
          hitCoord += dir;
        }
        
        dir *= 0.5;
        hitCoord -= dir;
      }
      
      projectedCoord = projectViewToScreen(hitCoord);
      return depth;
    }

    // Ray marching
    float rayMarch(vec3 dir, inout vec3 hitCoord) {
      float depth;
      float deltaDepth = dir.z;
      dir *= maxDistance / float(maxSteps);
      
      vec2 projectedCoord;
      
      for (int i = 0; i < 64; i++) {
        if (i >= maxSteps) break;
        
        hitCoord += dir;
        projectedCoord = projectViewToScreen(hitCoord);
        
        if (projectedCoord.x < 0.0 || projectedCoord.x > 1.0 || 
            projectedCoord.y < 0.0 || projectedCoord.y > 1.0) {
          return 1.0;
        }
        
        depth = readDepth(tDepth, projectedCoord);
        deltaDepth += dir.z;
        
        float depthDiff = hitCoord.z - depth;
        
        if (depthDiff > 0.0 && depthDiff < thickness) {
          binarySearch(dir, hitCoord, depthDiff);
          return depth;
        }
      }
      
      return 1.0;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float depth = readDepth(tDepth, vUv);
      
      if (depth >= 1.0) {
        gl_FragColor = color;
        return;
      }
      
      // Get view normal and view position
      vec3 normal = getViewNormal(vUv);
      vec3 viewPos = getViewPos(vUv, depth);
      
      // Calculate reflection direction in view space
      vec3 viewDir = normalize(-viewPos);
      vec3 reflectDir = reflect(viewDir, normal);
      
      // Start ray marching in view space
      vec3 hitCoord = viewPos;
      float hitDepth = rayMarch(reflectDir * maxDistance / float(maxSteps), hitCoord);
      
      vec4 reflectionColor = vec4(0.0);
      
      if (hitDepth < 1.0) {
        vec2 projectedCoord = projectViewToScreen(hitCoord);
        
        if (projectedCoord.x >= 0.0 && projectedCoord.x <= 1.0 &&
            projectedCoord.y >= 0.0 && projectedCoord.y <= 1.0) {
          reflectionColor = texture2D(tDiffuse, projectedCoord);
          
          // Fade based on distance
          float dist = length(hitCoord - viewPos);
          float fadeFactor = 1.0 - smoothstep(fadeDistance - fadeMargin, fadeDistance, dist);
          
          // Apply intensity and fade
          reflectionColor *= intensity * fadeFactor * roughnessFade;
        }
      }
      
      // Blend reflection with original color
      color.rgb = mix(color.rgb, reflectionColor.rgb, reflectionColor.a);
      
      gl_FragColor = color;
    }
  `
}
```

**Normal Render Pass (src/viewer/pathTracer/NormalRenderPass.ts):**
```typescript
export class NormalRenderPass {
  private normalMaterial: THREE.ShaderMaterial
  
  constructor() {
    this.normalMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 normal = normalize(vNormal);
          gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0); // Encode in RGB (0-1 range)
        }
      `
    })
  }
  
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, renderTarget: THREE.WebGLRenderTarget) {
    // Replace all materials with normal material
    // Render scene to renderTarget
    // Restore original materials
  }
}
```

### Issues to Investigate

1. **Normal Texture Format**: Normals are encoded as `normal * 0.5 + 0.5` (0-1 range), shader decodes as `normal * 2.0 - 1.0` - verify this is correct
2. **Camera Matrices**: `cameraProjectionMatrixInverse` and `cameraViewMatrixInverse` are calculated but may not be updated every frame
3. **Resolution Uniform**: `resolution` uniform may not match actual render size
4. **Texture Connection**: Both depth and normal textures must be connected before SSR pass renders
5. **View Space vs World Space**: Normals are in view space (from normalMatrix), but SSR may need world space
6. **Ray Marching**: Ray marching algorithm may have bugs in depth comparison or binary search

### Test Commands
```javascript
// In browser console:
const postProcessingSystem = window.__postProcessingSystem
// Check if textures are connected
console.log('Depth texture:', postProcessingSystem.ssrPass.uniforms.tDepth.value)
console.log('Normal texture:', postProcessingSystem.ssrPass.uniforms.tNormal.value)
// Increase intensity
postProcessingSystem.ssrPass.uniforms.intensity.value = 1.0
// Check camera matrices
console.log('Projection inverse:', postProcessingSystem.ssrPass.uniforms.cameraProjectionMatrixInverse.value)
console.log('View inverse:', postProcessingSystem.ssrPass.uniforms.cameraViewMatrixInverse.value)
```

---

## 4. EMISSIVE BLOOM - Needs UI Integration

### Problem
Infrastructure exists (UnrealBloomPass), but needs full integration with UI controls and state management.

### Implementation Details

**Bloom Pass Creation (lines 229-241, 856-891):**
```typescript
if (this.config.bloom?.enabled) {
  const resolution = new THREE.Vector2(
    this.renderer.domElement.width,
    this.renderer.domElement.height
  )
  this.bloomPass = new UnrealBloomPass(
    resolution,
    this.config.bloom.strength,
    this.config.bloom.radius,
    this.config.bloom.threshold
  )
  this.composer.addPass(this.bloomPass)
}

// In updateConfig():
if (this.composer && this.config.bloom) {
  const shouldHaveBloom = this.config.enabled && this.config.bloom.enabled
  const hasBloom = this.bloomPass !== null
  
  if (shouldHaveBloom && !hasBloom) {
    this.bloomPass = new UnrealBloomPass(resolution, strength, radius, threshold)
    const outputPassIndex = this.composer.passes.length - 1
    this.composer.passes.splice(outputPassIndex, 0, this.bloomPass)
  } else if (!shouldHaveBloom && hasBloom) {
    this.bloomPass.dispose()
    this.bloomPass = null
  } else if (hasBloom && this.bloomPass && this.config.bloom) {
    // Update parameters
    this.bloomPass.strength = this.config.bloom.strength
    this.bloomPass.radius = this.config.bloom.radius
    this.bloomPass.threshold = this.config.bloom.threshold
  }
}
```

**UI State (src/components/RenderingQualityPanel.tsx):**
```typescript
bloomEnabled,
bloomStrength,
bloomRadius,
bloomThreshold,
setBloomEnabled,
setBloomStrength,
setBloomRadius,
setBloomThreshold,
```

### Issues to Investigate

1. **Emissive Materials**: Materials need `emissive` color set and `emissiveIntensity` > 0
2. **Threshold**: Default threshold (usually 0.9) may be too high - emissive materials may not exceed it
3. **UI Connection**: Verify UI controls properly update `postProcessingSystem.updateConfig()`
4. **Material Emissive**: Materials must have emissive properties set to high values for bloom to work

### Test Commands
```javascript
// In browser console:
const postProcessingSystem = window.__postProcessingSystem
// Lower threshold to see if it picks up emissive materials
postProcessingSystem.bloomPass.threshold = 0.1
postProcessingSystem.bloomPass.strength = 2.0
// Check if materials have emissive properties
scene.traverse((obj) => {
  if (obj.material && obj.material.emissive) {
    console.log('Emissive material:', obj.material.emissive, obj.material.emissiveIntensity)
  }
})
```

---

## Common Issues Across All Effects

### 1. Pass Order
Effects must be in correct order: **Render → AO → SSS → SSR → Bloom → Anamorphic → LUT → ToneMapping → ColorGrading → Output**

Current order validation exists in `validatePassOrder()` method (lines 321-378).

### 2. Render Target Sizing
All render targets must match canvas size. Code updates sizes in `setSize()` method (lines 447-478).

### 3. Texture Connection Timing
Depth/normal textures must be rendered before passes that need them. Current code renders prepasses in `render()` method before composer (lines 386-430).

### 4. Parameter Updates
Parameters are updated in `updateConfig()`, but may not be applied if passes are created before config is set.

---

## Files to Review

1. **src/viewer/postprocessing/PostProcessingSystem.ts** - Main system (1479 lines)
2. **src/viewer/postprocessing/SSSShader.ts** - SSS shader (140 lines)
3. **src/viewer/postprocessing/SSRShader.ts** - SSR shader (193 lines)
4. **src/viewer/pathTracer/DepthRenderPass.ts** - Depth prepass
5. **src/viewer/pathTracer/NormalRenderPass.ts** - Normal prepass
6. **src/components/RenderingQualityPanel.tsx** - UI controls
7. **src/store/useAppStore.ts** - State management

---

## Questions for Perplexity

1. **AO**: Why is SAOPass not visible even when parameters are set correctly? Is the output mode mapping correct?
2. **SSS**: Why is depth texture not producing shadows? Is the light direction conversion correct?
3. **SSR**: Why are reflections not appearing? Are camera matrices being updated correctly?
4. **Bloom**: Why aren't emissive materials triggering bloom? Is the threshold too high?

Please analyze the code and provide fixes for all four effects.


























