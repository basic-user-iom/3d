# Integration Guide for New Utilities

This guide shows how to integrate the new utilities into the existing codebase.

## 1. MaterialUpdateQueue Integration

### Before (Direct Material Updates - Causes Race Conditions):
```typescript
// ❌ Direct update - can conflict with other systems
material.envMap = envMap
material.envMapIntensity = intensity
material.needsUpdate = true
```

### After (Using MaterialUpdateQueue):
```typescript
import { materialUpdateQueue } from './utils/MaterialUpdateQueue'

// ✅ Queued update - prevents race conditions
materialUpdateQueue.enqueue(material, () => {
  material.envMap = envMap
  material.envMapIntensity = intensity
})
// needsUpdate is set automatically
```

### Example: Update HDRSystem.ts
```typescript
// In HDRSystem.ts, replace direct material updates:
import { materialUpdateQueue } from '../utils/MaterialUpdateQueue'

// Instead of:
// material.envMap = envMap
// material.envMapIntensity = intensity

// Use:
materialUpdateQueue.enqueue(material, () => {
  material.envMap = envMap
  material.envMapIntensity = intensity
})
```

## 2. ResourceTracker Integration

### In ViewerCanvas.tsx cleanup:
```typescript
import { ResourceTracker } from './utils/ResourceTracker'

useEffect(() => {
  const tracker = new ResourceTracker()
  
  // Track resources as they're created
  tracker.trackTexture(texture)
  tracker.trackGeometry(geometry)
  tracker.trackMaterial(material)
  tracker.trackRenderTarget(renderTarget)
  
  // Track event listeners
  tracker.trackEventListener(window, 'resize', handleResize)
  
  return () => {
    // Single cleanup call disposes everything
    tracker.dispose()
    
    // Additional cleanup if needed
    if (controls) controls.dispose()
    if (renderer) renderer.dispose()
  }
}, [])
```

## 3. UnifiedAnimationLoop Integration

### Replace ViewerCanvas animation loop:
```typescript
import { useUnifiedAnimationLoop } from './hooks/useUnifiedAnimationLoop'

// In ViewerCanvas component:
useUnifiedAnimationLoop((delta, time) => {
  // Render scene
  if (viewerRef.current?.postProcessingSystem && postProcessingEnabled) {
    viewerRef.current.postProcessingSystem.render()
  } else {
    renderer.render(scene, camera)
  }
  
  // Update controls
  controls.update()
  
  // Update other systems
  // ... existing update code
}, [postProcessingEnabled, scene, camera, renderer, controls])
```

### Replace App.tsx navigation loop:
```typescript
import { useUnifiedAnimationLoop } from '../viewer/hooks/useUnifiedAnimationLoop'

// In App component:
useUnifiedAnimationLoop((delta) => {
  if (!viewer?.controls || !viewer?.camera || !viewer?.renderer) return
  
  const controls: any = viewer.controls
  const camera: any = viewer.camera
  const element = viewer.renderer.domElement
  
  const shift = pressedKeysRef.current.has('shift')
  const pixelSpeed = (shift ? 220 : 140) * delta
  const rotSpeed = (shift ? 1.6 : 1.0) * delta
  
  // Navigation logic
  if (pressedKeysRef.current.has('w')) {
    panByPixels(0, -pixelSpeed)
  }
  // ... other key handlers
}, [viewer, selectedObject])
```

## 4. MaterialUpdateBatcher Integration

### For frequent material updates:
```typescript
import { materialUpdateBatcher } from './utils/MaterialUpdateBatcher'

// Instead of updating multiple times:
// material.color.setHex(0xff0000)
// material.metalness = 0.5
// material.roughness = 0.3
// material.needsUpdate = true

// Use batcher:
materialUpdateBatcher.queueUpdates(material, {
  color: new THREE.Color(0xff0000),
  metalness: 0.5,
  roughness: 0.3
})
// Updates are batched and applied together
```

## 5. Complete Example: Updating useViewer.ts Material Enhancement

### Before:
```typescript
// Direct updates - can conflict
mat.envMap = currentEnvMap
mat.envMapIntensity = hdrIntensity
mat.needsUpdate = true
```

### After:
```typescript
import { materialUpdateQueue } from '../utils/MaterialUpdateQueue'

// Queued updates - prevents conflicts
materialUpdateQueue.enqueue(mat, () => {
  mat.envMap = currentEnvMap
  mat.envMapIntensity = hdrIntensity
})
```

## Migration Checklist

- [ ] Replace all direct material updates with MaterialUpdateQueue
- [ ] Add ResourceTracker to all cleanup functions
- [ ] Replace animation loops with useUnifiedAnimationLoop
- [ ] Use MaterialUpdateBatcher for frequent updates
- [ ] Test each change incrementally
- [ ] Verify no memory leaks with ResourceTracker
- [ ] Check performance improvements

## Testing

After integration, verify:
1. No race conditions in material updates
2. Proper cleanup of all resources
3. Single animation loop running
4. No performance degradation
5. All features still work correctly


























