# camera-follower.ts

## Purpose

Creates a position-tracking Object3D that follows the camera while maintaining GPS-aligned rotation (identity). Children of the follower (map mesh, compass cubes) stay world-oriented regardless of camera rotation.

The follower is placed at the **scene root** (not arWorldGroup) so its world rotation stays identity regardless of the alignment matrix applied to arWorldGroup. This ensures compass cubes point to true N/E/S/W in the NUE GPS frame.

Solves **Issue 8** from user feedback: "map rotates with the camera" when attached directly to the camera node.

## Public API

### `createCameraFollower(parent, lerpRate?): CameraFollower`

| Param      | Type             | Default | Description                                                 |
| ---------- | ---------------- | ------- | ----------------------------------------------------------- |
| `parent`   | `THREE.Object3D` | —       | Parent node — should be the scene root                      |
| `lerpRate` | `number`         | `8`     | Lerp speed multiplier; ~90% convergence in ~0.3 s at 60 fps |

Returns a `CameraFollower` object:

| Member               | Type                        | Description                       |
| -------------------- | --------------------------- | --------------------------------- |
| `object3D`           | `THREE.Object3D` (readonly) | Node to parent children onto      |
| `update(camera, dt)` | method                      | Call once per frame before render |
| `dispose()`          | method                      | Detaches from scene graph         |

### `CameraFollower` (type export)

Interface for the returned object.

## Invariants & Assumptions

- `object3D.rotation` is **never modified** — stays identity so children stay GPS-aligned.
- The follower is a child of **scene root** (not arWorldGroup), so its **world rotation** also stays identity regardless of alignment matrix changes.
- Position is lerped with alpha clamped to `[0, 1]` — prevents overshoot at low frame rates or large `lerpRate × dt`.
- Uses a single scratch `Vector3` (`_worldPos`) to avoid per-frame allocations.
- Position tracking uses `camera.getWorldPosition()` directly (world space = scene space since parent is scene root).

## Examples

```ts
import { createCameraFollower } from './camera-follower';

const follower = createCameraFollower(scene); // scene root, not arWorldGroup

// In render loop:
follower.update(camera, dt);

// Attach children:
mapMesh && follower.object3D.add(mapMesh);

// Cleanup:
follower.dispose();
```

## Tests

- Unit tests: `camera-follower.test.ts` (14 tests)
  - Construction, hierarchy (scene root), position tracking, overshoot prevention, incremental convergence, local rotation invariance, world rotation invariance (even with alignment matrix), compass cube world offset, child inheritance, dispose.
- Integration tests: `replay-scene.test.ts` "CameraFollower + Compass Cubes (Issue 8)" (5 tests)
- Wiring tests: `main.ar-follower-wiring.test.ts` (5 tests)
