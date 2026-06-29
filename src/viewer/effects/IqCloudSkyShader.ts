import { WEATHER_GROUND_LEVEL } from '../utils/sceneFog'
import { getIqCoverageGlsl } from '../utils/iqCloudCoverage'

export { iqCoverageCutoff, iqCoverageToThickness } from '../utils/iqCloudCoverage'

/** Cloud band bottom offset above the camera (world units) — fits inside 9k sky dome */
export const IQ_CLOUD_BASE_OFFSET = 350

/** Vertical thickness of the iq fluffy cloud band (world units) */
export const IQ_CLOUD_LAYER_THICKNESS = 3800

/** Legacy box-mode layer height (Worley volumetric box in DynamicSky) */
export const IQ_CLOUD_LAYER_HEIGHT = 12000

/** Legacy fixed world base used by box clouds */
export const IQ_CLOUD_BASE = 2500

/** iq XslGRr horizontal noise scale (before cloudScale divisor) */
export const IQ_CLOUD_NOISE_XZ_SCALE = 0.00025

/** iq camera height in noise space — matches Shadertoy ro.y ≈ 1 */
export const IQ_CLOUD_CAMERA_Y = 1.0

/** iq map() density floor (XslGRr default 0.2) */
export const IQ_CLOUD_DENSITY_Y0 = 0.2

/** Below this view elevation (rd.y), shift noise samples upward — keeps layer above horizon */
export const IQ_CLOUD_ELEV_BIAS_THRESHOLD = 0.28

/** Strength of per-ray noise-Y bias for low-elevation views */
export const IQ_CLOUD_ELEV_SAMPLE_LIFT = 1.05

/** Subtle iq Y lift from world cloud band (cloudBaseY uniform) */
export const IQ_CLOUD_WORLD_TO_NOISE_Y = 0.0004

/** Fixed iq Y lift above Shadertoy default ro.y */
export const IQ_CLOUD_GLOBAL_Y_LIFT = 0.12

/** View-elevation fade: clouds start above rd.y ≈ horizon (ground at Y=0) */
export const IQ_CLOUD_HORIZON_FADE_MIN = 0.05
export const IQ_CLOUD_HORIZON_FADE_SOFT = 0.17

/** Noise-Y bias for low elevation rays — pushes density band above the horizon line */
export function iqCloudElevSampleBias(rdY: number): number {
  return Math.max(0, IQ_CLOUD_ELEV_BIAS_THRESHOLD - rdY) * IQ_CLOUD_ELEV_SAMPLE_LIFT
}

/** iq ray origin Y from world cloud band — used by shader and CPU density mirror */
export function iqCloudOriginY(cameraY: number, cloudBaseY: number): number {
  const bandOffset = Math.max(0, cloudBaseY - cameraY)
  return IQ_CLOUD_CAMERA_Y + bandOffset * IQ_CLOUD_WORLD_TO_NOISE_Y + IQ_CLOUD_GLOBAL_Y_LIFT
}

/** Smooth fade so clouds do not intersect the visual horizon / ground plane */
export function iqCloudHorizonFade(rdY: number): number {
  const t =
    (rdY - IQ_CLOUD_HORIZON_FADE_MIN) / (IQ_CLOUD_HORIZON_FADE_SOFT - IQ_CLOUD_HORIZON_FADE_MIN)
  return Math.max(0, Math.min(1, t))
}

export interface IqCloudShaderOptions {
  groundLevel?: number
  /** When true, sky gradient + sun only — box Worley layer handles clouds (hybrid mode) */
  skyOnly?: boolean
}

export interface IqCloudBand {
  base: number
  top: number
}

/** Camera-relative cloud band — kept for uniform compatibility with DynamicSky */
export function iqCloudBandY(cameraY: number): IqCloudBand {
  const base = Math.max(WEATHER_GROUND_LEVEL + 50, cameraY + IQ_CLOUD_BASE_OFFSET)
  return { base, top: base + IQ_CLOUD_LAYER_THICKNESS }
}

/**
 * iq / Inigo Quilez "Clouds" (Shadertoy XslGRr) sky + volumetric raymarch,
 * adapted for Three.js sky dome using scaled world-space march (matches iq map/raymarch).
 */
