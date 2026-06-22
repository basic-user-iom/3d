# Hook-Based Viewer Testing Checklist

## Pre-Testing Setup

### Prerequisites
- ✅ Dev server running (`npm run dev`)
- ✅ Browser console open (F12)
- ✅ Feature flag enabled (`useHookBasedViewer: true`)

### Console Commands Available
```javascript
// Performance tracking
window.getPerformanceReport()
window.getHookTimings()
window.exportPerformanceData()

// Feature flag testing
window.testFeatureFlag()
window.getFeatureFlagState()
window.getViewerInfo()

// Performance analysis
window.analyzePerformance()
window.getPerformanceSummary()
```

## Test Categories

### 1. Initialization Tests ✅

#### Test 1.1: Hook Initialization
- [ ] All 8 hooks initialize successfully
- [ ] Console shows initialization messages for each hook
- [ ] No errors in console
- [ ] ViewerInstance built successfully

**Expected Console Output:**
```
[useThreeScene] Scene initialized
[useThreeControls] Controls initialized
[useThreeLighting] Lighting system initialized
[useThreeShadows] Shadow system initialized
[useThreeEffects] Effects system initialized
[useThreeModelLoader] Model loader initialized
[useThreeObjectManager] Object manager initialized
[useThreeAnimation] Animation loop initialized
[ViewerCanvas] ✅ ViewerInstance built successfully from hook results
```

#### Test 1.2: Performance Tracking
- [ ] Performance tracking active
- [ ] Hook timings captured
- [ ] Total initialization time logged

**Verify:**
```javascript
const report = window.getPerformanceReport()
console.log('Hook timings:', report.hookTimings)
console.log('Total time:', report.totalTime)
```

### 2. Feature Functionality Tests

#### Test 2.1: Camera Controls
- [ ] Orbit (drag) works smoothly
- [ ] Pan (middle mouse) works
- [ ] Zoom (scroll) works
- [ ] Camera bounds respected
- [ ] Controls damping works

#### Test 2.2: Lighting System
- [ ] Ambient light visible
- [ ] Directional lights work
- [ ] Light helpers visible (if enabled)
- [ ] Light gizmos interactive
- [ ] Light intensity adjustable

#### Test 2.3: Shadow System
- [ ] Shadows render correctly
- [ ] Shadow system switches work (standard/CSM)
- [ ] Shadow plane visible (if enabled)
- [ ] Shadow quality acceptable

#### Test 2.4: Post-Processing
- [ ] Post-processing toggle works
- [ ] Bloom effect works
- [ ] Tone mapping works
- [ ] Color grading works
- [ ] LUT works (if loaded)

#### Test 2.5: Model Loading
- [ ] Drag & drop model loading works
- [ ] Model appears in scene
- [ ] Materials applied correctly
- [ ] Textures load correctly
- [ ] Model can be selected

#### Test 2.6: Object Management
- [ ] Object selection works
- [ ] Transform controls work
- [ ] Gizmo appears on selection
- [ ] Object can be moved/rotated/scaled
- [ ] Selection persists

#### Test 2.7: Animation Loop
- [ ] Animation loop running
- [ ] Frame rate stable
- [ ] No stuttering
- [ ] Performance acceptable

### 3. Performance Tests

#### Test 3.1: Initialization Performance
- [ ] Total initialization < 500ms (target)
- [ ] No hooks taking > 100ms
- [ ] Memory usage reasonable

**Verify:**
```javascript
const report = window.getPerformanceReport()
const analysis = window.analyzePerformance()
console.log(analysis.recommendations)
```

#### Test 3.2: Render Performance
- [ ] Stable FPS (60 FPS target with vsync)
- [ ] Frame limiting works (if set)
- [ ] VSync works correctly
- [ ] No frame drops

#### Test 3.3: Memory Usage
- [ ] Memory usage stable
- [ ] No memory leaks
- [ ] Cleanup works on unmount

### 4. Feature Flag Tests

#### Test 4.1: Toggle Functionality
- [ ] Feature flag can be toggled via UI
- [ ] Feature flag can be toggled via console
- [ ] Page reload required (expected)
- [ ] Both paths work correctly

**Test Steps:**
1. Open Rendering Quality Panel
2. Scroll to Developer section
3. Toggle "Hook-Based Viewer" checkbox
4. Reload page
5. Verify correct path is used

#### Test 4.2: Path Comparison
- [ ] Hook-based path: All hooks initialize
- [ ] Existing path: Old initialization runs
- [ ] Both render same scene
- [ ] Performance comparison available

### 5. Edge Cases

#### Test 5.1: Container Not Ready
- [ ] Hooks wait for container
- [ ] No errors when container null
- [ ] Initialization happens when container ready

#### Test 5.2: Config Changes
- [ ] Hooks re-initialize when config changes
- [ ] Cleanup happens correctly
- [ ] No memory leaks

#### Test 5.3: Rapid Toggles
- [ ] Feature flag toggle doesn't crash
- [ ] System handles rapid changes
- [ ] Cleanup happens correctly

### 6. Integration Tests

#### Test 6.1: All Systems Together
- [ ] Scene + Controls + Lighting work together
- [ ] Shadows + Effects work together
- [ ] Model loading + Object management work together
- [ ] Animation loop coordinates all systems

#### Test 6.2: State Persistence
- [ ] Settings persist across reloads
- [ ] Feature flag state persists
- [ ] Performance settings persist

## Performance Benchmarks

### Target Metrics
- **Initialization Time**: < 500ms
- **Hook Initialization**: < 100ms per hook
- **Frame Rate**: 60 FPS (with vsync)
- **Memory Usage**: Stable, no leaks

### Current Metrics (To Be Measured)
```javascript
// Run after initialization
const report = window.getPerformanceReport()
console.log('Initialization:', report.totalTime, 'ms')
console.log('Hook timings:', report.hookTimings)
console.log('Memory:', report.memoryUsage ? (report.memoryUsage / 1024 / 1024).toFixed(2) + 'MB' : 'N/A')
```

## Validation Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No linter errors
- [ ] All hooks follow same pattern
- [ ] Proper cleanup in all hooks
- [ ] Error handling in place

### Performance
- [ ] Config objects memoized
- [ ] Frame limiting works
- [ ] VSync works
- [ ] Performance tracking active

### Functionality
- [ ] All features work
- [ ] No regressions
- [ ] Edge cases handled
- [ ] Error recovery works

## Test Results Template

```markdown
## Test Results - [Date]

### Initialization
- Total Time: ___ ms
- Hook Timings: ___
- Status: ✅ / ❌

### Features
- Camera Controls: ✅ / ❌
- Lighting: ✅ / ❌
- Shadows: ✅ / ❌
- Post-Processing: ✅ / ❌
- Model Loading: ✅ / ❌
- Object Management: ✅ / ❌
- Animation: ✅ / ❌

### Performance
- FPS: ___
- Memory: ___ MB
- Status: ✅ / ❌

### Issues Found
- [List any issues]
```

## Next Steps After Testing

1. **If All Tests Pass**: ✅ Ready for production
2. **If Issues Found**: Document and fix
3. **Performance Issues**: Use analysis tools to identify bottlenecks
4. **Feature Issues**: Test with feature flag disabled to compare














