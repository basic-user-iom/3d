# Hook Re-initialization Fix

## Problem

The `useThreeLighting` hook was re-initializing unnecessarily because:
1. Hook initializes with 0 lights from store
2. Hook creates default light and **mutates the store array directly** (`lightsConfig.push()`)
3. Store update triggers hook's dependency array (`directionalLightsConfig.length` changes)
4. Hook detects change, cleans up, and re-initializes
5. This creates an infinite loop of cleanup/re-initialization

## Solution

### Fix 1: Don't Mutate Store Array
- Changed from: `const lightsConfig = directionalLightsConfig` (direct reference)
- Changed to: `let lightsConfig = [...directionalLightsConfig]` (copy)
- This prevents mutating the store array directly

### Fix 2: Check for Existing Default Light
- Added check: `!lightsConfig.find(l => l.id === 'default-sun')`
- Prevents creating duplicate default lights
- Only updates store if light doesn't exist

### Fix 3: Use Store Method Instead of Direct Mutation
- Changed from: `lightsConfig.push(defaultSunLight)` (mutates array)
- Changed to: `useAppStore.getState().addDirectionalLight(defaultSunLight)` (proper store update)
- Only updates store if `directionalLightsConfig.length === 0` to prevent unnecessary updates

## Result

- Hook no longer re-initializes unnecessarily
- Default light is created only once
- Store updates properly without causing loops
- Dependency array still reacts to legitimate store changes (user adding/removing lights)

## Testing

After this fix, you should see:
- ✅ Hook initializes once
- ✅ Default light created
- ✅ No cleanup/re-initialization loop
- ✅ Store updates correctly
- ✅ Hook reacts to user-initiated light changes














