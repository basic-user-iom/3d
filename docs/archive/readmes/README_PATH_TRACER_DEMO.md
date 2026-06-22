# Path Tracer Demo - Integration Package

A clean, reusable path tracer implementation based on `three-gpu-pathtracer` that can be easily integrated into your 3D viewer software.

## 📦 What's Included

- **Core Module** (`src/viewer/pathTracer/PathTracerDemo.ts`) - Standalone path tracer class
- **React Component** (`src/components/PathTracerDemoPanel.tsx`) - Ready-to-use UI panel
- **Documentation** (`docs/PATH_TRACER_DEMO_INTEGRATION.md`) - Complete integration guide
- **Examples** (`examples/path-tracer-integration-example.tsx`) - Integration examples

## 🚀 Quick Start

### Option 1: Use the React Component (Easiest)

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

### Option 2: Use the Module Directly

```typescript
import { PathTracerDemo } from './viewer/pathTracer/PathTracerDemo'

const pathTracer = new PathTracerDemo({
  renderer: yourRenderer,
  camera: yourCamera,
  scene: yourScene,
  controls: yourControls,
})

await pathTracer.initialize()
pathTracer.start()
```

## 📋 Requirements

- Three.js ^0.162.0
- three-gpu-pathtracer ^0.0.22
- three-mesh-bvh ^0.7.4
- WebGL 2.0 support

## ✨ Features

- ✅ Progressive path tracing rendering
- ✅ Interactive controls (start, stop, pause, reset)
- ✅ Sample count tracking
- ✅ Download rendered images
- ✅ Environment lighting support
- ✅ Material updates (MeshStandardMaterial, MeshPhysicalMaterial)
- ✅ Camera controls integration
- ✅ React component wrapper
- ✅ TypeScript support

## 📖 Documentation

See [docs/PATH_TRACER_DEMO_INTEGRATION.md](docs/PATH_TRACER_DEMO_INTEGRATION.md) for:
- Complete API reference
- Integration examples
- Advanced usage
- Troubleshooting

## 🎯 Files Structure

```
src/
├── viewer/
│   └── pathTracer/
│       ├── PathTracerDemo.ts      # Core module
│       └── index.ts               # Exports
├── components/
│   ├── PathTracerDemoPanel.tsx   # React component
│   └── PathTracerDemoPanel.css   # Styles
docs/
└── PATH_TRACER_DEMO_INTEGRATION.md
examples/
└── path-tracer-integration-example.tsx
```

## 🔧 Integration Steps

1. **Copy the files** to your project:
   - `src/viewer/pathTracer/PathTracerDemo.ts`
   - `src/components/PathTracerDemoPanel.tsx`
   - `src/components/PathTracerDemoPanel.css`

2. **Install dependencies** (if not already installed):
   ```bash
   npm install three-gpu-pathtracer three-mesh-bvh
   ```

3. **Import and use**:
   ```tsx
   import PathTracerDemoPanel from './components/PathTracerDemoPanel'
   ```

4. **Add to your viewer**:
   ```tsx
   <PathTracerDemoPanel viewer={viewer} />
   ```

## 💡 Usage Tips

- **Performance**: Lower `resolutionScale` (0.5-0.7) for faster rendering
- **Quality**: Higher sample counts = better quality but slower
- **Updates**: Call `updateCamera()`, `updateMaterials()`, etc. when scene changes
- **Controls**: Pause when not actively viewing to save resources

## 🐛 Troubleshooting

**Objects not showing?**
- Ensure materials are MeshStandardMaterial or MeshPhysicalMaterial
- Check camera position and target
- Call `updateMaterials()` after adding objects

**Performance issues?**
- Reduce `resolutionScale` to 0.5
- Reduce `tiles` to 2
- Pause when not needed

**Black screen?**
- Check WebGL 2.0 support
- Verify renderer is initialized
- Check browser console for errors

## 📝 License

Same as your project license.

## 🙏 Credits

Based on [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer) by gkjohnson.

















