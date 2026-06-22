import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './OSMGroundV2Panel.css'

const STREETS_GL_ALT_URL = 'http://localhost:8081'

export default function OSMGroundV2Panel() {
  const { 
    showOSMGroundV2Panel, 
    toggleOSMGroundV2Panel,
    streetsGLGroundLat,
    setStreetsGLGroundLat,
    streetsGLGroundLon,
    setStreetsGLGroundLon,
    streetsGLGroundZoom,
    setStreetsGLGroundZoom,
    streetsGLIframeOverlay,
    setStreetsGLIframeOverlay,
    streetsGLIframeInteractive,
    setStreetsGLIframeInteractive,
    renderMode,
    streetsGLStartRequestedAt,
    setStreetsGLStartRequestedAt,
    setStreetsGLIframeReloadKey
  } = useAppStore()
  const { viewer } = useViewer()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'osmGroundV2', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'osmGroundV2'
    }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null)
  const [serverStarting, setServerStarting] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const hasTriggeredAutoStartRef = useRef(false)

  // Start server (Electron) and poll until up; or copy command (browser)
  const runStartServerAndPoll = useRef(async () => {
    if (!window.electronAPI?.startStreetsGLServer) return
    hasTriggeredAutoStartRef.current = true
    setServerStarting(true)
    try {
      await window.electronAPI.startStreetsGLServer()
    } catch {
      setServerStarting(false)
      hasTriggeredAutoStartRef.current = false
      return
    }
    const maxWait = 90000
    const pollInterval = 2500
    const startTime = Date.now()
    const poll = async (): Promise<void> => {
      if (Date.now() - startTime > maxWait) {
        setServerStarting(false)
        hasTriggeredAutoStartRef.current = false
        useAppStore.getState().setStreetsGLStartRequestedAt(null)
        return
      }
      try {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), 3000)
        await fetch(`${STREETS_GL_ALT_URL}/`, { method: 'HEAD', mode: 'no-cors', cache: 'no-cache', signal: controller.signal })
        clearTimeout(t)
        setServerAvailable(true)
        setServerStarting(false)
        hasTriggeredAutoStartRef.current = false
        return
      } catch {
        const img = new Image()
        img.onload = () => {
          setServerAvailable(true)
          setServerStarting(false)
          hasTriggeredAutoStartRef.current = false
        }
        img.onerror = () => setTimeout(poll, pollInterval)
        img.src = `${STREETS_GL_ALT_URL}/?t=${Date.now()}`
      }
    }
    setTimeout(poll, pollInterval)
  }).current

  const handleStartServerClick = () => {
    if (window.electronAPI?.startStreetsGLServer) {
      runStartServerAndPoll()
    } else {
      const cmd = 'cd streets-gl-alt && npm run dev'
      navigator.clipboard.writeText(cmd).then(() => {
        setCopyFeedback(true)
        setTimeout(() => setCopyFeedback(false), 2500)
      }).catch(() => {})
    }
  }

  // Check if Streets GL server is available
  useEffect(() => {
    if (!streetsGLIframeOverlay) {
      setServerAvailable(null)
      return
    }

    let timeoutId: NodeJS.Timeout | null = null
    let isMounted = true

    const checkServer = async () => {
      let resolved = false
      
      // Use fetch with no-cors to check if server responds
      // This will succeed even if CORS blocks the response
      const controller = new AbortController()
      timeoutId = setTimeout(() => {
        controller.abort()
        if (isMounted && !resolved) {
          resolved = true
          setServerAvailable(false)
        }
      }, 3000)
      
      try {
        // Try to fetch the main page - even with no-cors, we can detect if server is up
        await fetch(`${STREETS_GL_ALT_URL}/`, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
          signal: controller.signal
        })
        // If we get here without error, server is likely up
        if (isMounted && !resolved) {
          resolved = true
          setServerAvailable(true)
        }
      } catch (err: any) {
        // If it's an abort, we already handled it
        if (err.name === 'AbortError') {
          return
        }
        // For other errors, try alternative method
        const img = new Image()
        img.onload = () => {
          if (isMounted && !resolved) {
            resolved = true
            setServerAvailable(true)
          }
        }
        img.onerror = () => {
          if (isMounted && !resolved) {
            resolved = true
            setServerAvailable(false)
          }
        }
        img.src = `${STREETS_GL_ALT_URL}/?t=${Date.now()}`
      }
    }

    checkServer()
    // Re-check every 5 seconds when overlay is enabled
    const interval = setInterval(checkServer, 5000)

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
      clearInterval(interval)
    }
  }, [streetsGLIframeOverlay])

  // Automatic start (Electron only): when server is down, start it once and poll until up
  useEffect(() => {
    if (!streetsGLIframeOverlay || serverAvailable !== false || !window.electronAPI?.startStreetsGLServer) return
    if (hasTriggeredAutoStartRef.current) return
    runStartServerAndPoll()
  }, [streetsGLIframeOverlay, serverAvailable])

  // Clear "start requested" and force iframe to reload when server becomes available
  useEffect(() => {
    if (serverAvailable === true) {
      setStreetsGLStartRequestedAt(null)
      setStreetsGLIframeReloadKey((k) => k + 1)
    }
  }, [serverAvailable, setStreetsGLStartRequestedAt, setStreetsGLIframeReloadKey])

  // After 90s, clear "start requested" so we show "Server Not Running" with the button if still down
  useEffect(() => {
    if (streetsGLStartRequestedAt == null || serverAvailable === true) return
    const t = setTimeout(() => {
      setStreetsGLStartRequestedAt(null)
    }, 90000)
    return () => clearTimeout(t)
  }, [streetsGLStartRequestedAt, serverAvailable, setStreetsGLStartRequestedAt])

  const showStarting =
    serverStarting ||
    (typeof window !== 'undefined' &&
      window.electronAPI?.startStreetsGLServer &&
      streetsGLStartRequestedAt != null &&
      Date.now() - streetsGLStartRequestedAt < 90000 &&
      serverAvailable !== true)

  if (!showOSMGroundV2Panel) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className={`osm-ground-v2-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`
      }}
    >
      <div className="osm-ground-v2-panel-header" onMouseDown={handleMouseDown}>
        <h3>OSM 3D</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            className="minimize-button" 
            onClick={() => setIsMinimized(!isMinimized)} 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleOSMGroundV2Panel} title="Close panel">
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
      <div className="osm-ground-v2-panel-content">
        <div className="osm-ground-v2-section">
          <p className="description">
            <strong>Streets GL 3D Map Renderer</strong> - Full-featured 3D OpenStreetMap renderer with realistic buildings, materials, and lighting.
            This uses the actual Streets GL engine, not basic OSM tiles.
          </p>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        <div className="osm-ground-v2-section">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={streetsGLIframeOverlay}
              onChange={(e) => {
                setStreetsGLIframeOverlay(e.target.checked)
              }}
            />
            <span>✅ Enable Streets GL 3D Map</span>
          </label>
          <p className="help-text">
            <strong>Streets GL Renderer:</strong> Full 3D map with realistic buildings, proper materials, textures, and lighting.
            Objects you place will appear <strong>inside the Streets GL scene</strong> alongside the 3D buildings.
            Make sure Streets GL server is running on <code>http://localhost:8081</code>
          </p>
          
          {streetsGLIframeOverlay && serverAvailable === false && (
            <div style={{ 
              marginTop: '12px', 
              padding: '12px', 
              backgroundColor: showStarting ? '#e3f2fd' : '#ffebee', 
              border: `1px solid ${showStarting ? '#2196f3' : '#f44336'}`,
              borderRadius: '4px',
              color: showStarting ? '#1565c0' : '#c62828'
            }}>
              {showStarting ? (
                <>
                  <strong>🔄 Starting Streets GL server</strong>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                    The server is starting in the background. This may take 30–60 seconds. The map will appear when ready—no need to refresh.
                  </p>
                </>
              ) : (
                <>
                  <strong>⚠️ Streets GL Server Not Running</strong>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                    The Streets GL server is not accessible at <code>http://localhost:8081</code>.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartServerClick}
                    style={{
                      marginTop: '10px',
                      padding: '8px 14px',
                      background: window.electronAPI ? '#2196f3' : '#555',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600
                    }}
                    title={window.electronAPI ? 'Start the Streets GL server now' : 'Copy command to run in a terminal'}
                  >
                    {window.electronAPI
                      ? '▶ Start server'
                      : copyFeedback
                        ? '✓ Copied! Run in terminal'
                        : 'Copy command (run in terminal)'}
                  </button>
                  {!window.electronAPI && (
                    <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                      <strong>Or:</strong>
                    </p>
                  )}
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                    <strong>To fix manually:</strong>
                  </p>
                  <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px' }}>
                    <li>Open a terminal/command prompt</li>
                    <li>Navigate to: <code>streets-gl-alt</code> folder</li>
                    <li>Run: <code>npm run dev</code></li>
                    <li>Wait for "webpack compiled successfully" message</li>
                    <li>Refresh this page</li>
                  </ol>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                    Or double-click <code>start-dev.bat</code> in the <code>streets-gl-alt</code> folder.
                  </p>
                </>
              )}
            </div>
          )}
          
          {streetsGLIframeOverlay && (
            <div style={{ marginTop: '12px' }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={renderMode === 'city' ? true : streetsGLIframeInteractive}
                  disabled={renderMode === 'city'}
                  onChange={(e) => setStreetsGLIframeInteractive(e.target.checked)}
                />
                <span>Allow Streets GL Interaction</span>
              </label>
              <p className="help-text" style={{ marginTop: '4px', fontSize: '12px' }}>
                {renderMode === 'city'
                  ? '✓ City mode: map interaction is on — pan and zoom with the mouse to navigate.'
                  : streetsGLIframeInteractive
                    ? '✓ You can pan and zoom the map.'
                    : '✓ Clicks pass through to 3D models (Hybrid). Check the box to pan/zoom the map.'}
              </p>
            </div>
          )}
        </div>

        {streetsGLIframeOverlay && (
          <>
            <div className="osm-ground-v2-section">
              <h4>Location</h4>
              <label>
                <span>Latitude</span>
                <input
                  type="number"
                  step="0.00001"
                  value={streetsGLGroundLat}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value)
                    if (!isNaN(val)) {
                      setStreetsGLGroundLat(Math.max(-90, Math.min(90, val)))
                    }
                  }}
                  min="-90"
                  max="90"
                />
              </label>

              <label>
                <span>Longitude</span>
                <input
                  type="number"
                  step="0.00001"
                  value={streetsGLGroundLon}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value)
                    if (!isNaN(val)) {
                      setStreetsGLGroundLon(Math.max(-180, Math.min(180, val)))
                    }
                  }}
                  min="-180"
                  max="180"
                />
              </label>

              <label>
                <span>Zoom Level: {streetsGLGroundZoom}</span>
                <input
                  type="range"
                  min="1"
                  max="18"
                  step="1"
                  value={streetsGLGroundZoom}
                  onChange={(e) => setStreetsGLGroundZoom(parseInt(e.target.value))}
                />
              </label>
              <p className="help-text" style={{ marginTop: '8px', fontSize: '12px' }}>
                Change location and zoom to navigate the Streets GL map. The map will update automatically.
              </p>
            </div>
          </>
        )}

        <div className="osm-ground-v2-section">
          <h4>Usage</h4>
          <ul className="features-list">
            <li>Enable Streets GL to see realistic 3D buildings and map</li>
            <li>Place your 3D objects (cars, models, etc.) - they will appear inside the Streets GL scene</li>
            <li>Objects sync automatically to Streets GL and appear alongside buildings</li>
            <li>Adjust location and zoom to navigate the map</li>
            <li>Make sure Streets GL server is running at <code>http://localhost:8081</code></li>
          </ul>
        </div>
      </div>
      )}
    </div>
  )
}
