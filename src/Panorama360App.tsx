import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Panorama360Viewer from './components/Panorama360Viewer'
import Panorama360TourPanel from './components/Panorama360TourPanel'
import type { PanoramaEntry, PanoramaHotspot } from './panorama/panoramaTourTypes'
import { createEmptyPanorama, PLACEMENT_PREVIEW_HOTSPOT_ID, resolvePanoramaUrl } from './panorama/panoramaTourTypes'
import {
  loadPanoramaProjectFromFile,
  PanoramaProjectError,
  savePanoramaProject
} from './panorama/panoramaProjectFile'
import './Panorama360App.css'

export interface PopupOffsetPatch {
  popupOffsetX: number
  popupOffsetY: number
}

export default function Panorama360App() {
  const urlParams = new URLSearchParams(window.location.search)
  const imageUrlParam = urlParams.get('image')

  const initialState = (() => {
    if (imageUrlParam) {
      const name = imageUrlParam.split('/').pop() ?? 'Panorama 1'
      const entry = createEmptyPanorama(name, imageUrlParam)
      return { panoramas: [entry], activeId: entry.id }
    }
    return { panoramas: [] as PanoramaEntry[], activeId: null as string | null }
  })()

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
  const [previewMode, setPreviewMode] = useState(false)
  const [projectBusy, setProjectBusy] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const projectLoadInputRef = useRef<HTMLInputElement>(null)

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
    setPreviewMode(false)
  }, [])

  const handleSaveProject = useCallback(async () => {
    if (projectBusy) return
    setProjectBusy(true)
    try {
      await savePanoramaProject({ panoramas, activePanoramaId })
    } catch (error) {
      const message = error instanceof PanoramaProjectError ? error.message : 'Failed to save project'
      alert(message)
    } finally {
      setProjectBusy(false)
    }
  }, [activePanoramaId, panoramas, projectBusy])

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
        'Load project?\n\nThis replaces the current tour (panoramas, hotspots, and initial views). Unsaved changes will be lost.'
      )
    ) {
      return
    }

    setProjectBusy(true)
    try {
      const restored = await loadPanoramaProjectFromFile(file)
      const active = restored.panoramas.find((p) => p.id === restored.activePanoramaId) ?? restored.panoramas[0]
      setPanoramas(restored.panoramas)
      setActivePanoramaId(restored.activePanoramaId)
      setViewOrientation({
        yaw: active?.initialYaw ?? 0,
        pitch: active?.initialPitch ?? 0
      })
      resetEditorUiState()
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
  }, [panoramas.length, resetEditorUiState])

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
    setCurrentViewOrientation({ yaw, pitch })
  }, [])

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

  const handleExitPreview = useCallback(() => {
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
  }, [editMode])

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
      } else {
        handleExitPreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewMode, handleExitPreview])

  const effectiveEditMode = editMode && !previewMode

  return (
    <div className={`panorama-360-app ${previewMode ? 'preview-mode' : ''}`}>
      <header className="panorama-360-header">
        <div className="panorama-360-header-main">
          <h1>360° Virtual Tour</h1>
          <p>Upload equirectangular panoramas, add hotspots, and link scenes together.</p>
        </div>
        <div className="panorama-360-actions">
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
        </div>
      </header>

      <div className="panorama-360-body">
        {!previewMode && (
        <Panorama360TourPanel
          panoramas={panoramas}
          activePanoramaId={activePanoramaId}
          editMode={editMode}
          selectedHotspotId={selectedHotspotId}
          pendingPlacement={pendingPlacement}
          placementMode={placementMode}
          onSelectPanorama={handleSelectPanorama}
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
                <span className="panorama-360-preview-badge">Preview</span>
                <span className="panorama-360-preview-scene">{activePanorama.name}</span>
              </div>
              <div className="panorama-360-preview-bar-actions">
                <button type="button" className="panorama-360-preview-btn secondary" onClick={handleToggleFullscreen}>
                  Fullscreen
                </button>
                <button type="button" className="panorama-360-preview-btn" onClick={handleExitPreview}>
                  Edit tour
                </button>
              </div>
            </div>
          )}
          {activePanorama ? (
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
              onError={(err) => alert(`Failed to load image: ${err.message}`)}
            />
          ) : (
            <div className="panorama-360-placeholder">
              <div className="placeholder-content">
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
