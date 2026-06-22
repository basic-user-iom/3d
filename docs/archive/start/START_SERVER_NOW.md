# 🚨 START STREETS GL SERVER NOW

## Current Status
❌ **Server is NOT running** - Connection refused on port 8081

## ⚡ Quick Fix - Start Server Manually

### Step 1: Open a NEW Terminal Window
- **Windows:** Press `Win + R`, type `cmd`, press Enter
- **OR** Right-click Start Menu → "Windows PowerShell" or "Command Prompt"
- **OR** Open VS Code/Cursor terminal (but use a NEW terminal tab)

### Step 2: Navigate to Streets GL Directory
```bash
cd d:\ai-cursor\3d-test-software\streets-gl-alt
```

### Step 3: Start the Server
```bash
npm run dev
```

### Step 4: Wait for Compilation
**Look for these messages:**
- `webpack compiled successfully` ✅
- `Compiled successfully in X seconds` ✅
- **DO NOT close the terminal** - server must keep running

**Expected time:** 30-60 seconds for first compilation

### Step 5: Verify Server is Running
1. **Open browser:** `http://localhost:8081`
2. **Should see:** Streets GL map interface (NOT error page)
3. **If you see error:** Server is still compiling, wait longer

### Step 6: Refresh 3D Viewer
1. **Go to:** `http://localhost:3000`
2. **Refresh the page** (F5 or Ctrl+R)
3. **Check iframe:** Should show Streets GL map (not "refused to connect")

## 🔧 Troubleshooting

### "npm: command not found"
- Node.js is not installed or not in PATH
- Install Node.js from: https://nodejs.org/

### "Cannot find module" errors
```bash
cd d:\ai-cursor\3d-test-software\streets-gl-alt
npm install
npm run dev
```

### Port 8081 already in use
- Another process is using port 8081
- Close other applications
- Or restart your computer

### Server won't start
- Check Node.js version: `node --version` (should be 16+)
- Check npm version: `npm --version`
- Check terminal for error messages

### Server starts but immediately stops
- Check terminal for error messages
- May need to install dependencies: `npm install`
- May need to check `streets-gl-alt/package.json` for correct scripts

## 📝 Important Notes

- **Keep terminal open** - Server stops if you close the terminal
- **Server must be running** - Integration won't work without it
- **First compilation is slow** - Subsequent starts are faster
- **Two servers needed:**
  - Streets GL: `http://localhost:8081` (port 8081)
  - 3D Viewer: `http://localhost:3000` (port 3000)

## ✅ Success Indicators

Once server is running, you should see:
- ✅ Terminal shows: `webpack compiled successfully`
- ✅ Browser can access: `http://localhost:8081`
- ✅ 3D Viewer iframe loads map (no "refused to connect")
- ✅ Console shows: `[StreetsGLBridge] Bridge is ready!`

## 🎯 Alternative: Start Both Servers Together

From project root (`d:\ai-cursor\3d-test-software`):
```bash
npm run dev
```

This starts BOTH servers:
- Streets GL (port 8081)
- 3D Viewer (port 3000)

**Wait for BOTH to compile before testing!**


