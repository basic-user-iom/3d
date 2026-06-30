import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  isLikelyExteriorBodyPanel,
  isLikelyInteriorMesh,
  isSpatiallyInteriorMesh,
  shouldHideInteriorMesh,
  enhanceInternalShadows,
  applyInteriorVisibility,
  HIDE_ABORT_THRESHOLD,
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

  it('detects rear/spoiler as exterior not interior', () => {
    mesh.name = 'rear_diffuser_panel'
    expect(isLikelyExteriorBodyPanel(mesh)).toBe(true)
    expect(isLikelyInteriorMesh(mesh)).toBe(false)
    expect(shouldHideInteriorMesh(mesh, new THREE.Box3())).toBe(false)
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

  it('keeps exterior panels front-sided and visible', () => {
    mesh.name = 'bumper_rear'
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.side = THREE.DoubleSide
    mesh.visible = false

    const scene = new THREE.Scene()
    scene.add(mesh)

    const result = enhanceInternalShadows(scene)
    expect(result.exteriorPanelsFrontSided).toBe(1)
    expect(mat.side).toBe(THREE.FrontSide)
    expect(mesh.visible).toBe(true)
  })

  it('hides only explicit engine_block meshes when enabled', () => {
    const scene = new THREE.Scene()
    for (let i = 0; i < 8; i++) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial()
      )
      panel.name = `body_panel_${i}`
      panel.userData.isImportedModel = true
      scene.add(panel)
    }

    const engine = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1, 2),
      new THREE.MeshStandardMaterial()
    )
    engine.name = 'engine_block'
    engine.position.set(0, 0.6, -2.8)
    engine.userData.isImportedModel = true
    scene.add(engine)

    const result = enhanceInternalShadows(scene, [], { hideInteriorGeometry: true })
    expect(result.interiorMeshesHidden).toBe(1)
    expect(engine.visible).toBe(false)
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name.startsWith('body_panel')) {
        expect(obj.visible).toBe(true)
      }
    })
  })

  it('does not hide generic Mesh_NNN in rear zone', () => {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.2, 8),
      new THREE.MeshStandardMaterial()
    )
    body.name = 'Mesh_042'
    body.position.set(0, 0.5, -3.5)
    body.userData.isImportedModel = true

    const scene = new THREE.Scene()
    scene.add(body)

    const modelBBox = new THREE.Box3(
      new THREE.Vector3(-2, 0, -4),
      new THREE.Vector3(2, 2, 4)
    )

    expect(shouldHideInteriorMesh(body, modelBBox)).toBe(false)

    const result = enhanceInternalShadows(scene, [], { hideInteriorGeometry: true })
    expect(result.interiorMeshesHidden).toBe(0)
    expect(body.visible).toBe(true)
  })

  it('does not hide exhaust_pipe by spatial position alone', () => {
    const modelBBox = new THREE.Box3(
      new THREE.Vector3(-2, 0, -4),
      new THREE.Vector3(2, 2, 4)
    )
    mesh.name = 'rear_exhaust_pipe'
    mesh.position.set(0, 0.8, -3)
    expect(shouldHideInteriorMesh(mesh, modelBBox)).toBe(false)
    expect(isLikelyInteriorMesh(mesh)).toBe(true)
  })

  it('hides meshes with userData.hideInterior', () => {
    mesh.name = 'structural_part'
    mesh.userData.hideInterior = true
    expect(shouldHideInteriorMesh(mesh, new THREE.Box3())).toBe(true)
  })

  it('aborts hide when more than 30% of meshes would be hidden', () => {
    const scene = new THREE.Scene()
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial()
      )
      m.name = 'engine_block'
      m.userData.isImportedModel = true
      scene.add(m)
    }
    const exterior = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1, 2),
      new THREE.MeshStandardMaterial()
    )
    exterior.name = 'body_panel'
    exterior.userData.isImportedModel = true
    scene.add(exterior)

    const result = enhanceInternalShadows(scene, [], { hideInteriorGeometry: true })
    expect(result.hideAborted).toBe(true)
    expect(result.interiorMeshesHidden).toBe(0)
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        expect(obj.visible).toBe(true)
      }
    })
  })

  it('restores hidden meshes when applyInteriorVisibility(false)', () => {
    const scene = new THREE.Scene()
    for (let i = 0; i < 8; i++) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial()
      )
      panel.name = `body_panel_${i}`
      panel.userData.isImportedModel = true
      scene.add(panel)
    }
    mesh.name = 'engine_block'
    mesh.position.set(0, 0, 0)
    scene.add(mesh)

    enhanceInternalShadows(scene, [], { hideInteriorGeometry: true })
    const restored = applyInteriorVisibility(scene, false)
    expect(restored).toBeGreaterThanOrEqual(1)
    expect(mesh.visible).toBe(true)
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

  it('exports hide abort threshold', () => {
    expect(HIDE_ABORT_THRESHOLD).toBe(0.3)
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
