import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, type LightType } from '../store/useAppStore'
import { trackSliderInteraction } from '../utils/sliderTracker'
import NumberInput from './NumberInput'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { useViewer } from '../viewer/useViewer'
import * as THREE from 'three'
import FastHDRConverter from './FastHDRConverter'
import './LightingPanel.css'

const HDR_PRESETS = [
  { label: 'Skidpan (Outdoor 8K)', url: '/files-upload/hdr/skidpan_8k.hdr' },
  { label: 'Empty Warehouse (Indoor 8K)', url: '/files-upload/empty_warehouse_01_8k.hdr' },
  { label: 'Rogland Clear Night (Outdoor 8K)', url: '/files-upload/rogland_clear_night_8k.hdr' }
]

export default function LightingPanel() {
  const {
    showLightingPanel,
    ambientIntensity,
    shadowsEnabled,
    shadowIntensity,
    shadowBias,
    shadowPlaneTransparent,
    showShadowPlane,
    showShadowPlaneInPathTracer,
    shadowOpacityEnabled,
    shadowOpacity,
    shadowColor,
    gridSize,
    toggleLightingPanel,
    setAmbientIntensity,
    setShadowsEnabled,
    setShadowIntensity,
    setShadowBias,
    setShadowPlaneTransparent,
    toggleShadowPlane,
    setShowShadowPlaneInPathTracer,
    setShadowOpacityEnabled,
    setShadowOpacity,
    setShadowColor,
    shadowMapViewerEnabled,
    shadowMapViewerSize,
    shadowMapViewerPosition,
    setShadowMapViewerEnabled,
    setShadowMapViewerSize,
    setShadowMapViewerPosition,
    shadowMapSize,
    useAdaptiveShadowSettings,
    shadowBiasOverride,
    shadowNormalBiasOverride,
    csmShadowRadius,
    setShadowMapSize,
    setUseAdaptiveShadowSettings,
    setShadowBiasOverride,
    setShadowNormalBiasOverride,
    setCsmShadowRadius,
    setGridSize,
    directionalLights,
    selectedLightId,
    setSelectedLightId,
    addDirectionalLight,
    removeDirectionalLight,
    updateDirectionalLight,
    setSunLight,
    hdrEnabled,
    hdrUrl,
    hdrIntensity,
    hdrRotationAzimuth,
    hdrRotationElevation,
    hdrBackgroundVisible,
    setHdrEnabled,
    setHdrUrl,
    setHdrFile,
    setHdrIntensity,
    setHdrRotationAzimuth,
    setHdrRotationElevation,
    setHdrBackgroundVisible,
    hdrGroundProjectionEnabled,
    hdrGroundProjectionHeight,
    hdrGroundProjectionRadius,
    hdrGroundProjectionResolution,
    hdrGroundProjectionPositionY,
    setHdrGroundProjectionEnabled,
    setHdrGroundProjectionHeight,
    setHdrGroundProjectionRadius,
    setHdrGroundProjectionResolution,
    setHdrGroundProjectionPositionY,
    cameraBoundsEnabled,
    cameraBoundsMin,
    cameraBoundsMax,
    setCameraBoundsEnabled,
    setCameraBoundsMin,
    setCameraBoundsMax,
    showGrid,
    toggleGrid,
    showAxes,
    toggleAxes,
    showLightHelpers,
    toggleLightHelpers,
    streetsGLBridge,
    streetsGLIframeOverlay,
    enableStandaloneWeather
  } = useAppStore()

  const { viewer } = useViewer()
  const { setTransformMode } = useAppStore()
  const hdrFileInputRef = useRef<HTMLInputElement>(null)
  const hdrObjectUrlRef = useRef<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [hdrUrlInput, setHdrUrlInput] = useState(hdrUrl ?? '')
  // Debounced store setters to keep HDR ground sliders responsive
  const useDebouncedStoreSetter = <T,>(
    storeValue: T,
    setter: (v: T) => void,
    delay = 80
  ) => {
    const [localValue, setLocalValue] = useState<T>(storeValue)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)
    useEffect(() => {
      setLocalValue(storeValue)
    }, [storeValue])
    const update = useCallback(
      (v: T) => {
        setLocalValue(v)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => setter(v), delay)
      },
      [setter, delay]
    )
    return { localValue, update }
  }

  const debouncedGroundHeight = useDebouncedStoreSetter(hdrGroundProjectionHeight, setHdrGroundProjectionHeight)
  const debouncedGroundRadius = useDebouncedStoreSetter(hdrGroundProjectionRadius, setHdrGroundProjectionRadius)
  const debouncedGroundResolution = useDebouncedStoreSetter(
    hdrGroundProjectionResolution,
    setHdrGroundProjectionResolution,
    120
  )
  const debouncedGroundPosY = useDebouncedStoreSetter(hdrGroundProjectionPositionY, setHdrGroundProjectionPositionY)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 340
  const stackingOffset = usePanelStacking({ panelId: 'lighting', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'lighting'
    }
  )

  useEffect(() => {
    setHdrUrlInput(hdrUrl ?? '')
  }, [hdrUrl])

  if (!showLightingPanel) return null

  // Handle light selection - attach transform controls when clicking on a light
  const handleLightClick = (lightId: string) => {
    // Set the selected light ID in the store (for UI highlighting)
    setSelectedLightId(lightId)
    
    // Find the actual light object in the scene and select it
    if (viewer && viewer.scene && viewer.directionalLights) {
      // Get the light from the directionalLights map
      const light = viewer.directionalLights.get(lightId)
      
      // If we found the light, select it and attach transform controls
      if (light && viewer.selectObject) {
        // Set transform mode to translate (same as double-click behavior)
        setTransformMode('translate')
        
        // Select the light (this will attach transform controls and show green/red/blue axes)
        viewer.selectObject(light)
      }
    }
  }

  const selectedLight = directionalLights.find(l => l.id === selectedLightId) || directionalLights[0]
  const selectedLightShadowRadius = selectedLight ? selectedLight.shadowRadius ?? 0 : 0

  const applyHdrUrl = useCallback((urlFromArg?: string) => {
    const nextUrl = (urlFromArg ?? hdrUrlInput).trim()
    if (!nextUrl) {
      return
    }
    if (hdrObjectUrlRef.current) {
      URL.revokeObjectURL(hdrObjectUrlRef.current)
      hdrObjectUrlRef.current = null
    }
    setHdrFile(null)
    setHdrUrl(nextUrl)
    setHdrEnabled(true)
  }, [hdrUrlInput, setHdrEnabled, setHdrFile, setHdrUrl])

  const handleAddLight = (type: LightType = 'point') => {
    // CRITICAL: Match demo light behavior - use higher intensity and better position
    // Demo uses intensity 1.5 and position (10, 20, 10) for better visibility
    const baseConfig = {
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Light ${directionalLights.length + 1}`,
      type: type,
      // Use higher intensity for directional lights to match demo (1.5 vs 1.0)
      intensity: type === 'hemisphere' ? 0.5 : (type === 'directional' ? 1.5 : 1.0),
      // Use better default position for directional lights (higher up, like demo)
      position: type === 'directional' ? { x: 10, y: 20, z: 10 } : { x: 5, y: 5, z: 5 },
      color: '#ffffff',
      castShadow: type === 'directional', // Enable shadows for directional lights by default (like demo)
      enabled: true,
      isSun: false,
      shadowRadius: type === 'directional' ? 2 : 0, // Smooth shadows for directional lights (like demo)
    }

    // Add type-specific properties
    const typeSpecificConfig: any = {}
    
    if (type === 'point' || type === 'spot') {
      typeSpecificConfig.distance = 100
      typeSpecificConfig.decay = 2
      typeSpecificConfig.power = 1000
    }
    
    if (type === 'spot') {
      typeSpecificConfig.angle = Math.PI / 6 // 30 degrees
      typeSpecificConfig.penumbra = 0.2
      // Default target: point straight down from light position
      const lightPos = baseConfig.position
      typeSpecificConfig.target = { x: lightPos.x, y: lightPos.y - 10, z: lightPos.z }
    }
    
    if (type === 'rectarea') {
      typeSpecificConfig.width = 10
      typeSpecificConfig.height = 10
      // Default target: point straight down from light position
      const lightPos = baseConfig.position
      typeSpecificConfig.target = { x: lightPos.x, y: lightPos.y - 10, z: lightPos.z }
      typeSpecificConfig.power = 1000
    }
    
    if (type === 'directional' || !type) {
      // Default target for directional lights (controls light direction)
      // Pointing down by default (target below light position, not at origin)
      const lightPos = baseConfig.position
      typeSpecificConfig.target = { x: lightPos.x, y: lightPos.y - 10, z: lightPos.z }
    }
    
    if (type === 'hemisphere') {
      typeSpecificConfig.groundColor = '#444444'
    }

    addDirectionalLight({
      ...baseConfig,
      ...typeSpecificConfig
    })
  }

  const handleRemoveLight = (id: string) => {
    if (directionalLights.length > 1) {
      removeDirectionalLight(id)
    }
  }

  const handleHdrFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) {
      // Reset input to allow selecting the same file again
      if (hdrFileInputRef.current) {
        hdrFileInputRef.current.value = ''
      }
      return
    }
    
    // If multiple files selected, use the first one (prioritize FastHDR, then EXR, then HDR)
    let file: File | null = null
    if (files.length > 1) {
      // Find FastHDR (KTX2) first, then EXR, then HDR
      file = Array.from(files).find(f => f.name.toLowerCase().endsWith('.ktx2')) ||
             Array.from(files).find(f => f.name.toLowerCase().endsWith('.exr')) || 
             Array.from(files).find(f => f.name.toLowerCase().endsWith('.hdr')) ||
             files[0]
    } else {
      file = files[0]
    }
    
    if (file) {
      const fileName = file.name.toLowerCase()
      const ext = fileName.split('.').pop()
      
      // Validate file extension (now includes FastHDR/KTX2)
      if (ext !== 'hdr' && ext !== 'exr' && ext !== 'ktx2') {
        alert(`Unsupported file format: .${ext}\nPlease select an .hdr, .exr, or .ktx2 (FastHDR) file.`)
        // Reset input to allow selecting again
        if (hdrFileInputRef.current) {
          hdrFileInputRef.current.value = ''
        }
        return
      }
      
      const formatName = ext === 'ktx2' ? 'FastHDR (KTX2)' : ext.toUpperCase()
      console.log(`Loading ${formatName} file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB, format: ${formatName})`)
      
      // Create object URL for the file
      if (hdrObjectUrlRef.current) {
        URL.revokeObjectURL(hdrObjectUrlRef.current)
      }
      const url = URL.createObjectURL(file)
      hdrObjectUrlRef.current = url
      setHdrFile(file)
      setHdrUrl(url)
      setHdrEnabled(true)
    }
    
    // Reset input to allow selecting the same file again
    if (hdrFileInputRef.current) {
      hdrFileInputRef.current.value = ''
    }
  }

  const handleLoadHdrUrl = () => {
    const url = prompt('Enter HDR URL:', hdrUrlInput || '/files-upload/hdr/skidpan_8k.hdr')
    if (url) {
      setHdrUrlInput(url)
      applyHdrUrl(url)
    }
  }

  return (
    <div
      ref={panelRef}
      className={`lighting-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="lighting-panel-header" onMouseDown={handleMouseDown}>
        <h3>💡 Lighting & Environment</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button onClick={toggleLightingPanel} className="close-button">×</button>
        </div>
      </div>
      
      {!isMinimized && (
      <div className="lighting-panel-content">
        {/* Ambient Light Section */}
        <div className="lighting-section">
          <h4>Ambient Light</h4>
          <label>
            <span>Intensity</span>
            <div className="slider-container">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={ambientIntensity}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value)
                  trackSliderInteraction(
                    'Ambient Light Intensity',
                    newValue,
                    'LightingPanel',
                    () => setAmbientIntensity(newValue)
                  )
                }}
                className="slider"
              />
              <span className="slider-value">{ambientIntensity.toFixed(1)}</span>
            </div>
          </label>
        </div>

        {/* Shadows Toggle */}
        <div className="lighting-section">
          <h4>Shadows</h4>
          <label>
            <span>Enable Shadows</span>
            <input
              type="checkbox"
              checked={shadowsEnabled}
              onChange={(e) => setShadowsEnabled(e.target.checked)}
            />
          </label>
          {shadowsEnabled && (
            <>
              <label>
                <span>Shadow Intensity</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={shadowIntensity}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value)
                      trackSliderInteraction(
                        'Shadow Intensity',
                        newValue,
                        'LightingPanel',
                        () => setShadowIntensity(newValue)
                      )
                    }}
                    className="slider"
                  />
                  <span className="slider-value">{shadowIntensity.toFixed(1)}</span>
                </div>
                <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                  Controls shadow darkness (0 = no shadow, 2 = very dark)
                  {enableStandaloneWeather && viewer?.csmShadowSystem?.isEnabled() && (
                    <span style={{ display: 'block', color: '#4a9eff', marginTop: '4px' }}>
                      ⚠️ CSM shadows active - intensity affects all shadow receivers
                    </span>
                  )}
                </small>
              </label>
              <label>
                <span>Shadow Bias (Sharpness)</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="-0.01"
                    max="0.01"
                    step="0.0001"
                    value={useAdaptiveShadowSettings ? shadowBias : shadowBiasOverride}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value)
                      if (useAdaptiveShadowSettings) {
                        trackSliderInteraction('Shadow Bias', newValue, 'LightingPanel', () => setShadowBias(newValue))
                      } else {
                        trackSliderInteraction('Shadow Bias Override', newValue, 'LightingPanel', () => setShadowBiasOverride(newValue))
                      }
                    }}
                    className="slider"
                  />
                  <span className="slider-value">{(useAdaptiveShadowSettings ? shadowBias : shadowBiasOverride).toFixed(4)}</span>
                </div>
                                  <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                    Lower values = sharper shadows (may cause shadow acne), Higher values = softer shadows
                    {useAdaptiveShadowSettings && (
                      <span style={{ display: 'block', color: '#ffaa00', marginTop: '4px' }}>
                        ⚠️ Adaptive mode: Bias is auto-calculated based on object size. Disable "Use Adaptive Shadow Settings" for manual control.
                      </span>
                    )}
                    {enableStandaloneWeather && viewer?.csmShadowSystem?.isEnabled() && (
                      <span style={{ display: 'block', color: '#4a9eff', marginTop: '4px' }}>
                        ⚠️ CSM shadows active - bias applies to all cascades
                      </span>
                    )}
                  </small>
                </label>
                
                {/* Shadow Quality Settings - Streets GL CSM or Standalone Weather */}
                {streetsGLIframeOverlay && streetsGLBridge ? (
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', marginTop: '12px' }}>
                    <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>
                      Streets GL Shadow Quality (CSM)
                    </h5>
                    <label>
                      <span>Quality</span>
                      <select
                        defaultValue="high"
                        onChange={(e) => {
                          const quality = e.target.value as 'low' | 'medium' | 'high'
                          streetsGLBridge.setShadowQuality(quality)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '14px'
                        }}
                      >
                        <option value="low">Low (1 cascade, 2048px, 3000m)</option>
                        <option value="medium">Medium (3 cascades, 2048px, 4000m)</option>
                        <option value="high">High (3 cascades, 4096px, 5000m)</option>
                      </select>
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Cascaded Shadow Maps - better quality at different distances
                      </small>
                    </label>
                  </div>
                ) : enableStandaloneWeather && viewer?.csmShadowSystem ? (
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', marginTop: '12px' }}>
                    <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>
                      Standalone Weather Shadow Quality (CSM)
                    </h5>
                    <label>
                      <span>Quality</span>
                      <select
                        defaultValue="high"
                        onChange={(e) => {
                          const quality = e.target.value as 'low' | 'medium' | 'high'
                          // CRITICAL: Update store shadowMapSize to match quality preset
                          // This ensures store and CSM config stay in sync
                          let targetSize = 2048
                          if (quality === 'high') {
                            targetSize = 4096
                          } else if (quality === 'medium') {
                            targetSize = 2048
                          } else { // low
                            targetSize = 2048
                          }
                          setShadowMapSize(targetSize)
                          // Then update CSM quality (which will use the updated store value)
                          viewer.csmShadowSystem?.setShadowQuality(quality)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '14px'
                        }}
                      >
                        <option value="low">Low (1 cascade, 2048px, 3000m)</option>
                        <option value="medium">Medium (3 cascades, 2048px, 4000m)</option>
                        <option value="high">High (3 cascades, 4096px, 5000m)</option>
                      </select>
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Cascaded Shadow Maps - better quality at different distances
                      </small>
                    </label>
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', marginTop: '12px' }}>
                    <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Shadow Quality</h5>
                    
                    {enableStandaloneWeather && viewer?.csmShadowSystem?.isEnabled() && (
                      <div style={{ 
                        padding: '8px', 
                        marginBottom: '12px', 
                        backgroundColor: 'rgba(74, 158, 255, 0.1)', 
                        border: '1px solid rgba(74, 158, 255, 0.3)', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#4a9eff'
                      }}>
                        ⚠️ CSM (Cascaded Shadow Maps) is active. Shadow map size and bias settings apply to CSM cascades.
                      </div>
                    )}
                    
                    <label>
                      <span>Shadow Map Size</span>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="512"
                          max="8192"
                          step="512"
                          value={shadowMapSize}
                          onChange={(e) => {
                            const newValue = parseInt(e.target.value)
                            trackSliderInteraction('Shadow Map Size', newValue, 'LightingPanel', () => setShadowMapSize(newValue))
                          }}
                          className="slider"
                        />
                        <span className="slider-value">{shadowMapSize}px</span>
                      </div>
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Higher = sharper shadows (512 = fast, 2048 = good, 4096 = high quality, 8192 = ultra)
                        {enableStandaloneWeather && viewer?.csmShadowSystem?.isEnabled() && (
                          <span style={{ display: 'block', color: '#4a9eff', marginTop: '4px' }}>
                            ⚠️ Changing this will recreate CSM with new resolution
                          </span>
                        )}
                      </small>
                    </label>
                    
                    <label>
                      <span>Use Adaptive Shadow Settings</span>
                      <input
                        type="checkbox"
                        checked={useAdaptiveShadowSettings}
                        onChange={(e) => setUseAdaptiveShadowSettings(e.target.checked)}
                      />
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Automatically adjust bias based on object size and shadow map resolution
                      </small>
                    </label>
                    
                    {!useAdaptiveShadowSettings && (
                      <>
                        <label>
                          <span>Shadow Bias Override</span>
                          <div className="slider-container">
                            <input
                              type="range"
                              min="-0.001"
                              max="-0.00001"
                              step="0.00001"
                              value={shadowBiasOverride}
                              onChange={(e) => {
                                const newValue = parseFloat(e.target.value)
                                trackSliderInteraction('Shadow Bias Override', newValue, 'LightingPanel', () => setShadowBiasOverride(newValue))
                              }}
                              className="slider"
                            />
                            <span className="slider-value">{shadowBiasOverride.toFixed(5)}</span>
                          </div>
                          <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                            Manual shadow bias (lower = sharper, may cause shadow acne)
                          </small>
                        </label>
                        
                        <label>
                          <span>Normal Bias Override</span>
                          <div className="slider-container">
                            <input
                              type="range"
                              min="0"
                              max="0.1"
                              step="0.001"
                              value={shadowNormalBiasOverride}
                              onChange={(e) => {
                                const newValue = parseFloat(e.target.value)
                                trackSliderInteraction('Normal Bias Override', newValue, 'LightingPanel', () => setShadowNormalBiasOverride(newValue))
                              }}
                              className="slider"
                            />
                            <span className="slider-value">{shadowNormalBiasOverride.toFixed(3)}</span>
                          </div>
                          <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                            Manual normal bias (reduces shadow acne on angled surfaces)
                          </small>
                        </label>
                      </>
                    )}
                  </div>
                )}
                
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', marginTop: '12px' }}>
                  <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Shadow Opacity & Color</h5>
                  <label>
                    <span>Enable Shadow Opacity</span>
                    <input
                      type="checkbox"
                      checked={shadowOpacityEnabled}
                      onChange={(e) => setShadowOpacityEnabled(e.target.checked)}
                    />
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Add custom opacity and color tint to shadows on materials
                    </small>
                  </label>
                  {shadowOpacityEnabled && (
                    <>
                      <label>
                        <span>Shadow Opacity</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={shadowOpacity}
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value)
                              trackSliderInteraction('Shadow Opacity', newValue, 'LightingPanel', () => setShadowOpacity(newValue))
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{shadowOpacity.toFixed(2)}</span>
                        </div>
                        <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                          Opacity of shadows (0 = transparent, 1 = fully opaque)
                        </small>
                      </label>
                      <label>
                        <span>Shadow Color</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                          <input
                            type="color"
                            value={shadowColor}
                            onChange={(e) => setShadowColor(e.target.value)}
                            style={{ width: '50px', height: '30px', cursor: 'pointer' }}
                          />
                          <input
                            type="text"
                            value={shadowColor}
                            onChange={(e) => setShadowColor(e.target.value)}
                            style={{
                              flex: 1,
                              padding: '4px 8px',
                              backgroundColor: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '4px',
                              color: 'white',
                              fontSize: '12px'
                            }}
                          />
                        </div>
                        <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                          Color tint for shadows (default: black)
                        </small>
                      </label>
                    </>
                  )}
                </div>
              </>
            )}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', marginTop: '12px' }}>
              <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Shadow Map Viewer (Debug)</h5>
              <label>
                <span>Enable Shadow Map Viewer</span>
                <input
                  type="checkbox"
                  checked={shadowMapViewerEnabled}
                  onChange={(e) => setShadowMapViewerEnabled(e.target.checked)}
                />
                <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                  Visualize shadow maps from lights for debugging (overlays on screen)
                </small>
              </label>
              {shadowMapViewerEnabled && (
                <>
                  <label>
                    <span>Viewer Size (px)</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="64"
                        max="512"
                        step="32"
                        value={shadowMapViewerSize}
                        onChange={(e) => {
                          const newValue = parseInt(e.target.value)
                          trackSliderInteraction('Shadow Map Viewer Size', newValue, 'LightingPanel', () => setShadowMapViewerSize(newValue))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{shadowMapViewerSize}px</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Size of shadow map viewer overlay (64-512 pixels)
                    </small>
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <label style={{ flex: 1 }}>
                      <span>Position X (px)</span>
                      <NumberInput
                        value={shadowMapViewerPosition.x}
                        onChange={(value) => setShadowMapViewerPosition({ ...shadowMapViewerPosition, x: Math.round(value) })}
                        min={0}
                        step={1}
                        decimals={0}
                        style={{ width: '100%', padding: '4px', backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px', color: 'white' }}
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      <span>Position Y (px)</span>
                      <NumberInput
                        value={shadowMapViewerPosition.y}
                        onChange={(value) => setShadowMapViewerPosition({ ...shadowMapViewerPosition, y: Math.round(value) })}
                        min={0}
                        step={1}
                        decimals={0}
                        style={{ width: '100%', padding: '4px', backgroundColor: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '4px', color: 'white' }}
                      />
                    </label>
                  </div>
                  <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                    Position of shadow map viewer overlay (top-left corner)
                  </small>
                </>
              )}
            </div>
          <label>
            <span>Show Shadow Plane</span>
            <input
              type="checkbox"
              checked={showShadowPlane}
              onChange={(e) => {
                if (!showShadowPlane) {
                  toggleShadowPlane() // Enable shadow plane
                } else {
                  toggleShadowPlane() // Disable shadow plane
                }
              }}
            />
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              {showShadowPlane 
                ? '✅ Shadow plane is visible - shadows will appear on it'
                : '❌ Shadow plane is hidden - enable to see shadows on ground'}
            </small>
          </label>
          <label>
              <span>Transparent Shadow Plane</span>
            <input
              type="checkbox"
              checked={shadowPlaneTransparent}
              onChange={(e) => setShadowPlaneTransparent(e.target.checked)}
              disabled={!showShadowPlane}
            />
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              Makes shadow plane transparent but still shows shadows
            </small>
          </label>
          <label>
            <span>Keep Ground During Path Trace</span>
            <input
              type="checkbox"
              checked={showShadowPlaneInPathTracer}
              onChange={(e) => setShowShadowPlaneInPathTracer(e.target.checked)}
            />
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              Keep HDR ground visible so path tracer can project shadows onto it
            </small>
          </label>
        </div>

        {/* Grid Settings Section */}
        <div className="lighting-section">
          <h4>Grid</h4>
          <div className="lighting-toggle-group">
            <button
              className={`lighting-toggle-button ${showGrid ? 'active' : ''}`}
              onClick={toggleGrid}
              title="Toggle grid visibility"
              aria-pressed={showGrid}
            >
              Grid
            </button>
            <button
              className={`lighting-toggle-button ${showAxes ? 'active' : ''}`}
              onClick={toggleAxes}
              title="Toggle axes visibility"
              aria-pressed={showAxes}
            >
              Axes
            </button>
            <button
              className={`lighting-toggle-button ${showLightHelpers ? 'active' : ''}`}
              onClick={toggleLightHelpers}
              title="Toggle light helpers visibility"
              aria-pressed={showLightHelpers}
            >
              Light Helpers
            </button>
          </div>
          
          <label>
            <span>Show Light Positions</span>
            <button
              type="button"
              onClick={() => {
                if (!viewer) return
                const { scene } = viewer
                const lightPositions: any[] = []
                
                // Get all lights in scene
                scene.traverse((obj) => {
                  if (obj instanceof THREE.Light) {
                    const isCSM = (obj as any).userData?.isCSMLight || (obj as any).userData?.isInternal
                    const lightType = obj.constructor.name
                    const position = obj.position
                    const target = (obj as any).target ? (obj as any).target.position : null
                    
                    lightPositions.push({
                      type: lightType,
                      name: obj.name || 'Unnamed',
                      isCSM: isCSM,
                      position: {
                        x: position.x.toFixed(2),
                        y: position.y.toFixed(2),
                        z: position.z.toFixed(2)
                      },
                      target: target ? {
                        x: target.x.toFixed(2),
                        y: target.y.toFixed(2),
                        z: target.z.toFixed(2)
                      } : null,
                      intensity: (obj as any).intensity || 'N/A',
                      visible: obj.visible,
                      castShadow: (obj as any).castShadow || false
                    })
                  }
                })
                
                // Log to console
                console.log('🔍 All Light Positions in Scene:')
                console.log(`Total lights: ${lightPositions.length}`)
                lightPositions.forEach((light, index) => {
                  console.log(`\nLight ${index + 1}:`, {
                    type: light.type,
                    name: light.name,
                    isCSM: light.isCSM ? 'YES (internal)' : 'NO',
                    position: `(${light.position.x}, ${light.position.y}, ${light.position.z})`,
                    target: light.target ? `(${light.target.x}, ${light.target.y}, ${light.target.z})` : 'N/A',
                    intensity: light.intensity,
                    visible: light.visible,
                    castShadow: light.castShadow
                  })
                })
                
                // Also show in alert for quick reference
                const csmLights = lightPositions.filter(l => l.isCSM)
                const userLights = lightPositions.filter(l => !l.isCSM)
                
                let message = `Total Lights: ${lightPositions.length}\n`
                message += `CSM Lights: ${csmLights.length}\n`
                message += `User Lights: ${userLights.length}\n\n`
                
                if (csmLights.length > 0) {
                  message += 'CSM Light Positions:\n'
                  csmLights.forEach((light, i) => {
                    message += `  ${i + 1}. ${light.position.x}, ${light.position.y}, ${light.position.z}\n`
                  })
                  message += '\n'
                }
                
                if (userLights.length > 0) {
                  message += 'User Light Positions:\n'
                  userLights.forEach((light, i) => {
                    message += `  ${i + 1}. ${light.name}: ${light.position.x}, ${light.position.y}, ${light.position.z}\n`
                  })
                }
                
                alert(message + '\n\n(Full details logged to console)')
              }}
              style={{
                padding: '6px 12px',
                background: 'rgba(33, 150, 243, 0.2)',
                border: '1px solid rgba(33, 150, 243, 0.5)',
                borderRadius: '4px',
                color: '#2196f3',
                cursor: 'pointer',
                fontSize: '12px',
                width: '100%',
                marginTop: '8px'
              }}
            >
              Log to Console
            </button>
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              Shows all light positions (including CSM lights) in console and alert
            </small>
          </label>
          
          <label>
            <span>Grid Size (Divisions)</span>
            <div className="slider-container">
              <input
                type="range"
                min="10"
                max="1000"
                step="10"
                value={gridSize}
                onChange={(e) => {
                  const newValue = parseInt(e.target.value)
                  trackSliderInteraction('Grid Size', newValue, 'LightingPanel', () => setGridSize(newValue))
                }}
                className="slider"
              />
              <span className="slider-value">{gridSize}</span>
            </div>
            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
              Number of grid lines (higher = denser grid)
            </small>
          </label>
        </div>

        {/* HDR Environment Section */}
        <div className="lighting-section">
          <h4>🌍 HDR Environment</h4>
          <label>
            <span>Enable HDR</span>
            <input
              type="checkbox"
              checked={hdrEnabled}
              onChange={(e) => setHdrEnabled(e.target.checked)}
              disabled={!hdrUrl}
            />
          </label>
          
          {hdrEnabled && hdrUrl && (
            <>
              <label>
                <span>HDR Intensity</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={hdrIntensity}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value)
                      trackSliderInteraction('HDR Intensity', newValue, 'LightingPanel', () => setHdrIntensity(newValue))
                    }}
                    className="slider"
                  />
                  <span className="slider-value">{hdrIntensity.toFixed(1)}</span>
                </div>
              </label>

              <label>
                <span>HDR Rotation (Azimuth)</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={hdrRotationAzimuth}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value)
                      trackSliderInteraction('HDR Rotation Azimuth', newValue, 'LightingPanel', () => setHdrRotationAzimuth(newValue))
                    }}
                    className="slider"
                  />
                  <span className="slider-value">{hdrRotationAzimuth.toFixed(0)}°</span>
                </div>
                <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                  Rotate the environment around the vertical axis to steer sunlight/shadows.
                </small>
              </label>

              <label>
                <span>HDR Tilt (Elevation)</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="-90"
                    max="90"
                    step="1"
                    value={hdrRotationElevation}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value)
                      trackSliderInteraction('HDR Rotation Elevation', newValue, 'LightingPanel', () => setHdrRotationElevation(newValue))
                    }}
                    className="slider"
                  />
                  <span className="slider-value">{hdrRotationElevation.toFixed(0)}°</span>
                </div>
                <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                  Tilt the environment up or down to raise or lower the light source.
                </small>
              </label>

              <label>
                <span>Show HDR Background</span>
                <input
                  type="checkbox"
                  checked={hdrBackgroundVisible}
                  onChange={(e) => setHdrBackgroundVisible(e.target.checked)}
                  disabled={hdrGroundProjectionEnabled}
                />
                <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                  Toggle the visible sky dome while keeping the HDR lighting active{hdrGroundProjectionEnabled ? ' (ground projection manages the visible ground/sky)' : ''}.
                </small>
              </label>
              
              <label>
                <span>Ground Projection</span>
                <input
                  type="checkbox"
                  checked={hdrGroundProjectionEnabled}
                  onChange={(e) => setHdrGroundProjectionEnabled(e.target.checked)}
                />
                <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                  Project environment map onto ground plane (Three.js official method)
                </small>
              </label>
              
              {hdrGroundProjectionEnabled && (
                <>
                  <label>
                    <span>Ground Height</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        step="0.1"
                        value={debouncedGroundHeight.localValue}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('HDR Ground Height', newValue, 'LightingPanel', () =>
                            debouncedGroundHeight.update(newValue)
                          )
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{debouncedGroundHeight.localValue.toFixed(1)}</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Controls ground projection height (affects distortion). Higher = less distortion on vertical surfaces.
                    </small>
                  </label>
                  
                  <label>
                    <span>Ground Radius</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="5"
                        max="1000"
                        step="5"
                        value={debouncedGroundRadius.localValue}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('HDR Ground Radius', newValue, 'LightingPanel', () =>
                            debouncedGroundRadius.update(newValue)
                          )
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{Number(debouncedGroundRadius.localValue ?? 0).toFixed(0)}</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Controls sphere size. Larger = environment appears further away, reduces distortion on pillars.
                    </small>
                  </label>
                  
                  <label>
                    <span>Resolution (Quality)</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="64"
                        max="512"
                        step="16"
                        value={debouncedGroundResolution.localValue}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('HDR Ground Resolution', newValue, 'LightingPanel', () =>
                            debouncedGroundResolution.update(newValue)
                          )
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{Number(debouncedGroundResolution.localValue ?? 0).toFixed(0)}</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Sphere geometry detail. Higher = smoother, less distortion (default: 128). Higher values may impact performance.
                    </small>
                  </label>
                  
                  <label>
                    <span>Position Y Offset</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="-10"
                        max="10"
                        step="0.01"
                        value={debouncedGroundPosY.localValue}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('HDR Ground Position Y', newValue, 'LightingPanel', () =>
                            debouncedGroundPosY.update(newValue)
                          )
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{Number(debouncedGroundPosY.localValue ?? 0).toFixed(2)}</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Fine-tune vertical position of ground projection. Adjust to align with your scene geometry.
                    </small>
                  </label>
                  
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #333' }}>
                    <label>
                      <span>Camera Bounds (Prevent Going Outside)</span>
                      <input
                        type="checkbox"
                        checked={cameraBoundsEnabled}
                        onChange={(e) => setCameraBoundsEnabled(e.target.checked)}
                      />
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Restrict camera movement to prevent going outside the HDR ground projection area
                      </small>
                    </label>
                    
                    {cameraBoundsEnabled && (
                      <>
                        <div style={{ marginTop: '12px' }}>
                          <h6 style={{ marginBottom: '8px', fontSize: '12px' }}>Min Bounds</h6>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ minWidth: '20px' }}>All:</span>
                              <NumberInput
                                value={cameraBoundsMin.x}
                                onChange={(value) => setCameraBoundsMin({ x: value, y: value, z: value })}
                                step={1}
                                decimals={1}
                                placeholder="Scale all"
                              />
                            </label>
                            <button
                              onClick={() => {
                                const currentValue = cameraBoundsMin.x
                                setCameraBoundsMin({ x: currentValue, y: currentValue, z: currentValue })
                              }}
                              className="button-secondary"
                              style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                              title="Set all values to X value"
                            >
                              Sync All
                            </button>
                          </div>
                          <label>
                            <span>X:</span>
                            <NumberInput
                              value={cameraBoundsMin.x}
                              onChange={(value) => setCameraBoundsMin({ ...cameraBoundsMin, x: value })}
                              step={1}
                              decimals={1}
                            />
                          </label>
                          <label>
                            <span>Y:</span>
                            <NumberInput
                              value={cameraBoundsMin.y}
                              onChange={(value) => setCameraBoundsMin({ ...cameraBoundsMin, y: value })}
                              step={1}
                              decimals={1}
                            />
                          </label>
                          <label>
                            <span>Z:</span>
                            <NumberInput
                              value={cameraBoundsMin.z}
                              onChange={(value) => setCameraBoundsMin({ ...cameraBoundsMin, z: value })}
                              step={1}
                              decimals={1}
                            />
                          </label>
                        </div>
                        
                        <div style={{ marginTop: '12px' }}>
                          <h6 style={{ marginBottom: '8px', fontSize: '12px' }}>Max Bounds</h6>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ minWidth: '20px' }}>All:</span>
                              <NumberInput
                                value={cameraBoundsMax.x}
                                onChange={(value) => setCameraBoundsMax({ x: value, y: value, z: value })}
                                step={1}
                                decimals={1}
                                placeholder="Scale all"
                              />
                            </label>
                            <button
                              onClick={() => {
                                const currentValue = cameraBoundsMax.x
                                setCameraBoundsMax({ x: currentValue, y: currentValue, z: currentValue })
                              }}
                              className="button-secondary"
                              style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                              title="Set all values to X value"
                            >
                              Sync All
                            </button>
                          </div>
                          <label>
                            <span>X:</span>
                            <NumberInput
                              value={cameraBoundsMax.x}
                              onChange={(value) => setCameraBoundsMax({ ...cameraBoundsMax, x: value })}
                              step={1}
                              decimals={1}
                            />
                          </label>
                          <label>
                            <span>Y:</span>
                            <NumberInput
                              value={cameraBoundsMax.y}
                              onChange={(value) => setCameraBoundsMax({ ...cameraBoundsMax, y: value })}
                              step={1}
                              decimals={1}
                            />
                          </label>
                          <label>
                            <span>Z:</span>
                            <NumberInput
                              value={cameraBoundsMax.z}
                              onChange={(value) => setCameraBoundsMax({ ...cameraBoundsMax, z: value })}
                              step={1}
                              decimals={1}
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          <div className="hdr-controls">
            <div className="hdr-url-row">
              <input
                type="text"
                value={hdrUrlInput}
                onChange={(e) => setHdrUrlInput(e.target.value)}
                placeholder="/files-upload/hdr/skidpan_8k.hdr"
              />
              <button
                onClick={() => applyHdrUrl()}
                className="button-secondary"
                disabled={!hdrUrlInput.trim()}
              >
                Apply URL
              </button>
            </div>
            {HDR_PRESETS.length > 0 && (
              <select
                defaultValue=""
                className="hdr-preset-select"
                onChange={(e) => {
                  const presetUrl = e.target.value
                  if (presetUrl) {
                    setHdrUrlInput(presetUrl)
                    applyHdrUrl(presetUrl)
                  }
                  e.currentTarget.value = ''
                }}
              >
                <option value="" disabled>
                  Load HDR preset...
                </option>
                {HDR_PRESETS.map((preset) => (
                  <option key={preset.url} value={preset.url}>
                    {preset.label}
                  </option>
                ))}
              </select>
            )}
            <div className="hdr-button-row">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const input = hdrFileInputRef.current || document.getElementById('hdr-file-input') as HTMLInputElement
                  if (input) {
                    input.click()
                  } else {
                    console.error('[LightingPanel] HDR file input not found')
                  }
                }}
                className="button-secondary"
                type="button"
              >
                Load HDR File
              </button>
              <button
                onClick={handleLoadHdrUrl}
                className="button-secondary"
              >
                Prompt for URL
              </button>
              {hdrUrl && (
                <button
                  onClick={() => {
                    setHdrEnabled(false)
                    if (hdrObjectUrlRef.current) {
                      URL.revokeObjectURL(hdrObjectUrlRef.current)
                      hdrObjectUrlRef.current = null
                    }
                    setHdrFile(null)
                    setHdrUrl(null)
                    setHdrUrlInput('')
                  }}
                  className="button-secondary"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          <input
            ref={hdrFileInputRef}
            type="file"
            accept=".hdr,.exr,.ktx2"
            multiple={false}
            onChange={handleHdrFileSelect}
            style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
            id="hdr-file-input"
            tabIndex={-1}
          />
        </div>

        {/* FastHDR Converter Section */}
        <div className="lighting-section">
          <h4>⚡ FastHDR Converter</h4>
          <div style={{ 
            background: 'rgba(74, 158, 255, 0.1)', 
            border: '1px solid rgba(74, 158, 255, 0.3)', 
            borderRadius: '6px', 
            padding: '12px',
            marginBottom: '12px'
          }}>
            <small style={{ display: 'block', color: '#4a9eff', marginBottom: '8px' }}>
              <strong>FastHDR</strong> is a compressed format that loads 10x faster and uses 95% less GPU memory than traditional HDR files.
            </small>
            <small style={{ display: 'block', color: '#888' }}>
              Convert your HDR/EXR files to FastHDR (KTX2) format for better performance.
            </small>
          </div>
          
          <FastHDRConverter />
        </div>

        {/* Streets GL Sun Section - Only show when Streets GL overlay is active */}
        {streetsGLIframeOverlay && streetsGLBridge && (
          <div className="lighting-section">
            <h4>☀️ Streets GL Sun</h4>
            <div style={{ 
              background: 'rgba(74, 158, 255, 0.1)', 
              border: '1px solid rgba(74, 158, 255, 0.3)', 
              borderRadius: '6px', 
              padding: '12px',
              marginBottom: '12px'
            }}>
              <small style={{ display: 'block', color: '#4a9eff', marginBottom: '8px' }}>
                Streets GL uses a single directional sun light with CSM shadows. Controls below affect the Streets GL scene.
              </small>
            </div>
            
            {(() => {
              const sunLight = directionalLights.find(l => l.isSun)
              if (!sunLight) return null
              
              return (
                <>
                  <label>
                    <span>Sun Intensity</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.1"
                        value={sunLight.intensity}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          updateDirectionalLight(sunLight.id, { intensity: newValue })
                          // Also update Streets GL
                          streetsGLBridge.setSunIntensity(newValue)
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{sunLight.intensity.toFixed(1)}</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Controls sun light intensity in Streets GL (affects lighting brightness)
                    </small>
                  </label>

                  <label>
                    <span>Sun Color</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <input
                        type="color"
                        value={sunLight.color}
                        onChange={(e) => {
                          const color = e.target.value
                          updateDirectionalLight(sunLight.id, { color })
                          // Convert hex to RGB for Streets GL
                          const r = parseInt(color.slice(1, 3), 16) / 255
                          const g = parseInt(color.slice(3, 5), 16) / 255
                          const b = parseInt(color.slice(5, 7), 16) / 255
                          streetsGLBridge.setSunColor({ r, g, b })
                        }}
                        style={{ width: '50px', height: '30px', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        value={sunLight.color}
                        onChange={(e) => {
                          const color = e.target.value
                          updateDirectionalLight(sunLight.id, { color })
                          const r = parseInt(color.slice(1, 3), 16) / 255
                          const g = parseInt(color.slice(3, 5), 16) / 255
                          const b = parseInt(color.slice(5, 7), 16) / 255
                          streetsGLBridge.setSunColor({ r, g, b })
                        }}
                        style={{
                          flex: 1,
                          padding: '4px 8px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '12px'
                        }}
                      />
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Note: Streets GL calculates sun color from atmosphere based on sun direction.
                      Color changes naturally with direction through atmospheric scattering.
                    </small>
                  </label>

                  {sunLight.target && (
                    <div className="position-controls">
                      <h6>Sun Direction (Target)</h6>
                      <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                        Controls sun direction in Streets GL. Light points from position toward target.
                      </small>
                      <label>
                        <span>X:</span>
                        <NumberInput
                          value={sunLight.target.x ?? 0}
                          onChange={(value) => {
                            const newTarget = { ...sunLight.target!, x: value }
                            updateDirectionalLight(sunLight.id, { target: newTarget })
                            // Calculate direction vector for Streets GL
                            const dir = {
                              x: newTarget.x - sunLight.position.x,
                              y: newTarget.y - sunLight.position.y,
                              z: newTarget.z - sunLight.position.z
                            }
                            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
                            if (len > 0) {
                              streetsGLBridge.setSunDirection({
                                x: dir.x / len,
                                y: dir.y / len,
                                z: dir.z / len
                              })
                            }
                          }}
                          step={1}
                          decimals={1}
                        />
                      </label>
                      <label>
                        <span>Y:</span>
                        <NumberInput
                          value={sunLight.target.y ?? 0}
                          onChange={(value) => {
                            const newTarget = { ...sunLight.target!, y: value }
                            updateDirectionalLight(sunLight.id, { target: newTarget })
                            const dir = {
                              x: newTarget.x - sunLight.position.x,
                              y: newTarget.y - sunLight.position.y,
                              z: newTarget.z - sunLight.position.z
                            }
                            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
                            if (len > 0) {
                              streetsGLBridge.setSunDirection({
                                x: dir.x / len,
                                y: dir.y / len,
                                z: dir.z / len
                              })
                            }
                          }}
                          step={1}
                          decimals={1}
                        />
                      </label>
                      <label>
                        <span>Z:</span>
                        <NumberInput
                          value={sunLight.target.z ?? 0}
                          onChange={(value) => {
                            const newTarget = { ...sunLight.target!, z: value }
                            updateDirectionalLight(sunLight.id, { target: newTarget })
                            const dir = {
                              x: newTarget.x - sunLight.position.x,
                              y: newTarget.y - sunLight.position.y,
                              z: newTarget.z - sunLight.position.z
                            }
                            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
                            if (len > 0) {
                              streetsGLBridge.setSunDirection({
                                x: dir.x / len,
                                y: dir.y / len,
                                z: dir.z / len
                              })
                            }
                          }}
                          step={1}
                          decimals={1}
                        />
                      </label>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* Standalone Weather System Controls - Only show when standalone weather is active */}
        {enableStandaloneWeather && !streetsGLIframeOverlay && (
          <div className="lighting-section">
            <h4>🌞 Standalone Weather System</h4>
            <div style={{ 
              background: 'rgba(76, 175, 80, 0.1)', 
              border: '1px solid rgba(76, 175, 80, 0.3)', 
              borderRadius: '6px', 
              padding: '12px',
              marginBottom: '12px'
            }}>
              <small style={{ display: 'block', color: '#4caf50', marginBottom: '8px' }}>
                Controls for standalone weather system (CSM shadows + sun). Works offline, no Streets GL required.
              </small>
            </div>
            
            {(() => {
              // Get CSM system and sun light from viewer
              const csmSystem = viewer?.csmShadowSystem
              const sunLight = directionalLights.find(l => l.isSun)
              
              if (!csmSystem && !sunLight) return null
              
              return (
                <>
                  {/* Shadow Quality Control */}
                  {csmSystem && (
                    <label>
                      <span>Shadow Quality (CSM)</span>
                      <select
                        defaultValue="high"
                        onChange={(e) => {
                          const quality = e.target.value as 'low' | 'medium' | 'high'
                          csmSystem.setShadowQuality(quality)
                        }}
                        style={{
                          width: '100%',
                          padding: '6px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '14px'
                        }}
                      >
                        <option value="low">Low (1 cascade, 2048px, 3000m)</option>
                        <option value="medium">Medium (3 cascades, 2048px, 4000m)</option>
                        <option value="high">High (3 cascades, 4096px, 5000m)</option>
                      </select>
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Cascaded Shadow Maps - better quality at different distances
                      </small>
                    </label>
                  )}

                  {/* CSM Shadow Radius Control */}
                  {csmSystem && (
                    <label>
                      <span>Shadow Softness (CSM)</span>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.1"
                          value={csmShadowRadius}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value)
                            setCsmShadowRadius(newValue)
                          }}
                          className="slider"
                        />
                        <span className="slider-value">{csmShadowRadius.toFixed(1)}</span>
                      </div>
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Shadow blur radius: 0 = sharp shadows, higher = softer shadows
                      </small>
                    </label>
                  )}

                  {/* Sun Intensity Control */}
                  {sunLight && csmSystem && (
                    <label>
                      <span>Sun Intensity</span>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.1"
                          value={sunLight.intensity}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value)
                            updateDirectionalLight(sunLight.id, { intensity: newValue })
                            // Update CSM light intensity
                            csmSystem.setLightIntensity(newValue)
                          }}
                          className="slider"
                        />
                        <span className="slider-value">{sunLight.intensity.toFixed(1)}</span>
                      </div>
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Controls sun light intensity (affects lighting brightness)
                      </small>
                    </label>
                  )}

                  {/* Sun Color Control */}
                  {sunLight && csmSystem && (
                    <label>
                      <span>Sun Color</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                        <input
                          type="color"
                          value={sunLight.color}
                          onChange={(e) => {
                            const color = e.target.value
                            updateDirectionalLight(sunLight.id, { color })
                            // Update CSM light color
                            const colorObj = new THREE.Color(color)
                            csmSystem.setLightColor(colorObj)
                          }}
                          style={{ width: '50px', height: '30px', cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={sunLight.color}
                          onChange={(e) => {
                            const color = e.target.value
                            updateDirectionalLight(sunLight.id, { color })
                            const colorObj = new THREE.Color(color)
                            csmSystem.setLightColor(colorObj)
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '4px',
                            color: 'white',
                            fontSize: '12px'
                          }}
                        />
                      </div>
                      <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                        Controls sun light color (atmospheric sun color)
                      </small>
                    </label>
                  )}

                  {/* Sun Direction Control */}
                  {sunLight && sunLight.target && csmSystem && (
                    <div className="position-controls">
                      <h6>Sun Direction (Manual Override)</h6>
                      <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                        Manually override sun direction. Light points from position toward target.
                      </small>
                      <label>
                        <span>X:</span>
                        <NumberInput
                          value={sunLight.target.x ?? 0}
                          onChange={(value) => {
                            const newTarget = { ...sunLight.target!, x: value }
                            updateDirectionalLight(sunLight.id, { target: newTarget })
                            // Calculate direction vector for CSM
                            const dir = {
                              x: newTarget.x - sunLight.position.x,
                              y: newTarget.y - sunLight.position.y,
                              z: newTarget.z - sunLight.position.z
                            }
                            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
                            if (len > 0) {
                              csmSystem.setLightDirection(new THREE.Vector3(dir.x / len, dir.y / len, dir.z / len))
                            }
                          }}
                          step={1}
                          decimals={1}
                        />
                      </label>
                      <label>
                        <span>Y:</span>
                        <NumberInput
                          value={sunLight.target.y ?? 0}
                          onChange={(value) => {
                            const newTarget = { ...sunLight.target!, y: value }
                            updateDirectionalLight(sunLight.id, { target: newTarget })
                            const dir = {
                              x: newTarget.x - sunLight.position.x,
                              y: newTarget.y - sunLight.position.y,
                              z: newTarget.z - sunLight.position.z
                            }
                            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
                            if (len > 0) {
                              csmSystem.setLightDirection(new THREE.Vector3(dir.x / len, dir.y / len, dir.z / len))
                            }
                          }}
                          step={1}
                          decimals={1}
                        />
                      </label>
                      <label>
                        <span>Z:</span>
                        <NumberInput
                          value={sunLight.target.z ?? 0}
                          onChange={(value) => {
                            const newTarget = { ...sunLight.target!, z: value }
                            updateDirectionalLight(sunLight.id, { target: newTarget })
                            const dir = {
                              x: newTarget.x - sunLight.position.x,
                              y: newTarget.y - sunLight.position.y,
                              z: newTarget.z - sunLight.position.z
                            }
                            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
                            if (len > 0) {
                              csmSystem.setLightDirection(new THREE.Vector3(dir.x / len, dir.y / len, dir.z / len))
                            }
                          }}
                          step={1}
                          decimals={1}
                        />
                      </label>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* Lights Section */}
        <div className="lighting-section">
          <div className="section-header">
            <h4>💡 Lights{streetsGLIframeOverlay && streetsGLBridge ? ' (Additional)' : ''}</h4>
            <select
              onChange={(e) => {
                const type = e.target.value as LightType
                if (type) {
                  handleAddLight(type)
                  e.target.value = '' // Reset dropdown
                }
              }}
              defaultValue=""
              style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: '#252525', color: '#e0e0e0', cursor: 'pointer' }}
            >
              <option value="" disabled>+ Add Light...</option>
              <option value="point">Point Light</option>
              <option value="spot">Spot Light</option>
              <option value="rectarea">Rect Area Light</option>
              <option value="hemisphere">Hemisphere Light</option>
              <option value="directional">Directional Light</option>
            </select>
          </div>

          {/* Light List (hide the Sun from this list) */}
          <div className="light-list">
            {directionalLights
              .filter((l) => !l.isSun)
              .map((light) => (
              <div
                key={light.id}
                className={`light-item ${selectedLightId === light.id ? 'active' : ''}`}
                onClick={() => handleLightClick(light.id)}
              >
                <div className="light-item-header">
                  <span className="light-name">
                    {light.name}
                  </span>
                  <div className="light-item-actions">
                    {directionalLights.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveLight(light.id)
                        }}
                        className="button-icon"
                        title="Remove Light"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                <div className="light-item-preview">
                  <span className={light.enabled ? 'light-enabled' : 'light-disabled'}>
                    {light.enabled ? '●' : '○'} {light.intensity.toFixed(1)}
                    {light.type && ` (${light.type})`}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Selected Light Controls - Only show for non-sun lights */}
          {selectedLight && !selectedLight.isSun && (
            <div className="light-controls">
              <h5>{selectedLight.name} Controls</h5>
              
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={selectedLight.name}
                  onChange={(e) => updateDirectionalLight(selectedLight.id, { name: e.target.value })}
                />
              </label>

              <label>
                <span>Enabled</span>
                <input
                  type="checkbox"
                  checked={selectedLight.enabled}
                  onChange={(e) => updateDirectionalLight(selectedLight.id, { enabled: e.target.checked })}
                />
              </label>

              <label>
                <span>Intensity</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={selectedLight.intensity}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value)
                      trackSliderInteraction('Light Intensity', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { intensity: newValue }))
                    }}
                    className="slider"
                  />
                  <span className="slider-value">{selectedLight.intensity.toFixed(1)}</span>
                </div>
              </label>

              <label>
                <span>Color</span>
                <input
                  type="color"
                  value={selectedLight.color}
                  onChange={(e) => updateDirectionalLight(selectedLight.id, { color: e.target.value })}
                />
              </label>

              <label>
                <span>Cast Shadows</span>
                <input
                  type="checkbox"
                  checked={selectedLight.castShadow}
                  onChange={(e) => updateDirectionalLight(selectedLight.id, { castShadow: e.target.checked })}
                />
              </label>

              {(selectedLight.type === 'directional' || !selectedLight.type) && (
                <label>
                  <span>Shadow Softness</span>
                  <div className="slider-container">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.1"
                      value={selectedLightShadowRadius}
                      disabled={!selectedLight.castShadow}
                      onChange={(e) => {
                        const newValue = parseFloat(e.target.value)
                        trackSliderInteraction('Shadow Softness', newValue, 'LightingPanel', () =>
                          updateDirectionalLight(selectedLight.id, { shadowRadius: newValue })
                        )
                      }}
                      className="slider"
                    />
                    <span className="slider-value">{selectedLightShadowRadius.toFixed(1)}</span>
                  </div>
                  <small>Lower values produce sharper, tighter shadows.</small>
                </label>
              )}

              {/* Physical Light Properties */}
              {(selectedLight.type === 'point' || selectedLight.type === 'spot') && (
                <>
                  <label>
                    <span>Distance</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="500"
                        step="10"
                        value={selectedLight.distance ?? 100}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('Light Distance', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { distance: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{selectedLight.distance ?? 100}</span>
                    </div>
                    <small>Distance at which light intensity reaches zero (0 = infinite range)</small>
                  </label>

                  <label>
                    <span>Decay</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.1"
                        value={selectedLight.decay ?? 2}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('Light Decay', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { decay: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{(selectedLight.decay ?? 2).toFixed(1)}</span>
                    </div>
                    <small>2 = physically realistic (inverse square law)</small>
                  </label>

                  <label>
                    <span>Power (lumens)</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="5000"
                        step="100"
                        value={selectedLight.power ?? 1000}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('Light Power', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { power: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{selectedLight.power ?? 1000}</span>
                    </div>
                  </label>
                </>
              )}

              {/* Spot Light Specific */}
              {selectedLight.type === 'spot' && (
                <>
                  <label>
                    <span>Angle (degrees)</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="90"
                        step="1"
                        value={((selectedLight.angle ?? Math.PI / 6) * 180 / Math.PI)}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value) * Math.PI / 180
                          trackSliderInteraction('Light Angle', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { angle: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{((selectedLight.angle ?? Math.PI / 6) * 180 / Math.PI).toFixed(0)}°</span>
                    </div>
                  </label>

                  <label>
                    <span>Penumbra</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedLight.penumbra ?? 0.2}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('Light Penumbra', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { penumbra: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{(selectedLight.penumbra ?? 0.2).toFixed(2)}</span>
                    </div>
                    <small>Soft edge of spotlight cone (0-1)</small>
                  </label>

                  {selectedLight.target && (
                    <div className="position-controls">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h6>Target Position</h6>
                        <button
                          onClick={() => {
                            // Reset target to point straight down from light position
                            const lightPos = selectedLight.position
                            updateDirectionalLight(selectedLight.id, {
                              target: { x: lightPos.x, y: lightPos.y - 10, z: lightPos.z }
                            })
                          }}
                          className="button-secondary"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          title="Reset target to point straight down"
                        >
                          Reset Down
                        </button>
                      </div>
                      <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                        Controls where the spotlight points. The light cone extends from the light position toward the target.
                      </small>
                      <label>
                        <span>X:</span>
                        <NumberInput
                          value={selectedLight.target.x ?? 0}
                          onChange={(value) => updateDirectionalLight(selectedLight.id, {
                            target: { ...selectedLight.target!, x: value }
                          })}
                          step={1}
                          decimals={1}
                        />
                      </label>
                      <label>
                        <span>Y:</span>
                        <NumberInput
                          value={selectedLight.target.y ?? 0}
                          onChange={(value) => updateDirectionalLight(selectedLight.id, {
                            target: { ...selectedLight.target!, y: value }
                          })}
                          step={1}
                          decimals={1}
                        />
                      </label>
                      <label>
                        <span>Z:</span>
                        <NumberInput
                          value={selectedLight.target.z ?? 0}
                          onChange={(value) => updateDirectionalLight(selectedLight.id, {
                            target: { ...selectedLight.target!, z: value }
                          })}
                          step={1}
                          decimals={1}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* RectArea Light Specific */}
              {selectedLight.type === 'rectarea' && (
                <>
                  <label>
                    <span>Width</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0.1"
                        max="50"
                        step="0.1"
                        value={selectedLight.width ?? 10}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('Light Width', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { width: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{(selectedLight.width ?? 10).toFixed(1)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Height</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0.1"
                        max="50"
                        step="0.1"
                        value={selectedLight.height ?? 10}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('Light Height', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { height: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{(selectedLight.height ?? 10).toFixed(1)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Power (lumens)</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="5000"
                        step="100"
                        value={selectedLight.power ?? 1000}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          trackSliderInteraction('Light Power', newValue, 'LightingPanel', () => updateDirectionalLight(selectedLight.id, { power: newValue }))
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{selectedLight.power ?? 1000}</span>
                    </div>
                  </label>

                  {selectedLight.target && (
                    <div className="position-controls">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h6>Target Position</h6>
                        <button
                          onClick={() => {
                            // Reset target to point straight down from light position
                            const lightPos = selectedLight.position
                            updateDirectionalLight(selectedLight.id, {
                              target: { x: lightPos.x, y: lightPos.y - 10, z: lightPos.z }
                            })
                          }}
                          className="button-secondary"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          title="Reset target to point straight down"
                        >
                          Reset Down
                        </button>
                      </div>
                      <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                        Controls where the rectangular area light points. The light panel rotates to face this target position.
                      </small>
                      <label>
                        <span>X:</span>
                        <input
                          type="number"
                          value={selectedLight.target.x ?? 0}
                          onChange={(e) => updateDirectionalLight(selectedLight.id, {
                            target: { ...selectedLight.target!, x: parseFloat(e.target.value) || 0 }
                          })}
                          step="1"
                        />
                      </label>
                      <label>
                        <span>Y:</span>
                        <input
                          type="number"
                          value={selectedLight.target.y ?? 0}
                          onChange={(e) => updateDirectionalLight(selectedLight.id, {
                            target: { ...selectedLight.target!, y: parseFloat(e.target.value) || 0 }
                          })}
                          step="1"
                        />
                      </label>
                      <label>
                        <span>Z:</span>
                        <input
                          type="number"
                          value={selectedLight.target.z ?? 0}
                          onChange={(e) => updateDirectionalLight(selectedLight.id, {
                            target: { ...selectedLight.target!, z: parseFloat(e.target.value) || 0 }
                          })}
                          step="1"
                        />
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* Hemisphere Light Specific */}
              {selectedLight.type === 'hemisphere' && (
                <>
                  <label>
                    <span>Ground Color</span>
                    <input
                      type="color"
                      value={selectedLight.groundColor || '#444444'}
                      onChange={(e) => updateDirectionalLight(selectedLight.id, { groundColor: e.target.value })}
                    />
                  </label>
                  <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                    Hemisphere lights simulate ambient sky and ground lighting. Position doesn't affect direction - they illuminate from all angles.
                  </small>
                </>
              )}

              {/* Directional Light Target Controls */}
              {(selectedLight.type === 'directional' || !selectedLight.type) && (
                <div className="position-controls">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h6>Target Position (Light Direction)</h6>
                    <button
                      onClick={() => {
                        // Reset target to point straight down from light position
                        const lightPos = selectedLight.position
                        updateDirectionalLight(selectedLight.id, {
                          target: { x: lightPos.x, y: lightPos.y - 10, z: lightPos.z }
                        })
                      }}
                      className="button-secondary"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      title="Reset target to point straight down"
                    >
                      Reset Down
                    </button>
                  </div>
                  <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                    Controls the direction the light points. The light rotates around its position to face the target. 
                    Directional lights work like sunlight - they point from their position toward the target.
                  </small>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ minWidth: '20px' }}>All:</span>
                      <NumberInput
                        value={(selectedLight.target?.x ?? 0)}
                        onChange={(value) => updateDirectionalLight(selectedLight.id, {
                          target: { x: value, y: value, z: value }
                        })}
                        step={1}
                        decimals={1}
                        placeholder="Scale all"
                      />
                    </label>
                    <button
                      onClick={() => {
                        const currentValue = selectedLight.target?.x ?? 0
                        updateDirectionalLight(selectedLight.id, {
                          target: { x: currentValue, y: currentValue, z: currentValue }
                        })
                      }}
                      className="button-secondary"
                      style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                      title="Set all values to X value"
                    >
                      Sync All
                    </button>
                  </div>
                  <label>
                    <span>X:</span>
                    <NumberInput
                      value={selectedLight.target?.x ?? 0}
                      onChange={(value) => updateDirectionalLight(selectedLight.id, {
                        target: { x: value, y: selectedLight.target?.y ?? 0, z: selectedLight.target?.z ?? 0 }
                      })}
                      step={1}
                      decimals={1}
                    />
                  </label>
                  <label>
                    <span>Y:</span>
                    <NumberInput
                      value={selectedLight.target?.y ?? 0}
                      onChange={(value) => updateDirectionalLight(selectedLight.id, {
                        target: { x: selectedLight.target?.x ?? 0, y: value, z: selectedLight.target?.z ?? 0 }
                      })}
                      step={1}
                      decimals={1}
                    />
                  </label>
                  <label>
                    <span>Z:</span>
                    <NumberInput
                      value={selectedLight.target?.z ?? 0}
                      onChange={(value) => updateDirectionalLight(selectedLight.id, {
                        target: { x: selectedLight.target?.x ?? 0, y: selectedLight.target?.y ?? 0, z: value }
                      })}
                      step={1}
                      decimals={1}
                    />
                  </label>
                  <button
                    onClick={() => {
                      // Point target at origin (0, 0, 0)
                      updateDirectionalLight(selectedLight.id, {
                        target: { x: 0, y: 0, z: 0 }
                      })
                    }}
                    className="button-secondary"
                    style={{ fontSize: '11px', padding: '4px 8px', marginTop: '4px' }}
                    title="Point light at origin (0, 0, 0)"
                  >
                    Point at Origin
                  </button>
                </div>
              )}

              <div className="position-controls">
                <h6>Position</h6>
                {selectedLight.type === 'point' && (
                  <small style={{ display: 'block', color: '#888', marginBottom: '8px' }}>
                    Point lights are omnidirectional - they emit light in all directions from this position.
                  </small>
                )}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ minWidth: '20px' }}>All:</span>
                    <NumberInput
                      value={selectedLight.position.x}
                      onChange={(value) => updateDirectionalLight(selectedLight.id, {
                        position: { x: value, y: value, z: value }
                      })}
                      step={1}
                      decimals={1}
                      placeholder="Scale all"
                    />
                  </label>
                  <button
                    onClick={() => {
                      const currentValue = selectedLight.position.x
                      updateDirectionalLight(selectedLight.id, {
                        position: { x: currentValue, y: currentValue, z: currentValue }
                      })
                    }}
                    className="button-secondary"
                    style={{ fontSize: '11px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                    title="Set all values to X value"
                  >
                    Sync All
                  </button>
                </div>
                <label>
                  <span>X:</span>
                  <NumberInput
                    value={selectedLight.position.x}
                    onChange={(value) => updateDirectionalLight(selectedLight.id, {
                      position: { ...selectedLight.position, x: value }
                    })}
                    step={1}
                    decimals={1}
                  />
                </label>
                <label>
                  <span>Y:</span>
                  <NumberInput
                    value={selectedLight.position.y}
                    onChange={(value) => updateDirectionalLight(selectedLight.id, {
                      position: { ...selectedLight.position, y: value }
                    })}
                    step={1}
                    decimals={1}
                  />
                </label>
                <label>
                  <span>Z:</span>
                  <NumberInput
                    value={selectedLight.position.z}
                    onChange={(value) => updateDirectionalLight(selectedLight.id, {
                      position: { ...selectedLight.position, z: value }
                    })}
                    step={1}
                    decimals={1}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

    </div>
  )
}
