# canvas-text-surface.ts

## Purpose

The `CanvasTexture` text backend (view layer) — the XR-safe fallback. Draws
a `PanelDrawModel` into a 2D canvas and exposes it as a
`THREE.CanvasTexture`. Fully synchronous (`settled()` resolves at once), so
it's what a caller swaps to if the HTML-in-3D backend throws or times out.
Filtering (mipmaps + anisotropy) keeps the text crisp when the panel is
approached or viewed at a grazing angle.

## Public API

- **`createCanvasTextSurface(deps: SurfaceDeps): TextSurface`** (see
  `text-surface.ts` for the `TextSurface`/`SurfaceDeps` contract).

## Invariants & assumptions

- Throws if a 2D canvas context is unavailable — browser-only.
- `render` fully clears and repaints the canvas each call.
- `settled()` always resolves immediately (synchronous backend).
- Depends on `three`, `canvas-panel.ts` (`roundRect`), and
  `describe-panel.ts`'s types.

## Examples

```ts
import { createCanvasTextSurface } from 'gps-plus-slam-app-framework/visualization';

const surface = createCanvasTextSurface({
  canvasW: 1024,
  canvasH: 768,
  maxAnisotropy: 4,
});
surface.render(model);
mesh.material.map = surface.texture;
```

## Tests

- No dedicated test file — view-layer canvas drawing, exercised manually and
  transitively via `in-world-text.ts`'s fallback-swap wiring
  (`in-world-text.test.ts`).
