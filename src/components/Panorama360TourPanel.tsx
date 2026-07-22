import React, { useEffect, useRef, useState } from 'react'

import type {

  PanoramaEntry,

  PanoramaHotspot,

  PanoramaHotspotShape,

  PanoramaHotspotType,

  PanoramaPopupAnchor

} from '../panorama/panoramaTourTypes'

import {

  createHotspotId,

  DEFAULT_HOTSPOT_COLORS,

  DEFAULT_HOTSPOT_SHAPE,

  DEFAULT_POPUP_ANCHOR,

  DEFAULT_POPUP_BORDER_COLOR,

  DEFAULT_POPUP_WIDTH,

  degToRad,

  getHotspotColor,

  getPopupBorderColor,

  hasPanoramaInitialView,

  PLACEMENT_PREVIEW_HOTSPOT_ID,

  radToDeg

} from '../panorama/panoramaTourTypes'

import {
  BIRDS_COUNT_OPTIONS,
  type BirdsEffectSettings
} from '../panorama/birdsEffectSettings'
import {
  PARTICLES_FIRE_COUNT_OPTIONS,
  PARTICLES_SMOKE_COUNT_OPTIONS,
  type ParticlesEffectSettings
} from '../panorama/particlesEffectSettings'
import {
  applySpoutShapePreset,
  type SpoutEffectSettings,
  type SpoutShapePreset
} from '../panorama/spoutEffectSettings'
import type { GuidedTour, GuidedTourStep } from '../panorama/guidedTourTypes'
import Panorama360GuidedTourSection from './Panorama360GuidedTourSection'

import './Panorama360TourPanel.css'

type EffectsTab = 'birds' | 'particles' | 'spout'



interface Panorama360TourPanelProps {

  panoramas: PanoramaEntry[]

  activePanoramaId: string | null

  editMode: boolean

  selectedHotspotId: string | null

  pendingPlacement: { yaw: number; pitch: number } | null
  placementMode: boolean

  onSelectPanorama: (id: string) => void

  onAddPanoramas: (files: File[]) => void

  onRemovePanorama: (id: string) => void

  onRenamePanorama: (id: string, name: string) => void

  onSetInitialView: () => void

  onUpdateInitialView: (yaw: number, pitch: number) => void

  onResetInitialView: () => void

  onToggleEditMode: () => void

  onEnterEditMode: () => void

  onSelectHotspot: (id: string | null, focusCamera?: boolean) => void
  onStartPlacement: () => void
  onStartAddHotspot: () => void

  onSaveHotspot: (hotspot: PanoramaHotspot) => void

  onMoveHotspot: (hotspotId: string, yaw: number, pitch: number) => void

  onDeleteHotspot: (hotspotId: string) => void

  onCancelPlacement: () => void

  onEditPopupPreviewChange: (hotspot: PanoramaHotspot | null) => void

  onEditMarkerPreviewChange: (hotspot: PanoramaHotspot | null) => void

  popupOffsetPatch: { popupOffsetX: number; popupOffsetY: number } | null

  onPopupOffsetPatchApplied: () => void

  birdsEffect: BirdsEffectSettings

  onBirdsEffectChange: (patch: Partial<BirdsEffectSettings>) => void

  /** Pin flock home to the live camera look (preferred over React state). */
  onPinBirdsToView: () => void

  birdsStatus: {
    status: 'idle' | 'ready' | 'unsupported' | 'error'
    message?: string
  }

  particlesEffect: ParticlesEffectSettings

  onParticlesEffectChange: (patch: Partial<ParticlesEffectSettings>) => void

  onPinParticlesToView: () => void

  particlesStatus: {
    status: 'idle' | 'ready' | 'unsupported' | 'error'
    message?: string
  }

  spoutEffect: SpoutEffectSettings

  onSpoutEffectChange: (patch: Partial<SpoutEffectSettings>) => void

  onPinSpoutToView: () => void

  spoutStatus: {
    status: 'idle' | 'ready' | 'unsupported' | 'error'
    message?: string
  }

  guidedTours: GuidedTour[]
  activeGuidedTourId: string | null
  selectedGuidedStepId: string | null
  currentViewForGuided: { yaw: number; pitch: number; fov: number }
  guidedTourPlaying: boolean
  guidedTourStepIndex: number
  onSelectGuidedTour: (tourId: string | null) => void
  onCreateGuidedTour: () => void
  onRenameGuidedTour: (tourId: string, name: string) => void
  onDeleteGuidedTour: (tourId: string) => void
  onSelectGuidedStep: (stepId: string | null) => void
  onAddGuidedStepFromView: () => void
  onUpdateGuidedStep: (stepId: string, patch: Partial<GuidedTourStep>) => void
  onDeleteGuidedStep: (stepId: string) => void
  onMoveGuidedStep: (stepId: string, direction: -1 | 1) => void
  onPlayGuidedTour: () => void
  onStopGuidedTour: () => void
}



const HOTSPOT_TYPES: { value: PanoramaHotspotType; label: string }[] = [

  { value: 'link', label: 'Link to panorama' },

  { value: 'info', label: 'Info popup' },

  { value: 'url', label: 'Open URL' }

]



const HOTSPOT_SHAPES: { value: PanoramaHotspotShape; label: string }[] = [

  { value: 'circle', label: 'Circle' },

  { value: 'pin', label: 'Pin' },

  { value: 'square', label: 'Square' }

]



const POPUP_ANCHORS: { value: PanoramaPopupAnchor; label: string }[] = [

  { value: 'center', label: 'Center on marker' },

  { value: 'above', label: 'Above marker' },

  { value: 'below', label: 'Below marker' },

  { value: 'left', label: 'Left of marker' },

  { value: 'right', label: 'Right of marker' }

]



interface HotspotDraft {

  label: string

  type: PanoramaHotspotType

  yaw: number

  pitch: number

  targetPanoramaId: string

  info: string

  url: string

  openInIframe: boolean

  color: string

  shape: PanoramaHotspotShape

  popupWidth: number

  popupHeight: string

  popupAnchor: PanoramaPopupAnchor

  popupOffsetX: number

  popupOffsetY: number

  popupBorderColor: string

}



function defaultDraft(type: PanoramaHotspotType = 'link', yaw = 0, pitch = 0): HotspotDraft {

  return {

    label: 'New hotspot',

    type,

    yaw,

    pitch,

    targetPanoramaId: '',

    info: '',

    url: '',

    openInIframe: false,

    color: DEFAULT_HOTSPOT_COLORS[type],

    shape: DEFAULT_HOTSPOT_SHAPE,

    popupWidth: DEFAULT_POPUP_WIDTH,

    popupHeight: '',

    popupAnchor: DEFAULT_POPUP_ANCHOR,

    popupOffsetX: 0,

    popupOffsetY: 0,

    popupBorderColor: DEFAULT_POPUP_BORDER_COLOR

  }

}



