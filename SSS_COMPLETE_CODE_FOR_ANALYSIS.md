# Complete Screen Space Shadows (SSS) Implementation for Analysis

## Overview
This document contains the complete implementation of Screen Space Shadows (SSS) for comparison with official Three.js examples and documentation.

## 1. SSS Shader Code (SSSShader.ts)

```glsl
// Vertex Shader
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// Fragment Shader
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
uniform float debugMode;
uniform vec2 resolution;
varying vec2 vUv;

// Read normalized linear depth (DepthRenderPass writes normalized linear depth directly)
float readDepth(sampler2D depthSampler, vec2 coord) {
  float normalizedLinearDepth = texture2D(depthSampler, coord).x;
  return clamp(normalizedLinearDepth, 0.0, 1.0);
}

// Sample depth at UV coordinates
float sampleDepth(vec2 uv) {
  return readDepth(tDepth, uv);
}

// Ray-march in screen space with improved shadow detection
float traceShadow(vec2 uv, vec3 rayDir, float rayLength) {
  float shadow = 0.0;
  float currentDepth = sampleDepth(uv);
  
  if (currentDepth >= 0.999) {
    return 0.0; // Sky or background
  }
  
  // Improved depth step calculation
  float minWorldDepthStep = rayDistance / float(samples) * 0.1; // At least 10% of step distance
  float worldDepthStep = max(abs(rayDir.z) * rayDistance / float(samples), minWorldDepthStep);
  
  // Convert world depth step to normalized depth step
  float depthRange = cameraFar - cameraNear;
  float normalizedDepthStep = worldDepthStep / depthRange;
  normalizedDepthStep = max(normalizedDepthStep, 0.005); // Increased from 0.001
  
  // More lenient occluder detection
  float effectiveBias = bias * 0.5; // More sensitive detection (50% of bias)
  float maxDepthDiff = thickness * 4.0; // Increased from 3.0
  
  // Ray starting position fix - start slightly closer to avoid self-intersection
  float depthOffset = 0.001; // Small offset to start ray slightly closer
  float rayStartDepth = max(currentDepth - depthOffset, 0.0);
  
  vec2 step = rayDir.xy * maxRadius / float(samples);
  
  // Self-comparison fix: start from i=1 to avoid comparing with self
  for (int i = 1; i < 64; i++) {
    if (i > samples) break;
    
    vec2 sampleUV = uv + step * float(i - 1);
    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      break;
    }
    
    float sampleDepthValue = sampleDepth(sampleUV);
    
    // Skip background/sky pixels
    if (sampleDepthValue >= 0.999) {
      continue;
    }
    
    float rayDepth = rayStartDepth + normalizedDepthStep * float(i - 1);
    
    // Check if sample is an occluder
    float depthDiff = rayDepth - sampleDepthValue;
    if (depthDiff > effectiveBias && depthDiff < maxDepthDiff) {
      float shadowFactor = 1.0 - smoothstep(effectiveBias, maxDepthDiff, depthDiff);
      shadow += shadowFactor / float(samples);
    }
  }
  
  return min(shadow, 1.0);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float depth = sampleDepth(vUv);
  
  // Debug modes
  if (debugMode > 0.5 && debugMode < 1.5) {
    // Debug mode 1.0: Visualize normalized linear depth
    gl_FragColor = vec4(depth, depth, depth, 1.0);
    return;
  } else if (debugMode > 1.5 && debugMode < 2.5) {
    // Debug mode 2.0: Visualize shadow only
    float shadow = traceShadow(vUv, normalize(lightDirection), rayDistance);
    gl_FragColor = vec4(shadow, shadow, shadow, 1.0);
    return;
  } else if (debugMode > 2.5 && debugMode < 3.5) {
    // Debug mode 3.0: Visualize raw texture RGB channels
    vec3 raw = texture2D(tDepth, vUv).rgb;
    gl_FragColor = vec4(raw, 1.0);
    return;
  }
  
  if (depth >= 0.999) {
    gl_FragColor = color;
    return;
  }
  
  // Light direction is already in view space (transformed by PostProcessingSystem)
  vec3 normalizedLightDir = normalize(lightDirection);
  
  // Calculate ray direction in screen space
  vec3 rayDir = vec3(
    normalizedLightDir.x * maxRadius,
    normalizedLightDir.y * maxRadius,
    normalizedLightDir.z * rayDistance
  );
  
  // Normalize the ray direction
  float rayLength = length(rayDir);
  if (rayLength > 0.0) {
    rayDir = rayDir / rayLength;
  }
  
  // Trace shadow
  float shadow = traceShadow(vUv, rayDir, rayDistance);
  
  // CRITICAL FIX: Apply shadow to color with intensity
  // shadow from traceShadow is 0-1 (0 = no shadow, 1 = full shadow)
  // intensity controls shadow strength (0 = no shadow, 1 = full shadow, >1 = darker)
  // Clamp finalShadow to [0, 1] to prevent negative colors
  float finalShadow = clamp(shadow * intensity, 0.0, 1.0);
  
  // CRITICAL: If intensity is 0, skip shadow calculation entirely (performance optimization)
  // But we still want to show shadows when intensity > 0, even if shadow value is small
  if (intensity > 0.0) {
    // Apply shadow: multiply color by (1 - shadow) to darken shadowed areas
    // This makes shadowed areas darker while keeping lit areas bright
    // NOTE: Intensity is already reduced in PostProcessingSystem when shadow maps are active
    // to prevent double shadows (layered shadows)
    color.rgb *= (1.0 - finalShadow);
  }
  
  gl_FragColor = vec4(color.rgb, color.a); // Preserve alpha channel
}
```

