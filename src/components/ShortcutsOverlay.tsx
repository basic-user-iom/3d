import { useAppStore } from '../store/useAppStore'
import './ShortcutsOverlay.css'

export default function ShortcutsOverlay() {
  const { showShortcutsOverlay, toggleShortcutsOverlay } = useAppStore()
  if (!showShortcutsOverlay) return null

  return (
    <div className="shortcuts-overlay" onClick={toggleShortcutsOverlay}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h3>Keyboard Shortcuts</h3>
          <button className="close" onClick={toggleShortcutsOverlay}>×</button>
        </div>
        <div className="shortcuts-grid">
          <div className="group">
            <h4>Navigation (Twinmotion-style)</h4>
            <ul>
              <li><b>W/A/S/D</b> Pan up/left/down/right</li>
              <li><b>Arrow Keys</b> Orbit left/right/up/down</li>
              <li><b>Q / E</b> Pan down / up (altitude)</li>
              <li><b>+ / -</b> Zoom in / out</li>
              <li><b>Shift</b> Hold to increase speed</li>
              <li><b>F</b> Frame model</li>
              <li><b>Mouse</b> Orbit / Pan / Zoom (LMB / MMB / Wheel)</li>
            </ul>
          </div>
          <div className="group">
            <h4>Selection & Transform</h4>
            <ul>
              <li><b>T / R / S</b> Translate / Rotate / Scale</li>
              <li><b>Esc</b> Exit transform</li>
              <li><b>Delete</b> Delete selected</li>
            </ul>
          </div>
          <div className="group">
            <h4>Panels & Views</h4>
            <ul>
              <li><b>V</b> Toggle Camera Views</li>
              <li><b>Ctrl+Shift+S</b> Save Camera View</li>
              <li><b>1..9</b> Load Camera View</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}


