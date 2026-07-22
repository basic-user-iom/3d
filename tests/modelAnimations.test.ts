import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  attachModelAnimations,
  detachAnimationMixersInSubtree,
  disposeAllAnimationMixers,
  disposeAnimationMixersInSubtree,
  disposeModelAnimationMixer,
  reattachAnimationMixersInSubtree,
  updateAnimationMixers,
  type AnimationHost
} from '../src/viewer/utils/modelAnimations'
import { disposeObject3DSubtree } from '../src/viewer/utils/disposeObject3D'

function makeAnimatedModel(name = 'Animated') {
  const bone = new THREE.Bone()
  bone.name = 'Bone'
  const scene = new THREE.Group()
  scene.name = name
  scene.userData.isModel = true
  scene.add(bone)

  const track = new THREE.VectorKeyframeTrack(
    'Bone.position',
    [0, 1],
    [0, 0, 0, 1, 0, 0]
  )
  const animations = [new THREE.AnimationClip('clip', 1, [track])]
  return { scene, animations }
}

describe('modelAnimations (LIFE-4)', () => {
  it('registers a mixer that updateAnimationMixers advances', () => {
    const viewer: AnimationHost = { animationMixers: [] }
    const model = makeAnimatedModel()
    attachModelAnimations(viewer, model)

    expect(viewer.animationMixers).toHaveLength(1)
    expect(model.scene.userData.animationMixer).toBe(viewer.animationMixers![0])

    const mixer = viewer.animationMixers![0]
    const spy = vi.spyOn(mixer, 'update')
    updateAnimationMixers(viewer, 1 / 60)
    expect(spy).toHaveBeenCalledWith(1 / 60)
  })

  it('disposeModelAnimationMixer stops, uncaches, and drops the mixer', () => {
    const viewer: AnimationHost = { animationMixers: [] }
    const model = makeAnimatedModel()
    attachModelAnimations(viewer, model)
    const mixer = viewer.animationMixers![0]
    const stopSpy = vi.spyOn(mixer, 'stopAllAction')
    const uncacheSpy = vi.spyOn(mixer, 'uncacheRoot')

    disposeModelAnimationMixer(viewer, model.scene)

    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(uncacheSpy).toHaveBeenCalledWith(model.scene)
    expect(viewer.animationMixers).toHaveLength(0)
    expect(model.scene.userData.animationMixer).toBeUndefined()
  })

  it('repeated attach/dispose cycles keep mixer count bounded', () => {
    const viewer: AnimationHost = { animationMixers: [] }

    for (let i = 0; i < 8; i++) {
      const model = makeAnimatedModel(`Model-${i}`)
      attachModelAnimations(viewer, model)
      expect(viewer.animationMixers).toHaveLength(1)
      disposeAnimationMixersInSubtree(viewer, model.scene)
      expect(viewer.animationMixers).toHaveLength(0)
    }
  })

  it('soft detach stops updates and reattach restores them', () => {
    const viewer: AnimationHost = { animationMixers: [] }
    const model = makeAnimatedModel()
    attachModelAnimations(viewer, model)
    const mixer = model.scene.userData.animationMixer as THREE.AnimationMixer

    detachAnimationMixersInSubtree(viewer, model.scene)
    expect(viewer.animationMixers).toHaveLength(0)
    expect(model.scene.userData.animationMixer).toBe(mixer)

    const updateSpy = vi.spyOn(mixer, 'update')
    updateAnimationMixers(viewer, 0.016)
    expect(updateSpy).not.toHaveBeenCalled()

    reattachAnimationMixersInSubtree(viewer, model.scene)
    expect(viewer.animationMixers).toHaveLength(1)
    updateAnimationMixers(viewer, 0.016)
    expect(updateSpy).toHaveBeenCalled()
  })

  it('disposeObject3DSubtree uncaches mixers even without an animation host', () => {
    const viewer: AnimationHost = { animationMixers: [] }
    const model = makeAnimatedModel()
    attachModelAnimations(viewer, model)
    const mixer = viewer.animationMixers![0]
    const uncacheSpy = vi.spyOn(mixer, 'uncacheRoot')

    disposeObject3DSubtree(model.scene)
    expect(uncacheSpy).toHaveBeenCalledWith(model.scene)
    expect(model.scene.userData.animationMixer).toBeUndefined()

    // Next update prunes the orphaned host entry.
    updateAnimationMixers(viewer, 0.016)
    expect(viewer.animationMixers).toHaveLength(0)
  })

  it('disposeAllAnimationMixers clears the host list', () => {
    const viewer: AnimationHost = { animationMixers: [] }
    attachModelAnimations(viewer, makeAnimatedModel('A'))
    attachModelAnimations(viewer, makeAnimatedModel('B'))
    expect(viewer.animationMixers).toHaveLength(2)

    disposeAllAnimationMixers(viewer)
    expect(viewer.animationMixers).toHaveLength(0)
  })
})
