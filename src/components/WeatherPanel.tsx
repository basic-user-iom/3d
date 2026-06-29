import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { trackSliderInteraction } from '../utils/sliderTracker'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import {
  detectWeatherPreset,
  type WeatherPresetId
} from '../viewer/utils/weatherPresets'
import * as THREE from 'three'
import './WeatherPanel.css'

export default function WeatherPanel() {
  const {
    showWeatherPanel,
    toggleWeatherPanel,
    northOffset,
    setNorthOffset,
    timeOfDay,
    setTimeOfDay,
    streetsGLBridge,
    streetsGLIframeOverlay,
    enableStandaloneWeather,
    setEnableStandaloneWeather,
    weatherPreset,
    setWeatherPreset,
    applyWeatherPreset,
    fogDensity,
    setFogDensity,
    fogColor,
    setFogColor,
    rainIntensity,
    setRainIntensity,
    snowIntensity,
    setSnowIntensity,
    windIntensity,
    setWindIntensity,
    cloudDensity,
    setCloudDensity,
    cloudScale,
    setCloudScale,
    cloudDetail,
    setCloudDetail,
    cloudStorminess,
    setCloudStorminess,
    hdrGroundProjectionEnabled
  } = useAppStore()

  const panelRef = useRef<HTMLDivElement | null>(null)
  const applyingPresetRef = useRef(false)
  const [isMinimized, setIsMinimized] = useState(false)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 360
  const stackingOffset = usePanelStacking({ panelId: 'weather', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'weather'
    }
  )

  // Sync Time of Day and North Offset to Streets GL sun direction
  useEffect(() => {
    if (!streetsGLIframeOverlay || !streetsGLBridge) return

    // Calculate sun position from time of day and north offset
    const hour = timeOfDay
    let elevation = 0
    
    // Calculate elevation: 0 (horizon) to PI/2 (zenith)
    if (hour >= 6 && hour <= 18) {
      // Daytime: sun arc from 6am to 6pm
      const sunAngle = ((hour - 6) / 12) * Math.PI // 0 (sunrise) to PI (sunset)
      elevation = Math.sin(sunAngle) * (Math.PI / 2) // Convert to radians: 0 to PI/2
    } else {
      // Night: sun below horizon (negative elevation)
      elevation = -0.1
    }
    
    // Calculate azimuth: 0 = north, PI/2 = east, PI = south, 3*PI/2 = west
    // 6am = East (PI/2), 12pm = South (PI), 6pm = West (3*PI/2)
    const baseAngle = ((hour - 6) / 12) * Math.PI
    const offsetRad = (northOffset * Math.PI) / 180 // Convert degrees to radians
    const azimuth = baseAngle + offsetRad
    
    // Convert elevation/azimuth to sun position vector
    const phi = Math.PI / 2 - elevation // Convert elevation to zenith angle
    const theta = azimuth
    const sunPosition = new THREE.Vector3()
    sunPosition.setFromSphericalCoords(1, phi, theta)
    
    // Normalize and send to Streets GL
    const sunDir = sunPosition.clone().normalize()
    streetsGLBridge.setSunDirection({
      x: sunDir.x,
      y: sunDir.y,
      z: sunDir.z
    })
  }, [timeOfDay, northOffset, streetsGLIframeOverlay, streetsGLBridge])

  const syncPresetAfterChange = (patch: Partial<{
    fogDensity: number
    fogColor: string
    rainIntensity: number
    snowIntensity: number
    cloudDensity: number
    cloudStorminess: number
    windIntensity: number
  }>) => {
    if (applyingPresetRef.current) return
    const detected = detectWeatherPreset({
      fogDensity,
      fogColor,
      rainIntensity,
      snowIntensity,
      cloudDensity,
      cloudStorminess,
      windIntensity,
      ...patch
    })
    if (detected !== weatherPreset) {
      setWeatherPreset(detected)
    }
  }

  const WEATHER_PRESETS: Array<{
    id: Exclude<WeatherPresetId, 'custom'>
    label: string
    icon: string
  }> = [
    { id: 'clear', label: 'Clear', icon: '☀️' },
    { id: 'overcast', label: 'Overcast', icon: '☁️' },
    { id: 'foggy', label: 'Foggy', icon: '🌫️' },
    { id: 'stormy', label: 'Stormy', icon: '⛈️' }
  ]

  if (!showWeatherPanel) return null

  return (
    <div
      ref={panelRef}
      className="weather-panel"
      style={{
        position: 'fixed',
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`,
        zIndex: 1000,
        cursor: dragging ? 'grabbing' : 'default'
      }}
    >
      <div className="weather-panel-header" onMouseDown={handleMouseDown}>
        <h3>🌤️ Weather & Sun</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="minimize-button"
            title={isMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button
            onClick={toggleWeatherPanel}
            className="close-button"
            title="Close panel"
          >
            ×
          </button>
        </div>
      </div>
      
      {!isMinimized && (
        <div className="weather-panel-content">
          {/* Standalone Weather System Toggle */}
          <div className="weather-section" style={{ 
            background: 'rgba(100, 200, 100, 0.1)', 
            border: '1px solid rgba(100, 200, 100, 0.3)', 
            borderRadius: '6px', 
            padding: '12px',
            marginBottom: '12px'
          }}>
            <h3 style={{ color: '#64c864', marginTop: 0 }}>🌞 Standalone Weather System</h3>
            <small style={{ display: 'block', color: '#888', marginBottom: '12px' }}>
              Enable high-quality CSM shadows and sun system that works offline, without Streets GL overlay.
            </small>
            <small style={{ display: 'block', color: '#ffb347', marginBottom: '12px' }}>
              Note: For best results, avoid using Standalone Weather together with HDR ground projection. 
              If HDR is enabled and materials look too dark or strange, try disabling HDR or Standalone Weather.
            </small>
            <div className="control-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enableStandaloneWeather}
                  onChange={(e) => setEnableStandaloneWeather(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span>Enable Standalone Weather (CSM Shadows + Sun)</span>
              </label>
            </div>
            {enableStandaloneWeather && (
              <small style={{ display: 'block', color: '#64c864', marginTop: '8px' }}>
                ✓ CSM shadows and sun system active. Works offline, no internet required.
              </small>
            )}
            {enableStandaloneWeather && hdrGroundProjectionEnabled && (
              <small style={{ display: 'block', color: '#ff6b6b', marginTop: '8px' }}>
                HDR ground projection was disabled — it conflicts with standalone weather and can darken materials.
              </small>
            )}
          </div>

          <div className="weather-section">
            <h3>Weather Preset</h3>
            <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
              Quick atmosphere presets — adjusts fog, clouds, rain, and lighting together.
            </small>
            {!enableStandaloneWeather && !(streetsGLIframeOverlay && streetsGLBridge) && cloudDensity > 0 && (
              <small style={{ display: 'block', color: '#ffb347', marginBottom: '8px' }}>
                Cloud density requires Standalone Weather or Streets GL overlay to render volumetric clouds.
              </small>
            )}
            <div className="weather-preset-grid">
              {WEATHER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`weather-preset-button ${weatherPreset === preset.id ? 'active' : ''}`}
                  onClick={() => {
                    applyingPresetRef.current = true
                    applyWeatherPreset(preset.id)
                    applyingPresetRef.current = false
                  }}
                  title={preset.label}
                >
                  <span className="weather-preset-icon">{preset.icon}</span>
                  <span className="weather-preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="weather-section">
            <h3>Atmosphere &amp; Precipitation</h3>
            <div className="control-group">
              <label>
                Fog density
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={fogDensity}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Fog Density', newValue, 'WeatherPanel', () => {
                      setFogDensity(newValue)
                      syncPresetAfterChange({ fogDensity: newValue })
                    })
                  }}
                />
                <span className="value-label">{(fogDensity * 100).toFixed(0)}%</span>
              </label>
            </div>
            <div className="control-group">
              <label>
                Fog color
                <input
                  type="color"
                  value={fogColor}
                  onChange={(e) => {
                    const newColor = e.target.value
                    setFogColor(newColor)
                    syncPresetAfterChange({ fogColor: newColor })
                  }}
                  style={{ marginLeft: '8px', cursor: 'pointer' }}
                />
              </label>
            </div>
            <div className="control-group">
              <label>
                Cloud density
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={cloudDensity}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Cloud Density', newValue, 'WeatherPanel', () => {
                      setCloudDensity(newValue)
                      syncPresetAfterChange({ cloudDensity: newValue })
                    })
                  }}
                />
                <span className="value-label">{(cloudDensity * 100).toFixed(0)}%</span>
              </label>
            </div>
            <div className="control-group">
              <label>
                Cloud scale
                <input
                  type="range"
                  min="0.25"
                  max="2"
                  step="0.05"
                  value={cloudScale}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Cloud Scale', newValue, 'WeatherPanel', () => {
                      setCloudScale(newValue)
                    })
                  }}
                />
                <span className="value-label">{(cloudScale * 100).toFixed(0)}%</span>
              </label>
              <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                Lower = smaller, finer clouds. 100% = default size.
              </small>
            </div>
            <div className="control-group">
              <label>
                Cloud sharpness
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={cloudDetail}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Cloud Sharpness', newValue, 'WeatherPanel', () => {
                      setCloudDetail(newValue)
                    })
                  }}
                />
                <span className="value-label">{(cloudDetail * 100).toFixed(0)}%</span>
              </label>
              <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                Higher = crisper cloud puffs; lower = softer edges.
              </small>
            </div>
            <div className="control-group">
              <label>
                Rain intensity
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={rainIntensity}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Rain Intensity', newValue, 'WeatherPanel', () => {
                      setRainIntensity(newValue)
                      if (newValue > 0) setSnowIntensity(0)
                      syncPresetAfterChange({ rainIntensity: newValue, snowIntensity: newValue > 0 ? 0 : snowIntensity })
                    })
                  }}
                />
                <span className="value-label">{(rainIntensity * 100).toFixed(0)}%</span>
              </label>
            </div>
            <div className="control-group">
              <label>
                Snow intensity
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={snowIntensity}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Snow Intensity', newValue, 'WeatherPanel', () => {
                      setSnowIntensity(newValue)
                      if (newValue > 0) setRainIntensity(0)
                      syncPresetAfterChange({ snowIntensity: newValue, rainIntensity: newValue > 0 ? 0 : rainIntensity })
                    })
                  }}
                />
                <span className="value-label">{(snowIntensity * 100).toFixed(0)}%</span>
              </label>
            </div>
            <div className="control-group">
              <label>
                Wind intensity
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={windIntensity}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value)
                    trackSliderInteraction('Wind Intensity', newValue, 'WeatherPanel', () => {
                      setWindIntensity(newValue)
                      syncPresetAfterChange({ windIntensity: newValue })
                    })
                  }}
                />
                <span className="value-label">{(windIntensity * 100).toFixed(0)}%</span>
              </label>
            </div>
          </div>

          {/* Sun controls — show when Streets GL or Standalone Weather is enabled */}
          {(streetsGLIframeOverlay && streetsGLBridge) || enableStandaloneWeather ? (
            <>
              <div className="weather-section" style={{ 
                background: 'rgba(74, 158, 255, 0.1)', 
                border: '1px solid rgba(74, 158, 255, 0.3)', 
                borderRadius: '6px', 
                padding: '12px',
                marginBottom: '12px'
              }}>
                <h3 style={{ color: '#4a9eff', marginTop: 0 }}>🌍 Streets GL Weather System</h3>
                <small style={{ display: 'block', color: '#4a9eff', marginBottom: '8px' }}>
                  Streets GL provides a physically-based atmosphere system with automatic:
                </small>
                <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                  • Atmospheric scattering (sky color based on sun position)
                </small>
                <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                  • CSM shadows (high-quality cascaded shadow maps)
                </small>
                <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                  • Water rendering (automatic from OSM map data)
                </small>
                <small style={{ display: 'block', color: '#888' }}>
                  • Atmospheric perspective (fog/haze based on distance)
                </small>
              </div>

              <div className="weather-section">
                <h3>Time of Day</h3>
                <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                  {streetsGLIframeOverlay && streetsGLBridge
                    ? 'Controls sun position and atmosphere color. Synced with Streets GL sun direction.'
                    : 'Controls sun position for standalone weather system. Works offline.'}
                </small>
                <div className="control-group">
                  <label>
                    Time
                    <input
                      type="range"
                      min="0"
                      max="24"
                      step="0.1"
                      value={timeOfDay}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value)
                        trackSliderInteraction('Time of Day', newValue, 'WeatherPanel', () => setTimeOfDay(newValue))
                      }}
                    />
                    <span className="value-label">{timeOfDay.toFixed(1)}h</span>
                  </label>
                </div>
              </div>

              <div className="weather-section">
                <h3>Orientation</h3>
                <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                  Rotate the sun direction around the scene (useful for architectural models). Affects sun position.
                </small>
                <div className="control-group">
                  <label>
                    North Offset (°)
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={northOffset}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value)
                        trackSliderInteraction('North Offset', newValue, 'WeatherPanel', () => setNorthOffset(newValue))
                      }}
                    />
                    <span className="value-label">{northOffset.toFixed(0)}°</span>
                  </label>
                </div>
              </div>

              <div className="weather-section" style={{ 
                background: 'rgba(100, 100, 100, 0.05)', 
                borderRadius: '6px', 
                padding: '12px',
                marginTop: '12px'
              }}>
                <h3 style={{ marginTop: 0 }}>📝 Additional Controls</h3>
                <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                  For more advanced sun and shadow controls, use the <strong>Lighting Panel</strong>:
                </small>
                <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                  • Shadow Quality (CSM quality settings)
                </small>
                <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                  • Sun Intensity (light brightness)
                </small>
                <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                  • Sun Color (atmospheric sun color)
                </small>
                <small style={{ display: 'block', color: '#888' }}>
                  • Sun Direction (manual override if needed)
                </small>
              </div>

              {/* Show Streets GL info only when Streets GL is active */}
              {streetsGLIframeOverlay && streetsGLBridge && (
                <div className="weather-section" style={{ 
                  background: 'rgba(74, 158, 255, 0.1)', 
                  border: '1px solid rgba(74, 158, 255, 0.3)', 
                  borderRadius: '6px', 
                  padding: '12px',
                  marginTop: '12px'
                }}>
                  <h3 style={{ color: '#4a9eff', marginTop: 0 }}>🌍 Streets GL Weather System</h3>
                  <small style={{ display: 'block', color: '#4a9eff', marginBottom: '8px' }}>
                    Streets GL provides a physically-based atmosphere system with automatic:
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • Atmospheric scattering (sky color based on sun position)
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • CSM shadows (high-quality cascaded shadow maps)
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • Water rendering (automatic from OSM map data)
                  </small>
                  <small style={{ display: 'block', color: '#888' }}>
                    • Atmospheric perspective (fog/haze based on distance)
                  </small>
                </div>
              )}

              {/* Show standalone weather info when standalone is active but Streets GL is not */}
              {enableStandaloneWeather && !(streetsGLIframeOverlay && streetsGLBridge) && (
                <div className="weather-section" style={{ 
                  background: 'rgba(100, 200, 100, 0.1)', 
                  border: '1px solid rgba(100, 200, 100, 0.3)', 
                  borderRadius: '6px', 
                  padding: '12px',
                  marginTop: '12px'
                }}>
                  <h3 style={{ color: '#64c864', marginTop: 0 }}>🌞 Standalone Weather System</h3>
                  <small style={{ display: 'block', color: '#64c864', marginBottom: '8px' }}>
                    Local weather system using Streets GL-quality CSM shadows:
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • CSM shadows (3 cascades, 2048x2048 resolution)
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • Time-of-day sun system (day/night transitions)
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • Water rendering (automatic water plane with waves)
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • Atmospheric perspective (fog/haze based on distance)
                  </small>
                  <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                    • Works offline, no internet required
                  </small>
                  <small style={{ display: 'block', color: '#888' }}>
                    • Same quality as Streets GL
                  </small>
                </div>
              )}
            </>
          ) : (
            <div className="weather-section" style={{ 
              background: 'rgba(255, 200, 0, 0.1)', 
              border: '1px solid rgba(255, 200, 0, 0.3)', 
              borderRadius: '6px', 
              padding: '12px',
              marginBottom: '12px'
            }}>
              <h3 style={{ color: '#ffc800', marginTop: 0 }}>⚠️ Weather System Not Active</h3>
              <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                Enable either:
              </small>
              <small style={{ display: 'block', color: '#888', marginBottom: '4px' }}>
                • <strong>Standalone Weather</strong> (above) - Works offline, CSM shadows + sun
              </small>
              <small style={{ display: 'block', color: '#888' }}>
                • <strong>Streets GL Overlay</strong> - Go to Maps panel → Enable "Streets GL Overlay"
              </small>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
