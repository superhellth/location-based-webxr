# page-layout.ts

## Purpose

Pure layout + hit-mapping for a paginated text panel: a billboarded plane
showing wrapped text with a footer bar (Prev button, page indicator, Next
button). Owns the one description of _where_ those controls sit — normalized
UV rectangles — so the same layout both positions the pixels
(`describe-panel.ts`) and decides what a tap means (`hitToPageIntent`).
Interaction is therefore correct by construction and identical across both
rendering backends.

## Public API

- **`PagePanelLayout`** — `{ text: Rect, prev: Rect, indicator: Rect, next: Rect }`.
- **`PAGE_PANEL_LAYOUT: PagePanelLayout`** — the default layout (text area
  upper region; Prev/indicator/Next along the footer).
- **`PageIntent`** — `{ type: 'prev' } | { type: 'next' } | null`.
- **`hitToPageIntent(uv, nav: { canPrev, canNext }, layout = PAGE_PANEL_LAYOUT): PageIntent`**
  — a Prev/Next hit only fires when that direction is currently available; a
  hit on a dimmed edge button, the text, the indicator, or chrome is `null`.
- **`paginate(lines: readonly string[], linesPerPage: number): string[][]`**
  — chunks wrapped lines into fixed-height pages. Always returns at least
  one page (`[[]]` for empty input), so the panel chrome always has
  something to render. Throws if `linesPerPage < 1`.

## Invariants & assumptions

- UV convention matches `THREE.PlaneGeometry` intersection UVs: origin
  `(0,0)` is the bottom-left of the front face.
- Depends on `panel-geometry.ts` only (`contains`, `Rect`).

## Examples

```ts
import {
  hitToPageIntent,
  paginate,
} from 'gps-plus-slam-app-framework/visualization';

const pages = paginate(['line 1', 'line 2', 'line 3'], 2); // [['line 1','line 2'], ['line 3']]
hitToPageIntent({ u: 0.75, v: 0.15 }, { canPrev: true, canNext: true }); // { type: 'next' }
```

## Tests

- `page-layout.test.ts` — Prev/Next hit resolution gated on availability, a
  chrome/text-area hit resolving to `null`, and `paginate` chunking
  (including the empty-input single-empty-page case and the
  `linesPerPage < 1` throw).
