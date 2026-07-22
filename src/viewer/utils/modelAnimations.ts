/**
 * Start glTF/IFC animation clips on a loaded model and register mixers on the viewer.
 * LIFE-4: mixers must be detached/disposed when animated subtrees leave the scene.
 */
import * as THREE from 'three'

export interface AnimationHost {
  animationMixers?: THREE.AnimationMixer[]
}

export interface AnimatableModel {
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
}

function collectAnimationMixerRoots(root: THREE.Object3D): THREE.Object3D[] {
  const hosts: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj.userData?.animationMixer) {
      hosts.push(obj)
    }
  })
  return hosts
}

function removeMixerFromHost(viewer: AnimationHost | null | undefined, mixer: THREE.AnimationMixer): void {
  if (!viewer?.animationMixers?.length) return
  const index = viewer.animationMixers.indexOf(mixer)
  if (index !== -1) {
    viewer.animationMixers.splice(index, 1)
  }
}

function safeUncacheRoot(mixer: THREE.AnimationMixer, root: THREE.Object3D): void {
  try {
    mixer.uncacheRoot(root)
  } catch {
    // Ignore uncache errors (mixer/root may already be torn down)
  }
}

export function attachModelAnimations(viewer: AnimationHost, model: AnimatableModel): void {
  if (!model.animations?.length) return

  // Replace any prior mixer on this root so repeated attach stays bounded.
  disposeModelAnimationMixer(viewer, model.scene)

  const mixer = new THREE.AnimationMixer(model.scene)
  for (const clip of model.animations) {
    mixer.clipAction(clip).play()
  }

  if (!viewer.animationMixers) {
    viewer.animationMixers = []
  }
  viewer.animationMixers.push(mixer)
  model.scene.userData.animationMixer = mixer
  model.scene.userData.animationClips = model.animations
}

export function updateAnimationMixers(viewer: AnimationHost, deltaTime: number): void {
  if (!viewer.animationMixers?.length) return

  const alive: THREE.AnimationMixer[] = []
  for (const mixer of viewer.animationMixers) {
    const root = mixer.getRoot() as THREE.Object3D | undefined
    if (!root || root.userData?.animationMixer !== mixer) {
      // Orphaned after hard dispose without a viewer reference.
      mixer.stopAllAction()
      if (root) safeUncacheRoot(mixer, root)
      continue
    }
    mixer.update(deltaTime)
    alive.push(mixer)
  }
  viewer.animationMixers = alive
}

/**
 * Fully release a mixer for a root: stop actions, uncacheRoot, drop from the host list.
 */
export function disposeModelAnimationMixer(viewer: AnimationHost | null | undefined, root: THREE.Object3D): void {
  const mixer = root.userData.animationMixer as THREE.AnimationMixer | undefined
  if (!mixer) return

  mixer.stopAllAction()
  safeUncacheRoot(mixer, root)
  removeMixerFromHost(viewer, mixer)
  delete root.userData.animationMixer
}

/** Dispose every mixer found on a subtree (hard removal / GPU teardown). */
export function disposeAnimationMixersInSubtree(
  viewer: AnimationHost | null | undefined,
  root: THREE.Object3D
): void {
  for (const host of collectAnimationMixerRoots(root)) {
    disposeModelAnimationMixer(viewer, host)
  }
}

/** Dispose every mixer registered on the viewer (canvas / project teardown). */
export function disposeAllAnimationMixers(viewer: AnimationHost): void {
  const mixers = viewer.animationMixers ? [...viewer.animationMixers] : []
  for (const mixer of mixers) {
    const root = mixer.getRoot() as THREE.Object3D | undefined
    mixer.stopAllAction()
    if (root) {
      safeUncacheRoot(mixer, root)
      if (root.userData?.animationMixer === mixer) {
        delete root.userData.animationMixer
      }
    }
  }
  viewer.animationMixers = []
}

/**
 * Soft-delete: stop updating without destroying the mixer so undo can reattach.
 */
export function detachAnimationMixersInSubtree(
  viewer: AnimationHost | null | undefined,
  root: THREE.Object3D
): void {
  for (const host of collectAnimationMixerRoots(root)) {
    const mixer = host.userData.animationMixer as THREE.AnimationMixer | undefined
    if (!mixer) continue
    mixer.stopAllAction()
    removeMixerFromHost(viewer, mixer)
  }
}

/** Re-register mixers after soft-delete undo. */
export function reattachAnimationMixersInSubtree(
  viewer: AnimationHost | null | undefined,
  root: THREE.Object3D
): void {
  if (!viewer) return
  if (!viewer.animationMixers) {
    viewer.animationMixers = []
  }

  for (const host of collectAnimationMixerRoots(root)) {
    const mixer = host.userData.animationMixer as THREE.AnimationMixer | undefined
    if (!mixer) continue
    if (viewer.animationMixers.includes(mixer)) continue

    const clips = host.userData.animationClips as THREE.AnimationClip[] | undefined
    if (clips?.length) {
      for (const clip of clips) {
        mixer.clipAction(clip).play()
      }
    } else {
      // Fallback: resume any known inactive actions on the mixer.
      const actions = (mixer as THREE.AnimationMixer & { _actions?: THREE.AnimationAction[] })._actions
      if (actions) {
        for (const action of actions) {
          action.play()
        }
      }
    }
    viewer.animationMixers.push(mixer)
  }
}
