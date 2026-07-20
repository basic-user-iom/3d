/**
 * Web export weather runtime — shared config helpers + embedded JS for standalone HTML export.
 * Editor uses ViewerCanvas weather systems; export embeds generateWebExportWeatherRuntimeJs().
 */

import * as THREE from 'three'
import {
  WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER,
  WEB_EXPORT_IQ_CLOUD_VERTEX_SHADER,
  webExportIqCloudBand,
  webExportIqRaymarchSteps,
  webExportIqSkyExposure,
  webExportIqWindSpeed
} from './webExportIqCloudSky'

export const WEB_EXPORT_FOG_DENSITY_SCALE = 0.015
export const WEB_EXPORT_WEATHER_GROUND_LEVEL = 0
/** Match editor DynamicSky sphere radius — must fit inside camera far plane */
export const WEB_EXPORT_SKY_SPHERE_RADIUS = 9000
export const WEB_EXPORT_MIN_CAMERA_FAR = WEB_EXPORT_SKY_SPHERE_RADIUS * 1.5
/** Meshes larger than this are treated as sky domes / helpers, not scene subjects */
export const WEB_EXPORT_MAX_SUBJECT_EXTENT = 500
export const WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS = 120
/** Shadow catcher Y — slightly below grid (matches editor ViewerCanvas shadow plane). */
export const WEB_EXPORT_SHADOW_PLANE_GROUND_Y = WEB_EXPORT_WEATHER_GROUND_LEVEL - 0.001
/** Minimum sun Y for standalone shadow lights (matches editor STANDALONE_MIN_SUN_ELEVATION_Y). */
export const WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y = 0.05
/** Max sun Y for shadow-casting lights — keeps noon sun oblique so ground contact shadows stay visible. */
export const WEB_EXPORT_SHADOW_SUN_MAX_Y = 0.72
/** Minimum ShadowMaterial opacity (matches editor hdrGroundShadowCatcher). */
export const WEB_EXPORT_MIN_SHADOW_CATCHER_OPACITY = 0.3
/** Directional sun distance — matches editor sunSkyDirectionToLightPosition default. */
export const WEB_EXPORT_SUN_LIGHT_DISTANCE = 1000
export const WEB_EXPORT_SUN_SHADOW_BIAS = 0.00015
export const WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS = 0.1
/** Lower normal bias for flat grid shadow catcher — 0.1 detaches contact shadows from the plane. */
export const WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS = 0.02
/** Render shadow catcher above grid lines so contact shadows stay visible in export. */
export const WEB_EXPORT_STANDALONE_GRID_SHADOW_CATCHER_RENDER_ORDER = 2
/** Match editor lightProbeUtils — flat ambient reduction when HDR IBL is active */
export const WEB_EXPORT_HDR_AMBIENT_REDUCTION_WITH_SHADOWS = 0.65
export const WEB_EXPORT_HDR_AMBIENT_REDUCTION_NO_SHADOWS = 0.4
export const WEB_EXPORT_HDR_AMBIENT_FLOOR_WITH_SHADOWS = 0.12
export const WEB_EXPORT_HDR_AMBIENT_FLOOR_NO_SHADOWS = 0.35
/** Match editor — lower material envMapIntensity when HDR + shadows so contact shadows stay visible */
export const WEB_EXPORT_HDR_ENV_MAP_INTENSITY_SHADOW_MUL = 0.55
/** Boost direct sun when standalone procedural sky IBL replaces HDR file (weaker than loaded HDR). */
export const WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST = 1.35
/** Tone-mapping lift for standalone procedural IBL exports without a loaded HDR texture. */
export const WEB_EXPORT_STANDALONE_PROCEDURAL_EXPOSURE_BOOST = 1.15
/** envMapIntensity floor for PBR materials under standalone procedural IBL. */
export const WEB_EXPORT_STANDALONE_PROCEDURAL_ENV_MAP_INTENSITY = 1.2
/** envMapIntensity floor for metallic PBR under weak procedural IBL (matches editor metallic boost). */
export const WEB_EXPORT_STANDALONE_PROCEDURAL_METALLIC_ENV_MAP_INTENSITY = 1.5

/** HDR sun intensity multiplier (matches ViewerCanvas hdrSunBoost). */
export function webExportComputeHdrSunBoost(
  hdrEnabled: boolean,
  hdrIntensity: number
): number {
  if (!hdrEnabled) return 1.0
  return THREE.MathUtils.clamp(0.85 + hdrIntensity * 0.35, 1.0, 2.2)
}

/** HDR tone-mapping exposure multiplier (matches ViewerCanvas hdrExposureBoost). */
export function webExportComputeHdrExposureBoost(
  hdrEnabled: boolean,
  hdrIntensity: number
): number {
  if (!hdrEnabled) return 1.0
  return THREE.MathUtils.clamp(0.9 + hdrIntensity * 0.45, 1.0, 2.5)
}

/** HDR ambient fill when scene.environment is active (matches computeHdrAmbientIntensity). */
export function webExportComputeHdrAmbientIntensity(
  sliderAmbient: number,
  shadowsEnabled: boolean,
  hdrEnabled: boolean,
  hdrIntensity: number
): number {
  if (!hdrEnabled) return sliderAmbient
  const sunBoost = webExportComputeHdrSunBoost(true, hdrIntensity)
  const reduction = shadowsEnabled
    ? WEB_EXPORT_HDR_AMBIENT_REDUCTION_WITH_SHADOWS
    : WEB_EXPORT_HDR_AMBIENT_REDUCTION_NO_SHADOWS
  const floor = shadowsEnabled
    ? WEB_EXPORT_HDR_AMBIENT_FLOOR_WITH_SHADOWS
    : WEB_EXPORT_HDR_AMBIENT_FLOOR_NO_SHADOWS
  return Math.max(sliderAmbient * reduction * sunBoost * 0.85, floor)
}

/** Sun boost for standalone weather export — HDR file vs procedural sky IBL. */
export function webExportResolveStandaloneSunBoost(options: {
  hdrTextureLoaded: boolean
  hdrEnabled: boolean
  hdrIntensity: number
  hasSceneEnvironment: boolean
}): number {
  const { hdrTextureLoaded, hdrEnabled, hdrIntensity, hasSceneEnvironment } = options
  if (hdrTextureLoaded) {
    return webExportComputeHdrSunBoost(true, hdrIntensity)
  }
  if (hasSceneEnvironment) {
    return WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST
  }
  if (hdrEnabled) {
    return webExportComputeHdrSunBoost(true, hdrIntensity)
  }
  return 1.0
}

/** Exposure boost for standalone weather export — HDR file vs procedural sky IBL. */
export function webExportResolveStandaloneExposureBoost(options: {
  hdrTextureLoaded: boolean
  hdrEnabled: boolean
  hdrIntensity: number
  hasSceneEnvironment: boolean
}): number {
  const { hdrTextureLoaded, hdrEnabled, hdrIntensity, hasSceneEnvironment } = options
  if (hdrTextureLoaded) {
    return webExportComputeHdrExposureBoost(true, hdrIntensity)
  }
  if (hasSceneEnvironment) {
    return WEB_EXPORT_STANDALONE_PROCEDURAL_EXPOSURE_BOOST
  }
  if (hdrEnabled) {
    return webExportComputeHdrExposureBoost(true, hdrIntensity)
  }
  return 1.0
}

/** Ambient fill for standalone weather — only apply HDR reduction when HDR texture is loaded. */
export function webExportResolveStandaloneAmbientIntensity(
  baseAmbient: number,
  shadowsEnabled: boolean,
  options: {
    hdrTextureLoaded: boolean
    hdrEnabled: boolean
    hdrIntensity: number
    hasSceneEnvironment: boolean
  }
): number {
  const { hdrTextureLoaded, hdrEnabled, hdrIntensity, hasSceneEnvironment } = options
  if (hdrTextureLoaded) {
    return webExportComputeHdrAmbientIntensity(
      baseAmbient,
      shadowsEnabled,
      true,
      hdrIntensity
    )
  }
  if (hasSceneEnvironment) {
    const floor = shadowsEnabled ? 0.28 : 0.38
    return Math.max(baseAmbient * 0.9, floor)
  }
  if (hdrEnabled) {
    return webExportComputeHdrAmbientIntensity(
      baseAmbient,
      shadowsEnabled,
      true,
      hdrIntensity
    )
  }
  return baseAmbient
}

/** Spherical sun angles from time of day (matches embedded export + editor lightUtils). */
export function webExportTimeOfDayToSkyAngles(
  timeOfDay: number,
  northOffset: number
): { elevation: number; azimuth: number; sunPosition: THREE.Vector3 } {
  const hour = ((timeOfDay % 24) + 24) % 24
  const dayPhase = ((hour - 6) / 12) * Math.PI
  const elevation = Math.sin(dayPhase) * (Math.PI / 2)
  const offsetRad = THREE.MathUtils.degToRad(northOffset || 0)
  const azimuth = ((hour - 6) / 24) * Math.PI * 2 + offsetRad
  const phi = Math.PI / 2 - elevation
  const sunPosition = new THREE.Vector3()
  sunPosition.setFromSphericalCoords(1, phi, azimuth)
  return { elevation, azimuth, sunPosition }
}

/** Clamp sun direction above the horizon (matches editor clampStandaloneSunSkyDirection). */
export function webExportClampSunSkyDirection(
  sunSkyDirection: THREE.Vector3,
  minElevationY = WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y
): THREE.Vector3 {
  const dir = sunSkyDirection.clone().normalize()
  if (dir.y >= minElevationY) return dir
  const horizontalLength = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
  if (horizontalLength < 0.001) {
    return new THREE.Vector3(0, minElevationY, 1).normalize()
  }
  const scale = minElevationY / horizontalLength
  return new THREE.Vector3(dir.x * scale, minElevationY, dir.z * scale).normalize()
}

/**
 * Sun direction for shadow-casting directional lights.
 * Sky shader uses true sunPosition; lights cap zenith so noon still casts visible ground shadows.
 */
export function webExportShadowSunSkyDirection(
  timeOfDay: number,
  northOffset: number,
  maxSunY = WEB_EXPORT_SHADOW_SUN_MAX_Y
): THREE.Vector3 {
  const { elevation, azimuth } = webExportTimeOfDayToSkyAngles(timeOfDay, northOffset)
  const maxElevation = Math.asin(Math.min(1, Math.max(WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y, maxSunY)))
  const cappedElevation = elevation < 0 ? elevation : Math.min(elevation, maxElevation)
  const phi = Math.PI / 2 - cappedElevation
  const dir = new THREE.Vector3()
  dir.setFromSphericalCoords(1, phi, azimuth)
  return webExportClampSunSkyDirection(dir)
}

export function webExportShadowCatcherOpacity(shadowIntensity: number): number {
  const raw = 0.1 + (shadowIntensity / 2.0) * 0.9
  return Math.min(1.0, Math.max(WEB_EXPORT_MIN_SHADOW_CATCHER_OPACITY, raw))
}

/** True when export scene includes the editor-style grid helper. */
export function webExportSceneHasGridHelper(scene: THREE.Scene | null | undefined): boolean {
  if (!scene) return false
  let found = false
  scene.traverse((obj) => {
    if (found) return
    if (obj.userData?.isGridHelper === true) found = true
  })
  return found
}

/**
 * Standalone weather + grid: composite ShadowMaterial over grid (depthWrite off, higher renderOrder).
 * depthWrite:true on the catcher blocked shadow darkening against the non-writing grid/background.
 */
export function webExportShouldCompositeShadowCatcherOverGrid(
  standaloneWeather: boolean,
  scene: THREE.Scene | null | undefined
): boolean {
  return standaloneWeather === true && webExportSceneHasGridHelper(scene)
}

export function webExportStandaloneSunNormalBias(standaloneWeather: boolean): number {
  return standaloneWeather
    ? WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS
    : WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS
}

