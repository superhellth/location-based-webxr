# main.ts

## Purpose

Standalone demo entry for Component 1 — no AR/GPS/store. A plain Three.js scene
with an orbit camera and three clickable billboards, wiring the pure transport
reducer to the view: one `dispatch` runs `transportReducer`, then every
billboard reconciles its panel + audio against the new state; the render loop
only billboards the meshes toward the camera.

## Public API

None (Vite entry module). Mounts into `#canvas-root`, updates the `#status` HUD.

## Invariants & assumptions

- Single source of truth is the in-memory `TransportState`; `dispatch` is the
  only mutator and re-runs every billboard's `applyState`.
- Per-frame work is limited to `controls.update()` + `faceCamera` + render — no
  Redux/state churn at frame rate.
- Only the active clip's `tick` is dispatched (guarded by `id === state.activeId`).
- Assets load from `public/` via `import.meta.env.BASE_URL` (deploy-safe).

## Examples

Run the demo:

```bash
pnpm dev   # http://localhost:5182
```

Verify (success-criterion #4): orbit — sprites + open panel stay upright/facing;
click to play + open panel; clicking another switches; button pauses/resumes;
bar fills; tap the bar to seek.

## Tests

Not unit-tested (composition + view). The pure logic it composes is covered by
the `*.test.ts` suites; this page is the manual stand-in for replay e2e
(Component 1 has no movement dependency).
