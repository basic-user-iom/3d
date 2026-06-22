/**
 * Example: Integrating Path Tracer Demo into Your Viewer
 * 
 * This example shows how to integrate the PathTracerDemo into your existing viewer
 */

import { useEffect, useState, useRef } from 'react'
import { PathTracerDemo } from '../src/viewer/pathTracer/PathTracerDemo'
import PathTracerDemoPanel from '../src/components/PathTracerDemoPanel'
import ViewerCanvas from '../src/viewer/ViewerCanvas'

export default function ViewerWithPathTracer() {
  const [viewer, setViewer] = useState<any>(null)
  const [showPathTracer, setShowPathTracer] = useState(false)

  const handleViewerReady = (viewerInstance: any) => {
    setViewer(viewerInstance)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Your existing viewer */}
      <ViewerCanvas onViewerReady={handleViewerReady} />

      {/* Toggle button */}
      <button
        onClick={() => setShowPathTracer(!showPathTracer)}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 999,
          padding: '10px 20px',
          background: '#4a9eff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        {showPathTracer ? 'Hide' : 'Show'} Path Tracer
      </button>

      {/* Path tracer panel */}
      {showPathTracer && viewer && (
        <PathTracerDemoPanel
          viewer={viewer}
          onClose={() => setShowPathTracer(false)}
        />
      )}
    </div>
  )
}

/**
 * Alternative: Manual Integration Example
 */
export function ManualPathTracerIntegration() {
  const viewerRef = useRef<any>(null)
  const pathTracerRef = useRef<PathTracerDemo | null>(null)

  useEffect(() => {
    if (!viewerRef.current) return

    const { renderer, camera, scene, controls } = viewerRef.current

    // Create path tracer
    const pathTracer = new PathTracerDemo(
      {
        renderer,
        camera,
        scene,
        controls,
        resolutionScale: 1,
        tiles: 3,
      },
      {
        onProgress: (message) => console.log('Path Tracer:', message),
        onReady: () => console.log('Path Tracer Ready!'),
        onError: (error) => console.error('Path Tracer Error:', error),
      }
    )

    pathTracerRef.current = pathTracer

    // Initialize and start
    pathTracer.initialize().then(() => {
      pathTracer.start()
    })

    // Cleanup
    return () => {
      pathTracer.stop()
      pathTracer.dispose()
    }
  }, [])

  return (
    <div>
      {/* Your viewer component */}
      <ViewerCanvas onViewerReady={(viewer) => (viewerRef.current = viewer)} />

      {/* Custom controls */}
      <div style={{ position: 'absolute', top: 20, left: 20 }}>
        <button
          onClick={() => {
            if (pathTracerRef.current) {
              const pathTracer = pathTracerRef.current.getPathTracer()
              const paused = pathTracer.pausePathTracing || false
              pathTracerRef.current.setPaused(!paused)
            }
          }}
        >
          Pause/Resume
        </button>
        <button onClick={() => pathTracerRef.current?.reset()}>Reset</button>
        <button onClick={() => pathTracerRef.current?.downloadImage()}>Download</button>
      </div>
    </div>
  )
}

