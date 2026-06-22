# Map Not Opening - Troubleshooting Checklist

## Possible Causes:

1. **Webpack Compilation Failing**
   - ESLint conflict error is blocking compilation
   - Check if webpack dev server shows "compiled successfully"
   - Solution: Restart server after ESLint fixes

2. **Server Not Running**
   - Streets GL server must be on http://localhost:8081
   - Check: Open http://localhost:8081 directly in browser
   - Solution: Run `npm run dev` in streets-gl-alt folder

3. **Iframe Overlay Not Enabled**
   - Check "Show Streets GL 3D Buildings (iframe overlay)" checkbox in OSM GROUND ver2 panel
   - Default is `false` - must be enabled manually

4. **Webpack Build Directory Missing**
   - Build folder doesn't exist (webpack hasn't compiled yet)
   - Solution: Wait for webpack to compile, or check for compilation errors

5. **CORS or Network Issues**
   - Browser blocking iframe content
   - Check browser console for CORS errors
   - Solution: Ensure server is running and accessible

6. **ESLint Blocking Compilation**
   - Even though ESLintPlugin is disabled, webpack might still be checking
   - Solution: Ensure .eslintrc.json is deleted and server restarted

## Quick Fix Steps:

1. **Check Server Status:**
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 8081
   ```

2. **Open Streets GL Directly:**
   - Open http://localhost:8081 in browser
   - If it works, the issue is with iframe integration
   - If it doesn't, webpack compilation failed

3. **Check Webpack Compilation:**
   - Look at terminal running `npm run dev`
   - Should see "webpack compiled successfully"
   - If you see ESLint errors, compilation is blocked

4. **Enable Iframe Overlay:**
   - Open "OSM GROUND ver2" panel
   - Check "Show Streets GL 3D Buildings (iframe overlay)"
   - Map should appear

5. **Clear Cache and Restart:**
   ```powershell
   cd streets-gl-alt
   Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
   npm run dev
   ```







