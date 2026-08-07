# 2026-07-14 — Component 4: Proximity & Zone State Machine (implementation plan)

## Context

Component 4 is **the heart of the viewing experience**: given the user's live
world-space position and each waypoint's anchored world position, it drives every
waypoint through two concentric zone states — `IDLE → PREFETCHING → ACTIVE` — with
hysteresis so a noisy position on a boundary doesn't flicker. `PREFETCHING`
(≈25 m) exists to hide GLTF parse jank; `ACTIVE` (≈10 m) makes the object visible.
Audio is **not** part of this machine (tap-to-play lives in the view layer).

It is **pure, GPS-free, framework-free, Three-free** world-space logic — a generic
component reusable in any Three.js game and a candidate for an upstream PR
(TASK.md §2.6). Turning geographic anchors into world positions is the framework's
job, upstream of this component.

The contract is **already agreed** in `plans/Shared-Contract.md` (D2, D11, D15,
D16, D17, §2.5, §4). This plan implements it and does not get to rename the surface
it defines. The design below was resolved in a design grilling on 2026-07-14.

Package: **`GpsPlusSlamJs_TourBuilder/`**. Core + driver live under
`components/proximity/{core,view}/`; the demo under `components/proximity/demo/`
(mirrors the billboard / in-world-text layout).

---

## ⚠️ Contract changes made during this grilling (need Maria sign-off)

Two decisions **override** choices co-signed on 2026-06-26. Already back-ported
into `Shared-Contract.md`, flagged for the next review call:

1. **D16 — hysteresis is fractional**, not the fixed `HYSTERESIS_MARGIN_M = 2 m`.
   Reason: a fixed margin is a huge fraction of a small `activeRadius` (6 m in the
   sample tour) and risks `exitActive` growing past `enterPrefetch` (band
   inversion). Fractional (`radius·(1+h)`) scales per waypoint and never inverts.
2. **D17 — horizontal (X/Z) distance**, not full 3D `distanceTo`. Reason: altitude
   is the noisiest GPS axis and two sample waypoints omit it; the tour is a
   single-plane walk, so vertical carries almost no signal and only injects noise.

Also added: **D15 + §2.5** (zone-state consumer contract — component 4 writes the
`zones` slice only; consumers own all asset/scene side effects).

---

## Decisions (resolved in the 2026-07-14 grilling)

| # | Branch | Decision |
|---|--------|----------|
| 1 | Module shape | Pure `step()` **core** + thin impure **driver** (core/view split). No store ref, no Three, no clock in the core. |
| 2 | Hysteresis | Fractional band, single global `HYSTERESIS_FRACTION ≈ 0.15`. Enter at dist `≤ r`, exit at dist `> r·(1+h)`, per boundary. |
| 3 | Multi-step jumps | Clamp **one zone per update**, **both** directions. Never `IDLE↔ACTIVE` directly → prefetch always precedes activate (anti-jank). |
| 4 | Distance metric | Horizontal X/Z only. Core accepts full `Vector3`, projects internally. |
| 5 | Unanchored waypoints | **Driver filters**; the core only ever sees resolved objects. Absent → seeded `IDLE`, joins when its anchor resolves. |
| 6 | Side effects | Component 4 writes `zones` **only**. Consumers (component 8) subscribe and own fetch / `visible` / dispose+release. |
| 7 | Time | **Pure spatial**, no timers / dwell in the core. |
| 8 | Pose source | Driver takes **injected** `getUserWorldPos()` + anchored-objects supplier. Ticks on the framework frame loop, gated by a **movement epsilon** (driver-only). |
| 9 | E2e feed | **Replay-then-iterate** for component 4's own e2e; `ReplayEngine`-through-the-driver deferred to the Goal-2 composed e2e. |
| 10 | E2e waypoints | **Synthesize anchors from the recorded path** + include one **near-miss** waypoint (reaches PREFETCHING, never ACTIVE). |
| 11 | Assertions | **Strict:** transition order, no-illegal-skip, no-flicker count. **Soft:** timing (generous tolerance). Fixture: `recordings/2026-06-22_16-06-59utc.zip`. |
| 12 | Scope | **Track all** waypoints every step; orthogonal to `tourProgress` (re-approach / out-of-order work for free). |
| 13 | Demo | 2D top-down canvas (path, two rings/waypoint, moving user dot colored by zone) + a log side-panel. |

---

## Architecture

### `core/proximity-machine.ts` — the pure heart

```ts
import type { Vector3 } from 'three'; // type-only; no runtime three dependency
import type { ZoneState } from '../../../store/types.js';

export interface ProximityObject {
  readonly id: string;
  readonly position: Vector3;      // resolved world-space anchor
  readonly prefetchRadius: number; // metres (Waypoint.prefetchRadius)
  readonly activeRadius: number;   // metres (Waypoint.activeRadius)
}

export type ZoneMap = Readonly<Record<string, ZoneState>>;

export interface ZoneTransition {
  readonly id: string;
  readonly from: ZoneState;
  readonly to: ZoneState;
}

export interface StepResult {
  readonly zones: ZoneMap;                     // full next state (superset of input ids)
  readonly transitions: readonly ZoneTransition[]; // adjacent edges only, this update
}

export interface StepConfig {
  readonly hysteresisFraction: number; // e.g. 0.15
}

/** Pure. Same inputs → same output. No time, no store, no side effects. */
export function step(
  prev: ZoneMap,
  userPos: Vector3,
  objects: readonly ProximityObject[],
  config: StepConfig,
): StepResult;
```

**Algorithm per object (all pure):**

