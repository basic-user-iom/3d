export interface BirdsEffectSettings {
  enabled: boolean
  /** Instanced bird count. Changing this rebuilds the flocking sim only (not the panorama). */
  count: number
  /** Relative bird mesh scale. */
  size: number
  /** Simulation speed multiplier. */
  speed: number
  /** Bird body color (hex). */
  color: string
  separation: number
  alignment: number
  cohesion: number
  /**
   * Flock home direction in panorama spherical coords (radians).
   * Same convention as Initial view — pin via “Pin birds to view” so the flock
   * stays fixed in that sky region while the camera looks around.
   */
  viewYaw: number
  viewPitch: number
}

export const BIRDS_COUNT_OPTIONS = [512, 1024, 2048, 4096, 8192] as const

export const DEFAULT_BIRDS_EFFECT_SETTINGS: BirdsEffectSettings = {
  enabled: false,
  count: 2048,
  size: 1,
  speed: 1,
  color: '#000000',
  separation: 15,
  alignment: 20,
  cohesion: 20,
  viewYaw: 0,
  viewPitch: 0
}

function prefersMobileExperience(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(max-width: 768px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  )
}

/** Mobile-safe defaults when enabling birds for the first time. */
export function getDefaultBirdsEffectSettings(): BirdsEffectSettings {
  const base = { ...DEFAULT_BIRDS_EFFECT_SETTINGS }
  if (prefersMobileExperience()) {
    base.count = 512
  }
  return base
}

const STORAGE_KEY = 'panorama-360-birds-effect'

function sanitizeAngle(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function loadBirdsEffectSettings(): BirdsEffectSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultBirdsEffectSettings()
    const parsed = JSON.parse(raw) as Partial<BirdsEffectSettings>
    const defaults = getDefaultBirdsEffectSettings()
    return {
      ...defaults,
      ...parsed,
      count: BIRDS_COUNT_OPTIONS.includes(parsed.count as (typeof BIRDS_COUNT_OPTIONS)[number])
        ? (parsed.count as number)
        : defaults.count,
      color: typeof parsed.color === 'string' && parsed.color ? parsed.color : defaults.color,
      viewYaw: sanitizeAngle(parsed.viewYaw, defaults.viewYaw),
      viewPitch: sanitizeAngle(parsed.viewPitch, defaults.viewPitch)
    }
  } catch {
    return getDefaultBirdsEffectSettings()
  }
}

export function saveBirdsEffectSettings(settings: BirdsEffectSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore quota / private-mode failures.
  }
}
