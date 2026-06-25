/**
/**
 * Path Tracer Demo Panel Component
 * React component wrapper for the PathTracerDemo module
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { PathTracerDemo, PathTracerDemoConfig, PathTracerDemoCallbacks } from '../viewer/pathTracer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { useAppStore } from '../store/useAppStore'
import './PathTracerDemoPanel.css'

interface PathTracerDemoPanelProps {
  viewer: {
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    scene: THREE.Scene
    controls?: any
  } | null
  onClose?: () => void
}

export default function PathTracerDemoPanel({ viewer, onClose }: PathTracerDemoPanelProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const pathTracerActive = useAppStore((state) => state.pathTracerActive)
  const setPathTracerActive = useAppStore((state) => state.setPathTracerActive)
  const [isPaused, setIsPaused] = useState(false)
  const [sampleCount, setSampleCount] = useState(0)
  const [status, setStatus] = useState('Initializing...')
  const [error, setError] = useState<string | null>(null)
  const [bounces, setBounces] = useState(4) // PERFORMANCE: Default 4 bounces (was 10) - optimal for speed/quality balance
  const [minSamples, setMinSamples] = useState(0) // PERFORMANCE: Default 0 for immediate display (was 3)
  const [resolutionPreset, setResolutionPreset] = useState<'1080p' | '2k' | '4k' | '8k' | 'custom'>('1080p')
  const [resolutionScale, setResolutionScale] = useState(1)
  const [tiles, setTiles] = useState(4)
  // Default finite cap so auto-stop works out of the box; user can set ∞ by clearing the field
  const [maxSamples, setMaxSamples] = useState<number | null>(64)
  const [denoiseEnabled, setDenoiseEnabled] = useState(true)
  const [denoiseStrength, setDenoiseStrength] = useState(0.5)
  const [previewWhileInteractive, setPreviewWhileInteractive] = useState(false)
  
  // Check if ground projection is enabled - if so, include GroundedSkybox for shadows
  // Note: we no longer reinitialize the path tracer when this flag flips to avoid disruption
  const hdrGroundProjectionEnabled = useAppStore((state) => state.hdrGroundProjectionEnabled)
  const hdrEnabled = useAppStore((state) => state.hdrEnabled)
  const hdrUrl = useAppStore((state) => state.hdrUrl)
  
  const pathTracerRef = useRef<PathTracerDemo | null>(null)
  const sampleIntervalRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Track if we're paused at max to prevent race conditions in useEffect
  const isPausedAtMaxRef = useRef<boolean>(false)
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'pathTracerDemo', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'pathTracerDemo'
    }
  )
  const [uiTracerRunning, setUiTracerRunning] = useState(false)
  const tracerIsRunning = uiTracerRunning
  const [isStopping, setIsStopping] = useState(false)
  
  // Expose path tracer instance to window for viewer integration
  // CRITICAL: Use unique identifier to prevent conflicts from multiple chat sessions
  const pathTracerIdRef = useRef<string>(`pathTracer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
  useEffect(() => {
    const running = pathTracerActive && pathTracerRef.current?.isRunning()
    if (pathTracerRef.current && running) {
      ;(window as any).__pathTracerDemo = pathTracerRef.current
      ;(window as any).__pathTracerDemoRunning = true
      ;(window as any).__pathTracerDemoId = pathTracerIdRef.current
    } else if ((window as any).__pathTracerDemoId === pathTracerIdRef.current) {
      ;(window as any).__pathTracerDemoRunning = false
      delete (window as any).__pathTracerDemo
    }
    return () => {
      if ((window as any).__pathTracerDemoId === pathTracerIdRef.current) {
        ;(window as any).__pathTracerDemoRunning = false
        if (!pathTracerRef.current) {
          delete (window as any).__pathTracerDemo
          delete (window as any).__pathTracerDemoId
        }
      }
    }
  }, [pathTracerActive])

  // Initialize path tracer (but don't start automatically)
  // CRITICAL: Use ref to track if we've already initialized with this viewer to prevent reinitialization
  const initializedViewerRef = useRef<{
    renderer: THREE.WebGLRenderer | null
    camera: THREE.PerspectiveCamera | null
    scene: THREE.Scene | null
  } | null>(null)
  
  useEffect(() => {
    if (!viewer) return

    // CRITICAL: Check if we've already initialized with this exact viewer instance
    // This prevents reinitialization when the viewer prop object reference changes but the actual viewer hasn't
    const prevViewer = initializedViewerRef.current
    if (prevViewer && 
        prevViewer.renderer === viewer.renderer &&
        prevViewer.camera === viewer.camera &&
        prevViewer.scene === viewer.scene) {
      // Same viewer instance - don't reinitialize
      console.log('[PathTracerDemoPanel] Viewer prop changed but same instance - skipping reinitialization')
      return // Return WITHOUT cleanup - path tracer stays intact
    }

    // Flag to track if THIS effect actually initialized a path tracer
    // This prevents cleanup from running when early-return prevented initialization
    let didInitialize = false

    // Log viewer connection info
    console.log('[PathTracerDemoPanel] Viewer connected:', {
      hasRenderer: !!viewer.renderer,
      hasCamera: !!viewer.camera,
      hasScene: !!viewer.scene,
      hasControls: !!viewer.controls,
      rendererType: viewer.renderer?.constructor?.name,
      cameraType: viewer.camera?.constructor?.name,
      sceneType: viewer.scene?.constructor?.name,
      sceneChildren: viewer.scene?.children?.length || 0,
      isReinitialization: !!prevViewer
    })
    
    // Store current viewer instance
    initializedViewerRef.current = {
      renderer: viewer.renderer,
      camera: viewer.camera,
      scene: viewer.scene
    }

    const config: PathTracerDemoConfig = {
      renderer: viewer.renderer,
      camera: viewer.camera,
      scene: viewer.scene,
      controls: viewer.controls,
      // CRITICAL: Use current resolutionScale state (from preset selection) instead of hardcoded 0.75
      // This ensures 1080p/2k/4k/8k presets apply correctly when path tracer starts
      resolutionScale: resolutionScale, // Use current preset value (defaults to 1 for 1080p)
      tiles: 4, // 4x4 tiles for better GPU utilization
      minSamples: 0, // 0 = immediate display (was 3)
      // CRITICAL: Include GroundedSkybox when ground projection is enabled for shadow support
      // When ground projection is enabled, GroundedSkybox will be converted to PBR material to receive shadows
      // When ground projection is disabled, exclude it (path tracer uses environment map directly)
      excludeGroundedSkybox: !hdrGroundProjectionEnabled,
      groundRoughness: 0.9,
      // CRITICAL: Don't create path tracer ground plane when HDR ground projection is enabled
      // GroundedSkybox handles the ground surface and shadows - no need for separate gray ground plane
      createGroundPlane: !hdrGroundProjectionEnabled,
    }

    const callbacks: PathTracerDemoCallbacks = {
      onProgress: (message) => {
        setStatus(message)
      },
      onError: (err) => {
        console.error('[PathTracerDemoPanel] Error callback:', err)
        setError(err.message)
        setStatus('Error: ' + err.message)
      },
      onReady: () => {
        setIsInitialized(true)
        setStatus('Ready - Click Start to begin path tracing')
        // Clear any previous errors when initialization succeeds
        setError(null)
      },
      onMaxSamplesReached: ({ sampleCount, maxSamples }) => {
        console.log('[PathTracerDemoPanel] Max samples reached - pausing for capture', {
          sampleCount,
          maxSamples
        })
        // CRITICAL: Set ref FIRST to prevent race conditions
        isPausedAtMaxRef.current = true
        setStatus(`Reached ${sampleCount}/${maxSamples ?? '∞'} samples - paused for capture`)
        setIsPaused(true)
        // Keep PT active but paused so the final frame stays visible
        setPathTracerActive(true)
        // CRITICAL: Keep uiTracerRunning = true when paused at max so unified button shows "Resume"
        // The tracer is still running (just paused), so we want to show Resume, not Start
        setUiTracerRunning(true)
      }
    }

    try {
      const pathTracer = new PathTracerDemo(config, callbacks)
      pathTracerRef.current = pathTracer
      didInitialize = true // Mark that we actually created a path tracer in this effect
      
      // Expose path tracer globally for HDR system to access
      ;(window as any).__pathTracerDemo = pathTracer

      // Initialize but don't start automatically
      pathTracer.initialize().then(() => {
        // Path tracer is ready but not started
        // User must click Start button to begin
      }).catch((error) => {
        console.error('[PathTracerDemoPanel] Initialization failed:', error)
        console.error('[PathTracerDemoPanel] If you have a large model, try running window.diagnosePathTracer() for details')
        const errorMsg = error instanceof Error ? error.message : String(error)
        // Only set error if it's not already cleared by successful initialization
        // Sometimes initialization fails once but succeeds on retry
        // CRITICAL: Store timeout ID for cleanup
        const timeoutId = setTimeout(() => {
          // Check if component is still mounted and path tracer still exists
          if (pathTracerRef.current && !isInitialized) {
            // Initialization might have succeeded despite error
            try {
              if (pathTracerRef.current && typeof (pathTracerRef.current as any).isReady === 'function') {
                const isReady = (pathTracerRef.current as any).isReady()
                if (isReady) {
                  console.log('[PathTracerDemoPanel] Initialization succeeded after error - clearing error')
                  setError(null)
                  setStatus('Ready - Click Start to begin path tracing')
                  setIsInitialized(true)
                  return
                }
              }
            } catch (e) {
              // Ignore
            }
          }
          // Still failed - show error (only if component is still mounted)
          if (pathTracerRef.current) {
            setError(errorMsg)
            setStatus('Initialization Error: ' + errorMsg)
          }
        }, 1000)
        // Store timeout ID for cleanup
        ;(pathTracer as any)._initTimeoutId = timeoutId
      })

      return () => {
        // CRITICAL: Only cleanup if we actually initialized in this effect run
        // This prevents cleanup from running when early-return skipped initialization
        if (!didInitialize) {
          console.log('[PathTracerDemoPanel] Cleanup skipped - no initialization occurred in this effect')
          return
        }

        console.log('[PathTracerDemoPanel] Cleanup: disposing path tracer')
        // Cleanup timeout if it exists
        if ((pathTracer as any)._initTimeoutId) {
          clearTimeout((pathTracer as any)._initTimeoutId)
          delete (pathTracer as any)._initTimeoutId
        }
        if (sampleIntervalRef.current) {
          clearInterval(sampleIntervalRef.current)
        }
        // CRITICAL: Check if paused at max before stopping
        // If paused at max, we should still stop and restore shadow plane for cleanup
        // but we need to ensure the shadow plane is restored properly
        const isPausedAtMax = typeof (pathTracer as any).isPausedAtMax === 'function' && (pathTracer as any).isPausedAtMax()
        if (isPausedAtMax) {
          console.log('[PathTracerDemoPanel] Cleanup: Path tracer paused at max - stopping for cleanup (shadow plane will be restored)')
        }
        // Stop path tracer and restore viewer's render loop
        // This will restore the shadow plane even if paused at max (which is correct for cleanup)
        // The stop() method handles pausedAtMax with force=true correctly and restores shadow plane
        if (pathTracer.isRunning() || isPausedAtMax) {
          // Even if paused, we need to call stop to restore shadow plane and clean up
          pathTracer.stop(true)
        }
        pathTracer.dispose()
        // Clear window flags only when this panel instance owns the lock
        if ((window as any).__pathTracerDemoId === pathTracerIdRef.current) {
          ;(window as any).__pathTracerDemoRunning = false
          delete (window as any).__pathTracerDemo
          delete (window as any).__pathTracerDemoId
        }
        // Clear initialized viewer ref so we can reinitialize if needed
        initializedViewerRef.current = null
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('Failed to initialize')
    }
  }, [viewer?.renderer, viewer?.camera, viewer?.scene]) // Only reinitialize if THREE.js objects change, not if viewer wrapper changes

  // Sync store flag to tracer lifecycle
  // CRITICAL: Only depend on pathTracerActive and isInitialized to avoid stopping tracer when settings change
  // Settings are applied separately when tracer is already running
  useEffect(() => {
    const tracer = pathTracerRef.current
    if (!tracer || !isInitialized) return

    // CRITICAL: Check if paused at max FIRST (both ref and tracer method), before checking pathTracerActive
    // This prevents race conditions where pathTracerActive changes but pausedAtMax hasn't been set yet
    const isPausedAtMax = isPausedAtMaxRef.current || (typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax())
    if (isPausedAtMax) {
      // Always keep pathTracerActive true when paused at max, regardless of store state
      if (!pathTracerActive) {
        setPathTracerActive(true)
      }
      setIsPaused(true)
      // CRITICAL: Keep uiTracerRunning = true when paused at max so unified button shows "Resume"
      // The tracer is still running (just paused), so we want to show Resume, not Start
      setUiTracerRunning(true)
      // Don't overwrite status if it already says "Reached"
      setStatus((prev) => (prev.startsWith('Reached') ? prev : 'Paused (max samples)'))
      return
    }
    
    // Clear the ref if not paused at max
    isPausedAtMaxRef.current = false

    if (pathTracerActive) {
      if (!tracer.isRunning()) {
        console.log('[PathTracerDemoPanel] Starting tracer with params', {
          maxSamplesState: maxSamples,
          tracerParams: (tracer as any)?.params?.maxSamples,
          tracerConfig: (tracer as any)?.config?.maxSamples,
          tracerInternalMax: (tracer as any)?.pathTracer?.maxSamples,
          resolutionScale,
          tiles,
          bounces,
          minSamples
        })
        if ((window as any).__hdrSystem && typeof (window as any).__hdrSystem.setGroundProjectionEnabled === 'function') {
          ;(window as any).__hdrSystem.setGroundProjectionEnabled(false)
        }
        // CRITICAL: Set maxSamples FIRST before tiles/resolution changes
        // This ensures maxSamples is preserved even if tiles/resolution trigger resets
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] Starting: Setting maxSamples first:', { maxSamples, tracerMaxSamples: (tracer as any)?.params?.maxSamples })
          tracer.setMaxSamples(maxSamples)
        } else {
          console.log('[PathTracerDemoPanel] Starting: Clearing maxSamples (unlimited)')
          tracer.clearMaxSamples()
        }
        tracer.setResolutionScale(resolutionScale)
        tracer.setTiles(tiles)
        // CRITICAL: Re-apply maxSamples after tiles change (which calls reset)
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] Starting: Re-applying maxSamples after tiles change:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        }
        tracer.setPreviewWhileInteractive(previewWhileInteractive)
        tracer.setDenoise(denoiseEnabled, denoiseStrength)
        tracer.setBounces(bounces)
        tracer.setMinSamples(minSamples)
        // Clear the ref when starting
        isPausedAtMaxRef.current = false
        tracer.start()
        setIsPaused(false)
        setSampleCount(tracer.getSampleCount())
        setStatus('Running')
        setUiTracerRunning(true)
      }
      // If it was already running before mount, sync UI
      if (tracer.isRunning()) {
        setStatus('Running')
        setIsPaused(tracer['params']?.pause === true ? true : false)
        setSampleCount(tracer.getSampleCount())
        setUiTracerRunning(true)
      }
    } else {
      // CRITICAL: Double-check isPausedAtMax here as well (defensive programming)
      // Even though we checked above, state might have changed between checks
      const isPausedAtMaxDoubleCheck = isPausedAtMaxRef.current || (typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax())
      if (isPausedAtMaxDoubleCheck) {
        // Still paused at max - don't stop, keep pathTracerActive true
        console.log('[PathTracerDemoPanel] ⚠️ pathTracerActive=false but paused at max - preventing stop')
        setPathTracerActive(true)
        setIsPaused(true)
        // CRITICAL: Keep uiTracerRunning = true when paused at max so unified button shows "Resume"
        setUiTracerRunning(true)
        setStatus((prev) => (prev.startsWith('Reached') ? prev : 'Paused (max samples)'))
        return
      }
      
      // Only stop if actually running and pathTracerActive is false
      // (We already checked isPausedAtMax above, so we know it's not paused at max here)
      if (tracer.isRunning()) {
        const sampleCount = tracer.getSampleCount()
        console.log('[PathTracerDemoPanel] 🛑 Stopping tracer (pathTracerActive=false)', {
          sampleCount,
          isPausedAtMax: false
        })
        // Clear the ref when stopping
        isPausedAtMaxRef.current = false
        tracer.stop(true)
      }
      setIsPaused(false)
      setStatus((prev) => (prev.startsWith('Reached') ? prev : 'Stopped'))
      setUiTracerRunning(false)
      if ((window as any).__hdrSystem && typeof (window as any).__hdrSystem.setGroundProjectionEnabled === 'function') {
        ;(window as any).__hdrSystem.setGroundProjectionEnabled(true)
      }
    }
  }, [pathTracerActive, isInitialized, setPathTracerActive]) // CRITICAL: Only depend on pathTracerActive, not settings

  // Apply settings changes when tracer is already running (separate effect to avoid stopping)
  // CRITICAL: Use refs to track previous values to avoid unnecessary resets
  const prevSettingsRef = useRef<{
    resolutionScale: number
    tiles: number
    maxSamples: number | null
    previewWhileInteractive: boolean
    denoiseEnabled: boolean
    denoiseStrength: number
    bounces: number
    minSamples: number
  } | null>(null)
  
  useEffect(() => {
    const tracer = pathTracerRef.current
    if (!tracer || !isInitialized || !pathTracerActive || !tracer.isRunning()) {
      // Update ref even if not running
      prevSettingsRef.current = {
        resolutionScale,
        tiles,
        maxSamples,
        previewWhileInteractive,
        denoiseEnabled,
        denoiseStrength,
        bounces,
        minSamples
      }
      return
    }

    // CRITICAL: Don't apply settings if paused at max - this would call reset() and clear the pause state
    const isPausedAtMax = typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax()
    if (isPausedAtMax) {
      // Update ref but don't apply settings
      prevSettingsRef.current = {
        resolutionScale,
        tiles,
        maxSamples,
        previewWhileInteractive,
        denoiseEnabled,
        denoiseStrength,
        bounces,
        minSamples
      }
      return
    }

    // CRITICAL: Only apply settings that actually changed to avoid unnecessary resets
    const prev = prevSettingsRef.current
    if (prev) {
      // CRITICAL: Apply maxSamples FIRST before tiles/resolution changes
      // This ensures maxSamples is set correctly even if tiles/resolution trigger resets
      if (prev.maxSamples !== maxSamples) {
        console.log('[PathTracerDemoPanel] Settings: maxSamples changed, applying first (will reset accumulation)', {
          prev: prev.maxSamples,
          current: maxSamples
        })
        if (maxSamples !== null) {
          tracer.setMaxSamples(maxSamples)
        } else {
          tracer.clearMaxSamples()
        }
      }
      
      // Only apply other settings if they changed
      if (prev.resolutionScale !== resolutionScale) {
        // CRITICAL: Set maxSamples first before resolution change (which calls reset)
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] Settings: Setting maxSamples before resolution change:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        }
        tracer.setResolutionScale(resolutionScale)
        // CRITICAL: Re-apply maxSamples after resolution change (which calls reset)
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] Settings: Re-applying maxSamples after resolution change:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        }
      }
      if (prev.tiles !== tiles) {
        console.log('[PathTracerDemoPanel] Settings: Setting tiles:', { tiles, prevTiles: prev.tiles })
        tracer.setTiles(tiles)
        // CRITICAL: After tiles change (which calls reset), re-apply maxSamples to ensure it's still set
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] Settings: Re-applying maxSamples after tiles change:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        }
      }
      if (prev.previewWhileInteractive !== previewWhileInteractive) {
        tracer.setPreviewWhileInteractive(previewWhileInteractive)
      }
      if (prev.denoiseEnabled !== denoiseEnabled || prev.denoiseStrength !== denoiseStrength) {
        tracer.setDenoise(denoiseEnabled, denoiseStrength)
      }
      if (prev.bounces !== bounces) {
        tracer.setBounces(bounces)
      }
      if (prev.minSamples !== minSamples) {
        tracer.setMinSamples(minSamples)
      }
    } else {
      // First run - apply all settings
      // CRITICAL: During first run, the tracer was just initialized with these values,
      // so calling setX() methods might trigger unnecessary resets. However, we need to
      // ensure settings are synced. The setX() methods have guards to prevent resets
      // if values haven't changed, so this should be safe.
      // But we still check isPausedAtMax as a defensive measure (though it shouldn't be paused during first run)
      const isPausedAtMaxFirstRun = typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax()
      if (!isPausedAtMaxFirstRun) {
        // CRITICAL: Set maxSamples FIRST, then tiles/resolution
        // This ensures maxSamples is preserved even if tiles/resolution trigger resets
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] First run: Setting maxSamples to tracer:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        } else {
          console.log('[PathTracerDemoPanel] First run: Clearing maxSamples (unlimited)')
          tracer.clearMaxSamples()
        }
        // CRITICAL: Resolution scale change also calls reset, so set maxSamples before it
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] First run: Setting maxSamples before resolution/tiles changes:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        }
        tracer.setResolutionScale(resolutionScale)
        // CRITICAL: Re-apply maxSamples after resolution change (which calls reset)
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] First run: Re-applying maxSamples after resolution change:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        }
        tracer.setTiles(tiles)
        // CRITICAL: Re-apply maxSamples after tiles change (which calls reset)
        if (maxSamples !== null) {
          console.log('[PathTracerDemoPanel] First run: Re-applying maxSamples after tiles change:', { maxSamples })
          tracer.setMaxSamples(maxSamples)
        }
        tracer.setPreviewWhileInteractive(previewWhileInteractive)
        tracer.setDenoise(denoiseEnabled, denoiseStrength)
        tracer.setBounces(bounces)
        tracer.setMinSamples(minSamples)
      } else {
        console.warn('[PathTracerDemoPanel] ⚠️ First run but tracer is paused at max - skipping settings application')
      }
    }
    
    // Update ref after applying settings
    prevSettingsRef.current = {
      resolutionScale,
      tiles,
      maxSamples,
      previewWhileInteractive,
      denoiseEnabled,
      denoiseStrength,
      bounces,
      minSamples
    }
  }, [isInitialized, pathTracerActive, resolutionScale, tiles, maxSamples, previewWhileInteractive, denoiseEnabled, denoiseStrength, bounces, minSamples])

  // Update sample count periodically
  useEffect(() => {
    const tracer = pathTracerRef.current
    if (!pathTracerActive || !tracer || !tracer.isRunning()) return

    setSampleCount(tracer.getSampleCount())

    sampleIntervalRef.current = window.setInterval(() => {
      if (pathTracerRef.current && pathTracerRef.current.isRunning()) {
        const count = pathTracerRef.current.getSampleCount()
        setSampleCount(count)
      }
    }, 100)

    return () => {
      if (sampleIntervalRef.current) {
        clearInterval(sampleIntervalRef.current)
      }
    }
  }, [pathTracerActive])

  // If ground projection or HDR state changes while PT is running, reset accumulation to avoid blank/black output
  // CRITICAL: Use ref to track previous values to avoid resetting on every render
  const prevHdrStateRef = useRef<{ hdrGroundProjectionEnabled: boolean; hdrEnabled: boolean; hdrUrl: string | null }>({
    hdrGroundProjectionEnabled: false,
    hdrEnabled: false,
    hdrUrl: null
  })
  
  useEffect(() => {
    const tracer = pathTracerRef.current
    if (!pathTracerActive || !tracer || !tracer.isRunning()) {
      // Update ref even if not running
      prevHdrStateRef.current = {
        hdrGroundProjectionEnabled,
        hdrEnabled,
        hdrUrl
      }
      return
    }

    // CRITICAL: Don't reset if paused at max - this would clear the pause state
    const isPausedAtMax = typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax()
    if (isPausedAtMax) {
      // Update ref but don't reset
      prevHdrStateRef.current = {
        hdrGroundProjectionEnabled,
        hdrEnabled,
        hdrUrl
      }
      return
    }

    // Only reset if HDR state actually changed
    const stateChanged = 
      prevHdrStateRef.current.hdrGroundProjectionEnabled !== hdrGroundProjectionEnabled ||
      prevHdrStateRef.current.hdrEnabled !== hdrEnabled ||
      prevHdrStateRef.current.hdrUrl !== hdrUrl

    if (stateChanged) {
      console.log('[PathTracerDemoPanel] HDR state changed, resetting accumulation', {
        prev: prevHdrStateRef.current,
        current: { hdrGroundProjectionEnabled, hdrEnabled, hdrUrl }
      })
      tracer.reset()
      setIsPaused(false)
      setSampleCount(tracer.getSampleCount())
      setStatus('Running')
      prevHdrStateRef.current = {
        hdrGroundProjectionEnabled,
        hdrEnabled,
        hdrUrl
      }
    }
  }, [pathTracerActive, hdrGroundProjectionEnabled, hdrEnabled, hdrUrl])

  // If tracer is already running (e.g., started before panel opens), sync UI and store flag
  useEffect(() => {
    const tracer = pathTracerRef.current
    if (!isInitialized || !tracer) return
    
    // CRITICAL: Don't sync UI if paused at max - this would overwrite the pause status
    const isPausedAtMax = typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax()
    if (isPausedAtMax) {
      // Keep the pause state, don't overwrite it
      return
    }
    
    const running = tracer.isRunning()
    if (running) {
      if (!pathTracerActive) {
        setPathTracerActive(true)
      }
      setStatus('Running')
      setSampleCount(tracer.getSampleCount())
      setIsPaused((tracer as any)?.params?.pause === true)
      setUiTracerRunning(true)
    }
  }, [isInitialized, pathTracerActive, setPathTracerActive])

  // Ensure we drop the running flag if the panel unmounts
  // CRITICAL: Check if paused at max before stopping - if paused at max, keep it active so user can download
  useEffect(() => {
    return () => {
      const tracer = pathTracerRef.current
      const isPausedAtMax = tracer && typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax()
      
      if (isPausedAtMax) {
        console.log('[PathTracerDemoPanel] Panel unmounting but paused at max - keeping pathTracerActive for download')
        // Don't set pathTracerActive to false - let the user download the result
        // The tracer will be cleaned up when viewer changes or app closes
        return
      }
      
      setPathTracerActive(false)
    }
  }, [setPathTracerActive])

  const handleStart = useCallback(() => {
    if (isStopping) return
    if (
      (window as any).__pathTracerDemoRunning &&
      (window as any).__pathTracerDemoId !== pathTracerIdRef.current
    ) {
      setError('Path tracer is already running (camera view export or another session).')
      setStatus('Cannot start — another path tracer is active')
      return
    }
    // CRITICAL: Check if tracer is already running to prevent unnecessary state updates
    if (pathTracerRef.current?.isRunning()) {
      console.log('[PathTracerDemoPanel] Tracer already running, skipping start')
      return
    }
    
    // IMPROVED: Notify shadow coordinator that path tracer is starting
    // This preserves material/shadow states before path tracer modifies them
    const shadowCoordinator = (viewer as any)?.shadowCoordinator
    if (shadowCoordinator && typeof shadowCoordinator.onPathTracerStart === 'function') {
      shadowCoordinator.onPathTracerStart()
      console.log('[PathTracerDemoPanel] Notified shadow coordinator of path tracer start')
    }
    
    // Defer to effect to start once initialized
    setPathTracerActive(true)
    setUiTracerRunning(true)
  }, [isStopping, setPathTracerActive, viewer])

  const handleStop = useCallback(() => {
    if (isStopping) return
    // CRITICAL: Check if paused at max before stopping
    // If paused at max, warn user that stopping will clear the current render
    const isPausedAtMax = pathTracerRef.current && typeof (pathTracerRef.current as any).isPausedAtMax === 'function' && (pathTracerRef.current as any).isPausedAtMax()
    if (isPausedAtMax) {
      const confirmed = window.confirm('Path tracer is paused at max samples. Stopping will clear the current render. Continue?')
      if (!confirmed) return
      // Clear the pause state ref
      isPausedAtMaxRef.current = false
    }
    
    // IMPROVED: Notify shadow coordinator that path tracer is stopping
    // This restores material/shadow states after path tracer restoration
    const shadowCoordinator = (viewer as any)?.shadowCoordinator
    if (shadowCoordinator && typeof shadowCoordinator.onPathTracerStop === 'function') {
      // Use setTimeout to ensure path tracer's own restoration completes first
      setTimeout(() => {
        shadowCoordinator.onPathTracerStop()
        console.log('[PathTracerDemoPanel] Notified shadow coordinator of path tracer stop (state restored)')
      }, 100) // Small delay to let path tracer restoration complete
    }
    
    setIsStopping(true)
    setPathTracerActive(false)
    setStatus('Stopping...')
    setUiTracerRunning(false)
    // Restore dome for raster view
    if ((window as any).__hdrSystem && typeof (window as any).__hdrSystem.setGroundProjectionEnabled === 'function') {
      ;(window as any).__hdrSystem.setGroundProjectionEnabled(true)
    }
    // Clear stopping flag after a short delay to avoid double-stop clicks
    setTimeout(() => setIsStopping(false), 300)
  }, [isStopping, setPathTracerActive, viewer])

  const handlePause = useCallback(() => {
    if (!pathTracerRef.current) return
    
    // CRITICAL: Only allow pause/resume if tracer is actually running
    if (!pathTracerRef.current.isRunning()) {
      console.log('[PathTracerDemoPanel] Cannot pause/resume - tracer is not running')
      return
    }
    
    // CRITICAL: Check if paused at max - if so, resuming should clear the pause-at-max state
    const isPausedAtMax = typeof (pathTracerRef.current as any).isPausedAtMax === 'function' && (pathTracerRef.current as any).isPausedAtMax()
    const newPausedState = !isPaused
    
    console.log('[PathTracerDemoPanel] Pause/Resume:', {
      currentPaused: isPaused,
      newPausedState,
      isPausedAtMax,
      isRunning: pathTracerRef.current.isRunning()
    })
    
    pathTracerRef.current.setPaused(newPausedState)
    setIsPaused(newPausedState)
    
    // CRITICAL: Keep uiTracerRunning = true when paused (tracer is still running, just paused)
    // This ensures the unified Start/Resume/Pause button shows correct state
    // Only set uiTracerRunning = false when actually stopped
    if (newPausedState) {
      // Pausing - tracer is still running, just paused
      // Keep uiTracerRunning = true so button shows "Resume" not "Start"
      setStatus('Paused')
    } else {
      // Resuming - restore running state
      if (pathTracerRef.current.isRunning()) {
        setUiTracerRunning(true)
        setStatus('Running')
        // Clear pause-at-max ref if resuming from pause at max
        if (isPausedAtMax) {
          isPausedAtMaxRef.current = false
        }
      }
    }
  }, [isPaused])

  const handleReset = useCallback(() => {
    if (!pathTracerRef.current) return
    // CRITICAL: Check if paused at max before resetting
    // If paused at max, warn user that reset will clear the pause state
    const isPausedAtMax = typeof (pathTracerRef.current as any).isPausedAtMax === 'function' && (pathTracerRef.current as any).isPausedAtMax()
    if (isPausedAtMax) {
      const confirmed = window.confirm('Path tracer is paused at max samples. Resetting will clear the current render. Continue?')
      if (!confirmed) return
      // Clear the pause state ref
      isPausedAtMaxRef.current = false
    }
    
    // Store running state before reset
    const wasRunning = pathTracerRef.current.isRunning()
    
    pathTracerRef.current.reset()
    setSampleCount(0)
    setIsPaused(false)
    
    // CRITICAL: Check if tracer is still running after reset and show appropriate message
    // Reset() continues rendering if it was running, so status should reflect that
    const stillRunning = pathTracerRef.current.isRunning()
    if (stillRunning && wasRunning) {
      setStatus('Reset - Rendering continues')
      setUiTracerRunning(true)
    } else {
      setStatus('Reset - Click Start to begin')
      setUiTracerRunning(false)
    }
  }, [])

  const handleBouncesChange = useCallback((value: number) => {
    setBounces(value)
    if (pathTracerRef.current && tracerIsRunning) {
      pathTracerRef.current.setBounces(value)
    }
  }, [tracerIsRunning])

  const handleMinSamplesChange = useCallback((value: number) => {
    setMinSamples(value)
    if (pathTracerRef.current && tracerIsRunning) {
      pathTracerRef.current.setMinSamples(value)
    }
  }, [tracerIsRunning])

  const applyResolutionPreset = useCallback((preset: typeof resolutionPreset) => {
    setResolutionPreset(preset)
    const scaleMap = {
      '1080p': 1,
      '2k': 1.33,
      '4k': 2,
      '8k': 3,
      custom: resolutionScale
    } as const
    const scale = scaleMap[preset]
    setResolutionScale(scale)
    console.log('[PathTracerDemoPanel] 📐 Resolution preset applied:', { preset, scale, tracerIsRunning })
    if (pathTracerRef.current && tracerIsRunning) {
      // CRITICAL: Set maxSamples first before resolution change (which calls reset)
      const currentMaxSamples = maxSamples
      if (currentMaxSamples !== null) {
        console.log('[PathTracerDemoPanel] Resolution preset: Setting maxSamples first:', { maxSamples: currentMaxSamples })
        pathTracerRef.current.setMaxSamples(currentMaxSamples)
      }
      pathTracerRef.current.setResolutionScale(scale)
      // CRITICAL: Re-apply maxSamples after resolution change (which calls reset)
      if (currentMaxSamples !== null) {
        console.log('[PathTracerDemoPanel] Resolution preset: Re-applying maxSamples after resolution change:', { maxSamples: currentMaxSamples })
        pathTracerRef.current.setMaxSamples(currentMaxSamples)
      }
    }
  }, [resolutionScale, tracerIsRunning, maxSamples])

  const handleTilesChange = useCallback((value: number) => {
    setTiles(value)
    if (pathTracerRef.current && tracerIsRunning) {
      // CRITICAL: Set maxSamples first before tiles change (which calls reset)
      const currentMaxSamples = maxSamples
      if (currentMaxSamples !== null) {
        console.log('[PathTracerDemoPanel] Tiles change: Setting maxSamples first:', { maxSamples: currentMaxSamples })
        pathTracerRef.current.setMaxSamples(currentMaxSamples)
      }
      pathTracerRef.current.setTiles(value)
      // CRITICAL: Re-apply maxSamples after tiles change (which calls reset)
      if (currentMaxSamples !== null) {
        console.log('[PathTracerDemoPanel] Tiles change: Re-applying maxSamples after tiles change:', { maxSamples: currentMaxSamples })
        pathTracerRef.current.setMaxSamples(currentMaxSamples)
      }
    }
  }, [tracerIsRunning, maxSamples])

  const handleMaxSamplesChange = useCallback((value: number | null) => {
    const clamped = value === null ? null : Math.max(0, Math.min(20000, value))
    setMaxSamples(clamped)
    console.log('[PathTracerDemoPanel] Setting maxSamples', { input: value, clamped })
    if (pathTracerRef.current && tracerIsRunning) {
      if (clamped === null) {
        pathTracerRef.current.clearMaxSamples()
      } else {
        pathTracerRef.current.setMaxSamples(clamped)
      }
    }
  }, [tracerIsRunning])

  // Keep tracer/config in sync even when not running, so the next start respects the limit
  // CRITICAL: Only sync when tracer is NOT running to avoid resetting accumulation during rendering
  useEffect(() => {
    const tracer = pathTracerRef.current
    if (!tracer) return
    
    // CRITICAL: Don't sync if tracer is running - this would call reset() and clear accumulation
    // Only sync when not running so the next start respects the limit
    if (tracer.isRunning()) {
      // Tracer is running - don't sync (would reset accumulation)
      // The maxSamples is already set when starting (see main useEffect)
      return
    }
    
    // CRITICAL: Don't sync if paused at max - this would call reset() and clear the pause state
    const isPausedAtMax = typeof (tracer as any).isPausedAtMax === 'function' && (tracer as any).isPausedAtMax()
    if (isPausedAtMax) {
      return
    }
    
    console.log('[PathTracerDemoPanel] Syncing maxSamples to tracer (tracer not running)', {
      maxSamples,
      tracerParams: (tracer as any)?.params?.maxSamples,
      tracerConfig: (tracer as any)?.config?.maxSamples,
      tracerInternalMax: (tracer as any)?.pathTracer?.maxSamples,
      isRunning: tracer.isRunning()
    })
    
    // Only sync when not running - this ensures next start has correct maxSamples
    // but doesn't reset accumulation during rendering
    if (maxSamples === null) {
      tracer.clearMaxSamples()
    } else {
      tracer.setMaxSamples(maxSamples)
    }
  }, [maxSamples])

  const handleDenoiseToggle = useCallback((enabled: boolean) => {
    setDenoiseEnabled(enabled)
    if (pathTracerRef.current && tracerIsRunning) {
      pathTracerRef.current.setDenoise(enabled, denoiseStrength)
    }
  }, [tracerIsRunning, denoiseStrength])

  const handleDenoiseStrengthChange = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value))
    setDenoiseStrength(clamped)
    if (pathTracerRef.current && tracerIsRunning) {
      pathTracerRef.current.setDenoise(denoiseEnabled, clamped)
    }
  }, [tracerIsRunning, denoiseEnabled])

  const handlePreviewWhileInteractiveToggle = useCallback((enabled: boolean) => {
    setPreviewWhileInteractive(enabled)
    if (pathTracerRef.current && tracerIsRunning) {
      pathTracerRef.current.setPreviewWhileInteractive(enabled)
    }
  }, [tracerIsRunning])

  const applyQualityPreset = useCallback((preset: {
    label: string
    resolutionScale: number
    tiles: number
    bounces: number
    minSamples: number
    maxSamples: number | null
    denoiseEnabled?: boolean
    denoiseStrength?: number
  }) => {
    // CRITICAL: Check if the quality preset's resolutionScale matches a resolution preset
    // If it matches, preserve the resolution preset selection instead of setting to 'custom'
    // This allows both quality and resolution preset buttons to be highlighted simultaneously
    const resolutionPresetMap: Record<string, number> = {
      '1080p': 1,
      '2k': 1.33,
      '4k': 2,
      '8k': 3
    }
    
    // Find matching resolution preset
    const matchingResolutionPreset = Object.entries(resolutionPresetMap).find(
      ([_, scale]) => Math.abs(scale - preset.resolutionScale) < 0.01
    )?.[0] as '1080p' | '2k' | '4k' | '8k' | undefined
    
    // Set resolution preset to matching value, or 'custom' if no match
    if (matchingResolutionPreset) {
      setResolutionPreset(matchingResolutionPreset)
      console.log('[PathTracerDemoPanel] Quality preset matches resolution preset:', {
        qualityPreset: preset.label,
        resolutionPreset: matchingResolutionPreset,
        resolutionScale: preset.resolutionScale
      })
    } else {
      setResolutionPreset('custom')
      console.log('[PathTracerDemoPanel] Quality preset uses custom resolution:', {
        qualityPreset: preset.label,
        resolutionScale: preset.resolutionScale
      })
    }
    
    setResolutionScale(preset.resolutionScale)
    setTiles(preset.tiles)
    handleBouncesChange(preset.bounces)
    handleMinSamplesChange(preset.minSamples)
    handleMaxSamplesChange(preset.maxSamples)
    if (preset.denoiseEnabled !== undefined) {
      handleDenoiseToggle(preset.denoiseEnabled)
    }
    if (preset.denoiseStrength !== undefined) {
      handleDenoiseStrengthChange(preset.denoiseStrength)
    }
    if (pathTracerRef.current && tracerIsRunning) {
      // CRITICAL: Set maxSamples FIRST before tiles/resolution changes
      // This ensures maxSamples is preserved even if tiles/resolution trigger resets
      if (preset.maxSamples !== null) {
        console.log('[PathTracerDemoPanel] Preset: Setting maxSamples first:', { maxSamples: preset.maxSamples })
        pathTracerRef.current.setMaxSamples(preset.maxSamples)
      } else {
        pathTracerRef.current.clearMaxSamples()
      }
      pathTracerRef.current.setResolutionScale(preset.resolutionScale)
      pathTracerRef.current.setTiles(preset.tiles)
      // CRITICAL: Re-apply maxSamples after tiles change (which calls reset)
      if (preset.maxSamples !== null) {
        console.log('[PathTracerDemoPanel] Preset: Re-applying maxSamples after tiles change:', { maxSamples: preset.maxSamples })
        pathTracerRef.current.setMaxSamples(preset.maxSamples)
      }
      pathTracerRef.current.setBounces(preset.bounces)
      pathTracerRef.current.setMinSamples(preset.minSamples)
      pathTracerRef.current.setDenoise(
        preset.denoiseEnabled ?? denoiseEnabled,
        preset.denoiseStrength ?? denoiseStrength
      )
    }
  }, [denoiseEnabled, denoiseStrength, handleBouncesChange, handleMinSamplesChange, handleMaxSamplesChange, handleDenoiseToggle, handleDenoiseStrengthChange, tracerIsRunning])

  const handleDownload = useCallback(() => {
    if (!pathTracerRef.current) return
    pathTracerRef.current.downloadImage(`pathtraced-${Date.now()}.png`)
  }, [])

  if (!viewer) {
    return null
  }

  return (
    <div 
      ref={panelRef}
      className={`path-tracer-demo-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: panelTop !== undefined ? `${panelTop}px` : undefined,
        left: panelLeft !== undefined ? `${panelLeft}px` : undefined,
        maxHeight: maxHeight !== undefined ? `${maxHeight}px` : undefined,
      }}
    >
      <div className="path-tracer-demo-header" onMouseDown={handleMouseDown}>
        <h3>Path Tracer</h3>
        {onClose && <button className="close-button" onClick={onClose}>×</button>}
      </div>
      
      <div className="path-tracer-demo-content">
        {error && (
          <div className="path-tracer-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="path-tracer-section">
          <h4>Status</h4>
          <div className="path-tracer-status">
            <div className="status-item">
              <span className="label">Status:</span>
              <span className="value">{status}</span>
            </div>
            <div className="status-item">
              <span className="label">Samples:</span>
              <span className="value">{sampleCount}</span>
            </div>
            <div className="status-item">
              <span className="label">Max Samples:</span>
              <span className="value">{maxSamples ?? '∞'}</span>
            </div>
            <div className="status-item">
              <span className="label">Tracer:</span>
              <span className="value">
                {!tracerIsRunning ? 'Stopped' : isPaused ? 'Paused' : 'Running'}
              </span>
            </div>
          </div>
        </div>

        <div className="path-tracer-section">
          <h4>Resolution Presets</h4>
          <div className="path-tracer-presets">
            {(['1080p', '2k', '4k', '8k'] as const).map((preset) => (
              <button
                key={preset}
                className={`path-tracer-button button-secondary ${resolutionPreset === preset ? 'active' : ''}`}
                disabled={!isInitialized}
                onClick={() => applyResolutionPreset(preset)}
              >
                {preset.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="path-tracer-status">
            <div className="status-item">
              <label className="label">Resolution Scale:</label>
              <input
                type="number"
                step="0.05"
                min="0.25"
                max="4"
                value={resolutionScale}
                onChange={(e) => {
                  const val = Math.max(0.25, Math.min(4, parseFloat(e.target.value) || 1))
                  setResolutionPreset('custom')
                  setResolutionScale(val)
                  if (pathTracerRef.current && tracerIsRunning) {
                    // CRITICAL: Set maxSamples first before resolution change (which calls reset)
                    const currentMaxSamples = maxSamples
                    if (currentMaxSamples !== null) {
                      console.log('[PathTracerDemoPanel] Resolution scale input: Setting maxSamples first:', { maxSamples: currentMaxSamples })
                      pathTracerRef.current.setMaxSamples(currentMaxSamples)
                    }
                    pathTracerRef.current.setResolutionScale(val)
                    // CRITICAL: Re-apply maxSamples after resolution change (which calls reset)
                    if (currentMaxSamples !== null) {
                      console.log('[PathTracerDemoPanel] Resolution scale input: Re-applying maxSamples after resolution change:', { maxSamples: currentMaxSamples })
                      pathTracerRef.current.setMaxSamples(currentMaxSamples)
                    }
                  }
                }}
                disabled={!isInitialized}
                style={{ width: '80px', padding: '2px 4px' }}
              />
            </div>
            <div className="status-item">
              <label className="label">Tiles:</label>
              <input
                type="number"
                min="1"
                max="8"
                value={tiles}
                onChange={(e) => handleTilesChange(parseInt(e.target.value) || 4)}
                disabled={!isInitialized}
                style={{ width: '60px', padding: '2px 4px' }}
              />
            </div>
          </div>
        </div>

        <div className="path-tracer-section">
          <h4>Quality Presets</h4>
          <div className="path-tracer-presets">
            {[
              { label: 'Fast', resolutionScale: 1, tiles: 2, bounces: 2, minSamples: 0, maxSamples: 64, denoiseEnabled: true, denoiseStrength: 0.35 },
              { label: 'Balanced', resolutionScale: 1.33, tiles: 3, bounces: 4, minSamples: 1, maxSamples: 128, denoiseEnabled: true, denoiseStrength: 0.5 },
              { label: 'High', resolutionScale: 2, tiles: 4, bounces: 6, minSamples: 2, maxSamples: 256, denoiseEnabled: true, denoiseStrength: 0.65 },
              { label: 'Ultra', resolutionScale: 3, tiles: 4, bounces: 8, minSamples: 3, maxSamples: 512, denoiseEnabled: true, denoiseStrength: 0.8 }
            ].map((preset) => {
              // Check if this preset matches current settings
              const isActive = 
                Math.abs(resolutionScale - preset.resolutionScale) < 0.01 &&
                tiles === preset.tiles &&
                bounces === preset.bounces &&
                minSamples === preset.minSamples &&
                maxSamples === preset.maxSamples &&
                denoiseEnabled === (preset.denoiseEnabled ?? true) &&
                Math.abs(denoiseStrength - (preset.denoiseStrength ?? 0.5)) < 0.01
              
              return (
                <button
                  key={preset.label}
                  className={`path-tracer-button button-secondary ${isActive ? 'active' : ''}`}
                  disabled={!isInitialized}
                  onClick={() => applyQualityPreset(preset)}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="path-tracer-section">
          <h4>Sampling</h4>
          <div className="path-tracer-status">
            <div className="status-item">
              <label className="label" htmlFor="bounces-input">Bounces:</label>
              <input
                id="bounces-input"
                type="number"
                min="1"
                max="20"
                value={bounces}
                onChange={(e) => handleBouncesChange(parseInt(e.target.value) || 4)}
                disabled={!isInitialized}
                className="value"
                style={{ width: '60px', padding: '2px 4px' }}
              />
            </div>
            <div className="status-item">
              <label className="label" htmlFor="samples-input">Min Samples:</label>
              <input
                id="samples-input"
                type="number"
                min="0"
                max="100"
                value={minSamples}
                onChange={(e) => handleMinSamplesChange(parseInt(e.target.value) || 0)}
                disabled={!isInitialized}
                className="value"
                style={{ width: '60px', padding: '2px 4px' }}
              />
            </div>
            <div className="status-item">
              <label className="label" htmlFor="max-samples-input">Max Samples:</label>
              <input
                id="max-samples-input"
                type="number"
                min="0"
                max="20000"
                value={maxSamples ?? ''}
                placeholder="∞"
                onChange={(e) => {
                  const raw = e.target.value
                  const parsed = raw === '' ? null : Number(raw)
                  const val = parsed === null || Number.isNaN(parsed) ? null : parsed
                  handleMaxSamplesChange(val)
                }}
                disabled={!isInitialized}
                className="value"
                style={{ width: '80px', padding: '2px 4px' }}
              />
            </div>
          </div>
        </div>

        <div className="path-tracer-section">
          <h4>Denoise</h4>
          <div className="path-tracer-status">
            <div className="status-item">
              <label className="label" htmlFor="denoise-toggle">Enable:</label>
              <input
                id="denoise-toggle"
                type="checkbox"
                checked={denoiseEnabled}
                onChange={(e) => handleDenoiseToggle(e.target.checked)}
                disabled={!isInitialized}
              />
            </div>
            <div className="status-item">
              <label className="label" htmlFor="denoise-strength">Strength:</label>
              <input
                id="denoise-strength"
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={denoiseStrength}
                onChange={(e) => handleDenoiseStrengthChange(parseFloat(e.target.value) || 0)}
                disabled={!isInitialized || !denoiseEnabled}
                className="value"
                style={{ width: '80px', padding: '2px 4px' }}
              />
            </div>
          </div>
        </div>

        <div className="path-tracer-section">
          <h4>Interaction</h4>
          <div className="path-tracer-status">
            <div className="status-item">
              <label className="label" htmlFor="preview-interactive-toggle">Raster preview while moving:</label>
              <input
                id="preview-interactive-toggle"
                type="checkbox"
                checked={previewWhileInteractive}
                onChange={(e) => handlePreviewWhileInteractiveToggle(e.target.checked)}
                disabled={!isInitialized}
              />
            </div>
            <small style={{ gridColumn: '1 / -1', color: '#bbb', marginTop: '6px' }}>
              When off, keeps the last GPU path-traced frame during interaction (no raster fallback).
            </small>
          </div>
        </div>

        <div className="path-tracer-section">
          <h4>Controls</h4>
          <div className="path-tracer-controls">
            {/* Unified Start/Resume/Pause button */}
            {/* Show Start when not running and not paused */}
            {!tracerIsRunning && !isPaused ? (
              <button
                onClick={handleStart}
                disabled={!isInitialized}
                className="path-tracer-button button-start"
              >
                Start
              </button>
            ) : /* Show Resume when paused (either manually paused or paused at max) */
            isPaused ? (
              <button
                onClick={handlePause}
                disabled={!isInitialized}
                className="path-tracer-button button-start"
              >
                Resume
              </button>
            ) : /* Show Pause when running and not paused */
            tracerIsRunning ? (
              <button
                onClick={handlePause}
                disabled={!isInitialized}
                className="path-tracer-button button-secondary"
              >
                Pause
              </button>
            ) : /* Fallback - should not happen */
            (
              <button
                onClick={handleStart}
                disabled={!isInitialized}
                className="path-tracer-button button-start"
              >
                Start
              </button>
            )}
            
            {/* Stop button - available when running OR paused (paused-at-max case) */}
            {(tracerIsRunning || isPaused) && (
              <button
                onClick={handleStop}
                disabled={!isInitialized}
                className="path-tracer-button button-stop"
              >
                Stop
              </button>
            )}
            
            <button
              onClick={handleReset}
              disabled={!isInitialized}
              className="path-tracer-button button-secondary"
            >
              Reset
            </button>
            
            <button
              onClick={handleDownload}
              disabled={!isInitialized}
              className="path-tracer-button button-download"
            >
              Download Image
            </button>
          </div>
        </div>

        <div className="path-tracer-info">
          <small>
            Path tracing renders progressively. More samples = better quality but slower.
            Use mouse to orbit, scroll to zoom.
          </small>
        </div>
      </div>
    </div>
  )
}

