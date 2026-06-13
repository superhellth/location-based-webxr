# `colmap-conversions.ts`

## Purpose

Pure math turning the recorder's persisted **WebXR** data into the conventions
COLMAP's `sparse/0/` text files expect. The single tested seam owning the
axis/sign conventions for the COLMAP export (mirrors `depth-unprojection.ts`).

Part of the COLMAP/3DGS export — see
[2026-06-13-colmap-export-plan.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-06-13-colmap-export-plan.md)
§2.3 (Iter 1).

## Public API

- `webxrToColmapPose(position: Vector3, rotation: Quaternion): ColmapPose`
  - Input: a **raw-WebXR** camera pose (camera-to-world; −Z forward, +Y up).
    In the export this is the per-frame pose after `selectFrameTilesInWebXR`'s
    NUE→WebXR conversion.
  - Output: `{ qvec: [qw, qx, qy, qz], tvec: [tx, ty, tz] }` — the COLMAP
    **world-to-camera** extrinsic (+Z forward, +Y down), such that
    `X_cam = R(qvec)·X_world + tvec`.
  - Never throws; assumes a (near-)unit input quaternion.
- `pinholeFromProjection(projectionMatrix: Matrix4, width, height): PinholeIntrinsics`
  - Input: a column-major WebXR/ARCore projection matrix and the **JPEG frame's
    pixel dimensions** (after any `resolutionDivisor`).
  - Output: `{ fx, fy, cx, cy }` in pixels for the COLMAP `PINHOLE` model.
  - Throws `RangeError` on a non-16/non-finite matrix, non-positive `width`/
    `height`, or a recovered non-positive focal length (degenerate /
    non-forward-facing matrix).

## Derivations

Pose: WebXR is camera-to-world; COLMAP is world-to-camera. The camera frames
differ by negating Y and Z (`WEBXR_TO_COLMAP_CAM = diag(1,−1,−1)`, a proper
180°-about-X rotation, det = +1). So
`worldToCam = (camToWorld · WEBXR_TO_COLMAP_CAM)⁻¹`; the quaternion + translation
are read off via `THREE.Matrix4.decompose` (rigid → unit scale, clean quat).

Intrinsics: for a column-major OpenGL-style perspective matrix `m`
(`m[col*4+row]`), projecting a view point and mapping NDC → pixels (top-left
origin, y down):

- `fx = 0.5·W·m[0]`, `fy = 0.5·H·m[5]`
- `cx = 0.5·W·(1 − m[8])`, `cy = 0.5·H·(1 + m[9])`

## Invariants & assumptions

- `qvec` is unit length (asserted in the property test).
- The basis change is a proper rotation, so no sign folds into the quaternion.
- **Principal-point caveat:** the `cx`/`cy` formulas are derived (and verified
  against a symmetric frustum → `W/2, H/2`), but their off-center sign
  convention against _real_ ARCore matrices is only decisively confirmed by the
  Iter 4 on-device check (plan §6). `fx`/`fy` are well-established.
- `Quaternion` input is `[x,y,z,w]`; COLMAP `qvec` output is `[w,x,y,z]` — the
  reordering is the most common foot-gun, kept explicit via the `ColmapQuat`
  type.

## Examples

```ts
const { qvec, tvec } = webxrToColmapPose([0, 0, 0], [0, 0, 0, 1]);
// qvec ≈ [0, 1, 0, 0] (180° about X), tvec ≈ [0, 0, 0]

const intr = pinholeFromProjection(view.projectionMatrix, 1280, 960);
// e.g. { fx: 1000, fy: 1100, cx: 640, cy: 480 } for a symmetric frustum
```

## Tests

- `colmap-conversions.property.test.ts` — pose: a world point's COLMAP camera
  coords equal the basis-changed WebXR view coords (500 runs over random
  poses); intrinsics: round-trip recovery from a synthetic perspective matrix
  (500 runs over FOV/aspect/resolution/principal-point).
- `colmap-conversions.test.ts` — hand-verifiable fixtures (identity, point
  ahead → +Z, point above → −Y, a non-trivial rotated pose) and the
  `pinholeFromProjection` error paths.
