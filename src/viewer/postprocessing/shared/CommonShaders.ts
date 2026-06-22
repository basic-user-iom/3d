/**
 * Common shader code shared across post-processing effects
 * 
 * This file contains reusable shader code to reduce duplication
 * and make maintenance easier.
 */

/**
 * Standard vertex shader for post-processing passes
 * 
 * This vertex shader is used by most post-processing effects that:
 * - Render a full-screen quad
 * - Only need UV coordinates
 * - Don't need custom vertex transformations
 * 
 * Used by: SSS, SSR, LUT, Anamorphic, ToneMapping, ColorGrading, DepthPass
 */
export const STANDARD_POST_PROCESSING_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
















































