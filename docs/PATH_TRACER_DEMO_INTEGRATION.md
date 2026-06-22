# Path Tracer Demo Integration Guide

This guide explains how to integrate the Path Tracer Demo into your 3D viewer software.

## Overview

The Path Tracer Demo is packaged as a reusable module (`PathTracerDemo`) that can be easily integrated into any Three.js-based viewer. It provides:

- Progressive path tracing rendering
- Interactive controls
- Environment lighting
- Material support (MeshStandardMaterial and MeshPhysicalMaterial)
- Download rendered images

## Files

- `src/viewer/pathTracer/PathTracerDemo.ts` - Core module
- `src/components/PathTracerDemoPanel.tsx` - React component wrapper
- `src/components/PathTracerDemoPanel.css` - Styles

## Basic Integration

### 1. Import the Module

```typescript
import { PathTracerDemo } from './viewer/pathTracer/PathTracerDemo'
```

### 2. Create Path Tracer Instance

```typescript
const config = {
  renderer: yourRenderer,      // THREE.WebGLRenderer
  camera: yourCamera,          // THREE.PerspectiveCamera
  scene: yourScene,            // THREE.Scene
  controls: yourControls,      // OrbitControls (optional)
  resolutionScale: 1,          // 0.1 - 1.0
  tiles: 3,                    // 1 - 6
  minSamples: 3,              // Minimum samples
}

const callbacks = {
  onProgress: (message) => console.log(message),
  onError: (error) => console.error(error),
  onReady: () => console.log('Ready!'),
}

const pathTracer = new PathTracerDemo(config, callbacks)
```

### 3. Initialize and Start

```typescript
// Initialize (generates BVH)
await pathTracer.initialize()

// Start rendering
pathTracer.start()
```

### 4. Control the Path Tracer

```typescript
// Enable/disable
pathTracer.setEnabled(true)

// Pause/resume
pathTracer.setPaused(false)

// Reset accumulation
pathTracer.reset()

// Update when scene changes
pathTracer.updateCamera()      // When camera moves
pathTracer.updateMaterials()   // When materials change
pathTracer.updateLights()      // When lights change
pathTracer.updateEnvironment() // When environment changes

// Download image
pathTracer.downloadImage('my-render.png')

// Get sample count
const samples = pathTracer.getSampleCount()
```

### 5. Cleanup

```typescript
// Stop and dispose
pathTracer.stop()
pathTracer.dispose()
```

## React Component Integration

### Using the Pre-built Component

```tsx
import PathTracerDemoPanel from './components/PathTracerDemoPanel'

function MyViewer() {
  const [viewer, setViewer] = useState(null)
  const [showPathTracer, setShowPathTracer] = useState(false)

  return (
    <div>
      <button onClick={() => setShowPathTracer(!showPathTracer)}>
        Toggle Path Tracer
      </button>
      
      {showPathTracer && viewer && (
        <PathTracerDemoPanel
          viewer={viewer}
          onClose={() => setShowPathTracer(false)}
        />
      )}
    </div>
  )
}
```

### Custom Integration

```tsx
import { useEffect, useRef } from 'react'
import { PathTracerDemo } from './viewer/pathTracer/PathTracerDemo'

function MyPathTracer({ viewer }) {
  const pathTracerRef = useRef(null)

  useEffect(() => {
    if (!viewer) return

    const pathTracer = new PathTracerDemo({
      renderer: viewer.renderer,
      camera: viewer.camera,
      scene: viewer.scene,
      controls: viewer.controls,
    }, {
      onReady: () => console.log('Path tracer ready'),
    })

    pathTracerRef.current = pathTracer

    pathTracer.initialize().then(() => {
      pathTracer.start()
    })

    return () => {
      pathTracer.stop()
      pathTracer.dispose()
    }
  }, [viewer])

  return null // Or render UI controls
}
```

## Integration with Existing Viewer

### Example: Adding to ViewerCanvas

```tsx
// In your ViewerCanvas component
import { useState } from 'react'
import PathTracerDemoPanel from '../components/PathTracerDemoPanel'

export default function ViewerCanvas() {
  const [viewer, setViewer] = useState(null)
  const [showPathTracer, setShowPathTracer] = useState(false)

  // ... your existing viewer setup ...

  return (
    <div>
      {/* Your existing viewer UI */}
      
      {/* Add toggle button */}
      <button onClick={() => setShowPathTracer(!showPathTracer)}>
        Path Tracer
      </button>

      {/* Path tracer panel */}
      {showPathTracer && viewer && (
        <PathTracerDemoPanel
          viewer={viewer}
          onClose={() => setShowPathTracer(false)}
        />
      )}
    </div>
  )
}
```

## Advanced Usage

### Custom Scene Setup

```typescript
import { createTestScene } from './viewer/pathTracer/PathTracerDemo'

// Create test scene with objects
const { scene, objects, floor } = createTestScene()

// Use your own scene or modify the test scene
// Add your models to the scene
```

### Handling Camera Changes

```typescript
// In your camera controls update handler
controls.addEventListener('change', () => {
  if (pathTracer) {
    pathTracer.updateCamera()
  }
})
```

### Handling Scene Updates

```typescript
// When you add/remove objects
scene.add(newObject)
pathTracer.updateMaterials()

// When you change materials
material.roughness = 0.5
pathTracer.updateMaterials()

// When you change lights
scene.add(newLight)
pathTracer.updateLights()

// When you change environment
scene.environment = newEnvMap
pathTracer.updateEnvironment()
```

### Performance Tuning

```typescript
// Lower resolution for faster rendering
pathTracer.setResolutionScale(0.5) // 50% resolution

// Adjust tiles for performance
pathTracer.setTiles(2) // Fewer tiles = faster but less parallel

// Reset when changing settings
pathTracer.setResolutionScale(0.8)
pathTracer.reset() // Restart accumulation
```

## Requirements

- Three.js (^0.162.0)
- three-gpu-pathtracer (^0.0.22)
- three-mesh-bvh (^0.7.4)
- WebGL 2.0 support

## Limitations

- Only supports MeshStandardMaterial and MeshPhysicalMaterial
- Requires WebGL 2.0
- All textures must use the same wrap and interpolation flags
- Instanced geometry not supported
- Interleaved buffers not supported

## Troubleshooting

### Objects not showing

- Ensure objects use MeshStandardMaterial or MeshPhysicalMaterial
- Check camera position and target
- Verify objects are in the scene
- Call `updateMaterials()` after adding objects

### Performance issues

- Reduce `resolutionScale` (e.g., 0.5)
- Reduce `tiles` (e.g., 2)
- Pause when not needed: `setPaused(true)`

### Black screen

- Check WebGL 2.0 support
- Verify renderer is initialized
- Ensure scene has objects and lights
- Check browser console for errors

## Example: Complete Integration

```typescript
import { PathTracerDemo } from './viewer/pathTracer/PathTracerDemo'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Setup Three.js scene
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
camera.position.set(5, 5, 10)
controls.update()

// Add objects to scene
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 })
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

const light = new THREE.DirectionalLight(0xffffff, 1)
light.position.set(5, 10, 5)
scene.add(light)

// Create and start path tracer
const pathTracer = new PathTracerDemo({
  renderer,
  camera,
  scene,
  controls,
}, {
  onReady: () => console.log('Path tracer ready!'),
})

await pathTracer.initialize()
pathTracer.start()

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  pathTracer.updateCamera()
})
```

## API Reference

See `src/viewer/pathTracer/PathTracerDemo.ts` for complete API documentation.

















