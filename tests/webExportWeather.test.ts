import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  generateWebExportWeatherRuntimeJs,
  isExportedWeatherMeshLike,
  isWeatherExportActive,
  isWebExportStandaloneSkyActive,
  normalizeWebExportWeatherConfig,
  shouldExcludeFromSubjectBounds,
  webExportClampSunSkyDirection,
  webExportIsSunLightConfig,
  webExportShadowCatcherOpacity,
  webExportResolveShadowCatcherY,
  webExportSceneHasGridHelper,
  webExportShadowSunSkyDirection,
  webExportShouldCompositeShadowCatcherOverGrid,
  webExportStandaloneSunNormalBias,
  webExportShouldUseShadowCatcher,
  webExportTimeOfDayToSkyAngles,
  WEB_EXPORT_FOG_DENSITY_SCALE,
  WEB_EXPORT_MAX_SUBJECT_EXTENT,
  WEB_EXPORT_MIN_CAMERA_FAR,
  WEB_EXPORT_MIN_SHADOW_CATCHER_OPACITY,
  WEB_EXPORT_SHADOW_PLANE_GROUND_Y,
  WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS,
  WEB_EXPORT_HDR_AMBIENT_REDUCTION_WITH_SHADOWS,
  WEB_EXPORT_HDR_ENV_MAP_INTENSITY_SHADOW_MUL,
  WEB_EXPORT_SHADOW_SUN_MAX_Y,
  WEB_EXPORT_SKY_SPHERE_RADIUS,
  WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y,
  WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS,
  WEB_EXPORT_STANDALONE_GRID_SHADOW_CATCHER_RENDER_ORDER,
  WEB_EXPORT_SUN_LIGHT_DISTANCE,
  WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS,
  webExportComputeHdrAmbientIntensity,
  webExportComputeHdrExposureBoost,
  WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST,
  WEB_EXPORT_STANDALONE_PROCEDURAL_EXPOSURE_BOOST,
  WEB_EXPORT_STANDALONE_PROCEDURAL_ENV_MAP_INTENSITY,
  WEB_EXPORT_STANDALONE_PROCEDURAL_METALLIC_ENV_MAP_INTENSITY,
  webExportResolveStandaloneSunBoost,
  webExportResolveStandaloneExposureBoost,
  webExportResolveStandaloneAmbientIntensity,
  webExportComputeHdrSunBoost
} from '../src/utils/webExportWeatherRuntime'

