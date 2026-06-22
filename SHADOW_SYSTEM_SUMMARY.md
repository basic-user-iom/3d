# Shadow System Issues - Summary for Perplexity

## Quick Summary
Shadow system has inconsistencies when switching between:
- **Weather GL (CSM)** - Cascaded Shadow Maps
- **Standard Shadows** - Three.js directional lights
- **HDR System** - High Dynamic Range environment

## Main Problems

1. **Light positions not restored atomically** - Saved but restored after system switch
2. **Lights hidden incorrectly** - `ShadowManager` sets `light.visible = false` when disabling shadows
3. **HDR disable logic incomplete** - May not detect correct shadow system to restore
4. **Race conditions** - Multiple `setTimeout`/`requestAnimationFrame` calls cause timing issues
5. **Material state not preserved** - CSM uniforms may remain after switching away
6. **Shadow plane state lost** - Visibility and material properties not consistently managed

## Key Files
- `SHADOW_SYSTEM_ANALYSIS_REPORT.md` - Detailed analysis
- `PERPLEXITY_SHADOW_SYSTEM_QUERY.md` - Complete query with code snippets

## Next Steps
1. Review `PERPLEXITY_SHADOW_SYSTEM_QUERY.md`
2. Submit to Perplexity for analysis
3. Implement recommended fixes
























