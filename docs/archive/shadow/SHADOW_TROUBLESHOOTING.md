# Shadow Troubleshooting Guide

## Quick Fix: Shadows Not Showing

If shadows are not showing, follow these steps:

### Step 1: Enable Shadow Plane
The shadow plane is **disabled by default**. You need to enable it:

1. **In the Toolbar**: Click the "📐 Plane" button (it should be highlighted/active when enabled)
2. **Or via Console**: 
   ```javascript
   useAppStore.getState().toggleShadowPlane()
   ```

### Step 2: Verify Shadows Are Enabled
Check that shadows are enabled in the store:
```javascript
useAppStore.getState().shadowsEnabled // Should be true
```

### Step 3: Check Light Configuration
Ensure you have a light that casts shadows:
- If using **Standard Shadows**: Check that a directional light has `castShadow = true`
- If using **CSM Shadows** (Dynamic Sky enabled): CSM lights should be active

### Step 4: Verify Object Configuration
Objects need:
- `castShadow = true` (to cast shadows)
- `receiveShadow = true` (to receive shadows)

### Step 5: Run Diagnostics
Open browser console and run:
```javascript
// Get viewer instance
const viewer = window.viewer || document.querySelector('canvas')?.__viewer

if (viewer) {
  const report = viewer.runShadowDiagnostics()
  console.log('Shadow Diagnostics:', report)
}
```

## Common Issues

### Issue 1: Shadow Plane Not Visible
**Symptom**: No shadows visible on ground
**Fix**: Enable shadow plane (see Step 1)

### Issue 2: Objects Not Casting Shadows
**Symptom**: Objects don't cast shadows on other objects
**Fix**: Ensure objects have `castShadow = true`

### Issue 3: Objects Not Receiving Shadows
**Symptom**: Shadows don't appear on objects
**Fix**: Ensure objects have `receiveShadow = true`

### Issue 4: CSM Shadows Not Working
**Symptom**: Shadows don't work when Dynamic Sky is enabled
**Fix**: 
1. Check that CSM is initialized: `viewer.csmShadowSystem?.isEnabled()`
2. Ensure shadow plane material is set up for CSM
3. Check console for CSM errors

### Issue 5: Standard Lights Disabled
**Symptom**: No lighting when CSM is active
**Fix**: This is expected - CSM lights provide lighting. If no lighting, check CSM initialization.

## Automatic Fix

Run this in the browser console to automatically fix common issues:

```javascript
// Auto-fix shadow issues
const { useAppStore } = require('./store/useAppStore')
const { autoFixShadowIssues } = require('./utils/shadowAutoFixer')

const viewer = window.viewer || document.querySelector('canvas')?.__viewer
if (viewer) {
  const result = autoFixShadowIssues(viewer.scene, viewer.renderer)
  console.log('Auto-fix result:', result)
  
  // Enable shadow plane if not already enabled
  if (!useAppStore.getState().showShadowPlane) {
    useAppStore.getState().toggleShadowPlane()
    console.log('✅ Shadow plane enabled')
  }
}
```

## Manual Configuration

### Enable Shadow Plane Programmatically
```javascript
useAppStore.getState().toggleShadowPlane() // Toggle
// OR
useAppStore.setState({ showShadowPlane: true }) // Set directly
```

### Enable Shadows on All Objects
```javascript
viewer.scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    obj.castShadow = true
    obj.receiveShadow = true
  }
})
```

### Check Current Shadow Status
```javascript
const store = useAppStore.getState()
console.log({
  shadowsEnabled: store.shadowsEnabled,
  showShadowPlane: store.showShadowPlane,
  shadowIntensity: store.shadowIntensity,
  csmActive: viewer.csmShadowSystem?.isEnabled()
})
```





