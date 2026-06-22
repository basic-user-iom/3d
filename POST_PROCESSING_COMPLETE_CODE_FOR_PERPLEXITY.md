# Complete Post-Processing Code for Perplexity AI Analysis

## Request
Please analyze and provide fixes for four post-processing effects that are not working:
1. **Ambient Occlusion (AO)** - Pass created but effect not visible
2. **Screen Space Shadows (SSS)** - Pass created but no visual changes
3. **Screen Space Reflections (SSR)** - Pass created but no visual changes
4. **Emissive Bloom** - Infrastructure exists but needs verification

---

## Complete Code Files

### File 1: PostProcessingSystem.ts (Main System - 1479 lines)

**Key Sections:**

#### AO Pass Creation (lines 145-194, 995-1110)
```typescript
// In initialize():
if (this.config.ao?.enabled && this.scene && this.camera) {
  let width = this.renderer.domElement.width || 1920
  let height = this.renderer.domElement.height || 1080
  this.composer.setSize(width, height)
  this.aoPass = new (SAOPass as any)(this.scene, this.camera, width, height)
  this.updateAOParameters()
  this.aoPass.setSize(width, height)
  this.aoPass.renderToScreen = false
  this.composer.addPass(this.aoPass)
}

// In updateConfig() - dynamic AO pass management:
if (shouldHaveAO && !hasAO) {
  this.aoPass = new (SAOPass as any)(this.scene, this.camera, width, height)
  this.updateAOParameters()
  const renderPassIndex = this.composer.passes.findIndex((pass) => pass instanceof RenderPass)
  this.composer.passes.splice(renderPassIndex + 1, 0, this.aoPass)
}
```

