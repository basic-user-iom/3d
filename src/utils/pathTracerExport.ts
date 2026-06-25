import * as THREE from 'three'
import { PathTracerDemo, type PathTracerDemoConfig, type PathTracerDemoCallbacks } from '../viewer/pathTracer'
import type { CameraView } from '../store/useAppStore'
import { useAppStore } from '../store/useAppStore'

export interface PathTracerExportSettings {
  samples: number
  bounces: number
  width: number
  height: number
  denoiseEnabled: boolean
  denoiseStrength: number
}

export interface PathTracerExportCallbacks {
  onProgress?: (progress: number, message: string) => void
}

type ViewerForExport = {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  scene: THREE.Scene
  controls?: { update: () => void }
  setCameraState: (position: THREE.Vector3, target: THREE.Vector3, animate?: boolean) => void
  getCameraState: () => { position: THREE.Vector3; target: THREE.Vector3 }
}

export async function exportPathTracerFromCameraView(
  viewer: ViewerForExport,
  view: CameraView,
  settings: PathTracerExportSettings,
  callbacks?: PathTracerExportCallbacks
): Promise<void> {
  if ((window as any).__pathTracerDemoRunning) {
    throw new Error('Path tracer is already running. Stop it in the Path Tracer panel first.')
  }

  const oldState = viewer.getCameraState()
  const position = new THREE.Vector3(
    view.cameraPosition.x,
    view.cameraPosition.y,
    view.cameraPosition.z
  )
  const target = new THREE.Vector3(
    view.cameraTarget.x,
    view.cameraTarget.y,
    view.cameraTarget.z
  )

  viewer.setCameraState(position, target, false)
  viewer.controls?.update()
  viewer.renderer.render(viewer.scene, viewer.camera)

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

  const { hdrGroundProjectionEnabled } = useAppStore.getState()
  const rendererSize = new THREE.Vector2()
  viewer.renderer.getSize(rendererSize)
  const resolutionScale = Math.min(
    settings.width / Math.max(rendererSize.x, 1),
    settings.height / Math.max(rendererSize.y, 1)
  )
  const clampedScale = THREE.MathUtils.clamp(resolutionScale, 0.25, 2)

  let pathTracer: PathTracerDemo | null = null
  let progressInterval: ReturnType<typeof setInterval> | null = null
  let completed = false

  const cleanup = () => {
    if (progressInterval) {
      clearInterval(progressInterval)
      progressInterval = null
    }
    if (pathTracer) {
      try {
        pathTracer.stop(true)
        pathTracer.dispose()
      } catch {
        // ignore cleanup errors
      }
      pathTracer = null
    }
    viewer.setCameraState(oldState.position, oldState.target, false)
    viewer.controls?.update()
    viewer.renderer.render(viewer.scene, viewer.camera)
  }

  return new Promise<void>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (completed) return
      completed = true
      cleanup()
      fn()
    }

    const config: PathTracerDemoConfig = {
      renderer: viewer.renderer,
      camera: viewer.camera,
      scene: viewer.scene,
      controls: viewer.controls as PathTracerDemoConfig['controls'],
      resolutionScale: clampedScale,
      tiles: 2,
      minSamples: 0,
      maxSamples: settings.samples,
      bounces: settings.bounces,
      denoiseEnabled: settings.denoiseEnabled,
      denoiseStrength: settings.denoiseStrength,
      excludeGroundedSkybox: !hdrGroundProjectionEnabled,
      createGroundPlane: !hdrGroundProjectionEnabled
    }

    const ptCallbacks: PathTracerDemoCallbacks = {
      onProgress: (message) => callbacks?.onProgress?.(0, message),
      onError: (err) => finish(() => reject(err)),
      onMaxSamplesReached: ({ sampleCount, maxSamples }) => {
        callbacks?.onProgress?.(1, `Completed ${sampleCount}/${maxSamples} samples`)
        window.setTimeout(() => {
          try {
            const safeName = (view.name || 'view').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40)
            pathTracer?.downloadImage(`pathtraced-${safeName}-${Date.now()}.png`)
            finish(() => resolve())
          } catch (error) {
            finish(() => reject(error instanceof Error ? error : new Error(String(error))))
          }
        }, 300)
      }
    }

    pathTracer = new PathTracerDemo(config, ptCallbacks)

    progressInterval = setInterval(() => {
      if (!pathTracer || completed) return
      const count = pathTracer.getSampleCount()
      const progress = settings.samples > 0 ? Math.min(0.99, count / settings.samples) : 0
      callbacks?.onProgress?.(progress, `Rendering... ${count}/${settings.samples} samples`)
    }, 400)

    pathTracer
      .initialize()
      .then(() => {
        callbacks?.onProgress?.(0, 'Starting path tracer...')
        pathTracer?.start()
      })
      .catch((error) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))))
      })
  })
}
