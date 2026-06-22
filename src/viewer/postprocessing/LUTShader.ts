import * as THREE from 'three'
import { STANDARD_POST_PROCESSING_VERTEX_SHADER } from './shared/CommonShaders'

/**
 * 3D LUT shader for color grading
 * Based on Three.js example: https://threejs.org/examples/webgl_postprocessing_3dlut.html
 */
export const LUTShader = {
  uniforms: {
    tDiffuse: { value: null },
    lutMap: { value: null },
    lutSize: { value: 0 },
    intensity: { value: 1.0 }
  },

  vertexShader: STANDARD_POST_PROCESSING_VERTEX_SHADER,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D lutMap;
    uniform float lutSize;
    uniform float intensity;
    varying vec2 vUv;

    vec4 sampleAs3DTexture(sampler2D tex, vec3 coord, float size) {
      float sliceSize = 1.0 / size;
      float slicePixelSize = sliceSize / size;
      float sliceInnerSize = slicePixelSize * (size - 1.0);
      float zSlice0 = min(floor(coord.z * size), size - 1.0);
      float zSlice1 = min(zSlice0 + 1.0, size - 1.0);
      float xOffset = slicePixelSize * 0.5 + coord.x * sliceInnerSize;
      float s0 = xOffset + (zSlice0 * sliceSize);
      float s1 = xOffset + (zSlice1 * sliceSize);
      vec4 slice0Color = texture2D(tex, vec2(s0, coord.y));
      vec4 slice1Color = texture2D(tex, vec2(s1, coord.y));
      float zOffset = mod(coord.z * size, 1.0);
      return mix(slice0Color, slice1Color, zOffset);
    }

    void main() {
      vec4 originalColor = texture2D(tDiffuse, vUv);
      
      if (lutSize > 0.0) {
        vec4 lutColor = sampleAs3DTexture(lutMap, originalColor.rgb, lutSize);
        gl_FragColor = mix(originalColor, lutColor, intensity);
      } else {
        gl_FragColor = originalColor;
      }
    }
  `
}
