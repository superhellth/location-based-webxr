# Depth Unprojection

## Purpose

Pure math helper that turns a persisted depth read (`screenX`, `screenY`, `depthM`) back into a 3D point in raw WebXR (local-floor) space using the capturing view's projection matrix. This is the inverse of what the depth camera did at capture time and the foundation of the AR-space occupancy grid.

## Public API

- **`unprojectDepthPoint(point, cameraPos, cameraRot, projectionMatrix): Vector3 | null`**
  - `point: DepthPoint` — normalized view coordinates (top-left origin, 0–1) + z-depth in meters, exactly as fed to `getDepthInMeters`.
  - `cameraPos: Vector3` / `cameraRot: Quaternion` — raw WebXR camera pose from `DepthSample`.
  - `projectionMatrix: Matrix4 | undefined` — column-major 16-tuple of the capturing `XRView` (`DepthSample.projectionMatrix`).
  - Returns the point in raw WebXR space, or `null` for unusable input.

## Invariants & Assumptions

1. **All NDC-flip decisions live here** (port-plan §6 mitigation): `ndcX = 2·sx − 1`, `ndcY = 1 − 2·sy` (screenY grows downward). If on-device verification reveals an orientation quirk, this file is the only place to adjust.
2. **`depthM` is z-depth** (distance along the view direction, −z), not euclidean ray length — matches ARCore/WebXR depth semantics.
3. **View space is the WebXR camera frame** (+x right, +y up, −z forward); the camera pose is applied as a rigid transform (`world = rot·view + pos`).
4. **Defensive null returns** (never throws): missing/short matrix, singular matrix, `depthM ≤ 0` or non-finite, screen coordinates outside `[0, 1]` or non-finite, non-finite output. `null` for a missing matrix is the designed old-recordings path — callers skip the point.
5. Works for any invertible projection matrix (generic `mat4.invert`), not only axis-aligned frustums.

## Examples

```ts
const worldPoint = unprojectDepthPoint(
  { screenX: 0.5, screenY: 0.5, depthM: 2 },
  sample.cameraPos,
  sample.cameraRot,
  sample.projectionMatrix
);
if (worldPoint) grid.addPoint(worldPoint);
```

## Tests

- `depth-unprojection.test.ts` — convention anchors (screen center → (0,0,−d); upper screen → +Y; right screen → +X; pose translation/rotation) and all null paths.
- `depth-unprojection.property.test.ts` — fast-check round-trips: analytic view-space expectation over FOV/aspect/depth/pixel (independent of the implementation's inverse-matrix path) and rigid-transform consistency over random camera poses.
