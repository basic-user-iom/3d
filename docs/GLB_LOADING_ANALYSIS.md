# GLB File Loading Analysis for Large Files (500MB+)

## Current Implementation

### Loading Process (`src/viewer/loaders/gltfLoader.ts`)

**How GLB files are loaded:**

1. **File Reading** (line 1310-1335):
   ```typescript
   const reader = new FileReader()
   reader.readAsArrayBuffer(data)  // Loads ENTIRE file into memory
   ```

2. **Parsing** (line 1325):
   ```typescript
   loader.parse(arrayBuffer, fileBaseUrl, onLoad, onError)
   ```
   - Three.js GLTFLoader parses the entire ArrayBuffer
   - Creates all geometry, materials, textures in memory
   - No streaming or chunked loading

3. **Memory Usage:**
   - **FileReader**: Entire GLB file in memory (500MB for 500MB file)
   - **GLTFLoader parsing**: Additional memory for parsed data structures
   - **Three.js scene objects**: Geometry buffers, textures, materials
   - **Total**: Potentially 1-2GB+ memory usage for a 500MB GLB

### Key Features

✅ **Progress Callbacks**: Supports `onProgress` callback during file read
✅ **LOD Generation**: Auto-generates LOD for models with >500K triangles
✅ **DRACO Support**: Handles compressed geometry
✅ **KTX2 Support**: Handles compressed textures
✅ **Timeout Protection**: 60-second timeout to prevent hanging
✅ **Error Handling**: Comprehensive error handling

### Current Limitations for 500MB+ GLB Files

1. **❌ No Streaming/Chunked Loading**
   - Entire file loaded into memory at once via `FileReader.readAsArrayBuffer()`
   - No way to process file in chunks
   - Browser must have enough RAM for entire file + parsed data

2. **❌ Memory Constraints**
   - 500MB GLB file requires ~500MB+ RAM just for the file
   - After parsing, memory usage can be 1-2GB+
   - Browser may crash on systems with limited RAM
   - Mobile devices likely to fail

3. **❌ No Memory Management**
   - No cleanup of intermediate data structures
   - No memory monitoring or warnings
   - No option to unload previous models before loading new one

4. **❌ Timeout May Be Too Short**
   - 60-second timeout (line 176 in `loaders/index.ts`)
   - Large files may take longer to parse
   - Especially on slower devices

5. **⚠️ Partial File Size Warnings**
   - ✅ Warning exists in `DragDropZone.tsx` for files > 500MB (line 55-63)
   - ✅ Warning exists in `Toolbar.tsx` for FBX files > 500MB (line 795-801)
   - ⚠️ Warning may not always trigger for GLB files depending on how they're loaded
   - ⚠️ No warning in the GLB loader itself

## Code Locations

- **GLB Loading**: `src/viewer/loaders/gltfLoader.ts` (line 369-1355)
- **File Reading**: `src/viewer/loaders/gltfLoader.ts` (line 1310-1335)
- **Timeout**: `src/viewer/loaders/index.ts` (line 173-177)
- **LOD Generation**: `src/viewer/loaders/gltfLoader.ts` (line 816-1231)

## Browser Limitations

### Memory Limits (Approximate)
- **Chrome/Edge**: ~2-4GB per tab (varies by system RAM)
- **Firefox**: ~2-4GB per tab
- **Safari**: ~1-2GB per tab (more restrictive)
- **Mobile**: Much lower (often <1GB)

### FileReader Limits
- No explicit size limit, but limited by available RAM
- Very large files may cause:
  - Browser tab crash
  - "Out of memory" errors
  - Slow/frozen UI during loading

## Recommendations

### Immediate Solutions

1. **Add File Size Warning**
   ```typescript
   if (file.size > 500 * 1024 * 1024) { // 500MB
     const shouldContinue = confirm(
       `Warning: This file is very large (${(file.size / 1024 / 1024).toFixed(1)}MB). ` +
       `Loading may take a long time and could cause the browser to run out of memory. ` +
       `Continue?`
     )
     if (!shouldContinue) throw new Error('Load cancelled')
   }
   ```

2. **Increase Timeout for Large Files**
   ```typescript
   const timeout = file.size > 500 * 1024 * 1024 ? 300000 : 60000 // 5 min for large files
   ```

3. **Add Memory Monitoring**
   - Check available memory before loading
   - Warn if file size exceeds available memory
   - Monitor memory during loading

### Long-term Improvements

1. **Streaming GLB Parser**
   - Parse GLB file in chunks
   - Load geometry progressively
   - Much more memory efficient
   - **Challenge**: GLB format is binary, requires custom streaming parser

2. **Progressive Loading**
   - Load low-res version first
   - Load high-res details progressively
   - Show model as it loads

3. **Web Workers**
   - Parse GLB in Web Worker
   - Prevents UI freezing
   - Better memory isolation
   - **Challenge**: FileReader in workers has limitations

4. **IndexedDB Caching**
   - Store parsed data in IndexedDB
   - Load from cache on subsequent loads
   - Faster subsequent loads

5. **External Texture Loading**
   - Extract textures from GLB
   - Load textures separately/on-demand
   - Reduces initial memory spike

6. **Geometry Compression**
   - Use DRACO compression
   - Reduces memory footprint
   - Already supported, but requires GLB to be pre-compressed

## Testing Recommendations

For 500MB+ GLB files, test:

1. ✅ **Memory Usage**
   - Monitor in Chrome DevTools → Performance → Memory
   - Check for memory leaks
   - Verify cleanup after loading

2. ✅ **Load Time**
   - Measure time to load
   - Check if timeout is sufficient
   - Test on different devices

3. ✅ **Browser Stability**
   - Test on Chrome, Firefox, Safari
   - Test on mobile devices
   - Check for crashes

4. ✅ **User Experience**
   - Progress indicator accuracy
   - UI responsiveness during load
   - Error messages clarity

5. ✅ **Performance After Load**
   - Frame rate with large model
   - Memory usage after load
   - Interaction responsiveness

## Comparison: How Other Software Handles This

### Blender
- Uses streaming for large files
- Progressive loading
- Memory-mapped files

### Sketchfab
- Uses streaming GLB parser
- Progressive detail loading
- Web Workers for parsing

### Three.js Examples
- Most examples assume smaller files
- No built-in streaming support
- Requires custom implementation

## Current Optimizations Already in Place

1. **LOD Generation** (line 816-1231)
   - Auto-generates LOD for high triangle count models
   - Reduces rendering load
   - Doesn't help with initial loading memory

2. **DRACO Compression** (line 379-382)
   - Supports compressed geometry
   - Reduces file size
   - Requires GLB to be pre-compressed

3. **KTX2 Textures** (line 385-388)
   - Supports compressed textures
   - Reduces texture memory
   - Requires GLB to use KTX2 textures

4. **Texture Deduplication** (in useViewer.ts)
   - Merges duplicate textures
   - Saves memory
   - Only helps if model has duplicate textures

## Conclusion

**Current Status**: The project can load 500MB+ GLB files, but:
- ⚠️ Requires significant RAM (1-2GB+)
- ⚠️ May fail on systems with limited memory
- ⚠️ May take a long time to load
- ⚠️ UI may freeze during loading

**Recommendation**: 
1. Add file size warnings before loading
2. Increase timeout for large files
3. Consider implementing streaming parser for very large files
4. Test thoroughly with actual 500MB+ GLB files

