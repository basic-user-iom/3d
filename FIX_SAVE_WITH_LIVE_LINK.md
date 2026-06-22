# Fix: Can't Save Document with Live Link Active

## Problem
You can't save your Revit document while Direct Link is active.

## Solution: Close Link → Save → Reopen Link

### Step 1: Close Direct Link
1. **In Revit:** Click "Direct Link" button again
2. **In the dialog:** Click "Close Link" button
3. **Wait** for the link to close

### Step 2: Save Your Document
1. **Press `Ctrl+S`** to save your document
2. **Or:** File → Save
3. **Wait** for save to complete

### Step 3: Reopen Direct Link
1. **Click "Direct Link"** button again
2. **Click "Synchronize Now"** to export

## Why This Happens

The Direct Link might be:
- Holding a transaction or lock on the document
- Running an export operation that blocks saves
- Waiting for a sync operation to complete

## Alternative: Save Before Opening Link

**Best Practice:**
1. **Save your document first** (Ctrl+S)
2. **Then** open Direct Link
3. **Then** click "Synchronize Now"

This prevents the conflict from happening in the first place.

## Quick Fix Workflow

```
1. Close Direct Link → "Close Link" button
2. Save Document → Ctrl+S
3. Reopen Direct Link → "Direct Link" button
4. Export → "Synchronize Now" button
```

## If Still Can't Save

If you still can't save after closing the link:

1. **Check for active operations:**
   - Look for any dialogs or progress bars
   - Wait for any operations to complete

2. **Check file permissions:**
   - Make sure the file isn't read-only
   - Make sure you have write permissions

3. **Restart Revit:**
   - Close Revit completely
   - Reopen Revit
   - Open your document
   - Save it (Ctrl+S)
   - Then open Direct Link

## Prevention

**Always save before opening Direct Link:**
- ✅ Save first (Ctrl+S)
- ✅ Then open Direct Link
- ✅ Then synchronize

This prevents the conflict from happening.
