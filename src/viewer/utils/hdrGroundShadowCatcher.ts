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
 * Always use a transparent ShadowMaterial catcher when HDR + shadows are on (toggle only
 * controls visibility via effectiveShadowPlaneVisible).
 */
export function shouldUseHdrGroundShadowCatcher(
  input: HdrGroundShadowInput,
  _showShadowPlane?: boolean
): boolean {
  return shouldAutoShowShadowPlaneForHdr(input)
}

/** Slightly above y=0 so the catcher composites over GroundedSkybox without z-fighting. */
export const HDR_SHADOW_CATCHER_PLANE_Y = 0.003

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
      depthWrite: false,
      side: THREE.DoubleSide
    })
    plane.material = shadowMaterial
  } else {
    current.opacity = opacity
    current.transparent = true
    current.side = THREE.DoubleSide
    if (current.depthWrite !== false) {
      current.depthWrite = false
    }
    current.needsUpdate = true
  }

  plane.receiveShadow = true
  plane.castShadow = false
  plane.position.y = HDR_SHADOW_CATCHER_PLANE_Y
  plane.renderOrder = 100
}
