# Fix: Objects Not Appearing in Streets GL

## Changes Made

### 1. Enhanced Logging in StreetsGLBridge
- Added detailed logging when sending objects
- Added timeout detection (5 seconds)
- Better error messages

### 2. Made syncModelToStreetsGL Return Promise
- Now returns Promise<void> for better error handling
- Allows callers to wait for sync completion
- Better error propagation

### 3. Enhanced PrimitivesPanel Sync
- Checks if bridge is ready before syncing
- Retries if bridge not ready (waits 1 second)
- Better error handling and logging

### 4. Better Error Messages
- Clear indication when bridge is not ready
- Timeout warnings if Streets GL doesn't respond
- Detailed object information in logs

## Debugging Steps

1. **Check Console Logs:**
   - Look for `[StreetsGLBridge] Bridge is ready!`
   - Look for `[PrimitivesPanel] 🔄 Attempting to sync`
   - Look for `[StreetsGLBridge] 📤 Sending object to Streets GL`
   - Look for `[ExternalObjectBridge] Adding object:`
   - Look for `[GBufferPass] 🎬 Drawing object`

2. **Verify Bridge is Ready:**
   - Bridge must be initialized before objects can be synced
   - Check if `streetsGLIframeOverlay` is enabled
   - Check if Streets GL server is running

3. **Check Object Position:**
   - Objects might be positioned too far from camera
   - Check Web Mercator coordinates in console
   - Verify object is at map center (not at origin 0,0,0)

4. **Check Geometry Extraction:**
   - Verify geometry is extracted correctly
   - Check if normals are computed
   - Verify indices are present

## Next Steps

1. **Test object creation:**
   - Create a box primitive
   - Watch console logs
   - Verify object appears in Streets GL

2. **If still not working:**
   - Check Streets GL console for errors
   - Verify object is in scene (check `externalObjects` map)
   - Check if object is being rendered by GBufferPass


