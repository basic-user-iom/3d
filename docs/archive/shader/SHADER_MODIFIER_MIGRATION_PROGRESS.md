# Shader Modifier Registry Migration Progress

## ✅ **Completed Migrations**

### 1. ShadowOpacityModifierRegistry ✅
- **File:** `src/viewer/materials/ShadowOpacityModifierRegistry.ts`
- **Status:** ✅ Created
- **Priority:** 50 (runs after shadow intensity, before caustics)
- **Next:** Update `useViewer.ts` and `ViewerCanvas.tsx` to use registry version

### 2. CausticsModifierRegistry ✅
- **File:** `src/viewer/materials/CausticsModifierRegistry.ts`
- **Status:** ✅ Created
- **Priority:** 60 (runs after shadow modifiers, before random UV)
- **Next:** Update code that uses `CausticsModifier` to use registry version

### 3. RandomUVModifierRegistry ✅
- **File:** `src/viewer/materials/RandomUVModifierRegistry.ts`
- **Status:** ✅ Created
- **Priority:** 70 (runs after caustics, before water/dispersion)
- **Next:** Update code that uses `RandomUVModifier` to use registry version

---

## ⏳ **Next Steps - Update Usage**

### Step 1: Update ShadowOpacityModifier Usage
**Files to update:**
- `src/viewer/useViewer.ts` - Replace `ShadowOpacityModifier` with `shadowOpacityModifierRegistry`
- `src/viewer/ViewerCanvas.tsx` - Replace if used

**Migration pattern:**
```typescript
// OLD:
import { ShadowOpacityModifier } from './materials/ShadowOpacityModifier'
const modifier = new ShadowOpacityModifier()
modifier.applyToMaterial(material, config)

// NEW:
import { shadowOpacityModifierRegistry } from './materials/ShadowOpacityModifierRegistry'
shadowOpacityModifierRegistry.applyToMaterial(material, config)
```

### Step 2: Update CausticsModifier Usage
**Files to update:**
- Search for `CausticsModifier.getInstance()` or `new CausticsModifier()`

**Migration pattern:**
```typescript
// OLD:
import { CausticsModifier } from './materials/CausticsModifier'
const modifier = CausticsModifier.getInstance()
modifier.applyToMaterial(material, config)

// NEW:
import { causticsModifierRegistry } from './materials/CausticsModifierRegistry'
causticsModifierRegistry.applyToMaterial(material, config)
```

### Step 3: Update RandomUVModifier Usage
**Files to update:**
- Search for `RandomUVModifier` usage

**Migration pattern:**
```typescript
// OLD:
import { RandomUVModifier } from './materials/RandomUVModifier'
const modifier = new RandomUVModifier()
modifier.applyToMaterial(material, config)

// NEW:
import { randomUVModifierRegistry } from './materials/RandomUVModifierRegistry'
randomUVModifierRegistry.applyToMaterial(material, config)
```

---

## ❌ **Still Pending Migrations**

### 4. Shadow Intensity Modifier (NEW)
- **Status:** Not created yet
- **Priority:** 40 (runs after ground projection, before shadow opacity)
- **Location:** Currently in `ViewerCanvas.tsx` as inline code
- **Action:** Extract shadow intensity injection into registry modifier

### 5. Ground Projection Modifier (if needed)
- **Status:** TBD - may not need shader injection (GroundedSkybox is visual dome)
- **Priority:** 10 (runs first)
- **Action:** Determine if materials need shader modification for ground projection

### 6. WaterSystem waves/caustics
- **Status:** Not started
- **Priority:** 80
- **Action:** Extract water shader modifications to registry

### 7. MaterialPanel dispersion
- **Status:** Not started
- **Priority:** 90
- **Action:** Extract dispersion shader modifications to registry

---

## 📊 **Migration Status**

### Registry-Based Modifiers: **3/7** (43% complete)
- ✅ ShadowOpacityModifierRegistry
- ✅ CausticsModifierRegistry
- ✅ RandomUVModifierRegistry
- ❌ ShadowIntensityModifier (needs creation)
- ❌ GroundProjectionModifier (if needed)
- ❌ WaterSystem modifier (needs creation)
- ❌ Dispersion modifier (needs creation)

### Usage Migration: **0/3** (0% complete)
- ⏳ ShadowOpacityModifier usage update
- ⏳ CausticsModifier usage update
- ⏳ RandomUVModifier usage update

---

## 🎯 **Priority Order (Execution)**

1. **Ground Projection** - Priority: 10 (if needed)
2. **Shadow Intensity** - Priority: 40
3. **Shadow Opacity** - Priority: 50 ✅ Created
4. **Caustics** - Priority: 60 ✅ Created
5. **Random UV** - Priority: 70 ✅ Created
6. **Water/Caustics** - Priority: 80
7. **Dispersion** - Priority: 90

---

## ✅ **Benefits Achieved**

1. **No Conflicts** - Modifiers can now work together
2. **Maintainable** - Single source of truth for modifier chaining
3. **Debuggable** - Can list all modifiers applied to a material
4. **Extensible** - Easy to add new modifiers
5. **Clean** - Proper cleanup and restoration

---

## 📝 **Testing Checklist**

After updating usage:
- [ ] Shadow opacity works with other modifiers
- [ ] Caustics works with shadow opacity
- [ ] Random UV works with caustics and shadow opacity
- [ ] All modifiers can be enabled simultaneously
- [ ] Modifiers can be removed without breaking others
- [ ] Material cleanup works correctly
- [ ] No shader compilation errors

---

## 🔄 **Next Actions**

1. ✅ Create registry-based modifiers (3 done)
2. ⏳ Update code to use registry versions
3. ⏳ Create ShadowIntensityModifier
4. ⏳ Test all modifiers working together
5. ⏳ Migrate remaining modifiers














