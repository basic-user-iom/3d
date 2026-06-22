// Streets GL Ground Layer System
// Uses OSM tiles directly to create a ground plane where objects can be placed
// Also includes 3D buildings from OSM data

import * as THREE from 'three'
import { createOSMBuildings, type OSMBuildingOptions, type OSMBuildingResult } from './osmBuildings'

export interface StreetsGLGroundLayerOptions {
  enabled: boolean
  centerLat?: number
  centerLon?: number
  zoom?: number
  size: number // Size of the ground plane in world units
  opacity: number
  height: number // Y position of the ground (typically 0)
  receiveShadows: boolean
  layerType?: 'osm' | 'osm-humanitarian' | 'cartodb' | 'cartodb-dark' | 'satellite' | 'topo' | 'custom'
  gridSize?: number // Number of tiles in the grid
  customTexture?: string | File | HTMLImageElement | HTMLCanvasElement // Custom image/texture source
}

export interface StreetsGLGroundLayerResult {
  ground: THREE.Mesh
  buildingsGroup?: THREE.Group // 3D buildings from OSM
  dispose: () => void
  update: (options: Partial<StreetsGLGroundLayerOptions>) => Promise<void>
}

// Tile server configurations (same as OSM Ground Layer)
const TILE_SERVERS: Record<string, { template: string; subdomains: string[] }> = {
  'osm': {
    template: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c']
  },
  'osm-humanitarian': {
    template: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c']
  },
  'cartodb': {
    template: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd']
  },
  'cartodb-dark': {
    template: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd']
  },
  'satellite': {
    template: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: []
  },
  'topo': {
    template: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c']
  }
}

/**
 * Convert latitude/longitude to tile coordinates
 */
function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number; z: number } {
  const n = Math.pow(2, zoom)
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x, y, z: zoom }
}

/**
 * Get tile URL for layer type
 */
function getTileUrl(x: number, y: number, z: number, layerType: string): string {
  const config = TILE_SERVERS[layerType] || TILE_SERVERS['osm']
  let url = config.template
  
  // Replace subdomain if available
  if (config.subdomains.length > 0) {
    const subdomain = config.subdomains[(x + y) % config.subdomains.length]
    url = url.replace('{s}', subdomain)
  }
  
  // Some servers (like ESRI) use TMS format where Y is inverted
  let tileY = y
  if (layerType === 'satellite') {
    tileY = Math.pow(2, z) - 1 - y
  }
  
  // Replace tile coordinates
  url = url.replace('{z}', z.toString())
  url = url.replace('{x}', x.toString())
  url = url.replace('{y}', tileY.toString())
  
  return url
}

/**
 * Create a placeholder tile (gray with grid pattern) when a tile fails to load
 */
function createPlaceholderTile(x: number, y: number, z: number): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context for placeholder')
  }
  
  // Gray background
  ctx.fillStyle = '#cccccc'
  ctx.fillRect(0, 0, 256, 256)
  
  // Grid pattern
  ctx.strokeStyle = '#999999'
  ctx.lineWidth = 1
  for (let i = 0; i <= 8; i++) {
    const pos = (i * 256) / 8
    ctx.beginPath()
    ctx.moveTo(pos, 0)
    ctx.lineTo(pos, 256)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, pos)
    ctx.lineTo(256, pos)
    ctx.stroke()
  }
  
  // Add text indicating missing tile
  ctx.fillStyle = '#666666'
  ctx.font = '12px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('Tile unavailable', 128, 120)
  ctx.fillText(`${x}/${y}/${z}`, 128, 140)
  
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

/**
 * Load a map tile as a texture with fallback to placeholder on error
 */
function loadMapTile(x: number, y: number, z: number, layerType: string): Promise<{ texture: THREE.Texture; x: number; y: number; z: number; url: string; isPlaceholder: boolean }> {
  return new Promise((resolve) => {
    const url = getTileUrl(x, y, z, layerType)
    const textureLoader = new THREE.TextureLoader()
    
    textureLoader.load(
      url,
      (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        resolve({ texture, x, y, z, url, isPlaceholder: false })
      },
      undefined,
      (error) => {
        console.warn(`Failed to load tile ${x}/${y}/${z} (${url}), using placeholder:`, error)
        const placeholderTexture = createPlaceholderTile(x, y, z)
        resolve({ texture: placeholderTexture, x, y, z, url, isPlaceholder: true })
      }
    )
  })
}

/**
 * Load a custom texture from various sources
 */
