# Auto-Start Features - One-Click Direct Link

## What's New

When you click **"Direct Link"** in Revit, the system now automatically:

1. ✅ **Checks if server is running**
2. ✅ **Starts server automatically** if it's not running
3. ✅ **Waits for server to be ready** (up to 30 seconds)
4. ✅ **Opens web app in browser** automatically
5. ✅ **Establishes Direct Link** once everything is ready

## How It Works

### Automatic Server Start

When you click "Direct Link" and the server isn't running:

1. Revit detects the server is down
2. Automatically runs `START_REVIT_SYNC_SERVER.bat`
3. Waits for server to respond (polls `/api/revit/health`)
4. Shows progress dialog
5. Opens web app in browser
6. Establishes Direct Link

### User Experience

**Before (Manual):**
1. User clicks "Direct Link"
2. Gets error: "Server not running"
3. User must manually start server
4. User must manually open browser
5. User clicks "Direct Link" again

**After (Automatic):**
1. User clicks "Direct Link"
2. System auto-starts server
3. System auto-opens browser
4. Direct Link established automatically
5. Done! ✅

## What You'll See

### Server Not Running
```
✅ Server started automatically!

The Revit sync server is now running.
Web app should open in your browser.

Establishing Direct Link...
```

### Server Already Running
- No dialog (silent)
- Browser opens automatically
- Direct Link established

### Server Start Failed
```
❌ Cannot connect to server!

Auto-start failed. Please start manually:
1. Run: START_REVIT_SYNC_SERVER.bat
2. Or run: npm run revit-sync

Direct Link will still be established, but initial export may fail.
```

## Requirements

- `START_REVIT_SYNC_SERVER.bat` must be in project root
- Server must start within 30 seconds
- Browser must be available (for auto-open)

## Troubleshooting

### Server Doesn't Start
- Check that `START_REVIT_SYNC_SERVER.bat` exists in project root
- Check Windows permissions (may need to allow script execution)
- Check if ports 3002/3003 are blocked

### Browser Doesn't Open
- This is optional - Direct Link still works
- Manually open: `http://localhost:3000`

### Server Takes Too Long
- Default wait time: 30 seconds
- If server needs more time, start it manually first
- Then click "Direct Link" again

## Technical Details

### Server Detection
- Checks `http://localhost:3002/api/revit/health`
- Timeout: 3 seconds
- If fails, attempts auto-start

### Server Start
- Runs `START_REVIT_SYNC_SERVER.bat` in minimized window
- Finds batch file by going up from DLL location
- Tries multiple path combinations

### Server Wait
- Polls health endpoint every 500ms
- Maximum wait: 30 seconds (60 attempts)
- Shows progress dialog during wait

### Browser Open
- Opens `http://localhost:3000` in default browser
- Uses `Process.Start` with `UseShellExecute = true`
- Fails silently if browser unavailable

## Next Steps After Rebuild

1. **Close Revit** (if open)
2. **Rebuild DLL** in Visual Studio (Release mode)
3. **Restart Revit**
4. **Click "Direct Link"** - everything should happen automatically!

## Benefits

✅ **One-click setup** - No manual server start needed
✅ **Better UX** - Everything happens automatically
✅ **Less errors** - Server always ready when needed
✅ **Faster workflow** - No waiting for manual steps
