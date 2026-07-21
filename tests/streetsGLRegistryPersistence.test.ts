/**
 * Phase 2: Streets GL registry ↔ project-file persistence round-trip.
 */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { ProjectObject } from '../src/store/useAppStore'
import {
  applyStreetsGLRegistryToScene,
  extractStreetsGLFieldsFromMesh,
  normalizeProjectObjectsForLoad,
  pickStreetsGLRegistryUserData,
  rebuildProjectObjectsFromSceneForLegacyLoad,
  serializeProjectObjectsForSave
} from '../src/viewer/streetsGLRegistryPersistence'

function makeDescriptor(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'car-1',
    name: 'Car',
    kind: 'imported',
    transform: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0.5, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    gps: { lat: 32.89917, lon: -97.03813 },
    visible: true,
    streetsGLObjectId: 'car-1',
    threeObjectId: 999,
    userData: {
      fileName: 'car.glb',
      renderInStreetsGL: true,
      streetsGLVisible: true,
      streetsGLIframePresence: 'present',
      streetsGLAdded: true,
      streetsGLPending: false,
      streetsGLPosition: { x: 1000.5, y: 1.5, z: -2000.25 },
      streetsGLBaseTransform: {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0.5, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      },
      streetsGLPlacementWorldPosition: { x: 1, y: 2, z: 3 },
      streetsGLSyncing: true // transient — must not persist
    },
    ...overrides
  }
}

