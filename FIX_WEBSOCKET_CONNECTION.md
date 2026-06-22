# Fix WebSocket Connection Issues

## Problem
The web application is trying to connect to `ws://localhost:3003/` but the WebSocket server is not running, causing connection failures.

## Solution

### Step 1: Start the Revit Sync Server

**Option A: Use the batch script (Windows)**
```batch
START_REVIT_SYNC_SERVER.bat
```

**Option B: Manual start**
```bash
cd server-revit-sync
npm install  # Only needed first time
npm start
```

**Expected output:**
```
[RevitSync] HTTP Server running on http://localhost:3002
[RevitSync] WebSocket Server running on ws://localhost:3003
```

### Step 2: Verify Connection

1. **In your web app**, you should see:
   - `[RevitSync] Connecting to ws://localhost:3003...`
   - `[RevitSync] Client connected: client-...`

2. **In Revit**, click **"Direct Link"** to establish the connection.

## Additional Fixes Applied

### ✅ Reduced Excessive Logging
- Removed the `[ObjectsPanel] Built scene tree...` log that was spamming the console
- Only warnings are logged now (when objects are missing)

## Troubleshooting

### Server won't start
- **Check Node.js**: Run `node --version` - should be v14+ 
- **Install dependencies**: Run `npm install` in `server-revit-sync/`
- **Check ports**: Ensure ports 3002 and 3003 are not in use

### Connection still fails
- **Verify server is running**: Check the terminal for server startup messages
- **Check firewall**: Windows Firewall might be blocking the connection
- **Verify URLs**: In Revit Settings, ensure:
  - HTTP Server: `http://localhost:3002`
  - WebSocket: `ws://localhost:3003`

### Multiple connection attempts
- This is normal - the client will retry up to 10 times
- Once the server starts, the connection should succeed automatically
