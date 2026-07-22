import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import {
  cos,
  Continue,
  float,
  Fn,
  If,
  instanceIndex,
  instancedArray,
  length,
  Loop,
  max,
  negate,
  normalize,
  sin,
  sqrt,
  uint,
  uniform,
  vertexIndex,
  cameraProjectionMatrix,
  cameraViewMatrix,
  positionLocal,
  modelWorldMatrix,
  mat3,
  color as tslColor,
  dot
} from 'three/tsl'
import type { BirdsEffectSettings } from '../panorama/birdsEffectSettings'
import {
  DEFAULT_PANORAMA_LIVE_LOOK,
  sphericalToCartesian,
  type PanoramaLiveLook
} from '../panorama/panoramaSphericalCoords'
import './Panorama360BirdsOverlay.css'

const SPEED_LIMIT = 9.0
const BOUNDS = 800
const BOUNDS_HALF = BOUNDS / 2
/** Distance from panorama center to flock centroid (matches classic birds camera distance). */
const FLOCK_DISTANCE = 1000
/** Match panorama viewer base FOV so overlay directions line up. */
const OVERLAY_FOV = DEFAULT_PANORAMA_LIVE_LOOK.fov
/** Debounce sim rebuilds so rapid count changes don't thrash WebGPU. */
const COUNT_REBUILD_DEBOUNCE_MS = 250

class BirdGeometry extends THREE.BufferGeometry {
  constructor() {
    super()
    const points = 3 * 3
    const vertices = new THREE.BufferAttribute(new Float32Array(points * 3), 3)
    this.setAttribute('position', vertices)

    let v = 0
    function vertsPush(...args: number[]) {
      for (let i = 0; i < args.length; i++) {
        vertices.array[v++] = args[i]
      }
    }

    const wingsSpan = 20
    vertsPush(0, 0, -20, 0, -8, 10, 0, 0, 30)
    vertsPush(0, 0, -15, -wingsSpan, 0, 5, 0, 0, 15)
    vertsPush(0, 0, 15, wingsSpan, 0, 5, 0, 0, -15)
    this.scale(0.2, 0.2, 0.2)
  }
}

export interface Panorama360BirdsOverlayProps {
  settings: BirdsEffectSettings
  birdCount: number
  /**
   * Frame-synced panorama look (yaw/pitch/fov), written by Panorama360Viewer every frame.
   * Overlay camera follows this; flock stays at pinned viewYaw/viewPitch in panorama space.
   */
  liveLookRef: React.MutableRefObject<PanoramaLiveLook>
  onStatusChange?: (status: 'ready' | 'unsupported' | 'error', message?: string) => void
}

