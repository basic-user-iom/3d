# Debug: Revit Objects Not Appearing

## Quick Diagnostic Steps

### Step 1: Check Server Console
When you click "Direct Link" in Revit, the server console should show:

**✅ If working correctly:**
```
[RevitSync] POST /api/revit/upload - 2026-01-19T...
[RevitSync] ========================================
[RevitSync] 📥 UPLOAD REQUEST RECEIVED
[RevitSync] ✅ Received IFC upload: model.ifc
[RevitSync] Broadcasting MODEL_UPDATE to 1 client(s)
```

**❌ If nothing appears:**
- Revit is not reaching the server
- Check server URL in Revit settings
- Check firewall/network

### Step 2: Check Revit Settings
1. In Revit, click **"Settings"** button
2. Verify **HTTP Server URL** is: `http://localhost:3002`
3. If different, change it and try again

### Step 3: Check Revit Direct Link Dialog
1. Click **"Direct Link"** in Revit
2. Does a dialog appear?
3. What does it show?
   - "Direct Link established!" = Link created, but export might be failing
   - Error message = Check the error
   - Nothing = Add-in might not be loaded

### Step 4: Test Server Manually
Open PowerShell and run:
```powershell
$file = Get-Item "C:\path\to\any\file.txt"  # Use any small file
$content = [System.IO.File]::ReadAllBytes($file.FullName)
$boundary = [System.Guid]::NewGuid().ToString()
$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"test.txt`"",
    "Content-Type: application/octet-stream",
    "",
    [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($content),
    "--$boundary--"
)
$body = $bodyLines -join "`r`n"
$bytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($body)

$request = [System.Net.WebRequest]::Create("http://localhost:3002/api/revit/upload")
$request.Method = "POST"
$request.ContentType = "multipart/form-data; boundary=$boundary"
$request.ContentLength = $bytes.Length
$stream = $request.GetRequestStream()
$stream.Write($bytes, 0, $bytes.Length)
$stream.Close()
$response = $request.GetResponse()
$reader = New-Object System.IO.StreamReader($response.GetResponseStream())
$reader.ReadToEnd()
```

If this works, you'll see upload messages in the server console. This confirms the server is working.

### Step 5: Check Revit Journal Files
Revit logs errors to journal files:
1. Open: `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`
2. Find the most recent journal file
3. Search for: "GLBExporter", "DirectLink", "Upload", "Error"
4. Look for any error messages

## Common Issues

### Issue 1: Server URL Wrong
**Symptom:** Nothing in server console
**Fix:** 
1. Click "Settings" in Revit
2. Set HTTP Server URL to: `http://localhost:3002`
3. Click "Test Connection" to verify
4. Try "Direct Link" again

### Issue 2: Export Failing Silently
**Symptom:** "Direct Link established!" but no upload
**Fix:**
- Check Revit journal files for export errors
- Try a smaller model first
- Check if IFC export works manually (File → Export → IFC)

### Issue 3: Firewall Blocking
**Symptom:** Connection test fails
**Fix:**
- Temporarily disable Windows Firewall
- Or add exception for port 3002

### Issue 4: Add-in Not Loaded
**Symptom:** "Direct Link" button doesn't work
**Fix:**
- Check if DLL exists: `bin\Release\RevitToWebExporter.dll`
- Restart Revit
- Check Add-Ins tab in Revit options

## What to Share for Help

1. **Server console output** when clicking "Direct Link"
2. **Revit error messages** (if any)
3. **Revit settings** (Server URL values)
4. **Journal file errors** (if found)