export function getIqCloudSkyFragmentShader(options: IqCloudShaderOptions = {}): string {
  const groundLevel = options.groundLevel ?? WEATHER_GROUND_LEVEL
  const skyOnly = options.skyOnly ?? false
  const coverageGlsl = getIqCoverageGlsl()

  return `
    #ifdef USE_FOG
      #undef USE_FOG
    #endif
    precision highp float;

    uniform vec3 sunPosition;
    uniform float iTime;
    uniform float coverage;
    uniform float storminess;
    uniform float windSpeed;
    uniform float exposure;
    uniform float cloudScale;
    uniform float cloudBaseY;
    uniform float cloudTopY;
    uniform int raymarchSteps;

    varying vec3 vWorldPosition;

    const float GROUND_LEVEL = ${groundLevel.toFixed(1)};
    const float IQ_CAMERA_Y = ${IQ_CLOUD_CAMERA_Y.toFixed(1)};
    const float IQ_ELEV_BIAS_THRESH = ${IQ_CLOUD_ELEV_BIAS_THRESHOLD.toFixed(2)};
    const float IQ_ELEV_SAMPLE_LIFT = ${IQ_CLOUD_ELEV_SAMPLE_LIFT.toFixed(2)};
    const float IQ_HORIZON_FADE_MIN = ${IQ_CLOUD_HORIZON_FADE_MIN.toFixed(2)};
    const float IQ_HORIZON_FADE_SOFT = ${IQ_CLOUD_HORIZON_FADE_SOFT.toFixed(2)};
    const float IQ_DENSITY_Y0 = ${IQ_CLOUD_DENSITY_Y0.toFixed(2)};

    ${coverageGlsl}

    float hash(float n) {
      return fract(sin(n) * 43758.5453);
    }

    float hash3(vec3 p) {
      return fract(sin(dot(floor(p), vec3(1.0, 57.0, 113.0))) * 43758.5453);
    }

    // iq 3D value noise (XslGRr)
    float noise(in vec3 x) {
      vec3 p = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      float n = p.x + p.y * 57.0 + 113.0 * p.z;
      return mix(
        mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
            mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
        mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
            mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y),
        f.z);
    }

    // Scaled world-space position along view ray — iq ro at y≈1, xz tiles with camera
    vec3 toIqWorldPos(vec3 rd, float t) {
      float xzScale = ${IQ_CLOUD_NOISE_XZ_SCALE.toFixed(6)} / max(0.35, cloudScale);
      vec3 ro = vec3(cameraPosition.x * xzScale, IQ_CAMERA_Y, cameraPosition.z * xzScale);
      return ro + rd * t;
    }

    float iqElevSampleBias(vec3 rd) {
      return max(0.0, IQ_ELEV_BIAS_THRESH - rd.y) * IQ_ELEV_SAMPLE_LIFT;
    }

    // iq map() — raw FBM density in .w; UI coverage is a linear cutoff only (no smoothstep rim)
    vec4 map(vec3 p) {
      if (coverage <= 0.004) {
        return vec4(0.0);
      }

      float d = IQ_DENSITY_Y0 - p.y;

      vec3 q = p - vec3(1.0, 0.1, 0.0) * (iTime * windSpeed);
      float f = 0.0;
      f += 0.5000 * noise(q); q *= 2.02;
      f += 0.2500 * noise(q); q *= 2.03;
      f += 0.1250 * noise(q); q *= 2.01;
      f += 0.0625 * noise(q);

      d += 3.0 * f;
      d = clamp(d, 0.0, 1.0);

      float cutoff = iqCoverageCutoff(coverage);
      d = max(0.0, (d - cutoff) / max(0.001, 1.0 - cutoff));

      vec4 res = vec4(d);
      res.xyz = mix(1.15 * vec3(1.0, 0.95, 0.8), vec3(0.7, 0.7, 0.7), res.x);
      res.xyz = mix(res.xyz, res.xyz * vec3(0.55, 0.58, 0.62), storminess * 0.4);
      return res;
    }

    // World-space raymarch — literal port of iq raymarch() with sunDir lighting
    vec4 raymarchClouds(vec3 rd, vec3 sunDir, float dayFactor) {
      vec4 sum = vec4(0.0);
      float t = 0.0;
      int steps = raymarchSteps;
      float elevBias = iqElevSampleBias(rd);

      for (int i = 0; i < 96; i++) {
        if (i >= steps) break;
        if (sum.a > 0.99) break;

        vec3 pos = toIqWorldPos(rd, t);
        pos.y += elevBias;
        vec4 col = map(pos);

        vec3 lightPos = pos + 0.3 * sunDir;
        float dif = clamp((col.w - map(lightPos).w) / 0.6, 0.0, 1.0);
        vec3 lin = vec3(0.65, 0.68, 0.7) * 1.35 + 0.45 * vec3(0.7, 0.5, 0.3) * dif;
        lin = mix(lin, lin * vec3(0.55, 0.58, 0.62), storminess * 0.35);
        lin *= mix(0.28, 1.0, dayFactor);

        col.xyz *= lin;
        col.a *= 0.35;
        col.rgb *= col.a;
        sum = sum + col * (1.0 - sum.a);

        t += max(0.1, 0.025 * t);
      }

      // Fade below horizon so clouds sit in the upper sky band (aligned with ground at Y=0)
      float horizonFade = smoothstep(IQ_HORIZON_FADE_MIN, IQ_HORIZON_FADE_SOFT, rd.y);
      sum *= horizonFade;

      // Return premultiplied rgb+a — composite with over operator in main()
      return clamp(sum, 0.0, 1.0);
    }

    vec3 iqSkyGradient(vec3 rd, vec3 sunDir) {
      float sunElev = sunDir.y;
      vec3 col = vec3(0.6, 0.71, 0.75) - rd.y * 0.2 * vec3(1.0, 0.5, 1.0) + 0.075;

      float twilight = smoothstep(0.2, -0.08, sunElev);
      col = mix(col, col * vec3(1.12, 0.74, 0.48), twilight * 0.45);

      float night = smoothstep(0.02, -0.25, sunElev);
      vec3 nightCol = vec3(0.02, 0.03, 0.07) + rd.y * vec3(0.01, 0.015, 0.04);
      col = mix(col, nightCol, night * 0.92);

      return col;
    }

    float starField(vec3 rd, float sunElev) {
      if (sunElev > -0.04) return 0.0;
      vec3 p = rd * 95.0;
      vec3 id = floor(p);
      float h = hash3(id);
      float twinkle = 0.75 + 0.25 * sin(iTime * 1.7 + h * 40.0);
      float star = step(0.992, h) * twinkle;
      return star * smoothstep(0.0, -0.2, sunElev);
    }

    void main() {
      vec3 rd = normalize(vWorldPosition - cameraPosition);
      vec3 sunDir = normalize(sunPosition);
      float sunElev = sunDir.y;
      float dayFactor = smoothstep(-0.12, 0.08, sunElev);

      vec3 col = iqSkyGradient(rd, sunDir);
      float sun = clamp(dot(sunDir, rd), 0.0, 1.0);

      col += 0.2 * vec3(1.0, 0.6, 0.1) * pow(sun, 8.0) * dayFactor;

      float cloudAlpha = 0.0;
${skyOnly ? '' : `
      if (coverage > 0.004) {
        vec4 clouds = raymarchClouds(rd, sunDir, dayFactor);
        cloudAlpha = clouds.w;
        col = col * (1.0 - clouds.w) + clouds.xyz;
      }
`}

      // Attenuate sun glow at cloud edges — unmasked glow caused bright white rims on wisps
      col += 0.1 * vec3(1.0, 0.4, 0.2) * pow(sun, 3.0) * dayFactor * (1.0 - cloudAlpha * 0.9);
      col *= 0.95;

      float sunDisk = smoothstep(0.9993, 0.99985, sun) * dayFactor;
      col += vec3(1.0, 0.9, 0.62) * sunDisk * 5.0;

      vec3 moonDir = normalize(vec3(-sunDir.x, max(sunDir.y, 0.05), -sunDir.z));
      float moon = clamp(dot(moonDir, rd), 0.0, 1.0);
      float moonDisk = smoothstep(0.9994, 0.99982, moon) * (1.0 - dayFactor);
      col += vec3(0.75, 0.8, 0.95) * moonDisk * 2.5;
      col += vec3(0.35, 0.4, 0.55) * pow(moon, 6.0) * (1.0 - dayFactor) * 0.35;

      col += vec3(0.85, 0.9, 1.0) * starField(rd, sunElev);

      float expBoost = max(exposure - 1.0, 0.0);
      if (expBoost > 0.001) {
        col = vec3(1.0) - exp(-col * (1.0 + expBoost * 0.35));
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `
}

export const IQ_CLOUD_SKY_VERTEX_SHADER = `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
