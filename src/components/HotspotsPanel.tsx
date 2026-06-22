import { useState, useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { createHotspotMarker, HOTSPOT_ICON_TYPES, POPULAR_EMOJIS } from '../utils/hotspotUtils'
import { createHotspotLabelSprite, createHotspotLabelTexture } from '../utils/hotspotLabel'
import { createHotspot3DPanel, updateHotspot3DPanelTexture, updateHotspotCSS3DPanelStyle, createHotspotIconTexture, cleanupVideoResourcesForCanvas, cleanupAllVideoResources, type Hotspot3DPanelConfig } from '../utils/hotspot3DPanel'
import HotspotPopup from './HotspotPopup'
import './HotspotsPanel.css'

/**
 * Create a line connecting hotspot to target object
 */
function createHotspotLine(start: THREE.Vector3, end: THREE.Vector3): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end])
  // Modern connecting line with enhanced visual design
  // CRITICAL: depthTest = false ensures line always renders on top, visible from all camera angles
  // This prevents the line from disappearing when viewed from certain angles
  const material = new THREE.LineBasicMaterial({
    color: 0x4a9eff, // Modern blue color (matches UI theme)
    transparent: true,
    opacity: 0.7, // Slightly more visible for modern look
    linewidth: 2, // Slightly thicker for better visibility
    depthTest: true, // Enable depth test so lines can be occluded by objects in front
    depthWrite: false, // Don't write to depth buffer (for transparency)
    polygonOffset: false
  })
  const line = new THREE.Line(geometry, material)
  line.renderOrder = -1 // Render before panels to ensure line is always behind text field/panel
  line.userData.isHotspotLine = true
  // CRITICAL: Ensure line frustum culling doesn't hide it
  line.frustumCulled = false
  return line
}

export interface Hotspot {
  id: string
  name: string
  position: { x: number; y: number; z: number }
  targetObjectId?: string // ID or UUID of the target object
  targetEndpointPosition?: { x: number; y: number; z: number } // Custom endpoint position for connecting line (if not set, uses target object center)
  // When false, no 3D icon pin is rendered (only label/panel). Defaults to true.
  showIcon?: boolean
  icon?: {
    type: 'default' | 'emoji' | 'custom' | 'custom-image' | 'symbol'
    value: string // emoji character, icon name, image URL, or symbol (+, -, etc.)
  }
  panelState?: 'open' | 'closed' // Panel state: open (shows content) or closed (minimized)
  content: {
    type: 'text' | 'image' | 'youtube' | 'video' | 'interactive' | 'html'
    data: string
    formatting?: {
      fontFamily?: string
      fontSize?: number
      color?: string
      bold?: boolean
      italic?: boolean
      underline?: boolean
      align?: 'left' | 'center' | 'right' | 'justify'
      backgroundColor?: string
      padding?: number
    }
    popupSettings?: {
      width?: number
      height?: number
      maxWidth?: number
      maxHeight?: number
      backgroundColor?: string
      borderRadius?: number
      showOnClick?: boolean // Show popup on label click instead of just opening
    }
  }
  // Legacy support - will be migrated to panel system
  label?: {
    text: string
    visible: 'always' | 'hover' | 'click' // When to show label
    fontSize?: number
    color?: string
    backgroundColor?: string
    borderWidth?: number
    borderColor?: string
    borderRadius?: number // Label border radius
    widthPixels?: number | null // Label width in pixels (null = auto based on text)
    heightPixels?: number | null // Label height in pixels (null = auto based on text)
    offsetX?: number // Horizontal offset in 3D units (default: 0)
    offsetY?: number // Vertical offset in 3D units (default: 0)
  }
  // Panel border settings
  panelBorder?: {
    width?: number // Panel border width (default: 2)
    color?: string // Panel border color (default: '#00AAFF')
    borderRadius?: number // Panel border radius (default: 12)
  }
  // Panel dimensions
  panelDimensions?: {
    widthPixels?: number | null // Panel width in pixels (null = auto based on content)
    heightPixels?: number | null // Panel height in pixels (null = auto based on content)
  }
  locked?: boolean // If true, hotspot cannot be moved or edited
}

