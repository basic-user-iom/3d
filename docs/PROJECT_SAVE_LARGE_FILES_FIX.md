# Project Save - Large Files Fix

## Problem Analysis

### Current Implementation Issues

1. **Base64 Encoding Overhead**
   - HDR files are converted to base64 and embedded in JSON (line 723 in `projectPersistence.ts`)
   - Textures are converted to data URLs (base64 PNG) and embedded (line 550)
   - Base64 increases file size by ~33% (4 bytes become 3 base64 chars + padding)
   - A 20MB HDR file becomes ~27MB in base64

2. **JSON Stringification Limits**
   - Entire project is stringified as JSON (line 926)
   - Large JSON strings can cause:
     - Browser memory exhaustion
     - `JSON.stringify()` failures
     - Download failures
     - Browser crashes

3. **No Compression**
   - No compression applied before saving
   - Raw JSON with embedded base64 is inefficient

4. **No Size Limits or Warnings**
   - No checks for file size before saving
   - No user feedback about large files

### Research Findings: How Professional Software Handles This

**Best Practices from Stable 3D Software:**

1. **Blender** - Uses compressed `.blend` format with internal compression
2. **SketchUp** - Purges unused data, uses external references for large assets
3. **Autodesk Inventor** - Separate data files, compression, chunking
4. **Rhino** - "Save Small" option removes render meshes, uses compression

**Web Application Best Practices:**

1. **IndexedDB** - For large data storage (unlimited size vs localStorage's 5-10MB limit)
2. **Compression** - Use gzip/deflate (browser-native or libraries like pako)
3. **Chunking** - Split large files into smaller chunks
4. **External References** - Store binary data separately, reference in JSON
5. **Progressive Loading** - Load data in chunks, not all at once

## Solution Plan

### Phase 1: Immediate Fixes (Quick Wins)

1. **Add Compression**
   - Use `pako` library for gzip compression
   - Compress JSON before creating blob
   - Decompress on load

2. **Add Size Warnings**
   - Check project size before saving
   - Warn user if >50MB
   - Offer "lightweight" save option (exclude textures/HDR)

3. **Optimize Texture Serialization**
   - Add max texture size limit (already exists: 4096px)
   - Option to downscale large textures
   - Option to skip textures entirely

### Phase 2: Better Architecture (Medium Term)

1. **Separate Binary Storage**
   - Store HDR/textures as separate files in ZIP
   - Use references in JSON instead of embedding
   - Already partially implemented in `downloadPackagedProject()`

2. **IndexedDB for Large Projects**
   - Use IndexedDB for projects >10MB
   - Fallback to file download for smaller projects
   - Better memory management

3. **Chunked Serialization**
   - Serialize in chunks to avoid memory spikes
   - Use Web Workers for compression
   - Progress feedback during save

### Phase 3: Advanced Features (Long Term)

1. **Incremental Saves**
   - Only save changed data
   - Delta compression
   - Version history

2. **Cloud Storage Integration**
   - Upload large projects to cloud
   - Download on demand
   - Sync across devices

## Implementation

### Step 1: Add Compression Library

```bash
npm install pako
npm install --save-dev @types/pako
```

### Step 2: Modify `downloadProjectSnapshot()`

- Compress JSON before creating blob
- Add size checking
- Add progress feedback

### Step 3: Modify `loadProjectFromFile()`

- Detect compressed files
- Decompress before parsing
- Handle both compressed and uncompressed formats

### Step 4: Add "Lightweight Save" Option

- Skip texture serialization
- Skip HDR embedding (use URL reference)
- Only save scene structure and settings

## Testing Plan

1. **Small Projects** (<1MB)
   - Should work as before
   - Compression should be transparent

2. **Medium Projects** (1-10MB)
   - Should compress well
   - Should save/load successfully

3. **Large Projects** (10-50MB)
   - Should warn user
   - Should offer lightweight option
   - Should use compression

4. **Very Large Projects** (>50MB)
   - Should recommend packaged project
   - Should use IndexedDB or cloud storage
   - Should provide clear feedback

## Code Changes Required

### Files to Modify

1. `src/utils/projectPersistence.ts`
   - Add compression/decompression
   - Add size checking
   - Add lightweight save option

2. `src/components/Toolbar.tsx`
   - Add "Save Lightweight" option
   - Add size warnings
   - Add progress feedback

3. `package.json`
   - Add `pako` dependency

## References

- [MDN: IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Pako: zlib port to JavaScript](https://github.com/nodeca/pako)
- [Blob API Limits](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
- [JSON.stringify Performance](https://v8.dev/blog/cost-of-javascript-2019#json)




















