1. `d = horizontalDistance(userPos, obj.position)` — `Math.hypot(dx, dz)`, ignore Y (D17).
2. Compute the **target** zone from `d` using hysteresis bands relative to the
   object's *current* zone (`prev[id]`), so the thresholds are direction-aware:
   - enter PREFETCHING when `d ≤ prefetchRadius`; leave to IDLE when `d > prefetchRadius·(1+h)`.
   - enter ACTIVE when `d ≤ activeRadius`; leave to PREFETCHING when `d > activeRadius·(1+h)`.
3. **Clamp** the move to at most one zone toward the target (both directions, D15/§2.5):
   `IDLE→PREFETCHING`, `PREFETCHING→ACTIVE`, `ACTIVE→PREFETCHING`, `PREFETCHING→IDLE`.
   A target two steps away is reached over consecutive updates.
4. If the clamped next zone ≠ `prev[id]`, emit one `ZoneTransition`.

Objects absent from `prev` are treated as `IDLE` (seeded via `initZones` at load).

### `view/proximity-driver.ts` — the thin impure wrapper

```ts
export interface ProximityDriverDeps {
  readonly getUserWorldPos: () => Vector3 | null;        // live framework pose
  readonly getObjects: () => readonly ProximityObject[]; // resolved anchors only (Q5 filter)
  readonly dispatch: (a: unknown) => void;               // store dispatch
  readonly getZones: () => ZoneMap;                       // selectWaypointZone map
  readonly config: StepConfig;
  readonly movementEpsilonM?: number;                    // default ~0.25 (Q8)
}
```

Each frame-loop tick: read pose; if it moved `< movementEpsilon` since last run,
skip (pure perf gate — cannot change results). Else call `step()`, then
`dispatch(setWaypointZone({ id, zone }))` for each transition. The driver does
**not** touch the asset-provider or Three.js — that is component 8's job reacting
to the `zones` slice (D15/§2.5).

### Config

`HYSTERESIS_FRACTION = 0.15` lives in the component (never persisted, not
authorable — D16/§4). Per-waypoint radii come straight from the store.

---

## Testing (two levels)

### Unit (`core/proximity-machine.test.ts`) — pure, no framework

- Each boundary: enter at `r`, no exit until `> r·(1+h)`; the flicker case (a
  position oscillating inside the band emits **zero** transitions after entry).
- One-step clamp both directions: a synthetic `IDLE` object at ACTIVE distance
  becomes `PREFETCHING` then `ACTIVE` over two `step()`s — never a direct skip.
- Horizontal-only: identical X/Z with a large Y delta yields the same zone.
- Multiple objects with **different** per-waypoint radii in one `step()`.
- Absent-from-`prev` object defaults to `IDLE`.

### Replay e2e (`view/proximity-driver.e2e.test.ts`) — real recording

- `replayRecording(recordings/2026-06-22_16-06-59utc.zip)` → ordered odometry
  `Vector3[]` + timestamps (Q9 replay-then-iterate).
- Synthesize 3–4 waypoint anchors: some **on** the path (full pass-through) and
  one **5–8 m off** to the side (near-miss → PREFETCHING-only) (Q10).
- Iterate the path through `step()`, collect transitions. Assert (Q11):
  - **strict** — exact order per waypoint (`IDLE→PREFETCHING→ACTIVE→PREFETCHING→IDLE`
    for pass-through; `IDLE→PREFETCHING→IDLE` for near-miss); no illegal skip
    ever appears; total transition count equals the minimum legal count (proves
    the band suppressed re-fires).
  - **soft** — each edge fires within a generous tolerance window of its expected
    timestamp.

## Demo (`components/proximity/demo/`)

2D top-down canvas + log panel (Q13): draw the recorded path, each synthesized
waypoint as a dot with its two rings, and a moving user dot. Recolor each waypoint
dot by zone (grey/amber/green) as playback advances; scrub/play control; the log
panel streams the same transition timeline. Raw canvas, no Three.js, no phone.
This is the artifact for the review call — it makes the "no flicker on the
boundary" claim *visible*.

---

## Tooling notes

- New dir `components/proximity/` — confirm it is inside the existing `format` /
  `jscpd` / `depcruise` / tsconfig `include` globs (they scan `components`, so it
  should be; verify on implementation start, as the store plan had to).
- Core imports `three` **type-only** and `ZoneState` from `store/types.js`; no
  runtime framework dependency (keeps it upstream-PR-clean). `dependency-cruiser`
  must still see `components → store` only, never the reverse.
- `desktop.ini` in `recordings/` is tracked Windows cruft — add a `.gitignore`
  line (non-blocking).

---

## Open questions (for the LLM-reviewer round before coding)

1. `HYSTERESIS_FRACTION = 0.15` — validate against the real recording's noise
   amplitude; tune if 0.15 still flickers or feels too sticky.
2. `movementEpsilonM = 0.25` — same, tune against the recording's sample density.
3. Should `step()` also return the per-object horizontal distance (handy for the
   demo/HUD and component 8's LRU heuristics), or keep the result minimal?
4. Near-miss geometry in the e2e: pick the offset so the object clearly enters the
   PREFETCH band but clearly never the ACTIVE band, accounting for GPS noise.

---

## Next steps

1. Iterate this plan with an LLM as critical reviewer (a few rounds); commit each
   meaningful revision (plan-first workflow, TASK.md).
2. Throwaway prototypes of `step()` + the 2D demo; pick the cleanest.
3. Build the real core (TDD, red→green→refactor) with the unit suite above.
4. Add the replay e2e against the committed recording.
5. Build the 2D demo. Sidecar `README.md` for each behavior file.
6. Raise D16/D17 at the review call for Maria's sign-off.
