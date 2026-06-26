import * as THREE from 'three'
import {
  enableFogOnSceneMeshes,
  fogDensityToSceneValue
} from '../utils/sceneFog'

export interface AtmosphericPerspectiveConfig {
  enabled: boolean
  density: number // Fog density (0-1)
  color: string // Fog color (hex string)
  near: number // Near distance for fog start
  far: number // Far distance for fog end
  heightFalloff?: number // Height-based fog falloff (0 = no height effect, 1 = full height effect)
}

/**
 * Atmospheric Perspective System
 * Implements distance-based fog/haze similar to Streets GL's atmospheric perspective
 * Creates realistic depth perception through distance-based color attenuation
 */
export class AtmosphericPerspective {
  private scene: THREE.Scene
  private config: AtmosphericPerspectiveConfig
  private fog: THREE.Fog | THREE.FogExp2 | null = null

  constructor(scene: THREE.Scene, config: AtmosphericPerspectiveConfig) {
    this.scene = scene
    this.config = config
    this.setup()
  }

  /**
   * Setup atmospheric perspective (fog)
   */
  private setup(): void {
    if (!this.config.enabled || this.config.density <= 0) {
      this.destroy()
      return
    }

    const fogColor = new THREE.Color(this.config.color)
    
    // Streets GL-style aerial perspective (distance-based fog/haze)
    // Streets GL uses 16-slice depth-based system with non-linear conversion: pow(depth / 1000., 1. / 1.4)
    // We approximate this with exponential fog that matches Streets GL's visual characteristics
    const density = Math.max(0, Math.min(1, this.config.density))
    
    // Streets GL aerial perspective uses depth-based slices with power curve
    // For exponential fog, we match the visual density at typical viewing distances
    // Streets GL's aerial perspective is more visible at medium distances (100-1000m)
    // Density calculation matches Streets GL's pow(depth/1000, 1/1.4) curve visually
    const fogDensityValue = fogDensityToSceneValue(density)

    this.fog = new THREE.FogExp2(fogColor, fogDensityValue)
    this.scene.fog = this.fog
    enableFogOnSceneMeshes(this.scene)

    console.log('[AtmosphericPerspective] Atmospheric perspective enabled:', {
      density: this.config.density,
      color: this.config.color,
      near: this.config.near,
      far: this.config.far
    })
  }

  /**
   * Update fog parameters
   */
  public update(config: Partial<AtmosphericPerspectiveConfig>): void {
    this.config = { ...this.config, ...config }
    this.setup()
  }

  /**
   * Get current config
   */
  public getConfig(): AtmosphericPerspectiveConfig {
    return { ...this.config }
  }

  /**
   * Enable/disable atmospheric perspective
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    this.setup()
  }

  /**
   * Set fog density
   */
  public setDensity(density: number): void {
    this.config.density = Math.max(0, Math.min(1, density))
    if (this.config.density <= 0) {
      this.destroy()
      return
    }
    if (!this.fog) {
      this.setup()
      return
    }
    if (this.fog instanceof THREE.FogExp2) {
      this.fog.density = fogDensityToSceneValue(this.config.density)
    }
  }

  /**
   * Set fog color
   */
  public setColor(color: string): void {
    this.config.color = color
    if (this.fog) {
      this.fog.color.set(color)
    }
  }

  /**
   * Destroy atmospheric perspective system
   */
  public destroy(): void {
    if (this.scene.fog === this.fog) {
      this.scene.fog = null
    }
    this.fog = null
    console.log('[AtmosphericPerspective] Atmospheric perspective disabled')
  }
}

