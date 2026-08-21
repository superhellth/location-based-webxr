# text-page-state.ts

## Purpose

Pure page-navigation state for an in-world text label — the single source of
truth for "which page is showing", driven by a small reducer (mirrors the
billboard's transport reducer). Deliberately hosted per-label rather than in
a shared store: page position is per-label, ephemeral view state.

## Public API

- **`TextPageState`** — `{ pageIndex: number, pageCount: number }` (0-based
  index; `pageCount` is always `>= 1`).
- **`TextPageAction`** — `{ type: 'next' } | { type: 'prev' } | { type: 'setText', pageCount: number }`
  (`setText` resets to page 0).
- **`initialTextPageState(pageCount: number): TextPageState`** — `pageCount`
  clamped to `>= 1`.
- **`textPageReducer(state, action): TextPageState`**.
- **`canPrev(state): boolean`**, **`canNext(state): boolean`**.
- **`pageLabel(state): string`** — 1-based human label, e.g. `'2 / 5'`.

## Invariants & assumptions

- `next`/`prev` clamp at the last/first page — never go out of range.
- Pure. No dependencies.

## Examples

```ts
import {
  initialTextPageState,
  textPageReducer,
  pageLabel,
} from 'gps-plus-slam-app-framework/visualization';

let state = initialTextPageState(3);
state = textPageReducer(state, { type: 'next' });
pageLabel(state); // '2 / 3'
```

## Tests

- `text-page-state.test.ts` — next/prev clamping at both edges, `setText`
  resetting to page 0, and `canPrev`/`canNext`/`pageLabel` at each position.
