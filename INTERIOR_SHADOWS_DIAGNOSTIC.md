# Interior Shadows Diagnostic - Objects Receiving Light When Should Be in Shadow

## Problem
Some objects inside the car that should be in shadow are still receiving light.

## Root Causes (Based on Perplexity Research)

### 1. Shadow Camera Frustum Not Encompassing Interior
- Shadow camera bounds might be too small
- Interior parts might be outside shadow camera frustum
- Near/far planes might not capture all interior surfaces

### 2. Objects Not Casting Shadows
- Interior objects might have `castShadow = false`
- This allows light to pass through them
- Other objects behind them receive light when they shouldn't

### 3. Material Configuration Issues
- Materials might not have `depthWrite = true`
- This allows light to pass through opaque materials
- Double-sided materials might allow light through back faces

### 4. Shadow Map Resolution Too Low
- Low resolution shadow maps can miss small interior details
- Interior objects might not be properly represented in shadow map

## Current Configuration Status

### ✅ Shadow Camera Settings
- Near plane: `0.001` (good for interior shadows)
- Far plane: Based on scene size
- Bounds: Using full model bounds (not just visible)

### ✅ Material Configuration
- Opaque materials: `depthWrite = true`, `castShadow = true`, `receiveShadow = true`
- Transparent materials: `castShadow = false`, `depthWrite = false`, `receiveShadow = true`
- Double-sided materials: `depthWrite = true` for opaque

### ⚠️ Potential Issues
1. Some interior objects might not be casting shadows
2. Shadow camera bounds might need adjustment
3. Shadow map resolution might be too low for interior details

## Diagnostic Checks Needed

1. **Check all interior objects cast shadows**
   - Verify `castShadow = true` for all opaque interior meshes
   - Interior objects must cast shadows to block light

2. **Verify shadow camera bounds**
   - Ensure bounds cover entire model including interior
   - Check if interior parts are within shadow camera frustum

3. **Check shadow map resolution**
   - Verify shadow map size is sufficient (1024x1024 or higher)
   - Low resolution can miss interior details

4. **Verify material depth writing**
   - All opaque materials must have `depthWrite = true`
   - This ensures they block light in depth buffer

## Fixes to Apply

1. **Ensure ALL opaque objects cast shadows** (including interior)
2. **Verify shadow camera bounds cover entire model**
3. **Check shadow map resolution is adequate**
4. **Add diagnostic logging for interior shadow issues**









