import React, { useEffect, useState, useRef } from 'react'
import { useViewer } from '../viewer/useViewer'
import { useAppStore } from '../store/useAppStore'
import { runShadowSystemTests, formatTestResults, compareWithTestDemo, ShadowTestSuite } from '../utils/shadowSystemTests'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './ShadowSystemTestPanel.css'

export default function ShadowSystemTestPanel() {
  const { viewer } = useViewer()
  const { toggleShadowSystemTestPanel } = useAppStore()
  const [testResults, setTestResults] = useState<ShadowTestSuite | null>(null)
  const [comparison, setComparison] = useState<{ matches: boolean; differences: string[] } | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 600
  const stackingOffset = usePanelStacking({ panelId: 'shadowTest', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'shadowTest'
    }
  )

  const runTests = () => {
    if (!viewer) {
      alert('Viewer not initialized')
      return
    }

    setIsRunning(true)
    
    try {
      // Check if new comprehensive tests are available
      if ((window as any).shadowSystemTests) {
        console.log('🧪 Running comprehensive shadow system tests...')
        ;(window as any).shadowSystemTests.runAll()
        alert('Tests started! Check console for detailed results.')
      } else {
        // Fallback to old tests
        const { renderer, scene, camera } = viewer
        const results = runShadowSystemTests(renderer, scene, camera, viewer)
        setTestResults(results)
        
        const comp = compareWithTestDemo(results)
        setComparison(comp)
      }
    } catch (error) {
      console.error('Error running shadow tests:', error)
      alert(`Error running tests: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }
  
  const runComprehensiveTests = async () => {
    if (!viewer) {
      alert('Viewer not initialized')
      return
    }
    
    if (!(window as any).shadowSystemTests) {
      alert('Shadow system tests not available. Make sure viewer is fully initialized.')
      return
    }
    
    setIsRunning(true)
    try {
      await (window as any).shadowSystemTests.runAll()
      alert('✅ Comprehensive tests completed! Check console for detailed results.')
    } catch (error) {
      console.error('Error running comprehensive tests:', error)
      alert(`Error: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    // Auto-run tests when viewer is ready
    if (viewer && !testResults) {
      runTests()
    }
  }, [viewer])

  const copyResults = () => {
    if (!testResults) return
    
    const formatted = formatTestResults(testResults)
    const comparisonText = comparison 
      ? `\n\n=== Comparison with Test Demo ===\n${comparison.matches ? '✅ Matches test demo' : '❌ Does not match test demo'}\n${comparison.differences.join('\n')}`
      : ''
    
    navigator.clipboard.writeText(formatted + comparisonText)
    alert('Test results copied to clipboard')
  }


  if (!viewer) {
    return (
      <div 
        ref={panelRef}
        className={`shadow-test-panel${dragging ? ' dragging' : ''}`}
        style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
      >
        <div className="shadow-test-header" onMouseDown={handleMouseDown}>
          <h3>🎯 Shadow System Tests</h3>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button 
              onClick={() => setIsMinimized(!isMinimized)} 
              className="minimize-button" 
              title={isMinimized ? "Maximize panel" : "Minimize panel"}
            >
              {isMinimized ? '□' : '−'}
            </button>
            <button className="close-button" onClick={toggleShadowSystemTestPanel}>
              ×
            </button>
          </div>
        </div>
        {!isMinimized && (
          <div className="shadow-test-content">
            <p>Waiting for viewer to initialize...</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div 
      ref={panelRef}
      className={`shadow-test-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="shadow-test-header" onMouseDown={handleMouseDown}>
        <h3>🎯 Shadow System Tests</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleShadowSystemTestPanel}>
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="shadow-test-content">
          <div className="shadow-test-actions">
            <button onClick={runTests} disabled={isRunning}>
              {isRunning ? 'Running...' : 'Run Tests'}
            </button>
            {(window as any).shadowSystemTests && (
              <button onClick={runComprehensiveTests} disabled={isRunning} style={{ marginLeft: '8px' }}>
                {isRunning ? 'Running...' : 'Run Comprehensive Tests'}
              </button>
            )}
            {testResults && (
              <button onClick={copyResults}>Copy Results</button>
            )}
          </div>
          
          {(window as any).shadowSystemTests && (
            <div style={{ marginTop: '16px', padding: '12px', background: '#1a1a1a', borderRadius: '4px', fontSize: '12px' }}>
              <strong>💡 Comprehensive Tests Available</strong>
              <p style={{ margin: '8px 0 0 0', color: '#aaa' }}>
                Use <code style={{ background: '#2a2a2a', padding: '2px 4px' }}>window.shadowSystemTests.runAll()</code> in console for detailed transition testing.
              </p>
              <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '11px' }}>
                Tests: Standard ↔ Weather GL ↔ HDR transitions with full state verification
              </p>
            </div>
          )}

          {testResults && (
            <>
              <div className="shadow-test-summary">
                <div className={`test-summary-card ${testResults.overall.failed === 0 ? 'pass' : 'fail'}`}>
                  <div className="test-summary-number">{testResults.overall.passed}</div>
                  <div className="test-summary-label">Passed</div>
                </div>
                <div className={`test-summary-card ${testResults.overall.failed > 0 ? 'fail' : 'pass'}`}>
                  <div className="test-summary-number">{testResults.overall.failed}</div>
                  <div className="test-summary-label">Failed</div>
                </div>
                <div className="test-summary-card">
                  <div className="test-summary-number">{testResults.overall.total}</div>
                  <div className="test-summary-label">Total</div>
                </div>
              </div>

              {comparison && (
                <div className={`comparison-result ${comparison.matches ? 'match' : 'mismatch'}`}>
                  <h4>Comparison with Test Demo</h4>
                  {comparison.matches ? (
                    <p className="match-text">✅ Matches test demo behavior</p>
                  ) : (
                    <div>
                      <p className="mismatch-text">❌ Does not match test demo</p>
                      <ul className="differences-list">
                        {comparison.differences.map((diff, i) => (
                          <li key={i}>{diff}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="test-sections">
                {testResults.renderer.length > 0 && (
                  <div className="test-section">
                    <h4>Renderer</h4>
                    <ul className="test-list">
                      {testResults.renderer.map((test, i) => (
                        <li key={i} className={test.passed ? 'pass' : 'fail'}>
                          {test.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {testResults.lights.length > 0 && (
                  <div className="test-section">
                    <h4>Lights</h4>
                    <ul className="test-list">
                      {testResults.lights.map((test, i) => (
                        <li key={i} className={test.passed ? 'pass' : 'fail'}>
                          {test.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {testResults.camera.length > 0 && (
                  <div className="test-section">
                    <h4>Shadow Camera</h4>
                    <ul className="test-list">
                      {testResults.camera.map((test, i) => (
                        <li key={i} className={test.passed ? 'pass' : 'fail'}>
                          {test.message}
                          {!test.passed && (
                            <div className="test-details">
                              <small>Expected: {test.expected}</small>
                              <small>Actual: {test.actual}</small>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {testResults.objects.length > 0 && (
                  <div className="test-section">
                    <h4>Objects</h4>
                    <ul className="test-list">
                      {testResults.objects.map((test, i) => (
                        <li key={i} className={test.passed ? 'pass' : 'fail'}>
                          {test.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {testResults.shadowPlane.length > 0 && (
                  <div className="test-section">
                    <h4>Shadow Plane</h4>
                    <ul className="test-list">
                      {testResults.shadowPlane.map((test, i) => (
                        <li key={i} className={test.passed ? 'pass' : 'fail'}>
                          {test.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {testResults.hdr && testResults.hdr.length > 0 && (
                  <div className="test-section">
                    <h4>HDR</h4>
                    <ul className="test-list">
                      {testResults.hdr.map((test, i) => (
                        <li key={i} className={test.passed ? 'pass' : 'fail'}>
                          {test.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

