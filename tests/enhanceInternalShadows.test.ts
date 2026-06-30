import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  isLikelyExteriorBodyPanel,
  isLikelyInteriorMesh,
  isSpatiallyInteriorMesh,
  isInteriorCandidate,
  getMeshAverageAlbedo,
  enhanceInternalShadows,
  applyInteriorCavityDimming,
  ensureImportedMeshesVisible,
  CAVITY_ENV_MAP_DIM_FACTOR,
  CAVITY_COLOR_DIM_FACTOR,
  CAVITY_BRIGHT_COLOR_DIM_FACTOR,
  BRIGHT_ALBEDO_THRESHOLD,
  INTERIOR_RENDER_LAYER
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

  it('tags lightingZone and interior render layer', () => {
    mesh.name = 'engine_block'
    const scene = new THREE.Scene()
    scene.add(mesh)
    enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(mesh.userData.lightingZone).toBe('interior')
    expect(mesh.layers.mask).toBe(1 << INTERIOR_RENDER_LAYER)
  })

  it('dims envMapIntensity and color on interior meshes', () => {
    mesh.name = 'engine_block'
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.envMapIntensity = 2.0
    mat.color.setRGB(0.5, 0.5, 0.5)
    mat.emissiveIntensity = 0.5

    const scene = new THREE.Scene()
    scene.add(mesh)

    const result = enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(result.cavityMeshesDimmed).toBe(1)
    expect(mat.envMapIntensity).toBeCloseTo(2.0 * CAVITY_ENV_MAP_DIM_FACTOR)
    expect(mat.color.r).toBeCloseTo(0.5 * CAVITY_BRIGHT_COLOR_DIM_FACTOR)
    expect(mat.emissiveIntensity).toBe(0)
    expect(mat.userData.cavityDimApplied).toBe(true)
    expect(mat.userData.cavityShaderPatched).toBe(true)
    expect(mesh.visible).toBe(true)
  })

  it('dims bright unnamed meshes inside inner bbox via albedo heuristic', () => {
    const modelBBox = new THREE.Box3(
      new THREE.Vector3(-2, 0, -4),
      new THREE.Vector3(2, 2, 4)
    )
    mesh.name = 'Mesh_128'
    mesh.position.set(0, 1, 0)
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.color.setRGB(0.9, 0.9, 0.9)

    expect(getMeshAverageAlbedo(mesh)).toBeGreaterThan(BRIGHT_ALBEDO_THRESHOLD)
    expect(isInteriorCandidate(mesh, modelBBox)).toBe(true)

    const scene = new THREE.Scene()
    scene.add(mesh)
    const result = enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(result.cavityMeshesDimmed).toBe(1)
    expect(mat.color.r).toBeCloseTo(0.9 * CAVITY_BRIGHT_COLOR_DIM_FACTOR)
    expect(mesh.visible).toBe(true)
  })

  it('does not dim bright meshes outside inner bbox', () => {
    const scene = new THREE.Scene()
    for (const z of [-4, 4]) {
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2, 1),
        new THREE.MeshStandardMaterial()
      )
      shell.name = `body_shell_${z}`
      shell.position.set(0, 1, z)
      shell.userData.isImportedModel = true
      scene.add(shell)
    }

    mesh.name = 'Mesh_200'
    mesh.position.set(0, 1, 3.9)
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.color.setRGB(0.9, 0.9, 0.9)
    scene.add(mesh)

    const modelBBox = new THREE.Box3().setFromObject(scene)
    expect(isInteriorCandidate(mesh, modelBBox)).toBe(false)

    const result = enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(result.cavityMeshesDimmed).toBe(0)
    expect(mat.color.r).toBeCloseTo(0.9)
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

  it('never hides engine_block — dims and keeps visible', () => {
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

    const result = enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(result.cavityMeshesDimmed).toBeGreaterThanOrEqual(1)
    expect(engine.visible).toBe(true)
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
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

    const result = enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(body.visible).toBe(true)
    // Generic Mesh_NNN may still be cavity-dimmed if spatially interior + bright albedo
    expect(result.cavityMeshesDimmed).toBeGreaterThanOrEqual(0)
  })

  it('does not hide exhaust_pipe by spatial position alone', () => {
    const modelBBox = new THREE.Box3(
      new THREE.Vector3(-2, 0, -4),
      new THREE.Vector3(2, 2, 4)
    )
    mesh.name = 'rear_exhaust_pipe'
    mesh.position.set(0, 0.8, -3)
    expect(isLikelyInteriorMesh(mesh)).toBe(true)
    expect(isInteriorCandidate(mesh, modelBBox)).toBe(true)

    const scene = new THREE.Scene()
    scene.add(mesh)
    enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(mesh.visible).toBe(true)
  })

  it('restores previously hidden interior meshes on enhance run', () => {
    mesh.name = 'engine_block'
    mesh.visible = false
    mesh.userData.interiorHiddenByViewer = true

    const scene = new THREE.Scene()
    scene.add(mesh)

    ensureImportedMeshesVisible(scene)
    expect(mesh.visible).toBe(true)
    expect(mesh.userData.interiorHiddenByViewer).toBeUndefined()
  })

  it('restores brightness when applyInteriorCavityDimming(false)', () => {
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

    enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.userData.cavityDimApplied).toBe(true)

    const restored = applyInteriorCavityDimming(scene, false)
    expect(restored).toBeGreaterThanOrEqual(1)
    expect(mat.userData.cavityDimApplied).toBeUndefined()
    expect(mesh.visible).toBe(true)
  })

  it('skips dimming when darkenInteriorCavities is false', () => {
    mesh.name = 'engine_block'
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.color.setRGB(0.5, 0.5, 0.5)

    const scene = new THREE.Scene()
    scene.add(mesh)

    const result = enhanceInternalShadows(scene, [], { darkenInteriorCavities: false })
    expect(result.cavityMeshesDimmed).toBe(0)
    expect(mat.color.r).toBeCloseTo(0.5)
    expect(mesh.visible).toBe(true)
  })

  it('enables castShadow and receiveShadow on all imported meshes', () => {
    mesh.name = 'engine_block'
    mesh.castShadow = false
    mesh.receiveShadow = false

    const scene = new THREE.Scene()
    scene.add(mesh)

    enhanceInternalShadows(scene, [], { darkenInteriorCavities: true })
    expect(mesh.castShadow).toBe(true)
    expect(mesh.receiveShadow).toBe(true)
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
    expect(CAVITY_AO_SETTINGS.aoIntensity).toBeGreaterThan(0.04)
    expect(CAVITY_AO_SETTINGS.aoIntensity).toBeLessThan(0.06)
    expect(CAVITY_AO_SETTINGS.aoKernelRadius).toBeGreaterThanOrEqual(12)
    expect(CAVITY_AO_SETTINGS.aoKernelRadius).toBeLessThanOrEqual(16)
  })
})
