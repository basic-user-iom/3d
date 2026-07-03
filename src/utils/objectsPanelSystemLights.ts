import * as THREE from 'three'

/** Scene-managed lights hidden from Objects panel and protected from deletion. */
export function isObjectsPanelSystemLight(obj: THREE.Object3D): boolean {
  const ud = obj.userData
  return !!(ud.isAutoInteriorFill || ud.isIndirectLightingProbe || ud.isSystemLight)
}