/** Shadow catcher Y — just below subject bottom (matches editor hdrGroundShadowCatcher). */
export function webExportResolveShadowCatcherY(
  carMinY: number | undefined,
  groundProjectionEnabled: boolean,
  groundProjectionY = -0.01
): number {
  if (groundProjectionEnabled) return groundProjectionY
  if (typeof carMinY === 'number' && Number.isFinite(carMinY)) {
    return carMinY - 0.001
  }
  return WEB_EXPORT_SHADOW_PLANE_GROUND_Y
}

/** True when export should use transparent ShadowMaterial ground catcher. */
export function webExportShouldUseShadowCatcher(
  weather: WebExportWeatherConfig | null | undefined,
  hdrEnabled: boolean,
  shadowsEnabled: boolean
): boolean {
  if (!shadowsEnabled) return false
  if (hdrEnabled) return true
  return weather?.enableStandaloneWeather === true
}

/** True when a directional light config represents the sun in web export. */
export function webExportIsSunLightConfig(
  light: { id?: string; isSun?: boolean },
  index: number,
  standaloneWeather: boolean
): boolean {
  if (light.isSun === true || light.id === 'sun') return true
  if (standaloneWeather && index === 0) return true
  return false
}

function normalizeExportObjectName(name: string | undefined): string {
  return (name || '').toLowerCase().replace(/\s+/g, '_')
}

/** Detect editor DynamicSky / weather meshes that must not be exported or used for bounds */
export function isExportedWeatherMeshLike(obj: {
  name?: string
  userData?: Record<string, unknown>
  scale?: { x?: number; y?: number; z?: number }
}): boolean {
  if (!obj) return false
  const ud = obj.userData || {}
  if (
    ud.isDynamicSky === true ||
    ud.isSun === true ||
    ud.isMoon === true ||
    ud.isParticleSystem === true
  ) {
    return true
  }
  const name = normalizeExportObjectName(obj.name)
  if (name.includes('dynamic_sky') || name === 'dynamicsky') return true
  const maxScale = Math.max(
    Math.abs(obj.scale?.x ?? 1),
    Math.abs(obj.scale?.y ?? 1),
    Math.abs(obj.scale?.z ?? 1)
  )
  if (maxScale >= WEB_EXPORT_MAX_SUBJECT_EXTENT) return true
  return false
}

/** Meshes to skip when computing car / subject bounds for shadow plane */
export function shouldExcludeFromSubjectBounds(obj: {
  name?: string
  userData?: Record<string, unknown>
  type?: string
  geometry?: { parameters?: { radius?: number; width?: number; height?: number } }
}): boolean {
  if (!obj) return true
  const ud = obj.userData || {}
  if (
    ud.isDynamicSky === true ||
    ud.isSun === true ||
    ud.isMoon === true ||
    ud.isParticleSystem === true ||
    ud.isShadowPlane === true ||
    ud.isGroundedSkybox === true ||
    ud.isHelper === true
  ) {
    return true
  }
  const name = normalizeExportObjectName(obj.name)
  if (
    name.includes('dynamic_sky') ||
    name.includes('shadow_plane') ||
    name.includes('shadowplane') ||
    name.includes('helper') ||
    name.includes('gizmo')
  ) {
    return true
  }
  const type = obj.type || ''
  if (type.includes('Helper')) return true
  const params = obj.geometry?.parameters
  if (params && typeof params.radius === 'number' && params.radius > WEB_EXPORT_MAX_SUBJECT_EXTENT) {
    return true
  }
  if (params) {
    const w = typeof params.width === 'number' ? params.width : 0
    const h = typeof params.height === 'number' ? params.height : 0
    if (Math.max(w, h) > WEB_EXPORT_MAX_SUBJECT_EXTENT * 2) return true
  }
  return false
}

export interface WebExportWeatherConfig {
  enableStandaloneWeather?: boolean
  preset?: string
  timeOfDay?: number
  northOffset?: number
  dynamicSkyEnabled?: boolean
  sunSize?: number
  moonSize?: number
  weatherQuality?: string
  cloudDensity?: number
  cloudThickness?: number
  cloudDetail?: number
  cloudScale?: number
  cloudStorminess?: number
  cloudShadowStrength?: number
  cloudColor?: string
  fogDensity?: number
  fogHeight?: number
  fogColor?: string
  rainIntensity?: number
  snowIntensity?: number
  windIntensity?: number
  skyTurbidity?: number
  skyAtmosphereDensity?: number
  skyRayleigh?: number
  skyMieCoefficient?: number
  skyMieDirectionalG?: number
  skyExposure?: number
  skyElevation?: number
  skyAzimuth?: number
  rainParticleScale?: number
  rainParticleSpeed?: number
  rainCollisionEnabled?: boolean
  snowParticleScale?: number
  snowParticleSpeed?: number
  snowCollisionEnabled?: boolean
  windGustsEnabled?: boolean
}

/** True when export should use procedural sky dome instead of HDR background (matches editor). */
export function isWebExportStandaloneSkyActive(
  weather: WebExportWeatherConfig | null | undefined,
  hdrConfig: { groundProjectionEnabled?: boolean } | null | undefined
): boolean {
  if (!weather || !isWeatherExportActive(weather)) return false
  if (weather.enableStandaloneWeather !== true) return false
  // Editor creates DynamicSky whenever enableStandaloneWeather is on (dynamicSkyEnabled is legacy).
  if (hdrConfig?.groundProjectionEnabled === true) return false
  return true
}

/** True when export should initialize any weather visuals from CONFIG.weather */
export function isWeatherExportActive(
  weather: WebExportWeatherConfig | null | undefined
): boolean {
  if (!weather) return false
  if (weather.enableStandaloneWeather) return true
  const fog = weather.fogDensity ?? 0
  const rain = weather.rainIntensity ?? 0
  const snow = weather.snowIntensity ?? 0
  const clouds = weather.cloudDensity ?? 0
  return fog > 0 || rain > 0 || snow > 0 || clouds > 0
}

/** Normalize weather block from export config (handles legacy field names). */
export function normalizeWebExportWeatherConfig(
  raw: Record<string, unknown> | null | undefined
): WebExportWeatherConfig {
  if (!raw || typeof raw !== 'object') return {}
  const preset =
    typeof raw.preset === 'string'
      ? raw.preset
      : typeof raw.weatherPreset === 'string'
        ? raw.weatherPreset
        : undefined
  return {
    enableStandaloneWeather: raw.enableStandaloneWeather === true,
    preset,
    timeOfDay: typeof raw.timeOfDay === 'number' ? raw.timeOfDay : 12,
    northOffset: typeof raw.northOffset === 'number' ? raw.northOffset : 0,
    dynamicSkyEnabled: raw.dynamicSkyEnabled !== false,
    sunSize: typeof raw.sunSize === 'number' ? raw.sunSize : 1,
    moonSize: typeof raw.moonSize === 'number' ? raw.moonSize : 1,
    weatherQuality:
      typeof raw.weatherQuality === 'string' ? raw.weatherQuality : 'high',
    cloudDensity: typeof raw.cloudDensity === 'number' ? raw.cloudDensity : 0,
    cloudThickness: typeof raw.cloudThickness === 'number' ? raw.cloudThickness : 0.5,
    cloudDetail: typeof raw.cloudDetail === 'number' ? raw.cloudDetail : 0.5,
    cloudScale: typeof raw.cloudScale === 'number' ? raw.cloudScale : 1,
    cloudStorminess: typeof raw.cloudStorminess === 'number' ? raw.cloudStorminess : 0,
    cloudShadowStrength:
      typeof raw.cloudShadowStrength === 'number' ? raw.cloudShadowStrength : 0.5,
    cloudColor: typeof raw.cloudColor === 'string' ? raw.cloudColor : '#ffffff',
    fogDensity: typeof raw.fogDensity === 'number' ? raw.fogDensity : 0,
    fogHeight: typeof raw.fogHeight === 'number' ? raw.fogHeight : 0,
    fogColor: typeof raw.fogColor === 'string' ? raw.fogColor : '#cccccc',
    rainIntensity: typeof raw.rainIntensity === 'number' ? raw.rainIntensity : 0,
    snowIntensity: typeof raw.snowIntensity === 'number' ? raw.snowIntensity : 0,
    windIntensity: typeof raw.windIntensity === 'number' ? raw.windIntensity : 0,
    skyTurbidity: typeof raw.skyTurbidity === 'number' ? raw.skyTurbidity : 10,
    skyRayleigh: typeof raw.skyRayleigh === 'number' ? raw.skyRayleigh : 3,
    skyMieCoefficient: typeof raw.skyMieCoefficient === 'number' ? raw.skyMieCoefficient : 0.005,
    skyMieDirectionalG: typeof raw.skyMieDirectionalG === 'number' ? raw.skyMieDirectionalG : 0.7,
    skyExposure: typeof raw.skyExposure === 'number' ? raw.skyExposure : 1.0,
    rainParticleScale: typeof raw.rainParticleScale === 'number' ? raw.rainParticleScale : 1,
    rainParticleSpeed: typeof raw.rainParticleSpeed === 'number' ? raw.rainParticleSpeed : 1,
    rainCollisionEnabled: raw.rainCollisionEnabled !== false,
    snowParticleScale: typeof raw.snowParticleScale === 'number' ? raw.snowParticleScale : 1,
    snowParticleSpeed: typeof raw.snowParticleSpeed === 'number' ? raw.snowParticleSpeed : 1,
    snowCollisionEnabled: raw.snowCollisionEnabled !== false,
    windGustsEnabled: raw.windGustsEnabled === true
  }
}

/**
 * JavaScript source embedded in web export HTML.
 * Uses THREE, Sky (imported in parent module), CONFIG.weather.
 */
