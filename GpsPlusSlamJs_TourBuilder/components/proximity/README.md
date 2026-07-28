# Component 4 — Proximity & zone state machine

The **heart of the tour** (TASK.md §2.3): given the user's world-space position
and each waypoint's anchored world position, it drives every waypoint through two
concentric zones — `IDLE → PREFETCHING → ACTIVE` — with hysteresis so a noisy
position on a boundary does not flicker. `PREFETCHING` (≈25 m) exists to parse
the model invisibly and hide GLTF jank; `ACTIVE` (≈10 m) makes it visible. Audio
is **not** here — tap-to-play lives in the view layer (§2.5.3).

It is pure world-space logic with **no GPS, no geo math, no store, no Three
runtime** — a generic component reusable in any Three.js game and a candidate for
an upstream PR (TASK.md §2.6). Turning geographic anchors into world positions is
the framework's job, upstream of this component.

## Run it

```bash
pnpm dev            # then open http://localhost:5182/components/proximity/
```

A real Task 1 walk plays back top-down. Each waypoint shows an outer PREFETCH
ring and an inner ACTIVE ring; its dot recolours (grey → amber → green) as the
user crosses them. Scrub the timeline and watch a dot sitting on a ring **not**
flicker — that is the hysteresis. The `near-miss` waypoint only ever reaches
PREFETCHING (amber), never ACTIVE. Every crossing is listed in the transition
log.

## Layout

| Path             | What lives here                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `demo.ts`        | Standalone 2D demo entry. Replays the precomputed walk through `core/step()` and draws it. No store/Three/GPS.     |
| `index.html`     | The demo's page (loads `demo.ts`).                                                                                 |
| `demo-walk.json` | The recorded walk's horizontal path (X/Z), precomputed from the Task 1 zip so the page stays a few KB.             |
| `core/`          | The pure `step()` state machine — the reusable heart, unit-tested. No store/Three runtime. See `core/README.md`.   |
| `view/`          | The impure driver that wires `step()` to the live pose + `zones` slice, plus the replay e2e. See `view/README.md`. |

## Contract

The machine writes the `zones` slice **only**; acting on a zone (fetch / show /
dispose+release) belongs to the consumer that reads the slice (component 8), never
here (contract D15 / §2.5). Key decisions: fractional hysteresis (D16),
horizontal-only distance (D17), one-step-per-update transitions so `PREFETCHING`
always precedes `ACTIVE`.

See `plans/2026-07-14-proximity-plan.md` and `plans/Shared-Contract.md` §2.5.

## Tests

Two levels (TASK.md §2.3). `core/proximity-machine.test.ts` unit-tests the
transition table, fractional hysteresis, one-step clamp, and horizontal distance
at hand-picked distances. `view/proximity-replay.e2e.test.ts` replays a real
Task 1 recording and asserts the zone transitions on genuinely noisy data
(deepest zone matches the real closest-approach distance, no illegal skips,
unimodal-per-fly-by no-flicker); it drives the samples through the real
`createProximityDriver`, so the movement-epsilon gate is proven
behaviour-preserving on real noise too. `view/proximity-driver.test.ts` covers
the driver's `onTransition` reporting + movement-epsilon gate. Run
`pnpm test:unit`.
