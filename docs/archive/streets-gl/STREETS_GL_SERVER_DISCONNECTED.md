# Streets GL Server Disconnected - Fix Instructions

## Problem
The Streets GL webpack dev server has disconnected or stopped running. This is causing:
- ❌ WebSocket connection failures
- ❌ `ERR_CONNECTION_REFUSED` for all tile requests
- ❌ WASM files cannot be loaded
- ❌ Map tiles cannot be fetched

## Symptoms
- Console shows: `WebSocket connection to 'ws://localhost:8081/ws' failed`
- Console shows: `GET http://localhost:8081/vector/... net::ERR_CONNECTION_REFUSED`
- Console shows: `GET http://localhost:8081/misc/lerc-wasm.wasm net::ERR_CONNECTION_REFUSED`

## Solution

### Step 1: Check if Server is Running
Open a terminal and check if port 8081 is in use:
```powershell
netstat -ano | findstr :8081
```

### Step 2: Restart Streets GL Server

**Option A: Using npm script (Recommended)**
```powershell
cd streets-gl-alt
npm run dev
```

**Option B: If using concurrently (from main project)**
```powershell
# Stop all servers (Ctrl+C)
# Then restart from main project:
npm run dev
```

### Step 3: Wait for Compilation
Wait for the terminal to show:
```
[webpack-dev-server] Server started: Hot Module Replacement enabled
webpack compiled successfully
```

### Step 4: Verify Server is Running
1. Open `http://localhost:8081` directly in your browser
2. You should see the Streets GL map interface
3. If it loads, the server is working

### Step 5: Refresh Main App
1. Refresh the main app at `http://localhost:3000`
2. The Streets GL iframe should now connect successfully
3. Console errors should stop

## Prevention

The server may disconnect if:
- The terminal running the server is closed
- The server crashes due to an error
- The system goes to sleep/hibernates
- Network configuration changes

**Solution**: Keep the terminal running the Streets GL server open and visible.

## Quick Fix Script

If you have a batch file to start the server, use it:
```powershell
cd streets-gl-alt
.\start-dev.bat
```

Or if using the main project's concurrently setup:
```powershell
npm run dev
```

This will start both the Streets GL server and the main app server.


