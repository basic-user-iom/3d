/**
 * Web export weather runtime — shared config helpers + embedded JS for standalone HTML export.
 * Editor uses ViewerCanvas weather systems; export embeds generateWebExportWeatherRuntimeJs().
 */

export const WEB_EXPORT_FOG_DENSITY_SCALE = 0.015
export const WEB_EXPORT_WEATHER_GROUND_LEVEL = 0
/** Match editor DynamicSky sphere radius — must fit inside camera far plane */
export const WEB_EXPORT_SKY_SPHERE_RADIUS = 9000
export const WEB_EXPORT_MIN_CAMERA_FAR = WEB_EXPORT_SKY_SPHERE_RADIUS * 1.5
/** Meshes larger than this are treated as sky domes / helpers, not scene subjects */
export const WEB_EXPORT_MAX_SUBJECT_EXTENT = 500
export const WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS = 120

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
  if (weather.dynamicSkyEnabled === false) return false
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
  return `
    const WEB_EXPORT_FOG_DENSITY_SCALE = ${WEB_EXPORT_FOG_DENSITY_SCALE};
    const WEB_EXPORT_WEATHER_GROUND_LEVEL = ${WEB_EXPORT_WEATHER_GROUND_LEVEL};
    const WEB_EXPORT_SKY_SPHERE_RADIUS = ${WEB_EXPORT_SKY_SPHERE_RADIUS};
    const WEB_EXPORT_MIN_CAMERA_FAR = ${WEB_EXPORT_MIN_CAMERA_FAR};
    const WEB_EXPORT_MAX_SUBJECT_EXTENT = ${WEB_EXPORT_MAX_SUBJECT_EXTENT};
    const WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS = ${WEB_EXPORT_SHADOW_PLANE_MAX_RADIUS};

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
      if (weather.dynamicSkyEnabled === false) return false;
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

    function webExportResolveToneMappingExposure(weather, lighting) {
      const skyExp = weather && typeof weather.skyExposure === 'number' ? weather.skyExposure : 1.0;
      const lightExp = lighting && typeof lighting.exposure === 'number' ? lighting.exposure : 1.0;
      return Math.max(skyExp, lightExp, 0.85);
    }

    function webExportLogWeatherDiagnostics(scene, camera, renderer, weather, state) {
      if (window.__webExportWeatherDiagnosticsLogged) return;
      window.__webExportWeatherDiagnosticsLogged = true;
      let skyMeshInScene = false;
      scene.traverse(function(obj) {
        if (obj && obj.userData && obj.userData.isDynamicSky) skyMeshInScene = true;
      });
      const bg = scene.background;
      const bgLabel = !bg ? 'null' : (bg.isColor ? 'color' : 'texture');
      console.log('[WebExport] Weather diagnostics (once):', {
        'CONFIG.weather': weather,
        enableStandaloneWeather: weather.enableStandaloneWeather,
        useStandaloneSky: state.useStandaloneSky,
        skyMeshInScene: skyMeshInScene,
        hasSkyRef: !!state.sky,
        skyFrustumCulled: state.sky ? state.sky.frustumCulled : null,
        'scene.background': bgLabel,
        hasEnvironment: !!scene.environment,
        toneMappingExposure: renderer ? renderer.toneMappingExposure : null,
        cameraFar: camera ? camera.far : null,
        hdrLoaded: !!window.__hdrTextureLoaded
      });
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
      const minElevationY = minY !== undefined ? minY : 0.05;
      const normalized = dir.clone().normalize();
      if (normalized.y >= minElevationY) return normalized;
      const horizontalLength = Math.sqrt(normalized.x * normalized.x + normalized.z * normalized.z);
      if (horizontalLength < 0.001) {
        return new THREE.Vector3(0, minElevationY, 1).normalize();
      }
      const scale = minElevationY / horizontalLength;
      return new THREE.Vector3(normalized.x * scale, minElevationY, normalized.z * scale).normalize();
    }

    function webExportSunLightDirection(sunPosition) {
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
      if (preset === 'overcast') {
        dimming = 0.25 - (weather.fogDensity * 0.08);
        exposure = 0.9;
      } else if (preset === 'foggy') {
        dimming = 0.25 - (weather.fogDensity * 0.1);
        exposure = 0.9;
      } else if (preset === 'stormy') {
        dimming = 0.15 - (weather.cloudStorminess * 0.03);
        exposure = 0.85;
      } else if (weather.cloudDensity > 0.5) {
        dimming = 1.0 - (weather.cloudDensity * 0.35);
      }
      return {
        sunIntensity: lighting.sunIntensity * Math.max(0.05, dimming),
        ambientIntensity: lighting.ambientIntensity * Math.max(0.05, dimming * 0.85),
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

    function webExportFindSunLight(scene) {
      let sunLight = null;
      scene.traverse((obj) => {
        if (obj instanceof THREE.DirectionalLight && !sunLight) {
          if (obj.userData.isSun || obj.userData.isGlobalSun) sunLight = obj;
        }
      });
      if (!sunLight) {
        scene.traverse((obj) => {
          if (obj instanceof THREE.DirectionalLight && obj.castShadow && !sunLight) {
            sunLight = obj;
          }
        });
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
      const travelDir = webExportSunLightDirection(sunPosition);
      const target = sunLight.target || new THREE.Object3D();
      if (!sunLight.target) {
        scene.add(target);
        sunLight.target = target;
      }
      target.position.set(0, 0, 0);
      const distance = 500;
      sunLight.position.copy(travelDir.clone().negate().multiplyScalar(distance));
      sunLight.intensity = lighting.sunIntensity;
      sunLight.color.set(lighting.sunColor);
      sunLight.visible = lighting.sunIntensity > 0.01;
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

    function webExportUpdateSkyUniforms(state, weather, sunPosition) {
      if (!state.sky) return;
      const uniforms = state.sky.material.uniforms;
      if (!uniforms) return;
      uniforms['sunPosition'].value.copy(sunPosition);
      uniforms['turbidity'].value = weather.skyTurbidity || 10;
      uniforms['rayleigh'].value = weather.skyRayleigh || 3;
      uniforms['mieCoefficient'].value = weather.skyMieCoefficient || 0.005;
      uniforms['mieDirectionalG'].value = weather.skyMieDirectionalG || 0.7;
      const cloudFactor = weather.cloudDensity || 0;
      uniforms['turbidity'].value = (weather.skyTurbidity || 10) + cloudFactor * 8 + (weather.cloudStorminess || 0) * 4;
    }

    window.__webExportWeather = window.__webExportWeather || {
      initialized: false,
      sky: null,
      sunMesh: null,
      moonMesh: null,
      rain: null,
      snow: null,
      lastTime: performance.now()
    };

    function initializeWebExportWeather(ctx) {
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

      const state = window.__webExportWeather;
      webExportApplyFog(scene, weather);

      if (weather.rainIntensity > 0 && !state.rain) {
        state.rain = webExportCreateParticleSystem(scene, 'rain', weather.rainIntensity, weather);
      }
      if (weather.snowIntensity > 0 && !state.snow) {
        state.snow = webExportCreateParticleSystem(scene, 'snow', weather.snowIntensity, weather);
      }

      if (useStandaloneSky) {
        webExportEnsureDynamicSkyCameraFar(camera);
        // Match editor: DynamicSky replaces HDR background; keep HDR as scene.environment for IBL
        scene.background = null;
        if (!state.sky && typeof Sky !== 'undefined') {
          const sky = new Sky();
          sky.scale.setScalar(WEB_EXPORT_SKY_SPHERE_RADIUS);
          sky.userData.isDynamicSky = true;
          sky.userData.excludeFromFog = true;
          sky.renderOrder = -1000;
          sky.frustumCulled = false;
          scene.add(sky);
          state.sky = sky;
        } else if (!state.sky) {
          console.warn('[WebExport] Three.js Sky addon unavailable — procedural sky not created');
        }
        if (!state.sunMesh) {
          const sunGeo = new THREE.SphereGeometry(15, 24, 24);
          const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.95, fog: false });
          const sunMesh = new THREE.Mesh(sunGeo, sunMat);
          sunMesh.userData.isSun = true;
          sunMesh.userData.excludeFromFog = true;
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
          moonMesh.renderOrder = -900;
          moonMesh.frustumCulled = false;
          scene.add(moonMesh);
          state.moonMesh = moonMesh;
        }
      }

      const { sunPosition, elevation } = webExportTimeOfDayToSkyAngles(weather.timeOfDay, weather.northOffset);
      let lighting = webExportComputeSunLighting(elevation);
      const dimmed = webExportApplyWeatherPresetDimming(weather, lighting);
      lighting = Object.assign({}, lighting, dimmed);

      const sunLight = webExportFindSunLight(scene);
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

      webExportUpdateSkyUniforms(state, weather, sunPosition);
      webExportUpdateSunMoonMeshes(state, sunPosition, weather);

      state.initialized = true;
      state.weather = weather;
      state.useStandaloneSky = useStandaloneSky;
      webExportLogWeatherDiagnostics(scene, camera, renderer, weather, state);
      console.log('[WebExport] Weather initialized ✓', {
        preset: weather.preset,
        enableStandaloneWeather: weather.enableStandaloneWeather,
        useStandaloneSky: useStandaloneSky,
        hdrActive: hdrActive,
        hdrBackgroundVisible: hdrConfig.backgroundVisible !== false,
        background: scene.background ? 'texture' : 'null (sky dome)',
        hasEnvironment: !!scene.environment,
        timeOfDay: weather.timeOfDay,
        fogDensity: weather.fogDensity,
        rainIntensity: weather.rainIntensity,
        snowIntensity: weather.snowIntensity,
        cloudDensity: weather.cloudDensity,
        skyExposure: weather.skyExposure,
        toneMappingExposure: renderer ? renderer.toneMappingExposure : null,
        cameraFar: camera ? camera.far : null,
        skySphereRadius: useStandaloneSky ? WEB_EXPORT_SKY_SPHERE_RADIUS : null
      });
    }

    function updateWebExportWeather(scene, camera, renderer) {
      const state = window.__webExportWeather;
      if (!state.initialized || !state.weather || !scene) return;
      const weather = state.weather;
      const now = performance.now();
      const dt = Math.min(0.05, (now - (state.lastTime || now)) / 1000);
      state.lastTime = now;

      if (state.useStandaloneSky) {
        webExportEnsureDynamicSkyCameraFar(camera);
      }

      const { sunPosition, elevation } = webExportTimeOfDayToSkyAngles(weather.timeOfDay, weather.northOffset);
      let lighting = webExportComputeSunLighting(elevation);
      const dimmed = webExportApplyWeatherPresetDimming(weather, lighting);
      lighting = Object.assign({}, lighting, dimmed);

      if (state.rain) webExportUpdateParticles(state.rain, camera, dt, weather);
      if (state.snow) webExportUpdateParticles(state.snow, camera, dt, weather);
      webExportUpdateSkyUniforms(state, weather, sunPosition);
      webExportUpdateSunMoonMeshes(state, sunPosition, weather);

      const sunLight = webExportFindSunLight(scene);
      if (sunLight && weather.enableStandaloneWeather) {
        webExportUpdateSunLight(scene, sunLight, sunPosition, weather, lighting);
      }
      const ambientLight = webExportFindAmbientLight(scene);
      if (ambientLight && weather.enableStandaloneWeather) {
        ambientLight.intensity = lighting.ambientIntensity;
        ambientLight.color.set(lighting.ambientColor);
      }
      if (renderer) {
        renderer.toneMappingExposure = webExportResolveToneMappingExposure(weather, lighting);
      }
    }
  `
}
