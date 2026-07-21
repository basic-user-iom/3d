import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { descriptorFromImportedModel } from '../src/viewer/objectRegistry'

describe('descriptorFromImportedModel (city/hybrid hide)', () => {
  it('does not copy Three.js visible=false into registry when renderInStreetsGL', () => {
    const scene = new THREE.Object3D()
    scene.name = 'Tower'
    scene.visible = false
    scene.userData.renderInStreetsGL = true
    scene.userData.streetsGLObjectId = 'obj-1'

    const descriptor = descriptorFromImportedModel(scene, {
      id: 'obj-1',
      fileName: 'tower.glb'
    })

    expect(descriptor.visible).toBe(true)
    expect(descriptor.userData?.renderInStreetsGL).toBe(true)
  })

  it('preserves visible=false for normal (non-iframe) imports', () => {
    const scene = new THREE.Object3D()
    scene.visible = false

    const descriptor = descriptorFromImportedModel(scene, {
      id: 'obj-2',
      fileName: 'hidden.glb'
    })

    expect(descriptor.visible).toBe(false)
    expect(descriptor.userData?.renderInStreetsGL).toBeUndefined()
  })

  it('preferIframeChannelDefaults ignores Three.js product-hide', () => {
    const scene = new THREE.Object3D()
    scene.name = 'Car'
    scene.visible = false
    scene.userData.isModel = true

    const descriptor = descriptorFromImportedModel(scene, {
      id: 'obj-3',
      fileName: 'car.glb',
      preferIframeChannelDefaults: true
    })

    expect(descriptor.visible).toBe(true)
    expect(descriptor.userData?.renderInStreetsGL).toBe(true)
    expect(descriptor.userData?.streetsGLVisible).toBe(true)
    expect(descriptor.userData?.streetsGLIframePresence).toBe('absent')
  })
})
