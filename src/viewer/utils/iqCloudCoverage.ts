/** Density cutoff at 0% coverage — only the highest noise peaks become wisps (matches d651232 ~0.78) */
export const IQ_COVERAGE_CUTOFF_CLEAR = 0.76

/** Density cutoff at 100% coverage — storm ceiling, nearly all noise passes */
export const IQ_COVERAGE_CUTOFF_STORM = 0.0

/** smoothstep feather width at scattered (25%) coverage */
export const IQ_COVERAGE_FEATHER_LIGHT = 0.07

/** smoothstep feather width at storm (100%) coverage */
export const IQ_COVERAGE_FEATHER_STORM = 0.16

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Perceptual ramp — low slider values still pass wisps through the density cutoff */
function iqCoverageCurve(coverage: number): number {
  const c = clamp01(coverage)
  return Math.pow(c, 0.55)
}

/** Maps UI cloud density (0–1) to iq density threshold — lower cutoff = more cloud mass */
export function iqCoverageCutoff(coverage: number): number {
  const c = clamp01(coverage)
  return IQ_COVERAGE_CUTOFF_CLEAR + (IQ_COVERAGE_CUTOFF_STORM - IQ_COVERAGE_CUTOFF_CLEAR) * iqCoverageCurve(c)
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
  // Floor keeps 1% wisps visible; quadratic tail for storm ceiling
  return 0.42 + 0.7 * Math.pow(c, 0.75)
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
    float iqCoverageCurve(float cov) {
      cov = clamp(cov, 0.0, 1.0);
      return pow(cov, 0.55);
    }

    float iqCoverageCutoff(float cov) {
      cov = clamp(cov, 0.0, 1.0);
      return mix(${clear}, ${storm}, iqCoverageCurve(cov));
    }

    float iqCoverageFeather(float cov) {
      cov = clamp(cov, 0.0, 1.0);
      return mix(${featherLight}, ${featherStorm}, cov);
    }

    float iqCoverageAlphaScale(float cov) {
      if (cov <= 0.004) return 0.0;
      return 0.42 + 0.7 * pow(cov, 0.75);
    }
  `
}
