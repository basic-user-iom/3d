# Quick Start - Revit Connection

## Option 1: Start Everything at Once (Easiest)

**Double-click:** `START_EVERYTHING.bat`

This starts:
- ✅ Revit Sync Server (ports 3002, 3003)
- ✅ StreetsGL Server  
- ✅ 3D Viewer Web App (port 3000)

The browser will open automatically. Then:
1. Open "Revit Live Link" panel in the web app
2. Click "Connect"
3. In Revit, click "Direct Link" button
4. Models will appear automatically!

---

## Option 2: Start Revit Server Only

**Double-click:** `START_REVIT_SYNC_SERVER.bat`

This only starts the Revit sync server. You'll need to start the web app separately with `npm run dev`.

---

## Option 3: Use npm Command

Open terminal in project root and run:
```bash
npm run dev:with-revit
```

This starts everything together.

---

## Troubleshooting

**Server window closes immediately?**
- Check if ports 3002/3003 are already in use
- Make sure Node.js is installed (`node --version`)
- Check `server-revit-sync/node_modules` exists (run `npm install` in that folder)

**Models not appearing?**
- Check browser console (F12) for errors
- Verify server is running (check the server window)
- Make sure you clicked "Connect" in the web app
- Check Revit add-in is installed and DLL is built

---

## What Each Port Does

- **Port 3000**: Web app (3D viewer)
- **Port 3002**: HTTP server (file uploads from Revit)
- **Port 3003**: WebSocket server (real-time updates)
