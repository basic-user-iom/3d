import * as THREE from 'three'

/** DynamicSky sphere radius (world units) — must stay inside the active camera far plane */
export const DYNAMIC_SKY_SPHERE_RADIUS = 9000

/** Minimum perspective camera far plane when the sky dome is active */
export const DYNAMIC_SKY_MIN_CAMERA_FAR = DYNAMIC_SKY_SPHERE_RADIUS * 1.5

/**
 * Extend the camera far plane so the sky dome (BackSide sphere) is not clipped.
 * Saves the previous far value once via `savedFarRef`.
 */
export function ensureDynamicSkyCameraFar(
  camera: THREE.PerspectiveCamera,
  savedFarRef?: { value?: number }
): void {
  if (savedFarRef && savedFarRef.value === undefined) {
    savedFarRef.value = camera.far
  }
  if (camera.far < DYNAMIC_SKY_MIN_CAMERA_FAR) {
    camera.far = DYNAMIC_SKY_MIN_CAMERA_FAR
    camera.updateProjectionMatrix()
  }
}

/** Restore camera far plane after DynamicSky is destroyed. */
export function restoreDynamicSkyCameraFar(
  camera: THREE.PerspectiveCamera,
  savedFar?: number
): void {
  if (savedFar === undefined) return
  camera.far = savedFar
  camera.updateProjectionMatrix()
}

export interface DynamicSkyCameraHost {
  camera: THREE.PerspectiveCamera
  dynamicSkySavedCameraFar?: number
}

/** Call when DynamicSky is created (extends far plane if needed). */
export function activateDynamicSkyCamera(host: DynamicSkyCameraHost): void {
  if (host.dynamicSkySavedCameraFar === undefined) {
    host.dynamicSkySavedCameraFar = host.camera.far
  }
  ensureDynamicSkyCameraFar(host.camera)
}

/** Call when DynamicSky is destroyed (restores previous far plane). */
export function deactivateDynamicSkyCamera(host: DynamicSkyCameraHost): void {
  if (host.dynamicSkySavedCameraFar === undefined) return
  restoreDynamicSkyCameraFar(host.camera, host.dynamicSkySavedCameraFar)
  host.dynamicSkySavedCameraFar = undefined
}
