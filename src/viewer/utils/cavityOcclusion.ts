import { useAppStore } from '../../store/useAppStore'
import type { WeatherQuality } from './weatherGpuUtils'

/** Conservative SAO settings for recessed areas (engine bay, exhaust gaps). */
export const CAVITY_AO_SETTINGS = {
  aoEnabled: true,
  aoIntensity: 0.018,
  aoScale: 0.85,
  aoKernelRadius: 10,
  aoBias: 0.5,
  aoBlur: true,
  aoBlurRadius: 6,
  aoBlurStdDev: 3,
  aoBlurDepthCutoff: 0.01
} as const

/**
 * SAO is only auto-enabled for high/ultra weather quality when post-processing is on.
 * Low/medium tiers skip it to limit GPU load.
 */
export function shouldAutoEnableCavityAo(
  standaloneWeather: boolean,
  weatherQuality: WeatherQuality,
  postProcessingEnabled: boolean
): boolean {
  if (!standaloneWeather || !postProcessingEnabled) return false
  return weatherQuality === 'high' || weatherQuality === 'ultra'
}

/**
 * Apply quality-gated cavity AO once per viewer session (unless user disabled it).
 */
export function applyCavityAoIfEligible(
  standaloneWeather: boolean,
  weatherQuality: WeatherQuality,
  postProcessingEnabled: boolean,
  sessionState: { applied: boolean; userDisabled: boolean }
): boolean {
  if (sessionState.userDisabled || sessionState.applied) return false
  if (!shouldAutoEnableCavityAo(standaloneWeather, weatherQuality, postProcessingEnabled)) {
    return false
  }

  const store = useAppStore.getState()
  useAppStore.setState({
    ...CAVITY_AO_SETTINGS,
    aoEnabled: true
  })

  sessionState.applied = true
  console.log('[CavityOcclusion] Auto-enabled conservative SAO for high/ultra weather quality', {
    weatherQuality,
    aoIntensity: CAVITY_AO_SETTINGS.aoIntensity,
    previousAoEnabled: store.aoEnabled
  })
  return true
}

/** Call when the user manually turns AO off so auto-enable does not fight them. */
export function markCavityAoUserDisabled(sessionState: { userDisabled: boolean }): void {
  sessionState.userDisabled = true
}
