import * as THREE from 'three'

export interface HdrGroundShadowInput {
  hdrEnabled: boolean
  hdrGroundProjectionEnabled: boolean
  shadowsEnabled: boolean
}

/**
 * HDR ground projection uses MeshBasicMaterial (GroundedSkybox) which cannot sample shadow maps.
 * Layer a transparent ShadowMaterial plane on top when both ground projection and shadows are on.
 */
export function shouldUseHdrGroundShadowCatcher(input: HdrGroundShadowInput): boolean {
  return input.hdrEnabled && input.hdrGroundProjectionEnabled && input.shadowsEnabled
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
    const shadowMaterial = new THREE.ShadowMaterial({ opacity })
    shadowMaterial.depthWrite = true
    plane.material = shadowMaterial
  } else {
    current.opacity = opacity
    if (current.depthWrite !== true) {
      current.depthWrite = true
    }
    current.needsUpdate = true
  }

  plane.receiveShadow = true
  plane.castShadow = false
  plane.renderOrder = 100
}
