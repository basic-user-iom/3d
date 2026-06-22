// @ts-nocheck

import { useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import * as THREE from 'three'
import { MeshoptSimplifier } from 'meshoptimizer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import './OptimizationPanel.css'

export default function OptimizationPanel() {
  const { showOptimizationPanel, toggleOptimizationPanel, setLoading, setProgress, setError, setLoadingMessage } = useAppStore()
  const { viewer, reset } = useViewer()
  const [targetTriangles, setTargetTriangles] = useState(50) // Percentage (50% = keep 50% of triangles)
  const [isMinimized, setIsMinimized] = useState(false)
  const progressTimerRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'optimization', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'optimization'
    }
  )

  if (!showOptimizationPanel) return null

  const simplifyModel = async () => {
    if (!viewer?.scene) {
      setError('No model loaded. Please load a model first.')
      return
    }

    setLoading(true)
    setProgress(0)
    setLoadingMessage('Simplifying geometry...')
    setError(null)

    try {
      let totalSimplified = 0
      let totalOriginal = 0
      let skippedCount = 0
      let optimizedCount = 0
      let errorCount = 0

      // Find all mesh objects in the scene
      const meshes: THREE.Mesh[] = []
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) {
          meshes.push(obj)
        }
      })

      if (meshes.length === 0) {
        throw new Error('No mesh geometry found in the loaded model')
      }

      console.log(`Found ${meshes.length} meshes to optimize`)

      // Process meshes in batches to avoid stack overflow
      // Large models (9000+ meshes) can cause stack overflow if processed synchronously
      const BATCH_SIZE = 100 // Process 100 meshes at a time
      const BATCH_DELAY = 10 // 10ms delay between batches to allow UI updates
      
      // Process each mesh in batches
      for (let batchStart = 0; batchStart < meshes.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, meshes.length)
        
        // Process batch
        for (let i = batchStart; i < batchEnd; i++) {
        const mesh = meshes[i]
        const geometry = mesh.geometry
        const meshName = mesh.name || `Mesh ${i + 1}`
        
        // Update progress
        setProgress(((i / meshes.length) * 80))
        setLoadingMessage(`Processing mesh ${i + 1}/${meshes.length}...`)

        // Get position attributes
        const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute
        if (!positionAttribute) {
          console.log(`${meshName}: No position attribute, skipping`)
          continue
        }

        const indexAttribute = geometry.getIndex()
        
        if (!indexAttribute) {
          // Skip meshes without indices for now
          console.log(`${meshName}: No indices found, skipping`)
          continue
        }

        // Get typed arrays directly (avoid Array.from for large arrays to prevent memory issues)
        const indexArray = geometry.getIndex()!.array
        const positionArray = positionAttribute.array
        const originalTriangles = Math.floor(indexArray.length / 3)
        const vertexCount = positionAttribute.count
        
        // Validate geometry before processing
        if (originalTriangles < 4) {
          console.log(`${meshName}: Too small (${originalTriangles} triangles), skipping`)
          totalOriginal += originalTriangles
          totalSimplified += originalTriangles
          continue
        }
        
        // Skip extremely large meshes that might cause stack overflow
        // Meshes with >1M triangles can cause stack overflow during simplification
        if (originalTriangles > 1000000) {
          console.warn(`${meshName}: Too large (${originalTriangles.toLocaleString()} triangles), skipping to prevent stack overflow`)
          totalOriginal += originalTriangles
          totalSimplified += originalTriangles
          skippedCount++
          continue
        }
        
        // Validate indices are in bounds (use loop to avoid stack overflow with large arrays)
        // Check first few and last few indices as a quick validation
        let maxIndex = indexArray[0]
        let minIndex = indexArray[0]
        const checkCount = Math.min(1000, indexArray.length) // Check up to 1000 indices for validation
        for (let j = 0; j < checkCount; j++) {
          const idx = indexArray[j]
          if (idx > maxIndex) maxIndex = idx
          if (idx < minIndex) minIndex = idx
        }
        // Also check last few indices
        if (indexArray.length > checkCount) {
          for (let j = indexArray.length - checkCount; j < indexArray.length; j++) {
            const idx = indexArray[j]
            if (idx > maxIndex) maxIndex = idx
            if (idx < minIndex) minIndex = idx
          }
        }
        if (minIndex < 0 || maxIndex >= vertexCount) {
          console.warn(`${meshName}: Invalid indices (range: ${minIndex}-${maxIndex}, vertices: ${vertexCount}), skipping`)
          totalOriginal += originalTriangles
          totalSimplified += originalTriangles
          continue
        }
        
        // Validate position array length
        if (positionArray.length !== vertexCount * 3) {
          console.warn(`${meshName}: Invalid position array length (expected ${vertexCount * 3}, got ${positionArray.length}), skipping`)
          totalOriginal += originalTriangles
          totalSimplified += originalTriangles
          continue
        }
        
        totalOriginal += originalTriangles

        // Simplify to target percentage of triangles
        const targetTriCount = Math.floor((targetTriangles / 100) * originalTriangles)
        
        // Skip if target is larger than original or too small
        if (targetTriCount >= originalTriangles || targetTriCount < 4) {
          console.log(`${meshName}: Skipping (original=${originalTriangles}, target=${targetTriCount})`)
          totalSimplified += originalTriangles
          skippedCount++
          continue
        }
        
        console.log(`${meshName}: Original=${originalTriangles} triangles, Target=${targetTriCount} triangles`)

        // Use meshoptimizer to simplify with error handling
        let simplified: Uint32Array | null = null
        try {
          // MeshoptSimplifier requires manifold geometry and can fail with "Assertion failed"
          // Wrap in try-catch to handle non-manifold meshes gracefully
          // Use typed arrays directly (avoid Array.from for large arrays)
          const indicesTyped = indexArray instanceof Uint32Array ? indexArray : new Uint32Array(indexArray)
          const positionsTyped = positionArray instanceof Float32Array ? positionArray : new Float32Array(positionArray)
          
          const simplifyResult = MeshoptSimplifier.simplify(
            indicesTyped,
            positionsTyped,
            3, // position stride
            targetTriCount * 3, // target index count (triangles * 3)
            0.01 // error threshold (optional, helps with quality)
          )
          
          // Handle both array result and direct result
          simplified = Array.isArray(simplifyResult) ? simplifyResult[0] : simplifyResult as Uint32Array
          
          if (!simplified || simplified.length < 3) {
            throw new Error('Simplification returned invalid result')
          }
        } catch (simplifyError: any) {
          // MeshoptSimplifier can fail for:
          // - Non-manifold geometry (holes, non-closed surfaces)
          // - Invalid topology
          // - Stack overflow for very large meshes
          const errorMsg = simplifyError?.message || String(simplifyError)
          const isAssertionError = errorMsg.includes('Assertion failed') || errorMsg.includes('assertion')
          const isStackOverflow = errorMsg.includes('Maximum call stack size exceeded') || 
                                 errorMsg.includes('stack') ||
                                 errorMsg.includes('Stack')
          
          const errorType = isStackOverflow 
            ? 'stack overflow (mesh too large)' 
            : isAssertionError 
            ? 'non-manifold/invalid geometry' 
            : errorMsg
          
          console.warn(`${meshName}: MeshoptSimplifier failed (${errorType}), skipping this mesh`)
          totalSimplified += originalTriangles
          skippedCount++
          errorCount++
          continue
        }

        const newTriangles = Math.floor(simplified.length / 3)
        totalSimplified += newTriangles
        optimizedCount++
        console.log(`${meshName}: Simplified to ${newTriangles} triangles (${(newTriangles/originalTriangles*100).toFixed(1)}%)`)

        // Update geometry with simplified indices
        geometry.setIndex(new THREE.BufferAttribute(simplified, 1))
        
        // Remove old index if it exists
        geometry.index!.needsUpdate = true
        
        // Dispose old attributes if needed
        geometry.computeVertexNormals()
        geometry.computeBoundingSphere()
        geometry.computeBoundingBox()
        }
        
        // Yield to browser between batches to prevent stack overflow and allow UI updates
        if (batchEnd < meshes.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
        }
      }

      setProgress(100)
      setLoadingMessage('Optimization complete!')
      
      const reduction = totalOriginal > 0 ? ((totalOriginal - totalSimplified) / totalOriginal * 100).toFixed(1) : '0'
      setError(null)
      
      // Build summary message
      let summary = `✅ Optimization complete!\n\n`
      summary += `Original: ${totalOriginal.toLocaleString()} triangles\n`
      summary += `Optimized: ${totalSimplified.toLocaleString()} triangles\n`
      summary += `Reduction: ${reduction}%\n\n`
      summary += `Meshes processed: ${meshes.length}\n`
      summary += `Successfully optimized: ${optimizedCount}\n`
      if (skippedCount > 0) {
        summary += `Skipped: ${skippedCount} (too small, invalid, or non-manifold)`
      }
      if (errorCount > 0) {
        summary += `\nErrors: ${errorCount} (non-manifold geometry cannot be simplified)`
      }
      
      setTimeout(() => {
        setLoading(false)
        setProgress(0)
        setLoadingMessage(null)
        alert(summary)
      }, 500)

    } catch (err) {
      console.error('Simplification error:', err)
      setError(err instanceof Error ? err.message : 'Failed to simplify model')
      setLoading(false)
      setProgress(0)
      setLoadingMessage(null)
    }
  }

  const hasModel = viewer?.scene ? (() => {
    let found = false
    viewer.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        found = true
      }
    })
    return found
  })() : false

  return (
    <div
      ref={panelRef}
      className={`optimization-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="optimization-panel-header" onMouseDown={handleMouseDown}>
        <h3>🔧 Optimization Tools</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleOptimizationPanel}>
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
      <div className="optimization-panel-content">
        {hasModel ? (
          <div className="optimization-section">
            <h4>⚡ In-Browser Optimization</h4>
            <p className="section-description">
              Simplify loaded geometry to improve performance
            </p>
            
            <div className="tool-item">
              <h5>Mesh Simplification</h5>
              <p className="tool-description">
                Reduce polygon count of loaded model using your PC's resources
              </p>
              
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                <span style={{ color: '#b0b0b0', fontSize: '13px' }}>
                  Target triangles (%): {targetTriangles}%
                </span>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="5"
                  value={targetTriangles}
                  onChange={(e) => setTargetTriangles(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888' }}>
                  <span>10% (Very low)</span>
                  <span>50% (Balanced)</span>
                  <span>90% (Preserve detail)</span>
                </div>
              </label>

              <button
                onClick={simplifyModel}
                className="button-primary"
                style={{ marginTop: '12px', width: '100%' }}
              >
                Simplify Current Model
              </button>
              
              <div className="instructions" style={{ marginTop: '12px' }}>
                <strong>How it works:</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  <li>Processes geometry locally in your browser</li>
                  <li>Reduces polygon count while preserving shape</li>
                  <li>Great for reducing file sizes without external tools</li>
                </ul>
              </div>
            </div>

            <div className="tool-item" style={{ marginTop: '24px' }}>
              <h5>LOD (Level of Detail) Test</h5>
              <p className="tool-description">
                Test LOD generation for high-triangle-count models. Analyzes the current model and generates LOD levels for performance optimization.
              </p>
              
              <button
                onClick={async () => {
                  console.log('[Optimization Panel] LOD test button clicked')
                  
                  if (typeof (window as any).testLODGeneration === 'function') {
                    try {
                      console.log('[Optimization Panel] Calling testLODGeneration...')
                      const result = await (window as any).testLODGeneration()
                      if (result) {
                        console.log('[Optimization Panel] LOD test result:', result)
                        alert(`LOD Test Complete!\n\nTotal Meshes: ${result.meshCount}\nTotal Triangles: ~${Math.round(result.totalTriangles / 1000)}K\nLOD Enabled: ${result.enabled ? 'Yes' : 'No'}\n\nCheck console (F12) for detailed results.`)
                      }
                    } catch (error: any) {
                      console.error('[Optimization Panel] Error running LOD test:', error)
                      alert('Error running LOD test. Check console (F12) for details.')
                    }
                  } else {
                    console.error('[Optimization Panel] testLODGeneration function not available')
                    alert('LOD test function not available. Please wait for the page to fully load.')
                  }
                }}
                className="button-primary"
                style={{ marginTop: '12px', width: '100%' }}
              >
                🧪 Test LOD Generation
              </button>
              
              <div className="instructions" style={{ marginTop: '12px' }}>
                <strong>What it does:</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  <li>Analyzes mesh count and triangle count</li>
                  <li>Checks if LOD threshold is met (&gt;500K triangles)</li>
                  <li>Generates LOD for meshes with &gt;1000 triangles</li>
                  <li>Shows results in browser console (F12)</li>
                </ul>
                <p style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>
                  💡 <strong>Note:</strong> Results are displayed in the browser console. Open DevTools (F12) to see detailed output.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="optimization-section">
            <div className="warning-box">
              <p>
                <strong>No model loaded</strong>
              </p>
              <p style={{ marginTop: '8px', fontSize: '12px' }}>
                Load a 3D model first to use in-browser optimization tools.
              </p>
            </div>
          </div>
        )}

        <div className="optimization-section">
          <h4>💻 Local Converter Tools</h4>
          <p className="section-description">
            Download and run these tools on your PC to convert FBX files locally
          </p>

          <div className="tool-item">
            <h5>FBX2glTF - Best for Command Line</h5>
            <p className="tool-description">
              Professional command-line tool. Run locally on your PC for maximum speed and control.
            </p>
            <div className="tool-links">
              <a href="https://github.com/facebookincubator/FBX2glTF/releases" target="_blank" rel="noopener noreferrer">
                Download for Windows
              </a>
              <span className="separator">|</span>
              <a href="https://github.com/facebookincubator/FBX2glTF/releases" target="_blank" rel="noopener noreferrer">
                Download for Mac/Linux
              </a>
            </div>
            <div className="instructions">
              <strong>Quick Start:</strong>
              <ol>
                <li>Download the latest release for your OS</li>
                <li>Extract the ZIP file</li>
                <li>Run: <code>FBX2glTF.exe -i input.fbx -o output.glb</code></li>
                <li>Add <code>--draco</code> for 50-90% compression</li>
              </ol>
              <p style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>
                💡 <strong>Pro tip:</strong> Drag the executable into a folder, then open terminal there
              </p>
            </div>
          </div>

          <div className="tool-item">
            <h5>Blender - Best for GUI Users</h5>
            <p className="tool-description">
              Powerful 3D modeling software with built-in FBX import and glTF export. Free and open-source.
            </p>
            <div className="tool-links">
              <a href="https://www.blender.org/download/" target="_blank" rel="noopener noreferrer">
                Download Blender
              </a>
            </div>
            <div className="instructions">
              <strong>Export Steps:</strong>
              <ol>
                <li>File → Import → FBX (.fbx)</li>
                <li>Select your model</li>
                <li>File → Export → glTF 2.0 (.glb/.gltf)</li>
                <li>Enable compression in export settings</li>
              </ol>
            </div>
          </div>

          <div className="tool-item">
            <h5>Online Converters</h5>
            <p className="tool-description">
              Browser-based converters for quick one-off conversions (limited file size).
            </p>
            <div className="tool-links">
              <a href="https://products.aspose.app/3d/conversion/fbx-to-gltf" target="_blank" rel="noopener noreferrer">
                Aspose Converter
              </a>
              <span className="separator">|</span>
              <a href="https://cloudconvert.com/fbx-to-gltf" target="_blank" rel="noopener noreferrer">
                CloudConvert
              </a>
            </div>
          </div>
        </div>

        <div className="optimization-section">
          <h4>Optimization Tips</h4>
          
          <div className="tip-item">
            <h5>🎯 Format Benefits</h5>
            <ul>
              <li><strong>glTF/GLB:</strong> 60-80% smaller than FBX, loads 3-5x faster</li>
              <li><strong>Draco Compression:</strong> Reduces geometry size by 50-90%</li>
              <li><strong>Texture Compression:</strong> Use KTX2 for web-optimized textures</li>
            </ul>
          </div>

          <div className="tip-item">
            <h5>📐 Geometry Optimization</h5>
            <ul>
              <li>Reduce polygon count using decimation tools</li>
              <li>Remove hidden/invisible geometry</li>
              <li>Merge duplicate materials</li>
              <li>Use LODs for distant objects</li>
            </ul>
          </div>

          <div className="tip-item">
            <h5>🖼️ Texture Optimization</h5>
            <ul>
              <li>Resize textures to appropriate resolution (1024-2048px)</li>
              <li>Use power-of-two dimensions</li>
              <li>Compress with JPEG/WebP</li>
              <li>Remove unused texture channels</li>
            </ul>
          </div>

          <div className="tip-item">
            <h5>⚡ Performance Tips</h5>
            <ul>
              <li>Target file size: under 100MB for smooth loading</li>
              <li>Keep polygon count under 500K triangles</li>
              <li>Limit texture resolution to 2048x2048</li>
              <li>Use instancing for repeated objects</li>
            </ul>
          </div>
        </div>

        <div className="optimization-section">
          <h4>⚠️ Browser Limitations</h4>
          <div className="warning-box">
            <p>
              <strong>Large files (500MB+) may cause:</strong>
            </p>
            <ul>
              <li>Browser crashes due to memory limits</li>
              <li>Slow loading and rendering</li>
              <li>High CPU/GPU usage</li>
              <li>Poor user experience</li>
            </ul>
            <p className="recommendation">
              <strong>Recommendation:</strong> Always optimize large models before web viewing. 
              The time invested in optimization pays off in performance.
            </p>
          </div>
        </div>

        <div className="optimization-section">
          <h4>📚 Additional Resources</h4>
          <div className="resource-links">
            <a href="https://threejs.org/manual/en/loading-3d-models.html" target="_blank" rel="noopener noreferrer">
              Three.js Loading Guide
            </a>
            <a href="https://www.khronos.org/gltf/" target="_blank" rel="noopener noreferrer">
              glTF Specification
            </a>
            <a href="https://github.com/google/draco" target="_blank" rel="noopener noreferrer">
              Draco Compression
            </a>
            <a href="https://github.com/KhronosGroup/glTF-Blender-IO" target="_blank" rel="noopener noreferrer">
              Blender glTF Exporter
            </a>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

