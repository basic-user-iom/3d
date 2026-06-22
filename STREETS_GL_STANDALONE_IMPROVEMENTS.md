# Streets GL Standalone Improvements

## Analysis: Official vs Standalone Implementation

### Official Streets GL Features (from streets-gl-alt):
1. **MapTimeSystem**: Uses SunCalc library for accurate astronomical sun/moon positions
2. **Atmosphere System**: Physically-based with:
   - Transmittance LUT (lookup table)
   - Multiple scattering LUT
   - Sky view LUT
   - Aerial perspective (fog/haze)
   - Proper atmospheric scattering
3. **Sun Control**: 
   - Real-time calculation based on location (lat/lon) and date/time
   - Smooth transitions between day/night
   - Proper azimuth/elevation calculations
4. **Visual Effects**:
   - Realistic sky colors based on sun position
   - Atmospheric perspective (distance fog)
   - Proper lighting transitions

### Current Standalone Issues:
1. **Sun Position**: Simple approximation, not using real astronomical calculations
2. **Sky Shader**: Basic Three.js Sky shader, not physically accurate
3. **No Location-Based Sun**: Doesn't use lat/lon for sun position
4. **Limited Atmospheric Effects**: Missing proper fog/haze
5. **No Time Transitions**: Abrupt changes, no smooth transitions

## Improvements to Apply:

### 1. Add SunCalc Library
- Use CDN: `https://cdn.jsdelivr.net/npm/suncalc@2.0.0/suncalc.js`
- Calculate real sun position based on location and time

### 2. Improve Sun Position Calculation
```javascript
// Replace simple approximation with:
const sunPosition = SunCalc.getPosition(date, lat, lon);
const azimuth = sunPosition.azimuth + Math.PI; // Convert to direction
const altitude = sunPosition.altitude;
// Convert to 3D direction vector
```

### 3. Enhanced Sky Shader
- Better atmospheric scattering
- Proper Rayleigh/Mie scattering
- Sun disk rendering
- Horizon glow

### 4. Add Atmospheric Effects
- Distance fog (aerial perspective)
- Sky color transitions
- Better exposure control

### 5. Smooth Time Transitions
- Interpolate sun position
- Smooth sky color changes
- Gradual lighting transitions

### 6. Better Lighting Control
- Ambient light based on sun elevation
- Proper day/night switching
- Moon lighting for night


























