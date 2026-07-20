import * as THREE from 'three'

/** Sphere radius used by the panorama viewer mesh. */
export const PANORAMA_SPHERE_RADIUS = 500

/** Live panorama camera look — updated every animation frame for overlays. */
export interface PanoramaLiveLook {
  yaw: number
  pitch: number
  fov: number
}

export const DEFAULT_PANORAMA_LIVE_LOOK: PanoramaLiveLook = {
  yaw: 0,
  pitch: 0,
  fov: 75
}

/**
 * Convert spherical yaw/pitch to a point on the inner panorama sphere.
 * Yaw 0 looks along -Z; positive yaw rotates toward +X.
 */
export function sphericalToCartesian(
  yaw: number,
  pitch: number,
  radius: number = PANORAMA_SPHERE_RADIUS
): THREE.Vector3 {
  const cosPitch = Math.cos(pitch)
  return new THREE.Vector3(
    radius * cosPitch * Math.sin(yaw),
    radius * Math.sin(pitch),
    -radius * cosPitch * Math.cos(yaw)
  )
}

/**
 * Convert a point on (or near) the panorama sphere to yaw/pitch.
 */
export function cartesianToSpherical(point: THREE.Vector3): { yaw: number; pitch: number } {
  const radius = point.length()
  const pitch = Math.asin(THREE.MathUtils.clamp(point.y / radius, -1, 1))
  const yaw = Math.atan2(point.x, -point.z)
  return { yaw, pitch }
}

/**
 * Project a sphere-surface point to normalized screen coordinates (0–1).
 * Returns null when the point is behind the camera.
 */
export function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number
): { x: number; y: number; visible: boolean } | null {
  const lookDir = new THREE.Vector3()
  camera.getWorldDirection(lookDir)
  const cameraPos = new THREE.Vector3()
  camera.getWorldPosition(cameraPos)
  if (point.clone().sub(cameraPos).dot(lookDir) <= 0) {
    return null
  }

  const projected = point.clone().project(camera)
  if (projected.z < -1 || projected.z > 1) {
    return null
  }
  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((-projected.y + 1) / 2) * height,
    visible: true
  }
}

/**
 * Convert a drag delta on the canvas to yaw/pitch offsets for OrbitControls-style rotation.
 */
export function pointerDeltaToRotation(
  deltaX: number,
  deltaY: number,
  width: number,
  height: number,
  rotateSpeed = 0.5
): { deltaYaw: number; deltaPitch: number } {
  const deltaYaw = (-deltaX / width) * Math.PI * rotateSpeed
  const deltaPitch = (-deltaY / height) * (Math.PI / 2) * rotateSpeed
  return { deltaYaw, deltaPitch }
}

/** Shortest signed delta between two angles in radians. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  return delta
}

/** Interpolate between angles using the shortest path. */
export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngleDelta(from, to) * t
}

/**
 * Apply yaw/pitch as the camera look direction (camera stays at origin).
 */
export function applyCameraOrientation(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  yaw: number,
  pitch: number
): void {
  const target = sphericalToCartesian(yaw, pitch, 1)
  camera.position.set(0, 0, 0)
  controls.target.copy(target)
  camera.lookAt(target)
  controls.update()
}

/**
 * Keep the camera at the sphere center while preserving the current look direction.
 * OrbitControls orbits the camera around its target, which drifts position away from
 * the panorama origin and breaks target-only orientation reads.
 */
export function syncPanoramaCameraAtOrigin(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3 }
): void {
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  if (dir.lengthSq() < 1e-8) {
    return
  }
  camera.position.set(0, 0, 0)
  controls.target.copy(dir)
}

/** Read yaw/pitch from the camera's actual look direction. */
export function getOrientationFromControls(
  controls: { target: THREE.Vector3 },
  camera: THREE.Camera
): { yaw: number; pitch: number } {
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  if (dir.lengthSq() < 1e-8) {
    const fallback = controls.target.clone()
    if (fallback.lengthSq() < 1e-8) {
      return { yaw: 0, pitch: 0 }
    }
    return cartesianToSpherical(fallback.normalize())
  }
  return cartesianToSpherical(dir)
}
