import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import FloatingPanelHeader from './FloatingPanelHeader'
import { usePanelStacking } from '../hooks/usePanelStacking'
import type { StreetsGLBuildingRef } from '../utils/streetsGLBridge'
import './OSMGroundV2Panel.css'

const STREETS_GL_ALT_URL = 'http://localhost:8081'
const SERVER_CHECK_TIMEOUT_MS = 8000
const SERVER_STARTUP_GRACE_MS = 120000

function unpackStreetsGLBuildingId(packedId: number): {
  osmType: number
  osmId: number
  osmTypeName: string
} {
  // Matches Streets GL Tile.unpackFeatureId + SelectionPanel: 0 = way, 1 = relation.
  const osmType = Math.floor(packedId / 2 ** 51)
  let osmId = packedId
  if (osmId >= 2 ** 52) osmId -= 2 ** 52
  if (osmId >= 2 ** 51) osmId -= 2 ** 51
  const osmTypeName = osmType === 0 ? 'way' : osmType === 1 ? 'relation' : `type-${osmType}`
  return { osmType, osmId, osmTypeName }
}

function formatBuildingLabel(buildingId: number | string, meta?: Partial<StreetsGLBuildingRef>): string {
  const packed = typeof buildingId === 'number' ? buildingId : Number(buildingId)
  if (!Number.isFinite(packed)) return String(buildingId)
  const unpacked =
    meta?.osmId != null && meta?.osmTypeName
      ? { osmId: meta.osmId, osmTypeName: meta.osmTypeName }
      : unpackStreetsGLBuildingId(packed)
  return `${unpacked.osmTypeName} ${unpacked.osmId}`
}

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
    setStreetsGLIframeReloadKey,
    streetsGLBridge,
    streetsGLHiddenBuildingIds,
    hideStreetsGLBuildingId,
    showStreetsGLBuildingId,
    setStreetsGLHiddenBuildingIds
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
  const [selectedBuilding, setSelectedBuilding] = useState<StreetsGLBuildingRef | null>(null)
  const [buildingActionBusy, setBuildingActionBusy] = useState(false)
  const [buildingActionMessage, setBuildingActionMessage] = useState<string | null>(null)
  const hasTriggeredAutoStartRef = useRef(false)
  const overlayEnabledAtRef = useRef<number | null>(null)

  const mapInteractionEnabled = renderMode === 'city' || streetsGLIframeInteractive
  const selectedIsHidden =
    selectedBuilding != null &&
    streetsGLHiddenBuildingIds.includes(String(selectedBuilding.buildingId))

  // Listen for Streets GL building picks while the OSM 3D panel is open
  useEffect(() => {
    if (!streetsGLIframeOverlay || !streetsGLBridge) {
      setSelectedBuilding(null)
      return
    }
    return streetsGLBridge.onBuildingSelected((building) => {
      setSelectedBuilding(building)
      setBuildingActionMessage(null)
    })
  }, [streetsGLIframeOverlay, streetsGLBridge])

  const handleHideSelectedBuilding = async () => {
    if (!streetsGLBridge?.isReady || !selectedBuilding) return
    setBuildingActionBusy(true)
    setBuildingActionMessage(null)
    try {
      const ok = await streetsGLBridge.hideBuilding(selectedBuilding.buildingId)
      if (ok) {
        hideStreetsGLBuildingId(selectedBuilding.buildingId)
        setBuildingActionMessage(`Hidden ${formatBuildingLabel(selectedBuilding.buildingId, selectedBuilding)}`)
      } else {
        setBuildingActionMessage('Could not hide building (is one selected on the map?)')
      }
    } finally {
      setBuildingActionBusy(false)
    }
  }

  const handleShowSelectedBuilding = async () => {
    if (!streetsGLBridge?.isReady || !selectedBuilding) return
    setBuildingActionBusy(true)
    setBuildingActionMessage(null)
    try {
      const ok = await streetsGLBridge.showBuilding(selectedBuilding.buildingId)
      if (ok) {
        showStreetsGLBuildingId(selectedBuilding.buildingId)
        setBuildingActionMessage(`Shown ${formatBuildingLabel(selectedBuilding.buildingId, selectedBuilding)}`)
      } else {
        setBuildingActionMessage('Could not show building')
      }
    } finally {
      setBuildingActionBusy(false)
    }
  }

  const handleShowHiddenBuilding = async (buildingIdStr: string) => {
    if (!streetsGLBridge?.isReady) return
    const buildingId = Number(buildingIdStr)
    if (!Number.isFinite(buildingId)) return
    setBuildingActionBusy(true)
    setBuildingActionMessage(null)
    try {
      const ok = await streetsGLBridge.showBuilding(buildingId)
      if (ok) {
        showStreetsGLBuildingId(buildingIdStr)
        setBuildingActionMessage(`Shown ${formatBuildingLabel(buildingId)}`)
      }
    } finally {
      setBuildingActionBusy(false)
    }
  }

  const handleShowAllHiddenBuildings = async () => {
    if (!streetsGLBridge?.isReady || streetsGLHiddenBuildingIds.length === 0) return
    setBuildingActionBusy(true)
    setBuildingActionMessage(null)
    try {
      const ok = await streetsGLBridge.syncHiddenBuildings([])
      if (ok) {
        setStreetsGLHiddenBuildingIds([])
        setBuildingActionMessage('All map buildings restored')
      }
    } finally {
      setBuildingActionBusy(false)
    }
  }

  const handleHideSelectedFromMap = async () => {
    // Fallback: poll iframe selection if live pick event was missed
    if (!streetsGLBridge?.isReady) return
    if (selectedBuilding) {
      await handleHideSelectedBuilding()
      return
    }
    setBuildingActionBusy(true)
    setBuildingActionMessage(null)
    try {
      let found: StreetsGLBuildingRef | null = null
      const ok = await streetsGLBridge.requestSelectedBuilding(
        async (_pos, _h, _size, _bounds, building) => {
          found = building
        }
      )
      if (!ok || !found) {
        setBuildingActionMessage('Click a map building first, then Hide')
        return
      }
      setSelectedBuilding(found)
      const hideOk = await streetsGLBridge.hideBuilding(found.buildingId)
      if (hideOk) {
        hideStreetsGLBuildingId(found.buildingId)
        setBuildingActionMessage(`Hidden ${formatBuildingLabel(found.buildingId, found)}`)
      }
    } finally {
      setBuildingActionBusy(false)
    }
  }

  const isInStartupGrace = () =>
    overlayEnabledAtRef.current != null &&
    Date.now() - overlayEnabledAtRef.current < SERVER_STARTUP_GRACE_MS

  const probeStreetsGLServer = async (timeoutMs = SERVER_CHECK_TIMEOUT_MS): Promise<boolean> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      await fetch(`${STREETS_GL_ALT_URL}/`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal
      })
      clearTimeout(timer)
      return true
    } catch (err: unknown) {
      clearTimeout(timer)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false
      }

      return await new Promise<boolean>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = `${STREETS_GL_ALT_URL}/images/favicon.png?t=${Date.now()}`
      })
    }
  }

  // Start server (Electron) and poll until up; or copy command (browser)
  const runStartServerAndPoll = useRef(async () => {
    if (!window.electronAPI?.startStreetsGLServer) return
    hasTriggeredAutoStartRef.current = true
    setServerStarting(true)
    try {
      const result = await window.electronAPI.startStreetsGLServer()
      if (!result?.started && result?.message?.includes('not found')) {
        setError(result.message)
        setServerStarting(false)
        hasTriggeredAutoStartRef.current = false
        useAppStore.getState().setStreetsGLStartRequestedAt(null)
        return
      }
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
      const isUp = await probeStreetsGLServer()
      if (isUp) {
        setServerAvailable(true)
        setServerStarting(false)
        hasTriggeredAutoStartRef.current = false
        return
      }
      setTimeout(poll, pollInterval)
    }
    setTimeout(poll, pollInterval)
  }).current

  const handleStartServerClick = () => {
    if (window.electronAPI?.startStreetsGLServer) {
      runStartServerAndPoll()
    } else {
      // Prefer root `npm run dev` so Vite + Streets GL managed start together
      const cmd = 'npm run dev'
      navigator.clipboard.writeText(cmd).then(() => {
        setCopyFeedback(true)
        setTimeout(() => setCopyFeedback(false), 2500)
      }).catch(() => {})
    }
  }

  // Check if Streets GL server is available
  useEffect(() => {
    if (!streetsGLIframeOverlay) {
      overlayEnabledAtRef.current = null
      setServerAvailable(null)
      return
    }

    overlayEnabledAtRef.current = Date.now()
    let isMounted = true

    const checkServer = async () => {
      const isUp = await probeStreetsGLServer()
      if (!isMounted) return

      if (isUp) {
        setServerAvailable(true)
        return
      }

      if (!isInStartupGrace()) {
        setServerAvailable(false)
      }
    }

    checkServer()
    const interval = setInterval(checkServer, 5000)

    return () => {
      isMounted = false
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

  // After startup grace, clear "start requested" so we show the manual fix UI if still down
  useEffect(() => {
    if (streetsGLStartRequestedAt == null || serverAvailable === true) return
    const t = setTimeout(() => {
      setStreetsGLStartRequestedAt(null)
    }, SERVER_STARTUP_GRACE_MS)
    return () => clearTimeout(t)
  }, [streetsGLStartRequestedAt, serverAvailable, setStreetsGLStartRequestedAt])

  const showStarting =
    serverStarting ||
    (streetsGLIframeOverlay &&
      serverAvailable !== true &&
      isInStartupGrace()) ||
    (typeof window !== 'undefined' &&
      window.electronAPI?.startStreetsGLServer &&
      streetsGLStartRequestedAt != null &&
      Date.now() - streetsGLStartRequestedAt < SERVER_STARTUP_GRACE_MS &&
      serverAvailable !== true)

  const showServerStatusBanner =
    streetsGLIframeOverlay &&
    (serverAvailable === false || (serverAvailable === null && isInStartupGrace()))

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
      <FloatingPanelHeader
        title="OSM 3D"
        icon="🗺️"
        onMouseDown={handleMouseDown}
        isMinimized={isMinimized}
        onMinimize={() => setIsMinimized(!isMinimized)}
        onClose={toggleOSMGroundV2Panel}
      />

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
          
          {showServerStatusBanner && (
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
                    The server is starting in the background. This may take up to 2 minutes on first run. The map will appear when ready—no need to refresh.
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
                    <li>Open a terminal in the project root (<code>v3.18</code>)</li>
                    <li>Run: <code>npm run dev</code> (starts Vite + Streets GL on port 8081)</li>
                    <li>Wait for Streets GL / webpack to finish compiling</li>
                    <li>Keep that terminal open — closing it stops the server</li>
                    <li>Then refresh this page</li>
                  </ol>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                    Enable Streets GL / City mode is saved in the browser, but the map server is a
                    separate Node process and does not stay running after you close the terminal.
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

            <div className="osm-ground-v2-section">
              <h4>Map buildings</h4>
              <p className="help-text" style={{ marginTop: 0, fontSize: '12px' }}>
                Click a Streets GL building on the map to select it, then hide it from view.
                Hidden buildings persist in this session and in saved projects. Move/delete of
                native OSM geometry is not supported (buildings are batched per tile).
              </p>
              {!mapInteractionEnabled && (
                <p className="help-text" style={{ color: '#ffb74d', fontSize: '12px' }}>
                  Enable &quot;Allow Streets GL Interaction&quot; (or City mode) so you can click buildings.
                </p>
              )}
              <div className="osm-building-selected">
                <div className="osm-building-selected-label">Selected</div>
                <div className="osm-building-selected-value">
                  {selectedBuilding
                    ? formatBuildingLabel(selectedBuilding.buildingId, selectedBuilding)
                    : 'None — click a building on the map'}
                </div>
              </div>
              <div className="button-group" style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  className="view-button"
                  disabled={buildingActionBusy || !streetsGLBridge?.isReady || (!selectedBuilding && !mapInteractionEnabled)}
                  onClick={() => void handleHideSelectedFromMap()}
                  title="Hide the selected map building"
                >
                  Hide
                </button>
                <button
                  type="button"
                  className="view-button"
                  disabled={buildingActionBusy || !streetsGLBridge?.isReady || !selectedBuilding || !selectedIsHidden}
                  onClick={() => void handleShowSelectedBuilding()}
                  title="Show the selected building again"
                >
                  Show
                </button>
              </div>
              {buildingActionMessage && (
                <p className="help-text" style={{ marginTop: '8px', fontSize: '12px' }}>
                  {buildingActionMessage}
                </p>
              )}
              {streetsGLHiddenBuildingIds.length > 0 && (
                <div className="osm-hidden-buildings" style={{ marginTop: '12px' }}>
                  <div className="osm-hidden-buildings-header">
                    <span>Hidden ({streetsGLHiddenBuildingIds.length})</span>
                    <button
                      type="button"
                      className="osm-hidden-buildings-clear"
                      disabled={buildingActionBusy || !streetsGLBridge?.isReady}
                      onClick={() => void handleShowAllHiddenBuildings()}
                    >
                      Show all
                    </button>
                  </div>
                  <ul className="osm-hidden-buildings-list">
                    {streetsGLHiddenBuildingIds.map((id) => (
                      <li key={id}>
                        <span>{formatBuildingLabel(id)}</span>
                        <button
                          type="button"
                          disabled={buildingActionBusy || !streetsGLBridge?.isReady}
                          onClick={() => void handleShowHiddenBuilding(id)}
                        >
                          Show
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        <div className="osm-ground-v2-section">
          <h4>Usage</h4>
          <ul className="features-list">
            <li>Enable Streets GL to see realistic 3D buildings and map</li>
            <li>Click a map building, then Hide in Map buildings to remove it from view</li>
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
