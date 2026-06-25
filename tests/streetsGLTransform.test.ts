import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  applyStreetsGLWorldToProxy,
  computeStreetsGLPositionFromObject,
  getStreetsGLRegistryRotationFromObject,
  getStreetsGLVisibleFromObject,
  getStreetsGLWorldRotationFromObject,
  syncManipulatorFromProxy,
  validateStreetsGLMercatorPosition
} from '../src/viewer/useViewer'

vi.mock('../src/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      streetsGLGroundLat: 32.89917,
      streetsGLGroundLon: -97.03813,
      projectObjects: []
    })
  }
}))

vi.mock('../src/utils/mapCoordinates', () => ({
  latLonToStreetsGL: (_lat: number, _lon: number, height: number) => ({
    x: 1000,
    y: height,
    z: 2000
  }),
  streetsGLToLatLon: () => ({ lat: 32.9, lon: -97.04 }),
  latLonToWorld: () => ({ x: 0, y: 0, z: 0 })
}))

describe('applyStreetsGLWorldToProxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('converts absolute world coords to local proxy coords when streetsGLPosition is missing', () => {
    const proxy = new THREE.Object3D()
    proxy.userData.projectObjectId = 'car-1'
    proxy.userData.gpsLat = 32.89917
    proxy.userData.gpsLon = -97.03813

    applyStreetsGLWorldToProxy(
      proxy,
      { x: 1010, y: 3.5, z: 2010 },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 }
    )

    expect(proxy.position.x).toBeCloseTo(10)
    expect(proxy.position.y).toBeCloseTo(2)
    expect(proxy.position.z).toBeCloseTo(10)
  })

  it('round-trips through syncManipulatorFromProxy when streetsGLPosition is set', () => {
    const proxy = new THREE.Object3D()
    proxy.userData.projectObjectId = 'car-2'
    proxy.userData.streetsGLPosition = { x: 500, y: 1.5, z: 600 }
    proxy.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    proxy.position.set(2, 1.5, -3)

    const manipulator = new THREE.Object3D()
    syncManipulatorFromProxy(proxy, manipulator)

    expect(manipulator.position.x).toBeCloseTo(502)
    expect(manipulator.position.y).toBeCloseTo(1.5)
    expect(manipulator.position.z).toBeCloseTo(597)
  })

  it('applies rotation and scale from city gizmo to proxy', () => {
    const proxy = new THREE.Object3D()
    proxy.userData.streetsGLPosition = { x: 1000, y: 1.5, z: 2000 }
    proxy.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }

    applyStreetsGLWorldToProxy(
      proxy,
      { x: 1000, y: 1.5, z: 2000 },
      { x: 0, y: Math.PI / 2, z: 0 },
      { x: 2, y: 2, z: 2 }
    )

    expect(proxy.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(proxy.scale.x).toBeCloseTo(2)
    expect(proxy.scale.y).toBeCloseTo(2)
    expect(proxy.scale.z).toBeCloseTo(2)
  })
})

describe('computeStreetsGLPositionFromObject (placementWorld pivot fix)', () => {
  it('tracks pivot translation via world delta while model local position is unchanged', () => {
    const model = new THREE.Object3D()
    model.userData.streetsGLPosition = { x: 5000, y: 10, z: 6000 }
    model.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    model.userData.streetsGLPlacementWorldPosition = { x: 0, y: 1.5, z: 0 }
    model.position.set(0, 1.5, 0)

    const pivot = new THREE.Group()
    pivot.userData.isPivotWrapper = true
    pivot.add(model)
    pivot.position.set(5, 0, -3)
    pivot.updateMatrixWorld(true)

    const before = computeStreetsGLPositionFromObject(model)
    expect(before.x).toBeCloseTo(5005)
    expect(before.z).toBeCloseTo(5997)

    pivot.position.set(15, 0, 7)
    pivot.updateMatrixWorld(true)

    const after = computeStreetsGLPositionFromObject(model)
    expect(after.x).toBeCloseTo(5015)
    expect(after.z).toBeCloseTo(6007)
    expect(after.x - before.x).toBeCloseTo(10)
    expect(after.z - before.z).toBeCloseTo(10)
  })

  it('city gizmo round-trip preserves mercator coordinates on all axes', () => {
    const proxy = new THREE.Object3D()
    proxy.userData.streetsGLPosition = { x: 5000, y: 10, z: 6000 }
    proxy.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    proxy.userData.streetsGLPlacementWorldPosition = { x: 0, y: 1.5, z: 0 }
    proxy.position.set(0, 1.5, 0)

    const manipulator = new THREE.Object3D()
    syncManipulatorFromProxy(proxy, manipulator)
    expect(manipulator.position.x).toBeCloseTo(5000)
    expect(manipulator.position.y).toBeCloseTo(10)
    expect(manipulator.position.z).toBeCloseTo(6000)

    manipulator.position.set(5010, 12, 6010)
    applyStreetsGLWorldToProxy(proxy, { x: 5010, y: 12, z: 6010 })
    const synced = computeStreetsGLPositionFromObject(proxy)
    expect(synced.x).toBeCloseTo(5010)
    expect(synced.y).toBeCloseTo(12)
    expect(synced.z).toBeCloseTo(6010)
  })
})

