# Streets GL Server Restart Instructions

## Problem Identified
✅ **Confirmed**: Streets GL server is **NOT running** on port 8081
- Port 8081 is not in use
- This is why you're seeing `ERR_CONNECTION_REFUSED` errors

## Solution Applied
I've started the Streets GL server in the background. However, you should also start it manually to see the output.

## Manual Restart Steps

### Option 1: Start Streets GL Server Separately (Recommended)
1. **Open a new terminal/command prompt**
2. **Navigate to the streets-gl-alt folder**:
   ```powershell
   cd streets-gl-alt
   ```
3. **Start the server**:
   ```powershell
   npm run dev
   ```
4. **Wait for compilation**:
   - Look for: `webpack compiled successfully`
   - Look for: `Server started: Hot Module Replacement enabled`

### Option 2: Use Main Project's Concurrently (Alternative)
If you want to start both servers together:
1. **Stop any running servers** (Ctrl+C in terminals)
2. **From the main project root**:
   ```powershell
   npm run dev
   ```
   This will start:
   - Streets GL server on port 8081
   - Main app server on port 3000

## Verification

### Check Server is Running
1. **Open browser**: `http://localhost:8081`
2. **Should see**: Streets GL map interface
3. **If it loads**: Server is working ✅

### Check Main App
1. **Refresh**: `http://localhost:3000`
2. **Check console**: Errors should stop
3. **Check map**: Streets GL iframe should load

## Expected Console Output (After Restart)

**Good signs**:
- ✅ `[webpack-dev-server] Server started`
- ✅ `webpack compiled successfully`
- ✅ `[ExternalObjectBridge] Message listener set up`
- ✅ No more `ERR_CONNECTION_REFUSED` errors

**Bad signs** (if you still see these):
- ❌ `WebSocket connection to 'ws://localhost:8081/ws' failed`
- ❌ `ERR_CONNECTION_REFUSED`
- ❌ Server not accessible at `http://localhost:8081`

## Troubleshooting

### If Server Won't Start
1. **Check for port conflicts**:
   ```powershell
   netstat -ano | findstr :8081
   ```
   If something is using port 8081, kill it or change the port

2. **Clear cache and rebuild**:
   ```powershell
   cd streets-gl-alt
   Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
   npm run dev
   ```

3. **Check for compilation errors**:
   - Look at the terminal output
   - Fix any TypeScript or webpack errors
   - Restart the server

## Next Steps

Once the server is running:
1. ✅ Refresh the main app (`http://localhost:3000`)
2. ✅ Check that Streets GL iframe loads
3. ✅ Test creating a primitive object
4. ✅ Verify objects appear on the map

The server should stay running until you stop it (Ctrl+C) or close the terminal.