#### AO Parameter Update (lines 593-796)
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
  const outputValue = Number(ao.output)
  const validOutput = (!isNaN(outputValue) && isFinite(outputValue) && outputValue >= 0 && outputValue <= 4) 
    ? Math.round(outputValue) 
    : 0
  
  let saoOutput = SAOPassOutput.Default
  if (validOutput === 0) saoOutput = SAOPassOutput.Default // Beauty
  else if (validOutput === 2) saoOutput = SAOPassOutput.SAO // SAO Only
  else if (validOutput === 4) saoOutput = SAOPassOutput.Normal // Normal
  
  const passAny = this.aoPass as any
  const params = passAny.params
  
  if (params) {
    if ('output' in params) params.output = saoOutput
    if ('saoIntensity' in params) {
      const intensity = Number(ao.saoIntensity)
      if (!isNaN(intensity) && isFinite(intensity)) {
        params.saoIntensity = Math.max(0, Math.min(2, intensity))
      }
    }
    if ('saoScale' in params) {
      const scale = Number(ao.saoScale)
      if (!isNaN(scale) && isFinite(scale)) {
        params.saoScale = Math.max(0.1, Math.min(10, scale))
      }
    }
    // ... other parameters (bias, kernelRadius, minResolution, blur settings)
  }
  
  // Also try setting output directly
  if ('output' in passAny) {
    passAny.output = saoOutput
  }
}
```

#### SSS Pass Creation (lines 1112-1206)
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

#### SSS Parameter Update (lines 480-591)
```typescript
private updateSSSParameters() {
  if (!this.sssPass || !this.config.sss || !this.camera) return
  
  const sss = this.config.sss
  const uniforms = this.sssPass.uniforms
  
  uniforms.intensity.value = sss.intensity
  uniforms.maxRadius.value = sss.maxRadius
  uniforms.samples.value = sss.samples
  uniforms.rayDistance.value = sss.rayDistance
  uniforms.thickness.value = sss.thickness
  uniforms.bias.value = sss.bias
  uniforms.lightDirection.value.copy(sss.lightDirection)
  
  if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
    uniforms.cameraNear.value = this.camera.near
    uniforms.cameraFar.value = this.camera.far
  }
  
  // Get depth texture from depth prepass
  let depthTexture: THREE.Texture | null = null
  if (this.depthRenderTarget && this.depthRenderTarget.texture) {
    depthTexture = this.depthRenderTarget.texture
  } else if (this.composer && (this.composer as any).readBuffer?.depthTexture) {
    depthTexture = (this.composer as any).readBuffer.depthTexture
  }
  
  if (depthTexture) {
    uniforms.tDepth.value = depthTexture
    if (this.composer && this.composer.readBuffer && this.composer.readBuffer.texture) {
      uniforms.tDiffuse.value = this.composer.readBuffer.texture
    }
  } else {
    console.error('[PostProcessingSystem] ❌ SSS depth texture NOT found!')
  }
}
```

#### SSR Pass Creation (lines 1208-1237)
```typescript
if (shouldHaveSSR && !hasSSR) {
  this.ssrPass = new ShaderPass(SSRShader)
  this.updateSSRParameters()
  const insertIndex = sssIndex !== -1 ? sssIndex + 1 : (aoIndex !== -1 ? aoIndex + 1 : (renderPassIndex !== -1 ? renderPassIndex + 1 : 1))
  this.composer.passes.splice(insertIndex, 0, this.ssrPass)
}
```

#### SSR Parameter Update (lines 1420-1478)
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

#### Render Method (lines 370-445)
```typescript
render() {
  // Preserve shadow map settings
  const shadowMapEnabled = this.renderer.shadowMap.enabled
  const shadowMapType = this.renderer.shadowMap.type
  const shadowMapAutoUpdate = this.renderer.shadowMap.autoUpdate
  
  // CRITICAL: Render depth and normal prepasses before SSS/SSR if needed
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
    
    if (this.normalRenderPass && this.normalRenderTarget) {
      const width = this.renderer.domElement.width || 1
      const height = this.renderer.domElement.height || 1
      if (this.normalRenderTarget.width !== width || this.normalRenderTarget.height !== height) {
        this.normalRenderTarget.setSize(width, height)
      }
      // Render normal prepass
      this.normalRenderPass.render(this.renderer, this.scene, this.camera, this.normalRenderTarget)
    }
    
    // CRITICAL: Update SSS/SSR parameters AFTER rendering prepasses
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
    if (this.ssrPass && this.config.ssr?.enabled) {
      this.updateSSRParameters()
    }
  }
  
  if (this.composer && this.config.enabled) {
    this.composer.render()
  } else {
    this.renderer.render(this.scene, this.camera)
  }
  
  // Restore shadow map settings
  this.renderer.shadowMap.enabled = shadowMapEnabled
  this.renderer.shadowMap.type = shadowMapType
  this.renderer.shadowMap.autoUpdate = shadowMapAutoUpdate
}
```

#### Bloom Pass Management (lines 856-891)
```typescript
if (this.composer && this.config.bloom) {
  const shouldHaveBloom = this.config.enabled && this.config.bloom.enabled
  const hasBloom = this.bloomPass !== null
  
  if (shouldHaveBloom && !hasBloom) {
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
    const outputPassIndex = this.composer.passes.length - 1
    this.composer.passes.splice(outputPassIndex, 0, this.bloomPass)
  } else if (!shouldHaveBloom && hasBloom) {
    if (this.bloomPass) {
      const index = this.composer.passes.indexOf(this.bloomPass)
      if (index !== -1) {
        this.composer.passes.splice(index, 1)
      }
      this.bloomPass.dispose()
      this.bloomPass = null
    }
  } else if (hasBloom && this.bloomPass && this.config.bloom) {
    // Update bloom parameters
    this.bloomPass.strength = this.config.bloom.strength
    this.bloomPass.radius = this.config.bloom.radius
    this.bloomPass.threshold = this.config.bloom.threshold
  }
}
```

---

### File 2: SSSShader.ts (Complete Shader)

```typescript
import * as THREE from 'three'

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
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
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

    float readDepth(sampler2D depthSampler, vec2 coord) {
      float fragCoordZ = texture2D(depthSampler, coord).x;
      float n = cameraNear;
      float f = cameraFar;
      float z_ndc = fragCoordZ * 2.0 - 1.0;
      float z_eye = 2.0 * n * f / (f + n - z_ndc * (f - n));
      return (z_eye - n) / (f - n);
    }

    float sampleDepth(vec2 uv) {
      return readDepth(tDepth, uv);
    }

    float traceShadow(vec2 uv, vec3 rayDir, float rayLength) {
      float shadow = 0.0;
      float currentDepth = sampleDepth(uv);
      
      if (currentDepth >= 1.0) {
        return 0.0;
      }
      
      vec2 step = rayDir.xy * maxRadius / float(samples);
      float stepDepth = rayDir.z * rayLength / float(samples);
      
      float accumulatedDepth = 0.0;
      
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
      
      float shadow = traceShadow(vUv, rayDir, rayDistance);
      float finalShadow = shadow * intensity;
      color.rgb *= (1.0 - finalShadow);
      
      gl_FragColor = color;
    }
  `
}
```

