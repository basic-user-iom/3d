import { STANDARD_POST_PROCESSING_VERTEX_SHADER } from './shared/CommonShaders'

/**
 * Depth prepass shader for extracting depth buffer
 * Renders depth values to a texture for use by SSS/SSR
 */
export const DepthPassShader = {
  uniforms: {
    tDiffuse: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 }
  },

  vertexShader: STANDARD_POST_PROCESSING_VERTEX_SHADER,

  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float cameraNear;
    uniform float cameraFar;
    varying vec2 vUv;

    // Extract depth from depth buffer (gl_FragCoord.z is the depth value)
    void main() {
      // gl_FragCoord.z is already in [0,1] range (NDC depth)
      float depth = gl_FragCoord.z;
      // Pack depth into red channel
      gl_FragColor = vec4(depth, depth, depth, 1.0);
    }
  `
}





