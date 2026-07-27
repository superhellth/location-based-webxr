# proximity/core — the pure zone state machine

Framework-free, store-free, clock-free logic. `Vector3` is imported **type-only**,
so this module carries zero runtime dependency and drops into any Three.js
project (upstream-PR candidate). Same inputs → same output.

## Public API (`proximity-machine.ts`)

```ts
step(
  prev: ZoneMap,
  userPos: Vector3,
  objects: readonly ProximityObject[],
  config: StepConfig,     // { hysteresisFraction }
): StepResult             // { zones: ZoneMap; transitions: ZoneTransition[] }
```

- **`ProximityObject`** — `{ id, position, prefetchRadius, activeRadius }`. Only
  the anchor's X/Z are read.
- **`ZoneMap`** — `Record<id, ZoneState>` (the shape stored in the `zones` slice).
- **`StepResult.transitions`** — the adjacent edges that changed this update, in
  input order; drives consumer side effects.

## Invariants

1. **Horizontal distance only** (contract D17): `Math.hypot(dx, dz)`; `y` is
   ignored, so altitude noise cannot move a zone.
2. **Fractional hysteresis** (D16): a boundary is entered at `radius` and left
   only past `radius·(1 + hysteresisFraction)`. A position jittering inside the
   band emits no transition.
3. **One step per update, both directions** (D15): the per-current-state
   transition table can only move to an adjacent zone, so `IDLE↔ACTIVE` never
   happens directly — `PREFETCHING` always gets ≥1 update before `ACTIVE`
   (hides parse jank), and dispose is gated behind the outer band on the way out.
4. **Pure**: no time, no store, no side effects. An object absent from `prev`
   defaults to `IDLE`.

## Tests

`proximity-machine.test.ts` — entry at each boundary, the one-step clamp both
directions (no illegal skip), hysteresis hold-and-release on both boundaries, a
no-flicker oscillation case, horizontal-only distance, multiple objects with
different radii, and the absent-defaults-to-IDLE case.
