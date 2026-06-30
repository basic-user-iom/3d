import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  isLikelyExteriorBodyPanel,
  isLikelyInteriorMesh,
  enhanceInternalShadows,
  CAVITY_ENV_MAP_DIM_FACTOR
} from '../src/utils/enhanceInternalShadows'
import {
  shouldAutoEnableCavityAo,
  CAVITY_AO_SETTINGS
} from '../src/viewer/utils/cavityOcclusion'

describe('enhanceInternalShadows', () => {
  let mesh: THREE.Mesh

  beforeEach(() => {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'body_paint' })
    )
    mesh.userData.isImportedModel = true
  })

  it('detects exterior body panels by name', () => {
    mesh.name = 'rear_body_panel'
    expect(isLikelyExteriorBodyPanel(mesh)).toBe(true)
    expect(isLikelyInteriorMesh(mesh)).toBe(false)
  })

  it('detects interior mechanical parts by name', () => {
    mesh.name = 'exhaust_pipe_rear'
    ;(mesh.material as THREE.MeshStandardMaterial).name = 'metal_pipe'
    expect(isLikelyInteriorMesh(mesh)).toBe(true)
    expect(isLikelyExteriorBodyPanel(mesh)).toBe(false)
  })

  it('respects userData.interior tag', () => {
    mesh.name = 'part_042'
    mesh.userData.interior = true
    expect(isLikelyInteriorMesh(mesh)).toBe(true)
  })

  it('dims envMapIntensity on interior meshes', () => {
    mesh.name = 'engine_block'
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.envMapIntensity = 2.0

    const scene = new THREE.Scene()
    scene.add(mesh)

    const result = enhanceInternalShadows(scene)
    expect(result.cavityMeshesDimmed).toBe(1)
    expect(mat.envMapIntensity).toBeCloseTo(2.0 * CAVITY_ENV_MAP_DIM_FACTOR)
    expect(mat.userData.cavityDimApplied).toBe(true)
  })

  it('keeps exterior panels front-sided', () => {
    mesh.name = 'bumper_rear'
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.side = THREE.DoubleSide

    const scene = new THREE.Scene()
    scene.add(mesh)

    const result = enhanceInternalShadows(scene)
    expect(result.exteriorPanelsFrontSided).toBe(1)
    expect(mat.side).toBe(THREE.FrontSide)
  })
})

describe('cavityOcclusion', () => {
  it('only auto-enables SAO for high/ultra weather with post-processing', () => {
    expect(shouldAutoEnableCavityAo(true, 'low', true)).toBe(false)
    expect(shouldAutoEnableCavityAo(true, 'medium', true)).toBe(false)
    expect(shouldAutoEnableCavityAo(true, 'high', false)).toBe(false)
    expect(shouldAutoEnableCavityAo(true, 'high', true)).toBe(true)
    expect(shouldAutoEnableCavityAo(true, 'ultra', true)).toBe(true)
  })

  it('uses conservative AO intensity', () => {
    expect(CAVITY_AO_SETTINGS.aoIntensity).toBeLessThan(0.05)
    expect(CAVITY_AO_SETTINGS.aoKernelRadius).toBeLessThanOrEqual(12)
  })
})
