// OSM Buildings System
// Fetches and renders 3D buildings from OpenStreetMap data

import * as THREE from 'three'
import { createHotspotLabelSprite } from '../../utils/hotspotLabel'

export interface OSMBuildingOptions {
  centerLat: number
  centerLon: number
  zoom: number
  gridSize: number
  groundSize: number
  enabled?: boolean
  buildingColor?: string
  buildingOpacity?: number
  minHeight?: number // Minimum building height in meters
  maxHeight?: number // Maximum building height in meters
  defaultHeight?: number // Default height if not specified (in meters)
  defaultLevels?: number // Default building levels if height not specified
  metersPerLevel?: number // Height per building level (default 3 meters)
}

export interface OSMBuildingResult {
  buildingsGroup: THREE.Group
  dispose: () => void
  update: (options: Partial<OSMBuildingOptions>) => Promise<void>
}

interface BuildingFeature {
  type: 'Feature'
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
  properties: {
    height?: number | string
    'building:levels'?: number | string
    building?: string
    [key: string]: any
  }
}

interface GeoJSONResponse {
  type: 'FeatureCollection'
  features: BuildingFeature[]
}

/**
 * Convert lat/lon to meters (approximate)
 */
function latLonToMeters(lat: number, lon: number, centerLat: number, centerLon: number): { x: number; z: number } {
  // At equator, 1 degree ≈ 111,320 meters
  const metersPerDegreeLat = 111320
  const metersPerDegreeLon = 111320 * Math.cos(centerLat * Math.PI / 180)
  
  const x = (lon - centerLon) * metersPerDegreeLon
  const z = (lat - centerLat) * metersPerDegreeLat
  
  return { x, z }
}

/**
 * Parse building height from properties
 */
function parseBuildingHeight(
  properties: BuildingFeature['properties'],
  defaultHeight: number,
  defaultLevels: number,
  metersPerLevel: number
): number {
  // Try to get height directly
  if (properties.height) {
    const height = typeof properties.height === 'string' ? parseFloat(properties.height) : properties.height
    if (!isNaN(height) && height > 0) {
      return height
    }
  }
  
  // Try to get building levels
  if (properties['building:levels']) {
    const levels = typeof properties['building:levels'] === 'string' 
      ? parseFloat(properties['building:levels']) 
      : properties['building:levels']
    if (!isNaN(levels) && levels > 0) {
      return levels * metersPerLevel
    }
  }
  
  return defaultHeight
}

/**
 * Extract building name from properties
 */
function getBuildingName(properties: BuildingFeature['properties']): string | null {
  // Try different name properties in order of preference
  const nameKeys = ['name', 'name:en', 'addr:housenumber', 'addr:street', 'addr:full', 'addr:housename']
  
  for (const key of nameKeys) {
    if (properties[key] && typeof properties[key] === 'string' && properties[key].trim().length > 0) {
      return properties[key].trim()
    }
  }
  
  // Try building type as fallback
  if (properties.building && typeof properties.building === 'string') {
    const buildingType = properties.building.trim()
    // Don't use generic building types like "yes", "commercial", etc.
    if (buildingType && buildingType !== 'yes' && buildingType.length > 2) {
      return buildingType.charAt(0).toUpperCase() + buildingType.slice(1)
    }
  }
  
  return null
}

/**
 * Calculate center position of polygon
 */
function getPolygonCenter(
  coordinates: number[][],
  height: number,
  centerLat: number,
  centerLon: number
): THREE.Vector3 {
  let sumX = 0
  let sumZ = 0
  
  for (const coord of coordinates) {
    const point = latLonToMeters(coord[1], coord[0], centerLat, centerLon)
    sumX += point.x
    sumZ += point.z
  }
  
  const centerX = sumX / coordinates.length
  const centerZ = sumZ / coordinates.length
  const centerY = height + 2 // Position label slightly above building
  
  return new THREE.Vector3(centerX, centerY, centerZ)
}

/**
 * Create building mesh from polygon coordinates
 */
/**
 * Get building style based on building type from OSM tags
 */
