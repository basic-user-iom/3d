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

  DEFAULT_POPUP_WIDTH,

  degToRad,

  getHotspotColor,

  hasPanoramaInitialView,

  PLACEMENT_PREVIEW_HOTSPOT_ID,

  radToDeg

} from '../panorama/panoramaTourTypes'

import './Panorama360TourPanel.css'



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

    popupOffsetY: 0

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

    popupOffsetY: hotspot.popupOffsetY ?? 0

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

    popupOffsetY: draft.type === 'info' ? draft.popupOffsetY : undefined

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

  onPopupOffsetPatchApplied

}: Panorama360TourPanelProps) {

  const activePanorama = panoramas.find((p) => p.id === activePanoramaId) ?? null
  const hasHotspots = (activePanorama?.hotspots.length ?? 0) > 0

  const selectedHotspot = activePanorama?.hotspots.find((h) => h.id === selectedHotspotId) ?? null

  const isEditing = editMode && !!selectedHotspot && !pendingPlacement

  const isPlacing = !!pendingPlacement



  const [draft, setDraft] = useState<HotspotDraft>(() => defaultDraft())

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


