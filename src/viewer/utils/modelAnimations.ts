/**
 * Start glTF/IFC animation clips on a loaded model and register mixers on the viewer.
 */
import * as THREE from 'three'

export interface AnimationHost {
  animationMixers?: THREE.AnimationMixer[]
}

export interface AnimatableModel {
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
}

export function attachModelAnimations(viewer: AnimationHost, model: AnimatableModel): void {
  if (!model.animations?.length) return

  const mixer = new THREE.AnimationMixer(model.scene)
  for (const clip of model.animations) {
    mixer.clipAction(clip).play()
  }

  if (!viewer.animationMixers) {
    viewer.animationMixers = []
  }
  viewer.animationMixers.push(mixer)
  model.scene.userData.animationMixer = mixer
}

export function updateAnimationMixers(viewer: AnimationHost, deltaTime: number): void {
  if (!viewer.animationMixers?.length) return
  for (const mixer of viewer.animationMixers) {
    mixer.update(deltaTime)
  }
}

export function disposeModelAnimationMixer(viewer: AnimationHost, root: THREE.Object3D): void {
  const mixer = root.userData.animationMixer as THREE.AnimationMixer | undefined
  if (!mixer || !viewer.animationMixers) return

  mixer.stopAllAction()
  const index = viewer.animationMixers.indexOf(mixer)
  if (index !== -1) {
    viewer.animationMixers.splice(index, 1)
  }
  delete root.userData.animationMixer
}
