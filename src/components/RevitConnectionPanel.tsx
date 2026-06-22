import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { RevitSyncManager, type RevitModelUpdate } from '../utils/revitSyncManager'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './RevitConnectionPanel.css'

export default function RevitConnectionPanel() {
  const { showRevitConnectionPanel, toggleRevitConnectionPanel } = useAppStore()
  const { viewer, loadFromUrl } = useViewer()
  
  const [isConnected, setIsConnected] = useState(false)
  const [serverUrl, setServerUrl] = useState('http://localhost:3002')
  const [wsUrl, setWsUrl] = useState('ws://localhost:3003')
  const [sessionId, setSessionId] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [activeSessions, setActiveSessions] = useState<Array<{ sessionId: string; fileName: string; lastUpdate: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null)
  const [checkingServer, setCheckingServer] = useState(false)

  const syncManagerRef = useRef<RevitSyncManager | null>(null)
  const sessionsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 450
  const stackingOffset = usePanelStacking({ panelId: 'revit-connection', anchor: 'right' })
  const { top, left, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef,
    {
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'revit-connection'
    }
  )

  const stopSessionPolling = useCallback(() => {
    if (sessionsIntervalRef.current) {
      clearInterval(sessionsIntervalRef.current)
      sessionsIntervalRef.current = null
    }
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch(`${serverUrl}/api/revit/sessions`)
      const data = await response.json()
      setActiveSessions(data.sessions || [])
    } catch (error) {
      console.error('[RevitConnection] Failed to fetch sessions:', error)
    }
  }, [serverUrl])

  const handleModelUpdate = useCallback(async (update: RevitModelUpdate) => {
    console.log('[RevitConnection] ========================================')
    console.log('[RevitConnection] Model update received:', update)
    console.log('[RevitConnection] File:', update.fileName)
    console.log('[RevitConnection] Size:', `${(update.fileSize / 1024 / 1024).toFixed(2)} MB`)
    console.log('[RevitConnection] URL:', update.fileUrl)
    console.log('[RevitConnection] ========================================')
    setLastUpdate(update.timestamp)

    if (!viewer?.scene) {
      console.error('[RevitConnection] Cannot load model: viewer or scene not available')
      setError('Viewer not ready. Please wait for the viewer to initialize.')
      return
    }

    if (!loadFromUrl) {
      console.error('[RevitConnection] Cannot load model: loadFromUrl function not available')
      setError('Model loader not available.')
      return
    }

    try {
      const { setStreetsGLIframeOverlay } = useAppStore.getState()
      const currentState = useAppStore.getState()
      if (currentState.streetsGLIframeOverlay) {
        setStreetsGLIframeOverlay(false)
        console.log('[RevitConnection] Disabled Streets GL overlay before loading Revit model')
      }

      const fullUrl = update.fileUrl.startsWith('http')
        ? update.fileUrl
        : `${serverUrl}${update.fileUrl}`

      console.log(`[RevitConnection] Loading model from: ${fullUrl}`)
      const model = await loadFromUrl(fullUrl, (progress) => {
        console.log(`[RevitConnection] Loading progress: ${progress.toFixed(1)}%`)
      }, { replaceExisting: false })

      if (model?.scene && viewer?.scene) {
        model.scene.visible = true
        model.scene.traverse((obj: any) => {
          obj.visible = true
          obj.userData.isRevitModel = true
          obj.userData.excludeFromStreetsGLHiding = true
        })
        console.log('[RevitConnection] Model loaded and ensured visibility')
      }
    } catch (error) {
      console.error('[RevitConnection] Failed to load model update:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      setError(`Failed to load update: ${errorMessage}`)
    }
  }, [loadFromUrl, serverUrl, viewer])

  const configureSyncManager = useCallback((manager: RevitSyncManager) => {
    manager.onModelUpdate(handleModelUpdate)
    manager.onConnectionChange((connected) => {
      setIsConnected(connected)
      setConnectionStatus(connected ? 'connected' : 'disconnected')

      if (connected) {
        fetchSessions()
        stopSessionPolling()
        sessionsIntervalRef.current = setInterval(fetchSessions, 5000)
      } else {
        stopSessionPolling()
      }
    })
  }, [fetchSessions, handleModelUpdate, stopSessionPolling])

  // Check server availability when panel opens
  useEffect(() => {
    if (!showRevitConnectionPanel) return

    const checkServer = async () => {
      setCheckingServer(true)
      try {
        // Try to fetch the sessions endpoint to check if server is running
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)
        
        const response = await fetch(`${serverUrl}/api/revit/sessions`, {
          method: 'GET',
          signal: controller.signal,
          mode: 'cors'
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          setServerAvailable(true)
          console.log('[RevitConnection] Server is available')
        } else {
          setServerAvailable(false)
          console.log('[RevitConnection] Server responded but with error')
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          // Timeout - server not responding
          setServerAvailable(false)
          console.log('[RevitConnection] Server check timed out - server not available')
        } else {
          setServerAvailable(false)
          console.log('[RevitConnection] Server not available:', error.message)
        }
      } finally {
        setCheckingServer(false)
      }
    }

    checkServer()
    
    // Re-check every 5 seconds
    const interval = setInterval(checkServer, 5000)
    
    return () => clearInterval(interval)
  }, [showRevitConnectionPanel, serverUrl])

  // Initialize sync manager and auto-connect
  useEffect(() => {
    if (!showRevitConnectionPanel) return

    const manager = new RevitSyncManager({
      serverUrl,
      wsUrl,
      sessionId: sessionId || undefined,
      autoLoad: true
    })
    configureSyncManager(manager)
    syncManagerRef.current = manager

    return () => {
      stopSessionPolling()
      if (syncManagerRef.current) {
        syncManagerRef.current.disconnect()
        syncManagerRef.current = null
      }
    }
  }, [configureSyncManager, serverUrl, showRevitConnectionPanel, stopSessionPolling, wsUrl, sessionId])

  // Connect to server
  const handleConnect = async () => {
    setConnectionStatus('connecting')
    setError(null)

    try {
      // Disable Streets GL overlay when using Revit sync (models need to be visible in main viewer)
      const { setStreetsGLIframeOverlay } = useAppStore.getState()
      setStreetsGLIframeOverlay(false)
      console.log('[RevitConnection] Disabled Streets GL overlay for Revit models')

      stopSessionPolling()
      syncManagerRef.current?.disconnect()

      const manager = new RevitSyncManager({
        serverUrl,
        wsUrl,
        sessionId: sessionId || undefined,
        autoLoad: true
      })
      configureSyncManager(manager)
      syncManagerRef.current = manager

      await manager.connect()

      if (sessionId) {
        manager.subscribe(sessionId)
      }
    } catch (error) {
      console.error('[RevitConnection] Connection failed:', error)
      setConnectionStatus('error')
      setError(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  // Disconnect from server
  const handleDisconnect = () => {
    stopSessionPolling()
    if (syncManagerRef.current) {
      syncManagerRef.current.disconnect()
    }
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  // Subscribe to a session
  const handleSubscribe = (targetSessionId: string) => {
    if (syncManagerRef.current && isConnected) {
      syncManagerRef.current.subscribe(targetSessionId)
      setSessionId(targetSessionId)
    }
  }

  if (!showRevitConnectionPanel) return null

  return (
    <div
      ref={panelRef}
      className={`revit-connection-panel ${dragging ? 'dragging' : ''}`}
      style={{ top, left, maxHeight }}
    >
      <div className="revit-connection-panel-header" onMouseDown={handleMouseDown}>
        <h3>Revit Live Link</h3>
        <button
          className="close-button"
          onClick={toggleRevitConnectionPanel}
          aria-label="Close Revit connection panel"
        >
          ×
        </button>
      </div>

      <div className="revit-connection-panel-content">
        {/* Server Availability Check */}
        {serverAvailable === false && !isConnected && (
          <div className="revit-server-warning" style={{
            padding: '12px',
            marginBottom: '12px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            color: '#856404'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              ⚠️ Revit Sync Server Not Running
            </div>
            <div style={{ fontSize: '0.9em', marginBottom: '12px' }}>
              The server needs to be started before connecting.
            </div>
            <div style={{ fontSize: '0.85em' }}>
              <strong>Quick Start:</strong>
              <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>Double-click <code>START_REVIT_SYNC_SERVER.bat</code> in the project root</li>
                <li>Or run: <code>npm run dev:with-revit</code></li>
                <li>Wait for "Server running" message, then click Connect</li>
              </ol>
            </div>
            <div style={{ 
              marginTop: '8px', 
              padding: '8px', 
              backgroundColor: '#fff', 
              borderRadius: '4px',
              fontSize: '0.85em',
              fontFamily: 'monospace'
            }}>
              <strong>Location:</strong> Project root folder<br/>
              <code>START_REVIT_SYNC_SERVER.bat</code>
            </div>
          </div>
        )}

        {checkingServer && (
          <div style={{ padding: '8px', textAlign: 'center', color: '#666' }}>
            Checking server availability...
          </div>
        )}

        {/* Connection Status */}
        <div className="revit-status-section">
          <div className={`revit-status-indicator ${connectionStatus}`}>
            <span className="status-dot"></span>
            <span className="status-text">
              {connectionStatus === 'connected' && 'Connected'}
              {connectionStatus === 'connecting' && 'Connecting...'}
              {connectionStatus === 'disconnected' && 'Disconnected'}
              {connectionStatus === 'error' && 'Error'}
            </span>
          </div>
          {serverAvailable === true && connectionStatus === 'disconnected' && (
            <div style={{ fontSize: '0.85em', color: '#28a745', marginTop: '4px' }}>
              ✅ Server is running
            </div>
          )}
          {lastUpdate && (
            <div className="revit-last-update">
              Last update: {new Date(lastUpdate).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Server Configuration */}
        <div className="revit-config-section">
          <label>
            HTTP Server URL:
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={isConnected}
              placeholder="http://localhost:3002"
            />
          </label>
          <label>
            WebSocket URL:
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              disabled={isConnected}
              placeholder="ws://localhost:3003"
            />
          </label>
          <label>
            Session ID (optional):
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={isConnected}
              placeholder="Leave empty to receive all updates"
            />
          </label>
        </div>

        {/* Connection Controls */}
        <div className="revit-controls-section">
          {!isConnected ? (
            <button 
              className="revit-connect-button" 
              onClick={handleConnect}
              disabled={serverAvailable === false || checkingServer}
              title={serverAvailable === false ? 'Start the Revit sync server first' : ''}
            >
              {checkingServer ? 'Checking...' : 'Connect'}
            </button>
          ) : (
            <button className="revit-disconnect-button" onClick={handleDisconnect}>
              Disconnect
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="revit-error-message">
            ⚠️ {error}
          </div>
        )}

        {/* Copy Logs Button */}
        <div className="revit-controls-section" style={{ marginTop: '12px' }}>
          <button
            className="revit-connect-button"
            onClick={async () => {
              try {
                // Collect browser console logs (if available)
                const browserLogs = Array.from(document.querySelectorAll('*'))
                  .map(() => '')
                  .join('\n')
                
                // Create a simple log report
                const logReport = `=== REVIT CONNECTION LOGS ===
Generated: ${new Date().toLocaleString()}

--- CONNECTION STATUS ---
Status: ${connectionStatus}
Server Available: ${serverAvailable}
Connected: ${isConnected}
Session ID: ${sessionId || '(none)'}
Last Update: ${lastUpdate || '(none)'}

--- SERVER CONFIGURATION ---
HTTP Server: ${serverUrl}
WebSocket: ${wsUrl}

--- ERROR MESSAGES ---
${error || '(no errors)'}

--- ACTIVE SESSIONS ---
${activeSessions.length > 0 
  ? activeSessions.map(s => `- ${s.fileName} (${s.sessionId}) - ${s.lastUpdate}`).join('\n')
  : '(no active sessions)'}

=== END OF LOGS ===
                
To get full browser console logs:
1. Press F12 in your browser
2. Go to Console tab
3. Right-click → "Save as..." or copy manually
4. Use COPY_LOGS.html tool in project root for full log collection

To get server logs:
1. Look at the command window where START_REVIT_SYNC_SERVER.bat is running
2. Select and copy the text
3. Use COPY_LOGS.html tool in project root for full log collection`

                await navigator.clipboard.writeText(logReport)
                alert('✅ Connection status copied to clipboard!\n\nFor full logs, use COPY_LOGS.html tool in project root.')
              } catch (err) {
                console.error('Failed to copy logs:', err)
                alert('❌ Failed to copy logs. Please use COPY_LOGS.html tool instead.')
              }
            }}
            style={{ 
              backgroundColor: '#6c757d',
              width: '100%',
              fontSize: '14px',
              padding: '10px'
            }}
            title="Copy connection status and logs to clipboard"
          >
            📋 Copy Logs
          </button>
        </div>

        {/* Active Sessions */}
        {isConnected && (
          <div className="revit-sessions-section">
            <h4>Active Revit Sessions</h4>
            {activeSessions.length === 0 ? (
              <div className="revit-no-sessions">No active sessions</div>
            ) : (
              <div className="revit-sessions-list">
                {activeSessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className={`revit-session-item ${sessionId === session.sessionId ? 'active' : ''}`}
                    onClick={() => handleSubscribe(session.sessionId)}
                  >
                    <div className="revit-session-name">{session.fileName}</div>
                    <div className="revit-session-id">ID: {session.sessionId}</div>
                    <div className="revit-session-time">
                      {new Date(session.lastUpdate).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="revit-instructions">
          <h4>How to Use</h4>
          <ol>
            <li>
              {serverAvailable === true ? (
                <>✅ Server is running</>
              ) : serverAvailable === false ? (
                <>⚠️ Start the Revit sync server (see warning above)</>
              ) : (
                <>Start the Revit sync server: <code>START_REVIT_SYNC_SERVER.bat</code></>
              )}
            </li>
            <li>Install and run the Revit add-in in Revit</li>
            <li>Click "Connect" above</li>
            <li>In Revit, click "Direct Link" - models will appear automatically!</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
