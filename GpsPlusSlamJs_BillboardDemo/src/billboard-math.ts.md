# billboard-math.ts

## Purpose

Pure cylindrical-billboard math: the single Y-rotation that turns a textured
plane to face the user horizontally while keeping it upright (no pitch/roll).
The seed of the AR knight markers (component 8). No WebGL/DOM — unit-testable in
isolation; the view layer applies the result as `mesh.rotation.set(0, yaw, 0)`.

## Public API

- `interface HorizontalPoint { x: number; z: number }` — a position; only X/Z
  matter for yaw.
- `computeBillboardYaw(billboard, camera, fallback = 0): number` — the Y
  rotation (radians) that points the plane's **+Z front face** at the camera in
  the XZ plane.

## Invariants & assumptions

- **+Z is the front (image) face.** `PlaneGeometry`'s front normal is +Z, so
  yawing +Z toward the camera shows the texture to the user.
- Camera **height is ignored by design** — that is exactly what keeps the marker
  upright when the user looks down/up at it.
- The caller writes only the Y component (`rotation.set(0, yaw, 0)`), so pitch
  and roll are provably never touched.
- **Degenerate case:** when the camera shares the billboard's X/Z (directly
  above/below), there is no horizontal facing direction; returns `fallback`
  (default 0) so the marker holds orientation instead of snapping.

## Examples

```ts
import { computeBillboardYaw } from "./billboard-math.js";

// per frame, in the render loop:
const yaw = computeBillboardYaw(mesh.position, camera.position);
mesh.rotation.set(0, yaw, 0);
```

## Tests

[billboard-math.test.ts](billboard-math.test.ts) — applies the yaw to a real
`THREE.Object3D` and asserts the transformed +Z normal faces the camera
horizontally (dot ≈ 1), stays level (`y ≈ 0`) regardless of camera elevation,
hits the four cardinal directions, and falls back when the camera is overhead.
