# qr-debug-view.ts

**Purpose:** The two §5 verification objects (Note 4): a `THREE.AxesHelper` at
the solved QR pose and a semi-transparent cube sized to the QR so its front face
lands on the printed corners. Both parented under `arWorldGroup` so they ride the
alignment / transform chain like real content.

## Public API

- `createQrDebugView(parent): QrDebugView` — `{ update(pose, sizeM), clear(), dispose() }`.
  - `update(pose, sizeM)` — `sizeM: number | null`. The **axis** is placed from
    the pose alone and revealed on every update (it needs no size). The **cube**
    spans `sizeM` in-plane and a thin slab in depth (front face on the code) and
    is revealed **only when `sizeM` is a number**; pass `null` (size not yet
    measured) to show the axis while keeping the cube hidden. This decoupling is
    why a locked QR is visibly glued (axis) even before the depth-measured size
    converges — see the on-device follow-up.
  - `clear` hides without detaching; `dispose` detaches + frees GPU resources.

## Invariants

- Objects start hidden; first `update` reveals them.
- **Persistence (Note 3):** `clear` is NOT called on detection misses — the
  objects keep their last pose so they don't flicker between throttled detections.
- Pure THREE object math; works against a bare `Object3D` parent (no WebGL).

## Tests

`qr-debug-view.test.ts` — two hidden children added, reveal + glue + size on
update, **axis-shown-but-cube-hidden when `sizeM` is null** + cube revealed once a
size arrives, `clear` hides-but-keeps, `dispose` detaches. The end-to-end
"detected but size unknown → axis visible, cube hidden" path is covered by
`playwright-tests/qr-demo.spec.js` (the non-planar-depth fake).
