/** Density cutoff at 0% coverage — only the highest noise peaks become wisps */
export const IQ_COVERAGE_CUTOFF_CLEAR = 0.82

/** Density cutoff at 100% coverage — storm ceiling, nearly all noise passes */
export const IQ_COVERAGE_CUTOFF_STORM = 0.0

/** smoothstep feather width at scattered (25%) coverage */
export const IQ_COVERAGE_FEATHER_LIGHT = 0.07

/** smoothstep feather width at storm (100%) coverage */
export const IQ_COVERAGE_FEATHER_STORM = 0.16

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Maps UI cloud density (0–1) to iq density threshold — lower cutoff = more cloud mass */
export function iqCoverageCutoff(coverage: number): number {
  const c = clamp01(coverage)
  return IQ_COVERAGE_CUTOFF_CLEAR + (IQ_COVERAGE_CUTOFF_STORM - IQ_COVERAGE_CUTOFF_CLEAR) * c
}

/** smoothstep upper bound offset — wider band at high coverage for solid overcast */
export function iqCoverageFeather(coverage: number): number {
  const c = clamp01(coverage)
  return IQ_COVERAGE_FEATHER_LIGHT + (IQ_COVERAGE_FEATHER_STORM - IQ_COVERAGE_FEATHER_LIGHT) * c
}

/** Raymarch opacity multiplier — perceptual ramp so 100% reads as storm ceiling */
export function iqCoverageAlphaScale(coverage: number): number {
  const c = clamp01(coverage)
  if (c <= 0.004) return 0
  return 0.6 + 0.52 * c * c
}

/** @deprecated Use iqCoverageCutoff — kept for shader export tests */
export function iqCoverageToThickness(coverage: number): number {
  return iqCoverageCutoff(coverage)
}

/** GLSL helpers inlined into iq sky fragment shader (single source of constants) */
export function getIqCoverageGlsl(): string {
  const clear = IQ_COVERAGE_CUTOFF_CLEAR.toFixed(2)
  const storm = IQ_COVERAGE_CUTOFF_STORM.toFixed(2)
  const featherLight = IQ_COVERAGE_FEATHER_LIGHT.toFixed(2)
  const featherStorm = IQ_COVERAGE_FEATHER_STORM.toFixed(2)

  return `
    float iqCoverageCutoff(float cov) {
      cov = clamp(cov, 0.0, 1.0);
      return mix(${clear}, ${storm}, cov);
    }

    float iqCoverageFeather(float cov) {
      cov = clamp(cov, 0.0, 1.0);
      return mix(${featherLight}, ${featherStorm}, cov);
    }

    float iqCoverageAlphaScale(float cov) {
      if (cov <= 0.004) return 0.0;
      return mix(0.6, 1.12, cov * cov);
    }
  `
}
