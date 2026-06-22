import * as THREE from 'three'
import { STANDARD_POST_PROCESSING_VERTEX_SHADER } from './shared/CommonShaders'

/**
 * Anamorphic lens flare shader
 * Creates horizontal streaks of light for cinematic effects
 * Based on Three.js example: https://threejs.org/examples/webgpu_postprocessing_anamorphic.html
 */
export const AnamorphicShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 1.0 },
    threshold: { value: 0.5 },
    scale: { value: 1.0 },
    color: { value: new THREE.Color(1.0, 0.9, 0.8) }
  },

  vertexShader: STANDARD_POST_PROCESSING_VERTEX_SHADER,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    uniform float threshold;
    uniform float scale;
    uniform vec3 color;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      
      // Extract bright areas
      float brightness = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
      float contribution = max(0.0, brightness - threshold) / (1.0 - threshold);
      
      // Create horizontal streak effect
      vec2 streakUv = vUv;
      float streak = 0.0;
      
      // Sample multiple horizontal offsets to create streak
      int samples = 8;
      for (int i = 0; i < samples; i++) {
        float offset = float(i) * scale * 0.01;
        
        // Sample left side
        vec2 leftUv = vec2(streakUv.x - offset, streakUv.y);
        vec4 leftSample = texture2D(tDiffuse, leftUv);
        float leftBrightness = dot(leftSample.rgb, vec3(0.299, 0.587, 0.114));
        float leftContrib = max(0.0, leftBrightness - threshold) / (1.0 - threshold);
        
        // Sample right side
        vec2 rightUv = vec2(streakUv.x + offset, streakUv.y);
        vec4 rightSample = texture2D(tDiffuse, rightUv);
        float rightBrightness = dot(rightSample.rgb, vec3(0.299, 0.587, 0.114));
        float rightContrib = max(0.0, rightBrightness - threshold) / (1.0 - threshold);
        
        // Combine with falloff
        float weight = 1.0 / (1.0 + float(i));
        streak += (leftContrib + rightContrib) * weight;
      }
      
      streak /= float(samples);
      
      // Apply color and intensity
      vec3 anamorphic = color * streak * intensity;
      
      // Combine with original
      gl_FragColor = texel + vec4(anamorphic, 0.0);
    }
  `
}
