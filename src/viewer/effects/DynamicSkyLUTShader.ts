/**
 * LUT-based sky shader for DynamicSky
 * Samples from precomputed Sky View LUT (Streets GL approach)
 */

export const getLUTBasedSkyFragmentShader = (): string => {
  return `
    #ifdef USE_FOG
      #undef USE_FOG
    #endif
    precision highp float;
    
    uniform sampler2D tSkyViewLUT;
    uniform vec3 sunPosition;
    uniform float exposure;
    uniform float cameraHeight;
    
    varying vec3 vWorldPosition;
    
    const float PI = 3.141592653589793;
    const float groundRadiusMM = 6.360;
    const float atmosphereRadiusMM = 6.460;
    const vec3 viewPos = vec3(0.0, groundRadiusMM + 0.0005, 0.0);
    
    // FIX: GLSL ES 2.0 doesn't allow 'const' in function parameters
    float safeacos(float x) {
      return acos(clamp(x, -1.0, 1.0));
    }
    
    void main() {
      vec3 viewDir = normalize(vWorldPosition);
      
      // Convert view direction to UV coordinates matching Streets GL's Sky View LUT
      // Non-linear mapping (same as Streets GL)
      float azimuthAngle = atan(viewDir.z, viewDir.x);
      float uvX = azimuthAngle / (2.0 * PI) + 0.5;
      
      // Calculate altitude angle
      float height = groundRadiusMM + cameraHeight;
      float horizonAngle = safeacos(sqrt(height * height - groundRadiusMM * groundRadiusMM) / height) - 0.5 * PI;
      float altitudeAngle = asin(viewDir.y) - horizonAngle;
      
      // Non-linear mapping for altitude (Streets GL style)
      float adjV;
      if (altitudeAngle < 0.0) {
        float coord = -altitudeAngle / (0.5 * PI);
        adjV = 0.5 - coord * coord * 0.5; // Below horizon
      } else {
        float coord = altitudeAngle / (0.5 * PI);
        adjV = 0.5 + coord * coord * 0.5; // Above horizon
      }
      
      vec2 uv = vec2(uvX, adjV);
      
      // Sample from Sky View LUT (RGB = sky color, A = transmittance)
      vec4 lutSample = texture2D(tSkyViewLUT, uv);
      vec3 color = lutSample.rgb;
      
      // Apply exposure
      color = vec3(1.0) - exp(-color * max(exposure, 0.5));
      
      // Sun disk (add bright spot for sun)
      // IMPROVED: Much larger sun disk for realistic appearance
      // Real sun angular size is ~0.5 degrees, use wider smoothstep for larger visible disk
      vec3 sunDir = normalize(sunPosition);
      float sunDotView = dot(sunDir, viewDir);
      float sunDisk = smoothstep(0.995, 1.0, sunDotView); // Wider range for larger sun
      // FIX: Make sun much brighter and warmer (yellow/orange) instead of pale white
      // Real sun is very bright and has a warm color temperature (~5500K = yellow-white)
      vec3 sunColorWarm = vec3(1.2, 1.0, 0.7); // Warm yellow-orange (not pure white)
      color += sunColorWarm * sunDisk * 10.0; // Much brighter (was 3.0, now 10.0)
      
      // Calculate sun brightness for alpha (only sun area is opaque, rest is transparent)
      // Make sun area opaque (alpha = 1.0) where sun is bright, transparent (alpha = 0.0) elsewhere
      // IMPROVED: Wider smoothstep range for larger visible sun disk
      float sunBrightness = smoothstep(0.995, 1.0, sunDotView); // Wider range for larger sun (was 0.98-1.0)
      float alpha = sunBrightness;
      
      gl_FragColor = vec4(color, alpha);
    }
  `
}

