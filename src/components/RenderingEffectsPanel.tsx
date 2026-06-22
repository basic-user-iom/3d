import { useState, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './RenderingEffectsPanel.css'

type EffectType = 'fog' | 'fire' | 'particles' | 'atmospheric' | 'lensFlare' | 'bloom' | 'motionBlur'

interface Effect {
  id: string
  type: EffectType
  name: string
  icon: string
  enabled: boolean
  description: string
}

const PANEL_WIDTH = 420

export default function RenderingEffectsPanel() {
  const { 
    showRenderingEffectsPanel, 
    toggleRenderingEffectsPanel
  } = useAppStore()
  const { viewer } = useViewer()
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

  const [effects] = useState<Effect[]>([
    { id: 'fog', type: 'fog', name: 'Fog', icon: '🌫️', enabled: false, description: 'Add atmospheric fog to the scene' },
    { id: 'fire', type: 'fire', name: 'Fire', icon: '🔥', enabled: false, description: 'Add fire effects (Twinmotion style)' },
    { id: 'particles', type: 'particles', name: 'Particles', icon: '✨', enabled: false, description: 'Particle system effects' },
    { id: 'atmospheric', type: 'atmospheric', name: 'Atmospheric', icon: '🌅', enabled: false, description: 'Atmospheric scattering effects' },
    { id: 'lensFlare', type: 'lensFlare', name: 'Lens Flare', icon: '💫', enabled: false, description: 'Lens flare effects' },
    { id: 'bloom', type: 'bloom', name: 'Bloom', icon: '🌟', enabled: false, description: 'Bloom post-processing effect' },
    { id: 'motionBlur', type: 'motionBlur', name: 'Motion Blur', icon: '⚡', enabled: false, description: 'Motion blur effect' }
  ])

  const [activeEffects, setActiveEffects] = useState<Set<string>>(new Set())
  const [isMinimized, setIsMinimized] = useState(false)

  const toggleEffect = (effectId: string) => {
    setActiveEffects(prev => {
      const next = new Set(prev)
      if (next.has(effectId)) {
        next.delete(effectId)
      } else {
        next.add(effectId)
      }
      return next
    })
    console.log('[RenderingEffectsPanel] Toggled effect:', effectId)
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
          {effects.map((effect) => (
            <div
              key={effect.id}
              className={`effect-card ${activeEffects.has(effect.id) ? 'active' : ''}`}
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
        <div className="effects-note">
          <p>💡 Effects implementation coming soon. This will include full controls for fog, fire, particles, and more.</p>
        </div>
      </div>
      )}
    </div>
  )
}













