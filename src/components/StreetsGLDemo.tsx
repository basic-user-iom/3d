/**
 * Streets GL Simple Demo
 * A clean, simple demo for placing primitive objects directly in streets.gl
 * Based on streets.gl ExternalObjectBridge API
 */

import React, { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { StreetsGLBridge, StreetsGLObject } from '../utils/streetsGLBridge'
import { latLonToStreetsGL, streetsGLToLatLon, latLonToWebMercator } from '../utils/mapCoordinates'
import './StreetsGLDemo.css'

type PrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane'

interface PlacedObject {
  id: string
  type: PrimitiveType
  position: { x: number; y: number; z: number }
  color: { r: number; g: number; b: number }
}

export default function StreetsGLDemo() {
  const { 
    streetsGLBridge,
    streetsGLIframeOverlay,
    setStreetsGLIframeOverlay,
    streetsGLGroundLat,
    streetsGLGroundLon
  } = useAppStore()
  
  const [selectedType, setSelectedType] = useState<PrimitiveType>('box')
  const [bridgeReady, setBridgeReady] = useState(false)
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([])
  const [status, setStatus] = useState<string>('')
  const [isVisible, setIsVisible] = useState(false)
  const [bugLogs, setBugLogs] = useState<Array<{
    timestamp: string
    type: 'error' | 'warning' | 'info' | 'success'
    message: string
    details?: any
  }>>([])
  const bugLogRef = useRef<HTMLDivElement>(null)

  // Bug tracking helper
  const logBug = (type: 'error' | 'warning' | 'info' | 'success', message: string, details?: any) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    }
    setBugLogs(prev => [...prev.slice(-49), logEntry]) // Keep last 50 entries
    console.log(`[StreetsGLDemo:${type.toUpperCase()}]`, message, details || '')
    
    // Auto-scroll to bottom
    setTimeout(() => {
      if (bugLogRef.current) {
        bugLogRef.current.scrollTop = bugLogRef.current.scrollHeight
      }
    }, 100)
  }

  // Add global error handlers for this component
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'error' as const,
        message: 'Global error caught',
        details: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error?.toString(),
          stack: event.error?.stack
        }
      }
      setBugLogs(prev => [...prev.slice(-49), logEntry])
      console.error('[StreetsGLDemo:ERROR] Global error caught', logEntry.details)
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'error' as const,
        message: 'Unhandled promise rejection',
        details: {
          reason: event.reason?.toString(),
          stack: event.reason?.stack
        }
      }
      setBugLogs(prev => [...prev.slice(-49), logEntry])
      console.error('[StreetsGLDemo:ERROR] Unhandled promise rejection', logEntry.details)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // Monitor bridge readiness
  useEffect(() => {
    if (!streetsGLBridge) {
      setBridgeReady(false)
      setStatus('Waiting for Streets GL bridge...')
      logBug('warning', 'Streets GL bridge not available')
      return
    }

    const bridge = streetsGLBridge as StreetsGLBridge
    
    if (bridge.isReady) {
      setBridgeReady(true)
      setStatus('✅ Bridge ready - You can place objects!')
      logBug('success', 'Bridge ready', { bridgeReady: true })
    } else {
      setBridgeReady(false)
      setStatus('Waiting for bridge to initialize...')
      logBug('info', 'Waiting for bridge initialization')
      
      // Wait for bridge to be ready
      bridge.onReady(() => {
        setBridgeReady(true)
        setStatus('✅ Bridge ready - You can place objects!')
        logBug('success', 'Bridge initialized successfully')
      })
    }
  }, [streetsGLBridge])

  // Ensure Streets GL is enabled
  useEffect(() => {
    if (isVisible && !streetsGLIframeOverlay) {
      setStreetsGLIframeOverlay(true)
      setStatus('Enabling Streets GL...')
    }
  }, [isVisible, streetsGLIframeOverlay, setStreetsGLIframeOverlay])

  /**
   * Create geometry data for a primitive
   */
  const createPrimitiveGeometry = (type: PrimitiveType, size: number = 1, height?: number, depth?: number): {
    positions: number[]
    normals: number[]
    indices: number[]
    uvs: number[]
  } => {
    let geometry: THREE.BufferGeometry

    switch (type) {
      case 'box':
        // Support custom width, height, depth for boxes
        if (height !== undefined && depth !== undefined) {
          geometry = new THREE.BoxGeometry(size, height, depth)
        } else {
          geometry = new THREE.BoxGeometry(size, size, size)
        }
        break
      case 'sphere':
        geometry = new THREE.SphereGeometry(size / 2, 16, 16)
        break
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(size / 2, size / 2, size, 16)
        break
      case 'cone':
        geometry = new THREE.ConeGeometry(size / 2, size, 16)
        break
      case 'plane':
        // Plane geometry: width (X), height (Z) - in Three.js, plane is in XZ plane
        // Create a double-sided plane by creating two planes back-to-back
        const planeGeom = new THREE.PlaneGeometry(size, size)
        // Extract positions, normals, indices, uvs from the plane
        const planePositions: number[] = []
        const planeNormals: number[] = []
        const planeIndices: number[] = []
        const planeUVs: number[] = []
        
        // Get attributes
        const posAttr = planeGeom.attributes.position
        const normalAttr = planeGeom.attributes.normal
        const uvAttr = planeGeom.attributes.uv
        const indexAttr = planeGeom.index
        
        // Extract first side (original plane)
        if (posAttr) {
          const array = posAttr.array as Float32Array
          for (let i = 0; i < array.length; i++) {
            planePositions.push(array[i])
          }
        }
        
        if (normalAttr) {
          const array = normalAttr.array as Float32Array
          for (let i = 0; i < array.length; i++) {
            planeNormals.push(array[i])
          }
        }
        
        if (uvAttr) {
          const array = uvAttr.array as Float32Array
          for (let i = 0; i < array.length; i++) {
            planeUVs.push(array[i])
          }
        }
        
        if (indexAttr) {
          const array = indexAttr.array as Uint32Array
          for (let i = 0; i < array.length; i++) {
            planeIndices.push(array[i])
          }
        }
        
        // Add second side (flipped normal) - duplicate vertices with opposite normals
        const vertexCount = planePositions.length / 3
        const baseIndex = vertexCount
        
        // Duplicate positions
        for (let i = 0; i < vertexCount; i++) {
          planePositions.push(planePositions[i * 3], planePositions[i * 3 + 1], planePositions[i * 3 + 2])
        }
        
        // Duplicate UVs
        for (let i = 0; i < vertexCount; i++) {
          planeUVs.push(planeUVs[i * 2], planeUVs[i * 2 + 1])
        }
        
        // Add flipped normals for second side
        for (let i = 0; i < vertexCount; i++) {
          planeNormals.push(-planeNormals[i * 3], -planeNormals[i * 3 + 1], -planeNormals[i * 3 + 2])
        }
        
        // Add indices for second side (flipped winding order)
        if (indexAttr) {
          const array = indexAttr.array as Uint32Array
          for (let i = 0; i < array.length; i += 3) {
            // Flip winding: swap first and last vertex
            planeIndices.push(
              baseIndex + array[i + 2],
              baseIndex + array[i + 1],
              baseIndex + array[i]
            )
          }
        }
        
        planeGeom.dispose()
        
        return {
          positions: planePositions,
          normals: planeNormals,
          indices: planeIndices,
          uvs: planeUVs
        }
      default:
        geometry = new THREE.BoxGeometry(size, size, size)
    }

    // Extract geometry data
    const positions: number[] = []
    const normals: number[] = []
    const indices: number[] = []
    const uvs: number[] = []

    const posAttr = geometry.attributes.position
    const normalAttr = geometry.attributes.normal
    const uvAttr = geometry.attributes.uv
    const indexAttr = geometry.index

    // Extract positions
    if (posAttr) {
      const array = posAttr.array as Float32Array
      for (let i = 0; i < array.length; i++) {
        positions.push(array[i])
      }
    }

    // Extract normals
    if (normalAttr) {
      const array = normalAttr.array as Float32Array
      for (let i = 0; i < array.length; i++) {
        normals.push(array[i])
      }
    }

    // Extract UVs
    if (uvAttr) {
      const array = uvAttr.array as Float32Array
      for (let i = 0; i < array.length; i++) {
        uvs.push(array[i])
      }
    }

    // Extract indices
    if (indexAttr) {
      const array = indexAttr.array as Uint32Array
      for (let i = 0; i < array.length; i++) {
        indices.push(array[i])
      }
    }

    geometry.dispose()

    return { positions, normals, indices, uvs }
  }


  /**
   * Place a primitive object in Streets GL
   */
  const placeObject = async () => {
    if (!streetsGLBridge || !bridgeReady) {
      const errorMsg = 'Bridge not ready. Make sure Streets GL is enabled and loaded.'
      setStatus(`❌ ${errorMsg}`)
      logBug('error', errorMsg, { 
        hasBridge: !!streetsGLBridge, 
        bridgeReady 
      })
      return
    }

    const bridge = streetsGLBridge as StreetsGLBridge

    try {
      logBug('info', `Starting to place ${selectedType}`, { type: selectedType })
      
      // Generate unique ID
      const objectId = `primitive_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      
      // Create geometry - use 1m base size, then scale it up
      // This is the standard approach and works better with the rendering system
      const baseSize = 1 // Always create 1m base geometry
      const geometry = createPrimitiveGeometry(selectedType, baseSize)
      
      // Scale factor: 1000m for boxes (REALLY HUGE, impossible to miss!), 5m for others
      const scaleFactor = selectedType === 'box' ? 1000 : 5
      
      logBug('info', 'Geometry created', {
        type: selectedType,
        baseSize,
        scaleFactor,
        finalSize: scaleFactor,
        vertexCount: geometry.positions.length / 3,
        hasNormals: geometry.normals.length > 0,
        hasIndices: geometry.indices.length > 0,
        hasUVs: geometry.uvs.length > 0
      })
      
      // Red color for boxes (bright red)
      const color = {
        r: 1.0,  // Red
        g: 0.0,  // No green
        b: 0.0   // No blue
      }

      // Calculate height: for REALLY LARGE objects placed high in the sky
      // For a 1000m cube, place center at 600m so bottom is at 100m (well above buildings) and top is at 1100m
      const buildingHeight = 15 // 4-level parking garage is ~15m tall
      const objectHeight = buildingHeight + scaleFactor / 2 + 100 // Building top (15m) + half cube size (500m) + 100m clearance = 615m center
      
      console.log('[StreetsGLDemo] Height calculation:', {
        buildingHeight,
        scaleFactor,
        halfSize: scaleFactor / 2,
        objectHeight,
        expectedY: objectHeight
      })
      
      // Try to get camera position and ground target first (this is where the camera is actually looking)
      // This ensures objects are placed where the camera is viewing on the ground, not just at map center
      const basePosition = await new Promise<{ x: number; y: number; z: number }>((resolve) => {
        let resolved = false
        
        // Request camera position with timeout
        bridge.requestCameraPosition((payload) => {
          if (resolved) return
          resolved = true
          const cameraPos = payload.cameraPosition
          const groundTarget = payload.cameraTarget
          console.log('[StreetsGLDemo] Got camera position from Streets GL:', {
            cameraPosition: cameraPos,
            groundTarget: groundTarget
          })
          
          // Use groundTarget if available (where camera ray intersects ground plane)
          // Otherwise fall back to camera position X/Z at ground level
          const targetPos = groundTarget || {
            x: cameraPos.x,
            y: 0,
            z: cameraPos.z
          }
          
          // Place object at ground target position, but at objectHeight above ground
          const pos = {
            x: targetPos.x, // Ground target X (where camera is looking on ground)
            y: objectHeight, // Height above ground
            z: targetPos.z // Ground target Z (where camera is looking on ground)
          }
          
          logBug('info', 'Using camera ground target for object placement', {
            cameraPosition: cameraPos,
            groundTarget: targetPos,
            objectPosition: pos,
            note: 'Object placed at camera view center on ground, elevated to objectHeight'
          })
          
          resolve(pos)
        })
        
        // Fallback: Use map center coordinates if camera position not received within 500ms
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            const mapLat = streetsGLGroundLat || 32.899072732600196
            const mapLon = streetsGLGroundLon || -97.03823503010045
            
            // Convert to Streets GL coordinates (Web Mercator with proper axis mapping)
            const pos = latLonToStreetsGL(mapLat, mapLon, objectHeight)
            
            console.warn('[StreetsGLDemo] Camera position not received, using map center fallback')
            logBug('info', 'Using map center coordinates (camera position timeout)', {
              mapLat,
              mapLon,
              objectPosition: pos
            })
            
            resolve(pos)
          }
        }, 500) // 500ms timeout
      })
      
      console.log('[StreetsGLDemo] Position conversion:', {
        objectHeight,
        basePosition,
        expectedY: objectHeight,
        actualY: basePosition.y,
        positionMatch: Math.abs(basePosition.y - objectHeight) < 0.1 ? '✅ MATCH' : '❌ MISMATCH',
        note: 'Position based on camera view center or map center'
      })
      
      // Verify position is reasonable (not NaN or Infinity)
      if (!isFinite(basePosition.x) || !isFinite(basePosition.y) || !isFinite(basePosition.z)) {
        console.error('[StreetsGLDemo] ❌ Invalid position calculated!', basePosition)
        logBug('error', 'Invalid position calculated', { basePosition, objectHeight })
        return
      }
      
      // Small random offset to spread boxes (in meters)
      // Note: In Streets GL, X is north-south, Z is east-west
      const offsetX = (Math.random() - 0.5) * 20 // ±10 meters (north-south)
      const offsetZ = (Math.random() - 0.5) * 20 // ±10 meters (east-west)
      
      const position = {
        x: basePosition.x + offsetX,
        y: basePosition.y, // Height above ground
        z: basePosition.z + offsetZ
      }

      logBug('info', 'Position calculated', {
        basePosition,
        offset: { x: offsetX, z: offsetZ },
        finalPosition: position
      })

      // Create Streets GL object
      const streetsGLObject: StreetsGLObject = {
        id: objectId,
        type: 'custom',
        position,
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: scaleFactor, y: scaleFactor, z: scaleFactor }, // Scale 1m base geometry to final size
        color,
        visible: true,
        geometry: {
          positions: new Float32Array(geometry.positions),
          normals: new Float32Array(geometry.normals),
          indices: geometry.indices.length > 0 ? new Uint32Array(geometry.indices) : undefined,
          uvs: geometry.uvs.length > 0 ? new Float32Array(geometry.uvs) : undefined
        },
        metadata: {
          name: `${selectedType} ${placedObjects.length + 1}`,
          type: selectedType,
          createdBy: 'StreetsGLDemo'
        }
      }

      setStatus(`Placing ${selectedType}...`)
      logBug('info', 'Sending object to Streets GL', {
        objectId,
        position,
        geometrySize: {
          positions: geometry.positions.length,
          normals: geometry.normals.length,
          indices: geometry.indices.length,
          uvs: geometry.uvs.length
        }
      })

      // Add object to Streets GL ("queued" counts as success - it will be added on ready)
      const addResult = await bridge.addObject(streetsGLObject)
      const success = addResult.success || addResult.queued

      if (success) {
        setStatus(`✅ ${selectedType} placed successfully!`)
        logBug('success', `${selectedType} placed successfully`, {
          objectId,
          position,
          color
        })
        
        // Add to placed objects list
        const newObject: PlacedObject = {
          id: objectId,
          type: selectedType,
          position,
          color
        }
        setPlacedObjects(prev => [...prev, newObject])
        
        // Automatically zoom to the newly placed object
        setTimeout(() => {
          zoomToObject(newObject)
        }, 500) // Small delay to ensure object is rendered
      } else {
        const errorMsg = `Failed to place ${selectedType}`
        setStatus(`❌ ${errorMsg}. Check console for errors.`)
        logBug('error', errorMsg, {
          objectId,
          position,
          note: 'Bridge returned false - check Streets GL console'
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[StreetsGLDemo] Error placing object:', error)
      setStatus(`❌ Error: ${errorMsg}`)
      logBug('error', 'Exception while placing object', {
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
        type: selectedType
      })
    }
  }


  /**
   * Zoom to a placed object
   */
  const zoomToObject = (obj: PlacedObject) => {
    if (!streetsGLBridge || !bridgeReady) {
      logBug('warning', 'Cannot zoom to object - bridge not ready')
      return
    }

    const bridge = streetsGLBridge as StreetsGLBridge

    try {
      // Convert Streets GL position back to lat/lon
      const { lat, lon } = streetsGLToLatLon(obj.position.x, obj.position.z)
      
      logBug('info', `Zooming to ${obj.type}`, {
        objectId: obj.id,
        streetsGLPosition: obj.position,
        calculatedLatLon: { lat, lon }
      })

      // Navigate Streets GL camera to the object with good view
      // For 1000m cubes, use pitch 30° and distance 2000m to see the entire massive cube
      // The cube is 1000m x 1000m x 1000m, so we need to be far enough to see it all
      bridge.navigateTo(lat, lon, undefined, 30, 0, 2000)
      
      logBug('success', `Camera navigated to ${obj.type}`, {
        lat,
        lon,
        zoom: 20,
        height: 20
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logBug('error', 'Error zooming to object', {
        error: errorMsg,
        objectId: obj.id
      })
    }
  }

  /**
   * Zoom to all placed objects (center view on all objects)
   */
  const zoomToAllObjects = () => {
    if (placedObjects.length === 0) {
      logBug('warning', 'No objects to zoom to')
      return
    }

    if (!streetsGLBridge || !bridgeReady) {
      logBug('warning', 'Cannot zoom to objects - bridge not ready')
      return
    }

    const bridge = streetsGLBridge as StreetsGLBridge

    try {
      // Calculate center of all objects
      let sumLat = 0
      let sumLon = 0
      let count = 0

      for (const obj of placedObjects) {
        const { lat, lon } = streetsGLToLatLon(obj.position.x, obj.position.z)
        sumLat += lat
        sumLon += lon
        count++
      }

      const centerLat = sumLat / count
      const centerLon = sumLon / count

      logBug('info', 'Zooming to center of all objects', {
        objectCount: count,
        centerLat,
        centerLon
      })

      // Navigate to center with close view to see all objects clearly
      // Use distance 1000 to see the 1000m cube from a good viewing angle
      bridge.navigateTo(centerLat, centerLon, undefined, 45, 0, 1000)
      
      logBug('success', 'Camera navigated to center of objects', {
        centerLat,
        centerLon,
        zoom: 18,
        height: 100
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logBug('error', 'Error zooming to all objects', {
        error: errorMsg,
        objectCount: placedObjects.length
      })
    }
  }

  /**
   * Clear all placed objects
   */
  const clearObjects = async () => {
    if (!streetsGLBridge || !bridgeReady) {
      logBug('warning', 'Cannot clear objects - bridge not ready')
      return
    }

    const bridge = streetsGLBridge as StreetsGLBridge

    try {
      const objectCount = placedObjects.length
      setStatus('Clearing objects...')
      logBug('info', `Clearing ${objectCount} objects`)
      
      // Remove all objects
      for (const obj of placedObjects) {
        await bridge.removeObject(obj.id)
        logBug('info', `Removed object ${obj.id}`, { type: obj.type })
      }

      setPlacedObjects([])
      setStatus(`✅ Cleared ${objectCount} objects`)
      logBug('success', `Cleared ${objectCount} objects`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[StreetsGLDemo] Error clearing objects:', error)
      setStatus(`❌ Error clearing objects: ${errorMsg}`)
      logBug('error', 'Error clearing objects', {
        error: errorMsg,
        objectCount: placedObjects.length
      })
    }
  }

  /**
   * Duplicate the selected building and place it on top, painted red
   */
  const duplicateBuildingRed = async () => {
    if (!streetsGLBridge || !bridgeReady) {
      logBug('warning', 'Cannot paint building - bridge not ready')
      setStatus('❌ Bridge not ready')
      return
    }

    const bridge = streetsGLBridge as StreetsGLBridge

    try {
      setStatus('Getting selected building...')
      logBug('info', 'Requesting selected building position')

      // Request selected building position and size
      const success = await bridge.requestSelectedBuilding(async (
        position: { x: number; y: number; z: number },
        estimatedHeight: number,
        buildingSize?: { width: number; height: number; depth: number } | null,
        buildingBounds: {
          min: { x: number; y: number; z: number }
          max: { x: number; y: number; z: number }
          center: { x: number; y: number; z: number }
          size: { width: number; height: number; depth: number }
        } | null = null
      ) => {
        try {
          logBug('info', 'Building data received', {
            position,
            estimatedHeight,
            buildingSize,
            buildingBounds
          })

          // Use actual building dimensions if available, otherwise use estimated height
          const buildingWidth = buildingSize?.width || estimatedHeight
          const buildingHeight = buildingSize?.height || estimatedHeight
          const buildingDepth = buildingSize?.depth || estimatedHeight
          
          setStatus('Creating red building duplicate...')
          
          // Generate unique ID
          const objectId = `building_duplicate_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
          
          // Create box geometry matching the building's dimensions
          // We'll create a box that matches the building's footprint and height
          const geometry = createPrimitiveGeometry('box', buildingWidth, buildingHeight, buildingDepth)
          
          // Red color
          const color = {
            r: 1.0,  // Red
            g: 0.0,  // No green
            b: 0.0   // No blue
          }

          // Position the duplicate on top of the original building
          // The position.y already accounts for placing it on top
          const duplicatePosition = {
            x: position.x,
            y: position.y, // Already calculated to be on top
            z: position.z
          }

          logBug('info', 'Creating red building duplicate', {
            objectId,
            position: duplicatePosition,
            buildingWidth,
            buildingHeight,
            buildingDepth
          })

          const streetsGLObject: StreetsGLObject = {
            id: objectId,
            type: 'custom',
            position: duplicatePosition,
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            color,
            visible: true,
            geometry: {
              positions: new Float32Array(geometry.positions),
              normals: new Float32Array(geometry.normals),
              indices: geometry.indices.length > 0 ? new Uint32Array(geometry.indices) : undefined,
              uvs: geometry.uvs.length > 0 ? new Float32Array(geometry.uvs) : undefined
            },
            metadata: {
              name: `Red Building Duplicate`,
              type: 'box',
              createdBy: 'StreetsGLDemo',
              buildingId: position
            }
          }

          setStatus('Placing red building duplicate...')
          const addObjResult = await bridge.addObject(streetsGLObject)
          const addSuccess = addObjResult.success || addObjResult.queued

          if (addSuccess) {
            const newObject: PlacedObject = {
              id: objectId,
              type: 'box',
              position: duplicatePosition,
              color
            }

            setPlacedObjects([...placedObjects, newObject])
            setStatus('✅ Building duplicated and painted red!')
            logBug('success', 'Building duplicated and painted red', {
              objectId,
              position: duplicatePosition,
              buildingWidth,
              buildingHeight,
              buildingDepth
            })

            // Zoom to the painted building
            setTimeout(() => {
              zoomToObject(newObject)
            }, 500)
          } else {
            setStatus('❌ Failed to place red box')
            logBug('error', 'Failed to place red box on building')
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          console.error('[StreetsGLDemo] Error painting building:', error)
          setStatus(`❌ Error: ${errorMsg}`)
          logBug('error', 'Error painting building', {
            error: errorMsg
          })
        }
      })

      if (!success) {
        setStatus('❌ No building selected. Click on a building in Streets GL first.')
        logBug('warning', 'No building selected', {
          note: 'User must click on a building in Streets GL to select it first'
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[StreetsGLDemo] Error painting building:', error)
      setStatus(`❌ Error: ${errorMsg}`)
      logBug('error', 'Exception while painting building', {
        error: errorMsg
      })
    }
  }

  /**
   * Place a large red plane covering the entire view
   */
  const placeLargeRedPlane = async () => {
    if (!streetsGLBridge || !bridgeReady) {
      const errorMsg = 'Bridge not ready. Make sure Streets GL is enabled and loaded.'
      setStatus(`❌ ${errorMsg}`)
      logBug('error', errorMsg, { 
        hasBridge: !!streetsGLBridge, 
        bridgeReady 
      })
      return
    }

    const bridge = streetsGLBridge as StreetsGLBridge

    try {
      logBug('info', 'Starting to place large red plane', {})
      
      // Generate unique ID
      const objectId = `plane_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      
      // Create a huge plane: 5000m x 5000m (covers entire view)
      const planeSize = 5000 // 5000 meters
      const geometry = createPrimitiveGeometry('plane', planeSize)
      
      logBug('info', 'Plane geometry created', {
        size: planeSize,
        vertexCount: geometry.positions.length / 3,
        hasNormals: geometry.normals.length > 0,
        hasIndices: geometry.indices.length > 0,
        hasUVs: geometry.uvs.length > 0
      })
      
      // Bright red color
      const color = {
        r: 1.0,  // Red
        g: 0.0,  // No green
        b: 0.0   // No blue
      }

      // Position plane at camera view center, closer to camera for better visibility
      // Place it at 50m above ground, or at camera height if camera is lower
      const planeHeight = 50 // 50 meters above ground (closer, more visible)
      
      // Get camera position and ground target
      const basePosition = await new Promise<{ x: number; y: number; z: number }>((resolve) => {
        let resolved = false
        
        bridge.requestCameraPosition((payload) => {
          if (resolved) return
          resolved = true
          const cameraPos = payload.cameraPosition
          const groundTarget = payload.cameraTarget
          // Use groundTarget if available (where camera ray intersects ground plane)
          const targetPos = groundTarget || {
            x: cameraPos.x,
            y: 0,
            z: cameraPos.z
          }
          
          // Place plane at ground target position, but at planeHeight above ground
          const pos = {
            x: targetPos.x,
            y: planeHeight, // 100m above ground
            z: targetPos.z
          }
          
          logBug('info', 'Using camera ground target for plane placement', {
            cameraPosition: cameraPos,
            groundTarget: targetPos,
            planePosition: pos,
            note: 'Plane placed at camera view center on ground, elevated to 100m'
          })
          
          resolve(pos)
        })
        
        // Fallback: Use map center coordinates if camera position not received within 500ms
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            const mapLat = streetsGLGroundLat || 32.899072732600196
            const mapLon = streetsGLGroundLon || -97.03823503010045
            
            // Convert to Streets GL coordinates
            const pos = latLonToStreetsGL(mapLat, mapLon, planeHeight)
            
            console.warn('[StreetsGLDemo] Camera position not received, using map center fallback')
            logBug('info', 'Using map center coordinates (camera position timeout)', {
              mapLat,
              mapLon,
              planePosition: pos
            })
            
            resolve(pos)
          }
        }, 500)
      })
      
      // Verify position is reasonable
      if (!isFinite(basePosition.x) || !isFinite(basePosition.y) || !isFinite(basePosition.z)) {
        console.error('[StreetsGLDemo] ❌ Invalid position calculated!', basePosition)
        logBug('error', 'Invalid position calculated', { basePosition, planeHeight })
        return
      }

      const position = {
        x: basePosition.x,
        y: basePosition.y, // 100m above ground
        z: basePosition.z
      }

      logBug('info', 'Plane position calculated', {
        position,
        size: planeSize,
        height: planeHeight
      })

      // Create Streets GL object
      // Plane is in XZ plane, so we scale X and Z, but keep Y scale at 1 (plane has no Y dimension)
      const streetsGLObject: StreetsGLObject = {
        id: objectId,
        type: 'custom',
        position,
        rotation: { x: 0, y: 0, z: 0 }, // No rotation - plane is horizontal
        scale: { x: planeSize, y: 1, z: planeSize }, // Scale X and Z to planeSize, Y stays 1
        color,
        visible: true,
        geometry: {
          positions: new Float32Array(geometry.positions),
          normals: new Float32Array(geometry.normals),
          indices: geometry.indices.length > 0 ? new Uint32Array(geometry.indices) : undefined,
          uvs: geometry.uvs.length > 0 ? new Float32Array(geometry.uvs) : undefined
        },
        metadata: {
          name: `Large Red Plane`,
          type: 'plane',
          size: planeSize
        }
      }

      // Add to Streets GL ("queued" counts as success - it will be added on ready)
      const planeAddResult = await bridge.addObject(streetsGLObject)
      const success = planeAddResult.success || planeAddResult.queued
      
      if (success) {
        const newObject: PlacedObject = {
          id: objectId,
          type: 'plane',
          position,
          color
        }
        
        setPlacedObjects(prev => [...prev, newObject])
        setStatus(`✅ Large red plane placed successfully!`)
        logBug('success', 'Large red plane placed successfully', {
          objectId,
          position,
          size: planeSize,
          color
        })
        
        // Zoom to the plane with a better angle to see it
        setTimeout(() => {
          const latLon = streetsGLToLatLon(position.x, position.z)
          // Use a lower pitch (more horizontal view) and closer distance to see the plane better
          bridge.navigateTo(latLon.lat, latLon.lon, undefined, 10, 0, 500)
        }, 500)
      } else {
        setStatus('❌ Failed to place plane')
        logBug('error', 'Failed to place plane')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[StreetsGLDemo] Error placing plane:', error)
      setStatus(`❌ Error: ${errorMsg}`)
      logBug('error', 'Error placing plane', {
        error: errorMsg
      })
    }
  }

  if (!isVisible) {
    return (
      <div className="streets-gl-demo-launcher">
        <button 
          onClick={() => setIsVisible(true)}
          className="demo-launcher-button"
          title="Open Streets GL Demo"
        >
          🗺️ Streets GL Demo
        </button>
      </div>
    )
  }

  return (
    <div className="streets-gl-demo">
      <div className="streets-gl-demo-header">
        <h3>🗺️ Streets GL Demo</h3>
        <button 
          onClick={() => setIsVisible(false)}
          className="close-button"
          title="Close demo"
        >
          ×
        </button>
      </div>

      <div className="streets-gl-demo-content">
        <div className="demo-status">
          <div className={`status-indicator ${bridgeReady ? 'ready' : 'waiting'}`}>
            {bridgeReady ? '●' : '○'}
          </div>
          <span>{status || 'Initializing...'}</span>
        </div>

        {!streetsGLIframeOverlay && (
          <div className="demo-warning">
            <strong>⚠️ Streets GL not enabled</strong>
            <p>Enable Streets GL in the "OSM 3D" panel first.</p>
          </div>
        )}

        {streetsGLIframeOverlay && !bridgeReady && (
          <div className="demo-info">
            <p>Waiting for Streets GL bridge to initialize...</p>
            <p className="help-text">Make sure Streets GL server is running on http://localhost:8081</p>
          </div>
        )}

        {bridgeReady && (
          <>
            <div className="demo-section">
              <h4>Primitive Type</h4>
              <div className="primitive-buttons">
                {(['box', 'sphere', 'cylinder', 'cone'] as PrimitiveType[]).map(type => (
                  <button
                    key={type}
                    className={`primitive-button ${selectedType === type ? 'active' : ''}`}
                    onClick={() => setSelectedType(type)}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="demo-section">
              <button
                onClick={placeObject}
                className="place-button"
                disabled={!bridgeReady}
              >
                Place {selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
              </button>
            </div>

            <div className="demo-section">
              <button
                onClick={placeLargeRedPlane}
                className="place-button"
                disabled={!bridgeReady}
                style={{
                  background: 'rgba(244, 67, 54, 0.3)',
                  border: '2px solid rgba(244, 67, 54, 0.8)',
                  color: '#f44336',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                🔴 Place Large Red Plane (5000m x 5000m)
              </button>
              <p style={{ fontSize: '11px', color: '#888', marginTop: '4px', marginBottom: '8px' }}>
                Places a huge red plane covering the entire view at 100m height
              </p>
            </div>

            <div className="demo-section">
              <button
                onClick={duplicateBuildingRed}
                className="place-button"
                disabled={!bridgeReady}
                style={{
                  background: 'rgba(244, 67, 54, 0.2)',
                  border: '1px solid rgba(244, 67, 54, 0.6)',
                  color: '#f44336'
                }}
              >
                🏗️ Duplicate Building (Red on Top)
              </button>
              <p style={{ fontSize: '11px', color: '#888', marginTop: '4px', marginBottom: 0 }}>
                Click on a building in Streets GL first, then click this button to duplicate it on top in red
              </p>
            </div>

            {placedObjects.length > 0 && (
              <div className="demo-section">
                <div className="objects-list-header">
                  <h4>Placed Objects ({placedObjects.length})</h4>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={zoomToAllObjects}
                      className="zoom-button"
                      title="Zoom to all objects"
                      style={{
                        padding: '6px 10px',
                        fontSize: '11px',
                        background: 'rgba(33, 150, 243, 0.2)',
                        border: '1px solid rgba(33, 150, 243, 0.4)',
                        borderRadius: '4px',
                        color: '#2196f3',
                        cursor: 'pointer'
                      }}
                    >
                      🔍 Zoom All
                    </button>
                    <button
                      onClick={clearObjects}
                      className="clear-button"
                      title="Remove all objects"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="objects-list">
                  {placedObjects.map((obj, index) => (
                    <div key={obj.id} className="object-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        <div 
                          className="color-indicator"
                          style={{ backgroundColor: `rgb(${Math.round(obj.color.r * 255)}, ${Math.round(obj.color.g * 255)}, ${Math.round(obj.color.b * 255)})` }}
                        />
                        <span>{obj.type} #{index + 1}</span>
                      </div>
                      <button
                        onClick={() => zoomToObject(obj)}
                        className="zoom-button"
                        title={`Zoom to ${obj.type} #${index + 1}`}
                        style={{
                          padding: '4px 8px',
                          fontSize: '10px',
                          background: 'rgba(33, 150, 243, 0.2)',
                          border: '1px solid rgba(33, 150, 243, 0.4)',
                          borderRadius: '4px',
                          color: '#2196f3',
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        🔍
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="demo-section">
              <h4>Instructions</h4>
              <ol className="instructions-list">
                <li>Select a primitive type (box, sphere, cylinder, or cone)</li>
                <li>Click "Place [Type]" to add it to the Streets GL scene</li>
                <li>Objects appear at random positions near the map center</li>
                <li>Objects are rendered by Streets GL engine (not iframe overlay)</li>
                <li>Use "Clear All" to remove all placed objects</li>
              </ol>
            </div>

            <div className="demo-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4>Bug Log ({bugLogs.length})</h4>
                <button
                  onClick={() => setBugLogs([])}
                  className="clear-button"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  title="Clear bug log"
                >
                  Clear
                </button>
              </div>
              <div 
                ref={bugLogRef}
                className="bug-log"
                style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                {bugLogs.length === 0 ? (
                  <div style={{ color: '#666', fontStyle: 'italic' }}>No logs yet...</div>
                ) : (
                  bugLogs.map((log, index) => (
                    <div
                      key={index}
                      style={{
                        marginBottom: '4px',
                        padding: '4px',
                        borderRadius: '2px',
                        backgroundColor: log.type === 'error' ? 'rgba(244, 67, 54, 0.1)' :
                                        log.type === 'warning' ? 'rgba(255, 152, 0, 0.1)' :
                                        log.type === 'success' ? 'rgba(76, 175, 80, 0.1)' :
                                        'rgba(33, 150, 243, 0.1)',
                        borderLeft: `3px solid ${
                          log.type === 'error' ? '#f44336' :
                          log.type === 'warning' ? '#ff9800' :
                          log.type === 'success' ? '#4caf50' :
                          '#2196f3'
                        }`
                      }}
                    >
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                        <span style={{ 
                          color: log.type === 'error' ? '#f44336' :
                                 log.type === 'warning' ? '#ff9800' :
                                 log.type === 'success' ? '#4caf50' :
                                 '#2196f3',
                          fontWeight: 'bold',
                          fontSize: '10px',
                          minWidth: '50px'
                        }}>
                          [{log.type.toUpperCase()}]
                        </span>
                        <span style={{ color: '#aaa', fontSize: '10px' }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span style={{ color: '#fff', flex: 1 }}>{log.message}</span>
                      </div>
                      {log.details && (
                        <details style={{ marginTop: '4px', marginLeft: '60px' }}>
                          <summary style={{ cursor: 'pointer', color: '#888', fontSize: '10px' }}>
                            Details
                          </summary>
                          <pre style={{ 
                            marginTop: '4px', 
                            fontSize: '9px', 
                            color: '#aaa',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