describe('Phase 2: streetsGL registry project persistence', () => {
  it('serializeProjectObjectsForSave keeps anchors + channel and drops session fields', () => {
    const saved = serializeProjectObjectsForSave([makeDescriptor()])
    expect(saved).toHaveLength(1)
    const obj = saved[0]
    expect(obj.id).toBe('car-1')
    expect(obj.streetsGLObjectId).toBe('car-1')
    expect(obj.threeObjectId).toBeUndefined()
    expect(obj.userData?.streetsGLPosition).toEqual({ x: 1000.5, y: 1.5, z: -2000.25 })
    expect(obj.userData?.streetsGLVisible).toBe(true)
    expect(obj.userData?.streetsGLIframePresence).toBe('present')
    expect(obj.userData?.renderInStreetsGL).toBe(true)
    expect(obj.userData?.fileName).toBe('car.glb')
    expect(obj.userData?.streetsGLSyncing).toBeUndefined()
    expect(obj.gps).toEqual({ lat: 32.89917, lon: -97.03813 })
  })

  it('normalizeProjectObjectsForLoad restores anchors/channel and resets presence to absent', () => {
    const saved = serializeProjectObjectsForSave([
      makeDescriptor({
        userData: {
          fileName: 'car.glb',
          renderInStreetsGL: true,
          streetsGLVisible: false,
          streetsGLIframePresence: 'hidden',
          streetsGLAdded: true,
          streetsGLPosition: { x: 10, y: 1.5, z: 20 }
        },
        visible: false
      })
    ])

    const loaded = normalizeProjectObjectsForLoad(saved)
    expect(loaded).toHaveLength(1)
    const obj = loaded[0]
    expect(obj.userData?.streetsGLPosition).toEqual({ x: 10, y: 1.5, z: 20 })
    expect(obj.userData?.streetsGLVisible).toBe(false)
    expect(obj.visible).toBe(false)
    expect(obj.userData?.renderInStreetsGL).toBe(true)
    // Iframe empty after reopen — ResyncCoordinator will re-add
    expect(obj.userData?.streetsGLIframePresence).toBe('absent')
    expect(obj.userData?.streetsGLAdded).toBe(false)
    expect(obj.userData?.streetsGLPending).toBe(false)
  })

  it('round-trip preserves Mercator anchor and does not invent from GPS', () => {
    const anchor = { x: 555.1, y: 2.0, z: -777.2 }
    const saved = serializeProjectObjectsForSave([
      makeDescriptor({
        gps: { lat: 40.7, lon: -74.0 },
        userData: {
          fileName: 'car.glb',
          renderInStreetsGL: true,
          streetsGLVisible: true,
          streetsGLIframePresence: 'present',
          streetsGLAdded: true,
          streetsGLPosition: anchor
        }
      })
    ])
    const loaded = normalizeProjectObjectsForLoad(saved)
    expect(loaded[0].userData?.streetsGLPosition).toEqual(anchor)
    expect(loaded[0].gps).toEqual({ lat: 40.7, lon: -74.0 })
  })

  it('ignores polluted descriptor-only hide when serializing mesh channel fields', () => {
    const mesh = new THREE.Object3D()
    mesh.userData.projectObjectId = 'car-1'
    mesh.userData.streetsGLObjectId = 'car-1'
    mesh.userData.renderInStreetsGL = true
    mesh.userData.streetsGLVisible = true
    mesh.userData.streetsGLPosition = { x: 1, y: 2, z: 3 }
    mesh.visible = false // Three.js product-hide — not the channel

    const fields = extractStreetsGLFieldsFromMesh(mesh)
    expect(fields.streetsGLVisible).toBe(true)
    expect(fields.streetsGLPosition).toEqual({ x: 1, y: 2, z: 3 })
    expect(fields.projectObjectId).toBe('car-1')
  })

  it('applyStreetsGLRegistryToScene stamps anchors + channel and keeps Three.js hidden', () => {
    const scene = new THREE.Scene()
    const root = new THREE.Object3D()
    root.name = 'Car'
    root.userData.isModel = true
    root.userData.isImportedModel = true
    root.userData.fileName = 'car.glb'
    root.visible = true
    scene.add(root)

    const descriptors = normalizeProjectObjectsForLoad(
      serializeProjectObjectsForSave([
        makeDescriptor({
          userData: {
            fileName: 'car.glb',
            renderInStreetsGL: true,
            streetsGLVisible: false,
            streetsGLIframePresence: 'hidden',
            streetsGLAdded: true,
            streetsGLPosition: { x: 42, y: 1.5, z: -9 }
          },
          visible: false
        })
      ])
    )

    const stamped = applyStreetsGLRegistryToScene(scene, descriptors)
    expect(stamped).toBe(1)
    expect(root.userData.projectObjectId).toBe('car-1')
    expect(root.userData.streetsGLPosition).toEqual({ x: 42, y: 1.5, z: -9 })
    expect(root.userData.streetsGLVisible).toBe(false)
    expect(root.userData.streetsGLIframePresence).toBe('absent')
    expect(root.userData.renderInStreetsGL).toBe(true)
    expect(root.visible).toBe(false)
  })

  it('pickStreetsGLRegistryUserData drops unknown / transient keys', () => {
    const picked = pickStreetsGLRegistryUserData({
      streetsGLPosition: { x: 1, y: 2, z: 3 },
      streetsGLSyncing: true,
      randomNoise: 'nope',
      streetsGLVisible: false
    })
    expect(picked).toEqual({
      streetsGLPosition: { x: 1, y: 2, z: 3 },
      streetsGLVisible: false
    })
  })

  it('normalize returns empty for corrupt / missing payloads', () => {
    expect(normalizeProjectObjectsForLoad(undefined)).toEqual([])
    expect(normalizeProjectObjectsForLoad(null)).toEqual([])
    expect(normalizeProjectObjectsForLoad([{ id: 'x' }])).toEqual([])
    expect(normalizeProjectObjectsForLoad('not-array')).toEqual([])
  })

  it('normalize ignores polluted descriptor.visible for iframe-owned objects', () => {
    const loaded = normalizeProjectObjectsForLoad([
      {
        id: 'car-1',
        name: 'Car',
        kind: 'imported',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        // Polluted: Three.js product-hide leaked into older registry saves
        visible: false,
        userData: {
          fileName: 'car.glb',
          renderInStreetsGL: true,
          streetsGLVisible: true,
          streetsGLPosition: { x: 10, y: 1.5, z: 20 }
        }
      }
    ])
    expect(loaded[0].visible).toBe(true)
    expect(loaded[0].userData?.streetsGLVisible).toBe(true)
    expect(loaded[0].userData?.streetsGLIframePresence).toBe('absent')
  })
})