describe('webExportWeatherRuntime', () => {
  it('detects inactive weather when all sliders are zero', () => {
    expect(isWeatherExportActive({})).toBe(false)
    expect(
      isWeatherExportActive({
        fogDensity: 0,
        rainIntensity: 0,
        snowIntensity: 0,
        cloudDensity: 0
      })
    ).toBe(false)
  })

  it('detects active weather from fog, rain, snow, or clouds', () => {
    expect(isWeatherExportActive({ fogDensity: 0.2 })).toBe(true)
    expect(isWeatherExportActive({ rainIntensity: 0.5 })).toBe(true)
    expect(isWeatherExportActive({ snowIntensity: 0.3 })).toBe(true)
    expect(isWeatherExportActive({ cloudDensity: 0.4 })).toBe(true)
  })

  it('detects active weather when standalone mode is enabled', () => {
    expect(
      isWeatherExportActive({
        enableStandaloneWeather: true,
        fogDensity: 0,
        rainIntensity: 0,
        snowIntensity: 0,
        cloudDensity: 0
      })
    ).toBe(true)
  })

  it('normalizes legacy weatherPreset field to preset', () => {
    const config = normalizeWebExportWeatherConfig({
      weatherPreset: 'stormy',
      enableStandaloneWeather: true,
      fogDensity: 0.25
    })
    expect(config.preset).toBe('stormy')
    expect(config.enableStandaloneWeather).toBe(true)
    expect(config.fogDensity).toBe(0.25)
    expect(config.timeOfDay).toBe(12)
  })

  it('detects standalone sky mode (matches editor DynamicSky path)', () => {
    expect(
      isWebExportStandaloneSkyActive(
        { enableStandaloneWeather: true, dynamicSkyEnabled: true },
        { groundProjectionEnabled: false }
      )
    ).toBe(true)
    // Editor ignores legacy dynamicSkyEnabled=false when standalone weather is on
    expect(
      isWebExportStandaloneSkyActive(
        { enableStandaloneWeather: true, dynamicSkyEnabled: false },
        { groundProjectionEnabled: false }
      )
    ).toBe(true)
    expect(
      isWebExportStandaloneSkyActive(
        { enableStandaloneWeather: true, dynamicSkyEnabled: true },
        { groundProjectionEnabled: true }
      )
    ).toBe(false)
    expect(
      isWebExportStandaloneSkyActive(
        { enableStandaloneWeather: false, fogDensity: 0.5 },
        {}
      )
    ).toBe(false)
  })

  it('embeds runtime JS with fog scale and init/update functions', () => {
    const js = generateWebExportWeatherRuntimeJs()
    expect(js).toContain(String(WEB_EXPORT_FOG_DENSITY_SCALE))
    expect(js).toContain(String(WEB_EXPORT_SKY_SPHERE_RADIUS))
    expect(js).toContain(String(WEB_EXPORT_MIN_CAMERA_FAR))
    expect(js).toContain(String(WEB_EXPORT_MAX_SUBJECT_EXTENT))
    expect(js).toContain(String(WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS))
    expect(js).toContain(String(WEB_EXPORT_SHADOW_PLANE_GROUND_Y))
    expect(js).toContain(String(WEB_EXPORT_SHADOW_SUN_MAX_Y))
    expect(js).toContain(String(WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y))
    expect(js).toContain(String(WEB_EXPORT_SUN_LIGHT_DISTANCE))
    expect(js).toContain('function webExportShadowSunSkyDirection')
    expect(js).toContain('function webExportSyncSunOnlyShadowCasters')
    expect(js).toContain('function webExportApplyShadowCatcherMaterial')
    expect(js).toContain('function webExportSceneHasGridHelper')
    expect(js).toContain('function webExportShouldCompositeShadowCatcherOverGrid')
    expect(js).toContain('function webExportSubjectShadowTarget')
    expect(js).toContain('webExportStandaloneGridComposite')
    expect(js).toContain(String(WEB_EXPORT_STANDALONE_GRID_SHADOW_CATCHER_RENDER_ORDER))
    expect(js).toContain(String(WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS))
    expect(js).toContain('function webExportRefitShadowPlaneUnderSubject')
    expect(js).toContain('function webExportConfigureGridHelperForShadows')
    expect(js).toContain('function initializeWebExportWeather')
    expect(js).toContain('function updateWebExportWeather')
    expect(js).toContain('function webExportIsStandaloneSkyActive')
    expect(js).toContain('function webExportLogWeatherDiagnostics')
    expect(js).toContain('function resolveExportAssetUrl')
    expect(js).toContain('function removeExportedWeatherMeshes')
    expect(js).toContain('function computeSubjectBounds')
    expect(js).toContain('enableStandaloneWeather')
    expect(js).toContain('function webExportCreateIqCloudSky')
    expect(js).toContain('WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER')
    expect(js).toContain('THREE.BackSide')
    expect(js).toContain('sky.frustumCulled = false')
    expect(js).toContain('iq cloud sky dome created')
    expect(js).toContain('Weather initialized ✓')
    expect(js).toContain('function webExportMarkRuntimeWeather')
    expect(js).toContain('isWebExportRuntimeWeather')
    expect(js).toContain('Weather already initialized')
    expect(js).toContain('Weather diagnostics (once) enableStandaloneWeather=')
    expect(js).toContain('function webExportEnsureStandaloneEnvironment')
    expect(js).toContain('Standalone sky environment applied for PBR IBL')
    expect(js).toContain('function webExportEnsureSunLight')
    expect(js).toContain('function webExportApplyHdrShadowContrastToMaterials')
    expect(js).toContain('function webExportApplyStandaloneLightingHdrBoosts')
    expect(js).toContain('function webExportEnsureExportLightsVisible')
    expect(js).toContain('function webExportApplyStandaloneProceduralEnvMapIntensity')
    expect(js).toContain('function webExportIsSubjectPbrMesh')
    expect(js).toContain(String(WEB_EXPORT_STANDALONE_PROCEDURAL_METALLIC_ENV_MAP_INTENSITY))
    expect(js).toContain('Standalone procedural IBL applied to')
    expect(js).toContain('Sun light after weather init:')
    expect(js).toContain('intensity=')
    expect(js).toContain('Standalone aux directional lights')
    expect(js).toContain('function webExportHasLoadedHdrTexture')
    expect(js).toContain(String(WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST))
    expect(js).toContain('function webExportFitSunShadowCameraToSubject')
    expect(js).toContain('function webExportEnsureSubjectCastShadow')
    expect(js).toContain('function webExportExpandBoundsWithShadowCatcher')
    expect(js).toContain('function webExportComputeHdrSunBoost')
    expect(js).toContain('HDR shadow contrast applied')
  })

  it('applies HDR sun and exposure boosts when HDR is enabled', () => {
    expect(webExportComputeHdrSunBoost(false, 1.5)).toBe(1.0)
    expect(webExportComputeHdrSunBoost(true, 1.0)).toBeGreaterThanOrEqual(1.0)
    expect(webExportComputeHdrExposureBoost(true, 1.0)).toBeGreaterThanOrEqual(1.0)
    const ambient = webExportComputeHdrAmbientIntensity(0.6, true, true, 1.5)
    expect(ambient).toBeGreaterThan(0.1)
    expect(ambient).toBeLessThan(0.6)
  })

  it('uses procedural IBL boosts when HDR texture is not loaded', () => {
    expect(
      webExportResolveStandaloneSunBoost({
        hdrTextureLoaded: false,
        hdrEnabled: false,
        hdrIntensity: 1,
        hasSceneEnvironment: true
      })
    ).toBe(WEB_EXPORT_STANDALONE_PROCEDURAL_SUN_BOOST)
    expect(
      webExportResolveStandaloneExposureBoost({
        hdrTextureLoaded: false,
        hdrEnabled: false,
        hdrIntensity: 1,
        hasSceneEnvironment: true
      })
    ).toBe(WEB_EXPORT_STANDALONE_PROCEDURAL_EXPOSURE_BOOST)
    const proceduralAmbient = webExportResolveStandaloneAmbientIntensity(0.4, true, {
      hdrTextureLoaded: false,
      hdrEnabled: true,
      hdrIntensity: 1,
      hasSceneEnvironment: true
    })
    expect(proceduralAmbient).toBeGreaterThan(0.28)
    expect(proceduralAmbient).toBeGreaterThan(
      webExportComputeHdrAmbientIntensity(0.4, true, true, 1)
    )
    expect(WEB_EXPORT_STANDALONE_PROCEDURAL_ENV_MAP_INTENSITY).toBeGreaterThan(1)
    expect(WEB_EXPORT_STANDALONE_PROCEDURAL_METALLIC_ENV_MAP_INTENSITY).toBeGreaterThan(
      WEB_EXPORT_STANDALONE_PROCEDURAL_ENV_MAP_INTENSITY
    )
  })

  it('prefers loaded HDR boosts over procedural when texture is present', () => {
    expect(
      webExportResolveStandaloneSunBoost({
        hdrTextureLoaded: true,
        hdrEnabled: true,
        hdrIntensity: 1,
        hasSceneEnvironment: true
      })
    ).toBe(webExportComputeHdrSunBoost(true, 1))
  })

  it('reduces HDR env map intensity target when shadows are on', () => {
    expect(WEB_EXPORT_HDR_ENV_MAP_INTENSITY_SHADOW_MUL).toBe(0.55)
    expect(WEB_EXPORT_HDR_AMBIENT_REDUCTION_WITH_SHADOWS).toBe(0.65)
  })

  it('identifies sun light config for standalone weather export', () => {
    expect(webExportIsSunLightConfig({ id: 'light_2', isSun: true }, 1, true)).toBe(true)
    expect(webExportIsSunLightConfig({ id: 'light_1' }, 0, true)).toBe(true)
    expect(webExportIsSunLightConfig({ id: 'light_2' }, 1, true)).toBe(false)
    expect(webExportIsSunLightConfig({ id: 'sun' }, 2, false)).toBe(true)
  })

  it('uses grid-level shadow plane Y matching editor', () => {
    expect(WEB_EXPORT_SHADOW_PLANE_GROUND_Y).toBe(-0.001)
    expect(WEB_EXPORT_SUN_LIGHT_DISTANCE).toBe(1000)
  })

  it('caps noon shadow sun below zenith for visible ground shadows', () => {
    const { sunPosition } = webExportTimeOfDayToSkyAngles(12, 0)
    expect(sunPosition.y).toBeCloseTo(1, 1)
    const lightDir = webExportShadowSunSkyDirection(12, 0)
    expect(lightDir.y).toBeLessThan(WEB_EXPORT_SHADOW_SUN_MAX_Y + 0.001)
    expect(lightDir.y).toBeGreaterThan(WEB_EXPORT_STANDALONE_MIN_SUN_ELEVATION_Y)
    expect(lightDir.length()).toBeCloseTo(1, 5)
  })

  it('keeps below-horizon sun clamped above ground for shadow lights', () => {
    const midnight = webExportShadowSunSkyDirection(0, 0)
    expect(midnight.y).toBeGreaterThan(0.04)
    expect(midnight.length()).toBeCloseTo(1, 5)
  })

  it('uses ShadowMaterial catcher for standalone weather without HDR', () => {
    expect(
      webExportShouldUseShadowCatcher({ enableStandaloneWeather: true }, false, true)
    ).toBe(true)
    expect(webExportShouldUseShadowCatcher({}, false, true)).toBe(false)
  })

  it('enforces minimum shadow catcher opacity', () => {
    expect(webExportShadowCatcherOpacity(0)).toBe(WEB_EXPORT_MIN_SHADOW_CATCHER_OPACITY)
    expect(webExportShadowCatcherOpacity(2)).toBe(1.0)
  })

  it('positions shadow catcher just below subject bottom', () => {
    expect(webExportResolveShadowCatcherY(0.5, false)).toBeCloseTo(0.499, 3)
    expect(webExportResolveShadowCatcherY(undefined, false)).toBe(WEB_EXPORT_SHADOW_PLANE_GROUND_Y)
    expect(webExportResolveShadowCatcherY(0, true)).toBe(-0.01)
  })

  it('detects grid helper for standalone shadow composite mode', () => {
    const scene = new THREE.Scene()
    expect(webExportSceneHasGridHelper(scene)).toBe(false)
    const grid = new THREE.GridHelper(10, 10)
    grid.userData.isGridHelper = true
    scene.add(grid)
    expect(webExportSceneHasGridHelper(scene)).toBe(true)
    expect(webExportShouldCompositeShadowCatcherOverGrid(true, scene)).toBe(true)
    expect(webExportShouldCompositeShadowCatcherOverGrid(false, scene)).toBe(false)
  })

  it('uses lower sun normal bias for standalone ground shadows', () => {
    expect(webExportStandaloneSunNormalBias(true)).toBe(WEB_EXPORT_STANDALONE_GROUND_SUN_NORMAL_BIAS)
    expect(webExportStandaloneSunNormalBias(false)).toBe(WEB_EXPORT_SUN_SHADOW_NORMAL_BIAS)
    expect(WEB_EXPORT_STANDALONE_GRID_SHADOW_CATCHER_RENDER_ORDER).toBe(2)
  })

  it('clamps standalone sun above horizon', () => {
    const below = new THREE.Vector3(0.6, -0.4, 0.2).normalize()
    const clamped = webExportClampSunSkyDirection(below)
    expect(clamped.y).toBeGreaterThan(0)
  })

  it('defaults skyExposure to 1.0 to match editor fallback', () => {
    const config = normalizeWebExportWeatherConfig({ enableStandaloneWeather: true })
    expect(config.skyExposure).toBe(1.0)
  })

  it('detects exported editor DynamicSky meshes by flag, name, and scale', () => {
    expect(isExportedWeatherMeshLike({ userData: { isDynamicSky: true } })).toBe(true)
    expect(isExportedWeatherMeshLike({ name: 'Dynamic Sky' })).toBe(true)
    expect(isExportedWeatherMeshLike({ name: 'Dynamic_Sky', scale: { x: 1, y: 1, z: 1 } })).toBe(true)
    expect(isExportedWeatherMeshLike({ name: 'CarBody', scale: { x: 1, y: 1, z: 1 } })).toBe(false)
    expect(
      isExportedWeatherMeshLike({ name: 'Sky', scale: { x: WEB_EXPORT_MAX_SUBJECT_EXTENT, y: 1, z: 1 } })
    ).toBe(true)
  })

  it('excludes sky domes and helpers from subject bounds', () => {
    expect(shouldExcludeFromSubjectBounds({ userData: { isDynamicSky: true } })).toBe(true)
    expect(shouldExcludeFromSubjectBounds({ name: 'Dynamic_Sky' })).toBe(true)
    expect(
      shouldExcludeFromSubjectBounds({
        geometry: { parameters: { radius: WEB_EXPORT_MAX_SUBJECT_EXTENT + 1 } }
      })
    ).toBe(true)
    expect(shouldExcludeFromSubjectBounds({ name: 'Body_Mesh' })).toBe(false)
  })
})
