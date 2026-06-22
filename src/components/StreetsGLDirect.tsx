import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * Direct Streets GL Integration Component
 * 
 * Instead of using an iframe, this component:
 * 1. Creates a canvas element for Streets GL
 * 2. Creates a UI container for Streets GL UI
 * 3. Dynamically imports and initializes Streets GL App
 * 4. Renders Streets GL directly in the React component tree
 */
export default function StreetsGLDirect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uiRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const appInstanceRef = useRef<any>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { 
    streetsGLIframeOverlay,
    streetsGLGroundLat,
    streetsGLGroundLon,
    streetsGLGroundZoom
  } = useAppStore()

  useEffect(() => {
    if (!streetsGLIframeOverlay || !canvasRef.current || !uiRef.current) {
      return
    }

    const canvas = canvasRef.current
    const ui = uiRef.current

    // Initialize Streets GL directly
    const initStreetsGL = async () => {
      try {
        // Try to import Streets GL App directly
        // Note: This requires proper TypeScript/Webpack configuration to resolve the path
        console.log('[StreetsGLDirect] Attempting to import Streets GL...')
        
        // Try different import paths
        let StreetsGLModule
        try {
          const modulePath = 'streets-gl-alt/app/App'
          StreetsGLModule = await import(/* @vite-ignore */ modulePath)
        } catch (e1) {
          try {
            const fallbackModulePath = '../../streets-gl-alt/src/app/App'
            StreetsGLModule = await import(/* @vite-ignore */ fallbackModulePath)
          } catch (e2) {
            const primaryError = e1 instanceof Error ? e1.message : String(e1)
            const fallbackError = e2 instanceof Error ? e2.message : String(e2)
            throw new Error(`Import failed: ${primaryError} and ${fallbackError}`)
          }
        }
        
        const { App: StreetsGLApp } = StreetsGLModule
        
        // Create new instance with our canvas and UI
        console.log('[StreetsGLDirect] Creating Streets GL App instance...')
        appInstanceRef.current = new StreetsGLApp(canvas, ui)
        setIsInitialized(true)
        console.log('[StreetsGLDirect] Streets GL initialized successfully')
      } catch (err) {
        console.error('[StreetsGLDirect] Failed to import Streets GL:', err)
        const errorMessage = err instanceof Error ? err.message : String(err)
        setError(
          `Failed to load Streets GL directly. ` +
          `This requires Streets GL to be built as a module. ` +
          `Error: ${errorMessage}. ` +
          `Falling back to iframe approach may be needed.`
        )
      }
    }

    initStreetsGL()

    return () => {
      // Cleanup - Streets GL doesn't have a destroy method, but we can clear refs
      appInstanceRef.current = null
    }
  }, [streetsGLIframeOverlay])

  if (!streetsGLIframeOverlay) {
    return null
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        zIndex: 5,
        pointerEvents: 'auto'
      }}
    >
      <div
        ref={uiRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 10
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
      {error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 0, 0, 0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 1000
        }}>
          <strong>Streets GL Error:</strong> {error}
        </div>
      )}
      {!isInitialized && !error && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 1000
        }}>
          Loading Streets GL...
        </div>
      )}
    </div>
  )
}

