# Next Steps for ViewerCanvas Integration

## Current Status ✅

- All 8 hooks created and ready
- Hook imports added to ViewerCanvas.tsx
- Integration plan documented
- Ready for actual integration

## Integration Options

### Option 1: Incremental Integration (Recommended)
**Pros**: Safe, testable, maintains functionality
**Cons**: Takes longer, requires careful testing

**Steps**:
1. Add hook calls at component level
2. Use hooks when available, fallback to existing code
3. Test after each hook
4. Gradually replace old code
5. Remove old code when all hooks work

### Option 2: New Component Approach
**Pros**: Clean slate, no risk to existing code
**Cons**: More work, need to maintain both

**Steps**:
1. Create ViewerCanvasV2.tsx using hooks
2. Test thoroughly
3. Replace ViewerCanvas when stable
4. Remove old ViewerCanvas

### Option 3: Gradual Feature Migration
**Pros**: Lowest risk, can test each feature
**Cons**: Most time-consuming

**Steps**:
1. Keep existing ViewerCanvas
2. Migrate one feature at a time to hooks
3. Test each migration
4. Eventually replace entire component

## Recommended Next Action

**Option 1 (Incremental)** is recommended because:
- Hooks are ready and tested
- Can integrate safely
- Can test incrementally
- Maintains backward compatibility

## Integration Checklist

- [ ] Add useThreeScene hook call
- [ ] Add useThreeControls hook call
- [ ] Add useThreeLighting hook call
- [ ] Add useThreeShadows hook call
- [ ] Add useThreeEffects hook call
- [ ] Add useThreeModelLoader hook call
- [ ] Add useThreeObjectManager hook call
- [ ] Add useThreeAnimation hook call
- [ ] Build ViewerInstance from hook results
- [ ] Test scene rendering
- [ ] Test camera controls
- [ ] Test lighting
- [ ] Test shadows
- [ ] Test post-processing
- [ ] Test model loading
- [ ] Test object selection
- [ ] Test animation loop
- [ ] Remove old initialization code

## Files Ready for Integration

All hooks are in `src/viewer/hooks/` and ready to use.














