# hit-test-reticle.ts

## Purpose

The shared hit-test reticle for the framework's example/starter apps — a
faithful port of the reticle from the stock three.js `webxr_ar_hittest` example.
It is the small, deterministic "reticle view-model": given the latest hit-test
pose (a column-major 4×4 transform) or `null`, it drives a Three.js mesh's
visibility + transform.

The per-frame XR plumbing (requesting the hit-test source, reading
`frame.getHitTestResults(...)`) lives in each app's WebXR glue; only the logic
here is unit-tested because it is what a porting developer is most likely to get
subtly wrong.

## Public API

- `type HitMatrix = Float32Array | number[]` — a column-major 16-element
  transform, as produced by `XRPose.transform.matrix`.
- `createReticleMesh(): Mesh` — builds a thin ring laid flat in the XZ plane.
  Returns a mesh with `matrixAutoUpdate = false` and `visible = false`.
- `updateReticle(reticle: Object3D, matrix: HitMatrix | null): void` — applies
  the pose:
  - non-null 16-element matrix → reticle adopts it verbatim and becomes visible;
  - `null` → reticle is hidden.

Exported from `gps-plus-slam-app-framework/visualization`.

## Invariants & assumptions

- `matrixAutoUpdate` **must** stay `false` on the reticle: the world transform
  is written wholesale from the hit pose each frame, so letting Three.js
  recompose it from position/quaternion/scale would discard the pose.
- The mesh is parented under `getArWorldGroup()` (AR-local space) by the caller,
  **not** the GPS-aligned scene root — so the reticle and any placed content
  ride the same lerped `arWorldGroup` alignment.
- `updateReticle` operates on any `Object3D`, so it is testable without a WebGL
  context. It does not validate matrix length; callers pass the 16-element
  `XRPose.transform.matrix`.

## Examples

```ts
import {
  createReticleMesh,
  updateReticle,
} from 'gps-plus-slam-app-framework/visualization';

const reticle = createReticleMesh();
arWorldGroup.add(reticle);
// each XR frame:
updateReticle(reticle, hitPose ? hitPose.transform.matrix : null);
```

## Tests

[hit-test-reticle.test.ts](hit-test-reticle.test.ts) — pins: the mesh starts
hidden with manual matrix updates; a hit pose makes it visible and is adopted
verbatim (including a `Float32Array` pose); a `null` hit hides it (no stale
reticle).

## Consumers

- `GpsPlusSlamJs_MinimalExample/src/main.ts` — tap-to-place reticle.
- `GpsPlusSlamJs_AnchorStarter/src/main.ts` — cache-miss placement reticle.
