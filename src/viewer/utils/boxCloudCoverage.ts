function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Maps UI cloud density (0–1) to Worley box `coverage` uniform.
 * Gentle power curve so 1% slider still shows wispy volumetric clouds.
 */
export function boxCloudCoverage(uiCoverage: number): number {
  const c = clamp01(uiCoverage)
  if (c <= 0.004) return 0
  // 1% → ~0.17 box coverage; 25% → ~0.52; 100% → 1.0
  return 0.06 + 0.94 * Math.pow(c, 0.42)
}

/** Box opacity scale — keeps wisps subtle at low slider, ramps to storm ceiling */
export function boxCloudAlphaScale(uiCoverage: number): number {
  const c = clamp01(uiCoverage)
  if (c <= 0.004) return 0
  return 0.55 + 0.5 * Math.pow(c, 0.65)
}
