import { IQ_CLOUD_NOISE_XZ_SCALE, iqCloudBandY } from '../effects/IqCloudSkyShader'
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
  cameraPos?: Vec3
  cloudBand?: { base: number; top: number }
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

/** World-space iq coordinates — matches GPU toIqSpace */
export function toIqSpaceFromWorld(
  worldPos: Vec3,
  cameraPos: Vec3,
  cloudBand: { base: number; top: number },
  cloudScale: number
): Vec3 {
  const layerH = Math.max(1, cloudBand.top - cloudBand.base)
  const yNorm = (worldPos.y - cloudBand.base) / layerH
  const xzScale = IQ_CLOUD_NOISE_XZ_SCALE / Math.max(0.35, cloudScale)
  return {
    y: yNorm * 0.38 - 0.06,
    x: (worldPos.x - cameraPos.x) * xzScale,
    z: (worldPos.z - cameraPos.z) * xzScale
  }
}

/** Sample fluffy cloud density at a world position (matches GPU mapDensity) */
export function mapIqCloudDensityAtWorld(
  worldPos: Vec3,
  options: IqCloudDensityOptions = {}
): number {
  const coverage = options.coverage ?? 0
  if (coverage <= 0.004) return 0

  const cloudScale = options.cloudScale ?? 1
  const time = options.time ?? 0
  const windSpeed = options.windSpeed ?? 0.1
  const cameraPos = options.cameraPos ?? { x: 0, y: 0, z: 0 }
  const cloudBand = options.cloudBand ?? iqCloudBandY(cameraPos.y)

  if (worldPos.y < Math.max(cloudBand.base - 40, 0) || worldPos.y > cloudBand.top + 250) {
    return 0
  }

  const p = toIqSpaceFromWorld(worldPos, cameraPos, cloudBand, cloudScale)
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

/** Ray-slab intersection for upward-looking rays (matches GPU raymarchClouds) */
export function iqCloudSlabRange(
  ro: Vec3,
  rd: Vec3,
  cloudBand: { base: number; top: number }
): { tNear: number; tFar: number } | null {
  if (rd.y <= 0) return null

  let tEnter = (cloudBand.base - ro.y) / rd.y
  let tExit = (cloudBand.top - ro.y) / rd.y
  if (tEnter > tExit) {
    const swap = tEnter
    tEnter = tExit
    tExit = swap
  }

  const tNear = Math.max(tEnter, 0)
  const tFar = tExit
  if (tFar <= tNear) return null
  return { tNear, tFar }
}

/** Sample density along a view direction at normalized depth within the cloud slab (0 = entry, 1 = exit) */
export function mapIqCloudDensity(
  rd: Vec3,
  slabT: number,
  options: IqCloudDensityOptions = {}
): number {
  const cameraPos = options.cameraPos ?? { x: 0, y: 0, z: 0 }
  const cloudBand = options.cloudBand ?? iqCloudBandY(cameraPos.y)
  const range = iqCloudSlabRange(cameraPos, rd, cloudBand)
  if (!range) return 0

  const t = range.tNear + slabT * (range.tFar - range.tNear)
  const worldPos = {
    x: cameraPos.x + t * rd.x,
    y: cameraPos.y + t * rd.y,
    z: cameraPos.z + t * rd.z
  }
  return mapIqCloudDensityAtWorld(worldPos, options)
}

/** Estimate accumulated raymarch alpha for a view direction (matches shader front-to-back blend) */
export function estimateIqRaymarchAlpha(
  rd: Vec3,
  options: IqCloudDensityOptions & { steps?: number; dayFactor?: number } = {}
): number {
  const coverage = options.coverage ?? 0
  if (coverage <= 0.004) return 0

  const cameraPos = options.cameraPos ?? { x: 0, y: 0, z: 0 }
  const cloudBand = options.cloudBand ?? iqCloudBandY(cameraPos.y)
  const range = iqCloudSlabRange(cameraPos, rd, cloudBand)
  if (!range) return 0

  const steps = options.steps ?? 64
  const dayFactor = options.dayFactor ?? 1
  const alphaScale = iqCoverageAlphaScale(coverage)
  const pathLen = range.tFar - range.tNear
  const dt = pathLen / Math.max(1, steps)

  let sumA = 0
  let t = range.tNear

  for (let i = 0; i < steps; i++) {
    if (sumA > 0.99 || t > range.tFar) break

    const worldPos = {
      x: cameraPos.x + t * rd.x,
      y: cameraPos.y + t * rd.y,
      z: cameraPos.z + t * rd.z
    }
    const den = mapIqCloudDensityAtWorld(worldPos, options)
    if (den > 0.01) {
      const a = den * 0.35 * alphaScale * mix(0.55, 1, dayFactor)
      sumA += a * (1 - sumA)
    }
    t += dt
  }

  return Math.max(0, Math.min(1, sumA))
}

/** Normalized view directions for unit tests */
export const IQ_TEST_DIRECTIONS = {
  zenith: { x: 0, y: 1, z: 0 },
  horizon: { x: 0.998, y: 0.063, z: 0 },
  midSky: { x: 0, y: 0.5, z: 0.866 }
} as const
