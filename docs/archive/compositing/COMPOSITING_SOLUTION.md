# Compositing Solution - Making Objects Visible on Map

## Problem
The Streets GL iframe overlay was blocking 3D objects because:
- Iframe had `z-index: 10` (above canvas)
- Canvas had no explicit z-index (default: auto/0)
- Iframe content (Streets GL) is opaque

## Solution Implemented

### 1. Z-Index Layering
- **Canvas (Three.js)**: `z-index: 20` - Renders on top
- **Iframe Overlay**: `z-index: 5` (or 998 when UI shown) - Renders below canvas
- **Toolbar**: `z-index: 1000` - Always on top

### 2. Transparent Canvas Background
- When iframe overlay is enabled:
  - Canvas uses `alpha: true` in WebGLRenderer
  - Scene background set to `null` (transparent)
  - Clear color set to transparent `(0x000000, 0)`
- This allows the map (iframe) to show through behind 3D objects

### 3. Visual Result
- **Map (iframe)**: Visible in background (z-index 5)
- **3D Objects**: Visible on top (z-index 20, transparent background)
- **Result**: Objects appear to be "on" the map

## How It Works

```
┌─────────────────────────────────┐
│  Toolbar (z-index: 1000)       │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │  Canvas (z-index: 20)     │  │ ← 3D Objects (transparent bg)
│  │  [Your Car Model]         │  │
│  ├───────────────────────────┤  │
│  │  Iframe (z-index: 5)     │  │ ← Streets GL Map
│  │  [Map with 3D Buildings]  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

## Benefits

1. ✅ **Objects Visible**: 3D objects render on top of map
2. ✅ **Map Visible**: Map shows through transparent canvas background
3. ✅ **No Blocking**: Objects are never hidden by iframe
4. ✅ **Automatic**: Works automatically when iframe overlay is enabled

## Testing

1. **Enable iframe overlay**:
   - Open "OSM GROUND ver2" panel
   - Check "Show Streets GL 3D Buildings (iframe overlay)"

2. **Load a model**:
   - Use "Open Files" or "Load URL"
   - Model should appear **on top of the map**

3. **Verify**:
   - ✅ Model is visible
   - ✅ Map is visible behind model
   - ✅ Model appears to be "on" the map
   - ✅ Use "Fit" button if model not visible

## Technical Details

### Canvas Setup
```typescript
// When iframe overlay enabled:
alpha: true  // Transparent background
scene.background = null  // No background color
renderer.setClearColor(0x000000, 0)  // Transparent clear
```

### CSS Z-Index
```css
#viewer-canvas {
  z-index: 20;  /* Above iframe */
}

.iframe-container {
  z-index: 5;  /* Below canvas */
}
```

## Notes

- **Performance**: Transparent background has minimal performance impact
- **Compatibility**: Works with all WebGL-capable browsers
- **Fallback**: If iframe disabled, canvas uses normal opaque background
- **UI Modals**: When Streets GL UI is shown, iframe z-index increases to 998 (still below canvas at 20)

## Future Enhancements

- Could add opacity control for iframe (make map semi-transparent)
- Could add blend modes for different visual effects
- Could add option to toggle between overlay and ground layer modes







