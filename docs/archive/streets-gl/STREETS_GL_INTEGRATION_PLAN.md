# Streets GL Lighting/Shadow/Water Integration Plan

## Overview
Replace our current lighting, shadow, and water systems with Streets GL's systems for better integration and quality.

## Current Systems to Replace

### Lighting System
- **Current**: Three.js DirectionalLight, PointLight, SpotLight, AmbientLight
- **Location**: `src/components/LightingPanel.tsx`, `src/viewer/useViewer.ts`
- **Replace with**: Streets GL's directional light (sun) system

### Shadow System
- **Current**: Three.js ShadowMap with DirectionalLightShadow
- **Location**: `src/utils/shadowAutoFixer.ts`, `src/utils/shadowDiagnostics.ts`
- **Replace with**: Streets GL's CSM (Cascaded Shadow Maps)

### Water System
- **Current**: Custom water implementation in WeatherPanel
- **Location**: `src/components/WeatherPanel.tsx` (waterEnabled, waterLevel, etc.)
- **Replace with**: Streets GL's WaterMask and TerrainWater system

## Streets GL Systems to Integrate

### 1. CSM Shadow System
- **File**: `streets-gl-alt/src/app/render/CSM.ts`
- **Features**:
  - Cascaded Shadow Maps (1-3 cascades)
  - Configurable resolution (2048-4096)
  - Shadow distance (3000-5000)
  - Bias controls
- **Settings**: Controlled via `settings.onChange('shadows', ...)`

### 2. Directional Light (Sun)
- **Shader**: `streets-gl-alt/src/resources/shaders/shading.frag`
- **Function**: `applyDirectionalLight()`
- **Features**:
  - Sun position calculation (suncalc library)
  - PBR shading
  - IBL (Image Based Lighting)
- **Settings**: Light direction, intensity, color

### 3. Water System
- **Files**:
  - `streets-gl-alt/src/app/objects/WaterMask.ts`
  - `streets-gl-alt/src/app/render/materials/TerrainWaterMaterialContainer.ts`
  - `streets-gl-alt/src/app/terrain/tile-source/WaterTileSource.ts`
- **Features**:
  - Water masks from OSM data
  - Terrain water textures
  - Water rendering in terrain shader

## Integration Strategy

### Phase 1: Bridge Setup
1. Create bridge to Streets GL settings system
2. Expose CSM controls via bridge
3. Expose lighting controls via bridge
4. Expose water controls via bridge

### Phase 2: Panel Updates
1. Update `LightingPanel.tsx`:
   - Remove Three.js light controls
   - Add Streets GL sun controls
   - Add CSM shadow controls
   - Keep HDR controls (compatible)
   
2. Update `WeatherPanel.tsx`:
   - Remove custom water controls
   - Add Streets GL water controls
   - Keep weather effects (clouds, fog, etc.)

### Phase 3: Code Removal
1. Remove old shadow system:
   - `src/utils/shadowAutoFixer.ts`
   - `src/utils/shadowDiagnostics.ts`
   - Shadow-related code in `useViewer.ts`
   
2. Remove old lighting system:
   - Three.js light creation in `useViewer.ts`
   - Light helper code
   
3. Remove old water system:
   - Water rendering code from WeatherPanel
   - Custom water shaders

### Phase 4: Compatibility Check
1. Verify HDR system compatibility
2. Verify material system compatibility
3. Test external objects with new systems
4. Test shadow casting/receiving

## Implementation Steps

### Step 1: Create Streets GL Settings Bridge
- File: `src/utils/streetsGLSettingsBridge.ts`
- Functions:
  - `setShadowQuality(quality: 'low' | 'medium' | 'high')`
  - `setSunDirection(direction: Vec3)`
  - `setSunIntensity(intensity: number)`
  - `setWaterEnabled(enabled: boolean)`

### Step 2: Update LightingPanel
- Connect sliders to Streets GL settings
- Remove Three.js light controls
- Add CSM quality selector
- Add sun direction controls

### Step 3: Update WeatherPanel
- Remove custom water controls
- Add Streets GL water toggle (if available)
- Keep other weather effects

### Step 4: Clean Up
- Remove unused files
- Remove unused state from store
- Update imports

## Compatibility Notes

### HDR System
- Streets GL uses IBL (Image Based Lighting)
- Our HDR system should be compatible
- May need to bridge HDR to Streets GL's IBL system

### Materials
- Streets GL uses PBR materials
- Our materials should work with Streets GL shaders
- External objects already use Streets GL materials

### External Objects
- Already integrated with Streets GL
- Shadows already work (ExternalObjectDepthMaterialContainer)
- Lighting already works (ExternalObjectMaterialContainer)

## Testing Checklist
- [ ] Shadows render correctly
- [ ] Sun direction changes work
- [ ] Shadow quality settings work
- [ ] Water renders (if enabled in Streets GL)
- [ ] HDR still works
- [ ] Materials still render correctly
- [ ] External objects cast/receive shadows
- [ ] Panels update correctly
- [ ] No console errors


