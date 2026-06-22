# File Saving Analysis for Large Projects (500MB+)

## Current Implementation Overview

### 1. Project Persistence (`src/utils/projectPersistence.ts`)

**How it works:**
- Creates a complete project snapshot (JSON) with all scene data
- Serializes textures as base64 data URLs (embedded in JSON)
- Compresses JSON using gzip (pako library, level 6)
- Creates a Blob and saves via File System Access API or download

**Key Features:**
- ✅ Gzip compression (reduces size significantly)
- ✅ Size warnings at 20MB and 50MB
- ✅ Lightweight mode (skips textures)
- ✅ Yields to browser during serialization to prevent blocking
- ✅ Texture serialization limit (500 textures max)
- ✅ Maximum texture dimension (4096x4096)

**Current Limitations for 500MB+ Projects:**

1. **No Chunking/Streaming**
   - Entire project JSON is stringified in memory before compression
   - Entire blob is written at once (no chunked writes)
   - Risk: Browser may run out of memory for very large projects

2. **Base64 Encoding Overhead**
   - Textures converted to base64 data URLs (~33% size increase)
   - HDR files embedded as base64 in JSON
   - A 500MB project with textures could become 650MB+ in JSON before compression

3. **Memory Usage**
   - Project JSON string exists in memory
   - Compressed data exists in memory
   - Blob exists in memory
   - Total: ~3x the final file size in memory during save

4. **Browser Limits**
   - Blob size limits vary by browser (typically 2GB, but can be lower)
   - JSON.stringify() may fail on very large objects
   - File System Access API may have size limits

5. **No Progress During Compression**
   - Compression happens synchronously (can block UI)
   - No progress feedback during gzip compression

### 2. File System Access (`src/utils/fileSystemAccess.ts`)

**How it works:**
- Uses File System Access API when available (Chrome/Edge)
- Falls back to standard download if API unavailable
- Writes entire blob at once: `await writable.write(blob)`

**Limitations:**
- ❌ No chunked writing for large files
- ❌ No progress callback during write
- ❌ Entire blob must fit in memory

### 3. Web Export (`src/utils/webExport.ts`)

**How it works:**
- Uses JSZip to package assets
- Uses `streamFiles: true` for large files (good!)
- Uses STORE compression (no compression) for already-compressed files
- Has progress callbacks

**Better for large files:**
- ✅ Streaming support via JSZip
- ✅ Progress callbacks
- ✅ Handles large models better

## Recommendations for 500MB+ Projects

### Immediate Solutions

1. **Use "Save Packaged Project" instead of regular save**
   - Packages files separately (ZIP format)
   - Better for large projects
   - Uses streaming in JSZip

2. **Use Lightweight Mode**
   - Skips texture serialization
   - Much smaller file size
   - Textures must be reloaded separately

3. **Split Large Projects**
   - Save models separately
   - Reference external files instead of embedding

### Potential Improvements Needed

1. **Chunked Writing**
   ```typescript
   // Instead of: await writable.write(blob)
   // Use: Write in chunks
   const chunkSize = 10 * 1024 * 1024 // 10MB chunks
   for (let offset = 0; offset < blob.size; offset += chunkSize) {
     const chunk = blob.slice(offset, offset + chunkSize)
     await writable.write(chunk)
     onProgress?.(offset / blob.size * 100)
   }
   ```

2. **Streaming Compression**
   - Use streaming gzip compression instead of loading all in memory
   - Process data in chunks

3. **External File References**
   - Don't embed large textures/HDR as base64
   - Save them as separate files and reference in JSON
   - Similar to how "Packaged Project" works

4. **IndexedDB for Large Data**
   - Use IndexedDB to store large binary data
   - Reference from project JSON
   - Better than localStorage (which has 5-10MB limit)

5. **Progressive Save**
   - Save project structure first
   - Then save assets in background
   - Allow user to continue working

## Current Size Limits & Warnings

| Size | Warning | Action |
|------|---------|--------|
| > 20MB | "Project is large. Saving may take a moment." | Info |
| > 50MB | "Project is very large. Consider using 'Save Packaged Project' instead." | Warning + Confirm |
| > 500 textures | Skips remaining texture serialization | Silent limit |
| > 4096x4096 texture | Skips texture | Silent limit |

## Testing Recommendations

For 500MB+ projects, test:
1. ✅ Memory usage during save (check browser DevTools)
2. ✅ Save time (may take several minutes)
3. ✅ Browser stability (may crash on very large projects)
4. ✅ Load time after save
5. ✅ File System Access API behavior with large files

## Code Locations

- **Project Save**: `src/utils/projectPersistence.ts` (line 1009)
- **File Writing**: `src/utils/fileSystemAccess.ts` (line 18)
- **Web Export**: `src/utils/webExport.ts` (line 6622)
- **Size Check**: `src/utils/projectPersistence.ts` (line 979)
- **Compression**: `src/utils/projectPersistence.ts` (line 996)








































