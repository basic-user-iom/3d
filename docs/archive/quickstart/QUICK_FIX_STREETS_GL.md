# Quick Fix: Streets GL Server Not Loading

## Immediate Solution

The Streets GL server needs to be running for the integration to work. Here's how to start it:

### Method 1: Auto-Start (Easiest)
From the **project root** directory, run:
```bash
npm run dev
```
This will start **both** the Streets GL server (port 8081) and the 3D Viewer (port 3000) automatically.

### Method 2: Manual Start
1. Open a **new terminal/command prompt**
2. Navigate to the `streets-gl-alt` folder:
   ```bash
   cd streets-gl-alt
   ```
3. Start the server:
   ```bash
   npm run dev
   ```
4. **Wait** for the message: `webpack compiled successfully` (this can take 30-60 seconds)
5. The server will be running on `http://localhost:8081`

### Method 3: Use Batch Script (Windows)
Double-click `START_BOTH_SERVERS.bat` in the project root.

## How to Verify It's Working

1. Open your browser and go to: `http://localhost:8081`
2. You should see the Streets GL map interface (not an error page)
3. In the 3D Viewer, the Streets GL iframe should load without "ERR_CONNECTION_REFUSED" errors

## Common Issues

### "Port 8081 already in use"
- Another process is using port 8081
- Solution: Close that process or restart your computer

### "Cannot find module" errors
- Dependencies are missing
- Solution: Run `npm install` in the `streets-gl-alt` folder

### Server starts but crashes immediately
- Check the terminal output for error messages
- Common causes: Node.js version mismatch, missing dependencies

## Current Status
❌ **Streets GL server is NOT running**

**Action Required:** Start the server using one of the methods above.


