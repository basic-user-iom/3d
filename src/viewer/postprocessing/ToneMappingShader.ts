import * as THREE from 'three'
import { STANDARD_POST_PROCESSING_VERTEX_SHADER } from './shared/CommonShaders'

export enum ToneMappingType {
  LINEAR = 'linear',
  REINHARD = 'reinhard',
  CINEON = 'cineon',
  ACES_FILMIC = 'aces-filmic',
  UNCHARTED2 = 'uncharted2'
}

export const ToneMappingShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    exposure: { value: 1.0 },
    toneMappingType: { value: ToneMappingType.ACES_FILMIC },
    whitePoint: { value: 1.0 } // For Reinhard
  },

  vertexShader: STANDARD_POST_PROCESSING_VERTEX_SHADER,

  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform int toneMappingType;
    uniform float whitePoint;
    varying vec2 vUv;

    // Linear tone mapping (no mapping)
    vec3 linearMapping(vec3 color) {
      return color * exposure;
    }

    // Reinhard tone mapping (simple and natural)
    vec3 reinhardMapping(vec3 color) {
      color *= exposure;
      return color / (vec3(1.0) + color / whitePoint);
    }

    // Cineon/Logarithmic tone mapping (filmic look)
    vec3 cineonMapping(vec3 color) {
      color *= exposure;
      // Cineon log mapping
      const float cinBlack = 0.0;
      const float cinWhite = 1.0;
      const float cinGamma = 0.85;
      
      vec3 logColor = (color - vec3(cinBlack)) / (vec3(cinWhite) - vec3(cinBlack));
      return pow(max(vec3(0.0), logColor), vec3(1.0 / cinGamma));
    }

    // ACES Filmic tone mapping (industry standard for photorealistic rendering)
    vec3 acesFilmicMapping(vec3 color) {
      color *= exposure;
      // ACES approximation by Krzysztof Narkowicz
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
    }

    // Uncharted 2 tone mapping (used in Uncharted 2 game)
    vec3 uncharted2Tonemap(vec3 x) {
      const float A = 0.15;
      const float B = 0.50;
      const float C = 0.10;
      const float D = 0.20;
      const float E = 0.02;
      const float F = 0.30;
      return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
    }

    vec3 uncharted2Mapping(vec3 color) {
      color *= exposure;
      const float W = 11.2; // White point
      vec3 curr = uncharted2Tonemap(color);
      vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(W));
      return curr * whiteScale;
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Apply tone mapping based on type
      if (toneMappingType == 0) { // LINEAR
        color = linearMapping(color);
      } else if (toneMappingType == 1) { // REINHARD
        color = reinhardMapping(color);
      } else if (toneMappingType == 2) { // CINEON
        color = cineonMapping(color);
      } else if (toneMappingType == 3) { // ACES_FILMIC
        color = acesFilmicMapping(color);
      } else if (toneMappingType == 4) { // UNCHARTED2
        color = uncharted2Mapping(color);
      } else {
        // Default to ACES Filmic
        color = acesFilmicMapping(color);
      }

      // Convert to sRGB color space (gamma correction)
      color = pow(color, vec3(1.0 / 2.2));

      gl_FragColor = vec4(color, texel.a);
    }
  `
}













