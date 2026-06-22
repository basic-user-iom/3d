# Debug Streets GL Sync Issues

## Current Status
- Iframe exists and is loaded
- Ground layer checkbox is visible
- Iframe overlay can be enabled/disabled
- Objects are created but may not be syncing to Streets GL

## Debugging Steps

1. **Check Bridge Initialization**:
   - Open browser console
   - Look for: `[App] Streets GL iframe loaded successfully`
   - Look for: `[App] Streets GL bridge is ready`
   - If missing, bridge is not initializing

2. **Check Object Sync**:
   - Create a primitive (box, sphere, etc.)
   - Look for: `[PrimitivesPanel] Attempting to sync primitive to Streets GL`
   - Look for: `[PrimitivesPanel] ✅ Synced primitive to Streets GL scene`
   - If missing, sync is not happening

3. **Check Streets GL Console**:
   - Open Streets GL in separate tab: http://localhost:8081
   - Check console for: `[ExternalObjectBridge] Adding object`
   - Check console for: `[GBufferPass] Rendering X external object(s)`

## Common Issues

### Issue 1: Bridge Not Initialized
**Symptom**: No `[App] Streets GL bridge is ready` message
**Fix**: Ensure Streets GL server is running on port 8081

### Issue 2: Bridge Not Ready When Object Created
**Symptom**: `[PrimitivesPanel] ⚠️ Cannot sync to Streets GL: hasBridge: false`
**Fix**: Wait for bridge to be ready before creating objects, or add retry logic

### Issue 3: Objects Not Appearing in Streets GL
**Symptom**: Objects sync but don't appear in Streets GL view
**Fix**: Check Streets GL console for errors, verify geometry is being sent correctly

## Testing

1. Enable ground layer (disable iframe overlay)
2. Wait for bridge to initialize
3. Create a primitive
4. Check console logs
5. Check Streets GL console (separate tab)
6. Verify object appears in Streets GL scene


