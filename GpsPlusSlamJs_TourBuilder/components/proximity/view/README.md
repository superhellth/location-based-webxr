# proximity/view — the driver + replay e2e

The only impure half of component 4. It wires the pure `core/step()` to the
running app and proves the whole thing on a real recorded walk.

## `proximity-driver.ts`

```ts
createProximityDriver(deps: ProximityDriverDeps): ProximityDriver
// deps: getUserWorldPos, getObjects, getZones, onTransition, config, movementEpsilonM?
// returns: { tick(), reset() }
```

Once per frame (`tick()`, called from the framework frame loop) it reads the live
world-space pose, runs `step()` against the currently-anchored objects and the
`zones` snapshot, and reports each transition through `onTransition` — the
composition wires that to `dispatch(setWaypointZone({ id, zone: to }))`, keeping
this layer Redux-free. The callback must make the change visible to the next
`getZones()` read (the real store's synchronous dispatch does). That is **all**
it does — no asset-provider, no Three.js (contract D15/§2.5). Everything is
injected, so the same driver runs unchanged from the replay e2e and the composed
app.

- **Movement-epsilon gate**: skips `tick()`s where the user moved less than
  `movementEpsilonM` (default 0.25 m) since the last _evaluated_ pose. A pure perf
  optimisation — because the machine is memoryless in time, skipping can only
  defer an update until the user actually moves, never change the eventual zone.
- **`getObjects` returns anchored objects only**: unanchored waypoints are
  filtered out upstream and stay at their seeded `IDLE` (contract Q5).
- **`reset()`**: forgets the last pose so the next `tick()` always runs (tour
  load / teleport).

## `proximity-replay.e2e.test.ts`

The second test level (TASK.md §2.3). Replays a real Task 1 zip
(`recordings/2026-06-22_16-06-59utc.zip`) via `replayRecording`, takes the user's
odometry path, synthesizes waypoint anchors from that same path (two
pass-throughs, one near-miss, one far), and feeds every sample through the real
`createProximityDriver` with its default movement-epsilon gate live — so the
assertions holding is also the proof the gate is behaviour-preserving on real
GPS noise. All assertions are geometry-derived, not hand-tuned:

- deepest zone reached **equals what the real minimum distance implies** (proves
  ACTIVE / PREFETCHING-only / IDLE respectively);
- every emitted edge is between adjacent zones (no illegal skip);
- each waypoint's zone sequence is **unimodal** on its single fly-by — the
  no-flicker proof on real GPS noise;
- soft timing: at the sample of closest approach, a pass-through waypoint is
  `ACTIVE` (the knight is visible exactly when the visitor is nearest).

## Tests

`proximity-driver.test.ts` (unit) covers transition reporting, the
no-change/no-report case, the movement-epsilon gate, the null-pose guard, and
`reset()`. `proximity-replay.e2e.test.ts` is the replay e2e. Both run under
`pnpm test:unit`.
