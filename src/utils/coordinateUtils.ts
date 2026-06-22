/**
 * Coordinate Utilities
 * Helper functions for coordinate conversion and manipulation
 */

/**
 * Convert degrees, minutes, seconds (DMS) to decimal degrees
 * 
 * @param degrees Degrees component
 * @param minutes Minutes component
 * @param seconds Seconds component
 * @param direction 'N' | 'S' | 'E' | 'W'
 * @returns Decimal degrees (negative for S/W)
 * 
 * @example
 * // 32°53'51.0"N
 * dmsToDecimal(32, 53, 51.0, 'N') // returns 32.8975
 * 
 * // 97°02'25.9"W
 * dmsToDecimal(97, 2, 25.9, 'W') // returns -97.0405
 */
export function dmsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  direction: 'N' | 'S' | 'E' | 'W'
): number {
  let decimal = degrees + minutes / 60 + seconds / 3600
  
  // Make negative for South and West
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal
  }
  
  return decimal
}

/**
 * Parse a DMS coordinate string to decimal degrees
 * Supports formats like:
 * - "32°53'51.0"N"
 * - "32°53'51.0\"N"
 * - "32 53 51.0 N"
 * 
 * @param dmsString DMS coordinate string
 * @returns Decimal degrees
 */
export function parseDMSCoordinate(dmsString: string): number {
  // Remove extra whitespace and normalize
  const normalized = dmsString.trim().replace(/[""]/g, '"')
  
  // Try to match various formats
  const patterns = [
    // Format: 32°53'51.0"N
    /(\d+)[°\s]+(\d+)['\s]+([\d.]+)["\s]*([NSEW])/i,
    // Format: 32 53 51.0 N
    /(\d+)\s+(\d+)\s+([\d.]+)\s*([NSEW])/i,
  ]
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) {
      const degrees = parseFloat(match[1])
      const minutes = parseFloat(match[2])
      const seconds = parseFloat(match[3])
      const direction = match[4].toUpperCase() as 'N' | 'S' | 'E' | 'W'
      
      return dmsToDecimal(degrees, minutes, seconds, direction)
    }
  }
  
  // If no pattern matches, try to parse as decimal
  const decimal = parseFloat(normalized)
  if (!isNaN(decimal)) {
    return decimal
  }
  
  throw new Error(`Invalid DMS coordinate format: ${dmsString}`)
}

/**
 * Parse a coordinate pair string
 * 
 * @param coordinateString Format: "32°53'51.0"N 97°02'25.9"W"
 * @returns Object with lat and lon in decimal degrees
 */
export function parseCoordinatePair(coordinateString: string): { lat: number; lon: number } {
  const parts = coordinateString.trim().split(/\s+/)
  
  if (parts.length < 2) {
    throw new Error(`Invalid coordinate pair format: ${coordinateString}`)
  }
  
  const latString = parts[0]
  const lonString = parts[1]
  
  const lat = parseDMSCoordinate(latString)
  const lon = parseDMSCoordinate(lonString)
  
  return { lat, lon }
}