---

### File 3: SSRShader.ts (Complete Shader)

```typescript
import * as THREE from 'three'

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
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
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

    float readDepth(sampler2D depthSampler, vec2 coord) {
      float fragCoordZ = texture2D(depthSampler, coord).x;
      float n = cameraNear;
      float f = cameraFar;
      float z_ndc = fragCoordZ * 2.0 - 1.0;
      float z_eye = 2.0 * n * f / (f + n - z_ndc * (f - n));
      return (z_eye - n) / (f - n);
    }

    vec3 getViewPos(vec2 uv, float depth) {
      vec4 ndcPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 viewPos = cameraProjectionMatrixInverse * ndcPos;
      viewPos /= viewPos.w;
      return viewPos.xyz;
    }

    vec3 getViewNormal(vec2 uv) {
      vec3 normal = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
      return normalize(normal);
    }

    vec2 projectViewToScreen(vec3 viewPos) {
      vec4 clipPos = projectionMatrix * vec4(viewPos, 1.0);
      clipPos.xy /= clipPos.w;
      return clipPos.xy * 0.5 + 0.5;
    }

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
      
      vec3 normal = getViewNormal(vUv);
      vec3 viewPos = getViewPos(vUv, depth);
      
      vec3 viewDir = normalize(-viewPos);
      vec3 reflectDir = reflect(viewDir, normal);
      
      vec3 hitCoord = viewPos;
      float hitDepth = rayMarch(reflectDir * maxDistance / float(maxSteps), hitCoord);
      
      vec4 reflectionColor = vec4(0.0);
      
      if (hitDepth < 1.0) {
        vec2 projectedCoord = projectViewToScreen(hitCoord);
        
        if (projectedCoord.x >= 0.0 && projectedCoord.x <= 1.0 &&
            projectedCoord.y >= 0.0 && projectedCoord.y <= 1.0) {
          reflectionColor = texture2D(tDiffuse, projectedCoord);
          
          float dist = length(hitCoord - viewPos);
          float fadeFactor = 1.0 - smoothstep(fadeDistance - fadeMargin, fadeDistance, dist);
          
          reflectionColor *= intensity * fadeFactor * roughnessFade;
        }
      }
      
      color.rgb = mix(color.rgb, reflectionColor.rgb, reflectionColor.a);
      
      gl_FragColor = color;
    }
  `
}
```

---

### File 4: DepthRenderPass.ts (Complete)

```typescript
import * as THREE from 'three'

