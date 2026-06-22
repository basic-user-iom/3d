import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useViewer } from '../viewer/useViewer'
import { useFloatingPanel } from '../hooks/useFloatingPanel'
import { usePanelStacking } from '../hooks/usePanelStacking'
import { searchPlaces, type GooglePlace, PLACE_TYPES, type PlaceType } from '../utils/googlePlaces'
import { parseCoordinatePair, parseDMSCoordinate } from '../utils/coordinateUtils'
import { latLonToStreetsGL } from '../utils/mapCoordinates'
import * as THREE from 'three'
import './PlacesPanel.css'

export default function PlacesPanel() {
  const {
    showPlacesPanel,
    togglePlacesPanel,
    googleMapsApiKey,
    setGoogleMapsApiKey,
    places,
    addPlace,
    removePlace,
    updatePlace,
    clearPlaces,
    streetsGLGroundLat,
    streetsGLGroundLon,
    setStreetsGLGroundLat,
    setStreetsGLGroundLon,
  } = useAppStore()
  
  const { viewer } = useViewer()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [isMinimized, setIsMinimized] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchRadius, setSearchRadius] = useState(5000) // meters
  const [selectedPlaceType, setSelectedPlaceType] = useState<PlaceType | ''>('')
  const [coordinateInput, setCoordinateInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState(googleMapsApiKey || '')
  const placeMarkersRef = useRef<Map<string, THREE.Object3D>>(new Map())
  
  // Calculate stacking offset for right-side panels
  const PANEL_WIDTH = 400
  const stackingOffset = usePanelStacking({ panelId: 'places', anchor: 'right' })
  const { top: panelTop, left: panelLeft, maxHeight, dragging, handleMouseDown } = useFloatingPanel(
    panelRef as RefObject<HTMLElement>,
    {
      anchor: 'right',
      stackingOffset,
      panelWidth: PANEL_WIDTH,
      panelId: 'places'
    }
  )

  // Update API key input when store changes
  useEffect(() => {
    setApiKeyInput(googleMapsApiKey || '')
  }, [googleMapsApiKey])

  // Create 3D markers for places
  const createPlaceMarker = useCallback((place: typeof places[0]): THREE.Object3D => {
    const group = new THREE.Group()
    group.userData.placeId = place.id
    group.userData.isPlaceMarker = true

    // Create a sprite with text (simple approach - use a plane with texture or sprite)
    const spriteMaterial = new THREE.SpriteMaterial({
      color: 0xff0000,
      sizeAttenuation: true,
    })
    const sprite = new THREE.Sprite(spriteMaterial)
    sprite.scale.set(5, 5, 1)
    sprite.position.y = 10 // Height above ground
    group.add(sprite)

    // Add a small sphere as marker
    const geometry = new THREE.SphereGeometry(2, 16, 16)
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 })
    const sphere = new THREE.Mesh(geometry, material)
    sphere.position.y = 0
    group.add(sphere)

    // Position marker at place location
    const position = latLonToStreetsGL(place.lat, place.lng, 0)
    group.position.set(position.x, position.y, position.z)

    return group
  }, [])

  // Update markers when places change
  useEffect(() => {
    if (!viewer || !viewer.scene) return

    const scene = viewer.scene

    // Remove old markers
    placeMarkersRef.current.forEach((marker, id) => {
      scene.remove(marker)
      marker.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
          child.geometry?.dispose()
          if (child.material instanceof THREE.Material) {
            child.material.dispose()
          } else if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose())
          }
        }
      })
    })
    placeMarkersRef.current.clear()

    // Add new markers for visible places
    places.forEach((place) => {
      if (place.visible) {
        const marker = createPlaceMarker(place)
        scene.add(marker)
        placeMarkersRef.current.set(place.id, marker)
      }
    })

    // Force render update
    if (viewer.renderer && viewer.camera) {
      viewer.renderer.render(scene, viewer.camera)
    }
  }, [places, viewer, createPlaceMarker])

  // Cleanup markers on unmount
  useEffect(() => {
    return () => {
      if (viewer && viewer.scene) {
        placeMarkersRef.current.forEach((marker) => {
          viewer.scene.remove(marker)
          marker.traverse((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
              child.geometry?.dispose()
              if (child.material instanceof THREE.Material) {
                child.material.dispose()
              } else if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose())
              }
            }
          })
        })
        placeMarkersRef.current.clear()
      }
    }
  }, [viewer])

  const handleSetCoordinates = () => {
    try {
      const { lat, lon } = parseCoordinatePair(coordinateInput)
      setStreetsGLGroundLat(lat)
      setStreetsGLGroundLon(lon)
      setError(null)
      setCoordinateInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid coordinate format')
    }
  }

  const handleSetCoordinatesFromDMS = () => {
    try {
      // Parse format: 32°53'51.0"N 97°02'25.9"W
      const { lat, lon } = parseCoordinatePair(coordinateInput)
      setStreetsGLGroundLat(lat)
      setStreetsGLGroundLon(lon)
      setError(null)
      setCoordinateInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid coordinate format')
    }
  }

  const handleSearchPlaces = async () => {
    if (!googleMapsApiKey) {
      setError('Please enter a Google Maps API key')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const results = await searchPlaces(googleMapsApiKey, {
        location: { lat: streetsGLGroundLat, lng: streetsGLGroundLon },
        radius: searchRadius,
        type: selectedPlaceType || undefined,
      })

      // Add places to store
      results.forEach((place: GooglePlace) => {
        addPlace({
          name: place.name,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          type: place.types[0] || 'unknown',
          address: place.formatted_address,
          rating: place.rating,
        })
      })

      if (results.length === 0) {
        setError('No places found. Try adjusting the search radius or place type.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search places')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePlaceVisibility = (id: string) => {
    const place = places.find(p => p.id === id)
    if (place) {
      updatePlace(id, { visible: !place.visible })
    }
  }

  if (!showPlacesPanel) return null

  return (
    <div
      ref={panelRef}
      className={`places-panel${dragging ? ' dragging' : ''}`}
      style={{ top: `${panelTop}px`, left: `${panelLeft}px`, maxHeight: `${maxHeight}px` }}
    >
      <div className="places-panel-header" onMouseDown={handleMouseDown}>
        <h3>📍 Places</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="minimize-button"
            title={isMinimized ? "Maximize panel" : "Minimize panel"}
          >
            {isMinimized ? '□' : '−'}
          </button>
          <button className="close-button" onClick={togglePlacesPanel}>
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="places-panel-content">
          {/* API Key Section */}
          <div className="places-section">
            <h4>Google Maps API Key</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter Google Maps API key"
                style={{ flex: 1, padding: '6px' }}
              />
              <button
                onClick={() => setGoogleMapsApiKey(apiKeyInput || null)}
                className="places-button"
              >
                Save
              </button>
            </div>
            <p className="places-hint">
              Get your API key from{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
                Google Cloud Console
              </a>
              . Enable Places API.
            </p>
          </div>

          {/* Coordinate Section */}
          <div className="places-section">
            <h4>Set Location</h4>
            <p className="places-hint">Current: {streetsGLGroundLat.toFixed(6)}, {streetsGLGroundLon.toFixed(6)}</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={coordinateInput}
                onChange={(e) => setCoordinateInput(e.target.value)}
                placeholder={`32°53'51.0"N 97°02'25.9"W`}
                style={{ flex: 1, padding: '6px' }}
              />
              <button
                onClick={handleSetCoordinatesFromDMS}
                className="places-button"
                disabled={!coordinateInput}
              >
                Set
              </button>
            </div>
            <p className="places-hint">
              Enter coordinates in DMS format (e.g., 32°53&apos;51.0&quot;N 97°02&apos;25.9&quot;W)
            </p>
          </div>

          {/* Search Section */}
          <div className="places-section">
            <h4>Search Places</h4>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Search Radius (meters)</label>
              <input
                type="number"
                value={searchRadius}
                onChange={(e) => setSearchRadius(parseInt(e.target.value) || 5000)}
                min={100}
                max={50000}
                step={100}
                style={{ width: '100%', padding: '6px' }}
              />
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>Place Type</label>
              <select
                value={selectedPlaceType}
                onChange={(e) => setSelectedPlaceType(e.target.value as PlaceType | '')}
                style={{ width: '100%', padding: '6px' }}
              >
                <option value="">All Types</option>
                {Object.entries(PLACE_TYPES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSearchPlaces}
              className="places-button places-button-primary"
              disabled={loading || !googleMapsApiKey}
              style={{ width: '100%', marginBottom: '8px' }}
            >
              {loading ? 'Searching...' : 'Search Places'}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="places-error" style={{ padding: '8px', background: '#ffebee', color: '#c62828', borderRadius: '4px', marginBottom: '8px' }}>
              {error}
            </div>
          )}

          {/* Places List */}
          <div className="places-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4>Found Places ({places.length})</h4>
              {places.length > 0 && (
                <button
                  onClick={clearPlaces}
                  className="places-button places-button-danger"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  Clear All
                </button>
              )}
            </div>
            {places.length === 0 ? (
              <p className="places-hint">No places added yet. Search for places to add them to the scene.</p>
            ) : (
              <div className="places-list">
                {places.map((place) => (
                  <div key={place.id} className="places-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{place.name}</div>
                        {place.address && (
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                            {place.address}
                          </div>
                        )}
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          {place.type} • {place.lat.toFixed(6)}, {place.lng.toFixed(6)}
                          {place.rating && ` • ⭐ ${place.rating.toFixed(1)}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button
                          onClick={() => handleTogglePlaceVisibility(place.id)}
                          className="places-button"
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          title={place.visible ? 'Hide marker' : 'Show marker'}
                        >
                          {place.visible ? '👁' : '👁'}
                        </button>
                        <button
                          onClick={() => removePlace(place.id)}
                          className="places-button places-button-danger"
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                          title="Remove place"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

