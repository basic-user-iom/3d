# Integration Testing Plan - Hooks with 3D Viewer

## Test Objectives

1. Verify all 8 hooks are properly integrated in ViewerCanvas.tsx
2. Verify hooks initialize in correct sequence
3. Verify ViewerInstance builds from hook results
4. Verify animation loop starts correctly
5. Verify all systems work together

## Test Strategy

### Phase 1: Static Code Analysis
- [ ] Check ViewerCanvas.tsx for hook imports
- [ ] Check ViewerCanvas.tsx for hook calls
- [ ] Verify config creation logic
- [ ] Verify ViewerInstance building logic
- [ ] Check dependency arrays

### Phase 2: Runtime Testing
- [ ] Test hook initialization sequence
- [ ] Test ViewerInstance building
- [ ] Test animation loop
- [ ] Test cleanup on unmount
- [ ] Test re-initialization

### Phase 3: Integration Testing
- [ ] Test all systems work together
- [ ] Test error handling
- [ ] Test memory leaks
- [ ] Test performance

## Test Cases

### TC1: Hook Imports
**Objective:** Verify all hooks are imported
**Steps:**
1. Open ViewerCanvas.tsx
2. Check for imports from './hooks/useThree*'
3. Verify all 8 hooks are imported

**Expected:**
```typescript
import { useThreeScene } from './hooks/useThreeScene'
import { useThreeControls } from './hooks/useThreeControls'
import { useThreeLighting } from './hooks/useThreeLighting'
import { useThreeShadows } from './hooks/useThreeShadows'
import { useThreeEffects } from './hooks/useThreeEffects'
import { useThreeModelLoader } from './hooks/useThreeModelLoader'
import { useThreeObjectManager } from './hooks/useThreeObjectManager'
import { useThreeAnimation } from './hooks/useThreeAnimation'
```

### TC2: Hook Calls
**Objective:** Verify all hooks are called at top level
**Steps:**
1. Check ViewerCanvas component
2. Verify hooks are called unconditionally
3. Verify hooks are called in correct order

**Expected:**
```typescript
const sceneResult = useThreeScene(sceneConfig)
const controlsResult = useThreeControls(controlsConfig)
const lightingResult = useThreeLighting(lightingConfig)
const shadowsResult = useThreeShadows(shadowsConfig)
const effectsResult = useThreeEffects(effectsConfig)
const modelLoaderResult = useThreeModelLoader(modelLoaderConfig)
const objectManagerResult = useThreeObjectManager(objectManagerConfig)
const animationResult = useThreeAnimation(animationConfig)
```

### TC3: Config Creation
**Objective:** Verify configs are created correctly
**Steps:**
1. Check sceneConfig creation
2. Check controlsConfig creation (depends on sceneResult)
3. Check all other configs
4. Verify null handling

**Expected:**
- Configs are null until dependencies available
- Configs are created when dependencies ready
- No errors when configs are null

### TC4: ViewerInstance Building
**Objective:** Verify ViewerInstance builds from hooks
**Steps:**
1. Check useMemo for hookBasedViewer
2. Verify all hook results are checked
3. Verify ViewerInstance is built correctly
4. Check dependency array

**Expected:**
- useMemo checks all 8 hook results
- ViewerInstance built when all hooks ready
- Dependency array includes all hook results

### TC5: Animation Loop
**Objective:** Verify animation loop starts
**Steps:**
1. Check useEffect that uses hookBasedViewer
2. Verify animationResult?.start() is called
3. Check cleanup calls animationResult?.stop()

**Expected:**
- Animation loop starts when ViewerInstance ready
- Animation loop stops on cleanup

## Test Execution

### Step 1: Static Analysis
Run code analysis to check integration

### Step 2: Browser Testing
1. Start dev server: `npm run dev`
2. Open browser console
3. Check for hook initialization logs
4. Verify ViewerInstance build
5. Check for errors

### Step 3: Console Log Verification
Expected console output:
```
[useThreeScene] Scene initialized
[useThreeControls] Controls initialized
[useThreeLighting] Lighting system initialized
[useThreeShadows] Shadow system initialized
[useThreeEffects] Effects system initialized
[useThreeModelLoader] Model loader initialized
[useThreeObjectManager] Object manager initialized
[useThreeAnimation] Animation loop initialized
[useThreeAnimation] Animation loop started
[ViewerCanvas] ✅ ViewerInstance built successfully from hook results
[ViewerCanvas] ✅ Using hook-based ViewerInstance
```

## Success Criteria

✅ All hooks imported
✅ All hooks called at top level
✅ Configs created correctly
✅ ViewerInstance builds successfully
✅ Animation loop starts
✅ No React warnings
✅ No errors in console
✅ All systems work correctly

## Failure Scenarios

### F1: Hooks Not Imported
**Symptom:** TypeScript errors about missing imports
**Fix:** Add missing imports

### F2: Hooks Not Called
**Symptom:** Hooks don't initialize
**Fix:** Add hook calls at component top level

### F3: Config Creation Errors
**Symptom:** Configs are always null or errors
**Fix:** Fix config creation logic

### F4: ViewerInstance Not Building
**Symptom:** hookBasedViewer is always null
**Fix:** Check useMemo logic and dependencies

### F5: Animation Loop Not Starting
**Symptom:** No animation, scene not rendering
**Fix:** Check animationResult?.start() call

## Test Report Template

```
Test Date: [DATE]
Tester: [NAME]
Environment: [BROWSER/OS]

Results:
- TC1: Hook Imports - [PASS/FAIL]
- TC2: Hook Calls - [PASS/FAIL]
- TC3: Config Creation - [PASS/FAIL]
- TC4: ViewerInstance Building - [PASS/FAIL]
- TC5: Animation Loop - [PASS/FAIL]

Issues Found:
1. [ISSUE]
2. [ISSUE]

Next Steps:
1. [ACTION]
2. [ACTION]
```