export default function Panorama360BirdsOverlay({
  settings,
  birdCount,
  liveLookRef,
  onStatusChange
}: Panorama360BirdsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  const liveLookRefInternal = useRef(liveLookRef)
  liveLookRefInternal.current = liveLookRef
  const onStatusChangeRef = useRef(onStatusChange)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeCount, setActiveCount] = useState(birdCount)

  const rebuildSimRef = useRef<((count: number) => void) | null>(null)
  const activeCountRef = useRef(activeCount)
  const isFirstCountEffect = useRef(true)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    activeCountRef.current = activeCount
  }, [activeCount])

  // Debounce count so the WebGPU sim rebuilds once per intentional change.
  useEffect(() => {
    if (birdCount === activeCount) return
    const timer = window.setTimeout(() => setActiveCount(birdCount), COUNT_REBUILD_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [birdCount, activeCount])

  // Rebuild flocking sim on the existing WebGPURenderer (never remount / dispose device).
  useEffect(() => {
    if (isFirstCountEffect.current) {
      isFirstCountEffect.current = false
      return
    }
    rebuildSimRef.current?.(activeCount)
  }, [activeCount])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let renderer: THREE.WebGPURenderer | null = null
    let scene: THREE.Scene | null = null
    let birdMesh: THREE.InstancedMesh | null = null
    let birdGeometry: BirdGeometry | null = null
    let birdMaterial: THREE.NodeMaterial | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let resizeObserver: ResizeObserver | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let computeVelocity: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let computePosition: any = null
    let last = performance.now()
    let animationActive = false
    let simGeneration = 0
    let rendererReady = false

    const pointer = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    const lookTarget = new THREE.Vector3()
    const flockCenter = new THREE.Vector3()
    const birdColor = uniform(tslColor(settingsRef.current.color || '#000000'))
    const speedMul = uniform(settingsRef.current.speed)
    const flockOffset = uniform(new THREE.Vector3(0, 0, -FLOCK_DISTANCE)).setName('flockOffset')

    const effectController = {
      separation: uniform(settingsRef.current.separation).setName('separation'),
      alignment: uniform(settingsRef.current.alignment).setName('alignment'),
      cohesion: uniform(settingsRef.current.cohesion).setName('cohesion'),
      freedom: uniform(0.75).setName('freedom'),
      now: uniform(0.0),
      deltaTime: uniform(0.0).setName('deltaTime'),
      rayOrigin: uniform(new THREE.Vector3()).setName('rayOrigin'),
      rayDirection: uniform(new THREE.Vector3()).setName('rayDirection')
    }

    const syncFlockOffset = () => {
      const s = settingsRef.current
      flockCenter.copy(sphericalToCartesian(s.viewYaw, s.viewPitch, FLOCK_DISTANCE))
      flockOffset.value.copy(flockCenter)
    }

    const syncLiveUniforms = () => {
      const s = settingsRef.current
      effectController.separation.value = s.separation
      effectController.alignment.value = s.alignment
      effectController.cohesion.value = s.cohesion
      speedMul.value = s.speed
      birdColor.value.set(s.color || '#000000')
      syncFlockOffset()
      if (birdMesh) {
        birdMesh.scale.setScalar(Math.max(0.05, s.size))
        birdMesh.updateMatrix()
      }
    }

    const syncCameraToPanorama = () => {
      if (!camera) return
      // Camera follows the live panorama look — flock stays at pinned spherical coords,
      // so birds appear glued to that sky region as the user pans (like a hotspot).
      const look = liveLookRefInternal.current?.current ?? DEFAULT_PANORAMA_LIVE_LOOK
      const yaw = look.yaw
      const pitch = look.pitch
      const fov = typeof look.fov === 'number' && Number.isFinite(look.fov) ? look.fov : OVERLAY_FOV
      if (Math.abs(camera.fov - fov) > 1e-4) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      lookTarget.copy(sphericalToCartesian(yaw, pitch, 1))
      camera.position.set(0, 0, 0)
      camera.up.set(0, 1, 0)
      camera.lookAt(lookTarget)
      camera.updateMatrixWorld()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.isPrimary === false || !container) return
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      // Same NDC mapping as three.js webgpu_compute_birds / iobjectm demo
      // (Y must be * 2 — missing that skewed the disturbance ray off the flock).
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2.0 - 1.0
      pointer.y = 1.0 - ((event.clientY - rect.top) / rect.height) * 2.0
    }

    const handleResize = () => {
      if (!container || !camera || !renderer) return
      const width = container.clientWidth
      const height = container.clientHeight
      if (width === 0 || height === 0) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    /** Dispose GPU objects without throwing — Three.js program-cache dispose is racy. */
    const safeDispose = (resource: { dispose?: () => void } | null | undefined, label: string) => {
      if (!resource || typeof resource.dispose !== 'function') return
      try {
        resource.dispose()
      } catch (err) {
        console.debug(`[Panorama360Birds] ${label} dispose skipped:`, err)
      }
    }

    /**
     * Tear down flock mesh + sim nodes only (keep WebGPURenderer alive for count rebuilds).
     * Order: stop frames → detach from scene → dispose geom/material → clear refs.
     * Never touches the panorama WebGL renderer.
     */
    const tearDownSimulation = () => {
      animationActive = false
      computeVelocity = null
      computePosition = null

      const mesh = birdMesh
      const geom = birdGeometry
      const mat = birdMaterial
      birdMesh = null
      birdGeometry = null
      birdMaterial = null

      if (mesh) {
        try {
          if (scene) scene.remove(mesh)
        } catch {
          // ignore
        }
        // Detach before dispose so renderer backend won't double-walk freed mats.
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(mesh as any).geometry = undefined
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(mesh as any).material = undefined
        } catch {
          // ignore
        }
        safeDispose(mesh, 'instancedMesh')
      }

      safeDispose(geom, 'birdGeometry')
      // Only dispose material while the overlay renderer is still alive.
      // After renderer.dispose(), Material.dispose → onMaterialDispose can hit
      // undefined program.usedTimes in Three's pipeline cache.
      if (mat && renderer) {
        safeDispose(mat, 'birdMaterial')
      }
    }

    const removeOverlayCanvases = () => {
      const toRemove: ChildNode[] = []
      container.childNodes.forEach((child) => {
        if (child instanceof HTMLCanvasElement) toRemove.push(child)
      })
      toRemove.forEach((child) => {
        try {
          container.removeChild(child)
        } catch {
          // ignore
        }
      })
    }

    const tearDownAll = () => {
      animationActive = false
      try {
        renderer?.setAnimationLoop(null)
      } catch {
        // ignore
      }

      // Scene/GPU resources BEFORE renderer — prevents usedTimes / immutable-texture crashes.
      tearDownSimulation()
      scene = null
      camera = null

      if (renderer) {
        const overlayRenderer = renderer
        renderer = null
        try {
          if (overlayRenderer.domElement.parentElement === container) {
            container.removeChild(overlayRenderer.domElement)
          }
        } catch {
          // ignore
        }
        try {
          overlayRenderer.dispose()
        } catch {
          // Never let birds disposal take down the panorama WebGL context.
        }
      }

      rendererReady = false
      removeOverlayCanvases()
    }

    const fail = (status: 'unsupported' | 'error', message: string) => {
      if (disposed) return
      try {
        tearDownAll()
      } catch (err) {
        console.debug('[Panorama360Birds] fail teardown suppressed:', err)
      }
      setErrorMessage(message)
      onStatusChangeRef.current?.(status, message)
    }

    const renderFrame = () => {
      if (disposed || !renderer || !scene || !camera || !computeVelocity || !computePosition) return

      const now = performance.now()
      let deltaTime = (now - last) / 1000
      if (deltaTime > 1) deltaTime = 1
      last = now

      syncLiveUniforms()
      syncCameraToPanorama()
      raycaster.setFromCamera(pointer, camera)

      effectController.now.value = now
      effectController.deltaTime.value = deltaTime * speedMul.value
      effectController.rayOrigin.value.copy(raycaster.ray.origin)
      effectController.rayDirection.value.copy(raycaster.ray.direction)

      try {
        renderer.compute(computeVelocity)
        renderer.compute(computePosition)
        renderer.render(scene, camera)
      } catch (err) {
        console.error('[Panorama360Birds] render error:', err)
        fail('error', 'Birds effect crashed — panorama left intact.')
        return
      }

      // Avoid sticky mouse attractor — match upstream demo behavior.
      pointer.y = 10
    }

    const buildSimulation = (BIRDS: number) => {
      if (!scene || !renderer || disposed || !rendererReady) return

      // Pause the animation loop before freeing resources so a mid-frame
      // compute/render cannot touch disposed NodeMaterial / storage buffers.
      animationActive = false
      const generation = ++simGeneration
      tearDownSimulation()

      try {
        const positionArray = new Float32Array(BIRDS * 3)
        const velocityArray = new Float32Array(BIRDS * 3)
        const phaseArray = new Float32Array(BIRDS)

        for (let i = 0; i < BIRDS; i++) {
          positionArray[i * 3 + 0] = Math.random() * BOUNDS - BOUNDS_HALF
          positionArray[i * 3 + 1] = Math.random() * BOUNDS - BOUNDS_HALF
          positionArray[i * 3 + 2] = Math.random() * BOUNDS - BOUNDS_HALF
          velocityArray[i * 3 + 0] = (Math.random() - 0.5) * 10
          velocityArray[i * 3 + 1] = (Math.random() - 0.5) * 10
          velocityArray[i * 3 + 2] = (Math.random() - 0.5) * 10
          phaseArray[i] = 1
        }

        const positionStorage = instancedArray(positionArray, 'vec3').setName('positionStorage')
        const velocityStorage = instancedArray(velocityArray, 'vec3').setName('velocityStorage')
        const phaseStorage = instancedArray(phaseArray, 'float').setName('phaseStorage')
        positionStorage.setPBO(true)
        velocityStorage.setPBO(true)
        phaseStorage.setPBO(true)

        birdGeometry = new BirdGeometry()
        birdMaterial = new THREE.NodeMaterial()
        birdMaterial.vertexNode = Fn(() => {
          const position = positionLocal.toVar()
          const newPhase = phaseStorage.element(instanceIndex).toVar()
          const newVelocity = normalize(velocityStorage.element(instanceIndex)).toVar()

          If(vertexIndex.equal(4).or(vertexIndex.equal(7)), () => {
            position.y = sin(newPhase).mul(5.0)
          })

          const newPosition = modelWorldMatrix.mul(position)

          newVelocity.z.mulAssign(-1.0)
          const xz = length(newVelocity.xz)
          const xyz = float(1.0)
          const x = sqrt(newVelocity.y.mul(newVelocity.y).oneMinus())

          const cosry = newVelocity.x.div(xz).toVar()
          const sinry = newVelocity.z.div(xz).toVar()
          const cosrz = x.div(xyz)
          const sinrz = newVelocity.y.div(xyz).toVar()

          const maty = mat3(cosry, 0, negate(sinry), 0, 1, 0, sinry, 0, cosry)
          const matz = mat3(cosrz, sinrz, 0, negate(sinrz), cosrz, 0, 0, 0, 1)

          const finalVert = maty.mul(matz).mul(newPosition)
          // Local flocking coords → place flock along panorama viewYaw/viewPitch.
          finalVert.addAssign(positionStorage.element(instanceIndex))
          finalVert.addAssign(flockOffset)

          return cameraProjectionMatrix.mul(cameraViewMatrix).mul(finalVert)
        })()
        birdMaterial.colorNode = birdColor
        birdMaterial.side = THREE.DoubleSide
        birdMaterial.transparent = true
        birdMaterial.depthWrite = true

        birdMesh = new THREE.InstancedMesh(birdGeometry, birdMaterial, BIRDS)
        birdMesh.rotation.y = Math.PI / 2
        birdMesh.matrixAutoUpdate = false
        birdMesh.frustumCulled = false
        birdMesh.scale.setScalar(Math.max(0.05, settingsRef.current.size))
        birdMesh.updateMatrix()
        scene.add(birdMesh)

        syncFlockOffset()

        computeVelocity = Fn(() => {
          const PI = float(3.141592653589793)
          const PI_2 = PI.mul(2.0)
          const limit = float(SPEED_LIMIT).toVar('limit')

          const { alignment, separation, cohesion, deltaTime, rayOrigin, rayDirection } = effectController

          const zoneRadius = separation.add(alignment).add(cohesion).toConst()
          const separationThresh = separation.div(zoneRadius).toConst()
          const alignmentThresh = separation.add(alignment).div(zoneRadius).toConst()
          const zoneRadiusSq = zoneRadius.mul(zoneRadius).toConst()

          const birdIndex = instanceIndex.toConst('birdIndex')
          const position = positionStorage.element(birdIndex).toVar()
          const velocity = velocityStorage.element(birdIndex).toVar()

          // Disturbance ray is in world space; birds are sim-local + flockOffset.
          const worldPos = position.add(flockOffset).toConst()
          const directionToRay = rayOrigin.sub(worldPos).toConst()
          const projectionLength = dot(directionToRay, rayDirection).toConst()
          const closestPoint = rayOrigin.sub(rayDirection.mul(projectionLength)).toConst()
          const directionToClosestPoint = closestPoint.sub(worldPos).toConst()
          const distanceToClosestPoint = length(directionToClosestPoint).toConst()
          const distanceToClosestPointSq = distanceToClosestPoint.mul(distanceToClosestPoint).toConst()

          const rayRadius = float(150.0).toConst()
          const rayRadiusSq = rayRadius.mul(rayRadius).toConst()

          If(distanceToClosestPointSq.lessThan(rayRadiusSq), () => {
            const velocityAdjust = distanceToClosestPointSq
              .div(rayRadiusSq)
              .sub(1.0)
              .mul(deltaTime)
              .mul(100.0)
            velocity.addAssign(normalize(directionToClosestPoint).mul(velocityAdjust))
            limit.addAssign(5.0)
          })

          const dirToCenter = position.toVar()
          dirToCenter.y.mulAssign(2.5)
          velocity.subAssign(normalize(dirToCenter).mul(deltaTime).mul(5.0))

          Loop({ start: uint(0), end: uint(BIRDS), type: 'uint', condition: '<' }, ({ i }) => {
            If(i.equal(birdIndex), () => {
              Continue()
            })

            const birdPosition = positionStorage.element(i)
            const dirToBird = birdPosition.sub(position)
            const distToBird = length(dirToBird)

            If(distToBird.lessThan(0.0001), () => {
              Continue()
            })

            const distToBirdSq = distToBird.mul(distToBird)

            If(distToBirdSq.greaterThan(zoneRadiusSq), () => {
              Continue()
            })

            const percent = distToBirdSq.div(zoneRadiusSq)

            If(percent.lessThan(separationThresh), () => {
              const velocityAdjust = separationThresh.div(percent).sub(1.0).mul(deltaTime)
              velocity.subAssign(normalize(dirToBird).mul(velocityAdjust))
            })
              .ElseIf(percent.lessThan(alignmentThresh), () => {
                const threshDelta = alignmentThresh.sub(separationThresh)
                const adjustedPercent = percent.sub(separationThresh).div(threshDelta)
                const birdVelocity = velocityStorage.element(i)

                const cosRange = cos(adjustedPercent.mul(PI_2))
                const cosRangeAdjust = float(0.5).sub(cosRange.mul(0.5)).add(0.5)
                const velocityAdjust = cosRangeAdjust.mul(deltaTime)
                velocity.addAssign(normalize(birdVelocity).mul(velocityAdjust))
              })
              .Else(() => {
                const threshDelta = alignmentThresh.oneMinus()
                const adjustedPercent = threshDelta
                  .equal(0.0)
                  .select(1.0, percent.sub(alignmentThresh).div(threshDelta))

                const cosRange = cos(adjustedPercent.mul(PI_2))
                const adj1 = cosRange.mul(-0.5)
                const adj2 = adj1.add(0.5)
                const adj3 = float(0.5).sub(adj2)

                const velocityAdjust = adj3.mul(deltaTime)
                velocity.addAssign(normalize(dirToBird).mul(velocityAdjust))
              })
          })

          If(length(velocity).greaterThan(limit), () => {
            velocity.assign(normalize(velocity).mul(limit))
          })

          velocityStorage.element(birdIndex).assign(velocity)
        })()
          .compute(BIRDS)
          .setName('Birds Velocity')

        computePosition = Fn(() => {
          const { deltaTime } = effectController
          positionStorage
            .element(instanceIndex)
            .addAssign(velocityStorage.element(instanceIndex).mul(deltaTime).mul(15.0))

          const velocity = velocityStorage.element(instanceIndex)
          const phase = phaseStorage.element(instanceIndex)

          const modValue = phase
            .add(deltaTime)
            .add(length(velocity.xz).mul(deltaTime).mul(3.0))
            .add(max(velocity.y, 0.0).mul(deltaTime).mul(6.0))
          phaseStorage.element(instanceIndex).assign(modValue.mod(62.83))
        })()
          .compute(BIRDS)
          .setName('Birds Position')

        if (disposed || generation !== simGeneration) {
          tearDownSimulation()
          return
        }

        last = performance.now()
        animationActive = true
        setErrorMessage(null)
        onStatusChangeRef.current?.('ready')
      } catch (err) {
        console.error('[Panorama360Birds] simulation build failed:', err)
        tearDownSimulation()
        // Soft-fail: drop birds overlay only — panorama WebGL stays up.
        fail('error', err instanceof Error ? err.message : 'Failed to rebuild birds simulation.')
      }
    }

    rebuildSimRef.current = (count: number) => {
      if (disposed || !rendererReady) return
      try {
        buildSimulation(count)
      } catch (err) {
        console.error('[Panorama360Birds] rebuild threw:', err)
        try {
          tearDownSimulation()
        } catch {
          // ignore
        }
        fail('error', err instanceof Error ? err.message : 'Failed to rebuild birds simulation.')
      }
    }

    const init = async () => {
      if (!navigator.gpu) {
        fail('unsupported', 'WebGPU is not available in this browser.')
        return
      }

      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)

      camera = new THREE.PerspectiveCamera(OVERLAY_FOV, width / height, 1, 5000)
      camera.position.set(0, 0, 0)

      scene = new THREE.Scene()
      scene.background = null

      renderer = new THREE.WebGPURenderer({
        antialias: true,
        alpha: true,
        forceWebGL: false,
        requiredLimits: { maxStorageBuffersInVertexStage: 3 }
      })
      const isMobile =
        window.matchMedia('(max-width: 768px)').matches ||
        window.matchMedia('(pointer: coarse)').matches
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.15 : 2))
      renderer.setSize(width, height, false)
      renderer.setClearColor(0x000000, 0)
      renderer.toneMapping = THREE.NeutralToneMapping

      const canvas = renderer.domElement
      canvas.style.pointerEvents = 'none'
      canvas.style.background = 'transparent'
      container.appendChild(canvas)

      try {
        await renderer.init()
      } catch (err) {
        console.error('[Panorama360Birds] WebGPU init failed:', err)
        fail('error', 'WebGPU initialization failed.')
        return
      }

      if (disposed) {
        tearDownAll()
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backend = (renderer as any).backend
      if (!backend?.isWebGPUBackend) {
        fail(
          'unsupported',
          'WebGPU compute is required for the birds effect (this browser fell back to WebGL).'
        )
        return
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('resize', handleResize)
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)
      handleResize()
      syncCameraToPanorama()

      if (disposed) {
        tearDownAll()
        return
      }

      rendererReady = true
      buildSimulation(activeCountRef.current)

      if (disposed || !renderer) return

      renderer.setAnimationLoop(() => {
        if (!animationActive || disposed) return
        renderFrame()
      })
    }

    init().catch((err) => {
      console.error('[Panorama360Birds] init error:', err)
      fail('error', err instanceof Error ? err.message : 'Failed to start birds effect.')
    })

    return () => {
      disposed = true
      simGeneration += 1
      animationActive = false
      rebuildSimRef.current = null
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', handleResize)
      try {
        resizeObserver?.disconnect()
      } catch {
        // ignore
      }
      try {
        tearDownAll()
      } catch (err) {
        // Last-resort guard: never let overlay cleanup become an uncaught exception.
        console.debug('[Panorama360Birds] cleanup error suppressed:', err)
      }
    }
    // Overlay mounts once while enabled. Count rebuilds reuse the same WebGPURenderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={containerRef} className="panorama-360-birds-overlay" aria-hidden>
      {errorMessage && (
        <div className="panorama-360-birds-overlay-status">{errorMessage}</div>
      )}
    </div>
  )
}
