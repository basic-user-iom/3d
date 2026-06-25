import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

const setSelectedObject = vi.fn()
const setTransformMode = vi.fn()

const storeState = {
  selectedObject: null as THREE.Object3D | null,
  transformMode: null as 'translate' | 'rotate' | 'scale' | null,
  setSelectedObject,
  setTransformMode,
  renderMode: 'product' as const,
  streetsGLIframeOverlay: false,
  streetsGLIframeInteractive: false
}

vi.mock('../src/store/useAppStore', () => ({
  useAppStore: {
    getState: () => storeState
  }
}))

import {
  capturePathTracerMovementState,
  restorePathTracerMovementState,
  shouldSuppressPathTracerTransformInteraction,
  type PathTracerMovementSnapshot
} from '../src/viewer/pathTracer/pathTracerMovementRestore'

describe('shouldSuppressPathTracerTransformInteraction', () => {
  it('suppresses only while actively tracing', () => {
    expect(shouldSuppressPathTracerTransformInteraction(true, false, false, false)).toBe(true)
    expect(shouldSuppressPathTracerTransformInteraction(true, true, false, false)).toBe(false)
    expect(shouldSuppressPathTracerTransformInteraction(true, false, true, false)).toBe(false)
    expect(shouldSuppressPathTracerTransformInteraction(true, false, false, true)).toBe(false)
    expect(shouldSuppressPathTracerTransformInteraction(false, false, false, false)).toBe(false)
  })
})

describe('pathTracerMovementRestore', () => {
  beforeEach(() => {
    setSelectedObject.mockClear()
    setTransformMode.mockClear()
    storeState.selectedObject = null
    storeState.transformMode = null
  })

  it('captures transform control and orbit control state from the viewer', () => {
    const snapshot = capturePathTracerMovementState({
      transformControls: {
        enabled: true,
        getMode: () => 'translate'
      } as any,
      controls: {
        enabled: true,
        enableRotate: false,
        enablePan: false,
        enableZoom: true,
        update: vi.fn()
      } as any
    })

    expect(snapshot.transformControlsWasEnabled).toBe(true)
    expect(snapshot.transformControlsMode).toBe('translate')
    expect(snapshot.orbitControls).toEqual({
      enabled: true,
      enableRotate: false,
      enablePan: false,
      enableZoom: true
    })
  })

  it('restores transform controls, orbit controls, and store selection', () => {
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh()
    mesh.userData.isModel = true

    const selectObject = vi.fn()
    const controlsUpdate = vi.fn()

    const transformControls = Object.assign(new THREE.Object3D(), {
      enabled: false,
      visible: false,
      parent: null as THREE.Object3D | null,
      setMode: vi.fn(),
      getMode: () => 'translate' as const,
      object: undefined
    })
    transformControls.traverse = (cb: (child: THREE.Object3D) => void) => {
      cb(transformControls)
    }

    const viewer = {
      transformControls,
      controls: {
        enabled: false,
        enableRotate: false,
        enablePan: false,
        enableZoom: false,
        update: controlsUpdate
      },
      selectObject,
      renderer: {
        domElement: { style: {} } as unknown as HTMLCanvasElement
      }
    }

    const snapshot: PathTracerMovementSnapshot = {
      selectedObject: mesh,
      transformMode: 'translate',
      transformControlsWasEnabled: true,
      transformControlsMode: 'translate',
      orbitControls: {
        enabled: true,
        enableRotate: true,
        enablePan: true,
        enableZoom: true
      }
    }

    restorePathTracerMovementState(scene, viewer as any, snapshot)

    expect(scene.children).toContain(transformControls)
    expect((transformControls as any).enabled).toBe(true)
    expect(transformControls.visible).toBe(true)
    expect(setTransformMode).toHaveBeenCalledWith('translate')
    expect(setSelectedObject).toHaveBeenCalledWith(mesh)
    expect(selectObject).toHaveBeenCalledWith(mesh)
    expect(controlsUpdate).toHaveBeenCalled()
    expect(viewer.controls.enableRotate).toBe(true)
    expect(viewer.controls.enablePan).toBe(true)
  })
})
