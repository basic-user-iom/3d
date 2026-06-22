# How to See Revit Export Errors in Visual Studio

## Current Problem
You're looking at Visual Studio Output, but it's showing **"Build"** output.  
You need **"Debug"** output to see the actual export errors!

## Step-by-Step Instructions

### Step 1: Switch Output to Debug
1. **In Visual Studio Output window**, look at the dropdown that says:
   ```
   Show output from: [Build ▼]
   ```
2. **Click the dropdown** and select **"Debug"**
3. **The output will clear** - that's normal!

### Step 2: Try Direct Link Again
1. **Go to Revit**
2. **Click "Direct Link" button** again
3. **Wait for the error** to appear

### Step 3: Check Visual Studio Output
1. **Go back to Visual Studio**
2. **Look at the Output window** (should still be set to "Debug")
3. **Scroll down** to see the latest messages
4. **Look for messages starting with:**
   - `[GLBExporter]` - Shows export process
   - `[DirectLink]` - Shows Direct Link process
   - **Error messages** will have words like "error", "failed", "exception"

## What You Should See

### If Export Failed:
```
[GLBExporter] Starting IFC export...
[GLBExporter] IFC export error: [THE ACTUAL ERROR HERE]
[GLBExporter] Inner exception: [MORE DETAILS]
[DirectLink] Initial export failed
```

### If Server Connection Failed:
```
[GLBExporter] Testing server connection...
[GLBExporter] Health check failed: [ERROR DETAILS]
[DirectLink] Initial export failed
```

### If Upload Failed:
```
[GLBExporter] Starting upload to server...
[GLBExporter] Upload error: [ERROR DETAILS]
[DirectLink] Initial export failed
```

## Important Notes

- **Build output** = Compilation messages (what you're seeing now)
- **Debug output** = Runtime messages (what you need!)

- The Debug output only appears **while Revit is running** and the add-in is active
- You need to **trigger the export** (click Direct Link) to see the errors
- The messages appear **in real-time** as the export happens

## Quick Checklist

1. ✅ Visual Studio is open
2. ✅ Output window is visible (View → Output)
3. ✅ Dropdown is set to **"Debug"** (not "Build")
4. ✅ Revit is open with a model
5. ✅ Click "Direct Link" in Revit
6. ✅ Check Output window for `[GLBExporter]` messages

## If You Don't See Debug Output

**Problem:** Debug output might not be enabled.

**Solution:**
1. In Visual Studio: **Tools → Options**
2. **Debugging → General**
3. Make sure **"Redirect all Output Window text to the Immediate Window"** is **unchecked**
4. Make sure **"Show output from Debug"** is **checked**

## Alternative: Check Revit Journal File

If Visual Studio Output doesn't show anything:

1. **Close Revit**
2. **Open File Explorer**
3. **Navigate to:**
   ```
   %LOCALAPPDATA%\Autodesk\Revit\Autodesk Revit 2026\Journals\
   ```
4. **Open the most recent journal file** (sorted by date)
5. **Search for:** `RevitToWebExporter` or `GLBExporter`
6. **Look for error messages**

The journal file contains all Revit activity, including add-in errors.
