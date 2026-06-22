# Time of Day & North Offset - Light Source Analysis

## Overview
The **Time of Day** and **North Offset** controls affect multiple light sources in the scene, depending on which systems are active.

## Primary Light Source

### Three.js Directional Light (Sun Light)
**Identifier**: `userData.isSun = true`

**Location**: `src/viewer/ViewerCanvas.tsx:6788-6864`

**How it works**:
1. `timeOfDayToSkyAngles(timeOfDay, northOffset)` calculates sun position
2. The sun position is converted to a direction vector
3. This direction controls the **Three.js Directional Light** with `userData.isSun = true`

**Code**:
```typescript
// Calculate sun position from time of day and north offset
const { sunPosition } = timeOfDayToSkyAngles(timeOfDay, northOffset)

// Update Three.js sun light direction
directionalLights.forEach((light) => {
  if (light.userData.isSun && light instanceof THREE.DirectionalLight) {
    const sunLightPosition = sunPosition.clone().multiplyScalar(1000)
    light.position.copy(sunLightPosition)
    light.target.position.set(0, 0, 0) // Light points toward origin
  }
})
```

## Secondary Light Sources (Conditional)

### 1. Streets GL Sun Direction
**When Active**: When `streetsGLIframeOverlay` is enabled

**Location**: `src/viewer/ViewerCanvas.tsx:6793-6801`

**How it works**:
- Time of day and north offset are synced to Streets GL's sun direction
- Three.js sun light is **disabled** (visible = false, intensity = 0) to prevent duplicates
- Streets GL provides its own sun lighting

**Code**:
```typescript
if (streetsGLIframeOverlay && streetsGLBridge) {
  const sunDir = sunPosition.clone().normalize()
  streetsGLBridge.setSunDirection({
    x: sunDir.x,
    y: sunDir.y,
    z: sunDir.z
  })
  // Disable Three.js sun light
  light.visible = false
  light.intensity = 0
}
```

### 2. CSM Shadow System Lights
**When Active**: When `dynamicSkyEnabled` is true

**Location**: `src/viewer/ViewerCanvas.tsx:7089`

**How it works**:
- CSM (Cascaded Shadow Maps) uses the sun position for shadow direction
- CSM creates its own directional lights for shadows
- Three.js sun light is **disabled** when CSM is active

**Code**:
```typescript
if (dynamicSkyEnabled) {
  // Update CSM light direction from sun position
  viewerRef.current.csmShadowSystem.setLightDirection(sunPosition.clone().normalize())
  
  // Disable Three.js sun light (CSM provides lighting)
  light.visible = false
  light.intensity = 0
}
```

### 3. Three.js Sky Object (Visual Only)
**When Active**: When `dynamicSkyEnabled` is true

**Location**: `src/viewer/ViewerCanvas.tsx:7129-7170`

**How it works**:
- The sky shader uses sun position for atmospheric scattering
- This is **visual only** (doesn't provide lighting)
- The sky color changes based on sun elevation/azimuth

## Summary

### Light Source Hierarchy

1. **Primary**: Three.js Directional Light (`userData.isSun = true`)
   - **Always created** (default sun light)
   - **Controlled by**: Time of Day + North Offset
   - **Active when**: Streets GL is NOT active AND Dynamic Sky is NOT enabled

2. **Streets GL Sun** (if Streets GL overlay is active)
   - **Controlled by**: Time of Day + North Offset (synced)
   - **Three.js sun light**: Disabled

3. **CSM Lights** (if Dynamic Sky is enabled)
   - **Controlled by**: Time of Day + North Offset (via sun position)
   - **Three.js sun light**: Disabled

### Current Behavior

Based on your setup:
- **North Offset**: 20°
- **Time of Day**: Controlled by slider

**The object you're seeing** is likely:
- The **Three.js Directional Light** with `userData.isSun = true`
- OR the **CSM lights** if Dynamic Sky is enabled
- OR the **Streets GL sun** if Streets GL overlay is active

## How to Check Which Light is Active

1. **Check console logs** for:
   - `[CSMShadowSystem] Disabled X Three.js directional light(s)` - CSM is active
   - `[ExternalObjectBridge] Sun direction set` - Streets GL is active

2. **Check scene hierarchy**:
   - Look for "Directional Light" objects
   - Check if they have `userData.isSun = true`
   - Check if they're visible (enabled) or hidden (disabled)

3. **Check lighting panel**:
   - If "Streets GL Sun" controls are visible → Streets GL is active
   - If "Dynamic Sky" is enabled → CSM is active

## Recommendation

To avoid confusion and duplicate lights:
- **When Streets GL is active**: Only Streets GL sun should be active
- **When Dynamic Sky is enabled**: Only CSM lights should be active
- **Otherwise**: Only Three.js sun light should be active

The fixes we implemented ensure that only ONE light source is active at a time, preventing the "leftover lights" issue.


