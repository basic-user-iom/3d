# Bug Fix Server Setup

## Quick Start

The Bug Fix Server automatically writes confirmed bugs and fixes to `FIXES_APPLIED.md` so they appear in your editor.

### To Start:

1. **Open a terminal** and run:
   ```bash
   npm run server
   ```
   This starts the Bug Fix Server on port 3001.

2. **Keep it running** - Leave this terminal open.

3. **In another terminal**, start your dev server:
   ```bash
   npm run dev
   ```

### Or Use the Batch File:

Double-click `start-dev.bat` - it starts both servers automatically.

## How It Works

- When you **confirm a bug** in the Bug Tracker → it's automatically written to `FIXES_APPLIED.md`
- When you click **"Fix All Bugs"** → fixes are automatically written to `FIXES_APPLIED.md`
- The file updates **automatically** in your editor - no copy/paste needed!

## Troubleshooting

If bugs aren't appearing in `FIXES_APPLIED.md`:

1. Check if the server is running:
   - Look for: `[BugFix Server] Running on http://localhost:3001`
   - Or check browser console for: `[BugFix] Server not available`

2. Make sure both servers are running:
   - Bug Fix Server: port 3001
   - Vite Dev Server: port 3000

3. Check browser console for error messages

## Manual Fallback

If the server isn't running, bugs will still appear in the browser console in markdown format - you can copy them manually.





