/**
 * Phase 1: visibility audit + light iframe presence enum.
 *
 * Only setIframeVisible(..., { pushToBridge: true }) may RPC `{ visible }` to the bridge.
 * Heal/resync must go through that API; transform sync stays pose-only (Phase 0).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { useAppStore } from '../src/store/useAppStore'
import { cacheImportedModelScene, removeCachedImportedModelScene } from '../src/viewer/importedModelCache'
import {
  getIframePresence,
  resyncRegistryObjectsAfterBridgeReload,
  setIframePresence,
  setIframeVisible,
  syncProjectObjectTransformToStreetsGL
} from '../src/viewer/useViewer'
import type { StreetsGLBridge } from '../src/utils/streetsGLBridge'

describe('Phase 1: visibility audit + iframe presence', () => {
  const objectId = 'phase1-car-1'

  beforeEach(() => {
    useAppStore.setState({
      projectObjects: [],
      streetsGLBridge: null,
      streetsGLGroundLat: 32.89917,
      streetsGLGroundLon: -97.03813,
      streetsGLIframeOverlay: true
    })
    removeCachedImportedModelScene(objectId, false)
  })

  afterEach(() => {
    useAppStore.setState({
      projectObjects: [],
      streetsGLBridge: null,
      streetsGLIframeOverlay: false
    })
    removeCachedImportedModelScene(objectId, true)
  })

  it('setIframeVisible maps Present ↔ Hidden on the presence enum', () => {
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId
    setIframePresence(mesh, 'present', { projectId: objectId, persistRegistry: false })
    expect(getIframePresence(mesh)).toBe('present')

    setIframeVisible(mesh, false, { projectId: objectId, persistRegistry: false })
    expect(getIframePresence(mesh)).toBe('hidden')
    expect(mesh.userData.streetsGLVisible).toBe(false)

    setIframeVisible(mesh, true, { projectId: objectId, persistRegistry: false })
    expect(getIframePresence(mesh)).toBe('present')
    expect(mesh.userData.streetsGLVisible).toBe(true)
  })

  it('getIframePresence falls back from legacy streetsGLAdded / Pending flags', () => {
    const absent = new THREE.Object3D()
    expect(getIframePresence(absent)).toBe('absent')

    const pending = new THREE.Object3D()
    pending.userData.streetsGLPending = true
    expect(getIframePresence(pending)).toBe('pending')

    const present = new THREE.Object3D()
    present.userData.streetsGLAdded = true
    expect(getIframePresence(present)).toBe('present')

    const hidden = new THREE.Object3D()
    hidden.userData.streetsGLAdded = true
    hidden.userData.streetsGLVisible = false
    expect(getIframePresence(hidden)).toBe('hidden')
  })

  it('resync heal pushes visible only via setIframeVisible path (updateObject visible alone)', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    mesh.visible = false
    mesh.userData.renderInStreetsGL = true
    mesh.userData.streetsGLVisible = true
    cacheImportedModelScene(objectId, mesh)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'HealViaApi',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: { streetsGLAdded: true, renderInStreetsGL: true, streetsGLVisible: true }
    })

    const updateObject = vi.fn(async () => true)
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => [{ id: objectId, visible: false }]),
      addObject: vi.fn(async () => ({ success: true, queued: false })),
      updateObject
    } as unknown as StreetsGLBridge

    const n = await resyncRegistryObjectsAfterBridgeReload(bridge, 'bridge-ready')
    expect(n).toBe(1)
    expect(updateObject).toHaveBeenCalledTimes(1)
    expect(updateObject).toHaveBeenCalledWith(objectId, { visible: true })
    // Presence settled to present after heal.
    expect(getIframePresence(mesh)).toBe('present')
    expect(mesh.userData.streetsGLIframePresence).toBe('present')
  })

  it('user hide is respected on heal — does not force visible:true over Hidden', async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    mesh.visible = false
    mesh.userData.renderInStreetsGL = true
    setIframePresence(mesh, 'hidden', { projectId: objectId, persistRegistry: false })
    mesh.userData.streetsGLVisible = false
    cacheImportedModelScene(objectId, mesh)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'UserHidden',
      kind: 'imported',
      visible: false,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: {
        streetsGLAdded: true,
        renderInStreetsGL: true,
        streetsGLVisible: false,
        streetsGLIframePresence: 'hidden'
      }
    })

    const updateObject = vi.fn(async () => true)
    const bridge = {
      isReady: true,
      getObjects: vi.fn(async () => [{ id: objectId, visible: false }]),
      addObject: vi.fn(async () => ({ success: true, queued: false })),
      updateObject
    } as unknown as StreetsGLBridge

    const n = await resyncRegistryObjectsAfterBridgeReload(bridge, 'mode-enter')
    expect(n).toBe(0)
    expect(updateObject).not.toHaveBeenCalled()
    expect(getIframePresence(mesh)).toBe('hidden')
  })

  it('transform sync remains pose-only (Phase 0 preserved)', () => {
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId
    mesh.userData.renderInStreetsGL = true
    mesh.userData.streetsGLAdded = true
    mesh.userData.streetsGLVisible = true
    mesh.userData.streetsGLPosition = { x: 3_880_000, y: 1.5, z: -10_800_000 }
    mesh.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    mesh.visible = false
    mesh.position.set(1, 1.5, -1)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'PoseOnly',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 1, y: 1.5, z: -1 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: {
        streetsGLAdded: true,
        renderInStreetsGL: true,
        streetsGLVisible: true,
        streetsGLPosition: { x: 3_880_000, y: 1.5, z: -10_800_000 },
        streetsGLBaseTransform: { position: { x: 0, y: 1.5, z: 0 } }
      }
    })

    const updateObject = vi.fn(async () => true)
    useAppStore.setState({
      streetsGLBridge: { isReady: true, updateObject } as unknown as StreetsGLBridge
    })

    syncProjectObjectTransformToStreetsGL(mesh)
    expect(updateObject).toHaveBeenCalled()
    const firstCall = updateObject.mock.calls[0] as unknown as [string, Record<string, unknown>]
    const payload = firstCall[1]
    expect(payload).not.toHaveProperty('visible')
    expect(payload).toHaveProperty('position')
  })

  it('setIframeVisible with pushToBridge is the only direct visible writer API', async () => {
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId
    setIframePresence(mesh, 'present', { projectId: objectId, persistRegistry: false })

    const updateObject = vi.fn(async () => true)
    const bridge = { isReady: true, updateObject } as unknown as StreetsGLBridge

    setIframeVisible(mesh, false, {
      projectId: objectId,
      persistRegistry: false,
      pushToBridge: true,
      bridge,
      streetsGLId: objectId
    })
    expect(updateObject).toHaveBeenCalledWith(objectId, { visible: false })
    expect(getIframePresence(mesh)).toBe('hidden')
  })
})
