# Advanced Selection & Gizmo Guide

This guide explains how the viewer’s selection tooling works, including
marquee/shift-drag selection, pivot modes, and gizmo centering. Use it to debug
the current behavior or plan future improvements.

## Selection Modes

### Single Click

- Simple raycast pick (left click) selects the object under the cursor.
- Transform controls attach automatically when an object is selected.
- Clicking empty space clears the selection.

### Shift + Drag (Marquee)

- Hold `Shift`, then drag to draw a rectangle on screen.
- The overlay becomes active after a small drag threshold so camera orbiting
  stays responsive.
- When you release the mouse:
  1. The viewer calculates the screen-space bounding boxes for candidate meshes.
  2. It picks the best overlapping target (prioritizing the largest overlap).
  3. If nothing qualifies, the drag falls back to a single-click pick at the
     release point.
- Successful marquee selection automatically switches the gizmo to `translate`
  mode so you can move the object immediately.

> Tip: Only regular object selection is supported while in marquee mode—color
> picker, paint mode, polygon drawing, or face-editing disable the rectangle to
> avoid conflicts.

## Pivot & Gizmo Behavior

### Pivot Wrapper

- Selected objects are wrapped in a temporary `THREE.Group` (pivot wrapper).
- The wrapper’s origin becomes the anchor point for transform controls.
- Bounding-box helpers, gizmos, hotspots, and other helper meshes are ignored
  when computing the pivot to keep the gizmo centered on the actual model.

### Pivot Modes

- `center`: gizmo sits at the geometric center of the model.
- `bottom`: gizmo sits at the bottom of the bounding box (useful for cars or
  props you want to keep flush against the ground plane).

### Gizmo Recentering Flow

1. When an object is selected, the viewer either creates a new pivot wrapper or
   updates the existing one.
2. The model’s world matrix is preserved while the pivot is re-centered, so the
   object does not “jump” to the scene origin.
3. Bounding boxes exclude helper meshes via `computeModelBoundingBox` so the
   pivot isn’t skewed by leftover gizmo geometry.

## Troubleshooting

- **Pivot appears outside the model**: make sure helper meshes have
  `userData.isHelper = true` (or another ignored flag) so they don’t affect the
  bounding box.
- **Marquee rectangle does not show up**: confirm `Shift` is held and that no
  exclusive mode (color picker, painting, etc.) is active.
- **Car recenters to world origin**: typically caused by losing the original
  world matrix during pivot updates—ensure `updatePivotPosition` preserves
  transform data (already fixed in `pivotUtils.ts`).
- **Gizmo missing after marquee**: verify that `performMarqueeSelection`
  switches the transform mode to `translate` and attaches transform controls.

## Related Files

- `src/viewer/ViewerCanvas.tsx` – event handling for selection, marquee logic,
  and transform control wiring.
- `src/viewer/utils/pivotUtils.ts` – pivot wrapper creation, bounding box
  filtering, and gizmo centering.
- `src/store/useAppStore.ts` – stores selection state, pivot mode, and transform
  mode.


