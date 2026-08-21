# describe-panel.ts

## Purpose

Pure "what to draw where" description for a text panel. Both rendering
backends (Canvas and HTML-in-3D) consume this one model — the Canvas backend
draws it with 2D calls, the HTML backend positions elements at the same
pixel rectangles — which is what keeps the two backends visually identical
(so a fallback swap is transparent) and avoids duplicating the layout math
between them.

## Public API

- **`PxRect`** — `{ x, y, w, h }` in canvas pixels (origin top-left).
- **`DrawLine`** — `{ text, xPx, yPx }` (`yPx` is the top of the line).
- **`DrawButton`** — `{ rectPx: PxRect, enabled: boolean }`.
- **`PanelDrawModel`** — everything a backend needs to paint one frame:
  canvas size, colors, font metrics, `lines: readonly DrawLine[]`,
  `prev`/`next: DrawButton`, `indicator: { rectPx, text }`.
- **`describePanel(page: readonly string[], style: ResolvedTextStyle, nav: { canPrev, canNext, label }): PanelDrawModel`**.

## Invariants & assumptions

- Pixel origin is top-left (canvas convention); text is drawn baseline-top,
  one line every `style.lineHeightPx`.
- Depends on `canvas-panel.ts` (`toPx`) and `page-layout.ts`
  (`PAGE_PANEL_LAYOUT`) for the pixel rects, and `text-style.ts`'s
  `ResolvedTextStyle` for sizing/colors.

## Examples

```ts
import { describePanel } from 'gps-plus-slam-app-framework/visualization';

const model = describePanel(['Hello', 'world'], resolvedStyle, {
  canPrev: false,
  canNext: true,
  label: '1 / 3',
});
```

## Tests

- `describe-panel.test.ts` — line positions from a page of wrapped text, and
  button/indicator rects + enabled state from the nav flags.
