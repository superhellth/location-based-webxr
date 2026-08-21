# text-interaction.ts

## Purpose

Pointer picking for an in-world text label (view layer): raycasts label
planes on a tap and reports the hit label id + local UV, which the label
turns into a Prev/Next intent via its own `hitTest`. The tap-vs-drag guard
and raycast mechanics live in `pointer-tap-picker.ts` (shared with the
billboard); this module owns only the label `userData` interpretation.

## Public API

- **`createTextInteraction(options: PointerTapPickerTargetOptions & { onHit(id, uv: { u, v }): void }): { dispose(): void }`**
  — wraps `createPointerTapPicker`; reads each hit's `userData` as
  `TextLabelUserData` and calls `onHit` when `textLabelId` is present, and
  the hit carries UV coordinates.

## Invariants & assumptions

- A hit with no `uv` (non-planar geometry) or no `textLabelId` in `userData`
  is silently ignored.
- Depends on `pointer-tap-picker.ts` and the `TextLabelUserData` type from
  `in-world-text.ts`.

## Examples

```ts
import { createTextInteraction } from 'gps-plus-slam-app-framework/visualization';

const interaction = createTextInteraction({
  domElement: renderer.domElement,
  camera,
  getPickTargets: () => labels.map((l) => l.pickMesh),
  onHit: (id, uv) => {
    const intent = labels.find((l) => l.id === id)?.hitTest(uv);
    if (intent?.type === 'next') labels.find((l) => l.id === id)?.next();
  },
});
```

## Tests

- Not unit-tested (thin routing over `pointer-tap-picker.ts`, itself covered
  by `pointer-tap-picker.test.ts`); exercised manually via the consuming
  demo.
