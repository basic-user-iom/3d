import React, { useMemo, useState } from 'react'
import type { GuidedTour, GuidedTourStep } from '../panorama/guidedTourTypes'
import {
  createEmptyGuidedTour,
  createGuidedTourStep,
  DEFAULT_GUIDED_CAMERA_DURATION_SEC,
  DEFAULT_GUIDED_CAMERA_FOV,
  DEFAULT_GUIDED_POPUP_DURATION_SEC,
  DEFAULT_GUIDED_STEP_DURATION_SEC,
  summarizeGuidedTourStep
} from '../panorama/guidedTourTypes'
import type { PanoramaEntry, PanoramaHotspot } from '../panorama/panoramaTourTypes'
import { degToRad, radToDeg } from '../panorama/panoramaTourTypes'

export interface GuidedTourSectionProps {
  panoramas: PanoramaEntry[]
  activePanoramaId: string | null
  guidedTours: GuidedTour[]
  activeGuidedTourId: string | null
  selectedStepId: string | null
  currentView: { yaw: number; pitch: number; fov: number }
  isPlaying: boolean
  playingStepIndex: number
  onSelectTour: (tourId: string | null) => void
  onCreateTour: () => void
  onRenameTour: (tourId: string, name: string) => void
  onDeleteTour: (tourId: string) => void
  onSelectStep: (stepId: string | null) => void
  onAddStepFromCurrentView: () => void
  onUpdateStep: (stepId: string, patch: Partial<GuidedTourStep>) => void
  onDeleteStep: (stepId: string) => void
  onMoveStep: (stepId: string, direction: -1 | 1) => void
  onPlay: () => void
  onStop: () => void
}

function infoHotspotsInTour(panoramas: PanoramaEntry[]): PanoramaHotspot[] {
  return panoramas.flatMap((p) => p.hotspots.filter((h) => h.type === 'info'))
}

function allHotspots(panoramas: PanoramaEntry[]): Array<PanoramaHotspot & { panoramaName: string }> {
  return panoramas.flatMap((p) =>
    p.hotspots.map((h) => ({ ...h, panoramaName: p.name }))
  )
}

