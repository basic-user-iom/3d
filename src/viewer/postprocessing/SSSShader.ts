import * as THREE from 'three'

/**
 * Screen-Space Shadows (SSS) shader
 * Traces shadows in screen space using depth information
 * Based on Three.js example: https://threejs.org/examples/webgpu_postprocessing_sss.html
 */
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
    bias: { value: 0.01 },
    debugMode: { value: 0.0 },
    resolution: { value: new THREE.Vector2(1, 1) }
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
  `
}
