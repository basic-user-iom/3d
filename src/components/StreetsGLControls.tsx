import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import './StreetsGLControls.css'

const STREETS_GL_ALT_URL = 'http://localhost:8081'

// Debounce utility (same as Streets GL)
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout | null = null
  return ((...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }) as T
}

interface SearchResult {
  id: string
  lat: number
  lon: number
  name: string
  type: string
}

// Parse lat/lon from text (e.g., "32.89917, -97.03813" or "32.89917,-97.03813")
function parseLatLon(text: string): [number, number] | null {
  const match = text.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/)
  if (!match) return null
  
  const lat = parseFloat(match[1])
  const lon = parseFloat(match[2])
  
  if (isNaN(lat) || isNaN(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  
  return [lat, lon]
}

// Search using OpenStreetMap Nominatim (same as Streets GL)
async function searchByText(text: string): Promise<SearchResult[]> {
  text = text.trim()
  const results: SearchResult[] = []

  if (text.length === 0) {
    return results
  }

  // Check if it's a coordinate pair
  const latLonMatch = parseLatLon(text)
  if (latLonMatch) {
    const [lat, lon] = latLonMatch
    results.push({
      id: `${lat},${lon}`,
      lat,
      lon,
      name: `${lat}, ${lon}`,
      type: 'coordinates'
    })
  }

  // Search using Nominatim
  try {
    const nominatimURL = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=jsonv2&limit=6`
    const { fetchJSON } = await import('../utils/networkUtils')
    
    const jsonResponse = await fetchJSON<any[]>(nominatimURL, {
      method: 'GET',
      headers: {
        'User-Agent': 'StreetsGL-Controls/1.0' // Required by Nominatim usage policy
      }
    }, {
      maxRetries: 2,
      retryDelay: 2000,
      timeout: 10000, // 10 second timeout for Nominatim
    })
    
    if (Array.isArray(jsonResponse)) {
      for (let i = 0; i < Math.min(6, jsonResponse.length); i++) {
        const entry = jsonResponse[i]
        results.push({
          id: entry.place_id.toString(),
          lat: parseFloat(entry.lat),
          lon: parseFloat(entry.lon),
          name: entry.display_name,
          type: `${entry.type || ''}, ${entry.category || ''}`.replace(/^,\s*|,\s*$/g, ''),
        })
      }
    }
  } catch (error) {
    // Suppress expected errors (rate limits, network issues) - these are normal
    const errorMsg = error instanceof Error ? error.message : String(error)
    if (errorMsg.includes('Rate limit') || errorMsg.includes('Connection failed')) {
      console.warn('[StreetsGLControls] Nominatim search temporarily unavailable:', errorMsg)
      // Return empty results instead of throwing - allows app to continue
      return results
    }
    console.error('[StreetsGLControls] Nominatim search error:', error)
    // Only throw for unexpected errors
    throw error
  }

  return results
}

export default function StreetsGLControls() {
  const {
    streetsGLIframeOverlay,
    streetsGLGroundLat,
    streetsGLGroundLon,
    setStreetsGLGroundLat,
    setStreetsGLGroundLon,
    setStreetsGLIframeInteractive,
    setStreetsGLShowUI
  } = useAppStore()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLocationLoading, setIsLocationLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced search callback (same as original - 1000ms delay)
  const searchCallback = useCallback(debounce((value: string): void => {
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    
    setIsSearching(true)
    searchByText(value.trim()).then(results => {
      setSearchResults(results)
      setIsSearching(false)
    }).catch(err => {
      console.error('[StreetsGLControls] Search error:', err)
      setSearchResults([])
      setIsSearching(false)
    })
  }, 1000), [])

  const resetCallback = useCallback(() => {
    setSearchResults([])
  }, [])

  const handleSearchResultClick = (result: SearchResult) => {
    // Navigate to selected location (same as original)
    setStreetsGLGroundLat(result.lat)
    setStreetsGLGroundLon(result.lon)
    setSearchResults([]) // Close results dropdown
    setSearchQuery('') // Clear search
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      // If results are shown, select first result
      handleSearchResultClick(searchResults[0])
    } else if (e.key === 'Enter') {
      // Otherwise trigger search
      searchCallback(searchQuery)
    }
  }

  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }

    if (isLocationLoading) return

    setIsLocationLoading(true)
    
    // Use same options as original Streets GL
    const geolocationOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 300_000
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStreetsGLGroundLat(position.coords.latitude)
        setStreetsGLGroundLon(position.coords.longitude)
        setIsLocationLoading(false)
      },
      (error) => {
        console.error('Geolocation error:', error)
        alert('Unable to get your location. Please enable location services.')
        setIsLocationLoading(false)
      },
      geolocationOptions
    )
  }

  if (!streetsGLIframeOverlay) return null

  return (
    <div className="streets-gl-controls">
      <div className="streets-gl-controls-content">
        {/* Search Bar - matches Streets GL original design */}
        <div className="streets-gl-search-container">
          <div className="streets-gl-search-bar">
            <div className="streets-gl-search-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 3C5.686 3 3 5.686 3 9C3 12.314 5.686 15 9 15C10.657 15 12.16 14.348 13.243 13.314L16.293 16.364C16.683 16.754 17.317 16.754 17.707 16.364C18.098 15.973 18.098 15.34 17.707 14.95L14.657 11.9C15.691 10.817 16.343 9.314 16.343 7.657C16.343 4.343 13.657 1.657 10.343 1.657H9V3ZM9 5C11.761 5 14 7.239 14 10C14 12.761 11.761 15 9 15C6.239 15 4 12.761 4 10C4 7.239 6.239 5 9 5Z" fill="currentColor"/>
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              className="streets-gl-search-input"
              placeholder="Search any place"
              value={searchQuery}
              onChange={(e) => {
                const value = e.target.value
                setSearchQuery(value)
                searchCallback(value)
              }}
              onKeyPress={handleKeyPress}
              disabled={isSearching}
            />
            {inputRef.current && inputRef.current.value.length > 0 && (
              <div
                className="streets-gl-search-clear"
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                  resetCallback()
                  if (inputRef.current) {
                    inputRef.current.value = ''
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>
          {/* Search Results Dropdown - matches original Streets GL */}
          {searchResults.length > 0 && (
            <div className="streets-gl-search-results">
              {searchResults.map((result, i) => {
                const nameClassNames = result.name.length > 40 
                  ? 'streets-gl-search-results-item-name streets-gl-search-results-item-name-small'
                  : 'streets-gl-search-results-item-name'
                
                return (
                  <div
                    key={result.id || i}
                    className="streets-gl-search-results-item"
                    onClick={() => handleSearchResultClick(result)}
                  >
                    <div className={nameClassNames}>{result.name}</div>
                    <div className="streets-gl-search-results-item-type">{result.type}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Action Buttons - matches Streets GL original design */}
        <div className="streets-gl-actions">
          <button
            className={`streets-gl-action-button ${isLocationLoading ? 'streets-gl-action-button-loading' : ''}`}
            onClick={handleLocationClick}
            disabled={isLocationLoading}
            title="Use current location"
          >
            {isLocationLoading ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="streets-gl-spinner">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31.416" strokeDashoffset="31.416">
                  <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
                  <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
                </circle>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM20.94 11C20.48 6.83 17.17 3.52 13 3.06V1H11V3.06C6.83 3.52 3.52 6.83 3.06 11H1V13H3.06C3.52 17.17 6.83 20.48 11 20.94V23H13V20.94C17.17 20.48 20.48 17.17 20.94 13H23V11H20.94ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z" fill="currentColor"/>
              </svg>
            )}
          </button>
          <button
            className="streets-gl-action-button"
            onClick={() => {
              // Show Streets GL UI and enable interaction
              // The Streets GL buttons will appear at the top-right of the iframe
              setStreetsGLShowUI(true)
              setStreetsGLIframeInteractive(true)
              console.log('[StreetsGLControls] Streets GL UI enabled. Click the settings button (gear icon) in the top-right corner of the map.')
            }}
            title="Settings - Shows Streets GL UI, then click the gear icon in top-right"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19.14 12.94C19.18 12.64 19.2 12.33 19.2 12C19.2 11.67 19.18 11.36 19.14 11.06L21.16 9.04C21.4 8.8 21.47 8.45 21.34 8.14L19.34 4.64C19.21 4.33 18.9 4.15 18.57 4.19L16.24 4.5C15.77 4.04 15.25 3.56 14.66 3.15L14.36 0.81C14.31 0.48 14.05 0.22 13.72 0.17H10.28C9.95 0.22 9.69 0.48 9.64 0.81L9.34 3.15C8.75 3.56 8.23 4.04 7.76 4.5L5.43 4.19C5.1 4.15 4.79 4.33 4.66 4.64L2.66 8.14C2.53 8.45 2.6 8.8 2.84 9.04L4.86 11.06C4.82 11.36 4.8 11.67 4.8 12C4.8 12.33 4.82 12.64 4.86 12.94L2.84 14.96C2.6 15.2 2.53 15.55 2.66 15.86L4.66 19.36C4.79 19.67 5.1 19.85 5.43 19.81L7.76 19.5C8.23 19.96 8.75 20.44 9.34 20.85L9.64 23.19C9.69 23.52 9.95 23.78 10.28 23.83H13.72C14.05 23.78 14.31 23.52 14.36 23.19L14.66 20.85C15.25 20.44 15.77 19.96 16.24 19.5L18.57 19.81C18.9 19.85 19.21 19.67 19.34 19.36L21.34 15.86C21.47 15.55 21.4 15.2 21.16 14.96L19.14 12.94ZM12 15.6C10.02 15.6 8.4 13.98 8.4 12C8.4 10.02 10.02 8.4 12 8.4C13.98 8.4 15.6 10.02 15.6 12C15.6 13.98 13.98 15.6 12 15.6Z" fill="currentColor"/>
            </svg>
          </button>
          <button
            className="streets-gl-action-button"
            onClick={() => {
              // Show Streets GL UI and enable interaction
              // The Streets GL buttons will appear at the top-right of the iframe
              setStreetsGLShowUI(true)
              setStreetsGLIframeInteractive(true)
              console.log('[StreetsGLControls] Streets GL UI enabled. Click the info button (i icon) in the top-right corner of the map.')
            }}
            title="Information - Shows Streets GL UI, then click the i icon in top-right"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