function draftFromHotspot(hotspot: PanoramaHotspot): HotspotDraft {

  return {

    label: hotspot.label,

    type: hotspot.type,

    yaw: hotspot.yaw,

    pitch: hotspot.pitch,

    targetPanoramaId: hotspot.targetPanoramaId ?? '',

    info: hotspot.info ?? '',

    url: hotspot.url ?? '',

    openInIframe: hotspot.openInIframe ?? false,

    color: getHotspotColor(hotspot),

    shape: hotspot.shape ?? DEFAULT_HOTSPOT_SHAPE,

    popupWidth: hotspot.popupWidth ?? DEFAULT_POPUP_WIDTH,

    popupHeight: hotspot.popupHeight != null ? String(hotspot.popupHeight) : '',

    popupAnchor: hotspot.popupAnchor ?? DEFAULT_POPUP_ANCHOR,

    popupOffsetX: hotspot.popupOffsetX ?? 0,

    popupOffsetY: hotspot.popupOffsetY ?? 0,

    popupBorderColor: getPopupBorderColor(hotspot)

  }

}



function buildHotspot(id: string, draft: HotspotDraft): PanoramaHotspot {

  const popupHeight = draft.popupHeight.trim() ? Number(draft.popupHeight) : undefined

  return {

    id,

    label: draft.label.trim() || 'Hotspot',

    yaw: draft.yaw,

    pitch: draft.pitch,

    type: draft.type,

    targetPanoramaId: draft.type === 'link' ? draft.targetPanoramaId || undefined : undefined,

    info: draft.type === 'info' ? draft.info : undefined,

    url: draft.type === 'url' ? draft.url : undefined,

    openInIframe: draft.type === 'url' && draft.openInIframe ? true : undefined,

    color: draft.color,

    shape: draft.shape,

    popupWidth: draft.type === 'info' ? draft.popupWidth : undefined,

    popupHeight: draft.type === 'info' && popupHeight && popupHeight > 0 ? popupHeight : undefined,

    popupAnchor: draft.type === 'info' ? draft.popupAnchor : undefined,

    popupOffsetX: draft.type === 'info' ? draft.popupOffsetX : undefined,

    popupOffsetY: draft.type === 'info' ? draft.popupOffsetY : undefined,

    popupBorderColor: draft.type === 'info' ? draft.popupBorderColor : undefined

  }

}



