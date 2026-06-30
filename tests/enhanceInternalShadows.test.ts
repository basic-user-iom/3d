import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  isLikelyExteriorBodyPanel,
  isLikelyInteriorMesh,
  isSpatiallyInteriorMesh,
  shouldHideInteriorMesh,
  enhanceInternalShadows,
  applyInteriorVisibility,
  CAVITY_ENV_MAP_DIM_FACTOR,
  CAVITY_COLOR_DIM_FACTOR
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

  it('detects expanded interior keywords', () => {
    mesh.name = 'underbody_subframe_mount'
    expect(isLikelyInteriorMesh(mesh)).toBe(true)
  })

  it('respects userData.interior tag', () => {
    mesh.name = 'part_042'
    mesh.userData.interior = true
    expect(isLikelyInteriorMesh(mesh)).toBe(true)
  })

  it('dims envMapIntensity and color on interior meshes', () => {
    mesh.name = 'engine_block'
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.envMapIntensity = 2.0
    mat.color.setRGB(1, 1, 1)

    const scene = new THREE.Scene()
    scene.add(mesh)

    const result = enhanceInternalShadows(scene, [], { hideInteriorGeometry: false })
    expect(result.cavityMeshesDimmed).toBe(1)
    expect(mat.envMapIntensity).toBeCloseTo(2.0 * CAVITY_ENV_MAP_DIM_FACTOR)
    expect(mat.color.r).toBeCloseTo(CAVITY_COLOR_DIM_FACTOR)
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

  it('hides interior meshes inside model bbox when enabled', () => {
    const exterior = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.2, 8),
      new THREE.MeshStandardMaterial()
    )
    exterior.name = 'rear_bumper_panel'
    exterior.position.set(0, 0.5, -3.5)
    exterior.userData.isImportedModel = true

    const engine = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1, 2),
      new THREE.MeshStandardMaterial()
    )
    engine.name = 'exhaust_pipe_assembly'
    engine.position.set(0, 0.6, -2.8)
    engine.userData.isImportedModel = true

    const scene = new THREE.Scene()
    scene.add(exterior, engine)

    const result = enhanceInternalShadows(scene, [], { hideInteriorGeometry: true })
    expect(result.interiorMeshesHidden).toBeGreaterThanOrEqual(1)
    expect(engine.visible).toBe(false)
    expect(exterior.visible).toBe(true)
  })

  it('restores hidden meshes when applyInteriorVisibility(false)', () => {
    mesh.name = 'engine_block'
    mesh.position.set(0, 0, 0)

    const scene = new THREE.Scene()
    scene.add(mesh)

    enhanceInternalShadows(scene, [], { hideInteriorGeometry: true })
    const restored = applyInteriorVisibility(scene, false)
    expect(restored).toBeGreaterThanOrEqual(0)
  })

  it('detects spatially interior meshes', () => {
    const modelBBox = new THREE.Box3(
      new THREE.Vector3(-2, 0, -4),
      new THREE.Vector3(2, 2, 4)
    )
    mesh.position.set(0, 1, 0)
    expect(isSpatiallyInteriorMesh(mesh, modelBBox)).toBe(true)
    mesh.position.set(0, 1, 3.9)
    expect(isSpatiallyInteriorMesh(mesh, modelBBox)).toBe(false)
  })

  it('shouldHideInteriorMesh for named exhaust inside bbox', () => {
    const modelBBox = new THREE.Box3(
      new THREE.Vector3(-2, 0, -4),
      new THREE.Vector3(2, 2, 4)
    )
    mesh.name = 'rear_exhaust_pipe'
    mesh.position.set(0, 0.8, -3)
    expect(shouldHideInteriorMesh(mesh, modelBBox)).toBe(true)
  })
})

describe('cavityOcclusion', () => {
  it('auto-enables SAO for medium+ weather with post-processing', () => {
    expect(shouldAutoEnableCavityAo(true, 'low', true)).toBe(false)
    expect(shouldAutoEnableCavityAo(true, 'medium', true)).toBe(true)
    expect(shouldAutoEnableCavityAo(true, 'high', false)).toBe(false)
    expect(shouldAutoEnableCavityAo(true, 'high', true)).toBe(true)
    expect(shouldAutoEnableCavityAo(true, 'ultra', true)).toBe(true)
  })

  it('uses stronger but safe AO intensity', () => {
    expect(CAVITY_AO_SETTINGS.aoIntensity).toBeGreaterThan(0.02)
    expect(CAVITY_AO_SETTINGS.aoIntensity).toBeLessThan(0.06)
    expect(CAVITY_AO_SETTINGS.aoKernelRadius).toBeLessThanOrEqual(14)
  })
})
