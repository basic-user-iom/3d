import { degToRad } from './panoramaTourTypes'

export type SpoutShapePreset = 'waterOnly' | 'classic' | 'wide' | 'tall' | 'thin' | 'custom'
export type SpoutGizmoMode = 'translate' | 'rotate' | 'scale'

export interface SpoutEffectSettings {
  enabled: boolean
  /** Relative spout scale (gizmo scale writes this back). */
  size: number
  /** Animation / water flow speed multiplier. */
  speed: number
  /** Tonemap exposure. */
  exposure: number
  /** When true, TransformControls accepts pointer events. */
  editTransform: boolean
  gizmoMode: SpoutGizmoMode
  shapePreset: SpoutShapePreset
  /** Water stream / pipe inner radius (SDF). */
  pipeRadius: number
  /** Metal pipe wall thickness. */
  pipeThickness: number
  /** Vertical fall height (spout mouth height). */
  pipeHeight: number
  /** How far the metal pipe extends behind the mouth (local −X). */
  pipeLength: number
  /** Draw the metal pipe SDF. */
  showPipe: boolean
  /** Pipe albedo color (hex). */
  pipeColor: string
  /** Pipe surface roughness (0 = glossy metal, 1 = matte). */
  pipeRoughness: number
  /** Water tint color (hex) — drives extinction / transmission color. */
  waterColor: string
  /** Water see-through amount (0 = solid tinted, 1 = refractive / transparent). */
  waterOpacity: number
  /** Water surface roughness (0 = glossy, 1 = matte). */
  waterRoughness: number
  /** Absolute index of refraction (e.g. 1.333 for water). */
  waterIor: number
  /** Tint / extinction intensity (higher = denser colored water). */
  waterTint: number
  /** Include original floor / wall / trench geometry. */
  showFloor: boolean
  /** Local Euler rotation (radians) applied via gizmo. */
  rotationX: number
  rotationY: number
  rotationZ: number
  /**
   * Spout home direction in panorama spherical coords (radians).
   * Set via pin-to-view or Move gizmo.
   */
  viewYaw: number
  viewPitch: number
}

export const SPOUT_SHAPE_PRESETS: Record<
  Exclude<SpoutShapePreset, 'custom'>,
  Pick<
    SpoutEffectSettings,
    'pipeRadius' | 'pipeThickness' | 'pipeHeight' | 'pipeLength' | 'showPipe' | 'showFloor'
  >
> = {
  waterOnly: {
    pipeRadius: 0.4,
    pipeThickness: 0.15,
    pipeHeight: 2.0,
    pipeLength: 2.0,
    showPipe: false,
    showFloor: false
  },
  classic: {
    pipeRadius: 0.4,
    pipeThickness: 0.15,
    pipeHeight: 2.0,
    pipeLength: 2.0,
    showPipe: true,
    showFloor: true
  },
  wide: {
    pipeRadius: 0.72,
    pipeThickness: 0.22,
    pipeHeight: 2.0,
    pipeLength: 2.4,
    showPipe: true,
    showFloor: false
  },
  tall: {
    pipeRadius: 0.35,
    pipeThickness: 0.12,
    pipeHeight: 3.6,
    pipeLength: 2.2,
    showPipe: true,
    showFloor: false
  },
  thin: {
    pipeRadius: 0.22,
    pipeThickness: 0.1,
    pipeHeight: 2.6,
    pipeLength: 1.8,
    showPipe: true,
    showFloor: false
  }
}

export const DEFAULT_SPOUT_EFFECT_SETTINGS: SpoutEffectSettings = {
  enabled: true,
  size: 0.75,
  speed: 1.35,
  exposure: 1.05,
  editTransform: false,
  gizmoMode: 'translate',
  shapePreset: 'custom',
  pipeRadius: 0.1,
  pipeThickness: 0.04,
  pipeHeight: 1.7,
  pipeLength: 0.6,
  showPipe: true,
  pipeColor: '#000000',
  pipeRoughness: 1,
  waterColor: '#000000',
  waterOpacity: 1,
  waterRoughness: 0.11,
  waterIor: 1,
  waterTint: 3.4,
  showFloor: false,
  rotationX: degToRad(180),
  rotationY: degToRad(60.6),
  rotationZ: degToRad(-180),
  viewYaw: degToRad(95.4),
  viewPitch: degToRad(9.1)
}

const STORAGE_KEY = 'panorama-360-spout-effect-v3'

