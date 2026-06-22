import { useAppStore } from '../store/useAppStore'
import './RenderModeSelector.css'

interface RenderModeOption {
  value: 'product' | 'city' | 'hybrid'
  label: string
  icon: string
  title: string
}

const RENDER_MODES: RenderModeOption[] = [
  {
    value: 'product',
    label: 'Product',
    icon: '🚗',
    title:
      'Product Mode - Three.js with full PBR materials (clearcoat, metalness). Best for cars and products.'
  },
  {
    value: 'city',
    label: 'City',
    icon: '🏙️',
    title: 'City Mode - Streets-GL optimized for large environments. Best for cities and terrain.'
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    icon: '🔀',
    title: 'Hybrid Mode - Both renderers combined. Best for cars in real-world city locations.'
  }
]

export default function RenderModeSelector() {
  const {
    renderMode,
    setRenderMode,
    setStreetsGLIframeOverlay,
    setStreetsGLIframeInteractive,
    showOSMGroundV2Panel,
    toggleOSMGroundV2Panel,
    setStreetsGLStartRequestedAt
  } = useAppStore()

  const handleClick = (mode: RenderModeOption['value']) => {
    setRenderMode(mode)

    // Automatically manage Streets GL overlay so we never show a black screen
    // - City: show Streets GL only, make it interactive
    // - Hybrid: show both renderers; keep Streets GL visible but non-interactive so 3D controls still work
    // - Product: disable Streets GL entirely
    if (mode === 'city') {
      setStreetsGLIframeOverlay(true)
      setStreetsGLIframeInteractive(true)
      // Start Streets GL if not running (Electron only); if already running, iframe will connect
      if (typeof window !== 'undefined' && window.electronAPI?.startStreetsGLServer) {
        setStreetsGLStartRequestedAt(Date.now())
        window.electronAPI.startStreetsGLServer().catch(() => {})
      }
      // Ensure OSM 3D / Streets GL panel is open so user can control the map
      if (!showOSMGroundV2Panel) {
        toggleOSMGroundV2Panel()
      }
    } else if (mode === 'hybrid') {
      setStreetsGLIframeOverlay(true)
      setStreetsGLIframeInteractive(false)
      // Start Streets GL if not running (Electron only)
      if (typeof window !== 'undefined' && window.electronAPI?.startStreetsGLServer) {
        setStreetsGLStartRequestedAt(Date.now())
        window.electronAPI.startStreetsGLServer().catch(() => {})
      }
    } else {
      setStreetsGLIframeOverlay(false)
      setStreetsGLIframeInteractive(false)
    }
  }

  return (
    <>
      {RENDER_MODES.map((mode) => (
        <button
          key={mode.value}
          className={`toolbar-toggle ${renderMode === mode.value ? 'active' : ''}`}
          onClick={() => handleClick(mode.value)}
          title={mode.title}
          aria-pressed={renderMode === mode.value}
        >
          {mode.icon} {mode.label}
        </button>
      ))}
    </>
  )
}
