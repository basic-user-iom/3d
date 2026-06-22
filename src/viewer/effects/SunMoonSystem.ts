import * as THREE from 'three'

export interface SunMoonConfig {
  timeOfDay: number // 0-24 hours
  sunPosition: THREE.Vector3
  sunColor: THREE.Color
  turbidity: number
  sunSize?: number // Size multiplier for sun
  moonSize?: number // Size multiplier for moon
  enableStandaloneWeather?: boolean // Enable sun mesh for standalone weather system
}

/**
 * Sun and Moon visual objects similar to Twinmotion
 * Creates visible sphere meshes for sun and moon based on time of day
 * For standalone weather system: creates visible sun mesh that shows at different times of day
 */
export class SunMoonSystem {
  private scene: THREE.Scene
  private sunMesh: THREE.Mesh | null = null // Sun mesh for standalone weather system
  private moonMesh: THREE.Mesh | null = null
  private config: SunMoonConfig

  constructor(scene: THREE.Scene, config: SunMoonConfig) {
    this.scene = scene
    this.config = config
    this.setupSunMoon()
  }

  private getSunMaterial(): THREE.MeshBasicMaterial | null {
    if (!this.sunMesh) return null
    return this.sunMesh.material instanceof THREE.MeshBasicMaterial ? this.sunMesh.material : null
  }

