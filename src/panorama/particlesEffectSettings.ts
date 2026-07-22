import { degToRad } from './panoramaTourTypes'

export interface ParticlesEffectSettings {
  enabled: boolean
  /** Smoke sprite instance count. */
  smokeCount: number
  /** Fire sprite instance count. */
  fireCount: number
  /** Relative emitter / sprite scale. */
  size: number
  /** Animation speed (matches demo Parameters.speed, ~0–1). */
  speed: number
  /** Core fire color (hex). */
  fireColor: string
  /** Ember / early-life smoke glow color (hex). */
  emberColor: string
  showSmoke: boolean
  showFire: boolean
  /**
   * Emitter home direction in panorama spherical coords (radians).
   * Same convention as birds — pin via “Pin particles to view”.
   */
  viewYaw: number
  viewPitch: number
}

export const PARTICLES_SMOKE_COUNT_OPTIONS = [500, 1000, 2000, 4000] as const
export const PARTICLES_FIRE_COUNT_OPTIONS = [250, 500, 1000, 2000] as const

/** Defaults matched to Black Witness emitter setup (Effects → Particles). */
export const DEFAULT_PARTICLES_EFFECT_SETTINGS: ParticlesEffectSettings = {
  enabled: true,
  smokeCount: 500,
  fireCount: 250,
  size: 0.25,
  speed: 0.03,
  fireColor: '#b06201',
  emberColor: '#f40000',
  showSmoke: true,
  showFire: true,
  viewYaw: degToRad(150.3),
  viewPitch: degToRad(0)
}

/** Bumped so existing browsers pick up the new panorama-start defaults once. */
const STORAGE_KEY = 'panorama-360-particles-effect-v2'

function sanitizeAngle(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function loadParticlesEffectSettings(): ParticlesEffectSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PARTICLES_EFFECT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ParticlesEffectSettings>
    return {
      ...DEFAULT_PARTICLES_EFFECT_SETTINGS,
      ...parsed,
      enabled: parsed.enabled !== false,
      smokeCount: PARTICLES_SMOKE_COUNT_OPTIONS.includes(
        parsed.smokeCount as (typeof PARTICLES_SMOKE_COUNT_OPTIONS)[number]
      )
        ? (parsed.smokeCount as number)
        : DEFAULT_PARTICLES_EFFECT_SETTINGS.smokeCount,
      fireCount: PARTICLES_FIRE_COUNT_OPTIONS.includes(
        parsed.fireCount as (typeof PARTICLES_FIRE_COUNT_OPTIONS)[number]
      )
        ? (parsed.fireCount as number)
        : DEFAULT_PARTICLES_EFFECT_SETTINGS.fireCount,
      size: sanitizeNumber(parsed.size, DEFAULT_PARTICLES_EFFECT_SETTINGS.size, 0.25, 2.5),
      speed: sanitizeNumber(parsed.speed, DEFAULT_PARTICLES_EFFECT_SETTINGS.speed, 0, 1),
      fireColor:
        typeof parsed.fireColor === 'string' && parsed.fireColor
          ? parsed.fireColor
          : DEFAULT_PARTICLES_EFFECT_SETTINGS.fireColor,
      emberColor:
        typeof parsed.emberColor === 'string' && parsed.emberColor
          ? parsed.emberColor
          : DEFAULT_PARTICLES_EFFECT_SETTINGS.emberColor,
      showSmoke: parsed.showSmoke !== false,
      showFire: parsed.showFire !== false,
      viewYaw: sanitizeAngle(parsed.viewYaw, DEFAULT_PARTICLES_EFFECT_SETTINGS.viewYaw),
      viewPitch: sanitizeAngle(parsed.viewPitch, DEFAULT_PARTICLES_EFFECT_SETTINGS.viewPitch)
    }
  } catch {
    return { ...DEFAULT_PARTICLES_EFFECT_SETTINGS }
  }
}

export function saveParticlesEffectSettings(settings: ParticlesEffectSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore quota / private-mode failures.
  }
}
