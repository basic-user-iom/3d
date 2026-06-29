/** Density cutoff at 0% coverage — only the highest noise peaks become wisps */
export const IQ_COVERAGE_CUTOFF_CLEAR = 0.74

/** Density cutoff at 100% coverage — keep structure; 0 reads as uniform fog */
export const IQ_COVERAGE_CUTOFF_STORM = 0.22

/** Soft knee width — deprecated; linear cutoff only (iq raw d edges) */
export const IQ_COVERAGE_FEATHER_LIGHT = 0.18

/** @deprecated Linear cutoff replaces smoothstep feather at cloud boundaries */
export const IQ_COVERAGE_FEATHER_STORM = 0.28

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Perceptual ramp — low slider values still pass wisps through the density cutoff */
function iqCoverageCurve(coverage: number): number {
  const c = clamp01(coverage)
  return Math.pow(c, 0.42)
}

/** Maps UI cloud density (0–1) to iq density threshold — lower cutoff = more cloud mass */
export function iqCoverageCutoff(coverage: number): number {
  const c = clamp01(coverage)
  return IQ_COVERAGE_CUTOFF_CLEAR + (IQ_COVERAGE_CUTOFF_STORM - IQ_COVERAGE_CUTOFF_CLEAR) * iqCoverageCurve(c)
}

/** @deprecated Linear cutoff only — kept for API compatibility */
export function iqCoverageFeather(coverage: number): number {
  const c = clamp01(coverage)
  return IQ_COVERAGE_FEATHER_LIGHT + (IQ_COVERAGE_FEATHER_STORM - IQ_COVERAGE_FEATHER_LIGHT) * c
}

/**
 * Legacy opacity helper — iq shader uses fixed 0.35 alpha (XslGRr).
 * Kept for CPU raymarch estimators; returns 1 when clouds are enabled.
 */
export function iqCoverageAlphaScale(coverage: number): number {
  const c = clamp01(coverage)
  if (c <= 0.004) return 0
  return 1
}

/** @deprecated Use iqCoverageCutoff — kept for shader export tests */
export function iqCoverageToThickness(coverage: number): number {
  return iqCoverageCutoff(coverage)
}

/** GLSL helpers inlined into iq sky fragment shader (single source of constants) */
export function getIqCoverageGlsl(): string {
  const clear = IQ_COVERAGE_CUTOFF_CLEAR.toFixed(2)
  const storm = IQ_COVERAGE_CUTOFF_STORM.toFixed(2)

  return `
    float iqCoverageCurve(float cov) {
      cov = clamp(cov, 0.0, 1.0);
      return pow(cov, 0.42);
    }

    float iqCoverageCutoff(float cov) {
      cov = clamp(cov, 0.0, 1.0);
      return mix(${clear}, ${storm}, iqCoverageCurve(cov));
    }
  `
}
