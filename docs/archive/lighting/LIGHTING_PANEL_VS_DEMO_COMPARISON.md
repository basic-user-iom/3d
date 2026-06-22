# Lighting Panel vs Demo Light Comparison

## Issue
Lights created through the lighting panel don't work, but demo lights work correctly.

## Differences Found

### Demo Light (Works)
```typescript
// Direct creation and scene addition
const light = new THREE.DirectionalLight(0xffffff, 1.5)
light.position.set(10, 20, 10)
light.castShadow = true
// ... shadow config ...
scene.add(light)  // Direct addition
```

**Key characteristics:**
- Created directly with `new THREE.DirectionalLight()`
- Added directly to scene with `scene.add(light)`
- `intensity: 1.5` (higher default)
- `visible: true` (default)
- No dependency on store or config

### Lighting Panel Light (Doesn't Work)
```typescript
// Goes through store -> ViewerCanvas useEffect -> createLight()
addDirectionalLight({
  enabled: true,
  intensity: 1.0,
  // ... other config
})
// Then: createLight(config, scene) -> scene.add(light)
```

**Key characteristics:**
- Created through `createLight()` function
- Goes through store state management
- `intensity: 1.0` (lower default)
- `visible` set based on `config.enabled`
- May be affected by other systems (CSM, HDR, etc.)

## Fixes Applied

### 1. Ensure Light Visibility on Creation
**File:** `src/viewer/ViewerCanvas.tsx` (line ~6024)

Added explicit visibility and intensity checks when lights are created:
```typescript
// CRITICAL: Ensure light is visible and enabled immediately after creation
if (config.enabled !== false) {
  light.visible = true
  if (light.intensity === 0) {
    light.intensity = config.intensity ?? 1.0
  }
} else {
  light.visible = false
  light.intensity = 0
}
```

### 2. Ensure Light Visibility on Update
**File:** `src/viewer/ViewerCanvas.tsx` (line ~6305)

Improved visibility/intensity logic when lights are updated:
```typescript
// CRITICAL: Set visibility and intensity based on enabled state
if (config.enabled !== false) {
  light.visible = true
  // Ensure intensity is set if it was 0
  if (light.intensity === 0 && config.intensity !== undefined) {
    light.intensity = config.intensity
  } else if (light.intensity === 0) {
    light.intensity = 1.0 // Default intensity if not specified
  }
} else {
  light.visible = false
  light.intensity = 0
}
```

### 3. Set Default Visibility in createLight
**File:** `src/viewer/ViewerCanvas.tsx` (line ~221)

Added visibility check in `createLight()` for directional lights:
```typescript
// CRITICAL: Ensure light is visible and has proper intensity by default
dirLight.visible = config.enabled !== false // Default to true if not specified
if (config.enabled === false) {
  dirLight.intensity = 0
}
```

### 4. Added Logging
Added console logging when lights are created to help debug issues:
```typescript
console.log(`[ViewerCanvas] Created ${config.type || 'directional'} light "${config.name || config.id}":`, {
  visible: light.visible,
  intensity: light.intensity,
  position: light.position,
  enabled: config.enabled
})
```

## Potential Issues to Check

1. **CSM/Dynamic Sky**: If Dynamic Sky is enabled, all standard lights are disabled. Check if this is the case.
2. **Light Helpers**: Lights might be created but helpers might be hidden. Check `showLightHelpers` setting.
3. **HDR**: HDR doesn't disable lights, but check if there's any interaction.
4. **Light Position**: Demo light is at `(10, 20, 10)`, panel lights default to `(5, 5, 5)`. Check if position affects visibility.

## Testing

1. Create a light through the lighting panel
2. Check console for creation log
3. Verify `light.visible === true` and `light.intensity > 0`
4. Check if light is in the scene: `scene.children.filter(obj => obj instanceof THREE.DirectionalLight)`
5. Compare with demo light behavior






