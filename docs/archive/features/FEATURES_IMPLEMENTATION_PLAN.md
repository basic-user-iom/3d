# Features Implementation Plan

## Overview
This document tracks the implementation of 15 new features from Three.js examples.

## Features List

### 1. Ground-Projected Environment Maps ✅ (Enhanced)
- **Status**: Partially implemented, needs enhancement
- **Location**: `src/viewer/effects/HDRSystem.ts`
- **Enhancements Needed**:
  - Add Twinmotion-like controls (offset, rotation, scale)
  - Add blend factor control
  - Add distance falloff control
- **Conflicts**: DynamicSky background
- **Files to Modify**: `HDRSystem.ts`, `LightingPanel.tsx`, `useAppStore.ts`

### 2. 360 Panorama Export ✅
- **Status**: Implemented
- **Location**: `src/utils/panoramaExport.ts`
- **Features**:
  - Export equirectangular panorama
  - Configurable resolution
  - Cube map to equirectangular conversion
- **Integration**: Add button to Camera Views panel
- **Files to Modify**: `CameraViewsPanel.tsx`, `ViewerCanvas.tsx`

### 3. Random UV for Materials ⏳
- **Status**: In Progress
- **Location**: New material modifier
- **Features**:
  - Random UV offset per material instance
  - UV rotation
  - UV scale variation
- **Conflicts**: None expected
- **Files to Modify**: `MaterialPanel.tsx`, `useAppStore.ts`

### 4. Emissive Bloom ⏳
- **Status**: In Progress
- **Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Features**:
  - Selective bloom based on emissive materials
  - Configurable threshold, strength, radius
- **Conflicts**: Other post-processing effects
- **Files to Modify**: `PostProcessingSystem.ts`, `MaterialPanel.tsx`, `useAppStore.ts`

### 5. 3D LUT Post-Processing ⏳
- **Status**: In Progress
- **Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Features**:
  - Load .cube LUT files
  - Apply color grading
  - Intensity control
- **Conflicts**: None expected
- **Files to Modify**: `PostProcessingSystem.ts`, `CameraViewsPanel.tsx`, `useAppStore.ts`

### 6. Anamorphic Lens Flares ⏳
- **Status**: In Progress
- **Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Features**:
  - Dynamic flare generation based on lights
  - Configurable intensity and count
  - Horizontal stretching effect
- **Conflicts**: Existing lens flare in SunMoonSystem
- **Files to Modify**: `PostProcessingSystem.ts`, `LightingPanel.tsx`, `useAppStore.ts`

### 7. Ocean Shader 🔄
- **Status**: Replace WaterSystem
- **Location**: Replace `src/viewer/effects/WaterSystem.ts`
- **Features**:
  - Advanced ocean shader with foam
  - Gerstner waves
  - Caustics
  - Underwater effects
- **Conflicts**: Current WaterSystem, Marching Cubes mode
- **Files to Modify**: `WaterSystem.ts`, `WeatherPanel.tsx`, `useAppStore.ts`

### 8. Sky Shader 🔄
- **Status**: Replace DynamicSky
- **Location**: Replace `src/viewer/effects/DynamicSky.ts`
- **Features**:
  - Physically-based sky shader
  - Sun position based on time
  - Atmospheric scattering
- **Conflicts**: HDR background, current DynamicSky
- **Files to Modify**: `DynamicSky.ts`, `WeatherPanel.tsx`, `useAppStore.ts`

### 9. Volume Cloud Shader 🔄
- **Status**: Replace volumetric clouds
- **Location**: Replace cloud system in `DynamicSky.ts`
- **Features**:
  - Raymarched volumetric clouds
  - Weather integration
  - Cloud lighting
- **Conflicts**: Current volumetric cloud implementation
- **Files to Modify**: `DynamicSky.ts` or new `VolumeCloudSystem.ts`

### 10. Path Tracer with Denoiser ⏳
- **Status**: In Progress
- **Location**: New export system
- **Features**:
  - Path tracing for camera view export
  - Denoiser integration
  - High-quality offline rendering
- **Conflicts**: Real-time rendering
- **Files to Modify**: `CameraViewsPanel.tsx`, new `PathTracer.ts`

### 11. Caustics for Glass Materials ⏳
- **Status**: In Progress
- **Location**: Material enhancement
- **Features**:
  - Real-time caustics for transparent materials
  - Light-based caustic generation
  - Configurable intensity
- **Conflicts**: Current water caustics
- **Files to Modify**: `MaterialPanel.tsx`, `useAppStore.ts`

### 12. Shadow Map with Opacity ⏳
- **Status**: In Progress
- **Location**: Shadow system enhancement
- **Features**:
  - Custom shadow color and opacity per material
  - Shadow tinting
  - Soft shadows with opacity gradients
- **Conflicts**: Current shadow system
- **Files to Modify**: `ViewerCanvas.tsx`, `MaterialPanel.tsx`, `useAppStore.ts`

### 13. Ambient Occlusion (AO) ⏳
- **Status**: In Progress
- **Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Features**:
  - Screen-space AO
  - Configurable radius and intensity
  - Bias control
- **Conflicts**: None expected
- **Files to Modify**: `PostProcessingSystem.ts`, `useAppStore.ts`

### 14. Screen-Space Shadows (SSS) ⏳
- **Status**: In Progress
- **Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Features**:
  - GTAO-based screen-space shadows
  - Combines with shadow maps
  - Configurable intensity and radius
- **Conflicts**: Current shadow map system
- **Files to Modify**: `PostProcessingSystem.ts`, `ViewerCanvas.tsx`, `useAppStore.ts`

### 15. Screen-Space Reflections (SSR) ⏳
- **Status**: In Progress
- **Location**: `src/viewer/postprocessing/PostProcessingSystem.ts`
- **Features**:
  - Real-time reflections on smooth surfaces
  - Max roughness control
  - Configurable intensity
- **Conflicts**: Environment map reflections
- **Files to Modify**: `PostProcessingSystem.ts`, `useAppStore.ts`

## Implementation Order

### Phase 1: Foundation (Post-Processing Infrastructure) ✅
- [x] PostProcessingSystem class
- [x] EffectComposer setup
- [ ] Shader implementations

### Phase 2: Material Features
- [ ] Random UV
- [ ] Caustics for glass
- [ ] Shadow map opacity

### Phase 3: Shader Replacements
- [ ] Ocean shader
- [ ] Sky shader
- [ ] Volume cloud shader

### Phase 4: Export Features
- [x] 360 Panorama
- [ ] Path tracer with denoiser

### Phase 5: Post-Processing Effects
- [ ] Emissive bloom
- [ ] 3D LUT
- [ ] Anamorphic flares
- [ ] AO
- [ ] SSR
- [ ] SSS

## Testing Checklist

- [ ] Test each feature individually
- [ ] Test feature combinations
- [ ] Check for conflicts between systems
- [ ] Performance testing
- [ ] Memory leak testing
- [ ] Browser compatibility
- [ ] Error handling

## Known Conflicts

1. **HDR Background vs DynamicSky**: Resolved by hiding DynamicSky mesh when HDR is active
2. **Shadow Maps vs SSS**: Both can be active, SSS enhances shadow maps
3. **Environment Map Reflections vs SSR**: SSR overrides env map for smooth surfaces
4. **Lens Flares**: Existing sun flare vs anamorphic flares - need to choose or combine
5. **Water Systems**: Old WaterSystem vs Ocean shader - replace completely

## Notes

- All features should be optional and configurable
- Maintain backward compatibility where possible
- Provide UI controls for all features
- Document all new settings
- Test thoroughly before marking complete




