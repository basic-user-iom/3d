# Quick Log Collection - Simple Method

## 🚀 Easiest Way to Collect Logs

### Step 1: Open Browser Console on 3D Viewer Page

1. **Go to:** `http://localhost:3000` (your 3D viewer)
2. **Press F12** to open Developer Tools
3. **Click the "Console" tab**

### Step 2: Paste This Script

**Copy the entire contents of:** `INJECT_LOG_COLLECTOR.js`

**Then paste it into the browser console and press Enter**

### Step 3: Wait for Auto-Collection

The script will automatically:
- ✅ Capture console logs
- ✅ Check server status
- ✅ Check viewer state
- ✅ Generate complete report
- ✅ Copy to clipboard

**You'll see:** A popup saying "Report copied to clipboard!"

### Step 4: Paste Here

Just paste the report here for analysis!

---

## Alternative: Manual Collection

If auto-collection doesn't work, after pasting the script, type:

```javascript
collectRevitLogs()
```

And press Enter. This will generate and copy the report.

---

## What This Collects

- ✅ All browser console logs
- ✅ Server health and sessions
- ✅ Viewer state (scene children, Revit models)
- ✅ WebSocket connection status
- ✅ Complete formatted report

---

## Also Run PowerShell Script

For server-side logs, also run:

**Double-click:** `COLLECT_LOGS_NOW.bat`

This gets:
- Server console logs
- Revit journal errors
- Port status
- Process information

---

## Quick Test

1. **Open:** `http://localhost:3000`
2. **Press F12** → Console tab
3. **Paste:** Contents of `INJECT_LOG_COLLECTOR.js`
4. **Press Enter**
5. **Wait for popup**
6. **Paste report here**

That's it! 🎉