export default function HotspotsPanel() {
  const { 
    showHotspotsPanel, 
    toggleHotspotsPanel,
    selectedObject,
    xButtonColor,
    xButtonSize,
    setXButtonColor,
    setXButtonSize
  } = useAppStore()
  const { viewer } = useViewer()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const isUpdatingRef = useRef(false) // Prevent concurrent updates
  const [isMinimized, setIsMinimized] = useState(false)
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 480
  const stackingOffset = usePanelStacking({ panelId: 'hotspots', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef, 
    { 
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'hotspots'
    }
  )
  

  const HOTSPOTS_STORAGE_KEY = '3d-viewer-hotspots'
  
  // Load hotspots from localStorage on mount
  const loadHotspotsFromStorage = useCallback((): Hotspot[] => {
    try {
      const stored = localStorage.getItem(HOTSPOTS_STORAGE_KEY)
      if (!stored) return []
      
      const parsed = JSON.parse(stored) as Hotspot[]
      console.log('[HotspotsPanel] Loaded hotspots from storage:', parsed.length)
      return parsed
    } catch (error) {
      console.error('[HotspotsPanel] Failed to load hotspots from storage:', error)
      return []
    }
  }, [])
  
  // Save hotspots to localStorage whenever they change
  const saveHotspotsToStorage = useCallback((hotspotsToSave: Hotspot[]) => {
    try {
      localStorage.setItem(HOTSPOTS_STORAGE_KEY, JSON.stringify(hotspotsToSave))
      console.log('[HotspotsPanel] Saved hotspots to storage:', hotspotsToSave.length)
    } catch (error) {
      console.error('[HotspotsPanel] Failed to save hotspots to storage:', error)
    }
  }, [])
  
  // Start with empty hotspots - will load from storage when panel opens
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [hotspotsLoaded, setHotspotsLoaded] = useState(false) // Track if hotspots have been loaded
  
  // Load hotspots from storage when panel opens for the first time
  useEffect(() => {
    if (!showHotspotsPanel || hotspotsLoaded) return
    
    const loadedHotspots = loadHotspotsFromStorage()
    if (loadedHotspots.length > 0) {
      setHotspots(loadedHotspots)
      console.log('[HotspotsPanel] Loaded', loadedHotspots.length, 'hotspots from storage')
    }
    setHotspotsLoaded(true)
  }, [showHotspotsPanel, hotspotsLoaded, loadHotspotsFromStorage])
  
  // Listen for panel close/open events from ViewerCanvas
  useEffect(() => {
    const handlePanelClosed = (event: CustomEvent<{ hotspotId: string }>) => {
      const { hotspotId } = event.detail
      setHotspots(prev => {
        const updated = prev.map(h => 
          h.id === hotspotId ? { ...h, panelState: 'closed' as const } : h
        )
        // Save to localStorage immediately
        saveHotspotsToStorage(updated)
        console.log('[HotspotsPanel] Panel closed via X button:', hotspotId)
        return updated
      })
    }
    
    const handlePanelOpened = (event: CustomEvent<{ hotspotId: string }>) => {
      const { hotspotId } = event.detail
      console.log('[HotspotsPanel] Received panel-opened event for hotspot:', hotspotId)
      setHotspots(prev => {
        const updated = prev.map(h => {
          if (h.id === hotspotId) {
            console.log('[HotspotsPanel] Updating hotspot panelState from', h.panelState, 'to open:', h.id)
            return { ...h, panelState: 'open' as const }
          }
          return h
        })
        // Save to localStorage immediately
        saveHotspotsToStorage(updated)
        console.log('[HotspotsPanel] Panel opened via label click, updated hotspots:', updated.length, 'hotspotId:', hotspotId)
        return updated
      })
    }
    
    window.addEventListener('hotspot-panel-closed', handlePanelClosed as EventListener)
    window.addEventListener('hotspot-panel-opened', handlePanelOpened as EventListener)
    return () => {
      window.removeEventListener('hotspot-panel-closed', handlePanelClosed as EventListener)
      window.removeEventListener('hotspot-panel-opened', handlePanelOpened as EventListener)
    }
  }, [saveHotspotsToStorage])
  
  // Clean up only orphaned hotspot objects (those not in current hotspots list)
  // This runs when panel opens to remove any leftover objects from previous sessions
  useEffect(() => {
    if (!showHotspotsPanel || !viewer?.scene) return
    
    // Get current hotspot IDs
    const currentHotspotIds = new Set(hotspots.map(h => h.id))
    
    // Only clean up objects that don't match current hotspots (orphaned objects)
    const objectsToRemove: THREE.Object3D[] = []
    viewer.scene.traverse((obj) => {
      const hotspotId = obj.userData.hotspotId
      if (hotspotId && !currentHotspotIds.has(hotspotId)) {
        // This object belongs to a hotspot that no longer exists
        if (obj.userData.isHotspotMarker ||
            obj.userData.isHotspotLine ||
            obj.userData.isHotspotLabel ||
            obj.userData.isHotspotPanel ||
            obj.userData.isHotspotEndpoint) {
          objectsToRemove.push(obj)
        }
      }
    })
    
    // Remove only orphaned objects
    objectsToRemove.forEach((obj) => {
      try {
        if (obj.parent) {
          obj.parent.remove(obj)
        } else {
          viewer.scene.remove(obj)
        }
        
        // Dispose resources
        if (obj instanceof THREE.Sprite && obj.material) {
          const mat = obj.material as THREE.SpriteMaterial
          if (mat.map) mat.map.dispose()
          mat.dispose()
        } else if (obj instanceof THREE.Mesh && obj.material) {
          const mat = obj.material as THREE.Material
          if (mat instanceof THREE.MeshBasicMaterial && mat.map) {
            mat.map.dispose()
          }
          mat.dispose()
          if (obj.geometry) obj.geometry.dispose()
        } else if (obj instanceof THREE.Line && obj.material) {
          const mat = obj.material as THREE.Material
          mat.dispose()
          if (obj.geometry) obj.geometry.dispose()
        } else if (obj instanceof THREE.Group) {
          // Dispose all children
          obj.traverse((child) => {
            if (child instanceof THREE.Sprite && child.material) {
              const mat = child.material as THREE.SpriteMaterial
              if (mat.map) mat.map.dispose()
              mat.dispose()
            } else if (child instanceof THREE.Mesh && child.material) {
              const mat = child.material as THREE.Material
              if (mat instanceof THREE.MeshBasicMaterial && mat.map) {
                mat.map.dispose()
              }
              mat.dispose()
              if (child.geometry) child.geometry.dispose()
            }
          })
        }
      } catch (e) {
        console.warn('[HotspotsPanel] Error cleaning up orphaned object:', e)
      }
    })
    
    if (objectsToRemove.length > 0) {
      console.log('[HotspotsPanel] Cleaned up', objectsToRemove.length, 'orphaned hotspot objects')
    }
  }, [showHotspotsPanel, viewer, hotspots])
  
  // Save hotspots to storage whenever they change
  useEffect(() => {
    saveHotspotsToStorage(hotspots)
  }, [hotspots, saveHotspotsToStorage])
  const [hotspotMarkers, setHotspotMarkers] = useState<Map<string, THREE.Sprite>>(new Map())
  const [hotspotLabels, setHotspotLabels] = useState<Map<string, THREE.Sprite>>(new Map())
  const [hotspotPanels, setHotspotPanels] = useState<Map<string, THREE.Object3D>>(new Map()) // 3D floating panels
  const [hotspotLines, setHotspotLines] = useState<Map<string, THREE.Line>>(new Map())
  const [hotspotEndpoints, setHotspotEndpoints] = useState<Map<string, THREE.Mesh>>(new Map()) // Draggable endpoint handles
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null)
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null)
  const [expandedHotspotId, setExpandedHotspotId] = useState<string | null>(null) // Track which hotspot's details are expanded
  const [endpointsVisible, setEndpointsVisible] = useState<Map<string, boolean>>(new Map()) // Track endpoint visibility per hotspot
  const [editingHotspotId, setEditingHotspotId] = useState<string | null>(null) // Track which hotspot is being edited
  const [hotspotName, setHotspotName] = useState('')
  const [iconType, setIconType] = useState<'default' | 'emoji' | 'custom' | 'custom-image' | 'symbol'>('default')
  const [iconValue, setIconValue] = useState<string>('📍') // Default emoji
  // Whether to render the 3D pin/icon for this hotspot in viewer & web export
  const [showHotspotIcon, setShowHotspotIcon] = useState<boolean>(true)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [contentType, setContentType] = useState<'text' | 'image' | 'youtube' | 'video' | 'interactive' | 'html'>('text')
  const [contentData, setContentData] = useState('')
  const [labelText, setLabelText] = useState('')
  const [labelVisible, setLabelVisible] = useState<'always' | 'hover' | 'click'>('always')
  const [labelColor, setLabelColor] = useState('#ffffff')
  const [labelBackgroundColor, setLabelBackgroundColor] = useState('rgba(0, 0, 0, 0.75)')
  const [labelFontSize, setLabelFontSize] = useState(14)
  const [labelBorderWidth, setLabelBorderWidth] = useState(2)
  const [labelBorderColor, setLabelBorderColor] = useState('#00AAFF') // Same as panel border for consistency
  const [labelBorderRadius, setLabelBorderRadius] = useState(6)
  const [labelWidthPixels, setLabelWidthPixels] = useState<number | null>(null) // Label width in pixels (null = auto)
  const [labelHeightPixels, setLabelHeightPixels] = useState<number | null>(null) // Label height in pixels (null = auto)
  const [labelOffsetX, setLabelOffsetX] = useState(0) // Label horizontal offset in 3D units
  const [labelOffsetY, setLabelOffsetY] = useState(0) // Label vertical offset in 3D units
  // Panel border settings
  const [panelBorderWidth, setPanelBorderWidth] = useState(2)
  const [panelBorderColor, setPanelBorderColor] = useState('#00AAFF')
  const [panelBorderRadius, setPanelBorderRadius] = useState(12)
  // Panel dimensions
  const [panelWidthPixels, setPanelWidthPixels] = useState<number | null>(null) // null = auto based on content, in pixels
  const [panelHeightPixels, setPanelHeightPixels] = useState<number | null>(null) // Panel height in pixels (null = auto)
  const [textFormatting, setTextFormatting] = useState({
    fontFamily: 'Arial',
    fontSize: 16,
    color: '#e0e0e0',
    bold: false,
    italic: false,
    underline: false,
    align: 'left' as 'left' | 'center' | 'right' | 'justify',
    backgroundColor: 'transparent',
    padding: 0
  })
  const [popupSettings, setPopupSettings] = useState({
    width: 800,
    height: 600,
    maxWidth: 90,
    maxHeight: 90,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    showOnClick: false
  })
  const [showFormatting, setShowFormatting] = useState(false)
  const [showPopupSettings, setShowPopupSettings] = useState(false)
  const [showPanelBorder, setShowPanelBorder] = useState(false)
  const [showCloseButtonSettings, setShowCloseButtonSettings] = useState(false)
  const [placePinMode, setPlacePinMode] = useState(false) // Map-style pin placement mode (legacy)
  const [placeHotspotMode, setPlaceHotspotMode] = useState(false) // New interactive placement mode with highlighting
  
  // Real-time preview: Update hotspot formatting when textFormatting changes
  useEffect(() => {
    if (!editingHotspotId) return
    
    // Debounce the update to avoid too many re-renders
    const timeoutId = setTimeout(() => {
      setHotspots(prev => {
        const hotspot = prev.find(h => h.id === editingHotspotId)
        if (!hotspot) return prev
        
        // Check if formatting actually changed
        const currentFormatting = hotspot.content?.formatting || {}
        const formattingChanged = 
          currentFormatting.fontSize !== textFormatting.fontSize ||
          currentFormatting.fontFamily !== textFormatting.fontFamily ||
          currentFormatting.color !== textFormatting.color ||
          currentFormatting.bold !== textFormatting.bold ||
          currentFormatting.italic !== textFormatting.italic ||
          currentFormatting.underline !== textFormatting.underline ||
          currentFormatting.align !== textFormatting.align ||
          currentFormatting.backgroundColor !== textFormatting.backgroundColor ||
          currentFormatting.padding !== textFormatting.padding
        
        if (!formattingChanged) return prev
        
        console.log('[HotspotsPanel] Real-time preview: Updating formatting for hotspot:', editingHotspotId, {
          fontSize: textFormatting.fontSize,
          fontFamily: textFormatting.fontFamily
        })
        
        return prev.map(h => 
          h.id === editingHotspotId 
            ? { 
                ...h, 
                content: { 
                  ...h.content, 
                  formatting: { ...textFormatting }
                }
              } 
            : h
        )
      })
    }, 100) // 100ms debounce
    
    return () => clearTimeout(timeoutId)
  }, [editingHotspotId, textFormatting])
  
  // Real-time preview: Update hotspot content data when contentData changes
  useEffect(() => {
    if (!editingHotspotId || !contentData) return
    
    // Debounce the update to avoid too many re-renders while typing
    const timeoutId = setTimeout(() => {
      setHotspots(prev => {
        const hotspot = prev.find(h => h.id === editingHotspotId)
        if (!hotspot) return prev
        
        // Check if content actually changed
        if (hotspot.content?.data === contentData) return prev
        
        console.log('[HotspotsPanel] Real-time preview: Updating content for hotspot:', editingHotspotId)
        
        return prev.map(h => 
          h.id === editingHotspotId 
            ? { 
                ...h, 
                content: { 
                  ...h.content, 
                  data: contentData
                }
              } 
            : h
        )
      })
    }, 200) // 200ms debounce for typing
    
    return () => clearTimeout(timeoutId)
  }, [editingHotspotId, contentData])
  const [hoveredObject, setHoveredObject] = useState<THREE.Object3D | null>(null) // Currently hovered object for highlighting
  const clickDebounceRef = useRef<number | null>(null) // Debounce rapid clicks
  const cachedMeshesRef = useRef<THREE.Mesh[]>([]) // Cache meshes for raycasting
  const raycasterRef = useRef<THREE.Raycaster | null>(null) // Reuse raycaster
  const highlightedObjectsRef = useRef<Map<THREE.Object3D, { originalEmissive: THREE.Color | null, originalEmissiveIntensity: number }>>(new Map()) // Track highlighted objects

  // Create/update 3D hotspot markers in the scene (optimized with batching)
  useEffect(() => {
    if (!viewer?.scene) return
    
    // Prevent concurrent updates
    if (isUpdatingRef.current) {
      console.log('[HotspotsPanel] Update already in progress, skipping...')
      return
    }
    isUpdatingRef.current = true

    // Use requestAnimationFrame to batch updates and prevent lag
    const updateFrame = requestAnimationFrame(() => {
    setHotspotMarkers(prevMarkers => {
      const markersMap = new Map(prevMarkers)

      // Clean up old markers, labels, panels, and lines that no longer exist
      const linesMap = new Map(hotspotLines)
      const labelsMap = new Map(hotspotLabels)
      const panelsMap = new Map(hotspotPanels)
      const endpointsMap = new Map(hotspotEndpoints)
      
      // Also check scene for existing markers to prevent duplicates
      // First, remove any duplicate markers from scene (keep only one per hotspot)
      const markerCounts = new Map<string, number>()
      const duplicateMarkers: THREE.Object3D[] = []
      viewer.scene.traverse((obj) => {
        // Check for hotspot groups (which contain sprite and helper)
        if (obj instanceof THREE.Group && 
            obj.userData.hotspotId && 
            obj.userData.isHotspot &&
            obj.userData.hotspotSprite) {
          const count = markerCounts.get(obj.userData.hotspotId) || 0
          markerCounts.set(obj.userData.hotspotId, count + 1)
          if (count > 0) {
            // This is a duplicate, mark for removal
            duplicateMarkers.push(obj)
          } else if (!markersMap.has(obj.userData.hotspotId)) {
            // First occurrence, add to map (use sprite from group)
            const sprite = obj.userData.hotspotSprite
            markersMap.set(obj.userData.hotspotId, sprite)
          }
        }
        // Also check for standalone hotspot sprites (legacy support)
        else if (obj instanceof THREE.Sprite && 
                 obj.userData.hotspotId && 
                 obj.userData.isHotspot &&
                 !obj.userData.isHotspotHelper &&
                 !obj.userData.isHotspotLabel) {
          const count = markerCounts.get(obj.userData.hotspotId) || 0
          markerCounts.set(obj.userData.hotspotId, count + 1)
          if (count > 0) {
            // This is a duplicate, mark for removal
            duplicateMarkers.push(obj)
          } else if (!markersMap.has(obj.userData.hotspotId)) {
            // First occurrence, add to map
            markersMap.set(obj.userData.hotspotId, obj)
          }
        }
      })
      
      // Remove duplicate markers
      duplicateMarkers.forEach((marker) => {
        try {
          // If it's a group, dispose all children first
          if (marker instanceof THREE.Group) {
            marker.traverse((child) => {
              if (child instanceof THREE.Sprite || child instanceof THREE.Mesh) {
                if (child.material) {
                  const mat = child.material as THREE.SpriteMaterial | THREE.MeshBasicMaterial
                  if ('map' in mat && mat.map) mat.map.dispose()
                  mat.dispose()
                }
                if (child.geometry) child.geometry.dispose()
              }
            })
          } else if (marker instanceof THREE.Sprite) {
            if (marker.material) {
              const mat = marker.material as THREE.SpriteMaterial
              if (mat.map) mat.map.dispose()
              mat.dispose()
            }
          }
          
          if (marker.parent) {
            marker.parent.remove(marker)
          } else {
            viewer.scene.remove(marker)
          }
          console.log('[HotspotsPanel] Removed duplicate marker for hotspot:', marker.userData.hotspotId)
        } catch (e) {
          console.warn('[HotspotsPanel] Error removing duplicate marker:', e)
        }
      })
      
      // Also check scene for existing labels to prevent duplicates
      // First, remove any duplicate labels from scene (keep only one per hotspot)
      const labelCounts = new Map<string, number>()
      const duplicateLabels: THREE.Sprite[] = []
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Sprite && 
            obj.userData.hotspotId && 
            obj.userData.isHotspotLabel) {
          const count = labelCounts.get(obj.userData.hotspotId) || 0
          labelCounts.set(obj.userData.hotspotId, count + 1)
          if (count > 0) {
            // This is a duplicate, mark for removal
            duplicateLabels.push(obj)
          } else if (!labelsMap.has(obj.userData.hotspotId)) {
            // First occurrence, add to map
            labelsMap.set(obj.userData.hotspotId, obj)
          }
        }
      })
      
      // Remove duplicate labels
      duplicateLabels.forEach((label) => {
        try {
          if (label.parent) {
            label.parent.remove(label)
          } else {
            viewer.scene.remove(label)
          }
          if (label.material) {
            const mat = label.material as THREE.SpriteMaterial
            if (mat.map) mat.map.dispose()
            mat.dispose()
          }
          console.log('[HotspotsPanel] Removed duplicate label for hotspot:', label.userData.hotspotId)
        } catch (e) {
          console.warn('[HotspotsPanel] Error removing duplicate label:', e)
        }
      })
      
      // Also check for duplicate lines
      const lineCounts = new Map<string, number>()
      const duplicateLines: THREE.Line[] = []
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Line && 
            obj.userData.hotspotId && 
            obj.userData.isHotspotLine) {
          const count = lineCounts.get(obj.userData.hotspotId) || 0
          lineCounts.set(obj.userData.hotspotId, count + 1)
          if (count > 0) {
            // This is a duplicate, mark for removal
            duplicateLines.push(obj)
          } else if (!linesMap.has(obj.userData.hotspotId)) {
            // First occurrence, add to map
            linesMap.set(obj.userData.hotspotId, obj)
          }
        }
      })
      
      // Remove duplicate lines
      duplicateLines.forEach((line) => {
        try {
          if (line.parent) {
            line.parent.remove(line)
          } else {
            viewer.scene.remove(line)
          }
          if (line.geometry) line.geometry.dispose()
          if (line.material) {
            if (Array.isArray(line.material)) {
              line.material.forEach(mat => mat.dispose())
            } else {
              line.material.dispose()
            }
          }
          console.log('[HotspotsPanel] Removed duplicate line for hotspot:', line.userData.hotspotId)
        } catch (e) {
          console.warn('[HotspotsPanel] Error removing duplicate line:', e)
        }
      })
      
      // Also check for duplicate endpoints
      const endpointCounts = new Map<string, number>()
      const duplicateEndpoints: THREE.Mesh[] = []
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && 
            obj.userData.hotspotId && 
            obj.userData.isHotspotEndpoint) {
          const count = endpointCounts.get(obj.userData.hotspotId) || 0
          endpointCounts.set(obj.userData.hotspotId, count + 1)
          if (count > 0) {
            // This is a duplicate, mark for removal
            duplicateEndpoints.push(obj)
          } else if (!endpointsMap.has(obj.userData.hotspotId)) {
            // First occurrence, add to map
            endpointsMap.set(obj.userData.hotspotId, obj)
          }
        }
      })
      
      // Remove duplicate endpoints
      duplicateEndpoints.forEach((endpoint) => {
        try {
          if (endpoint.parent) {
            endpoint.parent.remove(endpoint)
          } else {
            viewer.scene.remove(endpoint)
          }
          if (endpoint.geometry) endpoint.geometry.dispose()
          if (endpoint.material) {
            if (Array.isArray(endpoint.material)) {
              endpoint.material.forEach(mat => mat.dispose())
            } else {
              endpoint.material.dispose()
            }
          }
          console.log('[HotspotsPanel] Removed duplicate endpoint for hotspot:', endpoint.userData.hotspotId)
        } catch (e) {
          console.warn('[HotspotsPanel] Error removing duplicate endpoint:', e)
        }
      })
      
      markersMap.forEach((marker, id) => {
        if (!hotspots.find(h => h.id === id)) {
          viewer.scene.remove(marker)
          marker.material.dispose()
          if (marker.material.map) {
            marker.material.map.dispose()
          }
          markersMap.delete(id)
          
          // Remove associated line
          const line = linesMap.get(id)
          if (line) {
            viewer.scene.remove(line)
            line.geometry.dispose()
            ;(line.material as THREE.Material).dispose()
            linesMap.delete(id)
          }
          
          // Remove associated label
          const label = labelsMap.get(id)
          if (label) {
            viewer.scene.remove(label)
            label.material.dispose()
            if (label.material.map) {
              label.material.map.dispose()
            }
            labelsMap.delete(id)
          }
          
          // Remove associated panel
          const panel = panelsMap.get(id)
          if (panel) {
            viewer.scene.remove(panel)
            
            // Handle CSS3D panels (YouTube videos)
            if (panel.userData.isCSS3DPanel) {
              // Remove DOM elements (div and iframe)
              const divElement = panel.userData.divElement as HTMLDivElement | undefined
              const iframeElement = panel.userData.iframeElement as HTMLIFrameElement | undefined
              
              if (iframeElement && iframeElement.parentNode) {
                iframeElement.parentNode.removeChild(iframeElement)
              }
              if (divElement && divElement.parentNode) {
                divElement.parentNode.removeChild(divElement)
              }
              
              // Clear iframe src to stop loading
              if (iframeElement) {
                iframeElement.src = ''
              }
            } else if (panel instanceof THREE.Mesh) {
              // Handle regular mesh panels with textures
              const material = panel.material as THREE.MeshBasicMaterial
              if (material) {
                // Clean up video resources if this panel has a video
                const canvas = material.map?.image as HTMLCanvasElement | undefined
                if (canvas && (canvas as any).__videoId) {
                  cleanupVideoResourcesForCanvas(canvas)
                }
                
                if (material.map) {
                  material.map.dispose()
                }
                material.dispose()
              }
              if (panel.geometry) {
                panel.geometry.dispose()
              }
            }
            
            const wasCSS3D = panel.userData.isCSS3DPanel
            panelsMap.delete(id)
            setHotspotPanels(prev => {
              const newMap = new Map(prev)
              newMap.delete(id)
              return newMap
            })
            
            // PERFORMANCE: Rebuild CSS3D panel cache after removing panel
            if (wasCSS3D && typeof (window as any).__rebuildCSS3DCache === 'function') {
              (window as any).__rebuildCSS3DCache()
            }
          }
          
          // Remove associated endpoint
          const endpoint = endpointsMap.get(id)
          if (endpoint) {
            viewer.scene.remove(endpoint)
            endpoint.geometry.dispose()
            ;(endpoint.material as THREE.Material).dispose()
            endpointsMap.delete(id)
            setHotspotEndpoints(prev => {
              const newMap = new Map(prev)
              newMap.delete(id)
              return newMap
            })
            // Also remove from endpointsVisible map
            setEndpointsVisible(prev => {
              const newMap = new Map(prev)
              newMap.delete(id)
              return newMap
            })
          }
        }
      })

      // Create/update markers and lines for current hotspots
      const createPromises: Promise<void>[] = []
      // endpointsMap already created above for cleanup - reuse it here
      
      hotspots.forEach((hotspot) => {
        const position = new THREE.Vector3(
          hotspot.position.x,
          hotspot.position.y,
          hotspot.position.z
        )
        
        // Validate position
        if (!isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
          console.error('[HotspotsPanel] Invalid hotspot position:', hotspot.id, position)
          return
        }
        
        // Calculate effective label offsets early so they're available for marker updates
        const effectiveLabelOffsetX = hotspot.label?.offsetX ?? labelOffsetX
        const effectiveLabelOffsetY = hotspot.label?.offsetY ?? labelOffsetY
        
        // Create or update marker
        // Check both the map and the scene to prevent duplicates
        const existingMarkerInMap = markersMap.get(hotspot.id)
        // Use traverse to find markers that might be nested or anywhere in scene
        let existingMarkerInScene: THREE.Object3D | undefined
        viewer.scene.traverse((obj) => {
          if (!existingMarkerInScene) {
            // Check for hotspot groups (which contain sprite and helper)
            if (obj instanceof THREE.Group && 
                obj.userData.hotspotId === hotspot.id &&
                obj.userData.isHotspot &&
                obj.userData.hotspotSprite) {
              existingMarkerInScene = obj.userData.hotspotSprite // Use sprite for consistency
            }
            // Also check for standalone hotspot sprites (legacy support)
            else if (obj instanceof THREE.Sprite && 
                     obj.userData.hotspotId === hotspot.id &&
                     obj.userData.isHotspot &&
                     !obj.userData.isHotspotHelper &&
                     !obj.userData.isHotspotLabel) {
              existingMarkerInScene = obj
            }
          }
        })
        
        if (!existingMarkerInMap && !existingMarkerInScene) {
          // Double-check scene one more time right before creating (race condition protection)
          let finalCheck: THREE.Object3D | undefined
          viewer.scene.traverse((obj) => {
            if (!finalCheck) {
              if (obj instanceof THREE.Group && 
                  obj.userData.hotspotId === hotspot.id &&
                  obj.userData.isHotspot &&
                  obj.userData.hotspotSprite) {
                finalCheck = obj.userData.hotspotSprite
              } else if (obj instanceof THREE.Sprite && 
                         obj.userData.hotspotId === hotspot.id &&
                         obj.userData.isHotspot &&
                         !obj.userData.isHotspotHelper &&
                         !obj.userData.isHotspotLabel) {
                finalCheck = obj
              }
            }
          })
          
          if (!finalCheck) {
            // Convert icon type to match HotspotIconType (convert 'symbol' to 'default', map 'custom-image' to 'custom-image')
            let iconForMarker: { type: 'default' | 'emoji' | 'custom' | 'custom-image'; value: string } | undefined
            // If this hotspot is configured to hide its icon, remove any existing marker and skip creation
            if (hotspot.showIcon === false) {
              const objectsToRemove: THREE.Object3D[] = []
              viewer.scene.traverse((obj) => {
                if (obj.userData?.isHotspot && obj.userData?.hotspotId === hotspot.id) {
                  objectsToRemove.push(obj)
                }
              })
              objectsToRemove.forEach((obj) => {
                if (obj.parent) {
                  obj.parent.remove(obj)
                } else {
                  viewer.scene.remove(obj)
                }
              })
              if (markersMap.has(hotspot.id)) {
                markersMap.delete(hotspot.id)
              }
              return markersMap
            }

            if (hotspot.icon) {
              if (hotspot.icon.type === 'symbol') {
                iconForMarker = { type: 'default', value: hotspot.icon.value }
              } else if (hotspot.icon.type === 'custom-image') {
                iconForMarker = { type: 'custom-image', value: hotspot.icon.value }
              } else if (hotspot.icon.type === 'default' || hotspot.icon.type === 'emoji' || hotspot.icon.type === 'custom') {
                iconForMarker = { type: hotspot.icon.type, value: hotspot.icon.value }
              }
            }
            
            const createPromise = createHotspotMarker(
            position,
            hotspot.id,
            hotspot.name,
            iconForMarker
          ).then((markerOrGroup) => {
            // Handle both sprites and groups (new helper system)
            // createHotspotMarker always returns a THREE.Group
            const markerToAdd = markerOrGroup.userData.hotspotSprite || markerOrGroup
            // Ensure position is set correctly
            markerOrGroup.position.copy(position)
            markerOrGroup.updateMatrixWorld(true)
            
            viewer.scene.add(markerOrGroup)
            markersMap.set(hotspot.id, markerToAdd) // Store the sprite for updates
            
            console.log('[HotspotsPanel] Created marker for hotspot:', {
              hotspotId: hotspot.id,
              position: { x: position.x.toFixed(3), y: position.y.toFixed(3), z: position.z.toFixed(3) },
              markerPosition: markerOrGroup.position
            })
            // Don't update state here - let the batched update at the end handle it
          }).catch((error) => {
            console.error('[HotspotsPanel] Failed to create hotspot marker:', error)
          })
          createPromises.push(createPromise)
          } else {
            // Found existing marker in final check, use it
            if (finalCheck && finalCheck instanceof THREE.Sprite && !markersMap.has(hotspot.id)) {
              markersMap.set(hotspot.id, finalCheck)
            }
          }
        } else {
          // Use existing marker from scene if it exists but not in map
          const markerToUse = existingMarkerInMap || (existingMarkerInScene instanceof THREE.Sprite ? existingMarkerInScene : null)
          if (markerToUse && !markersMap.has(hotspot.id)) {
            markersMap.set(hotspot.id, markerToUse)
          }
          // Update existing marker (handled below)
        }
        
        // Update existing marker if it exists
        const marker = markersMap.get(hotspot.id)
        if (marker) {
          // Update position if hotspot moved - CRITICAL: Use position.copy() and updateMatrixWorld()
          // The marker in the map might be a sprite, but we need to update the group if it exists
          let markerToUpdate: THREE.Object3D = marker
          
          // If marker is a sprite, find its parent group
          if (marker instanceof THREE.Sprite && marker.parent instanceof THREE.Group && marker.parent.userData.isHotspot) {
            markerToUpdate = marker.parent
          }
          
          // Update marker position (handle both sprites and groups)
          if (markerToUpdate instanceof THREE.Group) {
            // Update group and all children
            markerToUpdate.position.set(position.x, position.y, position.z)
            if (markerToUpdate.userData.hotspotSprite) {
              markerToUpdate.userData.hotspotSprite.position.set(0, 0, 0) // Relative to group
            }
            if (markerToUpdate.userData.hotspotHelper) {
              markerToUpdate.userData.hotspotHelper.position.set(0, 0, 0) // Relative to group
            }
          } else {
            // Update sprite position directly (legacy support)
            markerToUpdate.position.set(position.x, position.y, position.z)
          }
          markerToUpdate.updateMatrixWorld(true)
          
          // Also update label position if it exists (label at marker position)
          const label = labelsMap.get(hotspot.id)
          if (label) {
            // Get effective offsets from hotspot data
            const offsetX = effectiveLabelOffsetX
            const offsetY = effectiveLabelOffsetY
            // Position label at marker position with offsets
            label.position.set(position.x + offsetX, position.y + offsetY, position.z)
            label.updateMatrixWorld(true)
          }
          
          // Update connecting line if it exists (only update, don't create here - creation happens in main effect)
          const line = linesMap.get(hotspot.id)
          if (line && hotspot.targetEndpointPosition) {
            // Only update if we have a valid endpoint position (surface point)
            const endpointPosition = new THREE.Vector3(
              hotspot.targetEndpointPosition.x,
              hotspot.targetEndpointPosition.y,
              hotspot.targetEndpointPosition.z
            )
            
            const geometry = line.geometry as THREE.BufferGeometry
            const positions = geometry.attributes.position
            if (positions) {
              // Line connects from surface (endpoint) to marker at top
              positions.setXYZ(0, endpointPosition.x, endpointPosition.y, endpointPosition.z)
              positions.setXYZ(1, position.x, position.y, position.z)
              positions.needsUpdate = true
            }
          }
        }
        
        // Create or update floating text label
        // Ensure every hotspot has a label with default text if missing
        const effectiveLabelText = hotspot.label?.text || hotspot.name || `Hotspot ${hotspot.id}`
        const effectiveLabelVisible = hotspot.label?.visible || 'always'
        const effectiveLabelFontSize = hotspot.label?.fontSize || labelFontSize
        const effectiveLabelColor = hotspot.label?.color || labelColor
        const effectiveLabelBackgroundColor = hotspot.label?.backgroundColor || labelBackgroundColor
        const effectiveLabelBorderWidth = hotspot.label?.borderWidth ?? labelBorderWidth
        const effectiveLabelBorderColor = hotspot.label?.borderColor || labelBorderColor
        const effectiveLabelBorderRadius = hotspot.label?.borderRadius ?? labelBorderRadius
        const effectiveLabelWidthPixels = hotspot.label?.widthPixels ?? labelWidthPixels
        const effectiveLabelHeightPixels = hotspot.label?.heightPixels ?? labelHeightPixels
        // effectiveLabelOffsetX and effectiveLabelOffsetY are already calculated above
        // Panel border settings
        const effectivePanelBorderWidth = hotspot.panelBorder?.width ?? panelBorderWidth
        const effectivePanelBorderColor = hotspot.panelBorder?.color || panelBorderColor
        const effectivePanelBorderRadius = hotspot.panelBorder?.borderRadius ?? panelBorderRadius
        // Panel dimensions (in pixels)
        const effectivePanelWidthPixels = hotspot.panelDimensions?.widthPixels ?? panelWidthPixels
        const effectivePanelHeightPixels = hotspot.panelDimensions?.heightPixels ?? panelHeightPixels
        
        // Always create a label if text is available (now guaranteed to have a default)
        if (effectiveLabelText) {
          const shouldShowLabel = 
            effectiveLabelVisible === 'always' ||
            (effectiveLabelVisible === 'hover' && hoveredHotspotId === hotspot.id) ||
            (effectiveLabelVisible === 'click' && activeHotspot?.id === hotspot.id)
          
          // Check both the map and the scene to prevent duplicates
          const existingLabelInMap = labelsMap.get(hotspot.id)
          // Use traverse to find labels that might be nested or anywhere in scene
          let existingLabelInScene: THREE.Sprite | undefined
          viewer.scene.traverse((obj) => {
            if (obj instanceof THREE.Sprite && 
                obj.userData.hotspotId === hotspot.id &&
                obj.userData.isHotspotLabel &&
                !existingLabelInScene) {
              existingLabelInScene = obj
            }
          })
          
          if (!existingLabelInMap && !existingLabelInScene) {
            // Double-check scene one more time right before creating (race condition protection)
            let finalCheck: THREE.Sprite | undefined
            viewer.scene.traverse((obj) => {
              if (obj instanceof THREE.Sprite && 
                  obj.userData.hotspotId === hotspot.id &&
                  obj.userData.isHotspotLabel &&
                  !finalCheck) {
                finalCheck = obj
              }
            })
            
            if (!finalCheck) {
              // Convert pixels to world units for label scale (1 pixel = 0.01 world units)
              const pixelsToWorldUnits = 0.01
              let labelScale: number
              if (effectiveLabelHeightPixels !== null && effectiveLabelHeightPixels !== undefined) {
                labelScale = effectiveLabelHeightPixels * pixelsToWorldUnits
              } else if (effectiveLabelWidthPixels !== null && effectiveLabelWidthPixels !== undefined) {
                // If only width is provided, estimate height from width (approximate 3:1 ratio for text labels)
                const estimatedHeight = effectiveLabelWidthPixels / 3
                labelScale = estimatedHeight * pixelsToWorldUnits
              } else {
                // Default: 80 pixels = 0.8 world units
                labelScale = 80 * pixelsToWorldUnits
              }
              
              const labelSprite = createHotspotLabelSprite(position, effectiveLabelText, {
                fontSize: effectiveLabelFontSize,
                color: effectiveLabelColor,
                backgroundColor: effectiveLabelBackgroundColor,
                offsetX: effectiveLabelOffsetX, // Horizontal offset
                offsetY: effectiveLabelOffsetY, // Vertical offset
                borderWidth: effectiveLabelBorderWidth,
                borderColor: effectiveLabelBorderColor,
                borderRadius: effectiveLabelBorderRadius,
                scale: labelScale
              })
              // Store hotspot ID in label for hover/click detection
              labelSprite.userData.hotspotId = hotspot.id
              labelSprite.userData.isHotspotLabel = true // Mark as hotspot label for scene traversal
              // Store all label properties for change detection
              labelSprite.userData.labelText = effectiveLabelText
              labelSprite.userData.labelFontSize = effectiveLabelFontSize
              labelSprite.userData.labelColor = effectiveLabelColor
              labelSprite.userData.labelBackgroundColor = effectiveLabelBackgroundColor
              labelSprite.userData.labelBorderWidth = effectiveLabelBorderWidth
              labelSprite.userData.labelBorderColor = effectiveLabelBorderColor
              labelSprite.userData.labelBorderRadius = effectiveLabelBorderRadius
              labelSprite.userData.offsetX = effectiveLabelOffsetX // Store offset for consistent updates
              labelSprite.userData.offsetY = effectiveLabelOffsetY // Store offset for consistent updates
              // Scale is set in createHotspotLabelSprite for optimal quality
              labelSprite.visible = shouldShowLabel
              
              // Ensure label is always visible if visibility is set to 'always'
              if (effectiveLabelVisible === 'always') {
                labelSprite.visible = true
              }
              
              viewer.scene.add(labelSprite)
              labelsMap.set(hotspot.id, labelSprite)
              console.log('[HotspotsPanel] Created label for hotspot:', hotspot.id, 'text:', effectiveLabelText)
              // Batch state update at the end to avoid infinite loops
            } else {
              // Found existing label in final check, use it
              if (!labelsMap.has(hotspot.id)) {
                labelsMap.set(hotspot.id, finalCheck)
              }
            }
          } else {
            // Use existing label from scene if it exists but not in map
            const labelToUse = existingLabelInMap || existingLabelInScene
            if (labelToUse && !labelsMap.has(hotspot.id)) {
              labelsMap.set(hotspot.id, labelToUse)
            }
            // Update existing label (handled below)
          }
          
          // Update existing label visibility and position (whether from map or scene)
          const label = labelsMap.get(hotspot.id)
          if (label) {
            // Use effective offsets from hotspot data (not stored userData which might be stale)
            // Position label at marker position with offsets
            label.position.set(position.x + effectiveLabelOffsetX, position.y + effectiveLabelOffsetY, position.z)
            label.updateMatrixWorld(true)
            label.visible = shouldShowLabel
            
            // Update label if text, styling, border, scale, or position changed
            // Use Number() conversion to handle string/number mismatches
            const storedBorderWidth = label.userData.labelBorderWidth ?? 0
            const storedBorderRadius = label.userData.labelBorderRadius ?? 0
            const storedOffsetX = label.userData.offsetX ?? 0
            const storedOffsetY = label.userData.offsetY ?? 0
            
            const labelNeedsUpdate = 
              label.userData.labelText !== effectiveLabelText ||
              label.userData.labelFontSize !== effectiveLabelFontSize ||
              label.userData.labelColor !== effectiveLabelColor ||
              label.userData.labelBackgroundColor !== effectiveLabelBackgroundColor ||
              Number(storedBorderWidth) !== Number(effectiveLabelBorderWidth) ||
              label.userData.labelBorderColor !== effectiveLabelBorderColor ||
              Number(storedBorderRadius) !== Number(effectiveLabelBorderRadius) ||
              label.userData.labelWidthPixels !== effectiveLabelWidthPixels ||
              label.userData.labelHeightPixels !== effectiveLabelHeightPixels ||
              Number(storedOffsetX) !== Number(effectiveLabelOffsetX) ||
              Number(storedOffsetY) !== Number(effectiveLabelOffsetY)
            
            if (labelNeedsUpdate) {
              console.log('[HotspotsPanel] Label texture update triggered:', {
                hotspotId: hotspot.id,
                reason: {
                  text: label.userData.labelText !== effectiveLabelText,
                  fontSize: label.userData.labelFontSize !== effectiveLabelFontSize,
                  color: label.userData.labelColor !== effectiveLabelColor,
                  bgColor: label.userData.labelBackgroundColor !== effectiveLabelBackgroundColor,
                  borderWidth: Number(storedBorderWidth) !== Number(effectiveLabelBorderWidth),
                  borderColor: label.userData.labelBorderColor !== effectiveLabelBorderColor,
                  borderRadius: Number(storedBorderRadius) !== Number(effectiveLabelBorderRadius),
                  widthPixels: label.userData.labelWidthPixels !== effectiveLabelWidthPixels,
                  heightPixels: label.userData.labelHeightPixels !== effectiveLabelHeightPixels,
                  offsetX: Number(storedOffsetX) !== Number(effectiveLabelOffsetX),
                  offsetY: Number(storedOffsetY) !== Number(effectiveLabelOffsetY)
                },
                stored: {
                  borderWidth: storedBorderWidth,
                  borderColor: label.userData.labelBorderColor,
                  borderRadius: storedBorderRadius,
                  offsetX: storedOffsetX,
                  offsetY: storedOffsetY
                },
                effective: {
                  borderWidth: effectiveLabelBorderWidth,
                  borderColor: effectiveLabelBorderColor,
                  borderRadius: effectiveLabelBorderRadius,
                  offsetX: effectiveLabelOffsetX,
                  offsetY: effectiveLabelOffsetY
                }
              })
              const oldMaterial = label.material as THREE.SpriteMaterial
              const oldTexture = oldMaterial.map
              
              const newTexture = createHotspotLabelTexture(effectiveLabelText, {
                fontSize: effectiveLabelFontSize,
                color: effectiveLabelColor,
                backgroundColor: effectiveLabelBackgroundColor,
                borderWidth: effectiveLabelBorderWidth,
                borderColor: effectiveLabelBorderColor,
                borderRadius: effectiveLabelBorderRadius
              })
              
              // Only recalculate scale if dimensions actually changed
              // Preserve existing scale to prevent unwanted growth
              const dimensionsChanged = 
                label.userData.labelWidthPixels !== effectiveLabelWidthPixels ||
                label.userData.labelHeightPixels !== effectiveLabelHeightPixels
              
              if (dimensionsChanged) {
                // Convert pixels to world units for label scale (1 pixel = 0.01 world units)
                const pixelsToWorldUnits = 0.01
                let labelScale: number
                if (effectiveLabelHeightPixels !== null && effectiveLabelHeightPixels !== undefined) {
                  labelScale = effectiveLabelHeightPixels * pixelsToWorldUnits
                } else if (effectiveLabelWidthPixels !== null && effectiveLabelWidthPixels !== undefined) {
                  // If only width is provided, estimate height from width (approximate 3:1 ratio for text labels)
                  const estimatedHeight = effectiveLabelWidthPixels / 3
                  labelScale = estimatedHeight * pixelsToWorldUnits
                } else {
                  // Default: 80 pixels = 0.8 world units
                  labelScale = 80 * pixelsToWorldUnits
                }
                
                // Update label scale only when dimensions changed
                const baseWidth = (newTexture.image as any).__baseWidth || newTexture.image.width
                const baseHeight = (newTexture.image as any).__baseHeight || newTexture.image.height
                const aspectRatio = baseWidth / baseHeight
                label.scale.set(labelScale * aspectRatio, labelScale, 1)
                
                // Store the scale for future reference
                label.userData.labelScale = labelScale
              } else {
                // Dimensions haven't changed - preserve existing scale
                // Just update aspect ratio if texture size changed (due to border changes)
                const baseWidth = (newTexture.image as any).__baseWidth || newTexture.image.width
                const baseHeight = (newTexture.image as any).__baseHeight || newTexture.image.height
                const aspectRatio = baseWidth / baseHeight
                
                // Use stored scale or current Y scale
                const preservedScale = label.userData.labelScale || label.scale.y
                label.scale.set(preservedScale * aspectRatio, preservedScale, 1)
              }
              
              // Store current values for next comparison
              label.userData.labelText = effectiveLabelText
              label.userData.labelFontSize = effectiveLabelFontSize
              label.userData.labelColor = effectiveLabelColor
              label.userData.labelBackgroundColor = effectiveLabelBackgroundColor
              label.userData.labelBorderWidth = effectiveLabelBorderWidth
              label.userData.labelBorderColor = effectiveLabelBorderColor
              label.userData.labelBorderRadius = effectiveLabelBorderRadius
              label.userData.labelWidthPixels = effectiveLabelWidthPixels
              label.userData.labelHeightPixels = effectiveLabelHeightPixels
              label.userData.offsetX = effectiveLabelOffsetX
              label.userData.offsetY = effectiveLabelOffsetY
              
              oldMaterial.map = newTexture
              oldMaterial.needsUpdate = true
              
              // Dispose old texture
              if (oldTexture) {
                oldTexture.dispose()
              }
              
              console.log('[HotspotsPanel] Label texture updated:', {
                hotspotId: hotspot.id,
                borderWidth: effectiveLabelBorderWidth,
                borderColor: effectiveLabelBorderColor,
                borderRadius: effectiveLabelBorderRadius,
                offsetX: effectiveLabelOffsetX,
                offsetY: effectiveLabelOffsetY
              })
            }
          }
        } else {
          // Remove label if hotspot no longer has one
          const label = labelsMap.get(hotspot.id)
          if (label) {
            viewer.scene.remove(label)
            label.material.dispose()
            if (label.material.map) {
              label.material.map.dispose()
            }
            labelsMap.delete(hotspot.id)
            setHotspotLabels(prev => {
              const newMap = new Map(prev)
              newMap.delete(hotspot.id)
              return newMap
            })
          }
        }
        
        // Create or update 3D floating panel (new design)
        const panelState = hotspot.panelState || 'closed' // Default to closed
        
        // Check if panel exists and is still in scene
        const existingPanel = panelsMap.get(hotspot.id)
        const shouldCreatePanel = !existingPanel || existingPanel.parent === null
        
        if (shouldCreatePanel) {
          // Clean up removed panel if it exists
          if (existingPanel && existingPanel.parent === null) {
            // Handle CSS3D panels
            if (existingPanel.userData.isCSS3DPanel) {
              const divElement = existingPanel.userData.divElement as HTMLDivElement | undefined
              const iframeElement = existingPanel.userData.iframeElement as HTMLIFrameElement | undefined
              
              if (iframeElement) {
                iframeElement.src = ''
                if (iframeElement.parentNode) {
                  iframeElement.parentNode.removeChild(iframeElement)
                }
              }
              if (divElement && divElement.parentNode) {
                divElement.parentNode.removeChild(divElement)
              }
            } else if (existingPanel instanceof THREE.Mesh) {
              // Handle regular mesh panels
              const material = existingPanel.material as THREE.MeshBasicMaterial
              if (material) {
                // Clean up video resources
                const canvas = material.map?.image as HTMLCanvasElement | undefined
                if (canvas && (canvas as any).__videoId) {
                  cleanupVideoResourcesForCanvas(canvas)
                }
                if (material.map) material.map.dispose()
                material.dispose()
              }
              if (existingPanel.geometry) {
                existingPanel.geometry.dispose()
              }
            }
            panelsMap.delete(hotspot.id)
          }
          // Create new 3D panel
          const panelConfig: Hotspot3DPanelConfig = {
            title: hotspot.name,
            content: hotspot.content.data,
            contentType: hotspot.content.type,
            contentData: hotspot.content.data,
            isOpen: panelState === 'open',
            backgroundColor: hotspot.content.formatting?.backgroundColor && hotspot.content.formatting.backgroundColor !== 'transparent' 
              ? hotspot.content.formatting.backgroundColor 
              : (hotspot.content.popupSettings?.backgroundColor || 'rgba(25, 25, 30, 0.98)'), // Use text formatting bg first, then popup settings, then default
            textColor: hotspot.content.formatting?.color || '#ffffff', // Bright white text
            fontSize: hotspot.content.formatting?.fontSize || 16,
            fontFamily: hotspot.content.formatting?.fontFamily || 'Arial, sans-serif', // Font family
            bold: hotspot.content.formatting?.bold || false, // Bold text
            italic: hotspot.content.formatting?.italic || false, // Italic text
            underline: hotspot.content.formatting?.underline || false, // Underline text
            borderRadius: effectivePanelBorderRadius,
            padding: hotspot.content.formatting?.padding || 16,
            maxWidth: hotspot.content.popupSettings?.maxWidth || 300,
            maxHeight: hotspot.content.popupSettings?.maxHeight || 400,
            textAlign: (hotspot.content.formatting?.align === 'justify' ? 'left' : hotspot.content.formatting?.align) || 'left',
            titleAlign: 'left',
            borderWidth: effectivePanelBorderWidth,
            borderColor: effectivePanelBorderColor,
            labelBorderWidth: effectiveLabelBorderWidth,
            labelBorderColor: effectiveLabelBorderColor,
            labelBorderRadius: effectiveLabelBorderRadius,
            panelWidthPixels: effectivePanelWidthPixels,
            panelHeightPixels: effectivePanelHeightPixels
          }
          
          console.log('[HotspotsPanel] Creating panel config for hotspot:', {
            hotspotId: hotspot.id,
            hotspotName: hotspot.name,
            contentType: hotspot.content.type,
            contentDataLength: hotspot.content.data?.length || 0,
            contentDataPreview: hotspot.content.data?.substring(0, 150) || 'N/A',
            panelState,
            isOpen: panelConfig.isOpen
          })
          
          // Set icon symbol based on panel state or icon type
          if (hotspot.icon?.type === 'symbol') {
            panelConfig.iconSymbol = hotspot.icon.value
          } else if (panelState === 'closed') {
            panelConfig.iconSymbol = '+' // Show '+' when closed
          } else {
            panelConfig.iconSymbol = '-' // Show '-' when open
          }
          
          // Create custom icon if specified
          if (hotspot.icon?.type === 'custom' && hotspot.icon.value) {
            panelConfig.iconUrl = hotspot.icon.value
          }
          
          // Panel positioned below marker with proper spacing (marker is at position, panel below it)
          const panel = createHotspot3DPanel(position.clone().add(new THREE.Vector3(0, -1.2, 0)), panelConfig)
          panel.userData.hotspotId = hotspot.id
          panel.userData.isHotspotPanel = true
          panel.userData.isDraggable = true // Mark as draggable
          
          // Set panel visibility based on state
          panel.visible = panelState === 'open'
          
          // For CSS3D panels, also mark as billboard so they face camera
          if (panel.userData.isCSS3DPanel) {
            panel.userData.isBillboard = true
          }
          
          // Store config in userData immediately to prevent unnecessary recreations
          panel.userData.panelConfig = { ...panelConfig }
          
          viewer.scene.add(panel)
          panelsMap.set(hotspot.id, panel)
          setHotspotPanels(prev => new Map(prev).set(hotspot.id, panel))
          console.log('[HotspotsPanel] Created 3D panel for hotspot:', hotspot.id, 'state:', panelState, 'isCSS3D:', panel.userData.isCSS3DPanel)
          
          // PERFORMANCE: Rebuild CSS3D panel cache after adding panel
          if (panel.userData.isCSS3DPanel && typeof (window as any).__rebuildCSS3DCache === 'function') {
            (window as any).__rebuildCSS3DCache()
          }
        } else {
          // Update existing panel
          const panel = panelsMap.get(hotspot.id)
          if (panel) {
            // Check if panel still exists in scene before updating
            if (panel.parent !== null) {
              const panelConfig: Hotspot3DPanelConfig = {
                title: hotspot.name,
                content: hotspot.content.data,
                contentType: hotspot.content.type,
                contentData: hotspot.content.data,
                isOpen: panelState === 'open',
                backgroundColor: hotspot.content.formatting?.backgroundColor && hotspot.content.formatting.backgroundColor !== 'transparent' 
                  ? hotspot.content.formatting.backgroundColor 
                  : (hotspot.content.popupSettings?.backgroundColor || 'rgba(25, 25, 30, 0.98)'), // Use text formatting bg first, then popup settings, then default
                textColor: hotspot.content.formatting?.color || '#ffffff', // Bright white text
                fontSize: hotspot.content.formatting?.fontSize || 16,
                fontFamily: hotspot.content.formatting?.fontFamily || 'Arial, sans-serif', // Font family
                bold: hotspot.content.formatting?.bold || false, // Bold text
                italic: hotspot.content.formatting?.italic || false, // Italic text
                underline: hotspot.content.formatting?.underline || false, // Underline text
                borderRadius: effectivePanelBorderRadius,
                padding: hotspot.content.formatting?.padding || 16,
                maxWidth: hotspot.content.popupSettings?.maxWidth || 300,
                maxHeight: hotspot.content.popupSettings?.maxHeight || 400,
                textAlign: (hotspot.content.formatting?.align === 'justify' ? 'left' : hotspot.content.formatting?.align) || 'left',
                titleAlign: 'left',
                borderWidth: effectivePanelBorderWidth,
                borderColor: effectivePanelBorderColor,
                labelBorderWidth: effectiveLabelBorderWidth,
                labelBorderColor: effectiveLabelBorderColor,
                labelBorderRadius: effectiveLabelBorderRadius,
                panelWidthPixels: effectivePanelWidthPixels,
                panelHeightPixels: effectivePanelHeightPixels
              }
              
              // Set icon symbol
              if (hotspot.icon?.type === 'symbol') {
                panelConfig.iconSymbol = hotspot.icon.value
              } else if (panelState === 'closed') {
                panelConfig.iconSymbol = '+'
              } else {
                panelConfig.iconSymbol = '-'
              }
              
              // Update icon if specified
              if (hotspot.icon?.type === 'custom' && hotspot.icon.value) {
                panelConfig.iconUrl = hotspot.icon.value
              }
              
              // CRITICAL: Always update panel visibility based on state (even if config didn't change)
              const shouldBeVisible = panelState === 'open'
              if (panel.visible !== shouldBeVisible) {
                panel.visible = shouldBeVisible
                console.log('[HotspotsPanel] Updated panel visibility:', hotspot.id, 'visible:', shouldBeVisible, 'panelState:', panelState)
              }
              
              // CRITICAL: Update panel position when hotspot is dragged
              // Panel positioned below marker with proper spacing
              panel.position.copy(position.clone().add(new THREE.Vector3(0, -1.2, 0)))
              panel.updateMatrixWorld(true)
              
              // Only update texture if config actually changed (prevents flickering)
              const currentConfig = panel.userData.panelConfig
              
              // For CSS3D panels, only check critical properties that require recreation
              if (panel.userData.isCSS3DPanel) {
                // If no current config, store it and skip recreation check (shouldn't happen, but safety check)
                if (!currentConfig) {
                  console.warn('[HotspotsPanel] CSS3D panel missing panelConfig, storing config:', hotspot.id)
                  panel.userData.panelConfig = { ...panelConfig }
                  // Update position if it changed
                  const panelPosition = position.clone().add(new THREE.Vector3(0, -1.2, 0))
                  if (panel.position.distanceTo(panelPosition) > 0.01) {
                    panel.position.copy(panelPosition)
                    panel.updateMatrixWorld(true)
                  }
                  // Skip recreation check for this iteration
                } else {
                  const contentChanged = 
                  currentConfig.contentType !== panelConfig.contentType ||
                  currentConfig.contentData !== panelConfig.contentData
                const dimensionsChanged =
                  (currentConfig.panelWidthPixels !== panelConfig.panelWidthPixels) ||
                  (currentConfig.panelHeightPixels !== panelConfig.panelHeightPixels)
                
                if (contentChanged || dimensionsChanged) {
                  console.log('[HotspotsPanel] CSS3D panel needs recreation:', {
                    hotspotId: hotspot.id,
                    contentChanged,
                    dimensionsChanged,
                    oldContentType: currentConfig.contentType,
                    newContentType: panelConfig.contentType,
                    oldContentData: currentConfig.contentData?.substring(0, 50),
                    newContentData: panelConfig.contentData?.substring(0, 50)
                  })
                  
                  // Remove old CSS3D panel and create new one (content or dimensions changed)
                  // Clean up DOM elements before removing
                  const divElement = panel.userData.divElement as HTMLDivElement | undefined
                  const iframeElement = panel.userData.iframeElement as HTMLIFrameElement | undefined
                  
                  if (iframeElement) {
                    iframeElement.src = '' // Stop loading
                    if (iframeElement.parentNode) {
                      iframeElement.parentNode.removeChild(iframeElement)
                    }
                  }
                  if (divElement && divElement.parentNode) {
                    divElement.parentNode.removeChild(divElement)
                  }
                  
                  viewer.scene.remove(panel)
                  const panelPosition = position.clone().add(new THREE.Vector3(0, -1.2, 0))
                  const newPanel = createHotspot3DPanel(panelPosition, panelConfig)
                  newPanel.userData.hotspotId = hotspot.id
                  newPanel.userData.isHotspotPanel = true
                  newPanel.userData.isDraggable = true
                  // Store config in userData immediately to prevent unnecessary recreations
                  newPanel.userData.panelConfig = { ...panelConfig }
                  
                  viewer.scene.add(newPanel)
                  panelsMap.set(hotspot.id, newPanel)
                  setHotspotPanels(prev => new Map(prev).set(hotspot.id, newPanel))
                  
                  // PERFORMANCE: Rebuild CSS3D panel cache after recreating panel
                  if (newPanel.userData.isCSS3DPanel && typeof (window as any).__rebuildCSS3DCache === 'function') {
                    (window as any).__rebuildCSS3DCache()
                  }
                } else {
                  // Check if border/styling changed - update without recreation
                  const stylingChanged = !currentConfig ||
                    (currentConfig.borderWidth !== panelConfig.borderWidth) ||
                    (currentConfig.borderColor !== panelConfig.borderColor) ||
                    (currentConfig.borderRadius !== panelConfig.borderRadius) ||
                    (currentConfig.backgroundColor !== panelConfig.backgroundColor)
                  
                  if (stylingChanged) {
                    // Update border/styling without recreating panel
                    console.log('[HotspotsPanel] Updating CSS3D panel styling:', {
                      borderWidth: panelConfig.borderWidth,
                      borderColor: panelConfig.borderColor,
                      borderRadius: panelConfig.borderRadius,
                      backgroundColor: panelConfig.backgroundColor
                    })
                    updateHotspotCSS3DPanelStyle(panel, panelConfig)
                    // Update userData to reflect new config
                    panel.userData.panelConfig = panelConfig
                  }
                  
                  // Update position if it changed
                  const panelPosition = position.clone().add(new THREE.Vector3(0, -1.2, 0))
                  if (panel.position.distanceTo(panelPosition) > 0.01) {
                    panel.position.copy(panelPosition)
                    panel.updateMatrixWorld(true)
                  }
                }
                }
              } else {
                // Regular mesh panels - check all config properties
                const configChanged = !currentConfig || 
                  currentConfig.title !== panelConfig.title ||
                  currentConfig.contentType !== panelConfig.contentType ||
                  currentConfig.contentData !== panelConfig.contentData ||
                  currentConfig.isOpen !== panelConfig.isOpen ||
                  currentConfig.iconSymbol !== panelConfig.iconSymbol ||
                  currentConfig.borderWidth !== panelConfig.borderWidth ||
                  currentConfig.borderColor !== panelConfig.borderColor ||
                  currentConfig.borderRadius !== panelConfig.borderRadius ||
                  currentConfig.labelBorderWidth !== panelConfig.labelBorderWidth ||
                  currentConfig.labelBorderColor !== panelConfig.labelBorderColor ||
                  currentConfig.labelBorderRadius !== panelConfig.labelBorderRadius ||
                  currentConfig.backgroundColor !== panelConfig.backgroundColor ||
                  currentConfig.textColor !== panelConfig.textColor ||
                  currentConfig.fontSize !== panelConfig.fontSize ||
                  currentConfig.fontFamily !== panelConfig.fontFamily ||
                  currentConfig.bold !== panelConfig.bold ||
                  currentConfig.italic !== panelConfig.italic ||
                  currentConfig.underline !== panelConfig.underline ||
                  currentConfig.textAlign !== panelConfig.textAlign ||
                  currentConfig.padding !== panelConfig.padding ||
                  currentConfig.panelWidthPixels !== panelConfig.panelWidthPixels ||
                  currentConfig.panelHeightPixels !== panelConfig.panelHeightPixels
                
                if (configChanged) {
                  // Update panel texture with new config (for regular mesh panels)
                  console.log('[HotspotsPanel] Updating mesh panel texture:', {
                    borderWidth: panelConfig.borderWidth,
                    borderColor: panelConfig.borderColor,
                    borderRadius: panelConfig.borderRadius
                  })
                  updateHotspot3DPanelTexture(panel, panelConfig)
                  // Update userData to reflect new config
                  panel.userData.panelConfig = panelConfig
                }
                // Update position if it changed
                const panelPosition = position.clone().add(new THREE.Vector3(0, -1.2, 0))
                if (panel.position.distanceTo(panelPosition) > 0.01) {
                  panel.position.copy(panelPosition)
                  panel.updateMatrixWorld(true)
                }
              }
              
              // Update user data (only if config actually changed to prevent unnecessary updates)
              if (!panel.userData.panelConfig || 
                  JSON.stringify(panel.userData.panelConfig) !== JSON.stringify(panelConfig)) {
                panel.userData.panelConfig = panelConfig
              }
            } else {
              // Panel was removed from scene but still in map - remove from map
              const wasCSS3D = panel.userData.isCSS3DPanel
              panelsMap.delete(hotspot.id)
              setHotspotPanels(prev => {
                const newMap = new Map(prev)
                newMap.delete(hotspot.id)
                return newMap
              })
              
              // PERFORMANCE: Rebuild CSS3D panel cache after removing panel
              if (wasCSS3D && typeof (window as any).__rebuildCSS3DCache === 'function') {
                (window as any).__rebuildCSS3DCache()
              }
            }
          }
        }
        // Only create/update line if we have a valid endpoint position (surface point)
        // Don't use object center as fallback - that would point to wrong location
        if (hotspot.targetObjectId && hotspot.targetEndpointPosition) {
          const targetObject = findObjectById(viewer.scene, hotspot.targetObjectId)
          if (targetObject) {
            // Use the stored surface endpoint position (not object center)
            const endpointPosition = new THREE.Vector3(
                hotspot.targetEndpointPosition.x,
                hotspot.targetEndpointPosition.y,
                hotspot.targetEndpointPosition.z
              )
            
            // Check both the map and the scene to prevent duplicates
            const existingLineInMap = linesMap.get(hotspot.id)
            // Use traverse to find lines that might be nested or anywhere in scene
            let existingLineInScene: THREE.Line | undefined
            viewer.scene.traverse((obj) => {
              if (obj instanceof THREE.Line && 
                  obj.userData.hotspotId === hotspot.id &&
                  obj.userData.isHotspotLine &&
                  !existingLineInScene) {
                existingLineInScene = obj
              }
            })
            
            if (!existingLineInMap && !existingLineInScene) {
              // Double-check scene one more time right before creating (race condition protection)
              let finalCheck: THREE.Line | undefined
              viewer.scene.traverse((obj) => {
                if (obj instanceof THREE.Line && 
                    obj.userData.hotspotId === hotspot.id &&
                    obj.userData.isHotspotLine &&
                    !finalCheck) {
                  finalCheck = obj
                }
              })
              
              if (!finalCheck) {
                // Create new line - connect from endpoint (car surface) to marker at top
                // Marker is at position (top), line connects from surface to marker
                const line = createHotspotLine(endpointPosition, position)
                line.userData.hotspotId = hotspot.id // Store hotspot ID for reference
                line.userData.isHotspotLine = true // Mark as hotspot line
                
                // Enable depth testing so line can be occluded by objects in front
                const lineMaterial = line.material as THREE.LineBasicMaterial
                lineMaterial.depthTest = true // Allow occlusion by objects in front
                lineMaterial.depthWrite = false // Don't write to depth buffer (for transparency)
                lineMaterial.needsUpdate = true
                
                viewer.scene.add(line)
                linesMap.set(hotspot.id, line)
                console.log('[HotspotsPanel] Created line for hotspot:', hotspot.id)
                // Batch state update at the end to avoid infinite loops
              } else {
                // Found existing line in final check, use it
                if (!linesMap.has(hotspot.id)) {
                  linesMap.set(hotspot.id, finalCheck)
                }
              }
              
              // Create endpoint handle if it doesn't exist (check both map and scene)
              let existingEndpointInMap = endpointsMap.get(hotspot.id)
              let existingEndpointInScene: THREE.Mesh | undefined
              viewer.scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh && 
                    obj.userData.hotspotId === hotspot.id &&
                    obj.userData.isHotspotEndpoint &&
                    !existingEndpointInScene) {
                  existingEndpointInScene = obj
                }
              })
              
              if (!existingEndpointInMap && !existingEndpointInScene) {
                // Modern draggable endpoint handle (glowing sphere with gradient effect)
                const endpointGeometry = new THREE.SphereGeometry(0.1, 24, 24) // Slightly larger, more segments for smoother look
                // Use MeshBasicMaterial with emissive-like effect (doesn't require lights)
                const endpointMaterial = new THREE.MeshBasicMaterial({
                  color: 0x5bb5ff, // Brighter modern blue for better visibility
                  transparent: true,
                  opacity: 0.95, // More opaque for better visibility
                  depthTest: true,
                  depthWrite: false
                })
                const endpointHandle = new THREE.Mesh(endpointGeometry, endpointMaterial)
                endpointHandle.position.copy(endpointPosition)
                endpointHandle.renderOrder = 1001 // Render above line
                endpointHandle.userData.isHotspotEndpoint = true
                endpointHandle.userData.hotspotId = hotspot.id
                endpointHandle.userData.hotspotName = hotspot.name
                endpointHandle.visible = true // Only show when hotspot is selected/being edited
                viewer.scene.add(endpointHandle)
                endpointsMap.set(hotspot.id, endpointHandle)
                console.log('[HotspotsPanel] Created endpoint for hotspot:', hotspot.id)
                // Batch state update at the end to avoid infinite loops
              } else {
                // Use existing endpoint from scene if it exists but not in map
                const endpointToUse = existingEndpointInMap || existingEndpointInScene
                if (endpointToUse && !endpointsMap.has(hotspot.id)) {
                  endpointsMap.set(hotspot.id, endpointToUse)
                }
              }
            } else {
              // Use existing line from scene if it exists but not in map
              const lineToUse = existingLineInMap || existingLineInScene
              if (lineToUse && !linesMap.has(hotspot.id)) {
                linesMap.set(hotspot.id, lineToUse)
              }
              // Update existing line (handled below)
            }
            
            // Update existing line (whether from map or scene)
            const line = linesMap.get(hotspot.id)
            if (line) {
              const geometry = line.geometry as THREE.BufferGeometry
              const positions = geometry.attributes.position
              if (positions) {
                // Line connects from endpoint (car surface) to marker at top
                positions.setXYZ(0, endpointPosition.x, endpointPosition.y, endpointPosition.z)
                positions.setXYZ(1, position.x, position.y, position.z)
                positions.needsUpdate = true
              }
              
              // CRITICAL: Ensure line material is configured for visibility
              const lineMaterial = line.material as THREE.LineBasicMaterial
              if (lineMaterial.depthTest !== false) {
                lineMaterial.depthTest = false
                lineMaterial.needsUpdate = true
              }
              // Keep renderOrder at -1 to ensure line is always behind panels
              if (line.renderOrder !== -1) {
                line.renderOrder = -1
              }
              line.frustumCulled = false
              
              // Update endpoint handle position and visibility
              const endpointHandle = endpointsMap.get(hotspot.id)
              if (endpointHandle) {
                endpointHandle.position.copy(endpointPosition)
                endpointHandle.updateMatrixWorld(true)
                // Preserve visibility state
                const endpointVisible = endpointsVisible.get(hotspot.id) !== false
                endpointHandle.visible = endpointVisible
              }
              // Note: Endpoint creation is handled in the new line creation block above
              // No need to create here as it would cause duplicates
            }
          } else {
            // Only warn once per hotspot to prevent console spam
            const warningKey = `${hotspot.id}-${hotspot.targetObjectId}`
            if (!missingObjectWarnings.current.has(warningKey)) {
              missingObjectWarnings.current.add(warningKey)
              console.warn('[HotspotsPanel] Target object not found for hotspot:', hotspot.id, 'targetObjectId:', hotspot.targetObjectId)
            }
          }
        } else {
          // Remove line and endpoint if no target object
          const line = linesMap.get(hotspot.id)
          if (line) {
            viewer.scene.remove(line)
            line.geometry.dispose()
            ;(line.material as THREE.Material).dispose()
            linesMap.delete(hotspot.id)
            setHotspotLines(prev => {
              const newMap = new Map(prev)
              newMap.delete(hotspot.id)
              return newMap
            })
          }
          
          const endpoint = endpointsMap.get(hotspot.id)
          if (endpoint) {
            viewer.scene.remove(endpoint)
            endpoint.geometry.dispose()
            ;(endpoint.material as THREE.Material).dispose()
            endpointsMap.delete(hotspot.id)
            setHotspotEndpoints(prev => {
              const newMap = new Map(prev)
              newMap.delete(hotspot.id)
              return newMap
            })
          }
        }
      })
      
      // Wait for all markers to be created before returning (batched update)
      if (createPromises.length > 0) {
      Promise.all(createPromises).then(() => {
          // Batch all state updates together
          requestAnimationFrame(() => {
        setHotspotMarkers(new Map(markersMap))
        setHotspotLines(new Map(linesMap))
        setHotspotLabels(new Map(labelsMap))
      })
        })
      } else {
        // No async operations, update immediately
        requestAnimationFrame(() => {
          setHotspotMarkers(new Map(markersMap))
          setHotspotLines(new Map(linesMap))
          setHotspotLabels(new Map(labelsMap))
        })
      }

      return markersMap
    })
    })

    // Mark update as complete after a short delay to allow state to settle
    setTimeout(() => {
      isUpdatingRef.current = false
    }, 100)

    return () => {
      cancelAnimationFrame(updateFrame)
      isUpdatingRef.current = false
    }

    // Expose hotspots globally for ViewerCanvas to handle clicks, hover, and position updates
    ;(window as any).__hotspots = hotspots
    ;(window as any).__setActiveHotspot = setActiveHotspot
    ;(window as any).__setHoveredHotspotId = setHoveredHotspotId
    ;(window as any).__updateHotspotPosition = (id: string, position: { x: number; y: number; z: number }) => {
      console.log('[HotspotsPanel] __updateHotspotPosition called:', { id, position })
      setHotspots(prev => prev.map(h => {
        if (h.id === id) {
          console.log('[HotspotsPanel] Updating hotspot position:', { id, oldPosition: h.position, newPosition: position })
          return { ...h, position }
        }
        return h
      }))
    }

    // Expose function to update hotspot endpoint position (for draggable line endpoint)
    ;(window as any).__updateHotspotEndpointPosition = (id: string, position: { x: number; y: number; z: number }) => {
      console.log('[HotspotsPanel] __updateHotspotEndpointPosition called:', { id, position })
      setHotspots(prev => prev.map(h => {
        if (h.id === id) {
          console.log('[HotspotsPanel] Updating hotspot endpoint position:', { id, oldPosition: h.targetEndpointPosition, newPosition: position })
          return { ...h, targetEndpointPosition: position }
        }
        return h
      }))
    }

    return () => {
      // Cleanup on unmount - cleanup is handled by setState cleanup
      ;(window as any).__hotspots = []
      ;(window as any).__setActiveHotspot = null
      ;(window as any).__setHoveredHotspotId = null
      ;(window as any).__updateHotspotPosition = null
      ;(window as any).__updateHotspotEndpointPosition = null
    }
  }, [hotspots, viewer?.scene, setActiveHotspot, hotspotLines, hoveredHotspotId, activeHotspot, labelFontSize, labelColor, labelBackgroundColor, labelBorderWidth, labelBorderColor])

  // Cache meshes for raycasting (only update when scene changes significantly)
  useEffect(() => {
    if (!viewer?.scene) return

    const updateCachedMeshes = () => {
      const meshes: THREE.Mesh[] = []
      viewer.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          // Exclude all helper objects, UI elements, and system objects
          if (obj.userData.isHelper || 
              obj.userData.isLightGizmo || 
              obj.userData.isHotspotMarker ||
              obj.userData.isHotspotLine ||
              obj.userData.isHotspotEndpoint ||
              obj.userData.isHotspotPanel ||
              obj.userData.isGridHelper ||
              obj.userData.isAxesHelper ||
              obj.userData.isGroundedSkybox ||
              obj.userData.isShadowPlane ||
              obj.userData.isTransformControls ||
              obj.userData.isPolygonDrawing ||
              obj.name?.toLowerCase().includes('helper') ||
              obj.name?.toLowerCase().includes('gizmo') ||
              !obj.visible) {
            return
          }
          
          // Only include meshes that are part of the actual model
          // Check if it's an imported model or has geometry
          if (obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) {
            meshes.push(obj)
          }
        }
      })
      cachedMeshesRef.current = meshes
      console.log('[HotspotsPanel] Cached meshes for raycasting:', meshes.length)
    }

    updateCachedMeshes()
    // Update cache when scene changes (debounced)
    const timeout = setTimeout(updateCachedMeshes, 1000)
    return () => clearTimeout(timeout)
  }, [viewer?.scene])

  // Initialize raycaster once
  useEffect(() => {
    if (!raycasterRef.current) {
      raycasterRef.current = new THREE.Raycaster()
    }
  }, [])

  // Helper function to highlight an object
  const highlightObject = useCallback((obj: THREE.Object3D | null) => {
    // Clear previous highlights
    highlightedObjectsRef.current.forEach((data, obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((mat: THREE.Material) => {
          if (mat instanceof THREE.MeshStandardMaterial || 
              mat instanceof THREE.MeshPhysicalMaterial ||
              mat instanceof THREE.MeshPhongMaterial) {
            if (data.originalEmissive) {
              mat.emissive.copy(data.originalEmissive)
            } else {
              mat.emissive.setHex(0x000000)
            }
            mat.emissiveIntensity = data.originalEmissiveIntensity
          }
        })
      }
    })
    highlightedObjectsRef.current.clear()

    // Highlight new object
    if (obj && obj instanceof THREE.Mesh && obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      materials.forEach((mat: THREE.Material) => {
        if (mat instanceof THREE.MeshStandardMaterial || 
            mat instanceof THREE.MeshPhysicalMaterial ||
            mat instanceof THREE.MeshPhongMaterial) {
          // Store original emissive
          if (!highlightedObjectsRef.current.has(obj)) {
            highlightedObjectsRef.current.set(obj, {
              originalEmissive: mat.emissive.clone(),
              originalEmissiveIntensity: mat.emissiveIntensity || 0
            })
          }
          // Set highlight color (bright yellow/orange)
          mat.emissive.setHex(0xffaa00)
          mat.emissiveIntensity = 0.5
        }
      })
    }
  }, [])

  // Interactive hotspot placement mode with hover highlighting
  useEffect(() => {
    if (!placeHotspotMode || !viewer) {
      // Clear highlights when exiting mode
      highlightObject(null)
      setHoveredObject(null)
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!viewer?.camera || !viewer?.renderer || !viewer?.scene) return
      
      const canvas = viewer.renderer.domElement
      if (!canvas.contains(event.target as Node)) return

      // Get mouse position in normalized device coordinates
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      // Validate mouse coordinates
      if (!isFinite(mouse.x) || !isFinite(mouse.y)) return

      // Use raycaster to find object under cursor
      const raycaster = raycasterRef.current || new THREE.Raycaster()
      raycaster.near = 0.1
      raycaster.far = 10000
      raycaster.setFromCamera(mouse, viewer.camera)

      // Use cached meshes
      const meshes = cachedMeshesRef.current
      if (meshes.length === 0) {
        highlightObject(null)
        setHoveredObject(null)
        return
      }

      // Filter to only visible, opaque meshes
      const validMeshes = meshes.filter(mesh => {
        if (!mesh.visible) return false
        const material = mesh.material
        if (Array.isArray(material)) {
          return material.some(mat => {
            const opacity = (mat as any).opacity ?? 1
            const transparent = (mat as any).transparent ?? false
            const transmission = (mat as any).transmission ?? 0
            return opacity > 0.5 && !transparent && transmission < 0.3
          })
        } else {
          const opacity = (material as any).opacity ?? 1
          const transparent = (material as any).transparent ?? false
          const transmission = (material as any).transmission ?? 0
          return opacity > 0.5 && !transparent && transmission < 0.3
        }
      })

      if (validMeshes.length === 0) {
        highlightObject(null)
        setHoveredObject(null)
        return
      }

      const intersects = raycaster.intersectObjects(validMeshes, true)
      
      if (intersects.length > 0) {
        const hitObject = intersects[0].object
        if (hitObject !== hoveredObject) {
          setHoveredObject(hitObject)
          highlightObject(hitObject)
        }
      } else {
        if (hoveredObject) {
          highlightObject(null)
          setHoveredObject(null)
        }
      }
    }

    const handleClick = (event: MouseEvent) => {
      if (!viewer?.camera || !viewer?.renderer || !viewer?.scene) return
      
      const canvas = viewer.renderer.domElement
      if (!canvas.contains(event.target as Node)) return

      // Get mouse position
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      if (!isFinite(mouse.x) || !isFinite(mouse.y)) return

      // Use raycaster to find clicked object
      const raycaster = raycasterRef.current || new THREE.Raycaster()
      raycaster.near = 0.1
      raycaster.far = 10000
      raycaster.setFromCamera(mouse, viewer.camera)

      const meshes = cachedMeshesRef.current
      const validMeshes = meshes.filter(mesh => {
        if (!mesh.visible) return false
        const material = mesh.material
        if (Array.isArray(material)) {
          return material.some(mat => {
            const opacity = (mat as any).opacity ?? 1
            const transparent = (mat as any).transparent ?? false
            const transmission = (mat as any).transmission ?? 0
            return opacity > 0.5 && !transparent && transmission < 0.3
          })
        } else {
          const opacity = (material as any).opacity ?? 1
          const transparent = (material as any).transparent ?? false
          const transmission = (material as any).transmission ?? 0
          return opacity > 0.5 && !transparent && transmission < 0.3
        }
      })

      if (validMeshes.length === 0) return

      const intersects = raycaster.intersectObjects(validMeshes, true)
      
      if (intersects.length > 0) {
        const intersection = intersects[0]
        const hitObject = intersection.object
        
        // Verify intersection is valid
        if (!intersection.point || !isFinite(intersection.point.x) || !isFinite(intersection.point.y) || !isFinite(intersection.point.z)) {
          console.error('[HotspotsPanel] Invalid intersection point:', intersection.point)
          return
        }
        
        // Verify distance is reasonable
        if (intersection.distance > 1000 || intersection.distance < 0.1) {
          console.warn('[HotspotsPanel] Intersection distance out of range:', intersection.distance)
          return
        }
        
        // Surface point on the car (where line connects from)
        const surfacePosition = intersection.point.clone()
        
        // Add small offset along face normal to prevent z-fighting
        if (intersection.face && intersection.face.normal) {
          const normal = intersection.face.normal.clone()
          // Transform normal to world space
          normal.transformDirection(intersection.object.matrixWorld)
          normal.normalize()
          // Small offset (1.5cm) along normal to sit on surface and be visible
          surfacePosition.add(normal.multiplyScalar(0.015))
        } else {
          // Fallback: small upward offset if no normal available
          surfacePosition.y += 0.02
        }
        
        // Calculate top position for marker (above the car surface)
        // Use upward direction (Y-axis) to place marker at top
        const topPosition = surfacePosition.clone()
        topPosition.y += 2.5 // Place marker 2.5 units above the surface
        
        // Final validation
        if (!isFinite(surfacePosition.x) || !isFinite(surfacePosition.y) || !isFinite(surfacePosition.z)) {
          console.error('[HotspotsPanel] Invalid surface position after calculation:', surfacePosition)
          return
        }
        
        if (!isFinite(topPosition.x) || !isFinite(topPosition.y) || !isFinite(topPosition.z)) {
          console.error('[HotspotsPanel] Invalid top position after calculation:', topPosition)
          return
        }
        
        if (surfacePosition.lengthSq() < 0.001) {
          console.warn('[HotspotsPanel] Surface position is at origin, skipping')
          return
        }

        // Create hotspot
        let newHotspotId: string | null = null
        setHotspots(prev => {
          const defaultHotspotName = hotspotName || `Hotspot ${prev.length + 1}`
          const newHotspot: Hotspot = {
            id: `hotspot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: defaultHotspotName,
            showIcon: showHotspotIcon,
            position: { 
              x: topPosition.x, 
              y: topPosition.y, 
              z: topPosition.z 
            },
            targetObjectId: hitObject.uuid,
            targetEndpointPosition: {
              x: surfacePosition.x,
              y: surfacePosition.y,
              z: surfacePosition.z
            },
            icon: iconType !== 'default' ? {
              type: iconType,
              value: iconValue
            } : undefined,
            // Always create a label with the hotspot name by default
            label: {
              text: labelText || defaultHotspotName,
              visible: labelVisible || 'always',
              fontSize: labelFontSize,
              color: labelColor,
              backgroundColor: labelBackgroundColor,
              borderWidth: labelBorderWidth,
              borderColor: labelBorderColor,
              borderRadius: labelBorderRadius,
              widthPixels: labelWidthPixels,
              heightPixels: labelHeightPixels
            },
            panelBorder: {
              width: panelBorderWidth,
              color: panelBorderColor,
              borderRadius: panelBorderRadius
            },
            panelDimensions: {
              widthPixels: panelWidthPixels,
              heightPixels: panelHeightPixels
            },
            panelState: 'open', // Default to open so user can see the panel immediately
            content: {
              type: contentType,
              data: contentData || 'Click to edit this hotspot',
              formatting: contentType === 'text' ? textFormatting : undefined,
              popupSettings: popupSettings
            }
          }
          console.log('[HotspotsPanel] Hotspot placed on object:', {
            objectUuid: hitObject.uuid,
            objectName: hitObject.name || 'Unnamed',
            objectType: hitObject.type,
            markerPosition: { x: topPosition.x.toFixed(3), y: topPosition.y.toFixed(3), z: topPosition.z.toFixed(3) },
            surfacePosition: { x: surfacePosition.x.toFixed(3), y: surfacePosition.y.toFixed(3), z: surfacePosition.z.toFixed(3) },
            intersectionPoint: { x: intersection.point.x.toFixed(3), y: intersection.point.y.toFixed(3), z: intersection.point.z.toFixed(3) },
            distance: intersection.distance.toFixed(3),
            hasNormal: !!intersection.face?.normal,
            hotspotId: newHotspot.id
          })
          const newHotspotId = newHotspot.id
          // Enter edit mode for the newly placed hotspot after state update
          setTimeout(() => {
            setHotspots(currentHotspots => {
              const placedHotspot = currentHotspots.find(h => h.id === newHotspotId)
              if (placedHotspot) {
                // Manually populate form fields and enter edit mode (avoiding circular dependency)
                setEditingHotspotId(placedHotspot.id)
                setHotspotName(placedHotspot.name)
                setIconType(placedHotspot.icon?.type || 'default')
                setIconValue(placedHotspot.icon?.value || '📍')
                setLabelText(placedHotspot.label?.text || '')
                setLabelVisible(placedHotspot.label?.visible || 'always')
                setLabelFontSize(placedHotspot.label?.fontSize || 14)
                setLabelColor(placedHotspot.label?.color || '#ffffff')
                setLabelBackgroundColor(placedHotspot.label?.backgroundColor || '#333333')
                setLabelBorderWidth(placedHotspot.label?.borderWidth || 2)
                setLabelBorderColor(placedHotspot.label?.borderColor || '#00AAFF')
                setLabelBorderRadius(placedHotspot.label?.borderRadius || 6)
                setPanelBorderWidth(placedHotspot.panelBorder?.width || 2)
                setPanelBorderColor(placedHotspot.panelBorder?.color || '#00AAFF')
                setPanelBorderRadius(placedHotspot.panelBorder?.borderRadius || 12)
                setPanelWidthPixels(placedHotspot.panelDimensions?.widthPixels || null)
                setPanelHeightPixels(placedHotspot.panelDimensions?.heightPixels || null)
                setContentType(placedHotspot.content?.type || 'text')
                setContentData(placedHotspot.content?.data || '')
                if (placedHotspot.content?.formatting) {
                  setTextFormatting(prev => ({ ...prev, ...placedHotspot.content!.formatting }))
                }
                if (placedHotspot.content?.popupSettings) {
                  setPopupSettings(prev => ({ ...prev, ...placedHotspot.content!.popupSettings }))
                }
                console.log('[HotspotsPanel] Entered edit mode for newly placed hotspot:', newHotspotId)
              }
              return currentHotspots // Return unchanged
            })
          }, 0)
          
          return [...prev, newHotspot]
        })

        // Exit placement mode after placing
        setPlaceHotspotMode(false)
        highlightObject(null)
        setHoveredObject(null)
      }
    }

    const canvas = viewer.renderer.domElement
    canvas.addEventListener('mousemove', handleMouseMove, { passive: true })
    canvas.addEventListener('click', handleClick, { passive: true })
    canvas.style.cursor = 'crosshair'

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
      canvas.style.cursor = 'default'
      highlightObject(null)
      setHoveredObject(null)
    }
  }, [placeHotspotMode, viewer, hoveredObject, highlightObject, hotspotName, iconType, iconValue, labelText, labelVisible, labelFontSize, labelColor, labelBackgroundColor, labelBorderWidth, labelBorderColor, contentType, contentData, textFormatting, popupSettings])

  // Click-to-place pin mode: listen for clicks on the viewer canvas (optimized with debouncing)
  useEffect(() => {
    if (!placePinMode || !viewer) return

    const handleCanvasClick = (event: MouseEvent) => {
      // Debounce rapid clicks to prevent lag
      if (clickDebounceRef.current) {
        clearTimeout(clickDebounceRef.current)
      }

      clickDebounceRef.current = window.setTimeout(() => {
        if (!viewer?.camera || !viewer?.renderer || !viewer?.scene) return
        
        const canvas = viewer.renderer.domElement
        if (!canvas.contains(event.target as Node)) return

        // Get mouse position in normalized device coordinates (-1 to +1)
        const rect = canvas.getBoundingClientRect()
        const mouse = new THREE.Vector2()
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        // Validate mouse coordinates
        if (!isFinite(mouse.x) || !isFinite(mouse.y) || 
            Math.abs(mouse.x) > 1.5 || Math.abs(mouse.y) > 1.5) {
          console.warn('[HotspotsPanel] Invalid mouse coordinates:', mouse)
          return
        }

        // Reuse cached raycaster and meshes for performance
        const raycaster = raycasterRef.current || new THREE.Raycaster()
        
        // Ensure camera is valid
        if (!viewer.camera || !viewer.camera.isPerspectiveCamera) {
          console.warn('[HotspotsPanel] Invalid camera for raycasting')
          return
        }
        
        // Configure raycaster to only hit front faces and set reasonable limits
        raycaster.near = 0.1
        raycaster.far = 10000
        raycaster.setFromCamera(mouse, viewer.camera)

        // Use cached meshes instead of traversing scene every time
        const meshes = cachedMeshesRef.current
        if (meshes.length === 0) return // No meshes to intersect

        // Filter meshes to only include visible, opaque surfaces (exclude glass/transparent)
        const validMeshes = meshes.filter(mesh => {
          if (!mesh.visible) return false
          
          // Check material transparency
          const material = mesh.material
          if (Array.isArray(material)) {
            // If multiple materials, check if any are opaque
            return material.some(mat => {
              const opacity = (mat as any).opacity ?? 1
              const transparent = (mat as any).transparent ?? false
              const transmission = (mat as any).transmission ?? 0
              return opacity > 0.5 && !transparent && transmission < 0.3
            })
          } else {
            const opacity = (material as any).opacity ?? 1
            const transparent = (material as any).transparent ?? false
            const transmission = (material as any).transmission ?? 0
            return opacity > 0.5 && !transparent && transmission < 0.3
          }
        })

        if (validMeshes.length === 0) return

        const intersects = raycaster.intersectObjects(validMeshes, true)
        
        if (intersects.length > 0) {
          // Use the closest intersection (first one is already closest)
          const intersection = intersects[0]
          
          // Verify this is a valid surface hit (not too far from camera)
          const distanceToCamera = intersection.distance
          if (distanceToCamera > 1000) return // Too far away, likely wrong hit
          
          // CRITICAL: Get the actual object that was hit (subobject/part), not the root model
          const hitObject = intersection.object
          
          // intersection.point is already in world coordinates, but verify it's valid
          const worldPosition = intersection.point.clone()
          
          // CRITICAL: Verify we got valid world coordinates
          if (!isFinite(worldPosition.x) || !isFinite(worldPosition.y) || !isFinite(worldPosition.z)) {
            console.error('[HotspotsPanel] Invalid intersection point:', worldPosition)
            return
          }
          
          // Verify position is not at origin (likely a bug)
          if (worldPosition.lengthSq() < 0.001) {
            console.warn('[HotspotsPanel] Intersection point is at origin, skipping')
            return
          }
          
          // Add small offset along face normal to prevent z-fighting and ensure pin is visible
          if (intersection.face && intersection.face.normal) {
            const normal = intersection.face.normal.clone()
            // Transform normal to world space
            normal.transformDirection(intersection.object.matrixWorld)
            normal.normalize()
            // Offset by 2cm along the normal (away from surface)
            worldPosition.add(normal.multiplyScalar(0.02))
          }
          
          // Batch state update using functional update
          setHotspots(prev => {
            const newHotspot: Hotspot = {
              id: `hotspot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: `Pin ${prev.length + 1}`,
              position: { 
                x: worldPosition.x, 
                y: worldPosition.y, 
                z: worldPosition.z 
              },
              // CRITICAL: Lock to the specific object that was hit (subobject), not the root model
              targetObjectId: hitObject.uuid,
              icon: {
                type: 'emoji',
                value: '📍'
              },
              panelState: 'open', // Default to open so user can see the panel immediately
              content: {
                type: 'text',
                data: 'Click to edit this pin'
              }
            }
            console.log('[HotspotsPanel] Pin placed at (locked to subobject):', {
              position: worldPosition,
              hitObjectUuid: hitObject.uuid,
              hitObjectName: hitObject.name || 'Unnamed',
              hitObjectType: hitObject.type,
              distance: intersection.distance.toFixed(2)
            })
            return [...prev, newHotspot]
          })
        } else {
          console.warn('[HotspotsPanel] No valid intersection found for pin placement')
        }
      }, 150) // 150ms debounce to prevent rapid-fire clicks
    }

    // Add click listener to the canvas
    const canvas = viewer.renderer.domElement
    canvas.addEventListener('click', handleCanvasClick, { passive: true })
    
    // Change cursor to indicate pin placement mode
    canvas.style.cursor = 'crosshair'

    return () => {
      if (clickDebounceRef.current) {
        clearTimeout(clickDebounceRef.current)
      }
      canvas.removeEventListener('click', handleCanvasClick)
      canvas.style.cursor = 'default'
    }
  }, [placePinMode, viewer])

  // Cache to track missing objects we've already warned about (prevents spam)
  const missingObjectWarnings = useRef<Set<string>>(new Set())

  // Helper function to find object by ID/UUID
  const findObjectById = useCallback((scene: THREE.Scene, id: string): THREE.Object3D | null => {
    let found: THREE.Object3D | null = null
    
    // Traverse scene to find object
    scene.traverse((obj) => {
      // Stop if already found
      if (found) return
      
      // Check UUID first (most reliable)
      if (obj.uuid === id) {
        found = obj
        return
      }
      
      // Check name as fallback (only if name is not empty)
      if (obj.name && obj.name === id) {
        found = obj
        return
      }
      
      // Check userData.id
      if (obj.userData && obj.userData.id === id) {
        found = obj
        return
      }
    })
    
    // If not found, also check children of imported models more thoroughly
    if (!found) {
      scene.traverse((obj) => {
        if (found) return
        
        // Check if this is a model root or any object with children
        const isModel = obj.userData?.isModel || obj.userData?.isImportedModel
        
        if (isModel || obj.children.length > 0) {
          obj.traverse((child) => {
            if (found) return
            
            // Check UUID
            if (child.uuid === id) {
              found = child
              return
            }
            
            // Check name (only if not empty)
            if (child.name && child.name === id) {
              found = child
              return
            }
            
            // Check userData.id
            if (child.userData?.id === id) {
              found = child
              return
            }
          })
        }
      })
    }
    
    // Last resort: if still not found and ID looks like a UUID, try to find any object with matching UUID pattern
    if (!found && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      scene.traverse((obj) => {
        if (found) return
        // Deep search through all children
        if (obj.uuid === id) {
          found = obj
        }
      })
    }
    
    if (!found) {
      // Only warn once per missing object ID to prevent console spam
      if (!missingObjectWarnings.current.has(id)) {
        missingObjectWarnings.current.add(id)
        console.warn('[HotspotsPanel] Could not find object with ID:', id, 'Searching in scene with', scene.children.length, 'top-level children')
        // Log all model UUIDs for debugging (only once)
        const modelIds: string[] = []
        scene.traverse((obj) => {
          if (obj.userData?.isModel || obj.userData?.isImportedModel) {
            modelIds.push(obj.uuid + ' (' + (obj.name || 'unnamed') + ')')
          }
        })
        if (modelIds.length > 0) {
          console.log('[HotspotsPanel] Available model IDs:', modelIds)
        }
      }
    } else {
      // Object was found - remove from missing cache if it was there
      missingObjectWarnings.current.delete(id)
    }
    
    return found
  }, [])

  // Update lines when objects move (animation loop)
  useEffect(() => {
    if (!viewer?.scene || hotspotLines.size === 0) return

    let animationFrameId: number
    const updateLines = () => {
      hotspotLines.forEach((line, hotspotId) => {
        const hotspot = hotspots.find(h => h.id === hotspotId)
        // Only update if we have a valid endpoint position (surface point)
        // This prevents lines from pointing to wrong locations (like object center at bottom)
        if (hotspot && hotspot.targetObjectId && hotspot.targetEndpointPosition) {
          // Use the stored surface endpoint position (not object center)
          const endpointPosition = new THREE.Vector3(
            hotspot.targetEndpointPosition.x,
            hotspot.targetEndpointPosition.y,
            hotspot.targetEndpointPosition.z
          )
            
            const geometry = line.geometry as THREE.BufferGeometry
            const positions = geometry.attributes.position
            if (positions) {
            // Line connects from car surface (endpoint) to marker at top
            positions.setXYZ(0, endpointPosition.x, endpointPosition.y, endpointPosition.z)
            positions.setXYZ(1, hotspot.position.x, hotspot.position.y, hotspot.position.z)
              positions.needsUpdate = true
          }
        }
      })
      animationFrameId = requestAnimationFrame(updateLines)
    }
    
    animationFrameId = requestAnimationFrame(updateLines)
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [viewer?.scene, hotspotLines, hotspots, findObjectById])

  const cancelEdit = useCallback(() => {
    setEditingHotspotId(null)
    setHotspotName('')
    setContentData('')
    setLabelText('')
    setIconType('default')
    setIconValue('📍')
    setShowHotspotIcon(true)
    setContentType('text')
    setTextFormatting({
      fontFamily: 'Arial',
      fontSize: 16,
      color: '#e0e0e0',
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      backgroundColor: 'transparent',
      padding: 0
    })
    setPopupSettings({
      width: 800,
      height: 600,
      maxWidth: 90,
      maxHeight: 90,
      backgroundColor: '#1e1e1e',
      borderRadius: 8,
      showOnClick: false
    })
  }, [])
  
  const editHotspot = useCallback((hotspot: Hotspot) => {
    // Don't allow editing locked hotspots
    if (hotspot.locked) {
      alert('This hotspot is locked and cannot be edited. Unlock it first.')
      return
    }
    // Populate form with hotspot data for editing
    setEditingHotspotId(hotspot.id)
    setHotspotName(hotspot.name)
    setIconType(hotspot.icon?.type || 'default')
    setIconValue(hotspot.icon?.value || '📍')
    setShowHotspotIcon(hotspot.showIcon !== false)
    setLabelText(hotspot.label?.text || '')
    setLabelVisible(hotspot.label?.visible || 'always')
    setLabelFontSize(hotspot.label?.fontSize || 14)
    setLabelColor(hotspot.label?.color || '#ffffff')
    setLabelBackgroundColor(hotspot.label?.backgroundColor || 'rgba(0, 0, 0, 0.75)')
    // Load label border settings
    setLabelBorderWidth(hotspot.label?.borderWidth ?? 2)
    setLabelBorderColor(hotspot.label?.borderColor || '#00AAFF')
    setLabelBorderRadius(hotspot.label?.borderRadius ?? 6)
    setLabelWidthPixels(hotspot.label?.widthPixels ?? null)
    setLabelHeightPixels(hotspot.label?.heightPixels ?? null)
    // Load label position offsets
    setLabelOffsetX(hotspot.label?.offsetX ?? 0)
    setLabelOffsetY(hotspot.label?.offsetY ?? 0)
    // Load panel border settings
    setPanelBorderWidth(hotspot.panelBorder?.width ?? 2)
    setPanelBorderColor(hotspot.panelBorder?.color || '#00AAFF')
    setPanelBorderRadius(hotspot.panelBorder?.borderRadius ?? 12)
    // Load panel dimensions (in pixels) - only use user-specified dimensions from hotspot data
    // Do NOT read actualWidth/actualHeight from 3D panel - those are canvas dimensions (scaled up)
    const userWidth = hotspot.panelDimensions?.widthPixels ?? null
    const userHeight = hotspot.panelDimensions?.heightPixels ?? null
    
    setPanelWidthPixels(userWidth)
    setPanelHeightPixels(userHeight)
    setContentType(hotspot.content.type)
    setContentData(hotspot.content.data || '')
    
    // Properly handle text formatting with all fields
    const formatting = hotspot.content.formatting
    setTextFormatting({
      fontFamily: formatting?.fontFamily || 'Arial',
      fontSize: formatting?.fontSize || 16,
      color: formatting?.color || '#e0e0e0',
      bold: formatting?.bold || false,
      italic: formatting?.italic || false,
      underline: formatting?.underline || false,
      align: (formatting?.align === 'justify' ? 'left' : formatting?.align) || 'left',
      backgroundColor: formatting?.backgroundColor || 'transparent',
      padding: formatting?.padding || 0
    })
    
    // Properly handle popup settings with all fields
    const popup = hotspot.content.popupSettings
    setPopupSettings({
      width: popup?.width || 800,
      height: popup?.height || 600,
      maxWidth: popup?.maxWidth || 90,
      maxHeight: popup?.maxHeight || 90,
      backgroundColor: popup?.backgroundColor || '#1e1e1e',
      borderRadius: popup?.borderRadius || 8,
      showOnClick: popup?.showOnClick || false
    })
    
    // Select the hotspot marker in the viewer
    const marker = hotspotMarkers.get(hotspot.id)
    if (marker && viewer) {
      const { setSelectedObject } = useAppStore.getState()
      setSelectedObject(marker)
      console.log('[HotspotsPanel] Editing hotspot - selected marker:', hotspot.id)
    }
    
    // Scroll to add hotspot section
    setTimeout(() => {
      const addSection = document.querySelector('.add-hotspot-section')
      if (addSection) {
        addSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }, [hotspotMarkers, viewer])
  
  const addHotspot = useCallback(() => {
    if (editingHotspotId) {
      // Update existing hotspot (preserve position, targetObjectId, panelState, and targetEndpointPosition)
      setHotspots(prev => prev.map(h => 
        h.id === editingHotspotId
          ? {
              ...h,
              name: hotspotName || 'Untitled Hotspot',
              showIcon: showHotspotIcon,
              icon: iconType !== 'default' ? {
                type: iconType,
                value: iconValue
              } : undefined,
              label: labelText ? {
                text: labelText,
                visible: labelVisible,
                fontSize: labelFontSize,
                color: labelColor,
                backgroundColor: labelBackgroundColor,
                borderWidth: labelBorderWidth,
                borderColor: labelBorderColor,
                borderRadius: labelBorderRadius,
                widthPixels: labelWidthPixels,
                heightPixels: labelHeightPixels,
                offsetX: labelOffsetX,
                offsetY: labelOffsetY
              } : undefined,
              panelBorder: {
                width: panelBorderWidth,
                color: panelBorderColor,
                borderRadius: panelBorderRadius
              },
              panelDimensions: {
                widthPixels: panelWidthPixels,
                heightPixels: panelHeightPixels
              },
              content: {
                type: contentType,
                data: contentData,
                formatting: contentType === 'text' ? textFormatting : undefined,
                popupSettings: popupSettings
              },
              // Preserve existing fields that shouldn't be overwritten
              position: h.position,
              targetObjectId: h.targetObjectId,
              targetEndpointPosition: h.targetEndpointPosition,
              panelState: h.panelState
            }
          : h
      ))
      console.log('[HotspotsPanel] Updated hotspot:', editingHotspotId)
      cancelEdit()
      return
    }
    
    // Adding new hotspot - need selectedObject
    if (!viewer?.camera || !selectedObject || !viewer.scene) {
      alert('Please select an object first to place a hotspot')
      return
    }

    console.log('[HotspotsPanel] addHotspot called with selectedObject:', {
      uuid: selectedObject.uuid,
      name: selectedObject.name,
      type: selectedObject.type,
      position: selectedObject.position,
      hasParent: !!selectedObject.parent,
      parentType: selectedObject.parent?.type,
      userData: selectedObject.userData
    })

    // CRITICAL: Use the selectedObject directly (subobject/part), NOT the root model
    // This ensures hotspots are locked to the specific part clicked, not the entire model
    const targetObject = selectedObject
    
    console.log('[HotspotsPanel] Using selected object (subobject) directly:', {
      uuid: targetObject.uuid,
      name: targetObject.name,
      type: targetObject.type,
      isMesh: targetObject instanceof THREE.Mesh,
      isModel: targetObject.userData?.isModel,
      isImportedModel: targetObject.userData?.isImportedModel
    })

    // Calculate bounding box of the selected object (subobject) in world space
    // CRITICAL: For individual meshes, we need to use geometry bounding box and transform to world
    targetObject.updateMatrixWorld(true)
    
    let box = new THREE.Box3()
    let worldPosition = new THREE.Vector3()
    let size = new THREE.Vector3()
    
    // If it's a mesh, use its geometry bounding box (more accurate for subobjects)
    if (targetObject instanceof THREE.Mesh && targetObject.geometry) {
      const geometry = targetObject.geometry
      
      // Ensure geometry has a bounding box
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox()
      }
      
      if (geometry.boundingBox) {
        // Copy the local bounding box
        box.copy(geometry.boundingBox)
        // Transform to world space using the object's world matrix
        box.applyMatrix4(targetObject.matrixWorld)
        
        console.log('[HotspotsPanel] Using mesh geometry bounding box:', {
          localBox: geometry.boundingBox,
          worldBox: box,
          matrixWorld: targetObject.matrixWorld
        })
      } else {
        // Fallback to setFromObject if geometry bounding box fails
        box.setFromObject(targetObject)
      }
    } else {
      // For non-mesh objects, use setFromObject
      box.setFromObject(targetObject)
    }
    
    if (box.isEmpty()) {
      // Last resort: use object's world position
      targetObject.getWorldPosition(worldPosition)
      if (worldPosition.lengthSq() < 0.001) {
      alert('Could not calculate position for the selected object. Please try selecting a different part of the model.')
      return
      }
      // Create a small box around the position
      box.min.copy(worldPosition).subScalar(0.1)
      box.max.copy(worldPosition).addScalar(0.1)
    }
    
    // Get center and size in world space
    box.getCenter(worldPosition)
    box.getSize(size)
    
    // CRITICAL: Verify we got valid world coordinates
    if (!isFinite(worldPosition.x) || !isFinite(worldPosition.y) || !isFinite(worldPosition.z)) {
      console.error('[HotspotsPanel] Invalid world position calculated:', worldPosition)
      alert('Could not calculate valid position. The selected object may not be properly loaded.')
      return
    }
    
    // If position is at origin (0,0,0), try using the object's world position instead
    if (worldPosition.lengthSq() < 0.001) {
      console.warn('[HotspotsPanel] Bounding box center is at origin, using object world position instead')
      targetObject.getWorldPosition(worldPosition)
      
      // If still at origin, use the selected object's position directly
      if (worldPosition.lengthSq() < 0.001) {
        selectedObject.getWorldPosition(worldPosition)
        console.warn('[HotspotsPanel] Using selected object world position:', worldPosition)
      }
    }
    
    // Calculate surface position (top of bounding box - where line connects from)
    const surfacePosition = new THREE.Vector3(worldPosition.x, box.max.y, worldPosition.z)
    
    // Calculate top position for marker (above the surface)
    const topPosition = surfacePosition.clone()
    topPosition.y += 2.5 // Place marker 2.5 units above the surface
    
    // CRITICAL: Use the selected object's UUID (subobject), NOT the root model
    // This locks the hotspot to the specific part, not the entire model
    const targetObjectId = targetObject.uuid
    
    console.log('[HotspotsPanel] Creating hotspot locked to subobject:', {
      targetObjectUuid: targetObject.uuid,
      targetObjectName: targetObject.name,
      targetObjectId: targetObjectId,
      markerPosition: { x: topPosition.x, y: topPosition.y, z: topPosition.z },
      surfacePosition: { x: surfacePosition.x, y: surfacePosition.y, z: surfacePosition.z },
      boxSize: { x: size.x, y: size.y, z: size.z },
      boxMin: { x: box.min.x, y: box.min.y, z: box.min.z },
      boxMax: { x: box.max.x, y: box.max.y, z: box.max.z },
      isMesh: targetObject instanceof THREE.Mesh,
      hasGeometry: targetObject instanceof THREE.Mesh && !!targetObject.geometry,
      hasLabel: !!labelText,
      labelText: labelText
    })

    // Add new hotspot
    const defaultHotspotName = hotspotName || 'Untitled Hotspot'
    const newHotspot: Hotspot = {
      id: `hotspot-${Date.now()}`,
      name: defaultHotspotName,
      showIcon: showHotspotIcon,
      position: { x: topPosition.x, y: topPosition.y, z: topPosition.z },
      targetObjectId: targetObjectId,
      targetEndpointPosition: {
        x: surfacePosition.x,
        y: surfacePosition.y,
        z: surfacePosition.z
      },
      icon: iconType !== 'default' ? {
        type: iconType,
        value: iconValue
      } : undefined,
      // Always create a label with the hotspot name by default
      label: {
        text: labelText || defaultHotspotName,
        visible: labelVisible || 'always',
        fontSize: labelFontSize,
        color: labelColor,
        backgroundColor: labelBackgroundColor,
        borderWidth: labelBorderWidth,
        borderColor: labelBorderColor,
        borderRadius: labelBorderRadius
      },
      panelBorder: {
        width: panelBorderWidth,
        color: panelBorderColor,
        borderRadius: panelBorderRadius
      },
      panelState: 'open', // Default to open so user can see the panel immediately
      content: {
        type: contentType,
        data: contentData,
        formatting: contentType === 'text' ? textFormatting : undefined,
        popupSettings: popupSettings
      }
    }
    
    setHotspots(prev => [...prev, newHotspot])
    console.log('[HotspotsPanel] Added hotspot:', newHotspot)
    
    // Clear form
    setHotspotName('')
    setContentData('')
    setLabelText('')
    setIconType('default')
    setIconValue('📍')
    setShowIconPicker(false)
  }, [viewer, selectedObject, hotspotName, iconType, iconValue, labelText, labelVisible, labelFontSize, labelColor, labelBackgroundColor, labelBorderWidth, labelBorderColor, labelBorderRadius, panelBorderWidth, panelBorderColor, panelBorderRadius, contentType, contentData, textFormatting, popupSettings, editingHotspotId, cancelEdit])

  const deleteHotspot = useCallback((id: string) => {
    // Check if hotspot is locked
    const hotspot = hotspots.find(h => h.id === id)
    if (hotspot?.locked) {
      alert('This hotspot is locked and cannot be deleted. Unlock it first.')
      return
    }
    
    // If deleting the hotspot being edited, cancel edit first
    if (editingHotspotId === id) {
      cancelEdit()
    }
    
    setHotspots(prev => {
      const filtered = prev.filter(h => h.id !== id)
      console.log('[HotspotsPanel] Deleted hotspot:', id, 'Remaining:', filtered.length)
      return filtered
    })
    // Marker cleanup is handled by useEffect when hotspots change
  }, [editingHotspotId, cancelEdit, hotspots])

  const cleanupAllHotspots = useCallback(() => {
    if (window.confirm(`Are you sure you want to delete all ${hotspots.length} hotspots? This cannot be undone.`)) {
      if (!viewer?.scene) return
      
      // Cancel any active edit
      if (editingHotspotId) {
        cancelEdit()
      }
      
      // Traverse scene directly to find and remove ALL hotspot-related objects
      // This is more reliable than using state which might be stale
      const objectsToRemove: THREE.Object3D[] = []
      
      viewer.scene.traverse((obj) => {
        if (obj.userData.isHotspotMarker ||
            obj.userData.isHotspotLine ||
            obj.userData.isHotspotLabel ||
            obj.userData.isHotspotPanel ||
            obj.userData.isHotspotEndpoint ||
            obj.userData.hotspotId) {
          objectsToRemove.push(obj)
        }
      })
      
      // Remove all found objects and dispose their resources
      objectsToRemove.forEach((obj) => {
        try {
          // Remove from parent
          if (obj.parent) {
            obj.parent.remove(obj)
          } else {
            viewer.scene.remove(obj)
          }
          
          // Dispose materials and textures
          if (obj instanceof THREE.Sprite && obj.material) {
            const mat = obj.material as THREE.SpriteMaterial
            if (mat.map) mat.map.dispose()
            mat.dispose()
          } else if (obj instanceof THREE.Mesh && obj.material) {
            const mat = obj.material as THREE.Material
            if (mat instanceof THREE.MeshBasicMaterial && mat.map) {
              mat.map.dispose()
            }
            mat.dispose()
            if (obj.geometry) obj.geometry.dispose()
          } else if (obj instanceof THREE.Line && obj.material) {
            const mat = obj.material as THREE.Material
            mat.dispose()
            if (obj.geometry) obj.geometry.dispose()
          } else if (obj instanceof THREE.Group) {
            // Dispose all children
            obj.traverse((child) => {
              if (child instanceof THREE.Sprite && child.material) {
                const mat = child.material as THREE.SpriteMaterial
                if (mat.map) mat.map.dispose()
                mat.dispose()
              } else if (child instanceof THREE.Mesh && child.material) {
                const mat = child.material as THREE.Material
                if (mat instanceof THREE.MeshBasicMaterial && mat.map) {
                  mat.map.dispose()
                }
                mat.dispose()
                if (child.geometry) child.geometry.dispose()
              }
            })
          }
        } catch (e) {
          console.warn('[HotspotsPanel] Error removing hotspot object:', obj, e)
        }
      })
      
      console.log('[HotspotsPanel] Removed', objectsToRemove.length, 'hotspot objects from scene')
      
      // Clean up all video resources
      cleanupAllVideoResources()
      
      // Clear all state
      setHotspots([])
      setHotspotMarkers(new Map())
      setHotspotLines(new Map())
      setHotspotLabels(new Map())
      setHotspotPanels(new Map())
      setHotspotEndpoints(new Map())
      setEndpointsVisible(new Map())
      setActiveHotspot(null)
      setHoveredHotspotId(null)
      setExpandedHotspotId(null)
      // Exit place pin mode if active
      setPlacePinMode(false)
      
      // Clear global references
      ;(window as any).__hotspots = []
      
      // Double-check: traverse scene one more time to catch any missed objects
      const remainingObjects: THREE.Object3D[] = []
      viewer.scene.traverse((obj) => {
        if (obj.userData.isHotspotMarker ||
            obj.userData.isHotspotLine ||
            obj.userData.isHotspotLabel ||
            obj.userData.isHotspotPanel ||
            obj.userData.isHotspotEndpoint ||
            obj.userData.hotspotId) {
          remainingObjects.push(obj)
        }
      })
      
      // Remove any remaining objects
      remainingObjects.forEach((obj) => {
        try {
          // Clean up CSS3D panels
          if (obj.userData.isCSS3DPanel) {
            const divElement = obj.userData.divElement as HTMLDivElement | undefined
            const iframeElement = obj.userData.iframeElement as HTMLIFrameElement | undefined
            
            if (iframeElement) {
              iframeElement.src = ''
              if (iframeElement.parentNode) {
                iframeElement.parentNode.removeChild(iframeElement)
              }
            }
            if (divElement && divElement.parentNode) {
              divElement.parentNode.removeChild(divElement)
            }
          } else if (obj instanceof THREE.Mesh && obj.material) {
            // Clean up video resources for regular panels
            const material = obj.material as THREE.MeshBasicMaterial
            const canvas = material.map?.image as HTMLCanvasElement | undefined
            if (canvas && (canvas as any).__videoId) {
              cleanupVideoResourcesForCanvas(canvas)
            }
          }
          
          if (obj.parent) {
            obj.parent.remove(obj)
          } else {
            viewer.scene.remove(obj)
          }
        } catch (e) {
          console.warn('[HotspotsPanel] Error removing remaining object:', e)
        }
      })
      
      if (remainingObjects.length > 0) {
        console.log('[HotspotsPanel] Removed', remainingObjects.length, 'additional hotspot objects')
      }
      
      // Force a render to update the scene
      if (viewer.renderer) {
        viewer.renderer.render(viewer.scene, viewer.camera)
      }
      
      console.log('[HotspotsPanel] All hotspots and 3D objects cleaned up')
    }
  }, [hotspots.length, editingHotspotId, cancelEdit, viewer])
  
  const toggleHotspotExpanded = useCallback((id: string) => {
    setExpandedHotspotId(prev => prev === id ? null : id)
  }, [])
  
  const resetEndpointToObjectCenter = useCallback((hotspot: Hotspot) => {
    if (!hotspot.targetObjectId || !viewer) return
    
    const targetObject = findObjectById(viewer.scene, hotspot.targetObjectId)
    if (targetObject) {
      setHotspots(prev => prev.map(h => 
        h.id === hotspot.id 
          ? { ...h, targetEndpointPosition: undefined } // Reset to undefined to use object center
          : h
      ))
      
      console.log('[HotspotsPanel] Reset endpoint to object center for hotspot:', hotspot.id)
    }
  }, [viewer])
  
  const updateEndpointPosition = useCallback((hotspotId: string, axis: 'x' | 'y' | 'z', value: number) => {
    setHotspots(prev => prev.map(h => {
      if (h.id === hotspotId) {
        const currentPos = h.targetEndpointPosition || { x: 0, y: 0, z: 0 }
        return {
          ...h,
          targetEndpointPosition: { ...currentPos, [axis]: value }
        }
      }
      return h
    }))
  }, [])
  
  const toggleEndpointVisibility = useCallback((hotspotId: string) => {
    setEndpointsVisible(prev => {
      const newMap = new Map(prev)
      newMap.set(hotspotId, !newMap.get(hotspotId))
      return newMap
    })
    
    // Update actual endpoint mesh visibility
    const endpoint = hotspotEndpoints.get(hotspotId)
    if (endpoint) {
      endpoint.visible = !endpointsVisible.get(hotspotId)
    }
  }, [hotspotEndpoints, endpointsVisible])
  
  const selectEndpointInViewer = useCallback((hotspotId: string) => {
    const endpoint = hotspotEndpoints.get(hotspotId)
    if (endpoint && viewer) {
      const { setSelectedObject } = useAppStore.getState()
      setSelectedObject(endpoint)
      console.log('[HotspotsPanel] Selected endpoint in viewer:', hotspotId)
    }
  }, [hotspotEndpoints, viewer])

  if (!showHotspotsPanel) {
    return null
  }

  return (
    <div
      ref={panelRef}
      className={`hotspots-panel ${dragging ? 'dragging' : ''}`}
      style={{
        top: `${panelTop}px`,
        left: `${panelLeft}px`,
        maxHeight: `${maxHeight}px`,
        right: 'auto' // Ensure left positioning is used, not right
      }}
    >
      <div className="hotspots-panel-header" onMouseDown={handleMouseDown}>
        <h3>Hotspots</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => {
              setPlaceHotspotMode(!placeHotspotMode)
              if (placePinMode) setPlacePinMode(false) // Disable old mode if active
            }}
            className={`place-hotspot-button ${placeHotspotMode ? 'active' : ''}`}
            title={placeHotspotMode ? 'Exit hotspot placement mode (hover over parts to highlight, click to place)' : 'Enter hotspot placement mode (hover over parts to highlight, click to place)'}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              background: placeHotspotMode ? '#4a9eff' : 'rgba(255, 255, 255, 0.1)',
              border: `1px solid ${placeHotspotMode ? '#4a9eff' : 'rgba(255, 255, 255, 0.2)'}`,
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🎯 {placeHotspotMode ? 'Placing...' : 'Place Hotspot'}
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="minimize-button"
            title={isMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            {isMinimized ? '□' : '−'}
          </button>
        <button 
          className="close-button" 
          onClick={toggleHotspotsPanel} 
          title="Close panel"
          style={{
            color: xButtonColor,
            fontSize: `${xButtonSize}px`,
            width: `${xButtonSize + 8}px`,
            height: `${xButtonSize + 8}px`
          }}
        >
          ×
        </button>
        </div>
      </div>

      {!isMinimized && (
      <div className="hotspots-panel-content">
        {placeHotspotMode && (
          <div style={{
            padding: '12px',
            marginBottom: '12px',
            background: 'rgba(74, 158, 255, 0.2)',
            border: '1px solid #4a9eff',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '13px',
            textAlign: 'center'
          }}>
            🎯 <strong>Hotspot Placement Mode Active</strong><br/>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>Move mouse over car parts to highlight them. Click on a highlighted part to place hotspot.</span>
          </div>
        )}
        {placePinMode && (
          <div style={{
            padding: '12px',
            marginBottom: '12px',
            background: 'rgba(74, 158, 255, 0.2)',
            border: '1px solid #4a9eff',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '13px',
            textAlign: 'center'
          }}>
            📍 <strong>Pin Placement Mode Active (Legacy)</strong><br/>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>Click anywhere on the model to place a pin</span>
          </div>
        )}
        <div className="hotspots-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0 }}>Existing Hotspots ({hotspots.length})</h4>
            {hotspots.length > 0 && (
              <button
                onClick={cleanupAllHotspots}
                className="button-secondary"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'rgba(255, 68, 68, 0.2)',
                  border: '1px solid rgba(255, 68, 68, 0.5)',
                  color: '#ff6b6b',
                  cursor: 'pointer'
                }}
                title="Remove all hotspots"
              >
                🗑️ Clear All
              </button>
            )}
          </div>
          {hotspots.length === 0 ? (
            <p className="empty-message">No hotspots yet. Add one below.</p>
          ) : (
            <div className="hotspots-items">
              {hotspots.map((hotspot) => {
                const isExpanded = expandedHotspotId === hotspot.id
                const hasEndpoint = hotspot.targetObjectId !== undefined
                const endpointVisible = endpointsVisible.get(hotspot.id) !== false // Default to true
                const endpoint = hotspotEndpoints.get(hotspot.id)
                const endpointPos = hotspot.targetEndpointPosition || { x: 0, y: 0, z: 0 }
                
                return (
                  <div key={hotspot.id} className="hotspot-item">
                    <div className="hotspot-header" onClick={() => toggleHotspotExpanded(hotspot.id)}>
                      <div className="hotspot-info">
                        <div className="hotspot-name">{hotspot.name}</div>
                        <div className="hotspot-type">{hotspot.content.type}</div>
                      </div>
                      <div className="hotspot-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setHotspots(prev => prev.map(h => 
                              h.id === hotspot.id 
                                ? { ...h, locked: !h.locked }
                                : h
                            ))
                          }}
                          className="button-icon"
                          title={hotspot.locked ? "Unlock hotspot" : "Lock hotspot"}
                          style={{ 
                            fontSize: '14px', 
                            padding: '4px 8px',
                            opacity: hotspot.locked ? 1 : 0.6,
                            color: hotspot.locked ? '#ffd700' : '#fff'
                          }}
                        >
                          {hotspot.locked ? '🔒' : '🔓'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!hotspot.locked) {
                              editHotspot(hotspot)
                            }
                          }}
                          className="button-icon"
                          title={hotspot.locked ? "Hotspot is locked" : "Edit hotspot"}
                          disabled={hotspot.locked}
                          style={{ 
                            fontSize: '14px', 
                            padding: '4px 8px',
                            opacity: hotspot.locked ? 0.4 : 1,
                            cursor: hotspot.locked ? 'not-allowed' : 'pointer'
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleHotspotExpanded(hotspot.id)
                          }}
                          className="expand-button"
                          title={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!hotspot.locked) {
                              deleteHotspot(hotspot.id)
                            }
                          }}
                          className="delete-button"
                          title={hotspot.locked ? "Hotspot is locked" : "Delete hotspot"}
                          disabled={hotspot.locked}
                          style={{
                            opacity: hotspot.locked ? 0.4 : 1,
                            cursor: hotspot.locked ? 'not-allowed' : 'pointer',
                            color: xButtonColor,
                            fontSize: `${xButtonSize}px`,
                            width: `${xButtonSize + 8}px`,
                            height: `${xButtonSize + 8}px`
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="hotspot-details">
                        {/* Endpoint Controls */}
                        {hasEndpoint && (
                          <div className="endpoint-controls" style={{ 
                            marginTop: '12px', 
                            padding: '12px', 
                            background: '#2a2a2a', 
                            borderRadius: '6px',
                            border: '1px solid #3a3a3a'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                              <h5 style={{ margin: 0, fontSize: '13px', color: '#fff' }}>Line Endpoint</h5>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => toggleEndpointVisibility(hotspot.id)}
                                  className="button-icon"
                                  title={endpointVisible ? "Hide endpoint" : "Show endpoint"}
                                  style={{ fontSize: '14px', padding: '4px 8px' }}
                                >
                                  {endpointVisible ? '👁️' : '👁️‍🗨️'}
                                </button>
                                <button
                                  onClick={() => selectEndpointInViewer(hotspot.id)}
                                  className="button-icon"
                                  title="Select endpoint in viewer"
                                  style={{ fontSize: '14px', padding: '4px 8px' }}
                                >
                                  🎯
                                </button>
                                <button
                                  onClick={() => resetEndpointToObjectCenter(hotspot)}
                                  className="button-icon"
                                  title="Reset to object center"
                                  style={{ fontSize: '14px', padding: '4px 8px' }}
                                >
                                  ↺
                                </button>
                              </div>
                            </div>
                            
                            <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px', marginTop: '0' }}>
                              Adjust where the line connects to the target object. You can drag the blue sphere in the viewer or use inputs below.
                            </p>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px' }}>
                                <span style={{ color: '#aaa', marginBottom: '4px' }}>X</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={endpointPos.x.toFixed(2)}
                                  onChange={(e) => updateEndpointPosition(hotspot.id, 'x', parseFloat(e.target.value) || 0)}
                                  style={{ 
                                    padding: '6px', 
                                    background: '#1a1a1a', 
                                    border: '1px solid #3a3a3a',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    fontSize: '12px'
                                  }}
                                />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px' }}>
                                <span style={{ color: '#aaa', marginBottom: '4px' }}>Y</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={endpointPos.y.toFixed(2)}
                                  onChange={(e) => updateEndpointPosition(hotspot.id, 'y', parseFloat(e.target.value) || 0)}
                                  style={{ 
                                    padding: '6px', 
                                    background: '#1a1a1a', 
                                    border: '1px solid #3a3a3a',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    fontSize: '12px'
                                  }}
                                />
                              </label>
                              <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px' }}>
                                <span style={{ color: '#aaa', marginBottom: '4px' }}>Z</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={endpointPos.z.toFixed(2)}
                                  onChange={(e) => updateEndpointPosition(hotspot.id, 'z', parseFloat(e.target.value) || 0)}
                                  style={{ 
                                    padding: '6px', 
                                    background: '#1a1a1a', 
                                    border: '1px solid #3a3a3a',
                                    borderRadius: '4px',
                                    color: '#fff',
                                    fontSize: '12px'
                                  }}
                                />
                              </label>
                            </div>
                            
                            {endpoint && (
                              <p style={{ fontSize: '10px', color: '#666', marginTop: '8px', marginBottom: '0' }}>
                                Endpoint visible in viewer: {endpoint.visible ? 'Yes' : 'No'}
                              </p>
                            )}
                          </div>
                        )}
                        
                        {!hasEndpoint && (
                          <div style={{ marginTop: '12px', padding: '12px', background: '#2a2a2a', borderRadius: '6px', fontSize: '11px', color: '#888' }}>
                            No target object - endpoint controls unavailable
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="add-hotspot-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0 }}>
              {editingHotspotId ? (
                <span style={{ color: '#4a9eff' }}>✏️ Editing: {hotspots.find(h => h.id === editingHotspotId)?.name || 'Hotspot'}</span>
              ) : (
                <span>➕ Add New Hotspot</span>
              )}
            </h4>
            {editingHotspotId && (
              <button
                onClick={() => {
                  cancelEdit()
                }}
                className="button-secondary"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: 'rgba(74, 158, 255, 0.2)',
                  border: '1px solid #4a9eff',
                  color: '#4a9eff',
                  cursor: 'pointer'
                }}
                title="Start creating a new hotspot"
              >
                ➕ New Hotspot
              </button>
            )}
          </div>
          {editingHotspotId && (
            <div style={{
              padding: '8px 12px',
              marginBottom: '12px',
              background: 'rgba(74, 158, 255, 0.15)',
              border: '1px solid #4a9eff',
              borderRadius: '6px',
              color: '#4a9eff',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🔵</span>
              <span>You are currently <strong>editing</strong> an existing hotspot. Click "New Hotspot" to start creating a new one.</span>
            </div>
          )}
          {!editingHotspotId && !selectedObject && (
            <p className="warning-message">⚠️ Please select an object first to place a hotspot</p>
          )}

          <label>
            <span>Hotspot Name</span>
            <input
              type="text"
              value={hotspotName}
              onChange={(e) => setHotspotName(e.target.value)}
              placeholder="e.g., Main Entrance Info"
            />
          </label>

          <label>
            <span>Icon</span>
            <div className="icon-selector">
              <select 
                value={iconType} 
                onChange={(e) => {
                  setIconType(e.target.value as any)
                  if (e.target.value === 'emoji') {
                    setIconValue('📍')
                  }
                }}
              >
                <option value="default">Default Pin</option>
                <option value="emoji">Emoji</option>
                <option value="custom-image">Custom Image</option>
              </select>
              
              {iconType === 'emoji' && (
                <div className="emoji-picker-container">
                  <button
                    type="button"
                    className="emoji-picker-button"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                  >
                    {iconValue || '📍'} Choose Emoji
                  </button>
                  {showIconPicker && (
                    <div className="emoji-picker">
                      <div className="emoji-picker-header">
                        <h5>Popular Icons</h5>
                        <button
                          type="button"
                          className="emoji-picker-close"
                          onClick={() => setShowIconPicker(false)}
                        >
                          ×
                        </button>
                      </div>
                      <div className="emoji-grid">
                        {Object.entries(HOTSPOT_ICON_TYPES).map(([key, { emoji, label }]) => (
                          <button
                            key={key}
                            type="button"
                            className={`emoji-item ${iconValue === emoji ? 'selected' : ''}`}
                            onClick={() => {
                              setIconValue(emoji)
                              setShowIconPicker(false)
                            }}
                            title={label}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className="emoji-picker-header">
                        <h5>More Emojis</h5>
                      </div>
                      <div className="emoji-grid">
                        {POPULAR_EMOJIS.filter(emoji => 
                          !Object.values(HOTSPOT_ICON_TYPES).some(({ emoji: e }) => e === emoji)
                        ).map((emoji, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`emoji-item ${iconValue === emoji ? 'selected' : ''}`}
                            onClick={() => {
                              setIconValue(emoji)
                              setShowIconPicker(false)
                            }}
                            title={emoji}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className="emoji-picker-custom">
                        <input
                          type="text"
                          placeholder="Or type emoji here..."
                          value={iconValue}
                          onChange={(e) => setIconValue(e.target.value)}
                          maxLength={2}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {iconType === 'custom-image' && (
                <input
                  type="text"
                  value={iconValue}
                  onChange={(e) => setIconValue(e.target.value)}
                  placeholder="Enter image URL..."
                />
              )}
            </div>
          </label>

          <label className="checkbox-label" style={{ marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={showHotspotIcon}
              onChange={(e) => setShowHotspotIcon(e.target.checked)}
            />
            <span>Show 3D hotspot icon (viewer & web export)</span>
          </label>

          <label>
            <span>Floating Label (3D Viewer)</span>
            <div className="label-controls">
              <input
                type="text"
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                placeholder="e.g., Main Entrance (shown in 3D viewer)"
              />
              <select
                value={labelVisible}
                onChange={(e) => setLabelVisible(e.target.value as any)}
                style={{ marginTop: '8px' }}
              >
                <option value="always">Always Visible</option>
                <option value="hover">Show on Hover</option>
                <option value="click">Show on Click</option>
              </select>
              <div className="label-formatting" style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Font Size</span>
                    <input
                      type="number"
                      min="10"
                      max="48"
                      value={labelFontSize}
                      onChange={(e) => setLabelFontSize(parseInt(e.target.value) || 14)}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Text Color</span>
                    <input
                      type="color"
                      value={labelColor}
                      onChange={(e) => setLabelColor(e.target.value)}
                    />
                  </label>
                  <label className="formatting-label" style={{ minWidth: '100px' }}>
                    <span>Background</span>
                    <input
                      type="color"
                      value={labelBackgroundColor.includes('rgba') 
                        ? `#${(() => {
                            const match = labelBackgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                            if (match) {
                              const r = parseInt(match[1]).toString(16).padStart(2, '0');
                              const g = parseInt(match[2]).toString(16).padStart(2, '0');
                              const b = parseInt(match[3]).toString(16).padStart(2, '0');
                              return r + g + b;
                            }
                            return '000000';
                          })()}`
                        : labelBackgroundColor.replace('#', '') || '#000000'}
                      onChange={(e) => {
                        const rgb = e.target.value
                        const r = parseInt(rgb.slice(1, 3), 16)
                        const g = parseInt(rgb.slice(3, 5), 16)
                        const b = parseInt(rgb.slice(5, 7), 16)
                        setLabelBackgroundColor(`rgba(${r}, ${g}, ${b}, 0.75)`)
                      }}
                    />
                  </label>
                </div>
                {/* Label Dimensions */}
                <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                  <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#aaa' }}>Label Dimensions (Pixels)</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="formatting-label" style={{ minWidth: '100px' }}>
                      <span>Width</span>
                      <input
                        type="number"
                        min="0"
                        max="2000"
                        step="10"
                        value={labelWidthPixels || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null
                          setLabelWidthPixels(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    label: h.label ? {
                                      ...h.label,
                                      widthPixels: val,
                                      heightPixels: h.label.heightPixels ?? null
                                    } : undefined
                                  }
                                : h
                            ))
                          }
                        }}
                        placeholder="Auto"
                        style={{ width: '100%' }}
                      />
                      <small style={{ fontSize: '10px', color: '#888' }}>Pixels (empty = auto)</small>
                    </label>
                    <label className="formatting-label" style={{ minWidth: '100px' }}>
                      <span>Height</span>
                      <input
                        type="number"
                        min="0"
                        max="2000"
                        step="10"
                        value={labelHeightPixels || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null
                          setLabelHeightPixels(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    label: h.label ? {
                                      ...h.label,
                                      widthPixels: h.label.widthPixels ?? null,
                                      heightPixels: val
                                    } : undefined
                                  }
                                : h
                            ))
                          }
                        }}
                        placeholder="Auto"
                        style={{ width: '100%' }}
                      />
                      <small style={{ fontSize: '10px', color: '#888' }}>Pixels (empty = auto)</small>
                    </label>
                  </div>
                </div>
                {/* Label Border Controls - Always visible */}
                <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                  <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#aaa' }}>Label Border (Top)</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="formatting-label" style={{ minWidth: '80px' }}>
                      <span>Border Width</span>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={labelBorderWidth}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setLabelBorderWidth(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    label: h.label ? {
                                      ...h.label,
                                      borderWidth: val,
                                      borderColor: h.label.borderColor ?? labelBorderColor,
                                      borderRadius: h.label.borderRadius ?? labelBorderRadius
                                    } : {
                                      text: '',
                                      visible: 'always' as const,
                                      borderWidth: val,
                                      borderColor: labelBorderColor,
                                      borderRadius: labelBorderRadius
                                    }
                                  }
                                : h
                            ))
                          }
                        }}
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label className="formatting-label" style={{ minWidth: '80px' }}>
                      <span>Border Color</span>
                      <input
                        type="color"
                        value={labelBorderColor}
                        onChange={(e) => {
                          const val = e.target.value
                          setLabelBorderColor(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    label: h.label ? {
                                      ...h.label,
                                      borderWidth: h.label.borderWidth ?? labelBorderWidth,
                                      borderColor: val,
                                      borderRadius: h.label.borderRadius ?? labelBorderRadius
                                    } : {
                                      text: '',
                                      visible: 'always' as const,
                                      borderWidth: labelBorderWidth,
                                      borderColor: val,
                                      borderRadius: labelBorderRadius
                                    }
                                  }
                                : h
                            ))
                          }
                        }}
                      />
                    </label>
                    <label className="formatting-label" style={{ minWidth: '80px' }}>
                      <span>Border Radius</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="1"
                        value={labelBorderRadius}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setLabelBorderRadius(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    label: h.label ? {
                                      ...h.label,
                                      borderWidth: h.label.borderWidth ?? labelBorderWidth,
                                      borderColor: h.label.borderColor ?? labelBorderColor,
                                      borderRadius: val
                                    } : {
                                      text: '',
                                      visible: 'always' as const,
                                      borderWidth: labelBorderWidth,
                                      borderColor: labelBorderColor,
                                      borderRadius: val
                                    }
                                  }
                                : h
                            ))
                          }
                        }}
                        style={{ width: '100%' }}
                      />
                    </label>
                  </div>
                </div>
                {/* Label Position */}
                <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                  <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#aaa' }}>Label Position (3D Units)</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="formatting-label" style={{ minWidth: '100px' }}>
                      <span>Horizontal (X)</span>
                      <input
                        type="number"
                        min="-10"
                        max="10"
                        step="0.1"
                        value={labelOffsetX}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setLabelOffsetX(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    label: h.label ? {
                                      ...h.label,
                                      offsetX: val,
                                      offsetY: h.label.offsetY ?? labelOffsetY
                                    } : {
                                      text: '',
                                      visible: 'always' as const,
                                      offsetX: val,
                                      offsetY: labelOffsetY
                                    }
                                  }
                                : h
                            ))
                          }
                        }}
                        style={{ width: '100%' }}
                      />
                      <small style={{ fontSize: '10px', color: '#888' }}>3D units (negative = left, positive = right)</small>
                    </label>
                    <label className="formatting-label" style={{ minWidth: '100px' }}>
                      <span>Vertical (Y)</span>
                      <input
                        type="number"
                        min="-10"
                        max="10"
                        step="0.1"
                        value={labelOffsetY}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setLabelOffsetY(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    label: h.label ? {
                                      ...h.label,
                                      offsetX: h.label.offsetX ?? labelOffsetX,
                                      offsetY: val
                                    } : {
                                      text: '',
                                      visible: 'always' as const,
                                      offsetX: labelOffsetX,
                                      offsetY: val
                                    }
                                  }
                                : h
                            ))
                          }
                        }}
                        style={{ width: '100%' }}
                      />
                      <small style={{ fontSize: '10px', color: '#888' }}>3D units (negative = down, positive = up)</small>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </label>

          <label>
            <span>Content Type</span>
            <select value={contentType} onChange={(e) => setContentType(e.target.value as any)}>
              <option value="text">Text</option>
              <option value="html">HTML</option>
              <option value="image">Image</option>
              <option value="youtube">YouTube Video</option>
              <option value="video">Local Video</option>
              <option value="interactive">Interactive Content</option>
            </select>
          </label>

          {/* Preview Panel Toggle - shows/hides the 3D panel for preview */}
          {editingHotspotId && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#2a2a2a',
              borderRadius: '6px',
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '13px', color: '#ccc' }}>Preview Panel in 3D</span>
              <button
                type="button"
                onClick={() => {
                  const currentHotspot = hotspots.find(h => h.id === editingHotspotId)
                  if (currentHotspot) {
                    const newState = (currentHotspot.panelState === 'open' ? 'closed' : 'open') as 'open' | 'closed'
                    setHotspots(prev => {
                      const updated = prev.map(h => 
                        h.id === editingHotspotId ? { ...h, panelState: newState } : h
                      )
                      saveHotspotsToStorage(updated)
                      return updated
                    })
                  }
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: hotspots.find(h => h.id === editingHotspotId)?.panelState === 'open' ? '#4CAF50' : '#555',
                  color: '#fff',
                  fontWeight: 500
                }}
              >
                {hotspots.find(h => h.id === editingHotspotId)?.panelState === 'open' ? '👁️ Visible' : '👁️‍🗨️ Hidden'}
              </button>
            </div>
          )}

          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {contentType === 'text' && 'Text Content'}
                {contentType === 'html' && 'HTML Code'}
                {contentType === 'image' && 'Image URL'}
                {contentType === 'youtube' && 'YouTube Video ID or URL'}
                {contentType === 'video' && 'Video URL'}
                {contentType === 'interactive' && 'Interactive Content URL'}
              </span>
              {contentType === 'text' && (
                <button
                  type="button"
                  className="formatting-toggle"
                  onClick={() => setShowFormatting(!showFormatting)}
                  title="Text Formatting"
                >
                  <span style={{ fontFamily: textFormatting.fontFamily, fontWeight: textFormatting.bold ? 'bold' : 'normal', fontStyle: textFormatting.italic ? 'italic' : 'normal', textDecoration: textFormatting.underline ? 'underline' : 'none' }}>Aa</span>
                </button>
              )}
            </div>
            {contentType === 'text' && showFormatting && (
              <div className="text-formatting-panel">
                <div className="formatting-row">
                  <label className="formatting-label">
                    <span>Font</span>
                    <select
                      value={textFormatting.fontFamily}
                      onChange={(e) => setTextFormatting({ ...textFormatting, fontFamily: e.target.value })}
                    >
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Palatino">Palatino</option>
                      <option value="Garamond">Garamond</option>
                      <option value="Comic Sans MS">Comic Sans MS</option>
                      <option value="Trebuchet MS">Trebuchet MS</option>
                    </select>
                  </label>
                  <label className="formatting-label">
                    <span>Size</span>
                    <input
                      type="number"
                      min="8"
                      max="72"
                      value={textFormatting.fontSize}
                      onChange={(e) => setTextFormatting({ ...textFormatting, fontSize: parseInt(e.target.value) || 16 })}
                    />
                  </label>
                  <label className="formatting-label">
                    <span>Color</span>
                    <input
                      type="color"
                      value={textFormatting.color}
                      onChange={(e) => setTextFormatting({ ...textFormatting, color: e.target.value })}
                    />
                  </label>
                </div>
                <div className="formatting-row">
                  <button
                    type="button"
                    className={`formatting-button ${textFormatting.bold ? 'active' : ''}`}
                    onClick={() => setTextFormatting({ ...textFormatting, bold: !textFormatting.bold })}
                    title="Bold"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    className={`formatting-button ${textFormatting.italic ? 'active' : ''}`}
                    onClick={() => setTextFormatting({ ...textFormatting, italic: !textFormatting.italic })}
                    title="Italic"
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    className={`formatting-button ${textFormatting.underline ? 'active' : ''}`}
                    onClick={() => setTextFormatting({ ...textFormatting, underline: !textFormatting.underline })}
                    title="Underline"
                  >
                    <u>U</u>
                  </button>
                  <label className="formatting-label">
                    <span>Align</span>
                    <select
                      value={textFormatting.align}
                      onChange={(e) => setTextFormatting({ ...textFormatting, align: e.target.value as any })}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                      <option value="justify">Justify</option>
                    </select>
                  </label>
                </div>
                <div className="formatting-row">
                  <label className="formatting-label">
                    <span>Background</span>
                    <input
                      type="color"
                      value={textFormatting.backgroundColor === 'transparent' ? '#000000' : textFormatting.backgroundColor}
                      onChange={(e) => setTextFormatting({ ...textFormatting, backgroundColor: e.target.value })}
                    />
                    <button
                      type="button"
                      className="formatting-button"
                      onClick={() => setTextFormatting({ ...textFormatting, backgroundColor: 'transparent' })}
                      title="Clear Background"
                    >
                      Clear
                    </button>
                  </label>
                  <label className="formatting-label">
                    <span>Padding</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={textFormatting.padding}
                      onChange={(e) => setTextFormatting({ ...textFormatting, padding: parseInt(e.target.value) || 0 })}
                      style={{ width: '60px' }}
                    />
                    <span>px</span>
                  </label>
                </div>
              </div>
            )}
            <textarea
              value={contentData}
              onChange={(e) => {
                const val = e.target.value
                setContentData(val)
                // Trigger update immediately when editing - preserve formatting
                if (editingHotspotId) {
                  setHotspots(prev => prev.map(h => 
                    h.id === editingHotspotId
                      ? {
                          ...h,
                          content: {
                            ...h.content,
                            data: val,
                            // Preserve formatting when updating data
                            formatting: h.content.formatting || textFormatting
                          }
                        }
                      : h
                  ))
                }
              }}
              placeholder={
                contentType === 'text' ? 'Enter text content...' :
                contentType === 'html' ? 'Enter HTML code...' :
                contentType === 'youtube' ? 'Enter YouTube URL or ID' :
                'Enter URL...'
              }
              rows={contentType === 'html' ? 8 : 4}
              style={contentType === 'text' ? {
                fontFamily: textFormatting.fontFamily || 'Arial',
                // Cap preview font size to max 24px for UI readability (actual size still applies to 3D panel)
                fontSize: `${Math.min(textFormatting.fontSize || 16, 24)}px`,
                color: textFormatting.color || '#e0e0e0',
                fontWeight: textFormatting.bold ? 'bold' : 'normal',
                fontStyle: textFormatting.italic ? 'italic' : 'normal',
                textDecoration: textFormatting.underline ? 'underline' : 'none',
                textAlign: textFormatting.align || 'left',
                backgroundColor: textFormatting.backgroundColor !== 'transparent' ? textFormatting.backgroundColor : undefined,
                padding: textFormatting.padding > 0 ? `${textFormatting.padding}px` : undefined,
                // Prevent browser from auto-adjusting font size
                WebkitTextSizeAdjust: '100%',
                textSizeAdjust: '100%'
              } : contentType === 'html' ? {
                fontFamily: 'monospace',
                fontSize: '12px',
                backgroundColor: '#1a1a1a',
                color: '#fff'
              } : {}}
            />
          </label>

          {/* Panel Border Settings (Bottom - Video Panel) */}
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Panel Border (Bottom)</span>
              <button
                type="button"
                className="formatting-toggle"
                onClick={() => setShowPanelBorder(!showPanelBorder)}
                title="Panel Border Settings for Video/Content Panel"
              >
                {showPanelBorder ? '−' : '+'}
              </button>
            </div>
            {showPanelBorder && (
              <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#aaa' }}>Video/Content Panel Border</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Border Width</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={panelBorderWidth}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        setPanelBorderWidth(val)
                        // Trigger update immediately when editing
                        if (editingHotspotId) {
                          setHotspots(prev => prev.map(h => 
                            h.id === editingHotspotId
                              ? {
                                  ...h,
                                  panelBorder: {
                                    width: val,
                                    color: h.panelBorder?.color ?? panelBorderColor,
                                    borderRadius: h.panelBorder?.borderRadius ?? panelBorderRadius
                                  }
                                }
                              : h
                          ))
                        }
                      }}
                      style={{ width: '100%' }}
                    />
                  </label>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Border Color</span>
                    <input
                      type="color"
                      value={panelBorderColor}
                      onChange={(e) => {
                        const val = e.target.value
                        setPanelBorderColor(val)
                        // Trigger update immediately when editing
                        if (editingHotspotId) {
                          setHotspots(prev => prev.map(h => 
                            h.id === editingHotspotId
                              ? {
                                  ...h,
                                  panelBorder: {
                                    width: h.panelBorder?.width ?? panelBorderWidth,
                                    color: val,
                                    borderRadius: h.panelBorder?.borderRadius ?? panelBorderRadius
                                  }
                                }
                              : h
                          ))
                        }
                      }}
                    />
                  </label>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Border Radius</span>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="1"
                      value={panelBorderRadius}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        setPanelBorderRadius(val)
                        // Trigger update immediately when editing
                        if (editingHotspotId) {
                          setHotspots(prev => prev.map(h => 
                            h.id === editingHotspotId
                              ? {
                                  ...h,
                                  panelBorder: {
                                    width: h.panelBorder?.width ?? panelBorderWidth,
                                    color: h.panelBorder?.color ?? panelBorderColor,
                                    borderRadius: val
                                  }
                                }
                              : h
                          ))
                        }
                      }}
                      style={{ width: '100%' }}
                    />
                  </label>
                </div>
                {/* Panel Dimensions */}
                <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                  <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#aaa' }}>Panel Dimensions (Pixels)</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <label className="formatting-label" style={{ minWidth: '100px' }}>
                      <span>Width</span>
                      <input
                        type="number"
                        min="0"
                        max="5000"
                        step="10"
                        value={panelWidthPixels || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null
                          setPanelWidthPixels(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    panelDimensions: {
                                      widthPixels: val,
                                      heightPixels: h.panelDimensions?.heightPixels ?? null
                                    }
                                  }
                                : h
                            ))
                          }
                        }}
                        placeholder="Auto"
                        style={{ width: '100%' }}
                      />
                      <small style={{ fontSize: '10px', color: '#888' }}>
                        {panelWidthPixels ? `${panelWidthPixels}px` : 'Auto (calculated from content)'}
                      </small>
                    </label>
                    <label className="formatting-label" style={{ minWidth: '100px' }}>
                      <span>Height</span>
                      <input
                        type="number"
                        min="0"
                        max="5000"
                        step="10"
                        value={panelHeightPixels || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null
                          setPanelHeightPixels(val)
                          // Trigger update immediately when editing
                          if (editingHotspotId) {
                            setHotspots(prev => prev.map(h => 
                              h.id === editingHotspotId
                                ? {
                                    ...h,
                                    panelDimensions: {
                                      widthPixels: h.panelDimensions?.widthPixels ?? null,
                                      heightPixels: val
                                    }
                                  }
                                : h
                            ))
                          }
                        }}
                        placeholder="Auto"
                        style={{ width: '100%' }}
                      />
                      <small style={{ fontSize: '10px', color: '#888' }}>
                        {panelHeightPixels ? `${panelHeightPixels}px` : 'Auto (calculated from content)'}
                      </small>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </label>

          {/* Close Button (X) Settings */}
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Close Button (X)</span>
              <button
                type="button"
                className="formatting-toggle"
                onClick={() => setShowCloseButtonSettings(!showCloseButtonSettings)}
                title="Close Button Settings"
              >
                {showCloseButtonSettings ? '−' : '+'}
              </button>
            </div>
            {showCloseButtonSettings && (
              <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: '#aaa' }}>Close Button Appearance</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Size</span>
                    <input
                      type="number"
                      min="16"
                      max="64"
                      step="2"
                      value={xButtonSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 28
                        setXButtonSize(val)
                      }}
                      style={{ width: '100%' }}
                    />
                    <small style={{ fontSize: '10px', color: '#888' }}>{xButtonSize}px</small>
                  </label>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Color</span>
                    <input
                      type="color"
                      value={xButtonColor.startsWith('rgba') ? '#ff0000' : xButtonColor}
                      onChange={(e) => {
                        const val = e.target.value
                        setXButtonColor(val)
                      }}
                    />
                  </label>
                  <label className="formatting-label" style={{ minWidth: '80px' }}>
                    <span>Opacity</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      defaultValue="0.9"
                      onChange={(e) => {
                        const opacity = parseFloat(e.target.value)
                        // Get current color and apply opacity
                        const currentColor = xButtonColor.startsWith('rgba') ? '#ff0000' : xButtonColor
                        const hex = currentColor.replace('#', '')
                        const r = parseInt(hex.substring(0, 2), 16)
                        const g = parseInt(hex.substring(2, 4), 16)
                        const b = parseInt(hex.substring(4, 6), 16)
                        setXButtonColor(`rgba(${r}, ${g}, ${b}, ${opacity})`)
                      }}
                      style={{ width: '100%' }}
                    />
                  </label>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="button-secondary"
                    style={{ flex: 1, padding: '6px', fontSize: '11px' }}
                    onClick={() => {
                      setXButtonColor('rgba(255, 0, 0, 0.9)')
                      setXButtonSize(28)
                    }}
                  >
                    Reset to Default
                  </button>
                </div>
                <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>Preview:</span>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: `${xButtonSize}px`,
                    height: `${xButtonSize}px`,
                    borderRadius: '50%',
                    backgroundColor: xButtonColor,
                    marginLeft: '12px',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: `${xButtonSize * 0.5}px`,
                    lineHeight: 1
                  }}>
                    ×
                  </div>
                </div>
              </div>
            )}
          </label>

          {/* Popup Settings */}
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Popup Settings</span>
              <button
                type="button"
                className="formatting-toggle"
                onClick={() => setShowPopupSettings(!showPopupSettings)}
                title="Popup Window Settings"
              >
                ⚙️
              </button>
            </div>
            {showPopupSettings && (
              <div className="text-formatting-panel" style={{ marginTop: '8px' }}>
                <div className="formatting-row">
                  <label className="formatting-label">
                    <span>Width</span>
                    <input
                      type="number"
                      min="300"
                      max="2000"
                      value={popupSettings.width}
                      onChange={(e) => setPopupSettings({ ...popupSettings, width: parseInt(e.target.value) || 800 })}
                      style={{ width: '80px' }}
                    />
                    <span>px</span>
                  </label>
                  <label className="formatting-label">
                    <span>Height</span>
                    <input
                      type="number"
                      min="200"
                      max="2000"
                      value={popupSettings.height}
                      onChange={(e) => setPopupSettings({ ...popupSettings, height: parseInt(e.target.value) || 600 })}
                      style={{ width: '80px' }}
                    />
                    <span>px</span>
                  </label>
                </div>
                <div className="formatting-row">
                  <label className="formatting-label">
                    <span>Max Width</span>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      value={popupSettings.maxWidth}
                      onChange={(e) => setPopupSettings({ ...popupSettings, maxWidth: parseInt(e.target.value) || 90 })}
                      style={{ width: '60px' }}
                    />
                    <span>%</span>
                  </label>
                  <label className="formatting-label">
                    <span>Max Height</span>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      value={popupSettings.maxHeight}
                      onChange={(e) => setPopupSettings({ ...popupSettings, maxHeight: parseInt(e.target.value) || 90 })}
                      style={{ width: '60px' }}
                    />
                    <span>%</span>
                  </label>
                </div>
                <div className="formatting-row">
                  <label className="formatting-label">
                    <span>Background</span>
                    <input
                      type="color"
                      value={popupSettings.backgroundColor}
                      onChange={(e) => setPopupSettings({ ...popupSettings, backgroundColor: e.target.value })}
                    />
                  </label>
                  <label className="formatting-label">
                    <span>Border Radius</span>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={popupSettings.borderRadius}
                      onChange={(e) => setPopupSettings({ ...popupSettings, borderRadius: parseInt(e.target.value) || 8 })}
                      style={{ width: '60px' }}
                    />
                    <span>px</span>
                  </label>
                </div>
                <div className="formatting-row">
                  <label className="formatting-label" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={popupSettings.showOnClick}
                      onChange={(e) => setPopupSettings({ ...popupSettings, showOnClick: e.target.checked })}
                    />
                    <span>Show popup on label click</span>
                  </label>
                </div>
              </div>
            )}
          </label>

          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            {editingHotspotId && (
              <>
                <button
                  onClick={cancelEdit}
                  className="button-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    cancelEdit()
                  }}
                  className="button-secondary"
                  style={{ 
                    flex: 1,
                    background: 'rgba(74, 158, 255, 0.2)',
                    border: '1px solid #4a9eff',
                    color: '#4a9eff'
                  }}
                  title="Start creating a new hotspot"
                >
                  ➕ New Hotspot
                </button>
              </>
            )}
            <button
              onClick={addHotspot}
              disabled={!selectedObject && !editingHotspotId}
              className="add-button"
              style={{ flex: editingHotspotId ? 1 : 'none' }}
            >
              {editingHotspotId ? '💾 Save Changes' : '➕ Add Hotspot'}
            </button>
          </div>
        </div>

      </div>
      )}

      <HotspotPopup hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />
    </div>
  )
}

