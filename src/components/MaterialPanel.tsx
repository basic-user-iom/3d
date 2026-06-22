// @ts-nocheck

import React, { useEffect, useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { loadHDR } from '../viewer/loaders/hdrLoader'
import { loadTexture } from '../viewer/loaders/textureLoader'
import { randomUVModifierRegistry, RandomUVConfig } from '../viewer/materials/RandomUVModifierRegistry'
import { trackSliderInteraction } from '../utils/sliderTracker'
import { convertSceneBasicMaterials, MaterialConversionStats } from '../utils/materialConverter'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { configureAllTransparentMaterials } from '../utils/transparentMaterialHelper'
import { MaterialSwatch } from './MaterialSwatch'
import './MaterialPanel.css'

// Helper function to convert Three.js texture to data URL for preview
const textureToDataUrl = (texture: THREE.Texture): string | null => {
  if (!texture || !texture.image) return null
  
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    const img = texture.image
    canvas.width = Math.min(img.width || 256, 256)
    canvas.height = Math.min(img.height || 256, 256)
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch (e) {
    console.error('Failed to convert texture to data URL:', e)
    return null
  }
}

// Texture Controls Component - Similar to Twinmotion's texture manipulation options
interface TextureControlsProps {
  mapType: string
  texture: THREE.Texture
  onUpdate: (mapType: string, props: { repeatX?: number; repeatY?: number; offsetX?: number; offsetY?: number; rotation?: number; randomScale?: boolean }) => void
}

function TextureControls({ mapType, texture, onUpdate }: TextureControlsProps) {
  const [repeatX, setRepeatX] = useState(texture.repeat.x)
  const [repeatY, setRepeatY] = useState(texture.repeat.y)
  const [offsetX, setOffsetX] = useState(texture.offset.x)
  const [offsetY, setOffsetY] = useState(texture.offset.y)
  const [rotation, setRotation] = useState(THREE.MathUtils.radToDeg(texture.rotation))

  // Update local state when texture changes
  useEffect(() => {
    setRepeatX(texture.repeat.x)
    setRepeatY(texture.repeat.y)
    setOffsetX(texture.offset.x)
    setOffsetY(texture.offset.y)
    setRotation(THREE.MathUtils.radToDeg(texture.rotation))
  }, [texture])

  const handleRandomScale = () => {
    const randomScale = 0.5 + Math.random() * 1.5 // Random between 0.5 and 2.0
    const newRepeatX = repeatX * randomScale
    const newRepeatY = repeatY * randomScale
    setRepeatX(newRepeatX)
    setRepeatY(newRepeatY)
    onUpdate(mapType, { repeatX: newRepeatX, repeatY: newRepeatY, randomScale: true })
  }

  return (
    <div style={{ fontSize: '11px', marginTop: '6px', padding: '6px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '4px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#aaa', minWidth: '45px' }}>Scale:</span>
          <input
            type="number"
            value={repeatX.toFixed(2)}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 1
              setRepeatX(val)
              onUpdate(mapType, { repeatX: val })
            }}
            step="0.1"
            min="0.01"
            style={{ flex: 1, fontSize: '10px', padding: '3px 5px', minWidth: 0 }}
            className="color-text-input"
            placeholder="X"
          />
          <input
            type="number"
            value={repeatY.toFixed(2)}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 1
              setRepeatY(val)
              onUpdate(mapType, { repeatY: val })
            }}
            step="0.1"
            min="0.01"
            style={{ flex: 1, fontSize: '10px', padding: '3px 5px', minWidth: 0 }}
            className="color-text-input"
            placeholder="Y"
          />
          <button
            onClick={handleRandomScale}
            title="Randomize scale (like Twinmotion)"
            style={{ fontSize: '9px', padding: '3px 6px', background: '#444', border: '1px solid #666', borderRadius: '3px', cursor: 'pointer' }}
          >
            🎲
          </button>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#aaa', minWidth: '45px' }}>Offset:</span>
          <input
            type="number"
            value={offsetX.toFixed(3)}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0
              setOffsetX(val)
              onUpdate(mapType, { offsetX: val })
            }}
            step="0.01"
            style={{ flex: 1, fontSize: '10px', padding: '3px 5px', minWidth: 0 }}
            className="color-text-input"
            placeholder="X"
          />
          <input
            type="number"
            value={offsetY.toFixed(3)}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0
              setOffsetY(val)
              onUpdate(mapType, { offsetY: val })
            }}
            step="0.01"
            style={{ flex: 1, fontSize: '10px', padding: '3px 5px', minWidth: 0 }}
            className="color-text-input"
            placeholder="Y"
          />
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#aaa', minWidth: '45px' }}>Rotate:</span>
          <input
            type="number"
            value={rotation.toFixed(1)}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 0
              setRotation(val)
              onUpdate(mapType, { rotation: THREE.MathUtils.degToRad(val) })
            }}
            step="1"
            style={{ flex: 1, fontSize: '10px', padding: '3px 5px' }}
            className="color-text-input"
            placeholder="Degrees"
          />
          <span style={{ fontSize: '9px', color: '#888', minWidth: '20px' }}>°</span>
        </div>
      </div>
    </div>
  )
}

// Texture Map Slot Component
interface TextureMapSlotProps {
  label: string
  hasMap: boolean
  texture: THREE.Texture | null | undefined
  mapType: string
  onUpload: (mapType: string, file: File) => void
  onRemove: (mapType: string) => void
  onDuplicate?: (mapType: string) => void
  textureToDataUrl: (texture: THREE.Texture) => string | null
  showActive?: boolean
  showControls?: boolean
  controls?: React.ReactNode
}

function TextureMapSlot({ 
  label, 
  hasMap, 
  texture, 
  mapType, 
  onUpload, 
  onRemove,
  onDuplicate,
  textureToDataUrl,
  showActive,
  showControls,
  controls
}: TextureMapSlotProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number } | null>(null)
  
  const handleClick = () => {
    fileInputRef.current?.click()
  }
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(mapType, file)
    }
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      const fileName = file.name.toLowerCase()
      // Allow images, HDR/EXR, compressed textures, and Substance files
      if (file.type.startsWith('image/') || fileName.endsWith('.hdr') || fileName.endsWith('.exr') || fileName.endsWith('.ktx2') || fileName.endsWith('.basis') || fileName.endsWith('.sbar') || fileName.endsWith('.sbsar')) {
        onUpload(mapType, file)
      }
    }
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  
  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (hasMap && texture && onDuplicate) {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY })
    }
  }

  const handleDuplicate = () => {
    if (onDuplicate) {
      onDuplicate(mapType)
      setContextMenu(null)
    }
  }

  React.useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null)
    }
    
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('contextmenu', handleClickOutside)
      }
    }
  }, [contextMenu])
  
  return (
    <div className="texture-map-item">
      <div 
        className={`texture-map-preview ${dragOver ? 'drag-over' : ''}`}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onContextMenu={handleContextMenu}
      >
        {hasMap && texture ? (
          <>
            <img 
              src={textureToDataUrl(texture) || ''} 
              alt={`${label} Map`}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span className="texture-map-label">{label}</span>
            {showActive && <span className="texture-map-active">ACTIVE</span>}
            <button
              className="texture-map-remove"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(mapType)
              }}
              title="Remove texture"
            >
              ×
            </button>
          </>
        ) : (
          <>
            <div className="texture-map-empty">
              <svg className="texture-map-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span style={{ fontSize: '10px', marginTop: '8px', color: '#888' }}>Click to upload</span>
            </div>
            <span className="texture-map-label">{label}</span>
          </>
        )}
      </div>
      {showControls && controls}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.hdr,.exr,.ktx2,.basis,.sbar,.sbsar"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {contextMenu && hasMap && texture && (
        <div
          className="texture-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000,
            background: '#2a2a2a',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            minWidth: '160px',
            padding: '4px 0'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleDuplicate}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              color: '#e0e0e0',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span>📋</span>
            <span>Duplicate Texture</span>
          </button>
        </div>
      )}
    </div>
  )
}

interface MaterialItem {
  mesh: THREE.Mesh
  material: THREE.Material
  index?: number
  name: string
}

// PBR Material Presets Library
const PBR_MATERIAL_PRESETS = [
  { name: 'Gold', type: 'standard' as const, color: '#ffd700', metalness: 0.9, roughness: 0.2 },
  { name: 'Silver', type: 'standard' as const, color: '#c0c0c0', metalness: 0.9, roughness: 0.3 },
  { name: 'Copper', type: 'standard' as const, color: '#b87333', metalness: 0.95, roughness: 0.3 },
  { name: 'Chrome', type: 'standard' as const, color: '#888888', metalness: 1, roughness: 0 },
  { name: 'Iron', type: 'standard' as const, color: '#6e6e6e', metalness: 0.8, roughness: 0.5 },
  { name: 'Polished Wood', type: 'standard' as const, color: '#8B4513', metalness: 0, roughness: 0.3 },
  { name: 'Rough Wood', type: 'standard' as const, color: '#654321', metalness: 0, roughness: 0.9 },
  { name: 'Car Paint (Red)', type: 'physical' as const, color: '#cc0000', metalness: 0.5, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 },
  { name: 'Car Paint (Blue)', type: 'physical' as const, color: '#0000cc', metalness: 0.5, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 },
  { name: 'Plastic', type: 'standard' as const, color: '#ffffff', metalness: 0, roughness: 0.4 },
  { name: 'Glossy Plastic', type: 'standard' as const, color: '#cccccc', metalness: 0, roughness: 0.1 },
  { name: 'Matte Rubber', type: 'standard' as const, color: '#1a1a1a', metalness: 0, roughness: 1 },
  // Glass Presets (Based on Three.js Physical Transmission example)
  { name: 'Clear Glass', type: 'physical' as const, color: '#ffffff', metalness: 0, roughness: 0, transmission: 1.0, ior: 1.5, thickness: 0.5 },
  { name: 'Frosted Glass', type: 'physical' as const, color: '#ffffff', metalness: 0, roughness: 0.3, transmission: 0.9, ior: 1.5, thickness: 0.5 },
  { name: 'Tinted Glass', type: 'physical' as const, color: '#e8f5e9', metalness: 0, roughness: 0.05, transmission: 0.8, ior: 1.5, thickness: 2.0 },
  { name: 'Window Glass', type: 'physical' as const, color: '#ffffff', metalness: 0, roughness: 0.05, transmission: 0.95, ior: 1.45, thickness: 0.3 },
  { name: 'Crystal', type: 'physical' as const, color: '#ffffff', metalness: 0, roughness: 0, transmission: 1.0, ior: 1.54, thickness: 1.0 },
  { name: 'Diamond', type: 'physical' as const, color: '#ffffff', metalness: 0, roughness: 0, transmission: 1.0, ior: 2.42, thickness: 0.5 },
  { name: 'Ice', type: 'physical' as const, color: '#e3f2fd', metalness: 0, roughness: 0.1, transmission: 0.95, ior: 1.31, thickness: 1.5 },
  { name: 'Water', type: 'physical' as const, color: '#e1f5fe', metalness: 0, roughness: 0, transmission: 0.99, ior: 1.333, thickness: 1.0 },
  { name: 'Leather', type: 'standard' as const, color: '#3d2817', metalness: 0, roughness: 0.6 },
  { name: 'Fabric', type: 'standard' as const, color: '#cccccc', metalness: 0, roughness: 0.9 },
  { name: 'Ceramic', type: 'standard' as const, color: '#ffffff', metalness: 0, roughness: 0.1 },
]

