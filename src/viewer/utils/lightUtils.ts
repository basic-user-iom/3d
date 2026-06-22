import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import type { DirectionalLightConfig, LightType } from '../../store/useAppStore'

/**
 * Converts time of day (0-24 hours) and north offset (degrees) to sun elevation and azimuth
 * @param timeOfDay Hours (0-24)
 * @param northOffset Degrees (-180 to 180)
 * @returns Object with elevation (radians, 0=horizon, PI/2=zenith) and azimuth (radians, 0=north)
 */
export function timeOfDayToSkyAngles(
  timeOfDay: number,
  northOffset: number
): { elevation: number; azimuth: number; sunPosition: THREE.Vector3 } {
  const hour = timeOfDay
  let elevation = 0

  // Calculate elevation: 0 (horizon) to PI/2 (zenith)
  if (hour >= 6 && hour <= 18) {
    // Daytime: sun arc from 6am to 6pm
    const sunAngle = ((hour - 6) / 12) * Math.PI // 0 (sunrise) to PI (sunset)
    elevation = Math.sin(sunAngle) * (Math.PI / 2) // Convert to radians: 0 to PI/2
  } else {
    // Night: sun below horizon (negative elevation)
    elevation = -0.1
  }

  // Calculate azimuth: 0 = north, PI/2 = east, PI = south, 3*PI/2 = west
  // 6am = East (PI/2), 12pm = South (PI), 6pm = West (3*PI/2)
  const baseAngle = ((hour - 6) / 12) * Math.PI
  const offsetRad = THREE.MathUtils.degToRad(northOffset)
  const azimuth = baseAngle + offsetRad

  // Convert elevation/azimuth to sun position vector for Three.js Sky
  // Three.js Sky expects sunPosition as a normalized direction vector
  const phi = Math.PI / 2 - elevation // Convert elevation to zenith angle
  const theta = azimuth
  const sunPosition = new THREE.Vector3()
  sunPosition.setFromSphericalCoords(1, phi, theta)

  return { elevation, azimuth, sunPosition }
}

/**
 * Computes the direction vector of a light (for directional and spot lights)
 */
export function computeLightDirection(light: THREE.Light): THREE.Vector3 | null {
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
    const direction = new THREE.Vector3()
    direction.subVectors(light.target.position, light.position).normalize()
    return direction
  }
  return null
}

/**
 * Creates a light of the specified type with physical properties
 * Supports: directional, point, spot, rectarea, hemisphere
 */
