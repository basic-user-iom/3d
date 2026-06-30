import * as THREE from 'three'

export interface HdrGroundShadowInput {
  hdrEnabled: boolean
  hdrGroundProjectionEnabled: boolean
  shadowsEnabled: boolean
}

/** Auto-show shadow plane whenever the user has shadows on under HDR lighting. */
export function shouldAutoShowShadowPlaneForHdr(input: HdrGroundShadowInput): boolean {
  return input.hdrEnabled && input.shadowsEnabled
}

/**
 * HDR washes out MeshStandardMaterial ground planes via scene.environment IBL.
 * GroundedSkybox (ground projection) uses MeshBasicMaterial and cannot sample shadow maps.
 * Use a transparent ShadowMaterial catcher when HDR + shadows are on and either ground
 * projection is active or the plane is auto-shown (user toggle off).
 */
export function shouldUseHdrGroundShadowCatcher(
  input: HdrGroundShadowInput,
  showShadowPlane: boolean
): boolean {
  if (!shouldAutoShowShadowPlaneForHdr(input)) return false
  if (input.hdrGroundProjectionEnabled) return true
  return !showShadowPlane
}

/** Shadow plane is shown when user toggles it on OR HDR + shadows auto-show it. */
export function effectiveShadowPlaneVisible(
  showShadowPlane: boolean,
  input: HdrGroundShadowInput
): boolean {
  return showShadowPlane || shouldAutoShowShadowPlaneForHdr(input)
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
