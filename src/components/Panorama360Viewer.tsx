import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RGBELoader, EXRLoader, KTX2Loader } from 'three-stdlib'
import type { PanoramaHotspot } from '../panorama/panoramaTourTypes'
import {
  getHotspotColor,
  getHotspotShape,
  getPopupAnchor,
  getPopupBorderColor,
  getPopupWidth,
  getUrlIframeTitle,
  isLikelyIframeBlocked,
  PLACEMENT_PREVIEW_HOTSPOT_ID,
  resolvePanoramaUrl
} from '../panorama/panoramaTourTypes'
import {
  applyCameraOrientation,
  cartesianToSpherical,
  getOrientationFromControls,
  lerpAngle,
  PANORAMA_SPHERE_RADIUS,
  projectToScreen,
  sphericalToCartesian,
  syncPanoramaCameraAtOrigin,
  type PanoramaLiveLook
} from '../panorama/panoramaSphericalCoords'
import { createPanoramaAnimationLoop } from '../panorama/panoramaAnimationLoop'
import './Panorama360Viewer.css'

/** Fields that affect marker/popup rendering — used to invalidate projected hotspot cache. */
function hotspotProjectionSignature(hotspot: PanoramaHotspot): string {
  return [
    hotspot.label,
    hotspot.type,
    hotspot.shape ?? '',
    hotspot.color ?? '',
    hotspot.yaw,
    hotspot.pitch,
    hotspot.info ?? '',
    hotspot.popupWidth ?? '',
    hotspot.popupHeight ?? '',
    hotspot.popupAnchor ?? '',
    hotspot.popupOffsetX ?? '',
    hotspot.popupOffsetY ?? '',
    hotspot.popupBorderColor ?? ''
  ].join('|')
}

const BASE_FOV = 75
const ZOOM_FOV = 44
const WIDE_FOV = 90
/** User scroll/pinch FOV limits (degrees). Narrower = zoomed in. */
const MIN_USER_FOV = 30
const MAX_USER_FOV = 100
/** FOV change per wheel deltaY unit (PerspectiveCamera FOV zoom). */
const WHEEL_FOV_SPEED = 0.05
const TRANSITION_HALF_MS = 275
const ORIENTATION_ANIM_MS = 400
const TRANSITION_OVERLAY_OPACITY = 1

type TransitionPhase = 'idle' | 'out' | 'in'

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function applyEasing(t: number, easing: 'linear' | 'easeInOut'): number {
  if (easing === 'linear') return t
  return easeInOutCubic(t)
}

export interface GuidedCameraCommand {
  yaw: number
  pitch: number
  fov?: number
  durationMs?: number
  easing?: 'linear' | 'easeInOut'
}

interface TransitionState {
  phase: TransitionPhase
  startTime: number
  outDone: boolean
  loadDone: boolean
}

function createIdleTransition(): TransitionState {
  return { phase: 'idle', startTime: 0, outDone: false, loadDone: false }
}

interface OrientationAnimationState {
  startTime: number
  startYaw: number
  startPitch: number
  endYaw: number
  endPitch: number
  startFov: number
  endFov: number
  durationMs: number
  easing: 'linear' | 'easeInOut'
  onComplete?: () => void
}

interface ProjectedHotspot {
  hotspot: PanoramaHotspot
  x: number
  y: number
}

function getInfoPopupStyle(
  hotspot: PanoramaHotspot,
  markerX: number,
  markerY: number,
  offsetOverride?: { offsetX: number; offsetY: number }
): React.CSSProperties {
  const width = getPopupWidth(hotspot)
  const height = hotspot.popupHeight
  const anchor = getPopupAnchor(hotspot)
  const offsetX = offsetOverride?.offsetX ?? hotspot.popupOffsetX ?? 0
  const offsetY = offsetOverride?.offsetY ?? hotspot.popupOffsetY ?? 0

  const base: React.CSSProperties = {
    width,
    maxWidth: width,
    borderColor: getPopupBorderColor(hotspot),
    ...(height ? { height, overflow: 'auto' } : {})
  }

  switch (anchor) {
    case 'center':
      return {
        ...base,
        left: markerX + offsetX,
        top: markerY + offsetY,
        transform: 'translate(-50%, -50%)'
      }
    case 'above':
      return {
        ...base,
        left: markerX + offsetX,
        top: markerY - 14 + offsetY,
        transform: 'translate(-50%, -100%)'
      }
    case 'below':
      return {
        ...base,
        left: markerX + offsetX,
        top: markerY + 14 + offsetY,
        transform: 'translate(-50%, 0)'
      }
    case 'left':
      return {
        ...base,
        left: markerX - 18 + offsetX,
        top: markerY + offsetY,
        transform: 'translate(-100%, -50%)'
      }
    case 'right':
      return {
        ...base,
        left: markerX + 18 + offsetX,
        top: markerY + offsetY,
        transform: 'translate(0, -50%)'
      }
    default:
      return {
        ...base,
        left: markerX + offsetX,
        top: markerY + offsetY,
        transform: 'translate(-50%, -50%)'
      }
  }
}

const IFRAME_TROUBLE_HINT_MS = 2500

interface UrlIframeOverlayProps {
  url: string
  label: string
  error: string | null
  onClose: () => void
}

