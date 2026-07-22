/**
 * Streets GL Iframe Overlay Component
 * 
 * Handles the Streets GL iframe overlay and bridge initialization.
 * Extracted from App.tsx to improve code organization.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { StreetsGLBridge } from '../utils/streetsGLBridge'
import { shouldLoadStreetsGLIframe } from '../utils/streetsGLIframeLifecycle'
import { useAppStore } from '../store/useAppStore'
import { requestRegistryResync } from '../viewer/useViewer'
import {
  DEFAULT_STREETS_GL_BASE_URL,
  buildStreetsGLIframeSrc,
  generateBridgeCapability
} from '../utils/streetsGLBridgeSecurity'

const STREETS_GL_ALT_URL = DEFAULT_STREETS_GL_BASE_URL

interface StreetsGLIframeOverlayProps {
  streetsGLIframeOverlay: boolean
  streetsGLShowUI: boolean
  streetsGLIframeInteractive: boolean
  streetsGLGroundLat: number
  streetsGLGroundLon: number
  streetsGLGroundZoom: number
  streetsGLIframeReloadKey: number
}

export function StreetsGLIframeOverlay({
  streetsGLIframeOverlay,
  streetsGLShowUI,
  streetsGLIframeInteractive,
  streetsGLGroundLat,
  streetsGLGroundLon,
  streetsGLGroundZoom,
  streetsGLIframeReloadKey
}: StreetsGLIframeOverlayProps) {
  const renderMode = useAppStore((s) => s.renderMode)
  const streetsGLIframeRef = useRef<HTMLIFrameElement | null>(null)
  const streetsGLBridgeRef = useRef<StreetsGLBridge | null>(null)
  const lastHashRef = useRef<string>('')
  // Only log iframe load diagnostics once per page session to avoid console spam
  const hasLoggedInitialLoadRef = useRef<boolean>(false)
  const [streetsGLBaseUrl, setStreetsGLBaseUrl] = useState(STREETS_GL_ALT_URL)

  // Keep Streets GL loaded whenever city/hybrid overlay is on.
  // Do NOT gate on document.hidden — that previously set src to about:blank on tab
  // switch, which restarted the iframe app and dropped imported ExternalObjectBridge models.
  const shouldLoadStreetsGL = shouldLoadStreetsGLIframe(streetsGLIframeOverlay, renderMode)

  // SEC-5: per-iframe-load capability; Electron may report an ephemeral Streets GL base URL.
  const bridgeCapability = useMemo(
    () => generateBridgeCapability(),
    [
      streetsGLGroundLat,
      streetsGLGroundLon,
      streetsGLGroundZoom,
      streetsGLIframeReloadKey,
      shouldLoadStreetsGL,
      streetsGLBaseUrl
    ]
  )

  const streetsGLIframeSrc = useMemo(() => {
    if (!shouldLoadStreetsGL) return 'about:blank'
    const hash = `${streetsGLGroundLat.toFixed(5)},${streetsGLGroundLon.toFixed(5)},45.00,0.00,2000.00`
    return buildStreetsGLIframeSrc({
      baseUrl: streetsGLBaseUrl,
      capability: bridgeCapability,
      parentOrigin: window.location.origin,
      hash
    })
  }, [
    shouldLoadStreetsGL,
    streetsGLBaseUrl,
    bridgeCapability,
    streetsGLGroundLat,
    streetsGLGroundLon
  ])

  useEffect(() => {
    let cancelled = false
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api?.getStreetsGLBaseUrl) return
    void api.getStreetsGLBaseUrl().then((result) => {
      if (cancelled || !result?.baseUrl) return
      setStreetsGLBaseUrl(result.baseUrl)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Tear down bridge when overlay is off or not in City/Hybrid (iframe goes to about:blank)
  useEffect(() => {
    if (shouldLoadStreetsGL) return
    streetsGLBridgeRef.current?.dispose()
    streetsGLBridgeRef.current = null
    useAppStore.getState().setStreetsGLBridge(null)
  }, [shouldLoadStreetsGL])

  useEffect(() => {
    if (!shouldLoadStreetsGL) return

    // A remounted iframe gets a new window object, so the previous bridge must be discarded.
    streetsGLBridgeRef.current?.dispose()
    streetsGLBridgeRef.current = null
    useAppStore.getState().setStreetsGLBridge(null)
  }, [shouldLoadStreetsGL, streetsGLGroundLat, streetsGLGroundLon, streetsGLGroundZoom, streetsGLIframeReloadKey])

  // Sync Streets GL iframe with location changes
  useEffect(() => {
    if (!shouldLoadStreetsGL) return

    const newHash = `${streetsGLGroundLat.toFixed(5)},${streetsGLGroundLon.toFixed(5)},45.00,0.00,1054.81`
    
    // Only log if the hash has actually changed
    if (lastHashRef.current !== newHash) {
      lastHashRef.current = newHash
      console.log('[StreetsGLIframe] Location changed:', { lat: streetsGLGroundLat, lon: streetsGLGroundLon, hash: newHash })
    }
  }, [shouldLoadStreetsGL, streetsGLGroundLat, streetsGLGroundLon])

  const handleIframeLoad = () => {
    // Check if iframe actually loaded the Streets GL app (not error page)
    const iframe = streetsGLIframeRef.current
    if (!iframe) return

    // about:blank (overlay off / product mode) — do not attach a bridge
    if (!shouldLoadStreetsGL || !iframe.src || iframe.src === 'about:blank') {
      return
    }

    const shouldLogLoad = !hasLoggedInitialLoadRef.current
    if (shouldLogLoad) {
      hasLoggedInitialLoadRef.current = true
    }

    if (shouldLogLoad) {
      console.log('[StreetsGLIframe] Iframe loaded', {
        src: iframe.src,
        hash: iframe.src.split('#')[1],
        computedStyle: {
          display: window.getComputedStyle(iframe).display,
          visibility: window.getComputedStyle(iframe).visibility,
          opacity: window.getComputedStyle(iframe).opacity,
          zIndex: window.getComputedStyle(iframe).zIndex,
          pointerEvents: window.getComputedStyle(iframe).pointerEvents
        }
      })
    }
    
    // Only try to read iframe document when same-origin (cross-origin throws CORS)
    try {
      const iframeSrcOrigin = iframe.src ? new URL(iframe.src).origin : ''
      if (iframeSrcOrigin === window.location.origin) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
        const isErrorPage = iframeDoc?.body?.textContent?.includes('refused to connect') ||
                           iframeDoc?.body?.textContent?.includes('ERR_CONNECTION_REFUSED') ||
                           iframeDoc?.title === 'localhost' ||
                           (typeof iframe.contentWindow?.location?.href === 'string' && iframe.contentWindow.location.href.startsWith('chrome-error://'))
        if (isErrorPage) {
          console.error('[StreetsGLIframe] ❌ Streets GL server is NOT running!', {
            error: 'ERR_CONNECTION_REFUSED',
            url: STREETS_GL_ALT_URL
          })
          // Auto-start in Electron desktop app
          if (typeof window !== 'undefined' && window.electronAPI?.startStreetsGLServer) {
            window.electronAPI.startStreetsGLServer().then((r) => {
              if (r.started) console.log('[StreetsGLIframe] Started Streets GL server automatically')
            }).catch(() => {})
          }
          return
        }
      }
    } catch (_) {
      // Invalid URL or CORS - continue with bridge initialization
    }
    
    if (shouldLogLoad) {
      console.log('[StreetsGLIframe] Iframe loaded successfully', {
        url: `${STREETS_GL_ALT_URL}#${streetsGLGroundLat.toFixed(5)},${streetsGLGroundLon.toFixed(5)},${streetsGLGroundZoom || 15}.00,0.00,1054.81`,
        lat: streetsGLGroundLat,
        lon: streetsGLGroundLon,
        zoom: streetsGLGroundZoom || 15,
        iframeOverlayEnabled: streetsGLIframeOverlay,
        note: 'Iframe loaded - initializing bridge for object sync'
      })
    }

    // Initialize a fresh bridge for the newly loaded iframe window.
    if (streetsGLIframeRef.current) {
      streetsGLBridgeRef.current?.dispose()
      streetsGLBridgeRef.current = null

      if (shouldLogLoad) {
        console.log('[StreetsGLIframe] Initializing Streets GL bridge...', {
          hasIframe: !!streetsGLIframeRef.current,
          hasContentWindow: !!streetsGLIframeRef.current.contentWindow,
          iframeOverlayEnabled: streetsGLIframeOverlay
        })
      }
      try {
        streetsGLBridgeRef.current = new StreetsGLBridge(streetsGLIframeRef.current, {
          capability: bridgeCapability,
          targetOrigin: new URL(streetsGLBaseUrl).origin
        })
        streetsGLBridgeRef.current.onReady(() => {
          console.log('[StreetsGLIframe] Streets GL bridge is ready - you can now add objects to Streets GL scene!')
          // Store bridge in global state for access from other components
          useAppStore.getState().setStreetsGLBridge(streetsGLBridgeRef.current)

          // Re-apply user-hidden OSM buildings (session / project) after iframe reload.
          const hiddenIds = useAppStore.getState().streetsGLHiddenBuildingIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id))
          if (hiddenIds.length > 0) {
            void streetsGLBridgeRef.current?.syncHiddenBuildings(hiddenIds)
          }

          // Always re-sync ObjectRegistry → ExternalObjectBridge after any iframe restart
          // (manual reload key, ground change remount, or unexpected WebGL recovery).
          // This overlay owns bridge-ready / iframe-reload triggers; mode-enter is owned
          // by ObjectRegistryReconciler. ResyncCoordinator coalesces overlapping calls.
          const bridge = streetsGLBridgeRef.current
          if (bridge) {
            const reason =
              streetsGLIframeReloadKey > 0 ? 'iframe-reload' : 'bridge-ready'
            void requestRegistryResync(bridge, reason)
              .then((n) => {
                if (n > 0) {
                  console.log(`[StreetsGLIframe] Re-synced ${n} registry object(s) after ${reason}`)
                }
              })
              .catch((err) => {
                console.warn('[StreetsGLIframe] Registry re-sync after bridge ready failed:', err)
              })
          }
        })
      } catch (error) {
        console.warn('[StreetsGLIframe] Failed to initialize Streets GL bridge:', error)
      }
    }
    
    // Debug: Check iframe visibility only when same-origin (throttled to reduce console noise)
    if (shouldLogLoad) {
      try {
        const iframeSrcOrigin = iframe?.src ? new URL(iframe.src).origin : ''
        const sameOrigin = iframeSrcOrigin === window.location.origin
        if (sameOrigin) {
          setTimeout(() => {
            if (streetsGLIframeRef.current?.contentWindow) {
              try {
                const iframeDoc = streetsGLIframeRef.current.contentDocument || streetsGLIframeRef.current.contentWindow?.document
                const canvas = iframeDoc?.querySelector('canvas')
                console.log('[StreetsGLIframe] Iframe debug:', {
                  hasContentWindow: !!streetsGLIframeRef.current.contentWindow,
                  hasContentDocument: !!iframeDoc,
                  hasCanvas: !!canvas,
                  canvasVisible: canvas ? window.getComputedStyle(canvas).visibility !== 'hidden' : false,
                  iframeVisible: window.getComputedStyle(streetsGLIframeRef.current).visibility !== 'hidden',
                  iframeDisplay: window.getComputedStyle(streetsGLIframeRef.current).display,
                  iframeOpacity: window.getComputedStyle(streetsGLIframeRef.current).opacity
                })
              } catch (_) { /* same-origin but document may be unready */ }
            }
          }, 2000)
        }
      } catch (_) { /* invalid iframe src URL */ }
    }
  }

  const handleIframeError = () => {
    // Iframe failed to load - server might not be available; auto-start in Electron
    console.warn('[StreetsGLIframe] Iframe failed to load - server may not be running')
    if (typeof window !== 'undefined' && window.electronAPI?.startStreetsGLServer) {
      window.electronAPI.startStreetsGLServer().then((r) => {
        if (r.started) console.log('[StreetsGLIframe] Started Streets GL server automatically')
      }).catch(() => {})
    }
  }

  if (!streetsGLIframeOverlay) return null

  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: streetsGLIframeOverlay ? (streetsGLShowUI ? 998 : 25) : -1, // Higher than viewer canvas (z-index 20)
        pointerEvents: streetsGLIframeOverlay ? 'none' : 'none',
        overflow: 'hidden',
        visibility: streetsGLIframeOverlay ? 'visible' : 'hidden',
        opacity: streetsGLIframeOverlay ? 1 : 0,
        transform: 'translateZ(0)',
        willChange: 'auto'
      }}
    >
      <iframe
        ref={streetsGLIframeRef}
        key={`streets-gl-${streetsGLGroundLat.toFixed(5)}-${streetsGLGroundLon.toFixed(5)}-${streetsGLGroundZoom || 15}-${streetsGLIframeReloadKey}-${bridgeCapability.slice(0, 8)}`}
        src={streetsGLIframeSrc}
        style={{
          position: 'absolute',
          top: '0',
          left: 0,
          right: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#87CEEB',
          pointerEvents: streetsGLIframeInteractive ? 'auto' : 'none',
          clipPath: 'none',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
        allow="fullscreen"
        title="Streets GL 3D Buildings"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />
    </div>
  )
}
