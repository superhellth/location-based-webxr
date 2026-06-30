# playback-transport.ts

## Purpose

The single pure source of truth for audio playback: which clip is active,
playing/paused, and the playhead. One reducer drives exclusive one-clip-at-a-time
playback, the play/stop button, and the seekable progress bar. No Three.js / DOM
/ audio element — the view layer maps these actions to `HTMLAudioElement` calls
and forwards `tick`/`ended` back in. Reused by component 8.

## Public API

- `interface TransportState { activeId: string | null; status: "playing" | "paused"; positionSec; durationSec }`.
- `type TransportAction` — `click(id)` | `toggle` | `seek(fraction)` |
  `tick(positionSec, durationSec)` | `ended(id)`.
- `INITIAL` — the idle state (`activeId: null`).
- `transportReducer(state, action): TransportState`.
- Selectors: `isActive(state, id)`, `isPlaying(state, id)`,
  `progressFraction(state)` (0..1).

## Invariants & assumptions

- **`click` always (re)starts** that clip from 0 and makes it the sole active
  clip (`durationSec` resets to 0 until the next `tick`).
- **`toggle` / `seek` / `tick` are no-ops when idle** (`activeId === null`) and
  return the same state reference.
- **`seek.fraction` is clamped to [0, 1]**; `positionSec = fraction * durationSec`.
- **Stale `ended` is ignored**: an `ended` whose `id` is not the active clip
  returns state unchanged, so a late event can't stop the newly-started clip.
  (`tick` carries no id; the view must only forward ticks for the active clip.)
- `ended` on the active clip → `paused` at `positionSec = durationSec` (bar full).
- `progressFraction` returns 0 until `durationSec > 0`.

## Examples

```ts
let state = INITIAL;
const dispatch = (a: TransportAction) => {
  state = transportReducer(state, a);
  reconcileAudioAndPanels(state); // view side effects
};
dispatch({ type: "click", id: "knight-1" }); // play + open its panel
dispatch({ type: "seek", fraction: 0.5 }); // jump to halfway
```

## Tests

[playback-transport.test.ts](playback-transport.test.ts) — click start/switch/
restart, toggle, seek (incl. clamp), tick, ended-at-end, the ignored stale
`ended`, and the selectors.
