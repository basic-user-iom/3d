import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyFrozenOrientation,
  applyHotspotFrozenOrientation,
  computeBillboardQuaternion,
  frozenToQuaternion,
  quaternionToFrozen,
  resolveSharedFrozenRotation
} from '../src/utils/hotspotLabel'

describe('hotspot billboard frozen rotation', () => {
  it('computeBillboardQuaternion faces the camera from object position', () => {
    const position = new THREE.Vector3(0, 2, 0)
    const cameraPosition = new THREE.Vector3(5, 2, 0)
    const quaternion = computeBillboardQuaternion(position, cameraPosition)

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
    mesh.position.copy(position)
    mesh.quaternion.copy(quaternion)
    mesh.updateMatrixWorld(true)

    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion).normalize()
    const toCamera = cameraPosition.clone().sub(position).normalize()
    expect(normal.dot(toCamera)).toBeCloseTo(1, 5)
  })

  it('round-trips quaternion through frozen storage', () => {
    const source = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.5, -0.2))
    const frozen = quaternionToFrozen(source)
    const restored = frozenToQuaternion(frozen)
    expect(restored.x).toBeCloseTo(source.x, 6)
    expect(restored.y).toBeCloseTo(source.y, 6)
    expect(restored.z).toBeCloseTo(source.z, 6)
    expect(restored.w).toBeCloseTo(source.w, 6)
  })

  it('applyFrozenOrientation uses the same quaternion for label and panel', () => {
    const cameraPosition = new THREE.Vector3(3, 4, 5)
    const labelPos = new THREE.Vector3(0, 2, 0)
    const panelPos = new THREE.Vector3(0, 0.8, 0)
    const frozen = quaternionToFrozen(computeBillboardQuaternion(labelPos, cameraPosition))

    const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
    label.position.copy(labelPos)
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
    panel.position.copy(panelPos)

    applyFrozenOrientation(label, frozen, labelPos, cameraPosition)
    applyFrozenOrientation(panel, frozen, panelPos, cameraPosition)

    expect(label.quaternion.x).toBeCloseTo(panel.quaternion.x, 6)
    expect(label.quaternion.y).toBeCloseTo(panel.quaternion.y, 6)
    expect(label.quaternion.z).toBeCloseTo(panel.quaternion.z, 6)
    expect(label.quaternion.w).toBeCloseTo(panel.quaternion.w, 6)
  })

  it('resolveSharedFrozenRotation clears freeze when billboard is on', () => {
    const frozen = resolveSharedFrozenRotation(
      true,
      { x: 0, y: 0, z: 0, w: 1 },
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(5, 1, 0)
    )
    expect(frozen).toBeUndefined()
  })

  it('resolveSharedFrozenRotation captures from shared anchor when missing', () => {
    const anchor = new THREE.Vector3(0, 2, 0)
    const camera = new THREE.Vector3(4, 2, 0)
    const frozen = resolveSharedFrozenRotation(false, undefined, anchor, camera)
    expect(frozen).toBeDefined()
    const expected = quaternionToFrozen(computeBillboardQuaternion(anchor, camera))
    expect(frozen!.x).toBeCloseTo(expected.x, 6)
    expect(frozen!.y).toBeCloseTo(expected.y, 6)
    expect(frozen!.z).toBeCloseTo(expected.z, 6)
    expect(frozen!.w).toBeCloseTo(expected.w, 6)
  })

  it('applyHotspotFrozenOrientation keeps label and panel synced when frozen is missing', () => {
    const cameraPosition = new THREE.Vector3(3, 4, 5)
    const labelPos = new THREE.Vector3(0, 2, 0)
    const panelPos = new THREE.Vector3(0, 0.8, 0)

    const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
    label.position.copy(labelPos)
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1))
    panel.position.copy(panelPos)

    // Without shared helper, independent lookAt would diverge — this must stay synced
    applyHotspotFrozenOrientation(label, panel, undefined, labelPos, panelPos, cameraPosition)

    expect(label.quaternion.x).toBeCloseTo(panel.quaternion.x, 6)
    expect(label.quaternion.y).toBeCloseTo(panel.quaternion.y, 6)
    expect(label.quaternion.z).toBeCloseTo(panel.quaternion.z, 6)
    expect(label.quaternion.w).toBeCloseTo(panel.quaternion.w, 6)

    const shared = computeBillboardQuaternion(labelPos, cameraPosition)
    expect(label.quaternion.x).toBeCloseTo(shared.x, 6)
    expect(label.quaternion.y).toBeCloseTo(shared.y, 6)
    expect(label.quaternion.z).toBeCloseTo(shared.z, 6)
    expect(label.quaternion.w).toBeCloseTo(shared.w, 6)
  })
})
