import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { disableShadowsDeep, isLightVisualOrControl } from '../src/viewer/utils/lightGizmos'
import { isObjectInSceneGraph, safeAttachTransformControls } from '../src/viewer/useViewer'

describe('light gizmo shadows', () => {
  it('treats child meshes under isLightGizmo parents as light visuals', () => {
    const group = new THREE.Group()
    group.userData.isLightGizmo = true
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.2, 16),
      new THREE.MeshBasicMaterial({ wireframe: true })
    )
    cone.castShadow = true
    cone.receiveShadow = true
    group.add(cone)

    disableShadowsDeep(group)
    group.traverse((child) => {
      child.userData.isLightGizmo = true
      child.userData.ignoreShadowWarnings = true
    })

    expect(cone.castShadow).toBe(false)
    expect(cone.receiveShadow).toBe(false)
    expect(isLightVisualOrControl(cone)).toBe(true)
  })

  it('disableShadowsDeep clears flags even if something re-enabled them', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    disableShadowsDeep(mesh)
    expect(mesh.castShadow).toBe(false)
    expect(mesh.receiveShadow).toBe(false)
  })

  it('skips TransformControls-like trees via type name', () => {
    const root = new THREE.Object3D()
    root.userData.isTransformControls = true
    const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    root.add(child)
    expect(isLightVisualOrControl(child)).toBe(true)
  })
})

describe('safeAttachTransformControls', () => {
  it('refuses attach when object is not in the scene graph', () => {
    const scene = new THREE.Scene()
    const orphan = new THREE.Object3D()
    const attached: { object?: THREE.Object3D } = {}
    const tc = {
      object: undefined as THREE.Object3D | undefined,
      attach(obj: THREE.Object3D) {
        attached.object = obj
        this.object = obj
      },
      detach() {
        attached.object = undefined
        this.object = undefined
      }
    }

    expect(isObjectInSceneGraph(orphan, scene)).toBe(false)
    expect(safeAttachTransformControls(tc, orphan, scene)).toBe(false)
    expect(attached.object).toBeUndefined()

    scene.add(orphan)
    expect(safeAttachTransformControls(tc, orphan, scene)).toBe(true)
    expect(attached.object).toBe(orphan)
  })
})
