# placement-decision.ts

## Purpose

Pure decision for the cache-miss "Place anchor" action: may a Place press
commit the anchor now? AnchorStarter places under a hit-test reticle (the AR
cursor), so a press only places when a surface is under the cursor **and** a GPS
alignment exists.

## Public API

- `type PlacementDecision = { kind: "place" } | { kind: "blocked"; hint: string }`.
- `interface PlacementDecisionInput = { reticleVisible: boolean; hasAlignment: boolean }`.
- `NO_SURFACE_HINT` / `NO_ALIGNMENT_HINT` — the two user-facing hint strings.
- `decideAnchorPlacement(input): PlacementDecision` — returns `place` iff both
  preconditions hold; otherwise `blocked` with the most actionable hint
  (surface first, then alignment).

## Invariants & assumptions

- The FSM soft-gate (`canPlaceAnchor`) is checked **before** this decision; this
  module only adds the surface/alignment layer.
- Never returns a silent block — a blocked press always carries a hint so the UI
  can surface it (repo async-UI-feedback rule).
- Surface is treated as the higher-priority blocker: when both are missing the
  no-surface hint is returned (it is the most actionable next step).

## Examples

```ts
const decision = decideAnchorPlacement({
  reticleVisible: reticleHandle.isVisible(),
  hasAlignment: currentAlignment() !== null,
});
if (decision.kind === "blocked") {
  dispatchSetup({ type: "PLACE_BLOCKED", message: decision.hint });
  return;
}
// …commit the anchor at the reticle pose…
```

## Tests

[placement-decision.test.ts](placement-decision.test.ts) — pins: places only
when both preconditions hold; the no-surface hint wins when both are missing;
the alignment hint surfaces when only alignment is missing.