function sanitizeAngle(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function isShapePreset(value: unknown): value is SpoutShapePreset {
  return (
    value === 'waterOnly' ||
    value === 'classic' ||
    value === 'wide' ||
    value === 'tall' ||
    value === 'thin' ||
    value === 'custom'
  )
}

/** Map legacy saved presets (e.g. pipeOnly) onto current names. */
function normalizeShapePreset(value: unknown): SpoutShapePreset {
  if (value === 'pipeOnly') return 'classic'
  return isShapePreset(value) ? value : DEFAULT_SPOUT_EFFECT_SETTINGS.shapePreset
}

function isGizmoMode(value: unknown): value is SpoutGizmoMode {
  return value === 'translate' || value === 'rotate' || value === 'scale'
}

export function applySpoutShapePreset(
  preset: Exclude<SpoutShapePreset, 'custom'>
): Pick<
  SpoutEffectSettings,
  | 'shapePreset'
  | 'pipeRadius'
  | 'pipeThickness'
  | 'pipeHeight'
  | 'pipeLength'
  | 'showPipe'
  | 'showFloor'
> {
  return { shapePreset: preset, ...SPOUT_SHAPE_PRESETS[preset] }
}

export function loadSpoutEffectSettings(): SpoutEffectSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SPOUT_EFFECT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<SpoutEffectSettings>
    const shapePreset = normalizeShapePreset(parsed.shapePreset)
    return {
      ...DEFAULT_SPOUT_EFFECT_SETTINGS,
      ...parsed,
      enabled: parsed.enabled === true,
      size: sanitizeNumber(parsed.size, DEFAULT_SPOUT_EFFECT_SETTINGS.size, 0.2, 3),
      speed: sanitizeNumber(parsed.speed, DEFAULT_SPOUT_EFFECT_SETTINGS.speed, 0.1, 3),
      exposure: sanitizeNumber(parsed.exposure, DEFAULT_SPOUT_EFFECT_SETTINGS.exposure, 0.4, 3),
      editTransform: parsed.editTransform === true,
      gizmoMode: isGizmoMode(parsed.gizmoMode) ? parsed.gizmoMode : DEFAULT_SPOUT_EFFECT_SETTINGS.gizmoMode,
      shapePreset,
      pipeRadius: sanitizeNumber(parsed.pipeRadius, DEFAULT_SPOUT_EFFECT_SETTINGS.pipeRadius, 0.1, 1.5),
      pipeThickness: sanitizeNumber(
        parsed.pipeThickness,
        DEFAULT_SPOUT_EFFECT_SETTINGS.pipeThickness,
        0.04,
        0.6
      ),
      pipeHeight: sanitizeNumber(parsed.pipeHeight, DEFAULT_SPOUT_EFFECT_SETTINGS.pipeHeight, 0.5, 6),
      pipeLength: sanitizeNumber(parsed.pipeLength, DEFAULT_SPOUT_EFFECT_SETTINGS.pipeLength, 0.2, 8),
      showPipe:
        typeof parsed.showPipe === 'boolean'
          ? parsed.showPipe
          : shapePreset !== 'waterOnly',
      pipeColor:
        typeof parsed.pipeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.pipeColor)
          ? parsed.pipeColor
          : DEFAULT_SPOUT_EFFECT_SETTINGS.pipeColor,
      pipeRoughness: sanitizeNumber(
        parsed.pipeRoughness,
        DEFAULT_SPOUT_EFFECT_SETTINGS.pipeRoughness,
        0,
        1
      ),
      waterColor:
        typeof parsed.waterColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.waterColor)
          ? parsed.waterColor
          : DEFAULT_SPOUT_EFFECT_SETTINGS.waterColor,
      waterOpacity: sanitizeNumber(
        parsed.waterOpacity,
        DEFAULT_SPOUT_EFFECT_SETTINGS.waterOpacity,
        0,
        1
      ),
      waterRoughness: sanitizeNumber(
        parsed.waterRoughness,
        DEFAULT_SPOUT_EFFECT_SETTINGS.waterRoughness,
        0,
        1
      ),
      waterIor: sanitizeNumber(
        parsed.waterIor,
        DEFAULT_SPOUT_EFFECT_SETTINGS.waterIor,
        1,
        2.5
      ),
      waterTint: sanitizeNumber(
        parsed.waterTint,
        DEFAULT_SPOUT_EFFECT_SETTINGS.waterTint,
        0.2,
        6
      ),
      showFloor: parsed.showFloor === true,
      rotationX: sanitizeAngle(parsed.rotationX, DEFAULT_SPOUT_EFFECT_SETTINGS.rotationX),
      rotationY: sanitizeAngle(parsed.rotationY, DEFAULT_SPOUT_EFFECT_SETTINGS.rotationY),
      rotationZ: sanitizeAngle(parsed.rotationZ, DEFAULT_SPOUT_EFFECT_SETTINGS.rotationZ),
      viewYaw: sanitizeAngle(parsed.viewYaw, DEFAULT_SPOUT_EFFECT_SETTINGS.viewYaw),
      viewPitch: sanitizeAngle(parsed.viewPitch, DEFAULT_SPOUT_EFFECT_SETTINGS.viewPitch)
    }
  } catch {
    return { ...DEFAULT_SPOUT_EFFECT_SETTINGS }
  }
}

export function saveSpoutEffectSettings(settings: SpoutEffectSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore quota / private-mode failures.
  }
}