export function createLight(config: DirectionalLightConfig, scene: THREE.Scene): THREE.Light {
  const lightType = config.type || 'directional'
  const color = config.color || '#ffffff'
  const intensity = config.intensity ?? 1.0
  const pos = config.position || { x: 0, y: 0, z: 0 }

  let light: THREE.Light

  switch (lightType) {
    case 'point': {
      // Point light with physical properties (like a light bulb)
      const pointLight = new THREE.PointLight(
        new THREE.Color(color),
        intensity,
        config.distance ?? 100, // Distance at which intensity reaches zero
        config.decay ?? 2 // Physically realistic decay (2 = inverse square law)
      )
      pointLight.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)
      if (config.power !== undefined) {
        // Convert lumens to intensity (approximate conversion)
        pointLight.power = config.power
      }
      light = pointLight
      break
    }

    case 'spot': {
      // Spot light with physical properties (like a spotlight)
      const spotLight = new THREE.SpotLight(
        new THREE.Color(color),
        intensity,
        config.distance ?? 100,
        config.angle ?? Math.PI / 6, // 30 degrees default
        config.penumbra ?? 0.2, // Soft edge
        config.decay ?? 2
      )
      spotLight.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)

      // Set target if provided
      if (config.target) {
        spotLight.target.position.set(
          config.target.x ?? 0,
          config.target.y ?? 0,
          config.target.z ?? 0
        )
        scene.add(spotLight.target)
      } else {
        // Default target straight down
        spotLight.target.position.set(pos.x ?? 0, (pos.y ?? 0) - 10, pos.z ?? 0)
        scene.add(spotLight.target)
      }

      if (config.power !== undefined) {
        spotLight.power = config.power
      }
      light = spotLight
      break
    }

    case 'rectarea': {
      // Rectangular area light (physically-based, like a panel light)
      const rectLight = new THREE.RectAreaLight(
        new THREE.Color(color),
        intensity,
        config.width ?? 10,
        config.height ?? 10
      )
      rectLight.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)

      // Set target/rotation if provided
      // RectAreaLight uses lookAt() to control direction (unlike DirectionalLight/SpotLight which use target)
      if (config.target) {
        // Calculate direction vector from light position to target
        const targetPos = new THREE.Vector3(
          config.target.x ?? 0,
          config.target.y ?? 0,
          config.target.z ?? 0
        )
        // Use lookAt to orient the light panel toward the target
        rectLight.lookAt(targetPos)
      } else {
        // Default: point straight down from light position
        const defaultTargetY = (pos.y ?? 0) - 10
        rectLight.lookAt(pos.x ?? 0, defaultTargetY, pos.z ?? 0)
      }

      if (config.power !== undefined) {
        rectLight.power = config.power
      }
      light = rectLight
      break
    }

    case 'hemisphere': {
      // Hemisphere light (sky and ground colors, like ambient sky light)
      const hemiLight = new THREE.HemisphereLight(
        new THREE.Color(color),
        new THREE.Color(config.groundColor || '#444444'),
        intensity
      )
      hemiLight.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)
      light = hemiLight
      break
    }

    case 'directional':
    default: {
      // Directional light (like sunlight)
      const dirLight = new THREE.DirectionalLight(new THREE.Color(color), intensity)
      dirLight.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)

      // Set target if provided (controls light direction)
      if (config.target) {
        dirLight.target.position.set(
          config.target.x ?? 0,
          config.target.y ?? 0,
          config.target.z ?? 0
        )
        scene.add(dirLight.target)
      } else {
        // Default target: point straight down from light position (not at origin)
        // This makes the light point downward, which is more intuitive
        const defaultTargetY = (pos.y ?? 0) - 10
        dirLight.target.position.set(pos.x ?? 0, defaultTargetY, pos.z ?? 0)
        scene.add(dirLight.target)
      }

      light = dirLight
      break
    }
  }

  light.name = config.name || `${lightType.charAt(0).toUpperCase() + lightType.slice(1)} Light`

  // Mark sun light (must be directional)
  if (config.isSun && lightType === 'directional') {
    light.userData.isSun = true
  }

  // Configure shadows (only for lights that support shadows)
  if (
    config.castShadow &&
    (light instanceof THREE.DirectionalLight ||
      light instanceof THREE.PointLight ||
      light instanceof THREE.SpotLight)
  ) {
    light.castShadow = true

    if (light.shadow) {
      // IMPROVED: Use shadow map size from store (user-configurable)
      const shadowMapSize = useAppStore.getState().shadowMapSize
      light.shadow.mapSize.width = shadowMapSize
      light.shadow.mapSize.height = shadowMapSize
      // Initial bias will be refined in updateShadowCameraBounds based on object size
      // CRITICAL: Use conservative initial bias to prevent shadows leaking through opaque objects
      light.shadow.bias = -0.0002
      // IMPROVED: Use initial normal bias - will be refined in updateShadowCameraBounds
      // Normal bias helps reduce shadow acne on surfaces with sharp angles
      // FIX: Increased minimum normal bias to 0.02 to prevent artifacts (recommended: 0.02-0.05)
      light.shadow.normalBias = 0.02 // Increased from 0.01 to prevent shadow artifacts
      light.shadow.radius = config.shadowRadius ?? 3

      // Configure shadow camera based on light type
      if (light instanceof THREE.DirectionalLight) {
        // CRITICAL: Use very small near plane to capture interior surfaces
        // 0.001 allows the shadow camera to see very close surfaces (like inside a car)
        // This is essential for interior shadows on complex models
        light.shadow.camera.near = 0.001
        light.shadow.camera.far = 5000
        light.shadow.camera.left = -2000
        light.shadow.camera.right = 2000
        light.shadow.camera.top = 2000
        light.shadow.camera.bottom = -2000
        // Shadow camera bounds will be updated at the end via updateAllShadowCameraBounds
      } else if (light instanceof THREE.PointLight) {
        // Use very small near plane for point lights to capture interior shadows
        light.shadow.camera.near = 0.001
        light.shadow.camera.far = config.distance ?? 100
      } else if (light instanceof THREE.SpotLight) {
        // Use very small near plane for spot lights to capture interior shadows
        light.shadow.camera.near = 0.001
        light.shadow.camera.far = config.distance ?? 100
        light.shadow.camera.fov = (config.angle ?? Math.PI / 6) * (180 / Math.PI)
      }
    }
  }

  return light
}

