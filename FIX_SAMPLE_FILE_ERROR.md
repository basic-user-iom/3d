# Fix: "Unable to write to rac_basic_sample_family-2.rfa"

## Problem
You're getting an error:
```
Unable to write to rac_basic_sample_family-2.rfa, it is read-only or opened by someone else.
```

## Why This Happens

The file `rac_basic_sample_family.rfa` is located in:
```
C:\Program Files\Autodesk\Revit 2026\Samples
```

**This is a protected system folder!** Windows prevents programs from writing to `Program Files` without administrator privileges.

When Revit tries to:
- Save changes to the family
- Create a backup copy (the "-2" suffix)
- Export the model

It needs **write permissions** to that folder, which it doesn't have.

## Solution: Copy File to Your Documents Folder

### Step 1: Copy the Family File
1. **Open File Explorer**
2. **Navigate to:** `C:\Program Files\Autodesk\Revit 2026\Samples`
3. **Find:** `rac_basic_sample_family.rfa`
4. **Right-click** → **Copy**
5. **Navigate to:** `C:\Users\Mirjan\Documents\Revit Families` (or create this folder)
6. **Right-click** → **Paste**
7. **Rename** if needed (e.g., `rac_basic_sample_family_my_copy.rfa`)

### Step 2: Open the Copy in Revit
1. **In Revit:** File → Open → Family
2. **Navigate to:** `C:\Users\Mirjan\Documents\Revit Families`
3. **Select:** Your copied family file
4. **Click:** Open

### Step 3: Load into Your Project
1. **In Revit:** Load into Project (or Load into Projects)
2. **Select your project** from the list
3. **Click:** OK

### Step 4: Now Try Direct Link
1. **Click:** "Direct Link" button
2. **Click:** "Synchronize Now"
3. **The export should work now!**

## Alternative: Use a Different Sample File

If you just want to test the Direct Link:

1. **Create a new Revit project:**
   - File → New → Project
   - Choose a template (e.g., "Architectural Template")
   - Save it to your Documents folder

2. **Add some basic geometry:**
   - Draw a wall
   - Add a door or window
   - Save the project

3. **Try Direct Link with this project:**
   - Click "Direct Link"
   - Click "Synchronize Now"
   - This should work because the file is in a writable location

## Why the Original File Location Matters

**Protected Folders (Read-Only for Programs):**
- `C:\Program Files\` - System programs
- `C:\Program Files (x86)\` - 32-bit programs
- `C:\Windows\` - Windows system files

**Writable Folders (Safe for Your Work):**
- `C:\Users\YourName\Documents\` - Your documents
- `C:\Users\YourName\Desktop\` - Desktop
- `D:\YourProjectFolder\` - Any drive you created

## Quick Checklist

- ✅ File is in a writable location (not Program Files)
- ✅ File is not open in another Revit instance
- ✅ You have write permissions to the folder
- ✅ File is saved (Ctrl+S) before exporting

## Still Having Issues?

If you still get the error after copying the file:

1. **Check file properties:**
   - Right-click the file → Properties
   - Make sure "Read-only" is **unchecked**

2. **Check folder permissions:**
   - Right-click the folder → Properties → Security
   - Make sure your user has "Full control"

3. **Close other Revit instances:**
   - Make sure only one Revit window is open
   - Check Task Manager for other Revit processes

4. **Restart Revit:**
   - Close Revit completely
   - Reopen Revit
   - Open your file
   - Try again
