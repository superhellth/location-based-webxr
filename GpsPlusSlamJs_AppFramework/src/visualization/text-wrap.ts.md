# text-wrap.ts

## Purpose

Pure word-wrapping for an in-world text panel. Line-breaking is owned here
(rather than left to CSS on an HTML rendering backend) so that every
rendering backend produces the _same_ lines and therefore the same
pagination — a Canvas fallback stays a pixel-for-pixel-equivalent stand-in
for an HTML-in-3D primary path. The width of a piece of text is supplied by
an injected `Measure`, so this module is DOM-free and unit-testable with a
fake monospace measurer.

## Public API

- **`Measure`** — `(text: string) => number`, width of a string in pixels at
  the target font.
- **`wrapText(text: string, maxWidthPx: number, measure: Measure): string[]`**
  — greedily wraps `text` into lines no wider than `maxWidthPx`. Returns
  `[]` for empty/whitespace-only input.

## Invariants & assumptions

- Explicit `\n` in the source text is a hard line break.
- A single word wider than `maxWidthPx` is hard-broken character-by-character
  so it can never overflow the panel.
- Pure. No dependencies beyond the injected `Measure`.

## Examples

```ts
import { wrapText } from 'gps-plus-slam-app-framework/visualization';

const measure = (s: string) => s.length * 8; // fake monospace measurer
wrapText('a rather long sentence', 80, measure); // ['a rather', 'long sentence']
```

## Tests

- `text-wrap.test.ts` — greedy wrapping, `\n` as a hard break, and
  character-level hard-breaking of an over-wide single word.
