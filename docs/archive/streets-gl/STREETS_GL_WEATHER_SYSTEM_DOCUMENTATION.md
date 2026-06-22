# Streets GL Weather/Sun System Documentation

## Overview

Based on analysis of Streets GL source code and documentation, here's a comprehensive guide to Streets GL's weather and sun system.

## Key Features

### 1. **Configurable Time of Day** ⏰
- Streets GL supports configurable time of day for sun positioning
- Uses `suncalc` npm package for calculating sun position based on time and location
- Time of day affects:
  - Sun direction (for lighting and shadows)
  - Atmospheric scattering (sky color)
  - Aerial perspective (fog/haze)

### 2. **Realistic Atmosphere and Aerial Perspective Rendering** 🌍
- **Physically-based atmospheric scattering** using Preetham model
- **Aerial perspective** (distance-based fog/haze) for realistic depth perception
- Automatic sky color calculation based on sun position
- Uses transmittance LUT (Look-Up Table) for accurate atmospheric calculations

### 3. **CSM (Cascaded Shadow Maps)** 🎯
- **3 cascades** for high-quality shadows
- **2048x2048 resolution** per cascade
- **Practical split** method for cascade distribution
- **Texel snapping** to reduce shadow flickering
- Supports shadow casting and receiving for external objects

## Atmospheric Scattering Implementation

### Constants (from `atmosphere.glsl`)

```glsl
const float groundRadiusMM = 6.360;        // Earth radius in megameters
const float atmosphereRadiusMM = 6.460;    // Atmosphere radius in megameters

// Rayleigh scattering coefficients (wavelength-dependent)
const vec3 rayleighScatteringBase = vec3(5.802, 13.558, 33.1);
const float rayleighAbsorptionBase = 0.0;

// Mie scattering coefficients
const float mieScatteringBase = 3.996;
const float mieAbsorptionBase = 4.4;

// Ozone absorption coefficients
const vec3 ozoneAbsorptionBase = vec3(0.650, 1.881, 0.085);

// Ground albedo (reflectivity)
const vec3 groundAlbedo = vec3(0.3);
```

### Altitude-Based Density Functions

```glsl
// Rayleigh density: decreases exponentially with altitude
float rayleighDensity = exp(-altitudeKM/8.0);

// Mie density: decreases faster than Rayleigh
float mieDensity = exp(-altitudeKM/1.2);

// Ozone absorption: peaks at 25km altitude
vec3 ozoneAbsorption = ozoneAbsorptionBase * max(0.0, 1.0 - abs(altitudeKM - 25.0) / 15.0);
```

### Aerial Perspective (Fog/Haze)

```glsl
// Aerial perspective uses 16 slices for depth-based fog
const float aerialPerspectiveSliceCount = 16.;
const float aerialPerspectiveSliceSize = 0.001; // in MM

// Depth to slice conversion (non-linear for realistic atmospheric perspective)
float aerialPerspectiveDepthToSlice(float depth) {
    return pow(depth / 1000., 1. / 1.4);
}
```

## Sun Position Calculation

### MapTimeSystem Integration

Streets GL uses `MapTimeSystem` to manage sun position:

1. **Sun Direction** (`MapTimeSystem.sunDirection`):
   - Used by `AtmosphereLUTPass` for atmospheric scattering calculations
   - Updates sky color, fog, and sun color automatically

2. **Light Direction** (`MapTimeSystem.lightDirection`):
   - Used by CSM (Cascaded Shadow Maps) for shadow direction
   - Synced from `sunDirection` by `SceneSystem.update()`

3. **Static State**:
   - When manually setting sun direction, `MapTimeSystem` is set to Static state (preset 1)
   - Prevents automatic time-based recalculation

### Sun Position API

```typescript
// Set sun direction (updates CSM + Atmosphere)
streetsGLBridge.setSunDirection({
  x: sunDir.x,
  y: sunDir.y,
  z: sunDir.z
})

// Set sun intensity (affects CSM lighting)
streetsGLBridge.setSunIntensity(intensity)

// Set shadow quality (CSM quality)
streetsGLBridge.setShadowQuality('low' | 'medium' | 'high')
```

## CSM Shadow System

### Configuration