export function generateWebExportWeatherRuntimeJs(): string {
  const iqVertexShader = JSON.stringify(WEB_EXPORT_IQ_CLOUD_VERTEX_SHADER)
  const iqFragmentShader = JSON.stringify(WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER)

  return `
    const WEB_EXPORT_IQ_CLOUD_VERTEX_SHADER = ${iqVertexShader};
    const WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER = ${iqFragmentShader};

    const WEB_EXPORT_FOG_DENSITY_SCALE = ${WEB_EXPORT_FOG_DENSITY_SCALE};
    const WEB_EXPORT_WEATHER_GROUND_LEVEL = ${WEB_EXPORT_WEATHER_GROUND_LEVEL};
    const WEB_EXPORT_SKY_SPHERE_RADIUS = ${WEB_EXPORT_SKY_SPHERE_RADIUS};
    const WEB_EXPORT_MIN_CAMERA_FAR = ${WEB_EXPORT_MIN_CAMERA_FAR};
    const WEB_EXPORT_MAX_SUBJECT_EXTENT = ${WEB_EXPORT_MAX_SUBJECT_EXTENT};
    const WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS = ${WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS};
    const WEB_EXPORT_SHADOW_PLANE_GROUND_Y = ${WEB_EXPORT_SHADOW_PLANE_GROUND_Y};
    const WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y = ${WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y};
    const WEB_EXPORT_SHADOW_SUN_MAX_Y = ${WEB_EXPORT_SHADOW_SUN_MAX_Y};
    const WEB_EXPORT_MIN_SHADOW_CATCHER_OPACITY = ${WEB_EXPORT_MIN_SHADOW_CATCHER_OPACITY};
    const WEB_EXPORT_SUN_LIGHT_DISTANCE = ${WEB_EXPORT_SUN_LIGHT_DISTANCE};
    const WEB_EXPORT_SUN_SHADOW_BIAS = ${WEB_EXPORT_SUN_SHADOW_BIAS};
    const WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS = ${WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS};
    const WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS = ${WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS};
    const WEB_EXPORT_STANDALONE_GRID_SHADOW_CATCHER_RENDER_ORDER = ${WEB_EXPORT_STANDALONE_GRID_SHADOW_CATCHER_RENDER_ORDER};
    const WEB_EXPORT_HDR_AMBIENT_REDUCTION_WITH_SHADOWS = ${WEB_EXPORT_HDR_AMBIENT_REDUCTION_WITH_SHADOWS};
    const WEB_EXPORT_HDR_AMBIENT_REDUCTION_NO_SHADOWS = ${WEB_EXPORT_HDR_AMBIENT_REDUCTION_NO_SHADOWS};
    const WEB_EXPORT_HDR_AMBIENT_FLOOR_WITH_SHADOWS = ${WEB_EXPORT_HDR_AMBIENT_FLOOR_WITH_SHADOWS};
    const WEB_EXPORT_HDR_AMBIENT_FLOOR_NO_SHADOWS = ${WEB_EXPORT_HDR_AMBIENT_FLOOR_NO_SHADOWS};
    const WEB_EXPORT_HDR_ENV_MAP_INTENSITY_SHADOW_MUL = ${WEB_EXPORT_HDR_ENV_MAP_INTENSITY_SHADOW_MUL};
    const WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST = ${WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST};
    const WEB_EXPORT_STANDALONE_PROCEDURAL_EXPOSURE_BOOST = ${WEB_EXPORT_STANDALONE_PROCEDURAL_EXPOSURE_BOOST};
    const WEB_EXPORT_STANDALONE_PROCEDURAL_ENV_MAP_INTENSITY = ${WEB_EXPORT_STANDALONE_PROCEDURAL_ENV_MAP_INTENSITY};
    const WEB_EXPORT_STANDALONE_PROCEDURAL_METALLIC_ENV_MAP_INTENSITY = ${WEB_EXPORT_STANDALONE_PROCEDURAL_METALLIC_ENV_MAP_INTENSITY};

    function resolveExportAssetUrl(relativePath) {
      if (!relativePath) return relativePath;
      if (/^(blob:|https?:|data:)/i.test(relativePath)) return relativePath;
      const assetMap = window.__webExportAssetUrls;
      if (assetMap) {
        if (assetMap[relativePath]) return assetMap[relativePath];
        const stripped = relativePath.replace(/^\\.\\//, '');
        if (assetMap[stripped]) return assetMap[stripped];
        if (assetMap['./' + stripped]) return assetMap['./' + stripped];
      }
      const configured = CONFIG && CONFIG.assets;
      if (configured) {
        if (relativePath.indexOf('environment.hdr') !== -1) {
          if (configured.hdrUrl) return configured.hdrUrl;
          const hdrKey = configured.hdr || 'environment.hdr';
          if (assetMap && assetMap[hdrKey]) return assetMap[hdrKey];
          if (assetMap && assetMap['./' + hdrKey]) return assetMap['./' + hdrKey];
        }
        if (relativePath.indexOf('model.glb') !== -1) {
          if (configured.modelUrl) return configured.modelUrl;
          const modelKey = configured.model || 'model.glb';
          if (assetMap && assetMap[modelKey]) return assetMap[modelKey];
          if (assetMap && assetMap['./' + modelKey]) return assetMap['./' + modelKey];
        }
      }
      const base = (configured && configured.basePath) || window.__webExportBaseUrl || document.baseURI || window.location.href;
      try {
        return new URL(relativePath, base).href;
      } catch (e) {
        console.warn('[WebExport] Failed to resolve asset URL:', relativePath, e);
        return relativePath;
      }
    }

    function webExportNormalizeObjectName(name) {
      return (name || '').toLowerCase().replace(/\\s+/g, '_');
    }

    function isExportedWeatherMesh(obj) {
      if (!obj) return false;
      const ud = obj.userData || {};
      if (ud.isWebExportRuntimeWeather === true) return false;
      if (ud.isDynamicSky || ud.isSun || ud.isMoon || ud.isParticleSystem) return true;
      const name = webExportNormalizeObjectName(obj.name);
      if (name.indexOf('dynamic_sky') !== -1 || name === 'dynamicsky') return true;
      const maxScale = Math.max(Math.abs(obj.scale?.x || 1), Math.abs(obj.scale?.y || 1), Math.abs(obj.scale?.z || 1));
      if (maxScale >= WEB_EXPORT_MAX_SUBJECT_EXTENT) return true;
      if (obj instanceof THREE.Mesh && obj.geometry && obj.geometry.parameters) {
        const radius = obj.geometry.parameters.radius;
        if (typeof radius === 'number' && radius >= WEB_EXPORT_MAX_SUBJECT_EXTENT) return true;
      }
      return false;
    }

    function shouldExcludeFromSubjectBounds(obj) {
      if (!obj) return true;
      if (isExportedWeatherMesh(obj)) return true;
      const ud = obj.userData || {};
      if (ud.isShadowPlane || ud.isGroundedSkybox || ud.isHelper) return true;
      const name = webExportNormalizeObjectName(obj.name);
      if (name.indexOf('shadow_plane') !== -1 || name.indexOf('shadowplane') !== -1) return true;
      if (name.indexOf('helper') !== -1 || name.indexOf('gizmo') !== -1) return true;
      const type = obj.type || '';
      if (type.indexOf('Helper') !== -1) return true;
      if (obj instanceof THREE.Mesh && obj.geometry && obj.geometry.parameters) {
        const params = obj.geometry.parameters;
        if (typeof params.radius === 'number' && params.radius > WEB_EXPORT_MAX_SUBJECT_EXTENT) return true;
        const w = typeof params.width === 'number' ? params.width : 0;
        const h = typeof params.height === 'number' ? params.height : 0;
        if (Math.max(w, h) > WEB_EXPORT_MAX_SUBJECT_EXTENT * 2) return true;
      }
      return false;
    }

    function removeExportedWeatherMeshes(root) {
      if (!root) return 0;
      const toRemove = [];
      root.traverse(function(obj) {
        if (isExportedWeatherMesh(obj)) toRemove.push(obj);
      });
      toRemove.forEach(function(obj) {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        mats.forEach(function(mat) { if (mat && mat.dispose) mat.dispose(); });
      });
      if (toRemove.length > 0) {
        console.log('[WebExport] Removed', toRemove.length, 'exported weather mesh(es) — runtime weather owns the sky');
      }
      return toRemove.length;
    }

    function findSubjectRoot(gltfScene) {
      if (!gltfScene || !gltfScene.children) return gltfScene;
      for (let i = 0; i < gltfScene.children.length; i++) {
        const child = gltfScene.children[i];
        if (isExportedWeatherMesh(child) || shouldExcludeFromSubjectBounds(child)) continue;
        return child;
      }
      return gltfScene;
    }

    function computeSubjectBounds(root) {
      const box = new THREE.Box3();
      let hasAny = false;
      if (!root) return box;
      root.traverse(function(obj) {
        if (!(obj instanceof THREE.Mesh)) return;
        if (shouldExcludeFromSubjectBounds(obj)) return;
        const meshBox = new THREE.Box3().setFromObject(obj);
        if (meshBox.isEmpty()) return;
        const size = meshBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > WEB_EXPORT_MAX_SUBJECT_EXTENT * 2) return;
        if (!hasAny) { box.copy(meshBox); hasAny = true; }
        else box.union(meshBox);
      });
      return box;
    }

    function webExportResolveShadowCatcherY(subjectRoot, groundProjectionEnabled) {
      if (groundProjectionEnabled) return -0.01;
      if (subjectRoot && typeof computeSubjectBounds === 'function') {
        const box = computeSubjectBounds(subjectRoot);
        if (!box.isEmpty()) {
          return box.min.y - 0.001;
        }
      }
      return WEB_EXPORT_SHADOW_PLANE_GROUND_Y;
    }

    function normalizeWebExportWeatherConfig(raw) {
      if (!raw || typeof raw !== 'object') return {};
      const preset = typeof raw.preset === 'string'
        ? raw.preset
        : (typeof raw.weatherPreset === 'string' ? raw.weatherPreset : 'clear');
      return {
        enableStandaloneWeather: raw.enableStandaloneWeather === true,
        preset: preset,
        timeOfDay: typeof raw.timeOfDay === 'number' ? raw.timeOfDay : 12,
        northOffset: typeof raw.northOffset === 'number' ? raw.northOffset : 0,
        dynamicSkyEnabled: raw.dynamicSkyEnabled !== false,
        sunSize: typeof raw.sunSize === 'number' ? raw.sunSize : 1,
        moonSize: typeof raw.moonSize === 'number' ? raw.moonSize : 1,
        weatherQuality: typeof raw.weatherQuality === 'string' ? raw.weatherQuality : 'high',
        cloudDensity: typeof raw.cloudDensity === 'number' ? raw.cloudDensity : 0,
        cloudThickness: typeof raw.cloudThickness === 'number' ? raw.cloudThickness : 0.5,
        cloudDetail: typeof raw.cloudDetail === 'number' ? raw.cloudDetail : 0.5,
        cloudScale: typeof raw.cloudScale === 'number' ? raw.cloudScale : 1,
        cloudStorminess: typeof raw.cloudStorminess === 'number' ? raw.cloudStorminess : 0,
        cloudShadowStrength: typeof raw.cloudShadowStrength === 'number' ? raw.cloudShadowStrength : 0.5,
        cloudColor: typeof raw.cloudColor === 'string' ? raw.cloudColor : '#ffffff',
        fogDensity: typeof raw.fogDensity === 'number' ? raw.fogDensity : 0,
        fogHeight: typeof raw.fogHeight === 'number' ? raw.fogHeight : 0,
        fogColor: typeof raw.fogColor === 'string' ? raw.fogColor : '#cccccc',
        rainIntensity: typeof raw.rainIntensity === 'number' ? raw.rainIntensity : 0,
        snowIntensity: typeof raw.snowIntensity === 'number' ? raw.snowIntensity : 0,
        windIntensity: typeof raw.windIntensity === 'number' ? raw.windIntensity : 0,
        skyTurbidity: typeof raw.skyTurbidity === 'number' ? raw.skyTurbidity : 10,
        skyRayleigh: typeof raw.skyRayleigh === 'number' ? raw.skyRayleigh : 3,
        skyMieCoefficient: typeof raw.skyMieCoefficient === 'number' ? raw.skyMieCoefficient : 0.005,
        skyMieDirectionalG: typeof raw.skyMieDirectionalG === 'number' ? raw.skyMieDirectionalG : 0.7,
        skyExposure: typeof raw.skyExposure === 'number' ? raw.skyExposure : 1.0,
        rainParticleScale: typeof raw.rainParticleScale === 'number' ? raw.rainParticleScale : 1,
        rainParticleSpeed: typeof raw.rainParticleSpeed === 'number' ? raw.rainParticleSpeed : 1,
        rainCollisionEnabled: raw.rainCollisionEnabled !== false,
        snowParticleScale: typeof raw.snowParticleScale === 'number' ? raw.snowParticleScale : 1,
        snowParticleSpeed: typeof raw.snowParticleSpeed === 'number' ? raw.snowParticleSpeed : 1,
        snowCollisionEnabled: raw.snowCollisionEnabled !== false,
        windGustsEnabled: raw.windGustsEnabled === true
      };
    }

    function isWebExportWeatherActive(weather) {
      if (!weather) return false;
      if (weather.enableStandaloneWeather) return true;
      return (weather.fogDensity > 0) || (weather.rainIntensity > 0) ||
        (weather.snowIntensity > 0) || (weather.cloudDensity > 0);
    }

    function webExportIsStandaloneSkyActive(weather, hdrConfig) {
      if (!weather || !isWebExportWeatherActive(weather)) return false;
      if (weather.enableStandaloneWeather !== true) return false;
      // Editor creates DynamicSky whenever enableStandaloneWeather is on (dynamicSkyEnabled is legacy).
      if (hdrConfig && hdrConfig.groundProjectionEnabled === true) return false;
      return true;
    }

    function webExportEnsureDynamicSkyCameraFar(camera) {
      if (!camera || camera.far >= WEB_EXPORT_MIN_CAMERA_FAR) return;
      const state = window.__webExportWeather;
      if (state && state.savedCameraFar === undefined) {
        state.savedCameraFar = camera.far;
      }
      camera.far = WEB_EXPORT_MIN_CAMERA_FAR;
      camera.updateProjectionMatrix();
    }

    function webExportIsHdrActive() {
      const hdr = CONFIG && CONFIG.hdr;
      if (!hdr || hdr.enabled === false) return false;
      return hdr.enabled === true || !!window.__hdrTextureLoaded;
    }

    function webExportHasLoadedHdrTexture() {
      return !!window.__hdrTextureLoaded;
    }

    function webExportHdrIntensity() {
      const hdr = CONFIG && CONFIG.hdr;
      return hdr && typeof hdr.intensity === 'number' ? hdr.intensity : 1.0;
    }

    function webExportComputeHdrSunBoost(hdrIntensity) {
      if (!webExportIsHdrActive()) return 1.0;
      const i = hdrIntensity !== undefined ? hdrIntensity : webExportHdrIntensity();
      return THREE.MathUtils.clamp(0.85 + i * 0.35, 1.0, 2.2);
    }

    function webExportComputeHdrExposureBoost(hdrIntensity) {
      if (!webExportIsHdrActive()) return 1.0;
      const i = hdrIntensity !== undefined ? hdrIntensity : webExportHdrIntensity();
      return THREE.MathUtils.clamp(0.9 + i * 0.45, 1.0, 2.5);
    }

    function webExportComputeHdrAmbientIntensity(sliderAmbient, shadowsEnabled, hdrIntensity) {
      if (!webExportIsHdrActive()) return sliderAmbient;
      const i = hdrIntensity !== undefined ? hdrIntensity : webExportHdrIntensity();
      const sunBoost = webExportComputeHdrSunBoost(i);
      const reduction = shadowsEnabled
        ? WEB_EXPORT_HDR_AMBIENT_REDUCTION_WITH_SHADOWS
        : WEB_EXPORT_HDR_AMBIENT_REDUCTION_NO_SHADOWS;
      const floor = shadowsEnabled
        ? WEB_EXPORT_HDR_AMBIENT_FLOOR_WITH_SHADOWS
        : WEB_EXPORT_HDR_AMBIENT_FLOOR_NO_SHADOWS;
      return Math.max(sliderAmbient * reduction * sunBoost * 0.85, floor);
    }

    function webExportApplyHdrShadowContrastToMaterials(scene, hdrIntensity, shadowsEnabled) {
      if (!scene || !webExportHasLoadedHdrTexture()) return 0;
      const i = hdrIntensity !== undefined ? hdrIntensity : webExportHdrIntensity();
      const target = shadowsEnabled ? i * WEB_EXPORT_HDR_ENV_MAP_INTENSITY_SHADOW_MUL : i;
      let updated = 0;
      scene.traverse(function(obj) {
        if (!(obj instanceof THREE.Mesh) || !obj.material) return;
        const ud = obj.userData || {};
        if (ud.isGroundedSkybox || ud.isShadowPlane || ud.isDynamicSky || ud.isWebExportRuntimeWeather) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(function(mat) {
          if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) return;
          if (mat.userData && mat.userData.userControlledEnvMapIntensity) return;
          if (mat.userData && mat.userData.cavityBaseEnvIntensity !== undefined) return;
          const current = typeof mat.envMapIntensity === 'number' ? mat.envMapIntensity : 1;
          if (Math.abs(current - target) > 0.02) {
            mat.envMapIntensity = target;
            mat.needsUpdate = true;
            updated++;
          }
        });
      });
      return updated;
    }

    function webExportIsSubjectPbrMesh(obj) {
      if (!(obj instanceof THREE.Mesh) || !obj.material) return false;
      const ud = obj.userData || {};
      if (ud.isGroundedSkybox || ud.isShadowPlane || ud.isDynamicSky || ud.isWebExportRuntimeWeather) return false;
      if (ud.isGridHelper || ud.isHelper || ud.isAxesHelper) return false;
      return true;
    }

    function webExportApplyStandaloneProceduralEnvMapIntensity(scene) {
      if (!scene || !scene.environment || webExportHasLoadedHdrTexture()) {
        return { updated: 0, total: 0, metallic: 0, envMapAssigned: 0 };
      }
      let updated = 0;
      let total = 0;
      let metallicBoosted = 0;
      let envMapAssigned = 0;
      scene.traverse(function(obj) {
        if (!webExportIsSubjectPbrMesh(obj)) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(function(mat) {
          if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) return;
          total++;
          if (mat.userData && mat.userData.userControlledEnvMapIntensity) return;
          const metalness = typeof mat.metalness === 'number' ? mat.metalness : 0;
          const isMetallic = metalness > 0.3;
          const target = isMetallic
            ? WEB_EXPORT_STANDALONE_PROCEDURAL_METALLIC_ENV_MAP_INTENSITY
            : WEB_EXPORT_STANDALONE_PROCEDURAL_ENV_MAP_INTENSITY;
          let changed = false;
          if (!mat.envMap || mat.envMap !== scene.environment) {
            mat.envMap = scene.environment;
            envMapAssigned++;
            changed = true;
          }
          const current = typeof mat.envMapIntensity === 'number' ? mat.envMapIntensity : 1;
          if (current < target - 0.02) {
            mat.envMapIntensity = target;
            changed = true;
            if (isMetallic) metallicBoosted++;
          }
          if (changed) {
            mat.needsUpdate = true;
            updated++;
          }
        });
      });
      return { updated: updated, total: total, metallic: metallicBoosted, envMapAssigned: envMapAssigned };
    }

    function webExportResolveStandaloneSunBoost(hasSceneEnvironment) {
      const hdrIntensity = webExportHdrIntensity();
      const hdrEnabled = webExportIsHdrActive();
      if (webExportHasLoadedHdrTexture()) {
        return webExportComputeHdrSunBoost(hdrIntensity);
      }
      if (hasSceneEnvironment) {
        return WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST;
      }
      if (hdrEnabled) {
        return webExportComputeHdrSunBoost(hdrIntensity);
      }
      return 1.0;
    }

    function webExportResolveStandaloneExposureBoost(hasSceneEnvironment) {
      const hdrIntensity = webExportHdrIntensity();
      const hdrEnabled = webExportIsHdrActive();
      if (webExportHasLoadedHdrTexture()) {
        return webExportComputeHdrExposureBoost(hdrIntensity);
      }
      if (hasSceneEnvironment) {
        return WEB_EXPORT_STANDALONE_PROCEDURAL_EXPOSURE_BOOST;
      }
      if (hdrEnabled) {
        return webExportComputeHdrExposureBoost(hdrIntensity);
      }
      return 1.0;
    }

    function webExportResolveStandaloneAmbientIntensity(baseAmbient, shadowsEnabled, hasSceneEnvironment) {
      const hdrIntensity = webExportHdrIntensity();
      const hdrEnabled = webExportIsHdrActive();
      if (webExportHasLoadedHdrTexture()) {
        return webExportComputeHdrAmbientIntensity(baseAmbient, shadowsEnabled, hdrIntensity);
      }
      if (hasSceneEnvironment) {
        const floor = shadowsEnabled ? 0.28 : 0.38;
        return Math.max(baseAmbient * 0.9, floor);
      }
      if (hdrEnabled) {
        return webExportComputeHdrAmbientIntensity(baseAmbient, shadowsEnabled, hdrIntensity);
      }
      return baseAmbient;
    }

    function webExportEnsureExportLightsVisible(scene) {
      if (!scene) return 0;
      let count = 0;
      scene.traverse(function(obj) {
        if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.AmbientLight ||
            obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight ||
            obj instanceof THREE.HemisphereLight || obj instanceof THREE.RectAreaLight) {
          if (!obj.visible) {
            obj.visible = true;
            count++;
          }
        }
      });
      return count;
    }

    function webExportResolveToneMappingExposure(weather, lighting) {
      const skyExp = weather && typeof weather.skyExposure === 'number' ? weather.skyExposure : 1.0;
      const lightExp = lighting && typeof lighting.exposure === 'number' ? lighting.exposure : 1.0;
      const base = Math.max(skyExp, lightExp, 0.85);
      const hasEnvironment = !!(window.__webExportWeather && window.__webExportWeather.lastHasEnvironment);
      const exposureBoost = webExportResolveStandaloneExposureBoost(hasEnvironment);
      return base * exposureBoost;
    }

    function webExportApplyStandaloneLightingHdrBoosts(weather, lighting, scene, renderer) {
      if (!weather || !weather.enableStandaloneWeather || !lighting) return lighting;
      const shadowsConfig = CONFIG.shadows || {};
      const lightingCfg = CONFIG.lighting || {};
      const shadowsEnabled = shadowsConfig.enabled !== false && lightingCfg.shadowsEnabled !== false;
      const hdrIntensity = webExportHdrIntensity();
      const hasSceneEnvironment = !!(scene && scene.environment);
      if (window.__webExportWeather) {
        window.__webExportWeather.lastHasEnvironment = hasSceneEnvironment;
      }
      const sunBoost = webExportResolveStandaloneSunBoost(hasSceneEnvironment);
      const exposureBoost = webExportResolveStandaloneExposureBoost(hasSceneEnvironment);
      const boosted = Object.assign({}, lighting, {
        sunIntensity: lighting.sunIntensity * sunBoost,
        ambientIntensity: webExportResolveStandaloneAmbientIntensity(
          lighting.ambientIntensity,
          shadowsEnabled,
          hasSceneEnvironment
        ),
        exposure: (lighting.exposure || 1.0) * exposureBoost
      });
      if (scene && webExportHasLoadedHdrTexture()) {
        const contrastCount = webExportApplyHdrShadowContrastToMaterials(scene, hdrIntensity, shadowsEnabled);
        if (contrastCount > 0) {
          console.log('[WebExport] HDR shadow contrast applied to ' + contrastCount + ' PBR material(s)');
        }
      } else if (scene && hasSceneEnvironment) {
        const envResult = webExportApplyStandaloneProceduralEnvMapIntensity(scene);
        if (envResult.total > 0) {
          console.log('[WebExport] Standalone procedural IBL applied to ' + envResult.updated + ' of ' + envResult.total +
            ' subject PBR material(s)' +
            (envResult.envMapAssigned > 0 ? ', envMap assigned=' + envResult.envMapAssigned : '') +
            (envResult.metallic > 0 ? ', metallic boosted=' + envResult.metallic : ''));
        }
      }
      return boosted;
    }

    function webExportLogWeatherDiagnostics(scene, camera, renderer, weather, state) {
      if (window.__webExportWeatherDiagnosticsLogged) return;
      window.__webExportWeatherDiagnosticsLogged = true;
      let skyMeshInScene = false;
      let skyParentName = 'none';
      scene.traverse(function(obj) {
        if (obj && obj.userData && obj.userData.isDynamicSky && obj.userData.isWebExportRuntimeWeather) {
          skyMeshInScene = true;
          skyParentName = obj.parent ? (obj.parent.name || obj.parent.type || 'unnamed') : 'detached';
        }
      });
      const bg = scene.background;
      const bgLabel = !bg ? 'null' : (bg.isColor ? 'color' : 'texture');
      const sunPos = state.sky && state.sky.material && state.sky.material.uniforms && state.sky.material.uniforms.sunPosition
        ? state.sky.material.uniforms.sunPosition.value
        : null;
      console.log('[WebExport] Weather diagnostics (once) enableStandaloneWeather=' + weather.enableStandaloneWeather);
      console.log('[WebExport] Weather diagnostics (once) useStandaloneSky=' + state.useStandaloneSky);
      console.log('[WebExport] Weather diagnostics (once) skyMeshInScene=' + skyMeshInScene + ' skyParent=' + skyParentName);
      console.log('[WebExport] Weather diagnostics (once) hasSkyRef=' + !!state.sky + ' skyInSceneGraph=' + !!(state.sky && state.sky.parent));
      console.log('[WebExport] Weather diagnostics (once) skyFrustumCulled=' + (state.sky ? state.sky.frustumCulled : 'n/a'));
      console.log('[WebExport] Weather diagnostics (once) scene.background=' + bgLabel + ' hasEnvironment=' + !!scene.environment);
      console.log('[WebExport] Weather diagnostics (once) toneMappingExposure=' + (renderer ? renderer.toneMappingExposure : 'n/a'));
      console.log('[WebExport] Weather diagnostics (once) cameraFar=' + (camera ? camera.far : 'n/a') + ' hdrLoaded=' + !!window.__hdrTextureLoaded);
      console.log('[WebExport] Weather diagnostics (once) preset=' + (weather.preset || 'clear') + ' timeOfDay=' + weather.timeOfDay);
      console.log('[WebExport] Weather diagnostics (once) fog=' + weather.fogDensity + ' rain=' + weather.rainIntensity + ' snow=' + weather.snowIntensity + ' clouds=' + weather.cloudDensity);
      if (sunPos) {
        console.log('[WebExport] Weather diagnostics (once) sunPosition=' + sunPos.x.toFixed(3) + ',' + sunPos.y.toFixed(3) + ',' + sunPos.z.toFixed(3));
      }
    }

    function webExportTimeOfDayToSkyAngles(timeOfDay, northOffset) {
      const hour = ((timeOfDay % 24) + 24) % 24;
      const dayPhase = ((hour - 6) / 12) * Math.PI;
      const elevation = Math.sin(dayPhase) * (Math.PI / 2);
      const offsetRad = THREE.MathUtils.degToRad(northOffset || 0);
      const azimuth = ((hour - 6) / 24) * Math.PI * 2 + offsetRad;
      const phi = Math.PI / 2 - elevation;
      const sunPosition = new THREE.Vector3();
      sunPosition.setFromSphericalCoords(1, phi, azimuth);
      return { elevation, azimuth, sunPosition };
    }

    function webExportClampSunDirection(dir, minY) {
      const minElevationY = minY !== undefined ? minY : WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y;
      const normalized = dir.clone().normalize();
      if (normalized.y >= minElevationY) return normalized;
      const horizontalLength = Math.sqrt(normalized.x * normalized.x + normalized.z * normalized.z);
      if (horizontalLength < 0.001) {
        return new THREE.Vector3(0, minElevationY, 1).normalize();
      }
      const scale = minElevationY / horizontalLength;
      return new THREE.Vector3(normalized.x * scale, minElevationY, normalized.z * scale).normalize();
    }

    function webExportShadowSunSkyDirection(timeOfDay, northOffset, maxSunY) {
      const maxY = maxSunY !== undefined ? maxSunY : WEB_EXPORT_SHADOW_SUN_MAX_Y;
      const angles = webExportTimeOfDayToSkyAngles(timeOfDay, northOffset || 0);
      const maxElevation = Math.asin(Math.min(1, Math.max(WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y, maxY)));
      const cappedElevation = angles.elevation < 0 ? angles.elevation : Math.min(angles.elevation, maxElevation);
      const phi = Math.PI / 2 - cappedElevation;
      const dir = new THREE.Vector3();
      dir.setFromSphericalCoords(1, phi, angles.azimuth);
      return webExportClampSunDirection(dir);
    }

    function webExportShadowCatcherOpacity(shadowIntensity) {
      const raw = 0.1 + ((shadowIntensity || 1) / 2.0) * 0.9;
      return Math.min(1.0, Math.max(WEB_EXPORT_MIN_SHADOW_CATCHER_OPACITY, raw));
    }

    function webExportSceneHasGridHelper(scene) {
      if (!scene) return false;
      let found = false;
      scene.traverse(function(obj) {
        if (found) return;
        if (obj.userData && obj.userData.isGridHelper === true) found = true;
      });
      return found;
    }

    function webExportShouldCompositeShadowCatcherOverGrid(standaloneWeather, scene) {
      return standaloneWeather === true && webExportSceneHasGridHelper(scene);
    }

    function webExportStandaloneSunNormalBias(standaloneWeather) {
      return standaloneWeather ? WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS : WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS;
    }

    function webExportSubjectShadowTarget(subjectRoot) {
      if (!subjectRoot || typeof computeSubjectBounds !== 'function') {
        return new THREE.Vector3(0, 0, 0);
      }
      const box = computeSubjectBounds(subjectRoot);
      if (box.isEmpty()) return new THREE.Vector3(0, 0, 0);
      return box.getCenter(new THREE.Vector3());
    }

    function webExportShouldUseShadowCatcher(weather, hdrEnabled, shadowsEnabled) {
      if (!shadowsEnabled) return false;
      if (hdrEnabled) return true;
      return !!(weather && weather.enableStandaloneWeather);
    }

    function webExportSunLightDirection(sunPosition, timeOfDay, northOffset) {
      if (typeof timeOfDay === 'number') {
        const lightSunDir = webExportShadowSunSkyDirection(timeOfDay, northOffset || 0);
        return lightSunDir.clone().negate();
      }
      const skyDir = sunPosition.clone().normalize();
      const clamped = webExportClampSunDirection(skyDir);
      return clamped.negate();
    }

    function webExportComputeSunLighting(elevation) {
      if (elevation < -0.02) {
        return { sunIntensity: 0.05, sunColor: '#6688cc', ambientIntensity: 0.18, ambientColor: '#3a4a6a', exposure: 0.85 };
      }
      const aboveHorizon = THREE.MathUtils.smoothstep(elevation, -0.02, 0.08);
      const goldenHour = 1 - THREE.MathUtils.smoothstep(elevation, 0.06, 0.38);
      const dayFactor = THREE.MathUtils.clamp(elevation / (Math.PI / 2), 0, 1);
      const elevationIntensity = 0.32 + 0.68 * Math.pow(dayFactor, 0.55);
      const sunIntensity = aboveHorizon * elevationIntensity;
      const sunColor = goldenHour > 0.01 ? '#ffd0a0' : '#ffffff';
      const baseAmbient = 0.36 + 0.24 * Math.pow(dayFactor, 0.45);
      const ambientIntensity = goldenHour > 0.2 ? Math.max(baseAmbient + goldenHour * 0.12, 0.42) : baseAmbient;
      const ambientColor = goldenHour > 0.01 ? '#dcc8b0' : '#d0d8e8';
      const exposure = 1.0 + goldenHour * 0.1;
      return { sunIntensity, sunColor, ambientIntensity, ambientColor, exposure };
    }

    function webExportApplyWeatherPresetDimming(weather, lighting) {
      const preset = weather.preset || 'clear';
      let dimming = 1.0;
      let exposure = lighting.exposure;
      let ambientIntensity = lighting.ambientIntensity;
      if (preset === 'overcast') {
        dimming = 0.25 - (weather.fogDensity * 0.08);
        ambientIntensity = 0.15 - (weather.fogDensity * 0.04);
        exposure = 0.9;
      } else if (preset === 'foggy') {
        dimming = 0.25 - (weather.fogDensity * 0.1);
        ambientIntensity = 0.15 - (weather.fogDensity * 0.04);
        exposure = 0.9;
      } else if (preset === 'stormy') {
        dimming = 0.15 - (weather.cloudStorminess * 0.03);
        ambientIntensity = 0.1 - (weather.cloudStorminess * 0.02);
        exposure = 0.85;
      } else {
        dimming = 1.0 - ((weather.cloudDensity || 0) * 0.5) -
          ((weather.rainIntensity || 0) * 0.3) - ((weather.cloudStorminess || 0) * 0.3);
      }
      return {
        sunIntensity: lighting.sunIntensity * Math.max(0.1, dimming),
        ambientIntensity: ambientIntensity * Math.max(0.05, dimming * 0.85),
        exposure: exposure
      };
    }

    function webExportEnableFogOnMeshes(scene) {
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh) || !obj.material) return;
        const ud = obj.userData || {};
        if (ud.isDynamicSky || ud.isSun || ud.isMoon || ud.isParticleSystem || ud.isShadowPlane || ud.isGroundedSkybox) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((mat) => {
          if (mat && 'fog' in mat && mat.fog !== true) {
            mat.fog = true;
            mat.needsUpdate = true;
          }
        });
      });
    }

    function webExportApplyFog(scene, weather) {
      if (weather.fogDensity <= 0) {
        scene.fog = null;
        return;
      }
      const density = Math.max(0, Math.min(1, weather.fogDensity)) * WEB_EXPORT_FOG_DENSITY_SCALE;
      scene.fog = new THREE.FogExp2(new THREE.Color(weather.fogColor || '#cccccc'), density);
      webExportEnableFogOnMeshes(scene);
    }

    function webExportSkyColorStops(weather, sunPosition) {
      const sunY = sunPosition ? sunPosition.clone().normalize().y : 0.5;
      const day = THREE.MathUtils.clamp((sunY + 0.08) / 0.55, 0, 1);
      const golden = 1 - THREE.MathUtils.smoothstep(sunY, 0.06, 0.42);
      const cloudDim = 1 - Math.min(0.55, (weather.cloudDensity || 0) * 0.35 + (weather.cloudStorminess || 0) * 0.2);
      const zenith = new THREE.Color(0x4f8fd8).lerp(new THREE.Color(0x10182f), 1 - day);
      const horizon = new THREE.Color(0xd9ecff).lerp(new THREE.Color(0x29334f), 1 - day);
      if (golden > 0.01) {
        horizon.lerp(new THREE.Color(0xffbf86), golden * 0.55);
        zenith.lerp(new THREE.Color(0x315f9d), golden * 0.25);
      }
      const ground = new THREE.Color(0x6f7468).lerp(new THREE.Color(0x1f2428), 1 - day);
      zenith.multiplyScalar(cloudDim);
      horizon.multiplyScalar(Math.max(0.45, cloudDim));
      ground.multiplyScalar(Math.max(0.4, cloudDim * 0.8));
      return { zenith, horizon, ground };
    }

    function webExportCreateSkyEnvironmentSource(weather, sunPosition) {
      const width = 128;
      const height = 64;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const stops = webExportSkyColorStops(weather, sunPosition);
      const sunDir = sunPosition ? sunPosition.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const pixel = ctx.createImageData(width, height);
      const color = new THREE.Color();
      for (let y = 0; y < height; y++) {
        const v = y / (height - 1);
        const pitch = (0.5 - v) * Math.PI;
        const vertical = Math.sin(pitch);
        for (let x = 0; x < width; x++) {
          const u = x / (width - 1);
          const yaw = (u - 0.5) * Math.PI * 2;
          const dir = new THREE.Vector3(
            Math.cos(pitch) * Math.sin(yaw),
            vertical,
            Math.cos(pitch) * Math.cos(yaw)
          );
          if (vertical >= 0) {
            const t = Math.pow(THREE.MathUtils.clamp(vertical, 0, 1), 0.55);
            color.copy(stops.horizon).lerp(stops.zenith, t);
          } else {
            const t = Math.pow(THREE.MathUtils.clamp(-vertical, 0, 1), 0.35);
            color.copy(stops.horizon).lerp(stops.ground, t);
          }
          const sunDot = Math.max(0, dir.dot(sunDir));
          const sunGlow = Math.pow(sunDot, 180) * 1.6 + Math.pow(sunDot, 18) * 0.22;
          if (sunGlow > 0.001 && sunDir.y > -0.05) {
            color.add(new THREE.Color(0xfff0c8).multiplyScalar(sunGlow));
          }
          const i = (y * width + x) * 4;
          pixel.data[i] = Math.min(255, Math.round(color.r * 255));
          pixel.data[i + 1] = Math.min(255, Math.round(color.g * 255));
          pixel.data[i + 2] = Math.min(255, Math.round(color.b * 255));
          pixel.data[i + 3] = 255;
        }
      }
      ctx.putImageData(pixel, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.name = 'WebExportStandaloneSkyEnvironmentSource';
      texture.mapping = THREE.EquirectangularReflectionMapping;
      if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    }

    function webExportRefreshPbrEnvironment(scene) {
      if (!scene || !scene.environment) return 0;
      let updated = 0;
      scene.traverse((obj) => {
        if (!webExportIsSubjectPbrMesh(obj)) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((mat) => {
          if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) return;
          if (mat.userData && mat.userData.userControlledEnvMapIntensity) return;
          let changed = false;
          if (!mat.envMap || mat.envMap !== scene.environment) {
            mat.envMap = scene.environment;
            changed = true;
          }
          if (typeof mat.envMapIntensity === 'number' && mat.envMapIntensity <= 0) {
            mat.envMapIntensity = 1;
            changed = true;
          }
          if (changed) {
            mat.needsUpdate = true;
          }
          updated++;
        });
      });
      return updated;
    }

    function webExportEnsureStandaloneEnvironment(scene, renderer, weather, sunPosition, state) {
      if (!scene || !weather || weather.enableStandaloneWeather !== true) return;
      const hdrLoaded = webExportHasLoadedHdrTexture();
      if (scene.environment && state.standaloneEnvironment === scene.environment) {
        return;
      }
      if (scene.environment && !state.standaloneEnvironment && hdrLoaded) {
        webExportRefreshPbrEnvironment(scene);
        return;
      }
      if (scene.environment && !state.standaloneEnvironment && !hdrLoaded) {
        scene.environment = null;
      }
      try {
        if (state.environmentSourceTexture && state.environmentSourceTexture.dispose) {
          state.environmentSourceTexture.dispose();
        }
        if (state.environmentRenderTarget && state.environmentRenderTarget.dispose) {
          state.environmentRenderTarget.dispose();
        }
        const sourceTexture = webExportCreateSkyEnvironmentSource(weather, sunPosition);
        if (!sourceTexture) return;
        state.environmentSourceTexture = sourceTexture;
        if (renderer && THREE.PMREMGenerator) {
          const pmremGenerator = new THREE.PMREMGenerator(renderer);
          pmremGenerator.compileEquirectangularShader();
          const envRT = pmremGenerator.fromEquirectangular(sourceTexture);
          pmremGenerator.dispose();
          state.environmentRenderTarget = envRT;
          state.standaloneEnvironment = envRT.texture;
          scene.environment = envRT.texture;
        } else {
          state.standaloneEnvironment = sourceTexture;
          scene.environment = sourceTexture;
        }
        const pbrCount = webExportRefreshPbrEnvironment(scene);
        console.log('[WebExport] Standalone sky environment applied for PBR IBL: hasEnvironment=' + !!scene.environment + ' pbrMaterials=' + pbrCount);
      } catch (e) {
        console.warn('[WebExport] Failed to create standalone sky environment for PBR IBL:', e);
      }
    }

    function webExportFindSunLight(scene) {
      let sunLight = null;
      let firstDirectional = null;
      scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight) {
          if (!firstDirectional) firstDirectional = obj;
          if (obj.userData.isSun || obj.userData.isGlobalSun) sunLight = obj;
        }
      });
      // Standalone weather: sun is isSun/first directional — not auxiliary lights with castShadow
      const weather = CONFIG && CONFIG.weather;
      const standaloneWeather = !!(weather && weather.enableStandaloneWeather);
      if (!sunLight && !standaloneWeather) {
        scene.traverse((obj) => {
          if (obj instanceof THREE.DirectionalLight && obj.castShadow && !sunLight) {
            sunLight = obj;
          }
        });
      }
      if (!sunLight && firstDirectional) sunLight = firstDirectional;
      return sunLight;
    }

    function webExportConfigureSunShadow(light) {
      if (!light || !light.shadow) return;
      const size = window.getShadowMapSize ? window.getShadowMapSize(CONFIG.shadowQuality || 'high') : 4096;
      const wasCasting = light.castShadow === true;
      light.castShadow = true;
      const needsDefaults =
        light.userData.__webExportSunShadowConfigured !== true &&
        (!wasCasting || light.shadow.mapSize.width <= 0 || light.shadow.mapSize.height <= 0);
      if (needsDefaults) {
        light.shadow.mapSize.width = size;
        light.shadow.mapSize.height = size;
        light.shadow.bias = WEB_EXPORT_SUN_SHADOW_BIAS;
        light.shadow.normalBias = WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS;
        light.shadow.radius = 4;
        light.shadow.camera.near = 0.001;
        light.shadow.camera.far = 1200;
        light.shadow.camera.left = -200;
        light.shadow.camera.right = 200;
        light.shadow.camera.top = 200;
        light.shadow.camera.bottom = -200;
        light.shadow.camera.updateProjectionMatrix();
        light.userData.__webExportSunShadowConfigured = true;
      }
      light.shadow.needsUpdate = true;
    }

    function webExportIsSunDirectionalLight(light) {
      if (!light || !(light instanceof THREE.DirectionalLight)) return false;
      if (light.userData.isSun || light.userData.isGlobalSun) return true;
      const weather = CONFIG && CONFIG.weather;
      if (weather && weather.enableStandaloneWeather && light.userData.lightId === 'light_1') return true;
      return false;
    }

    function webExportSyncSunOnlyShadowCasters(scene) {
      if (!scene) return;
      const weather = CONFIG && CONFIG.weather;
      if (!weather || !weather.enableStandaloneWeather) return;
      let sunFound = false;
      scene.traverse(function(obj) {
        if (!(obj instanceof THREE.DirectionalLight)) return;
        if (webExportIsSunDirectionalLight(obj)) {
          sunFound = true;
          obj.userData.isSun = true;
          if (!obj.castShadow) {
            obj.castShadow = true;
            if (obj.shadow) obj.shadow.needsUpdate = true;
          }
          webExportConfigureSunShadow(obj);
        } else if (obj.castShadow) {
          obj.castShadow = false;
          if (obj.shadow) obj.shadow.needsUpdate = true;
        }
      });
      if (!sunFound) {
        const sunLight = webExportEnsureSunLight(scene, weather);
        if (sunLight) sunFound = true;
      }
      return sunFound;
    }

    function webExportConfigureGridHelperForShadows(gridHelper) {
      if (!gridHelper) return;
      gridHelper.renderOrder = 1;
      const materials = gridHelper.material
        ? (Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material])
        : [];
      materials.forEach(function(mat) {
        if (!mat) return;
        mat.depthWrite = false;
        mat.depthTest = true;
        mat.transparent = true;
        mat.needsUpdate = true;
      });
    }

    function webExportApplyShadowCatcherMaterial(shadowPlane, shadowIntensity, standaloneWeather, scene) {
      if (!shadowPlane || !shadowPlane.material) return;
      const opacity = webExportShadowCatcherOpacity(shadowIntensity || 1);
      const catcherSide = standaloneWeather ? THREE.FrontSide : THREE.DoubleSide;
      const compositeOverGrid = webExportShouldCompositeShadowCatcherOverGrid(standaloneWeather, scene);
      const depthWrite = compositeOverGrid ? false : true;
      let material = Array.isArray(shadowPlane.material) ? shadowPlane.material[0] : shadowPlane.material;
      if (!(material instanceof THREE.ShadowMaterial)) {
        if (material instanceof THREE.Material) material.dispose();
        material = new THREE.ShadowMaterial({
          opacity: opacity,
          transparent: true,
          depthWrite: depthWrite,
          depthTest: true,
          side: catcherSide
        });
        shadowPlane.material = material;
      } else {
        material.opacity = opacity;
        material.transparent = true;
        material.depthWrite = depthWrite;
        material.depthTest = true;
        material.side = catcherSide;
        material.needsUpdate = true;
      }
      material.fog = false;
      material.userData.baseOpacity = opacity;
      material.userData.isHdrGroundShadowCatcher = true;
      material.userData.webExportStandaloneGridComposite = compositeOverGrid;
      material.visible = true;
      if (compositeOverGrid) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
      } else {
        material.polygonOffset = false;
      }
      shadowPlane.receiveShadow = true;
      shadowPlane.castShadow = false;
      shadowPlane.renderOrder = compositeOverGrid
        ? WEB_EXPORT_STANDALONE_GRID_SHADOW_CATCHER_RENDER_ORDER
        : 0;
      shadowPlane.frustumCulled = false;
    }

    function webExportExpandBoundsWithShadowCatcher(box, catcherY, halfExtent) {
      const expanded = box.clone();
      expanded.expandByPoint(new THREE.Vector3(-halfExtent, catcherY, -halfExtent));
      expanded.expandByPoint(new THREE.Vector3(halfExtent, catcherY, halfExtent));
      return expanded;
    }

    function webExportEnsureSubjectCastShadow(subjectRoot) {
      if (!subjectRoot) return 0;
      let castingCount = 0;
      subjectRoot.traverse(function(obj) {
        if (!(obj instanceof THREE.Mesh)) return;
        const ud = obj.userData || {};
        if (ud.isShadowPlane || ud.isHelper || ud.isGridHelper || ud.isAxesHelper) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        let isTransparent = false;
        materials.forEach(function(mat) {
          if (!mat) return;
          const opacity = typeof mat.opacity === 'number' ? mat.opacity : 1;
          const transmission = typeof mat.transmission === 'number' ? mat.transmission : 0;
          const matName = (mat.name || '').toLowerCase();
          const isGlassLike =
            matName.indexOf('glass') !== -1 ||
            matName.indexOf('window') !== -1 ||
            matName.indexOf('windshield') !== -1;
          if (transmission > 0 || (mat.transparent === true && opacity < 0.2) || isGlassLike) {
            isTransparent = true;
          }
        });
        if (!isTransparent && !obj.castShadow) obj.castShadow = true;
        if (!obj.receiveShadow) obj.receiveShadow = true;
        if (obj.castShadow) castingCount++;
      });
      return castingCount;
    }

    function webExportFitSunShadowCameraToSubject(scene, subjectRoot) {
      if (!scene || !subjectRoot) return false;
      const sunLight = webExportFindSunLight(scene);
      if (!sunLight || !sunLight.castShadow || !sunLight.shadow || !sunLight.shadow.camera) return false;
      let box = computeSubjectBounds(subjectRoot);
      if (box.isEmpty()) return false;
      const targetCenter = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxSide = Math.max(size.x, size.y, size.z) || 10;
      const planeHalf = Math.min(Math.max(size.x, size.z) * 0.75, WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS);
      const catcherY = webExportResolveShadowCatcherY(subjectRoot, false);
      box = webExportExpandBoundsWithShadowCatcher(
        box,
        catcherY,
        Math.max(planeHalf, 25)
      );
      const expandedSize = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(expandedSize.x, expandedSize.y, expandedSize.z, maxSide);
      const extent = Math.max(maxDim * 0.75, 50);
      const shadowNear = 0.001;
      const shadowFar = Math.max(shadowNear + 10, maxDim * 3.5, 200);
      const cam = sunLight.shadow.camera;
      if (cam.isOrthographicCamera) {
        cam.left = -extent;
        cam.right = extent;
        cam.top = extent;
        cam.bottom = -extent;
      }
      cam.near = shadowNear;
      cam.far = shadowFar;
      if (!sunLight.target) sunLight.target = new THREE.Object3D();
      if (!sunLight.target.parent) scene.add(sunLight.target);
      sunLight.target.position.copy(targetCenter);
      sunLight.target.updateMatrixWorld(true);
      const weather = CONFIG && CONFIG.weather;
      const standaloneWeather = !!(weather && weather.enableStandaloneWeather);
      sunLight.shadow.bias = WEB_EXPORT_SUN_SHADOW_BIAS;
      sunLight.shadow.normalBias = webExportStandaloneSunNormalBias(standaloneWeather);
      cam.updateProjectionMatrix();
      sunLight.shadow.needsUpdate = true;
      return true;
    }

    function webExportRefitShadowPlaneUnderSubject(scene, subjectRoot, groundProjectionEnabled) {
      if (!scene || !subjectRoot) return null;
      let shadowPlane = null;
      scene.traverse(function(obj) {
        if (!shadowPlane && obj instanceof THREE.Mesh &&
            (obj.userData.isShadowPlane || (obj.name || '').toLowerCase().indexOf('shadow') !== -1)) {
          shadowPlane = obj;
        }
      });
      if (!shadowPlane) return null;
      const box = computeSubjectBounds(subjectRoot);
      if (box.isEmpty()) return shadowPlane;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radiusX = Math.min(size.x * 0.75, WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS);
      const radiusZ = Math.min(size.z * 0.75, WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS);
      shadowPlane.position.x = center.x;
      shadowPlane.position.z = center.z;
      if (!groundProjectionEnabled) {
        shadowPlane.scale.set(1, 1, 1);
        shadowPlane.position.y = webExportResolveShadowCatcherY(subjectRoot, false);
      }
      shadowPlane.scale.x = Math.max(radiusX / 5, 1);
      shadowPlane.scale.z = Math.max(radiusZ / 5, 1);
      shadowPlane.visible = true;
      shadowPlane.receiveShadow = true;
      shadowPlane.castShadow = false;
      shadowPlane.updateMatrixWorld(true);
      return shadowPlane;
    }

    function webExportEnsureSunLight(scene, weather) {
      let sunLight = webExportFindSunLight(scene);
      if (!sunLight && weather && weather.enableStandaloneWeather) {
        sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.name = 'WebExport Standalone Weather Sun';
        sunLight.userData.isSun = true;
        sunLight.userData.isGlobalSun = true;
        scene.add(sunLight);
        scene.add(sunLight.target);
        console.log('[WebExport] Created standalone weather sun light for shadows');
      }
      if (sunLight) {
        sunLight.userData.isSun = true;
        if (sunLight.target && !sunLight.target.parent) scene.add(sunLight.target);
        webExportConfigureSunShadow(sunLight);
      }
      return sunLight;
    }

    function webExportFindAmbientLight(scene) {
      let ambient = null;
      scene.traverse((obj) => {
        if (obj instanceof THREE.AmbientLight && !ambient) ambient = obj;
      });
      return ambient;
    }

    function webExportCreateParticleSystem(scene, type, intensity, weather) {
      if (intensity <= 0) return null;
      const quality = weather.weatherQuality || 'high';
      const maxByQuality = { low: 3000, medium: 6000, high: 10000, ultra: 15000 };
      const maxParticles = maxByQuality[quality] || 10000;
      const count = Math.max(100, Math.floor(intensity * maxParticles));
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const spread = 120;
      const groundY = WEB_EXPORT_WEATHER_GROUND_LEVEL + 2;
      const topY = groundY + 80;
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = groundY + Math.random() * (topY - groundY);
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
        const wind = (weather.windIntensity || 0) * 2;
        velocities[i * 3] = (Math.random() - 0.5) * wind;
        velocities[i * 3 + 1] = type === 'rain' ? -(8 + Math.random() * 6) : -(0.5 + Math.random() * 1.5);
        velocities[i * 3 + 2] = (Math.random() - 0.5) * wind;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const scale = type === 'rain'
        ? (weather.rainParticleScale || 1)
        : (weather.snowParticleScale || 1);
      const speedMul = type === 'rain'
        ? (weather.rainParticleSpeed || 1)
        : (weather.snowParticleSpeed || 1);
      const color = type === 'rain' ? 0xaaccff : 0xffffff;
      const material = new THREE.PointsMaterial({
        color: color,
        size: (type === 'rain' ? 0.35 : 0.5) * scale,
        transparent: true,
        opacity: type === 'rain' ? 0.45 : 0.75,
        depthWrite: false,
        sizeAttenuation: true
      });
      const points = new THREE.Points(geometry, material);
      points.userData.isParticleSystem = true;
      points.userData.excludeFromFog = true;
      webExportMarkRuntimeWeather(points);
      points.userData.particleType = type;
      points.userData.velocities = velocities;
      points.userData.speedMul = speedMul;
      points.userData.spread = spread;
      points.userData.groundY = groundY;
      points.userData.topY = topY;
      points.frustumCulled = false;
      scene.add(points);
      return points;
    }

    function webExportUpdateParticles(particles, camera, dt, weather) {
      if (!particles || !particles.geometry) return;
      const posAttr = particles.geometry.getAttribute('position');
      if (!posAttr) return;
      const positions = posAttr.array;
      const velocities = particles.userData.velocities;
      const spread = particles.userData.spread || 120;
      const groundY = particles.userData.groundY || WEB_EXPORT_WEATHER_GROUND_LEVEL + 2;
      const topY = particles.userData.topY || groundY + 80;
      const speedMul = particles.userData.speedMul || 1;
      const camX = camera.position.x;
      const camZ = camera.position.z;
      const wind = (weather.windIntensity || 0) * dt * 3;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += (velocities[i] + wind) * dt * speedMul;
        positions[i + 1] += velocities[i + 1] * dt * speedMul;
        positions[i + 2] += (velocities[i + 2] + wind * 0.5) * dt * speedMul;
        if (positions[i + 1] < groundY) {
          positions[i] = camX + (Math.random() - 0.5) * spread;
          positions[i + 1] = topY;
          positions[i + 2] = camZ + (Math.random() - 0.5) * spread;
        }
        if (Math.abs(positions[i] - camX) > spread * 0.75) {
          positions[i] = camX + (Math.random() - 0.5) * spread;
        }
        if (Math.abs(positions[i + 2] - camZ) > spread * 0.75) {
          positions[i + 2] = camZ + (Math.random() - 0.5) * spread;
        }
      }
      posAttr.needsUpdate = true;
    }

    function webExportUpdateSunLight(scene, sunLight, sunPosition, weather, lighting) {
      if (!sunLight) return;
      if (weather.enableStandaloneWeather && !sunLight.castShadow) {
        sunLight.castShadow = true;
        if (sunLight.shadow) sunLight.shadow.needsUpdate = true;
      }
      webExportConfigureSunShadow(sunLight);
      const lightSunDir = webExportShadowSunSkyDirection(weather.timeOfDay, weather.northOffset || 0);
      const target = sunLight.target || new THREE.Object3D();
      if (!sunLight.target) sunLight.target = target;
      if (!target.parent) scene.add(target);
      const subjectRoot = typeof renderLoopCarRoot !== 'undefined' ? renderLoopCarRoot : null;
      const targetCenter = webExportSubjectShadowTarget(subjectRoot);
      target.position.copy(targetCenter);
      target.updateMatrixWorld();
      sunLight.position.copy(lightSunDir.clone().multiplyScalar(WEB_EXPORT_SUN_LIGHT_DISTANCE));
      sunLight.intensity = lighting.sunIntensity;
      sunLight.color.set(lighting.sunColor);
      sunLight.visible = lighting.sunIntensity > 0.01;
      if (sunLight.shadow) {
        sunLight.shadow.bias = WEB_EXPORT_SUN_SHADOW_BIAS;
        sunLight.shadow.normalBias = webExportStandaloneSunNormalBias(weather.enableStandaloneWeather === true);
        sunLight.shadow.needsUpdate = true;
      }
      if (subjectRoot) {
        webExportFitSunShadowCameraToSubject(scene, subjectRoot);
      }
    }

    function webExportUpdateSunMoonMeshes(state, sunPosition, weather) {
      const { elevation } = webExportTimeOfDayToSkyAngles(weather.timeOfDay, weather.northOffset);
      const skyDir = sunPosition.clone().normalize();
      const sunDist = 800;
      if (state.sunMesh) {
        const isDay = elevation > 0;
        state.sunMesh.visible = isDay && weather.enableStandaloneWeather;
        if (isDay) {
          state.sunMesh.position.copy(skyDir.clone().multiplyScalar(sunDist));
          const sunScale = 15 * (weather.sunSize || 1);
          state.sunMesh.scale.setScalar(sunScale / 15);
          const golden = 1 - THREE.MathUtils.smoothstep(elevation, 0.06, 0.38);
          const sunColor = golden > 0.01 ? 0xffaa44 : 0xffffcc;
          state.sunMesh.material.color.setHex(sunColor);
        }
      }
      if (state.moonMesh) {
        const isNight = elevation < 0;
        state.moonMesh.visible = isNight && weather.enableStandaloneWeather;
        if (isNight) {
          state.moonMesh.position.copy(skyDir.clone().negate().multiplyScalar(sunDist * 0.9));
          const moonScale = 12 * (weather.moonSize || 1);
          state.moonMesh.scale.setScalar(moonScale / 12);
        }
      }
    }

    function webExportIqRaymarchSteps(quality, cloudDensity) {
      const presets = { low: 40, medium: 56, high: 80, ultra: 96 };
      const mins = { low: 32, medium: 48, high: 64, ultra: 64 };
      const q = presets[quality] ? quality : 'high';
      const base = presets[q];
      const minSteps = mins[q];
      const density = cloudDensity || 0;
      if (density <= 0.004) return Math.min(base, 24);
      if (q === 'high' || q === 'ultra') return Math.max(minSteps, base);
      const densityScale = 0.72 + Math.min(1, density) * 0.28;
      return Math.max(minSteps, Math.round(base * densityScale));
    }

    function webExportIqCloudBand(cameraY) {
      const baseOffset = 350;
      const layerThickness = 3800;
      const groundLevel = WEB_EXPORT_WEATHER_GROUND_LEVEL;
      const base = Math.max(groundLevel + 50, (cameraY || 0) + baseOffset);
      return { base: base, top: base + layerThickness };
    }

    function webExportIqWindSpeed(windIntensity) {
      return (windIntensity || 0) * 0.2 + 0.05;
    }

    function webExportIqSkyExposure(weather) {
      return Math.max((weather && weather.skyExposure) || 1.0, 0.85);
    }

    function webExportCreateIqCloudSky(scene, weather, sunPosition, camera) {
      const band = webExportIqCloudBand(camera ? camera.position.y : 0);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          sunPosition: { value: sunPosition.clone() },
          iTime: { value: 0 },
          coverage: { value: weather.cloudDensity || 0 },
          storminess: { value: weather.cloudStorminess || 0 },
          windSpeed: { value: webExportIqWindSpeed(weather.windIntensity) },
          exposure: { value: webExportIqSkyExposure(weather) },
          cloudScale: { value: weather.cloudScale || 1.0 },
          cloudDetail: { value: weather.cloudDetail || 0.5 },
          cloudBaseY: { value: band.base },
          cloudTopY: { value: band.top },
          raymarchSteps: { value: webExportIqRaymarchSteps(weather.weatherQuality, weather.cloudDensity || 0) }
        },
        vertexShader: WEB_EXPORT_IQ_CLOUD_VERTEX_SHADER,
        fragmentShader: WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER,
        side: THREE.BackSide,
        transparent: false,
        depthWrite: false,
        depthTest: true,
        fog: false
      });
      material.name = 'WebExportIqCloudSky';
      const geometry = new THREE.SphereGeometry(WEB_EXPORT_SKY_SPHERE_RADIUS, 32, 32);
      const sky = new THREE.Mesh(geometry, material);
      sky.name = 'Dynamic Sky';
      sky.scale.setScalar(1);
      sky.userData.isDynamicSky = true;
      sky.userData.excludeFromFog = true;
      webExportMarkRuntimeWeather(sky);
      sky.renderOrder = -1000;
      sky.frustumCulled = false;
      scene.add(sky);
      return sky;
    }

    function webExportUpdateSkyUniforms(state, weather, sunPosition, camera) {
      if (!state.sky || !state.sky.material || !state.sky.material.uniforms) return;
      const uniforms = state.sky.material.uniforms;
      if (uniforms.sunPosition) uniforms.sunPosition.value.copy(sunPosition);
      if (uniforms.coverage) uniforms.coverage.value = weather.cloudDensity || 0;
      if (uniforms.storminess) uniforms.storminess.value = weather.cloudStorminess || 0;
      if (uniforms.windSpeed) uniforms.windSpeed.value = webExportIqWindSpeed(weather.windIntensity);
      if (uniforms.exposure) uniforms.exposure.value = webExportIqSkyExposure(weather);
      if (uniforms.cloudScale) uniforms.cloudScale.value = weather.cloudScale || 1.0;
      if (uniforms.cloudDetail) uniforms.cloudDetail.value = weather.cloudDetail || 0.5;
      if (uniforms.raymarchSteps) {
        uniforms.raymarchSteps.value = webExportIqRaymarchSteps(weather.weatherQuality, weather.cloudDensity || 0);
      }
      if (uniforms.iTime) uniforms.iTime.value = state.cloudTime || 0;
      if (uniforms.cloudBaseY && camera) {
        const band = webExportIqCloudBand(camera.position.y);
        uniforms.cloudBaseY.value = band.base;
        uniforms.cloudTopY.value = band.top;
      }
    }

    window.__webExportWeather = window.__webExportWeather || {
      initialized: false,
      sky: null,
      sunMesh: null,
      moonMesh: null,
      rain: null,
      snow: null,
      cloudTime: 0,
      lastTime: performance.now()
    };

    function webExportMarkRuntimeWeather(obj) {
      if (!obj) return;
      if (!obj.userData) obj.userData = {};
      obj.userData.isWebExportRuntimeWeather = true;
    }

    function initializeWebExportWeather(ctx) {
      const state = window.__webExportWeather;
      if (state.initialized) {
        console.log('[WebExport] Weather already initialized — skipping duplicate init');
        return;
      }

      const weather = normalizeWebExportWeatherConfig(CONFIG.weather || {});
      CONFIG.weather = weather;
      if (!isWebExportWeatherActive(weather)) {
        console.log('[WebExport] Weather inactive — skipping initialization');
        return;
      }

      const { scene, camera, renderer } = ctx;
      removeExportedWeatherMeshes(scene);
      const hdrConfig = CONFIG.hdr || {};
      const groundProjectionEnabled = hdrConfig.groundProjectionEnabled === true;
      const hdrActive = hdrConfig.enabled !== false && (hdrConfig.enabled === true || !!window.__hdrTextureLoaded);
      const useStandaloneSky = webExportIsStandaloneSkyActive(weather, hdrConfig);

      webExportApplyFog(scene, weather);

      if (weather.rainIntensity > 0 && !state.rain) {
        state.rain = webExportCreateParticleSystem(scene, 'rain', weather.rainIntensity, weather);
      }
      if (weather.snowIntensity > 0 && !state.snow) {
        state.snow = webExportCreateParticleSystem(scene, 'snow', weather.snowIntensity, weather);
      }

      const { sunPosition, elevation } = webExportTimeOfDayToSkyAngles(weather.timeOfDay, weather.northOffset);

      if (useStandaloneSky) {
        webExportEnsureDynamicSkyCameraFar(camera);
        // Match editor: DynamicSky replaces HDR background; keep HDR as scene.environment for IBL
        scene.background = null;
        if (!state.sky) {
          state.sky = webExportCreateIqCloudSky(scene, weather, sunPosition, camera);
          console.log('[WebExport] iq cloud sky dome created (matches editor DynamicSky)');
        }
        if (!state.sunMesh) {
          const sunGeo = new THREE.SphereGeometry(15, 24, 24);
          const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.95, fog: false });
          const sunMesh = new THREE.Mesh(sunGeo, sunMat);
          sunMesh.userData.isSun = true;
          sunMesh.userData.excludeFromFog = true;
          webExportMarkRuntimeWeather(sunMesh);
          sunMesh.renderOrder = -900;
          sunMesh.frustumCulled = false;
          scene.add(sunMesh);
          state.sunMesh = sunMesh;
        }
        if (!state.moonMesh) {
          const moonGeo = new THREE.SphereGeometry(12, 24, 24);
          const moonMat = new THREE.MeshBasicMaterial({ color: 0xddddff, transparent: true, opacity: 0.85, fog: false });
          const moonMesh = new THREE.Mesh(moonGeo, moonMat);
          moonMesh.userData.isMoon = true;
          moonMesh.userData.excludeFromFog = true;
          webExportMarkRuntimeWeather(moonMesh);
          moonMesh.renderOrder = -900;
          moonMesh.frustumCulled = false;
          scene.add(moonMesh);
          state.moonMesh = moonMesh;
        }
      }
      webExportEnsureStandaloneEnvironment(scene, renderer, weather, sunPosition, state);

      let lighting = webExportComputeSunLighting(elevation);
      const dimmed = webExportApplyWeatherPresetDimming(weather, lighting);
      lighting = Object.assign({}, lighting, dimmed);
      lighting = webExportApplyStandaloneLightingHdrBoosts(weather, lighting, scene, renderer);

      const sunLight = webExportEnsureSunLight(scene, weather);
      const ambientLight = webExportFindAmbientLight(scene);
      if (sunLight && (weather.enableStandaloneWeather || useStandaloneSky)) {
        webExportUpdateSunLight(scene, sunLight, sunPosition, weather, lighting);
      }
      if (ambientLight && weather.enableStandaloneWeather) {
        ambientLight.intensity = lighting.ambientIntensity;
        ambientLight.color.set(lighting.ambientColor);
      }
      if (renderer) {
        renderer.toneMappingExposure = webExportResolveToneMappingExposure(weather, lighting);
      }

      webExportUpdateSkyUniforms(state, weather, sunPosition, camera);
      webExportUpdateSunMoonMeshes(state, sunPosition, weather);

      webExportSyncSunOnlyShadowCasters(scene);

      webExportEnsureExportLightsVisible(scene);

      const subjectRootForShadows = typeof renderLoopCarRoot !== 'undefined' ? renderLoopCarRoot : null;
      if (subjectRootForShadows) {
        const castingCount = webExportEnsureSubjectCastShadow(subjectRootForShadows);
        if (castingCount > 0) {
          console.log('[WebExport] Post-weather car castShadow verified on', castingCount, 'mesh(es)');
        }
      }

      const shadowsConfig = CONFIG.shadows || {};
      const lightingCfg = CONFIG.lighting || {};
      const shadowsEnabled = shadowsConfig.enabled !== false && lightingCfg.shadowsEnabled !== false;
      const shadowIntensity = shadowsConfig.shadowIntensity !== undefined ? shadowsConfig.shadowIntensity : 1.0;
      const useShadowCatcher = webExportShouldUseShadowCatcher(weather, hdrActive, shadowsEnabled);

      if (useShadowCatcher) {
        scene.traverse(function(obj) {
          if (obj instanceof THREE.Mesh && (obj.userData.isShadowPlane || (obj.name || '').toLowerCase().indexOf('shadow') !== -1)) {
            webExportApplyShadowCatcherMaterial(obj, shadowIntensity, weather.enableStandaloneWeather === true, scene);
            if (!groundProjectionEnabled && subjectRootForShadows) {
              obj.position.y = webExportResolveShadowCatcherY(subjectRootForShadows, false);
            }
          }
        });
      }

      const subjectRoot = typeof renderLoopCarRoot !== 'undefined' ? renderLoopCarRoot : null;
      if (subjectRoot) {
        const refitted = webExportRefitShadowPlaneUnderSubject(scene, subjectRoot, groundProjectionEnabled);
        if (refitted) {
          console.log('[WebExport] Shadow plane re-fit after weather init at',
            '(' + refitted.position.x.toFixed(2) + ', ' + refitted.position.y.toFixed(2) + ', ' + refitted.position.z.toFixed(2) + ')');
        }
        if (webExportFitSunShadowCameraToSubject(scene, subjectRoot)) {
          const cam = sunLight && sunLight.shadow ? sunLight.shadow.camera : null;
          console.log('[WebExport] Sun shadow camera fitted to subject:',
            'extent=' + (cam ? Math.max(Math.abs(cam.left || 0), Math.abs(cam.top || 0)).toFixed(1) : 'n/a') +
            ', far=' + (cam ? cam.far : 'n/a'));
        }
      }

      if (sunLight && !window.__webExportSunLightDiagnosticsLogged) {
        window.__webExportSunLightDiagnosticsLogged = true;
        const hasEnvironment = !!(window.__webExportWeather && window.__webExportWeather.lastHasEnvironment);
        const sunBoost = webExportResolveStandaloneSunBoost(hasEnvironment);
        const baseSun = lighting && sunBoost > 0 ? lighting.sunIntensity / sunBoost : sunLight.intensity;
        const t = sunLight.target ? sunLight.target.position : null;
        console.log('[WebExport] Sun light after weather init:',
          'id=' + (sunLight.userData.lightId || sunLight.name || 'unnamed'),
          'intensity=' + sunLight.intensity.toFixed(3) + ' (base=' + baseSun.toFixed(3) + ', boost=' + sunBoost.toFixed(2) + 'x)',
          'visible=' + sunLight.visible,
          'pos=(' + sunLight.position.x.toFixed(1) + ',' + sunLight.position.y.toFixed(1) + ',' + sunLight.position.z.toFixed(1) + ')',
          'target=(' + (t ? t.x.toFixed(2) + ',' + t.y.toFixed(2) + ',' + t.z.toFixed(2) : 'n/a') + ')',
          'castShadow=' + sunLight.castShadow,
          'normalBias=' + (sunLight.shadow ? sunLight.shadow.normalBias : 'n/a'));
      }
      if (weather.enableStandaloneWeather && !window.__webExportAuxLightDiagnosticsLogged) {
        window.__webExportAuxLightDiagnosticsLogged = true;
        const auxLights = [];
        scene.traverse(function(obj) {
          if (!(obj instanceof THREE.DirectionalLight)) return;
          if (webExportIsSunDirectionalLight(obj)) return;
          auxLights.push({
            id: obj.userData.lightId || obj.name || 'unnamed',
            intensity: obj.intensity,
            visible: obj.visible,
            castShadow: obj.castShadow
          });
        });
        if (auxLights.length > 0) {
          console.log('[WebExport] Standalone aux directional lights (editor fill — shadows disabled):', auxLights);
        }
      }

      scene.traverse(function(obj) {
        if (obj.userData && obj.userData.isGridHelper) {
          webExportConfigureGridHelperForShadows(obj);
        }
      });

      state.initialized = true;
      state.weather = weather;
      state.useStandaloneSky = useStandaloneSky;
      webExportLogWeatherDiagnostics(scene, camera, renderer, weather, state);
      console.log('[WebExport] Weather initialized ✓ preset=' + (weather.preset || 'clear') +
        ' enableStandaloneWeather=' + weather.enableStandaloneWeather +
        ' useStandaloneSky=' + useStandaloneSky +
        ' background=' + (scene.background ? 'texture' : 'null (sky dome)') +
        ' hasEnvironment=' + !!scene.environment +
        ' timeOfDay=' + weather.timeOfDay +
        ' fog=' + weather.fogDensity + ' rain=' + weather.rainIntensity +
        ' snow=' + weather.snowIntensity + ' clouds=' + weather.cloudDensity +
        ' skyExposure=' + weather.skyExposure +
        ' toneMappingExposure=' + (renderer ? renderer.toneMappingExposure : 'n/a') +
        ' cameraFar=' + (camera ? camera.far : 'n/a') +
        ' skyInScene=' + !!(state.sky && state.sky.parent) +
        (useStandaloneSky ? ' skyRadius=' + WEB_EXPORT_SKY_SPHERE_RADIUS : ''));
    }

    function updateWebExportWeather(scene, camera, renderer) {
      const state = window.__webExportWeather;
      if (!state.initialized || !state.weather || !scene) return;
      const weather = state.weather;
      const now = performance.now();
      const dt = Math.min(0.05, (now - (state.lastTime || now)) / 1000);
      state.lastTime = now;
      state.cloudTime = (state.cloudTime || 0) + dt;

      if (state.useStandaloneSky) {
        webExportEnsureDynamicSkyCameraFar(camera);
      }

      const { sunPosition, elevation } = webExportTimeOfDayToSkyAngles(weather.timeOfDay, weather.northOffset);
      let lighting = webExportComputeSunLighting(elevation);
      const dimmed = webExportApplyWeatherPresetDimming(weather, lighting);
      lighting = Object.assign({}, lighting, dimmed);
      lighting = webExportApplyStandaloneLightingHdrBoosts(weather, lighting, scene, renderer);

      if (state.rain) webExportUpdateParticles(state.rain, camera, dt, weather);
      if (state.snow) webExportUpdateParticles(state.snow, camera, dt, weather);
      webExportUpdateSkyUniforms(state, weather, sunPosition, camera);
      webExportUpdateSunMoonMeshes(state, sunPosition, weather);

      const sunLight = webExportEnsureSunLight(scene, weather);
      if (sunLight && weather.enableStandaloneWeather) {
        webExportUpdateSunLight(scene, sunLight, sunPosition, weather, lighting);
      }
      webExportSyncSunOnlyShadowCasters(scene);
      const ambientLight = webExportFindAmbientLight(scene);
      if (ambientLight && weather.enableStandaloneWeather) {
        ambientLight.intensity = lighting.ambientIntensity;
        ambientLight.color.set(lighting.ambientColor);
      }
      if (renderer) {
        renderer.toneMappingExposure = webExportResolveToneMappingExposure(weather, lighting);
      }
      webExportEnsureExportLightsVisible(scene);
    }
  `
}
