# Troubleshooting: Can't Open Program in Browser

## Quick Fixes

### 1. Check if Port 3000 is Already in Use

**Windows PowerShell:**
```powershell
netstat -ano | findstr :3000
```

If something is using port 3000, either:
- Stop that process
- Or change the port in `vite.config.ts` (line 9)

### 2. Try Manual Start (Step by Step)

**Option A: Using Terminal/PowerShell**

1. Open PowerShell or Command Prompt
2. Navigate to project folder:
   ```powershell
   cd D:\ai-cursor\3d-test-software
   ```
3. Start the dev server:
   ```powershell
   npm run dev
   ```
4. Wait for the message: `Local: http://localhost:3000/`
5. Manually open browser and go to: `http://localhost:3000`

**Option B: Using Batch File**

1. Double-click `run-dev.bat` in Windows Explorer
2. Wait for server to start
3. If browser doesn't open automatically, go to: `http://localhost:3000`

### 3. Check Node.js and npm

Make sure Node.js is installed:
```powershell
node --version
npm --version
```

If not installed, download from: https://nodejs.org/

### 4. Clear Cache and Reinstall

If nothing works, try:
```powershell
# Delete node_modules and package-lock.json
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# Reinstall
npm install

# Try again
npm run dev
```

### 5. Check Firewall/Antivirus

- Windows Firewall might be blocking port 3000
- Antivirus might be blocking Node.js
- Try temporarily disabling to test

### 6. Check Browser

- Try a different browser (Chrome, Firefox, Edge)
- Clear browser cache
- Try incognito/private mode

### 7. Check for Errors

When you run `npm run dev`, look for:
- ❌ Error messages (red text)
- ✅ Success message: `Local: http://localhost:3000/`
- ⚠️ Warnings (usually OK, but check)

## Common Error Messages

### "Port 3000 is already in use"
**Solution:** Kill the process using port 3000:
```powershell
# Find process ID
netstat -ano | findstr :3000

# Kill it (replace PID with actual number)
taskkill /PID <PID> /F
```

### "Cannot find module"
**Solution:** Run `npm install` again

### "EADDRINUSE: address already in use"
**Solution:** Port is taken - see "Port 3000 is already in use" above

### "Command not found: vite"
**Solution:** Dependencies not installed - run `npm install`

## Alternative: Use Different Port

Edit `vite.config.ts` and change port 3000 to something else (like 3002):

```typescript
server: {
  host: true,
  port: 3002,  // Changed from 3000
  // ...
}
```

Then access at: `http://localhost:3002`

## Still Not Working?

1. Check Windows Event Viewer for errors
2. Check if Node.js is in PATH:
   ```powershell
   $env:PATH -split ';' | Select-String nodejs
   ```
3. Try running as Administrator
4. Check if any proxy/VPN is interfering
























































