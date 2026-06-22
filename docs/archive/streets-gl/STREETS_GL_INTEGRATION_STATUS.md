# Streets GL Integration - Current Status

## Summary

**Status**: Tiles loading ✅ | Buildings rendering ❌

The Streets GL iframe is loading correctly, tiles are being requested and loaded (890+ successful requests), but the 3D buildings are not rendering in the iframe. When Streets GL is accessed directly at `http://localhost:8081`, buildings render perfectly.

## What's Working

1. ✅ **Streets GL Server**: Running on port 8081
2. ✅ **Iframe Loading**: Iframe loads and displays UI (search bar, FPS counter, controls)
3. ✅ **Tile Loading**: Vector tiles are being requested and loaded successfully
4. ✅ **Textures**: All Streets GL textures and resources load correctly
5. ✅ **Bridge Communication**: PostMessage bridge works for object syncing
6. ✅ **URL Hash Format**: Fixed to use `lat,lon,pitch,yaw,distance` (not zoom)
7. ✅ **Camera Settings**: Using 45° pitch, 2000m distance (tested working)

## What's Not Working

1. ❌ **Buildings Not Rendering**: Blue screen persists despite tiles loading
2. ❌ **3D Scene Not Visible**: No map features visible in iframe

## Architecture

```
Main App (localhost:3000)
├── Canvas (z-index: 20, transparent, pointerEvents: 'none')
│   └── Three.js objects render here
└── Iframe (z-index: 5, Streets GL)
    ├── UI visible ✅
    ├── Tiles loading ✅
    └── Buildings not rendering ❌
```

## Changes Made

1. **Fixed URL Hash Format**: Changed from `lat,lon,zoom,yaw,distance` to `lat,lon,pitch,yaw,distance`
2. **Updated Camera Settings**: Changed to 45° pitch, 2000m distance (tested working)
3. **Removed CSS Containment**: Removed `contain: 'layout style'` and `isolation: 'auto'` from iframe
4. **Added Diagnostic Logging**: Enhanced logging for iframe state

## Root Cause Hypothesis

The issue appears to be an **iframe WebGL rendering problem**. Possible causes:

1. **WebGL Context**: WebGL context might not be initializing properly in iframe
2. **Rendering Pipeline**: Streets GL's rendering pipeline might be blocked or delayed
3. **CSS Interference**: Canvas or container CSS might be interfering (unlikely after fixes)
4. **Timing Issue**: Rendering might need more time or a forced render cycle

## Next Steps

1. **Manual Inspection**: Open iframe DevTools (right-click iframe → Inspect) to check:
   - WebGL context status
   - Console errors
   - Canvas element state

2. **Wait Longer**: Sometimes rendering takes 15-20 seconds after tiles load

3. **Test Direct Access**: Verify `http://localhost:8081` still works directly

4. **Check Network**: Verify tiles are returning 200 status codes (not 404/500)

## Diagnostic Commands

To check iframe state in browser console:
```javascript
const iframe = document.querySelector('iframe[title="Streets GL 3D Buildings"]');
console.log({
  src: iframe?.src,
  computedStyle: iframe ? window.getComputedStyle(iframe) : null
});
```

## Files Modified

- `src/App.tsx`: Fixed URL hash format, removed CSS containment, added logging
- `src/utils/streetsGLBridge.ts`: Updated default camera settings
- `src/utils/mapCoordinates.ts`: Added coordinate conversion functions




