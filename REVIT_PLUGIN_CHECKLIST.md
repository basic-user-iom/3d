# Revit Plugin Complete Checklist

Based on Perplexity research on Revit add-in issues:

## ✅ Pre-Installation Checks

### 1. Revit Version
- [ ] Using Revit 2026 (add-in is configured for 2026)
- [ ] Revit is fully installed and activated

### 2. .NET Framework
- [ ] .NET Framework 4.8 installed
- [ ] Check: Control Panel → Programs → .NET Framework

### 3. DLL Build Status
- [ ] DLL exists at: `revit-addin\RevitToWebExporter\bin\Release\RevitToWebExporter.dll`
- [ ] DLL was built in Release mode
- [ ] No build errors in Visual Studio

### 4. .addin File
- [ ] File exists: `revit-addin\RevitToWebExporter\RevitToWebExporter.addin`
- [ ] DLL path in .addin file is correct
- [ ] .addin file copied to: `%APPDATA%\Autodesk\Revit\Addins\2026\`

## 🔍 Troubleshooting (Perplexity Research)

### Issue: Add-in Not Loading

**Common Causes:**
1. **Add-in conflicts** - Other plugins interfering
   - **Fix:** Disable other add-ins temporarily
   - **Check:** Revit journal for conflict messages

2. **Version mismatch** - Add-in built for wrong Revit version
   - **Fix:** Rebuild for correct Revit version
   - **Check:** .csproj file has correct Revit API path

3. **Missing dependencies** - .NET Framework or Revit API
   - **Fix:** Install .NET Framework 4.8
   - **Check:** Revit API DLLs exist at expected paths

4. **Failed installation** - DLL not in correct location
   - **Fix:** Verify DLL path in .addin file
   - **Check:** DLL actually exists at that path

### Issue: Add-in Crashes on Startup

**Common Causes:**
1. **Exception in OnStartup()** - Error creating ribbon tab/buttons
   - **Check:** Revit journal for exception details
   - **Fix:** Review OnStartup() code for errors

2. **Missing assembly references** - DLL dependencies not found
   - **Check:** All referenced DLLs are available
   - **Fix:** Copy missing DLLs to same folder as add-in

3. **Permission issues** - Can't access files/folders
   - **Check:** Revit running as administrator?
   - **Fix:** Run Revit as administrator

## 📋 Revit Journal Check

**Location:** `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`

**What to look for:**
- Search for "RevitToWebExporter"
- Search for "AddIn"
- Look for error messages
- Look for "Exception" or "Failed"

**Common errors:**
- "Could not load file or assembly"
- "The specified module could not be found"
- "Exception of type 'System.Exception' was thrown"

## 🔧 Quick Fixes

### Fix 1: Rebuild DLL
1. Open Visual Studio
2. Open: `revit-addin\RevitToWebExporter\RevitToWebExporter.csproj`
3. Build → Rebuild Solution (Release mode)
4. Restart Revit

### Fix 2: Verify .addin File
1. Open: `revit-addin\RevitToWebExporter\RevitToWebExporter.addin`
2. Check `<Assembly>` path points to DLL
3. Verify DLL exists at that path
4. Restart Revit

### Fix 3: Check for Conflicts
1. Disable other Revit add-ins
2. Restart Revit
3. Check if "Revit to Web" tab appears
4. If yes, re-enable add-ins one by one to find conflict

### Fix 4: Check Revit Journal
1. Open most recent journal file
2. Search for "RevitToWebExporter"
3. Look for error messages
4. Fix errors found

## 🎯 Testing Steps

1. **Close Revit** (if open)
2. **Verify DLL exists** at path in .addin file
3. **Start Revit 2026**
4. **Check for "Revit to Web" tab** in ribbon
5. **If tab appears:** Add-in loaded successfully ✅
6. **If tab doesn't appear:** Check Revit journal for errors

## 📝 Files to Check

- `.addin file`: `revit-addin\RevitToWebExporter\RevitToWebExporter.addin`
- `DLL`: `revit-addin\RevitToWebExporter\bin\Release\RevitToWebExporter.dll`
- `Journal`: `%LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\`
