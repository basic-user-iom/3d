import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { trackSliderInteraction } from '../utils/sliderTracker'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './RenderingEffectsPanel.css'

type EffectType = 'fog' | 'fire' | 'particles' | 'atmospheric' | 'lensFlare' | 'bloom' | 'motionBlur'

interface EffectDefinition {
  id: EffectType
  name: string
  icon: string
  description: string
}

const EFFECT_DEFINITIONS: EffectDefinition[] = [
  { id: 'fog', name: 'Fog', icon: '🌫️', description: 'Exponential height fog in the scene' },
  { id: 'fire', name: 'Fire', icon: '🔥', description: 'Warm bloom + lens streaks (emissive glow)' },
  { id: 'particles', name: 'Particles', icon: '✨', description: 'Rain particle system' },
  { id: 'atmospheric', name: 'Atmospheric', icon: '🌅', description: 'Foggy weather preset with haze' },
  { id: 'lensFlare', name: 'Lens Flare', icon: '💫', description: 'Anamorphic lens flare streaks' },
  { id: 'bloom', name: 'Bloom', icon: '🌟', description: 'HDR bloom post-processing' },
  { id: 'motionBlur', name: 'Motion Blur', icon: '⚡', description: 'Camera motion blur (preview)' }
]

const PANEL_WIDTH = 420

function isEffectActive(type: EffectType, state: ReturnType<typeof useAppStore.getState>): boolean {
  switch (type) {
    case 'fog':
      return state.fogDensity > 0
    case 'fire':
      return state.bloomEnabled && state.anamorphicEnabled && state.anamorphicColor.toLowerCase() === '#ff6633'
    case 'particles':
      return state.rainIntensity > 0
    case 'atmospheric':
      return state.weatherPreset === 'foggy' || state.weatherPreset === 'overcast'
    case 'lensFlare':
      return state.anamorphicEnabled
    case 'bloom':
      return state.bloomEnabled
    case 'motionBlur':
      return false
    default:
      return false
  }
}

