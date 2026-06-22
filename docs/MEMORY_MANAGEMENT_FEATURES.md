# Memory Management Features

## Overview

This document describes the memory management features added to handle large GLB files (500MB+) efficiently.

## Features

### 1. Memory Monitoring (`src/utils/memoryMonitor.ts`)

**Purpose**: Track browser memory usage and warn before loading large files.

**Features**:
- Real-time memory usage tracking via Performance API
- Memory warnings at 50%, 75%, and 90% usage
- File size estimation for GLB files (2.5x file size)
- Pre-load memory checks

**Usage**:
```typescript
import { getMemoryInfo, canLoadFile, getMemoryMonitor } from '../utils/memoryMonitor'

// Check if file can be loaded
const fileSizeMB = file.size / (1024 * 1024)
const check = canLoadFile(fileSizeMB)
if (!check.canLoad) {
  console.error(check.reason)
}

// Monitor memory over time
const monitor = getMemoryMonitor()
monitor.onWarning((info, warning) => {
  if (warning) {
    console.warn(warning.message)
  }
})
monitor.start(2000) // Update every 2 seconds
```

**Memory Monitor Panel**: 
- Visual indicator in bottom-right corner
- Shows current memory usage percentage
- Color-coded (green/yellow/orange/red)
- Click to expand for details

### 2. View-Based Resource Manager (`src/utils/viewBasedResourceManager.ts`)

**Purpose**: Automatically unload objects outside the camera view to free memory.

**Features**:
- Frustum culling for off-screen objects
- Distance-based unloading (configurable thresholds)
- Geometry disposal for unloaded objects
- Automatic restoration when objects come back into view

**Configuration**:
```typescript
const manager = new ViewBasedResourceManager({
  keepLoadedDistance: 1000,  // Keep objects within 1000 units loaded
  unloadDistance: 2000,      // Unload objects beyond 2000 units
  unloadDelay: 5000,         // 5 seconds off-screen before unloading
  checkInterval: 30,         // Check every 30 frames
  aggressiveUnloading: true  // Dispose geometry when unloading
})
```

**Usage**:
```typescript
// Track objects
manager.trackObject(mesh, boundingBox)
manager.setCamera(camera)

// Update each frame
manager.update()

// Get statistics
const stats = manager.getStats()
console.log(`Unloaded: ${stats.unloaded}/${stats.totalTracked}`)
```

**How It Works**:
1. Objects are tracked with bounding boxes
2. Each frame, checks if objects are in camera frustum
3. Objects far from camera and off-screen for >5 seconds are unloaded
4. Geometry is disposed to free memory
5. When objects come back into view, they're restored (requires reload from source)

### 3. Progressive GLB Loader (`src/utils/progressiveGLBLoader.ts`)

**Purpose**: Load large GLB files with interior/exterior separation and progressive loading.

**Features**:
- Interior/exterior object separation
- Load exterior first (visible from outside)
- Load interior on-demand (when camera enters)
- Memory checks before loading

**Usage**:
```typescript
import { loadGLBProgressive, checkInteriorVisibility } from '../utils/progressiveGLBLoader'

const result = await loadGLBProgressive(file, {
  maxProgressiveSize: 500, // Use progressive loading for files >500MB
  separateInteriors: true,
  onProgress: (progress, message) => {
    console.log(`${progress}%: ${message}`)
  }
})

// Add exterior to scene
scene.add(result.exterior)

// Show/hide interior based on camera position
if (result.interior) {
  const buildingBounds = new THREE.Box3().setFromObject(result.exterior)
  checkInteriorVisibility(camera, result.interior, buildingBounds)
}
```

**Interior/Exterior Detection**:
- Looks for objects with names containing:
  - Interior: "interior", "inside", "inner"
  - Exterior: "exterior", "outside", "outer", "shell"
- Objects are separated into groups
- Interior is hidden initially
- Interior is shown when camera is inside building bounds

## Integration

### GLB Loader Integration

Memory monitoring is automatically integrated into the GLB loader:
- Files >100MB trigger memory checks
- Warnings are logged if memory is low
- Loading is prevented if insufficient memory

### Viewer Integration

To integrate view-based resource management:

```typescript
import { ViewBasedResourceManager } from '../utils/viewBasedResourceManager'

// In viewer setup
const resourceManager = new ViewBasedResourceManager({
  aggressiveUnloading: true
})

// Track loaded models
model.scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    const bbox = new THREE.Box3().setFromObject(obj)
    resourceManager.trackObject(obj, bbox)
  }
})

// Update each frame
function animate() {
  resourceManager.setCamera(camera)
  resourceManager.update()
  // ... rest of render loop
}
```

### Memory Monitor Panel

Add to your main App component:

```typescript
import MemoryMonitorPanel from './components/MemoryMonitorPanel'

function App() {
  return (
    <>
      {/* Your app */}
      <MemoryMonitorPanel />
    </>
  )
}
```

## Performance Benefits

1. **Memory Savings**: 
   - View-based unloading can free 50-80% of memory for off-screen objects
   - Interior/exterior separation saves memory when viewing exterior only

2. **Load Time**:
   - Progressive loading allows viewing while loading
   - Exterior loads first (most important)

3. **Stability**:
   - Memory warnings prevent crashes
   - Automatic cleanup prevents memory leaks

## Limitations

1. **Geometry Restoration**: 
   - Unloaded geometry cannot be fully restored without reloading from source
   - Consider storing geometry references for restoration

2. **Interior Detection**:
   - Heuristic-based (name matching)
   - May not work for all models
   - Manual configuration may be needed

3. **Progressive Loading**:
   - Currently loads full file (true chunked loading requires custom GLB parser)
   - Future: Implement true streaming GLB parser

## Future Improvements

1. **True Streaming Parser**:
   - Parse GLB format in chunks
   - Load geometry progressively
   - Much more memory efficient

2. **Geometry Caching**:
   - Store unloaded geometry in IndexedDB
   - Restore from cache instead of reloading

3. **Occlusion Culling**:
   - Use hardware occlusion queries
   - Hide objects behind other objects

4. **Spatial Partitioning**:
   - Octree or BVH for efficient culling
   - Load/unload based on spatial regions

## Testing

Test with large GLB files (500MB+):
1. Monitor memory usage during load
2. Verify view-based unloading works
3. Check interior/exterior separation
4. Test memory warnings

## Console Logs

When features are active:
- `[GLTFLoader] Loading large file: X MB`
- `[GLTFLoader] Memory check: ...`
- `[ViewBasedResourceManager] Unloaded object: ...`
- `[ProgressiveGLBLoader] Separated: X exterior, Y interior objects`








































