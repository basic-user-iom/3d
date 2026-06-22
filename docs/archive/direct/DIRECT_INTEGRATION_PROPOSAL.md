# Direct Streets GL Integration - Proposal

## Why Iframe Was Used (Current Approach)

The iframe approach was chosen for:
1. **Isolation**: Keep Streets GL separate from main app
2. **Dependency Conflicts**: Avoid React/Three.js version conflicts
3. **WebGL Context**: Separate WebGL contexts for each app
4. **Code Separation**: Keep codebases independent

## Why Direct Integration is Better

1. **No WebGL Context Issues**: Direct access to canvas, no iframe rendering problems
2. **Better Performance**: No postMessage overhead
3. **Easier Debugging**: Single console, single DevTools
4. **Shared State**: Direct access to Streets GL state
5. **No CORS Issues**: Everything in same origin

## Implementation Approach

### Option 1: Modify Streets GL to Accept Canvas Parameter (Recommended)

Modify Streets GL's `RenderSystem` and other systems to accept canvas/UI elements:

```typescript
// streets-gl-alt/src/app/App.ts
class App {
  private canvasElement?: HTMLCanvasElement
  private uiElement?: HTMLElement

  public constructor(canvas?: HTMLCanvasElement, ui?: HTMLElement) {
    this.canvasElement = canvas
    this.uiElement = ui
    this.init()
  }

  // In RenderSystem.ts
  public postInit(): void {
    const canvas = this.canvasElement || 
      <HTMLCanvasElement>document.getElementById('canvas')
    // ... rest of initialization
  }
}
```

### Option 2: Create Wrapper Component

Create a React component that:
1. Creates canvas and UI divs
2. Sets IDs that Streets GL expects
3. Loads Streets GL bundle
4. Streets GL auto-initializes when it finds the elements

### Option 3: Export Streets GL as Module

Modify Streets GL's webpack config to:
1. Export as a library
2. Make it importable: `import StreetsGL from 'streets-gl-alt'`
3. Initialize with: `StreetsGL.init(canvas, ui)`

## Recommended Solution

**Modify Streets GL to accept optional canvas/UI parameters**, then:

```typescript
// In main app
import StreetsGLApp from '../../streets-gl-alt/src/app/App'

function StreetsGLDirect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const uiRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (canvasRef.current && uiRef.current) {
      // Initialize Streets GL with our canvas
      new StreetsGLApp(canvasRef.current, uiRef.current)
    }
  }, [])

  return (
    <>
      <div ref={uiRef} id="ui" />
      <canvas ref={canvasRef} id="canvas" />
    </>
  )
}
```

## Benefits

1. ✅ **No iframe rendering issues**
2. ✅ **Direct WebGL context access**
3. ✅ **Better debugging**
4. ✅ **Shared React context**
5. ✅ **No postMessage overhead**

## Next Steps

1. Modify `streets-gl-alt/src/app/App.ts` to accept canvas/UI parameters
2. Modify `streets-gl-alt/src/app/systems/RenderSystem.ts` to use provided canvas
3. Modify `streets-gl-alt/src/app/ui/UI.tsx` to use provided UI element
4. Create `StreetsGLDirect.tsx` component in main app
5. Replace iframe with direct component in `App.tsx`






