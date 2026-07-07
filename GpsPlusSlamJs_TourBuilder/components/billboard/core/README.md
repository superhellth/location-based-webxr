# billboard/core — pure logic

Framework-free, deterministic, unit-tested logic for the clickable billboard.
**No Three.js, no DOM, no audio element.** Every module here is pure input →
output, so it runs on a desktop with no phone and is reused verbatim by the AR
scene (component 8). The `view/` layer applies these results as side effects.

## Modules

### `billboard-math.ts` — face-the-user math

`computeBillboardYaw(billboard, camera, fallback = 0)`: the single Y-rotation
(radians) that turns a plane's **+Z front face** toward the camera in the XZ
plane while keeping it upright.

- +Z is the front (image) face — yawing +Z at the camera shows the texture.
- Camera **height is ignored by design** — that keeps the marker level when the
  user looks up/down at it.
- The caller writes only `rotation.set(0, yaw, 0)`, so pitch/roll are never
  touched.
- **Degenerate case** (camera directly above/below): no horizontal facing
  direction exists → returns `fallback` instead of snapping.

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

### `clamp.ts` — shared helper

`clamp01(value)` — clamp into the inclusive `[0, 1]` range. Used by the
panel-layout seek mapping and the transport reducer's `seek` action, so the two
share one definition instead of duplicating it.

## Tests

`billboard-math`, `playback-transport`, and `panel-layout` each have a colocated
`*.test.ts` (`clamp.ts` is exercised transitively through them):

- `billboard-math.test.ts` — applies the yaw to a real `THREE.Object3D`; asserts
  the +Z normal faces the camera horizontally, stays level regardless of camera
  elevation, hits the four cardinals, and falls back when overhead.
- `playback-transport.test.ts` — click start/switch/restart, toggle, seek
  (incl. clamp), tick, ended-at-end, the ignored stale `ended`, and selectors.
- `panel-layout.test.ts` — button→toggle, track→seek fraction (centre/edges,
  clamped), gap/chrome→null, and a disjoint-regions guard.

Run: `pnpm test:unit` (or `pnpm test:watch`).
