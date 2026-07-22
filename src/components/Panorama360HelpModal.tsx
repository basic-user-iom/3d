import { useEffect, useRef } from 'react'
import './Panorama360HelpModal.css'

export interface Panorama360HelpModalProps {
  open: boolean
  onClose: () => void
}

const SECTIONS = [
  {
    id: 'navigate',
    title: 'Navigate',
    items: [
      'Drag the panorama to look around',
      'Scroll to zoom in and out',
      'On touch devices: drag to look, pinch to zoom',
    ],
  },
  {
    id: 'panoramas',
    title: 'Panoramas',
    items: [
      'Upload equirectangular images (JPG, PNG, WebP, HDR, EXR, KTX2)',
      'Add multiple scenes and switch between them in the sidebar',
      'Set an initial view so each scene opens looking the right direction',
      'Or load a panorama from a URL',
    ],
  },
  {
    id: 'hotspots',
    title: 'Hotspots',
    items: [
      'Turn on Edit mode in the sidebar, then place markers on the panorama',
      'Link — jump to another panorama scene',
      'Info — show a text popup',
      'URL — open an external link (or embed in an iframe)',
      'Select a hotspot to edit label, target, style, or pin position',
      'Drag markers (and info popups) to fine-tune placement',
    ],
  },
  {
    id: 'preview',
    title: 'Preview mode',
    items: [
      'Click Preview to hide the editor UI and try the tour as a visitor',
      'Or open with ?mode=preview in the URL (also accepts mode=view / preview=1)',
      'Hotspots are fully interactive; Escape exits (or fullscreen first if active)',
    ],
  },
  {
    id: 'effects',
    title: 'Effects',
    items: [
      'Birds — flock overlay (WebGPU)',
      'Particles — floating particle field (WebGPU)',
      'Spout — raymarched smoke/stream overlay (WebGL2)',
      'Enable and tune each effect in the sidebar Effects section',
    ],
  },
  {
    id: 'guided',
    title: 'Guided tour',
    items: [
      'Create a Guided Tour in the sidebar, then add steps from the current camera view',
      'Each step can move the camera (yaw/pitch/FOV), show hotspots, open info popups, toggle effects, or switch panoramas',
      'Play runs the sequence automatically in Preview; Stop cancels playback',
      'Guided tours are included when you Save / Load a .360project file',
    ],
  },
  {
    id: 'project',
    title: 'Save & load',
    items: [
      'Save project downloads a .360project file with scenes, hotspots, guided tours, and settings',
      'Load project restores a saved tour from .360project or .json',
    ],
  },
] as const

export default function Panorama360HelpModal({ open, onClose }: Panorama360HelpModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="panorama-360-help-overlay" role="presentation">
      <div className="panorama-360-help-backdrop" onClick={onClose} aria-hidden />
      <div
        className="panorama-360-help-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panorama-360-help-title"
      >
        <div className="panorama-360-help-header">
          <div className="panorama-360-help-header-text">
            <h2 id="panorama-360-help-title">How to use the 360° tour</h2>
            <p>Quick guide to navigating, building scenes, and using hotspots.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="panorama-360-help-close"
            onClick={onClose}
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        <div className="panorama-360-help-body">
          {SECTIONS.map((section) => (
            <section key={section.id} className="panorama-360-help-section">
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
