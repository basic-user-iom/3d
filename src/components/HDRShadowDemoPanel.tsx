import React, { useEffect, useState, useRef } from 'react'
import * as THREE from 'three'
import { useViewer } from '../viewer/useViewer'
import { useAppStore } from '../store/useAppStore'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { createHDRShadowDemo, testHDRShadows } from '../utils/hdrShadowDemo'
import './HDRShadowDemoPanel.css'

export default function HDRShadowDemoPanel() {
  const { viewer } = useViewer()
  const { toggleHDRShadowDemoPanel } = useAppStore()
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    details: any
  } | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [demoCreated, setDemoCreated] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'hdrShadowDemo', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'hdrShadowDemo'
    }
  )

  const createDemo = () => {
    if (!viewer) {
      alert('Viewer not initialized')
      return
    }

    try {
      // Cleanup existing demo if any
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }

      const { scene, renderer, hdrSystem } = viewer
      const demo = createHDRShadowDemo(scene, renderer)
      cleanupRef.current = demo.cleanup
      setDemoCreated(true)
      setTestResult(null)
      
      // CRITICAL: Apply HDR to demo objects if HDR is already loaded
      if (hdrSystem && hdrSystem.getPMREMMap()) {
        const envMap = hdrSystem.getPMREMMap()
        const intensity = (hdrSystem as any).config?.intensity || 1.0
        
        if (envMap) {
          console.log('[HDRShadowDemoPanel] Applying HDR to demo objects...')
          
          // Apply to all demo objects
          demo.objects.forEach((obj) => {
            const mat = obj.material
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
              mat.envMap = envMap
              mat.envMapIntensity = intensity
              mat.needsUpdate = true
            }
          })
          
          // Apply to ground
          const groundMat = demo.ground.material
          if (groundMat instanceof THREE.MeshStandardMaterial || groundMat instanceof THREE.MeshPhysicalMaterial) {
            groundMat.envMap = envMap
            groundMat.envMapIntensity = intensity
            groundMat.needsUpdate = true
          }
          
          console.log('[HDRShadowDemoPanel] ✅ Applied HDR to demo objects')
        }
      }
      
      console.log('[HDRShadowDemoPanel] Demo created successfully')
    } catch (error) {
      console.error('[HDRShadowDemoPanel] Failed to create demo:', error)
      alert(`Failed to create demo: ${error}`)
    }
  }

  const runTest = async () => {
    if (!viewer) {
      alert('Viewer not initialized')
      return
    }

    setIsRunning(true)
    
    try {
      const { scene, renderer, hdrSystem } = viewer
      const result = await testHDRShadows(scene, renderer, hdrSystem)
      setTestResult(result)
    } catch (error) {
      console.error('[HDRShadowDemoPanel] Test failed:', error)
      setTestResult({
        success: false,
        message: `Error: ${error}`,
        details: {}
      })
    } finally {
      setIsRunning(false)
    }
  }

  const cleanupDemo = () => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
      setDemoCreated(false)
      setTestResult(null)
      console.log('[HDRShadowDemoPanel] Demo cleaned up')
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
      }
    }
  }, [])


  if (!viewer) {
    return (
      <div 
        ref={panelRef}
        className={`hdr-shadow-demo-panel${dragging ? ' dragging' : ''}`}
        style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
      >
        <div className="hdr-shadow-demo-header" onMouseDown={handleMouseDown}>
          <h3>🎯 HDR Shadow Demo</h3>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button 
              onClick={() => setIsMinimized(!isMinimized)} 
              className="minimize-button" 
              title={isMinimized ? "Maximize panel" : "Minimize panel"}
            >
              {isMinimized ? '□' : '−'}
            </button>
            <button className="close-button" onClick={toggleHDRShadowDemoPanel}>
              ×
            </button>
          </div>
        </div>
        {!isMinimized && (
          <div className="hdr-shadow-demo-content">
            <p>Waiting for viewer to initialize...</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div 
      ref={panelRef}
      className={`hdr-shadow-demo-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="hdr-shadow-demo-header" onMouseDown={handleMouseDown}>
        <h3>🎯 HDR Shadow Demo</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleHDRShadowDemoPanel}>
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="hdr-shadow-demo-content">
          <div className="hdr-shadow-demo-actions">
            <button onClick={createDemo} disabled={demoCreated}>
              {demoCreated ? 'Demo Created' : 'Create Demo Objects'}
            </button>
            <button onClick={runTest} disabled={isRunning || !demoCreated}>
              {isRunning ? 'Testing...' : 'Test Shadows + HDR'}
            </button>
            {demoCreated && (
              <button onClick={cleanupDemo} style={{ background: '#ff4444' }}>
                Cleanup Demo
              </button>
            )}
          </div>

          <div className="hdr-shadow-demo-instructions">
            <h4>Instructions:</h4>
            <ol>
              <li>Click "Create Demo Objects" to add test objects to the scene</li>
              <li>Load an HDR file (use the HDR panel or Lighting panel)</li>
              <li>Click "Test Shadows + HDR" to verify both work together</li>
              <li>Check the console for detailed logs</li>
            </ol>
            <p style={{ marginTop: '12px', fontSize: '12px', color: '#aaa' }}>
              <strong>HDR File Path:</strong><br />
              D:\ai-cursor\3d-test-software\files-upload\skidpan_8k.hdr
            </p>
          </div>

          {testResult && (
            <div className={`hdr-shadow-demo-result ${testResult.success ? 'success' : 'warning'}`}>
              <h4>Test Result</h4>
              <p className="result-message">{testResult.message}</p>
              {testResult.details && Object.keys(testResult.details).length > 0 && (
                <div className="result-details">
                  <h5>Details:</h5>
                  <ul>
                    {Object.entries(testResult.details).map(([key, value]) => (
                      <li key={key}>
                        <strong>{key}:</strong> {String(value)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {demoCreated && (
            <div className="hdr-shadow-demo-status">
              <p>✅ Demo objects created in scene</p>
              <p style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
                You should see 5 colored objects (boxes, sphere, cylinder) on a gray ground plane.
                Shadows should be visible on the ground.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

