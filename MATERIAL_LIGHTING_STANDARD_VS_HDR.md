# Material Lighting: Standard Mode vs HDR Mode

## How Materials Receive Light in Three.js

### Material Lighting Components

In Three.js `MeshStandardMaterial` and `MeshPhysicalMaterial`, the final material color is calculated from multiple lighting sources:

```
Final Color = Direct Lighting + Indirect Lighting + Reflections
```

## Standard Mode (No HDR)

### Light Sources:
1. **Direct Lights** (Directional, Point, Spot lights)
   - Provides direct illumination based on light direction and intensity
   - Creates shadows and highlights
   - Same in both modes ✅

2. **Ambient Light** (`THREE.AmbientLight`)
   - Provides uniform base illumination to all surfaces
   - Intensity: **Full intensity** (typically 0.6, adjustable via slider)
   - Purpose: Prevents completely dark areas, fills in shadows

3. **Environment Map** (Default RoomEnvironment)
   - Provides indirect lighting (Image-Based Lighting / IBL)
   - Intensity: **1.0** (default)
   - Purpose: Provides ambient reflections and indirect illumination
   - Note: Default RoomEnvironment is dimmer than HDR textures

### Material Properties:
- `envMap`: Default RoomEnvironment texture
- `envMapIntensity`: **1.0** (or 2.0x when HDR is disabled to compensate for dimmer default environment)
- Direct lights: **Full contribution**
- Ambient light: **Full contribution** (0.6 * 1.2 = 0.72 with interior boost)

### Lighting Equation (Standard Mode):
```
Material Brightness = 
  Direct Light Contribution (from directional/point lights) +
  Ambient Light (0.6-0.72 intensity) +
  Environment Map IBL (intensity 1.0-2.0) +
  Reflections (from environment map)
```

## HDR Mode

### Light Sources:
1. **Direct Lights** (Directional, Point, Spot lights)
   - **Same as standard mode** ✅
   - Same intensity, same direction (except sun light rotated 180° to match HDR)
   - Same shadows

2. **Ambient Light** (`THREE.AmbientLight`)
   - **REDUCED intensity** when HDR is enabled
   - Intensity: **51-76% of full** (depending on shadow settings)
   - Formula: `ambientIntensity * 0.75 * 0.85 * 1.2` (with shadows) or `ambientIntensity * 0.5 * 0.85 * 1.2` (without shadows)
   - Purpose: Reduced because HDR environment map provides most indirect lighting
   - Floor: Minimum 0.35 * 1.2 = 0.42 (prevents complete darkness)

3. **HDR Environment Map**
   - Provides **strong indirect lighting** (Image-Based Lighting / IBL)
   - Intensity: **1.0** (default, adjustable via HDR intensity slider)
   - Metallic materials get **1.5x boost** (intensity 1.5)
   - Purpose: Primary source of indirect lighting and reflections
   - Note: HDR textures are much brighter than default RoomEnvironment

### Material Properties:
- `envMap`: HDR PMREM texture (pre-filtered environment map)
- `envMapIntensity`: **1.0** (or 1.5 for metallic materials)
- Direct lights: **Full contribution** (same as standard)
- Ambient light: **Reduced contribution** (51-76% of standard)

### Lighting Equation (HDR Mode):
```
Material Brightness = 
  Direct Light Contribution (from directional/point lights) +
  Ambient Light (0.31-0.61 intensity, REDUCED) +
  HDR Environment Map IBL (intensity 1.0-1.5) +
  Reflections (from HDR environment map)
```

## Key Differences

### 1. **Indirect Lighting Source**

**Standard Mode:**
- Primary indirect lighting: **Ambient Light** (full intensity)
- Secondary indirect lighting: Default RoomEnvironment (dimmer, intensity 1.0-2.0)

**HDR Mode:**
- Primary indirect lighting: **HDR Environment Map** (bright, intensity 1.0-1.5)
- Secondary indirect lighting: Ambient Light (reduced to 51-76%)

### 2. **Material Brightness**

**Standard Mode:**
- Higher ambient light contribution
- Lower environment map contribution (dimmer default environment)
- **Result**: Materials appear brighter due to higher ambient light

**HDR Mode:**
- Lower ambient light contribution
- Higher environment map contribution (brighter HDR textures)
- **Result**: Materials should appear similar brightness, but may appear darker if:
  - HDR environment map intensity is too low
  - Ambient light reduction is too aggressive
  - Default environment intensity boost isn't high enough when HDR is disabled

### 3. **Reflections**

**Standard Mode:**
- Reflections from dimmer default RoomEnvironment
- Less pronounced reflections

**HDR Mode:**
- Reflections from bright HDR environment map
- More realistic, pronounced reflections
- Better for metallic materials (which get 1.5x intensity boost)

## Why HDR Mode Can Appear Darker

### Contributing Factors:

1. **Ambient Light Reduction**
   - Standard: 0.6-0.72 intensity
   - HDR: 0.31-0.61 intensity (51-76% reduction)
   - **Impact**: Less fill light, darker shadows

2. **Environment Map Brightness**
   - Standard: Default RoomEnvironment (dim) with 2.0x intensity boost
   - HDR: HDR texture (bright) with 1.0x intensity
   - **Impact**: If HDR intensity is too low, materials appear darker

3. **Material envMapIntensity**
   - Standard: 2.0 (boosted to compensate for dim default environment)
   - HDR: 1.0 (or 1.5 for metallic)
   - **Impact**: If HDR intensity doesn't match the brightness of the boosted default environment, materials appear darker

## Current Fixes Applied

1. **Default Environment Intensity Boost**: When HDR is disabled, default environment uses 2.0x intensity to match HDR brightness
2. **Ambient Light Restoration**: When HDR is disabled, ambient light is restored to full intensity
3. **Light Intensity Preservation**: Light intensities are now saved and restored when HDR is toggled

## Recommendations

To ensure consistent brightness between modes:

1. **HDR Intensity**: Adjust HDR intensity slider to match desired brightness
2. **Ambient Light**: The system automatically reduces ambient light when HDR is enabled
3. **Material Intensity**: Metallic materials automatically get 1.5x boost for better reflections
4. **Default Environment**: Uses 2.0x intensity when HDR is disabled to compensate for being dimmer

## Technical Details

### Material Shader Calculation (Three.js)

In Three.js shaders, material lighting is calculated as:

```glsl
// Direct lighting (from lights)
vec3 directLighting = calculateDirectLighting(lights, material, normal, view);

// Indirect lighting (from environment map / IBL)
vec3 indirectLighting = sampleEnvironmentMap(envMap, normal, view, roughness) * envMapIntensity;

// Ambient light (uniform fill)
vec3 ambientLighting = ambientLightColor * ambientLightIntensity;

// Final color
vec3 finalColor = directLighting + indirectLighting + ambientLighting;
```

### envMapIntensity Effect

- `envMapIntensity` controls how much the environment map contributes to material lighting
- Higher values = brighter indirect lighting
- Lower values = dimmer indirect lighting
- This is **separate** from direct light intensity
- Works **additively** with ambient light (not replacing it)

### Why Ambient Light is Reduced in HDR Mode

- HDR environment maps provide strong indirect lighting
- Too much ambient light + HDR IBL = washed out, flat appearance
- Reducing ambient light allows HDR to provide most indirect lighting
- Maintains contrast and shadow definition
- Industry best practice for HDR rendering


