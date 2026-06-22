import { useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { loadLUTFromFile } from '../viewer/postprocessing/LUTLoader'
import { trackSliderInteraction } from '../utils/sliderTracker'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './RenderingQualityPanel.css'

const PANEL_WIDTH = 360

export default function RenderingQualityPanel() {
  const lutFileInputRef = useRef<HTMLInputElement>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const stackingOffset = usePanelStacking({ panelId: 'renderingQuality', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'renderingQuality'
    }
  )
  const {
    showRenderingQualityPanel,
    toggleRenderingQualityPanel,
    pixelRatio,
    maxPixelRatio,
    textureAnisotropy,
    useLogarithmicDepthBuffer,
    useHighPerformanceGPU,
    preferCPU,
    vsyncEnabled,
    maxFPS,
    upscalingEnabled,
    upscalingQuality,
    setPixelRatio,
    setMaxPixelRatio,
    setTextureAnisotropy,
    setUseLogarithmicDepthBuffer,
    setUseHighPerformanceGPU,
    setPreferCPU,
    setVsyncEnabled,
    setMaxFPS,
    setUpscalingEnabled,
    setUpscalingQuality,
    postProcessingEnabled,
    bloomEnabled,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    lutEnabled,
    lutTexture,
    lutIntensity,
    anamorphicEnabled,
    anamorphicIntensity,
    anamorphicThreshold,
    anamorphicScale,
    anamorphicColor,
    setPostProcessingEnabled,
    setBloomEnabled,
    setBloomStrength,
    setBloomRadius,
    setBloomThreshold,
    setLutEnabled,
    setLutTexture,
    setLutIntensity,
    setAnamorphicEnabled,
    setAnamorphicIntensity,
    setAnamorphicThreshold,
    setAnamorphicScale,
    setAnamorphicColor,
    sssEnabled,
    sssIntensity,
    sssMaxRadius,
    sssSamples,
    sssRayDistance,
    sssThickness,
    sssBias,
    sssLightDirectionX,
    sssLightDirectionY,
    sssLightDirectionZ,
    setSssEnabled,
    setSssIntensity,
    setSssMaxRadius,
    setSssSamples,
    setSssRayDistance,
    setSssThickness,
    setSssBias,
    setSssLightDirection,
    ssrEnabled,
    ssrIntensity,
    ssrThickness,
    ssrMaxDistance,
    ssrMaxSteps,
    ssrMaxBinarySearchSteps,
    ssrRoughnessFade,
    ssrFadeDistance,
    ssrFadeMargin,
    setSsrEnabled,
    setSsrIntensity,
    setSsrThickness,
    setSsrMaxDistance,
    setSsrMaxSteps,
    setSsrMaxBinarySearchSteps,
    setSsrRoughnessFade,
    setSsrFadeDistance,
    setSsrFadeMargin,
    toneMappingType,
    toneMappingExposure,
    toneMappingWhitePoint,
    setToneMappingType,
    setToneMappingExposure,
    setToneMappingWhitePoint,
    colorGradingEnabled,
    colorGradingExposure,
    colorGradingContrast,
    colorGradingHighlights,
    colorGradingShadows,
    colorGradingWhites,
    colorGradingBlacks,
    colorGradingHue,
    colorGradingSaturation,
    colorGradingVibrance,
    colorGradingGamma,
    setColorGradingEnabled,
    setColorGradingExposure,
    setColorGradingContrast,
    setColorGradingHighlights,
    setColorGradingShadows,
    setColorGradingWhites,
    setColorGradingBlacks,
    setColorGradingHue,
    setColorGradingSaturation,
    setColorGradingVibrance,
    setColorGradingGamma,
    xButtonColor,
    xButtonSize
  } = useAppStore()

  const handleLUTFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const lutTexture = await loadLUTFromFile(file)
      setLutTexture(lutTexture)
      setLutEnabled(true)
    } catch (error) {
      console.error('Failed to load LUT file:', error)
      alert(`Failed to load LUT file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Reset input
    if (lutFileInputRef.current) {
      lutFileInputRef.current.value = ''
    }
  }

  const handleRemoveLUT = () => {
    if (lutTexture) {
      lutTexture.dispose()
    }
    setLutTexture(null)
    setLutEnabled(false)
  }

  const handleApplyLumenPreset = () => {
    // Enable core post-processing
    setPostProcessingEnabled(true)

    // Bloom (emissive glow)
    setBloomEnabled(true)
    setBloomStrength(1.2)
    setBloomRadius(0.4)
    setBloomThreshold(0.85)

    // Screen-space shadows / contact shadows (Lumen-style feel)
    setSssEnabled(true)
    setSssIntensity(0.8)
    setSssMaxRadius(3.0)
    setSssSamples(8)
    setSssRayDistance(50)
    setSssThickness(0.02)
    setSssBias(0.01)

    // Screen-space reflections
    setSsrEnabled(true)
    setSsrIntensity(1.0)
    setSsrThickness(0.01)
    setSsrMaxDistance(80)
    setSsrMaxSteps(20)
    setSsrMaxBinarySearchSteps(8)
    setSsrRoughnessFade(1.0)
    setSsrFadeDistance(15.0)
    setSsrFadeMargin(0.05)

    // Tone mapping (ACES Filmic, slightly brighter)
    setToneMappingType('aces-filmic')
    setToneMappingExposure(1.2)
    setToneMappingWhitePoint(1.0)

    // Color grading enabled, neutral settings (user can tweak)
    setColorGradingEnabled(true)
    setColorGradingExposure(0.0)
    setColorGradingContrast(0)
    setColorGradingHighlights(0)
    setColorGradingShadows(0)
    setColorGradingWhites(0)
    setColorGradingBlacks(0)
    setColorGradingHue(0)
    setColorGradingSaturation(0)
    setColorGradingVibrance(0)
    setColorGradingGamma(1.0)
  }

  if (!showRenderingQualityPanel) return null

  return (
    <div
      ref={panelRef}
      className={`rendering-quality-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="rendering-quality-panel-header" onMouseDown={handleMouseDown}>
        <h3>⚙️ Rendering Quality</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button 
            className="close-button" 
            onClick={toggleRenderingQualityPanel}
            style={{
              color: xButtonColor,
              fontSize: `${xButtonSize}px`,
              width: `${xButtonSize + 8}px`,
              height: `${xButtonSize + 8}px`
            }}
          >
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
      <div className="rendering-quality-panel-content">
        <label>
          <span>Pixel Ratio</span>
          <div className="slider-container">
            <input
              type="range"
              min="-1"
              max="4"
              step="0.5"
              value={pixelRatio >= 0 ? pixelRatio : -1}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                setPixelRatio(value === -1 ? -1 : value)
              }}
              className="slider"
            />
            <span className="slider-value">
              {pixelRatio >= 0 ? pixelRatio.toFixed(1) : 'Auto'}
            </span>
          </div>
          <small>
            -1 = Auto (device pixel ratio). Higher values = better quality but lower performance
          </small>
        </label>

        <label>
          <span>Max Pixel Ratio (Auto Mode)</span>
          <div className="slider-container">
            <input
              type="range"
              min="1"
              max="4"
              step="0.5"
              value={maxPixelRatio}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value)
                trackSliderInteraction('Max Pixel Ratio', newValue, 'RenderingQualityPanel', () => setMaxPixelRatio(newValue))
              }}
              className="slider"
            />
            <span className="slider-value">{maxPixelRatio.toFixed(1)}</span>
          </div>
          <small>
            Maximum pixel ratio when in Auto mode (caps device pixel ratio)
          </small>
        </label>

        <label>
          <span>Texture Anisotropy</span>
          <div className="slider-container">
            <input
              type="range"
              min="-1"
              max="16"
              step="1"
              value={textureAnisotropy >= 0 ? textureAnisotropy : -1}
              onChange={(e) => {
                const value = parseInt(e.target.value)
                setTextureAnisotropy(value === -1 ? -1 : value)
              }}
              className="slider"
            />
            <span className="slider-value">
              {textureAnisotropy >= 0 ? textureAnisotropy : 'Max'}
            </span>
          </div>
          <small>
            -1 = Maximum available. Higher values improve texture quality at angles (1-16)
          </small>
        </label>

        <label>
          <span>Logarithmic Depth Buffer</span>
          <input
            type="checkbox"
            checked={useLogarithmicDepthBuffer}
            onChange={(e) => setUseLogarithmicDepthBuffer(e.target.checked)}
          />
          <small>
            Better depth precision for large scenes (requires reload)
          </small>
        </label>

        <label>
          <span>High Performance GPU</span>
          <input
            type="checkbox"
            checked={useHighPerformanceGPU}
            onChange={(e) => {
              setUseHighPerformanceGPU(e.target.checked)
              // Disable preferCPU when enabling high performance GPU
              if (e.target.checked && preferCPU) {
                setPreferCPU(false)
              }
            }}
            disabled={preferCPU}
          />
          <small>
            Prefer dedicated GPU over integrated graphics (requires reload)
          </small>
        </label>

        <label>
          <span>Prefer CPU / Software Rendering</span>
          <input
            type="checkbox"
            checked={preferCPU}
            onChange={(e) => {
              setPreferCPU(e.target.checked)
              // Disable high performance GPU when enabling CPU preference
              if (e.target.checked && useHighPerformanceGPU) {
                setUseHighPerformanceGPU(false)
              }
            }}
            disabled={useHighPerformanceGPU}
          />
          <small>
            Prefer CPU/software rendering over GPU (requires reload). Useful for compatibility or to reduce GPU load. May be slower but more compatible.
          </small>
        </label>

        <label>
          <span>VSync</span>
          <input
            type="checkbox"
            checked={vsyncEnabled}
            onChange={(e) => setVsyncEnabled(e.target.checked)}
          />
          <small>
            Sync with display refresh rate to prevent screen tearing
          </small>
        </label>

        <label>
          <span>Max FPS</span>
          <div className="slider-container">
            <input
              type="range"
              min="-1"
              max="144"
              step="1"
              value={maxFPS}
              onChange={(e) => {
                const newValue = parseInt(e.target.value)
                trackSliderInteraction('Max FPS', newValue, 'RenderingQualityPanel', () => setMaxFPS(newValue))
              }}
              className="slider"
            />
            <span className="slider-value">
              {maxFPS === -1 ? 'VSync' : maxFPS === 0 ? 'Unlimited' : maxFPS}
            </span>
          </div>
          <small>
            -1 = Use VSync, 0 = Unlimited FPS, &gt;0 = FPS cap
          </small>
        </label>

        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '20px', marginTop: '10px' }}>
          <h4 style={{ color: 'white', fontSize: '14px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>AI Upscaling (DLSS-like)</h4>
          <small style={{ display: 'block', color: '#888', marginBottom: '16px' }}>
            ⚠️ Note: Actual NVIDIA DLSS is not available in web browsers. This simulates DLSS by rendering at lower resolution and upscaling.
          </small>
          
          <label>
            <span>Enable Upscaling</span>
            <input
              type="checkbox"
              checked={upscalingEnabled}
              onChange={(e) => setUpscalingEnabled(e.target.checked)}
            />
          </label>

          {upscalingEnabled && (
            <label>
              <span>Render Scale</span>
              <div className="slider-container">
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={upscalingQuality}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value)
                    trackSliderInteraction('Upscaling Quality', newValue, 'RenderingQualityPanel', () => setUpscalingQuality(newValue))
                  }}
                  className="slider"
                />
                <span className="slider-value">{upscalingQuality}%</span>
              </div>
              <small>
                Render at {upscalingQuality}% resolution and upscale to 100% (higher = better quality, lower = more FPS)
              </small>
            </label>
          )}
        </div>

        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '20px', marginTop: '10px' }}>
          <h4 style={{ color: 'white', fontSize: '14px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Post-Processing</h4>
          
          <label>
            <span>Enable Post-Processing</span>
            <input
              type="checkbox"
              checked={postProcessingEnabled}
              onChange={(e) => setPostProcessingEnabled(e.target.checked)}
            />
            <small>
              Enable post-processing effects (Bloom, etc.)
            </small>
          </label>

          <div style={{ marginTop: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              onClick={handleApplyLumenPreset}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'white',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Use Lumen / Twinmotion preset
            </button>
            <small style={{ display: 'block', marginTop: '4px', color: '#aaa' }}>
              Enables ACES tone mapping, bloom, screen-space shadows and reflections similar to Twinmotion / UE5 Lumen preview.
            </small>
          </div>

          {postProcessingEnabled && (
            <>
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Bloom (Emissive Glow)</h5>
                
                <label>
                  <span>Enable Bloom</span>
                  <input
                    type="checkbox"
                    checked={bloomEnabled}
                    onChange={(e) => setBloomEnabled(e.target.checked)}
                  />
                  <small>
                    Adds glow effect to bright/emissive materials
                  </small>
                </label>

                {bloomEnabled && (
                  <>
                    <label>
                      <span>Bloom Strength</span>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.1"
                          value={bloomStrength}
                          onChange={(e) => setBloomStrength(parseFloat(e.target.value))}
                          className="slider"
                        />
                        <span className="slider-value">{bloomStrength.toFixed(1)}</span>
                      </div>
                      <small>
                        Intensity of the bloom effect (0-3)
                      </small>
                    </label>

                    <label>
                      <span>Bloom Radius</span>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={bloomRadius}
                          onChange={(e) => setBloomRadius(parseFloat(e.target.value))}
                          className="slider"
                        />
                        <span className="slider-value">{bloomRadius.toFixed(2)}</span>
                      </div>
                      <small>
                        Size of the bloom effect (0-1)
                      </small>
                    </label>

                    <label>
                      <span>Bloom Threshold</span>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={bloomThreshold}
                          onChange={(e) => setBloomThreshold(parseFloat(e.target.value))}
                          className="slider"
                        />
                        <span className="slider-value">{bloomThreshold.toFixed(2)}</span>
                      </div>
                      <small>
                        Brightness threshold for bloom (higher = only very bright areas glow)
                      </small>
                    </label>
                  </>
                )}

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>3D LUT (Color Grading)</h5>
                  
                  <label>
                    <span>Enable LUT</span>
                    <input
                      type="checkbox"
                      checked={lutEnabled}
                      onChange={(e) => setLutEnabled(e.target.checked)}
                      disabled={!lutTexture}
                    />
                    <small>
                      Apply color grading using a 3D Look-Up Table
                    </small>
                  </label>

                  <label>
                    <span>Load LUT File</span>
                    <input
                      ref={lutFileInputRef}
                      type="file"
                      accept=".cube,.3dl"
                      onChange={handleLUTFileChange}
                      style={{ color: 'white', marginTop: '8px' }}
                    />
                    <small>
                      Load a .cube or .3dl LUT file for color grading
                    </small>
                  </label>

                  {lutTexture && (
                    <>
                      <div style={{ marginTop: '12px', marginBottom: '12px', padding: '8px', backgroundColor: 'rgba(0, 0, 0, 0.2)', borderRadius: '4px' }}>
                        <small style={{ color: '#aaa' }}>
                          LUT loaded (Size: {lutTexture.userData.lutSize || 'unknown'})
                        </small>
                        <button
                          onClick={handleRemoveLUT}
                          style={{
                            marginLeft: '8px',
                            padding: '4px 8px',
                            backgroundColor: 'rgba(255, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 0, 0, 0.5)',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      {lutEnabled && (
                        <label>
                          <span>LUT Intensity</span>
                          <div className="slider-container">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={lutIntensity}
                              onChange={(e) => setLutIntensity(parseFloat(e.target.value))}
                              className="slider"
                            />
                            <span className="slider-value">{lutIntensity.toFixed(2)}</span>
                          </div>
                          <small>
                            Blend factor between original and LUT color (0 = original, 1 = full LUT)
                          </small>
                        </label>
                      )}
                    </>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Anamorphic Lens Flares</h5>
                  
                  <label>
                    <span>Enable Anamorphic Flares</span>
                    <input
                      type="checkbox"
                      checked={anamorphicEnabled}
                      onChange={(e) => setAnamorphicEnabled(e.target.checked)}
                    />
                    <small>
                      Adds horizontal streaks of light for cinematic lens flare effect
                    </small>
                  </label>

                  {anamorphicEnabled && (
                    <>
                      <label>
                        <span>Intensity</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="3"
                            step="0.1"
                            value={anamorphicIntensity}
                            onChange={(e) => setAnamorphicIntensity(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{anamorphicIntensity.toFixed(1)}</span>
                        </div>
                        <small>
                          Intensity of the lens flare effect (0-3)
                        </small>
                      </label>

                      <label>
                        <span>Threshold</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={anamorphicThreshold}
                            onChange={(e) => setAnamorphicThreshold(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{anamorphicThreshold.toFixed(2)}</span>
                        </div>
                        <small>
                          Brightness threshold for flare generation (higher = only very bright areas flare)
                        </small>
                      </label>

                      <label>
                        <span>Scale</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={anamorphicScale}
                            onChange={(e) => setAnamorphicScale(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{anamorphicScale.toFixed(1)}</span>
                        </div>
                        <small>
                          Horizontal spread of the flare streaks (0.1-5)
                        </small>
                      </label>

                      <label>
                        <span>Color</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                          <input
                            type="color"
                            value={anamorphicColor}
                            onChange={(e) => setAnamorphicColor(e.target.value)}
                            style={{ width: '50px', height: '30px', cursor: 'pointer' }}
                          />
                          <input
                            type="text"
                            value={anamorphicColor}
                            onChange={(e) => setAnamorphicColor(e.target.value)}
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
                        <small>
                          Color tint of the lens flare (warm colors work best)
                        </small>
                      </label>
                    </>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Screen-Space Shadows (SSS)</h5>
                  
                  <label>
                    <span>Enable SSS</span>
                    <input
                      type="checkbox"
                      checked={sssEnabled}
                      onChange={(e) => setSssEnabled(e.target.checked)}
                    />
                    <small>
                      Adds real-time shadows by tracing rays in screen space (can complement shadow maps)
                    </small>
                  </label>

                  {sssEnabled && (
                    <>
                      <label>
                        <span>Intensity</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.01"
                            value={sssIntensity}
                            onChange={(e) => setSssIntensity(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{sssIntensity.toFixed(2)}</span>
                        </div>
                        <small>
                          Strength of the shadow effect (0-2)
                        </small>
                      </label>

                      <label>
                        <span>Max Radius</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0.1"
                            max="20"
                            step="0.1"
                            value={sssMaxRadius}
                            onChange={(e) => setSssMaxRadius(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{sssMaxRadius.toFixed(1)}</span>
                        </div>
                        <small>
                          Maximum screen-space search radius (0.1-20)
                        </small>
                      </label>

                      <label>
                        <span>Samples</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="64"
                            step="1"
                            value={sssSamples}
                            onChange={(e) => setSssSamples(parseInt(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{sssSamples}</span>
                        </div>
                        <small>
                          Number of ray samples (higher = better quality, lower = better performance)
                        </small>
                      </label>

                      <label>
                        <span>Ray Distance</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="200"
                            step="1"
                            value={sssRayDistance}
                            onChange={(e) => setSssRayDistance(parseInt(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{sssRayDistance}</span>
                        </div>
                        <small>
                          Maximum distance to trace shadows (1-200)
                        </small>
                      </label>

                      <label>
                        <span>Thickness</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0.001"
                            max="1"
                            step="0.001"
                            value={sssThickness}
                            onChange={(e) => setSssThickness(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{sssThickness.toFixed(3)}</span>
                        </div>
                        <small>
                          Shadow penumbra thickness (0.001-1)
                        </small>
                      </label>

                      <label>
                        <span>Bias</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={sssBias}
                            onChange={(e) => setSssBias(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{sssBias.toFixed(2)}</span>
                        </div>
                        <small>
                          Depth bias to prevent shadow acne (0-1)
                        </small>
                      </label>

                      <label>
                        <span>Light Direction X</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={sssLightDirectionX}
                            onChange={(e) => setSssLightDirection(parseFloat(e.target.value), sssLightDirectionY, sssLightDirectionZ)}
                            className="slider"
                          />
                          <span className="slider-value">{sssLightDirectionX.toFixed(2)}</span>
                        </div>
                        <small>
                          X component of light direction (-1 to 1)
                        </small>
                      </label>

                      <label>
                        <span>Light Direction Y</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={sssLightDirectionY}
                            onChange={(e) => setSssLightDirection(sssLightDirectionX, parseFloat(e.target.value), sssLightDirectionZ)}
                            className="slider"
                          />
                          <span className="slider-value">{sssLightDirectionY.toFixed(2)}</span>
                        </div>
                        <small>
                          Y component of light direction (-1 to 1, negative = down)
                        </small>
                      </label>

                      <label>
                        <span>Light Direction Z</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={sssLightDirectionZ}
                            onChange={(e) => setSssLightDirection(sssLightDirectionX, sssLightDirectionY, parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{sssLightDirectionZ.toFixed(2)}</span>
                        </div>
                        <small>
                          Z component of light direction (-1 to 1)
                        </small>
                      </label>
                    </>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Screen-Space Reflections (SSR)</h5>
                  
                  <label>
                    <span>Enable SSR</span>
                    <input
                      type="checkbox"
                      checked={ssrEnabled}
                      onChange={(e) => setSsrEnabled(e.target.checked)}
                    />
                    <small>
                      Adds real-time reflections by tracing rays in screen space
                    </small>
                  </label>

                  {ssrEnabled && (
                    <>
                      <label>
                        <span>Intensity</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.01"
                            value={ssrIntensity}
                            onChange={(e) => setSsrIntensity(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrIntensity.toFixed(2)}</span>
                        </div>
                        <small>
                          Strength of the reflection effect (0-2)
                        </small>
                      </label>

                      <label>
                        <span>Thickness</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0.001"
                            max="1"
                            step="0.001"
                            value={ssrThickness}
                            onChange={(e) => setSsrThickness(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrThickness.toFixed(3)}</span>
                        </div>
                        <small>
                          Ray intersection thickness (0.001-1)
                        </small>
                      </label>

                      <label>
                        <span>Max Distance</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="500"
                            step="1"
                            value={ssrMaxDistance}
                            onChange={(e) => setSsrMaxDistance(parseInt(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrMaxDistance}</span>
                        </div>
                        <small>
                          Maximum reflection ray distance (1-500)
                        </small>
                      </label>

                      <label>
                        <span>Max Steps</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="64"
                            step="1"
                            value={ssrMaxSteps}
                            onChange={(e) => setSsrMaxSteps(parseInt(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrMaxSteps}</span>
                        </div>
                        <small>
                          Maximum ray marching steps (higher = better quality, lower = better performance)
                        </small>
                      </label>

                      <label>
                        <span>Max Binary Search Steps</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="16"
                            step="1"
                            value={ssrMaxBinarySearchSteps}
                            onChange={(e) => setSsrMaxBinarySearchSteps(parseInt(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrMaxBinarySearchSteps}</span>
                        </div>
                        <small>
                          Binary search refinement steps (1-16)
                        </small>
                      </label>

                      <label>
                        <span>Roughness Fade</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={ssrRoughnessFade}
                            onChange={(e) => setSsrRoughnessFade(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrRoughnessFade.toFixed(2)}</span>
                        </div>
                        <small>
                          Fade reflections based on surface roughness (0-1)
                        </small>
                      </label>

                      <label>
                        <span>Fade Distance</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            value={ssrFadeDistance}
                            onChange={(e) => setSsrFadeDistance(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrFadeDistance.toFixed(1)}</span>
                        </div>
                        <small>
                          Distance at which reflections start fading (0-100)
                        </small>
                      </label>

                      <label>
                        <span>Fade Margin</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={ssrFadeMargin}
                            onChange={(e) => setSsrFadeMargin(parseFloat(e.target.value))}
                            className="slider"
                          />
                          <span className="slider-value">{ssrFadeMargin.toFixed(2)}</span>
                        </div>
                        <small>
                          Fade transition smoothness (0-1)
                        </small>
                      </label>
                    </>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Tone Mapping</h5>
                  
                  <label>
                    <span>Tone Mapping Type</span>
                    <select
                      value={toneMappingType}
                      onChange={(e) => setToneMappingType(e.target.value)}
                      style={{ width: '100%', padding: '6px', marginTop: '4px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px' }}
                    >
                      <option value="linear">Linear</option>
                      <option value="reinhard">Reinhard</option>
                      <option value="cineon">Cineon</option>
                      <option value="aces-filmic">ACES Filmic</option>
                      <option value="uncharted2">Uncharted 2</option>
                    </select>
                    <small>
                      Tone mapping algorithm (affects how HDR colors are mapped to display range)
                    </small>
                  </label>

                  <label>
                    <span>Exposure</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.01"
                        value={toneMappingExposure}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          if (!isNaN(newValue) && isFinite(newValue)) {
                            trackSliderInteraction('Tone Mapping Exposure', newValue, 'RenderingQualityPanel', () => setToneMappingExposure(newValue))
                          }
                        }}
                        className="slider"
                      />
                      <span className="slider-value">{toneMappingExposure.toFixed(2)}</span>
                    </div>
                    <small>
                      Overall scene exposure (0.1-5, lower = darker, higher = brighter)
                    </small>
                  </label>

                  {toneMappingType === 'reinhard' && (
                    <label>
                      <span>White Point</span>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0.5"
                          max="5"
                          step="0.01"
                          value={toneMappingWhitePoint}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value)
                            if (!isNaN(newValue) && isFinite(newValue)) {
                              trackSliderInteraction('Tone Mapping White Point', newValue, 'RenderingQualityPanel', () => setToneMappingWhitePoint(newValue))
                            }
                          }}
                          className="slider"
                        />
                        <span className="slider-value">{toneMappingWhitePoint.toFixed(2)}</span>
                      </div>
                      <small>
                        White point for Reinhard tone mapping (0.5-5, higher = brighter highlights)
                      </small>
                    </label>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', marginTop: '16px' }}>
                  <h5 style={{ color: 'white', fontSize: '13px', fontWeight: 600, marginTop: 0, marginBottom: '12px' }}>Color Grading</h5>
                  
                  <label>
                    <span>Enable Color Grading</span>
                    <input
                      type="checkbox"
                      checked={colorGradingEnabled}
                      onChange={(e) => setColorGradingEnabled(e.target.checked)}
                    />
                    <small>
                      Adjust overall scene appearance (exposure, contrast, highlights, shadows, etc.)
                    </small>
                  </label>

                  {colorGradingEnabled && (
                    <>
                      <label>
                        <span>Exposure</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-2"
                            max="2"
                            step="0.01"
                            value={colorGradingExposure}
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Exposure', newValue, 'RenderingQualityPanel', () => setColorGradingExposure(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingExposure.toFixed(2)}</span>
                        </div>
                        <small>
                          Overall brightness adjustment in stops (-2 to 2, 0 = neutral)
                        </small>
                      </label>

                      <label>
                        <span>Contrast</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={colorGradingContrast}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Contrast', newValue, 'RenderingQualityPanel', () => setColorGradingContrast(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingContrast}</span>
                        </div>
                        <small>
                          Increase or decrease contrast (-100 to 100, 0 = neutral)
                        </small>
                      </label>

                      <label>
                        <span>Highlights</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={colorGradingHighlights}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Highlights', newValue, 'RenderingQualityPanel', () => setColorGradingHighlights(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingHighlights}</span>
                        </div>
                        <small>
                          Adjust bright areas (-100 to 100, 0 = neutral, positive = brighter)
                        </small>
                      </label>

                      <label>
                        <span>Shadows</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={colorGradingShadows}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Shadows', newValue, 'RenderingQualityPanel', () => setColorGradingShadows(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingShadows}</span>
                        </div>
                        <small>
                          Adjust dark areas (-100 to 100, 0 = neutral, positive = brighter)
                        </small>
                      </label>

                      <label>
                        <span>Whites</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={colorGradingWhites}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Whites', newValue, 'RenderingQualityPanel', () => setColorGradingWhites(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingWhites}</span>
                        </div>
                        <small>
                          Adjust white point (-100 to 100, 0 = neutral, positive = brighter highlights)
                        </small>
                      </label>

                      <label>
                        <span>Blacks</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={colorGradingBlacks}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Blacks', newValue, 'RenderingQualityPanel', () => setColorGradingBlacks(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingBlacks}</span>
                        </div>
                        <small>
                          Adjust black point (-100 to 100, 0 = neutral, negative = darker shadows)
                        </small>
                      </label>

                      <label>
                        <span>Hue</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                            value={colorGradingHue}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Hue', newValue, 'RenderingQualityPanel', () => setColorGradingHue(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingHue}°</span>
                        </div>
                        <small>
                          Shift overall hue (-180 to 180 degrees, 0 = no shift)
                        </small>
                      </label>

                      <label>
                        <span>Saturation</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={colorGradingSaturation}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Saturation', newValue, 'RenderingQualityPanel', () => setColorGradingSaturation(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingSaturation}</span>
                        </div>
                        <small>
                          Adjust color intensity (-100 to 100, 0 = neutral, positive = more saturated)
                        </small>
                      </label>

                      <label>
                        <span>Vibrance</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            step="1"
                            value={colorGradingVibrance}
                            onChange={(e) => {
                              const newValue = parseInt(e.target.value, 10)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Vibrance', newValue, 'RenderingQualityPanel', () => setColorGradingVibrance(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingVibrance}</span>
                        </div>
                        <small>
                          Selective saturation boost that protects skin tones (-100 to 100, 0 = neutral)
                        </small>
                      </label>

                      <label>
                        <span>Gamma</span>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0.1"
                            max="3"
                            step="0.01"
                            value={colorGradingGamma}
                            onChange={(e) => {
                              const newValue = parseFloat(e.target.value)
                              if (!isNaN(newValue) && isFinite(newValue)) {
                                trackSliderInteraction('Color Grading Gamma', newValue, 'RenderingQualityPanel', () => setColorGradingGamma(newValue))
                              }
                            }}
                            className="slider"
                          />
                          <span className="slider-value">{colorGradingGamma.toFixed(2)}</span>
                        </div>
                        <small>
                          Gamma correction (0.1-3.0, 1.0 = neutral, lower = brighter, higher = darker)
                        </small>
                      </label>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

