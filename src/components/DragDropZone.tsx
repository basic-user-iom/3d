import { useState, DragEvent } from 'react'
import { useViewer } from '../viewer/useViewer'
import { useAppStore } from '../store/useAppStore'
import './DragDropZone.css'

export default function DragDropZone({ children }: { children: React.ReactNode }) {
  const [isDragging, setIsDragging] = useState(false)
  const { loadFromFile } = useViewer()
  const { setError, setLoading, setProgress, setLoadingMessage, toggleOptimizationPanel } = useAppStore()

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    // Separate model files and texture files
    const modelFiles = Array.from(e.dataTransfer.files).filter((file) => {
      const ext = file.name.toLowerCase().split('.').pop()
      return ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'splat', 'ksplat', '3mf', 'dae', '3ds', 'dxf', 'dwg', 'zip'].includes(ext || '')
    })

    // Get texture/image files
    const textureFiles = new Map<string, File>()
    Array.from(e.dataTransfer.files).forEach((file) => {
      const ext = file.name.toLowerCase().split('.').pop()
      if (['jpg', 'jpeg', 'png', 'tga', 'bmp', 'webp', 'hdr', 'exr', 'ktx2', 'basis', 'bin'].includes(ext || '')) {
        const relativePath = file.name
        textureFiles.set(relativePath, file)
        textureFiles.set(file.name, file)
      }
    })

    if (modelFiles.length === 0) {
      setError('No supported 3D model files found. Supported formats: GLB, GLTF, FBX, OBJ, STL, PLY, SPLAT, KSPLAT, 3MF, DAE, 3DS, DXF, DWG, ZIP')
      return
    }

    setError(null)
    setLoading(true)
    setProgress(0)

    // Check file sizes and warn if any are too large
    const largeFiles = modelFiles.filter(f => (f.size / 1024 / 1024) > 500)
    if (largeFiles.length > 0) {
      const largeFile = largeFiles[0]
      const fileSizeMB = largeFile.size / 1024 / 1024
      const ext = largeFile.name.toLowerCase().split('.').pop()
      const isFBX = ext === 'fbx'
      const warningMsg = isFBX 
        ? `⚠️ WARNING: ${largeFiles.length > 1 ? `Some files (including ${largeFile.name})` : `This FBX file (${largeFile.name})`} is very large (${fileSizeMB.toFixed(1)} MB).\n\nBrowser loading cannot handle files over ~1GB without crashing.\n\nRECOMMENDED: Convert to glTF/GLB format using:\n- FBX2glTF tool or Blender\n- glTF files are 60-80% smaller\n- Click "🔧 Optimize" button for detailed instructions\n\nDo you want to try loading anyway (may crash)?`
        : `WARNING: ${largeFiles.length > 1 ? `Some files (including ${largeFile.name})` : `This file (${largeFile.name})`} is very large (${fileSizeMB.toFixed(1)} MB).\n\nLoading it may cause your browser to run out of memory and crash.\n\nFor best results:\n- Reduce polygon count\n- Compress textures\n- Use glTF format instead\n- Click "🔧 Optimize" button for tools\n\nDo you want to try loading anyway?`
      
      const proceed = window.confirm(warningMsg)
      if (!proceed) {
        setLoading(false)
        setProgress(0)
        setLoadingMessage(null)
        // Open optimization panel to help user
        toggleOptimizationPanel()
        return
      }
    }

    // Load all model files sequentially
    try {
      for (let i = 0; i < modelFiles.length; i++) {
        const file = modelFiles[i]
        setLoadingMessage(`Loading ${file.name} (${i + 1}/${modelFiles.length})...`)
        
        try {
          await loadFromFile(file, (progress) => {
            // Adjust progress for multiple files
            const baseProgress = (i / modelFiles.length) * 100
            const fileProgress = (progress / modelFiles.length)
            setProgress(baseProgress + fileProgress)
          }, textureFiles.size > 0 ? textureFiles : undefined)
          
          console.log(`✅ Successfully loaded: ${file.name}`)
        } catch (err) {
          console.error(`❌ Failed to load ${file.name}:`, err)
          // Continue with next file instead of stopping
          if (i === 0) {
            // Only show error for first file failure
            setError(`Failed to load ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        }
      }
      
      if (modelFiles.length > 1) {
        console.log(`✅ Successfully loaded ${modelFiles.length} model(s)`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files')
    } finally {
      setLoading(false)
      setProgress(0)
      setLoadingMessage(null)
    }
  }

  return (
    <div
      className={`drag-drop-zone ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-message">
            <div className="drag-icon">📦</div>
            <div>Drop your 3D model here</div>
          </div>
        </div>
      )}
    </div>
  )
}