describe('getStreetsGLWorldRotationFromObject (pivot-wrapper rotate fix)', () => {
  it('includes pivot Y rotation in world euler sent to Streets GL', () => {
    const model = new THREE.Object3D()
    model.userData.streetsGLObjectId = 'obj-rotate'

    const pivot = new THREE.Group()
    pivot.userData.isPivotWrapper = true
    pivot.add(model)
    pivot.rotation.y = Math.PI / 4
    pivot.updateMatrixWorld(true)

    const worldRot = getStreetsGLWorldRotationFromObject(model)
    expect(worldRot.y).toBeCloseTo(Math.PI / 4)
    expect(model.rotation.y).toBeCloseTo(0)
  })

  it('registry rotation decomposes pivot rotation into model-local space', () => {
    const scene = new THREE.Scene()
    const model = new THREE.Object3D()
    model.userData.streetsGLObjectId = 'obj-rotate-2'

    const pivot = new THREE.Group()
    pivot.userData.isPivotWrapper = true
    pivot.add(model)
    scene.add(pivot)
    pivot.rotation.y = Math.PI / 2
    pivot.updateMatrixWorld(true)

    const registryRot = getStreetsGLRegistryRotationFromObject(model)
    expect(registryRot.y).toBeCloseTo(Math.PI / 2)
  })

  it('pivot translate + rotate preserves mercator position and world rotation', () => {
    const model = new THREE.Object3D()
    model.userData.streetsGLPosition = { x: 5000, y: 10, z: 6000 }
    model.userData.streetsGLPlacementWorldPosition = { x: 0, y: 1.5, z: 0 }
    model.position.set(0, 1.5, 0)

    const pivot = new THREE.Group()
    pivot.userData.isPivotWrapper = true
    pivot.add(model)
    pivot.position.set(8, 2, -4)
    pivot.rotation.y = Math.PI / 6
    pivot.updateMatrixWorld(true)

    const pos = computeStreetsGLPositionFromObject(model)
    expect(pos.x).toBeCloseTo(5008)
    expect(pos.y).toBeCloseTo(12)
    expect(pos.z).toBeCloseTo(5996)

    const rot = getStreetsGLWorldRotationFromObject(model)
    expect(rot.y).toBeCloseTo(Math.PI / 6)
  })
})

describe('getStreetsGLVisibleFromObject (hybrid import visibility)', () => {
  it('keeps Streets GL visible when Three.js root is hidden for iframe rendering', () => {
    const model = new THREE.Object3D()
    model.visible = false
    model.userData.renderInStreetsGL = true

    expect(getStreetsGLVisibleFromObject(model)).toBe(true)
  })

  it('respects explicit streetsGLVisible=false on renderInStreetsGL objects', () => {
    const model = new THREE.Object3D()
    model.visible = false
    model.userData.renderInStreetsGL = true
    model.userData.streetsGLVisible = false

    expect(getStreetsGLVisibleFromObject(model)).toBe(false)
  })

  it('uses Three.js visible flag for non-iframe objects', () => {
    const model = new THREE.Object3D()
    model.visible = false

    expect(getStreetsGLVisibleFromObject(model)).toBe(false)
  })
})

describe('validateStreetsGLMercatorPosition (disappearance guards)', () => {
  it('rejects NaN coordinates', () => {
    expect(
      validateStreetsGLMercatorPosition({ x: NaN, y: 1.5, z: 2000 })
    ).toBeNull()
  })

  it('rejects off-map Mercator coordinates', () => {
    expect(
      validateStreetsGLMercatorPosition({ x: 99_000_000, y: 1.5, z: 2000 })
    ).toBeNull()
  })

  it('accepts valid in-map coordinates', () => {
    const pos = validateStreetsGLMercatorPosition({ x: -9_700_000, y: 12, z: 4_200_000 })
    expect(pos).toEqual({ x: -9_700_000, y: 12, z: 4_200_000 })
  })
})

describe('applyStreetsGLWorldToProxy with placementWorld anchor', () => {
  it('inverts placementWorld delta when applying city gizmo world position', () => {
    const proxy = new THREE.Object3D()
    proxy.userData.streetsGLPosition = { x: 5000, y: 10, z: 6000 }
    proxy.userData.streetsGLBaseTransform = { position: { x: 0, y: 1.5, z: 0 } }
    proxy.userData.streetsGLPlacementWorldPosition = { x: 0, y: 1.5, z: 0 }
    proxy.position.set(0, 1.5, 0)

    applyStreetsGLWorldToProxy(proxy, { x: 5010, y: 12, z: 6010 })
    const synced = computeStreetsGLPositionFromObject(proxy)
    expect(synced.x).toBeCloseTo(5010)
    expect(synced.y).toBeCloseTo(12)
    expect(synced.z).toBeCloseTo(6010)
  })
})