describe('Phase 3: legacy / scene-only registry rebuild', () => {
  it('rebuilds from scene with channel open and presence absent despite Three.js hide', () => {
    const scene = new THREE.Scene()
    const root = new THREE.Object3D()
    root.name = 'Car'
    root.userData.isModel = true
    root.userData.isImportedModel = true
    root.userData.fileName = 'car.glb'
    root.userData.gpsLat = 32.9
    root.userData.gpsLon = -97.0
    // City product-hide — must NOT become iframe channel hide
    root.visible = false
    root.position.set(1, 2, 3)
    scene.add(root)

    const rebuilt = rebuildProjectObjectsFromSceneForLegacyLoad(scene, {
      streetsGLContext: true
    })
    expect(rebuilt).toHaveLength(1)
    const obj = rebuilt[0]
    expect(obj.kind).toBe('imported')
    expect(obj.userData?.fileName).toBe('car.glb')
    expect(obj.userData?.renderInStreetsGL).toBe(true)
    expect(obj.userData?.streetsGLVisible).toBe(true)
    expect(obj.visible).toBe(true)
    expect(obj.userData?.streetsGLIframePresence).toBe('absent')
    expect(obj.userData?.streetsGLAdded).toBe(false)
    expect(obj.gps).toEqual({ lat: 32.9, lon: -97.0 })
    // No invent of Mercator anchor when scene had none
    expect(obj.userData?.streetsGLPosition).toBeUndefined()
  })

  it('preserves scene Mercator anchor and explicit user hide', () => {
    const scene = new THREE.Scene()
    const root = new THREE.Object3D()
    root.name = 'Car'
    root.userData.isModel = true
    root.userData.isImportedModel = true
    root.userData.fileName = 'car.glb'
    root.userData.streetsGLPosition = { x: 100, y: 1.5, z: -200 }
    root.userData.streetsGLVisible = false
    root.userData.renderInStreetsGL = true
    root.visible = false
    scene.add(root)

    const rebuilt = rebuildProjectObjectsFromSceneForLegacyLoad(scene, {
      streetsGLContext: true
    })
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].userData?.streetsGLPosition).toEqual({ x: 100, y: 1.5, z: -200 })
    expect(rebuilt[0].userData?.streetsGLVisible).toBe(false)
    expect(rebuilt[0].visible).toBe(false)
    expect(rebuilt[0].userData?.streetsGLIframePresence).toBe('absent')
  })

  it('stamps rebuilt registry without inventing anchors from GPS', () => {
    const scene = new THREE.Scene()
    const root = new THREE.Object3D()
    root.name = 'Car'
    root.userData.isModel = true
    root.userData.isImportedModel = true
    root.userData.fileName = 'car.glb'
    root.userData.streetsGLPosition = { x: 42, y: 1.5, z: -9 }
    root.visible = false
    scene.add(root)

    const rebuilt = rebuildProjectObjectsFromSceneForLegacyLoad(scene, {
      streetsGLContext: true
    })
    const stamped = applyStreetsGLRegistryToScene(scene, rebuilt)
    expect(stamped).toBe(1)
    expect(root.userData.streetsGLVisible).toBe(true)
    expect(root.userData.streetsGLIframePresence).toBe('absent')
    expect(root.userData.streetsGLPosition).toEqual({ x: 42, y: 1.5, z: -9 })
    expect(root.userData.renderInStreetsGL).toBe(true)
    expect(root.visible).toBe(false)
  })

  it('product context without Streets fields keeps Three.js visibility', () => {
    const scene = new THREE.Scene()
    const root = new THREE.Object3D()
    root.name = 'Car'
    root.userData.isModel = true
    root.userData.isImportedModel = true
    root.userData.fileName = 'car.glb'
    root.visible = false
    scene.add(root)

    const rebuilt = rebuildProjectObjectsFromSceneForLegacyLoad(scene, {
      streetsGLContext: false
    })
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].visible).toBe(false)
    expect(rebuilt[0].userData?.renderInStreetsGL).toBeUndefined()
    expect(rebuilt[0].userData?.streetsGLVisible).toBeUndefined()
  })
})