export default function Panorama360GuidedTourSection({
  panoramas,
  activePanoramaId,
  guidedTours,
  activeGuidedTourId,
  selectedStepId,
  currentView,
  isPlaying,
  playingStepIndex,
  onSelectTour,
  onCreateTour,
  onRenameTour,
  onDeleteTour,
  onSelectStep,
  onAddStepFromCurrentView,
  onUpdateStep,
  onDeleteStep,
  onMoveStep,
  onPlay,
  onStop
}: GuidedTourSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const activeTour = guidedTours.find((t) => t.id === activeGuidedTourId) ?? null
  const selectedStep =
    activeTour?.steps.find((s) => s.id === selectedStepId) ?? null
  const hotspots = useMemo(() => allHotspots(panoramas), [panoramas])
  const infoHotspots = useMemo(() => infoHotspotsInTour(panoramas), [panoramas])

  const yawDeg = Math.round(radToDeg(currentView.yaw) * 10) / 10
  const pitchDeg = Math.round(radToDeg(currentView.pitch) * 10) / 10
  const fovDeg = Math.round(currentView.fov * 10) / 10

  const updateCameraField = (
    field: 'yaw' | 'pitch' | 'fov',
    valueDeg: number
  ) => {
    if (!selectedStep) return
    const cam = selectedStep.camera ?? {
      yaw: currentView.yaw,
      pitch: currentView.pitch,
      fov: currentView.fov
    }
    if (field === 'fov') {
      onUpdateStep(selectedStep.id, {
        camera: { ...cam, fov: Math.max(20, Math.min(120, valueDeg)) }
      })
      return
    }
    if (field === 'yaw') {
      onUpdateStep(selectedStep.id, { camera: { ...cam, yaw: degToRad(valueDeg) } })
      return
    }
    onUpdateStep(selectedStep.id, {
      camera: { ...cam, pitch: degToRad(Math.max(-89, Math.min(89, valueDeg))) }
    })
  }

  const setCameraFromView = () => {
    if (!selectedStep) return
    onUpdateStep(selectedStep.id, {
      camera: {
        yaw: currentView.yaw,
        pitch: currentView.pitch,
        fov: currentView.fov
      }
    })
  }

  const clearCamera = () => {
    if (!selectedStep) return
    onUpdateStep(selectedStep.id, { camera: null })
  }

  const firstHotspotAction = selectedStep?.hotspotActions?.[0]
  const upsertHotspotAction = (patch: {
    hotspotId?: string
    visible?: boolean | undefined
    openPopup?: boolean
    popupDurationSec?: number
  }) => {
    if (!selectedStep) return
    const hotspotId = patch.hotspotId ?? firstHotspotAction?.hotspotId ?? hotspots[0]?.id
    if (!hotspotId) return
    const next = {
      hotspotId,
      visible: patch.visible !== undefined ? patch.visible : (firstHotspotAction?.visible ?? true),
      openPopup: patch.openPopup ?? firstHotspotAction?.openPopup ?? false,
      popupDurationSec:
        patch.popupDurationSec ??
        firstHotspotAction?.popupDurationSec ??
        DEFAULT_GUIDED_POPUP_DURATION_SEC
    }
    onUpdateStep(selectedStep.id, { hotspotActions: [next] })
  }

  const clearHotspotAction = () => {
    if (!selectedStep) return
    onUpdateStep(selectedStep.id, { hotspotActions: [] })
  }

  return (
    <section className="panorama-tour-section panorama-guided-tour-section">
      <div
        className={`panorama-tour-section-header${expanded ? '' : ' panorama-tour-section-header-collapsed'}`}
      >
        <button
          type="button"
          className="panorama-tour-section-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="panorama-tour-section-chevron" aria-hidden="true">
            {expanded ? '▼' : '▶'}
          </span>
          <h2>Guided Tour</h2>
        </button>
      </div>

      {expanded && (
        <div className="panorama-guided-tour-body">
          <p className="panorama-tour-hint">
            Build an autopilot sequence: camera moves, hotspots, info popups, effects, and panorama
            switches — then Play.
          </p>

          <div className="panorama-guided-tour-toolbar">
            <select
              value={activeGuidedTourId ?? ''}
              onChange={(e) => onSelectTour(e.target.value || null)}
              disabled={isPlaying}
              aria-label="Select guided tour"
            >
              <option value="">Select tour…</option>
              {guidedTours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={onCreateTour} disabled={isPlaying}>
              New
            </button>
          </div>

          {activeTour && (
            <>
              <label className="panorama-guided-tour-name">
                Tour name
                <input
                  value={activeTour.name}
                  disabled={isPlaying}
                  onChange={(e) => onRenameTour(activeTour.id, e.target.value)}
                />
              </label>

              <div className="panorama-tour-initial-view-actions">
                {!isPlaying ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={onPlay}
                    disabled={activeTour.steps.length === 0}
                  >
                    Play guided tour
                  </button>
                ) : (
                  <button type="button" className="secondary" onClick={onStop}>
                    Stop
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={isPlaying}
                  onClick={() => {
                    if (confirm(`Delete guided tour “${activeTour.name}”?`)) {
                      onDeleteTour(activeTour.id)
                    }
                  }}
                >
                  Delete tour
                </button>
              </div>

              {isPlaying && (
                <p className="panorama-tour-field-hint">
                  Playing step {Math.max(1, playingStepIndex + 1)} / {activeTour.steps.length}
                </p>
              )}

              <div className="panorama-guided-steps-header">
                <h3>Steps</h3>
                <button
                  type="button"
                  className="primary"
                  disabled={isPlaying}
                  onClick={onAddStepFromCurrentView}
                  title={`Add step at yaw ${yawDeg}°, pitch ${pitchDeg}°, FOV ${fovDeg}°`}
                >
                  + From current view
                </button>
              </div>

              {activeTour.steps.length === 0 ? (
                <p className="panorama-tour-field-hint">
                  No steps yet. Look at a point of interest, then add a step from the current view.
                </p>
              ) : (
                <ul className="panorama-guided-steps-list">
                  {activeTour.steps.map((step, index) => (
                    <li key={step.id}>
                      <button
                        type="button"
                        className={`panorama-guided-step-item${
                          selectedStepId === step.id ? ' active' : ''
                        }${isPlaying && playingStepIndex === index ? ' playing' : ''}`}
                        onClick={() => onSelectStep(step.id)}
                        title="Select and preview this step"
                        disabled={isPlaying}
                      >
                        <span className="panorama-guided-step-index">{index + 1}</span>
                        <span className="panorama-guided-step-meta">
                          <strong>{step.label || `Step ${index + 1}`}</strong>
                          <span>{summarizeGuidedTourStep(step)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selectedStep && !isPlaying && (
                <div className="panorama-guided-step-editor">
                  <div className="panorama-guided-steps-header">
                    <h3>Edit step</h3>
                    <div className="panorama-guided-step-move">
                      <button type="button" onClick={() => onMoveStep(selectedStep.id, -1)}>
                        ↑
                      </button>
                      <button type="button" onClick={() => onMoveStep(selectedStep.id, 1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onDeleteStep(selectedStep.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <label>
                    Label
                    <input
                      value={selectedStep.label ?? ''}
                      onChange={(e) => onUpdateStep(selectedStep.id, { label: e.target.value })}
                    />
                  </label>

                  <div className="panorama-tour-row">
                    <label>
                      Camera duration (s)
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={
                          selectedStep.cameraDurationSec ??
                          (selectedStep.camera ? DEFAULT_GUIDED_CAMERA_DURATION_SEC : 0)
                        }
                        disabled={!selectedStep.camera}
                        onChange={(e) =>
                          onUpdateStep(selectedStep.id, {
                            cameraDurationSec: Math.max(0, Number(e.target.value) || 0)
                          })
                        }
                      />
                    </label>
                    <label>
                      Dwell (s)
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={selectedStep.durationSec}
                        onChange={(e) =>
                          onUpdateStep(selectedStep.id, {
                            durationSec: Math.max(0, Number(e.target.value) || 0)
                          })
                        }
                      />
                    </label>
                  </div>

                  <fieldset className="panorama-tour-fieldset">
                    <legend>Camera</legend>
                    {selectedStep.camera ? (
                      <>
                        <div className="panorama-tour-row">
                          <label>
                            Yaw (°)
                            <input
                              type="number"
                              step={1}
                              value={Math.round(radToDeg(selectedStep.camera.yaw) * 10) / 10}
                              onChange={(e) => updateCameraField('yaw', Number(e.target.value))}
                            />
                          </label>
                          <label>
                            Pitch (°)
                            <input
                              type="number"
                              step={1}
                              min={-89}
                              max={89}
                              value={Math.round(radToDeg(selectedStep.camera.pitch) * 10) / 10}
                              onChange={(e) => updateCameraField('pitch', Number(e.target.value))}
                            />
                          </label>
                        </div>
                        <label>
                          FOV (°)
                          <input
                            type="number"
                            min={20}
                            max={120}
                            step={1}
                            value={
                              Math.round(
                                (selectedStep.camera.fov ?? DEFAULT_GUIDED_CAMERA_FOV) * 10
                              ) / 10
                            }
                            onChange={(e) => updateCameraField('fov', Number(e.target.value))}
                          />
                        </label>
                        <div className="panorama-tour-initial-view-actions">
                          <button type="button" onClick={setCameraFromView}>
                            Set camera from current view
                          </button>
                          <button type="button" className="secondary" onClick={clearCamera}>
                            Clear camera
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="panorama-tour-initial-view-actions">
                        <button type="button" onClick={setCameraFromView}>
                          Set camera from current view
                        </button>
                      </div>
                    )}
                  </fieldset>

                  <fieldset className="panorama-tour-fieldset">
                    <legend>Panorama switch</legend>
                    <label>
                      Go to panorama
                      <select
                        value={selectedStep.targetPanoramaId ?? ''}
                        onChange={(e) =>
                          onUpdateStep(selectedStep.id, {
                            targetPanoramaId: e.target.value || null
                          })
                        }
                      >
                        <option value="">(stay on current)</option>
                        {panoramas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.id === activePanoramaId ? ' (current)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </fieldset>

                  <fieldset className="panorama-tour-fieldset">
                    <legend>Hotspot / popup</legend>
                    <label>
                      Hotspot
                      <select
                        value={firstHotspotAction?.hotspotId ?? ''}
                        onChange={(e) => {
                          if (!e.target.value) {
                            clearHotspotAction()
                            return
                          }
                          upsertHotspotAction({ hotspotId: e.target.value })
                        }}
                      >
                        <option value="">(none)</option>
                        {hotspots.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.label} · {h.panoramaName}
                          </option>
                        ))}
                      </select>
                    </label>
                    {firstHotspotAction?.hotspotId && (
                      <>
                        <label className="panorama-guided-check">
                          <input
                            type="checkbox"
                            checked={firstHotspotAction.visible !== false}
                            onChange={(e) =>
                              upsertHotspotAction({ visible: e.target.checked })
                            }
                          />
                          Show hotspot
                        </label>
                        <label className="panorama-guided-check">
                          <input
                            type="checkbox"
                            checked={!!firstHotspotAction.openPopup}
                            disabled={
                              !infoHotspots.some((h) => h.id === firstHotspotAction.hotspotId)
                            }
                            onChange={(e) =>
                              upsertHotspotAction({ openPopup: e.target.checked })
                            }
                          />
                          Open info popup
                        </label>
                        {firstHotspotAction.openPopup && (
                          <label>
                            Popup auto-close (s)
                            <input
                              type="number"
                              min={0.5}
                              step={0.5}
                              value={
                                firstHotspotAction.popupDurationSec ??
                                DEFAULT_GUIDED_POPUP_DURATION_SEC
                              }
                              onChange={(e) =>
                                upsertHotspotAction({
                                  popupDurationSec: Math.max(0.5, Number(e.target.value) || 0.5)
                                })
                              }
                            />
                          </label>
                        )}
                      </>
                    )}
                  </fieldset>

                  <fieldset className="panorama-tour-fieldset">
                    <legend>Effects</legend>
                    {(
                      [
                        ['birds', 'Birds'],
                        ['particles', 'Particles (fire)'],
                        ['spout', 'Spout (water)']
                      ] as const
                    ).map(([key, label]) => {
                      const value = selectedStep.effects?.[key]
                      return (
                        <label key={key}>
                          {label}
                          <select
                            value={value === true ? 'on' : value === false ? 'off' : ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const effects = { ...(selectedStep.effects ?? {}) }
                              if (v === '') delete effects[key]
                              else effects[key] = v === 'on'
                              onUpdateStep(selectedStep.id, {
                                effects: Object.keys(effects).length ? effects : undefined
                              })
                            }}
                          >
                            <option value="">(no change)</option>
                            <option value="on">Enable</option>
                            <option value="off">Disable</option>
                          </select>
                        </label>
                      )
                    })}
                  </fieldset>
                </div>
              )}
            </>
          )}

          {!activeTour && guidedTours.length === 0 && (
            <p className="panorama-tour-field-hint">
              Create a guided tour, then add steps from the current camera view.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/** Helpers re-exported for App wiring without duplicating defaults. */
export {
  createEmptyGuidedTour,
  createGuidedTourStep,
  DEFAULT_GUIDED_STEP_DURATION_SEC
}