function UrlIframeOverlay({ url, label, error, onClose }: UrlIframeOverlayProps) {
  const [iframeLoading, setIframeLoading] = useState(true)
  const [showTroubleHint, setShowTroubleHint] = useState(false)
  const blocked = !error && isLikelyIframeBlocked(url)
  const title = getUrlIframeTitle(label, url)

  useEffect(() => {
    setIframeLoading(true)
    setShowTroubleHint(false)
  }, [url])

  useEffect(() => {
    if (error || blocked) return
    const timer = window.setTimeout(() => setShowTroubleHint(true), IFRAME_TROUBLE_HINT_MS)
    return () => window.clearTimeout(timer)
  }, [url, error, blocked])

  const handleIframeLoad = useCallback(() => {
    setIframeLoading(false)
  }, [])

  return (
    <div className="panorama-url-iframe-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panorama-url-iframe-backdrop" onClick={onClose} />
      <div className="panorama-url-iframe-panel">
        <div className="panorama-url-iframe-header">
          <div className="panorama-url-iframe-header-text">
            <h3>{title}</h3>
            {!error && !blocked && (
              <p className="panorama-url-iframe-subtitle">
                If the page is blank or shows an error, the site may block embedding — open in a new tab instead.
              </p>
            )}
          </div>
          <div className="panorama-url-iframe-header-actions">
            {url && (
              <a
                className="panorama-url-iframe-open-btn"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in new tab
              </a>
            )}
            <button
              type="button"
              className="panorama-url-iframe-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        {error ? (
          <div className="panorama-url-iframe-blocked">
            <div className="panorama-url-iframe-blocked-icon" aria-hidden>⚠</div>
            <p className="panorama-url-iframe-blocked-title">{error}</p>
            {url && (
              <a
                className="panorama-url-iframe-open-btn panorama-url-iframe-open-btn-lg"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in new tab
              </a>
            )}
          </div>
        ) : blocked ? (
          <div className="panorama-url-iframe-blocked">
            <div className="panorama-url-iframe-blocked-icon" aria-hidden>🚫</div>
            <p className="panorama-url-iframe-blocked-title">This website doesn&apos;t allow embedded viewing</p>
            <p className="panorama-url-iframe-blocked-detail">
              Sites like {title} block iframe embedding for security. Open the page in a new browser tab instead.
            </p>
            <a
              className="panorama-url-iframe-open-btn panorama-url-iframe-open-btn-lg"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in new tab
            </a>
          </div>
        ) : (
          <>
            <div className="panorama-url-iframe-body">
              {iframeLoading && (
                <div className="panorama-url-iframe-loading">
                  <div className="loading-spinner" />
                  <p>Loading page…</p>
                </div>
              )}
              <iframe
                className="panorama-url-iframe"
                src={url}
                title={title}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={handleIframeLoad}
              />
              {showTroubleHint && (
                <div className="panorama-url-iframe-trouble">
                  <p>Having trouble loading?</p>
                  <a
                    className="panorama-url-iframe-open-btn panorama-url-iframe-open-btn-sm"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in new tab
                  </a>
                </div>
              )}
            </div>
            <div className="panorama-url-iframe-footer">
              Some websites block iframe embedding. Use <strong>Open in new tab</strong> if the page doesn&apos;t appear.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface Panorama360ViewerProps {
  imageUrl?: string | File
  hotspots?: PanoramaHotspot[]
  placementPreview?: PanoramaHotspot | null
  editPopupPreview?: PanoramaHotspot | null
  editMarkerPreview?: PanoramaHotspot | null
  editMode?: boolean
  previewMode?: boolean
  initialYaw?: number
  initialPitch?: number
  orientationFocusKey?: number
  highlightedHotspotId?: string | null
  selectedHotspotId?: string | null
  placementMode?: boolean
  onLoad?: () => void
  onError?: (error: Error) => void
  onPlaceHotspot?: (yaw: number, pitch: number) => void
  onMoveHotspot?: (hotspotId: string, yaw: number, pitch: number) => void
  onPopupOffsetChange?: (hotspotId: string, offsetX: number, offsetY: number) => void
  onHotspotSelect?: (hotspotId: string, focusCamera?: boolean) => void
  onHotspotClick?: (hotspot: PanoramaHotspot) => void
  onOrientationChange?: (yaw: number, pitch: number) => void
  /**
   * Mutable look state written every animation frame (yaw/pitch/fov).
   * Used by overlays (e.g. birds) that must stay glued to panorama space without React lag.
   */
  liveLookRef?: React.MutableRefObject<PanoramaLiveLook>
  /** When true, OrbitControls are disabled (guided tour playback). */
  interactionLocked?: boolean
  /** Hotspot ids that should not render markers (guided tour visibility). */
  hiddenHotspotIds?: ReadonlySet<string> | string[]
  /**
   * Imperative camera tween for guided tours. Bump `guidedCameraCommandKey` to apply.
   * Prefer this over orientationFocusKey when FOV / custom duration are needed.
   */
  guidedCameraCommand?: GuidedCameraCommand | null
  guidedCameraCommandKey?: number
  onGuidedCameraComplete?: () => void
  /** Force-open an info popup by hotspot id (guided tour). Null closes. */
  guidedInfoPopupId?: string | null
}

export default function Panorama360Viewer({
  imageUrl,
  hotspots = [],
  placementPreview = null,
  editPopupPreview = null,
  editMarkerPreview = null,
  editMode = false,
  previewMode = false,
  initialYaw = 0,
  initialPitch = 0,
  orientationFocusKey = 0,
  highlightedHotspotId = null,
  selectedHotspotId = null,
  placementMode = false,
  onLoad,
  onError,
  onPlaceHotspot,
  onMoveHotspot,
  onPopupOffsetChange,
  onHotspotSelect,
  onHotspotClick,
  onOrientationChange,
  liveLookRef,
  interactionLocked = false,
  hiddenHotspotIds,
  guidedCameraCommand = null,
  guidedCameraCommandKey = 0,
  onGuidedCameraComplete,
  guidedInfoPopupId = null
}: Panorama360ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const transitionOverlayRef = useRef<HTMLDivElement>(null)
  const transitionRef = useRef<TransitionState>(createIdleTransition())
  const prevImageUrlRef = useRef<string | File | undefined>(undefined)
  const tryBeginInPhaseRef = useRef<() => void>(() => {})
  const updateTransitionRef = useRef<() => void>(() => {})
  const updateOrientationAnimationRef = useRef<() => boolean>(() => false)
  const orientationAnimRef = useRef<OrientationAnimationState | null>(null)
  const lastOrientationFocusKeyRef = useRef(0)
  const lastGuidedCameraCommandKeyRef = useRef(0)
  const onGuidedCameraCompleteRef = useRef(onGuidedCameraComplete)
  onGuidedCameraCompleteRef.current = onGuidedCameraComplete
  const interactionLockedRef = useRef(interactionLocked)
  interactionLockedRef.current = interactionLocked
  const initialYawRef = useRef(initialYaw)
  const initialPitchRef = useRef(initialPitch)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const textureRef = useRef<THREE.Texture | null>(null)
  const ktx2LoaderRef = useRef<KTX2Loader | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const draggingHotspotRef = useRef<{
    id: string
    pointerId: number
    captureTarget: HTMLElement | null
    yaw: number
    pitch: number
  } | null>(null)
  const draggingPopupRef = useRef<{
    hotspotId: string
    pointerId: number
    captureTarget: HTMLElement | null
    startOffsetX: number
    startOffsetY: number
    startClientX: number
    startClientY: number
  } | null>(null)
  const popupDragVisualRef = useRef<{ offsetX: number; offsetY: number } | null>(null)
  const onPopupOffsetChangeRef = useRef(onPopupOffsetChange)
  const onLoadRef = useRef(onLoad)
  const onErrorRef = useRef(onError)
  const selectedHotspotIdRef = useRef(selectedHotspotId)
  const placementModeRef = useRef(placementMode)
  const hotspotsRef = useRef(hotspots)
  const placementPreviewRef = useRef(placementPreview)
  const onPlaceHotspotRef = useRef(onPlaceHotspot)
  const onOrientationChangeRef = useRef(onOrientationChange)
  const liveLookRefInternal = useRef(liveLookRef)
  liveLookRefInternal.current = liveLookRef

  const syncLiveLookRef = useCallback(() => {
    const lookRef = liveLookRefInternal.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!lookRef || !camera) return
    const { yaw, pitch } = controls
      ? getOrientationFromControls(controls, camera)
      : { yaw: lookRef.current.yaw, pitch: lookRef.current.pitch }
    lookRef.current.yaw = yaw
    lookRef.current.pitch = pitch
    lookRef.current.fov = camera.fov
  }, [])

  // Keep a stable frame hook so the mount-once animate loop never closes over a stale callback.
  const syncLiveLookFrameRef = useRef(syncLiveLookRef)
  syncLiveLookFrameRef.current = syncLiveLookRef
  const lastReportedOrientationRef = useRef<{ yaw: number; pitch: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<{ width?: number; height?: number; format?: string } | null>(null)
  const [projectedHotspots, setProjectedHotspots] = useState<ProjectedHotspot[]>([])
  const projectedHotspotsRef = useRef(projectedHotspots)
  const [infoPopup, setInfoPopup] = useState<PanoramaHotspot | null>(null)
  /** Last on-screen anchor so info popups stay readable when the hotspot leaves the frustum. */
  const lastInfoPopupScreenRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const [urlIframe, setUrlIframe] = useState<{ url: string; label: string } | null>(null)
  const [urlIframeError, setUrlIframeError] = useState<string | null>(null)
  const prevPreviewModeRef = useRef(previewMode)
  const [isDraggingHotspot, setIsDraggingHotspot] = useState(false)
  const [isDraggingPopup, setIsDraggingPopup] = useState(false)
  const [popupDragVisual, setPopupDragVisual] = useState<{ offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    hotspotsRef.current = hotspots
  }, [hotspots])

  useEffect(() => {
    projectedHotspotsRef.current = projectedHotspots
  }, [projectedHotspots])

  const clearInfoPopup = useCallback(() => {
    lastInfoPopupScreenRef.current = null
    setInfoPopup(null)
  }, [])

  const clearUrlIframe = useCallback(() => {
    setUrlIframe(null)
    setUrlIframeError(null)
  }, [])

  useEffect(() => {
    placementPreviewRef.current = placementPreview
  }, [placementPreview])

  useEffect(() => {
    onPlaceHotspotRef.current = onPlaceHotspot
  }, [onPlaceHotspot])

  useEffect(() => {
    onOrientationChangeRef.current = onOrientationChange
  }, [onOrientationChange])

  useEffect(() => {
    initialYawRef.current = initialYaw
    initialPitchRef.current = initialPitch
  }, [initialYaw, initialPitch])

  const reportOrientation = useCallback(() => {
    const controls = controlsRef.current
    const camera = cameraRef.current
    if (!controls || !camera) return
    const { yaw, pitch } = getOrientationFromControls(controls, camera)
    syncLiveLookRef()
    const prev = lastReportedOrientationRef.current
    if (prev && Math.abs(prev.yaw - yaw) < 1e-5 && Math.abs(prev.pitch - pitch) < 1e-5) {
      return
    }
    lastReportedOrientationRef.current = { yaw, pitch }
    onOrientationChangeRef.current?.(yaw, pitch)
  }, [syncLiveLookRef])

  useEffect(() => {
    selectedHotspotIdRef.current = selectedHotspotId
  }, [selectedHotspotId])

  useEffect(() => {
    placementModeRef.current = placementMode
  }, [placementMode])

  useEffect(() => {
    onLoadRef.current = onLoad
  }, [onLoad])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onPopupOffsetChangeRef.current = onPopupOffsetChange
  }, [onPopupOffsetChange])

  useEffect(() => {
    clearInfoPopup()
  }, [imageUrl, clearInfoPopup])

  useEffect(() => {
    popupDragVisualRef.current = null
    setPopupDragVisual(null)
  }, [editPopupPreview?.id, editPopupPreview?.popupOffsetX, editPopupPreview?.popupOffsetY])

  useEffect(() => {
    if (!infoPopup || isDraggingPopup) return
    const updated = hotspots.find((h) => h.id === infoPopup.id)
    if (!updated) return
    if (
      updated.popupOffsetX !== infoPopup.popupOffsetX ||
      updated.popupOffsetY !== infoPopup.popupOffsetY ||
      updated.label !== infoPopup.label ||
      updated.info !== infoPopup.info ||
      updated.popupBorderColor !== infoPopup.popupBorderColor ||
      updated.popupWidth !== infoPopup.popupWidth ||
      updated.popupHeight !== infoPopup.popupHeight ||
      updated.popupAnchor !== infoPopup.popupAnchor
    ) {
      setInfoPopup(updated)
    }
  }, [hotspots, infoPopup, isDraggingPopup])

  const raycastPanorama = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current || !cameraRef.current || !meshRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, cameraRef.current)
    const hits = raycaster.intersectObject(meshRef.current)
    if (hits.length === 0) return null

    return cartesianToSpherical(hits[0].point)
  }, [])

  const setControlsEnabled = useCallback((enabled: boolean) => {
    if (controlsRef.current) {
      controlsRef.current.enabled = enabled && !interactionLockedRef.current
    }
  }, [])

  useEffect(() => {
    if (!controlsRef.current) return
    if (interactionLocked) {
      controlsRef.current.enabled = false
      return
    }
    if (transitionRef.current.phase === 'idle' && !orientationAnimRef.current) {
      controlsRef.current.enabled = true
    }
  }, [interactionLocked])

  const startTransitionOut = useCallback(() => {
    transitionRef.current = {
      phase: 'out',
      startTime: performance.now(),
      outDone: false,
      loadDone: false
    }
    setControlsEnabled(false)
  }, [setControlsEnabled])

  const beginTransitionIn = useCallback(() => {
    const tr = transitionRef.current
    if (tr.phase !== 'out' || !tr.outDone || !tr.loadDone) return
    tr.phase = 'in'
    tr.startTime = performance.now()

    const camera = cameraRef.current
    const controls = controlsRef.current
    if (camera && controls) {
      orientationAnimRef.current = null
      applyCameraOrientation(camera, controls, initialYawRef.current, initialPitchRef.current)
      camera.fov = WIDE_FOV
      camera.updateProjectionMatrix()
      lastReportedOrientationRef.current = {
        yaw: initialYawRef.current,
        pitch: initialPitchRef.current
      }
    }
  }, [])

  tryBeginInPhaseRef.current = beginTransitionIn

  const updateTransition = useCallback(() => {
    const tr = transitionRef.current
    const camera = cameraRef.current
    if (!camera || tr.phase === 'idle') return

    const elapsed = performance.now() - tr.startTime
    const t = Math.min(1, elapsed / TRANSITION_HALF_MS)
    const eased = easeInOutCubic(t)

    if (tr.phase === 'out') {
      camera.fov = THREE.MathUtils.lerp(BASE_FOV, ZOOM_FOV, eased)
      if (transitionOverlayRef.current) {
        const overlayOpacity = tr.outDone ? TRANSITION_OVERLAY_OPACITY : eased * TRANSITION_OVERLAY_OPACITY
        transitionOverlayRef.current.style.opacity = String(overlayOpacity)
      }
      if (t >= 1 && !tr.outDone) {
        tr.outDone = true
        if (transitionOverlayRef.current) {
          transitionOverlayRef.current.style.opacity = String(TRANSITION_OVERLAY_OPACITY)
        }
        tryBeginInPhaseRef.current()
      }
    } else if (tr.phase === 'in') {
      camera.fov = THREE.MathUtils.lerp(WIDE_FOV, BASE_FOV, eased)
      if (transitionOverlayRef.current) {
        transitionOverlayRef.current.style.opacity = String(TRANSITION_OVERLAY_OPACITY * (1 - eased))
      }
      if (t >= 1) {
        tr.phase = 'idle'
        camera.fov = BASE_FOV
        if (transitionOverlayRef.current) {
          transitionOverlayRef.current.style.opacity = '0'
        }
        setControlsEnabled(true)
      }
    }

    camera.updateProjectionMatrix()
  }, [setControlsEnabled])

  updateTransitionRef.current = updateTransition

  const startOrientationAnimation = useCallback((
    endYaw: number,
    endPitch: number,
    options?: {
      endFov?: number
      durationMs?: number
      easing?: 'linear' | 'easeInOut'
      onComplete?: () => void
    }
  ) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) {
      options?.onComplete?.()
      return
    }

    const current = getOrientationFromControls(controls, camera)
    orientationAnimRef.current = {
      startTime: performance.now(),
      startYaw: current.yaw,
      startPitch: current.pitch,
      endYaw,
      endPitch,
      startFov: camera.fov,
      endFov: options?.endFov ?? camera.fov,
      durationMs: Math.max(0, options?.durationMs ?? ORIENTATION_ANIM_MS),
      easing: options?.easing ?? 'easeInOut',
      onComplete: options?.onComplete
    }
    setControlsEnabled(false)
  }, [setControlsEnabled])

  const updateOrientationAnimation = useCallback(() => {
    const anim = orientationAnimRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!anim || !camera || !controls) return false

    const duration = Math.max(1, anim.durationMs)
    const t = Math.min(1, (performance.now() - anim.startTime) / duration)
    const eased = applyEasing(t, anim.easing)
    const yaw = lerpAngle(anim.startYaw, anim.endYaw, eased)
    const pitch = THREE.MathUtils.lerp(anim.startPitch, anim.endPitch, eased)
    applyCameraOrientation(camera, controls, yaw, pitch)
    camera.fov = THREE.MathUtils.lerp(anim.startFov, anim.endFov, eased)
    camera.updateProjectionMatrix()

    if (t >= 1) {
      const onComplete = anim.onComplete
      orientationAnimRef.current = null
      if (transitionRef.current.phase === 'idle') {
        setControlsEnabled(true)
      }
      reportOrientation()
      onComplete?.()
    }
    return true
  }, [reportOrientation, setControlsEnabled])

  updateOrientationAnimationRef.current = updateOrientationAnimation

  const updateDraggedHotspot = useCallback((clientX: number, clientY: number) => {
    const dragging = draggingHotspotRef.current
    if (!dragging || !editMode) return

    const spherical = raycastPanorama(clientX, clientY)
    if (spherical) {
      draggingHotspotRef.current = {
        ...dragging,
        yaw: spherical.yaw,
        pitch: spherical.pitch
      }
    }
  }, [editMode, raycastPanorama])

  const endHotspotDrag = useCallback((clientX?: number, clientY?: number) => {
    const dragging = draggingHotspotRef.current
    if (!dragging) return false

    if (clientX != null && clientY != null) {
      updateDraggedHotspot(clientX, clientY)
    }

    const finalDrag = draggingHotspotRef.current
    if (finalDrag) {
      if (finalDrag.id === PLACEMENT_PREVIEW_HOTSPOT_ID) {
        onPlaceHotspotRef.current?.(finalDrag.yaw, finalDrag.pitch)
      } else {
        onMoveHotspot?.(finalDrag.id, finalDrag.yaw, finalDrag.pitch)
      }
    }

    if (dragging.captureTarget?.hasPointerCapture(dragging.pointerId)) {
      dragging.captureTarget.releasePointerCapture(dragging.pointerId)
    }
    draggingHotspotRef.current = null
    pointerDownRef.current = null
    setIsDraggingHotspot(false)
    // Defer re-enabling OrbitControls so the release pointer event cannot start a camera spin.
    requestAnimationFrame(() => {
      setControlsEnabled(true)
    })
    return true
  }, [onMoveHotspot, setControlsEnabled, updateDraggedHotspot])

  const updateDraggedPopup = useCallback((clientX: number, clientY: number) => {
    const dragging = draggingPopupRef.current
    if (!dragging) return

    const next = {
      offsetX: dragging.startOffsetX + (clientX - dragging.startClientX),
      offsetY: dragging.startOffsetY + (clientY - dragging.startClientY)
    }
    popupDragVisualRef.current = next
    setPopupDragVisual(next)
  }, [])

  const endPopupDrag = useCallback((clientX?: number, clientY?: number) => {
    const dragging = draggingPopupRef.current
    if (!dragging) return false

    let finalOffsetX = dragging.startOffsetX
    let finalOffsetY = dragging.startOffsetY
    if (clientX != null && clientY != null) {
      finalOffsetX = dragging.startOffsetX + (clientX - dragging.startClientX)
      finalOffsetY = dragging.startOffsetY + (clientY - dragging.startClientY)
    } else if (popupDragVisualRef.current) {
      finalOffsetX = popupDragVisualRef.current.offsetX
      finalOffsetY = popupDragVisualRef.current.offsetY
    }

    onPopupOffsetChangeRef.current?.(dragging.hotspotId, finalOffsetX, finalOffsetY)

    if (dragging.captureTarget?.hasPointerCapture(dragging.pointerId)) {
      dragging.captureTarget.releasePointerCapture(dragging.pointerId)
    }
    draggingPopupRef.current = null
    popupDragVisualRef.current = null
    setPopupDragVisual(null)
    setIsDraggingPopup(false)
    requestAnimationFrame(() => {
      setControlsEnabled(true)
    })
    return true
  }, [setControlsEnabled])

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera - positioned at origin looking into the sphere
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.set(0, 0, 0)
    camera.lookAt(0, 0, -1) // Look into the inverted sphere
    cameraRef.current = camera

    // Renderer
    const coarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    const narrowViewport =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
    const isMobile = coarsePointer || narrowViewport
    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: false })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 2))
    renderer.setClearColor(0x000000, 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Controls - allow full 360 rotation
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    // Dolly zoom is useless here: syncPanoramaCameraAtOrigin resets position every frame.
    // Zoom is handled via FOV on wheel (and pinch) below.
    controls.enableZoom = false
    controls.enablePan = false
    controls.minDistance = 0.1
    controls.maxDistance = 10
    controls.rotateSpeed = -0.5 // Negative for natural rotation
    // Set target to look forward horizontally (not up at ceiling)
    controls.target.set(0, 0, -1)
    // Reset camera rotation to look forward horizontally
    // For equirectangular panoramas, we want to look forward (along -Z) initially
    camera.rotation.set(0, 0, 0) // Reset rotation
    camera.lookAt(0, 0, -1) // Look forward
    controls.update() // Update controls to match camera
    controlsRef.current = controls

    const handleControlsChange = () => {
      reportOrientation()
    }
    controls.addEventListener('change', handleControlsChange)

    const applyUserFovZoom = (deltaFov: number) => {
      if (!controls.enabled) return
      if (transitionRef.current.phase !== 'idle') return
      if (orientationAnimRef.current) return
      const next = THREE.MathUtils.clamp(camera.fov + deltaFov, MIN_USER_FOV, MAX_USER_FOV)
      if (Math.abs(next - camera.fov) < 1e-4) return
      camera.fov = next
      camera.updateProjectionMatrix()
      syncLiveLookFrameRef.current()
    }

    const handleWheelZoom = (event: WheelEvent) => {
      if (!controls.enabled) return
      if (transitionRef.current.phase !== 'idle') return
      if (orientationAnimRef.current) return
      event.preventDefault()
      // Scroll down / pinch-out → larger FOV (zoom out); scroll up → smaller FOV (zoom in)
      applyUserFovZoom(event.deltaY * WHEEL_FOV_SPEED)
    }
    renderer.domElement.addEventListener('wheel', handleWheelZoom, { passive: false })

    // Pinch-to-zoom → FOV (OrbitControls pinch is disabled with enableZoom=false)
    let pinchStartDistance = 0
    let pinchStartFov = camera.fov
    const getTouchDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.hypot(dx, dy)
    }
    const handleTouchStartPinch = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !controls.enabled) return
      pinchStartDistance = getTouchDistance(event.touches)
      pinchStartFov = camera.fov
    }
    const handleTouchMovePinch = (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinchStartDistance <= 0) return
      if (!controls.enabled) return
      if (transitionRef.current.phase !== 'idle') return
      if (orientationAnimRef.current) return
      event.preventDefault()
      const distance = getTouchDistance(event.touches)
      if (distance <= 0) return
      // Spread fingers → zoom in (smaller FOV); pinch → zoom out
      const next = THREE.MathUtils.clamp(
        pinchStartFov * (pinchStartDistance / distance),
        MIN_USER_FOV,
        MAX_USER_FOV
      )
      if (Math.abs(next - camera.fov) < 1e-4) return
      camera.fov = next
      camera.updateProjectionMatrix()
      syncLiveLookFrameRef.current()
    }
    const handleTouchEndPinch = () => {
      pinchStartDistance = 0
    }
    renderer.domElement.addEventListener('touchstart', handleTouchStartPinch, { passive: true })
    renderer.domElement.addEventListener('touchmove', handleTouchMovePinch, { passive: false })
    renderer.domElement.addEventListener('touchend', handleTouchEndPinch, { passive: true })
    renderer.domElement.addEventListener('touchcancel', handleTouchEndPinch, { passive: true })

    // Create sphere geometry for 360 view
    const geometry = new THREE.SphereGeometry(500, 60, 40)
    geometry.scale(-1, 1, 1) // Invert sphere to view from inside
    
    // Material - Use MeshBasicMaterial which works well for panoramas
    // FrontSide + inverted X scale (above) shows the inner sphere surface from the camera at origin.
    // BackSide would cull those faces and produce a black viewport.
    const material = new THREE.MeshBasicMaterial({
      side: THREE.FrontSide,
      color: 0x000000 // Black fallback until the panorama texture loads
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    meshRef.current = mesh

    applyCameraOrientation(camera, controls, initialYaw, initialPitch)
    reportOrientation()
    
    console.log('[Panorama360] Scene initialized:', {
      hasMesh: !!mesh,
      hasMaterial: !!material,
      geometryVertices: geometry.attributes.position.count,
      cameraPosition: camera.position,
      cameraTarget: camera.getWorldDirection(new THREE.Vector3())
    })
    
    // Initialize KTX2Loader once (reuse single instance to avoid "Multiple active KTX2 loaders" warning)
    // Dispose any existing loader first (important during hot reloads)
    if (ktx2LoaderRef.current) {
      try {
        ktx2LoaderRef.current.dispose()
      } catch (err) {
        console.warn('[Panorama360] Warning disposing old KTX2Loader:', err)
      }
      ktx2LoaderRef.current = null
    }
    
    ktx2LoaderRef.current = new KTX2Loader()
    
    // Set transcoder path (try Needle CDN first, then fallbacks)
    const transcoderPaths = [
      'https://cdn.needle.tools/static/three/0.179.1/basis2/',
      `https://cdn.jsdelivr.net/npm/three@${THREE.REVISION}/examples/jsm/libs/basis/`,
      '/basis/'
    ]
    
    let transcoderPath = transcoderPaths[0]
    try {
      ktx2LoaderRef.current.setTranscoderPath(transcoderPath)
      console.log('[Panorama360] KTX2Loader initialized with transcoder path:', transcoderPath)
    } catch (err) {
      console.warn('[Panorama360] Failed to set transcoder path, trying fallback:', err)
      transcoderPath = transcoderPaths[1]
      ktx2LoaderRef.current.setTranscoderPath(transcoderPath)
    }
    
    if (renderer) {
      ktx2LoaderRef.current.detectSupport(renderer)
    }

    // Animation loop — cancel + disposed guard on unmount (LIFE-3).
    const animationLoop = createPanoramaAnimationLoop(() => {
      const isAnimatingOrientation = updateOrientationAnimationRef.current()
      if (controls && camera && !isAnimatingOrientation) {
        controls.update()
        syncPanoramaCameraAtOrigin(camera, controls)
      }
      updateTransitionRef.current()
      // Keep overlay look refs in lockstep with the panorama camera (no React lag).
      syncLiveLookFrameRef.current()
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }

      if (container && camera) {
        const width = container.clientWidth
        const height = container.clientHeight
        const projected: ProjectedHotspot[] = []
        const draggingHotspot = draggingHotspotRef.current
        const projectHotspot = (hotspot: PanoramaHotspot) => {
          const yaw = draggingHotspot?.id === hotspot.id ? draggingHotspot.yaw : hotspot.yaw
          const pitch = draggingHotspot?.id === hotspot.id ? draggingHotspot.pitch : hotspot.pitch
          const point = sphericalToCartesian(yaw, pitch, PANORAMA_SPHERE_RADIUS * 0.98)
          const screen = projectToScreen(point, camera, width, height)
          if (screen?.visible) {
            projected.push({ hotspot, x: screen.x, y: screen.y })
          }
        }

        for (const hotspot of hotspotsRef.current) {
          projectHotspot(hotspot)
        }

        const preview = placementPreviewRef.current
        if (preview) {
          projectHotspot(preview)
        }
        setProjectedHotspots((prev) => {
          if (prev.length !== projected.length) return projected
          for (let i = 0; i < projected.length; i++) {
            if (
              prev[i].hotspot.id !== projected[i].hotspot.id ||
              hotspotProjectionSignature(prev[i].hotspot) !== hotspotProjectionSignature(projected[i].hotspot) ||
              Math.abs(prev[i].x - projected[i].x) > 1 ||
              Math.abs(prev[i].y - projected[i].y) > 1
            ) {
              return projected
            }
          }
          return prev
        })
      }
    })
    animationLoop.start()

    // Initial render
    renderer.render(scene, camera)

    // Handle resize (window + flex layout changes via ResizeObserver)
    const handleResize = () => {
      if (animationLoop.isDisposed()) return
      if (!containerRef.current || !camera || !renderer) return
      const newWidth = containerRef.current.clientWidth
      const newHeight = containerRef.current.clientHeight
      if (newWidth === 0 || newHeight === 0) return
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    const resizeRafId = requestAnimationFrame(handleResize)

    return () => {
      // Stop RAF before tearing down WebGL resources so late frames no-op.
      animationLoop.stop()
      cancelAnimationFrame(resizeRafId)
      controls.removeEventListener('change', handleControlsChange)
      renderer.domElement.removeEventListener('wheel', handleWheelZoom)
      renderer.domElement.removeEventListener('touchstart', handleTouchStartPinch)
      renderer.domElement.removeEventListener('touchmove', handleTouchMovePinch)
      renderer.domElement.removeEventListener('touchend', handleTouchEndPinch)
      renderer.domElement.removeEventListener('touchcancel', handleTouchEndPinch)
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      if (textureRef.current) {
        textureRef.current.dispose()
      }
      // Dispose KTX2 loader to prevent "Multiple active KTX2 loaders" warning
      if (ktx2LoaderRef.current) {
        ktx2LoaderRef.current.dispose()
        ktx2LoaderRef.current = null
      }
      meshRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return

    // Guided tour camera owns the next tween — don't snap overwrite.
    if (guidedCameraCommandKey > lastGuidedCameraCommandKeyRef.current) {
      return
    }

    const shouldAnimate =
      orientationFocusKey > 0 &&
      orientationFocusKey !== lastOrientationFocusKeyRef.current

    lastOrientationFocusKeyRef.current = orientationFocusKey

    if (shouldAnimate) {
      startOrientationAnimation(initialYaw, initialPitch)
      return
    }

    if (transitionRef.current.phase !== 'idle') {
      return
    }

    if (orientationAnimRef.current) {
      return
    }

    orientationAnimRef.current = null
    applyCameraOrientation(cameraRef.current, controlsRef.current, initialYaw, initialPitch)
    reportOrientation()
  }, [initialYaw, initialPitch, orientationFocusKey, imageUrl, reportOrientation, startOrientationAnimation, guidedCameraCommandKey])

  useEffect(() => {
    if (
      guidedCameraCommandKey <= 0 ||
      guidedCameraCommandKey === lastGuidedCameraCommandKeyRef.current
    ) {
      return
    }
    lastGuidedCameraCommandKeyRef.current = guidedCameraCommandKey
    if (!guidedCameraCommand) {
      onGuidedCameraCompleteRef.current?.()
      return
    }

    const durationMs = guidedCameraCommand.durationMs ?? ORIENTATION_ANIM_MS
    const endFov = guidedCameraCommand.fov
    const complete = () => onGuidedCameraCompleteRef.current?.()

    if (durationMs <= 0 && cameraRef.current && controlsRef.current) {
      applyCameraOrientation(
        cameraRef.current,
        controlsRef.current,
        guidedCameraCommand.yaw,
        guidedCameraCommand.pitch
      )
      if (typeof endFov === 'number') {
        cameraRef.current.fov = endFov
        cameraRef.current.updateProjectionMatrix()
      }
      reportOrientation()
      complete()
      return
    }

    startOrientationAnimation(guidedCameraCommand.yaw, guidedCameraCommand.pitch, {
      endFov,
      durationMs,
      easing: guidedCameraCommand.easing ?? 'easeInOut',
      onComplete: complete
    })
  }, [guidedCameraCommand, guidedCameraCommandKey, reportOrientation, startOrientationAnimation])

  const prevGuidedInfoPopupIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevGuidedInfoPopupIdRef.current
    prevGuidedInfoPopupIdRef.current = guidedInfoPopupId ?? null

    if (guidedInfoPopupId == null) {
      if (prev != null && !editMode) clearInfoPopup()
      return
    }
    if (editMode) return
    const hotspot = hotspotsRef.current.find((h) => h.id === guidedInfoPopupId)
    if (hotspot && hotspot.type === 'info') {
      setInfoPopup(hotspot)
      clearUrlIframe()
    }
  }, [guidedInfoPopupId, editMode, clearInfoPopup, clearUrlIframe])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    updateDraggedHotspot(e.clientX, e.clientY)
    updateDraggedPopup(e.clientX, e.clientY)
  }, [updateDraggedHotspot, updateDraggedPopup])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (endPopupDrag(e.clientX, e.clientY)) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    if (endHotspotDrag(e.clientX, e.clientY)) {
      e.stopPropagation()
      e.preventDefault()
      return
    }

    const down = pointerDownRef.current
    pointerDownRef.current = null
    if (!down || !containerRef.current) return
    if ((e.target as HTMLElement).closest('.panorama-hotspot-marker')) return
    if ((e.target as HTMLElement).closest('.panorama-hotspot-info-popup')) return

    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    if (moved > 6) return

    const spherical = raycastPanorama(e.clientX, e.clientY)
    if (!spherical) return

    if (editMode) {
      const selectedId = selectedHotspotIdRef.current
      if (selectedId && !placementModeRef.current) {
        onMoveHotspot?.(selectedId, spherical.yaw, spherical.pitch)
      } else {
        onPlaceHotspot?.(spherical.yaw, spherical.pitch)
      }
    }
  }, [editMode, endHotspotDrag, endPopupDrag, onMoveHotspot, onPlaceHotspot, raycastPanorama])

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (endPopupDrag(e.clientX, e.clientY)) {
      e.stopPropagation()
      e.preventDefault()
      return
    }
    if (endHotspotDrag(e.clientX, e.clientY)) {
      e.stopPropagation()
      e.preventDefault()
    }
  }, [endHotspotDrag, endPopupDrag])

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (draggingPopupRef.current) {
      endPopupDrag(e.clientX, e.clientY)
      return
    }
    if (!draggingHotspotRef.current) return
    endHotspotDrag(e.clientX, e.clientY)
  }, [endHotspotDrag, endPopupDrag])

  const handleMarkerPointerDown = useCallback((e: React.PointerEvent, hotspot: PanoramaHotspot) => {
    if (!editMode) return
    e.stopPropagation()
    e.preventDefault()
    if (hotspot.id !== PLACEMENT_PREVIEW_HOTSPOT_ID) {
      onHotspotSelect?.(hotspot.id, hotspot.id !== selectedHotspotIdRef.current)
    }
    const marker = e.currentTarget as HTMLElement
    draggingHotspotRef.current = {
      id: hotspot.id,
      pointerId: e.pointerId,
      captureTarget: marker,
      yaw: hotspot.yaw,
      pitch: hotspot.pitch
    }
    pointerDownRef.current = null
    marker.setPointerCapture(e.pointerId)
    setControlsEnabled(false)
    setIsDraggingHotspot(true)
  }, [editMode, onHotspotSelect, setControlsEnabled])

  const handlePopupHeaderPointerDown = useCallback((e: React.PointerEvent, hotspot: PanoramaHotspot) => {
    if (!editMode) return
    e.stopPropagation()
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    draggingPopupRef.current = {
      hotspotId: hotspot.id,
      pointerId: e.pointerId,
      captureTarget: handle,
      startOffsetX: hotspot.popupOffsetX ?? 0,
      startOffsetY: hotspot.popupOffsetY ?? 0,
      startClientX: e.clientX,
      startClientY: e.clientY
    }
    pointerDownRef.current = null
    handle.setPointerCapture(e.pointerId)
    setControlsEnabled(false)
    setIsDraggingPopup(true)
  }, [editMode, setControlsEnabled])

  useEffect(() => {
    if (!isDraggingHotspot && !isDraggingPopup) return

    const handleWindowPointerUp = (event: PointerEvent) => {
      endPopupDrag(event.clientX, event.clientY)
      endHotspotDrag(event.clientX, event.clientY)
    }
    const handleWindowPointerCancel = (event: PointerEvent) => {
      endPopupDrag(event.clientX, event.clientY)
      endHotspotDrag(event.clientX, event.clientY)
    }
    const handleWindowBlur = () => {
      endPopupDrag()
      endHotspotDrag()
    }

    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerCancel)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerCancel)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [endHotspotDrag, endPopupDrag, isDraggingHotspot, isDraggingPopup])

  useEffect(() => {
    if (!editMode) {
      endHotspotDrag()
      endPopupDrag()
    }
  }, [editMode, endHotspotDrag, endPopupDrag])

  useEffect(() => {
    if (!urlIframe && !urlIframeError) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearUrlIframe()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [urlIframe, urlIframeError, clearUrlIframe])

  useEffect(() => {
    if (editMode) {
      clearInfoPopup()
      clearUrlIframe()
    }
  }, [editMode, clearInfoPopup, clearUrlIframe])

  useEffect(() => {
    const wasPreview = prevPreviewModeRef.current
    prevPreviewModeRef.current = previewMode

    if (previewMode && !wasPreview) {
      clearInfoPopup()
      clearUrlIframe()
      endHotspotDrag()
      endPopupDrag()
    }
    if (!previewMode && wasPreview) {
      clearInfoPopup()
      clearUrlIframe()
      endHotspotDrag()
      endPopupDrag()
    }
  }, [previewMode, clearInfoPopup, clearUrlIframe, endHotspotDrag, endPopupDrag])

  const handleHotspotActivate = useCallback((hotspot: PanoramaHotspot) => {
    if (editMode) {
      onHotspotSelect?.(hotspot.id, hotspot.id !== selectedHotspotIdRef.current)
      return
    }
    if (hotspot.type === 'info') {
      const latest = hotspotsRef.current.find((h) => h.id === hotspot.id) ?? hotspot
      setInfoPopup((prev) => (prev?.id === hotspot.id ? null : latest))
      clearUrlIframe()
      return
    }
    if (hotspot.type === 'url' && hotspot.openInIframe) {
      const resolved = resolvePanoramaUrl(hotspot.url)
      if (!resolved) {
        setUrlIframe(null)
        setUrlIframeError('This hotspot has an invalid URL.')
        clearInfoPopup()
        return
      }
      clearInfoPopup()
      setUrlIframeError(null)
      setUrlIframe((prev) =>
        prev?.url === resolved ? null : { url: resolved, label: hotspot.label }
      )
      return
    }
    onHotspotClick?.(hotspot)
  }, [editMode, onHotspotClick, onHotspotSelect, clearInfoPopup, clearUrlIframe])

  // Helper function to ensure KTX2 transcoder is ready before loading
  const ensureTranscoderReady = async (): Promise<void> => {
    if (!ktx2LoaderRef.current) {
      throw new Error('KTX2Loader not available')
    }
    
    try {
      // Wait for transcoder to be ready with timeout
      const transcoderPending = (ktx2LoaderRef.current as any).transcoderPending
      if (transcoderPending) {
        try {
          // Wait for transcoder with timeout (5 seconds)
          await Promise.race([
            transcoderPending,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Transcoder load timeout')), 5000))
          ])
          // Give it a small delay to ensure it's fully initialized
          await new Promise(resolve => setTimeout(resolve, 100))
          console.log('[Panorama360] ✅ KTX2 transcoder ready')
        } catch (pendingError) {
          console.warn('[Panorama360] ⚠️ Transcoder pending promise rejected or timed out:', pendingError)
          // Continue anyway - transcoder might still work
        }
      } else {
        console.log('[Panorama360] KTX2 transcoder already ready (no pending promise)')
      }
    } catch (err) {
      console.warn('[Panorama360] ⚠️ Error checking transcoder status:', err)
      // Continue anyway - transcoder might still work
    }
  }

  // Load image
  useEffect(() => {
    if (!imageUrl || !sceneRef.current) return

    const isPanoramaSwitch =
      prevImageUrlRef.current !== undefined && prevImageUrlRef.current !== imageUrl
    prevImageUrlRef.current = imageUrl

    if (isPanoramaSwitch) {
      startTransitionOut()
    } else {
      transitionRef.current = createIdleTransition()
    }

    setIsLoading(true)
    setError(null)

    let cancelled = false

    const releaseCurrentPanoramaTexture = async () => {
      const mesh = sceneRef.current?.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh | undefined
      if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
        const mat = mesh.material as THREE.MeshBasicMaterial
        if (mat.map) {
          mat.map = null
          mat.needsUpdate = true
        }
      }
      if (sceneRef.current?.background && sceneRef.current.background instanceof THREE.Texture) {
        sceneRef.current.background = null
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
      if (textureRef.current) {
        try {
          textureRef.current.dispose()
        } catch (err) {
          console.warn('[Panorama360] Warning disposing old texture:', err)
        }
        textureRef.current = null
      }
      await new Promise(resolve => requestAnimationFrame(resolve))
    }

    const waitForTextureUpload = async (texture: THREE.Texture, frames = 2) => {
      for (let i = 0; i < frames; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve))
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current)
        }
      }
      const textureProperties = rendererRef.current?.properties.get(texture) as { __webglTexture?: unknown } | undefined
      return textureProperties?.__webglTexture !== undefined
    }

    const loadImage = async () => {
      let url: string | null = null
      try {
        const mesh = sceneRef.current?.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh | undefined

        // On panorama switch keep the previous texture visible under the black overlay
        // until the next texture is loaded and uploaded to the GPU.
        if (!isPanoramaSwitch) {
          await releaseCurrentPanoramaTexture()
        }
        
        let texture: THREE.Texture | null = null

        // Convert File to URL if needed — keep blob URL alive until unmount/next load
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = null
        }
        if (imageUrl instanceof File) {
          url = URL.createObjectURL(imageUrl)
          objectUrlRef.current = url
        } else {
          url = imageUrl
        }

        const fileName = imageUrl instanceof File ? imageUrl.name : url.split('/').pop() || ''
        const extension = fileName.toLowerCase().split('.').pop() || ''

        console.log('[Panorama360] Loading image:', fileName, 'Extension:', extension)

        // Determine loader based on extension
        if (extension === 'ktx2') {
          // Validate KTX2 file magic signature before loading
          // This helps catch invalid files early (per https://forum.babylonjs.com/t/how-to-use-ktx2-file-in-texture-texture-missing-ktx-identifier/16799)
          try {
            const response = await fetch(url!)
            if (!response.ok) {
              throw new Error(`Failed to fetch KTX2 file: HTTP ${response.status}`)
            }
            const arrayBuffer = await response.arrayBuffer()
            
            // Check KTX2 magic signature (first 12 bytes)
            // Should be: [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A]
            if (arrayBuffer.byteLength < 12) {
              throw new Error('KTX2 file too small (missing magic signature)')
            }
            
            const ktx2Magic = [0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A]
            const header = new Uint8Array(arrayBuffer, 0, 12)
            let isValidKTX2 = true
            for (let i = 0; i < 12; i++) {
              if (header[i] !== ktx2Magic[i]) {
                isValidKTX2 = false
                break
              }
            }
            
            if (!isValidKTX2) {
              const headerHex = Array.from(header).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')
              console.error('[Panorama360] ❌ Invalid KTX2 magic signature. First 12 bytes:', headerHex)
              throw new Error(
                'Invalid KTX2 file: missing KTX2 magic signature. ' +
                'The file may be corrupted or not a valid KTX2 file. ' +
                'Expected magic bytes: 0xAB 0x4B 0x54 0x58 0x20 0x32 0x30 0xBB 0x0D 0x0A 0x1A 0x0A'
              )
            }
            
            console.log('[Panorama360] ✅ KTX2 magic signature validated')
          } catch (validationError) {
            // If validation fails, still try to load (the loader might give a better error)
            console.warn('[Panorama360] KTX2 validation warning:', validationError)
            if (validationError instanceof Error && validationError.message.includes('magic signature')) {
              throw validationError // Re-throw magic signature errors
            }
          }
          
          // KTX2 loader - use the single instance initialized in setup
          if (!ktx2LoaderRef.current) {
            throw new Error('KTX2Loader not initialized. This should not happen.')
          }
          
          const ktx2Loader = ktx2LoaderRef.current

          if (!url) {
            throw new Error('URL is null')
          }
          
          const ktx2Url = url // TypeScript narrowing
          
          // CRITICAL: Wait for transcoder to be ready before loading
          // This ensures the Basis transcoder is fully loaded and initialized
          // Based on HDRSystem.ts implementation - transcoder must be ready before texture load
          console.log('[Panorama360] Waiting for KTX2 transcoder to be ready...')
          await ensureTranscoderReady()
          
          // Note: Old texture was already disposed at the start of loadImage
          
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            // Add timeout to catch if loader hangs
            const timeout = setTimeout(() => {
              console.error('[Panorama360] KTX2 load timeout after 30 seconds')
              reject(new Error('KTX2 load timeout - file may be corrupted or incompatible'))
            }, 30000)
            
            ktx2Loader.load(
              ktx2Url,
              (loadedTexture) => {
                clearTimeout(timeout)
                
                if (!loadedTexture) {
                  reject(new Error('KTX2 loader returned undefined texture'))
                  return
                }
                
                // Set texture properties IMMEDIATELY in the callback, before texture is uploaded to GPU
                // This must happen synchronously before the texture is used anywhere
                // Once a texture is uploaded to GPU (immutable), these properties cannot be changed
                try {
                  // UV-mapped inner sphere uses standard UV sampling (not env-map mapping)
                  loadedTexture.mapping = THREE.UVMapping
                  // For KTX2 textures on material.map, flipY should be true to match regular images
                  // Regular images use flipY = true by default, and they work correctly
                  // This ensures KTX2 textures display with the same orientation as regular images
                  loadedTexture.flipY = true
                  // KTX2Loader automatically parses colorSpace from the container's DFD
                  // With the encoding fix (isSetKTX2SRGBTransferFunc: true), the loader should now
                  // automatically set SRGBColorSpace for LDR KTX2 textures
                  const loaderColorSpace = (loadedTexture as any).colorSpace
                  console.log('[Panorama360] KTX2Loader set colorSpace:', loaderColorSpace)
                  // Only override if loader didn't set it correctly (should be SRGBColorSpace for LDR KTX2)
                  if ('colorSpace' in loadedTexture && loaderColorSpace !== THREE.SRGBColorSpace) {
                    console.log('[Panorama360] Overriding colorSpace from', loaderColorSpace, 'to SRGBColorSpace for LDR KTX2')
                    ;(loadedTexture as any).colorSpace = THREE.SRGBColorSpace
                  } else {
                    console.log('[Panorama360] ✅ KTX2Loader set colorSpace correctly:', loaderColorSpace)
                  }
                  loadedTexture.wrapS = THREE.RepeatWrapping
                  loadedTexture.wrapT = THREE.RepeatWrapping
                  // For compressed formats (ASTC, ETC2, etc.), KTX2Loader sets appropriate filters
                  // Don't override filters for compressed formats - they're usually already correct
                  const isCompressed = loadedTexture.format > 0x8C00 // Compressed formats start at 0x8C00
                  if (!isCompressed) {
                    // Uncompressed format - set linear filtering
                    loadedTexture.minFilter = THREE.LinearFilter
                    loadedTexture.magFilter = THREE.LinearFilter
                  }
                  // Mark texture as suitable for two-sided materials
                  loadedTexture.userData.twoSidedCompatible = true
                  // Set needsUpdate to ensure texture is uploaded
                  loadedTexture.needsUpdate = true
                } catch (propError) {
                  console.warn('[Panorama360] Warning: Could not set texture properties (texture may already be immutable):', propError)
                  // Continue anyway - properties might already be set correctly
                }
                
                const image = loadedTexture.image as { width?: number; height?: number; data?: unknown } | null
                console.log('[Panorama360] KTX2 texture loaded:', {
                  textureType: loadedTexture.constructor.name,
                  format: loadedTexture.format,
                  formatHex: '0x' + loadedTexture.format.toString(16),
                  dataType: loadedTexture.type,
                  typeHex: '0x' + loadedTexture.type.toString(16),
                  mapping: loadedTexture.mapping,
                  width: image?.width,
                  height: image?.height,
                  hasImage: !!loadedTexture.image,
                  hasImageData: !!image?.data,
                  imageType: image?.constructor?.name,
                  hasUserData: !!loadedTexture.userData,
                  userDataKeys: loadedTexture.userData ? Object.keys(loadedTexture.userData) : [],
                  faceCount: loadedTexture.userData?.ktx2FormatInfo?.faceCount,
                  isKTX2: loadedTexture.userData?.isKTX2,
                  textureColorSpace: (loadedTexture as any).colorSpace,
                  textureFlipY: loadedTexture.flipY,
                  needsUpdate: loadedTexture.needsUpdate,
                  wrapS: loadedTexture.wrapS,
                  wrapT: loadedTexture.wrapT,
                  minFilter: loadedTexture.minFilter,
                  magFilter: loadedTexture.magFilter
                })
                
                // KTX2Loader handles transcoding automatically
                // The texture should be ready when the callback is called
                // Resolve immediately - the texture is ready to use
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                clearTimeout(timeout)
                reject(new Error(`KTX2 load failed: ${err}`))
              }
            )
          })
        } else if (extension === 'hdr') {
          // HDR loader
          if (!url) {
            throw new Error('URL is null')
          }
          
          const hdrUrl = url // TypeScript narrowing
          const rgbeLoader = new RGBELoader()
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            rgbeLoader.load(
              hdrUrl,
              (loadedTexture) => {
                const image = loadedTexture.image as { width?: number; height?: number; data?: unknown } | null
                console.log('[Panorama360] HDR texture loaded:', {
                  textureType: loadedTexture.constructor.name,
                  mapping: loadedTexture.mapping,
                  format: loadedTexture.format,
                  formatName: Object.keys(THREE).find(key => THREE[key as keyof typeof THREE] === loadedTexture.format),
                  dataType: loadedTexture.type,
                  typeName: Object.keys(THREE).find(key => THREE[key as keyof typeof THREE] === loadedTexture.type),
                  width: image?.width,
                  height: image?.height,
                  hasData: !!image?.data,
                  dataTypeName: image?.data ? (image.data as { constructor?: { name?: string } }).constructor?.name : undefined
                })
                loadedTexture.mapping = THREE.EquirectangularReflectionMapping
                loadedTexture.colorSpace = THREE.LinearSRGBColorSpace
                loadedTexture.flipY = true // Flip Y to correct orientation (ground down, sky up)
                // Ensure texture works correctly with two-sided materials
                loadedTexture.wrapS = THREE.RepeatWrapping
                loadedTexture.wrapT = THREE.RepeatWrapping
                // Mark texture as suitable for two-sided materials
                loadedTexture.userData.twoSidedCompatible = true
                loadedTexture.needsUpdate = true
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                reject(new Error(`HDR load failed: ${err}`))
              }
            )
          })
        } else if (extension === 'exr') {
          // EXR loader
          if (!url) {
            throw new Error('URL is null')
          }
          
          const exrUrl = url // TypeScript narrowing
          const exrLoader = new EXRLoader()
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            exrLoader.load(
              exrUrl,
              (loadedTexture) => {
                loadedTexture.mapping = THREE.EquirectangularReflectionMapping
                loadedTexture.colorSpace = THREE.LinearSRGBColorSpace
                loadedTexture.flipY = true // Flip Y to correct orientation (ground down, sky up)
                // Ensure texture works correctly with two-sided materials
                loadedTexture.wrapS = THREE.RepeatWrapping
                loadedTexture.wrapT = THREE.RepeatWrapping
                // Mark texture as suitable for two-sided materials
                loadedTexture.userData.twoSidedCompatible = true
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                reject(new Error(`EXR load failed: ${err}`))
              }
            )
          })
        } else {
          // Regular image (JPG, PNG, etc.)
          if (!url) {
            throw new Error('URL is null')
          }
          
          const imageUrl = url // TypeScript narrowing
          const loader = new THREE.TextureLoader()
          texture = await new Promise<THREE.Texture>((resolve, reject) => {
            loader.load(
              imageUrl,
              (loadedTexture) => {
                loadedTexture.mapping = THREE.UVMapping
                loadedTexture.colorSpace = THREE.SRGBColorSpace
                loadedTexture.wrapS = THREE.ClampToEdgeWrapping
                loadedTexture.wrapT = THREE.ClampToEdgeWrapping
                loadedTexture.needsUpdate = true
                resolve(loadedTexture)
              },
              undefined,
              (err) => {
                reject(new Error(`Image load failed: ${err}`))
              }
            )
          })
        }

        if (!texture) {
          throw new Error('Failed to load texture')
        }

        if (isPanoramaSwitch) {
          await releaseCurrentPanoramaTexture()
        }

        // Update material with texture - works for all formats including HDR/EXR
        // Note: mesh was already found at the start of loadImage
        
        // For HDR/EXR: Use scene.background (standard Three.js approach for HDR panoramas)
        if ((extension === 'hdr' || extension === 'exr') && sceneRef.current && rendererRef.current) {
          const hdrImage = texture.image as { width?: number; height?: number } | null
          console.log('[Panorama360] Applying HDR/EXR texture to scene.background...', {
            textureWidth: hdrImage?.width,
            textureHeight: hdrImage?.height,
            format: texture.format,
            dataType: texture.type,
            hasImage: !!texture.image
          })
          
          // Validate texture has data
          if (!texture.image) {
            console.error('[Panorama360] ❌ HDR texture has no image!')
            throw new Error('HDR texture has no image')
          }
          
          // Note: Old texture was already disposed at the start of loadImage
          
          // Ensure texture properties
          texture.mapping = THREE.EquirectangularReflectionMapping
          texture.colorSpace = THREE.LinearSRGBColorSpace
          texture.flipY = true
          texture.needsUpdate = true
          
          // Configure renderer for HDR FIRST
          if (rendererRef.current) {
            rendererRef.current.toneMapping = THREE.ACESFilmicToneMapping
            rendererRef.current.toneMappingExposure = 1.0
            rendererRef.current.outputColorSpace = THREE.SRGBColorSpace
            rendererRef.current.setClearColor(0x000000, 1.0) // Black, opaque
          }
          
          // Set scene.background (standard way for HDR panoramas)
          sceneRef.current.background = texture
          textureRef.current = texture
          
          // Force immediate render
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current)
          }

          await waitForTextureUpload(texture)

          const hdrImageFinal = texture.image as { width?: number; height?: number } | null
          console.log('[Panorama360] ✅ HDR/EXR texture applied to scene.background', {
            hasBackground: !!sceneRef.current.background,
            backgroundType: sceneRef.current.background?.constructor.name,
            textureWidth: hdrImageFinal?.width,
            textureHeight: hdrImageFinal?.height
          })
        }
        // For KTX2 files - use material.map (compressed textures work better on geometry)
        else if (extension === 'ktx2' && mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
          const ktx2Image = texture.image as { width?: number; height?: number } | null
          
          console.log('[Panorama360] Applying KTX2 texture to material.map...', {
            textureWidth: ktx2Image?.width,
            textureHeight: ktx2Image?.height,
            format: texture.format,
            dataType: texture.type,
            hasImage: !!texture.image,
            textureType: texture.constructor.name
          })
          
          // Validate texture has data
          if (!texture.image) {
            console.error('[Panorama360] ❌ KTX2 texture has no image!')
            throw new Error('KTX2 texture has no image')
          }
          
          // Note: Texture properties (mapping, colorSpace, flipY, needsUpdate) are already set
          // in the loader callback BEFORE the texture is uploaded to GPU. Do NOT modify them here
          // as the texture is now immutable after upload.
          
          // Clear scene background if it was set (HDR/EXR uses scene.background, KTX2 uses material.map)
          if (sceneRef.current) {
            sceneRef.current.background = null
          }
          
          // Apply texture to material (same as regular images - keep it simple)
          const mat = mesh.material
          
          // CRITICAL: Dispose of old texture map if it exists
          if (mat.map) {
            mat.map.dispose()
            mat.map = null
          }
          
          mat.map = texture
          mat.color.setHex(0xffffff)
          mat.toneMapped = true
          mat.side = THREE.FrontSide
          mat.visible = true // Ensure material is visible
          mat.needsUpdate = true
          texture.needsUpdate = true
          textureRef.current = texture
          
          // Ensure mesh is visible
          mesh.visible = true
          
          // Force material to update by creating a new material if needed
          // This ensures the texture is properly bound
          if (rendererRef.current) {
            rendererRef.current.state.reset()
          }
          
          // Reset renderer settings to defaults (same as regular images)
          // HDR/EXR may have changed tone mapping settings, so reset them for KTX2
          if (rendererRef.current) {
            rendererRef.current.toneMapping = THREE.NoToneMapping // Default for LDR
            rendererRef.current.toneMappingExposure = 1.0 // Default exposure
            rendererRef.current.outputColorSpace = THREE.SRGBColorSpace // Default for LDR
            rendererRef.current.setClearColor(0x000000, 1.0) // Black, opaque
          }
          
          // Force immediate render to trigger texture upload and transcoding
          // KTX2Loader handles transcoding automatically, but we need to render to trigger it
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current)
          }
          
          // Render a few more frames to allow GPU transcoding to complete
          // Compressed textures need time to be transcoded by the GPU
          // The KTX2Loader handles transcoding automatically, but we need to render to trigger it
          console.log('[Panorama360] Starting wait loop for GPU transcoding...')
          for (let i = 0; i < 30; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve))
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current)
            }
            // Log every 5 frames to track progress
            if ((i + 1) % 5 === 0) {
              const textureProperties = rendererRef.current?.properties.get(texture) as any
              const textureUploaded = textureProperties?.__webglTexture !== undefined
              console.log(`[Panorama360] Wait loop frame ${i + 1}/30, texture uploaded: ${textureUploaded}`)
            }
          }
          console.log('[Panorama360] Wait loop completed')
          
          const ktx2ImageFinal = texture.image as { width?: number; height?: number; data?: unknown } | null
          const textureProperties = rendererRef.current?.properties.get(texture) as any
          const textureUploaded = textureProperties?.__webglTexture !== undefined
          const gl = rendererRef.current?.getContext()
          const textureBound = gl && textureProperties?.__webglTexture && gl.isTexture(textureProperties.__webglTexture)
          
          console.log('[Panorama360] ✅ KTX2 texture applied to material.map', {
            hasMap: !!mesh.material.map,
            mapType: mesh.material.map?.constructor.name,
            textureWidth: ktx2ImageFinal?.width,
            textureHeight: ktx2ImageFinal?.height,
            hasImage: !!texture.image,
            textureFormat: texture.format,
            textureFormatHex: '0x' + texture.format.toString(16),
            textureMapping: texture.mapping,
            textureFlipY: texture.flipY,
            textureColorSpace: (texture as any).colorSpace,
            materialSide: mesh.material.side,
            materialColor: mesh.material.color.getHexString(),
            materialVisible: mesh.material.visible,
            materialToneMapped: mesh.material.toneMapped,
            meshVisible: mesh.visible,
            textureUploaded: textureUploaded,
            textureBound: textureBound,
            hasWebGLTexture: !!textureProperties?.__webglTexture
          })
        } else if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
          // Regular images: Use material.map on UV-mapped inner sphere
          if (sceneRef.current) {
            sceneRef.current.background = null
          }

          const mat = mesh.material
          if (mat.map) {
            mat.map.dispose()
            mat.map = null
          }

          mat.map = texture
          mat.color.setHex(0xffffff)
          mat.toneMapped = true
          mat.side = THREE.FrontSide
          mat.visible = true
          mat.needsUpdate = true
          texture.needsUpdate = true
          textureRef.current = texture
          mesh.visible = true

          if (rendererRef.current) {
            rendererRef.current.toneMapping = THREE.NoToneMapping
            rendererRef.current.toneMappingExposure = 1.0
            rendererRef.current.outputColorSpace = THREE.SRGBColorSpace
            rendererRef.current.setClearColor(0x000000, 1.0)
          }

          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current)
          }

          await waitForTextureUpload(texture)

          console.log('[Panorama360] Regular image set as material.map')
        }

        // Update image info
        const finalImage = texture.image as { width?: number; height?: number } | null
        setImageInfo({
          width: finalImage?.width,
          height: finalImage?.height,
          format: extension.toUpperCase()
        })

        console.log('[Panorama360] ✅ Image loaded successfully:', {
          width: finalImage?.width,
          height: finalImage?.height,
          format: extension
        })

        setIsLoading(false)
        if (cancelled) return
        transitionRef.current.loadDone = true
        tryBeginInPhaseRef.current()
        onLoadRef.current?.()
      } catch (err) {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        console.error('[Panorama360] ❌ Failed to load image:', error)
        setError(error.message)
        setIsLoading(false)
        transitionRef.current = createIdleTransition()
        if (transitionOverlayRef.current) {
          transitionOverlayRef.current.style.opacity = '0'
        }
        if (cameraRef.current) {
          cameraRef.current.fov = BASE_FOV
          cameraRef.current.updateProjectionMatrix()
        }
        setControlsEnabled(true)
        onErrorRef.current?.(error)
      }
    }

    loadImage()
    return () => {
      cancelled = true
    }
  }, [imageUrl, startTransitionOut, setControlsEnabled])

  return (
    <div
      className={`panorama-360-viewer ${editMode ? 'edit-mode' : ''} ${isDraggingHotspot ? 'dragging-hotspot' : ''} ${isDraggingPopup ? 'dragging-popup' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    >
      <div
        ref={containerRef}
        className="panorama-360-container"
        onPointerDown={handlePointerDown}
      />
      <div ref={transitionOverlayRef} className="panorama-360-transition-overlay" aria-hidden />
      {projectedHotspots.map(({ hotspot: projectedHotspot, x, y }) => {
        const hotspot = hotspots.find((h) => h.id === projectedHotspot.id) ?? projectedHotspot
        if (hiddenHotspotIds) {
          const hidden =
            typeof (hiddenHotspotIds as ReadonlySet<string>).has === 'function'
              ? (hiddenHotspotIds as ReadonlySet<string>).has(hotspot.id)
              : (hiddenHotspotIds as string[]).includes(hotspot.id)
          if (hidden) return null
        }
        const displayHotspot =
          editMarkerPreview?.id === hotspot.id ? editMarkerPreview : hotspot
        const color = getHotspotColor(displayHotspot)
        const shape = getHotspotShape(displayHotspot)
        const isPreview = hotspot.id === PLACEMENT_PREVIEW_HOTSPOT_ID
        const isSelected = isPreview || selectedHotspotId === hotspot.id
        const markerBg = color.length === 7 ? `${color}e6` : color
        return (
          <button
            key={hotspot.id}
            type="button"
            className={`panorama-hotspot-marker type-${displayHotspot.type} shape-${shape} ${highlightedHotspotId === hotspot.id ? 'highlighted' : ''} ${editMode ? 'editable' : ''} ${isSelected ? 'selected' : ''} ${isPreview ? 'draft' : ''}`}
            style={{
              left: x,
              top: y,
              background: markerBg,
              color,
              ['--hotspot-color' as string]: color
            }}
            title={displayHotspot.label}
            onPointerDown={(e) => handleMarkerPointerDown(e, hotspot)}
            onClick={(e) => {
              e.stopPropagation()
              if (!editMode) handleHotspotActivate(hotspot)
            }}
          >
            <span className="panorama-hotspot-pulse" />
            <span className="panorama-hotspot-label">{displayHotspot.label}</span>
          </button>
        )
      })}
      {editMode && editPopupPreview && (() => {
        const projected = projectedHotspots.find((p) => p.hotspot.id === editPopupPreview.id)
        if (!projected) return null
        const dragOffset = popupDragVisual ?? undefined
        return (
          <div
            className={`panorama-hotspot-info-popup edit-preview ${isDraggingPopup ? 'dragging' : ''}`}
            style={getInfoPopupStyle(editPopupPreview, projected.x, projected.y, dragOffset)}
          >
            <div
              className="panorama-hotspot-info-drag-handle"
              onPointerDown={(e) => handlePopupHeaderPointerDown(e, editPopupPreview)}
            >
              <h3>{editPopupPreview.label}</h3>
            </div>
            <p>{editPopupPreview.info || 'Enter info text in the sidebar…'}</p>
          </div>
        )
      })()}
      {!editMode && infoPopup && (() => {
        // Guided tours use the same hotspot-anchored layout as manual preview
        // (width, border color, offsets). Screen-position cache keeps the card
        // visible if the marker briefly leaves the frustum during a camera tween.
        const projected = projectedHotspots.find((p) => p.hotspot.id === infoPopup.id)
        if (projected) {
          lastInfoPopupScreenRef.current = { id: infoPopup.id, x: projected.x, y: projected.y }
        }
        const cached =
          lastInfoPopupScreenRef.current?.id === infoPopup.id ? lastInfoPopupScreenRef.current : null
        const anchor = projected ?? cached
        if (!anchor) return null
        return (
          <div
            className="panorama-hotspot-info-popup view-only"
            style={getInfoPopupStyle(infoPopup, anchor.x, anchor.y)}
          >
            <button type="button" className="panorama-hotspot-info-close" onClick={clearInfoPopup}>×</button>
            <h3>{infoPopup.label}</h3>
            <p>{infoPopup.info}</p>
          </div>
        )
      })()}
      {!editMode && (urlIframe || urlIframeError) && (
        <UrlIframeOverlay
          url={urlIframe?.url ?? ''}
          label={urlIframe?.label ?? ''}
          error={urlIframeError}
          onClose={clearUrlIframe}
        />
      )}
      {isLoading && (
        <div className="panorama-360-loading">
          <div className="loading-spinner" />
          <p>Loading 360° image...</p>
        </div>
      )}
      {error && (
        <div className="panorama-360-error">
          <p>❌ Error: {error}</p>
        </div>
      )}
      {imageInfo && !isLoading && !error && !previewMode && (
        <div className="panorama-360-info">
          <p>
            {imageInfo.width} × {imageInfo.height} • {imageInfo.format}
          </p>
        </div>
      )}
      <div className={`panorama-360-controls-hint ${previewMode ? 'preview' : ''}`}>
        <p>{previewMode ? 'Drag to look around • Scroll to zoom • Click hotspots to explore' : '🖱️ Drag to rotate • Scroll to zoom'}</p>
      </div>
    </div>
  )
}

