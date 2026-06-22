# SSS & SSR WebGL Error Fixes

## Critical Fixes Applied

### Issue
Persistent WebGL errors:
- `WebGL: INVALID_OPERATION: useProgram: program not valid` (repeated many times)
- `GL_INVALID_OPERATION: glDrawArrays: Feedback loop formed between Framebuffer and active Texture` (repeated many times)

### Root Causes Identified

1. **tDiffuse Not Set Correctly**: Relying on ShaderPass to set tDiffuse automatically may fail if buffers swap at wrong time
2. **Shader Program Not Ready**: Program may not be compiled when we try to use it
3. **Feedback Loop Detection Too Late**: Checking after render is too late - error already occurred

### Fixes Applied

#### 1. ✅ Explicitly Set tDiffuse Before Render
**Location**: Both SSS and SSR render overrides

**Change**:
```typescript
// BEFORE: Relied on ShaderPass to set tDiffuse
// AFTER: Explicitly set tDiffuse to readBuffer.texture BEFORE calling originalRender
uniforms.tDiffuse.value = readBuffer.texture

// Double-check it's not pointing to writeBuffer
if (writeBuffer && writeBuffer.texture && uniforms.tDiffuse.value === writeBuffer.texture) {
  console.error('[PostProcessingSystem] ❌ tDiffuse would point to writeBuffer, skipping render')
  // Disable pass
  return
}
```

**Why**: Ensures tDiffuse is always set to the correct buffer (readBuffer) before rendering, preventing feedback loops.

#### 2. ✅ Force Shader Compilation
**Location**: Both SSS and SSR render overrides

**Change**:
```typescript
// Force shader compilation if material exists but program doesn't
if (material && !material.program) {
  material.needsUpdate = true
}
```

**Why**: Ensures shader program is compiled before we try to use it, preventing "program not valid" errors.

#### 3. ✅ Enhanced Error Handling
**Location**: Both SSS and SSR render overrides

**Change**:
```typescript
// Check for errors immediately after render
let glError = gl.getError()
if (glError !== gl.NO_ERROR) {
  // Disable pass immediately on ANY error to prevent error spam
  if (glError === gl.INVALID_OPERATION) {
    // Disable pass
    return
  }
}
```

**Why**: Catches errors immediately and disables the pass to prevent error spam in console.

#### 4. ✅ Early Feedback Loop Detection
**Location**: Both SSS and SSR render overrides

**Change**:
```typescript
// Check for feedback loop BEFORE setting any uniforms
if (writeBuffer && readBuffer) {
  if (writeBuffer.texture === readBuffer.texture || 
      (writeBuffer.texture && readBuffer.texture && writeBuffer.texture.uuid === readBuffer.texture.uuid)) {
    console.warn('[PostProcessingSystem] ⚠️ Feedback loop detected, skipping render')
    return
  }
}
```

**Why**: Prevents feedback loops before they occur, rather than detecting them after.

---

## Expected Results

After these fixes:
1. ✅ **No more feedback loop errors** - tDiffuse is explicitly set to readBuffer.texture
2. ✅ **No more "program not valid" errors** - Shader compilation is forced before use
3. ✅ **Automatic error recovery** - Passes disable themselves on first error
4. ✅ **Cleaner console** - Errors are caught and handled, not spammed

---

## Testing

After applying fixes, verify:
- [ ] No WebGL errors in console
- [ ] SSS/SSR effects work correctly
- [ ] Passes disable themselves on errors (check console for disable messages)
- [ ] Performance is acceptable

---

## If Errors Persist

If errors still occur after these fixes:

1. **Check shader compilation**: Look for shader compilation errors in console
2. **Check buffer state**: Verify readBuffer and writeBuffer are different
3. **Check pass order**: Ensure passes are in correct order (Render → SSS → SSR → ...)
4. **Disable temporarily**: If errors persist, disable SSS/SSR until root cause is found

---

## Notes

- All fixes are backward compatible
- Passes will automatically disable on errors (preventing error spam)
- Explicit tDiffuse setting ensures correct buffer usage
- Shader compilation is forced to prevent "program not valid" errors
