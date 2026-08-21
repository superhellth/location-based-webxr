# text-surface.ts

## Purpose

The swappable text-rendering backend seam. A `TextSurface` turns a pure
`PanelDrawModel` into a `THREE.Texture` on demand. Two implementations exist
— the HTML-in-3D backend (primary, `html-text-surface.ts`) and the
`CanvasTexture` backend (fallback, `canvas-text-surface.ts`) — and a caller
picks between them behind this one interface. Rendering may be asynchronous
(the HTML backend rasterizes off an SVG image), so `render` is
fire-and-forget and `settled()` exposes when the latest raster has landed —
what a caller races against a fallback timeout.

Also owns `createMeasure`, the one place a font turns into a
width-measuring function (an offscreen canvas `measureText`), shared by both
backends so wrapping/pagination match exactly regardless of which backend is
active.

## Public API

- **`SurfaceKind`** — `'html' | 'canvas'`.
- **`SurfaceDeps`** — `{ canvasW, canvasH, maxAnisotropy }`.
- **`TextSurface`** — `{ texture: Texture, render(model): void, settled(): Promise<void>, dispose(): void }`.
  `settled()` resolves when the most recent `render`'s raster completes;
  rejects if it failed. The Canvas backend resolves synchronously.
- **`SurfaceFactory`** — `(kind: SurfaceKind, deps: SurfaceDeps) => TextSurface`.
- **`createMeasure(fontPx: number, fontFamily: string): Measure`** — builds
  a width measurer backed by an offscreen 2D canvas at the given font.

## Invariants & assumptions

- `createMeasure` throws if a 2D canvas context is unavailable (browser-only;
  never call it in Node/SSR).
- Depends on `three` (`Texture` type only) and `describe-panel.ts`/
  `text-wrap.ts` for the types it threads through.

## Examples

```ts
import {
  createMeasure,
  type SurfaceFactory,
} from 'gps-plus-slam-app-framework/visualization';

const measure = createMeasure(40, 'system-ui, sans-serif');
const factory: SurfaceFactory = (kind, deps) =>
  kind === 'html' ? createHtmlTextSurface(deps) : createCanvasTextSurface(deps);
```

## Tests

- No dedicated test file — a pure type/DI seam plus one small DOM helper
  (`createMeasure`), exercised transitively through `in-world-text.test.ts`
  and each backend's own usage.
