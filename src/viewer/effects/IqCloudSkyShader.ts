import { WEATHER_GROUND_LEVEL } from '../utils/sceneFog'

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

export interface IqCloudShaderOptions {
  groundLevel?: number
}

export interface IqCloudBand {
  base: number
  top: number
}

/** Camera-relative cloud band — keeps clouds inside the visible sky dome */
export function iqCloudBandY(cameraY: number): IqCloudBand {
  const base = Math.max(WEATHER_GROUND_LEVEL + 50, cameraY + IQ_CLOUD_BASE_OFFSET)
  return { base, top: base + IQ_CLOUD_LAYER_THICKNESS }
}

/** Maps UI coverage (0–1) to iq density cutoff — lower coverage = higher cutoff */
export function iqCoverageToThickness(coverage: number): number {
  const c = Math.max(0, Math.min(1, coverage))
  return 0.78 - c * 0.76
}

/**
 * iq / Inigo Quilez "Clouds" (Shadertoy XslGRr) sky + volumetric raymarch,
 * adapted for Three.js sky dome (camera-centered sphere, camera-relative cloud band).
 */
export function getIqCloudSkyFragmentShader(options: IqCloudShaderOptions = {}): string {
  const groundLevel = options.groundLevel ?? WEATHER_GROUND_LEVEL

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

    float hash(float n) {
      return fract(sin(n) * 43758.5453);
    }

    // iq 3D value noise
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

    vec3 toIqSpace(vec3 worldPos) {
      float layerH = max(1.0, cloudTopY - cloudBaseY);
      float yNorm = (worldPos.y - cloudBaseY) / layerH;
      vec3 p;
      p.y = yNorm * 0.38 - 0.06;
      float xzScale = ${IQ_CLOUD_NOISE_XZ_SCALE.toFixed(6)} / max(0.35, cloudScale);
      p.x = worldPos.x * xzScale;
      p.z = worldPos.z * xzScale;
      return p;
    }

    float mapDensity(vec3 worldPos) {
      if (worldPos.y < max(GROUND_LEVEL, cloudBaseY - 40.0) || worldPos.y > cloudTopY + 250.0) {
        return 0.0;
      }

      vec3 p = toIqSpace(worldPos);
      float d = 0.2 - p.y;

      vec3 q = p - vec3(1.0, 0.1, 0.0) * (iTime * windSpeed);
      float f = 0.0;
      f += 0.5000 * noise(q); q *= 2.02;
      f += 0.2500 * noise(q); q *= 2.03;
      f += 0.1250 * noise(q); q *= 2.01;
      f += 0.0625 * noise(q);

      d += 3.0 * f;
      d = clamp(d, 0.0, 1.0);

      float cutoff = mix(0.78, 0.02, coverage);
      d = smoothstep(cutoff, cutoff + 0.12, d);
      return d * step(0.004, coverage);
    }

    vec4 mapColorDensity(vec3 worldPos) {
      float den = mapDensity(worldPos);
      vec3 albedo = mix(1.15 * vec3(1.0, 0.95, 0.8), vec3(0.7, 0.7, 0.7), den);
      albedo = mix(albedo, albedo * vec3(0.55, 0.58, 0.62), storminess * 0.4);
      return vec4(albedo, den);
    }

    vec4 raymarchClouds(vec3 ro, vec3 rd, vec3 sunDir) {
      vec3 inv = 1.0 / max(abs(rd), vec3(0.0001));
      vec3 bmin = vec3(-25000.0, cloudBaseY, -25000.0);
      vec3 bmax = vec3( 25000.0, cloudTopY,  25000.0);
      vec3 tmin = (bmin - ro) * inv;
      vec3 tmax = (bmax - ro) * inv;
      vec3 t1v = min(tmin, tmax);
      vec3 t2v = max(tmin, tmax);
      float tNear = max(max(t1v.x, t1v.y), t1v.z);
      float tFar = min(min(t2v.x, t2v.y), t2v.z);
      if (tFar <= tNear) {
        return vec4(0.0);
      }
      tNear = max(tNear, 0.0);

      vec4 sum = vec4(0.0);
      float t = tNear;
      int steps = raymarchSteps;
      float layerSpan = max(1.0, cloudTopY - cloudBaseY);
      float minStep = layerSpan / (float(steps) * 1.35);

      for (int i = 0; i < 96; i++) {
        if (i >= steps) break;
        if (sum.a > 0.99) break;

        vec3 pos = ro + t * rd;
        vec4 col = mapColorDensity(pos);
        if (col.w > 0.008) {
          float dif = clamp((col.w - mapDensity(pos + 0.3 * sunDir)) / 0.6, 0.0, 1.0);
          vec3 lin = vec3(0.65, 0.68, 0.7) * 1.35 + 0.45 * vec3(0.7, 0.5, 0.3) * dif;
          lin = mix(lin, lin * vec3(0.55, 0.58, 0.62), storminess * 0.35);
          col.xyz *= lin;
          col.a *= 0.35;
          col.rgb *= col.a;
          sum = sum + col * (1.0 - sum.a);
        }

        t += max(minStep, minStep * 0.35 + 0.006 * t);
      }

      sum.xyz /= (0.001 + sum.w);
      return clamp(sum, 0.0, 1.0);
    }

    vec3 iqSkyGradient(vec3 rd, vec3 sunDir) {
      vec3 col = vec3(0.6, 0.71, 0.75) - rd.y * 0.2 * vec3(1.0, 0.5, 1.0) + 0.075;

      float sunElev = sunDir.y;
      float twilight = smoothstep(0.2, -0.08, sunElev);
      col = mix(col, col * vec3(1.12, 0.74, 0.48), twilight * 0.45);

      float night = smoothstep(0.02, -0.25, sunElev);
      col = mix(col, col * vec3(0.12, 0.16, 0.28), night * 0.75);

      return col;
    }

    void main() {
      vec3 ro = cameraPosition;
      vec3 rd = normalize(vWorldPosition - cameraPosition);
      vec3 sunDir = normalize(sunPosition);

      vec3 col = iqSkyGradient(rd, sunDir);
      float sun = clamp(dot(sunDir, rd), 0.0, 1.0);

      col += 0.2 * vec3(1.0, 0.6, 0.1) * pow(sun, 8.0);

      if (coverage > 0.004) {
        vec4 clouds = raymarchClouds(ro, rd, sunDir);
        col = mix(col, clouds.xyz, clouds.w);
      }

      col += 0.1 * vec3(1.0, 0.4, 0.2) * pow(sun, 3.0);
      col *= 0.95;

      float sunDisk = smoothstep(0.9993, 0.99985, sun);
      col += vec3(1.0, 0.9, 0.62) * sunDisk * 5.0;

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
