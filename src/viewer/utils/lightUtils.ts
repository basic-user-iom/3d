import * as THREE from 'three'
import { useAppStore } from '../../store/useAppStore'
import type { DirectionalLightConfig, LightType } from '../../store/useAppStore'
import {
  PHYSICAL_DIRECTIONAL_SHADOW_BIAS,
  PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS,
  PHYSICAL_DIRECTIONAL_SHADOW_RADIUS,
  PHYSICAL_OMNI_SHADOW_FAR_INITIAL,
  applyPhysicalOmnidirectionalShadowDefaults
} from './physicalShadowSettings'

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
  const hour = ((timeOfDay % 24) + 24) % 24

  // Full 24h solar arc: sunrise/sunset at 6 & 18, zenith at noon, nadir at midnight
  const dayPhase = ((hour - 6) / 12) * Math.PI
  const elevation = Math.sin(dayPhase) * (Math.PI / 2)

  // Azimuth sweeps east → south → west → north over 24h (6am ≈ east)
  const offsetRad = THREE.MathUtils.degToRad(northOffset)
  const azimuth = ((hour - 6) / 24) * Math.PI * 2 + offsetRad

  // Convert elevation/azimuth to sun position vector for Three.js Sky
  // Three.js Sky expects sunPosition as a normalized direction vector
  const phi = Math.PI / 2 - elevation // Convert elevation to zenith angle
  const theta = azimuth
  const sunPosition = new THREE.Vector3()
  sunPosition.setFromSphericalCoords(1, phi, theta)

  return { elevation, azimuth, sunPosition }
}

/** Minimum sun elevation (Y) for standalone weather — keeps sun above horizon */
export const STANDALONE_MIN_SUN_ELEVATION_Y = 0.05

export interface SunLightingParams {
  sunIntensity: number
  sunColor: string
  ambientIntensity: number
  ambientColor: string
  toneMappingExposure: number
}

function lerpHexColor(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a)
  const cb = new THREE.Color(b)
  return `#${ca.lerp(cb, t).getHexString()}`
}

/**
 * Physically-motivated sun + ambient fill from solar elevation (radians).
 * Low sun: warm but desaturated direct light, cool sky hemisphere fill, exposure lift
 * so metallic PBR materials keep base color in shadow (not crushed to black).
 */
export function computeSunLightingFromElevation(elevation: number): SunLightingParams {
  if (elevation < -0.02) {
    return {
      sunIntensity: 0.05,
      sunColor: '#6688cc',
      ambientIntensity: 0.18,
      ambientColor: '#3a4a6a',
      toneMappingExposure: 0.85
    }
  }

  const aboveHorizon = THREE.MathUtils.smoothstep(elevation, -0.02, 0.08)
  const goldenHour = 1 - THREE.MathUtils.smoothstep(elevation, 0.06, 0.38)
  const dayFactor = THREE.MathUtils.clamp(elevation / (Math.PI / 2), 0, 1)

  const elevationIntensity = 0.32 + 0.68 * Math.pow(dayFactor, 0.55)
  const sunIntensity = aboveHorizon * elevationIntensity

  const sunColor =
    goldenHour > 0.01
      ? lerpHexColor('#ffffff', '#ffd0a0', goldenHour * 0.8)
      : '#ffffff'

  const baseAmbient = 0.36 + 0.24 * Math.pow(dayFactor, 0.45)
  const goldenAmbientFloor = 0.42
  const ambientIntensity =
    goldenHour > 0.2
      ? Math.max(baseAmbient + goldenHour * 0.12, goldenAmbientFloor)
      : baseAmbient

  const ambientColor =
    goldenHour > 0.01
      ? lerpHexColor('#c8d8ec', '#dcc8b0', goldenHour * 0.5)
      : lerpHexColor('#d0d8e8', '#f0f0f0', dayFactor * 0.35)

  const toneMappingExposure = 1.0 + goldenHour * 0.1

  return { sunIntensity, sunColor, ambientIntensity, ambientColor, toneMappingExposure }
}

/**
 * Normalized direction toward the sun in the sky (from scene origin).
 */
export function normalizeSunSkyDirection(sunSkyDirection: THREE.Vector3): THREE.Vector3 {
  return sunSkyDirection.clone().normalize()
}

/** Base rotation applied to HDR environment maps to fix sky/ground inversion (matches HDRSystem). */
export const HDR_ENV_BASE_ROTATION_X = Math.PI
export const HDR_ENV_BASE_ROTATION_Y = Math.PI

const _hdrSunRotationEuler = new THREE.Euler()

