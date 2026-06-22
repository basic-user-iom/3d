# Quick Start: Streets GL Proxy Fix

## 🚀 Quick Restart (2 Steps)

### Step 1: Restart Server
```bash
cd streets-gl-alt
restart-server.bat
```

### Step 2: Verify It Works
Open in browser: `http://localhost:8081/test-proxy-after-restart.html`

## ✅ Success Indicators

**Terminal:**
```
[Webpack Proxy] GET /vector/13/2412/3079 -> https://tiles.streets.gl/vector/13/2412/3079
[Webpack Proxy] Response: /vector/13/2412/3079 -> 200
```

**Browser Console:**
- ✅ 200 status codes (not 404s)
- ✅ No CORS errors
- ✅ Buildings visible on map

## 🔧 What Was Fixed

1. **App.tsx** - Added missing `streetsGLGroundZoom` variable
2. **webpack.config.js** - Updated proxy to use `setupMiddlewares` (webpack-dev-server 4.x)
3. **Created restart script** - `restart-server.bat`

## 📋 Configuration Details

**Proxy Setup:**
- Uses `setupMiddlewares` (recommended for webpack-dev-server 4.x)
- Proxies `/vector/*` → `https://tiles.streets.gl`
- Proxies `/vector.timestamp` → `https://tiles.streets.gl`
- Includes debug logging
- Handles CORS automatically

## 🐛 Troubleshooting

**If buildings still don't appear:**

1. **Check terminal logs** - Should see `[Webpack Proxy]` messages
2. **Test proxy directly** - Visit `http://localhost:8081/vector/13/2412/3079`
   - Should return tile data (not 404)
3. **Verify server restarted** - Check process ID changed
4. **Check browser console** - Look for 200 status codes

## 📝 Files Modified

- `src/App.tsx` (line 147)
- `streets-gl-alt/webpack.config.js` (lines 51-92)
- `streets-gl-alt/restart-server.bat` (new)
- `streets-gl-alt/test-proxy-after-restart.html` (new)

---

**Status**: ✅ Configuration ready. Restart server to activate.






