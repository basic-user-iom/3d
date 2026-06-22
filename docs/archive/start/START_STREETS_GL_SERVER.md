# 🚨 START STREETS GL SERVER NOW

## Current Status
❌ **Streets GL server is NOT running**
- Error: `ERR_CONNECTION_REFUSED` at `http://localhost:8081`
- The server must be started manually

## ⚡ Quick Start (Choose One Method)

### Method 1: Start Both Servers (Recommended)
**From project root directory:**
```bash
npm run dev
```
This starts:
- Streets GL server (port 8081) 
- 3D Viewer (port 3000)

**Wait 30-60 seconds** for webpack to compile.

### Method 2: Start Streets GL Only
**Open a NEW terminal/command prompt:**
```bash
cd d:\ai-cursor\3d-test-software\streets-gl-alt
npm run dev
```

**Wait for:** `webpack compiled successfully`

### Method 3: Use Batch Script (Windows)
Double-click: `START_BOTH_SERVERS.bat` in the project root

## ✅ How to Verify It's Working

1. **Check terminal output:**
   - Look for: `webpack compiled successfully`
   - No error messages

2. **Test in browser:**
   - Open: `http://localhost:8081`
   - Should see Streets GL map interface (NOT error page)

3. **Check 3D Viewer:**
   - Iframe should load map (NOT "refused to connect")
   - Bridge should initialize: `[StreetsGLBridge] Bridge is ready!`

## 🔧 Troubleshooting

### "Cannot find module" errors
```bash
cd streets-gl-alt
npm install
```

### Port 8081 already in use
- Close other applications using port 8081
- Or restart your computer

### Server won't start
- Check Node.js is installed: `node --version`
- Check npm is installed: `npm --version`
- Check terminal for error messages

## 📝 Important Notes

- The server must be running **before** using Streets GL features
- Keep the terminal window open while using the app
- The server needs to compile webpack (takes 30-60 seconds)
- If you close the terminal, the server stops

## 🎯 Next Steps

1. **Start the server** using one of the methods above
2. **Wait for compilation** to complete
3. **Refresh the 3D Viewer** page
4. **Test object creation** - objects should appear on terrain (Y=1.5m fix applied)
