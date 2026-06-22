# Fix Server Startup - Complete Guide

## Current Problem
The dev server is not starting. Browser shows "ERR_CONNECTION_REFUSED" when accessing `http://localhost:3000`.

## What I've Tried (Automated)
1. ✅ Multiple attempts to start `npm run dev`
2. ✅ Direct Vite startup attempts
3. ✅ Background jobs and processes
4. ✅ Batch file executions
5. ✅ Browser checks - all show connection refused
6. ✅ Network request analysis - all requests failing

**Result:** Server is NOT running - no process listening on port 3000

## Root Cause Analysis

Since automated commands aren't producing visible output, the issue is likely one of:

1. **Node.js not installed or not in PATH**
2. **Dependencies not installed** (`node_modules` missing)
3. **Port 3000 blocked or in use**
4. **Script execution errors** (failing silently)

## Step-by-Step Fix

### Step 1: Verify Node.js Installation

Open PowerShell and run:
```powershell
node --version
npm --version
```

**Expected:** Should show version numbers
- Node.js: v18.x.x or v20.x.x
- npm: 9.x.x or 10.x.x

**If error:** Install Node.js from https://nodejs.org/

### Step 2: Navigate to Project Directory

```powershell
cd D:\ai-cursor\3d-test-software
```

### Step 3: Check Dependencies

```powershell
# Check root dependencies
Test-Path "node_modules"

# Check StreetsGL dependencies  
Test-Path "streets-gl-alt\node_modules"
```

**If either returns False:**

```powershell
# Install root dependencies
npm install

# Install StreetsGL dependencies
cd streets-gl-alt
npm install
cd ..
```

### Step 4: Check Port Availability

```powershell
netstat -ano | findstr ":3000"
```

**If output shows a process:**
- Note the PID (last number)
- Kill it: `taskkill /PID <PID> /F`
- Or change port in `vite.config.ts`

### Step 5: Start Server Manually

I've created several startup scripts for you:

#### Option A: Simple Vite Only (Recommended for Testing)
```powershell
.\start-vite-only.bat
```
This starts ONLY Vite (no StreetsGL) - fastest way to test if Vite works.

#### Option B: Full Server with Checks
```powershell
.\START_SERVER_SIMPLE.bat
```
This checks everything and starts both servers.

#### Option C: Original Script
```powershell
npm run dev
```

### Step 6: Watch for Success Messages

**Look for these in the terminal:**

✅ **Vite:**
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

✅ **StreetsGL:**
```
webpack compiled successfully
```

### Step 7: Verify in Browser

Once you see the success messages:
1. Open browser to `http://localhost:3000`
2. Should see the 3D Test Software interface
3. If still connection refused, wait 10-20 seconds and refresh

## Common Errors and Fixes

### Error: "Cannot find module"
**Fix:** Run `npm install` in the directory showing the error

### Error: "Port 3000 already in use"
**Fix:** 
```powershell
# Find process
netstat -ano | findstr ":3000"
# Kill it (replace PID)
taskkill /PID <PID> /F
```

### Error: "Command not found: vite"
**Fix:** Dependencies not installed - run `npm install`

### Error: "EADDRINUSE: address already in use"
**Fix:** Port conflict - see "Port 3000 already in use" above

### Server starts but immediately exits
**Check:** Look for error messages in terminal output

## Files Created for You

1. **start-vite-only.bat** - Start just Vite (fastest test)
2. **START_SERVER_SIMPLE.bat** - Full startup with checks
3. **start-server-now.bat** - Simple startup
4. **test-now.cmd** - Diagnostic tests

## Quick Test

To quickly test if everything works:

```powershell
cd D:\ai-cursor\3d-test-software
.\start-vite-only.bat
```

This will:
- Check Node.js
- Start Vite only (no StreetsGL)
- Open browser automatically
- Show all output in visible window

If this works, then the issue is with the full `npm run dev` script or StreetsGL.

## Next Steps

1. **Run the manual checks above**
2. **Try `start-vite-only.bat` first** (simplest test)
3. **Share any error messages** you see
4. **Check the command window** that opens - it will show the actual errors

Once we see the actual error messages, I can help fix the specific issue!


















































