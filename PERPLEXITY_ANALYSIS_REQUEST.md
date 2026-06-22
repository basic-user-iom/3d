# Perplexity Analysis Request: Streets GL Standalone Implementation

## Context
We have a standalone Streets GL implementation that we want to cross-check against the official streets-gl repository (https://github.com/StrandedKitty/streets-gl) to ensure our sun control, weather system, and atmospheric effects match the official implementation.

## Our Implementation Summary

### Sun Position Calculation
```javascript
// We use SunCalc library for astronomical calculations
const sunPos = SunCalc.getPosition(date, lat, lon);
const azimuth = sunPos.azimuth + Math.PI; // Convert to direction
const altitude = sunPos.altitude;

// Convert to 3D direction vector (matching MathUtils.polarToCartesian)
const sunDir = new THREE.Vector3(
  Math.cos(altitude) * Math.cos(azimuth),
  Math.sin(altitude),
  Math.cos(altitude) * Math.sin(azimuth)
);
sunPosition = sunDir.multiplyScalar(-1); // Direction to sun
```

### Official Implementation (from streets-gl-alt)
```typescript
// MapTimeSystem.ts
const sunPosition = SunCalc.getPosition(date, latLon.lat, latLon.lon);
return Vec3.multiplyScalar(
  MathUtils.polarToCartesian(sunPosition.azimuth + Math.PI, sunPosition.altitude), 
  -1
);

// MathUtils.polarToCartesian
public static polarToCartesian(azimuth: number, altitude: number): Vec3 {
  return new Vec3(
    Math.cos(altitude) * Math.cos(azimuth),
    Math.sin(altitude),
    Math.cos(altitude) * Math.sin(azimuth)
  )
}
```

### Questions for Perplexity:

1. **Sun Position Calculation**: Is our conversion from SunCalc azimuth/altitude to 3D direction vector correct? We're using:
   - `x = cos(altitude) * cos(azimuth)`
   - `y = sin(altitude)`
   - `z = cos(altitude) * sin(azimuth)`
   - Then multiplying by -1 for direction TO sun
   
   Does this match the official streets-gl implementation?

2. **Atmospheric Rendering**: The official streets-gl uses LUT-based atmosphere (transmittance LUT, multiple scattering LUT, sky view LUT). We're using a shader-based approach with Rayleigh/Mie scattering. Are there any critical differences we should address?

3. **Fog/Aerial Perspective**: We're using FogExp2 with dynamic density and color. The official uses "aerial perspective" with a 3D texture LUT. Are we missing important features?

4. **Lighting System**: We adjust sun intensity and ambient light based on sun elevation. Does this match the official behavior?

5. **Time Transitions**: The official has smooth transitions with easing. Should we implement similar transitions?

## Key Differences We've Identified

1. **Atmosphere Method**: Official uses LUT-based (more accurate), we use shader-based (simpler)
2. **Aerial Perspective**: Official uses 3D texture LUT, we use FogExp2
3. **Transitions**: Official has smooth easing transitions, we have instant updates

## What We Need Verified

1. Is our sun position calculation mathematically correct?
2. Are there any critical atmospheric effects we're missing?
3. Should we implement LUT-based atmosphere for better accuracy?
4. Are there any best practices from the official implementation we should adopt?
