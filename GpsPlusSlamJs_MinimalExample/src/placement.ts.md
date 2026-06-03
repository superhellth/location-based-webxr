# placement.ts

## Purpose

The tap-to-place view-model for the minimal GPS + AR example. Two pure,
unit-testable concerns:

1. **The GPS gate** (`decideTapPlacement`) — a tap is ignored until the first
   GPS fix arrives (a "waiting for GPS…" hint is shown instead of placing). This
   preserves the shared-start-pose invariant the Step 4 contrast demo relies on:
   both the root cube and the GPS anchor are only ever spawned once a GPS fix
   exists.
2. **The deliberate floater** (`placeRootCube`) — parents the placed cube under
   the **GPS-aligned scene root** (`getScene()`), NOT `arWorldGroup`. With no
   drift compensation, a scene-root child visibly drifts as SLAM and GPS
   disagree. This is the teaching point; Step 4 contrasts it with a
   `createGpsAnchor` placed under `arWorldGroup`.

## Public API

- `type PlacementDecision = { kind: 'place' } | { kind: 'waiting-for-gps' } | { kind: 'no-surface' }`
- `interface TapInput { hasGpsFix: boolean; reticleVisible: boolean }`
- `decideTapPlacement(input: TapInput): PlacementDecision` — GPS gating takes
  precedence over the surface check, so a pre-fix tap always returns
  `waiting-for-gps`.
- `createRootCube(): Mesh` — a 20cm box (fresh geometry/material per call).
- `placeRootCube(scene: Object3D, worldPosition: Vector3): Mesh` — builds a cube,
  sets its position and parents it under `scene`; returns the cube.

## Invariants & assumptions

- The cube is **always** parented to the scene root, never `arWorldGroup` — the
  drift is intentional. Do not "fix" this without reading the plan doc.
- `placeRootCube` takes a **world** position. The caller computes it from the
  reticle (`reticle.getWorldPosition(...)`), whose world transform is current
  from the last rendered frame.
- `decideTapPlacement` is total over its two booleans and side-effect-free.

## Examples

```ts
const decision = decideTapPlacement({ hasGpsFix, reticleVisible: reticle.visible });
if (decision.kind === 'place') {
  placeRootCube(getScene()!, reticle.getWorldPosition(new Vector3()));
}
```

## Tests

[placement.test.ts](placement.test.ts) — pins the gate (pre-fix → waiting,
GPS-ready-but-hidden → no-surface, both true → place) and that `placeRootCube`
parents under the scene root at the given world position with a distinct mesh
per placement.
