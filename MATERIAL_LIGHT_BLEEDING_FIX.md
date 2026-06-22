# Material Light Bleeding Fix

## Problem
Some parts of the car are receiving light when they should be darker. Light is passing through materials/meshes that should be opaque.

## Root Causes (from Perplexity Research)

1. **depthWrite = false on opaque materials**: Allows light to pass through
2. **Double-sided materials**: Can allow light through back faces
3. **Incorrect transparency detection**: Opaque materials marked as transparent
4. **Missing castShadow**: Opaque meshes not casting shadows to block light

## Best Practices from Perplexity

1. **Opaque materials MUST have**:
   - `depthWrite = true` (prevents light bleeding through)
   - `depthTest = true` (proper depth sorting)
   - `transparent = false` (unless actually transparent)
   - `opacity = 1.0` (fully opaque)
   - `castShadow = true` (blocks light)

2. **Transparent materials should have**:
   - `depthWrite = false` (allows shadows to pass through)
   - `castShadow = false` (doesn't block light)
   - `receiveShadow = true` (shadows appear on surface)

3. **Double-sided materials**: Can cause light bleeding if not configured correctly

## Fixes to Apply

### 1. Verify Opaque Materials Have depthWrite = true
- Check all opaque materials have `depthWrite = true`
- Ensure transparent materials have `depthWrite = false`

### 2. Fix Double-Sided Materials
- Double-sided materials might allow light through back faces
- For interior parts, we need double-sided for shadows, but must ensure depthWrite = true

### 3. Verify castShadow Configuration
- All opaque meshes should have `castShadow = true`
- This blocks light from passing through

### 4. Check Material Opacity
- Ensure opaque materials have `opacity = 1.0` and `transparent = false`