function getBuildingStyle(buildingType: string): { color: number; roughness: number; metalness: number } {
  const styles: Record<string, { color: number; roughness: number; metalness: number }> = {
    'residential': { color: 0x888888, roughness: 0.85, metalness: 0.0 },
    'commercial': { color: 0x777777, roughness: 0.75, metalness: 0.05 },
    'industrial': { color: 0x666666, roughness: 0.9, metalness: 0.1 },
    'retail': { color: 0x7a7a7a, roughness: 0.7, metalness: 0.0 },
    'office': { color: 0x808080, roughness: 0.65, metalness: 0.05 },
    'school': { color: 0x8a8a8a, roughness: 0.8, metalness: 0.0 },
    'hospital': { color: 0x858585, roughness: 0.7, metalness: 0.0 },
    'church': { color: 0x7d7d7d, roughness: 0.75, metalness: 0.0 },
    'warehouse': { color: 0x6a6a6a, roughness: 0.95, metalness: 0.15 },
    'garage': { color: 0x5a5a5a, roughness: 0.9, metalness: 0.1 },
    'parking': { color: 0x555555, roughness: 0.95, metalness: 0.2 },
    'hotel': { color: 0x7f7f7f, roughness: 0.75, metalness: 0.0 },
    'apartments': { color: 0x828282, roughness: 0.8, metalness: 0.0 },
    'house': { color: 0x868686, roughness: 0.85, metalness: 0.0 },
    'default': { color: 0x777777, roughness: 0.8, metalness: 0.0 }
  }
  return styles[buildingType.toLowerCase()] || styles.default
}

/**
 * Add slight color variation to buildings for more realistic appearance
 */
function addBuildingColorVariation(baseColor: THREE.Color, seed: number = 0): THREE.Color {
  const color = baseColor.clone()
  // Small variation (±3% in each channel) for realism
  const variation = (Math.sin(seed * 12.9898) * 0.03 + 1.0)
  color.r = Math.max(0, Math.min(1, color.r * variation))
  color.g = Math.max(0, Math.min(1, color.g * variation))
  color.b = Math.max(0, Math.min(1, color.b * variation))
  return color
}

function createBuildingMesh(
  coordinates: number[][],
  height: number,
  color: THREE.Color,
  opacity: number,
  centerLat: number,
  centerLon: number,
  properties?: BuildingFeature['properties']
): THREE.Mesh | null {
  if (!coordinates || coordinates.length < 3) return null
  
  // Convert lat/lon coordinates to 3D positions
  // GeoJSON coordinates are [longitude, latitude]
  const shape = new THREE.Shape()
  const firstPoint = latLonToMeters(coordinates[0][1], coordinates[0][0], centerLat, centerLon)
  shape.moveTo(firstPoint.x, firstPoint.z)
  
  for (let i = 1; i < coordinates.length; i++) {
    // coordinates[i] is [lon, lat]
    const point = latLonToMeters(coordinates[i][1], coordinates[i][0], centerLat, centerLon)
    shape.lineTo(point.x, point.z)
  }
  
  // Extrude the shape to create 3D building
  const extrudeSettings = {
    depth: height,
    bevelEnabled: false
  }
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  geometry.rotateX(-Math.PI / 2) // Rotate to lay flat on ground
  geometry.translate(0, height / 2, 0) // Position base at y=0
  
  // Get building type from properties
  const buildingType = properties?.building || 'default'
  const style = getBuildingStyle(buildingType)
  
  // Use building type color if available, otherwise use provided color
  const baseColor = new THREE.Color(style.color)
  
  // Add color variation based on building position for realism
  const buildingSeed = coordinates[0][0] + coordinates[0][1] // Use coordinates as seed
  const finalColor = addBuildingColorVariation(baseColor, buildingSeed)
  
  // Enhanced PBR material with proper properties
  const material = new THREE.MeshStandardMaterial({
    color: finalColor,
    opacity,
    transparent: opacity < 1.0,
    roughness: style.roughness, // Varied by building type
    metalness: style.metalness, // Slight metalness for some building types
    flatShading: false,
    side: THREE.FrontSide,
    envMapIntensity: 0.3, // Subtle environment reflection
    // Ensure material supports shadows
    shadowSide: THREE.FrontSide
  })
  
  const mesh = new THREE.Mesh(geometry, material)
  
  // CRITICAL: Ensure shadows are enabled
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false // Prevent disappearing when looking up
  
  // Store building metadata
  mesh.userData.isOSMBuilding = true
  mesh.userData.buildingType = buildingType
  mesh.userData.buildingHeight = height
  
  return mesh
}

/**
 * Fetch building data from OSM Buildings GeoJSON tiles
 */
