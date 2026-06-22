# Remaining Tasks

## ✅ Completed
1. ✅ Backup created
2. ✅ Bridge extended with Streets GL control methods
3. ✅ Streets GL handlers implemented
4. ✅ Panels updated (LightingPanel, WeatherPanel)
5. ✅ Old shadow diagnostics disabled
6. ✅ Basic integration complete

## ⚠️ Partially Complete / Needs Work

### 1. Sun Color Implementation (Incomplete)
**Status**: Handler exists but not fully implemented
**Location**: `streets-gl-alt/src/app/ExternalObjectBridge.ts:472`
**Issue**: Comment says "may need to update shader uniforms"
**Action Needed**: 
- Research how Streets GL sets light color in shaders
- Find the correct uniform/parameter to update
- Implement proper color setting

### 2. Sun Direction Calculation (Needs Verification)
**Status**: Implemented but needs testing
**Location**: `src/components/LightingPanel.tsx` (sun direction calculation)
**Issue**: Direction vector calculation from target position may need coordinate system conversion
**Action Needed**:
- Test sun direction changes
- Verify coordinate system matches Streets GL's expectations
- Check if direction needs normalization or transformation

### 3. CSM Intensity Property (Needs Verification)
**Status**: Code assumes `csm.intensity` exists
**Location**: `streets-gl-alt/src/app/ExternalObjectBridge.ts:466`
**Issue**: Need to verify CSM class actually has `intensity` property
**Action Needed**:
- Verify CSM.intensity is used correctly
- Check if intensity affects lighting or just shadows
- May need to update different property/system

### 4. Testing (Pending)
**Status**: Not tested yet
**Action Needed**:
- [ ] Enable Streets GL overlay
- [ ] Test shadow quality changes (low/medium/high)
- [ ] Test sun intensity slider
- [ ] Test sun color picker
- [ ] Test sun direction controls
- [ ] Verify shadows render correctly
- [ ] Verify water appears in Streets GL
- [ ] Test fallback when Streets GL is disabled

### 5. Code Cleanup (Optional)
**Status**: Old code commented but not removed
**Files**:
- `src/utils/shadowAutoFixer.ts` - Still exists (kept as fallback)
- `src/utils/shadowDiagnostics.ts` - Still exists (kept as fallback)
- `src/viewer/ViewerCanvas.tsx` - Shadow diagnostics commented out

**Action Needed**:
- Decide: Keep as fallback or remove completely?
- If removing: Delete files and clean up imports
- If keeping: Document why they're kept

### 6. Panel Cleanup (Optional)
**Status**: Some old controls still visible but disabled
**Location**: `src/components/LightingPanel.tsx`, `src/components/WeatherPanel.tsx`
**Action Needed**:
- Consider hiding old controls when Streets GL is active (instead of just disabling)
- Or add clearer visual indication that Streets GL systems are active

## 🔍 Research Needed

### 1. Streets GL Light Color System
- How does Streets GL control light color?
- Is it in CSM, shader uniforms, or separate system?
- What coordinate system/format does it use?

### 2. Sun Direction Coordinate System
- What coordinate system does Streets GL use for sun direction?
- Does it match Three.js coordinate system?
- Does direction need to be normalized?

### 3. Intensity vs Light Strength
- Does `csm.intensity` control shadow intensity or light intensity?
- May need separate property for actual light brightness

## 📋 Priority Order

1. **HIGH**: Test the integration (verify everything works)
2. **HIGH**: Fix sun color implementation (complete the handler)
3. **MEDIUM**: Verify CSM intensity property (check if it works)
4. **MEDIUM**: Test and fix sun direction calculation
5. **LOW**: Code cleanup (remove old files if not needed)
6. **LOW**: Panel UI improvements (hide vs disable)

## 🎯 Next Steps

1. **Immediate**: Test the current implementation
2. **If issues found**: Fix sun color, intensity, direction
3. **If working**: Clean up code and improve UI
4. **Documentation**: Update docs with any findings
