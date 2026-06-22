# AO Color Washout Fix

## Problem
AO (Ambient Occlusion) is washing out car colors, making the car appear white.

## Solution
The AO intensity/scale is too high. Even the default values (intensity: 0.05, scale: 0.5) can wash out colors on some models.

## Quick Fix Commands

### 1. Check Current AO Settings
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.postProcessingSystem) {
  const ao = viewer.postProcessingSystem.config?.ao;
  console.log('Current AO Settings:', {
    enabled: ao?.enabled,
    intensity: ao?.saoIntensity,
    scale: ao?.saoScale,
    riskFactor: (ao?.saoIntensity || 0) * (ao?.saoScale || 0)
  });
}
```

### 2. Set Very Low AO (Recommended for Color Preservation)
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.postProcessingSystem) {
  viewer.postProcessingSystem.updateConfig({
    ao: {
      enabled: true,
      saoIntensity: 0.02,  // Very low intensity
      saoScale: 0.3,        // Very low scale
      // Keep other settings
      saoBias: 0.5,
      saoKernelRadius: 50,
      saoMinResolution: 0,
      saoBlur: true,
      saoBlurRadius: 8,
      saoBlurStdDev: 4.0,
      saoBlurDepthCutoff: 0.01
    }
  });
  console.log('✅ AO set to very low values (intensity: 0.02, scale: 0.3)');
  console.log('Risk factor:', 0.02 * 0.3, '(should preserve colors)');
}
```

### 3. Set Ultra-Low AO (Minimal Effect)
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.postProcessingSystem) {
  viewer.postProcessingSystem.updateConfig({
    ao: {
      enabled: true,
      saoIntensity: 0.01,  // Ultra-low intensity
      saoScale: 0.2,        // Ultra-low scale
      saoBias: 0.5,
      saoKernelRadius: 50,
      saoMinResolution: 0,
      saoBlur: true,
      saoBlurRadius: 8,
      saoBlurStdDev: 4.0,
      saoBlurDepthCutoff: 0.01
    }
  });
  console.log('✅ AO set to ultra-low values (intensity: 0.01, scale: 0.2)');
}
```

### 4. Disable AO Completely
```javascript
const viewer = window.__viewer || window.sharedViewer;
if (viewer?.postProcessingSystem) {
  viewer.postProcessingSystem.updateConfig({ ao: { enabled: false } });
  console.log('✅ AO disabled');
}
```

## Recommended Settings for Color Preservation

For models where AO washes out colors, use:
- **Intensity:** 0.01 - 0.02 (instead of 0.05)
- **Scale:** 0.2 - 0.3 (instead of 0.5)
- **Risk Factor:** 0.002 - 0.006 (instead of 0.025)

This will provide subtle AO without washing out colors.











