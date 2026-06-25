import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useAppStore } from '../../store/useAppStore'
import { applyViewerCanvasPointerEvents } from '../utils/viewerCanvasPointerEvents'

export type TransformMode = 'translate' | 'rotate' | 'scale'

export type OrbitControlsSnapshot = {
  enabled: boolean
  enableRotate: boolean
  enablePan: boolean
  enableZoom: boolean
}

export type PathTracerMovementSnapshot = {
  selectedObject: THREE.Object3D | null
  transformMode: TransformMode | null
  transformControlsWasEnabled: boolean
  transformControlsMode: TransformMode | null
  orbitControls: OrbitControlsSnapshot | null
}

type ViewerLike = {
  transformControls?: THREE.Object3D | null
  controls?: OrbitControls | null
  selectObject?: (object: THREE.Object3D | null) => void
  renderer?: THREE.WebGLRenderer | null
}

export function capturePathTracerMovementState(
  viewer?: ViewerLike | null
): PathTracerMovementSnapshot {
  let selectedObject: THREE.Object3D | null = null
  let transformMode: TransformMode | null = null

  try {
    const state = useAppStore.getState()
    selectedObject = state.selectedObject ?? null
    transformMode = state.transformMode ?? null
  } catch {
    // store unavailable
  }

  let transformControlsWasEnabled = true
  let transformControlsMode: TransformMode | null = null
  let orbitControls: OrbitControlsSnapshot | null = null

  if (viewer?.transformControls) {
    const transformControls = viewer.transformControls as any
    transformControlsWasEnabled = transformControls.enabled !== false
    const mode = transformControls.getMode?.()
    if (mode === 'translate' || mode === 'rotate' || mode === 'scale') {
      transformControlsMode = mode
    }
  }

  const controls = viewer?.controls
  if (controls) {
    orbitControls = {
      enabled: controls.enabled !== false,
      enableRotate: controls.enableRotate !== false,
      enablePan: controls.enablePan !== false,
      enableZoom: controls.enableZoom !== false
    }
  }

  return {
    selectedObject,
    transformMode,
    transformControlsWasEnabled,
    transformControlsMode,
    orbitControls
  }
}

function showTransformControlsHierarchy(transformControls: THREE.Object3D): void {
  transformControls.visible = true
  transformControls.traverse((child) => {
    if (child !== transformControls) {
      child.visible = true
    }
  })
}

export function restorePathTracerMovementState(
  scene: THREE.Scene,
  viewer: ViewerLike | null | undefined,
  snapshot: PathTracerMovementSnapshot
): void {
  if (!viewer?.transformControls) {
    return
  }

  const transformControls = viewer.transformControls as any

  if (!transformControls.parent) {
    scene.add(transformControls)
  }

  transformControls.enabled = snapshot.transformControlsWasEnabled !== false
  showTransformControlsHierarchy(transformControls)

  const controls = viewer.controls
  if (controls && snapshot.orbitControls) {
    controls.enabled = snapshot.orbitControls.enabled
    controls.enableRotate = snapshot.orbitControls.enableRotate
    controls.enablePan = snapshot.orbitControls.enablePan
    controls.enableZoom = snapshot.orbitControls.enableZoom
    controls.update()
  } else if (controls) {
    controls.enabled = true
    controls.enableRotate = true
    controls.enablePan = true
    controls.enableZoom = true
    controls.update()
  }

  const modeToRestore =
    snapshot.transformMode ??
    snapshot.transformControlsMode ??
    (snapshot.selectedObject instanceof THREE.Light ? 'translate' : null)

  try {
    const { setTransformMode, setSelectedObject } = useAppStore.getState()
    if (modeToRestore) {
      setTransformMode(modeToRestore)
    }
    if (snapshot.selectedObject) {
      setSelectedObject(snapshot.selectedObject)
    }
  } catch {
    // store unavailable
  }

  const attachMode = modeToRestore ?? snapshot.transformControlsMode
  if (attachMode) {
    transformControls.setMode(attachMode)
  }

  if (snapshot.selectedObject && typeof viewer.selectObject === 'function') {
    viewer.selectObject(snapshot.selectedObject)
  }

  if (viewer.renderer) {
    applyViewerCanvasPointerEvents(
      viewer.renderer.domElement,
      useAppStore.getState(),
      transformControls
    )
  }
}

export function schedulePathTracerMovementRestore(
  scene: THREE.Scene,
  viewer: ViewerLike | null | undefined,
  snapshot: PathTracerMovementSnapshot
): void {
  const run = () => restorePathTracerMovementState(scene, viewer, snapshot)

  run()
  requestAnimationFrame(() => {
    run()
    setTimeout(run, 0)
    setTimeout(run, 100)
  })
}

export function shouldSuppressPathTracerTransformInteraction(
  isRunning: boolean,
  pausedAtMax: boolean,
  maxSamplesReached: boolean,
  userPaused: boolean
): boolean {
  return isRunning && !pausedAtMax && !maxSamplesReached && !userPaused
}
