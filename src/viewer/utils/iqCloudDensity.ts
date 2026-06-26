import { IQ_CLOUD_NOISE_XZ_SCALE } from '../effects/IqCloudSkyShader'
import {
  iqCoverageAlphaScale,
  iqCoverageCutoff,
  iqCoverageFeather
} from './iqCloudCoverage'

export { iqCoverageCutoff, iqCoverageFeather, iqCoverageAlphaScale } from './iqCloudCoverage'

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)))
  return t * t * (3 - 2 * t)
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

/** Direction-space iq coordinates — clouds visible at all sky elevations including horizon */
export function toIqSpaceFromRay(
  rd: Vec3,
  depth: number,
  cameraXz: { x: number; z: number },
  cloudScale: number
): Vec3 {
  const xzScale = IQ_CLOUD_NOISE_XZ_SCALE / Math.max(0.35, cloudScale)
  const spread = 1.85 + depth * 0.55
  return {
    y: rd.y * 0.38 - 0.06 + depth * 0.045,
    x: rd.x * spread + cameraXz.x * xzScale,
    z: rd.z * spread + cameraXz.z * xzScale
  }
}

/** Sample fluffy cloud density for a view direction at pseudo-depth (0 = near, higher = deeper) */
export function mapIqCloudDensity(
  rd: Vec3,
  depth: number,
  options: IqCloudDensityOptions = {}
): number {
  const coverage = options.coverage ?? 0
  if (coverage <= 0.004) return 0

  const cloudScale = options.cloudScale ?? 1
  const time = options.time ?? 0
  const windSpeed = options.windSpeed ?? 0.1
  const cameraXz = options.cameraXz ?? { x: 0, z: 0 }

  const p = toIqSpaceFromRay(rd, depth, cameraXz, cloudScale)
  let d = 0.2 - p.y

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

  d += 3 * f
  d = Math.max(0, Math.min(1, d))

  const cutoff = iqCoverageCutoff(coverage)
  const feather = iqCoverageFeather(coverage)
  return smoothstep(cutoff, cutoff + feather, d)
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
  const alphaScale = iqCoverageAlphaScale(coverage)
  let sumA = 0
  let t = 0

  for (let i = 0; i < steps; i++) {
    if (sumA > 0.99) break
    const den = mapIqCloudDensity(rd, t, options)
    if (den > 0.01) {
      const a = den * 0.42 * alphaScale * mix(0.6, 1, dayFactor)
      sumA += a * (1 - sumA)
    }
    t += Math.max(0.08, 0.025 * t)
  }

  return Math.max(0, Math.min(1, sumA))
}

/** Normalized view directions for unit tests */
export const IQ_TEST_DIRECTIONS = {
  zenith: { x: 0, y: 1, z: 0 },
  horizon: { x: 0.998, y: 0.063, z: 0 },
  midSky: { x: 0, y: 0.5, z: 0.866 }
} as const
