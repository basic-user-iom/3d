# 🚨 FINAL INSTRUCTIONS: Start Streets GL Server

## Current Status
❌ **Server is NOT running** - Confirmed by test

## The Problem
The console shows "Streets GL iframe loaded successfully" but this is **MISLEADING**. The iframe's `onLoad` event fires even when an error page loads. The server is actually **NOT running**.

## Proof
- Port 8081: ❌ **NOT IN USE**
- Browser test: ❌ **ERR_CONNECTION_REFUSED**
- Direct access: ❌ **Cannot connect**

## Solution: Start the Server NOW

### ⚠️ YOU MUST DO THIS MANUALLY - IT CANNOT BE AUTOMATED

### Step-by-Step Instructions:

1. **Open a NEW Terminal Window**
   - Press `Win + R`
   - Type: `powershell` or `cmd`
   - Press Enter
   - **DO NOT use the current terminal window**

2. **Navigate to Streets GL Folder**
   ```powershell
   cd d:\ai-cursor\3d-test-software\streets-gl-alt
   ```

3. **Start the Server**
   ```powershell
   npm run dev
   ```

4. **Wait for Compilation**
   - You will see webpack compiling
   - Wait for: `webpack compiled successfully`
   - **This takes 10-30 seconds** - be patient!

5. **Verify Server is Running**
   - Open a browser
   - Go to: `http://localhost:8081`
   - You should see the Streets GL map interface
   - If you see the map, server is working! ✅

6. **Test Integration**
   - Go to: `http://localhost:3000`
   - **Refresh the page** (F5)
   - The iframe should now load the Streets GL map
   - Console should show: `[StreetsGLBridge] Bridge is ready!`

### Alternative: Use Batch File

1. Open File Explorer
2. Navigate to: `d:\ai-cursor\3d-test-software\streets-gl-alt`
3. Double-click: `QUICK_START.bat`
4. Wait for "webpack compiled successfully"
5. **Keep the window open** (don't close it!)

## What You Should See

### When Server is NOT Running:
- ❌ Browser shows: "localhost refused to connect"
- ❌ Console shows: "ERR_CONNECTION_REFUSED"
- ❌ Port check: `netstat -ano | findstr :8081` returns nothing

### When Server IS Running:
- ✅ Browser at `http://localhost:8081` shows Streets GL map
- ✅ Terminal shows: `webpack compiled successfully`
- ✅ Port check: `netstat -ano | findstr :8081` shows a process
- ✅ Console shows: `[StreetsGLBridge] Bridge is ready!`

## Troubleshooting

### If `npm run dev` gives errors:

**"Cannot find module"**
```powershell
cd d:\ai-cursor\3d-test-software\streets-gl-alt
npm install
```
Wait 5-10 minutes, then try `npm run dev` again.

**"Port 8081 already in use"**
```powershell
netstat -ano | findstr :8081
```
Find the PID (last number), then:
```powershell
taskkill /PID <number> /F
```

**"node is not recognized"**
- Install Node.js from https://nodejs.org/
- Restart terminal after installation

## Why This Happens

The Streets GL server is a **separate application** that must run independently:
- 3D Viewer (port 3000) - ✅ Already running
- Streets GL Server (port 8081) - ❌ **YOU MUST START THIS**

The server **will NOT start automatically** - this is a manual step.

## Summary

**YOU MUST:**
1. Open a new terminal
2. `cd d:\ai-cursor\3d-test-software\streets-gl-alt`
3. `npm run dev`
4. Wait for "webpack compiled successfully"
5. Keep terminal open
6. Refresh browser at `http://localhost:3000`

**Once the server is running, the integration will work immediately!**


