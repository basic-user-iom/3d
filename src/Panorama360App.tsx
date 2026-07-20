import React, { useState, useCallback, useMemo, useRef, useEffect, Suspense, lazy } from 'react'
import Panorama360Viewer from './components/Panorama360Viewer'
import Panorama360TourPanel from './components/Panorama360TourPanel'
import Panorama360HelpModal from './components/Panorama360HelpModal'
import type { PanoramaEntry, PanoramaHotspot, PanoramaTourState } from './panorama/panoramaTourTypes'
import {
  createEmptyPanorama,
  degToRad,
  PLACEMENT_PREVIEW_HOTSPOT_ID,
  resolvePanoramaUrl
} from './panorama/panoramaTourTypes'
import {
  loadPanoramaProjectFromFile,
  loadPanoramaProjectFromUrl,
  PanoramaProjectError,
  resolvePanoramaTourAssetUrls,
  savePanoramaProject
} from './panorama/panoramaProjectFile'
import {
  loadBirdsEffectSettings,
  saveBirdsEffectSettings,
  type BirdsEffectSettings
} from './panorama/birdsEffectSettings'
import {
  loadParticlesEffectSettings,
  saveParticlesEffectSettings,
  type ParticlesEffectSettings
} from './panorama/particlesEffectSettings'
import {
  loadSpoutEffectSettings,
  saveSpoutEffectSettings,
  type SpoutEffectSettings
} from './panorama/spoutEffectSettings'
import {
  createEmptyGuidedTour,
  createGuidedTourStep,
  DEFAULT_GUIDED_CAMERA_FOV,
  DEFAULT_GUIDED_POPUP_DURATION_SEC,
  type GuidedTour,
  type GuidedTourStep
} from './panorama/guidedTourTypes'
import {
  playGuidedTour,
  previewGuidedTourStep,
  type GuidedTourCameraCommand,
  type GuidedTourPlaybackHandlers
} from './panorama/guidedTourPlayback'

/** Short tween when scrubbing a single step in the STEPS list. */
const GUIDED_STEP_PREVIEW_CAMERA_SEC = 0.85
import { DEFAULT_PANORAMA_LIVE_LOOK, type PanoramaLiveLook } from './panorama/panoramaSphericalCoords'
import type { GuidedCameraCommand } from './components/Panorama360Viewer'
import './Panorama360App.css'

const Panorama360BirdsOverlay = lazy(() => import('./components/Panorama360BirdsOverlay'))
const Panorama360ParticlesOverlay = lazy(() => import('./components/Panorama360ParticlesOverlay'))
const Panorama360SpoutOverlay = lazy(() => import('./components/Panorama360SpoutOverlay'))

/** Default equirectangular asset shipped under public/panoramas (URL-encoded for spaces). */
const DEFAULT_PANORAMA_FILE = 'The Black Witness.jpeg'
/** Shipped demo tour (hotspots + guided tour) under public/projects/. */
const DEFAULT_PROJECT_PATH = 'projects/default.360project'

function demoBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

function defaultPanoramaUrl(): string {
  return `${demoBaseUrl()}panoramas/${encodeURIComponent(DEFAULT_PANORAMA_FILE)}`
}

function defaultProjectUrl(): string {
  return `${demoBaseUrl()}${DEFAULT_PROJECT_PATH}`
}

function panoramaNameFromSourceUrl(url: string): string {
  try {
    const leaf = url.split('/').pop() ?? DEFAULT_PANORAMA_FILE
    return decodeURIComponent(leaf).replace(/\.[^.]+$/, '') || 'Panorama 1'
  } catch {
    return 'Panorama 1'
  }
}

export interface PopupOffsetPatch {
  popupOffsetX: number
  popupOffsetY: number
}

function parseOrientationUrlOverride(params: URLSearchParams): {
  yaw?: number
  pitch?: number
} | null {
  const yawRaw = params.get('yaw')
  const pitchRaw = params.get('pitch')
  if (yawRaw == null && pitchRaw == null) return null
  const yawDeg = yawRaw != null ? Number(yawRaw) : NaN
  const pitchDeg = pitchRaw != null ? Number(pitchRaw) : NaN
  const hasYaw = Number.isFinite(yawDeg)
  const hasPitch = Number.isFinite(pitchDeg)
  if (!hasYaw && !hasPitch) return null
  return {
    ...(hasYaw ? { yaw: degToRad(yawDeg) } : {}),
    ...(hasPitch ? { pitch: degToRad(pitchDeg) } : {})
  }
}

/** Visitor/play mode: ?mode=preview | ?mode=view | ?preview=1 | ?preview=true */
function parsePreviewModeFromUrl(params: URLSearchParams): boolean {
  const mode = params.get('mode')?.trim().toLowerCase()
  if (mode === 'preview' || mode === 'view' || mode === 'play') return true
  const preview = params.get('preview')?.trim().toLowerCase()
  return preview === '1' || preview === 'true' || preview === 'yes'
}

