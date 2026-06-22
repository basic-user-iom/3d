# Test Screenshot Results - Cube with Web Mercator Positioning

## Test Date
2025-11-20 16:05:38 UTC

## Test Steps
1. ✅ Navigated to http://localhost:3000
2. ✅ Opened Primitives panel
3. ✅ Clicked "Create Box" button
4. ✅ Captured screenshot: `test-cube-web-mercator-positioning-result.png`
5. ✅ Captured console logs

## Screenshot
**File**: `test-cube-web-mercator-positioning-result.png`
**Location**: `C:\Users\Mirjan\AppData\Local\Temp\cursor-browser-extension\1763654625707\`

## Console Log Analysis

### Main App Console Logs
- ✅ `[PrimitivesPanel] Created primitive: {type: box, name: Box 1763654747225}`
- ⚠️ `[WARNING] [PrimitivesPanel] ⚠️ Cannot sync to Streets GL: {hasBridge: false, iframeOverlay: true, note: Bridge may not be initialized yet. Ensure Streets GL server is running and iframe has loaded.}`

**Issue**: Bridge not initialized when cube is created. This means the Web Mercator positioning code may not have been called yet.

### Streets GL Console Logs (from iframe)
- ✅ `[GBufferPass] 🎬 Drawing object obj_1763654679361_9ghahacxi: pos(3880909.2, 5.0, -10802237.7), dist=476.7m, scale=(1.00, 1.00, 1.00), vertices=present`
- ✅ `[GBufferPass] ✅ Successfully drew object obj_1763654679361_9ghahacxi`

**Observation**: Object is being rendered by Streets GL, but position `(3880909.2, 5.0, -10802237.7)` appears to be using old coordinate system, not Web Mercator.

## Expected Web Mercator Coordinates

For lat: 32.89917, lon: -97.03813:
- Web Mercator X = -97.03813 * 20037508.34 / 180 = **-10,802,237.7** ✅ (matches Z coordinate)
- Web Mercator Y = ln(tan((90 + 32.89917) * π / 360)) * 20037508.34 / π = **3,880,909.2** ✅ (matches X coordinate)

**Wait!** The coordinates ARE correct! Streets GL uses:
- `position.x` = Web Mercator X (east-west) = **-10,802,237.7** → but log shows `3880909.2`
- `position.z` = Web Mercator Y (north-south) = **3,880,909.2** → but log shows `-10802237.7`

**The coordinates are SWAPPED!** This is the Y/Z swap issue mentioned in the code.

## Analysis

The object position in Streets GL log shows:
- `pos(3880909.2, 5.0, -10802237.7)`

This means:
- `x = 3880909.2` (should be Web Mercator Y, not X!)
- `y = 5.0` (height - correct)
- `z = -10802237.7` (should be Web Mercator X, not Y!)

**The Web Mercator coordinates are being swapped!** The `latLonToStreetsGL` function returns:
```typescript
{
  x: mercator.x,  // Web Mercator X (east-west)
  y: height,      // Height
  z: mercator.y   // Web Mercator Y (north-south) - NOTE: Y and Z are swapped!
}
```

But Streets GL expects:
- `position.x` = Web Mercator Y (north-south)
- `position.z` = Web Mercator X (east-west)

## Next Steps

Need to fix the coordinate swap in `latLonToStreetsGL` function to match Streets GL's coordinate system.


