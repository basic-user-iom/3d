import * as THREE from 'three'
import type { ViewerInstance } from '../ViewerCanvas'
import { WGS84_ELLIPSOID } from '3d-tiles-renderer'

const _position = new THREE.Vector3()
const _east = new THREE.Vector3()
const _north = new THREE.Vector3()
const _up = new THREE.Vector3()
const _offset = new THREE.Vector3()

export function focusViewerOnCartographic(
  viewer: ViewerInstance,
  longitudeDeg: number,
  latitudeDeg: number,
  heightMeters = 1500
): void {
  const latRad = THREE.MathUtils.degToRad(latitudeDeg)
  const lonRad = THREE.MathUtils.degToRad(longitudeDeg)

  WGS84_ELLIPSOID.getCartographicToPosition(latRad, lonRad, heightMeters, _position)
  WGS84_ELLIPSOID.getEastNorthUpAxes(latRad, lonRad, _east, _north, _up, _position)

  const distance = Math.max(1000, heightMeters * 2)
  _offset
    .copy(_up)
    .multiplyScalar(distance * 0.8)
    .addScaledVector(_north, distance * 0.4)

  viewer.controls.target.copy(_position)
  viewer.camera.position.copy(_position).add(_offset)

  viewer.camera.near = 0.1
  viewer.camera.far = Math.max(1e7, viewer.camera.position.length() * 4)
  viewer.camera.updateProjectionMatrix()
  viewer.controls.update()
}