  private setupSunMoon() {
    // Create sun mesh ONLY for standalone weather system
    // NOTE: Sun mesh is NOT created - it appears as a dark orb when visible
    // The sun direction is still used for lighting and shadows, but we don't need a visible mesh
    if (this.config.enableStandaloneWeather) {
      // Don't create sun mesh - it causes dark orb issues
      // Sun lighting is handled by CSM shadows and directional lights
      this.sunMesh = null
    } else {
      // Standalone weather not enabled - no sun mesh
      this.sunMesh = null
    }

    // Create moon (dim sphere with subtle emissive glow)
    // NOTE: Moon mesh is also hidden during daytime to prevent dark orb appearance
    // Use smaller base moon size - will be scaled by moonSize multiplier
    const moonGeometry = new THREE.SphereGeometry(10, 16, 16)
    const moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.7
    })
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial)
    this.moonMesh.name = 'Moon'
    this.moonMesh.userData.isMoon = true
    // CRITICAL: Hide moon initially - it will be shown/hidden based on time of day in update()
    this.moonMesh.visible = false
    // Add moon to scene
    this.scene.add(this.moonMesh)

    this.update()
  }

  /**
   * Get current sun direction (normalized vector)
   */
  getSunDirection(): THREE.Vector3 {
    return this.config.sunPosition.clone().normalize()
  }

  update(config?: Partial<SunMoonConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }

    // Update sun mesh position (only if standalone weather is enabled)
    // NOTE: Sun mesh is not created anymore to prevent dark orb issues
    if (false && this.sunMesh && this.config.enableStandaloneWeather) {
      // Apply size multiplier if provided
      // IMPROVED: Much larger sun size (20x larger) and further distance for realistic appearance
      // Real sun angular size is ~0.5 degrees, so at 50,000 units distance, sun should be ~436 units radius
      // Use 20-40x larger than before for realistic appearance
      const baseSunRadius = 20.0 // Base radius (was ~1 unit, now 20x larger)
      const sunSizeMultiplier = this.config.sunSize !== undefined 
        ? Math.max(0.5, Math.min(40.0, this.config.sunSize)) // Clamp between 0.5 and 40.0 (was 0.1-2.0)
        : 20.0 // Default to 20.0 (was 0.5) - 20x larger
      const finalSunRadius = baseSunRadius * sunSizeMultiplier
      this.sunMesh.scale.set(finalSunRadius, finalSunRadius, finalSunRadius)
      
      // Position sun based on time of day
      const isDaytime = this.config.timeOfDay >= 6 && this.config.timeOfDay <= 18
      
      if (isDaytime) {
        // Daytime: Show sun at calculated position
        // CRITICAL: Use the exact same direction as CSM shadows - don't modify it!
        // IMPROVED: Position sun much further away (50,000 units instead of 990) for realistic distance
        // Real sun is ~149.6 million km away, but for 3D scenes we use scaled distance
        // At 50,000 units distance, a 400-unit radius sun gives ~0.46 degree angular size (close to real 0.5 degrees)
        const sunDistance = 50000.0 // Much further away (was 990 units) - 50x further
        const sunDir = this.config.sunPosition.clone().normalize()
        // DO NOT modify sunDir.y - it must match CSM shadow direction exactly
        // If sun is below horizon, hide it instead of moving it
        if (sunDir.y < 0) {
          this.sunMesh.visible = false
          this.sunMesh.position.set(0, -100000, 0) // Move far away
        } else {
          this.sunMesh.position.copy(sunDir).multiplyScalar(sunDistance)
          // CRITICAL: Keep sun mesh hidden - it appears as a dark orb when visible
          // The sun direction is still used for lighting, but we don't need a visible mesh
          this.sunMesh.visible = false
          
          // Ensure sun material is bright, transparent, and glowing (not solid black)
          // (Material settings kept for potential future use, but mesh remains hidden)
          const sunMaterial = this.getSunMaterial()
          if (sunMaterial) {
            // Keep sun color warm but make it more transparent for a glowing effect
            sunMaterial.color.setHex(0xffaa44) // Warm sun color
            sunMaterial.opacity = 0.3 // Transparent glow effect
            sunMaterial.depthWrite = false // Allow transparency blending
            sunMaterial.blending = THREE.AdditiveBlending // Additive blending for glow
            sunMaterial.needsUpdate = true
          }
        }
        
        // Update sun color based on time of day (warmer at sunrise/sunset)
        const sunMaterial = this.getSunMaterial()
        if (sunMaterial) {
          const hour = this.config.timeOfDay
          let sunColor = 0xffaa44 // Default warm yellow
          
          // Sunrise/sunset: more orange/red
          if (hour >= 6 && hour <= 8) {
            sunColor = 0xff8844 // Orange-red at sunrise
          } else if (hour >= 16 && hour <= 18) {
            sunColor = 0xff8844 // Orange at sunset
          } else {
            sunColor = 0xffffaa // Bright yellow at noon
          }
          
          sunMaterial.color.setHex(sunColor)
          // Keep opacity low for transparent glow effect (sun should glow, not be solid)
          sunMaterial.opacity = 0.3
          sunMaterial.depthWrite = false
          sunMaterial.blending = THREE.AdditiveBlending // Additive blending for glow
          sunMaterial.needsUpdate = true
        }
      } else {
        // Nighttime: Hide sun (below horizon)
        this.sunMesh.visible = false
        this.sunMesh.position.set(0, -10000, 0) // Move far away
      }
    }

    // Update moon mesh position
    if (!this.moonMesh) return

    // Apply size multipliers if provided
    const moonSizeMultiplier = this.config.moonSize !== undefined ? this.config.moonSize : 1.0
    this.moonMesh.scale.set(moonSizeMultiplier, moonSizeMultiplier, moonSizeMultiplier)

    // Position sun and moon based on time of day
    // Sun is visible during day (6-18), moon during night
    const isDaytime = this.config.timeOfDay >= 6 && this.config.timeOfDay <= 18
    const isNighttime = !isDaytime
    
    if (isDaytime) {
      // Daytime: Hide moon completely and move it far away
      // CRITICAL: Moon must be hidden during daytime to prevent dark orb appearance
      this.moonMesh.visible = false
      this.moonMesh.position.set(0, -10000, 0)
      // Also ensure material opacity is set to 0 to prevent any rendering
      if (this.moonMesh.material instanceof THREE.MeshBasicMaterial) {
        this.moonMesh.material.opacity = 0
        this.moonMesh.material.transparent = true
      }
      // Remove from scene if it's still there (extra safety)
      if (this.moonMesh.parent) {
        this.moonMesh.parent.remove(this.moonMesh)
      }
    } else {
      // Nighttime: Show moon opposite to sun
      // CRITICAL: Restore material opacity before making visible
      if (this.moonMesh.material instanceof THREE.MeshBasicMaterial) {
        this.moonMesh.material.opacity = 0.7
      }
      // Calculate moon direction as true opposite to sun
      // Moon should be at the opposite side of the sky from the sun
      const sunDir = this.config.sunPosition.clone().normalize()
      const moonDir = sunDir.clone().negate()
      
      // Only adjust Y if moon would be below horizon (keep it visible in sky)
      // Preserve the opposite X/Z relationship (azimuth) - moon should be opposite direction from sun
      if (moonDir.y < 0.05) {
        // Moon would be too low - adjust to keep it just above horizon
        // But maintain the opposite azimuth (direction in XZ plane)
        const horizonY = 0.05
        const horizontalLength = Math.sqrt(moonDir.x * moonDir.x + moonDir.z * moonDir.z)
        
        if (horizontalLength > 0.001) {
          // Preserve the azimuth angle (direction in XZ plane) while adjusting elevation
          // Calculate the azimuth angle from the negated sun direction
          const azimuth = Math.atan2(moonDir.z, moonDir.x) // This preserves the opposite direction
          const horizontalScale = Math.sqrt(1 - horizonY * horizonY)
          moonDir.x = Math.cos(azimuth) * horizontalScale
          moonDir.y = horizonY
          moonDir.z = Math.sin(azimuth) * horizontalScale
        } else {
          // Fallback: if sun is directly overhead, place moon at horizon in opposite direction
          // Use the sun's azimuth but opposite
          const sunAzimuth = Math.atan2(sunDir.z, sunDir.x)
          const moonAzimuth = sunAzimuth + Math.PI // Opposite azimuth
          moonDir.x = Math.cos(moonAzimuth) * Math.sqrt(1 - horizonY * horizonY)
          moonDir.y = horizonY
          moonDir.z = Math.sin(moonAzimuth) * Math.sqrt(1 - horizonY * horizonY)
        }
      }
      
      this.moonMesh.position.copy(moonDir).multiplyScalar(990) // Slightly inside sky sphere
      this.moonMesh.visible = true
    }
  }

  destroy() {
    if (this.sunMesh) {
      this.scene.remove(this.sunMesh)
      if (this.sunMesh.geometry) this.sunMesh.geometry.dispose()
      if (this.sunMesh.material instanceof THREE.Material) {
        this.sunMesh.material.dispose()
      }
      this.sunMesh = null
    }
    if (this.moonMesh) {
      this.scene.remove(this.moonMesh)
      if (this.moonMesh.geometry) this.moonMesh.geometry.dispose()
      if (this.moonMesh.material instanceof THREE.Material) {
        this.moonMesh.material.dispose()
      }
      this.moonMesh = null
    }
  }
}

