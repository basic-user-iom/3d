# Manual Start Instructions - Streets GL Server

## ⚠️ Server Not Running

The Streets GL server needs to be started **manually in a visible terminal** so you can see compilation progress and any errors.

## Step-by-Step Instructions

### 1. Open a New Terminal/Command Prompt
- **Windows:** Press `Win + R`, type `cmd`, press Enter
- Or open PowerShell/Command Prompt from Start Menu

### 2. Navigate to the Project
```bash
cd d:\ai-cursor\3d-test-software
```

### 3. Start Both Servers (Recommended)
```bash
npm run dev
```

This will start:
- **Streets GL Server** on port 8081 (cyan output)
- **3D Viewer** on port 3000 (yellow output)

### 4. Wait for Compilation
You should see:
- `[StreetsGL]` messages showing webpack compilation
- `[3DViewer]` messages showing Vite compilation
- Look for: `webpack compiled successfully` (Streets GL)
- Look for: `Local: http://localhost:3000` (3D Viewer)

### 5. Verify Server is Running
- Open browser: `http://localhost:8081`
- Should see Streets GL map interface (not error page)
- 3D Viewer iframe should load without "refused to connect" error

## Alternative: Start Streets GL Only

If you only want to start Streets GL server:

```bash
cd streets-gl-alt
npm run dev
```

Wait for: `webpack compiled successfully`

## Troubleshooting

### "Cannot find module" errors
```bash
cd streets-gl-alt
npm install
```

### Port 8081 already in use
- Close any other applications using port 8081
- Or restart your computer

### Server starts but crashes
- Check terminal output for error messages
- Common issues: Node.js version, missing dependencies

## Current Status
The server is **NOT running**. Please start it manually using the steps above.


