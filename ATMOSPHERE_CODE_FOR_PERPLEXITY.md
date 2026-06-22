# Complete Weather/Atmosphere System Code for Perplexity Analysis

This document contains the complete implementation of our weather/atmosphere system for comparison with the official Streets GL implementation: https://github.com/StrandedKitty/streets-gl

## Our Implementation Files

### 1. DynamicSky.ts - Main Sky System with Atmospheric Scattering

**Key Parameters:**
- Sky sphere radius: 40,000 units (20x larger than original 2,000)
- Sun position distance: 50,000 units (50x further than original 1,000)
- Cloud box size: 40,000 × 12,000 × 40,000 units (20x larger)
- Cloud domain in shader: ±20,000 units (20x larger)

**File:** `src/viewer/effects/DynamicSky.ts` (979 lines)

Key sections:
- Line 123: `new THREE.SphereGeometry(40000, 32, 32)` - Sky sphere geometry
- Line 462: `new THREE.BoxGeometry(40000, 12000, 40000)` - Cloud box geometry
- Line 677-678: Cloud domain bounds in shader
- Line 846: Sun position scaling to 50,000 units
- Lines 207-282: `skyColorCalc()` function - atmospheric scattering calculation
- Lines 247-253: Sun disk calculation with larger size
- Lines 258-272: Color balance adjustments for sunset/evening

### 2. DynamicSkyLUTShader.ts - LUT-Based Sky Shader

```typescript
// File: src/viewer/effects/DynamicSkyLUTShader.ts
// Complete file content (80 lines)
```

[Full file content from lines 1-80 above]

### 3. AtmosphereLUTSystem.ts - LUT System Implementation

```typescript
// File: src/viewer/effects/AtmosphereLUTSystem.ts
// Complete file content (649 lines)
```

[Full file content from lines 1-649 above]

### 4. AtmosphericPerspective.ts - Fog/Haze System

```typescript
// File: src/viewer/effects/AtmosphericPerspective.ts
// Complete file content (132 lines)
```

[Full file content from lines 1-132 above]

### 5. SunMoonSystem.ts - Sun/Moon Visual System

```typescript
// File: src/viewer/effects/SunMoonSystem.ts
// Complete file content (240 lines)
```

[Full file content from lines 1-240 above]

## Official Streets GL Reference Files

### 1. atmosphere.glsl - Core Atmosphere Constants and Functions

```glsl
// File: streets-gl-alt/src/resources/shaders/chunks/atmosphere.glsl
// Complete file content (110 lines)
```

[Full file content from lines 1-110 above]

### 2. atmosphereSkyView.frag - Sky View LUT Generation Shader

```glsl
// File: streets-gl-alt/src/resources/shaders/atmosphereSkyView.frag
// Complete file content (82 lines)
```

[Full file content from lines 1-82 above]

### 3. AtmosphereLUTPass.ts - Official LUT Pass Implementation

```typescript
// File: streets-gl-alt/src/app/render/passes/AtmosphereLUTPass.ts
// Complete file content (183 lines)
```

[Full file content from lines 1-183 above]

## Key Integration Points

### ViewerCanvas.tsx - Weather System Integration

Key sections from `src/viewer/ViewerCanvas.tsx`:

1. **Standalone Weather System Initialization** (lines ~10050-10550)
   - Creates DynamicSky with atmospheric scattering
   - Creates AtmosphericPerspective (fog/haze)
   - Creates SunMoonSystem
   - Updates based on timeOfDay

2. **Weather System Updates** (lines ~8400-8433)
   - Syncs DynamicSky with timeOfDay
   - Updates sun position, exposure, rayleigh, mie coefficients
   - Updates atmospheric perspective color based on sun elevation

## Key Differences to Analyze

1. **LUT Generation**: Our system uses Three.js WebGLRenderer, official uses custom WebGL2 wrapper
2. **Sky View LUT Update Frequency**: Our system regenerates on sun direction change, official regenerates every frame
3. **Sun Position Scaling**: Our system uses 50,000 units distance, need to verify official distance
4. **Exposure/Tone Mapping**: Our system uses `vec3(1.0) - exp(-color * exposure)`, need to verify official
5. **Color Transitions**: Our system has custom sunset/evening color adjustments, need to compare with official
6. **Aerial Perspective**: Our system uses THREE.FogExp2, official uses 16-slice 3D texture system

## Questions for Perplexity Analysis

1. How does the official Streets GL handle time-of-day color transitions (morning, noon, evening)?
2. What is the correct sun distance and size for realistic appearance?
3. How does the official system update Sky View LUT - every frame or only when sun direction changes?
4. What exposure/tone mapping formula does Streets GL use?
5. How does the official aerial perspective system work with 16 slices?
6. Are there any missing atmospheric effects in our implementation?

