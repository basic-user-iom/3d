# Streets GL Integration Progress

## ✅ Completed

### 1. Backup Created
- Git commit created: "Backup before integrating Streets GL lighting/shadow/water systems"
- Can rollback if needed

### 2. System Analysis
- ✅ Analyzed Streets GL CSM shadow system
- ✅ Analyzed Streets GL directional light (sun) system  
- ✅ Analyzed Streets GL water system
- ✅ Created integration plan document

### 3. Bridge Extension
- ✅ Added `setShadowQuality()` method to StreetsGLBridge
- ✅ Added `setSunDirection()` method to StreetsGLBridge
- ✅ Added `setSunIntensity()` method to StreetsGLBridge
- ✅ Added `setSunColor()` method to StreetsGLBridge
- ✅ Added message handlers in ExternalObjectBridge:
  - `STREETS_GL_SET_SHADOW_QUALITY`
  - `STREETS_GL_SET_SUN_DIRECTION`
  - `STREETS_GL_SET_SUN_INTENSITY`
  - `STREETS_GL_SET_SUN_COLOR`

## 🚧 In Progress

### 4. Panel Updates
- ⏳ Update LightingPanel to use Streets GL bridge
- ⏳ Update WeatherPanel to use Streets GL bridge
- ⏳ Remove old Three.js light controls
- ⏳ Remove old shadow controls
- ⏳ Remove old water controls

## 📋 Remaining Tasks

### 5. Code Removal
- Remove `src/utils/shadowAutoFixer.ts`
- Remove `src/utils/shadowDiagnostics.ts`
- Remove old shadow code from `useViewer.ts`
- Remove old lighting code from `useViewer.ts`
- Remove old water code from `WeatherPanel.tsx`
- Clean up unused state from `useAppStore.ts`

### 6. Testing
- Test shadow quality changes
- Test sun direction/intensity changes
- Verify external objects still work
- Verify HDR compatibility
- Test when Streets GL overlay is active/inactive

## Architecture Notes

### Current State
- Streets GL runs in iframe (port 8081)
- Main app runs on port 3000
- Bridge communicates via postMessage
- External objects already integrated

### Integration Approach
1. **When Streets GL overlay is active**: Use Streets GL's systems
2. **When Streets GL overlay is inactive**: Keep basic Three.js fallback (or disable features)
3. **Panels control Streets GL**: All settings sent via bridge

### Compatibility
- ✅ External objects already use Streets GL materials
- ✅ Shadows already work for external objects
- ⚠️ HDR system needs verification
- ⚠️ Water system needs Streets GL overlay to be active

## Next Steps

1. Update LightingPanel to call bridge methods
2. Update WeatherPanel to call bridge methods  
3. Remove old systems
4. Test integration
5. Document usage