export default function Panorama360App() {
  // Parse once — a fresh object each render was recreating applyRestoredTour and
  // re-firing the default-project load effect, which cleared guided-tour popups.
  const [urlBootstrap] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const imageUrlParam = urlParams.get('image')?.trim() || null
    return {
      imageUrlParam,
      projectUrlParam: urlParams.get('project')?.trim() || null,
      orientationUrlOverride: parseOrientationUrlOverride(urlParams),
      startInPreviewMode: parsePreviewModeFromUrl(urlParams),
      skipDefaultProject: Boolean(imageUrlParam),
      initialState: (() => {
        if (imageUrlParam) {
          const entry = createEmptyPanorama(panoramaNameFromSourceUrl(imageUrlParam), imageUrlParam)
          return { panoramas: [entry] as PanoramaEntry[], activeId: entry.id as string | null }
        }
        // Empty until default (or ?project=) loads — avoids a bare Black Witness without hotspots.
        return { panoramas: [] as PanoramaEntry[], activeId: null as string | null }
      })()
    }
  })
  const {
    imageUrlParam,
    projectUrlParam,
    orientationUrlOverride,
    startInPreviewMode,
    skipDefaultProject,
    initialState
  } = urlBootstrap

  const [panoramas, setPanoramas] = useState<PanoramaEntry[]>(initialState.panoramas)
  const [activePanoramaId, setActivePanoramaId] = useState<string | null>(initialState.activeId)
  const [editMode, setEditMode] = useState(false)
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null)
  const [pendingPlacement, setPendingPlacement] = useState<{ yaw: number; pitch: number } | null>(null)
  const [placementMode, setPlacementMode] = useState(false)
  const [viewOrientation, setViewOrientation] = useState({ yaw: 0, pitch: 0 })
  const [orientationFocusKey, setOrientationFocusKey] = useState(0)
  const [currentViewOrientation, setCurrentViewOrientation] = useState({ yaw: 0, pitch: 0 })
  const [dragActive, setDragActive] = useState(false)
  const [editPopupPreview, setEditPopupPreview] = useState<PanoramaHotspot | null>(null)
  const [editMarkerPreview, setEditMarkerPreview] = useState<PanoramaHotspot | null>(null)
  const [popupOffsetPatch, setPopupOffsetPatch] = useState<PopupOffsetPatch | null>(null)
  const [previewMode, setPreviewMode] = useState(startInPreviewMode)
  const [helpOpen, setHelpOpen] = useState(false)
  const [projectBusy, setProjectBusy] = useState(false)
  const [mobileTourOpen, setMobileTourOpen] = useState(false)
  /** True while fetching the shipped default / ?project= override on first paint. */
  const [defaultProjectLoading, setDefaultProjectLoading] = useState(
    () => !skipDefaultProject
  )
  const [birdsEffect, setBirdsEffect] = useState<BirdsEffectSettings>(() => loadBirdsEffectSettings())
  const [birdsStatus, setBirdsStatus] = useState<{
    status: 'idle' | 'ready' | 'unsupported' | 'error'
    message?: string
  }>({ status: 'idle' })
  const [particlesEffect, setParticlesEffect] = useState<ParticlesEffectSettings>(() =>
    loadParticlesEffectSettings()
  )
  const [particlesStatus, setParticlesStatus] = useState<{
    status: 'idle' | 'ready' | 'unsupported' | 'error'
    message?: string
  }>({ status: 'idle' })
  const [spoutEffect, setSpoutEffect] = useState<SpoutEffectSettings>(() => loadSpoutEffectSettings())
  const [spoutStatus, setSpoutStatus] = useState<{
    status: 'idle' | 'ready' | 'unsupported' | 'error'
    message?: string
  }>({ status: 'idle' })
  const [guidedTours, setGuidedTours] = useState<GuidedTour[]>([])
  const [activeGuidedTourId, setActiveGuidedTourId] = useState<string | null>(null)
  const [selectedGuidedStepId, setSelectedGuidedStepId] = useState<string | null>(null)
  const [guidedTourPlaying, setGuidedTourPlaying] = useState(false)
  const [guidedTourStepIndex, setGuidedTourStepIndex] = useState(-1)
  const [hiddenHotspotIds, setHiddenHotspotIds] = useState<Set<string>>(() => new Set())
  const [guidedInfoPopupId, setGuidedInfoPopupId] = useState<string | null>(null)
  const [guidedCameraCommand, setGuidedCameraCommand] = useState<GuidedCameraCommand | null>(null)
  const [guidedCameraCommandKey, setGuidedCameraCommandKey] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const projectLoadInputRef = useRef<HTMLInputElement>(null)
  /** Frame-synced panorama look for overlays; updated by the viewer every frame. */
  const liveLookRef = useRef<PanoramaLiveLook>({ ...DEFAULT_PANORAMA_LIVE_LOOK })
  const guidedAbortRef = useRef<AbortController | null>(null)
  const guidedCameraWaitRef = useRef<{ resolve: () => void } | null>(null)
  const popupAutoCloseTimerRef = useRef<number | null>(null)
  const activePanoramaIdRef = useRef(activePanoramaId)
  activePanoramaIdRef.current = activePanoramaId
  const panoramasRef = useRef(panoramas)
  panoramasRef.current = panoramas
  const guidedToursRef = useRef(guidedTours)
  guidedToursRef.current = guidedTours
  const activeGuidedTourIdRef = useRef(activeGuidedTourId)
  activeGuidedTourIdRef.current = activeGuidedTourId
  const birdsStatusRef = useRef(birdsStatus)
  birdsStatusRef.current = birdsStatus
  const particlesStatusRef = useRef(particlesStatus)
  particlesStatusRef.current = particlesStatus
  const spoutStatusRef = useRef(spoutStatus)
  spoutStatusRef.current = spoutStatus

  const handleBirdsEffectChange = useCallback((patch: Partial<BirdsEffectSettings>) => {
    setBirdsEffect((prev) => {
      const next = { ...prev, ...patch }
      saveBirdsEffectSettings(next)
      return next
    })
    if (patch.enabled === false) {
      setBirdsStatus({ status: 'idle' })
    }
  }, [])

  const handleBirdsStatusChange = useCallback((status: 'ready' | 'unsupported' | 'error', message?: string) => {
    setBirdsStatus({ status, message })
  }, [])

  const handleParticlesEffectChange = useCallback((patch: Partial<ParticlesEffectSettings>) => {
    setParticlesEffect((prev) => {
      const next = { ...prev, ...patch }
      saveParticlesEffectSettings(next)
      return next
    })
    if (patch.enabled === false) {
      setParticlesStatus({ status: 'idle' })
    }
  }, [])

  const handleParticlesStatusChange = useCallback(
    (status: 'ready' | 'unsupported' | 'error', message?: string) => {
      setParticlesStatus({ status, message })
    },
    []
  )

  const handleSpoutEffectChange = useCallback((patch: Partial<SpoutEffectSettings>) => {
    setSpoutEffect((prev) => {
      const next = { ...prev, ...patch }
      saveSpoutEffectSettings(next)
      return next
    })
    if (patch.enabled === false) {
      setSpoutStatus({ status: 'idle' })
    }
  }, [])

  const handleSpoutStatusChange = useCallback(
    (status: 'ready' | 'unsupported' | 'error', message?: string) => {
      setSpoutStatus({ status, message })
    },
    []
  )

  const activePanorama = useMemo(
    () => panoramas.find((p) => p.id === activePanoramaId) ?? null,
    [panoramas, activePanoramaId]
  )

  const placementPreview = useMemo((): PanoramaHotspot | null => {
    if (!pendingPlacement) return null
    return {
      id: PLACEMENT_PREVIEW_HOTSPOT_ID,
      label: 'New hotspot',
      yaw: pendingPlacement.yaw,
      pitch: pendingPlacement.pitch,
      type: 'link'
    }
  }, [pendingPlacement])

  const handleFilesSelect = useCallback((files: Iterable<File>) => {
    const fileList = Array.from(files)
    if (fileList.length === 0) return

    const supportedFormats = ['ktx2', 'hdr', 'exr', 'jpg', 'jpeg', 'png', 'webp']
    const invalid: string[] = []
    const entries: PanoramaEntry[] = []

    for (const file of fileList) {
      const extension = file.name.toLowerCase().split('.').pop() || ''
      if (!supportedFormats.includes(extension)) {
        invalid.push(file.name)
        continue
      }
      entries.push(createEmptyPanorama(file.name.replace(/\.[^.]+$/, ''), file))
    }

    if (entries.length === 0) {
      if (invalid.length > 0) {
        alert(
          `No valid panorama files selected.\n\nUnsupported:\n${invalid.join('\n')}\n\nSupported: ${supportedFormats.join(', ')}`
        )
      }
      return
    }

    const hadActive = activePanoramaId !== null
    setPanoramas((prev) => [...prev, ...entries])
    if (!hadActive || entries.length === 1) {
      setActivePanoramaId(entries[0].id)
      setViewOrientation({ yaw: 0, pitch: 0 })
    }
    setPendingPlacement(null)
    setSelectedHotspotId(null)
    setPlacementMode(false)

    if (invalid.length > 0) {
      alert(
        `Added ${entries.length} panorama${entries.length === 1 ? '' : 's'}.\n\nSkipped unsupported file(s):\n${invalid.join('\n')}\n\nSupported: ${supportedFormats.join(', ')}`
      )
    }
  }, [activePanoramaId])

  const handleAddPanoramas = useCallback((files: File[]) => {
    handleFilesSelect(files)
  }, [handleFilesSelect])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.length) handleFilesSelect(e.dataTransfer.files)
  }, [handleFilesSelect])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFilesSelect(e.target.files)
    e.target.value = ''
  }, [handleFilesSelect])

  const handleLoadFromUrl = useCallback(() => {
    const url = prompt('Enter panorama image URL:')
    if (!url) return
    const name = url.split('/').pop() ?? 'Remote panorama'
    const entry = createEmptyPanorama(name, url)
    setPanoramas((prev) => [...prev, entry])
    setActivePanoramaId(entry.id)
    setViewOrientation({ yaw: 0, pitch: 0 })
  }, [])

  const resetEditorUiState = useCallback(() => {
    setEditMode(false)
    setSelectedHotspotId(null)
    setPendingPlacement(null)
    setPlacementMode(false)
    setEditPopupPreview(null)
    setEditMarkerPreview(null)
    setPopupOffsetPatch(null)
    // Keep visitor/play URLs in preview after the default project finishes loading.
    setPreviewMode(startInPreviewMode)
  }, [startInPreviewMode])

  const applyRestoredTour = useCallback(
    (restoredRaw: PanoramaTourState) => {
      const restored = resolvePanoramaTourAssetUrls(restoredRaw)
      const active =
        restored.panoramas.find((p) => p.id === restored.activePanoramaId) ?? restored.panoramas[0]
      setPanoramas(restored.panoramas)
      setActivePanoramaId(restored.activePanoramaId)
      setGuidedTours(restored.guidedTours ?? [])
      setActiveGuidedTourId(restored.guidedTours?.[0]?.id ?? null)
      setSelectedGuidedStepId(restored.guidedTours?.[0]?.steps[0]?.id ?? null)
      setHiddenHotspotIds(new Set())
      setGuidedInfoPopupId(null)
      setViewOrientation({
        yaw: orientationUrlOverride?.yaw ?? active?.initialYaw ?? 0,
        pitch: orientationUrlOverride?.pitch ?? active?.initialPitch ?? 0
      })
      resetEditorUiState()
    },
    [orientationUrlOverride, resetEditorUiState]
  )

  const handleSaveProject = useCallback(async () => {
    if (projectBusy) return
    setProjectBusy(true)
    try {
      await savePanoramaProject({ panoramas, activePanoramaId, guidedTours })
    } catch (error) {
      const message = error instanceof PanoramaProjectError ? error.message : 'Failed to save project'
      alert(message)
    } finally {
      setProjectBusy(false)
    }
  }, [activePanoramaId, panoramas, guidedTours, projectBusy])

  const handleLoadProjectClick = useCallback(() => {
    projectLoadInputRef.current?.click()
  }, [])

  const handleLoadProjectFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (
      panoramas.length > 0 &&
      !confirm(
        'Load project?\n\nThis replaces the current tour (panoramas, hotspots, guided tours, and initial views). Unsaved changes will be lost.'
      )
    ) {
      return
    }

    setProjectBusy(true)
    try {
      const restored = await loadPanoramaProjectFromFile(file)
      applyRestoredTour(restored)
    } catch (error) {
      const message =
        error instanceof PanoramaProjectError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to load project'
      alert(`Could not load project:\n\n${message}`)
    } finally {
      setProjectBusy(false)
    }
  }, [applyRestoredTour, panoramas.length])

  const applyRestoredTourRef = useRef(applyRestoredTour)
  applyRestoredTourRef.current = applyRestoredTour

  // Auto-load shipped default tour (or ?project= override) when no ?image= override.
  // Intentionally does not depend on applyRestoredTour — that callback's identity must not
  // retrigger a full project reload (it clears guidedInfoPopupId mid-tour).
  useEffect(() => {
    if (skipDefaultProject) return

    let cancelled = false
    const url = projectUrlParam || defaultProjectUrl()

    ;(async () => {
      setDefaultProjectLoading(true)
      try {
        const restored = await loadPanoramaProjectFromUrl(url)
        if (cancelled) return
        applyRestoredTourRef.current(restored)
      } catch (error) {
        if (cancelled) return
        console.warn('[Panorama360] Failed to load default project, falling back to sample panorama:', error)
        // Fallback: single shipped panorama so the empty screen is still avoided.
        const entry = createEmptyPanorama(
          panoramaNameFromSourceUrl(defaultPanoramaUrl()),
          defaultPanoramaUrl()
        )
        setPanoramas([entry])
        setActivePanoramaId(entry.id)
        setGuidedTours([])
        setActiveGuidedTourId(null)
        setSelectedGuidedStepId(null)
      } finally {
        if (!cancelled) setDefaultProjectLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectUrlParam, skipDefaultProject])

  const handleSelectPanorama = useCallback((id: string) => {
    const pano = panoramas.find((p) => p.id === id)
    setActivePanoramaId(id)
    setViewOrientation({
      yaw: pano?.initialYaw ?? 0,
      pitch: pano?.initialPitch ?? 0
    })
    setPendingPlacement(null)
    setSelectedHotspotId(null)
    setPlacementMode(false)
    setEditMode(false)
  }, [panoramas])

  const handleRemovePanorama = useCallback((id: string) => {
    setPanoramas((prev) => {
      const next = prev.filter((p) => p.id !== id)
      if (activePanoramaId === id) {
        const fallback = next[0] ?? null
        setActivePanoramaId(fallback?.id ?? null)
        setViewOrientation({
          yaw: fallback?.initialYaw ?? 0,
          pitch: fallback?.initialPitch ?? 0
        })
      }
      return next
    })
    setPendingPlacement(null)
    setSelectedHotspotId(null)
    setPlacementMode(false)
  }, [activePanoramaId])

  const handleRenamePanorama = useCallback((id: string, name: string) => {
    setPanoramas((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }, [])

  const handleOrientationChange = useCallback((yaw: number, pitch: number) => {
    liveLookRef.current.yaw = yaw
    liveLookRef.current.pitch = pitch
    setCurrentViewOrientation({ yaw, pitch })
  }, [])

  /** Prefer live camera ref so “Pin birds to view” matches what is on screen. */
  const handlePinBirdsToCurrentView = useCallback(() => {
    handleBirdsEffectChange({
      viewYaw: liveLookRef.current.yaw,
      viewPitch: liveLookRef.current.pitch
    })
  }, [handleBirdsEffectChange])

  const handlePinParticlesToCurrentView = useCallback(() => {
    handleParticlesEffectChange({
      viewYaw: liveLookRef.current.yaw,
      viewPitch: liveLookRef.current.pitch
    })
  }, [handleParticlesEffectChange])

  const handlePinSpoutToCurrentView = useCallback(() => {
    handleSpoutEffectChange({
      viewYaw: liveLookRef.current.yaw,
      viewPitch: liveLookRef.current.pitch
    })
  }, [handleSpoutEffectChange])

  const handleSetInitialView = useCallback(() => {
    if (!activePanoramaId) return
    setPanoramas((prev) =>
      prev.map((p) =>
        p.id === activePanoramaId
          ? {
              ...p,
              initialYaw: currentViewOrientation.yaw,
              initialPitch: currentViewOrientation.pitch
            }
          : p
      )
    )
  }, [activePanoramaId, currentViewOrientation])

  const handleUpdateInitialView = useCallback((yaw: number, pitch: number) => {
    if (!activePanoramaId) return
    setPanoramas((prev) =>
      prev.map((p) =>
        p.id === activePanoramaId ? { ...p, initialYaw: yaw, initialPitch: pitch } : p
      )
    )
    setViewOrientation({ yaw, pitch })
  }, [activePanoramaId])

  const handleResetInitialView = useCallback(() => {
    if (!activePanoramaId) return
    setPanoramas((prev) =>
      prev.map((p) => {
        if (p.id !== activePanoramaId) return p
        const { initialYaw: _y, initialPitch: _p, ...rest } = p
        return rest
      })
    )
  }, [activePanoramaId])

  const handlePlaceHotspot = useCallback((yaw: number, pitch: number) => {
    setPendingPlacement({ yaw, pitch })
    setSelectedHotspotId(null)
    setPlacementMode(false)
  }, [])

  const handleStartPlacement = useCallback(() => {
    setPlacementMode(true)
    setSelectedHotspotId(null)
    setPendingPlacement(null)
  }, [])

  const handleStartAddHotspot = useCallback(() => {
    setEditMode(true)
    setPlacementMode(true)
    setSelectedHotspotId(null)
    setPendingPlacement(null)
  }, [])

  const handleEnterEditMode = useCallback(() => {
    setEditMode(true)
  }, [])

  const handleSaveHotspot = useCallback((hotspot: PanoramaHotspot) => {
    if (!activePanoramaId) return
    const wasPlacing = pendingPlacement !== null
    setPanoramas((prev) =>
      prev.map((p) => {
        if (p.id !== activePanoramaId) return p
        const existingIndex = p.hotspots.findIndex((h) => h.id === hotspot.id)
        if (existingIndex === -1) {
          return { ...p, hotspots: [...p.hotspots, hotspot] }
        }
        const nextHotspots = [...p.hotspots]
        nextHotspots[existingIndex] = { ...p.hotspots[existingIndex], ...hotspot }
        return { ...p, hotspots: nextHotspots }
      })
    )
    setPendingPlacement(null)
    if (wasPlacing) {
      setSelectedHotspotId(null)
      setPlacementMode(true)
    } else {
      setSelectedHotspotId(hotspot.id)
      setPlacementMode(false)
    }
  }, [activePanoramaId, pendingPlacement])

  const handleMoveHotspot = useCallback((hotspotId: string, yaw: number, pitch: number) => {
    if (!activePanoramaId) return
    setPanoramas((prev) =>
      prev.map((p) =>
        p.id === activePanoramaId
          ? {
              ...p,
              hotspots: p.hotspots.map((h) =>
                h.id === hotspotId ? { ...h, yaw, pitch } : h
              )
            }
          : p
      )
    )
  }, [activePanoramaId])

  const handlePopupOffsetChange = useCallback((hotspotId: string, offsetX: number, offsetY: number) => {
    setPopupOffsetPatch({ popupOffsetX: offsetX, popupOffsetY: offsetY })
    if (hotspotId === PLACEMENT_PREVIEW_HOTSPOT_ID) return
    if (!activePanoramaId) return
    setPanoramas((prev) =>
      prev.map((p) =>
        p.id === activePanoramaId
          ? {
              ...p,
              hotspots: p.hotspots.map((h) =>
                h.id === hotspotId
                  ? { ...h, popupOffsetX: offsetX, popupOffsetY: offsetY }
                  : h
              )
            }
          : p
      )
    )
  }, [activePanoramaId])

  const handleDeleteHotspot = useCallback((hotspotId: string) => {
    if (!activePanoramaId) return
    setPanoramas((prev) =>
      prev.map((p) =>
        p.id === activePanoramaId
          ? { ...p, hotspots: p.hotspots.filter((h) => h.id !== hotspotId) }
          : p
      )
    )
    if (selectedHotspotId === hotspotId) {
      setSelectedHotspotId(null)
      setPlacementMode(true)
    }
  }, [activePanoramaId, selectedHotspotId])

  const handleHotspotClick = useCallback((hotspot: PanoramaHotspot) => {
    if (hotspot.type === 'link' && hotspot.targetPanoramaId) {
      const target = panoramas.find((p) => p.id === hotspot.targetPanoramaId)
      if (!target) return
      setActivePanoramaId(target.id)
      setViewOrientation({
        yaw: hotspot.targetYaw ?? target.initialYaw ?? 0,
        pitch: hotspot.targetPitch ?? target.initialPitch ?? 0
      })
      setPendingPlacement(null)
      setSelectedHotspotId(null)
      setPlacementMode(false)
      return
    }
    if (hotspot.type === 'url' && hotspot.url && !hotspot.openInIframe) {
      const resolved = resolvePanoramaUrl(hotspot.url)
      if (resolved) {
        window.open(resolved, '_blank', 'noopener,noreferrer')
      }
    }
  }, [panoramas])

  const handleToggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev
      if (next) {
        setPlacementMode(true)
        setSelectedHotspotId(null)
      } else {
        setPlacementMode(false)
      }
      return next
    })
    setPendingPlacement(null)
  }, [])

  const handleSelectHotspot = useCallback((id: string | null, focusCamera = false) => {
    if (focusCamera && id && activePanoramaId) {
      const hotspot = panoramas
        .find((p) => p.id === activePanoramaId)
        ?.hotspots.find((h) => h.id === id)
      if (hotspot) {
        setViewOrientation({ yaw: hotspot.yaw, pitch: hotspot.pitch })
        setOrientationFocusKey((key) => key + 1)
      }
    }
    setSelectedHotspotId(id)
    setPendingPlacement(null)
    setPlacementMode(id === null)
  }, [activePanoramaId, panoramas])

  const handleEnterPreview = useCallback(() => {
    setSelectedHotspotId(null)
    setPendingPlacement(null)
    setPlacementMode(false)
    setEditPopupPreview(null)
    setEditMarkerPreview(null)
    setPreviewMode(true)
  }, [])

  const clearPopupAutoCloseTimer = useCallback(() => {
    if (popupAutoCloseTimerRef.current != null) {
      window.clearTimeout(popupAutoCloseTimerRef.current)
      popupAutoCloseTimerRef.current = null
    }
  }, [])

  const handleStopGuidedTour = useCallback(() => {
    guidedAbortRef.current?.abort()
    guidedAbortRef.current = null
    if (guidedCameraWaitRef.current) {
      guidedCameraWaitRef.current.resolve()
      guidedCameraWaitRef.current = null
    }
    clearPopupAutoCloseTimer()
    setGuidedTourPlaying(false)
    setGuidedTourStepIndex(-1)
    setGuidedInfoPopupId(null)
  }, [clearPopupAutoCloseTimer])

  const handleExitPreview = useCallback(() => {
    if (guidedTourPlaying) {
      handleStopGuidedTour()
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    }
    setPreviewMode(false)
    setSelectedHotspotId(null)
    setPendingPlacement(null)
    setEditPopupPreview(null)
    setEditMarkerPreview(null)
    if (editMode) {
      setPlacementMode(true)
    }
  }, [editMode, guidedTourPlaying, handleStopGuidedTour])

  const handleGuidedCameraComplete = useCallback(() => {
    const waiter = guidedCameraWaitRef.current
    guidedCameraWaitRef.current = null
    waiter?.resolve()
  }, [])

  const handleCreateGuidedTour = useCallback(() => {
    const tour = createEmptyGuidedTour(`Guided tour ${guidedTours.length + 1}`)
    setGuidedTours((prev) => [...prev, tour])
    setActiveGuidedTourId(tour.id)
    setSelectedGuidedStepId(null)
  }, [guidedTours.length])

  const handleRenameGuidedTour = useCallback((tourId: string, name: string) => {
    setGuidedTours((prev) => prev.map((t) => (t.id === tourId ? { ...t, name } : t)))
  }, [])

  const handleDeleteGuidedTour = useCallback((tourId: string) => {
    setGuidedTours((prev) => {
      const next = prev.filter((t) => t.id !== tourId)
      setActiveGuidedTourId((current) => {
        if (current !== tourId) return current
        return next[0]?.id ?? null
      })
      return next
    })
    setSelectedGuidedStepId(null)
  }, [])

  const handleSelectGuidedTour = useCallback((tourId: string | null) => {
    setActiveGuidedTourId(tourId)
    const tour = guidedToursRef.current.find((t) => t.id === tourId)
    setSelectedGuidedStepId(tour?.steps[0]?.id ?? null)
  }, [])

  const handleAddGuidedStepFromView = useCallback(() => {
    if (!activeGuidedTourId) return
    const look = liveLookRef.current
    const step = createGuidedTourStep({
      label: `Step ${(guidedTours.find((t) => t.id === activeGuidedTourId)?.steps.length ?? 0) + 1}`,
      camera: {
        yaw: look.yaw,
        pitch: look.pitch,
        fov: look.fov || DEFAULT_GUIDED_CAMERA_FOV
      },
      cameraDurationSec: 2,
      durationSec: 1.5
    })
    setGuidedTours((prev) =>
      prev.map((t) => (t.id === activeGuidedTourId ? { ...t, steps: [...t.steps, step] } : t))
    )
    setSelectedGuidedStepId(step.id)
  }, [activeGuidedTourId, guidedTours])

  const handleUpdateGuidedStep = useCallback((stepId: string, patch: Partial<GuidedTourStep>) => {
    if (!activeGuidedTourId) return
    setGuidedTours((prev) =>
      prev.map((t) => {
        if (t.id !== activeGuidedTourId) return t
        return {
          ...t,
          steps: t.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s))
        }
      })
    )
  }, [activeGuidedTourId])

  const handleDeleteGuidedStep = useCallback((stepId: string) => {
    if (!activeGuidedTourId) return
    setGuidedTours((prev) =>
      prev.map((t) => {
        if (t.id !== activeGuidedTourId) return t
        const steps = t.steps.filter((s) => s.id !== stepId)
        return { ...t, steps }
      })
    )
    setSelectedGuidedStepId((current) => (current === stepId ? null : current))
  }, [activeGuidedTourId])

  const handleMoveGuidedStep = useCallback((stepId: string, direction: -1 | 1) => {
    if (!activeGuidedTourId) return
    setGuidedTours((prev) =>
      prev.map((t) => {
        if (t.id !== activeGuidedTourId) return t
        const index = t.steps.findIndex((s) => s.id === stepId)
        if (index < 0) return t
        const nextIndex = index + direction
        if (nextIndex < 0 || nextIndex >= t.steps.length) return t
        const steps = [...t.steps]
        const [item] = steps.splice(index, 1)
        steps.splice(nextIndex, 0, item)
        return { ...t, steps }
      })
    )
  }, [activeGuidedTourId])

  const createGuidedPlaybackHandlers = useCallback(
    (abort: AbortController): GuidedTourPlaybackHandlers => ({
      isCurrentSession: () => guidedAbortRef.current === abort,
      getActivePanoramaId: () => activePanoramaIdRef.current,
      switchPanorama: (panoramaId) => {
        const pano = panoramasRef.current.find((p) => p.id === panoramaId)
        if (!pano) return
        setActivePanoramaId(pano.id)
        setViewOrientation({
          yaw: pano.initialYaw ?? 0,
          pitch: pano.initialPitch ?? 0
        })
      },
      waitForPanoramaTransition: () =>
        new Promise((resolve) => {
          window.setTimeout(resolve, 650)
        }),
      animateCamera: (command: GuidedTourCameraCommand) =>
        new Promise((resolve) => {
          if (abort.signal.aborted) {
            resolve()
            return
          }
          guidedCameraWaitRef.current = { resolve }
          setGuidedCameraCommand({
            yaw: command.yaw,
            pitch: command.pitch,
            fov: command.fov,
            durationMs: command.durationMs,
            easing: command.easing
          })
          setGuidedCameraCommandKey((k) => k + 1)
        }),
      setHotspotVisible: (hotspotId, visible) => {
        setHiddenHotspotIds((prev) => {
          const next = new Set(prev)
          if (visible) next.delete(hotspotId)
          else next.add(hotspotId)
          return next
        })
      },
      openInfoPopup: (hotspotId, _autoCloseSec) => {
        // Guided-tour step dwell owns popup lifetime (see resolvePopupHoldSec).
        // A parallel timer races re-renders and can clear the card while the step still runs.
        clearPopupAutoCloseTimer()
        setGuidedInfoPopupId(hotspotId)
      },
      closeInfoPopup: () => {
        clearPopupAutoCloseTimer()
        setGuidedInfoPopupId(null)
      },
      setBirdsEnabled: (enabled) => {
        handleBirdsEffectChange({ enabled })
      },
      setParticlesEnabled: (enabled) => {
        handleParticlesEffectChange({ enabled })
      },
      setSpoutEnabled: (enabled) => {
        handleSpoutEffectChange({ enabled })
      },
      waitForEffectsReady: async (step) => {
        const needed: Array<'birds' | 'particles' | 'spout'> = []
        if (step.effects?.birds === true) needed.push('birds')
        if (step.effects?.particles === true) needed.push('particles')
        if (step.effects?.spout === true) needed.push('spout')
        if (needed.length === 0) return

        const settled = (key: 'birds' | 'particles' | 'spout') => {
          const status =
            key === 'birds'
              ? birdsStatusRef.current.status
              : key === 'particles'
                ? particlesStatusRef.current.status
                : spoutStatusRef.current.status
          return status === 'ready' || status === 'unsupported' || status === 'error'
        }

        const deadline = performance.now() + 12000
        while (performance.now() < deadline) {
          if (abort.signal.aborted) return
          if (needed.every(settled)) return
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 50)
          })
        }
      }
    }),
    [
      clearPopupAutoCloseTimer,
      handleBirdsEffectChange,
      handleParticlesEffectChange,
      handleSpoutEffectChange
    ]
  )

  /** Select a step for editing and immediately preview its camera + linked actions. */
  const handleSelectGuidedStep = useCallback(
    (stepId: string | null) => {
      setSelectedGuidedStepId(stepId)
      if (!stepId || guidedTourPlaying) return

      const tourId = activeGuidedTourIdRef.current
      const tour = guidedToursRef.current.find((t) => t.id === tourId)
      const step = tour?.steps.find((s) => s.id === stepId)
      if (!step) return

      // Abort any in-flight full play or previous step preview.
      guidedAbortRef.current?.abort()
      if (guidedCameraWaitRef.current) {
        guidedCameraWaitRef.current.resolve()
        guidedCameraWaitRef.current = null
      }

      const abort = new AbortController()
      guidedAbortRef.current = abort
      const handlers = createGuidedPlaybackHandlers(abort)

      void previewGuidedTourStep(step, handlers, {
        signal: abort.signal,
        skipDwell: true,
        cameraDurationSecOverride: GUIDED_STEP_PREVIEW_CAMERA_SEC
      }).finally(() => {
        if (guidedAbortRef.current === abort) {
          guidedAbortRef.current = null
        }
      })
    },
    [createGuidedPlaybackHandlers, guidedTourPlaying]
  )

  const handlePlayGuidedTour = useCallback(() => {
    const tourId = activeGuidedTourIdRef.current
    const tour = guidedToursRef.current.find((t) => t.id === tourId)
    if (!tour || tour.steps.length === 0) {
      alert('Add at least one guided tour step before playing.')
      return
    }

    // Stop any prior session without letting its AbortError wipe the new popups.
    const previousAbort = guidedAbortRef.current
    guidedAbortRef.current = null
    previousAbort?.abort()
    if (guidedCameraWaitRef.current) {
      guidedCameraWaitRef.current.resolve()
      guidedCameraWaitRef.current = null
    }
    clearPopupAutoCloseTimer()

    setPreviewMode(true)
    setEditMode(false)
    setSelectedHotspotId(null)
    setPendingPlacement(null)
    setPlacementMode(false)
    setGuidedInfoPopupId(null)

    // Start with reveal-targets hidden so later “show hotspot / enable effect” steps work.
    const preHidden = new Set<string>()
    let preBirds: boolean | undefined
    let preParticles: boolean | undefined
    let preSpout: boolean | undefined
    for (const step of tour.steps) {
      for (const action of step.hotspotActions ?? []) {
        if (action.visible === true) preHidden.add(action.hotspotId)
      }
      if (step.effects?.birds === true) preBirds = false
      if (step.effects?.particles === true) preParticles = false
      if (step.effects?.spout === true) preSpout = false
    }
    setHiddenHotspotIds(preHidden)
    if (preBirds === false) handleBirdsEffectChange({ enabled: false })
    if (preParticles === false) handleParticlesEffectChange({ enabled: false })
    if (preSpout === false) handleSpoutEffectChange({ enabled: false })

    setGuidedTourPlaying(true)
    setGuidedTourStepIndex(0)

    const abort = new AbortController()
    guidedAbortRef.current = abort
    const handlers = createGuidedPlaybackHandlers(abort)

    void playGuidedTour(tour, handlers, {
      signal: abort.signal,
      onStepIndex: setGuidedTourStepIndex,
      onComplete: () => {
        if (guidedAbortRef.current !== abort) return
        setGuidedTourPlaying(false)
        setGuidedTourStepIndex(-1)
        guidedAbortRef.current = null
      }
    })
  }, [
    clearPopupAutoCloseTimer,
    createGuidedPlaybackHandlers,
    handleBirdsEffectChange,
    handleParticlesEffectChange,
    handleSpoutEffectChange
  ])

  useEffect(() => {
    return () => {
      guidedAbortRef.current?.abort()
      clearPopupAutoCloseTimer()
    }
  }, [clearPopupAutoCloseTimer])

  const handleToggleFullscreen = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void el.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    if (!previewMode) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.fullscreenElement) {
        void document.exitFullscreen()
        return
      }
      // Visitor URLs (?mode=preview) stay in play mode — Escape must not open the editor.
      if (!startInPreviewMode) {
        handleExitPreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewMode, startInPreviewMode, handleExitPreview])

  const effectiveEditMode = editMode && !previewMode

  const currentViewForGuided = useMemo(
    () => ({
      yaw: currentViewOrientation.yaw,
      pitch: currentViewOrientation.pitch,
      fov: liveLookRef.current.fov || DEFAULT_GUIDED_CAMERA_FOV
    }),
    [currentViewOrientation]
  )

  return (
    <div
      className={`panorama-360-app ${previewMode ? 'preview-mode' : ''} ${mobileTourOpen && !previewMode ? 'mobile-tour-open' : ''}`}
    >
      {previewMode ? (
        <a
          className="panorama-360-back-link panorama-360-back-link--floating"
          href="https://iobjectm.com/#360"
          aria-label="Back to 360 Tours section"
        >
          ← IOM
        </a>
      ) : null}
      {!previewMode && (
      <header className="panorama-360-header">
        <a
          className="panorama-360-back-link"
          href="https://iobjectm.com/#software"
          aria-label="Back to Software section"
        >
          ← IOM
        </a>
        <div className="panorama-360-header-main">
          <h1>360° Virtual Tour</h1>
          <p>Upload equirectangular panoramas, add hotspots, and link scenes together.</p>
        </div>
        <div className="panorama-360-actions">
          <button
            type="button"
            className="panorama-360-button secondary panorama-360-tour-toggle"
            onClick={() => setMobileTourOpen((open) => !open)}
            aria-expanded={mobileTourOpen}
            aria-controls="panorama-tour-panel"
          >
            {mobileTourOpen ? 'Close tour' : 'Tour'}
          </button>
          {panoramas.length > 0 && (
            <button
              type="button"
              className="panorama-360-button preview"
              onClick={handleEnterPreview}
              disabled={!activePanorama}
            >
              Preview
            </button>
          )}
          <button
            type="button"
            className="panorama-360-button secondary"
            onClick={handleSaveProject}
            disabled={panoramas.length === 0 || projectBusy}
            title="Download tour as a .360project file"
          >
            {projectBusy ? 'Saving…' : 'Save project'}
          </button>
          <button
            type="button"
            className="panorama-360-button secondary"
            onClick={handleLoadProjectClick}
            disabled={projectBusy}
            title="Load a saved .360project or .json tour file"
          >
            Load project
          </button>
          <input
            ref={projectLoadInputRef}
            type="file"
            accept=".360project,.json,application/json"
            onChange={handleLoadProjectFile}
            hidden
          />
          <label className="panorama-360-button">
            Upload panorama
            <input
              type="file"
              accept=".ktx2,.hdr,.exr,.jpg,.jpeg,.png,.webp"
              multiple
              onChange={handleFileInput}
              hidden
            />
          </label>
          <button type="button" className="panorama-360-button secondary" onClick={handleLoadFromUrl}>
            Load from URL
          </button>
          <button
            type="button"
            className="panorama-360-button secondary"
            onClick={() => setHelpOpen(true)}
            title="How to use the 360° tour"
            aria-haspopup="dialog"
            aria-expanded={helpOpen}
          >
            Help
          </button>
        </div>
      </header>
      )}

      <Panorama360HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <div className="panorama-360-body">
        {!previewMode && mobileTourOpen && (
          <button
            type="button"
            className="panorama-360-tour-backdrop"
            aria-label="Close tour panel"
            onClick={() => setMobileTourOpen(false)}
          />
        )}
        {!previewMode && (
        <Panorama360TourPanel
          panoramas={panoramas}
          activePanoramaId={activePanoramaId}
          editMode={editMode}
          selectedHotspotId={selectedHotspotId}
          pendingPlacement={pendingPlacement}
          placementMode={placementMode}
          onSelectPanorama={(id) => {
            handleSelectPanorama(id)
            setMobileTourOpen(false)
          }}
          onAddPanoramas={handleAddPanoramas}
          onRemovePanorama={handleRemovePanorama}
          onRenamePanorama={handleRenamePanorama}
          onSetInitialView={handleSetInitialView}
          onUpdateInitialView={handleUpdateInitialView}
          onResetInitialView={handleResetInitialView}
          onToggleEditMode={handleToggleEditMode}
          onEnterEditMode={handleEnterEditMode}
          onSelectHotspot={handleSelectHotspot}
          onStartPlacement={handleStartPlacement}
          onStartAddHotspot={handleStartAddHotspot}
          onSaveHotspot={handleSaveHotspot}
          onMoveHotspot={handleMoveHotspot}
          onDeleteHotspot={handleDeleteHotspot}
          onCancelPlacement={() => {
            setPendingPlacement(null)
            setPlacementMode(true)
          }}
          onEditPopupPreviewChange={setEditPopupPreview}
          onEditMarkerPreviewChange={setEditMarkerPreview}
          popupOffsetPatch={popupOffsetPatch}
          onPopupOffsetPatchApplied={() => setPopupOffsetPatch(null)}
          birdsEffect={birdsEffect}
          onBirdsEffectChange={handleBirdsEffectChange}
          onPinBirdsToView={handlePinBirdsToCurrentView}
          birdsStatus={birdsStatus}
          particlesEffect={particlesEffect}
          onParticlesEffectChange={handleParticlesEffectChange}
          onPinParticlesToView={handlePinParticlesToCurrentView}
          particlesStatus={particlesStatus}
          spoutEffect={spoutEffect}
          onSpoutEffectChange={handleSpoutEffectChange}
          onPinSpoutToView={handlePinSpoutToCurrentView}
          spoutStatus={spoutStatus}
          guidedTours={guidedTours}
          activeGuidedTourId={activeGuidedTourId}
          selectedGuidedStepId={selectedGuidedStepId}
          currentViewForGuided={currentViewForGuided}
          guidedTourPlaying={guidedTourPlaying}
          guidedTourStepIndex={guidedTourStepIndex}
          onSelectGuidedTour={handleSelectGuidedTour}
          onCreateGuidedTour={handleCreateGuidedTour}
          onRenameGuidedTour={handleRenameGuidedTour}
          onDeleteGuidedTour={handleDeleteGuidedTour}
          onSelectGuidedStep={handleSelectGuidedStep}
          onAddGuidedStepFromView={handleAddGuidedStepFromView}
          onUpdateGuidedStep={handleUpdateGuidedStep}
          onDeleteGuidedStep={handleDeleteGuidedStep}
          onMoveGuidedStep={handleMoveGuidedStep}
          onPlayGuidedTour={handlePlayGuidedTour}
          onStopGuidedTour={handleStopGuidedTour}
        />
        )}

        <div
          ref={contentRef}
          className={`panorama-360-content ${dragActive && !previewMode ? 'drag-active' : ''} ${!activePanorama ? 'no-image' : ''}`}
          onDragEnter={previewMode ? undefined : handleDrag}
          onDragOver={previewMode ? undefined : handleDrag}
          onDragLeave={previewMode ? undefined : handleDrag}
          onDrop={previewMode ? undefined : handleDrop}
        >
          {previewMode && activePanorama && (
            <div className="panorama-360-preview-bar">
              <div className="panorama-360-preview-bar-main">
                <span className="panorama-360-preview-badge">
                  {guidedTourPlaying ? 'Guided tour' : 'Preview'}
                </span>
                <span className="panorama-360-preview-scene">
                  {guidedTourPlaying && guidedTourStepIndex >= 0
                    ? `Step ${guidedTourStepIndex + 1} · ${activePanorama.name}`
                    : activePanorama.name}
                </span>
              </div>
              <div className="panorama-360-preview-bar-actions">
                {guidedTourPlaying ? (
                  <button type="button" className="panorama-360-preview-btn secondary" onClick={handleStopGuidedTour}>
                    Stop tour
                  </button>
                ) : (
                  activeGuidedTourId &&
                  (guidedTours.find((t) => t.id === activeGuidedTourId)?.steps.length ?? 0) > 0 && (
                    <button type="button" className="panorama-360-preview-btn secondary" onClick={handlePlayGuidedTour}>
                      Play guided tour
                    </button>
                  )
                )}
                <button type="button" className="panorama-360-preview-btn secondary" onClick={handleToggleFullscreen}>
                  Fullscreen
                </button>
                {!startInPreviewMode && (
                  <button type="button" className="panorama-360-preview-btn" onClick={handleExitPreview}>
                    Edit tour
                  </button>
                )}
              </div>
            </div>
          )}
          {activePanorama ? (
            <>
              <Panorama360Viewer
                imageUrl={activePanorama.source}
                hotspots={activePanorama.hotspots}
                placementPreview={
                  previewMode
                    ? null
                    : editMarkerPreview?.id === PLACEMENT_PREVIEW_HOTSPOT_ID
                      ? editMarkerPreview
                      : placementPreview
                }
                editPopupPreview={previewMode ? null : editPopupPreview}
                editMarkerPreview={previewMode ? null : editMarkerPreview}
                editMode={effectiveEditMode}
                previewMode={previewMode}
                initialYaw={viewOrientation.yaw}
                initialPitch={viewOrientation.pitch}
                orientationFocusKey={orientationFocusKey}
                highlightedHotspotId={previewMode ? null : selectedHotspotId}
                selectedHotspotId={previewMode ? null : selectedHotspotId}
                placementMode={previewMode ? false : placementMode}
                onPlaceHotspot={handlePlaceHotspot}
                onMoveHotspot={handleMoveHotspot}
                onPopupOffsetChange={handlePopupOffsetChange}
                onHotspotSelect={handleSelectHotspot}
                onHotspotClick={handleHotspotClick}
                onOrientationChange={handleOrientationChange}
                liveLookRef={liveLookRef}
                interactionLocked={guidedTourPlaying}
                hiddenHotspotIds={hiddenHotspotIds}
                guidedCameraCommand={guidedCameraCommand}
                guidedCameraCommandKey={guidedCameraCommandKey}
                onGuidedCameraComplete={handleGuidedCameraComplete}
                guidedInfoPopupId={guidedInfoPopupId}
                onError={(err) => alert(`Failed to load image: ${err.message}`)}
              />
              {particlesEffect.enabled && (
                <Suspense fallback={null}>
                  <Panorama360ParticlesOverlay
                    settings={particlesEffect}
                    liveLookRef={liveLookRef}
                    onStatusChange={handleParticlesStatusChange}
                  />
                </Suspense>
              )}
              {birdsEffect.enabled && (
                <Suspense fallback={null}>
                  <Panorama360BirdsOverlay
                    settings={birdsEffect}
                    birdCount={birdsEffect.count}
                    liveLookRef={liveLookRef}
                    onStatusChange={handleBirdsStatusChange}
                  />
                </Suspense>
              )}
              {spoutEffect.enabled && (
                <Suspense fallback={null}>
                  <Panorama360SpoutOverlay
                    settings={spoutEffect}
                    liveLookRef={liveLookRef}
                    onStatusChange={handleSpoutStatusChange}
                    onGizmoChange={handleSpoutEffectChange}
                  />
                </Suspense>
              )}
            </>
          ) : (
            <div className="panorama-360-placeholder">
              <div className="placeholder-content">
                {defaultProjectLoading ? (
                  <>
                    <div className="placeholder-icon">🌐</div>
                    <h2>Loading tour…</h2>
                    <p>Preparing the default 360° demo project.</p>
                  </>
                ) : (
                  <>
                    <div className="placeholder-icon">🌐</div>
                    <h2>Start your virtual tour</h2>
                    <p>Drag and drop one or more 360° equirectangular images, or use the sidebar to upload.</p>
                    <div className="placeholder-formats">
                      <p><strong>Supported formats:</strong></p>
                      <ul>
                        <li>JPG, PNG, WebP — standard equirectangular images</li>
                        <li>HDR, EXR — high dynamic range panoramas</li>
                        <li>KTX2 — compressed FastHDR format</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
