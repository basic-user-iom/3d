import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  cacheImportedModelScene,
  detachCachedImportedModelsFromScene,
  clearStreetsGLProductHideOnCachedModels,
  getCachedImportedModelScene,
  __clearImportedModelCacheForTests
} from '../src/viewer/importedModelCache'
import { buildMeshFromDescriptor } from '../src/viewer/objectRegistry'
import type { ProjectObject } from '../src/store/useAppStore'
import { disposeTexturesFromMaterial } from '../src/viewer/useViewer'

/**
 * Regression: City/Streets GL teardown used to dispose meshes that were still held in
 * importedModelCache. Returning to Product reattached zombie roots with null maps →
 * dark silhouette + dark hierarchy thumbnails.
 */
describe('importedModelCache preserve across scene teardown', () => {
  beforeEach(() => {
    __clearImportedModelCacheForTests()
  })

  afterEach(() => {
    __clearImportedModelCacheForTests()
  })

  function makeTexturedImportedRoot(id: string): THREE.Group {
    const tex = new THREE.DataTexture(new Uint8Array([255, 128, 64, 255]), 1, 1)
    tex.needsUpdate = true
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
    mesh.name = 'Body'
    const root = new THREE.Group()
    root.name = 'Meshy AI texture.glb'
    root.userData.projectObjectId = id
    root.userData.isModel = true
    root.userData.isImportedModel = true
    root.userData.renderInStreetsGL = true
    root.visible = false
    root.add(mesh)
    return root
  }

  function simulateViewerCanvasTeardown(scene: THREE.Scene) {
    // Mirrors ViewerCanvas unmount: detach cached imports, then dispose remaining meshes.
    detachCachedImportedModelsFromScene(scene)
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry?.dispose()
      const mats = Array.isArray(object.material) ? object.material : [object.material]
      for (const mat of mats) {
        if (mat instanceof THREE.Material) {
          disposeTexturesFromMaterial(mat)
          mat.dispose()
        }
      }
    })
    while (scene.children.length > 0) {
      scene.remove(scene.children[0])
    }
  }

  it('keeps material maps when scene teardown detaches cached imports', () => {
    const id = 'obj_texture_preserve_1'
    const root = makeTexturedImportedRoot(id)
    cacheImportedModelScene(id, root)

    const scene = new THREE.Scene()
    scene.add(root)
    // Also add a disposable helper that SHOULD be disposed
    const helper = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    )
    helper.userData.isShadowPlane = true
    scene.add(helper)

    const mapBefore = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(mapBefore.map).toBeTruthy()
    const textureUuid = mapBefore.map!.uuid

    simulateViewerCanvasTeardown(scene)

    expect(scene.children.length).toBe(0)
    const cached = getCachedImportedModelScene(id)
    expect(cached).toBe(root)
    const mat = (cached!.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(mat.map).toBeTruthy()
    expect(mat.map!.uuid).toBe(textureUuid)
    expect(mat.map).not.toBeNull()
  })

  it('restores Product visibility without re-applying stale renderInStreetsGL hide', () => {
    const id = 'obj_texture_preserve_2'
    const root = makeTexturedImportedRoot(id)
    cacheImportedModelScene(id, root)

    clearStreetsGLProductHideOnCachedModels()
    expect(root.visible).toBe(true)
    expect(root.userData.renderInStreetsGL).toBeUndefined()

    const descriptor: ProjectObject = {
      id,
      name: root.name,
      kind: 'imported',
      visible: true,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 10, y: 10, z: 10 }
      },
      userData: {
        renderInStreetsGL: true,
        streetsGLVisible: true
      }
    }

    // Overlay closed → Product rebuild must show model and keep textures
    const rebuilt = buildMeshFromDescriptor(descriptor, { streetsGLOverlayActive: false })
    expect(rebuilt).toBe(root)
    expect(root.visible).toBe(true)
    expect(root.userData.renderInStreetsGL).toBeUndefined()
    const mat = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(mat.map).toBeTruthy()

    // Overlay still active → keep product-hide for iframe ownership
    root.visible = false
    root.userData.renderInStreetsGL = true
    const hidden = buildMeshFromDescriptor(descriptor, { streetsGLOverlayActive: true })
    expect(hidden).toBe(root)
    expect(root.visible).toBe(false)
    expect(root.userData.renderInStreetsGL).toBe(true)
  })
})
