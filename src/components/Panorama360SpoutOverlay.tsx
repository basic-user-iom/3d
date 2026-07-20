import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { SpoutEffectSettings } from '../panorama/spoutEffectSettings'
import {
  buildSpoutFragmentShader,
  buildSpoutVertexShader
} from '../panorama/spoutRaymarchShader'
import {
  DEFAULT_PANORAMA_LIVE_LOOK,
  cartesianToSpherical,
  sphericalToCartesian,
  type PanoramaLiveLook
} from '../panorama/panoramaSphericalCoords'
import './Panorama360SpoutOverlay.css'

/** Distance from panorama center to spout origin. */
const SPOUT_DISTANCE = 320
/** Object3D scale when settings.size === 1. */
const BASE_SPOUT_SCALE = 36
const OVERLAY_FOV = DEFAULT_PANORAMA_LIVE_LOOK.fov

export interface Panorama360SpoutOverlayProps {
  settings: SpoutEffectSettings
  liveLookRef: React.MutableRefObject<PanoramaLiveLook>
  onStatusChange?: (status: 'ready' | 'unsupported' | 'error', message?: string) => void
  /** Persist gizmo-driven position / rotation / size back to panel state. */
  onGizmoChange?: (patch: Partial<SpoutEffectSettings>) => void
}

