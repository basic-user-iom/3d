/**
 * Streets GL Iframe Overlay Component
 * 
 * Handles the Streets GL iframe overlay and bridge initialization.
 * Extracted from App.tsx to improve code organization.
 */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { StreetsGLBridge } from '../utils/streetsGLBridge'
import { useAppStore } from '../store/useAppStore'
import { getSharedViewer, syncModelToStreetsGL } from '../viewer/useViewer'

const STREETS_GL_ALT_URL = 'http://localhost:8081'

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
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden
  )
  const streetsGLIframeRef = useRef<HTMLIFrameElement | null>(null)
  const streetsGLBridgeRef = useRef<StreetsGLBridge | null>(null)
  const lastHashRef = useRef<string>('')
  // Only log iframe load diagnostics once per page session to avoid console spam
  const hasLoggedInitialLoadRef = useRef<boolean>(false)

  const shouldRunStreetsGL =
    streetsGLIframeOverlay &&
    tabVisible &&
    (renderMode === 'city' || renderMode === 'hybrid')

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Pause Streets GL WebGL when overlay off, tab hidden, or not in City/Hybrid mode
  useEffect(() => {
    if (shouldRunStreetsGL) return
    streetsGLBridgeRef.current?.dispose()
    streetsGLBridgeRef.current = null
    useAppStore.getState().setStreetsGLBridge(null)
  }, [shouldRunStreetsGL])

  useEffect(() => {
    if (!shouldRunStreetsGL) return

    // A remounted iframe gets a new window object, so the previous bridge must be discarded.
    streetsGLBridgeRef.current?.dispose()
    streetsGLBridgeRef.current = null
    useAppStore.getState().setStreetsGLBridge(null)
  }, [shouldRunStreetsGL, streetsGLGroundLat, streetsGLGroundLon, streetsGLGroundZoom, streetsGLIframeReloadKey])

  // Sync Streets GL iframe with location changes
  useEffect(() => {
    if (!shouldRunStreetsGL) return

    const newHash = `${streetsGLGroundLat.toFixed(5)},${streetsGLGroundLon.toFixed(5)},45.00,0.00,1054.81`
    
    // Only log if the hash has actually changed
    if (lastHashRef.current !== newHash) {
      lastHashRef.current = newHash
      console.log('[StreetsGLIframe] Location changed:', { lat: streetsGLGroundLat, lon: streetsGLGroundLon, hash: newHash })
    }
  }, [shouldRunStreetsGL, streetsGLGroundLat, streetsGLGroundLon])

  const handleIframeLoad = () => {
    // Check if iframe actually loaded the Streets GL app (not error page)
    const iframe = streetsGLIframeRef.current
    if (!iframe) return

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
        streetsGLBridgeRef.current = new StreetsGLBridge(streetsGLIframeRef.current)
        streetsGLBridgeRef.current.onReady(() => {
          console.log('[StreetsGLIframe] Streets GL bridge is ready - you can now add objects to Streets GL scene!')
          // Store bridge in global state for access from other components
          useAppStore.getState().setStreetsGLBridge(streetsGLBridgeRef.current)
          
          // Sync any existing models to Streets GL
          setTimeout(async () => {
            const viewer = getSharedViewer()
            if (viewer && viewer.scene && streetsGLBridgeRef.current) {
              console.log('[StreetsGLIframe] Syncing existing models to Streets GL...')
              // Find all loaded models in the scene
              const modelsToSync: THREE.Object3D[] = []
              
              // Check direct children first (most models are added as direct children)
              viewer.scene.children.forEach((child) => {
                // Skip lights, cameras, and helper objects
                if (child instanceof THREE.Light || 
                    child instanceof THREE.Camera ||
                    child.type === 'GridHelper' ||
                    child.type === 'AxesHelper') {
                  return
                }
                if (!child.userData?.isModel) {
                  return
                }
                // Include groups and meshes that look like models
                if (child instanceof THREE.Group || child instanceof THREE.Mesh) {
                  // Only sync if it has geometry or children (actual model content)
                  if (child instanceof THREE.Mesh || 
                      (child instanceof THREE.Group && child.children.length > 0)) {
                    modelsToSync.push(child)
                  }
                }
              })
              
              // Sync each model
              modelsToSync.forEach((model) => {
                syncModelToStreetsGL(model, streetsGLBridgeRef.current!)
              })
              
              if (modelsToSync.length > 0) {
                console.log(`[StreetsGLIframe] Synced ${modelsToSync.length} existing model(s) to Streets GL`)
              } else {
                console.log('[StreetsGLIframe] No existing models found to sync')
              }
            }
          }, 500) // Wait a bit for everything to be ready
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
        key={`streets-gl-${streetsGLGroundLat.toFixed(5)}-${streetsGLGroundLon.toFixed(5)}-${streetsGLGroundZoom || 15}-${streetsGLIframeReloadKey}`}
        src={
          shouldRunStreetsGL
            ? `${STREETS_GL_ALT_URL}#${streetsGLGroundLat.toFixed(5)},${streetsGLGroundLon.toFixed(5)},45.00,0.00,2000.00`
            : 'about:blank'
        }
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


