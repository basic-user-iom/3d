import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './RenderingEffectsPanel.css'

type EffectType =
  | 'fog'
  | 'fire'
  | 'particles'
  | 'atmospheric'
  | 'lensFlare'
  | 'bloom'
  | 'motionBlur'

interface EffectCard {
  id: string
  type: EffectType
  name: string
  icon: string
  description: string
  available: boolean
  statusNote?: string
}

const DEFAULT_FOG_DENSITY = 0.35
const DEFAULT_RAIN_INTENSITY = 0.5

const EFFECT_CARDS: EffectCard[] = [
  {
    id: 'fog',
    type: 'fog',
    name: 'Fog',
    icon: '🌫️',
    description: 'Exponential height fog for depth and atmosphere',
    available: true
  },
  {
    id: 'fire',
    type: 'fire',
    name: 'Fire',
    icon: '🔥',
    description: 'Twinmotion-style fire VFX',
    available: false,
    statusNote: 'Planned'
  },
  {
    id: 'particles',
    type: 'particles',
    name: 'Rain',
    icon: '✨',
    description: 'Rain particle system',
    available: true
  },
  {
    id: 'atmospheric',
    type: 'atmospheric',
    name: 'Atmospheric',
    icon: '🌅',
    description: 'Standalone sky, sun, and haze (offline weather)',
    available: true
  },
  {
    id: 'lensFlare',
    type: 'lensFlare',
    name: 'Lens Flare',
    icon: '💫',
    description: 'Anamorphic lens flare post-processing',
    available: true
  },
  {
    id: 'bloom',
    type: 'bloom',
    name: 'Bloom',
    icon: '🌟',
    description: 'Emissive glow on bright materials',
    available: true
  },
  {
    id: 'motionBlur',
    type: 'motionBlur',
    name: 'Motion Blur',
    icon: '⚡',
    description: 'Camera motion blur',
    available: false,
    statusNote: 'Planned'
  }
]

const PANEL_WIDTH = 420

export default function RenderingEffectsPanel() {
  const {
    showRenderingEffectsPanel,
    toggleRenderingEffectsPanel,
    bloomEnabled,
    setBloomEnabled,
    anamorphicEnabled,
    setAnamorphicEnabled,
    fogDensity,
    setFogDensity,
    rainIntensity,
    setRainIntensity,
    postProcessingEnabled,
    setPostProcessingEnabled,
    enableStandaloneWeather,
    setEnableStandaloneWeather
  } = useAppStore()

  const panelRef = useRef<HTMLDivElement | null>(null)
  const stackingOffset = usePanelStacking({ panelId: 'renderingEffects', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef,
    {
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'renderingEffects'
    }
  )

  const [isMinimized, setIsMinimized] = useState(false)

  const activeEffects = useMemo(() => {
    const active = new Set<string>()
    if (fogDensity > 0) active.add('fog')
    if (rainIntensity > 0) active.add('particles')
    if (enableStandaloneWeather) active.add('atmospheric')
    if (anamorphicEnabled) active.add('lensFlare')
    if (bloomEnabled) active.add('bloom')
    return active
  }, [fogDensity, rainIntensity, enableStandaloneWeather, anamorphicEnabled, bloomEnabled])

  const toggleEffect = (effect: EffectCard) => {
    if (!effect.available) return

    switch (effect.type) {
      case 'fog':
        setFogDensity(fogDensity > 0 ? 0 : DEFAULT_FOG_DENSITY)
        break
      case 'particles':
        setRainIntensity(rainIntensity > 0 ? 0 : DEFAULT_RAIN_INTENSITY)
        break
      case 'atmospheric':
        setEnableStandaloneWeather(!enableStandaloneWeather)
        break
      case 'lensFlare':
        if (!anamorphicEnabled && !postProcessingEnabled) {
          setPostProcessingEnabled(true)
        }
        setAnamorphicEnabled(!anamorphicEnabled)
        break
      case 'bloom':
        if (!bloomEnabled && !postProcessingEnabled) {
          setPostProcessingEnabled(true)
        }
        setBloomEnabled(!bloomEnabled)
        break
      default:
        break
    }
  }

  if (!showRenderingEffectsPanel) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className={`rendering-effects-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="rendering-effects-panel-header" onMouseDown={handleMouseDown}>
        <h3>Rendering Effects</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="minimize-button"
            title={isMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleRenderingEffectsPanel} title="Close panel">
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="rendering-effects-panel-content">
          <div className="effects-grid">
            {EFFECT_CARDS.map((effect) => (
              <div
                key={effect.id}
                className={`effect-card ${activeEffects.has(effect.id) ? 'active' : ''} ${effect.available ? '' : 'planned'}`}
                onClick={() => toggleEffect(effect)}
                role="button"
                tabIndex={effect.available ? 0 : -1}
                aria-disabled={!effect.available}
                onKeyDown={(event) => {
                  if (!effect.available) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleEffect(effect)
                  }
                }}
              >
                <div className="effect-icon">{effect.icon}</div>
                <div className="effect-name">{effect.name}</div>
                <div className="effect-description">{effect.description}</div>
                <div
                  className={`effect-toggle ${activeEffects.has(effect.id) ? 'enabled' : 'disabled'}`}
                >
                  {effect.available ? (activeEffects.has(effect.id) ? '✓' : '○') : '…'}
                </div>
                {!effect.available && effect.statusNote && (
                  <div className="effect-status-badge">{effect.statusNote}</div>
                )}
              </div>
            ))}
          </div>

          {fogDensity > 0 && (
            <div className="effect-control-group">
              <label>
                <span>Fog density</span>
                <div className="slider-row">
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={fogDensity}
                    onChange={(e) => setFogDensity(parseFloat(e.target.value))}
                  />
                  <span className="slider-value">{fogDensity.toFixed(2)}</span>
                </div>
              </label>
            </div>
          )}

          {rainIntensity > 0 && (
            <div className="effect-control-group">
              <label>
                <span>Rain intensity</span>
                <div className="slider-row">
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={rainIntensity}
                    onChange={(e) => setRainIntensity(parseFloat(e.target.value))}
                  />
                  <span className="slider-value">{rainIntensity.toFixed(2)}</span>
                </div>
              </label>
            </div>
          )}

          <div className="effects-note">
            <p>
              Bloom and lens flare use the post-processing pipeline. Fine-tune strength in the
              Quality panel. Fire and motion blur are planned for a future release.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
