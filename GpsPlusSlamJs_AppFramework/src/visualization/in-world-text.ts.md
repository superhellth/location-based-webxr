# in-world-text.ts

## Purpose

The in-world text label (view layer / composition unit): composes the pure
core into one Three.js object — a billboarded plane whose texture is a
paginated, styled text panel. Owns page-navigation state (not a store — it's
per-label, ephemeral view state), yaws to face the user
(`billboard-math.ts`), and renders through a swappable `TextSurface`.

Owns the HTML→Canvas fallback: the primary HTML-in-3D backend is tried
first, and if a render throws or does not settle within
`htmlRenderTimeoutMs` the label swaps to the Canvas backend and re-renders —
at construction _or_ later (e.g. after entering an XR session), because
every render is guarded the same way. The rendering surface and the width
measurer are both injectable so the fallback wiring is unit-testable with no
DOM/GPU.

## Public API

- **`TextLabelUserData`** — `{ textLabelId: string }`, stamped onto the
  pickable mesh so a raycaster hit can be resolved back to a label (see
  `text-interaction.ts`).
- **`InWorldTextOptions`** — `{ text, position: Vector3, id?, maxWidthMeters?, style?: Partial<TextStyle>, backend?: 'auto'|'html'|'canvas', htmlRenderTimeoutMs?, maxAnisotropy?, measure?: Measure, createSurface?: SurfaceFactory }`.
  `measure`/`createSurface` are the test injection seams.
- **`InWorldText`** — `{ id, group: Group, pickMesh: Mesh, ready: Promise<void>, pageLabel: string, activeBackend: SurfaceKind, faceCamera(cameraPos), next(), prev(), setText(text), hitTest(uv): PageIntent, dispose() }`.
- **`createInWorldText(options: InWorldTextOptions): InWorldText`**.

## Invariants & assumptions

- `backend: 'canvas'` forces the fallback permanently; any other value tries
  HTML first with the timeout/error net.
- A render is always "guarded": `renderGuarded` calls `surface.render`, then
  races `surface.settled()` against `htmlRenderTimeoutMs` — any throw or
  timeout triggers `swapToCanvas()`, which is a no-op once already on Canvas.
- `next()`/`prev()`/`setText()` all update state synchronously, then
  fire-and-forget a fresh guarded render (`refresh`) — they do not await the
  new frame landing.
- `dispose()` disposes the active surface, geometry, and material, and
  detaches `group` from its parent (if attached).
- Depends on `three`, `billboard-math.ts`, `describe-panel.ts`,
  `page-layout.ts`, `text-page-state.ts`, `text-style.ts`, `text-wrap.ts`,
  `canvas-text-surface.ts`, `html-text-surface.ts`, and `text-surface.ts`.

## Examples

```ts
import { createInWorldText } from 'gps-plus-slam-app-framework/visualization';

const label = createInWorldText({
  text: 'Sir Aldric guarded this gate for thirty winters.',
  position: new Vector3(0, 1.8, -1),
});
scene.add(label.group);
await label.ready;
// per frame:
label.faceCamera(camera.position);
// on a Next tap:
label.next();
```

## Tests

- `in-world-text.test.ts` — the HTML→Canvas fallback swap on both a thrown
  render and a `settled()` timeout, `next`/`prev`/`setText` driving
  `pageLabel` and triggering a fresh guarded render, and `dispose` cleaning
  up the active surface/geometry/material.
