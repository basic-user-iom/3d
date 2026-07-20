import * as THREE from 'three'

/** Scene-managed lights hidden from Objects panel and protected from deletion. */
export function isObjectsPanelSystemLight(obj: THREE.Object3D): boolean {
  const ud = obj.userData
  return !!(
    ud.isAutoInteriorFill ||
    ud.isIndirectLightingProbe ||
    ud.isSystemLight ||
    // CSM / standalone-weather internals (marked isCSMLight + isInternal, not isSystemLight)
    ud.isCSMLight ||
    ud.isInternal ||
    ud.isStandaloneWeatherLight
  )
}
