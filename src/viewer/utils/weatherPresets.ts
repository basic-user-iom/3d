export type WeatherPresetId = 'clear' | 'overcast' | 'foggy' | 'stormy' | 'custom'

export interface WeatherPresetValues {
  fogDensity: number
  fogColor: string
  rainIntensity: number
  snowIntensity: number
  cloudDensity: number
  cloudStorminess: number
  windIntensity: number
}

/** Canonical preset values — Weather panel, Rendering Effects, and engine lighting should match these */
export const WEATHER_PRESET_DEFINITIONS: Record<
  Exclude<WeatherPresetId, 'custom'>,
  WeatherPresetValues
> = {
  clear: {
    fogDensity: 0,
    fogColor: '#cccccc',
    rainIntensity: 0,
    snowIntensity: 0,
    cloudDensity: 0,
    cloudStorminess: 0,
    windIntensity: 0
  },
  overcast: {
    fogDensity: 0.15,
    fogColor: '#a8b0b8',
    rainIntensity: 0,
    snowIntensity: 0,
    cloudDensity: 0.75,
    cloudStorminess: 0.2,
    windIntensity: 0.2
  },
  foggy: {
    fogDensity: 0.55,
    fogColor: '#c8d0d8',
    rainIntensity: 0,
    snowIntensity: 0,
    cloudDensity: 0.35,
    cloudStorminess: 0,
    windIntensity: 0.1
  },
  stormy: {
    fogDensity: 0.25,
    fogColor: '#8a9098',
    rainIntensity: 0.75,
    snowIntensity: 0,
    cloudDensity: 0.9,
    cloudStorminess: 0.65,
    windIntensity: 0.65
  }
}

const PRESET_TOLERANCE = 0.02

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= PRESET_TOLERANCE
}

export function matchesWeatherPreset(
  state: Partial<WeatherPresetValues>,
  preset: WeatherPresetValues
): boolean {
  const numericKeys = [
    'fogDensity',
    'rainIntensity',
    'snowIntensity',
    'cloudDensity',
    'cloudStorminess',
    'windIntensity'
  ] as const satisfies ReadonlyArray<keyof WeatherPresetValues>
  for (const key of numericKeys) {
    const value = state[key]
    if (value === undefined) continue
    if (!close(value as number, preset[key] as number)) return false
  }
  if (state.fogColor !== undefined && state.fogColor.toLowerCase() !== preset.fogColor.toLowerCase()) {
    return false
  }
  return true
}

export function detectWeatherPreset(state: Partial<WeatherPresetValues>): WeatherPresetId {
  for (const [id, values] of Object.entries(WEATHER_PRESET_DEFINITIONS)) {
    if (matchesWeatherPreset(state, values)) {
      return id as Exclude<WeatherPresetId, 'custom'>
    }
  }
  return 'custom'
}
