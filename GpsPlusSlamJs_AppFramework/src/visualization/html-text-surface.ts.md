# html-text-surface.ts

## Purpose

The HTML-in-3D text backend (view layer) — the primary rendering path.
Builds an offscreen DOM subtree from a `PanelDrawModel` and rasterizes it to
a texture with `three-html-render` (which renders the DOM through an SVG
`<foreignObject>`). This is the approach used first because it renders
reliably inside immersive WebXR, where a DOM/CSS overlay does not.

The offscreen root is detached from the visible page (a 0×0
`overflow:hidden` clip wrapper, `aria-hidden`, `pointer-events:none`) but
still lays out at full size, so it exists only to be rasterized, never
painted. Rasterization is asynchronous; `render` double-buffers (the
previous texture image stays until the new raster lands) and `settled()`
exposes the latest raster promise so a caller (`in-world-text.ts`) can time
it out and fall back to Canvas if it throws or stalls. The markup is
self-contained (system fonts, inline styles, no cross-origin resources) so
the raster is never tainted.

## Public API

- **`createHtmlTextSurface(deps: SurfaceDeps): TextSurface`** (see
  `text-surface.ts` for the contract).

## Invariants & assumptions

- `three-html-render` is loaded via a lazy `import()` on first render, never
  a static import — it patches DOM globals at module-eval time and must
  never load in a non-DOM (Node/vitest) context. The loader is memoized so
  the polyfill installs once.
- A raster that comes back ≤1px in either dimension, or off the expected 4:3
  aspect by more than 0.01, is treated as degenerate and rejected — a bad
  raster otherwise uploads blank without ever throwing, which would
  otherwise surface only as an uncatchable GL warning downstream.
- A superseded in-flight raster (a newer `render` call landed first) is
  discarded via a monotonic token; only the latest raster ever updates the
  texture.
- **Requires `three-html-render` as a peer dependency** (optional — only
  needed if this backend is actually used; `canvas-text-surface.ts` has no
  such dependency).

## Examples

```ts
import { createHtmlTextSurface } from 'gps-plus-slam-app-framework/visualization';

const surface = createHtmlTextSurface({
  canvasW: 1024,
  canvasH: 768,
  maxAnisotropy: 4,
});
surface.render(model);
await surface.settled(); // or race it against a timeout
```

## Tests

- No dedicated test file — DOM/rasterizer glue that only runs in a browser;
  exercised manually and transitively via `in-world-text.ts`'s
  fallback-timeout wiring (`in-world-text.test.ts`, which injects a fake
  `SurfaceFactory` rather than loading the real rasterizer).
