# Quick Start - Streets GL Server

## Problem
The browser shows `ERR_CONNECTION_REFUSED` when trying to access `localhost:8081`. This means the Streets GL server is not running.

## Quick Fix

### Option 1: Start Streets GL Server Only
1. **Open a new terminal/command prompt**
2. **Navigate to streets-gl-alt folder**:
   ```powershell
   cd streets-gl-alt
   ```
3. **Start the server**:
   ```powershell
   npm run dev
   ```
4. **Wait for compilation** (look for these messages):
   ```
   [webpack-dev-server] Server started: Hot Module Replacement enabled
   webpack compiled successfully
   ```

### Option 2: Start Both Servers Together (Recommended)
From the main project root:
```powershell
npm run dev
```
This starts:
- Streets GL server on port 8081
- Main app server on port 3000

## Verification

### Step 1: Check Server is Running
Open in browser: `http://localhost:8081`
- ✅ **Should see**: Streets GL map interface
- ❌ **If you see error**: Server is not running yet

### Step 2: Refresh Main App
1. Go to: `http://localhost:3000`
2. **Refresh the page** (F5 or Ctrl+R)
3. The Streets GL iframe should now load
4. You should see the 3D map instead of "localhost refused to connect"

## Expected Result

After the server starts:
- ✅ No more `ERR_CONNECTION_REFUSED` errors
- ✅ Streets GL map loads in the iframe
- ✅ Bridge initializes (`[ExternalObjectBridge] Message listener set up`)
- ✅ Objects can be created and synced to Streets GL
- ✅ Objects appear on the map with shadows

## Troubleshooting

### If Server Won't Start
1. **Check if port 8081 is already in use**:
   ```powershell
   netstat -ano | findstr :8081
   ```
   If something is using it, kill that process or change the port

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

### If Server Starts But Map Doesn't Load
1. **Check browser console** for errors
2. **Verify iframe URL** is correct: `http://localhost:8081#...`
3. **Check CORS settings** (should be fine for localhost)
4. **Try opening Streets GL directly**: `http://localhost:8081`

## Keep Server Running

**Important**: The Streets GL server must stay running while you use the app. Keep the terminal window open. If you close it, the server stops and you'll see the connection error again.

## Next Steps After Server Starts

1. ✅ Refresh the main app (`http://localhost:3000`)
2. ✅ Create a primitive object (cube)
3. ✅ Verify it appears on the Streets GL map
4. ✅ Check that shadows are working
5. ✅ Test transform controls (move, rotate, scale)


