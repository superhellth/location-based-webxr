# text-style.ts

## Purpose

Pure style + sizing resolution for an in-world text panel. Turns the
authorable `TextStyle` (fonts, colours, panel width in metres) into a
`ResolvedTextStyle` with concrete canvas pixels and plane metres.
`maxLinesPerPage` and the wrap width are _derived_ from the text UV rect
(`page-layout.ts`) and the line height, so the visuals and the hit regions —
which share the same layout — always agree: a line that overflows the box is
paginated, never clipped.

## Public API

- **`TextStyle`** — `{ fontPx, lineHeightPx, fontFamily, panelColor, textColor, accentColor, mutedColor, maxWidthMeters }`.
- **`DEFAULT_TEXT_STYLE: TextStyle`**.
- **`ResolvedTextStyle extends TextStyle`** — adds `canvasW`, `canvasH`,
  `planeW`, `planeH` (metres), `wrapWidthPx`, `maxLinesPerPage`.
- **`resolveTextStyle(style: TextStyle): ResolvedTextStyle`**.

## Invariants & assumptions

- Fixed 4:3 backing canvas (`1024×768`) — crisp at typical viewing distance,
  cheap to re-raster.
- `wrapWidthPx` is the text rect's pixel width scaled by a 0.95 safety
  margin, so a `measureText`↔CSS metric drift between the two rendering
  backends degrades to a hidden sub-pixel gap rather than an overflow/clip.
- `maxLinesPerPage` is always at least 1.
- Depends on `page-layout.ts` (`PAGE_PANEL_LAYOUT.text` sizes the wrap/line
  budget).

## Examples

```ts
import {
  DEFAULT_TEXT_STYLE,
  resolveTextStyle,
} from 'gps-plus-slam-app-framework/visualization';

const resolved = resolveTextStyle({
  ...DEFAULT_TEXT_STYLE,
  maxWidthMeters: 0.8,
});
resolved.maxLinesPerPage; // e.g. 8
```

## Tests

- `text-style.test.ts` — derived `maxLinesPerPage`/`wrapWidthPx` from a
  style, and plane dimensions scaling with `maxWidthMeters`.
