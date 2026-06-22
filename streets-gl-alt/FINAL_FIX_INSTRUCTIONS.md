# Final Fix Instructions - ESLint Removal

## ✅ What I've Done:
1. ✅ Removed ESLint packages from `package.json`
2. ✅ Removed lint scripts from `package.json`
3. ✅ ESLintPlugin is commented out in `webpack.config.js`
4. ✅ No `.eslintrc.json` files exist
5. ✅ Parent `.eslintrc.cjs` ignores `streets-gl-alt/**`

## 🎯 What You Need to Do:

### Option 1: Use the Fix Script (Easiest)
1. **Stop the current server** (Ctrl+C in terminal)
2. **Double-click** `FIX_ESLINT_NOW.bat` in the `streets-gl-alt` folder
3. The script will:
   - Stop any running processes
   - Uninstall ESLint packages
   - Clear cache
   - Clear build directory
   - Start the server

### Option 2: Manual Steps
1. **Stop the server** (Ctrl+C)
2. **Open terminal in `streets-gl-alt` folder**
3. **Run these commands:**
   ```powershell
   npm uninstall @typescript-eslint/eslint-plugin @typescript-eslint/parser
   Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
   Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
   npm run dev
   ```

## ✅ Success Indicators:
- ✅ Terminal shows: `webpack compiled successfully`
- ✅ **NO** ESLint conflict errors
- ✅ Server running on http://localhost:8081
- ✅ Map loads in browser

## 🔍 If ESLint Error Still Appears:
1. **Close all terminals**
2. **Restart your code editor**
3. **Delete `node_modules` folder completely:**
   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm install
   npm run dev
   ```

## 📝 After Success:
1. Open http://localhost:8081 in browser - should see Streets GL map
2. In your main app, enable "Show Streets GL 3D Buildings (iframe overlay)"
3. Load a 3D model - it should be visible and automatically framed
4. Use "Fit" button (🎯 Fit) if model isn't visible







