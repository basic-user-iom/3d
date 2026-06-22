# Test Results: Cube with Web Mercator Positioning

## Test Date
2025-11-20 16:04:32 UTC

## Test Steps
1. ✅ Navigated to http://localhost:3000
2. ✅ Opened Primitives panel
3. ✅ Clicked "Create Box" button
4. ✅ Captured console logs and screenshot

## Expected Behavior
After the Web Mercator positioning fix, the cube should:
- ✅ Be positioned on the ground at the map center (not floating)
- ✅ Use Web Mercator coordinates (same as tiles/buildings)
- ✅ Appear correctly integrated with the Streets GL map
- ✅ Scale naturally (no 200x multiplier)
- ✅ Cast and receive shadows

## Console Log Analysis

Console log file: `C:\Users\Mirjan\.cursor\browser-logs\console-2025-11-20T16-04-32-094Z.log`

### Key Logs to Check:
1. `[PrimitivesPanel] Created primitive` - Cube creation
2. `[StreetsGLSync] Positioned object at map center using Web Mercator` - Web Mercator positioning
3. `[ExternalObjectBridge] Adding object` - Object added to Streets GL
4. `[GBufferPass] Drawing object` - Object rendered by Streets GL

## Screenshots
- `test-cube-web-mercator-positioning.png` - Before cube creation
- `test-cube-after-creation.png` - After cube creation

## Analysis
Check console logs for:
- Web Mercator coordinate conversion
- Object positioning at map center
- Successful sync to Streets GL
- Rendering by GBufferPass


