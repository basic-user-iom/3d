# 🚨 CRITICAL: Streets GL Server Must Be Started Manually

## Current Status
❌ **Server is NOT running** - This is why you see "localhost refused to connect"

## The Problem
The Streets GL server on port 8081 is **NOT running**. This is a **manual step** that must be done before the integration can work.

## Solution: Start the Server NOW

### ⚠️ IMPORTANT: You MUST do this manually!

The server cannot be started automatically from code. You need to:

### Step 1: Open a NEW Terminal Window

**DO NOT use the current terminal** - open a **completely new** PowerShell or Command Prompt window.

### Step 2: Navigate to Streets GL Folder

```powershell
cd d:\ai-cursor\3d-test-software\streets-gl-alt
```

### Step 3: Start the Server

```powershell
npm run dev
```

### Step 4: Wait for Compilation

You will see output like:
```
webpack compiled successfully
```

**This takes 10-30 seconds** - be patient!

### Step 5: Verify Server is Running

Once you see "webpack compiled successfully":
1. Open a browser
2. Go to: `http://localhost:8081`
3. You should see the Streets GL map interface
4. If you see the map, the server is working! ✅

### Step 6: Test Integration

1. Go back to: `http://localhost:3000`
2. **Refresh the page** (F5)
3. The iframe should now load the Streets GL map
4. No more "localhost refused to connect" errors

## Alternative: Use the Batch File

1. Open File Explorer
2. Navigate to: `d:\ai-cursor\3d-test-software\streets-gl-alt`
3. Double-click: `QUICK_START.bat`
4. Wait for "webpack compiled successfully"
5. **Keep the window open** (don't close it!)

## Troubleshooting

### If `npm run dev` gives errors:

**Error: "Cannot find module"**
```powershell
cd d:\ai-cursor\3d-test-software\streets-gl-alt
npm install
```
Wait 5-10 minutes for installation, then try `npm run dev` again.

**Error: "Port 8081 already in use"**
```powershell
netstat -ano | findstr :8081
```
Find the PID (last number), then:
```powershell
taskkill /PID <number> /F
```
Then try `npm run dev` again.

**Error: "node is not recognized"**
- Install Node.js from https://nodejs.org/
- Restart your terminal after installation

### If Server Starts But Still Can't Connect:

1. Check firewall - make sure port 8081 isn't blocked
2. Try accessing `http://127.0.0.1:8081` instead of `localhost:8081`
3. Check if antivirus is blocking the connection

## Visual Confirmation

**Server is RUNNING when:**
- ✅ Terminal shows: `webpack compiled successfully`
- ✅ Browser at `http://localhost:8081` shows Streets GL map
- ✅ No errors in terminal

**Server is NOT running when:**
- ❌ Terminal is closed or shows errors
- ❌ Browser shows "localhost refused to connect"
- ❌ Port 8081 check shows nothing: `netstat -ano | findstr :8081` returns empty

## Why This Happens

The Streets GL server is a **separate application** that must run independently. It's like running two programs:
1. The 3D Viewer (port 3000) - already running ✅
2. The Streets GL server (port 8081) - **YOU MUST START THIS** ❌

## Summary

**YOU MUST:**
1. Open a new terminal window
2. Run: `cd d:\ai-cursor\3d-test-software\streets-gl-alt`
3. Run: `npm run dev`
4. Wait for "webpack compiled successfully"
5. Keep the terminal window open
6. Refresh the browser at `http://localhost:3000`

**The server will NOT start automatically** - this is a manual step that you must do.

Once the server is running, the integration will work immediately!


