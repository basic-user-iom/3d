import * as THREE from 'three'

/**
 * Screen-Space Reflections (SSR) shader
 * Traces reflection rays in screen space using depth and normal information
 * Based on Three.js example: https://threejs.org/examples/webgpu_postprocessing_ssr.html
 */
export const SSRShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraProjectionMatrix: { value: new THREE.Matrix4() },
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
    uniform mat4 cameraProjectionMatrix;
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

    // Read normalized linear depth (DepthRenderPass writes normalized linear depth directly)
    // Depth is already in 0-1 range where 0 = near, 1 = far
    float readDepth(sampler2D depthSampler, vec2 coord) {
      float normalizedLinearDepth = texture2D(depthSampler, coord).x;
      return clamp(normalizedLinearDepth, 0.0, 1.0);
    }

    // Reconstruct view position from normalized linear depth
    // depth is normalized linear depth (0 = near, 1 = far)
    vec3 getViewPos(vec2 uv, float depth) {
      // Convert normalized linear depth to view space Z (negative, camera looks down -Z)
      float linearDepth = depth * (cameraFar - cameraNear) + cameraNear;
      float viewZ = -linearDepth;
      
      // Reconstruct view space position from UV and depth
      // Get ray direction in view space from screen UV
      vec4 ndcPos = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
      vec4 viewRay = cameraProjectionMatrixInverse * ndcPos;
      viewRay /= viewRay.w;
      
      // Scale ray to intersect with the depth plane
      // viewRay.z is negative, so we divide by it to get the scale factor
      float t = viewZ / viewRay.z;
      return viewRay.xyz * t;
    }

    // FIX: Convert encoded normal (0-1 range) to view space normal (-1 to 1 range)
    // Normal texture encodes normals as: normal * 0.5 + 0.5 (maps -1 to 1 -> 0 to 1)
    // So we decode as: (normal - 0.5) * 2.0 = normal * 2.0 - 1.0
    vec3 getViewNormal(vec2 uv) {
      vec3 encodedNormal = texture2D(tNormal, uv).xyz; // 0-1 range
      vec3 normal = encodedNormal * 2.0 - 1.0; // Decode to -1 to 1 range
      return normalize(normal);
    }

    // Project view space to screen space
    // FIX: Use cameraProjectionMatrix uniform instead of projectionMatrix (not available in fragment shader)
    vec2 projectViewToScreen(vec3 viewPos) {
      vec4 clipPos = cameraProjectionMatrix * vec4(viewPos, 1.0);
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
        float viewZ = depthToViewZ(depth);
        float depthDiff = hitCoord.z - viewZ;
        
        // Adjust hitCoord based on depth difference
        if (depthDiff < 0.0) {
          // hitCoord is behind surface, move forward
          hitCoord += dir;
        } else {
          // hitCoord is in front of surface, move backward
          hitCoord -= dir;
        }
        
        dir *= 0.5;
      }
      
      projectedCoord = projectViewToScreen(hitCoord);
      depth = readDepth(tDepth, projectedCoord);
      
      return depth;
    }

    // Convert normalized linear depth to view space Z
    float depthToViewZ(float normalizedDepth) {
      float linearDepth = normalizedDepth * (cameraFar - cameraNear) + cameraNear;
      return -linearDepth; // View space Z is negative (camera looks down -Z)
    }
    
    // Ray marching
    float rayMarch(vec3 dir, inout vec3 hitCoord) {
      float depth;
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
        // Convert normalized depth to view space Z for comparison
        float viewZ = depthToViewZ(depth);
        
        // Compare view space Z values (both negative, so closer = more negative)
        float depthDiff = hitCoord.z - viewZ;
        
        // hitCoord.z should be more negative (closer) than viewZ for intersection
        // depthDiff < 0 means hitCoord is behind the surface, depthDiff > 0 means in front
        // We want depthDiff close to 0 (within thickness) for intersection
        if (abs(depthDiff) < thickness) {
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
