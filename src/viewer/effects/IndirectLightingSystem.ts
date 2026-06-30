import * as THREE from 'three'
import { LightProbeGenerator } from 'three-stdlib'
import {
  EXTERIOR_PROBE_INTENSITY_SCALE,
  INTERIOR_PROBE_SH_SCALE,
  PROBE_CUBEMAP_SIZE,
  createScaledLightProbe,
  getAmbientMultiplierWithProbe
} from '../../utils/lightProbeUtils'

/**
 * HDR-derived diffuse irradiance via a single scene LightProbe.
 *
 * Sponza (three.js dev) uses LightProbeGridWebGL for per-zone GI; r181 only
 * supports one global LightProbe, so interiors rely on cavity dimming +
 * optional RectAreaLight fill (see interiorFillLight.ts).
 */
export class IndirectLightingSystem {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer
  private pmremGenerator: THREE.PMREMGenerator | null = null
  private probeRenderTarget: THREE.WebGLCubeRenderTarget | null = null
  private exteriorProbe: THREE.LightProbe | null = null
  /** Stored for future per-material assignment — not added to scene (renderer limit). */
  private interiorProbeHeuristic: THREE.LightProbe | null = null
  private hdrIntensity = 1

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer
  }

  isActive(): boolean {
    return this.exteriorProbe !== null
  }

  getAmbientMultiplier(shadowsEnabled: boolean): number {
    return getAmbientMultiplierWithProbe(this.isActive(), shadowsEnabled)
  }

  getInteriorProbeHeuristic(): THREE.LightProbe | null {
    return this.interiorProbeHeuristic
  }

  /**
   * Build SH probe from HDR equirectangular texture (low-res cube bake).
   * Keeps scene.environment for specular IBL; probe replaces flat ambient fill.
   */
  applyFromEquirect(equirectTexture: THREE.Texture, hdrIntensity: number): void {
    this.remove()

    if (!this.pmremGenerator) {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer)
      this.pmremGenerator.compileEquirectangularShader()
    }

    const rt = this.pmremGenerator.fromEquirectangular(
      equirectTexture
    ) as unknown as THREE.WebGLCubeRenderTarget
    this.probeRenderTarget = rt

    try {
      const baseProbe = LightProbeGenerator.fromCubeRenderTarget(this.renderer, rt)
      this.hdrIntensity = hdrIntensity

      this.exteriorProbe = createScaledLightProbe(
        baseProbe,
        EXTERIOR_PROBE_INTENSITY_SCALE * hdrIntensity
      )
      this.exteriorProbe.name = 'HDR Exterior Light Probe'
      this.exteriorProbe.userData.isIndirectLightingProbe = true

      this.interiorProbeHeuristic = createScaledLightProbe(
        baseProbe,
        EXTERIOR_PROBE_INTENSITY_SCALE * hdrIntensity * 0.5,
        INTERIOR_PROBE_SH_SCALE
      )
      this.interiorProbeHeuristic.name = 'Interior Probe Heuristic (not scene-bound)'
      this.interiorProbeHeuristic.userData.isInteriorProbeHeuristic = true

      this.scene.add(this.exteriorProbe)

      console.log('[IndirectLighting] HDR light probe applied', {
        probeIntensity: this.exteriorProbe.intensity,
        interiorShScale: INTERIOR_PROBE_SH_SCALE,
        cubemapSize: PROBE_CUBEMAP_SIZE
      })
    } catch (error) {
      console.warn('[IndirectLighting] Failed to generate light probe from HDR:', error)
      this.disposeProbeResources()
    }
  }

  updateIntensity(hdrIntensity: number): void {
    if (!this.exteriorProbe || !this.interiorProbeHeuristic) return
    this.hdrIntensity = hdrIntensity
    const scale = EXTERIOR_PROBE_INTENSITY_SCALE * hdrIntensity
    this.exteriorProbe.intensity = scale
    this.interiorProbeHeuristic.intensity = scale * 0.5
  }

  remove(): void {
    if (this.exteriorProbe) {
      this.exteriorProbe.removeFromParent()
      this.exteriorProbe = null
    }
    this.interiorProbeHeuristic = null
    this.disposeProbeResources()
  }

  private disposeProbeResources(): void {
    if (this.probeRenderTarget) {
      this.probeRenderTarget.dispose()
      this.probeRenderTarget = null
    }
  }

  dispose(): void {
    this.remove()
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose()
      this.pmremGenerator = null
    }
  }
}
