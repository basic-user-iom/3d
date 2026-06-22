# ViewerCanvas Integration Approach

## Challenge Identified

**React Rules of Hooks Violation**: Hooks cannot be called conditionally or inside useEffect. They must be called at the top level of the component.

**Current Issue**: 
- `containerRef.current` is null initially
- Hooks need the container element to initialize
- Can't conditionally call hooks based on ref

## Solution Options

### Option 1: Always Call Hooks (Recommended)
**Approach**: Always call hooks at top level, handle null cases inside hooks
- Hooks return null if config is null
- useEffect checks if hooks returned results
- Use hook results when available, fallback to existing code

**Pros**: Follows React rules, safe, gradual migration
**Cons**: Hooks run even when container not ready (but return null)

### Option 2: Hybrid Approach
**Approach**: Use hooks for some systems, keep existing code for others
- Use hooks for independent systems (lighting, shadows)
- Keep existing code for complex systems (scene, controls)
- Gradually migrate over time

**Pros**: Lower risk, can test incrementally
**Cons**: Mixed approach, more code to maintain

### Option 3: Conditional Hook Pattern
**Approach**: Use a wrapper hook that handles conditional logic
- Create `useViewerInitialization` hook
- This hook calls other hooks conditionally
- Main component always calls wrapper hook

**Pros**: Clean separation, follows React rules
**Cons**: More abstraction, need to create wrapper

## Recommended: Option 1

Always call hooks at top level, handle null in hooks:

```typescript
// Always call hooks (React rules)
const sceneResult = useThreeScene(containerRef.current ? config : null)
const controlsResult = useThreeControls(sceneResult ? config : null)

// In useEffect, use results when available
useEffect(() => {
  if (sceneResult && controlsResult) {
    // Use hook results
  } else {
    // Fallback to existing initialization
  }
}, [sceneResult, controlsResult])
```

## Implementation Strategy

1. **Phase 1**: Add hooks alongside existing code (current)
2. **Phase 2**: Use hook results when available
3. **Phase 3**: Test thoroughly
4. **Phase 4**: Remove old code when hooks work

## Status

- ✅ Hooks created
- ✅ Imports added
- ⏳ Integration in progress
- ⏳ Need to handle conditional initialization properly