export default function Panorama360TourPanel({

  panoramas,

  activePanoramaId,

  editMode,

  selectedHotspotId,

  pendingPlacement,
  placementMode,

  onSelectPanorama,

  onAddPanoramas,

  onRemovePanorama,

  onRenamePanorama,

  onSetInitialView,

  onUpdateInitialView,

  onResetInitialView,

  onToggleEditMode,

  onEnterEditMode,

  onSelectHotspot,
  onStartPlacement,
  onStartAddHotspot,

  onSaveHotspot,

  onMoveHotspot,

  onDeleteHotspot,

  onCancelPlacement,

  onEditPopupPreviewChange,

  onEditMarkerPreviewChange,

  popupOffsetPatch,

  onPopupOffsetPatchApplied,

  birdsEffect,

  onBirdsEffectChange,

  onPinBirdsToView,

  birdsStatus,

  particlesEffect,

  onParticlesEffectChange,

  onPinParticlesToView,

  particlesStatus,

  spoutEffect,

  onSpoutEffectChange,

  onPinSpoutToView,

  spoutStatus,

  guidedTours,
  activeGuidedTourId,
  selectedGuidedStepId,
  currentViewForGuided,
  guidedTourPlaying,
  guidedTourStepIndex,
  onSelectGuidedTour,
  onCreateGuidedTour,
  onRenameGuidedTour,
  onDeleteGuidedTour,
  onSelectGuidedStep,
  onAddGuidedStepFromView,
  onUpdateGuidedStep,
  onDeleteGuidedStep,
  onMoveGuidedStep,
  onPlayGuidedTour,
  onStopGuidedTour

}: Panorama360TourPanelProps) {

  const activePanorama = panoramas.find((p) => p.id === activePanoramaId) ?? null
  const hasHotspots = (activePanorama?.hotspots.length ?? 0) > 0

  const selectedHotspot = activePanorama?.hotspots.find((h) => h.id === selectedHotspotId) ?? null

  const isEditing = editMode && !!selectedHotspot && !pendingPlacement

  const isPlacing = !!pendingPlacement



  const [draft, setDraft] = useState<HotspotDraft>(() => defaultDraft())
  const [effectsExpanded, setEffectsExpanded] = useState(false)
  const [effectsTab, setEffectsTab] = useState<EffectsTab>('birds')

  const loadedHotspotIdRef = useRef<string | null>(null)



  useEffect(() => {

    if (pendingPlacement) {

      loadedHotspotIdRef.current = null

      setDraft(defaultDraft('link', pendingPlacement.yaw, pendingPlacement.pitch))

    }

  }, [pendingPlacement])



  useEffect(() => {

    if (!editMode || pendingPlacement) {

      if (!editMode) loadedHotspotIdRef.current = null

      return

    }

    if (!selectedHotspotId || !selectedHotspot) {

      loadedHotspotIdRef.current = null

      return

    }

    if (loadedHotspotIdRef.current === selectedHotspotId) return

    loadedHotspotIdRef.current = selectedHotspotId

    setDraft(draftFromHotspot(selectedHotspot))

  }, [selectedHotspotId, selectedHotspot, pendingPlacement, editMode])



  useEffect(() => {

    if (pendingPlacement || !selectedHotspot || !editMode) return

    setDraft((prev) => {

      if (prev.yaw === selectedHotspot.yaw && prev.pitch === selectedHotspot.pitch) return prev

      return { ...prev, yaw: selectedHotspot.yaw, pitch: selectedHotspot.pitch }

    })

  }, [selectedHotspot?.yaw, selectedHotspot?.pitch, pendingPlacement, selectedHotspot, editMode])



  useEffect(() => {

    if (!editMode) {

      onEditPopupPreviewChange(null)

      return

    }

    if (draft.type !== 'info') {

      onEditPopupPreviewChange(null)

      return

    }

    if (isPlacing) {

      onEditPopupPreviewChange(buildHotspot(PLACEMENT_PREVIEW_HOTSPOT_ID, draft))

      return

    }

    if (isEditing && selectedHotspot) {

      onEditPopupPreviewChange(buildHotspot(selectedHotspot.id, draft))

      return

    }

    onEditPopupPreviewChange(null)

  }, [draft, editMode, isPlacing, isEditing, selectedHotspot, onEditPopupPreviewChange])



  useEffect(() => {

    if (!editMode) {

      onEditMarkerPreviewChange(null)

      return

    }

    if (isPlacing) {

      onEditMarkerPreviewChange(buildHotspot(PLACEMENT_PREVIEW_HOTSPOT_ID, draft))

      return

    }

    if (isEditing && selectedHotspot) {

      onEditMarkerPreviewChange(buildHotspot(selectedHotspot.id, draft))

      return

    }

    onEditMarkerPreviewChange(null)

  }, [draft, editMode, isPlacing, isEditing, selectedHotspot, onEditMarkerPreviewChange])



  useEffect(() => {

    if (!popupOffsetPatch) return

    setDraft((prev) => ({ ...prev, ...popupOffsetPatch }))

    onPopupOffsetPatchApplied()

  }, [popupOffsetPatch, onPopupOffsetPatchApplied])



  const updateDraft = (patch: Partial<HotspotDraft>) => {

    setDraft((prev) => {

      const next = { ...prev, ...patch }

      if (patch.type && patch.type !== prev.type && !patch.color) {

        next.color = DEFAULT_HOTSPOT_COLORS[patch.type]

      }

      return next

    })

  }



  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {

    const files = e.target.files

    if (files?.length) {

      onAddPanoramas(Array.from(files))

      e.target.value = ''

    }

  }



  const handleSave = () => {

    if (isPlacing) {

      onSaveHotspot(buildHotspot(createHotspotId(), draft))

      return

    }

    if (selectedHotspot) {

      const saved = buildHotspot(selectedHotspot.id, draft)

      onSaveHotspot(saved)

      loadedHotspotIdRef.current = saved.id

      setDraft(draftFromHotspot(saved))

    }

  }



  const handleYawPitchChange = (yawDeg: number, pitchDeg: number) => {

    const yaw = degToRad(yawDeg)

    const pitch = degToRad(Math.max(-89, Math.min(89, pitchDeg)))

    updateDraft({ yaw, pitch })

    if (isEditing && selectedHotspot) {

      onMoveHotspot(selectedHotspot.id, yaw, pitch)

    }

  }

  const handleInitialViewChange = (yawDeg: number, pitchDeg: number) => {
    const yaw = degToRad(yawDeg)
    const pitch = degToRad(Math.max(-89, Math.min(89, pitchDeg)))
    onUpdateInitialView(yaw, pitch)
  }

  const handleBirdsOrientationChange = (yawDeg: number, pitchDeg: number) => {
    const yaw = degToRad(yawDeg)
    const pitch = degToRad(Math.max(-89, Math.min(89, pitchDeg)))
    onBirdsEffectChange({ viewYaw: yaw, viewPitch: pitch })
  }

  const handleSetBirdsFromCurrentView = () => {
    onPinBirdsToView()
  }

  const handleResetBirdsOrientation = () => {
    onBirdsEffectChange({ viewYaw: 0, viewPitch: 0 })
  }

  const handleParticlesOrientationChange = (yawDeg: number, pitchDeg: number) => {
    const yaw = degToRad(yawDeg)
    const pitch = degToRad(Math.max(-89, Math.min(89, pitchDeg)))
    onParticlesEffectChange({ viewYaw: yaw, viewPitch: pitch })
  }

  const handleSetParticlesFromCurrentView = () => {
    onPinParticlesToView()
  }

  const handleResetParticlesOrientation = () => {
    onParticlesEffectChange({ viewYaw: 0, viewPitch: 0 })
  }

  const handleSpoutOrientationChange = (yawDeg: number, pitchDeg: number) => {
    const yaw = degToRad(yawDeg)
    const pitch = degToRad(Math.max(-89, Math.min(89, pitchDeg)))
    onSpoutEffectChange({ viewYaw: yaw, viewPitch: pitch })
  }

  const handleSetSpoutFromCurrentView = () => {
    onPinSpoutToView()
  }

  const handleResetSpoutOrientation = () => {
    onSpoutEffectChange({ viewYaw: 0, viewPitch: 0 })
  }

  const handleSpoutShapePreset = (preset: SpoutShapePreset) => {
    if (preset === 'custom') {
      onSpoutEffectChange({ shapePreset: 'custom' })
      return
    }
    onSpoutEffectChange(applySpoutShapePreset(preset))
  }

  const renderInitialViewSection = () => {
    if (!activePanorama) return null
    const hasInitialView = hasPanoramaInitialView(activePanorama)
    const yawDeg = Math.round(radToDeg(activePanorama.initialYaw ?? 0) * 10) / 10
    const pitchDeg = Math.round(radToDeg(activePanorama.initialPitch ?? 0) * 10) / 10

    return (
      <section className="panorama-tour-section">
        <div className="panorama-tour-section-header">
          <h2>Initial view</h2>
        </div>
        <p className="panorama-tour-hint">
          Set where the camera looks when this panorama is opened or linked to.
        </p>
        <fieldset className="panorama-tour-fieldset">
          <legend>Orientation</legend>
          <div className="panorama-tour-row">
            <label>
              Yaw (°)
              <input
                type="number"
                step="1"
                value={yawDeg}
                onChange={(e) => handleInitialViewChange(Number(e.target.value), pitchDeg)}
              />
            </label>
            <label>
              Pitch (°)
              <input
                type="number"
                step="1"
                min={-89}
                max={89}
                value={pitchDeg}
                onChange={(e) => handleInitialViewChange(yawDeg, Number(e.target.value))}
              />
            </label>
          </div>
        </fieldset>
        <div className="panorama-tour-initial-view-actions">
          <button type="button" onClick={onSetInitialView}>
            Set from current view
          </button>
          {hasInitialView && (
            <button type="button" className="secondary" onClick={onResetInitialView}>
              Reset
            </button>
          )}
        </div>
        {!hasInitialView && (
          <p className="panorama-tour-field-hint">No custom initial view — defaults to forward (0°, 0°).</p>
        )}
      </section>
    )
  }



  const linkTargets = panoramas.filter((p) => p.id !== activePanoramaId)



  const renderHotspotForm = (title: string, saveLabel: string, showCancel: boolean) => (

    <div className="panorama-tour-placement-form">

      <h3>{title}</h3>



      <label>

        Label

        <input value={draft.label} onChange={(e) => updateDraft({ label: e.target.value })} />

      </label>



      <label>

        Type

        <select

          value={draft.type}

          onChange={(e) => updateDraft({ type: e.target.value as PanoramaHotspotType })}

        >

          {HOTSPOT_TYPES.map((t) => (

            <option key={t.value} value={t.value}>{t.label}</option>

          ))}

        </select>

      </label>



      {draft.type === 'link' && (

        <label>

          Link to

          <select

            value={draft.targetPanoramaId}

            onChange={(e) => updateDraft({ targetPanoramaId: e.target.value })}

          >

            <option value="">Select panorama…</option>

            {linkTargets.map((p) => (

              <option key={p.id} value={p.id}>{p.name}</option>

            ))}

          </select>

        </label>

      )}



      {draft.type === 'info' && (

        <label>

          Info text

          <textarea value={draft.info} onChange={(e) => updateDraft({ info: e.target.value })} rows={3} />

        </label>

      )}



      {draft.type === 'url' && (

        <>

        <label>

          URL

          <input

            value={draft.url}

            onChange={(e) => updateDraft({ url: e.target.value })}

            placeholder="https://…"

          />

        </label>

        <label className="panorama-tour-checkbox">

          <input

            type="checkbox"

            checked={draft.openInIframe}

            onChange={(e) => updateDraft({ openInIframe: e.target.checked })}

          />

          Open in iframe (embedded overlay)

        </label>

        </>

      )}



      <fieldset className="panorama-tour-fieldset">

        <legend>Position</legend>

        <div className="panorama-tour-row">

          <label>

            Yaw (°)

            <input

              type="number"

              step="1"

              value={Math.round(radToDeg(draft.yaw) * 10) / 10}

              onChange={(e) => handleYawPitchChange(Number(e.target.value), radToDeg(draft.pitch))}

            />

          </label>

          <label>

            Pitch (°)

            <input

              type="number"

              step="1"

              min={-89}

              max={89}

              value={Math.round(radToDeg(draft.pitch) * 10) / 10}

              onChange={(e) => handleYawPitchChange(radToDeg(draft.yaw), Number(e.target.value))}

            />

          </label>

        </div>

        {isEditing && (

          <p className="panorama-tour-field-hint">

            Drag the marker on the scene, click a new spot, or edit angles above.

          </p>

        )}

      </fieldset>



      <fieldset className="panorama-tour-fieldset">

        <legend>Appearance</legend>

        <label>

          Color

          <input

            type="color"

            value={draft.color}

            onChange={(e) => updateDraft({ color: e.target.value })}

          />

        </label>

        <label>

          Shape

          <select

            value={draft.shape}

            onChange={(e) => updateDraft({ shape: e.target.value as PanoramaHotspotShape })}

          >

            {HOTSPOT_SHAPES.map((s) => (

              <option key={s.value} value={s.value}>{s.label}</option>

            ))}

          </select>

        </label>

      </fieldset>



      {draft.type === 'info' && (

        <fieldset className="panorama-tour-fieldset">

          <legend>Popup layout</legend>

          <label>

            Outline color

            <input

              type="color"

              value={draft.popupBorderColor}

              onChange={(e) => updateDraft({ popupBorderColor: e.target.value })}

            />

          </label>

          <div className="panorama-tour-row">

            <label>

              Width (px)

              <input

                type="number"

                min={120}

                max={800}

                value={draft.popupWidth}

                onChange={(e) => updateDraft({ popupWidth: Number(e.target.value) || DEFAULT_POPUP_WIDTH })}

              />

            </label>

            <label>

              Height (px)

              <input

                type="number"

                min={0}

                placeholder="Auto"

                value={draft.popupHeight}

                onChange={(e) => updateDraft({ popupHeight: e.target.value })}

              />

            </label>

          </div>

          <label>

            Anchor

            <select

              value={draft.popupAnchor}

              onChange={(e) => updateDraft({ popupAnchor: e.target.value as PanoramaPopupAnchor })}

            >

              {POPUP_ANCHORS.map((a) => (

                <option key={a.value} value={a.value}>{a.label}</option>

              ))}

            </select>

          </label>

          <div className="panorama-tour-row">

            <label>

              Offset X (px)

              <input

                type="number"

                value={draft.popupOffsetX}

                onChange={(e) => updateDraft({ popupOffsetX: Number(e.target.value) || 0 })}

              />

            </label>

            <label>

              Offset Y (px)

              <input

                type="number"

                value={draft.popupOffsetY}

                onChange={(e) => updateDraft({ popupOffsetY: Number(e.target.value) || 0 })}

              />

            </label>

          </div>

        </fieldset>

      )}



      <div className="panorama-tour-form-actions">

        <button type="button" onClick={handleSave}>{saveLabel}</button>

        {showCancel && (

          <button

            type="button"

            className="secondary"

            onClick={() => {

              if (isPlacing) onCancelPlacement()

              else onSelectHotspot(null)

            }}

          >

            Cancel

          </button>

        )}

        {isEditing && selectedHotspot && (

          <button

            type="button"

            className="danger"

            onClick={() => onDeleteHotspot(selectedHotspot.id)}

          >

            Delete

          </button>

        )}

      </div>

    </div>

  )



  return (

    <aside className="panorama-tour-panel">

      <section className="panorama-tour-section">

        <div className="panorama-tour-section-header">

          <h2>Panoramas</h2>

          <label className="panorama-tour-add-btn">

            + Add

            <input

              type="file"

              accept=".jpg,.jpeg,.png,.webp,.hdr,.exr,.ktx2"

              multiple

              onChange={handleFileInput}

              hidden

            />

          </label>

        </div>

        {panoramas.length === 0 ? (

          <p className="panorama-tour-empty">Upload a 360° equirectangular image to start your tour.</p>

        ) : (

          <ul className="panorama-tour-list">

            {panoramas.map((pano) => (

              <li

                key={pano.id}

                className={`panorama-tour-item ${pano.id === activePanoramaId ? 'active' : ''}`}

              >

                <div className="panorama-tour-item-body">

                  {pano.id === activePanoramaId ? (

                    <>

                      <div className="panorama-tour-item-active-header">

                        <input

                          className="panorama-tour-rename"

                          value={pano.name}

                          onChange={(e) => onRenamePanorama(pano.id, e.target.value)}

                          aria-label="Panorama name"

                          title={pano.name}

                        />

                        <span className="panorama-tour-active-badge">Editing</span>

                      </div>

                      <span className="panorama-tour-item-meta">{pano.hotspots.length} hotspots</span>

                    </>

                  ) : (

                    <button

                      type="button"

                      className="panorama-tour-item-select"

                      onClick={() => onSelectPanorama(pano.id)}

                      title={pano.name}

                    >

                      <span className="panorama-tour-item-name">{pano.name}</span>

                      <span className="panorama-tour-item-meta">{pano.hotspots.length} hotspots</span>

                    </button>

                  )}

                </div>

                {panoramas.length > 1 && (

                  <button

                    type="button"

                    className="panorama-tour-item-remove"

                    onClick={() => onRemovePanorama(pano.id)}

                    title="Remove panorama"

                  >

                    ×

                  </button>

                )}

              </li>

            ))}

          </ul>

        )}

      </section>



      <section className="panorama-tour-section">
        <div
          className={`panorama-tour-section-header${effectsExpanded ? '' : ' panorama-tour-section-header-collapsed'}`}
        >
          <button
            type="button"
            className="panorama-tour-section-toggle"
            onClick={() => setEffectsExpanded((open) => !open)}
            aria-expanded={effectsExpanded}
            aria-controls="panorama-tour-effects-body"
          >
            <span className="panorama-tour-section-chevron" aria-hidden="true">
              {effectsExpanded ? '▼' : '▶'}
            </span>
            <h2>Effects</h2>
          </button>
        </div>
        {effectsExpanded && (
          <div id="panorama-tour-effects-body">
            <p className="panorama-tour-hint">
              Transparent overlays. Enable each effect separately — Birds / Particles need WebGPU;
              Spout uses WebGL2. Pointers pass through unless Spout “Edit transform” is on.
            </p>

            <div className="panorama-tour-effects-tabs" role="tablist" aria-label="Effects">
              <button
                type="button"
                role="tab"
                id="panorama-effects-tab-birds"
                aria-selected={effectsTab === 'birds'}
                aria-controls="panorama-effects-panel-birds"
                className={`panorama-tour-effects-tab${effectsTab === 'birds' ? ' active' : ''}${birdsEffect.enabled ? ' enabled' : ''}`}
                onClick={() => setEffectsTab('birds')}
              >
                Birds
                <span className="panorama-tour-effects-tab-dot" aria-hidden="true" />
              </button>
              <button
                type="button"
                role="tab"
                id="panorama-effects-tab-particles"
                aria-selected={effectsTab === 'particles'}
                aria-controls="panorama-effects-panel-particles"
                className={`panorama-tour-effects-tab${effectsTab === 'particles' ? ' active' : ''}${particlesEffect.enabled ? ' enabled' : ''}`}
                onClick={() => setEffectsTab('particles')}
              >
                Particles
                <span className="panorama-tour-effects-tab-dot" aria-hidden="true" />
              </button>
              <button
                type="button"
                role="tab"
                id="panorama-effects-tab-spout"
                aria-selected={effectsTab === 'spout'}
                aria-controls="panorama-effects-panel-spout"
                className={`panorama-tour-effects-tab${effectsTab === 'spout' ? ' active' : ''}${spoutEffect.enabled ? ' enabled' : ''}`}
                onClick={() => setEffectsTab('spout')}
              >
                Spout
                <span className="panorama-tour-effects-tab-dot" aria-hidden="true" />
              </button>
            </div>

            {effectsTab === 'birds' && (
              <div
                id="panorama-effects-panel-birds"
                role="tabpanel"
                aria-labelledby="panorama-effects-tab-birds"
                className="panorama-tour-effects-panel"
              >
                <div className="panorama-tour-effects-panel-header">
                  <label className="panorama-tour-checkbox">
                    <input
                      type="checkbox"
                      checked={birdsEffect.enabled}
                      onChange={(e) => onBirdsEffectChange({ enabled: e.target.checked })}
                    />
                    Enable birds
                  </label>
                  <button
                    type="button"
                    className={`panorama-tour-add-btn ${birdsEffect.enabled ? 'active' : ''}`}
                    onClick={() => onBirdsEffectChange({ enabled: !birdsEffect.enabled })}
                  >
                    {birdsEffect.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                {birdsEffect.enabled && (
                  <div className="panorama-tour-effects-controls">
                    <label>
                      Bird count
                      <select
                        value={birdsEffect.count}
                        onChange={(e) => onBirdsEffectChange({ count: Number(e.target.value) })}
                      >
                        {BIRDS_COUNT_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n.toLocaleString()}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Size
                      <input
                        type="range"
                        min={0.25}
                        max={2.5}
                        step={0.05}
                        value={birdsEffect.size}
                        onChange={(e) => onBirdsEffectChange({ size: Number(e.target.value) })}
                      />
                      <span className="panorama-tour-range-value">{birdsEffect.size.toFixed(2)}</span>
                    </label>
                    <label>
                      Speed
                      <input
                        type="range"
                        min={0.25}
                        max={2.5}
                        step={0.05}
                        value={birdsEffect.speed}
                        onChange={(e) => onBirdsEffectChange({ speed: Number(e.target.value) })}
                      />
                      <span className="panorama-tour-range-value">{birdsEffect.speed.toFixed(2)}</span>
                    </label>
                    <label>
                      Color
                      <input
                        type="color"
                        value={birdsEffect.color}
                        onChange={(e) => onBirdsEffectChange({ color: e.target.value })}
                      />
                    </label>
                    <fieldset
                      className="panorama-tour-fieldset panorama-tour-flock-position"
                      data-testid="flock-position"
                      aria-label="Flock position"
                    >
                      <legend>Flock position</legend>
                      <p className="panorama-tour-field-hint panorama-tour-flock-position-banner">
                        Pin birds to the sky region you are looking at (same idea as Initial view).
                        The flock stays fixed there while you look around.
                      </p>
                      <div className="panorama-tour-row">
                        <label>
                          Yaw (°)
                          <input
                            type="number"
                            step="1"
                            value={Math.round(radToDeg(birdsEffect.viewYaw ?? 0) * 10) / 10}
                            onChange={(e) =>
                              handleBirdsOrientationChange(
                                Number(e.target.value),
                                radToDeg(birdsEffect.viewPitch ?? 0)
                              )
                            }
                          />
                        </label>
                        <label>
                          Pitch (°)
                          <input
                            type="number"
                            step="1"
                            min={-89}
                            max={89}
                            value={Math.round(radToDeg(birdsEffect.viewPitch ?? 0) * 10) / 10}
                            onChange={(e) =>
                              handleBirdsOrientationChange(
                                radToDeg(birdsEffect.viewYaw ?? 0),
                                Number(e.target.value)
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="panorama-tour-initial-view-actions">
                        <button
                          type="button"
                          className="primary panorama-tour-pin-birds-btn"
                          onClick={handleSetBirdsFromCurrentView}
                        >
                          Pin birds to view
                        </button>
                        <button type="button" className="secondary" onClick={handleResetBirdsOrientation}>
                          Reset flock position
                        </button>
                      </div>
                    </fieldset>
                    <fieldset className="panorama-tour-fieldset">
                      <legend>Flocking</legend>
                      <label>
                        Separation
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={birdsEffect.separation}
                          onChange={(e) => onBirdsEffectChange({ separation: Number(e.target.value) })}
                        />
                        <span className="panorama-tour-range-value">{birdsEffect.separation}</span>
                      </label>
                      <label>
                        Alignment
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={birdsEffect.alignment}
                          onChange={(e) => onBirdsEffectChange({ alignment: Number(e.target.value) })}
                        />
                        <span className="panorama-tour-range-value">{birdsEffect.alignment}</span>
                      </label>
                      <label>
                        Cohesion
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={birdsEffect.cohesion}
                          onChange={(e) => onBirdsEffectChange({ cohesion: Number(e.target.value) })}
                        />
                        <span className="panorama-tour-range-value">{birdsEffect.cohesion}</span>
                      </label>
                    </fieldset>
                    {(birdsStatus.status === 'unsupported' || birdsStatus.status === 'error') && (
                      <p className="panorama-tour-effects-warning">
                        {birdsStatus.message || 'WebGPU birds effect is unavailable in this browser.'}
                      </p>
                    )}
                    {birdsStatus.status === 'ready' && (
                      <p className="panorama-tour-field-hint">Running · move the mouse to disturb the flock.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {effectsTab === 'particles' && (
              <div
                id="panorama-effects-panel-particles"
                role="tabpanel"
                aria-labelledby="panorama-effects-tab-particles"
                className="panorama-tour-effects-panel"
              >
                <div className="panorama-tour-effects-panel-header">
                  <label className="panorama-tour-checkbox">
                    <input
                      type="checkbox"
                      checked={particlesEffect.enabled}
                      onChange={(e) => onParticlesEffectChange({ enabled: e.target.checked })}
                    />
                    Enable particles
                  </label>
                  <button
                    type="button"
                    className={`panorama-tour-add-btn ${particlesEffect.enabled ? 'active' : ''}`}
                    onClick={() => onParticlesEffectChange({ enabled: !particlesEffect.enabled })}
                  >
                    {particlesEffect.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                {particlesEffect.enabled && (
                  <div className="panorama-tour-effects-controls">
                    <label>
                      Smoke count
                      <select
                        value={particlesEffect.smokeCount}
                        onChange={(e) =>
                          onParticlesEffectChange({ smokeCount: Number(e.target.value) })
                        }
                      >
                        {PARTICLES_SMOKE_COUNT_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n.toLocaleString()}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Fire count
                      <select
                        value={particlesEffect.fireCount}
                        onChange={(e) =>
                          onParticlesEffectChange({ fireCount: Number(e.target.value) })
                        }
                      >
                        {PARTICLES_FIRE_COUNT_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n.toLocaleString()}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Size
                      <input
                        type="range"
                        min={0.25}
                        max={2.5}
                        step={0.05}
                        value={particlesEffect.size}
                        onChange={(e) => onParticlesEffectChange({ size: Number(e.target.value) })}
                      />
                      <span className="panorama-tour-range-value">{particlesEffect.size.toFixed(2)}</span>
                    </label>
                    <label>
                      Speed
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={particlesEffect.speed}
                        onChange={(e) => onParticlesEffectChange({ speed: Number(e.target.value) })}
                      />
                      <span className="panorama-tour-range-value">{particlesEffect.speed.toFixed(2)}</span>
                    </label>
                    <label>
                      Fire color
                      <input
                        type="color"
                        value={particlesEffect.fireColor}
                        onChange={(e) => onParticlesEffectChange({ fireColor: e.target.value })}
                      />
                    </label>
                    <label>
                      Ember color
                      <input
                        type="color"
                        value={particlesEffect.emberColor}
                        onChange={(e) => onParticlesEffectChange({ emberColor: e.target.value })}
                      />
                    </label>
                    <label className="panorama-tour-checkbox">
                      <input
                        type="checkbox"
                        checked={particlesEffect.showSmoke}
                        onChange={(e) => onParticlesEffectChange({ showSmoke: e.target.checked })}
                      />
                      Show smoke
                    </label>
                    <label className="panorama-tour-checkbox">
                      <input
                        type="checkbox"
                        checked={particlesEffect.showFire}
                        onChange={(e) => onParticlesEffectChange({ showFire: e.target.checked })}
                      />
                      Show fire
                    </label>
                    <fieldset
                      className="panorama-tour-fieldset panorama-tour-flock-position"
                      aria-label="Emitter position"
                    >
                      <legend>Emitter position</legend>
                      <p className="panorama-tour-field-hint panorama-tour-flock-position-banner">
                        Pin the fire/smoke emitter to the sky region you are looking at.
                        It stays fixed there while you look around.
                      </p>
                      <div className="panorama-tour-row">
                        <label>
                          Yaw (°)
                          <input
                            type="number"
                            step="1"
                            value={Math.round(radToDeg(particlesEffect.viewYaw ?? 0) * 10) / 10}
                            onChange={(e) =>
                              handleParticlesOrientationChange(
                                Number(e.target.value),
                                radToDeg(particlesEffect.viewPitch ?? 0)
                              )
                            }
                          />
                        </label>
                        <label>
                          Pitch (°)
                          <input
                            type="number"
                            step="1"
                            min={-89}
                            max={89}
                            value={Math.round(radToDeg(particlesEffect.viewPitch ?? 0) * 10) / 10}
                            onChange={(e) =>
                              handleParticlesOrientationChange(
                                radToDeg(particlesEffect.viewYaw ?? 0),
                                Number(e.target.value)
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="panorama-tour-initial-view-actions">
                        <button
                          type="button"
                          className="primary panorama-tour-pin-birds-btn"
                          onClick={handleSetParticlesFromCurrentView}
                        >
                          Pin particles to view
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={handleResetParticlesOrientation}
                        >
                          Reset emitter position
                        </button>
                      </div>
                    </fieldset>
                    {(particlesStatus.status === 'unsupported' || particlesStatus.status === 'error') && (
                      <p className="panorama-tour-effects-warning">
                        {particlesStatus.message ||
                          'WebGPU particles effect is unavailable in this browser.'}
                      </p>
                    )}
                    {particlesStatus.status === 'ready' && (
                      <p className="panorama-tour-field-hint">
                        Running · fire &amp; smoke sprites (TSL / WebGPU).
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {effectsTab === 'spout' && (
              <div
                id="panorama-effects-panel-spout"
                role="tabpanel"
                aria-labelledby="panorama-effects-tab-spout"
                className="panorama-tour-effects-panel"
              >
                <div className="panorama-tour-effects-panel-header">
                  <label className="panorama-tour-checkbox">
                    <input
                      type="checkbox"
                      checked={spoutEffect.enabled}
                      onChange={(e) => onSpoutEffectChange({ enabled: e.target.checked })}
                    />
                    Enable spout
                  </label>
                  <button
                    type="button"
                    className={`panorama-tour-add-btn ${spoutEffect.enabled ? 'active' : ''}`}
                    onClick={() => onSpoutEffectChange({ enabled: !spoutEffect.enabled })}
                  >
                    {spoutEffect.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                {spoutEffect.enabled && (
                  <div className="panorama-tour-effects-controls">
                    <p className="panorama-tour-field-hint">
                      Raymarched falling water (P_Malin / Shadertoy). Shape via presets and stream
                      SDF params — no pipe geometry.
                    </p>
                    <label>
                      Size
                      <input
                        type="range"
                        min={0.2}
                        max={3}
                        step={0.05}
                        value={spoutEffect.size}
                        onChange={(e) => onSpoutEffectChange({ size: Number(e.target.value) })}
                      />
                      <span className="panorama-tour-range-value">{spoutEffect.size.toFixed(2)}</span>
                    </label>
                    <label>
                      Water speed
                      <input
                        type="range"
                        min={0.1}
                        max={3}
                        step={0.05}
                        value={spoutEffect.speed}
                        onChange={(e) => onSpoutEffectChange({ speed: Number(e.target.value) })}
                      />
                      <span className="panorama-tour-range-value">{spoutEffect.speed.toFixed(2)}</span>
                    </label>
                    <label>
                      Exposure
                      <input
                        type="range"
                        min={0.4}
                        max={3}
                        step={0.05}
                        value={spoutEffect.exposure}
                        onChange={(e) => onSpoutEffectChange({ exposure: Number(e.target.value) })}
                      />
                      <span className="panorama-tour-range-value">{spoutEffect.exposure.toFixed(2)}</span>
                    </label>

                    <fieldset className="panorama-tour-fieldset" aria-label="Shape and material">
                      <legend>Shape / Material</legend>
                      <label>
                        Preset
                        <select
                          value={spoutEffect.shapePreset}
                          onChange={(e) => handleSpoutShapePreset(e.target.value as SpoutShapePreset)}
                        >
                          <option value="waterOnly">Water only (no pipe)</option>
                          <option value="classic">Classic room + pipe</option>
                          <option value="wide">Wide stream</option>
                          <option value="tall">Tall fall</option>
                          <option value="thin">Thin stream</option>
                          <option value="custom">Custom</option>
                        </select>
                      </label>
                      <label className="panorama-tour-checkbox">
                        <input
                          type="checkbox"
                          checked={spoutEffect.showPipe}
                          onChange={(e) =>
                            onSpoutEffectChange({
                              showPipe: e.target.checked,
                              shapePreset: 'custom'
                            })
                          }
                        />
                        Show pipe
                      </label>
                      <label>
                        Stream radius
                        <input
                          type="range"
                          min={0.1}
                          max={1.5}
                          step={0.01}
                          value={spoutEffect.pipeRadius}
                          onChange={(e) =>
                            onSpoutEffectChange({
                              pipeRadius: Number(e.target.value),
                              shapePreset: 'custom'
                            })
                          }
                        />
                        <span className="panorama-tour-range-value">
                          {spoutEffect.pipeRadius.toFixed(2)}
                        </span>
                      </label>
                      <label>
                        Pipe thickness
                        <input
                          type="range"
                          min={0.04}
                          max={0.6}
                          step={0.01}
                          value={spoutEffect.pipeThickness}
                          disabled={!spoutEffect.showPipe}
                          onChange={(e) =>
                            onSpoutEffectChange({
                              pipeThickness: Number(e.target.value),
                              shapePreset: 'custom'
                            })
                          }
                        />
                        <span className="panorama-tour-range-value">
                          {spoutEffect.pipeThickness.toFixed(2)}
                        </span>
                      </label>
                      <label>
                        Pipe length
                        <input
                          type="range"
                          min={0.2}
                          max={8}
                          step={0.05}
                          value={spoutEffect.pipeLength}
                          onChange={(e) =>
                            onSpoutEffectChange({
                              pipeLength: Number(e.target.value),
                              shapePreset: 'custom'
                            })
                          }
                        />
                        <span className="panorama-tour-range-value">
                          {spoutEffect.pipeLength.toFixed(2)}
                        </span>
                      </label>
                      <label>
                        Fall height
                        <input
                          type="range"
                          min={0.5}
                          max={6}
                          step={0.05}
                          value={spoutEffect.pipeHeight}
                          onChange={(e) =>
                            onSpoutEffectChange({
                              pipeHeight: Number(e.target.value),
                              shapePreset: 'custom'
                            })
                          }
                        />
                        <span className="panorama-tour-range-value">
                          {spoutEffect.pipeHeight.toFixed(2)}
                        </span>
                      </label>
                      {spoutEffect.showPipe && (
                        <>
                          <label>
                            Pipe color
                            <input
                              type="color"
                              value={spoutEffect.pipeColor}
                              onChange={(e) =>
                                onSpoutEffectChange({
                                  pipeColor: e.target.value,
                                  shapePreset: 'custom'
                                })
                              }
                            />
                          </label>
                          <label>
                            Pipe roughness
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={spoutEffect.pipeRoughness}
                              onChange={(e) =>
                                onSpoutEffectChange({
                                  pipeRoughness: Number(e.target.value),
                                  shapePreset: 'custom'
                                })
                              }
                            />
                            <span className="panorama-tour-range-value">
                              {spoutEffect.pipeRoughness.toFixed(2)}
                            </span>
                          </label>
                        </>
                      )}
                      <fieldset className="panorama-tour-fieldset" aria-label="Water">
                        <legend>Water</legend>
                        <label>
                          Color
                          <input
                            type="color"
                            value={spoutEffect.waterColor}
                            onChange={(e) =>
                              onSpoutEffectChange({
                                waterColor: e.target.value,
                                shapePreset: 'custom'
                              })
                            }
                          />
                        </label>
                        <label>
                          Transparency
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={spoutEffect.waterOpacity}
                            onChange={(e) =>
                              onSpoutEffectChange({
                                waterOpacity: Number(e.target.value),
                                shapePreset: 'custom'
                              })
                            }
                          />
                          <span className="panorama-tour-range-value">
                            {spoutEffect.waterOpacity.toFixed(2)}
                          </span>
                        </label>
                        <label>
                          Roughness
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={spoutEffect.waterRoughness}
                            onChange={(e) =>
                              onSpoutEffectChange({
                                waterRoughness: Number(e.target.value),
                                shapePreset: 'custom'
                              })
                            }
                          />
                          <span className="panorama-tour-range-value">
                            {spoutEffect.waterRoughness.toFixed(2)}
                          </span>
                        </label>
                        <label>
                          IOR
                          <input
                            type="range"
                            min={1}
                            max={2.5}
                            step={0.01}
                            value={spoutEffect.waterIor}
                            onChange={(e) =>
                              onSpoutEffectChange({
                                waterIor: Number(e.target.value),
                                shapePreset: 'custom'
                              })
                            }
                          />
                          <span className="panorama-tour-range-value">
                            {spoutEffect.waterIor.toFixed(2)}
                          </span>
                        </label>
                        <label>
                          Tint intensity
                          <input
                            type="range"
                            min={0.2}
                            max={6}
                            step={0.05}
                            value={spoutEffect.waterTint}
                            onChange={(e) =>
                              onSpoutEffectChange({
                                waterTint: Number(e.target.value),
                                shapePreset: 'custom'
                              })
                            }
                          />
                          <span className="panorama-tour-range-value">
                            {spoutEffect.waterTint.toFixed(2)}
                          </span>
                        </label>
                      </fieldset>
                      <label className="panorama-tour-checkbox">
                        <input
                          type="checkbox"
                          checked={spoutEffect.showFloor}
                          onChange={(e) =>
                            onSpoutEffectChange({
                              showFloor: e.target.checked,
                              shapePreset: 'custom'
                            })
                          }
                        />
                        Show floor / wall (classic room)
                      </label>
                    </fieldset>

                    <fieldset className="panorama-tour-fieldset" aria-label="Transform gizmo">
                      <legend>Transform gizmo</legend>
                      <label className="panorama-tour-checkbox">
                        <input
                          type="checkbox"
                          checked={spoutEffect.editTransform}
                          onChange={(e) => onSpoutEffectChange({ editTransform: e.target.checked })}
                        />
                        Edit transform (enables gizmo pointers)
                      </label>
                      <label>
                        Gizmo mode
                        <select
                          value={spoutEffect.gizmoMode}
                          onChange={(e) => {
                            const v = e.target.value
                            onSpoutEffectChange({
                              gizmoMode:
                                v === 'translate' || v === 'scale' || v === 'rotate' ? v : 'translate'
                            })
                          }}
                          disabled={!spoutEffect.editTransform}
                        >
                          <option value="translate">Move</option>
                          <option value="rotate">Rotate</option>
                          <option value="scale">Scale</option>
                        </select>
                      </label>
                      <p className="panorama-tour-field-hint">
                        When Edit transform is on, drag the gizmo in the view. Move updates yaw /
                        pitch; pin-to-view below still works.
                      </p>
                      <div className="panorama-tour-row">
                        <label>
                          Rot X (°)
                          <input
                            type="number"
                            step="1"
                            value={Math.round(radToDeg(spoutEffect.rotationX) * 10) / 10}
                            onChange={(e) =>
                              onSpoutEffectChange({ rotationX: degToRad(Number(e.target.value)) })
                            }
                          />
                        </label>
                        <label>
                          Rot Y (°)
                          <input
                            type="number"
                            step="1"
                            value={Math.round(radToDeg(spoutEffect.rotationY) * 10) / 10}
                            onChange={(e) =>
                              onSpoutEffectChange({ rotationY: degToRad(Number(e.target.value)) })
                            }
                          />
                        </label>
                        <label>
                          Rot Z (°)
                          <input
                            type="number"
                            step="1"
                            value={Math.round(radToDeg(spoutEffect.rotationZ) * 10) / 10}
                            onChange={(e) =>
                              onSpoutEffectChange({ rotationZ: degToRad(Number(e.target.value)) })
                            }
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          onSpoutEffectChange({ rotationX: 0, rotationY: 0, rotationZ: 0, size: 1 })
                        }
                      >
                        Reset rotation &amp; size
                      </button>
                    </fieldset>

                    <fieldset
                      className="panorama-tour-fieldset panorama-tour-flock-position"
                      aria-label="Spout position"
                    >
                      <legend>Spout position</legend>
                      <p className="panorama-tour-field-hint panorama-tour-flock-position-banner">
                        Pin the spout to the sky region you are looking at. It stays fixed there
                        while you look around.
                      </p>
                      <div className="panorama-tour-row">
                        <label>
                          Yaw (°)
                          <input
                            type="number"
                            step="1"
                            value={Math.round(radToDeg(spoutEffect.viewYaw ?? 0) * 10) / 10}
                            onChange={(e) =>
                              handleSpoutOrientationChange(
                                Number(e.target.value),
                                radToDeg(spoutEffect.viewPitch ?? 0)
                              )
                            }
                          />
                        </label>
                        <label>
                          Pitch (°)
                          <input
                            type="number"
                            step="1"
                            min={-89}
                            max={89}
                            value={Math.round(radToDeg(spoutEffect.viewPitch ?? 0) * 10) / 10}
                            onChange={(e) =>
                              handleSpoutOrientationChange(
                                radToDeg(spoutEffect.viewYaw ?? 0),
                                Number(e.target.value)
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="panorama-tour-initial-view-actions">
                        <button
                          type="button"
                          className="primary panorama-tour-pin-birds-btn"
                          onClick={handleSetSpoutFromCurrentView}
                        >
                          Pin spout to view
                        </button>
                        <button type="button" className="secondary" onClick={handleResetSpoutOrientation}>
                          Reset spout position
                        </button>
                      </div>
                    </fieldset>

                    {(spoutStatus.status === 'unsupported' || spoutStatus.status === 'error') && (
                      <p className="panorama-tour-effects-warning">
                        {spoutStatus.message ||
                          'WebGL2 Spout effect is unavailable in this browser.'}
                      </p>
                    )}
                    {spoutStatus.status === 'ready' && (
                      <p className="panorama-tour-field-hint">
                        Running · raymarched WebGL2 spout overlay.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>



      <Panorama360GuidedTourSection
        panoramas={panoramas}
        activePanoramaId={activePanoramaId}
        guidedTours={guidedTours}
        activeGuidedTourId={activeGuidedTourId}
        selectedStepId={selectedGuidedStepId}
        currentView={currentViewForGuided}
        isPlaying={guidedTourPlaying}
        playingStepIndex={guidedTourStepIndex}
        onSelectTour={onSelectGuidedTour}
        onCreateTour={onCreateGuidedTour}
        onRenameTour={onRenameGuidedTour}
        onDeleteTour={onDeleteGuidedTour}
        onSelectStep={onSelectGuidedStep}
        onAddStepFromCurrentView={onAddGuidedStepFromView}
        onUpdateStep={onUpdateGuidedStep}
        onDeleteStep={onDeleteGuidedStep}
        onMoveStep={onMoveGuidedStep}
        onPlay={onPlayGuidedTour}
        onStop={onStopGuidedTour}
      />



      {activePanorama && renderInitialViewSection()}



      {activePanorama && (

        <section className="panorama-tour-section">

          <div className="panorama-tour-section-header panorama-tour-section-header-stacked">

            <h2>Hotspots</h2>

            <div className="panorama-tour-header-actions">

              <button

                type="button"

                className={`panorama-tour-add-hotspot-btn ${!editMode ? 'primary' : ''} ${editMode && placementMode && !isPlacing ? 'active' : ''}`}

                onClick={editMode ? onStartPlacement : onStartAddHotspot}

              >

                + Add hotspot

              </button>

              {(hasHotspots || editMode) && (

                <button

                  type="button"

                  className={`panorama-tour-edit-btn ${editMode ? 'active' : ''}`}

                  onClick={onToggleEditMode}

                >

                  {editMode ? 'Done editing' : 'Edit hotspots'}

                </button>

              )}

            </div>

          </div>



          {editMode && placementMode && !isPlacing && !isEditing && (

            <p className="panorama-tour-hint">

              Click the panorama to place a hotspot.

            </p>

          )}



          {editMode && !placementMode && !isPlacing && !isEditing && (

            <p className="panorama-tour-hint">

              Select a hotspot to edit it, or click + Add hotspot to place a new one.

            </p>

          )}



          {isPlacing && renderHotspotForm('Place hotspot', 'Save hotspot', true)}

          {isEditing && renderHotspotForm('Edit hotspot', 'Save changes', true)}



          {activePanorama.hotspots.length === 0 && !pendingPlacement && !isPlacing && !(editMode && placementMode) ? (

            <p className="panorama-tour-empty">No hotspots yet. Click + Add hotspot, then click the scene to place one.</p>

          ) : activePanorama.hotspots.length > 0 ? (

            <ul className="panorama-tour-hotspot-list">

              {activePanorama.hotspots.map((hs) => (

                <li

                  key={hs.id}

                  className={`panorama-tour-hotspot-item ${hs.id === selectedHotspotId ? 'active' : ''}`}

                >

                  <button
                    type="button"
                    onClick={() => onSelectHotspot(hs.id, true)}
                    onDoubleClick={() => {
                      if (!editMode) onEnterEditMode()
                      onSelectHotspot(hs.id, true)
                    }}
                  >

                    <span

                      className="hotspot-color-dot"

                      style={{ background: getHotspotColor(hs) }}

                      aria-hidden

                    />

                    <span className={`hotspot-type-badge type-${hs.type}`}>{hs.type}</span>

                    <span className="panorama-tour-hotspot-label" title={hs.label}>{hs.label}</span>

                  </button>

                  <button

                    type="button"

                    className="panorama-tour-item-remove"

                    onClick={() => onDeleteHotspot(hs.id)}

                    title="Delete hotspot"

                  >

                    ×

                  </button>

                </li>

              ))}

            </ul>

          ) : null}

          {selectedHotspot && !editMode && !pendingPlacement && (
            <div className="panorama-tour-hotspot-detail">
              <h3>{selectedHotspot.label}</h3>
              <p>Type: {selectedHotspot.type}</p>
              {selectedHotspot.type === 'link' && selectedHotspot.targetPanoramaId && (
                <p>
                  Links to:{' '}
                  {panoramas.find((p) => p.id === selectedHotspot.targetPanoramaId)?.name ?? 'Unknown'}
                </p>
              )}
              {selectedHotspot.type === 'info' && selectedHotspot.info && (
                <p>{selectedHotspot.info}</p>
              )}
              {selectedHotspot.type === 'url' && selectedHotspot.url && (
                <p>
                  <a href={selectedHotspot.url} target="_blank" rel="noreferrer">{selectedHotspot.url}</a>
                  {selectedHotspot.openInIframe ? ' (opens in iframe)' : ''}
                </p>
              )}
            </div>
          )}

        </section>

      )}

    </aside>

  )

}


