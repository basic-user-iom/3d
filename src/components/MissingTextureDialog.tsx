import React, { useState, useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { loadTexture } from '../viewer/loaders/textureLoader'
import './MissingTextureDialog.css'

export interface MissingTextureInfo {
  path: string // Original texture path/URI
  name: string // Display name
  property: string // Material property (map, normalMap, etc.)
  material: THREE.Material // Reference to the material
  mesh: THREE.Mesh // Reference to the mesh
}

interface MissingTextureDialogProps {
  missingTextures: MissingTextureInfo[]
  viewer: {
    scene: THREE.Scene
    renderer?: THREE.WebGLRenderer
  } | null
  onClose: () => void
  onTexturesReloaded?: (reloadedCount: number) => void
}

export default function MissingTextureDialog({
  missingTextures,
  viewer,
  onClose,
  onTexturesReloaded
}: MissingTextureDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [matchingResults, setMatchingResults] = useState<Map<string, File | null>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [reloadProgress, setReloadProgress] = useState(0)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Initialize matching results
  useEffect(() => {
    const results = new Map<string, File | null>()
    missingTextures.forEach(tex => {
      results.set(tex.path, null)
    })
    setMatchingResults(results)
  }, [missingTextures])

  const handleSelectFolder = useCallback(() => {
    folderInputRef.current?.click()
  }, [])

  const handleFolderSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setSelectedFiles(files)
    
    // Match files to missing textures
    const matches = new Map<string, File | null>()
    const textureExtensions = ['.jpg', '.jpeg', '.png', '.tga', '.bmp', '.webp', '.hdr', '.exr', '.ktx2', '.basis']
    
    missingTextures.forEach(tex => {
      const texPath = tex.path.toLowerCase()
      const texFileName = texPath.split(/[/\\]/).pop() || texPath
      const texNameWithoutExt = texFileName.replace(/\.[^.]+$/, '').toLowerCase()
      
      let matchedFile: File | null = null
      
      // Strategy 1: Exact filename match (case-insensitive)
      matchedFile = files.find(f => {
        const fName = f.name.toLowerCase()
        return fName === texFileName || fName === texPath
      }) || null
      
      // Strategy 2: Filename without extension match
      if (!matchedFile) {
        matchedFile = files.find(f => {
          const fName = f.name.toLowerCase()
          const fNameWithoutExt = fName.replace(/\.[^.]+$/, '')
          return fNameWithoutExt === texNameWithoutExt && textureExtensions.some(ext => fName.endsWith(ext))
        }) || null
      }
      
      // Strategy 3: Partial match (filename contains texture name or vice versa)
      if (!matchedFile) {
        matchedFile = files.find(f => {
          const fName = f.name.toLowerCase()
          return fName.includes(texNameWithoutExt) || texNameWithoutExt.includes(fName.replace(/\.[^.]+$/, ''))
        }) || null
      }
      
      matches.set(tex.path, matchedFile)
    })
    
    setMatchingResults(matches)
    
    // Reset file input
    if (folderInputRef.current) {
      folderInputRef.current.value = ''
    }
  }, [missingTextures])

  const handleManualMatch = useCallback((texturePath: string, file: File | null) => {
    const newMatches = new Map(matchingResults)
    newMatches.set(texturePath, file)
    setMatchingResults(newMatches)
  }, [matchingResults])

  const handleReloadTextures = useCallback(async () => {
    if (!viewer || !viewer.renderer) {
      alert('Viewer not available')
      return
    }

    setIsLoading(true)
    setReloadProgress(0)

    const matchedTextures = Array.from(matchingResults.entries()).filter(([_, file]) => file !== null)
    let reloadedCount = 0
    let failedCount = 0

    try {
      for (let i = 0; i < matchedTextures.length; i++) {
        const [texturePath, file] = matchedTextures[i]
        if (!file) continue

        const missingTex = missingTextures.find(t => t.path === texturePath)
        if (!missingTex) continue

        setReloadProgress((i / matchedTextures.length) * 100)

        try {
          // Load the texture
          const texture = await loadTexture(file, viewer.renderer, 16)
          
          // Apply texture to material
          const mat = missingTex.material
          const prop = missingTex.property as keyof THREE.Material
          
          // Dispose old texture if it exists
          const oldTexture = (mat as any)[prop] as THREE.Texture | undefined
          if (oldTexture) {
            oldTexture.dispose()
          }
          
          // Set new texture
          ;(mat as any)[prop] = texture
          
          // Update material
          mat.needsUpdate = true
          
          reloadedCount++
          console.log(`✅ Reloaded texture: ${missingTex.name} -> ${file.name}`)
        } catch (error) {
          console.error(`❌ Failed to reload texture ${missingTex.name}:`, error)
          failedCount++
        }
      }

      setReloadProgress(100)
      
      // Force scene update
      if (viewer.scene) {
        viewer.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            materials.forEach(mat => {
              mat.needsUpdate = true
            })
          }
        })
      }

      if (onTexturesReloaded) {
        onTexturesReloaded(reloadedCount)
      }

      if (reloadedCount > 0) {
        alert(`✅ Successfully reloaded ${reloadedCount} texture(s)${failedCount > 0 ? `\n⚠️ ${failedCount} texture(s) failed to load` : ''}`)
      } else {
        alert('⚠️ No textures were reloaded. Please check file matches.')
      }
    } catch (error) {
      console.error('Error reloading textures:', error)
      alert(`❌ Error reloading textures: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
      setReloadProgress(0)
    }
  }, [matchingResults, missingTextures, viewer, onTexturesReloaded])

  const matchedCount = Array.from(matchingResults.values()).filter(f => f !== null).length
  const unmatchedCount = missingTextures.length - matchedCount

  return (
    <div className="missing-texture-dialog-overlay" onClick={onClose}>
      <div className="missing-texture-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="missing-texture-dialog-header">
          <h2>⚠️ Missing Textures Detected</h2>
          <button className="missing-texture-dialog-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="missing-texture-dialog-content">
          <div className="missing-texture-dialog-info">
            <p>
              Found <strong>{missingTextures.length}</strong> missing texture(s). 
              Select a folder containing texture files to link them.
            </p>
          </div>

          <div className="missing-texture-dialog-actions">
            <button
              className="missing-texture-dialog-button primary"
              onClick={handleSelectFolder}
              disabled={isLoading}
            >
              📁 Select Texture Folder
            </button>
            <input
              ref={folderInputRef}
              type="file"
              onChange={handleFolderSelected}
              {...({ webkitdirectory: '', directory: '' } as any)}
              multiple
              style={{ display: 'none' }}
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="missing-texture-dialog-files-info">
              <p>
                Selected folder contains <strong>{selectedFiles.length}</strong> file(s)
                {matchedCount > 0 && ` - ${matchedCount} matched, ${unmatchedCount} unmatched`}
              </p>
            </div>
          )}

          <div className="missing-texture-dialog-list">
            {missingTextures.map((tex, index) => {
              const matchedFile = matchingResults.get(tex.path)
              return (
                <div
                  key={`${tex.path}-${index}`}
                  className={`missing-texture-item ${matchedFile ? 'matched' : 'unmatched'}`}
                >
                  <div className="missing-texture-item-info">
                    <div className="missing-texture-item-name">
                      <strong>{tex.name}</strong>
                      <span className="missing-texture-item-property">({tex.property})</span>
                    </div>
                    <div className="missing-texture-item-path">{tex.path}</div>
                  </div>
                  <div className="missing-texture-item-match">
                    {matchedFile ? (
                      <div className="missing-texture-matched">
                        <span className="match-indicator">✓</span>
                        <span className="match-file">{matchedFile.name}</span>
                        <button
                          className="missing-texture-unmatch"
                          onClick={() => handleManualMatch(tex.path, null)}
                          title="Unmatch"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="missing-texture-unmatched">
                        <span className="unmatch-indicator">⚠</span>
                        <span>No match found</span>
                        {selectedFiles.length > 0 && (
                          <select
                            className="missing-texture-manual-select"
                            value=""
                            onChange={(e) => {
                              const fileName = e.target.value
                              if (fileName) {
                                const file = selectedFiles.find(f => f.name === fileName)
                                if (file) {
                                  handleManualMatch(tex.path, file)
                                }
                              }
                            }}
                          >
                            <option value="">Select file manually...</option>
                            {selectedFiles.map(f => (
                              <option key={f.name} value={f.name}>{f.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {isLoading && (
            <div className="missing-texture-dialog-progress">
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${reloadProgress}%` }}
                />
              </div>
              <p>Reloading textures... {Math.round(reloadProgress)}%</p>
            </div>
          )}

          <div className="missing-texture-dialog-footer">
            <button
              className="missing-texture-dialog-button secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              className="missing-texture-dialog-button primary"
              onClick={handleReloadTextures}
              disabled={isLoading || matchedCount === 0}
            >
              {isLoading ? 'Reloading...' : `Reload ${matchedCount} Texture(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


























