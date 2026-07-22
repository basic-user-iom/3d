import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import {
  range,
  texture,
  mix,
  uv,
  color as tslColor,
  rotateUV,
  positionLocal,
  time,
  uniform
} from 'three/tsl'
import type { ParticlesEffectSettings } from '../panorama/particlesEffectSettings'
import {
  DEFAULT_PANORAMA_LIVE_LOOK,
  sphericalToCartesian,
  type PanoramaLiveLook
} from '../panorama/panoramaSphericalCoords'
import './Panorama360ParticlesOverlay.css'

/** Distance from panorama center to particle emitter. */
const EMITTER_DISTANCE = 900
/** Base mesh scale from the three.js / IOM webgpu-particles demo. */
const BASE_SPRITE_SCALE = 400
/** Match panorama viewer base FOV so overlay directions line up. */
const OVERLAY_FOV = DEFAULT_PANORAMA_LIVE_LOOK.fov
/** Debounce mesh rebuilds when count changes. */
const COUNT_REBUILD_DEBOUNCE_MS = 250

function smokeTextureUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}panorama-effects/smoke1.png`
}

export interface Panorama360ParticlesOverlayProps {
  settings: ParticlesEffectSettings
  liveLookRef: React.MutableRefObject<PanoramaLiveLook>
  onStatusChange?: (status: 'ready' | 'unsupported' | 'error', message?: string) => void
}

export default function Panorama360ParticlesOverlay({
  settings,
  liveLookRef,
  onStatusChange
}: Panorama360ParticlesOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  const liveLookRefInternal = useRef(liveLookRef)
  liveLookRefInternal.current = liveLookRef
  const onStatusChangeRef = useRef(onStatusChange)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeCounts, setActiveCounts] = useState({
    smokeCount: settings.smokeCount,
    fireCount: settings.fireCount
  })

  const rebuildMeshesRef = useRef<((smokeCount: number, fireCount: number) => void) | null>(null)
  const activeCountsRef = useRef(activeCounts)
  const isFirstCountEffect = useRef(true)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    activeCountsRef.current = activeCounts
  }, [activeCounts])

  useEffect(() => {
    if (
      settings.smokeCount === activeCounts.smokeCount &&
      settings.fireCount === activeCounts.fireCount
    ) {
      return
    }
    const timer = window.setTimeout(
      () =>
        setActiveCounts({
          smokeCount: settings.smokeCount,
          fireCount: settings.fireCount
        }),
      COUNT_REBUILD_DEBOUNCE_MS
    )
    return () => window.clearTimeout(timer)
  }, [settings.smokeCount, settings.fireCount, activeCounts.smokeCount, activeCounts.fireCount])

  useEffect(() => {
    if (isFirstCountEffect.current) {
      isFirstCountEffect.current = false
      return
    }
    rebuildMeshesRef.current?.(activeCounts.smokeCount, activeCounts.fireCount)
  }, [activeCounts.smokeCount, activeCounts.fireCount])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let renderer: THREE.WebGPURenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let emitterRoot: THREE.Group | null = null
    let smokeMesh: THREE.Mesh | null = null
    let fireMesh: THREE.Mesh | null = null
    let smokeMaterial: THREE.SpriteNodeMaterial | null = null
    let fireMaterial: THREE.SpriteNodeMaterial | null = null
    let smokeGeometry: THREE.PlaneGeometry | null = null
    let fireGeometry: THREE.PlaneGeometry | null = null
    let smokeMap: THREE.Texture | null = null
    let resizeObserver: ResizeObserver | null = null
    let animationActive = false
    let rendererReady = false
    let meshGeneration = 0

    const lookTarget = new THREE.Vector3()
    const emitterPos = new THREE.Vector3()
    const speedUniform = uniform(settingsRef.current.speed)
    const fireColorUniform = uniform(tslColor(settingsRef.current.fireColor || '#b72f17'))
    const emberColorUniform = uniform(tslColor(settingsRef.current.emberColor || '#f27d0c'))

    const safeDispose = (resource: { dispose?: () => void } | null | undefined, label: string) => {
      if (!resource || typeof resource.dispose !== 'function') return
      try {
        resource.dispose()
      } catch (err) {
        console.debug(`[Panorama360Particles] ${label} dispose skipped:`, err)
      }
    }

    const syncEmitterTransform = () => {
      if (!emitterRoot) return
      const s = settingsRef.current
      emitterPos.copy(sphericalToCartesian(s.viewYaw, s.viewPitch, EMITTER_DISTANCE))
      // Keep world-up so smoke/fire rise visually upward at the pinned panorama spot.
      emitterRoot.position.copy(emitterPos)
      emitterRoot.rotation.set(0, 0, 0)
      const scale = Math.max(0.05, s.size)
      emitterRoot.scale.setScalar(scale)
      if (smokeMesh) {
        smokeMesh.scale.setScalar(BASE_SPRITE_SCALE)
        smokeMesh.visible = s.showSmoke !== false
      }
      if (fireMesh) {
        fireMesh.scale.setScalar(BASE_SPRITE_SCALE)
        fireMesh.visible = s.showFire !== false
      }
    }

    const syncLiveUniforms = () => {
      const s = settingsRef.current
      speedUniform.value = s.speed
      fireColorUniform.value.set(s.fireColor || '#b72f17')
      emberColorUniform.value.set(s.emberColor || '#f27d0c')
      syncEmitterTransform()
    }

    const syncCameraToPanorama = () => {
      if (!camera) return
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

    const handleResize = () => {
      if (!container || !camera || !renderer) return
      const width = container.clientWidth
      const height = container.clientHeight
      if (width === 0 || height === 0) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    const tearDownMeshes = () => {
      animationActive = false
      const smoke = smokeMesh
      const fire = fireMesh
      const smokeMat = smokeMaterial
      const fireMat = fireMaterial
      const smokeGeom = smokeGeometry
      const fireGeom = fireGeometry
      smokeMesh = null
      fireMesh = null
      smokeMaterial = null
      fireMaterial = null
      smokeGeometry = null
      fireGeometry = null

      for (const mesh of [smoke, fire]) {
        if (!mesh) continue
        try {
          emitterRoot?.remove(mesh)
        } catch {
          // ignore
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(mesh as any).geometry = undefined
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(mesh as any).material = undefined
        } catch {
          // ignore
        }
        safeDispose(mesh as { dispose?: () => void }, 'particleMesh')
      }

      safeDispose(smokeGeom, 'smokeGeometry')
      safeDispose(fireGeom, 'fireGeometry')
      if (renderer) {
        safeDispose(smokeMat, 'smokeMaterial')
        safeDispose(fireMat, 'fireMaterial')
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

      tearDownMeshes()
      if (emitterRoot && scene) {
        try {
          scene.remove(emitterRoot)
        } catch {
          // ignore
        }
      }
      emitterRoot = null
      scene = null
      camera = null

      if (smokeMap) {
        safeDispose(smokeMap, 'smokeMap')
        smokeMap = null
      }

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
          // Never let particles disposal take down the panorama WebGL context.
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
        console.debug('[Panorama360Particles] fail teardown suppressed:', err)
      }
      setErrorMessage(message)
      onStatusChangeRef.current?.(status, message)
    }

    const renderFrame = () => {
      if (disposed || !renderer || !scene || !camera) return
      syncLiveUniforms()
      syncCameraToPanorama()
      try {
        renderer.render(scene, camera)
      } catch (err) {
        console.error('[Panorama360Particles] render error:', err)
        fail('error', 'Particles effect crashed — panorama left intact.')
      }
    }

    const buildMeshes = (smokeCount: number, fireCount: number) => {
      if (!scene || !renderer || !emitterRoot || !smokeMap || disposed || !rendererReady) return

      animationActive = false
      const generation = ++meshGeneration
      tearDownMeshes()

      try {
        const lifeRange = range(0.1, 1)
        const offsetRange = range(new THREE.Vector3(-2, 3, -2), new THREE.Vector3(2, 5, 2))
        const scaledTime = time.add(5).mul(speedUniform)
        const lifeTime = scaledTime.mul(lifeRange).mod(1)
        const scaleRange = range(0.3, 2)
        const rotateRange = range(0.1, 4)
        const life = lifeTime.div(lifeRange)
        const fakeLightEffect = positionLocal.y.oneMinus().max(0.2)
        const textureNode = texture(smokeMap, rotateUV(uv(), scaledTime.mul(rotateRange)))
        const opacityNode = textureNode.a.mul(life.oneMinus())
        const smokeColor = mix(tslColor(0x2c1501), tslColor(0x222222), positionLocal.y.mul(3).clamp())

        smokeMaterial = new THREE.SpriteNodeMaterial()
        smokeMaterial.colorNode = mix(emberColorUniform, smokeColor, life.mul(2.5).min(1)).mul(
          fakeLightEffect
        )
        smokeMaterial.opacityNode = opacityNode
        smokeMaterial.positionNode = offsetRange.mul(lifeTime)
        smokeMaterial.scaleNode = scaleRange.mul(lifeTime.max(0.3))
        smokeMaterial.depthWrite = false
        smokeMaterial.transparent = true

        smokeGeometry = new THREE.PlaneGeometry(1, 1)
        smokeMesh = new THREE.Mesh(smokeGeometry, smokeMaterial)
        smokeMesh.scale.setScalar(BASE_SPRITE_SCALE)
        smokeMesh.count = Math.max(1, smokeCount)
        smokeMesh.frustumCulled = false
        emitterRoot.add(smokeMesh)

        fireMaterial = new THREE.SpriteNodeMaterial()
        fireMaterial.colorNode = mix(fireColorUniform, fireColorUniform, life)
        fireMaterial.positionNode = range(
          new THREE.Vector3(-1, 1, -1),
          new THREE.Vector3(1, 2, 1)
        ).mul(lifeTime)
        fireMaterial.scaleNode = smokeMaterial.scaleNode
        fireMaterial.opacityNode = opacityNode.mul(0.5)
        fireMaterial.blending = THREE.AdditiveBlending
        fireMaterial.transparent = true
        fireMaterial.depthWrite = false

        fireGeometry = new THREE.PlaneGeometry(1, 1)
        fireMesh = new THREE.Mesh(fireGeometry, fireMaterial)
        fireMesh.scale.setScalar(BASE_SPRITE_SCALE)
        fireMesh.count = Math.max(1, fireCount)
        fireMesh.position.y = -100
        fireMesh.renderOrder = 1
        fireMesh.frustumCulled = false
        emitterRoot.add(fireMesh)

        if (generation !== meshGeneration || disposed) {
          tearDownMeshes()
          return
        }

        syncEmitterTransform()
        animationActive = true
        onStatusChangeRef.current?.('ready')
        setErrorMessage(null)
      } catch (err) {
        console.error('[Panorama360Particles] mesh build failed:', err)
        fail('error', err instanceof Error ? err.message : 'Failed to build particles.')
      }
    }

    rebuildMeshesRef.current = (smokeCount: number, fireCount: number) => {
      try {
        buildMeshes(smokeCount, fireCount)
      } catch (err) {
        console.error('[Panorama360Particles] rebuild threw:', err)
        fail('error', err instanceof Error ? err.message : 'Failed to rebuild particles.')
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

      emitterRoot = new THREE.Group()
      scene.add(emitterRoot)

      const textureLoader = new THREE.TextureLoader()
      smokeMap = await new Promise<THREE.Texture>((resolve, reject) => {
        textureLoader.load(smokeTextureUrl(), resolve, undefined, reject)
      })
      smokeMap.colorSpace = THREE.SRGBColorSpace

      if (disposed) {
        tearDownAll()
        return
      }

      renderer = new THREE.WebGPURenderer({
        antialias: true,
        alpha: true,
        forceWebGL: false
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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
        console.error('[Panorama360Particles] WebGPU init failed:', err)
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
          'WebGPU is required for the particles effect (this browser fell back to WebGL).'
        )
        return
      }

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
      buildMeshes(activeCountsRef.current.smokeCount, activeCountsRef.current.fireCount)

      if (disposed || !renderer) return

      renderer.setAnimationLoop(() => {
        if (!animationActive || disposed) return
        renderFrame()
      })
    }

    init().catch((err) => {
      console.error('[Panorama360Particles] init error:', err)
      fail('error', err instanceof Error ? err.message : 'Failed to start particles effect.')
    })

    return () => {
      disposed = true
      meshGeneration += 1
      animationActive = false
      rebuildMeshesRef.current = null
      window.removeEventListener('resize', handleResize)
      try {
        resizeObserver?.disconnect()
      } catch {
        // ignore
      }
      try {
        tearDownAll()
      } catch (err) {
        console.debug('[Panorama360Particles] cleanup error suppressed:', err)
      }
    }
    // Mount once — settings sync via refs; count rebuilds via rebuildMeshesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={containerRef} className="panorama-360-particles-overlay" aria-hidden>
      {errorMessage && (
        <div className="panorama-360-particles-overlay-status">{errorMessage}</div>
      )}
    </div>
  )
}
