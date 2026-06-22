# Pre-Consolidation Checklist

**Date:** 2025-01-27  
**Purpose:** Ensure codebase is ready for consolidation refactoring

---

## ✅ Pre-Consolidation Steps

### 1. **Code Quality Checks**
- [x] Linting errors: **0 errors** (checked)
- [ ] TypeScript compilation: **Need to verify**
- [ ] Import validation: **Need to verify**

### 2. **Test Baseline**
- [ ] Run existing tests: `npm run test`
- [ ] Verify all tests pass before changes
- [ ] Document current test results

### 3. **Backup/Version Control**
- [ ] Check git status (if using git)
- [ ] Create backup branch: `git checkout -b refactor/consolidate-shaders`
- [ ] Or create manual backup of files to be modified

### 4. **Dev Server Verification**
- [ ] Start dev server: `npm run dev`
- [ ] Verify app loads without errors
- [ ] Quick smoke test: Load model, check post-processing works

### 5. **Files to Modify**
- [ ] `src/viewer/postprocessing/SSSShader.ts`
- [ ] `src/viewer/postprocessing/SSRShader.ts`
- [ ] `src/viewer/postprocessing/LUTShader.ts`
- [ ] `src/viewer/postprocessing/AnamorphicShader.ts`
- [ ] `src/viewer/postprocessing/ToneMappingShader.ts`
- [ ] `src/viewer/postprocessing/ColorGradingShader.ts`
- [ ] `src/viewer/postprocessing/DepthPassShader.ts`
- [ ] `src/viewer/postprocessing/NormalPassShader.ts`
- [ ] Create new: `src/viewer/postprocessing/shared/CommonShaders.ts`

---

## 📋 Consolidation Plan

### **Phase 1: Extract Common Vertex Shader** (Low Risk)
1. Create `src/viewer/postprocessing/shared/CommonShaders.ts`
2. Extract vertex shader to shared constant
3. Update all shader files to import and use shared shader
4. Test each shader still works

### **Phase 2: Verify & Test** (Critical)
1. Run TypeScript compilation
2. Run tests
3. Manual browser testing
4. Verify no regressions

---

## 🎯 Success Criteria

- ✅ All shaders use shared vertex shader
- ✅ No TypeScript errors
- ✅ All tests pass
- ✅ Dev server runs without errors
- ✅ Post-processing effects still work
- ✅ Code reduction: ~50 lines removed

---

## ⚠️ Rollback Plan

If issues occur:
1. Revert changes: `git checkout -- src/viewer/postprocessing/`
2. Or restore from backup
3. Document issues for future reference
















































