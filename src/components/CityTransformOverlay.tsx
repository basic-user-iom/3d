/**
 * Lightweight Three.js overlay for city/Streets GL mode.
 * Renders TransformControls synced to the Streets GL camera so custom objects can be
 * moved with a gizmo when ViewerCanvas is unmounted.
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { TransformControls } from 'three-stdlib'
import { useAppStore } from '../store/useAppStore'
import {
  applyStreetsGLWorldToProxy,
  syncManipulatorFromProxy,
  syncProjectObjectTransformToStreetsGL,
  shouldSyncTransformToStreetsGL
} from '../viewer/useViewer'

type CameraPayload = {
  cameraPosition: { x: number; y: number; z: number }
  cameraTarget?: { x: number; y: number; z: number }
}

const STREETS_GL_IFRAME_SELECTOR = 'iframe[title="Streets GL 3D Buildings"]'

function setStreetsGLIframePointerEvents(enabled: boolean): void {
  const iframe = document.querySelector(STREETS_GL_IFRAME_SELECTOR) as HTMLIFrameElement | null
  if (iframe) {
    iframe.style.pointerEvents = enabled ? 'auto' : 'none'
  }
}

export function CityTransformOverlay() {
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    renderMode,
    streetsGLIframeOverlay,
    streetsGLBridge,
    selectedObject,
    transformMode,
    projectObjects,
    sceneRevision
  } = useAppStore()
  // City mode unmounts ViewerCanvas — use renderMode, not sharedViewer?.scene (stale after mode switch).
  const isActive = renderMode === 'city' && streetsGLIframeOverlay

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const manipulatorRef = useRef<THREE.Object3D | null>(null)
  const transformControlsRef = useRef<TransformControls | null>(null)
  const cameraStateRef = useRef<CameraPayload | null>(null)
  const isDraggingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const syncThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Poll Streets GL camera for overlay alignment (shared bridge poll loop)
  useEffect(() => {
    if (!isActive || !streetsGLBridge) return

    const unsubscribe = streetsGLBridge.subscribeCameraPosition((payload) => {
      cameraStateRef.current = payload
    }, 150)

    return unsubscribe
  }, [isActive, streetsGLBridge])

  // Three.js scene + TransformControls lifecycle
  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 50000)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.id = 'city-transform-canvas'
    renderer.domElement.style.pointerEvents = 'none'
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const manipulator = new THREE.Object3D()
    manipulator.userData.isCityTransformManipulator = true
    scene.add(manipulator)
    manipulatorRef.current = manipulator

    const transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.userData.isTransformControls = true
    scene.add(transformControls)
    transformControlsRef.current = transformControls

    const originalUpdateMatrixWorld = transformControls.updateMatrixWorld.bind(transformControls)
    transformControls.updateMatrixWorld = function (force?: boolean) {
      try {
        const attachedObject = (this as any).object
        if (attachedObject) {
          const gizmo = (this as any).gizmo
          const controlCamera = (this as any).camera
          if (gizmo && controlCamera?.isCamera) {
            try {
              originalUpdateMatrixWorld(force)
            } catch {
              THREE.Object3D.prototype.updateMatrixWorld.call(this, force)
            }
          } else {
            THREE.Object3D.prototype.updateMatrixWorld.call(this, force)
          }
        } else {
          THREE.Object3D.prototype.updateMatrixWorld.call(this, force)
        }
      } catch {
        try {
          if (this.matrixAutoUpdate) this.updateMatrix()
        } catch {
          /* ignore */
        }
      }
    }

    const pushProxyFromManipulator = () => {
      const proxy = useAppStore.getState().selectedObject
      const manip = manipulatorRef.current
      if (!proxy || !manip) return

      applyStreetsGLWorldToProxy(
        proxy,
        { x: manip.position.x, y: manip.position.y, z: manip.position.z },
        { x: manip.rotation.x, y: manip.rotation.y, z: manip.rotation.z },
        { x: manip.scale.x, y: manip.scale.y, z: manip.scale.z }
      )

      if (shouldSyncTransformToStreetsGL()) {
        syncProjectObjectTransformToStreetsGL(proxy)
      }
    }

    const onChange = () => {
      if (!isDraggingRef.current) return
      if (syncThrottleRef.current) clearTimeout(syncThrottleRef.current)
      syncThrottleRef.current = setTimeout(() => {
        pushProxyFromManipulator()
        syncThrottleRef.current = null
      }, 50)
    }

    const onDraggingChanged = (event: { value?: boolean }) => {
      const dragging = event.value !== undefined ? event.value : true
      isDraggingRef.current = dragging
      const canvas = renderer.domElement
      canvas.style.pointerEvents = dragging || !!useAppStore.getState().transformMode ? 'auto' : 'none'
      setStreetsGLIframePointerEvents(!dragging)

      if (!dragging) {
        if (syncThrottleRef.current) {
          clearTimeout(syncThrottleRef.current)
          syncThrottleRef.current = null
        }
        pushProxyFromManipulator()
        useAppStore.getState().markSceneRevision()
      }
    }

    transformControls.addEventListener('change' as any, onChange)
    transformControls.addEventListener('dragging-changed' as any, onDraggingChanged)

    const resize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w <= 0 || h <= 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const renderLoop = () => {
      rafRef.current = requestAnimationFrame(renderLoop)

      const camState = cameraStateRef.current
      if (camState?.cameraPosition) {
        const cp = camState.cameraPosition
        camera.position.set(cp.x, cp.y, cp.z)
        const target = camState.cameraTarget ?? cp
        camera.lookAt(target.x, target.y, target.z)
      }

      renderer.render(scene, camera)
    }
    rafRef.current = requestAnimationFrame(renderLoop)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (syncThrottleRef.current) clearTimeout(syncThrottleRef.current)
      transformControls.removeEventListener('change' as any, onChange)
      transformControls.removeEventListener('dragging-changed' as any, onDraggingChanged)
      transformControls.detach()
      scene.remove(transformControls)
      scene.remove(manipulator)
      resizeObserver.disconnect()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      manipulatorRef.current = null
      transformControlsRef.current = null
      setStreetsGLIframePointerEvents(true)
    }
  }, [isActive])

  // Attach/detach gizmo and sync manipulator when selection or mode changes
  useEffect(() => {
    if (!isActive) return

    const transformControls = transformControlsRef.current
    const manipulator = manipulatorRef.current
    const renderer = rendererRef.current
    if (!transformControls || !manipulator || !renderer) return

    if (!selectedObject || !transformMode) {
      transformControls.detach()
      renderer.domElement.style.pointerEvents = 'none'
      setStreetsGLIframePointerEvents(true)
      if (containerRef.current) {
        containerRef.current.style.pointerEvents = 'none'
      }
      return
    }

    const projectId = (selectedObject.userData as any).projectObjectId as string | undefined
    const descriptor = projectId
      ? projectObjects.find((p) => p.id === projectId)
      : undefined

    if (!isDraggingRef.current) {
      syncManipulatorFromProxy(selectedObject, manipulator, descriptor)
    }

    transformControls.setMode(transformMode)
    try {
      transformControls.attach(manipulator)
    } catch (err) {
      console.warn('[CityTransformOverlay] Failed to attach gizmo:', err)
    }

    // Block Streets GL map navigation so the transform gizmo receives pointer events.
    setStreetsGLIframePointerEvents(false)
    if (containerRef.current) {
      containerRef.current.style.pointerEvents = 'auto'
    }
    renderer.domElement.style.pointerEvents = 'auto'
  }, [isActive, selectedObject, transformMode, projectObjects, sceneRevision])

  if (!isActive) return null

  return (
    <div
      ref={containerRef}
      className="city-transform-overlay"
      aria-hidden="true"
    />
  )
}
