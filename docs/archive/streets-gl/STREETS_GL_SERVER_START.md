# Streets GL Server Not Running - Quick Fix

## Problem
The Streets GL server at `http://localhost:8081` is not running, causing the integration to fail.

## Solution

### Option 1: Use the Auto-Start Script (Recommended)
From the project root, run:
```bash
npm run dev
```
This will automatically start both the Streets GL server and the 3D Viewer.

### Option 2: Start Streets GL Server Manually
1. Open a terminal/command prompt
2. Navigate to the `streets-gl-alt` folder:
   ```bash
   cd streets-gl-alt
   ```
3. Start the server:
   ```bash
   npm run dev
   ```
4. Wait for the message: `webpack compiled successfully`
5. The server should now be running on `http://localhost:8081`

### Option 3: Use the Batch Script
If you're on Windows, you can use:
```bash
START_BOTH_SERVERS.bat
```

## Verification
Once the server is running, you should see:
- Webpack compilation messages in the terminal
- Server accessible at `http://localhost:8081`
- No "ERR_CONNECTION_REFUSED" errors in the browser

## Troubleshooting

### Server Won't Start
1. Check if port 8081 is already in use:
   ```bash
   netstat -ano | findstr :8081
   ```
2. If another process is using the port, either:
   - Stop that process
   - Or change the port in `streets-gl-alt/webpack.config.js`

### Dependencies Missing
If you see errors about missing modules:
```bash
cd streets-gl-alt
npm install
```

### Server Starts But Immediately Crashes
Check the console output for error messages. Common issues:
- Missing environment variables
- Port conflicts
- Node.js version incompatibility

## Current Status
The server is currently **NOT RUNNING**. Please start it using one of the methods above.


