import * as THREE from 'three'
import { STANDARD_POST_PROCESSING_VERTEX_SHADER } from './shared/CommonShaders'

/**
 * Color Grading Shader
 * Provides controls for overall visual adjustments: contrast, hue, saturation, brightness, vibrance, and gamma
 */
export const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    exposure: { value: 0.0 }, // -2.0 to 2.0, 0.0 = neutral (in stops, like photography)
    contrast: { value: 0.0 }, // -100 to 100, 0 = neutral (in percent)
    highlights: { value: 0.0 }, // -100 to 100, 0 = neutral (adjusts bright areas)
    shadows: { value: 0.0 }, // -100 to 100, 0 = neutral (adjusts dark areas)
    whites: { value: 0.0 }, // -100 to 100, 0 = neutral (adjusts white point)
    blacks: { value: 0.0 }, // -100 to 100, 0 = neutral (adjusts black point)
    hue: { value: 0.0 }, // -180 to 180 degrees
    saturation: { value: 0.0 }, // -100 to 100, 0 = neutral (in percent)
    vibrance: { value: 0.0 }, // -100 to 100, 0 = neutral (selective saturation boost)
    gamma: { value: 1.0 } // 0.1 - 3.0, 1.0 = neutral
  },

  vertexShader: STANDARD_POST_PROCESSING_VERTEX_SHADER,

    fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform float contrast;
    uniform float highlights;
    uniform float shadows;
    uniform float whites;
    uniform float blacks;
    uniform float hue;
    uniform float saturation;
    uniform float vibrance;
    uniform float gamma;
    varying vec2 vUv;

    // Convert RGB to HSV
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    // Convert HSV to RGB
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    // Apply vibrance (selective saturation boost that protects skin tones)
    vec3 applyVibrance(vec3 color, float amount) {
      if (abs(amount - 1.0) < 0.001) return color;
      
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      float maxChannel = max(max(color.r, color.g), color.b);
      float saturation = maxChannel > 0.0 ? (maxChannel - luminance) / maxChannel : 0.0;
      
      // Protect skin tones (colors with moderate saturation and warm hues)
      vec3 hsv = rgb2hsv(color);
      float skinProtection = 0.0;
      
      // Skin tones typically have hue around 0-30 degrees (red-orange range) in normalized HSV
      // and moderate saturation
      if (hsv.x >= 0.0 && hsv.x <= 0.08 && saturation > 0.3 && saturation < 0.7) {
        skinProtection = 0.5; // Reduce vibrance effect on skin tones
      }
      
      // Boost saturation more on less saturated colors, less on already saturated colors
      float boost = (1.0 - saturation) * (amount - 1.0) * (1.0 - skinProtection);
      
      // Apply saturation boost
      hsv.y = clamp(hsv.y + boost, 0.0, 1.0);
      return hsv2rgb(hsv);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      
      // Apply exposure (in stops, 0.0 = no change, positive = brighter, negative = darker)
      // Exposure in stops: multiply by 2^exposure
      color *= pow(2.0, exposure);
      
      // Apply contrast (-100 to 100, converted to multiplier: -100 = 0.0, 0 = 1.0, 100 = 2.0)
      float contrastMultiplier = 1.0 + (contrast / 100.0);
      color = (color - 0.5) * contrastMultiplier + 0.5;
      
      // Calculate luminance for highlights/shadows/whites/blacks
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      
      // Apply shadows adjustment FIRST (dark areas only)
      // Shadows affect areas with low luminance (0.0 to 0.5)
      float shadowMask = 1.0 - smoothstep(0.0, 0.5, luminance);
      shadowMask = shadowMask * shadowMask; // Quadratic curve for smoother falloff
      float shadowAdjust = shadows / 100.0;
      if (abs(shadowAdjust) > 0.001) {
        // Positive values brighten shadows (lift toward mid-gray)
        // Negative values darken shadows (push toward black)
        vec3 shadowTarget = shadowAdjust > 0.0 ? vec3(0.5) : vec3(0.0);
        float shadowStrength = abs(shadowAdjust) * 1.5; // Stronger effect
        color = mix(color, shadowTarget, shadowMask * shadowStrength);
      }
      
      // Recalculate luminance after shadows adjustment
      luminance = dot(color, vec3(0.299, 0.587, 0.114));
      
      // Apply highlights adjustment (bright areas, but not the brightest)
      // Highlights affect mid-to-bright areas (0.5 to 0.9) - avoids whites
      float highlightMask = smoothstep(0.5, 0.9, luminance) * (1.0 - smoothstep(0.9, 1.0, luminance));
      highlightMask = highlightMask * highlightMask; // Quadratic curve
      float highlightAdjust = highlights / 100.0;
      if (abs(highlightAdjust) > 0.001) {
        // Positive values brighten highlights (lift toward white)
        // Negative values darken highlights (compress downward)
        vec3 highlightTarget = highlightAdjust > 0.0 ? vec3(1.0) : vec3(0.7);
        float highlightStrength = abs(highlightAdjust) * 1.2; // Stronger effect
        color = mix(color, highlightTarget, highlightMask * highlightStrength);
      }
      
      // Recalculate luminance after highlights adjustment
      luminance = dot(color, vec3(0.299, 0.587, 0.114));
      
      // Apply whites adjustment LAST (white point, affects brightest areas only)
      // Whites affect only the very brightest areas (0.85 to 1.0)
      float whiteMask = smoothstep(0.85, 1.0, luminance);
      whiteMask = whiteMask * whiteMask; // Quadratic for smoother transition
      float whiteAdjust = whites / 100.0;
      if (abs(whiteAdjust) > 0.001) {
        // Positive values expand whites (lift brightest areas toward pure white)
        // Negative values compress whites (reduce white point, darken brightest areas)
        if (whiteAdjust > 0.0) {
          // Brighten whites - lift brightest areas
          vec3 whiteTarget = vec3(1.0);
          color = mix(color, whiteTarget, whiteMask * whiteAdjust * 1.5);
        } else {
          // Darken whites - compress white point down
          float whiteStrength = abs(whiteAdjust) * 1.5;
          color = color * (1.0 - whiteMask * whiteStrength * 0.3);
          // Also apply a subtle curve compression
          vec3 compressed = pow(color, vec3(0.95 + whiteStrength * 0.05));
          color = mix(color, compressed, whiteMask);
        }
      }
      
      // Apply blacks adjustment (black point, affects darkest areas)
      // Blacks affect areas very close to black (luminance < 0.1)
      float blackMask = 1.0 - smoothstep(0.0, 0.1, luminance);
      float blackAdjust = blacks / 100.0;
      color -= color * blackMask * abs(blackAdjust);
      color += vec3(1.0) * blackMask * max(0.0, -blackAdjust);
      
      // FIX: Apply gamma correction (user-controlled, not automatic sRGB conversion)
      // This is artistic gamma adjustment, not color space conversion
      // The final sRGB conversion happens in OutputPass
      color = pow(max(color, 0.0), vec3(1.0 / gamma));
      
      // Convert to HSV for hue and saturation adjustments
      vec3 hsv = rgb2hsv(color);
      
      // Apply hue shift (in degrees, convert to normalized 0-1 range)
      if (abs(hue) > 0.001) {
        hsv.x = fract(hsv.x + (hue / 360.0) + 1.0); // +1.0 to handle negative values
      }
      
      // Apply saturation (-100 to 100, converted to multiplier: -100 = 0.0, 0 = 1.0, 100 = 2.0)
      if (abs(saturation) > 0.001) {
        float saturationMultiplier = 1.0 + (saturation / 100.0);
        hsv.y = clamp(hsv.y * saturationMultiplier, 0.0, 1.0);
      }
      
      // Convert back to RGB
      color = hsv2rgb(hsv);
      
      // Apply vibrance (selective saturation boost, -100 to 100)
      if (abs(vibrance) > 0.001) {
        float vibranceMultiplier = 1.0 + (vibrance / 100.0);
        color = applyVibrance(color, vibranceMultiplier);
      }
      
      // Clamp final color to valid range
      color = clamp(color, 0.0, 1.0);
      
      gl_FragColor = vec4(color, texel.a);
    }
  `
}