```typescript
// High quality settings (default)
csm.cascades = 3;        // Three cascades
csm.resolution = 2048;   // 2048x2048 per cascade
csm.far = 4000;          // Extended shadow distance

// Low quality settings
csm.cascades = 1;        // Single cascade
csm.resolution = 2048;   // 2048x2048 shadow map
csm.far = 3000;          // Shadow distance
```

### Shadow Parameters

- **Shadow Bias**: Prevents shadow acne (self-shadowing artifacts)
- **Shadow Normal Bias**: Additional bias based on surface normal
- **Bias Scale**: Global multiplier for shadow bias
- **Direction**: Light direction vector (typically sun direction)
- **Intensity**: Light intensity (0 = no shadows)

## Water System

- **Automatic from OSM**: Streets GL automatically renders water from OpenStreetMap data
- **No manual controls**: Water appears in the map based on OSM water features
- **Coastline filling**: Uses Shapefiles from `osmdata.openstreetmap.de` for water polygons

## What Streets GL Does NOT Have

1. **Particle-based weather effects**:
   - No rain particles
   - No snow particles
   - No particle-based fog

2. **Clouds**:
   - No volumetric clouds
   - No cloud rendering system

3. **Direct sun color control**:
   - Sun color is calculated from atmosphere system based on sun direction
   - Cannot be directly controlled (atmospheric scattering determines color)

## Integration Points

### ExternalObjectBridge

The `ExternalObjectBridge` handles communication between external applications and Streets GL:

```typescript
// Sun direction update flow:
handleSetSunDirection()
  → Updates CSM.direction (for shadows)
  → Updates MapTimeSystem.lightDirection (for CSM sync)
  → Updates MapTimeSystem.sunDirection (for atmosphere)
  → Updates staticLights[0] (for persistence)
  → Sets MapTimeSystem to Static state
```

### AtmosphereLUTPass

- Uses `MapTimeSystem.sunDirection` for atmospheric scattering
- Calculates transmittance LUT for accurate sky color
- Updates every frame based on sun position

## Key Differences from Three.js Sky

| Feature | Streets GL | Three.js Sky |
|---------|-----------|--------------|
| **Atmospheric Model** | Preetham with altitude-based density | Preetham (simplified) |
| **Aerial Perspective** | 16-slice depth-based fog | Exponential fog |
| **Sun Color** | Calculated from atmosphere | Direct control |
| **Water** | Automatic from OSM | Manual placement |
| **Clouds** | None | Volumetric clouds supported |
| **Particle Effects** | None | Rain/snow/fog particles |

## Recommendations for Standalone Weather System

Based on Streets GL documentation, the standalone weather system should:

1. **Match CSM Settings**:
   - 3 cascades
   - 2048x2048 resolution per cascade
   - Practical split method
   - Texel snapping

2. **Match Atmospheric Scattering**:
   - Use Preetham model with altitude-based density
   - Rayleigh: `exp(-altitudeKM/8.0)`
   - Mie: `exp(-altitudeKM/1.2)`
   - Include ozone absorption

3. **Match Aerial Perspective**:
   - Use distance-based fog (exponential)
   - Match fog color to sky color
   - Update fog color based on sun elevation

4. **Sun Position**:
   - Calculate from time of day and north offset
   - Update both CSM direction and atmosphere system
   - Support static state (manual override)

## References

- **Source Code**: `streets-gl-alt/src/`
- **Atmosphere Shader**: `streets-gl-alt/src/resources/shaders/chunks/atmosphere.glsl`
- **CSM System**: `streets-gl-alt/src/app/render/CSM.ts`
- **MapTimeSystem**: `streets-gl-alt/src/app/systems/MapTimeSystem.ts`
- **ExternalObjectBridge**: `streets-gl-alt/src/app/ExternalObjectBridge.ts`
- **AtmosphereLUTPass**: `streets-gl-alt/src/app/render/passes/AtmosphereLUTPass.ts`

## Summary

Streets GL's weather/sun system is:
- ✅ **Physically-based**: Uses Preetham atmospheric scattering model
- ✅ **Automatic**: Sky color, fog, and sun color calculated from sun position
- ✅ **High-quality**: CSM shadows with 3 cascades at 2048x2048 resolution
- ✅ **Realistic**: Aerial perspective with altitude-based density functions
- ❌ **Limited**: No particle effects, no clouds, no direct sun color control

The standalone weather system should match these characteristics for visual consistency.


