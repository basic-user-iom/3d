# Complete ESLint Removal - Follow These Steps

## The Problem
Webpack is still detecting ESLint configs even though we've disabled the plugin. This is blocking compilation.

## Solution: Complete Removal

**Step 1: Stop the server**
- Press Ctrl+C in the terminal running `npm run dev`

**Step 2: Uninstall ESLint packages**
```powershell
cd streets-gl-alt
npm uninstall eslint eslint-webpack-plugin
```

**Step 3: Clear ALL caches**
```powershell
Remove-Item -Recurse -Force node_modules\.cache -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force build -ErrorAction SilentlyContinue
```

**Step 4: Verify no ESLint config files exist**
```powershell
Get-ChildItem -Recurse -Filter ".eslintrc*" -ErrorAction SilentlyContinue
```
Should return nothing.

**Step 5: Restart server**
```powershell
npm run dev
```

**Step 6: Verify compilation**
Look for: `webpack compiled successfully` (NO ESLint errors)

## If Still Not Working

If ESLint errors persist after these steps, try:

1. **Complete node_modules reinstall:**
   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm install
   npm run dev
   ```

2. **Check for hidden ESLint configs:**
   ```powershell
   Get-ChildItem -Recurse -Force -Filter "*eslint*" -ErrorAction SilentlyContinue
   ```

3. **Verify webpack.config.js has no ESLint references:**
   - ESLintPlugin should be commented out
   - No `require('eslint-webpack-plugin')` active