export default function RenderingEffectsPanel() {
  const {
    showRenderingEffectsPanel,
    toggleRenderingEffectsPanel,
    fogDensity,
    setFogDensity,
    fogColor,
    setFogColor,
    rainIntensity,
    setRainIntensity,
    snowIntensity,
    setSnowIntensity,
    weatherPreset,
    setWeatherPreset,
    bloomEnabled,
    setBloomEnabled,
    bloomStrength,
    setBloomStrength,
    bloomRadius,
    setBloomRadius,
    bloomThreshold,
    setBloomThreshold,
    anamorphicEnabled,
    setAnamorphicEnabled,
    anamorphicIntensity,
    setAnamorphicIntensity,
    anamorphicColor,
    setAnamorphicColor,
    postProcessingEnabled,
    setPostProcessingEnabled
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

  const [selectedEffect, setSelectedEffect] = useState<EffectType | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)

  const storeSnapshot = useAppStore()
  const activeEffects = useMemo(
    () => new Set(EFFECT_DEFINITIONS.filter((effect) => isEffectActive(effect.id, storeSnapshot)).map((e) => e.id)),
    [storeSnapshot, fogDensity, rainIntensity, weatherPreset, bloomEnabled, anamorphicEnabled, anamorphicColor]
  )

  useEffect(() => {
    if (!selectedEffect && activeEffects.size > 0) {
      setSelectedEffect([...activeEffects][0] ?? null)
    }
  }, [activeEffects, selectedEffect])

  const enablePostProcessing = () => {
    if (!postProcessingEnabled) setPostProcessingEnabled(true)
  }

  const toggleEffect = (effectId: EffectType) => {
    const currentlyActive = isEffectActive(effectId, useAppStore.getState())

    switch (effectId) {
      case 'fog':
        setFogDensity(currentlyActive ? 0 : 0.45)
        break
      case 'bloom':
        enablePostProcessing()
        setBloomEnabled(!currentlyActive)
        break
      case 'lensFlare':
        enablePostProcessing()
        setAnamorphicEnabled(!currentlyActive)
        if (!currentlyActive && anamorphicColor.toLowerCase() === '#ff6633') {
          setAnamorphicColor('#ffe6cc')
        }
        break
      case 'atmospheric':
        if (currentlyActive) {
          setWeatherPreset('clear')
          setFogDensity(0)
        } else {
          setWeatherPreset('foggy')
          setFogDensity(0.5)
        }
        break
      case 'particles':
        if (currentlyActive) {
          setRainIntensity(0)
        } else {
          setRainIntensity(0.55)
          setSnowIntensity(0)
        }
        break
      case 'fire':
        if (currentlyActive) {
          setBloomEnabled(false)
          setAnamorphicEnabled(false)
        } else {
          enablePostProcessing()
          setBloomEnabled(true)
          setBloomStrength(Math.max(bloomStrength, 1.8))
          setAnamorphicEnabled(true)
          setAnamorphicIntensity(Math.max(anamorphicIntensity, 0.8))
          setAnamorphicColor('#ff6633')
        }
        break
      case 'motionBlur':
        alert('Motion blur requires a velocity buffer pass and is not yet available in the raster pipeline. Use video export from Camera Views for animated sequences.')
        break
    }

    setSelectedEffect(effectId)
    console.log('[RenderingEffectsPanel] Toggled effect:', effectId, '→', !currentlyActive)
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
            {EFFECT_DEFINITIONS.map((effect) => (
              <div
                key={effect.id}
                className={`effect-card ${activeEffects.has(effect.id) ? 'active' : ''} ${selectedEffect === effect.id ? 'selected' : ''}`}
                onClick={() => toggleEffect(effect.id)}
              >
                <div className="effect-icon">{effect.icon}</div>
                <div className="effect-name">{effect.name}</div>
                <div className="effect-description">{effect.description}</div>
                <div className={`effect-toggle ${activeEffects.has(effect.id) ? 'enabled' : 'disabled'}`}>
                  {activeEffects.has(effect.id) ? '✓' : '○'}
                </div>
              </div>
            ))}
          </div>

          {selectedEffect === 'fog' && activeEffects.has('fog') && (
            <div className="effect-controls">
              <h4>Fog Controls</h4>
              <label>
                Density
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={fogDensity}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value)
                    trackSliderInteraction('Effect Fog Density', value, 'RenderingEffectsPanel', () => setFogDensity(value))
                  }}
                />
                <span>{(fogDensity * 100).toFixed(0)}%</span>
              </label>
              <label>
                Color
                <input type="color" value={fogColor} onChange={(e) => setFogColor(e.target.value)} />
              </label>
            </div>
          )}

          {selectedEffect === 'bloom' && activeEffects.has('bloom') && (
            <div className="effect-controls">
              <h4>Bloom Controls</h4>
              <label>
                Strength
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={bloomStrength}
                  onChange={(e) => setBloomStrength(parseFloat(e.target.value))}
                />
                <span>{bloomStrength.toFixed(1)}</span>
              </label>
              <label>
                Radius
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={bloomRadius}
                  onChange={(e) => setBloomRadius(parseFloat(e.target.value))}
                />
                <span>{bloomRadius.toFixed(2)}</span>
              </label>
              <label>
                Threshold
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={bloomThreshold}
                  onChange={(e) => setBloomThreshold(parseFloat(e.target.value))}
                />
                <span>{bloomThreshold.toFixed(2)}</span>
              </label>
            </div>
          )}

          {selectedEffect === 'lensFlare' && activeEffects.has('lensFlare') && (
            <div className="effect-controls">
              <h4>Lens Flare Controls</h4>
              <label>
                Intensity
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={anamorphicIntensity}
                  onChange={(e) => setAnamorphicIntensity(parseFloat(e.target.value))}
                />
                <span>{anamorphicIntensity.toFixed(1)}</span>
              </label>
              <label>
                Color
                <input type="color" value={anamorphicColor} onChange={(e) => setAnamorphicColor(e.target.value)} />
              </label>
            </div>
          )}

          {selectedEffect === 'particles' && activeEffects.has('particles') && (
            <div className="effect-controls">
              <h4>Particle Controls</h4>
              <label>
                Rain intensity
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={rainIntensity}
                  onChange={(e) => setRainIntensity(parseFloat(e.target.value))}
                />
                <span>{(rainIntensity * 100).toFixed(0)}%</span>
              </label>
              <small className="effect-hint">Use the Weather panel for snow and wind controls.</small>
            </div>
          )}

          <div className="effects-note">
            <p>Effects are wired to the live scene. Bloom and lens flare use the post-processing pipeline (enable Quality → Post-Processing for advanced tuning).</p>
          </div>
        </div>
      )}
    </div>
  )
}