async function fetchBuildingData(
  centerLat: number,
  centerLon: number,
  zoom: number,
  gridSize: number
): Promise<BuildingFeature[]> {
  console.log('[OSMBuildings] Fetching building data using Overpass API...', {
    centerLat,
    centerLon,
    zoom,
    gridSize
  })
  
  // Calculate bounding box from center and zoom
  // At zoom 15, one tile covers ~0.01 degrees
  const degreesPerTile = 360 / Math.pow(2, zoom)
  const latSpan = degreesPerTile * gridSize
  const lonSpan = degreesPerTile * gridSize
  
  const bbox = {
    south: centerLat - latSpan / 2,
    north: centerLat + latSpan / 2,
    west: centerLon - lonSpan / 2,
    east: centerLon + lonSpan / 2
  }
  
  console.log('[OSMBuildings] Bounding box:', bbox)
  
  // Use Overpass API to fetch building data
  // This is more reliable than the tile service and works for all locations
  const query = `[out:json][timeout:25];
(
  way["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["building"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["building:part"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out body;
>;
out skel qt;`
  
  // Use Overpass Turbo API (public instance)
  const overpassUrl = 'https://overpass-api.de/api/interpreter'
  
  try {
    console.log('[OSMBuildings] Sending request to Overpass API...')
    const { fetchJSON } = await import('../../utils/networkUtils')
    
    const data = await fetchJSON<any>(overpassUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`
    }, {
      maxRetries: 2,
      retryDelay: 3000,
      timeout: 30000, // 30 second timeout for Overpass (can be slow)
    })
    console.log('[OSMBuildings] Overpass API response received', {
      elementCount: data.elements?.length || 0
    })
    
    // Convert Overpass API response to GeoJSON-like format
    // Overpass returns nodes and ways separately - we need to index nodes first
    const nodes: Record<number, [number, number]> = {}
    const ways: Array<{ id: number; nodes: number[]; tags: any }> = []
    
    // First pass: index all nodes
    if (data.elements) {
      for (const element of data.elements) {
        if (element.type === 'node' && element.lat !== undefined && element.lon !== undefined) {
          nodes[element.id] = [element.lon, element.lat] // GeoJSON format: [lon, lat]
        } else if (element.type === 'way' && element.tags) {
          // Include both buildings and building:parts
          if (element.tags.building || element.tags['building:part']) {
            ways.push({
              id: element.id,
              nodes: element.nodes || [],
              tags: element.tags
            })
          }
        } else if (element.type === 'relation' && element.tags && element.tags.building) {
          // Handle building relations (multi-part buildings)
          if (element.members) {
            for (const member of element.members) {
              if (member.type === 'way' && member.role === 'outer') {
                // Find the way element
                const wayElement = data.elements.find((e: any) => e.type === 'way' && e.id === member.ref)
                if (wayElement && wayElement.nodes) {
                  ways.push({
                    id: wayElement.id,
                    nodes: wayElement.nodes,
                    tags: { ...element.tags, ...wayElement.tags }
                  })
                }
              }
            }
          }
        }
      }
    }
    
    // Second pass: convert ways to features
    const features: BuildingFeature[] = []
    for (const way of ways) {
      if (!way.nodes || way.nodes.length < 3) continue
      
      // Get coordinates for all nodes in this way
      const coordinates = way.nodes
        .map((nodeId: number) => nodes[nodeId])
        .filter((coord): coord is [number, number] => coord !== undefined)
      
      if (coordinates.length < 3) continue
      
      // Close the polygon if not already closed
      const first = coordinates[0]
      const last = coordinates[coordinates.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coordinates.push([first[0], first[1]])
      }
      
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        },
        properties: way.tags || {}
      })
    }
    
    console.log('[OSMBuildings] Converted to GeoJSON features:', {
      featureCount: features.length,
      nodeCount: Object.keys(nodes).length,
      wayCount: ways.length
    })
    return features
    
  } catch (error) {
    console.warn('[OSMBuildings] Overpass API failed, trying tile service fallback:', error)
    // Fallback to tile service
    return await fetchBuildingDataFromTiles(centerLat, centerLon, zoom, gridSize)
  }
}

/**
 * Fallback: Fetch building data from OSM Buildings tile service
 */
async function fetchBuildingDataFromTiles(
  centerLat: number,
  centerLon: number,
  zoom: number,
  gridSize: number
): Promise<BuildingFeature[]> {
  console.log('[OSMBuildings] Using tile service fallback...')
  
  // Get center tile coordinates
  const n = Math.pow(2, zoom)
  const centerTileX = Math.floor((centerLon + 180) / 360 * n)
  const latRad = centerLat * Math.PI / 180
  const centerTileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  
  // Calculate tile range
  const offset = Math.floor(gridSize / 2)
  const startX = centerTileX - offset
  const startY = centerTileY - offset
  
  const allFeatures: BuildingFeature[] = []
  const fetchPromises: Promise<void>[] = []
  
  // Fetch tiles from OSM Buildings data service
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const tileX = startX + i
      const tileY = startY + j
      const tileZ = Math.min(zoom, 18) // Cap at zoom 18 for data availability
      
      // Use OSM Buildings GeoJSON tile service
      const subdomain = ['a', 'b', 'c'][(tileX + tileY) % 3]
      const url = `https://${subdomain}.data.osmbuildings.org/0.2/anonymous/tile/${tileZ}/${tileX}/${tileY}.json`
      
      fetchPromises.push(
        fetch(url)
          .then(response => {
            if (!response.ok) {
              return
            }
            return response.json()
          })
          .then((data: GeoJSONResponse | undefined) => {
            if (data && data.features) {
              const buildingFeatures = data.features.filter(
                feature => feature.properties.building || feature.properties['building:part']
              )
              allFeatures.push(...buildingFeatures)
            }
          })
          .catch(() => {
            // Silently fail for network errors or missing tiles
          })
      )
    }
  }
  
  await Promise.all(fetchPromises)
  console.log('[OSMBuildings] Tile service returned', allFeatures.length, 'features')
  return allFeatures
}

