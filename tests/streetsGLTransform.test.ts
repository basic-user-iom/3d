import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { applyStreetsGLWorldToProxy, syncManipulatorFromProxy } from '../src/viewer/useViewer'

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
})
