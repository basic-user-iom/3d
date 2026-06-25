import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applySceneFog,
  enableFogOnSceneMeshes,
  fogDensityToSceneValue,
  isWeatherVisualActive,
  SCENE_FOG_DENSITY_SCALE,
  shouldSkipFogForObject
} from '../src/viewer/utils/sceneFog'

describe('sceneFog', () => {
  it('converts panel density to FogExp2 density', () => {
    expect(fogDensityToSceneValue(0.55)).toBeCloseTo(0.55 * SCENE_FOG_DENSITY_SCALE)
    expect(fogDensityToSceneValue(-1)).toBe(0)
    expect(fogDensityToSceneValue(2)).toBe(SCENE_FOG_DENSITY_SCALE)
  })

  it('enables fog on imported models', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ fog: false })
    )
    mesh.userData.isImportedModel = true
    mesh.userData.excludeFromSkyModifications = true
    scene.add(mesh)

    expect(enableFogOnSceneMeshes(scene)).toBe(1)
    expect((mesh.material as THREE.MeshStandardMaterial).fog).toBe(true)
  })

  it('skips sky and helper meshes', () => {
    const scene = new THREE.Scene()
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(),
      new THREE.MeshBasicMaterial({ fog: false })
    )
    sky.userData.isDynamicSky = true
    scene.add(sky)

    expect(shouldSkipFogForObject(sky)).toBe(true)
    expect(enableFogOnSceneMeshes(scene)).toBe(0)
  })

  it('applies and clears scene fog', () => {
    const scene = new THREE.Scene()
    applySceneFog(scene, 0.4, '#c8d0d8')
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2)
    expect((scene.fog as THREE.FogExp2).density).toBeCloseTo(0.4 * SCENE_FOG_DENSITY_SCALE)

    applySceneFog(scene, 0, '#ffffff')
    expect(scene.fog).toBeNull()
  })

  it('detects active weather visuals', () => {
    expect(isWeatherVisualActive({ fogDensity: 0, rainIntensity: 0, snowIntensity: 0 })).toBe(false)
    expect(isWeatherVisualActive({ fogDensity: 0.1, rainIntensity: 0, snowIntensity: 0 })).toBe(true)
    expect(isWeatherVisualActive({ fogDensity: 0, rainIntensity: 0.5, snowIntensity: 0 })).toBe(true)
  })
})