/**
 * Rotate sky sun direction with HDR azimuth/elevation so directional shadows align with IBL.
 * Mirrors scene.environmentRotation in HDRSystem.applyRotationToScene.
 */
export function computeHdrSyncedSunSkyDirection(
  baseSkySunDir: THREE.Vector3,
  hdrRotationAzimuthDeg: number,
  hdrRotationElevationDeg: number
): THREE.Vector3 {
  const normalizedAzimuth = ((hdrRotationAzimuthDeg % 360) + 360) % 360
  const clampedElevation = THREE.MathUtils.clamp(hdrRotationElevationDeg, -90, 90)
  const azimuthRad = THREE.MathUtils.degToRad(normalizedAzimuth)
  const elevationRad = THREE.MathUtils.degToRad(clampedElevation)

  _hdrSunRotationEuler.set(
    elevationRad + HDR_ENV_BASE_ROTATION_X,
    azimuthRad + HDR_ENV_BASE_ROTATION_Y,
    0,
    'YXZ'
  )
  return normalizeSunSkyDirection(baseSkySunDir).applyEuler(_hdrSunRotationEuler)
}

/**
 * Direction sunlight travels through the scene (opposite of sky sun direction).
 * Matches Three.js DirectionalLight: target - position when the light sits along sunSkyDirection.
 */
export function sunSkyDirectionToLightTravelDirection(sunSkyDirection: THREE.Vector3): THREE.Vector3 {
  return normalizeSunSkyDirection(sunSkyDirection).negate()
}

/**
 * Directional sun light position so rays travel from sky toward the scene.
 */
export function sunSkyDirectionToLightPosition(
  sunSkyDirection: THREE.Vector3,
  distance = 1000
): THREE.Vector3 {
  return normalizeSunSkyDirection(sunSkyDirection).multiplyScalar(distance)
}

/** True when the sun is below the horizon for the given time of day. */
export function isNightTimeOfDay(timeOfDay: number): boolean {
  const hour = ((timeOfDay % 24) + 24) % 24
  return hour < 6 || hour > 18
}

/**
 * Direction for sky shader / moon — never clamped below the horizon.
 */
export function standaloneSkySunDirection(
  sunSkyDirection: THREE.Vector3
): THREE.Vector3 {
  return normalizeSunSkyDirection(sunSkyDirection)
}

/**
 * Direction for CSM and directional lights — clamped above the horizon so shadows stay stable.
 */
export function standaloneLightSunDirection(
  sunSkyDirection: THREE.Vector3,
  minElevationY = STANDALONE_MIN_SUN_ELEVATION_Y
): THREE.Vector3 {
  return clampStandaloneSunSkyDirection(sunSkyDirection, minElevationY)
}

/**
 * Clamp standalone weather sun so it never drops below the horizon.
 */
export function clampStandaloneSunSkyDirection(
  sunSkyDirection: THREE.Vector3,
  minElevationY = STANDALONE_MIN_SUN_ELEVATION_Y
): THREE.Vector3 {
  const dir = normalizeSunSkyDirection(sunSkyDirection)
  if (dir.y >= minElevationY) {
    return dir
  }

  const horizontalLength = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
  if (horizontalLength < 0.001) {
    return new THREE.Vector3(0, minElevationY, 1).normalize()
  }

  const horizontalScale = Math.sqrt(Math.max(0, 1 - minElevationY * minElevationY))
  const azimuth = Math.atan2(dir.z, dir.x)
  return new THREE.Vector3(
    Math.cos(azimuth) * horizontalScale,
    minElevationY,
    Math.sin(azimuth) * horizontalScale
  )
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
      light.shadow.bias = PHYSICAL_DIRECTIONAL_SHADOW_BIAS
      light.shadow.normalBias = PHYSICAL_DIRECTIONAL_SHADOW_NORMAL_BIAS
      if (light instanceof THREE.DirectionalLight) {
        light.shadow.radius = config.shadowRadius ?? PHYSICAL_DIRECTIONAL_SHADOW_RADIUS
      }

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
        light.shadow.camera.near = 0.001
        light.shadow.camera.far = PHYSICAL_OMNI_SHADOW_FAR_INITIAL
        applyPhysicalOmnidirectionalShadowDefaults(light)
      } else if (light instanceof THREE.SpotLight) {
        light.shadow.camera.near = 0.001
        light.shadow.camera.far = PHYSICAL_OMNI_SHADOW_FAR_INITIAL
        light.shadow.camera.fov = (config.angle ?? Math.PI / 6) * (180 / Math.PI)
        applyPhysicalOmnidirectionalShadowDefaults(light)
      }
    }
  }

  return light
}

