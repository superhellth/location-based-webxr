# billboard/core — pure logic

Framework-free, deterministic, unit-tested logic for the clickable billboard.
**No Three.js, no DOM, no audio element.** Every module here is pure input →
output, so it runs on a desktop with no phone and is reused verbatim by the AR
scene (component 8). The `view/` layer applies these results as side effects.

> The face-the-user yaw (`computeBillboardYaw`) and `clamp01` now live in
> [`components/shared/`](../../shared/README.md) because component 2 reuses them
> too; this folder imports them from there.

## Modules

### `playback-transport.ts` — the transport reducer

The single source of truth for playback: which clip is active, playing/paused,
and the playhead. `transportReducer(state, action)` with
`INITIAL` and selectors `isActive` / `isPlaying` / `progressFraction`.

- Actions: `click(id)` · `toggle` · `seek(fraction)` · `tick(pos, dur)` · `ended(id)`.
- **`click` always (re)starts** that clip from 0 as the sole active clip.
- **`toggle`/`seek`/`tick` are no-ops when idle** (return the same reference).
- **`seek.fraction` is clamped to [0, 1]**.
- **Stale `ended` is ignored** (id ≠ active) so a late event can't stop a
  freshly started clip. `tick` carries no id — the view must only forward ticks
  for the active clip.

### `panel-layout.ts` — layout + hit-mapping

The one place that knows _where_ the button and progress track sit on the panel,
as normalized UV rectangles — so the same layout both draws the panel and
decides what a tap means. `hitToIntent(uv, layout = DEFAULT_PANEL_LAYOUT)` →
`{ type: "toggle" } | { type: "seek", fraction } | null`.

- UV convention matches `THREE.PlaneGeometry` intersection UVs (origin
  bottom-left, u→right, v→up).
- **Button resolved first**; default regions are disjoint, so ordering is
  unambiguous.
- A tap in the padding/gap → `null` (no phantom seek).

`panel-layout` builds on the shared `Rect` + `contains` UV-geometry primitive and
the shared `clamp01`, both from [`components/shared/`](../../shared/README.md).

## Tests

`playback-transport` and `panel-layout` each have a colocated `*.test.ts` (the
shared `billboard-math` and `panel-geometry` are tested under `components/shared/`):

- `playback-transport.test.ts` — click start/switch/restart, toggle, seek
  (incl. clamp), tick, ended-at-end, the ignored stale `ended`, and selectors.
- `panel-layout.test.ts` — button→toggle, track→seek fraction (centre/edges,
  clamped), gap/chrome→null, and a disjoint-regions guard.

Run: `pnpm test:unit` (or `pnpm test:watch`).