async function loadCustomTexture(source: string | File | HTMLImageElement | HTMLCanvasElement): Promise<THREE.Texture> {
  if (source instanceof HTMLCanvasElement) {
    // Canvas element
    const texture = new THREE.CanvasTexture(source)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 16
    return texture
  } else if (source instanceof HTMLImageElement) {
    // Image element
    const texture = new THREE.Texture(source)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.needsUpdate = true
    texture.anisotropy = 16
    return texture
  } else if (source instanceof File) {
    // File object - create object URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const texture = new THREE.Texture(img)
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.needsUpdate = true
          texture.anisotropy = 16
          resolve(texture)
        }
        img.onerror = reject
        img.src = e.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(source)
    })
  } else {
    // URL string
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader()
      loader.load(
        source,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.anisotropy = 16
          resolve(texture)
        },
        undefined,
        reject
      )
    })
  }
}

/**
 * Create Streets GL Ground Layer using OSM tiles or custom texture
 */
export async function createStreetsGLGroundLayer(
  scene: THREE.Scene,
  options: StreetsGLGroundLayerOptions
): Promise<StreetsGLGroundLayerResult> {
  const {
    enabled = true,
    centerLat = 32.89917,
    centerLon = -97.03813,
    zoom = 15,
    size = 1000,
    opacity = 1.0,
    height = 0,
    receiveShadows = true,
    layerType = 'osm',
    gridSize = 3,
    customTexture
  } = options

  try {
    let combinedTexture: THREE.Texture
    let loadedTiles: Array<{ texture: THREE.Texture; x: number; y: number; z: number; url: string; isPlaceholder: boolean }> = []

    // If custom texture is provided, use it directly
    if (layerType === 'custom' && customTexture) {
      console.log('[StreetsGLGround] Loading custom texture...')
      combinedTexture = await loadCustomTexture(customTexture)
      console.log('[StreetsGLGround] Custom texture loaded successfully')
    } else {
      // Use OSM tiles - ensure we have valid coordinates
      if (centerLat === undefined || centerLon === undefined || zoom === undefined) {
        throw new Error('Latitude, longitude, and zoom are required for OSM tile layers')
      }
      
      // Get center tile
      const centerTile = latLonToTile(centerLat, centerLon, zoom)
    
    // Calculate grid offset (center the grid around center tile)
    const offset = Math.floor(gridSize / 2)
    const startX = centerTile.x - offset
    const startY = centerTile.y - offset

    // Load all tiles with their grid positions
    const tilePromises: Promise<{ texture: THREE.Texture; x: number; y: number; z: number; url: string; isPlaceholder: boolean }>[] = []
    const tilePositions: Array<{ gridX: number; gridY: number; tileX: number; tileY: number }> = []
    
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const tileX = startX + i
        const tileY = startY + j
        tilePositions.push({ gridX: i, gridY: j, tileX, tileY })
        tilePromises.push(loadMapTile(tileX, tileY, zoom, layerType))
      }
    }

    loadedTiles = await Promise.all(tilePromises)
    const placeholderCount = loadedTiles.filter(t => t.isPlaceholder).length
    const successCount = loadedTiles.length - placeholderCount
    console.log(`[StreetsGLGround] Loaded ${successCount} map tiles (${layerType})${placeholderCount > 0 ? `, ${placeholderCount} placeholder(s) used` : ''}`)

    // Create canvas to combine tiles
    const tileSize = 256 // OSM tiles are 256x256
    // Use resolution multiplier for better quality at higher zoom levels
    let resolutionMultiplier = 1
    if (zoom >= 18) {
      resolutionMultiplier = 8
    } else if (zoom >= 17) {
      resolutionMultiplier = 6
    } else if (zoom >= 16) {
      resolutionMultiplier = 4
    } else if (zoom >= 15) {
      resolutionMultiplier = 3
    } else if (zoom >= 14) {
      resolutionMultiplier = 2
    }
    
    const canvas = document.createElement('canvas')
    canvas.width = tileSize * gridSize * resolutionMultiplier
    canvas.height = tileSize * gridSize * resolutionMultiplier
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')
    
    // Set image smoothing for better quality
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Draw tiles onto canvas in correct positions
    const imagePromises = loadedTiles.map((tile, index) => {
      return new Promise<{ img: HTMLImageElement; pos: { gridX: number; gridY: number } }>((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const pos = tilePositions[index]
          resolve({ img, pos })
        }
        const textureImage = tile.texture.image as HTMLImageElement
        img.src = textureImage.src
      })
    })

    const images = await Promise.all(imagePromises)
    
    // Sort images by their grid position to ensure correct order
    images.sort((a, b) => {
      if (a.pos.gridY !== b.pos.gridY) {
        return a.pos.gridY - b.pos.gridY
      }
      return a.pos.gridX - b.pos.gridX
    })
    
    // Draw each tile at its correct position
    images.forEach((tileData) => {
      const { gridX, gridY } = tileData.pos
      const scaledTileSize = tileSize * resolutionMultiplier
      const x = gridX * scaledTileSize
      const y = gridY * scaledTileSize
      
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      
      // Draw tile at scaled size
      ctx.drawImage(
        tileData.img,
        0, 0, tileSize, tileSize, // Source: original tile size
        x, y, scaledTileSize, scaledTileSize // Destination: scaled size
      )
    })

    // Create texture from canvas with high-quality filtering
    combinedTexture = new THREE.CanvasTexture(canvas)
    combinedTexture.wrapS = THREE.ClampToEdgeWrapping
    combinedTexture.wrapT = THREE.ClampToEdgeWrapping
    combinedTexture.minFilter = THREE.LinearMipmapLinearFilter
    combinedTexture.magFilter = THREE.LinearFilter
    combinedTexture.generateMipmaps = true
    combinedTexture.flipY = false
    combinedTexture.colorSpace = THREE.SRGBColorSpace
    combinedTexture.anisotropy = 16
    combinedTexture.needsUpdate = true
    
    console.log(`[StreetsGLGround] Created texture at ${canvas.width}x${canvas.height} (${resolutionMultiplier}x resolution multiplier for zoom ${zoom})`)
    }

    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(size, size)
    const groundMaterial = new THREE.MeshStandardMaterial({
      map: combinedTexture,
      opacity,
      transparent: opacity < 1.0,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.DoubleSide
    })
    
    // For custom textures, adjust repeat if needed
    if (layerType === 'custom' && customTexture) {
      // Don't repeat custom textures by default - show full image
      combinedTexture.wrapS = THREE.ClampToEdgeWrapping
      combinedTexture.wrapT = THREE.ClampToEdgeWrapping
      combinedTexture.repeat.set(1, 1)
    }
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = height
    ground.receiveShadow = receiveShadows
    ground.castShadow = false
    ground.name = 'StreetsGLGround'
    
    // Store configuration for updates
    let currentOptions = { ...options, gridSize }
    let currentBuildingsResult: OSMBuildingResult | null = null

    // Dispose function
    const dispose = () => {
      if (ground.material.map) {
        ground.material.map.dispose()
      }
      // Only dispose OSM tiles if they were loaded
      if (loadedTiles.length > 0) {
        loadedTiles.forEach(tile => {
          if (tile.texture) {
            tile.texture.dispose()
          }
        })
      }
      ground.material.dispose()
      ground.geometry.dispose()
      scene.remove(ground)
    }

    // Add ground to scene if enabled
    if (enabled) {
      scene.add(ground)
    }

    // Create 3D buildings from OSM data
    let buildingsResult: OSMBuildingResult | null = null
    let buildingsGroup: THREE.Group | undefined = undefined
    
    try {
      console.log('[StreetsGLGround] Creating 3D buildings from OSM data...', {
        centerLat,
        centerLon,
        zoom,
        gridSize,
        groundSize: size,
        note: 'This may take a few seconds to fetch building data from OSM'
      })
      
      buildingsResult = await createOSMBuildings(scene, {
        centerLat,
        centerLon,
        zoom,
        gridSize,
        groundSize: size,
        enabled: true,
        buildingColor: '#cccccc',
        buildingOpacity: 1.0,
        defaultHeight: 6, // Default 6 meters if height not specified
        defaultLevels: 2, // Default 2 levels if levels not specified
        metersPerLevel: 3 // 3 meters per level
      })
      
      buildingsGroup = buildingsResult.buildingsGroup
      const buildingCount = buildingsGroup ? buildingsGroup.children.filter(child => child.userData?.isOSMBuilding).length : 0
      
      if (buildingCount > 0) {
        console.log('[StreetsGLGround] ✅ 3D buildings created successfully', {
          buildingCount,
          buildingsGroupName: buildingsGroup?.name,
          note: 'Buildings should now be visible in the scene'
        })
      } else {
        console.warn('[StreetsGLGround] ⚠️ No buildings found for this location', {
          centerLat,
          centerLon,
          zoom,
          note: 'This location may not have building data in OSM. Try a different location (e.g., city center).'
        })
      }
    } catch (error) {
      console.error('[StreetsGLGround] ❌ Failed to create 3D buildings:', error)
      console.warn('[StreetsGLGround] Continuing without buildings - ground layer will still work')
      // Continue without buildings - ground layer will still work
    }

    // Update dispose function to also dispose buildings
    const disposeWithBuildings = () => {
      dispose()
      if (buildingsResult) {
        buildingsResult.dispose()
      }
    }

    // Update function - properly typed to return Promise<void>
    const update = async (newOptions: Partial<StreetsGLGroundLayerOptions>): Promise<void> => {
      disposeWithBuildings()
      const mergedOptions = { ...currentOptions, ...newOptions }
      const newResult = await createStreetsGLGroundLayer(scene, mergedOptions)
      currentOptions = mergedOptions
      // Note: The new result will have its own update function
      // This is a recursive update that recreates the entire layer
    }

    return {
      ground,
      buildingsGroup,
      dispose: disposeWithBuildings,
      update
    }
  } catch (error) {
    console.error('[StreetsGLGround] Error creating ground layer:', error)
    throw error
  }
}
