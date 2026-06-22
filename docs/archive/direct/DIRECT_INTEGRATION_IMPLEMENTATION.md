# Direct Streets GL Integration - Implementation Guide

## Why Direct Integration Instead of Iframe?

**You're absolutely right!** The iframe approach was causing WebGL rendering issues. Direct integration solves:

1. ✅ **No WebGL Context Issues**: Direct canvas access, no iframe isolation
2. ✅ **Better Performance**: No postMessage overhead
3. ✅ **Easier Debugging**: Single console, single DevTools
4. ✅ **Shared State**: Direct access to Streets GL state
5. ✅ **No CORS Issues**: Everything in same origin

## Changes Made

### 1. Modified Streets GL to Accept Canvas/UI Parameters

**Files Modified:**
- `streets-gl-alt/src/app/App.ts` - Now accepts optional canvas/UI in constructor
- `streets-gl-alt/src/app/SystemManager.ts` - Stores canvas/UI for systems to access
- `streets-gl-alt/src/app/systems/RenderSystem.ts` - Uses provided canvas
- `streets-gl-alt/src/app/systems/PickingSystem.ts` - Uses provided canvas
- `streets-gl-alt/src/app/systems/CursorStyleSystem.ts` - Uses provided canvas
- `streets-gl-alt/src/app/systems/ControlsSystem.ts` - Uses provided canvas
- `streets-gl-alt/src/app/ui/UI.tsx` - Uses provided UI element

### 2. Created Direct Integration Component

**File Created:**
- `src/components/StreetsGLDirect.tsx` - React component for direct integration

## How to Use

### Option 1: Import Streets GL Directly (Requires Build Configuration)

```typescript
// In src/components/StreetsGLDirect.tsx
import { App as StreetsGLApp } from '../../streets-gl-alt/src/app/App'

const app = new StreetsGLApp(canvasRef.current, uiRef.current)
```

**Requirements:**
- Configure Vite to handle TypeScript imports from `streets-gl-alt`
- Add `streets-gl-alt` to TypeScript path mappings
- Ensure all Streets GL dependencies are available

### Option 2: Build Streets GL as Library

Modify `streets-gl-alt/webpack.config.js` to:
1. Export Streets GL as a library
2. Build it as a UMD or ES module
3. Import the built bundle in main app

### Option 3: Use Dynamic Import (Current Implementation)

The `StreetsGLDirect.tsx` component tries to dynamically import Streets GL:

```typescript
const StreetsGLModule = await import('../../streets-gl-alt/src/app/App')
const { App: StreetsGLApp } = StreetsGLModule
const app = new StreetsGLApp(canvas, ui)
```

## Next Steps

1. **Configure Vite/TypeScript** to resolve `streets-gl-alt` imports:
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "paths": {
         "streets-gl-alt/*": ["../streets-gl-alt/src/*"]
       }
     }
   }
   ```

2. **Update App.tsx** to use `StreetsGLDirect` instead of iframe:
   ```tsx
   import StreetsGLDirect from './components/StreetsGLDirect'
   
   // Replace iframe with:
   {streetsGLIframeOverlay && <StreetsGLDirect />}
   ```

3. **Test Direct Integration**:
   - Buildings should render immediately (no iframe issues)
   - WebGL context should work properly
   - Debugging should be easier

## Benefits Over Iframe

| Feature | Iframe | Direct Integration |
|---------|--------|-------------------|
| WebGL Context | ❌ Isolated, rendering issues | ✅ Direct access |
| Performance | ⚠️ postMessage overhead | ✅ Direct calls |
| Debugging | ❌ Separate console | ✅ Single console |
| State Access | ❌ postMessage only | ✅ Direct access |
| CORS | ⚠️ Cross-origin issues | ✅ Same origin |

## Migration Path

1. Keep iframe as fallback
2. Add direct integration as option
3. Test both approaches
4. Remove iframe once direct integration is stable






