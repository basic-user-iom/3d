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

  it('skips objects already present in the iframe', async () => {
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
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => [{ id: objectId }]),
      addObject
    } as unknown as StreetsGLBridge

    const resynced = await resyncRegistryObjectsAfterBridgeReload(bridge)
    expect(resynced).toBe(0)
    expect(addObject).not.toHaveBeenCalled()
  })
})
