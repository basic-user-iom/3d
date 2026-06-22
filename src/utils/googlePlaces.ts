/**
 * Google Places API Integration
 * Fetches places data from Google Maps Places API
 */

export interface GooglePlace {
  place_id: string
  name: string
  types: string[]
  geometry: {
    location: {
      lat: number
      lng: number
    }
  }
  formatted_address?: string
  rating?: number
  user_ratings_total?: number
  price_level?: number
  business_status?: string
  icon?: string
  photos?: Array<{
    photo_reference: string
    width: number
    height: number
  }>
}

export interface PlacesSearchOptions {
  location: { lat: number; lng: number }
  radius?: number // in meters, default 5000
  type?: string // e.g., 'restaurant', 'cafe', 'store', 'airport', etc.
  keyword?: string
  minPrice?: number // 0-4
  maxPrice?: number // 0-4
}

/**
 * Search for places near a location using Google Places API
 * 
 * @param apiKey Google Maps API key
 * @param options Search options
 * @returns Array of places
 */
export async function searchPlaces(
  apiKey: string,
  options: PlacesSearchOptions
): Promise<GooglePlace[]> {
  const { location, radius = 5000, type, keyword, minPrice, maxPrice } = options
  
  // Build the request URL
  const baseUrl = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json'
  const params = new URLSearchParams({
    key: apiKey,
    location: `${location.lat},${location.lng}`,
    radius: radius.toString(),
  })
  
  if (type) {
    params.append('type', type)
  }
  
  if (keyword) {
    params.append('keyword', keyword)
  }
  
  if (minPrice !== undefined) {
    params.append('minprice', minPrice.toString())
  }
  
  if (maxPrice !== undefined) {
    params.append('maxprice', maxPrice.toString())
  }
  
  const url = `${baseUrl}?${params.toString()}`
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    
    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      return data.results || []
    } else if (data.status === 'REQUEST_DENIED') {
      throw new Error('Google Places API request denied. Check your API key and ensure Places API is enabled.')
    } else if (data.status === 'OVER_QUERY_LIMIT') {
      throw new Error('Google Places API quota exceeded. Please try again later.')
    } else {
      throw new Error(`Google Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to fetch places from Google Places API')
  }
}

/**
 * Get place details for a specific place ID
 * 
 * @param apiKey Google Maps API key
 * @param placeId Place ID from Google Places API
 * @returns Place details
 */
export async function getPlaceDetails(
  apiKey: string,
  placeId: string
): Promise<GooglePlace | null> {
  const baseUrl = 'https://maps.googleapis.com/maps/api/place/details/json'
  const params = new URLSearchParams({
    key: apiKey,
    place_id: placeId,
    fields: 'place_id,name,types,geometry,formatted_address,rating,user_ratings_total,price_level,business_status,icon,photos',
  })
  
  const url = `${baseUrl}?${params.toString()}`
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
    }
    
    const data = await response.json()
    
    if (data.status === 'OK' && data.result) {
      return data.result
    } else {
      throw new Error(`Google Places API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to fetch place details from Google Places API')
  }
}

/**
 * Common place types for filtering
 */
export const PLACE_TYPES = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  store: 'store',
  shopping_mall: 'shopping_mall',
  airport: 'airport',
  hotel: 'lodging',
  gas_station: 'gas_station',
  bank: 'bank',
  pharmacy: 'pharmacy',
  hospital: 'hospital',
  school: 'school',
  park: 'park',
  museum: 'museum',
  tourist_attraction: 'tourist_attraction',
} as const

export type PlaceType = typeof PLACE_TYPES[keyof typeof PLACE_TYPES]


