# Streets GL Rendering Diagnosis

## Current Status

### ✅ What's Working:
1. **Streets GL Server**: Running on `http://localhost:8081`
2. **Iframe Loading**: Iframe loads successfully, UI is visible (search bar, FPS counter, controls)
3. **Tile Loading**: 890+ vector tile requests are being made and loaded successfully
4. **Textures Loading**: All Streets GL textures and resources are loading
5. **Bridge Communication**: PostMessage bridge is working
6. **URL Hash Format**: Correct format `lat,lon,pitch,yaw,distance` (fixed)
7. **Camera Settings**: Using 45° pitch, 2000m distance (tested and working)

### ❌ What's Not Working:
1. **Buildings Not Rendering**: Blue screen persists in iframe
2. **3D Scene Not Visible**: No map features visible despite tiles loading

## Root Cause Analysis

### Evidence:
1. **Direct Access Works**: When accessing `http://localhost:8081` directly, buildings render perfectly
2. **Iframe Context Issue**: Same URL in iframe shows blue screen
3. **Tiles Loading**: Network logs show tiles are being requested and loaded
4. **UI Visible**: Streets GL UI elements are visible, indicating the app is running

### Possible Causes:

#### 1. **Z-Index Layering Issue**
- Canvas is at `z-index: 20` (on top)
- Iframe is at `z-index: 5` (below)
- Canvas has `pointerEvents: 'none'` but might still be blocking rendering
- **Solution**: Ensure canvas doesn't interfere with iframe rendering

#### 2. **WebGL Context in Iframe**
- Iframe has `sandbox="allow-same-origin allow-scripts allow-popups allow-forms"`
- WebGL might need additional permissions or different setup in iframe context
- **Solution**: Check if WebGL context is being created properly in iframe

#### 3. **CSS Containment**
- Iframe has `contain: 'layout style'` which might interfere with rendering
- **Solution**: Remove or adjust CSS containment

#### 4. **Transparent Background**
- Iframe has `background: 'transparent'` which might cause rendering issues
- **Solution**: Try setting a solid background or removing transparency

#### 5. **Rendering Timing**
- Tiles load but rendering might be delayed
- **Solution**: Wait longer or force a render cycle

## Integration Architecture

```
┌─────────────────────────────────────┐
│  Main App (localhost:3000)          │
│  ┌───────────────────────────────┐  │
│  │  Canvas (z-index: 20)         │  │ ← Three.js objects
│  │  - Transparent background     │  │
│  │  - pointerEvents: 'none'      │  │
│  ├───────────────────────────────┤  │
│  │  Iframe (z-index: 5)          │  │ ← Streets GL
│  │  - http://localhost:8081      │  │
│  │  - WebGL rendering            │  │
│  │  - Tiles loading ✅           │  │
│  │  - Buildings not rendering ❌ │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Solutions to Try

### Solution 1: Remove CSS Containment
The `contain: 'layout style'` might be preventing proper rendering.

### Solution 2: Adjust Z-Index Strategy
Ensure canvas doesn't block iframe rendering even with `pointerEvents: 'none'`.

### Solution 3: Force Iframe Render
Add a mechanism to force Streets GL to render after tiles load.

### Solution 4: Check WebGL Context
Verify WebGL context is created in iframe (requires iframe DevTools).

### Solution 5: Remove Transparency
Try setting iframe background to solid color temporarily to test.

## Next Steps

1. Remove CSS containment from iframe
2. Add diagnostic logging for iframe rendering state
3. Test with different z-index configurations
4. Check if canvas is somehow blocking iframe rendering
5. Verify WebGL context in iframe (requires manual inspection)




