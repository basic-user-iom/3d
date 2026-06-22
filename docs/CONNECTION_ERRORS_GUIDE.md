# Connection Errors Guide

## Understanding Connection Errors

Your application makes network requests to several external services. Some connection errors are **expected and normal**, while others may indicate a problem.

## Expected Connection Errors (Normal)

These errors are **normal** and won't break your application:

### 1. **Rate Limit Errors (429)**
- **What it means**: Too many requests to an API
- **Services affected**: Nominatim, Overpass, Replicate API
- **Impact**: ⚠️ **LOW** - Feature temporarily unavailable, app continues working
- **What happens**: The app automatically retries after waiting
- **Action**: None needed - wait a moment and try again

### 2. **Temporary Network Failures**
- **What it means**: Brief internet connectivity issues
- **Services affected**: Any external API
- **Impact**: ⚠️ **LOW** - App automatically retries
- **What happens**: Automatic retry with exponential backoff
- **Action**: Check your internet connection if it persists

### 3. **External API Timeouts**
- **What it means**: API server took too long to respond
- **Services affected**: Overpass API (can be slow), Replicate API
- **Impact**: ⚠️ **LOW** - Feature won't work, app continues
- **What happens**: App retries automatically
- **Action**: Try again later if the service is busy

## External APIs Used

### 1. **Replicate API** (AI Enhancement)
- **URL**: `https://api.replicate.com`
- **Purpose**: AI image enhancement
- **Error Impact**: ⚠️ **LOW** - Feature disabled, app continues
- **Common Errors**:
  - `429 Rate Limit`: Too many requests - wait and retry
  - `401/403`: Invalid API key - check your credentials
  - `Connection failed`: Network issue - check internet/VPN

### 2. **Nominatim API** (Geocoding)
- **URL**: `https://nominatim.openstreetmap.org`
- **Purpose**: Address search and geocoding
- **Error Impact**: ⚠️ **LOW** - Search won't work, app continues
- **Common Errors**:
  - `429 Rate Limit`: Very common - Nominatim has strict rate limits
  - `Connection failed`: Network issue
- **Note**: Rate limits are **expected** - Nominatim is a free service with strict limits

### 3. **Overpass API** (OSM Buildings)
- **URL**: `https://overpass-api.de/api/interpreter`
- **Purpose**: Fetch OpenStreetMap building data
- **Error Impact**: ⚠️ **LOW** - Buildings won't load, app continues
- **Common Errors**:
  - `429 Rate Limit`: Too many requests
  - `504 Gateway Timeout`: Server busy - very common
  - `Connection failed`: Network issue
- **Note**: Overpass can be slow and may timeout - this is normal

### 4. **Google Tiles API**
- **URL**: `https://tile.googleapis.com`
- **Purpose**: 3D tiles for maps
- **Error Impact**: ⚠️ **LOW** - Tiles won't load, app continues
- **Common Errors**:
  - `403 Forbidden`: API key issue or quota exceeded
  - `Connection failed`: Network issue

## Cursor IDE Connection Errors

If you see a connection error dialog **from Cursor IDE** (not your app):

- **This is a Cursor IDE issue**, not your application
- **Your app will still work** - this doesn't affect your code
- **Possible causes**:
  - Cursor trying to connect to its API
  - VPN/Proxy blocking Cursor's connection
  - Cursor server temporarily unavailable

**What to do**:
1. Check Cursor settings
2. Check VPN/Proxy settings
3. Restart Cursor IDE
4. Ignore if your app is working fine

## How the App Handles Errors

### Automatic Retry Logic
- **Retries**: Up to 3 attempts for most requests
- **Backoff**: Exponential delay (1s, 2s, 4s)
- **Rate Limits**: Respects `Retry-After` headers
- **Timeouts**: 10-60 seconds depending on request type

### Graceful Degradation
- **External API fails**: Feature disabled, app continues
- **Network error**: Automatic retry, then graceful failure
- **Rate limit**: Waits and retries automatically

### Error Messages
- **User-friendly**: Clear messages about what went wrong
- **Actionable**: Tells you what to check (API key, internet, etc.)
- **Non-blocking**: Errors don't crash the app

## What to Check

### If You See Frequent Connection Errors:

1. **Check Your Internet Connection**
   ```powershell
   # Test connectivity
   Test-NetConnection -ComputerName google.com -Port 443
   ```

2. **Check VPN/Proxy Settings**
   - Some APIs may be blocked by VPN
   - Try disabling VPN temporarily

3. **Check API Keys** (if using Replicate/Google)
   - Verify API keys are valid
   - Check quotas/limits

4. **Check Browser Console**
   - Open DevTools (F12)
   - Look at Network tab
   - See which requests are failing

### If Errors Block Your App:

1. **Check Browser Console** for specific errors
2. **Check which feature** is trying to connect
3. **Disable the feature** if it's not needed
4. **Report the issue** with error details

## Features That Work Offline

These features **don't need internet** and will work even with connection errors:

- ✅ 3D Viewer
- ✅ Shader Editor
- ✅ Material Panel
- ✅ Lighting Controls
- ✅ Camera Controls
- ✅ Path Tracer
- ✅ Local file loading
- ✅ Texture management

## Summary

**Most connection errors are normal:**
- ✅ External APIs have rate limits (expected)
- ✅ Network issues happen (temporary)
- ✅ App handles errors gracefully
- ✅ Core features work offline

**Your app should continue working** even when external APIs fail. Only the specific features using those APIs will be disabled.

**If errors persist:**
- Check internet connection
- Check browser console for details
- Verify API keys (if using paid APIs)
- Restart the app

---

**Last Updated**: 2024
**Status**: ✅ App handles connection errors gracefully