## 2. SSS Uniforms (TypeScript)

```typescript
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
  bias: { value: 0.01 },
  debugMode: { value: 0.0 },
  resolution: { value: new THREE.Vector2(1, 1) }
}
```

## 3. SSS Configuration Interface

```typescript
export interface PostProcessingConfig {
  enabled: boolean
  sss?: {
    enabled: boolean
    intensity: number
    maxRadius: number
    samples: number
    rayDistance: number
    thickness: number
    bias: number
    lightDirection: THREE.Vector3
  }
  // ... other post-processing effects
}
```

## 4. SSS Parameter Update Function

```typescript
private updateSSSParameters() {
  if (!this.sssPass || !this.config.sss || !this.camera) {
    return
  }
  
  const sss = this.config.sss
  const uniforms = this.sssPass.uniforms
  
  // CRITICAL FIX: Reduce SSS intensity when shadow maps are enabled to prevent double shadows
  // Shadow maps already provide shadows, so SSS should only add subtle contact shadows
  // Use 20% of configured intensity when shadow maps are active to prevent layering
  const shadowMapsActive = this.renderer.shadowMap.enabled
  const effectiveIntensity = shadowMapsActive 
    ? sss.intensity * 0.2  // Reduce to 20% when shadow maps are active
    : sss.intensity         // Use full intensity when shadow maps are disabled
  
  // Update all parameters
  uniforms.intensity.value = effectiveIntensity
  uniforms.maxRadius.value = sss.maxRadius
  uniforms.samples.value = sss.samples
  uniforms.rayDistance.value = sss.rayDistance
  uniforms.thickness.value = sss.thickness
  uniforms.bias.value = sss.bias
  
  // CRITICAL: Transform light direction from world space to view space
  // SSS shader expects light direction in view space (camera's perspective)
  const worldLightDir = sss.lightDirection.clone().normalize()
  const viewLightDir = worldLightDir.applyMatrix4(this.camera.matrixWorldInverse)
  uniforms.lightDirection.value.copy(viewLightDir)
  
  // Update camera parameters
  if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
    uniforms.cameraNear.value = this.camera.near
    uniforms.cameraFar.value = this.camera.far
  }
  
  // Update resolution uniform
  const width = this.renderer.domElement.width || 1
  const height = this.renderer.domElement.height || 1
  uniforms.resolution.value.set(width, height)
  
  // CRITICAL: Get depth texture from depth prepass render target
  let depthTexture: THREE.Texture | null = null
  
  // Priority 1: Use depth prepass texture (most reliable)
  if (this.depthRenderTarget && this.depthRenderTarget.texture) {
    depthTexture = this.depthRenderTarget.texture
  }
  // Priority 2: Try depth texture from depth render target
  else if (this.depthRenderTarget && this.depthRenderTarget.depthTexture) {
    // Note: DepthTexture needs special handling
    console.warn('[PostProcessingSystem] DepthTexture found but using color texture instead')
  }
  // Priority 3: Fallback to composer's depth texture
  else if (this.composer) {
    const composerAny = this.composer as any
    if (composerAny.readBuffer?.depthTexture) {
      depthTexture = composerAny.readBuffer.depthTexture
    }
  }
  
  if (depthTexture) {
    uniforms.tDepth.value = depthTexture
    
    // CRITICAL: Ensure tDiffuse is set from composer's readBuffer
    if (this.composer && this.composer.readBuffer && this.composer.readBuffer.texture) {
      uniforms.tDiffuse.value = this.composer.readBuffer.texture
    }
  }
}
```

## 5. SSS Pass Initialization

