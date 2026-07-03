import * as THREE from 'three'
import type { OrbitControls } from 'three-stdlib'

export type CameraBoundsMode = 'disc' | 'box'

export interface CameraBoundsVec3 {
  x: number
  y: number
  z: number
}

export interface CameraBoundsConfig {
  enabled: boolean
  mode: CameraBoundsMode
  min: CameraBoundsVec3
  max: CameraBoundsVec3
  /** Disc center on XZ plane (ground projection origin). */
  centerX: number
  centerZ: number
  /** Horizontal limit for disc mode (distance from center on XZ). */
  discRadius: number
}

export interface GroundProjectionBounds {
  min: CameraBoundsVec3
  max: CameraBoundsVec3
  centerX: number
  centerZ: number
  discRadius: number
}

const _delta = new THREE.Vector3()
const _minVec = new THREE.Vector3()
const _maxVec = new THREE.Vector3()

function isValidAxisRange(lo: number, hi: number): boolean {
  return Number.isFinite(lo) && Number.isFinite(hi) && lo < hi
}

function clampAxis(v: number, lo: number, hi: number): number {
  return isValidAxisRange(lo, hi) ? Math.max(lo, Math.min(hi, v)) : v
}

/**
 * Clamp a point on the XZ plane to a circular disc (cylinder without Y limit).
 */
export function clampDiscXZ(
  v: THREE.Vector3,
  centerX: number,
  centerZ: number,
  radius: number
): boolean {
  if (!Number.isFinite(radius) || radius <= 0) return false
  const dx = v.x - centerX
  const dz = v.z - centerZ
  const dist = Math.hypot(dx, dz)
  if (dist <= radius || dist === 0) return false
  const scale = radius / dist
  v.x = centerX + dx * scale
  v.z = centerZ + dz * scale
  return true
}

function clampPointToBounds(
  v: THREE.Vector3,
  config: CameraBoundsConfig
): boolean {
  const { min, max, mode, centerX, centerZ, discRadius } = config
  let changed = false

  const newY = clampAxis(v.y, min.y, max.y)
  if (newY !== v.y) {
    v.y = newY
    changed = true
  }

  if (mode === 'disc') {
    if (clampDiscXZ(v, centerX, centerZ, discRadius)) changed = true
  } else {
    const newX = clampAxis(v.x, min.x, max.x)
    const newZ = clampAxis(v.z, min.z, max.z)
    if (newX !== v.x) {
      v.x = newX
      changed = true
    }
    if (newZ !== v.z) {
      v.z = newZ
      changed = true
    }
  }

  return changed
}

export function isCameraBoundsConfigValid(config: CameraBoundsConfig): boolean {
  if (!config.enabled) return false
  const yOk = isValidAxisRange(config.min.y, config.max.y)
  if (!yOk) return false
  if (config.mode === 'disc') {
    return Number.isFinite(config.discRadius) && config.discRadius > 0
  }
  return (
    isValidAxisRange(config.min.x, config.max.x) &&
    isValidAxisRange(config.min.z, config.max.z)
  )
}

/**
 * Derive camera bounds from the HDR ground projection dome/disc.
 * Disc mode uses cylindrical XZ clamp; the returned AABB is for Y limits and box-mode fallback.
 */
export function deriveGroundProjectionBounds(
  radius: number,
  height: number,
  positionY: number
): GroundProjectionBounds {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 100
  const groundY = Number.isFinite(positionY) ? positionY : 0
  const discRadius = r * 0.95
  const domeHeight =
    Number.isFinite(height) && height > 0 ? Math.min(height, r) : Math.min(15, r)
  const minY = groundY - r * 0.05
  const maxY = groundY + domeHeight
  return {
    min: { x: -discRadius, y: minY, z: -discRadius },
    max: { x: discRadius, y: maxY, z: discRadius },
    centerX: 0,
    centerZ: 0,
    discRadius
  }
}

export function buildCameraBoundsConfig(state: {
  cameraBoundsEnabled: boolean
  cameraBoundsMode: CameraBoundsMode
  cameraBoundsMin: CameraBoundsVec3
  cameraBoundsMax: CameraBoundsVec3
  cameraBoundsDiscRadius: number
  cameraBoundsCenterX: number
  cameraBoundsCenterZ: number
}): CameraBoundsConfig {
  const min = state.cameraBoundsMin
  const max = state.cameraBoundsMax
  const fallbackRadius =
    Number.isFinite(state.cameraBoundsDiscRadius) && state.cameraBoundsDiscRadius > 0
      ? state.cameraBoundsDiscRadius
      : Math.min(
          Math.abs(max.x),
          Math.abs(max.z),
          Math.abs(min.x) === Infinity ? Infinity : Math.abs(min.x),
          Math.abs(min.z) === Infinity ? Infinity : Math.abs(min.z)
        )
  const discRadius =
    Number.isFinite(fallbackRadius) && fallbackRadius > 0 && fallbackRadius < Infinity
      ? fallbackRadius
      : 95

  return {
    enabled: state.cameraBoundsEnabled,
    mode: state.cameraBoundsMode,
    min,
    max,
    centerX: state.cameraBoundsCenterX,
    centerZ: state.cameraBoundsCenterZ,
    discRadius
  }
}

