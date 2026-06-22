/**
 * Map Coordinate Utilities
 * Converts between geographic coordinates (lat/lon) and Streets GL Web Mercator coordinates
 * Streets GL uses Web Mercator projection (EPSG:3857) - same as OpenStreetMap tiles
 */

import * as THREE from 'three'

/**
 * Convert latitude/longitude to Web Mercator meters (EPSG:3857)
 * This is the EXACT same projection Streets GL uses for tiles and buildings
 * 
 * @param lat Latitude in degrees (-90 to 90)
 * @param lon Longitude in degrees (-180 to 180)
 * @returns Web Mercator position in meters {x, y} where x is east-west, y is north-south
 */
export function latLonToWebMercator(lat: number, lon: number): { x: number; y: number } {
  // Web Mercator projection (EPSG:3857)
  // X (east-west): lon * 20037508.34 / 180
  // Y (north-south): ln(tan((90 + lat) * π / 360)) * 20037508.34 / π
  
  const x = lon * 20037508.34 / 180
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI
  
  return { x, y }
}

/**
 * Convert latitude/longitude to Streets GL world coordinates
 * Streets GL uses Web Mercator projection where:
 * - position.x = Web Mercator Y (north-south) - NOTE: X and Y are swapped from standard Web Mercator!
 * - position.z = Web Mercator X (east-west) - NOTE: X and Z are swapped from standard Web Mercator!
 * - position.y = height above ground
 * 
 * This matches how tiles are positioned in Streets GL:
 * - tile.position.x = positionInMeters.x (Web Mercator X)
 * - tile.position.z = positionInMeters.y (Web Mercator Y)
 * 
 * But for external objects, Streets GL expects:
 * - position.x = Web Mercator Y (north-south)
 * - position.z = Web Mercator X (east-west)
 * 
 * @param lat Latitude in degrees (-90 to 90)
 * @param lon Longitude in degrees (-180 to 180)
 * @param height Height above ground in meters (default: 0)
 * @returns Streets GL world position {x, y, z}
 */
export function latLonToStreetsGL(lat: number, lon: number, height: number = 0): { x: number; y: number; z: number } {
  const mercator = latLonToWebMercator(lat, lon)
  
  // Streets GL coordinate system for external objects:
  // X = Web Mercator Y (north-south) - SWAPPED from standard Web Mercator!
  // Z = Web Mercator X (east-west) - SWAPPED from standard Web Mercator!
  // Y = height above ground
  return {
    x: mercator.y,  // Web Mercator Y (north-south) → Streets GL X
    y: height,      // Height above ground
    z: mercator.x   // Web Mercator X (east-west) → Streets GL Z
  }
}

/**
 * Convert latitude/longitude to Three.js world coordinates
 * Uses Web Mercator projection (same as Streets GL)
 * 
 * @param lat Latitude in degrees (-90 to 90)
 * @param lon Longitude in degrees (-180 to 180)
 * @param centerLat Center latitude of the map view (default: 0)
 * @param centerLon Center longitude of the map view (default: 0)
 * @param scale Scale factor for world coordinates (default: 1)
 * @returns Three.js world position {x, y, z}
 */
export function latLonToWorld(
  lat: number,
  lon: number,
  centerLat: number = 0,
  centerLon: number = 0,
  scale: number = 1
): THREE.Vector3 {
  // Earth radius in meters
  const EARTH_RADIUS = 6378137
  
  // Convert degrees to radians
  const latRad = THREE.MathUtils.degToRad(lat)
  const lonRad = THREE.MathUtils.degToRad(lon)
  const centerLatRad = THREE.MathUtils.degToRad(centerLat)
  const centerLonRad = THREE.MathUtils.degToRad(centerLon)
  
  // Web Mercator projection
  // X = longitude (east-west)
  // Z = latitude (north-south, inverted for Three.js)
  const x = (lonRad - centerLonRad) * EARTH_RADIUS * scale
  const z = -(latRad - centerLatRad) * EARTH_RADIUS * scale // Negative for Three.js Z axis
  const y = 0 // Ground level
  
  return new THREE.Vector3(x, y, z)
}

/**
 * Convert Three.js world coordinates to latitude/longitude
 * 
 * @param position Three.js world position
 * @param centerLat Center latitude of the map view
 * @param centerLon Center longitude of the map view
 * @param scale Scale factor used for world coordinates
 * @returns Geographic coordinates {lat, lon}
 */
export function worldToLatLon(
  position: THREE.Vector3,
  centerLat: number = 0,
  centerLon: number = 0,
  scale: number = 1
): { lat: number; lon: number } {
  const EARTH_RADIUS = 6378137
  
  // Convert world coordinates back to radians
  const lonRad = (position.x / (EARTH_RADIUS * scale)) + THREE.MathUtils.degToRad(centerLon)
  const latRad = -(position.z / (EARTH_RADIUS * scale)) + THREE.MathUtils.degToRad(centerLat)
  
  // Convert radians to degrees
  const lat = THREE.MathUtils.radToDeg(latRad)
  const lon = THREE.MathUtils.radToDeg(lonRad)
  
  return { lat, lon }
}

/**
 * Calculate distance between two lat/lon points in meters
 * Uses Haversine formula
 */
export function distanceLatLon(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS = 6378137
  
  const dLat = THREE.MathUtils.degToRad(lat2 - lat1)
  const dLon = THREE.MathUtils.degToRad(lon2 - lon1)
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(THREE.MathUtils.degToRad(lat1)) *
      Math.cos(THREE.MathUtils.degToRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  
  return EARTH_RADIUS * c
}

/**
 * Get scale factor based on zoom level
 * Higher zoom = smaller scale (more detail)
 */
export function getScaleFromZoom(zoom: number): number {
  // At zoom 0, 1 unit = 1 meter
  // At zoom 18, 1 unit = ~0.15 meters
  return 1 / Math.pow(2, zoom - 10)
}

/**
 * Convert Web Mercator meters back to latitude/longitude
 * Inverse of latLonToWebMercator
 * 
 * @param x Web Mercator X (east-west) in meters
 * @param y Web Mercator Y (north-south) in meters
 * @returns Geographic coordinates {lat, lon}
 */
export function webMercatorToLatLon(x: number, y: number): { lat: number; lon: number } {
  const R = 20037508.34 // Earth radius in Web Mercator units
  
  // Convert X (east-west) to longitude
  const lon = (x / R) * 180
  
  // Convert Y (north-south) to latitude
  const lat = (Math.atan(Math.exp((y / R) * Math.PI)) - Math.PI / 4) * 2 * (180 / Math.PI)
  
  return { lat, lon }
}

/**
 * Convert Streets GL coordinates back to latitude/longitude
 * Inverse of latLonToStreetsGL
 * 
 * @param x Streets GL X (Web Mercator Y - north-south)
 * @param z Streets GL Z (Web Mercator X - east-west)
 * @returns Geographic coordinates {lat, lon}
 */
export function streetsGLToLatLon(x: number, z: number): { lat: number; lon: number } {
  // Streets GL uses: x = Web Mercator Y (north-south), z = Web Mercator X (east-west)
  // So we need to swap them back
  const mercatorX = z // Streets GL Z is Web Mercator X (east-west)
  const mercatorY = x // Streets GL X is Web Mercator Y (north-south)
  return webMercatorToLatLon(mercatorX, mercatorY)
}




