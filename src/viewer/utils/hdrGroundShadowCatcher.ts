import * as THREE from 'three'

export interface HdrGroundShadowInput {
  hdrEnabled: boolean
  hdrGroundProjectionEnabled: boolean
  shadowsEnabled: boolean
  /** When true, user has the shadow plane toggled on (standard 360 HDR ground). */
  showShadowPlane?: boolean
}

/**
 * HDR washes out MeshStandardMaterial ground planes via scene.environment IBL.
 * GroundedSkybox (ground projection) uses MeshBasicMaterial and cannot sample shadow maps.
 * Use a transparent ShadowMaterial catcher whenever HDR + shadows are on and either
 * ground projection or the user shadow-plane toggle is active.
 */
export function shouldUseHdrGroundShadowCatcher(input: HdrGroundShadowInput): boolean {
  const showPlane = input.showShadowPlane ?? false
  return (
    input.hdrEnabled &&
    input.shadowsEnabled &&
    (input.hdrGroundProjectionEnabled || showPlane)
  )
}

/** Shadow plane is shown when user toggles it on OR HDR shadow catcher is active. */
export function effectiveShadowPlaneVisible(
  showShadowPlane: boolean,
  input: HdrGroundShadowInput
): boolean {
  return shouldUseHdrGroundShadowCatcher({ ...input, showShadowPlane }) || showShadowPlane
}

export function shadowCatcherOpacity(shadowIntensity: number): number {
  return Math.min(1.0, 0.1 + (shadowIntensity / 2.0) * 0.9)
}

export function applyHdrGroundShadowCatcherMaterial(
  plane: THREE.Mesh,
  shadowIntensity: number
): void {
  const opacity = shadowCatcherOpacity(shadowIntensity)
  const current = plane.material

  if (!(current instanceof THREE.ShadowMaterial)) {
    if (current instanceof THREE.Material) {
      current.dispose()
    }
    const shadowMaterial = new THREE.ShadowMaterial({
      opacity,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide
    })
    plane.material = shadowMaterial
  } else {
    current.opacity = opacity
    current.transparent = true
    current.side = THREE.DoubleSide
    if (current.depthWrite !== true) {
      current.depthWrite = true
    }
    current.needsUpdate = true
  }

  plane.receiveShadow = true
  plane.castShadow = false
  plane.renderOrder = 100
}
