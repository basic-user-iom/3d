/**
 * iq cloud sky shaders embedded in web export HTML (matches editor DynamicSky iq mode).
 */
import {
  getIqCloudSkyFragmentShader,
  IQ_CLOUD_SKY_VERTEX_SHADER,
  iqCloudBandY
} from '../viewer/effects/IqCloudSkyShader'
import { getAdaptiveIqRaymarchSteps } from '../viewer/utils/weatherGpuUtils'
import type { WebExportWeatherConfig } from './webExportWeatherRuntime'

export const WEB_EXPORT_IQ_CLOUD_VERTEX_SHADER = IQ_CLOUD_SKY_VERTEX_SHADER

export const WEB_EXPORT_IQ_CLOUD_FRAGMENT_SHADER = getIqCloudSkyFragmentShader({ skyOnly: false })

export function webExportIqRaymarchSteps(
  quality: string | undefined,
  cloudDensity: number
): number {
  const q =
    quality === 'low' || quality === 'medium' || quality === 'high' || quality === 'ultra'
      ? quality
      : 'high'
  return getAdaptiveIqRaymarchSteps(q, cloudDensity)
}

export function webExportIqCloudBand(cameraY: number): { base: number; top: number } {
  return iqCloudBandY(cameraY)
}

export function webExportIqWindSpeed(windIntensity: number | undefined): number {
  return (windIntensity ?? 0) * 0.2 + 0.05
}

export function webExportIqSkyExposure(weather: WebExportWeatherConfig): number {
  return Math.max(weather.skyExposure ?? 1.0, 0.85)
}
