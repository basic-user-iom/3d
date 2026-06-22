# Complete System Check - Both Servers Down

## Test Date
2025-11-20 20:02:55 UTC

## Current Status
❌ **BOTH SERVERS ARE NOT RUNNING**

### Test Results

| Server | Port | Status | Error |
|--------|------|--------|-------|
| 3D Viewer | 3000 | ❌ NOT RUNNING | ERR_CONNECTION_REFUSED |
| Streets GL | 8081 | ❌ NOT RUNNING | ERR_CONNECTION_REFUSED |

### Port Check
- Port 3000: ❌ **NOT IN USE**
- Port 8081: ❌ **NOT IN USE**
- Node.js processes: ❌ **NONE RUNNING**

### Browser Tests
- `http://localhost:3000`: ❌ **ERR_CONNECTION_REFUSED**
- `http://localhost:8081`: ❌ **ERR_CONNECTION_REFUSED**

## Solution: Start Both Servers

### ⚠️ YOU MUST START THE SERVERS MANUALLY

### Option 1: Start Both Together (Recommended)

**Using the Batch File:**
1. Open File Explorer
2. Navigate to: `d:\ai-cursor\3d-test-software`
3. Double-click: `START_BOTH_SERVERS.bat`
4. Wait for both servers to compile (10-30 seconds)
5. **Keep the window open** (don't close it!)

**Using Command Line:**
Open PowerShell/Command Prompt:
```powershell
cd d:\ai-cursor\3d-test-software
npm run dev
```

This starts both servers using `concurrently`.

### Option 2: Start Servers Separately

**Terminal 1 - Streets GL Server:**
```powershell
cd d:\ai-cursor\3d-test-software\streets-gl-alt
npm run dev
```
Wait for: `webpack compiled successfully`

**Terminal 2 - 3D Viewer Server:**
```powershell
cd d:\ai-cursor\3d-test-software
npm run dev
```
Or just:
```powershell
vite --host --port 3000
```

## Verification

### After Starting, Check:

1. **Terminal Output:**
   - ✅ Streets GL: `webpack compiled successfully`
   - ✅ 3D Viewer: `Local: http://localhost:3000`

2. **Port Check:**
   ```powershell
   netstat -ano | findstr ":3000 :8081"
   ```
   Should show both ports in use.

3. **Browser Tests:**
   - ✅ `http://localhost:3000` - Should show 3D Viewer
   - ✅ `http://localhost:8081` - Should show Streets GL map

4. **Integration Test:**
   - Go to `http://localhost:3000`
   - The iframe should load Streets GL map
   - Console should show: `[StreetsGLBridge] Bridge is ready!`

## Troubleshooting

### If `npm run dev` gives errors:

**"Cannot find module"**
```powershell
# In main project folder
npm install

# In streets-gl-alt folder
cd streets-gl-alt
npm install
```

**"Port already in use"**
```powershell
# Find what's using the port
netstat -ano | findstr ":3000"
netstat -ano | findstr ":8081"

# Kill the process (replace <PID> with the number)
taskkill /PID <PID> /F
```

**"node is not recognized"**
- Install Node.js from https://nodejs.org/
- Restart terminal after installation

**"concurrently not found"**
```powershell
npm install -g concurrently
```
Or install locally:
```powershell
npm install concurrently --save-dev
```

## Expected Behavior

### When Both Servers Are Running:

**Terminal Output:**
```
[StreetsGL] webpack compiled successfully
[3DViewer] Local: http://localhost:3000/
[3DViewer] Network: http://192.168.x.x:3000/
```

**Browser:**
- ✅ `http://localhost:3000` - 3D Viewer loads
- ✅ `http://localhost:8081` - Streets GL map loads
- ✅ Integration works - iframe loads map in 3D Viewer

### When Servers Are NOT Running:

- ❌ Both ports show ERR_CONNECTION_REFUSED
- ❌ No processes listening on ports 3000 or 8081
- ❌ Terminal shows no server output

## Summary

**BOTH SERVERS MUST BE STARTED:**

1. **Easiest:** Double-click `START_BOTH_SERVERS.bat`
2. **Or:** Run `npm run dev` from main project folder
3. **Or:** Start each server in separate terminals

**Once both are running, everything will work!**


