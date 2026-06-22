# Troubleshooting Streets GL Server

## Current Issue
Server at `http://localhost:8081` is not starting or not accessible.

## Step-by-Step Troubleshooting

### Step 1: Check if Dependencies are Installed

Open PowerShell/Command Prompt in `streets-gl-alt` folder and run:

```powershell
cd d:\ai-cursor\3d-test-software\streets-gl-alt
dir node_modules
```

If `node_modules` folder doesn't exist or is empty, run:
```powershell
npm install
```

This may take 5-10 minutes.

### Step 2: Start Server with Visible Output

Open a **new** terminal window and run:

```powershell
cd d:\ai-cursor\3d-test-software\streets-gl-alt
npm run dev
```

**Watch for:**
- ✅ `webpack compiled successfully` - Server is ready
- ❌ Any error messages - These will tell you what's wrong

### Step 3: Check for Port Conflicts

```powershell
netstat -ano | findstr :8081
```

If something is using port 8081:
1. Note the PID (last number)
2. Kill it: `taskkill /PID <number> /F`
3. Try starting server again

### Step 4: Check Node.js Version

```powershell
node --version
```

Should be Node.js 14+ (preferably 16+ or 18+)

### Step 5: Common Errors and Solutions

#### Error: "Cannot find module"
**Solution:** Run `npm install` in `streets-gl-alt` folder

#### Error: "Port 8081 already in use"
**Solution:** 
1. Find what's using it: `netstat -ano | findstr :8081`
2. Kill the process or change port in `webpack.config.js`

#### Error: "webpack not found"
**Solution:** Run `npm install` in `streets-gl-alt` folder

#### Server starts but browser shows "Cannot connect"
**Solution:**
1. Wait 10-15 seconds after "webpack compiled successfully"
2. Try accessing `http://localhost:8081` directly
3. Check firewall isn't blocking port 8081

### Step 6: Manual Server Start (Alternative)

If `npm run dev` doesn't work, try:

```powershell
cd d:\ai-cursor\3d-test-software\streets-gl-alt
npx webpack serve --config ./webpack.config.js --mode=development --port 8081
```

### Step 7: Verify Server is Running

Once you see "webpack compiled successfully":
1. Open browser to `http://localhost:8081`
2. You should see the Streets GL map interface
3. If you see the map, the server is working!

### Step 8: Test in 3D Viewer

After server is running:
1. Go back to `http://localhost:3000`
2. Refresh the page (F5)
3. The iframe should now load the Streets GL map
4. No more `ERR_CONNECTION_REFUSED` errors

## Quick Start Script

Create a file `start-server.bat` in `streets-gl-alt` folder:

```batch
@echo off
echo Installing dependencies if needed...
call npm install
echo.
echo Starting Streets GL server...
echo Server will be available at http://localhost:8081
echo.
call npm run dev
pause
```

Then double-click `start-server.bat` to start the server.

## Still Not Working?

1. **Check terminal output** - Look for any error messages
2. **Check Node.js version** - Should be 14+
3. **Reinstall dependencies** - Delete `node_modules` and run `npm install`
4. **Check firewall** - Make sure port 8081 isn't blocked
5. **Try different port** - Change port 8081 to 8082 in `webpack.config.js`

## Expected Behavior

When server is running correctly:
- Terminal shows: `webpack compiled successfully`
- Browser at `http://localhost:8081` shows Streets GL map
- 3D Viewer iframe loads the map
- No connection refused errors