/**
 * Industry-standard OrbitControls bounds (Three.js maintainer pattern):
 * 1. Clamp orbit target (pan pivot) — primary constraint for panning.
 * 2. Compensate camera position so the view does not drift.
 * 3. Clamp camera position for orbit-at-edge cases.
 */
export function applyOrbitCameraBounds(
  camera: THREE.Camera,
  controls: { target: THREE.Vector3 },
  config: CameraBoundsConfig
): boolean {
  if (!isCameraBoundsConfigValid(config)) return false

  let changed = false

  _delta.copy(controls.target)
  if (clampPointToBounds(controls.target, config)) {
    _delta.sub(controls.target)
    camera.position.sub(_delta)
    changed = true
  }

  if (clampPointToBounds(camera.position, config)) {
    changed = true
  }

  return changed
}

/** Sync OrbitControls distance/polar limits when camera bounds are active. */
export function syncOrbitControlsLimits(
  controls: Pick<OrbitControls, 'maxDistance' | 'minDistance' | 'maxPolarAngle'>,
  config: CameraBoundsConfig,
  defaults?: { maxDistance?: number; maxPolarAngle?: number }
): void {
  const defaultMaxDistance = defaults?.maxDistance ?? 5000
  const defaultMaxPolar = defaults?.maxPolarAngle ?? Math.PI

  if (!config.enabled || !isCameraBoundsConfigValid(config)) {
    controls.maxDistance = defaultMaxDistance
    controls.maxPolarAngle = defaultMaxPolar
    return
  }

  const heightSpan = config.max.y - config.min.y
  controls.maxDistance = Math.max(config.discRadius * 2, heightSpan * 3, 5)
  controls.minDistance = 0.1
  // Keep camera above the horizon relative to the orbit target (ground-level HDR domes).
  controls.maxPolarAngle = Math.PI / 2 - 0.02
}

/**
 * Self-contained JS for the exported web viewer (injected into the export bundle).
 */
export function getCameraBoundsClampSource(): string {
  return `
function clampDiscXZ(v, centerX, centerZ, radius) {
  if (!Number.isFinite(radius) || radius <= 0) return false;
  var dx = v.x - centerX;
  var dz = v.z - centerZ;
  var dist = Math.hypot(dx, dz);
  if (dist <= radius || dist === 0) return false;
  var scale = radius / dist;
  v.x = centerX + dx * scale;
  v.z = centerZ + dz * scale;
  return true;
}

function clampAxis(v, lo, hi) {
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo < hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  return v;
}

function isCameraBoundsValid(bounds) {
  if (!bounds || !bounds.enabled) return false;
  var yOk = Number.isFinite(bounds.min.y) && Number.isFinite(bounds.max.y) && bounds.min.y < bounds.max.y;
  if (!yOk) return false;
  if (bounds.mode === 'disc') {
    var r = bounds.discRadius;
    return Number.isFinite(r) && r > 0;
  }
  return bounds.min.x < bounds.max.x && bounds.min.z < bounds.max.z;
}

function clampPointToBounds(v, bounds) {
  var changed = false;
  var newY = clampAxis(v.y, bounds.min.y, bounds.max.y);
  if (newY !== v.y) { v.y = newY; changed = true; }
  if (bounds.mode === 'disc') {
    if (clampDiscXZ(v, bounds.centerX || 0, bounds.centerZ || 0, bounds.discRadius)) changed = true;
  } else {
    var newX = clampAxis(v.x, bounds.min.x, bounds.max.x);
    var newZ = clampAxis(v.z, bounds.min.z, bounds.max.z);
    if (newX !== v.x) { v.x = newX; changed = true; }
    if (newZ !== v.z) { v.z = newZ; changed = true; }
  }
  return changed;
}

function applyOrbitCameraBounds(camera, controls, bounds) {
  if (!isCameraBoundsValid(bounds)) return false;
  var changed = false;
  var delta = controls.target.clone();
  if (clampPointToBounds(controls.target, bounds)) {
    delta.sub(controls.target);
    camera.position.sub(delta);
    changed = true;
  }
  if (clampPointToBounds(camera.position, bounds)) changed = true;
  return changed;
}

function syncOrbitControlsLimits(controls, bounds) {
  if (!isCameraBoundsValid(bounds)) {
    controls.maxDistance = 5000;
    controls.maxPolarAngle = Math.PI;
    return;
  }
  var heightSpan = bounds.max.y - bounds.min.y;
  controls.maxDistance = Math.max(bounds.discRadius * 2, heightSpan * 3, 5);
  controls.minDistance = 0.1;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
}
`.trim()
}
