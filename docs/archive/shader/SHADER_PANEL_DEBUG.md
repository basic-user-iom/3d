# Shader Panel Debug Guide

## Issues Fixed

### 1. ✅ Shader Coordinate Calculation
**Problem**: Using `vUv` (normalized UV) but calculating aspect ratio from `iResolution`
**Fix**: Changed to use `gl_FragCoord.xy` for pixel coordinates
```glsl
// Before
vec2 uv = vUv;

// After  
vec2 fragCoord = gl_FragCoord.xy;
vec2 uv = fragCoord / iResolution.xy;
```

### 2. ✅ Uniform Update Mechanism
**Added**:
- `uniformsNeedUpdate = true` flag
- `needsUpdate = true` flag
- Debug logging in development mode

### 3. ✅ Error Handling
**Added**:
- Try-catch around scene initialization
- Render error handling
- Console logging for debugging

---

## How to Debug

### 1. Open Browser Console
Press `F12` and check the Console tab

### 2. Look for These Messages

**Success Messages:**
- `[ShaderPanel] Scene initialized successfully`
- `[ShaderPanel] Uniforms updated: {...}`

**Error Messages:**
- `[ShaderPanel] Canvas not found`
- `[ShaderPanel] Failed to initialize scene: ...`
- `[ShaderPanel] Render error: ...`

### 3. Check Uniform Values

In browser console, you can check:
```javascript
// Find the shader panel component
const canvas = document.querySelector('.shader-editor-canvas')
// Check if it exists and has WebGL context
const gl = canvas?.getContext('webgl') || canvas?.getContext('webgl2')
console.log('WebGL context:', gl)
```

### 4. Verify Sliders Work

1. Open Shader Editor panel
2. Open browser console (F12)
3. Drag a slider
4. Look for: `[ShaderPanel] Uniforms updated: {...}`
5. If you see this message, uniforms ARE updating

---

## Common Issues

### Issue: Panel Opens But Preview is Black

**Possible Causes:**
1. Shader compilation error
2. WebGL context not created
3. Scene not initializing

**Debug Steps:**
1. Check browser console for errors
2. Look for WebGL errors
3. Verify canvas has WebGL context

### Issue: Sliders Don't Update Preview

**Possible Causes:**
1. Uniforms not updating
2. Material not re-rendering
3. Render loop stopped

**Debug Steps:**
1. Check console for `[ShaderPanel] Uniforms updated` messages
2. Verify `uniformsRef.current` is not null
3. Check if render loop is running

### Issue: Preview Shows But No Animation

**Possible Causes:**
1. `iTime` uniform not updating
2. Render loop stopped
3. Animation speed is 0

**Debug Steps:**
1. Check if `iTime.value` is increasing (should change every frame)
2. Verify render loop is running
3. Check Speed slider value (should be > 0)

---

## Manual Test Checklist

- [ ] Panel opens when clicking "Shader Editor" button
- [ ] Preview canvas shows (not black)
- [ ] Animation is visible (rotating pattern)
- [ ] Speed slider changes animation speed
- [ ] Intensity slider changes brightness
- [ ] Color sliders change glow color
- [ ] Rotation slider changes rotation speed
- [ ] Glow slider changes glow amount
- [ ] Vignette slider changes edge darkening
- [ ] Console shows no errors

---

## Quick Fixes

### If Preview is Black:
1. Check browser console for WebGL errors
2. Try refreshing the page
3. Check if WebGL is supported: `!!document.createElement('canvas').getContext('webgl')`

### If Sliders Don't Work:
1. Check console for `[ShaderPanel] Uniforms updated` messages
2. Verify panel is actually open (`showShaderEditorPanel === true`)
3. Check if material exists: `materialRef.current !== null`

### If Nothing Happens:
1. Check if dev server is running: `http://localhost:3000`
2. Check browser console for any errors
3. Try hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

---

**Last Updated**: $(date)
**Status**: ✅ Code fixed, ready for testing with debug logging



