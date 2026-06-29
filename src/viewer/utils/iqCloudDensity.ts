import {
  IQ_CLOUD_CAMERA_Y,
  IQ_CLOUD_DENSITY_SHARPEN,
  IQ_CLOUD_DENSITY_Y0,
  IQ_CLOUD_MARCH_STEP_MIN,
  IQ_CLOUD_MARCH_STEP_SCALE,
  IQ_CLOUD_NOISE_XZ_SCALE,
  iqCloudElevSampleBias,
  iqCloudHorizonFade
} from '../effects/IqCloudSkyShader'
import {
  iqCoverageCutoff
} from './iqCloudCoverage'

export {
  iqCloudElevSampleBias,
  iqCloudHorizonFade,
  iqCloudOriginY
} from '../effects/IqCloudSkyShader'
export { iqCoverageCutoff, iqCoverageAlphaScale } from './iqCloudCoverage'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface IqCloudDensityOptions {
  coverage?: number
  cloudScale?: number
  time?: number
  windSpeed?: number
  cameraXz?: { x: number; z: number }
  /** World camera Y — used with cloudBaseY for iq origin lift */
  cameraY?: number
  /** World cloud band base — matches DynamicSky cloudBaseY uniform */
  cloudBaseY?: number
}

function hash(n: number): number {
  return fract(Math.sin(n) * 43758.5453)
}

function fract(x: number): number {
  return x - Math.floor(x)
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** iq 3D value noise (CPU port of GLSL) */
export function iqNoise(x: Vec3): number {
  const p = {
    x: Math.floor(x.x),
    y: Math.floor(x.y),
    z: Math.floor(x.z)
  }
  const f = {
    x: fract(x.x),
    y: fract(x.y),
    z: fract(x.z)
  }
  const sx = f.x * f.x * (3 - 2 * f.x)
  const sy = f.y * f.y * (3 - 2 * f.y)
  const sz = f.z * f.z * (3 - 2 * f.z)
  const n = p.x + p.y * 57 + 113 * p.z

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  return lerp(
    lerp(lerp(hash(n), hash(n + 1), sx), lerp(hash(n + 57), hash(n + 58), sx), sy),
    lerp(lerp(hash(n + 113), hash(n + 114), sx), lerp(hash(n + 170), hash(n + 171), sx), sy),
    sz
  )
}

/** Scaled world-space iq position along view ray (matches shader toIqWorldPos) */
export function toIqWorldPos(
  rd: Vec3,
  t: number,
  cameraXz: { x: number; z: number },
  cloudScale: number
): Vec3 {
  const xzScale = IQ_CLOUD_NOISE_XZ_SCALE / Math.max(0.35, cloudScale)
  const elevBias = iqCloudElevSampleBias(rd.y)
  return {
    x: cameraXz.x * xzScale + rd.x * t,
    y: IQ_CLOUD_CAMERA_Y + rd.y * t + elevBias,
    z: cameraXz.z * xzScale + rd.z * t
  }
}

/** Sample fluffy cloud density at world-space iq position */
export function mapIqCloudDensityAtPos(
  p: Vec3,
  options: IqCloudDensityOptions = {}
): number {
  const coverage = options.coverage ?? 0
  if (coverage <= 0.004) return 0

  const time = options.time ?? 0
  const windSpeed = options.windSpeed ?? 0.1

  let d = IQ_CLOUD_DENSITY_Y0 - p.y

  let q = {
    x: p.x - time * windSpeed,
    y: p.y - time * windSpeed * 0.1,
    z: p.z
  }
  let f = 0
  f += 0.5 * iqNoise(q)
  q = { x: q.x * 2.02, y: q.y * 2.02, z: q.z * 2.02 }
  f += 0.25 * iqNoise(q)
  q = { x: q.x * 2.03, y: q.y * 2.03, z: q.z * 2.03 }
  f += 0.125 * iqNoise(q)
  q = { x: q.x * 2.01, y: q.y * 2.01, z: q.z * 2.01 }
  f += 0.0625 * iqNoise(q)
  q = { x: q.x * 2.02, y: q.y * 2.02, z: q.z * 2.02 }
  f += 0.0312 * iqNoise(q)

  d += 3 * f
  d = Math.max(0, Math.min(1, d))

  const cutoff = iqCoverageCutoff(coverage)
  d = Math.max(0, (d - cutoff) / Math.max(0.001, 1 - cutoff))
  return Math.pow(d, IQ_CLOUD_DENSITY_SHARPEN)
}

/** Sample density along a view ray at march distance t */
export function mapIqCloudDensity(
  rd: Vec3,
  t: number,
  options: IqCloudDensityOptions = {}
): number {
  const cloudScale = options.cloudScale ?? 1
  const cameraXz = options.cameraXz ?? { x: 0, z: 0 }
  const p = toIqWorldPos(rd, t, cameraXz, cloudScale)
  return mapIqCloudDensityAtPos(p, options)
}

/** Estimate accumulated raymarch alpha for a view direction (matches shader front-to-back blend) */
export function estimateIqRaymarchAlpha(
  rd: Vec3,
  options: IqCloudDensityOptions & { steps?: number; dayFactor?: number } = {}
): number {
  const coverage = options.coverage ?? 0
  if (coverage <= 0.004) return 0

  const steps = options.steps ?? 64
  const dayFactor = options.dayFactor ?? 1
  const horizonFade = iqCloudHorizonFade(rd.y)
  if (horizonFade <= 0.001) return 0
  let sumA = 0
  let t = 0

  for (let i = 0; i < steps; i++) {
    if (sumA > 0.99) break
    const den = mapIqCloudDensity(rd, t, options)
    if (den > 0.01) {
      const a = den * 0.35 * mix(0.6, 1, dayFactor)
      sumA += a * (1 - sumA)
    }
    t += Math.max(IQ_CLOUD_MARCH_STEP_MIN, IQ_CLOUD_MARCH_STEP_SCALE * t)
  }

  return Math.max(0, Math.min(1, sumA * horizonFade))
}

/** Normalized view directions for unit tests */
export const IQ_TEST_DIRECTIONS = {
  zenith: { x: 0, y: 1, z: 0 },
  horizon: { x: 0.998, y: 0.063, z: 0 },
  midSky: { x: 0, y: 0.5, z: 0.866 }
} as const
