/**
 * Phase 0 Streets GL integration hardening — race / regression tests.
 *
 * Root cause pattern: first add succeeds → second writer pushes visible:false from
 * polluted Three.js / descriptor flags → object flashes then vanishes.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { useAppStore } from '../src/store/useAppStore'
import {
  ensureStreetsGLIframeVisibilityChannel,
  getIframeVisible,
  setIframeVisible,
  syncProjectObjectTransformToStreetsGL
} from '../src/viewer/useViewer'
import type { StreetsGLBridge } from '../src/utils/streetsGLBridge'

describe('Phase 0: mesh-only iframe visibility + pose-only transform sync', () => {
  const objectId = 'phase0-car-1'

  beforeEach(() => {
    useAppStore.setState({
      projectObjects: [],
      streetsGLBridge: null,
      streetsGLGroundLat: 32.89917,
      streetsGLGroundLon: -97.03813,
      streetsGLIframeOverlay: true
    })
  })

  afterEach(() => {
    useAppStore.setState({
      projectObjects: [],
      streetsGLBridge: null,
      streetsGLIframeOverlay: false
    })
  })

  it('after add with visible:true, overlay hides Three.js root → transform sync must NOT send visible:false', () => {
    const mesh = new THREE.Object3D()
    mesh.name = 'ImportedCar'
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId
    mesh.userData.renderInStreetsGL = true
    mesh.userData.streetsGLAdded = true
    mesh.userData.streetsGLVisible = true
    mesh.userData.streetsGLPosition = { x: 3_880_000, y: 1.5, z: -10_800_000 }
    mesh.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    mesh.position.set(0, 1.5, 0)

    // Simulate successful add + ViewerCanvas overlay hide of Three.js root.
    mesh.visible = false
    setIframeVisible(mesh, true, { projectId: objectId, persistRegistry: true, pushToBridge: false })

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'ImportedCar',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
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

    // Pollute registry the way older transform sync used to (Three.js hide → descriptor).
    useAppStore.getState().updateProjectObject(objectId, {
      visible: false,
      userData: {
        streetsGLAdded: true,
        renderInStreetsGL: true,
        streetsGLVisible: false,
        streetsGLPosition: { x: 3_880_000, y: 1.5, z: -10_800_000 },
        streetsGLBaseTransform: { position: { x: 0, y: 1.5, z: 0 } }
      }
    })
    // Mesh channel stays open (authoritative).
    mesh.userData.streetsGLVisible = true

    const updateObject = vi.fn(async () => true)
    const bridge = { isReady: true, updateObject } as unknown as StreetsGLBridge
    useAppStore.setState({ streetsGLBridge: bridge })

    mesh.position.set(2, 1.5, -1)
    syncProjectObjectTransformToStreetsGL(mesh)

    expect(updateObject).toHaveBeenCalled()
    const firstCall = updateObject.mock.calls[0] as unknown as [string, Record<string, unknown>]
    const payload = firstCall[1]
    expect(payload).toHaveProperty('position')
    expect(payload).toHaveProperty('rotation')
    expect(payload).toHaveProperty('scale')
    expect(payload).not.toHaveProperty('visible')
    expect(getIframeVisible(mesh)).toBe(true)
  })

  it('descriptor-only streetsGLVisible=false pollution must not override mesh channel open', () => {
    const mesh = new THREE.Object3D()
    mesh.visible = false
    mesh.userData.renderInStreetsGL = true
    mesh.userData.streetsGLVisible = true
    mesh.userData.streetsGLAdded = true

    const descriptor = {
      id: 'polluted-1',
      name: 'Car',
      kind: 'imported' as const,
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      visible: false,
      userData: {
        renderInStreetsGL: true,
        streetsGLVisible: false,
        streetsGLAdded: true
      }
    }

    expect(getIframeVisible(mesh, descriptor)).toBe(true)
    ensureStreetsGLIframeVisibilityChannel(mesh, descriptor)
    expect(mesh.userData.streetsGLVisible).toBe(true)
    expect(getIframeVisible(mesh, descriptor)).toBe(true)
  })

  it('setIframeVisible persists channel on mesh AND registry', () => {
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = objectId
    mesh.userData.renderInStreetsGL = true

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'Car',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: { renderInStreetsGL: true, streetsGLVisible: true }
    })

    setIframeVisible(mesh, false, {
      projectId: objectId,
      persistRegistry: true,
      pushToBridge: false
    })

    expect(mesh.userData.streetsGLVisible).toBe(false)
    expect(useAppStore.getState().projectObjects[0]?.userData?.streetsGLVisible).toBe(false)
    expect(useAppStore.getState().projectObjects[0]?.visible).toBe(false)
    expect(getIframeVisible(mesh)).toBe(false)

    setIframeVisible(mesh, true, {
      projectId: objectId,
      persistRegistry: true,
      pushToBridge: false
    })
    expect(mesh.userData.streetsGLVisible).toBe(true)
    expect(useAppStore.getState().projectObjects[0]?.userData?.streetsGLVisible).toBe(true)
  })

  it('setIframeVisible with pushToBridge sends visible only when explicitly dirty', async () => {
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'Car',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: {}
    })

    const updateObject = vi.fn(async () => true)
    const bridge = { isReady: true, updateObject } as unknown as StreetsGLBridge

    setIframeVisible(mesh, false, {
      projectId: objectId,
      persistRegistry: true,
      pushToBridge: true,
      bridge
    })

    expect(updateObject).toHaveBeenCalledWith(objectId, { visible: false })
  })

  it('flash-then-gone scenario: polluted descriptor cannot make transform sync hide iframe object', () => {
    // Sequence: add visible → overlay hides Three.js → polluted descriptor → gizmo move.
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId
    mesh.userData.streetsGLAdded = true
    mesh.userData.streetsGLPosition = { x: 1000, y: 1.5, z: 2000 }
    mesh.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    mesh.position.set(0, 1.5, 0)

    // First paint: channel open.
    setIframeVisible(mesh, true, { projectId: objectId, persistRegistry: false })
    mesh.visible = false // overlay hide

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'FlashCar',
      kind: 'imported',
      visible: false, // polluted
      streetsGLObjectId: objectId,
      transform: {
        position: { x: 0, y: 1.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      userData: {
        streetsGLAdded: true,
        renderInStreetsGL: true,
        streetsGLVisible: false, // polluted
        streetsGLPosition: { x: 1000, y: 1.5, z: 2000 },
        streetsGLBaseTransform: { position: { x: 0, y: 1.5, z: 0 } }
      }
    })

    const updateObject = vi.fn(async () => true)
    useAppStore.setState({
      streetsGLBridge: { isReady: true, updateObject } as unknown as StreetsGLBridge
    })

    expect(getIframeVisible(mesh, useAppStore.getState().projectObjects[0])).toBe(true)

    mesh.position.set(5, 1.5, 0)
    syncProjectObjectTransformToStreetsGL(mesh)

    const payloads = updateObject.mock.calls.map(
      (c) => (c as unknown as [string, Record<string, unknown>])[1]
    )
    expect(payloads.length).toBeGreaterThan(0)
    for (const p of payloads) {
      expect(p).not.toHaveProperty('visible')
    }
    // Registry must not be rewritten to streetsGLVisible=false by transform sync.
    const desc = useAppStore.getState().projectObjects[0]
    // Pose updated; channel on mesh still open.
    expect(mesh.userData.streetsGLVisible).toBe(true)
    expect(desc?.transform.position.x).toBe(5)
  })

  it('anchor preservation: streetsGLPosition not rewritten from GPS on transform sync', () => {
    const anchor = { x: 3_880_000, y: 1.5, z: -10_800_000 }
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = objectId
    mesh.userData.streetsGLObjectId = objectId
    mesh.userData.streetsGLAdded = true
    mesh.userData.renderInStreetsGL = true
    mesh.userData.streetsGLVisible = true
    mesh.userData.streetsGLPosition = { ...anchor }
    mesh.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    mesh.position.set(10, 1.5, -5)

    useAppStore.getState().addProjectObject({
      id: objectId,
      name: 'Anchored',
      kind: 'imported',
      visible: true,
      streetsGLObjectId: objectId,
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
        streetsGLPosition: { ...anchor },
        streetsGLBaseTransform: { position: { x: 0, y: 1.5, z: 0 } }
      }
    })

    const updateObject = vi.fn(async () => true)
    useAppStore.setState({
      streetsGLBridge: { isReady: true, updateObject } as unknown as StreetsGLBridge
    })

    syncProjectObjectTransformToStreetsGL(mesh)

    expect(mesh.userData.streetsGLPosition).toEqual(anchor)
    expect(useAppStore.getState().projectObjects[0]?.userData?.streetsGLPosition).toEqual(anchor)
  })
})
