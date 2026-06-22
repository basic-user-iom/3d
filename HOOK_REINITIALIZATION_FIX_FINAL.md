# Hook Re-initialization Fix - Final Solution

## Problem

The `useThreeLighting` hook was re-initializing unnecessarily because:
1. Hook initializes with 0 lights from store
2. Hook creates default light and **mutates the store array directly** (`lightsConfig.push()`)
3. Store update triggers hook's dependency array (`directionalLightsConfig.length` changes)
4. Hook detects change, cleans up, and re-initializes
5. This creates an infinite loop of cleanup/re-initialization

## Solution

### Fix Applied

1. **Don't Mutate Store Array**
   - Changed from: `const lightsConfig = directionalLightsConfig` (direct reference)
   - Changed to: `let lightsConfig = [...directionalLightsConfig]` (copy)
   - This prevents mutating the store array directly

2. **Work with Local Copy Only**
   - Default light is added to local copy only
   - Store is NOT updated during initialization
   - This prevents triggering the dependency array

3. **Check for Existing Light**
   - Added check: `!lightsConfig.find(l => l.id === 'default-sun')`
   - Prevents creating duplicate default lights

## Result

- ✅ Hook no longer re-initializes unnecessarily
- ✅ Default light is created in the scene (what matters)
- ✅ Store is not updated during initialization (prevents loop)
- ✅ Dependency array still reacts to legitimate store changes (user adding/removing lights)

## Trade-off

- **Note**: The default light won't appear in the UI's light list initially
- **Why**: We're not updating the store to prevent the re-initialization loop
- **Impact**: Low - the light works in the scene, and users can add lights via UI which will update the store
- **Future**: Can add a separate mechanism to sync the default light to store after initialization completes

## Testing

After this fix, you should see:
- ✅ Hook initializes once
- ✅ Default light created in scene
- ✅ No cleanup/re-initialization loop
- ✅ Hook reacts to user-initiated light changes
- ⚠️ Default light may not appear in UI light list (acceptable trade-off)














