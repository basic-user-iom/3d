import * as THREE from 'three'

/** Shared FogExp2 scale used by Weather panel and AtmosphericPerspective */
export const SCENE_FOG_DENSITY_SCALE = 0.015

/** World Y of the shadow/grid ground plane — weather effects must not render below this */
export const WEATHER_GROUND_LEVEL = 0

export function fogDensityToSceneValue(density: number): number {
  return Math.max(0, Math.min(1, density)) * SCENE_FOG_DENSITY_SCALE
}

/** Sky domes, helpers, and particle systems should not receive scene fog */
export function shouldSkipFogForObject(object: THREE.Object3D): boolean {
  const ud = object.userData
  if (ud.excludeFromFog === true) return true
  if (ud.isGridHelper || ud.isAxesHelper || ud.isShadowPlane) return true
  if (ud.isDynamicSky || ud.isSunMoon || ud.isParticleSystem || ud.isStandaloneWater) return true
  return false
}

const fogMeshesReadyScenes = new WeakSet<THREE.Scene>()

export function invalidateFogMeshesReady(scene: THREE.Scene): void {
  fogMeshesReadyScenes.delete(scene)
}

/** Enable scene.fog on meshes — includes imported models (loaders set fog=false by default) */
export function enableFogOnSceneMeshes(scene: THREE.Scene, force = false): number {
  if (!force && fogMeshesReadyScenes.has(scene)) {
    return 0
  }

  let count = 0
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.material) return
    if (shouldSkipFogForObject(object)) return

    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const mat of materials) {
      if ('fog' in mat && (mat as THREE.Material & { fog?: boolean }).fog !== true) {
        ;(mat as THREE.Material & { fog?: boolean }).fog = true
        mat.needsUpdate = true
        count++
      }
    }
  })

  if (count > 0 || force) {
    fogMeshesReadyScenes.add(scene)
  }
  return count
}

export function applySceneFog(scene: THREE.Scene, density: number, color: string): void {
  if (density <= 0) {
    scene.fog = null
    invalidateFogMeshesReady(scene)
    return
  }
  scene.fog = new THREE.FogExp2(new THREE.Color(color), fogDensityToSceneValue(density))
  enableFogOnSceneMeshes(scene, true)
}

export function isWeatherVisualActive(state: {
  fogDensity: number
  rainIntensity: number
  snowIntensity: number
}): boolean {
  return state.fogDensity > 0 || state.rainIntensity > 0 || state.snowIntensity > 0
}
