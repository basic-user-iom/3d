# Submit This to Perplexity

## Quick Summary

We have a Three.js post-processing system with shadow and color issues. Need expert analysis and fixes.

## Main Issues

1. **Shadows not working** when post-processing enabled
2. **Colors washed out** (desaturated)
3. Need verification of implementation against Three.js best practices

## What to Provide to Perplexity

### Option 1: Complete Document (Recommended)
Send: **`PERPLEXITY_FINAL_ANALYSIS_REQUEST.md`**

This contains:
- Complete context
- All code file references
- Critical implementation details
- All identified bugs
- Specific questions
- Test suite information

### Option 2: Code Snippets
Send: **`PERPLEXITY_CODE_SNIPPETS.md`**

This contains:
- Critical code snippets only
- Focused questions
- Quick reference

### Option 3: Original Request
Send: **`PERPLEXITY_ANALYSIS_REQUEST.md`**

This is the original concise request.

## Recommended Approach

**Send both:**
1. **`PERPLEXITY_FINAL_ANALYSIS_REQUEST.md`** - Complete analysis request
2. **`PERPLEXITY_CODE_SNIPPETS.md`** - Critical code snippets for reference

## Key Questions to Ask Perplexity

1. How do Three.js examples preserve shadow maps in RenderPass?
2. What is the correct color space setup for post-processing?
3. How to prevent double tone mapping?
4. What is the correct pass order?
5. How to convert world-space light direction to screen space for SSS?
6. Should SSR camera matrices update every frame?
7. Better way to render depth/normals without material replacement?
8. How to optimize post-processing performance?
9. Are there memory leaks?

## Test Suite

Tests are available at: `window.postProcessingTests.runAllTests()`

Run in browser console after app loads.

## Files Ready

✅ `PERPLEXITY_FINAL_ANALYSIS_REQUEST.md` - Complete request
✅ `PERPLEXITY_CODE_SNIPPETS.md` - Code snippets
✅ `PERPLEXITY_ANALYSIS_REQUEST.md` - Original request
✅ `PERPLEXITY_COMPLETE_POST_PROCESSING_CODE.md` - Full code documentation
✅ `POST_PROCESSING_BUGS_AND_TESTS.md` - Bug report
✅ `POST_PROCESSING_TEST_SUITE.js` - Test suite (JS)
✅ `src/utils/postProcessingTestSuite.ts` - Test suite (TS, integrated)

## Next Steps

1. Copy content from `PERPLEXITY_FINAL_ANALYSIS_REQUEST.md`
2. Optionally include `PERPLEXITY_CODE_SNIPPETS.md` for code reference
3. Submit to Perplexity
4. Wait for analysis and recommendations
5. Apply fixes based on Perplexity's recommendations


























