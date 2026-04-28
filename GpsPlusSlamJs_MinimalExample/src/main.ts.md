# main.ts

## Purpose

Entry script for the minimal example. Glue only — wires
`createRecorderStore()` to a tiny Three.js scene and a
status panel rendered by [status.ts](status.ts).

## Behavior

- Boots `createRecorderStore()` with default options (uses the
  bundled community license key from AppFramework).
- Creates a Three.js scene with a single rotating cube and basic
  lighting; resizes to the window.
- Subscribes to the store; on each change, re-derives a small
  `ExampleStatusInput` shape and feeds it to `formatStatus()`.

## Invariants & assumptions

- The DOM ships two known IDs: `#scene` (canvas) and `#status` (pre).
  Missing either throws at startup so misconfiguration is loud.
- No WebXR / no GPS sensor wiring is started here. The store therefore
  stays idle in this example; integrators see how to wire it up by
  reading [GpsPlusSlamJs_RecorderApp](../../GpsPlusSlamJs_RecorderApp/).

## Tests

This module is glue and is verified via `pnpm dev` + a real browser.
The pure formatter it depends on is unit-tested in
[status.test.ts](status.test.ts).