export class DepthRenderPass {
  private depthMaterial: THREE.ShaderMaterial
  private originalMaterials: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>

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
          float depth = gl_FragCoord.z; // 0 to 1 (automatic depth buffer)
          gl_FragColor = vec4(depth, 0.0, 0.0, 1.0); // Pack in red channel
        }
      `
    })

    this.originalMaterials = new WeakMap()
  }

  private replaceMaterials(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      if (object.material && !this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, object.material)
      }
      object.material = this.depthMaterial
    }
  }

  private restoreMaterials(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      const originalMaterial = this.originalMaterials.get(object)
      if (originalMaterial) {
        object.material = originalMaterial
      }
    }
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, renderTarget: THREE.WebGLRenderTarget) {
    // Replace all materials with depth material
    scene.traverse((obj) => this.replaceMaterials(obj))
    
    // Render to render target
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    
    // Restore original materials
    scene.traverse((obj) => this.restoreMaterials(obj))
  }
}
```

---

### File 5: NormalRenderPass.ts (Complete)

```typescript
import * as THREE from 'three'

export class NormalRenderPass {
  private normalMaterial: THREE.ShaderMaterial
  private originalMaterials: WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>

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

    this.originalMaterials = new WeakMap()
  }

  private replaceMaterials(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      if (object.material && !this.originalMaterials.has(object)) {
        this.originalMaterials.set(object, object.material)
      }
      object.material = this.normalMaterial
    }
  }

  private restoreMaterials(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      const originalMaterial = this.originalMaterials.get(object)
      if (originalMaterial) {
        object.material = originalMaterial
      }
    }
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, renderTarget: THREE.WebGLRenderTarget) {
    // Replace all materials with normal material
    scene.traverse((obj) => this.replaceMaterials(obj))
    
    // Render to render target
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    
    // Restore original materials
    scene.traverse((obj) => this.restoreMaterials(obj))
  }
}
```

---

## Issues Summary

### AO Issues
1. Output mode mapping (UI 0-4 vs SAOPass 0-2)
2. Parameter application (params object vs direct properties)
3. Pass order in EffectComposer
4. Intensity may be too low to be visible

### SSS Issues
1. Depth texture format (packed in red channel, read correctly?)
2. Light direction conversion (world space to screen space)
3. Depth reading formula (NDC to linear depth)
4. Texture connection timing

### SSR Issues
1. Normal texture format (encoded/decoded correctly?)
2. Camera matrices update frequency
3. Resolution uniform matching actual size
4. View space vs world space normals

### Bloom Issues
1. Emissive material requirements (emissive color + intensity)
2. Threshold too high (default 0.9 may filter out emissive)
3. UI connection verification

---

## Test Scenarios

### AO Test
```javascript
// Set AO to "SAO Only" mode (should show grayscale AO)
postProcessingSystem.aoPass.params.output = 1
postProcessingSystem.aoPass.params.saoIntensity = 2.0
```

### SSS Test
```javascript
// Enable debug mode to visualize depth
postProcessingSystem.sssPass.uniforms.debugMode = { value: 1.0 }
// Check depth texture
console.log('Depth texture:', postProcessingSystem.sssPass.uniforms.tDepth.value)
```

### SSR Test
```javascript
// Check textures
console.log('Depth:', postProcessingSystem.ssrPass.uniforms.tDepth.value)
console.log('Normal:', postProcessingSystem.ssrPass.uniforms.tNormal.value)
// Check matrices
console.log('Proj inverse:', postProcessingSystem.ssrPass.uniforms.cameraProjectionMatrixInverse.value)
```

### Bloom Test
```javascript
// Lower threshold
postProcessingSystem.bloomPass.threshold = 0.1
postProcessingSystem.bloomPass.strength = 2.0
```

---

## Questions for Perplexity

1. **AO**: Why is SAOPass not visible? Is output mode mapping correct? Are parameters being applied correctly?
2. **SSS**: Why is depth texture not producing shadows? Is light direction conversion correct? Is depth reading formula correct?
3. **SSR**: Why are reflections not appearing? Are camera matrices updated correctly? Is normal texture format correct?
4. **Bloom**: Why aren't emissive materials triggering bloom? Is threshold too high? What are the requirements for emissive materials?

Please provide fixes for all four effects based on the complete code provided.


