export default function Panorama360SpoutOverlay({
  settings,
  liveLookRef,
  onStatusChange,
  onGizmoChange
}: Panorama360SpoutOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  const liveLookRefInternal = useRef(liveLookRef)
  liveLookRefInternal.current = liveLookRef
  const onStatusChangeRef = useRef(onStatusChange)
  const onGizmoChangeRef = useRef(onGizmoChange)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    onGizmoChangeRef.current = onGizmoChange
  }, [onGizmoChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let spoutRoot: THREE.Group | null = null
    let proxyMesh: THREE.Mesh | null = null
    let quad: THREE.Mesh | null = null
    let material: THREE.RawShaderMaterial | null = null
    let dummyTex: THREE.DataTexture | null = null
    let controls: TransformControls | null = null
    let resizeObserver: ResizeObserver | null = null
    let animationActive = false
    let frame = 0
    let prevTs = performance.now()
    let draggingGizmo = false
    let suppressGizmoWrite = false

    const lookTarget = new THREE.Vector3()
    const spoutPos = new THREE.Vector3()
    const invSpoutWorld = new THREE.Matrix4()
    /** Shadertoy scene interest sits near (1, 0.9, 0); pin that point to spoutRoot. */
    const interestToOrigin = new THREE.Matrix4().makeTranslation(-1.0, -0.9, 0)
    const camForward = new THREE.Vector3()
    const sizeScratch = new THREE.Vector2()

    const safeDispose = (resource: { dispose?: () => void } | null | undefined, label: string) => {
      if (!resource || typeof resource.dispose !== 'function') return
      try {
        resource.dispose()
      } catch (err) {
        console.debug(`[Panorama360Spout] ${label} dispose skipped:`, err)
      }
    }

    const fail = (status: 'unsupported' | 'error', message: string) => {
      setErrorMessage(message)
      onStatusChangeRef.current?.(status, message)
      animationActive = false
    }

    const syncSpoutTransformFromSettings = () => {
      if (!spoutRoot || draggingGizmo) return
      const s = settingsRef.current
      suppressGizmoWrite = true
      spoutPos.copy(sphericalToCartesian(s.viewYaw, s.viewPitch, SPOUT_DISTANCE))
      spoutRoot.position.copy(spoutPos)
      spoutRoot.rotation.set(s.rotationX, s.rotationY, s.rotationZ)
      const scale = Math.max(0.05, s.size) * BASE_SPOUT_SCALE
      spoutRoot.scale.setScalar(scale)
      spoutRoot.updateMatrixWorld(true)
      suppressGizmoWrite = false
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
      camera.getWorldDirection(camForward)
    }

    const syncMaterialUniforms = (dt: number, ts: number) => {
      if (!material || !camera || !spoutRoot || !renderer) return
      const s = settingsRef.current
      spoutRoot.updateMatrixWorld(true)

      const u = material.uniforms
      renderer.getSize(sizeScratch)
      const pr = renderer.getPixelRatio()
      u.iResolution.value.set(sizeScratch.x * pr, sizeScratch.y * pr, 1)
      u.iTime.value = ts * 0.001
      u.iTimeDelta.value = dt
      u.iFrame.value = frame
      u.uCameraPos.value.copy(camera.position)
      u.uCameraForward.value.copy(camForward)
      u.uCameraUp.value.copy(camera.up)
      u.uFovY.value = camera.fov
      invSpoutWorld.copy(spoutRoot.matrixWorld).multiply(interestToOrigin).invert()
      u.uInvSpoutWorld.value.copy(invSpoutWorld)
      u.uPipeRadius.value = s.pipeRadius
      u.uPipeThickness.value = s.pipeThickness
      u.uPipeHeight.value = s.pipeHeight
      u.uPipeLength.value = s.pipeLength
      u.uWaterSpeed.value = Math.max(0.05, s.speed)
      u.uShowFloor.value = s.showFloor ? 1 : 0
      u.uShowPipe.value = s.showPipe ? 1 : 0
      u.uExposure.value = s.exposure
      ;(u.uPipeColor.value as THREE.Color).set(s.pipeColor || '#808080')
      u.uPipeRoughness.value = Math.min(1, Math.max(0, s.pipeRoughness ?? 0))
      ;(u.uWaterColor.value as THREE.Color).set(s.waterColor || '#4CB3E6')
      u.uWaterOpacity.value = Math.min(1, Math.max(0, s.waterOpacity ?? 1))
      u.uWaterRoughness.value = Math.min(1, Math.max(0, s.waterRoughness ?? 0))
      u.uWaterIor.value = Math.min(2.5, Math.max(1, s.waterIor ?? 1.333))
      u.uWaterTint.value = Math.min(6, Math.max(0.2, s.waterTint ?? 2))
    }

    const syncControlsMode = () => {
      if (!controls) return
      const s = settingsRef.current
      const editing = s.editTransform === true
      controls.visible = editing
      controls.enabled = editing
      const mode = s.gizmoMode === 'translate' || s.gizmoMode === 'scale' ? s.gizmoMode : 'rotate'
      controls.setMode(mode)
      controls.showX = true
      controls.showY = true
      controls.showZ = true
      if (proxyMesh) proxyMesh.visible = editing
    }

    const patchFromSpoutRoot = () => {
      if (!spoutRoot) return
      const spherical = cartesianToSpherical(spoutRoot.position)
      const sx = Math.max(spoutRoot.scale.x, spoutRoot.scale.y, spoutRoot.scale.z)
      spoutRoot.scale.setScalar(sx)
      // Keep spout on the pin sphere so settings round-trip without a stored radius.
      spoutRoot.position.copy(sphericalToCartesian(spherical.yaw, spherical.pitch, SPOUT_DISTANCE))
      onGizmoChangeRef.current?.({
        viewYaw: spherical.yaw,
        viewPitch: spherical.pitch,
        rotationX: spoutRoot.rotation.x,
        rotationY: spoutRoot.rotation.y,
        rotationZ: spoutRoot.rotation.z,
        size: Math.min(3, Math.max(0.2, sx / BASE_SPOUT_SCALE))
      })
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

    const animate = (ts: number) => {
      if (disposed || !animationActive || !renderer || !scene || !camera) return
      requestAnimationFrame(animate)
      const dt = Math.min(0.05, Math.max(0.001, (ts - prevTs) / 1000))
      prevTs = ts
      frame += 1

      syncCameraToPanorama()
      if (!draggingGizmo) syncSpoutTransformFromSettings()
      syncControlsMode()
      syncMaterialUniforms(dt, ts)

      try {
        const helper = controls?.getHelper()
        const editing = settingsRef.current.editTransform === true
        if (quad) quad.visible = true
        if (helper) helper.visible = false
        renderer.autoClear = true
        renderer.render(scene, camera)

        // First frame: abort if the raymarch program failed to link.
        if (frame === 1 && material) {
          const prog = (material as unknown as { program?: { program?: WebGLProgram } }).program
          const gl = renderer.getContext()
          if (prog?.program && gl && !gl.getProgramParameter(prog.program, gl.LINK_STATUS)) {
            fail('error', 'Spout shader failed to compile — WebGL2 overlay disabled.')
            return
          }
        }

        if (editing && helper && controls) {
          if (quad) quad.visible = false
          helper.visible = true
          renderer.autoClear = false
          renderer.clearDepth()
          renderer.render(scene, camera)
          if (quad) quad.visible = true
        }
        renderer.autoClear = true
      } catch (err) {
        console.error('[Panorama360Spout] render error:', err)
        fail('error', 'Spout effect crashed — panorama left intact.')
      }
    }

    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: 'high-performance'
      })
      if (!gl) {
        fail('unsupported', 'WebGL2 is required for the Spout effect. Try a current Chromium, Firefox, or Safari.')
        return
      }

      renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: 'high-performance'
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setClearColor(0x000000, 0)
      renderer.autoClear = true
      container.appendChild(renderer.domElement)

      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(OVERLAY_FOV, 1, 0.1, 5000)

      dummyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
      dummyTex.needsUpdate = true

      let fragSrc: string
      try {
        fragSrc = buildSpoutFragmentShader()
      } catch (err) {
        console.error(err)
        fail('error', 'Failed to build Spout shader.')
        return
      }

      material = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          iResolution: { value: new THREE.Vector3(1, 1, 1) },
          iTime: { value: 0 },
          iTimeDelta: { value: 0.016 },
          iFrame: { value: 0 },
          iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
          iChannel0: { value: dummyTex },
          uCameraPos: { value: new THREE.Vector3() },
          uCameraForward: { value: new THREE.Vector3(0, 0, -1) },
          uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
          uFovY: { value: OVERLAY_FOV },
          uInvSpoutWorld: { value: new THREE.Matrix4() },
          uPipeRadius: { value: settingsRef.current.pipeRadius },
          uPipeThickness: { value: settingsRef.current.pipeThickness },
          uPipeHeight: { value: settingsRef.current.pipeHeight },
          uPipeLength: { value: settingsRef.current.pipeLength },
          uWaterSpeed: { value: 1 },
          uShowFloor: { value: 0 },
          uShowPipe: { value: settingsRef.current.showPipe ? 1 : 0 },
          uExposure: { value: 1.5 },
          uPipeColor: { value: new THREE.Color(settingsRef.current.pipeColor || '#808080') },
          uPipeRoughness: { value: settingsRef.current.pipeRoughness ?? 0 },
          uWaterColor: { value: new THREE.Color(settingsRef.current.waterColor || '#4CB3E6') },
          uWaterOpacity: { value: settingsRef.current.waterOpacity ?? 1 },
          uWaterRoughness: { value: settingsRef.current.waterRoughness ?? 0 },
          uWaterIor: { value: settingsRef.current.waterIor ?? 1.333 },
          uWaterTint: { value: settingsRef.current.waterTint ?? 2 }
        },
        vertexShader: buildSpoutVertexShader(),
        fragmentShader: fragSrc
      })

      const quadGeom = new THREE.BufferGeometry()
      quadGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
      )
      quad = new THREE.Mesh(quadGeom, material)
      quad.frustumCulled = false
      // Fullscreen raymarch must not steal TransformControls picks.
      quad.raycast = () => {}
      scene.add(quad)

      spoutRoot = new THREE.Group()
      scene.add(spoutRoot)

      const proxyGeom = new THREE.BoxGeometry(1.2, 2.4, 1.2)
      const proxyMat = new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthTest: false
      })
      proxyMesh = new THREE.Mesh(proxyGeom, proxyMat)
      proxyMesh.visible = false
      spoutRoot.add(proxyMesh)

      controls = new TransformControls(camera, renderer.domElement)
      controls.setSize(0.85)
      controls.attach(spoutRoot)
      controls.visible = false
      controls.enabled = false
      scene.add(controls.getHelper())

      controls.addEventListener('dragging-changed', (event) => {
        draggingGizmo = Boolean((event as { value?: boolean }).value)
        if (!draggingGizmo && spoutRoot) {
          patchFromSpoutRoot()
        }
      })

      controls.addEventListener('objectChange', () => {
        if (suppressGizmoWrite || !spoutRoot || !draggingGizmo) return
        patchFromSpoutRoot()
      })

      syncSpoutTransformFromSettings()
      handleResize()
      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)

      animationActive = true
      onStatusChangeRef.current?.('ready')
      setErrorMessage(null)
      requestAnimationFrame(animate)
    } catch (err) {
      console.error('[Panorama360Spout] init error:', err)
      fail('error', 'Spout effect failed to initialize.')
    }

    return () => {
      disposed = true
      animationActive = false
      resizeObserver?.disconnect()
      resizeObserver = null

      try {
        if (controls) {
          controls.detach()
          controls.dispose()
        }
      } catch (err) {
        console.debug('[Panorama360Spout] controls dispose skipped:', err)
      }
      controls = null

      if (spoutRoot && scene) scene.remove(spoutRoot)
      if (quad && scene) scene.remove(quad)

      safeDispose(proxyMesh?.geometry, 'proxyGeom')
      safeDispose(proxyMesh?.material as THREE.Material, 'proxyMat')
      safeDispose(quad?.geometry, 'quadGeom')
      safeDispose(material, 'material')
      safeDispose(dummyTex, 'dummyTex')
      proxyMesh = null
      quad = null
      material = null
      dummyTex = null
      spoutRoot = null

      if (renderer) {
        try {
          renderer.dispose()
          const el = renderer.domElement
          if (el.parentElement === container) container.removeChild(el)
        } catch (err) {
          console.debug('[Panorama360Spout] renderer dispose skipped:', err)
        }
      }
      renderer = null
      scene = null
      camera = null
    }
  }, [])

  const editing = settings.editTransform === true

  return (
    <div
      ref={containerRef}
      className={`panorama-360-spout-overlay${editing ? ' is-editing' : ''}`}
      aria-hidden={!editing}
    >
      {errorMessage && (
        <div className="panorama-360-spout-overlay-status" role="status">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
