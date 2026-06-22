import * as THREE from 'three'
import { RoomEnvironment } from 'three-stdlib'

/**
 * Centralized Environment Manager
 * 
 * Prevents duplicate creation of RoomEnvironment and PMREMGenerator
 * Ensures single source of truth for fallback environment
 */
export class EnvironmentManager {
  private static instance: EnvironmentManager | null = null
  private defaultEnvTexture: THREE.Texture | null = null
  private pmremGenerator: THREE.PMREMGenerator | null = null
  private renderer: THREE.WebGLRenderer | null = null

  private constructor() {}

  static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager()
    }
    return EnvironmentManager.instance
  }

  /**
   * Initialize with renderer (reuse PMREM generator)
   */
  initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer
    if (!this.pmremGenerator) {
      this.pmremGenerator = new THREE.PMREMGenerator(renderer)
      this.pmremGenerator.compileEquirectangularShader()
    }
  }

  /**
   * Get or create default RoomEnvironment texture
   * Reuses the same texture across the application
   */
  getDefaultEnvironment(): THREE.Texture {
    if (!this.defaultEnvTexture) {
      if (!this.renderer || !this.pmremGenerator) {
        throw new Error('EnvironmentManager not initialized. Call initialize() first.')
      }
      
      try {
        const EnvCtor = RoomEnvironment as unknown as { new (): THREE.Scene }
        const envScene = new EnvCtor()
        const envRT = this.pmremGenerator.fromScene(envScene, 0.04)
        this.defaultEnvTexture = envRT.texture
        console.log('[EnvironmentManager] Created default RoomEnvironment texture')
      } catch (error) {
        console.error('[EnvironmentManager] Failed to create default environment:', error)
        throw error
      }
    }
    return this.defaultEnvTexture
  }

  /**
   * Get PMREM generator (reused instance)
   */
  getPMREMGenerator(): THREE.PMREMGenerator {
    if (!this.pmremGenerator || !this.renderer) {
      throw new Error('EnvironmentManager not initialized. Call initialize() first.')
    }
    return this.pmremGenerator
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.defaultEnvTexture) {
      this.defaultEnvTexture.dispose()
      this.defaultEnvTexture = null
    }
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose()
      this.pmremGenerator = null
    }
    this.renderer = null
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.renderer !== null && this.pmremGenerator !== null
  }
}







