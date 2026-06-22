# Test Screenshot Results - Cube with Web Mercator Positioning (After Coordinate Swap Fix)

## Test Date
2025-11-20 16:05:38 UTC

## Screenshot
**File**: `test-cube-web-mercator-positioning-result.png`
**Location**: `C:\Users\Mirjan\AppData\Local\Temp\cursor-browser-extension\1763654625707\`

## Console Log Analysis

### Streets GL Console Logs (from iframe)
```
[GBufferPass] 🎬 Drawing object obj_1763654679361_9ghahacxi: 
  pos(3880909.2, 5.0, -10802237.7), 
  dist=476.7m, 
  scale=(1.00, 1.00, 1.00), 
  vertices=present
```

### Coordinate Analysis

**For lat: 32.89917, lon: -97.03813:**
- Web Mercator X (east-west) = -97.03813 * 20037508.34 / 180 = **-10,802,237.7**
- Web Mercator Y (north-south) = ln(tan((90 + 32.89917) * π / 360)) * 20037508.34 / π = **3,880,909.2**

**Streets GL position from log:**
- `x = 3880909.2` → This is Web Mercator Y (north-south) ✅
- `y = 5.0` → Height ✅
- `z = -10802237.7` → This is Web Mercator X (east-west) ✅

**Conclusion**: Streets GL uses:
- `position.x` = Web Mercator Y (north-south)
- `position.z` = Web Mercator X (east-west)

## Fix Applied

Updated `latLonToStreetsGL` to swap coordinates:
```typescript
return {
  x: mercator.y,  // Web Mercator Y → Streets GL X
  y: height,      // Height
  z: mercator.x   // Web Mercator X → Streets GL Z
}
```

## Next Test

After this fix, objects should be positioned correctly on the map. The coordinates now match Streets GL's coordinate system.


