# qr-size-measurer.ts

## Purpose

The composable depth→size piece shared by the QR demo and (next) the Recorder
(framework-wiring-options Part B, Option 2). Wraps the per-detection depth
sampling + the per-marker running-median accumulator that used to live inside
the demo controller, so each app wires **one measurer** instead of
re-implementing the loop.

## Public API

- `createQrSizeMeasurer(options?: QrSizeMeasurerOptions): QrSizeMeasurer`
  - `measure(text, corners: Point2[], image: {width,height}, ctx): QrSizeMeasurement | null`
    — samples depth at the 4 corners + the centroid, runs
    `estimateQrSizeFromDepth`, folds the observation into the per-`text`
    accumulator, returns the updated estimate **plus** the raw corner/interior
    depth samples. `null` only when corner depth can't be sampled even after the
    robustness levers (≥2 corners lack depth), or `corners.length !== 4`. A
    degenerate quad is NOT a failure here — the null observation just isn't
    accumulated.
- `QrSizeMeasurerOptions extends QrSizeAccumulatorOptions` — the depth-at-corners
  robustness knobs (see below):
  - `cornerInsetFractions?: number[]` (default `[0.12, 0.25]`) — when a corner
    pixel has no depth, retry at points inset toward the centroid by these
    fractions and **borrow** the first valid depth, keeping the true corner
    position (so size is not shrunk). `[]` disables inset fallback.
  - `maxReconstructedCorners?: number` (default `1`) — how many still-missing
    corners may have their depth reconstructed by a planar fit through the other
    three. `0` disables reconstruction.
  - `current(text): QrSizeEstimate` — estimate without adding a sample.
  - `reset(text?)` — clear one marker (or all).
- `QrSizeDepthContext` — `{ depthAt, unprojector }` (a subset of the demo's
  `DepthContext`).
- `QrSizeMeasurement` — `{ estimate, cornerSamples, interiorSamples }`.
- `ImageSize` — `{ width, height }`.

## Invariants & assumptions

- **Pose-agnostic by design.** It returns `cornerSamples` so a depth-fit
  consumer (the demo) can unproject the SAME points for a pose without
  re-sampling; a PnP consumer (the Recorder) ignores them and reads only
  `estimate`. Promoting the rigid depth-corner _pose_ fit
  (`poseFromWorldCorners`) is the separate §3.3 follow-up.
- Accumulation is keyed by `text`; markers are independent.
- Accumulator `options` flow to every per-marker `createQrSizeAccumulator`
  (quality threshold, min samples, spread cap, ring size).
- **Depth-at-corners robustness (C1):** QR corners sit on a high-contrast print
  boundary where the coarse WebXR depth grid often has no near reading. The
  inset fallback borrows a depth from a few-percent-inset point (valid because
  the marker face is locally planar); if a corner is still missing, its depth is
  reconstructed from the planar fit of the other three (up to
  `maxReconstructedCorners`). Both keep the true corner screen position so the
  measured size is unbiased.
- **Quality gate (C2):** `qualityThreshold` (default 0.8) decides which
  observations the accumulator ACCEPTS; lower it for noisy depth. Sampling a
  frame (returning a `QrSizeMeasurement`) is independent of acceptance — a
  rejected observation still returns the object but does not advance the
  estimate's `sampleCount`.

## Examples

```ts
const measurer = createQrSizeMeasurer();
const m = measurer.measure(detection.text, detection.corners, image, depthCtx);
if (m && m.estimate.status === 'estimated') useSize(m.estimate.estimateM);
```

## Tests

- `qr-size-measurer.test.ts` — null on un-sampleable corners / wrong corner
  count, planar-square convergence to `estimated`, per-marker independence,
  `reset`/`current`. A fake unprojector maps normalized corners onto a planar
  square so the full pipeline runs without a device. The robustness block uses a
  "holey" depth context (depth null inside windows) to exercise the inset
  fallback, one-corner reconstruction, the ≥2-missing → null budget, and the
  configurable quality gate.
