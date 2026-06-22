# Web Export Fixes

## Issues Fixed

### 1. Export Error: "Cannot read properties of undefined (reading 'length')"
**Problem:** The export function was trying to access `store.cameraViews.length` when `cameraViews` might be undefined.

**Fix:**
- Added null check: `const cameraViews = store.cameraViews || []`
- Updated all references to use the safe `cameraViews` variable
- Added null checks in `WebExportDialog.tsx` as well

**Files Changed:**
- `src/utils/webExport.ts` - Added null check for cameraViews
- `src/components/WebExportDialog.tsx` - Added null checks

### 2. Menu Header Not Visible
**Problem:** Menu header was being hidden when menu was closed or when content overflowed.

**Fix:**
- Made toolbar header sticky: `position: sticky; top: 0;`
- Added `flex-shrink: 0` to prevent header from shrinking
- Changed overflow to `overflow-y: auto` to allow scrolling
- Ensured header always has proper z-index and background

**Files Changed:**
- `src/components/Toolbar.css` - Made header sticky and always visible

## Testing

1. **Test Export:**
   - Create camera views
   - Click "🌐 Export Web" button
   - Should export without errors

2. **Test Menu Visibility:**
   - Menu header should always be visible at the top
   - When menu is closed, header should still be visible
   - When menu is open, header should be visible and sticky

## Notes

- Export now handles cases where cameraViews might be undefined
- Menu header is now always accessible
- Toolbar can scroll if content is too tall, but header stays visible

