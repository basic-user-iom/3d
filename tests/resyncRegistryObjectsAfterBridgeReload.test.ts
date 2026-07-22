import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { useAppStore } from '../src/store/useAppStore'
import { cacheImportedModelScene, removeCachedImportedModelScene } from '../src/viewer/importedModelCache'
import { resyncRegistryObjectsAfterBridgeReload } from '../src/viewer/useViewer'
import type { StreetsGLBridge } from '../src/utils/streetsGLBridge'

describe('resyncRegistryObjectsAfterBridgeReload', () => {
  const objectId = 'imported-tab-resync-1'

  beforeEach(() => {
    useAppStore.setState({ projectObjects: [] })
    removeCachedImportedModelScene(objectId, false)
  })

  afterEach(() => {
    useAppStore.setState({ projectObjects: [] })
    removeCachedImportedModelScene(objectId, true)
  })

  it('re-adds registry objects missing from the iframe after a bridge restart', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    )
    mesh.name = 'TabSwitchModel'
    mesh.userData.streetsGLObjectId = objectId
    mesh.userData.streetsGLAdded = true
    cacheImportedModelScene(objectId, mesh)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'TabSwitchModel',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      gps: { lat: 32.9, lon: -97.04 },
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: {
        streetsGLAdded: true,
        streetsGLPending: false
      }
    })

    const addObject = vi.fn(async () => ({ success: true, queued: false }))
    const updateObject = vi.fn(async () => true)
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => []), // empty after iframe restart
      addObject,
      updateObject,
      ensureTexturesReady: vi.fn(async () => undefined)
    } as unknown as StreetsGLBridge

    // syncModelToStreetsGL uses static ensureTexturesReady on the class
    const ensureSpy = vi
      .spyOn(await import('../src/utils/streetsGLBridge').then((m) => m.StreetsGLBridge), 'ensureTexturesReady')
      .mockResolvedValue(undefined)

    const fromThreeSpy = vi
      .spyOn(await import('../src/utils/streetsGLBridge').then((m) => m.StreetsGLBridge), 'fromThreeJSObject')
      .mockReturnValue({
        id: objectId,
        type: 'mesh',
        position: { x: 0, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visible: true
      } as any)

    const resynced = await resyncRegistryObjectsAfterBridgeReload(bridge)

    expect(resynced).toBe(1)
    expect(bridge.getObjects).toHaveBeenCalled()
    expect(addObject).toHaveBeenCalled()
    expect(useAppStore.getState().projectObjects[0]?.userData?.streetsGLAdded).toBe(true)

    ensureSpy.mockRestore()
    fromThreeSpy.mockRestore()
  })

  it('reasserts visibility for objects already present in the iframe without re-adding', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    cacheImportedModelScene(objectId, mesh)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'AlreadyThere',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: { streetsGLAdded: true }
    })

    const addObject = vi.fn(async () => ({ success: true, queued: false }))
    const updateObject = vi.fn(async () => true)
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => [{ id: objectId, visible: true }]),
      addObject,
      updateObject
    } as unknown as StreetsGLBridge

    const resynced = await resyncRegistryObjectsAfterBridgeReload(bridge)
    // Reassert visible:true so a post-paint polluted hide cannot stick.
    expect(resynced).toBe(1)
    expect(addObject).not.toHaveBeenCalled()
    expect(updateObject).toHaveBeenCalledWith(objectId, { visible: true })
  })

  it('pushes product-mode imports that were never marked streetsGLAdded', async () => {
    const idA = 'import-a'
    const idB = 'import-b'
    removeCachedImportedModelScene(idA, false)
    removeCachedImportedModelScene(idB, false)

    for (const id of [idA, idB]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      )
      mesh.name = id
      mesh.visible = false // city/hybrid Three.js hide
      mesh.userData.streetsGLObjectId = id
      cacheImportedModelScene(id, mesh)
      useAppStore.getState().addProjectObject({
        id,
        name: id,
        kind: 'imported',
        visible: true,
        streetsGLObjectId: id,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        userData: {} // never synced to Streets GL yet
      })
    }

    useAppStore.setState({ streetsGLIframeOverlay: true })

    const addObject = vi.fn(async () => ({ success: true, queued: false }))
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => []),
      addObject,
      updateObject: vi.fn(async () => true)
    } as unknown as StreetsGLBridge

    const ensureSpy = vi
      .spyOn(await import('../src/utils/streetsGLBridge').then((m) => m.StreetsGLBridge), 'ensureTexturesReady')
      .mockResolvedValue(undefined)
    const fromThreeSpy = vi
      .spyOn(await import('../src/utils/streetsGLBridge').then((m) => m.StreetsGLBridge), 'fromThreeJSObject')
      .mockImplementation((_obj: any, id?: string) => ({
        id: id || 'unknown',
        type: 'mesh',
        position: { x: 0, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visible: false // polluted from Three.js hide — sync must override
      }) as any)

    const resynced = await resyncRegistryObjectsAfterBridgeReload(bridge)

    expect(resynced).toBe(2)
    expect(addObject).toHaveBeenCalledTimes(2)
    // Visibility must be forced true for iframe-renderable hidden roots
    for (const call of addObject.mock.calls) {
      const arg = (call as unknown as [{ visible?: boolean }])[0]
      expect(arg?.visible).toBe(true)
    }

    ensureSpy.mockRestore()
    fromThreeSpy.mockRestore()
    removeCachedImportedModelScene(idA, true)
    removeCachedImportedModelScene(idB, true)
    useAppStore.setState({ streetsGLIframeOverlay: false, projectObjects: [] })
  })

  it('restores visibility when iframe object exists but is invisible', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    mesh.visible = false
    mesh.userData.renderInStreetsGL = true
    cacheImportedModelScene(objectId, mesh)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'HiddenInIframe',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: { streetsGLAdded: true, renderInStreetsGL: true }
    })
    useAppStore.setState({ streetsGLIframeOverlay: true })

    const updateObject = vi.fn(async () => true)
    const addObject = vi.fn(async () => ({ success: true, queued: false }))
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => [{ id: objectId, visible: false }]),
      addObject,
      updateObject
    } as unknown as StreetsGLBridge

    const resynced = await resyncRegistryObjectsAfterBridgeReload(bridge)
    expect(resynced).toBe(1)
    expect(addObject).not.toHaveBeenCalled()
    expect(updateObject).toHaveBeenCalledWith(objectId, { visible: true })
    useAppStore.setState({ streetsGLIframeOverlay: false })
  })

  it('persists streetsGLVisible on registry when healing an existing invisible iframe shell', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    mesh.visible = false
    mesh.userData.streetsGLAdded = true
    // Intentionally omit streetsGLVisible — heal must establish the channel.
    cacheImportedModelScene(objectId, mesh)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'NeedsChannel',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: { streetsGLAdded: true }
    })
    useAppStore.setState({ streetsGLIframeOverlay: true })

    const updateObject = vi.fn(async () => true)
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => [{ id: objectId, visible: false }]),
      addObject: vi.fn(async () => ({ success: true, queued: false })),
      updateObject
    } as unknown as StreetsGLBridge

    const resynced = await resyncRegistryObjectsAfterBridgeReload(bridge)
    expect(resynced).toBe(1)
    expect(updateObject).toHaveBeenCalledWith(objectId, { visible: true })
    expect(mesh.userData.streetsGLVisible).toBe(true)
    expect(mesh.userData.renderInStreetsGL).toBe(true)
    expect(useAppStore.getState().projectObjects[0]?.userData?.streetsGLVisible).toBe(true)
    expect(useAppStore.getState().projectObjects[0]?.userData?.renderInStreetsGL).toBe(true)
    useAppStore.setState({ streetsGLIframeOverlay: false })
  })

  it('does not overwrite Mercator placement anchor with post-gizmo GPS on existing objects', async () => {
    const placementAnchor = { x: 3_880_000, y: 1.5, z: -10_800_000 }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    mesh.visible = false
    mesh.userData.renderInStreetsGL = true
    mesh.userData.streetsGLPosition = { ...placementAnchor }
    mesh.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    mesh.position.set(10, 1.5, -5) // local delta after city gizmo move
    cacheImportedModelScene(objectId, mesh)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'MovedCar',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      // GPS reflects the *current* location after the move — must not replace the anchor.
      gps: { lat: 32.91, lon: -97.05 },
      transform: {
        position: { x: 10, y: 1.5, z: -5 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: {
        streetsGLAdded: true,
        renderInStreetsGL: true,
        streetsGLVisible: true,
        streetsGLPosition: { ...placementAnchor },
        streetsGLBaseTransform: { position: { x: 0, y: 1.5, z: 0 } }
      }
    })
    useAppStore.setState({ streetsGLIframeOverlay: true })

    const updateObject = vi.fn(async () => true)
    const addObject = vi.fn(async () => ({ success: true, queued: false }))
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => [{ id: objectId, visible: true }]),
      addObject,
      updateObject
    } as unknown as StreetsGLBridge

    const resynced = await resyncRegistryObjectsAfterBridgeReload(bridge)
    expect(resynced).toBe(1)
    expect(addObject).not.toHaveBeenCalled()
    // Heal always reasserts visible:true when wantVisible (not only when getObjects said false).
    expect(updateObject).toHaveBeenCalledWith(objectId, { visible: true })
    expect(mesh.userData.streetsGLPosition).toEqual(placementAnchor)
    useAppStore.setState({ streetsGLIframeOverlay: false })
  })
})
