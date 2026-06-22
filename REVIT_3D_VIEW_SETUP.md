# How to Export 3D View from Revit to Viewer

## The Issue

FBX export in Revit **requires at least one 3D view** in your model. If you don't have a 3D view, the export will fail.

## Solution: Create a 3D View in Revit

### Step 1: Create a 3D View

**In Revit:**

1. **Go to:** `View` tab → `3D View` → `Default 3D View`
   - Or press: `3D` button in the Quick Access Toolbar
   - Or use keyboard shortcut: `{3D}` (type "3D" in the search box)

2. **A 3D view will be created automatically**
   - Named something like "3D View 1" or "{3D}"
   - Shows your entire model in 3D

3. **Optional: Adjust the view**
   - Use the ViewCube to rotate/orbit
   - Zoom to fit your model
   - Set the view to show what you want to export

### Step 2: Verify the View Exists

**Check Project Browser:**
1. **Look in:** Project Browser → `3D Views`
2. **You should see:** At least one 3D view listed
3. **If empty:** Create one using Step 1 above

### Step 3: Export from Revit

**Now try the export:**

1. **Make sure:** You have at least one 3D view (created in Step 1)
2. **Click:** "Direct Link" → "Synchronize Now" in your add-in
3. **The export should work** - it will export all 3D views found

## What Gets Exported

**The add-in automatically:**
- ✅ Finds **all 3D views** in your document
- ✅ Exports **all of them** to FBX
- ✅ Uploads the first exported file to the server
- ✅ Viewer receives and displays it

**You don't need to:**
- ❌ Select a specific view manually
- ❌ Set up special export settings
- ❌ Configure the view in any special way

## Troubleshooting

### Problem: "No 3D views found in document"

**Solution:**
- Create a 3D view (Step 1 above)
- Make sure it's not a template view
- The view should be visible in Project Browser → 3D Views

### Problem: Export completes but nothing appears in viewer

**Check these:**

1. **Server is running:**
   - Look for `START_REVIT_SYNC_SERVER.bat` window
   - Should show "Server listening on port 3002"

2. **WebSocket connection:**
   - Check browser console (F12)
   - Should show: `[RevitSync] Connected to server`

3. **File was uploaded:**
   - Check server console for upload messages
   - Should show file size and upload success

4. **Viewer received the file:**
   - Check browser console for model loading messages
   - Should show: `[LoadModel]` or `[FBXLoader]` messages

### Problem: Multiple 3D views - which one gets exported?

**Answer:**
- All 3D views are exported
- The first file found is uploaded
- If you want a specific view, temporarily delete/rename other 3D views
- Or modify the code to export only a specific view

## Quick Checklist

Before exporting, make sure:

- ✅ **At least one 3D view exists** in your Revit model
- ✅ **3D view is not a template** (templates are skipped)
- ✅ **Server is running** (`START_REVIT_SYNC_SERVER.bat`)
- ✅ **Viewer is open** and connected (check WebSocket status)
- ✅ **Revit model has geometry** (walls, floors, etc.)

## Alternative: Use a Specific 3D View

**If you want to export only one specific view:**

1. **Create/select the 3D view** you want
2. **Rename it** to something unique (e.g., "Export View")
3. **Temporarily delete or rename** other 3D views
4. **Export** - only your selected view will be exported

**Or modify the code** to filter by view name (I can help with this if needed).

## Current Code Behavior

The add-in code:
```csharp
// Gets all 3D views
var views3D = collector.OfClass(typeof(View3D))
    .Cast<View3D>()
    .Where(v => !v.IsTemplate)  // Skips template views
    .ToList();

// Exports all of them
ViewSet viewSet = new ViewSet();
foreach (var view in views3D)
{
    viewSet.Insert(view);
}
```

**This means:** All non-template 3D views are exported.

## Next Steps

1. **Create a 3D view** in Revit (if you don't have one)
2. **Try the export again**
3. **Check the viewer** - model should appear automatically
4. **If still not working:** Check server logs and browser console for errors