/**
 * Create OSM Buildings
 */
export async function createOSMBuildings(
  scene: THREE.Scene,
  options: OSMBuildingOptions
): Promise<OSMBuildingResult> {
  const {
    centerLat,
    centerLon,
    zoom,
    gridSize,
    groundSize,
    enabled = true,
    buildingColor = '#cccccc',
    buildingOpacity = 0.9,
    minHeight = 3,
    maxHeight = 200,
    defaultHeight = 6,
    defaultLevels = 2,
    metersPerLevel = 3
  } = options
  
  if (!enabled) {
    // Return empty group if disabled
    const emptyGroup = new THREE.Group()
    emptyGroup.name = 'OSM_Buildings'
    return {
      buildingsGroup: emptyGroup,
      dispose: () => {},
      update: async () => {}
    }
  }
  
  try {
    console.log(`[OSMBuildings] Fetching building data for zoom ${zoom}...`, {
      centerLat,
      centerLon,
      zoom,
      gridSize,
      note: 'Fetching from OSM Buildings API - this may take a few seconds'
    })
    const features = await fetchBuildingData(centerLat, centerLon, zoom, gridSize)
    console.log(`[OSMBuildings] Loaded ${features.length} building features`, {
      featureCount: features.length,
      note: features.length === 0 ? 'No building data found for this location. Try a different location (e.g., city center).' : 'Building data loaded successfully'
    })
    
    const buildingsGroup = new THREE.Group()
    buildingsGroup.name = 'OSM_Buildings'
    
    const color = new THREE.Color(buildingColor)
    let buildingCount = 0
    
    // Process each building feature
    for (const feature of features) {
      const height = Math.max(
        minHeight,
        Math.min(
          maxHeight,
          parseBuildingHeight(feature.properties, defaultHeight, defaultLevels, metersPerLevel)
        )
      )
      
      const buildingName = getBuildingName(feature.properties)
      
      if (feature.geometry.type === 'Polygon') {
        const coordinates = feature.geometry.coordinates[0] as number[][]
        const mesh = createBuildingMesh(coordinates, height, color, buildingOpacity, centerLat, centerLon, feature.properties)
        if (mesh) {
          buildingsGroup.add(mesh)
          buildingCount++
          
          // Add label if building has a name and is tall enough to display
          if (buildingName && height >= 5) {
            const labelPosition = getPolygonCenter(coordinates, height, centerLat, centerLon)
            const labelSprite = createHotspotLabelSprite(labelPosition, buildingName, {
              fontSize: 16,
              fontFamily: 'Arial, sans-serif',
              color: '#ffffff',
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              offsetY: 0
            })
            labelSprite.scale.setScalar(3) // Larger scale for building labels
            labelSprite.userData.isOSMBuildingLabel = true
            buildingsGroup.add(labelSprite)
          }
        }
      } else if (feature.geometry.type === 'MultiPolygon') {
        // Handle multi-polygon buildings (buildings with courtyards, etc.)
        // For MultiPolygon, use the first polygon for the center position
        let firstPolygon: number[][] | null = null
        
        for (const polygon of feature.geometry.coordinates) {
          const coordinates = polygon[0] as number[][]
          if (!firstPolygon) {
            firstPolygon = coordinates
          }
          const mesh = createBuildingMesh(coordinates, height, color, buildingOpacity, centerLat, centerLon, feature.properties)
          if (mesh) {
            buildingsGroup.add(mesh)
            buildingCount++
          }
        }
        
        // Add label if building has a name and is tall enough
        if (buildingName && height >= 5 && firstPolygon) {
          const labelPosition = getPolygonCenter(firstPolygon, height, centerLat, centerLon)
          const labelSprite = createHotspotLabelSprite(labelPosition, buildingName, {
            fontSize: 16,
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            offsetY: 0
          })
          labelSprite.scale.setScalar(3) // Larger scale for building labels
          labelSprite.userData.isOSMBuildingLabel = true
          buildingsGroup.add(labelSprite)
        }
      }
    }
    
    console.log(`[OSMBuildings] Created ${buildingCount} building meshes`, {
      buildingCount,
      hasBuildings: buildingCount > 0,
      note: buildingCount === 0 ? 'No buildings were created. This location may not have building data in OSM.' : 'Buildings added to scene successfully'
    })
    
    if (buildingCount > 0) {
      scene.add(buildingsGroup)
      console.log('[OSMBuildings] ✅ Buildings group added to scene', {
        groupName: buildingsGroup.name,
        childrenCount: buildingsGroup.children.length
      })
      
      // Apply environment map to all building materials if scene has one
      if (scene.environment) {
        let envMapApplied = 0
        buildingsGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            if (!child.material.envMap || child.material.envMap !== scene.environment) {
              child.material.envMap = scene.environment
              child.material.envMapIntensity = child.material.envMapIntensity || 0.3
              child.material.needsUpdate = true
              envMapApplied++
            }
          }
        })
        if (envMapApplied > 0) {
          console.log(`[OSMBuildings] Applied environment map to ${envMapApplied} building materials`)
        }
      }
      
      // Verify shadows are enabled on renderer
      const renderer = (scene as any).__renderer as THREE.WebGLRenderer | undefined
      if (renderer) {
        if (!renderer.shadowMap.enabled) {
          console.warn('[OSMBuildings] ⚠️ Renderer shadows are disabled - enabling now')
          renderer.shadowMap.enabled = true
          renderer.shadowMap.type = THREE.PCFSoftShadowMap
        }
        console.log('[OSMBuildings] Shadow system status:', {
          rendererShadowsEnabled: renderer.shadowMap.enabled,
          shadowMapType: renderer.shadowMap.type
        })
      }
    } else {
      console.warn('[OSMBuildings] ⚠️ No buildings to add to scene - location may not have building data')
    }
    
    // Store configuration for updates
    let currentOptions = { ...options }
    
    const dispose = () => {
      buildingsGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) {
            child.material.dispose()
          }
        } else if (child instanceof THREE.Sprite) {
          // Dispose sprite materials and textures
          if (child.material instanceof THREE.SpriteMaterial) {
            if (child.material.map) {
              child.material.map.dispose()
            }
            child.material.dispose()
          }
        }
      })
      scene.remove(buildingsGroup)
    }
    
    const update = async (newOptions: Partial<OSMBuildingOptions>): Promise<void> => {
      dispose()
      const mergedOptions = { ...currentOptions, ...newOptions }
      const newResult = await createOSMBuildings(scene, mergedOptions)
      currentOptions = mergedOptions
      // Note: The new result will have its own update function
      // This is a recursive update that recreates the entire buildings layer
    }
    
    return {
      buildingsGroup,
      dispose,
      update
    }
  } catch (error) {
    console.error('[OSMBuildings] Error creating buildings:', error)
    // Return empty group on error
    const emptyGroup = new THREE.Group()
    emptyGroup.name = 'OSM_Buildings'
    return {
      buildingsGroup: emptyGroup,
      dispose: () => {},
      update: async () => {}
    }
  }
}