export default function MaterialPanel() {
  const {
    showMaterialPanel,
    selectedMaterial,
    setSelectedMaterial,
    toggleMaterialPanel,
    textureAnisotropy,
    setError,
    paintMode,
    setPaintMode,
    colorPickerMode,
    setColorPickerMode,
    selectedObject,
    addToUndoStack
  } = useAppStore()

  const { viewer } = useViewer()
  const [allMaterials, setAllMaterials] = useState<MaterialItem[]>([])
  const materialsContainerRef = useRef<HTMLDivElement | null>(null)
  const bulkTextureInputRef = React.useRef<HTMLInputElement>(null)
  const textureReplaceInputRef = React.useRef<HTMLInputElement>(null)
  const [showMaterialLibrary, setShowMaterialLibrary] = useState(false)
  const [applyToAllMaterials, setApplyToAllMaterials] = useState(false)
  const [textureGroups, setTextureGroups] = useState<Array<{ id: string, textures: THREE.Texture[], signature: string, count: number }>>([])
  const [isMinimized, setIsMinimized] = useState(false)
  // Using registry-based RandomUVModifier for compatibility with other modifiers
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Calculate stacking offset for left-side panels
  const PANEL_WIDTH = 380
  const stackingOffset = usePanelStacking({ panelId: 'material', anchor: 'left' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'left',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'material'
    }
  )

  const [conversionStats, setConversionStats] = useState<MaterialConversionStats | null>(null)
  const [isConverting, setIsConverting] = useState(false)

  // Handler to apply two-sided rendering to materials
  const handleApplyTwoSidedMaterials = useCallback(() => {
    if (!viewer?.scene) {
      setError('Viewer not available')
      return
    }

    let count = 0

    if (selectedObject) {
      // Apply to selected object only
      if (selectedObject instanceof THREE.Mesh && selectedObject.material) {
        const materials = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material]
        materials.forEach((mat: THREE.Material) => {
          if ('side' in mat) {
            mat.side = THREE.DoubleSide
            mat.needsUpdate = true
            count++
          }
        })
      } else if (selectedObject instanceof THREE.Object3D) {
        // Traverse selected object and apply to all meshes
        selectedObject.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            materials.forEach((mat: THREE.Material) => {
              if ('side' in mat) {
                mat.side = THREE.DoubleSide
                mat.needsUpdate = true
                count++
              }
            })
          }
        })
      }
    } else {
      // Apply to all imported objects (skip system objects)
      viewer.scene.traverse((obj) => {
        // Skip system objects
        if (
          obj.userData.isShadowPlane ||
          obj.userData.isGridHelper ||
          obj.userData.isAxesHelper ||
          obj.userData.isLightGizmo ||
          obj.userData.isLightHelper ||
          obj.userData.isGroundedSkybox ||
          obj.userData.isDynamicSky ||
          obj.userData.isSun ||
          obj.userData.isMoon ||
          obj.userData.isNativeObjectsGroup
        ) {
          return
        }

        if (obj instanceof THREE.Mesh && obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((mat: THREE.Material) => {
            if ('side' in mat) {
              mat.side = THREE.DoubleSide
              mat.needsUpdate = true
              count++
            }
          })
        }
      })
    }

    if (count > 0) {
      console.log(`[MaterialPanel] Applied two-sided rendering to ${count} material(s)`)
      // Refresh materials list to show updated side property
      // This will be handled by the existing useEffect that watches for material changes
    } else {
      setError('No materials found to update')
    }
  }, [viewer, selectedObject, setError])

  // Handler to convert all MeshBasicMaterial to MeshStandardMaterial
  const handleConvertBasicMaterials = useCallback(() => {
    if (!viewer?.scene) {
      setError('Viewer not available')
      return
    }

    setIsConverting(true)
    setConversionStats(null)

    try {
      const stats = convertSceneBasicMaterials(viewer.scene, {
        skipSystemObjects: true,
        preserveOriginal: false
      })

      setConversionStats(stats)

      // CRITICAL: After material conversion, ensure transparent materials are configured for shadow passing
      // Converted materials might be transparent (opacity < 1.0) but don't have the transparentShadowConfigured marker
      // This ensures converted transparent materials have depthWrite = false and castShadow = false
      if (stats.totalConverted > 0) {
        // Re-run transparent material configuration to catch any converted transparent materials
        const transparentResult = configureAllTransparentMaterials(viewer.scene, {
          force: false,
          logResults: false
        })
        
        if (transparentResult.configured > 0) {
          console.log(`[MaterialConverter] Configured ${transparentResult.configured} transparent material(s) after conversion`)
        }
        
        // CRITICAL: Re-apply HDR environment map to converted materials if HDR is enabled
        // Converted materials are new objects and won't have envMap unless we re-apply it
        if (viewer.scene.environment) {
          const hdrIntensity = useAppStore.getState().hdrIntensity
          const envMap = viewer.scene.environment
          
          // Apply envMap to all MeshStandardMaterial and MeshPhysicalMaterial instances
          let reappliedCount = 0
          viewer.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              // CRITICAL: Skip shadow plane - it should not receive HDR envMap
              if (obj.userData.isShadowPlane || (obj.name || '').toLowerCase() === 'shadow plane') {
                return
              }
              
              const material = obj.material
              const materials = Array.isArray(material) ? material : [material]
              
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                  // Only apply if material doesn't already have envMap (newly converted materials)
                  // or if it's a converted material (check name)
                  const isConverted = mat.name && mat.name.includes('(converted)')
                  if (isConverted || !mat.envMap) {
                    mat.envMap = envMap
                    mat.envMapIntensity = hdrIntensity
                    mat.needsUpdate = true
                    reappliedCount++
                  }
                }
              })
            }
          })
          
          if (reappliedCount > 0) {
            console.log(`[MaterialConverter] Re-applied HDR environment map to ${reappliedCount} converted material(s)`)
          }
        }
        
        // CRITICAL: Ensure shadow plane always receives shadows after conversion
        // This is a safety measure in case the shadow plane was somehow modified
        viewer.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && (obj.userData.isShadowPlane || (obj.name || '').toLowerCase() === 'shadow plane')) {
            obj.receiveShadow = true
            obj.castShadow = false
            
            // Ensure shadow plane material has depthWrite = true for proper shadow rendering
            const material = obj.material
            if (material && material instanceof THREE.Material) {
              if (material instanceof THREE.ShadowMaterial) {
                material.opacity = Math.max(0.1, material.opacity || 0.5)
              } else if (material instanceof THREE.MeshStandardMaterial) {
                material.depthWrite = true
                if (material.opacity < 1.0) {
                  material.transparent = true
                }
              } else {
                material.depthWrite = true
              }
              
              if (material.userData) {
                delete material.userData.transparentShadowConfigured
              }
              
              material.needsUpdate = true
            }
            
            console.log('[MaterialConverter] Shadow plane restored after conversion:', {
              receiveShadow: obj.receiveShadow,
              castShadow: obj.castShadow,
              materialType: material?.constructor?.name,
              depthWrite: material instanceof THREE.Material ? material.depthWrite : 'N/A'
            })
          }
        })
      }

      // Force material refresh by clearing and letting useEffect recollect
      // The useEffect will automatically refresh when conversionStats changes

      // Clear selected material if it was converted
      if (selectedMaterial?.material instanceof THREE.MeshBasicMaterial) {
        setSelectedMaterial(null)
      }

      // Log results
      if (stats.totalConverted > 0) {
        console.log(`[MaterialConverter] Converted ${stats.totalConverted} MeshBasicMaterial(s) to MeshStandardMaterial across ${stats.meshesUpdated} mesh(es)`)
        if (stats.errors.length > 0) {
          console.warn(`[MaterialConverter] ${stats.errors.length} error(s) during conversion:`, stats.errors)
        }
      } else {
        console.log('[MaterialConverter] No MeshBasicMaterial instances found to convert')
      }
    } catch (error) {
      console.error('[MaterialConverter] Conversion failed:', error)
      setError(`Failed to convert materials: ${error}`)
    } finally {
      setIsConverting(false)
    }
  }, [viewer, selectedMaterial, setSelectedMaterial, setError])

  const [materialProps, setMaterialProps] = useState({
    metalness: 0,
    roughness: 1,
    envMapIntensity: 1,
    color: '#ffffff',
    emissive: '#000000',
    emissiveIntensity: 0,
    opacity: 1,
    transparent: false,
    side: 'Front' as 'Front' | 'Back' | 'Double',
    clearcoat: 0,
    clearcoatRoughness: 0,
    ior: 1.5,
    transmission: 0,
    thickness: 0,
    sheen: 0,
    sheenRoughness: 1,
    sheenColor: '#ffffff',
    // Dispersion for glass materials
    dispersionEnabled: false,
    dispersionValue: 0.02,
    // Texture map intensities
    normalScale: { x: 1, y: 1 },
    displacementScale: 1,
    aoMapIntensity: 1,
    bumpScale: 1,
    // Random UV variation
    randomUVEnabled: false,
    randomUVOffsetRange: 0.1,
    randomUVRotationRange: Math.PI / 4, // 45 degrees in radians
    randomUVScaleMin: 0.8,
    randomUVScaleMax: 1.2
  })

  // Collect all materials from scene
  useEffect(() => {
    if (!viewer?.scene || !showMaterialPanel) return

    const materials: MaterialItem[] = []
    viewer.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        // Skip helpers and shadow plane
        if (object.userData.isShadowPlane || object.userData.isGridHelper || object.userData.isAxesHelper) {
          return
        }
        
        const mesh = object
        const mat = mesh.material

        if (Array.isArray(mat)) {
          mat.forEach((m, idx) => {
            materials.push({
              mesh,
              material: m,
              index: idx,
              name: m.name || `Material ${idx + 1} (${mesh.name || 'Mesh'})`
            })
          })
        } else {
          materials.push({
            mesh,
            material: mat,
            name: mat.name || `Unnamed Material (${mesh.name || 'Mesh'})`
          })
        }
      }
    })

    setAllMaterials(materials)
  }, [viewer, showMaterialPanel, selectedMaterial, conversionStats])

  // Collect and group textures from scene
  const rescanAndGroupTextures = useCallback(() => {
    if (!viewer?.scene) return

    const textureMap = new Map<THREE.Texture, { texture: THREE.Texture, src: string, width: number, height: number }>()
    const textureProperties = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
      'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
      'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
      'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
      'specularIntensityMap', 'specularColorMap'
    ]

    viewer.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          textureProperties.forEach((prop) => {
            const texture = (mat as any)[prop] as THREE.Texture | undefined
            if (texture && texture instanceof THREE.Texture && texture.image) {
              if (!textureMap.has(texture)) {
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
                textureMap.set(texture, { texture, src, width, height })
              }
            }
          })
        })
      }
    })

    // Group textures by signature
    const groups = new Map<string, THREE.Texture[]>()
    textureMap.forEach((info, texture) => {
      const signature = info.src 
        ? `${info.width}x${info.height}-${info.src.substring(0, 100)}`
        : `${info.width}x${info.height}`
      
      if (!groups.has(signature)) {
        groups.set(signature, [])
      }
      groups.get(signature)!.push(texture)
    })

    // Convert to array format
    const groupedTextures = Array.from(groups.entries())
      .filter(([_, textures]) => textures.length > 1) // Only show groups with duplicates
      .map(([signature, textures]) => ({
        id: `group-${signature}`,
        textures,
        signature,
        count: textures.length
      }))

    setTextureGroups(groupedTextures)
    console.log(`[MaterialPanel] Rescanned textures: found ${groupedTextures.length} duplicate groups`)
  }, [viewer])

  // Auto-rescan textures when materials change
  useEffect(() => {
    if (allMaterials.length > 0) {
      // Use setTimeout to avoid blocking
      setTimeout(() => {
        rescanAndGroupTextures()
      }, 100)
    }
  }, [allMaterials.length, rescanAndGroupTextures])

  // Merge textures in a group
  const handleMergeTextureGroup = useCallback((groupId: string) => {
    const group = textureGroups.find(g => g.id === groupId)
    if (!group || group.textures.length < 2) return

    if (!viewer?.scene) {
      setError('Scene not available')
      return
    }

    // Use the first texture as canonical
    const canonical = group.textures[0]
    const toMerge = group.textures.slice(1)

    // Find all materials using textures to merge
    const materialsToUpdate: Array<{ mat: THREE.Material, prop: string }> = []
    const textureProperties = [
      'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
      'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap',
      'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
      'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap',
      'specularIntensityMap', 'specularColorMap'
    ]

    viewer.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat) => {
          textureProperties.forEach((prop) => {
            const texture = (mat as any)[prop] as THREE.Texture | undefined
            if (texture && toMerge.includes(texture) && texture !== canonical) {
              materialsToUpdate.push({ mat, prop })
            }
          })
        })
      }
    })

    // Replace textures
    let replaced = 0
    materialsToUpdate.forEach(({ mat, prop }) => {
      (mat as any)[prop] = canonical
      mat.needsUpdate = true
      replaced++
    })

    // Dispose merged textures
    toMerge.forEach(texture => {
      try {
        if (texture?.dispose) {
          texture.dispose()
        }
      } catch (e) {
        console.warn('Failed to dispose texture:', e)
      }
    })

    alert(`✅ Merged ${toMerge.length} duplicate texture(s) into one\n\nReplaced in ${replaced} material(s)`)
    
    // Rescan to update groups
    rescanAndGroupTextures()
  }, [textureGroups, viewer, rescanAndGroupTextures, setError])

  // Scroll selected material into view when it changes
  useEffect(() => {
    if (!selectedMaterial || !showMaterialPanel || allMaterials.length === 0) return

      // Use requestAnimationFrame with a small delay to ensure DOM is updated after material selection
      const timeoutId = setTimeout(() => {
        const materialGrid = panelRef.current?.querySelector('.material-grid')
        if (materialGrid) {
        // Find the material swatch element by matching the material
          const swatches = materialGrid.querySelectorAll('.material-swatch')
        let targetSwatch: HTMLElement | null = null
        
        for (let i = 0; i < swatches.length; i++) {
          const swatch = swatches[i] as HTMLElement
          // Check if this swatch corresponds to the selected material
          // We'll use the title attribute which contains the material name
          if (swatch.title === selectedMaterial.material.name || 
              (selectedMaterial.name && swatch.title === selectedMaterial.name)) {
            targetSwatch = swatch
            break
          }
        }
          
          if (targetSwatch) {
            // Scroll the selected material into view
            targetSwatch.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'nearest'
            })
          }
        }
      }, 100) // Small delay to ensure DOM is updated

      return () => clearTimeout(timeoutId)
  }, [selectedMaterial, showMaterialPanel, allMaterials])

  // Update material props when selected material changes
  useEffect(() => {
    if (!selectedMaterial || !selectedMaterial.material) {
      return
    }

    const mat = selectedMaterial.material
    const props: typeof materialProps = {
      metalness: 0,
      roughness: 1,
      envMapIntensity: 1,
      color: '#ffffff',
      emissive: '#000000',
      emissiveIntensity: 0,
      opacity: mat.opacity ?? 1,
      transparent: mat.transparent ?? false,
      side: mat.side === THREE.DoubleSide ? 'Double' : mat.side === THREE.BackSide ? 'Back' : 'Front',
      clearcoat: 0,
      clearcoatRoughness: 0,
      ior: 1.5,
      transmission: 0,
      thickness: 0,
      sheen: 0,
      sheenRoughness: 1,
      sheenColor: '#ffffff',
              dispersionEnabled: false,
        dispersionValue: 0.02,
        normalScale: { x: 1, y: 1 },
        displacementScale: 1,
        aoMapIntensity: 1,
        bumpScale: 1,
        randomUVEnabled: false,
        randomUVOffsetRange: 0.1,
        randomUVRotationRange: Math.PI / 4,
        randomUVScaleMin: 0.8,
        randomUVScaleMax: 1.2
      }

    // Get properties based on material type
    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      props.metalness = mat.metalness ?? 0
      props.roughness = mat.roughness ?? 1
      props.envMapIntensity = mat.envMapIntensity ?? 1
      props.clearcoat = (mat as THREE.MeshPhysicalMaterial).clearcoat ?? 0
      props.clearcoatRoughness = (mat as THREE.MeshPhysicalMaterial).clearcoatRoughness ?? 0
      props.ior = (mat as THREE.MeshPhysicalMaterial).ior ?? 1.5
      props.transmission = (mat as THREE.MeshPhysicalMaterial).transmission ?? 0
      props.thickness = (mat as THREE.MeshPhysicalMaterial).thickness ?? 0
      props.sheen = (mat as THREE.MeshPhysicalMaterial).sheen ?? 0
      props.sheenRoughness = (mat as THREE.MeshPhysicalMaterial).sheenRoughness ?? 1
      if ((mat as THREE.MeshPhysicalMaterial).sheenColor) {
        props.sheenColor = '#' + (mat as THREE.MeshPhysicalMaterial).sheenColor.getHexString()
      }

      // Texture map scales
      if (mat.normalScale) {
        props.normalScale = { x: mat.normalScale.x, y: mat.normalScale.y }
      }
      props.displacementScale = mat.displacementScale ?? 1
      props.aoMapIntensity = mat.aoMapIntensity ?? 1
      props.bumpScale = (mat as any).bumpScale ?? 1
      
              // Get dispersion properties for physical materials
        if (mat instanceof THREE.MeshPhysicalMaterial) {
          props.dispersionEnabled = mat.userData.dispersionApplied === true
          props.dispersionValue = mat.userData.dispersionValue ?? 0.02
        }
        
        // Get Random UV properties
        if (mat.userData.randomUVConfig) {
          const config = mat.userData.randomUVConfig as RandomUVConfig
          props.randomUVEnabled = config.enabled
          props.randomUVOffsetRange = config.offsetRange
          props.randomUVRotationRange = config.rotationRange
          props.randomUVScaleMin = config.scaleRange.min
          props.randomUVScaleMax = config.scaleRange.max
        }
    }

    if ('color' in mat && mat.color) {
      props.color = '#' + (mat.color as THREE.Color).getHexString()
    }
    if ('emissive' in mat && mat.emissive) {
      props.emissive = '#' + (mat.emissive as THREE.Color).getHexString()
      props.emissiveIntensity = ('emissiveIntensity' in mat && typeof mat.emissiveIntensity === 'number') ? mat.emissiveIntensity : 0
    }

    setMaterialProps(props)
  }, [selectedMaterial])

  if (!showMaterialPanel) return null

  const mat = selectedMaterial?.material
  const isPBR = mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial
  const isPhysical = mat instanceof THREE.MeshPhysicalMaterial

  const updateMaterial = (updates: Partial<typeof materialProps>) => {
    if (!selectedMaterial || !selectedMaterial.material) {
      console.warn('[MaterialPanel] ⚠️ updateMaterial called but no material selected:', { updates })
      return
    }

    const newProps = { ...materialProps, ...updates }
    setMaterialProps(newProps)

    const material = selectedMaterial.material
    
    // Debug: Log what material we're updating (especially for envMapIntensity)
    if ('envMapIntensity' in updates) {
      console.log('[MaterialPanel] 🔧 updateMaterial called for envMapIntensity:', {
        materialType: material.constructor.name,
        isPBR: material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial,
        materialName: material.name || 'Unnamed',
        meshName: selectedMaterial.mesh?.name || 'Unnamed',
        newValue: updates.envMapIntensity,
        currentValue: (material as any).envMapIntensity,
        hasEnvMap: !!(material as any).envMap
      })
    }
    
    // Debug: Log what material we're updating
    if ('envMapIntensity' in updates) {
      console.log('[MaterialPanel] 🔧 updateMaterial called for envMapIntensity:', {
        materialType: material.constructor.name,
        isPBR: material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial,
        materialName: material.name || 'Unnamed',
        meshName: selectedMaterial.mesh?.name || 'Unnamed',
        newValue: updates.envMapIntensity,
        currentValue: (material as any).envMapIntensity
      })
    }

    // Update common properties
    if ('color' in material && material.color) {
      (material.color as THREE.Color).setHex(parseInt(newProps.color.replace('#', ''), 16))
    }
    if ('emissive' in material && material.emissive) {
      (material.emissive as THREE.Color).setHex(parseInt(newProps.emissive.replace('#', ''), 16))
      if ('emissiveIntensity' in material) {
        (material as any).emissiveIntensity = newProps.emissiveIntensity
      }
    }
    material.opacity = newProps.opacity
    material.transparent = newProps.transparent

    // Update side
    material.side = newProps.side === 'Double' ? THREE.DoubleSide : 
                     newProps.side === 'Back' ? THREE.BackSide : 
                     THREE.FrontSide

    // Update PBR properties
    // IMPROVED: Only update if values actually changed (optimizes needsUpdate)
    if (isPBR) {
      const pbrMat = material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
      
      // Validate and clamp values to valid ranges
      const validMetalness = Math.max(0.0, Math.min(1.0, newProps.metalness))
      const validRoughness = Math.max(0.0, Math.min(1.0, newProps.roughness))
      
      // Only update if values actually changed
      let needsUpdate = false
      if (Math.abs(pbrMat.metalness - validMetalness) > 0.001) {
        pbrMat.metalness = validMetalness
        needsUpdate = true
      }
      if (Math.abs(pbrMat.roughness - validRoughness) > 0.001) {
        pbrMat.roughness = validRoughness
        needsUpdate = true
      }
      
      // Set needsUpdate only if values changed
      if (needsUpdate) {
        pbrMat.needsUpdate = true
      }
      
      // CRITICAL: When user manually sets envMapIntensity, mark it as user-controlled
      // This prevents HDR system from overriding the user's custom value
      
      // Handle envMapIntensity updates specially
      if ('envMapIntensity' in updates) {
        console.log('[MaterialPanel] 🎨 Processing envMapIntensity update:', {
          newValue: newProps.envMapIntensity,
          currentValue: pbrMat.envMapIntensity,
          hasEnvMap: !!pbrMat.envMap,
          envMapType: pbrMat.envMap?.constructor?.name || 'none',
          materialName: material.name || 'Unnamed',
          meshName: selectedMaterial.mesh?.name || 'Unnamed',
          materialType: pbrMat.constructor.name
        })
        
        // If user is changing envMapIntensity, ensure material has an envMap
        if (!pbrMat.envMap && viewer?.scene?.environment) {
          // Automatically assign scene.environment if available
          pbrMat.envMap = viewer.scene.environment
          console.log('[MaterialPanel] ✅ Auto-assigned scene.environment to material for envMapIntensity control')
        }
        
        // CRITICAL: Set user-controlled flag BEFORE setting intensity
        // This ensures the flag is set even if the material is shared across multiple meshes
        // Initialize userData if it doesn't exist (some materials might not have it)
        if (!pbrMat.userData) {
          pbrMat.userData = {}
          console.log('[MaterialPanel] ✅ Initialized userData for material')
        }
        
        // Set the flag and value
        pbrMat.userData.userControlledEnvMapIntensity = true
        pbrMat.userData.userEnvMapIntensity = newProps.envMapIntensity
        
        // Now set the intensity (flag is already set, so HDR system will preserve it)
        const previousIntensity = pbrMat.envMapIntensity
        pbrMat.envMapIntensity = newProps.envMapIntensity
        
        // CRITICAL: Force material update to ensure changes are visible
        pbrMat.needsUpdate = true
        
        // Verify the value was set
        if (pbrMat.envMapIntensity !== newProps.envMapIntensity) {
          console.error('[MaterialPanel] ❌ FAILED to set envMapIntensity!', {
            expected: newProps.envMapIntensity,
            actual: pbrMat.envMapIntensity,
            previous: previousIntensity,
            materialName: material.name || 'Unnamed'
          })
        } else {
          console.log('[MaterialPanel] ✅ Successfully set envMapIntensity:', {
            value: pbrMat.envMapIntensity,
            userControlledFlag: pbrMat.userData.userControlledEnvMapIntensity,
            storedIntensity: pbrMat.userData.userEnvMapIntensity,
            materialName: material.name || 'Unnamed'
          })
        }
      } else {
        // Not an envMapIntensity update, just set the value normally
        pbrMat.envMapIntensity = newProps.envMapIntensity
      }
      
      // Debug logging for envMapIntensity changes
      if ('envMapIntensity' in updates) {
        // Check if material is shared across multiple meshes
        let sharedMeshCount = 0
        if (viewer?.scene) {
          viewer.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              if (Array.isArray(obj.material)) {
                if (obj.material.includes(pbrMat)) {
                  sharedMeshCount++
                }
              } else if (obj.material === pbrMat) {
                sharedMeshCount++
              }
            }
          })
        }
        
        console.log('[MaterialPanel] ✅ Updated envMapIntensity:', {
          value: newProps.envMapIntensity,
          hasEnvMap: !!pbrMat.envMap,
          envMapType: pbrMat.envMap?.constructor?.name || 'none',
          materialName: material.name || 'Unnamed',
          meshName: selectedMaterial.mesh?.name || 'Unnamed',
          userControlled: true,
          sharedByMeshes: sharedMeshCount,
          userDataFlag: pbrMat.userData?.userControlledEnvMapIntensity,
          storedIntensity: pbrMat.userData?.userEnvMapIntensity
        })
        
        // Warn if material still doesn't have an envMap (intensity won't have effect)
        if (!pbrMat.envMap) {
          console.warn('[MaterialPanel] ⚠️ Material has no envMap - envMapIntensity changes will not be visible. Enable HDR or set scene.environment.')
        }
        
        // Warn if material is shared (changes will affect all meshes using it)
        if (sharedMeshCount > 1) {
          console.log(`[MaterialPanel] ℹ️ Material is shared by ${sharedMeshCount} meshes - intensity change will affect all of them`)
        }
      }

      // Texture map scales
      if (pbrMat.normalScale) {
        pbrMat.normalScale.set(newProps.normalScale.x, newProps.normalScale.y)
      }
      pbrMat.displacementScale = newProps.displacementScale
      pbrMat.aoMapIntensity = newProps.aoMapIntensity
      if ('bumpScale' in pbrMat) {
        (pbrMat as any).bumpScale = newProps.bumpScale
      }

      // Update Physical Material specific properties
      if (isPhysical) {
        const physMat = material as THREE.MeshPhysicalMaterial
        physMat.clearcoat = newProps.clearcoat
        physMat.clearcoatRoughness = newProps.clearcoatRoughness
        physMat.ior = newProps.ior
        physMat.transmission = newProps.transmission
        
        // Note: Dispersion is no longer auto-applied to prevent shader errors
        // Users must manually enable it via the Material Panel checkbox
        physMat.thickness = newProps.thickness
        physMat.sheen = newProps.sheen
        physMat.sheenRoughness = newProps.sheenRoughness
        physMat.sheenColor.setHex(parseInt(newProps.sheenColor.replace('#', ''), 16))
      }
          }

      // Apply Random UV Modifier if enabled (using registry version)
      if ('randomUVEnabled' in updates || 'randomUVOffsetRange' in updates || 'randomUVRotationRange' in updates || 'randomUVScaleMin' in updates || 'randomUVScaleMax' in updates) {
        const config: RandomUVConfig = {
          enabled: newProps.randomUVEnabled,
          offsetRange: newProps.randomUVOffsetRange,
          rotationRange: newProps.randomUVRotationRange,
          scaleRange: {
            min: newProps.randomUVScaleMin,
            max: newProps.randomUVScaleMax
          }
        }
        randomUVModifierRegistry.applyToMaterial(material, config)
      }

      material.needsUpdate = true
      
      // Add undo support for material property changes
      // Track important properties that changed
      const importantProperties = ['roughness', 'metalness', 'emissive', 'emissiveIntensity', 'opacity', 'transparent', 'clearcoat', 'clearcoatRoughness', 'ior', 'transmission', 'thickness', 'sheen', 'sheenRoughness', 'sheenColor', 'envMapIntensity']
      for (const prop of importantProperties) {
        if (prop in updates) {
          const previousValue = (material as any)[prop]
          const newValue = (material as any)[prop]
          
          // For color properties, clone the color
          let prevVal = previousValue
          let newVal = newValue
          if (prop === 'emissive' || prop === 'sheenColor') {
            prevVal = previousValue instanceof THREE.Color ? previousValue.clone() : previousValue
            newVal = newValue instanceof THREE.Color ? newValue.clone() : newValue
          }
          
          addToUndoStack({
            type: 'material-property-change',
            material: material,
            property: prop,
            previousValue: prevVal,
            newValue: newVal
          })
        }
      }
    }

  // Apply PBR material preset
  const applyMaterialPreset = useCallback((preset: typeof PBR_MATERIAL_PRESETS[0]) => {
    if (!selectedMaterial || !selectedMaterial.material) return
    if (!isPBR) {
      // Convert material to PBR type if needed
      const material = selectedMaterial.material
      const isPhysicalMaterial = preset.type === 'physical'
      
      let newMaterial: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
      
      if (isPhysicalMaterial) {
        newMaterial = new THREE.MeshPhysicalMaterial()
      } else {
        newMaterial = new THREE.MeshStandardMaterial()
      }
      
      // Copy properties
      newMaterial.name = material.name
      newMaterial.visible = material.visible
      
      // Replace material in mesh
      if (selectedMaterial.index !== undefined) {
        const matArray = selectedMaterial.mesh.material as THREE.Material[]
        matArray[selectedMaterial.index] = newMaterial
        selectedMaterial.mesh.material = matArray
      } else {
        selectedMaterial.mesh.material = newMaterial
      }
      
      // Update selectedMaterial reference
      setSelectedMaterial({
        mesh: selectedMaterial.mesh,
        material: newMaterial,
        index: selectedMaterial.index
      })
      
      // Wait for state to update, then apply preset
      setTimeout(() => {
        const presetProps: Partial<typeof materialProps> = {
          color: preset.color,
          metalness: preset.metalness || 0,
          roughness: preset.roughness || 1
        }
        
        if (isPhysicalMaterial) {
          if ('clearcoat' in preset) presetProps.clearcoat = preset.clearcoat || 0
          if ('clearcoatRoughness' in preset) presetProps.clearcoatRoughness = preset.clearcoatRoughness || 0
          if ('ior' in preset) presetProps.ior = preset.ior || 1.5
          if ('transmission' in preset) presetProps.transmission = preset.transmission || 0
          if ('thickness' in preset) presetProps.thickness = preset.thickness || 0.5
          
          // Apply physical transmission optimizations for glass materials
          // Based on Three.js physical transmission example: https://threejs.org/examples/#webgl_materials_physical_transmission
          if (preset.transmission && preset.transmission > 0.5) {
            const physicalMat = newMaterial as THREE.MeshPhysicalMaterial
            // Enhanced environment map intensity for glass
            physicalMat.envMapIntensity = 1.5
            // Ensure transparency
            physicalMat.transparent = true
            // Mark as glass material
            physicalMat.userData.isGlass = true
          }
        }
        
        // Apply preset properties
        updateMaterial(presetProps)
      }, 10)
    } else {
      // Apply preset directly
      const presetProps: Partial<typeof materialProps> = {
        color: preset.color,
        metalness: preset.metalness || 0,
        roughness: preset.roughness || 1
      }
      
      if (isPhysical && preset.type === 'physical') {
        if ('clearcoat' in preset) presetProps.clearcoat = preset.clearcoat || 0
        if ('clearcoatRoughness' in preset) presetProps.clearcoatRoughness = preset.clearcoatRoughness || 0
        if ('ior' in preset) presetProps.ior = preset.ior || 1.5
        if ('transmission' in preset) presetProps.transmission = preset.transmission || 0
        if ('thickness' in preset) presetProps.thickness = preset.thickness || 0.5
        
        // Apply physical transmission optimizations for glass materials
        if (preset.transmission && preset.transmission > 0.5) {
          const physMat = material as THREE.MeshPhysicalMaterial
          physMat.envMapIntensity = 1.5
          physMat.transparent = true
          physMat.userData.isGlass = true
        }
      }
      
      updateMaterial(presetProps)
    }
    
    setShowMaterialLibrary(false)
  }, [selectedMaterial, isPBR, isPhysical, updateMaterial, setSelectedMaterial])

  // Get all texture maps from material
  const getTextureMaps = useCallback(() => {
    if (!mat || !isPBR) return {}
    const pbrMat = mat as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
    
    return {
      map: pbrMat.map,
      normalMap: pbrMat.normalMap,
      roughnessMap: pbrMat.roughnessMap,
      metalnessMap: pbrMat.metalnessMap,
      aoMap: pbrMat.aoMap,
      bumpMap: pbrMat.bumpMap,
      displacementMap: pbrMat.displacementMap,
      emissiveMap: pbrMat.emissiveMap,
      alphaMap: pbrMat.alphaMap,
      clearcoatMap: (pbrMat as THREE.MeshPhysicalMaterial).clearcoatMap,
      clearcoatNormalMap: (pbrMat as THREE.MeshPhysicalMaterial).clearcoatNormalMap,
      clearcoatRoughnessMap: (pbrMat as THREE.MeshPhysicalMaterial).clearcoatRoughnessMap,
      sheenColorMap: (pbrMat as THREE.MeshPhysicalMaterial).sheenColorMap,
      sheenRoughnessMap: (pbrMat as THREE.MeshPhysicalMaterial).sheenRoughnessMap,
      transmissionMap: (pbrMat as THREE.MeshPhysicalMaterial).transmissionMap,
      thicknessMap: (pbrMat as THREE.MeshPhysicalMaterial).thicknessMap,
    }
  }, [mat, isPBR])

  const textureMaps = getTextureMaps()
  
  const hasNormalMap = !!textureMaps.normalMap
  const hasRoughnessMap = !!textureMaps.roughnessMap
  const hasMetalnessMap = !!textureMaps.metalnessMap
  const hasAoMap = !!textureMaps.aoMap
  const hasAlbedoMap = !!textureMaps.map
  const hasBumpMap = !!textureMaps.bumpMap
  const hasDisplacementMap = !!textureMaps.displacementMap
  const hasEmissiveMap = !!textureMaps.emissiveMap
  const hasAlphaMap = !!textureMaps.alphaMap
  const hasClearcoatMap = !!textureMaps.clearcoatMap
  const hasClearcoatNormalMap = !!textureMaps.clearcoatNormalMap
  const hasClearcoatRoughnessMap = !!textureMaps.clearcoatRoughnessMap
  const hasSheenColorMap = !!textureMaps.sheenColorMap
  const hasSheenRoughnessMap = !!textureMaps.sheenRoughnessMap
  const hasTransmissionMap = !!textureMaps.transmissionMap
  const hasThicknessMap = !!textureMaps.thicknessMap

  // Handle texture upload
  const handleTextureUpload = useCallback(async (mapType: string, file: File) => {
    if (!selectedMaterial || !selectedMaterial.material) return
    if (!viewer?.renderer) return
    
    const pbrMat = selectedMaterial.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
    const isPhysicalMaterial = selectedMaterial.material instanceof THREE.MeshPhysicalMaterial
    
    // Get previous texture for undo
    const mapTypeToProperty: Record<string, string> = {
      'albedo': 'map',
      'normal': 'normalMap',
      'roughness': 'roughnessMap',
      'metallic': 'metalnessMap',
      'ao': 'aoMap',
      'bump': 'bumpMap',
      'displacement': 'displacementMap',
      'emissive': 'emissiveMap',
      'alpha': 'alphaMap',
      'clearcoat': 'clearcoatMap',
      'clearcoatNormal': 'clearcoatNormalMap',
      'clearcoatRoughness': 'clearcoatRoughnessMap',
      'sheenColor': 'sheenColorMap',
      'sheenRoughness': 'sheenRoughnessMap',
      'transmission': 'transmissionMap',
      'thickness': 'thicknessMap'
    }
    const property = mapTypeToProperty[mapType] || mapType
    const previousTexture = (pbrMat as any)[property] as THREE.Texture | null
    
    // Get renderer's max anisotropy
    const maxAnisotropy = viewer.renderer.capabilities.getMaxAnisotropy()
    
    // Get custom anisotropy setting
    const textureAnisotropy = useAppStore.getState().textureAnisotropy
    const customAnisotropy = textureAnisotropy >= 0 ? textureAnisotropy : undefined
    
    try {
      // Use centralized texture loader which supports all formats (KTX2, Basis, HDR/EXR, standard images)
      const texture = await loadTexture(file, viewer.renderer, maxAnisotropy, customAnisotropy)
      
      // Apply texture to appropriate map slot
      switch (mapType) {
        case 'albedo':
          pbrMat.map = texture
          break
        case 'normal':
          pbrMat.normalMap = texture
          pbrMat.normalScale = pbrMat.normalScale || new THREE.Vector2(1, 1)
          break
        case 'roughness':
          pbrMat.roughnessMap = texture
          break
        case 'metallic':
          pbrMat.metalnessMap = texture
          break
        case 'ao':
          pbrMat.aoMap = texture
          break
        case 'bump':
          pbrMat.bumpMap = texture
          break
        case 'displacement':
          pbrMat.displacementMap = texture
          break
        case 'emissive':
          pbrMat.emissiveMap = texture
          break
        case 'alpha':
          pbrMat.alphaMap = texture
          break
        case 'clearcoat':
          if (isPhysicalMaterial && 'clearcoatMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).clearcoatMap = texture
          }
          break
        case 'clearcoatNormal':
          if (isPhysicalMaterial && 'clearcoatNormalMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).clearcoatNormalMap = texture
          }
          break
        case 'clearcoatRoughness':
          if (isPhysicalMaterial && 'clearcoatRoughnessMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).clearcoatRoughnessMap = texture
          }
          break
        case 'sheenColor':
          if (isPhysicalMaterial && 'sheenColorMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).sheenColorMap = texture
          }
          break
        case 'sheenRoughness':
          if (isPhysicalMaterial && 'sheenRoughnessMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).sheenRoughnessMap = texture
          }
          break
        case 'transmission':
          if (isPhysicalMaterial && 'transmissionMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).transmissionMap = texture
          }
          break
        case 'thickness':
          if (isPhysicalMaterial && 'thicknessMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).thicknessMap = texture
          }
          break
      }
      
      pbrMat.needsUpdate = true
      
      // Add to undo stack
      addToUndoStack({
        type: 'texture-change',
        material: pbrMat,
        mapType: mapType,
        previousTexture: previousTexture,
        newTexture: texture
      })
      
      // Force material props update
      if (selectedMaterial) {
        setSelectedMaterial({ ...selectedMaterial })
      }
    } catch (error) {
      console.error(`Failed to load ${mapType} texture:`, error)
      alert(`Failed to load ${mapType} texture. Please try a different image file.`)
    }
  }, [selectedMaterial, setSelectedMaterial, viewer, addToUndoStack])
  
  // Helper function to get texture for a map type
  const getTextureForMapType = useCallback((mapType: string): THREE.Texture | null => {
    if (!selectedMaterial || !selectedMaterial.material) return null
    const pbrMat = selectedMaterial.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
    const isPhysicalMaterial = selectedMaterial.material instanceof THREE.MeshPhysicalMaterial
    
    switch (mapType) {
      case 'albedo':
        return pbrMat.map as THREE.Texture | null
      case 'normal':
        return pbrMat.normalMap as THREE.Texture | null
      case 'roughness':
        return pbrMat.roughnessMap as THREE.Texture | null
      case 'metallic':
        return pbrMat.metalnessMap as THREE.Texture | null
      case 'ao':
        return pbrMat.aoMap as THREE.Texture | null
      case 'bump':
        return pbrMat.bumpMap as THREE.Texture | null
      case 'displacement':
        return pbrMat.displacementMap as THREE.Texture | null
      case 'emissive':
        return pbrMat.emissiveMap as THREE.Texture | null
      case 'alpha':
        return pbrMat.alphaMap as THREE.Texture | null
      case 'clearcoat':
        if (isPhysicalMaterial) {
          return (pbrMat as THREE.MeshPhysicalMaterial).clearcoatMap as THREE.Texture | null
        }
        return null
      case 'clearcoatNormal':
        if (isPhysicalMaterial) {
          return (pbrMat as THREE.MeshPhysicalMaterial).clearcoatNormalMap as THREE.Texture | null
        }
        return null
      case 'clearcoatRoughness':
        if (isPhysicalMaterial) {
          return (pbrMat as THREE.MeshPhysicalMaterial).clearcoatRoughnessMap as THREE.Texture | null
        }
        return null
      case 'sheenColor':
        if (isPhysicalMaterial) {
          return (pbrMat as THREE.MeshPhysicalMaterial).sheenColorMap as THREE.Texture | null
        }
        return null
      case 'sheenRoughness':
        if (isPhysicalMaterial) {
          return (pbrMat as THREE.MeshPhysicalMaterial).sheenRoughnessMap as THREE.Texture | null
        }
        return null
      case 'transmission':
        if (isPhysicalMaterial) {
          return (pbrMat as THREE.MeshPhysicalMaterial).transmissionMap as THREE.Texture | null
        }
        return null
      case 'thickness':
        if (isPhysicalMaterial) {
          return (pbrMat as THREE.MeshPhysicalMaterial).thicknessMap as THREE.Texture | null
        }
        return null
      default:
        return null
    }
  }, [selectedMaterial])

  // Helper function to update texture properties (repeat, offset, rotation)
  const updateTextureProperties = useCallback((mapType: string, props: { repeatX?: number; repeatY?: number; offsetX?: number; offsetY?: number; rotation?: number; randomScale?: boolean }) => {
    const texture = getTextureForMapType(mapType)
    if (!texture || !selectedMaterial?.material) return
    
    // Store previous properties for undo
    const previousProperties = {
      repeat: texture.repeat.clone(),
      offset: texture.offset.clone(),
      rotation: texture.rotation
    }
    
    // CRITICAL: Set wrapping mode to RepeatWrapping for textures to tile/repeat properly
    if (texture.repeat.x !== 1 || texture.repeat.y !== 1) {
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
    }
    
    if (props.repeatX !== undefined) {
      texture.repeat.x = props.repeatX
      // Auto-set wrapping mode when repeat is not 1
      if (props.repeatX !== 1) {
        texture.wrapS = THREE.RepeatWrapping
      }
    }
    if (props.repeatY !== undefined) {
      texture.repeat.y = props.repeatY
      // Auto-set wrapping mode when repeat is not 1
      if (props.repeatY !== 1) {
        texture.wrapT = THREE.RepeatWrapping
      }
    }
    if (props.offsetX !== undefined) texture.offset.x = props.offsetX
    if (props.offsetY !== undefined) texture.offset.y = props.offsetY
    if (props.rotation !== undefined) texture.rotation = props.rotation
    
    // Apply random scale variation if requested
    if (props.randomScale) {
      const randomScale = 0.5 + Math.random() * 1.5 // Random scale between 0.5 and 2.0
      texture.repeat.x *= randomScale
      texture.repeat.y *= randomScale
      if (texture.repeat.x !== 1 || texture.repeat.y !== 1) {
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
      }
    }
    
    texture.needsUpdate = true
    
    // Store new properties for undo
    const newProperties = {
      repeat: texture.repeat.clone(),
      offset: texture.offset.clone(),
      rotation: texture.rotation
    }
    
    // Add to undo stack
    addToUndoStack({
      type: 'texture-property-change',
      material: selectedMaterial.material,
      mapType: mapType,
      previousProperties: previousProperties,
      newProperties: newProperties
    })
    
    if (selectedMaterial) {
      setSelectedMaterial({ ...selectedMaterial })
    }
  }, [getTextureForMapType, selectedMaterial, setSelectedMaterial, addToUndoStack])

  // Duplicate texture - creates independent copy
  const handleTextureDuplicate = useCallback(async (mapType: string) => {
    if (!selectedMaterial || !selectedMaterial.material) return
    if (!viewer?.renderer) return
    
    const pbrMat = selectedMaterial.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
    const isPhysicalMaterial = selectedMaterial.material instanceof THREE.MeshPhysicalMaterial
    
    // Get current texture from material
    const currentTexture = getTextureForMapType(mapType)
    
    if (!currentTexture || !currentTexture.image) {
      setError('No texture to duplicate')
      return
    }
    
    try {
      // Get renderer's max anisotropy
      const maxAnisotropy = viewer.renderer.capabilities.getMaxAnisotropy()
      const textureAnisotropy = useAppStore.getState().textureAnisotropy
      const customAnisotropy = textureAnisotropy >= 0 ? textureAnisotropy : undefined
      
      // Create independent copy by rendering to canvas
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Could not get 2D context')
      }
      
      // Get image dimensions
      const img = currentTexture.image
      const width = img.width || img.videoWidth || 512
      const height = img.height || img.videoHeight || 512
      
      canvas.width = width
      canvas.height = height
      
      // Draw image to canvas
      ctx.drawImage(img, 0, 0, width, height)
      
      // Convert canvas to blob, then to file
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to create blob from canvas'))
          }
        }, 'image/png')
      })
      
      // Create File from blob
      const file = new File([blob], `${mapType}_duplicate_${Date.now()}.png`, { type: 'image/png' })
      
      // Load as new texture
      const duplicatedTexture = await loadTexture(file, viewer.renderer, maxAnisotropy, customAnisotropy)
      
      // Copy all properties from original texture
      duplicatedTexture.wrapS = currentTexture.wrapS
      duplicatedTexture.wrapT = currentTexture.wrapT
      duplicatedTexture.repeat.copy(currentTexture.repeat)
      duplicatedTexture.offset.copy(currentTexture.offset)
      duplicatedTexture.rotation = currentTexture.rotation
      duplicatedTexture.center.copy(currentTexture.center)
      duplicatedTexture.mapping = currentTexture.mapping
      duplicatedTexture.flipY = currentTexture.flipY
      duplicatedTexture.generateMipmaps = currentTexture.generateMipmaps
      duplicatedTexture.minFilter = currentTexture.minFilter
      duplicatedTexture.magFilter = currentTexture.magFilter
      duplicatedTexture.anisotropy = currentTexture.anisotropy
      duplicatedTexture.format = currentTexture.format
      duplicatedTexture.type = currentTexture.type
      duplicatedTexture.colorSpace = currentTexture.colorSpace
      
      // Apply duplicated texture to material
      switch (mapType) {
        case 'albedo':
          pbrMat.map = duplicatedTexture
          break
        case 'normal':
          pbrMat.normalMap = duplicatedTexture
          pbrMat.normalScale = pbrMat.normalScale || new THREE.Vector2(1, 1)
          break
        case 'roughness':
          pbrMat.roughnessMap = duplicatedTexture
          break
        case 'metallic':
          pbrMat.metalnessMap = duplicatedTexture
          break
        case 'ao':
          pbrMat.aoMap = duplicatedTexture
          break
        case 'bump':
          pbrMat.bumpMap = duplicatedTexture
          break
        case 'displacement':
          pbrMat.displacementMap = duplicatedTexture
          break
        case 'emissive':
          pbrMat.emissiveMap = duplicatedTexture
          break
        case 'alpha':
          pbrMat.alphaMap = duplicatedTexture
          break
        case 'clearcoat':
          if (isPhysicalMaterial && 'clearcoatMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).clearcoatMap = duplicatedTexture
          }
          break
        case 'clearcoatNormal':
          if (isPhysicalMaterial && 'clearcoatNormalMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).clearcoatNormalMap = duplicatedTexture
          }
          break
        case 'clearcoatRoughness':
          if (isPhysicalMaterial && 'clearcoatRoughnessMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).clearcoatRoughnessMap = duplicatedTexture
          }
          break
        case 'sheenColor':
          if (isPhysicalMaterial && 'sheenColorMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).sheenColorMap = duplicatedTexture
          }
          break
        case 'sheenRoughness':
          if (isPhysicalMaterial && 'sheenRoughnessMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).sheenRoughnessMap = duplicatedTexture
          }
          break
        case 'transmission':
          if (isPhysicalMaterial && 'transmissionMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).transmissionMap = duplicatedTexture
          }
          break
        case 'thickness':
          if (isPhysicalMaterial && 'thicknessMap' in pbrMat) {
            (pbrMat as THREE.MeshPhysicalMaterial).thicknessMap = duplicatedTexture
          }
          break
      }
      
      pbrMat.needsUpdate = true
      
      // Force material props update
      if (selectedMaterial) {
        setSelectedMaterial({ ...selectedMaterial })
      }
      
      console.log(`[MaterialPanel] ✅ Duplicated ${mapType} texture - new texture is independent`)
    } catch (error) {
      console.error(`Failed to duplicate ${mapType} texture:`, error)
      setError(`Failed to duplicate texture: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [selectedMaterial, setSelectedMaterial, viewer, setError])
  
  // Remove texture
  const handleTextureRemove = useCallback((mapType: string) => {
    if (!selectedMaterial || !selectedMaterial.material) return
    
    const isPhysicalMaterial = selectedMaterial.material instanceof THREE.MeshPhysicalMaterial
    
    const pbrMat = selectedMaterial.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
    
    // Get previous texture for undo before removing
    const mapTypeToProperty: Record<string, string> = {
      'albedo': 'map',
      'normal': 'normalMap',
      'roughness': 'roughnessMap',
      'metallic': 'metalnessMap',
      'ao': 'aoMap',
      'bump': 'bumpMap',
      'displacement': 'displacementMap',
      'emissive': 'emissiveMap',
      'alpha': 'alphaMap',
      'clearcoat': 'clearcoatMap',
      'clearcoatNormal': 'clearcoatNormalMap',
      'clearcoatRoughness': 'clearcoatRoughnessMap',
      'sheenColor': 'sheenColorMap',
      'sheenRoughness': 'sheenRoughnessMap',
      'transmission': 'transmissionMap',
      'thickness': 'thicknessMap'
    }
    const property = mapTypeToProperty[mapType] || mapType
    const previousTexture = (pbrMat as any)[property] as THREE.Texture | null
    
    switch (mapType) {
      case 'albedo':
        if (pbrMat.map) pbrMat.map.dispose()
        pbrMat.map = null
        break
      case 'normal':
        if (pbrMat.normalMap) pbrMat.normalMap.dispose()
        pbrMat.normalMap = null
        break
      case 'roughness':
        if (pbrMat.roughnessMap) pbrMat.roughnessMap.dispose()
        pbrMat.roughnessMap = null
        break
      case 'metallic':
        if (pbrMat.metalnessMap) pbrMat.metalnessMap.dispose()
        pbrMat.metalnessMap = null
        break
      case 'ao':
        if (pbrMat.aoMap) pbrMat.aoMap.dispose()
        pbrMat.aoMap = null
        break
      case 'bump':
        if (pbrMat.bumpMap) pbrMat.bumpMap.dispose()
        pbrMat.bumpMap = null
        break
      case 'displacement':
        if (pbrMat.displacementMap) pbrMat.displacementMap.dispose()
        pbrMat.displacementMap = null
        break
      case 'emissive':
        if (pbrMat.emissiveMap) pbrMat.emissiveMap.dispose()
        pbrMat.emissiveMap = null
        break
        case 'alpha':
          if (pbrMat.alphaMap) pbrMat.alphaMap.dispose()
          pbrMat.alphaMap = null
          break
        case 'clearcoat':
          if (isPhysicalMaterial && 'clearcoatMap' in pbrMat) {
            const physMat = pbrMat as THREE.MeshPhysicalMaterial
            if (physMat.clearcoatMap) physMat.clearcoatMap.dispose()
            physMat.clearcoatMap = null
          }
          break
        case 'clearcoatNormal':
          if (isPhysicalMaterial && 'clearcoatNormalMap' in pbrMat) {
            const physMat = pbrMat as THREE.MeshPhysicalMaterial
            if (physMat.clearcoatNormalMap) physMat.clearcoatNormalMap.dispose()
            physMat.clearcoatNormalMap = null
          }
          break
        case 'clearcoatRoughness':
          if (isPhysicalMaterial && 'clearcoatRoughnessMap' in pbrMat) {
            const physMat = pbrMat as THREE.MeshPhysicalMaterial
            if (physMat.clearcoatRoughnessMap) physMat.clearcoatRoughnessMap.dispose()
            physMat.clearcoatRoughnessMap = null
          }
          break
        case 'sheenColor':
          if (isPhysicalMaterial && 'sheenColorMap' in pbrMat) {
            const physMat = pbrMat as THREE.MeshPhysicalMaterial
            if (physMat.sheenColorMap) physMat.sheenColorMap.dispose()
            physMat.sheenColorMap = null
          }
          break
        case 'sheenRoughness':
          if (isPhysicalMaterial && 'sheenRoughnessMap' in pbrMat) {
            const physMat = pbrMat as THREE.MeshPhysicalMaterial
            if (physMat.sheenRoughnessMap) physMat.sheenRoughnessMap.dispose()
            physMat.sheenRoughnessMap = null
          }
          break
        case 'transmission':
          if (isPhysicalMaterial && 'transmissionMap' in pbrMat) {
            const physMat = pbrMat as THREE.MeshPhysicalMaterial
            if (physMat.transmissionMap) physMat.transmissionMap.dispose()
            physMat.transmissionMap = null
          }
          break
        case 'thickness':
          if (isPhysicalMaterial && 'thicknessMap' in pbrMat) {
            const physMat = pbrMat as THREE.MeshPhysicalMaterial
            if (physMat.thicknessMap) physMat.thicknessMap.dispose()
            physMat.thicknessMap = null
          }
          break
    }
    
    pbrMat.needsUpdate = true
    
    // Add to undo stack
    addToUndoStack({
      type: 'texture-change',
      material: pbrMat,
      mapType: mapType,
      previousTexture: previousTexture,
      newTexture: null
    })
    
    if (selectedMaterial) {
      setSelectedMaterial({ ...selectedMaterial })
    }
  }, [selectedMaterial, setSelectedMaterial, viewer, addToUndoStack])
  
  const materialName = mat?.name || 'Unnamed Material'
  const materialType = isPhysical ? 'Physical Material' : isPBR ? 'Standard Material' : mat?.type || 'Unknown'

  // Handle bulk PBR texture import
  const handleBulkTextureImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (!viewer?.renderer) return
    
    // Get renderer's max anisotropy
    const maxAnisotropy = viewer.renderer.capabilities.getMaxAnisotropy()
    const customAnisotropy = textureAnisotropy >= 0 ? textureAnisotropy : undefined
    
    const fileArray = Array.from(files)
    let importedCount = 0
    
    try {
      let skippedSBARCount = 0
      for (const file of fileArray) {
        // Use centralized texture loader which supports all formats (KTX2, Basis, HDR/EXR, standard images, SBAR/SBSAR extraction)
        const fileName = file.name.toLowerCase()
        let texture: THREE.Texture
        try {
          texture = await loadTexture(file, viewer.renderer, maxAnisotropy, customAnisotropy)
        } catch (loadError) {
          // Skip files that fail to load (e.g., SBAR files or other unsupported formats)
          const errorMsg = loadError instanceof Error ? loadError.message : String(loadError)
          if (errorMsg.includes('SBAR') || errorMsg.includes('SBSAR')) {
            skippedSBARCount++
            console.warn(`⚠️ Skipping "${file.name}": ${errorMsg}`)
          } else {
            console.error(`Failed to load "${file.name}":`, loadError)
          }
          continue
        }
        
        // Try to match filename to PBR map types
        let assigned = false
        
        // Common PBR texture naming patterns
        const patterns = [
          { keywords: ['albedo', 'diffuse', 'basecolor', 'base_color', 'color'], map: 'map' },
          { keywords: ['normal', 'norm', 'nrm', 'n'], map: 'normalMap' },
          { keywords: ['roughness', 'rough', 'rgh'], map: 'roughnessMap' },
          { keywords: ['metallic', 'metal', 'metalness'], map: 'metalnessMap' },
          { keywords: ['ao', 'ambient', 'occlusion', 'ambientocclusion'], map: 'aoMap' },
          { keywords: ['bump'], map: 'bumpMap' },
          { keywords: ['displacement', 'height'], map: 'displacementMap' },
          { keywords: ['emissive', 'emission', 'emit'], map: 'emissiveMap' },
          { keywords: ['alpha', 'opacity'], map: 'alphaMap' },
          { keywords: ['clearcoat'], map: 'clearcoatMap', requirePhysical: true },
          { keywords: ['clearcoatnormal', 'clearcoat_normal'], map: 'clearcoatNormalMap', requirePhysical: true },
          { keywords: ['clearcoatrough', 'clearcoatroughness', 'clearcoat_rough'], map: 'clearcoatRoughnessMap', requirePhysical: true },
          { keywords: ['sheencolor', 'sheen_color'], map: 'sheenColorMap', requirePhysical: true },
          { keywords: ['sheenrough', 'sheenroughness', 'sheen_rough'], map: 'sheenRoughnessMap', requirePhysical: true },
          { keywords: ['transmission'], map: 'transmissionMap', requirePhysical: true },
          { keywords: ['thickness'], map: 'thicknessMap', requirePhysical: true }
        ]
        
        if (applyToAllMaterials) {
          // Apply to all materials in the scene
          viewer.scene.traverse((object) => {
            if (object instanceof THREE.Mesh && object.material) {
              const materials = Array.isArray(object.material) ? object.material : [object.material]
              
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                  const isPhysicalMaterial = mat instanceof THREE.MeshPhysicalMaterial
                  
                  for (const pattern of patterns) {
                    if (pattern.requirePhysical && !isPhysicalMaterial) continue
                    
                    for (const keyword of pattern.keywords) {
                      if (fileName.includes(keyword)) {
                        if (pattern.map in mat) {
                          const existingTexture = (mat as any)[pattern.map] as THREE.Texture | null
                          if (existingTexture) {
                            existingTexture.dispose()
                          }
                          (mat as any)[pattern.map] = texture.clone()
                          if (pattern.map === 'normalMap') {
                            mat.normalScale = mat.normalScale || new THREE.Vector2(1, 1)
                          }
                          mat.needsUpdate = true
                          assigned = true
                          console.log(`✅ Assigned "${file.name}" to ${pattern.map} on ${mat.name || 'unnamed material'}`)
                        }
                      }
                    }
                  }
                }
              })
            }
          })
          
          if (assigned) {
            importedCount++
          }
        } else {
          // Apply only to selected material
          if (!selectedMaterial || !selectedMaterial.material || !isPBR) {
            texture.dispose()
            console.warn('⚠️ No PBR material selected')
            continue
          }
          
          const pbrMat = selectedMaterial.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial
          const isPhysicalMaterial = selectedMaterial.material instanceof THREE.MeshPhysicalMaterial
          
          for (const pattern of patterns) {
            if (pattern.requirePhysical && !isPhysicalMaterial) continue
            
            for (const keyword of pattern.keywords) {
              if (fileName.includes(keyword)) {
                // Check if material has this property
                if (pattern.map in pbrMat) {
                  const existingTexture = (pbrMat as any)[pattern.map] as THREE.Texture | null
                  if (existingTexture) {
                    existingTexture.dispose()
                  }
                  (pbrMat as any)[pattern.map] = texture
                  if (pattern.map === 'normalMap') {
                    pbrMat.normalScale = pbrMat.normalScale || new THREE.Vector2(1, 1)
                  }
                  pbrMat.needsUpdate = true
                  assigned = true
                  importedCount++
                  console.log(`✅ Assigned "${file.name}" to ${pattern.map}`)
                  break
                }
              }
            }
            if (assigned) break
          }
          
          // Force material update
          if (selectedMaterial) {
            setSelectedMaterial({ ...selectedMaterial })
          }
        }
        
        if (!assigned) {
          texture.dispose() // Clean up unused texture
          console.warn(`⚠️ Could not match "${file.name}" to any PBR map`)
        }
      }
      
      // Force render update
      viewer.renderer.render(viewer.scene, viewer.camera)
      
      if (importedCount > 0) {
        console.log(`✅ Successfully imported ${importedCount} texture(s)${applyToAllMaterials ? ' to all materials' : ''}${skippedSBARCount > 0 ? ` (${skippedSBARCount} SBAR/SBSAR file(s) skipped)` : ''}`)
      } else if (skippedSBARCount > 0) {
        const message = `${skippedSBARCount} SBAR/SBSAR file(s) were skipped. Please export textures from Substance as PNG/JPG/KTX2.`
        console.warn(`⚠️ No textures imported. ${message}`)
        setError(message)
      }
    } catch (error) {
      console.error('Failed to import textures:', error)
    } finally {
      if (bulkTextureInputRef.current) {
        bulkTextureInputRef.current.value = ''
      }
    }
  }, [selectedMaterial, isPBR, viewer, textureAnisotropy, setSelectedMaterial, applyToAllMaterials, setError])

  // Handler to enable receiveShadow on all materials
  const handleEnableAllReceiveShadow = useCallback(() => {
    if (!viewer?.scene) {
      setError('Viewer not available')
      return
    }

    let enabledCount = 0
    let skippedCount = 0

    try {
      viewer.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          // Skip helpers, shadow plane, HDR objects, and other system objects
          if (object.userData.isShadowPlane || 
              object.userData.isGridHelper || 
              object.userData.isAxesHelper ||
              object.userData.isLightGizmo ||
              object.userData.isLightHelper ||
              object.userData.isGroundedSkybox ||
              object.userData.isDynamicSky ||
              object.userData.isSun ||
              object.userData.isMoon) {
            skippedCount++
            return
          }

          // Skip meshes with MeshBasicMaterial - they don't support shadows
          // Setting receiveShadow on them is harmless but unnecessary
          const material = Array.isArray(object.material) ? object.material[0] : object.material
          if (material instanceof THREE.MeshBasicMaterial) {
            skippedCount++
            return
          }

          // Enable receiveShadow on all meshes
          if (!object.receiveShadow) {
            object.receiveShadow = true
            enabledCount++
          }
        }
      })

      console.log(`[MaterialPanel] Enabled receiveShadow on ${enabledCount} mesh(es)${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`)
      
      if (enabledCount > 0) {
        setError(null)
        // Force a render update to show shadows
        if (viewer.renderer && viewer.camera) {
          viewer.renderer.render(viewer.scene, viewer.camera)
        }
      } else {
        setError('All materials already receive shadows, or no meshes found')
      }
    } catch (error) {
      console.error('[MaterialPanel] Failed to enable receiveShadow:', error)
      setError(`Failed to enable receiveShadow: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [viewer, setError])

  const handleConfigureTransparentMaterials = useCallback(() => {
    if (!viewer?.scene) {
      setError('Viewer not available')
      return
    }

    try {
      const result = configureAllTransparentMaterials(viewer.scene, {
        force: false,
        logResults: true
      })

      // CRITICAL: Ensure shadow plane always receives shadows after configuration
      // This is a safety measure in case the shadow plane was somehow modified
      // We need to restore ALL shadow plane properties to ensure shadows work correctly
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && (obj.userData.isShadowPlane || (obj.name || '').toLowerCase() === 'shadow plane')) {
          // CRITICAL: Shadow plane MUST receive shadows
          obj.receiveShadow = true
          // CRITICAL: Shadow plane should NOT cast shadows (it's a ground plane)
          obj.castShadow = false
          
          // Ensure shadow plane material has correct properties for shadow rendering
          const material = obj.material
          if (material && material instanceof THREE.Material) {
            // CRITICAL: depthWrite MUST be true for shadows to render correctly on the plane
            // ShadowMaterial and MeshStandardMaterial both need depthWrite = true for shadows
            if (material instanceof THREE.ShadowMaterial) {
              // ShadowMaterial: ensure it's configured correctly
              material.opacity = Math.max(0.1, material.opacity || 0.5) // Ensure valid opacity
            } else if (material instanceof THREE.MeshStandardMaterial) {
              // MeshStandardMaterial: ensure depthWrite is true
              material.depthWrite = true
              // Ensure transparency is enabled if opacity < 1
              if (material.opacity < 1.0) {
                material.transparent = true
              }
            } else {
              // For any other material type, ensure depthWrite is true
              material.depthWrite = true
            }
            
            // Remove any transparent shadow configuration marker that might have been incorrectly applied
            if (material.userData) {
              delete material.userData.transparentShadowConfigured
            }
            
            material.needsUpdate = true
          }
          
          console.log('[MaterialPanel] Shadow plane restored:', {
            receiveShadow: obj.receiveShadow,
            castShadow: obj.castShadow,
            materialType: material?.constructor?.name,
            depthWrite: material instanceof THREE.Material ? material.depthWrite : 'N/A'
          })
        }
      })

      if (result.configured > 0) {
        setError(null)
        // Force a render update to show shadows
        if (viewer.renderer && viewer.camera) {
          viewer.renderer.render(viewer.scene, viewer.camera)
        }
      } else if (result.errors.length > 0) {
        setError(`Failed to configure some transparent materials: ${result.errors.length} error(s)`)
      } else {
        setError('No transparent materials found, or all are already correctly configured')
      }
    } catch (error) {
      console.error('[MaterialPanel] Failed to configure transparent materials:', error)
      setError(`Failed to configure transparent materials: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [viewer, setError])

  // Handle texture replace by filename matching (moved from Toolbar)
  const handleTextureReplace = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (!viewer?.scene || !viewer?.renderer) {
      setError('No model loaded. Please load a model first.')
      if (textureReplaceInputRef.current) {
        textureReplaceInputRef.current.value = ''
      }
      return
    }

    const fileArray = Array.from(files)
    
    // Get renderer's max anisotropy
    const maxAnisotropy = viewer.renderer.capabilities.getMaxAnisotropy()
    const customAnisotropy = textureAnisotropy >= 0 ? textureAnisotropy : undefined
    
    let replacedCount = 0
    let skippedCount = 0
    
    try {
      let skippedSBARCount = 0
      // Process all selected texture files
      for (const file of fileArray) {
        const fileName = file.name.toLowerCase()
        
        // Use centralized texture loader which supports all formats
        let texture: THREE.Texture
        try {
          texture = await loadTexture(file, viewer.renderer, maxAnisotropy, customAnisotropy)
        } catch (loadError) {
          // Skip files that fail to load (e.g., SBAR files or other unsupported formats)
          const errorMsg = loadError instanceof Error ? loadError.message : String(loadError)
          if (errorMsg.includes('SBAR') || errorMsg.includes('SBSAR')) {
            skippedSBARCount++
            console.warn(`⚠️ Skipping "${file.name}": ${errorMsg}`)
          } else {
            console.error(`Failed to load "${file.name}":`, loadError)
            skippedCount++
          }
          continue
        }
        
        // Try to replace textures by filename matching
        const fileNameWithoutExt = file.name.toLowerCase().replace(/\.(jpg|jpeg|png|tga|bmp|webp|hdr|exr|ktx2|basis|sbar|sbsar)$/, '')
        let foundMatch = false
        
        viewer.scene.traverse((object) => {
          if (object instanceof THREE.Mesh && object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            
            materials.forEach((material: THREE.Material) => {
              if (material instanceof THREE.MeshStandardMaterial || 
                  material instanceof THREE.MeshPhysicalMaterial ||
                  material instanceof THREE.MeshPhongMaterial ||
                  material instanceof THREE.MeshLambertMaterial ||
                  material instanceof THREE.MeshBasicMaterial) {
                
                // Check all texture maps
                const textureMapNames = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 
                                        'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap',
                                        'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
                                        'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap']
                
                for (const mapName of textureMapNames) {
                  if (mapName in material) {
                    const existingTexture = (material as any)[mapName] as THREE.Texture | null
                    if (existingTexture) {
                      // Check if filename matches
                      const texName = existingTexture.name?.toLowerCase() || ''
                      if (texName.includes(fileNameWithoutExt) || fileNameWithoutExt.includes(texName.replace(/[^a-z0-9]/g, ''))) {
                        // Replace the texture
                        existingTexture.dispose()
                        (material as any)[mapName] = texture.clone()
                        material.needsUpdate = true
                        foundMatch = true
                        replacedCount++
                      }
                    }
                  }
                }
              }
            })
          }
        })
        
        if (!foundMatch) {
          skippedCount++
          texture.dispose() // Clean up unused texture
        }
      }
      
      // Force a render update
      viewer.renderer.render(viewer.scene, viewer.camera)
      
      // Show result message
      if (replacedCount > 0) {
        setError(null)
        console.log(`✅ Successfully replaced ${replacedCount} texture(s)${skippedCount > 0 ? ` (${skippedCount} skipped - no matching material)` : ''}${skippedSBARCount > 0 ? ` (${skippedSBARCount} SBAR/SBSAR file(s) skipped)` : ''}`)
      } else if (skippedSBARCount > 0) {
        setError(`No textures replaced. ${skippedSBARCount} SBAR/SBSAR file(s) were skipped. Please export textures from Substance as PNG/JPG/KTX2.`)
      } else {
        setError(`No matching textures found. Make sure your texture filenames match the material texture names in the model.`)
      }
    } catch (error) {
      console.error('Failed to replace textures:', error)
      setError(`Failed to replace textures: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      if (textureReplaceInputRef.current) {
        textureReplaceInputRef.current.value = ''
      }
    }
  }, [viewer, textureAnisotropy, setError])

  return (
    <div
      ref={panelRef}
      className={`material-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="material-panel-header" onMouseDown={handleMouseDown}>
        <h3>🎨 Material Editor</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)} 
            className="minimize-button" 
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button onClick={toggleMaterialPanel} className="close-button">×</button>
        </div>
      </div>
      
      {!isMinimized && (
      <div className="material-panel-content">
        {/* Material Tools Section */}
        <div className="material-section" style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#2a2a2a', borderRadius: '8px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '10px' }}>Material Tools</h4>
          
          {/* Material Converter */}
          <div style={{ marginBottom: '15px' }}>
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
              Convert all MeshBasicMaterial instances to MeshStandardMaterial for better lighting, shadows, and PBR support.
            </p>
            <button
              onClick={handleConvertBasicMaterials}
              disabled={isConverting || !viewer}
              className="button-primary"
              style={{ width: '100%', marginBottom: '10px' }}
            >
              {isConverting ? 'Converting...' : 'Convert Basic to Standard Materials'}
            </button>
            {conversionStats && (
              <div style={{ fontSize: '12px', color: '#4caf50', marginTop: '10px' }}>
                {conversionStats.totalConverted > 0 ? (
                  <>
                    ✅ Converted {conversionStats.totalConverted} material(s) across {conversionStats.meshesUpdated} mesh(es)
                    {conversionStats.errors.length > 0 && (
                      <div style={{ color: '#ff9800', marginTop: '5px' }}>
                        ⚠️ {conversionStats.errors.length} error(s) occurred. Check console for details.
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: '#aaa' }}>ℹ️ No MeshBasicMaterial instances found to convert.</div>
                )}
              </div>
            )}
          </div>

          {/* Two-Sided Materials */}
          <div style={{ marginBottom: '15px' }}>
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
              Apply two-sided rendering to all materials. If an object is selected, applies to that object. Otherwise, applies to all imported objects.
            </p>
            <button
              onClick={handleApplyTwoSidedMaterials}
              disabled={!viewer}
              className="button-primary"
              style={{ width: '100%', marginBottom: '10px' }}
            >
              {selectedObject ? 'Apply Two-Sided to Selected' : 'Apply Two-Sided to All Imported'}
            </button>
          </div>

          {/* Paint Bucket Tool */}
          <div style={{ marginBottom: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
              Paint the selected material onto other surfaces. Click the button to activate, then click on any object (car, primitive, plane) to apply the material.
            </p>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                
                // Allow toggling off even without material selected
                if (paintMode) {
                  setPaintMode(false)
                  // Ensure color picker is also off
                  if (colorPickerMode) {
                    setColorPickerMode(false)
                  }
                  return
                }
                
                // When activating, ensure color picker is off first
                if (colorPickerMode) {
                  setColorPickerMode(false)
                }
                
                // When activating, require material selection
                if (!selectedMaterial || !selectedMaterial.material) {
                  setError('Please select a material first from the Materials browser below')
                  return
                }
                
                if (!viewer) {
                  setError('Viewer not available')
                  return
                }
                
                setPaintMode(true)
              }}
              disabled={!viewer || colorPickerMode}
              className={paintMode ? "button-primary" : "button-secondary"}
              style={{ 
                width: '100%', 
                marginBottom: '10px',
                backgroundColor: paintMode ? '#4caf50' : undefined,
                borderColor: paintMode ? '#4caf50' : undefined,
                opacity: colorPickerMode ? 0.5 : (!selectedMaterial ? 0.7 : 1),
                cursor: (!viewer || colorPickerMode) ? 'not-allowed' : 'pointer'
              }}
              title={!selectedMaterial && !paintMode ? 'Select a material first' : paintMode ? 'Click to deactivate paint mode' : 'Click to activate paint mode'}
            >
              {paintMode ? '🪣 Paint Mode Active - Click to Deactivate' : '🪣 Paint Bucket - Click to Activate'}
            </button>
            {paintMode && (
              <div style={{ fontSize: '12px', color: '#4caf50', marginTop: '5px' }}>
                ✓ Paint mode active - Click on any object to apply the selected material
              </div>
            )}
          </div>

          {/* Color Picker Tool */}
          <div style={{ marginBottom: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
              Pick a color from any object in the scene. Click the button to activate, then click on any object to copy its color to the selected material.
            </p>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                
                // Allow toggling off even without material selected
                if (colorPickerMode) {
                  setColorPickerMode(false)
                  // Ensure paint mode is also off
                  if (paintMode) {
                    setPaintMode(false)
                  }
                  return
                }
                
                // When activating, ensure paint mode is off first
                if (paintMode) {
                  setPaintMode(false)
                }
                
                // When activating, require material selection
                if (!selectedMaterial || !selectedMaterial.material) {
                  setError('Please select a material first from the Materials browser below')
                  return
                }
                
                if (!viewer) {
                  setError('Viewer not available')
                  return
                }
                
                setColorPickerMode(true)
              }}
              disabled={!viewer || paintMode}
              className={colorPickerMode ? "button-primary" : "button-secondary"}
              style={{ 
                width: '100%', 
                marginBottom: '10px',
                backgroundColor: colorPickerMode ? '#2196f3' : undefined,
                borderColor: colorPickerMode ? '#2196f3' : undefined,
                opacity: paintMode ? 0.5 : (!selectedMaterial ? 0.7 : 1),
                cursor: (!viewer || paintMode) ? 'not-allowed' : 'pointer'
              }}
              title={!selectedMaterial && !colorPickerMode ? 'Select a material first' : colorPickerMode ? 'Click to deactivate color picker' : 'Click to activate color picker'}
            >
              {colorPickerMode ? '🎨 Color Picker Active - Click to Deactivate' : '🎨 Color Picker - Click to Activate'}
            </button>
            {colorPickerMode && (
              <div style={{ fontSize: '12px', color: '#2196f3', marginTop: '5px' }}>
                ✓ Color picker active - Click on any object to copy its color to the selected material
              </div>
            )}
          </div>

          {/* Shadow Settings */}
          <div style={{ paddingTop: '15px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
              Enable shadow receiving on all materials in the scene. This ensures all objects can display shadows cast by lights.
            </p>
            <button
              onClick={handleEnableAllReceiveShadow}
              disabled={!viewer}
              className="button-primary"
              style={{ width: '100%', marginBottom: '10px' }}
            >
              🌑 Enable All Materials Receive Shadows
            </button>
            <p style={{ fontSize: '12px', color: '#aaa', marginTop: '15px', marginBottom: '10px' }}>
              Configure transparent materials (glass/windows) to allow shadows to pass through. This sets castShadow = false and depthWrite = false on transparent materials.
            </p>
            <button
              onClick={handleConfigureTransparentMaterials}
              disabled={!viewer}
              className="button-primary"
              style={{ width: '100%' }}
            >
              🔍 Configure Transparent Materials for Shadow Passing
            </button>
          </div>
        </div>

        {/* Material Browser - Twinmotion Style */}
        <div className="material-section material-browser-section">
          <div className="material-browser-header">
            <h4>Materials</h4>
            <div className="material-browser-actions">
              <button className="icon-button" title="Filter/Sort">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M7 12h10M11 18h2"/>
                </svg>
              </button>
              <button className="icon-button" title="Material Library">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              </button>
            </div>
          </div>
          
          <div className="material-browser-content">
            {/* Standard Button - Twinmotion Style */}
            <button 
              className={`material-standard-button ${!selectedMaterial ? 'selected' : ''}`}
              onClick={() => setSelectedMaterial(null)}
              title="Standard Material"
            >
              <div className="material-standard-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
              <div className="material-standard-label">Standard</div>
              <div className="material-standard-menu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                </svg>
              </div>
            </button>

            {/* Material Count and Info */}
            {allMaterials.length > 0 && (
              <div style={{ 
                marginBottom: '12px', 
                padding: '8px 12px', 
                background: 'rgba(74, 158, 255, 0.1)', 
                borderRadius: '6px',
                fontSize: '12px',
                color: '#aaa'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div>
                    <strong style={{ color: '#4a9eff' }}>{allMaterials.length}</strong> material{allMaterials.length !== 1 ? 's' : ''} found
                    {textureGroups.length > 0 && (
                      <span style={{ marginLeft: '8px', color: '#ff9800' }}>
                        • <strong>{textureGroups.reduce((sum, g) => sum + g.count, 0)}</strong> duplicate textures in <strong>{textureGroups.length}</strong> group{textureGroups.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={rescanAndGroupTextures}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: 'rgba(74, 158, 255, 0.2)',
                      border: '1px solid rgba(74, 158, 255, 0.3)',
                      borderRadius: '4px',
                      color: '#4a9eff',
                      cursor: 'pointer'
                    }}
                    title="Rescan and group duplicate textures"
                  >
                    🔄 Rescan Textures
                  </button>
                </div>
                <small style={{ fontSize: '11px', color: '#888' }}>
                  💡 <strong>Note:</strong> Texture merging reduces memory usage (textures are the big memory hogs), but materials remain separate objects. 
                  Each material can have unique properties even if they share the same texture.
                </small>
              </div>
            )}

            {/* Texture Groups with Duplicates */}
            {textureGroups.length > 0 && (
              <div style={{ 
                marginBottom: '12px', 
                padding: '8px 12px', 
                background: 'rgba(255, 152, 0, 0.1)', 
                borderRadius: '6px',
                fontSize: '12px',
                border: '1px solid rgba(255, 152, 0, 0.2)'
              }}>
                <div style={{ fontWeight: 'bold', color: '#ff9800', marginBottom: '8px' }}>
                  Duplicate Texture Groups
                </div>
                {textureGroups.map((group) => (
                  <div 
                    key={group.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 8px',
                      marginBottom: '4px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => handleMergeTextureGroup(group.id)}
                    title={`Click to merge ${group.count} duplicate textures`}
                  >
                    <span style={{ color: '#aaa', fontSize: '11px' }}>
                      {group.count} duplicate{group.count !== 1 ? 's' : ''}
                    </span>
                    <button
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        background: 'rgba(255, 152, 0, 0.3)',
                        border: '1px solid rgba(255, 152, 0, 0.4)',
                        borderRadius: '3px',
                        color: '#ff9800',
                        cursor: 'pointer'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMergeTextureGroup(group.id)
                      }}
                    >
                      Merge
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Material Grid */}
            {allMaterials.length === 0 ? (
              <div className="material-browser-empty">
                <p>No materials found</p>
                <small>Load a 3D model to see materials</small>
              </div>
            ) : (
              <div 
                className="material-grid" 
                ref={materialsContainerRef}
                style={{ 
                  maxHeight: '400px', 
                  overflowY: 'auto',
                  overflowX: 'hidden'
                }}
              >
                {allMaterials.map((item, idx) => {
                  const isSelected = selectedMaterial && 
                    item.mesh === selectedMaterial.mesh && 
                    item.material === selectedMaterial.material &&
                    item.index === selectedMaterial.index
                  
                  return (
                    <MaterialSwatch
                      key={`${item.mesh.id}-${item.material.id || idx}-${item.index || 0}`}
                      material={item.material}
                      name={item.name}
                      selected={!!isSelected}
                      size={120}
                      onClick={() => setSelectedMaterial(item)}
                      onDuplicate={() => {
                        // Clone material
                        const clonedMaterial = item.material.clone()
                        clonedMaterial.name = `${item.name} (Copy)`
                        clonedMaterial.needsUpdate = true
                        
                        // Apply cloned material to the same mesh
                        if (Array.isArray(item.mesh.material)) {
                          const materials = [...item.mesh.material] as THREE.Material[]
                          const matIndex = item.index !== undefined ? item.index : materials.length
                          materials[matIndex] = clonedMaterial
                          item.mesh.material = materials
                        } else {
                          item.mesh.material = clonedMaterial
                        }
                        
                        // Select the new cloned material
                        const newItem: MaterialItem = {
                          mesh: item.mesh,
                          material: clonedMaterial,
                          index: item.index,
                          name: clonedMaterial.name || `${item.name} (Copy)`
                        }
                        setSelectedMaterial(newItem)
                        
                        console.log('[MaterialPanel] ✅ Duplicated material:', item.name)
                      }}
                    />
                  )
                })}
              </div>
            )}
          </div>
          
          <small style={{ display: 'block', color: '#888', marginTop: '12px', fontSize: '11px' }}>
            Click on any 3D object to pick its material (or use Ctrl+Click)
          </small>
        </div>

        {/* Texture Tools Section */}
        <div className="material-section">
          <h4>Texture Tools</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => {
                if (textureReplaceInputRef.current) {
                  textureReplaceInputRef.current.value = ''
                  textureReplaceInputRef.current.click()
                }
              }}
              className="button-primary"
              disabled={!viewer?.scene}
              style={{ width: '100%' }}
              title="Replace textures by filename matching across all materials"
            >
              🔄 Replace Textures
            </button>
            <small style={{ display: 'block', color: '#888', fontSize: '11px', lineHeight: '1.4' }}>
              Select texture files to replace existing textures by matching filenames. Works across all materials in the scene.
            </small>
            
            <input
              ref={textureReplaceInputRef}
              type="file"
              multiple
              accept="image/*,.hdr,.exr,.ktx2,.basis"
              style={{ display: 'none' }}
              onChange={handleTextureReplace}
            />
          </div>
        </div>

        {!mat ? (
          <div className="material-panel-empty">
            <p>No material selected</p>
            <small>Select a material from the picker above or click on an object in the 3D view</small>
          </div>
        ) : (
          <>
            <div className="material-info">
              <div className="material-info-item">
                <span className="label">Material:</span>
                <span className="value">{materialName}</span>
              </div>
              <div className="material-info-item">
                <span className="label">Type:</span>
                <span className="value">{materialType}</span>
              </div>
            </div>

            <div className="material-section">
              <h4>Base Properties</h4>
              
              <label>
                <span>Color</span>
                <div className="color-input-container">
                  <input
                    type="color"
                    value={materialProps.color}
                    onChange={(e) => updateMaterial({ color: e.target.value })}
                  />
                  <input
                    type="text"
                    value={materialProps.color}
                    onChange={(e) => updateMaterial({ color: e.target.value })}
                    className="color-text-input"
                  />
                </div>
              </label>

              <label>
                <span>Opacity</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={materialProps.opacity}
                    onChange={(e) => {
                      const newValue = parseFloat(e.target.value)
                      trackSliderInteraction('Material Opacity', newValue, 'MaterialPanel', () => updateMaterial({ opacity: newValue }))
                    }}
                    className="slider"
                  />
                  <span className="slider-value">{materialProps.opacity.toFixed(2)}</span>
                </div>
              </label>

              <label>
                <span>Transparent</span>
                <input
                  type="checkbox"
                  checked={materialProps.transparent}
                  onChange={(e) => updateMaterial({ transparent: e.target.checked })}
                />
              </label>

              <label>
                <span>Side</span>
                <select
                  value={materialProps.side}
                  onChange={(e) => updateMaterial({ side: e.target.value as typeof materialProps.side })}
                >
                  <option value="Front">Front</option>
                  <option value="Back">Back</option>
                  <option value="Double">Double</option>
                </select>
              </label>

              <label>
                <span>Emissive Color</span>
                <div className="color-input-container">
                  <input
                    type="color"
                    value={materialProps.emissive}
                    onChange={(e) => updateMaterial({ emissive: e.target.value })}
                  />
                  <input
                    type="text"
                    value={materialProps.emissive}
                    onChange={(e) => updateMaterial({ emissive: e.target.value })}
                    className="color-text-input"
                  />
                </div>
              </label>

              <label>
                <span>Emissive Intensity</span>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={materialProps.emissiveIntensity}
                    onChange={(e) => updateMaterial({ emissiveIntensity: parseFloat(e.target.value) })}
                    className="slider"
                  />
                  <span className="slider-value">{materialProps.emissiveIntensity.toFixed(1)}</span>
                </div>
              </label>
            </div>

            {isPBR && (
              <>
                <div className="material-section">
                  <h4>PBR Properties</h4>
                  
                  <label>
                    <span>Metalness</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={materialProps.metalness}
                        onChange={(e) => updateMaterial({ metalness: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.metalness.toFixed(2)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Roughness</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={materialProps.roughness}
                        onChange={(e) => updateMaterial({ roughness: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.roughness.toFixed(2)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Environment Map Intensity</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={materialProps.envMapIntensity}
                        onChange={(e) => updateMaterial({ envMapIntensity: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.envMapIntensity.toFixed(1)}</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Controls HDR reflection intensity
                    </small>
                  </label>
                </div>

                <div className="material-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0 }}>Texture Maps</h4>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (bulkTextureInputRef.current) {
                          bulkTextureInputRef.current.value = ''
                          bulkTextureInputRef.current.click()
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(74, 158, 255, 0.2)',
                        border: '1px solid rgba(74, 158, 255, 0.4)',
                        borderRadius: '4px',
                        color: '#6bb0ff',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: '500'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(74, 158, 255, 0.3)'
                        e.currentTarget.style.borderColor = 'rgba(74, 158, 255, 0.5)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(74, 158, 255, 0.2)'
                        e.currentTarget.style.borderColor = 'rgba(74, 158, 255, 0.4)'
                      }}
                      title="Upload multiple PBR textures at once (matches by filename)"
                    >
                      📦 Upload PBR Textures
                    </button>
                    <input
                      ref={bulkTextureInputRef}
                      type="file"
                      accept="image/*,.ktx2,.basis,.sbar,.sbsar"
                      multiple
                      onChange={handleBulkTextureImport}
                      style={{ display: 'none' }}
                    />
                  </div>
                  
                  <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={applyToAllMaterials}
                      onChange={(e) => setApplyToAllMaterials(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '12px', color: '#ccc' }}>Apply bulk upload to all materials</span>
                  </label>
                  
                  <small style={{ display: 'block', color: '#888', marginBottom: '12px', fontSize: '11px' }}>
                    Tip: Name textures with keywords like "_albedo", "_normal", "_roughness" for auto-matching. Note: SBAR/SBSAR files require export from Substance 3D as images first.
                  </small>
                  
                  <div className="texture-maps-grid">
                    {/* Albedo Map */}
                    <TextureMapSlot
                      label="ALBEDO"
                      hasMap={hasAlbedoMap}
                      texture={textureMaps.map}
                      mapType="albedo"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                      showControls={hasAlbedoMap}
                      controls={
                        hasAlbedoMap && textureMaps.map ? (
                          <TextureControls
                            mapType="albedo"
                            texture={textureMaps.map}
                            onUpdate={updateTextureProperties}
                          />
                        ) : null
                      }
                    />
                    
                    {/* Normal Map */}
                    <TextureMapSlot
                      label="NORMAL"
                      hasMap={hasNormalMap}
                      texture={textureMaps.normalMap}
                      mapType="normal"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                      showControls={hasNormalMap}
                      controls={
                        hasNormalMap ? (
                          <div className="texture-map-controls-inputs" style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                            <input
                              type="number"
                              value={materialProps.normalScale.x.toFixed(2)}
                              onChange={(e) => updateMaterial({ 
                                normalScale: { ...materialProps.normalScale, x: parseFloat(e.target.value) || 1 } 
                              })}
                              step="0.1"
                              style={{ flex: 1, fontSize: '11px', padding: '4px 6px', minWidth: 0 }}
                              className="color-text-input"
                              placeholder="X"
                            />
                            <input
                              type="number"
                              value={materialProps.normalScale.y.toFixed(2)}
                              onChange={(e) => updateMaterial({ 
                                normalScale: { ...materialProps.normalScale, y: parseFloat(e.target.value) || 1 } 
                              })}
                              step="0.1"
                              style={{ flex: 1, fontSize: '11px', padding: '4px 6px', minWidth: 0 }}
                              className="color-text-input"
                              placeholder="Y"
                            />
                          </div>
                        ) : null
                      }
                    />
                    
                    {/* Roughness Map */}
                    <TextureMapSlot
                      label="ROUGHNESS"
                      hasMap={hasRoughnessMap}
                      texture={textureMaps.roughnessMap}
                      mapType="roughness"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                      showActive={hasRoughnessMap}
                      showControls={hasRoughnessMap}
                      controls={
                        hasRoughnessMap && textureMaps.roughnessMap ? (
                          <TextureControls
                            mapType="roughness"
                            texture={textureMaps.roughnessMap}
                            onUpdate={updateTextureProperties}
                          />
                        ) : null
                      }
                    />
                    
                    {/* Metalness Map */}
                    <TextureMapSlot
                      label="METALLIC"
                      hasMap={hasMetalnessMap}
                      texture={textureMaps.metalnessMap}
                      mapType="metallic"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                      showControls={hasMetalnessMap}
                      controls={
                        hasMetalnessMap && textureMaps.metalnessMap ? (
                          <TextureControls
                            mapType="metallic"
                            texture={textureMaps.metalnessMap}
                            onUpdate={updateTextureProperties}
                          />
                        ) : null
                      }
                    />
                    
                    {/* AO Map */}
                    <TextureMapSlot
                      label="AO"
                      hasMap={hasAoMap}
                      texture={textureMaps.aoMap}
                      mapType="ao"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                      showControls={hasAoMap}
                      controls={
                        hasAoMap ? (
                          <div className="slider-container" style={{ marginTop: '6px' }}>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.1"
                              value={materialProps.aoMapIntensity}
                              onChange={(e) => updateMaterial({ aoMapIntensity: parseFloat(e.target.value) })}
                              className="slider"
                              style={{ flex: 1 }}
                            />
                            <span className="slider-value" style={{ fontSize: '11px', minWidth: '35px' }}>
                              {materialProps.aoMapIntensity.toFixed(1)}
                            </span>
                          </div>
                        ) : null
                      }
                    />
                    
                    {/* Bump Map */}
                    <TextureMapSlot
                      label="BUMP"
                      hasMap={hasBumpMap}
                      texture={textureMaps.bumpMap}
                      mapType="bump"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Displacement Map */}
                    <TextureMapSlot
                      label="DISPLACEMENT"
                      hasMap={hasDisplacementMap}
                      texture={textureMaps.displacementMap}
                      mapType="displacement"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Emissive Map */}
                    <TextureMapSlot
                      label="EMISSIVE"
                      hasMap={hasEmissiveMap}
                      texture={textureMaps.emissiveMap}
                      mapType="emissive"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Alpha Map */}
                    <TextureMapSlot
                      label="ALPHA"
                      hasMap={hasAlphaMap}
                      texture={textureMaps.alphaMap}
                      mapType="alpha"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                  </div>
                </div>
              </>
            )}

            {isPhysical && (
              <>
                <div className="material-section">
                  <h4>Clearcoat (Car Paint)</h4>
                  
                  <label>
                    <span>Clearcoat</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={materialProps.clearcoat}
                        onChange={(e) => updateMaterial({ clearcoat: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.clearcoat.toFixed(2)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Clearcoat Roughness</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={materialProps.clearcoatRoughness}
                        onChange={(e) => updateMaterial({ clearcoatRoughness: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.clearcoatRoughness.toFixed(2)}</span>
                    </div>
                  </label>
                </div>

                <div className="material-section">
                  <h4>Clearcoat Textures</h4>
                  
                  <div className="texture-maps-grid">
                    {/* Clearcoat Map */}
                    <TextureMapSlot
                      label="CLEARCOAT"
                      hasMap={hasClearcoatMap}
                      texture={textureMaps.clearcoatMap}
                      mapType="clearcoat"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Clearcoat Normal Map */}
                    <TextureMapSlot
                      label="CLEARCOAT NORMAL"
                      hasMap={hasClearcoatNormalMap}
                      texture={textureMaps.clearcoatNormalMap}
                      mapType="clearcoatNormal"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Clearcoat Roughness Map */}
                    <TextureMapSlot
                      label="CLEARCOAT ROUGH"
                      hasMap={hasClearcoatRoughnessMap}
                      texture={textureMaps.clearcoatRoughnessMap}
                      mapType="clearcoatRoughness"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                  </div>
                </div>

                <div className="material-section">
                  <h4>Advanced Properties</h4>
                  
                  <label>
                    <span>IOR (Index of Refraction)</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="1"
                        max="3"
                        step="0.01"
                        value={materialProps.ior}
                        onChange={(e) => updateMaterial({ ior: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.ior.toFixed(2)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Transmission</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={materialProps.transmission}
                        onChange={(e) => updateMaterial({ transmission: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.transmission.toFixed(2)}</span>
                    </div>
                    <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                      Glass/transparency effect
                    </small>
                  </label>

                  {/* Dispersion only makes sense for glass-like materials (MeshPhysicalMaterial with transmission > 0) */}
                  {isPhysical && materialProps.transmission > 0.1 && (
                    <>
                      <label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <input
                            type="checkbox"
                            checked={materialProps.dispersionEnabled}
                            onChange={(e) => {
                              if (mat && mat instanceof THREE.MeshPhysicalMaterial) {
                                const enabled = e.target.checked
                                updateMaterial({ dispersionEnabled: enabled })
                                
                                if (enabled) {
                                  // Apply dispersion
                                  const dispersionValue = materialProps.dispersionValue
                                  import('../viewer/loaders/gltfLoader').then((module) => {
                                    module.applyDispersionToMaterial(mat, dispersionValue)
                                    mat.userData.dispersionApplied = true
                                    mat.userData.dispersionValue = dispersionValue
                                    mat.userData.isGlass = true
                                    mat.needsUpdate = true
                                  })
                                } else {
                                  // Remove dispersion - restore original shader
                                  if (mat.userData.dispersionApplied) {
                                    // Note: This is a simplified approach - full removal would require
                                    // storing the original onBeforeCompile, but for now we'll just disable
                                    mat.userData.dispersionApplied = false
                                    mat.needsUpdate = true
                                  }
                                }
                              }
                            }}
                          />
                          <span>Enable Dispersion (Glass Rainbow Effect)</span>
                        </div>
                        <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                          Chromatic dispersion creates realistic rainbow refraction in glass
                        </small>
                      </label>

                      {materialProps.dispersionEnabled && (
                        <label>
                          <span>Dispersion Strength</span>
                          <div className="slider-container">
                            <input
                              type="range"
                              min="0"
                              max="0.1"
                              step="0.001"
                              value={materialProps.dispersionValue}
                              onChange={(e) => {
                                if (mat && mat instanceof THREE.MeshPhysicalMaterial) {
                                  const dispersionValue = parseFloat(e.target.value)
                                  updateMaterial({ dispersionValue })
                                  
                                  mat.userData.dispersionValue = dispersionValue
                                  
                                  // Apply or update dispersion
                                  if (!mat.userData.dispersionApplied) {
                                    // Apply dispersion for the first time
                                    import('../viewer/loaders/gltfLoader').then((module) => {
                                      module.applyDispersionToMaterial(mat, dispersionValue)
                                      mat.userData.dispersionApplied = true
                                      mat.userData.isGlass = true
                                      mat.needsUpdate = true
                                    })
                                  } else {
                                    // Update existing dispersion uniform
                                    mat.needsUpdate = true
                                    // Force shader recompilation by updating material
                                    const currentOnBeforeCompile = mat.onBeforeCompile
                                    if (currentOnBeforeCompile) {
                                      mat.onBeforeCompile = (shader: THREE.Shader) => {
                                        currentOnBeforeCompile(shader)
                                        if (shader.uniforms.dispersion) {
                                          shader.uniforms.dispersion.value = dispersionValue
                                        }
                                      }
                                    }
                                  }
                                }
                              }}
                              className="slider"
                            />
                            <span className="slider-value">{materialProps.dispersionValue.toFixed(3)}</span>
                          </div>
                          <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                            Strength of chromatic dispersion (0 = no effect, 0.1 = strong rainbow effect)
                          </small>
                        </label>
                                              )}
                      </>
                    )}

                    {/* Random UV Variation */}
                    <div className="material-section" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <h4 style={{ marginTop: 0, marginBottom: '12px' }}>Random UV Variation</h4>
                      <small style={{ display: 'block', color: '#888', marginBottom: '12px' }}>
                        Add random UV offsets, rotations, and scales to create material variation (useful for instanced meshes)
                      </small>
                      
                      <label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <input
                            type="checkbox"
                            checked={materialProps.randomUVEnabled}
                            onChange={(e) => updateMaterial({ randomUVEnabled: e.target.checked })}
                          />
                          <span>Enable Random UV Variation</span>
                        </div>
                      </label>

                      {materialProps.randomUVEnabled && (
                        <>
                          <label>
                            <span>Offset Range</span>
                            <div className="slider-container">
                              <input
                                type="range"
                                min="0"
                                max="0.5"
                                step="0.01"
                                value={materialProps.randomUVOffsetRange}
                                onChange={(e) => updateMaterial({ randomUVOffsetRange: parseFloat(e.target.value) })}
                                className="slider"
                              />
                              <span className="slider-value">{materialProps.randomUVOffsetRange.toFixed(2)}</span>
                            </div>
                            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                              Maximum UV offset variation (0-0.5)
                            </small>
                          </label>

                          <label>
                            <span>Rotation Range (Degrees)</span>
                            <div className="slider-container">
                              <input
                                type="range"
                                min="0"
                                max="180"
                                step="1"
                                value={(materialProps.randomUVRotationRange * 180 / Math.PI)}
                                onChange={(e) => updateMaterial({ randomUVRotationRange: parseFloat(e.target.value) * Math.PI / 180 })}
                                className="slider"
                              />
                              <span className="slider-value">{(materialProps.randomUVRotationRange * 180 / Math.PI).toFixed(0)}°</span>
                            </div>
                            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                              Maximum UV rotation variation in degrees (0-180°)
                            </small>
                          </label>

                          <label>
                            <span>Scale Min</span>
                            <div className="slider-container">
                              <input
                                type="range"
                                min="0.1"
                                max="1.5"
                                step="0.01"
                                value={materialProps.randomUVScaleMin}
                                onChange={(e) => updateMaterial({ randomUVScaleMin: parseFloat(e.target.value) })}
                                className="slider"
                              />
                              <span className="slider-value">{materialProps.randomUVScaleMin.toFixed(2)}</span>
                            </div>
                          </label>

                          <label>
                            <span>Scale Max</span>
                            <div className="slider-container">
                              <input
                                type="range"
                                min="0.1"
                                max="1.5"
                                step="0.01"
                                value={materialProps.randomUVScaleMax}
                                onChange={(e) => updateMaterial({ randomUVScaleMax: parseFloat(e.target.value) })}
                                className="slider"
                              />
                              <span className="slider-value">{materialProps.randomUVScaleMax.toFixed(2)}</span>
                            </div>
                            <small style={{ display: 'block', color: '#888', marginTop: '4px' }}>
                              UV scale range (min to max). Values &lt; 1 shrink, &gt; 1 enlarge textures
                            </small>
                          </label>
                        </>
                      )}
                    </div>

                    <label>
                      <span>Thickness</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={materialProps.thickness}
                        onChange={(e) => updateMaterial({ thickness: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.thickness.toFixed(1)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Sheen</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={materialProps.sheen}
                        onChange={(e) => updateMaterial({ sheen: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.sheen.toFixed(2)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Sheen Roughness</span>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={materialProps.sheenRoughness}
                        onChange={(e) => updateMaterial({ sheenRoughness: parseFloat(e.target.value) })}
                        className="slider"
                      />
                      <span className="slider-value">{materialProps.sheenRoughness.toFixed(2)}</span>
                    </div>
                  </label>

                  <label>
                    <span>Sheen Color</span>
                    <div className="color-input-container">
                      <input
                        type="color"
                        value={materialProps.sheenColor}
                        onChange={(e) => updateMaterial({ sheenColor: e.target.value })}
                      />
                      <input
                        type="text"
                        value={materialProps.sheenColor}
                        onChange={(e) => updateMaterial({ sheenColor: e.target.value })}
                        className="color-text-input"
                      />
                    </div>
                  </label>
                </div>

                <div className="material-section">
                  <h4>Advanced Textures</h4>
                  
                  <div className="texture-maps-grid">
                    {/* Transmission Map */}
                    <TextureMapSlot
                      label="TRANSMISSION"
                      hasMap={hasTransmissionMap}
                      texture={textureMaps.transmissionMap}
                      mapType="transmission"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Thickness Map */}
                    <TextureMapSlot
                      label="THICKNESS"
                      hasMap={hasThicknessMap}
                      texture={textureMaps.thicknessMap}
                      mapType="thickness"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Sheen Color Map */}
                    <TextureMapSlot
                      label="SHEEN COLOR"
                      hasMap={hasSheenColorMap}
                      texture={textureMaps.sheenColorMap}
                      mapType="sheenColor"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                    
                    {/* Sheen Roughness Map */}
                    <TextureMapSlot
                      label="SHEEN ROUGH"
                      hasMap={hasSheenRoughnessMap}
                      texture={textureMaps.sheenRoughnessMap}
                      mapType="sheenRoughness"
                      onUpload={handleTextureUpload}
                      onRemove={handleTextureRemove}
                      onDuplicate={handleTextureDuplicate}
                      textureToDataUrl={textureToDataUrl}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="material-section">
              <button
                onClick={() => setSelectedMaterial(null)}
                className="button-secondary"
                style={{ width: '100%', marginTop: '10px' }}
              >
                Deselect Material
              </button>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  )
}