```typescript
if (shouldHaveSSS && !hasSSS) {
  // Add SSS pass
  this.sssPass = new ShaderPass(SSSShader)
  this.sssPass.renderToScreen = false
  
  // CRITICAL: Override render method to ensure textures are connected right before rendering
  // This ensures depth texture is always fresh from the prepass
  const originalRender = this.sssPass.render.bind(this.sssPass)
  this.sssPass.render = (renderer: THREE.WebGLRenderer, writeBuffer: any, readBuffer: any, deltaTime: number = 0, maskActive: boolean = false) => {
    // Ensure depth texture is connected right before rendering
    const uniforms = this.sssPass!.uniforms
    if (this.depthRenderTarget && this.depthRenderTarget.texture) {
      uniforms.tDepth.value = this.depthRenderTarget.texture
    }
    // tDiffuse is automatically set by ShaderPass from readBuffer, but verify it's set
    if (readBuffer && readBuffer.texture) {
      uniforms.tDiffuse.value = readBuffer.texture
    }
    // Call original render with all parameters
    originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  }
  
  // CRITICAL: Ensure depth prepass exists
  if (!this.depthRenderPass && this.camera) {
    this.depthRenderPass = new DepthRenderPass(this.camera)
    const width = this.renderer.domElement.width || 1
    const height = this.renderer.domElement.height || 1
    if (!this.depthRenderTarget) {
      this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat
      })
    }
  }
  
  // CRITICAL: Update parameters to connect depth texture
  this.updateSSSParameters()
  
  // Insert after render pass
  const renderPassIndex = this.composer.passes.findIndex((pass) => pass instanceof RenderPass)
  const insertIndex = renderPassIndex !== -1 ? renderPassIndex + 1 : 1
  this.composer.passes.splice(insertIndex, 0, this.sssPass)
}
```

## 6. Render Loop Integration

```typescript
render() {
  // CRITICAL: Preserve shadow map settings during post-processing render
  const shadowMapEnabled = this.renderer.shadowMap.enabled
  const shadowMapType = this.renderer.shadowMap.type
  const shadowMapAutoUpdate = this.renderer.shadowMap.autoUpdate
  
  // CRITICAL: Render depth and normal prepasses before SSS/SSR if needed
  if (this.depthRenderPass && this.depthRenderTarget && (this.config.sss?.enabled || this.config.ssr?.enabled)) {
    this.depthRenderPass.render(this.renderer, this.scene, this.camera, this.depthRenderTarget)
  }
  
  if (this.normalRenderPass && this.normalRenderTarget && this.config.ssr?.enabled) {
    this.normalRenderPass.render(this.renderer, this.scene, this.camera, this.normalRenderTarget)
  }
  
  // CRITICAL: Update SSS/SSR parameters AFTER rendering prepasses
  // This ensures textures are available and connected
  if (this.sssPass && this.config.sss?.enabled) {
    // Force texture update - depth prepass just rendered
    const uniforms = this.sssPass.uniforms
    if (this.depthRenderTarget && this.depthRenderTarget.texture) {
      uniforms.tDepth.value = this.depthRenderTarget.texture
      this.depthRenderTarget.texture.needsUpdate = true
    }
    // Also ensure tDiffuse is set from composer's readBuffer
    if (this.composer && this.composer.readBuffer && this.composer.readBuffer.texture) {
      uniforms.tDiffuse.value = this.composer.readBuffer.texture
    }
    // Update all other parameters
    this.updateSSSParameters()
  }
  
  if (this.composer && this.config.enabled) {
    this.composer.render()
  } else {
    // Fallback to direct render if post-processing is disabled
    this.renderer.render(this.scene, this.camera)
  }
  
  // CRITICAL: Restore shadow map settings after render
  this.renderer.shadowMap.enabled = shadowMapEnabled
  this.renderer.shadowMap.type = shadowMapType
  this.renderer.shadowMap.autoUpdate = shadowMapAutoUpdate
}
```

## 7. Key Features and Fixes

### Features:
1. **Normalized Linear Depth**: Uses normalized linear depth (0-1 range) from depth prepass
2. **View Space Light Direction**: Transforms light direction from world space to view space
3. **Shadow Map Compatibility**: Reduces SSS intensity to 20% when shadow maps are active to prevent double shadows
4. **Debug Modes**: Three debug modes for visualization (depth, shadow, raw texture)
5. **Self-Intersection Prevention**: Starts ray from i=1 to avoid self-comparison
6. **Depth Offset**: Uses small depth offset to prevent self-intersection artifacts

### Fixes Applied:
1. **Multiple Layered Shadows**: Reduced SSS intensity when shadow maps are active
2. **Light Direction Transformation**: Transforms from world space to view space
3. **Depth Reading**: Uses normalized linear depth from depth prepass
4. **Ray Starting Position**: Starts ray slightly closer to avoid self-intersection
5. **Occluder Detection**: More lenient detection with 50% bias and 4x thickness range

## 8. Issues to Compare with Official Implementation

1. **Depth Format**: Are we using the correct depth format? (normalized linear vs NDC depth)
2. **Light Direction Space**: Is view space transformation correct?
3. **Ray Marching Algorithm**: Is the step calculation and occluder detection correct?
4. **Shadow Application**: Is the multiplicative approach `color.rgb *= (1.0 - finalShadow)` correct?
5. **Intensity Reduction**: Is 20% reduction appropriate when shadow maps are active?
6. **Pass Order**: Is SSS placement after RenderPass correct?

## 9. Questions for Analysis

1. Does the official Three.js SSS example use normalized linear depth or NDC depth?
2. What space should light direction be in (world, view, or screen)?
3. Is the ray marching algorithm similar to the official implementation?
4. How does the official implementation handle shadow map conflicts?
5. What is the correct pass order for SSS in the post-processing chain?
6. Are there any performance optimizations in the official implementation we're missing?









