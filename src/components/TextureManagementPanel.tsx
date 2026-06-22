import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { extractTexturesFromModelFile, loadTextureImages, type ExtractedTextureInfo } from '../utils/extractTexturesFromModel'
import './TextureManagementPanel.css'

interface TextureInfo {
  texture: THREE.Texture | null // null for extracted textures (before loading)
  id: string
  name: string
  width: number
  height: number
  format: string
  type: string
  size: number // Estimated memory size in bytes
  src?: string
  dataUrl?: string
  thumbnail?: string
  usedBy: string[] // Material names using this texture
  property: string // Which property (map, normalMap, etc.)
  extractedImage?: HTMLImageElement // For extracted textures before loading
  userData?: { originalUri?: string, originalFilePath?: string } // Store original URI for merge mapping
}

interface TextureGroup {
  id: string
  textures: TextureInfo[]
  signature: string
}

export default function TextureManagementPanel() {
  const { 
    showTextureManagementPanel, 
    toggleTextureManagementPanel,
    pendingModelFile,
    pendingTextureFiles,
    pendingModelLoadCallback,
    setPendingModelLoad
  } = useAppStore()
  const { viewer } = useViewer()
  const [isMinimized, setIsMinimized] = useState(false)
  const [textureGroups, setTextureGroups] = useState<TextureGroup[]>([])
  const [selectedTextures, setSelectedTextures] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'all' | 'duplicates'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null)
  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number, y: number, groupId: string } | null>(null)
  const [extractedTextures, setExtractedTextures] = useState<Map<string, { image: HTMLImageElement, info: ExtractedTextureInfo }>>(new Map())
  const [loadingProgress, setLoadingProgress] = useState<{ current: number, total: number } | null>(null)
  // Store texture merge mappings: Map<textureIdToMerge, canonicalTextureId>
  const [textureMergeMappings, setTextureMergeMappings] = useState<Map<string, string>>(new Map())
  const panelRef = useRef<HTMLDivElement | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const groupContextMenuRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 500
  const stackingOffset = usePanelStacking({ panelId: 'textureManagement', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as React.RefObject<HTMLElement>, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'textureManagement'
    }
  )

  // Convert texture to data URL for thumbnail
  const textureToDataUrl = useCallback((texture: THREE.Texture | HTMLImageElement): string | null => {
    if (!texture) return null
    
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      
      // Handle both THREE.Texture and HTMLImageElement
      let img: HTMLImageElement | HTMLCanvasElement | ImageBitmap
      if (texture instanceof HTMLImageElement) {
        img = texture
      } else if (
        texture instanceof THREE.Texture &&
        texture.image &&
        (texture.image instanceof HTMLImageElement ||
          texture.image instanceof HTMLCanvasElement ||
          texture.image instanceof ImageBitmap)
      ) {
        img = texture.image
      } else {
        return null
      }
      
      const maxSize = 128
      const width = Math.min((img as HTMLImageElement).width || 256, maxSize)
      const height = Math.min((img as HTMLImageElement).height || 256, maxSize)
      
      canvas.width = width
      canvas.height = height
      
      ctx.drawImage(img as HTMLImageElement, 0, 0, width, height)
      return canvas.toDataURL('image/png')
    } catch (e) {
      console.warn('Failed to convert texture to thumbnail:', e)
      return null
    }
  }, [])

  // Collect all textures from the scene
  // If pendingModelFile exists, ONLY collect from that model (not from already-loaded models like car)
  const collectTextures = useCallback((): TextureInfo[] => {
    if (!viewer?.scene) return []
    
    // If we have a pending model file, we should only show textures from extracted textures
    // Don't collect from scene if we're waiting for a new model to load
    if (pendingModelFile) {
      return [] // Will be populated from extractedTextures instead
    }
    
    const textures: Map<THREE.Texture, TextureInfo> = new Map()
    const textureProperties = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
      'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
      'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
      'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
      'specularIntensityMap', 'specularColorMap'
    ]
    
    viewer.scene.traverse((obj) => {
      // Skip auto-loaded models (like the car) when collecting textures
      // Only show textures from user-imported models
      if ((obj as any).userData?.isAutoLoaded || (obj as any).userData?.isStartingObjectsGroup) {
        return
      }
      
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        
        mats.forEach((mat) => {
          const matName = mat.name || `${obj.name || 'Material'}-${mat.type}`
          
          textureProperties.forEach((prop) => {
            const texture = (mat as any)[prop] as THREE.Texture | undefined
            if (texture && texture instanceof THREE.Texture && texture.image) {
              const textureId = `${texture.uuid}-${prop}`
              
              if (!textures.has(texture)) {
                const img = texture.image
                const width = (img as any).width || (img as any).naturalWidth || 0
                const height = (img as any).height || (img as any).naturalHeight || 0
                
                let src = ''
                if (img instanceof HTMLImageElement && img.src) {
                  src = img.src
                } else if (img instanceof HTMLCanvasElement) {
                  try {
                    src = img.toDataURL()
                  } catch (e) {
                    // Canvas might be tainted
                  }
                }
                
                // Estimate memory size
                let size = 0
                if (width > 0 && height > 0) {
                  size = width * height * 4 // RGBA, 4 bytes per pixel
                }
                
                const formatName = texture.format === THREE.RGBAFormat ? 'RGBA' :
                                 texture.format === THREE.RGBFormat ? 'RGB' :
                                 texture.format === THREE.RGFormat ? 'RG' :
                                 texture.format === THREE.RedFormat ? 'R' : 'Unknown'
                
                const typeName = texture.type === THREE.UnsignedByteType ? 'UnsignedByte' :
                               texture.type === THREE.FloatType ? 'Float' :
                               texture.type === THREE.HalfFloatType ? 'HalfFloat' : 'Unknown'
                
                textures.set(texture, {
                  texture,
                  id: textureId,
                  name: `${prop} (${width}x${height})`,
                  width,
                  height,
                  format: formatName,
                  type: typeName,
                  size,
                  src: src || undefined,
                  dataUrl: src?.startsWith('data:') ? src : undefined,
                  usedBy: [matName],
                  property: prop
                })
              } else {
                // Add material to usedBy list
                const info = textures.get(texture)!
                if (!info.usedBy.includes(matName)) {
                  info.usedBy.push(matName)
                }
              }
            }
          })
        })
      }
    })
    
    return Array.from(textures.values())
  }, [viewer])

  // Group textures by signature (potential duplicates)
  const groupTextures = useCallback((textures: TextureInfo[]): TextureGroup[] => {
    const groups = new Map<string, TextureInfo[]>()
    
    textures.forEach((tex) => {
      // Create signature based on dimensions, format, and source
      const signature = tex.src 
        ? `${tex.width}x${tex.height}-${tex.format}-${tex.type}-${tex.src.substring(0, 100)}`
        : `${tex.width}x${tex.height}-${tex.format}-${tex.type}`
      
      if (!groups.has(signature)) {
        groups.set(signature, [])
      }
      groups.get(signature)!.push(tex)
    })
    
    return Array.from(groups.entries()).map(([signature, textures]) => ({
      id: `group-${signature}`,
      textures,
      signature
    }))
  }, [])

  // Load extracted textures from pending model file (BEFORE loading)
  useEffect(() => {
    if (pendingModelFile && pendingTextureFiles !== null) {
      const loadExtractedTextures = async () => {
        try {
          // Show loading state immediately
          setLoadingProgress({ current: 0, total: 1 })
          console.log(`🔍 Extracting textures from pending file: ${pendingModelFile.name}`)
          const extractedData = await extractTexturesFromModelFile(pendingModelFile)
          
          if (extractedData && extractedData.textures.length > 0) {
            console.log(`✅ Found ${extractedData.textures.length} textures in ${pendingModelFile.name}`)
            
            // Update progress
            setLoadingProgress({ current: 0, total: extractedData.textures.length })
            
            // Pass GLTF JSON and arrayBuffer for embedded texture extraction (if available)
            const gltfJson = (extractedData as any).gltfJson
            const arrayBuffer = (extractedData as any).arrayBuffer
            
            // Load textures with progress updates
            let loadedCount = 0
            const loaded = await loadTextureImages(
              extractedData.textures, 
              pendingModelFile, 
              pendingTextureFiles || undefined, 
              gltfJson, 
              arrayBuffer,
              (current, total) => {
                loadedCount = current
                setLoadingProgress({ current, total })
              }
            )
            setExtractedTextures(loaded)
            
            console.log(`🖼️ Loaded ${loaded.size} texture previews (${extractedData.textures.length - loaded.size} embedded/skipped)`)
            
            // Convert ALL extracted textures to TextureInfo format (even if preview not available)
            // Generate thumbnails lazily in batches to avoid freezing
            const THUMBNAIL_BATCH_SIZE = 20 // Generate 20 thumbnails at a time
            const textureInfos: TextureInfo[] = []
            
            // First pass: create texture info without thumbnails (fast)
            for (const info of extractedData.textures) {
              const loadedData = loaded.get(info.id)
              const image = loadedData?.image
              
              const width = image?.width || info.width || 512 // Default estimate
              const height = image?.height || info.height || 512 // Default estimate
              const size = width * height * 4 // RGBA estimate
              
              // Extract filename from URI for display
              const uriFileName = info.uri?.split('/').pop() || info.uri?.split('\\').pop() || 'texture'
              
              textureInfos.push({
                texture: null, // Will be created when loading
                id: info.id,
                name: info.name || `${uriFileName} (${width}x${height})`,
                width,
                height,
                format: info.format || 'RGBA',
                type: info.type || 'UnsignedByte',
                size,
                src: info.uri, // Store original URI - this is what the GLTF loader will request
                dataUrl: image?.src.startsWith('data:') ? image.src : undefined,
                thumbnail: undefined, // Will be generated lazily
                usedBy: [], // Will be populated after loading
                property: 'map', // Default, will be updated
                extractedImage: image || undefined,
                // Store original file path if available (for merge mapping)
                userData: { originalUri: info.uri, originalFilePath: (info as any).originalFilePath }
              })
            }
            
            // Second pass: generate thumbnails in batches (yields to UI)
            const texturesWithImages = textureInfos.filter(tex => tex.extractedImage)
            for (let i = 0; i < texturesWithImages.length; i += THUMBNAIL_BATCH_SIZE) {
              const batch = texturesWithImages.slice(i, i + THUMBNAIL_BATCH_SIZE)
              
              await Promise.all(batch.map(async (tex) => {
                const image = tex.extractedImage
                if (!image) return
                
                try {
                  // Wait for image to load if not already loaded
                  if (!image.complete || image.naturalWidth === 0) {
                    await new Promise<void>((resolve) => {
                      if (image.complete && image.naturalWidth > 0) {
                        resolve()
                      } else {
                        image.onload = () => resolve()
                        image.onerror = () => resolve() // Resolve even on error to not block
                        // Timeout after 1 second (reduced from 2)
                        setTimeout(() => resolve(), 1000)
                      }
                    })
                  }
                  
                  // Use textureToDataUrl which now handles HTMLImageElement
                  if (image.complete && image.naturalWidth > 0) {
                    tex.thumbnail = textureToDataUrl(image) || undefined
                  }
                  
                  // Fallback: use image src directly if it's a blob URL or data URL
                  if (!tex.thumbnail && image.src && (image.src.startsWith('blob:') || image.src.startsWith('data:'))) {
                    tex.thumbnail = image.src
                  }
                } catch (e) {
                  console.warn(`Failed to generate thumbnail for ${tex.name}:`, e)
                }
              }))
              
              // Update state incrementally to show progress
              const groups = groupTextures([...textureInfos])
              setTextureGroups(groups)
              setLoadingProgress({ current: Math.min(i + THUMBNAIL_BATCH_SIZE, texturesWithImages.length), total: texturesWithImages.length })
              
              // Yield to UI thread between batches
              if (i + THUMBNAIL_BATCH_SIZE < texturesWithImages.length) {
                await new Promise(resolve => setTimeout(resolve, 50))
              }
            }
            
            // Final update with all thumbnails
            const groups = groupTextures(textureInfos)
            console.log(`📦 Grouped into ${groups.length} texture groups`)
            setTextureGroups(groups)
            setLoadingProgress(null)
          } else {
            console.log(`⚠️ No textures found in ${pendingModelFile.name}`)
            setTextureGroups([])
          }
        } catch (error) {
          console.error('❌ Failed to extract textures:', error)
          setTextureGroups([])
        }
      }
      
      loadExtractedTextures()
    } else if (!pendingModelFile) {
      // Clear extracted textures when no pending file
      setExtractedTextures(new Map())
    }
  }, [pendingModelFile, pendingTextureFiles, groupTextures, textureToDataUrl])

  // Load textures when panel opens or scene changes (for already loaded models)
  // BUT: Only if there's NO pending model file (pending model = manually uploaded, should show those textures instead)
  useEffect(() => {
    if (!showTextureManagementPanel || !viewer?.scene) return
    if (pendingModelFile) {
      // If we have a pending model file, don't load textures from scene
      // The extracted textures from the pending file will be shown instead
      return
    }
    
    const textures = collectTextures()
    
    // Generate thumbnails
    const texturesWithThumbnails = textures.map(tex => ({
      ...tex,
      thumbnail: tex.texture ? textureToDataUrl(tex.texture) || undefined : undefined
    }))
    
    const groups = groupTextures(texturesWithThumbnails)
    setTextureGroups(groups)
  }, [showTextureManagementPanel, viewer, pendingModelFile, collectTextures, groupTextures, textureToDataUrl])

  // Filter groups based on view mode and search
  const filteredGroups = useMemo(() => {
    let groups = textureGroups
    
    // Filter by view mode
    if (viewMode === 'duplicates') {
      groups = groups.filter(group => group.textures.length > 1)
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      groups = groups.filter(group => 
        group.textures.some(tex => 
          tex.name.toLowerCase().includes(query) ||
          tex.property.toLowerCase().includes(query) ||
          tex.usedBy.some(mat => mat.toLowerCase().includes(query))
        )
      )
    }
    
    return groups
  }, [textureGroups, viewMode, searchQuery])

  // Format size for display
  const formatSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B'
    const mb = bytes / (1024 * 1024)
    if (mb >= 1) {
      return `${mb.toFixed(2)} MB`
    }
    const kb = bytes / 1024
    if (kb >= 1) {
      return `${kb.toFixed(2)} KB`
    }
    return `${bytes} B`
  }, [])

  // Merge selected textures
  const handleMerge = useCallback(() => {
    if (selectedTextures.size < 2) {
      alert('Please select at least 2 textures to merge')
      return
    }
    
    const selectedIds = Array.from(selectedTextures)
    const selectedInfos = textureGroups
      .flatMap(g => g.textures)
      .filter(t => selectedIds.includes(t.id))
    
    if (selectedInfos.length < 2) {
      alert('Selected textures not found')
      return
    }
    
    // For extracted textures (before loading), store merge mappings
    if (pendingModelFile) {
      // Use the first texture as the canonical one
      const canonical = selectedInfos[0]
      const toMerge = selectedInfos.slice(1)
      
      // Store merge mappings: map each texture to merge to the canonical texture
      // Use original URI/path as the key (this is what the GLTF loader will request)
      setTextureMergeMappings(prev => {
        const next = new Map(prev)
        toMerge.forEach(tex => {
          // Get the original URI from the texture info (this is what GLTF loader will request)
          const toMergeUri = tex.userData?.originalUri || tex.src || tex.name || tex.id
          const canonicalUri = canonical.userData?.originalUri || canonical.src || canonical.name || canonical.id
          
          // Extract just the filename for matching (GLTF loader might request just the filename)
          const toMergeFileName = toMergeUri.split('/').pop() || toMergeUri.split('\\').pop() || toMergeUri
          const canonicalFileName = canonicalUri.split('/').pop() || canonicalUri.split('\\').pop() || canonicalUri
          
          // Store mappings for both full URI and filename
          // The GLTF loader will match by filename or full path
          next.set(toMergeUri, canonicalUri)
          next.set(toMergeFileName, canonicalFileName)
          
          // Also store normalized versions (lowercase, normalized path separators)
          const toMergeNormalized = toMergeUri.toLowerCase().replace(/\\/g, '/')
          const canonicalNormalized = canonicalUri.toLowerCase().replace(/\\/g, '/')
          next.set(toMergeNormalized, canonicalNormalized)
          
          console.log(`📝 Mapping texture merge: "${toMergeUri}" -> "${canonicalUri}" (also: "${toMergeFileName}" -> "${canonicalFileName}")`)
        })
        return next
      })
      
      // Remove merged textures from groups
      const updatedGroups = textureGroups.map(group => ({
        ...group,
        textures: group.textures.filter(t => !toMerge.some(m => m.id === t.id))
      })).filter(g => g.textures.length > 0)
      
      setTextureGroups(updatedGroups)
      setSelectedTextures(new Set())
      
      console.log(`📝 Stored ${toMerge.length} texture merge mapping(s):`, 
        Array.from(toMerge).map(t => `${t.name || t.id} -> ${canonical.name || canonical.id}`))
      
      alert(`✅ Marked ${toMerge.length} texture(s) for merging with "${canonical.name}"\n\nThese will be merged when the model loads.`)
      return
    }
    
    // For loaded textures, merge in the scene
    if (!viewer?.scene) {
      alert('Scene not available')
      return
    }
    
    // Use the first texture as the canonical one
    const canonical = selectedInfos[0]
    const toMerge = selectedInfos.slice(1)
    
    if (!canonical.texture) {
      alert('Cannot merge: textures not yet loaded')
      return
    }
    
    // Find all materials using the textures to merge
    const materialsToUpdate: Array<{ mat: THREE.Material, prop: string }> = []
    
    viewer.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        
        mats.forEach((mat) => {
          const textureProperties = [
            'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
            'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
            'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
            'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
            'specularIntensityMap', 'specularColorMap'
          ]
          
          textureProperties.forEach((prop) => {
            const texture = (mat as any)[prop] as THREE.Texture | undefined
            if (texture) {
              const shouldReplace = toMerge.some(t => t.texture === texture)
              if (shouldReplace && texture !== canonical.texture) {
                materialsToUpdate.push({ mat, prop })
              }
            }
          })
        })
      }
    })
    
    // Replace textures
    let replaced = 0
    materialsToUpdate.forEach(({ mat, prop }) => {
      (mat as any)[prop] = canonical.texture
      mat.needsUpdate = true
      replaced++
    })
    
    // Dispose merged textures
    toMerge.forEach(info => {
      try {
        if (info.texture?.dispose) {
          info.texture.dispose()
        }
      } catch (e) {
        console.warn('Failed to dispose texture:', e)
      }
    })
    
    alert(`✅ Merged ${toMerge.length} texture(s) into "${canonical.name}"\n\nReplaced in ${replaced} material(s)`)
    
    // Refresh texture list
    const textures = collectTextures()
    const groups = groupTextures(textures.map(tex => ({
      ...tex,
      thumbnail: tex.texture ? textureToDataUrl(tex.texture) || undefined : undefined
    })))
    setTextureGroups(groups)
    setSelectedTextures(new Set())
  }, [selectedTextures, textureGroups, viewer, pendingModelFile, collectTextures, groupTextures, textureToDataUrl])

  // Get all texture IDs in current view (for shift-select)
  const getAllTextureIds = useCallback((): string[] => {
    return filteredGroups.flatMap(group => group.textures.map(tex => tex.id))
  }, [filteredGroups])

  // Toggle texture selection with shift-select support
  const toggleSelection = useCallback((textureId: string, event?: React.MouseEvent, textureIndex?: number) => {
    setSelectedTextures(prev => {
      const next = new Set(prev)
      
      // Handle shift-select
      if (event?.shiftKey && lastSelectedIndex !== null && textureIndex !== undefined) {
        const allIds = getAllTextureIds()
        const startIndex = Math.min(lastSelectedIndex, textureIndex)
        const endIndex = Math.max(lastSelectedIndex, textureIndex)
        
        // Select all textures between start and end
        for (let i = startIndex; i <= endIndex; i++) {
          if (allIds[i]) {
            next.add(allIds[i])
          }
        }
      } else {
        // Normal toggle
        if (next.has(textureId)) {
          next.delete(textureId)
        } else {
          next.add(textureId)
        }
      }
      
      return next
    })
    
    // Update last selected index
    if (textureIndex !== undefined) {
      setLastSelectedIndex(textureIndex)
    } else {
      const allIds = getAllTextureIds()
      const index = allIds.indexOf(textureId)
      if (index >= 0) {
        setLastSelectedIndex(index)
      }
    }
  }, [lastSelectedIndex, getAllTextureIds])

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, textureId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Only show menu if this texture is selected or if we have selections
    if (selectedTextures.size > 0 && !selectedTextures.has(textureId)) {
      // If clicking on non-selected texture, select it first
      const allIds = getAllTextureIds()
      const index = allIds.indexOf(textureId)
      toggleSelection(textureId, undefined, index)
    }
    
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [selectedTextures, toggleSelection, getAllTextureIds])

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
    setGroupContextMenu(null)
  }, [])

  // Handle right-click on texture group
  const handleGroupContextMenu = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId })
  }, [])

  // Merge all textures in a group
  const handleMergeGroup = useCallback((groupId: string) => {
    const group = textureGroups.find(g => g.id === groupId)
    if (!group || group.textures.length < 2) {
      return
    }

    // Select all textures in the group
    const groupTextureIds = new Set(group.textures.map(tex => tex.id))
    setSelectedTextures(groupTextureIds)
    
    // Merge them
    handleMerge()
    
    // Close context menu
    closeContextMenu()
  }, [textureGroups, handleMerge, closeContextMenu])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
      if (groupContextMenuRef.current && !groupContextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }

    if (contextMenu || groupContextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu, groupContextMenu, closeContextMenu])

  // Handle context menu merge action
  const handleContextMenuMerge = useCallback(() => {
    closeContextMenu()
    if (selectedTextures.size >= 2) {
      handleMerge()
    }
  }, [selectedTextures, handleMerge, closeContextMenu])

  if (!showTextureManagementPanel) return null

  return (
    <div
      ref={panelRef}
      className={`texture-management-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="texture-management-panel-header" onMouseDown={handleMouseDown}>
        <h3>🖼️ Texture Management</h3>
        {pendingModelFile && (
          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
            Reviewing textures from: <strong>{pendingModelFile.name}</strong>
          </div>
        )}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={toggleTextureManagementPanel}>
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="texture-management-panel-content">
          {/* Controls */}
          <div className="texture-controls">
            <div className="search-container">
              <input
                type="text"
                className="search-input"
                placeholder="Search textures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="clear-search-button"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <div className="view-mode-toggle">
              <button
                className={`view-mode-button ${viewMode === 'all' ? 'active' : ''}`}
                onClick={() => setViewMode('all')}
              >
                All ({textureGroups.length})
              </button>
              <button
                className={`view-mode-button ${viewMode === 'duplicates' ? 'active' : ''}`}
                onClick={() => setViewMode('duplicates')}
              >
                Duplicates ({textureGroups.filter(g => g.textures.length > 1).length})
              </button>
            </div>
            {selectedTextures.size > 0 && (
              <button
                className="merge-button"
                onClick={handleMerge}
                disabled={selectedTextures.size < 2}
              >
                Merge Selected ({selectedTextures.size})
              </button>
            )}
            {pendingModelFile && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  className="continue-loading-button"
                  onClick={async () => {
                    if (pendingModelLoadCallback) {
                      // Pass texture merge mappings to the callback
                      // Convert to Map<textureName, canonicalTextureName> format
                      const mergeMap = new Map<string, string>()
                      textureMergeMappings.forEach((canonical, toMerge) => {
                        mergeMap.set(toMerge, canonical)
                      })
                      console.log(`📤 Passing ${mergeMap.size} texture merge mapping(s) to model loader`)
                      await pendingModelLoadCallback(mergeMap)
                      // Clear merge mappings after loading
                      setTextureMergeMappings(new Map())
                    }
                  }}
                >
                  ✅ Continue Loading Model
                </button>
                <button
                  className="cancel-loading-button"
                  onClick={() => {
                    setPendingModelLoad(null, null, null)
                    setExtractedTextures(new Map())
                    setTextureGroups([])
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Texture List */}
          <div className="texture-list">
            {loadingProgress && loadingProgress.total > 0 ? (
              <div className="loading-progress">
                <div className="loading-progress-bar">
                  <div 
                    className="loading-progress-fill" 
                    style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                  />
                </div>
                <p>Loading textures: {loadingProgress.current} / {loadingProgress.total}</p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="empty-message">
                <p>No textures found</p>
                {searchQuery && <p className="hint">Try a different search query</p>}
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div 
                  key={group.id} 
                  className={`texture-group ${group.textures.length > 1 ? 'has-duplicates' : ''}`}
                  onContextMenu={(e) => {
                    if (group.textures.length > 1) {
                      e.preventDefault()
                      e.stopPropagation()
                      handleGroupContextMenu(e, group.id)
                    }
                  }}
                  style={{ cursor: group.textures.length > 1 ? 'context-menu' : 'default' }}
                >
                  {group.textures.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div 
                        className="duplicate-badge" 
                        title="Click to select all, double-click to select and merge"
                        onClick={(e) => {
                          e.stopPropagation()
                          // Select all textures in this group
                          const groupTextureIds = new Set(group.textures.map(tex => tex.id))
                          setSelectedTextures(groupTextureIds)
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          // Double-click: select all and merge immediately
                          const groupTextureIds = new Set(group.textures.map(tex => tex.id))
                          setSelectedTextures(groupTextureIds)
                          // Small delay to ensure selection is set, then merge
                          setTimeout(() => {
                            handleMergeGroup(group.id)
                          }, 50)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {group.textures.length} duplicates
                      </div>
                      <button
                        className="merge-group-button"
                        title="Merge all textures in this group"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMergeGroup(group.id)
                        }}
                        style={{
                          padding: '2px 8px',
                          fontSize: '10px',
                          background: 'rgba(255, 152, 0, 0.3)',
                          border: '1px solid rgba(255, 152, 0, 0.5)',
                          borderRadius: '4px',
                          color: '#ff9800',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 152, 0, 0.5)'
                          e.currentTarget.style.borderColor = 'rgba(255, 152, 0, 0.7)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 152, 0, 0.3)'
                          e.currentTarget.style.borderColor = 'rgba(255, 152, 0, 0.5)'
                        }}
                      >
                        Merge
                      </button>
                    </div>
                  )}
                  {group.textures.map((tex, texIndex) => {
                    // Calculate global index for shift-select
                    const allTextures = filteredGroups.flatMap(g => g.textures)
                    const globalIndex = allTextures.findIndex(t => t.id === tex.id)
                    
                    return (
                    <div
                      key={tex.id}
                      className={`texture-item ${selectedTextures.has(tex.id) ? 'selected' : ''}`}
                      onClick={(e) => toggleSelection(tex.id, e, globalIndex)}
                      onContextMenu={(e) => handleContextMenu(e, tex.id)}
                    >
                      <div className="texture-thumbnail">
                        {tex.thumbnail ? (
                          <img src={tex.thumbnail} alt={tex.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : tex.extractedImage ? (
                          <img src={tex.extractedImage.src} alt={tex.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : tex.dataUrl ? (
                          <img src={tex.dataUrl} alt={tex.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <div className="texture-placeholder">No Preview</div>
                        )}
                        <input
                          type="checkbox"
                          checked={selectedTextures.has(tex.id)}
                          onChange={(e) => {
                            e.stopPropagation()
                            toggleSelection(tex.id, e.nativeEvent as any, globalIndex)
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="texture-info">
                        <div className="texture-name">{tex.name}</div>
                        <div className="texture-property">{tex.property}</div>
                        <div className="texture-details">
                          <span>{tex.width}×{tex.height}</span>
                          <span>{tex.format}</span>
                          <span>{formatSize(tex.size)}</span>
                        </div>
                        <div className="texture-used-by">
                          Used by: {tex.usedBy.slice(0, 2).join(', ')}
                          {tex.usedBy.length > 2 && ` +${tex.usedBy.length - 2} more`}
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="hint-text">
            💡 Select 2+ textures and click "Merge Selected" or right-click for context menu<br/>
            ⌨️ Hold Shift and click to select multiple textures
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && selectedTextures.size >= 2 && (
        <div
          ref={contextMenuRef}
          className="texture-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={handleContextMenuMerge}>
            🔗 Merge Selected ({selectedTextures.size})
          </div>
          <div className="context-menu-separator" />
          <div className="context-menu-item" onClick={() => setSelectedTextures(new Set())}>
            Clear Selection
          </div>
        </div>
      )}

      {groupContextMenu && (
        <div
          ref={groupContextMenuRef}
          className="texture-context-menu"
          style={{
            position: 'fixed',
            left: `${groupContextMenu.x}px`,
            top: `${groupContextMenu.y}px`,
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            className="context-menu-item" 
            onClick={() => handleMergeGroup(groupContextMenu.groupId)}
          >
            🔗 Merge All in Group
          </div>
          <div className="context-menu-separator" />
          <div className="context-menu-item" onClick={closeContextMenu}>
            Cancel
          </div>
        </div>
      )}
    </div>
  )
}

